import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { TaskRepository } from "@/repositories/TaskRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { ChecklistRepository } from "@/repositories/ChecklistRepository";
import { Platform } from "react-native";
import {
  rescheduleTodoReminders,
  rescheduleHabitReminders,
  rescheduleChecklistReminders,
  cancelReminderIds,
  getWebReminderLoops,
} from "@/services/scheduling/reminders.service";
import * as Notifications from "expo-notifications";
import { Task, Habit, Checklist, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import {
  isMatchingPhysicalNotification,
  getExpectedNotificationScheduleKeys,
  getExpectedScheduleKeyForSlot,
  getNotificationFireClock,
} from "@/services/notifications/notification-identity";
import {
  getSettings,
  isCurrentlyInQuietHours,
} from "@/features/settings/services/settings.service";
import { addStateListener } from "@/services/events/state-events";

const DEFAULT_ESCALATION_MINUTES = [120, 240];

/**
 * Computes the escalation offsets that Settings currently allow. Escalations
 * are scheduled ONLY when `escalationEnabled === true`; otherwise the primary
 * reminder remains and no escalation slots exist.
 */
function getEffectiveEscalationMinutes(settings: any): number[] {
  return settings && settings.escalationEnabled === false
    ? []
    : DEFAULT_ESCALATION_MINUTES;
}

/**
 * Category subscription policy. Mirrors `scheduleReminderBatch`: an entity's
 * category key is `categoryId` when present, otherwise its kind
 * (`todo`/`habit`/`checklist`).
 */
function isCategoryBlocked(
  settings: any,
  entityCategoryId: string | undefined,
  kind: string,
): boolean {
  if (!settings?.categories) return false;
  const categoryKey = entityCategoryId || kind;
  return settings.categories[categoryKey] === false;
}

/**
 * Quiet-hours policy for a single physical notification slot. A slot is
 * blocked when its deterministic schedule key proves it fires inside the
 * current quiet-hours window (same per-offset clock check that
 * `scheduleReminderBatch` applies at scheduling time). When the fire time
 * cannot be determined the notification is treated as NOT blocked — never
 * guess and cancel a valid reminder.
 */
function isSlotBlockedByQuietHours(settings: any, scheduleKey: string): boolean {
  if (!settings?.quietHours?.enabled) return false;
  if (typeof isCurrentlyInQuietHours !== "function") return false;
  const clock = getNotificationFireClock(scheduleKey);
  if (!clock) return false;
  return isCurrentlyInQuietHours(settings, clock.hour, clock.minute);
}

/**
 * Computes the set of physical schedule slots that are currently allowed for
 * an entity under the active Settings. An empty result means every slot is
 * blocked (category off, or every fire time inside quiet hours).
 */
function computeAllowedScheduleKeys(
  settings: any,
  entityCategoryId: string | undefined,
  kind: string,
  expectedKeys: Set<string>,
): Set<string> {
  if (isCategoryBlocked(settings, entityCategoryId, kind)) {
    return new Set<string>();
  }
  const allowed = new Set<string>();
  for (const key of expectedKeys) {
    if (!isSlotBlockedByQuietHours(settings, key)) {
      allowed.add(key);
    }
  }
  return allowed;
}

export class NotificationReconcilerService {
  private static inFlightPromise: Promise<void> | null = null;
  private static pendingPromise: Promise<void> | null = null;

  /**
   * Reconciles the OS notification state against the current Domain state.
   * 
   * This is an idempotent, serialized pass that:
   * 1. Coalesces concurrent in-flight reconciliation passes into atomic runs.
   * 2. Guarantees callers arriving while a pass is running await the fresh pending pass.
   * 3. Detects and cancels stale OS notifications (deleted/recycled/archived, or outdated triggers).
   * 4. Detects and cancels duplicate OS notifications for the same logical intent.
   * 5. Repairs missing `notificationIds` in Domain State if a perfect OS notification exists.
   * 6. Detects active items missing required OS notifications and schedules them.
   * 7. Applies the current Settings policy (escalationEnabled, quietHours,
   *    category subscriptions) to already-scheduled notifications: blocked
   *    slots are cancelled, allowed slots are repaired/rescheduled.
   * 
   * The Domain State is considered authoritative. Notification scheduling failures
   * do not crash the pass, they are logged and retried on the next run.
   */
  static async reconcileAll(): Promise<void> {
    if (this.inFlightPromise) {
      if (!this.pendingPromise) {
        this.pendingPromise = this.inFlightPromise
          .catch(() => {})
          .then(async () => {
            this.pendingPromise = null;
            await this.reconcileAll();
          });
      }
      return this.pendingPromise;
    }

    this.inFlightPromise = (async () => {
      try {
        await this.performReconcileAll();
      } finally {
        this.inFlightPromise = null;
      }
    })();

    return this.inFlightPromise;
  }

  static resetInFlightForTesting(): void {
    this.inFlightPromise = null;
    this.pendingPromise = null;
  }

  /**
   * Settings-driven reconciliation entry point. Makes currently scheduled
   * notifications agree with the current Settings (escalationEnabled,
   * quietHours, category subscriptions) using the same serialized, idempotent
   * pipeline as startup reconciliation — safe to run repeatedly, and safe to
   * run concurrently with entity-level reconciliation.
   */
  static async reconcileScheduledNotificationsForSettings(): Promise<void> {
    return this.reconcileAll();
  }

  /**
   * Registers the settings-driven reconciliation hook on the global
   * `settings_changed` event. The notification layer owns reacting to Settings
   * changes — individual screens never reschedule notifications themselves.
   *
   * Returns an unsubscribe function; called once from the app root.
   * Reconciliation is serialized and idempotent, so rapid repeated events
   * converge to one correct scheduled state instead of duplicating reminders.
   */
  static registerSettingsChangeReconciliation(): () => void {
    return addStateListener("settings_changed", () => {
      void this.reconcileScheduledNotificationsForSettings();
    });
  }

  private static async performReconcileAll(): Promise<void> {
    try {
      // Load the current Settings once per pass. Failures fall back to the
      // permissive default (escalations on, quiet hours off, no category
      // blocking) so a settings read problem never corrupts scheduling.
      let settings: any = null;
      try {
        settings = await getSettings();
      } catch (e) {
        console.warn(
          "[NotificationReconcilerService] Failed to load settings for reconciliation; applying default policy.",
          e,
        );
      }
      const effectiveEscalationMinutes = getEffectiveEscalationMinutes(settings);

      const allOsNotifications: Array<{ identifier: string; content?: { data?: any }; trigger?: any }> = [];

      if (Platform.OS === "web") {
        for (const [loopKey, loop] of getWebReminderLoops().entries()) {
          const data = {
            type: loop.kind,
            itemId: loop.itemId,
            escalationLevel: loop.escalationLevel ?? 0,
            purpose: loop.escalationLevel && loop.escalationLevel > 0 ? "escalation" : "reminder",
            logicalSignature: loop.logicalSignature,
            notificationScheduleKey: loop.notificationScheduleKey,
          };
          const identifier = loopKey.startsWith("timeout-")
            ? `web-timeout-${loopKey.replace("timeout-", "")}`
            : `web-interval-${loopKey}`;
          allOsNotifications.push({
            identifier,
            content: { data },
          });
        }
      } else {
        if (typeof Notifications.getAllScheduledNotificationsAsync !== "function") return;
        const nativeNotifs = await Notifications.getAllScheduledNotificationsAsync();
        allOsNotifications.push(...nativeNotifs);
      }
      
      const workspaces = await WorkspaceRepository.getWorkspaces();
      const activeWorkspaces = workspaces.filter(w => !w.archivedAt);
      const workspaceIds = new Set<string>(activeWorkspaces.map(w => w.id));
      if (!workspaces.some(w => w.id === INBOX_WORKSPACE_ID && w.archivedAt)) {
        workspaceIds.add(INBOX_WORKSPACE_ID);
      }
      
      const activeTasks = new Map<string, Task>();
      const activeHabits = new Map<string, Habit>();
      const activeChecklists = new Map<string, Checklist>();
      
      // 1. Load authoritative domain state
      for (const wsId of workspaceIds) {
        const tasks = await TaskRepository.getTasks(wsId);
        Object.values(tasks).forEach(t => {
          if (!t.archivedAt && t.status !== "completed") {
            activeTasks.set(t.id, t);
          }
        });
        
        const habits = await HabitRepository.getHabits(wsId);
        Object.values(habits).forEach(h => {
          if (!h.archivedAt) {
            activeHabits.set(h.id, h);
          }
        });

        const checklists = await ChecklistRepository.getChecklists(wsId);
        Object.values(checklists).forEach(cl => {
          if (!cl.archivedAt) {
            activeChecklists.set(cl.id, cl);
          }
        });
      }

      // 2. Audit existing OS notifications
      const notificationsByLogicalInstance = new Map<string, string[]>();
      const validNotifications = new Set<string>();
      const notificationsToCancel = new Set<string>();
      const staleNotifications = new Set<string>();

      for (const osNotif of allOsNotifications) {
        const data = osNotif.content?.data as any;
        const itemId = data?.itemId;
        const escalationLevel = data?.escalationLevel ?? 0;
        const logicalSignature = data?.logicalSignature;
        const id = osNotif.identifier;

        // Ignore notifications that don't belong to our subsystem
        if (data?.type !== "todo" && data?.type !== "habit" && data?.type !== "checklist") {
          continue;
        }

        if (!itemId || !logicalSignature) {
          // Malformed payload for our type, cancel it.
          notificationsToCancel.add(id);
          staleNotifications.add(id);
          continue;
        }

        let isMatch = false;
        if (data.type === "todo") {
          const task = activeTasks.get(itemId);
          if (task && isMatchingPhysicalNotification(data, task, "todo")) {
            isMatch = true;
          }
        } else if (data.type === "habit") {
          const habit = activeHabits.get(itemId);
          if (habit && isMatchingPhysicalNotification(data, habit, "habit")) {
            isMatch = true;
          }
        } else if (data.type === "checklist") {
          const checklist = activeChecklists.get(itemId);
          if (checklist && isMatchingPhysicalNotification(data, checklist, "checklist")) {
            isMatch = true;
          }
        }

        if (!isMatch) {
          // Stale notification (entity deleted/completed/archived, or trigger time changed)
          notificationsToCancel.add(id);
          staleNotifications.add(id);
          continue;
        }

        const isCanonical = typeof logicalSignature === "string" && logicalSignature.startsWith(`${data.type}:${itemId}:`);
        const hasScheduleKey = Boolean(data?.notificationScheduleKey);
        const triggerWeekday = data?.weekday ?? (osNotif.trigger as any)?.weekday;
        // A single physical notification slot is uniquely defined by: entityType + itemId + escalationLevel + (weekday if present)
        const instanceKey = `${data.type}:${itemId}:${escalationLevel}${triggerWeekday !== undefined ? `:w${triggerWeekday}` : ""}`;

        const existingSlot = notificationsByLogicalInstance.get(instanceKey);
        if (!existingSlot) {
          notificationsByLogicalInstance.set(instanceKey, [id]);
          validNotifications.add(id);
        } else {
          const currentPrimaryId = existingSlot[0];
          const currentPrimaryNotif = allOsNotifications.find(n => n.identifier === currentPrimaryId);
          const currentPrimaryData = currentPrimaryNotif?.content?.data as any;
          const currentPrimarySig = currentPrimaryData?.logicalSignature;
          const currentIsCanonical = typeof currentPrimarySig === "string" && currentPrimarySig.startsWith(`${data.type}:${itemId}:`);
          const currentHasScheduleKey = Boolean(currentPrimaryData?.notificationScheduleKey);

          if (!currentHasScheduleKey && hasScheduleKey) {
            // Upgrade! Prefer notification with explicit schedule key over legacy notification
            validNotifications.delete(currentPrimaryId);
            notificationsToCancel.add(currentPrimaryId);

            existingSlot[0] = id;
            validNotifications.add(id);
          } else if (!currentIsCanonical && isCanonical) {
            // Upgrade! Prefer canonical entity-owned notification over legacy timestamp notification
            validNotifications.delete(currentPrimaryId);
            notificationsToCancel.add(currentPrimaryId);

            existingSlot[0] = id;
            validNotifications.add(id);
          } else {
            // Duplicate notification for the exact same slot! Cancel this one.
            notificationsToCancel.add(id);
          }
        }
      }

      // 3. Execute Cancellations safely
      if (notificationsToCancel.size > 0) {
        try {
          await cancelReminderIds(Array.from(notificationsToCancel), { throwOnError: false });
        } catch (e) {
          console.warn("[NotificationReconcilerService] Failed to cancel some stale notifications.", e);
        }
      }

      // 4. Audit domain items for missing notifications, and repair state if needed
      for (const task of Array.from(activeTasks.values())) {
        if (!task.reminder?.enabled || !task.reminder?.triggerAt) continue;

        const expectedKeys = getExpectedNotificationScheduleKeys(task, effectiveEscalationMinutes);
        if (expectedKeys.size === 0) continue;

        // Settings policy: which of the expected slots are currently allowed?
        const allowedKeys = computeAllowedScheduleKeys(settings, task.categoryId, "todo", expectedKeys);

        // Partition this entity's valid OS notifications into settings-allowed
        // (retained) and settings-blocked (to cancel).
        const blockedBySettingsIds: string[] = [];
        const retainedOsNotifs: typeof allOsNotifications = [];
        for (const osNotif of allOsNotifications) {
          if (!validNotifications.has(osNotif.identifier)) continue;
          const notifData = osNotif.content?.data as any;
          if (notifData?.itemId !== task.id || notifData?.type !== "todo") continue;
          const triggerWeekday = notifData?.weekday ?? (osNotif.trigger as any)?.weekday;
          const slotKey = notifData?.notificationScheduleKey ||
            getExpectedScheduleKeyForSlot(task, notifData?.escalationLevel ?? 0, triggerWeekday);
          if (slotKey && allowedKeys.has(slotKey)) {
            retainedOsNotifs.push(osNotif);
          } else if (slotKey) {
            // Physically valid but blocked by the current Settings.
            blockedBySettingsIds.push(osNotif.identifier);
          } else {
            // Legacy notification without a derivable slot: keep it.
            retainedOsNotifs.push(osNotif);
          }
        }

        if (blockedBySettingsIds.length > 0) {
          try {
            await cancelReminderIds(blockedBySettingsIds, { throwOnError: false });
          } catch (e) {
            console.warn(`[NotificationReconcilerService] Failed to cancel settings-blocked task notifications for ${task.id}`, e);
          }
        }

        const retainedOsIds = retainedOsNotifs.map(n => n.identifier);

        const retainedKeys = new Set<string>();
        for (const notif of retainedOsNotifs) {
          const notifData = notif.content?.data as any;
          const triggerWeekday = notifData?.weekday ?? (notif.trigger as any)?.weekday;
          const key = notifData?.notificationScheduleKey || 
            getExpectedScheduleKeyForSlot(task, notifData?.escalationLevel ?? 0, triggerWeekday);
          if (key) {
            retainedKeys.add(key);
          }
        }

        const missingKeys = Array.from(allowedKeys).filter(key => !retainedKeys.has(key));

        if (allowedKeys.size === 0) {
          // Current Settings block every slot of this entity (category off, or
          // every fire time inside quiet hours). Cancellations above removed the
          // OS notifications; clear stale domain ids so future passes converge.
          try {
            await TaskRepository.updateNotificationIds(
              task.id,
              task.workspaceId,
              [],
              {
                reminder: { enabled: task.reminder.enabled, triggerAt: task.reminder.triggerAt },
                status: task.status,
                archivedAt: task.archivedAt ?? null,
                updatedAt: task.updatedAt,
                revision: task.revision,
              }
            );
          } catch (e) {
            console.warn(`[NotificationReconcilerService] Failed to clear blocked task notificationIds for ${task.id}`, e);
          }
          continue;
        }

        if (retainedOsIds.length === 0) {
          try {
            const updatedTask = await rescheduleTodoReminders(task, {
              targetScheduleKeys: Array.from(allowedKeys),
              cancelExisting: true,
            });
            if (updatedTask) {
              const updateResult = await TaskRepository.updateNotificationIds(
                updatedTask.id,
                updatedTask.workspaceId,
                updatedTask.reminder?.notificationIds,
                {
                  reminder: { enabled: task.reminder.enabled, triggerAt: task.reminder.triggerAt },
                  status: task.status,
                  archivedAt: task.archivedAt ?? null,
                  updatedAt: task.updatedAt,
                  revision: task.revision,
                }
              );
              if (updateResult === 'state_changed' || updateResult === 'not_found') {
                if (updatedTask.reminder?.notificationIds?.length) {
                  await cancelReminderIds(updatedTask.reminder.notificationIds, { throwOnError: false });
                }
              }
            }
          } catch (e) {
            console.warn(`[NotificationReconcilerService] Failed to reschedule missing task reminder for ${task.id}`, e);
          }
        } else if (missingKeys.length > 0) {
          try {
            const updatedTask = await rescheduleTodoReminders(task, {
              targetScheduleKeys: missingKeys,
              cancelExisting: false,
              retainedNotificationIds: retainedOsIds,
            });
            if (updatedTask) {
              const newlyScheduledIds = (updatedTask.reminder?.notificationIds || []).filter(
                id => !retainedOsIds.includes(id)
              );

              const updateResult = await TaskRepository.updateNotificationIds(
                updatedTask.id,
                updatedTask.workspaceId,
                updatedTask.reminder?.notificationIds,
                {
                  reminder: { enabled: task.reminder.enabled, triggerAt: task.reminder.triggerAt },
                  status: task.status,
                  archivedAt: task.archivedAt ?? null,
                  updatedAt: task.updatedAt,
                  revision: task.revision,
                }
              );
              if (updateResult === 'state_changed' || updateResult === 'not_found') {
                // Domain state was modified concurrently or deleted! Cancel newly scheduled notifications to avoid zombies
                if (newlyScheduledIds.length) {
                  await cancelReminderIds(newlyScheduledIds, { throwOnError: false });
                }
              }
            }
          } catch (e) {
            console.warn(`[NotificationReconcilerService] Failed to reschedule missing task reminder slots for ${task.id}`, e);
          }
        } else {
          // All expected physical notification slots are present and valid in the OS!
          // Does the domain state match what the OS has?
          const domainIds = task.reminder.notificationIds || [];
          
          const isDomainMismatched = domainIds.length !== retainedOsIds.length || 
                                     domainIds.some(id => !retainedOsIds.includes(id));
          
          if (isDomainMismatched) {
            try {
              await TaskRepository.updateNotificationIds(
                task.id,
                task.workspaceId,
                retainedOsIds,
                {
                  reminder: { enabled: task.reminder.enabled, triggerAt: task.reminder.triggerAt },
                  status: task.status,
                  archivedAt: task.archivedAt ?? null,
                  updatedAt: task.updatedAt,
                  revision: task.revision,
                }
              );
            } catch (e) {
              console.warn(`[NotificationReconcilerService] Failed to repair domain notificationIds for ${task.id}`, e);
            }
          }
        }
      }

      for (const habit of Array.from(activeHabits.values())) {
        if (!habit.reminder?.enabled || !habit.reminder?.triggerAt) continue;

        const expectedKeys = getExpectedNotificationScheduleKeys(habit, effectiveEscalationMinutes);
        if (expectedKeys.size === 0) continue;

        const allowedKeys = computeAllowedScheduleKeys(settings, habit.categoryId, "habit", expectedKeys);

        const blockedBySettingsIds: string[] = [];
        const retainedOsNotifs: typeof allOsNotifications = [];
        for (const osNotif of allOsNotifications) {
          if (!validNotifications.has(osNotif.identifier)) continue;
          const notifData = osNotif.content?.data as any;
          if (notifData?.itemId !== habit.id || notifData?.type !== "habit") continue;
          const triggerWeekday = notifData?.weekday ?? (osNotif.trigger as any)?.weekday;
          const slotKey = notifData?.notificationScheduleKey ||
            getExpectedScheduleKeyForSlot(habit, notifData?.escalationLevel ?? 0, triggerWeekday);
          if (slotKey && allowedKeys.has(slotKey)) {
            retainedOsNotifs.push(osNotif);
          } else if (slotKey) {
            blockedBySettingsIds.push(osNotif.identifier);
          } else {
            retainedOsNotifs.push(osNotif);
          }
        }

        if (blockedBySettingsIds.length > 0) {
          try {
            await cancelReminderIds(blockedBySettingsIds, { throwOnError: false });
          } catch (e) {
            console.warn(`[NotificationReconcilerService] Failed to cancel settings-blocked habit notifications for ${habit.id}`, e);
          }
        }

        const retainedOsIds = retainedOsNotifs.map(n => n.identifier);

        const retainedKeys = new Set<string>();
        for (const notif of retainedOsNotifs) {
          const notifData = notif.content?.data as any;
          const triggerWeekday = notifData?.weekday ?? (notif.trigger as any)?.weekday;
          const key = notifData?.notificationScheduleKey || 
            getExpectedScheduleKeyForSlot(habit, notifData?.escalationLevel ?? 0, triggerWeekday);
          if (key) {
            retainedKeys.add(key);
          }
        }

        const missingKeys = Array.from(allowedKeys).filter(key => !retainedKeys.has(key));

        if (allowedKeys.size === 0) {
          try {
            await HabitRepository.updateNotificationIds(
              habit.id,
              habit.workspaceId,
              [],
              {
                reminder: { enabled: habit.reminder.enabled, triggerAt: habit.reminder.triggerAt },
                archivedAt: habit.archivedAt ?? null,
                updatedAt: habit.updatedAt,
                revision: habit.revision,
              }
            );
          } catch (e) {
            console.warn(`[NotificationReconcilerService] Failed to clear blocked habit notificationIds for ${habit.id}`, e);
          }
          continue;
        }

        if (retainedOsIds.length === 0) {
          try {
            const updatedHabit = await rescheduleHabitReminders(habit, {
              targetScheduleKeys: Array.from(allowedKeys),
              cancelExisting: true,
            });
            if (updatedHabit) {
              const updateResult = await HabitRepository.updateNotificationIds(
                updatedHabit.id,
                updatedHabit.workspaceId,
                updatedHabit.reminder?.notificationIds,
                {
                  reminder: { enabled: habit.reminder.enabled, triggerAt: habit.reminder.triggerAt },
                  archivedAt: habit.archivedAt ?? null,
                  updatedAt: habit.updatedAt,
                  revision: habit.revision,
                }
              );
              if (updateResult === 'state_changed' || updateResult === 'not_found') {
                if (updatedHabit.reminder?.notificationIds?.length) {
                  await cancelReminderIds(updatedHabit.reminder.notificationIds, { throwOnError: false });
                }
              }
            }
          } catch (e) {
            console.warn(`[NotificationReconcilerService] Failed to reschedule missing habit reminder for ${habit.id}`, e);
          }
        } else if (missingKeys.length > 0) {
          try {
            const updatedHabit = await rescheduleHabitReminders(habit, {
              targetScheduleKeys: missingKeys,
              cancelExisting: false,
              retainedNotificationIds: retainedOsIds,
            });
            if (updatedHabit) {
              const newlyScheduledIds = (updatedHabit.reminder?.notificationIds || []).filter(
                id => !retainedOsIds.includes(id)
              );

              const updateResult = await HabitRepository.updateNotificationIds(
                updatedHabit.id,
                updatedHabit.workspaceId,
                updatedHabit.reminder?.notificationIds,
                {
                  reminder: { enabled: habit.reminder.enabled, triggerAt: habit.reminder.triggerAt },
                  archivedAt: habit.archivedAt ?? null,
                  updatedAt: habit.updatedAt,
                  revision: habit.revision,
                }
              );
              if (updateResult === 'state_changed' || updateResult === 'not_found') {
                if (newlyScheduledIds.length) {
                  await cancelReminderIds(newlyScheduledIds, { throwOnError: false });
                }
              }
            }
          } catch (e) {
            console.warn(`[NotificationReconcilerService] Failed to reschedule missing habit reminder slots for ${habit.id}`, e);
          }
        } else {
          const domainIds = habit.reminder.notificationIds || [];
          const isDomainMismatched = domainIds.length !== retainedOsIds.length || 
                                     domainIds.some(id => !retainedOsIds.includes(id));
          
          if (isDomainMismatched) {
            try {
              await HabitRepository.updateNotificationIds(
                habit.id,
                habit.workspaceId,
                retainedOsIds,
                {
                  reminder: { enabled: habit.reminder.enabled, triggerAt: habit.reminder.triggerAt },
                  archivedAt: habit.archivedAt ?? null,
                  updatedAt: habit.updatedAt,
                  revision: habit.revision,
                }
              );
            } catch (e) {
              console.warn(`[NotificationReconcilerService] Failed to repair domain notificationIds for ${habit.id}`, e);
            }
          }
        }
      }

      for (const checklist of Array.from(activeChecklists.values())) {
        if (!checklist.reminder?.enabled || !checklist.reminder?.triggerAt) continue;

        const expectedKeys = getExpectedNotificationScheduleKeys(checklist, effectiveEscalationMinutes);
        if (expectedKeys.size === 0) continue;

        const allowedKeys = computeAllowedScheduleKeys(settings, checklist.categoryId, "checklist", expectedKeys);

        const blockedBySettingsIds: string[] = [];
        const retainedOsNotifs: typeof allOsNotifications = [];
        for (const osNotif of allOsNotifications) {
          if (!validNotifications.has(osNotif.identifier)) continue;
          const notifData = osNotif.content?.data as any;
          if (notifData?.itemId !== checklist.id || notifData?.type !== "checklist") continue;
          const triggerWeekday = notifData?.weekday ?? (osNotif.trigger as any)?.weekday;
          const slotKey = notifData?.notificationScheduleKey ||
            getExpectedScheduleKeyForSlot(checklist, notifData?.escalationLevel ?? 0, triggerWeekday);
          if (slotKey && allowedKeys.has(slotKey)) {
            retainedOsNotifs.push(osNotif);
          } else if (slotKey) {
            blockedBySettingsIds.push(osNotif.identifier);
          } else {
            retainedOsNotifs.push(osNotif);
          }
        }

        if (blockedBySettingsIds.length > 0) {
          try {
            await cancelReminderIds(blockedBySettingsIds, { throwOnError: false });
          } catch (e) {
            console.warn(`[NotificationReconcilerService] Failed to cancel settings-blocked checklist notifications for ${checklist.id}`, e);
          }
        }

        const retainedOsIds = retainedOsNotifs.map(n => n.identifier);

        const retainedKeys = new Set<string>();
        for (const notif of retainedOsNotifs) {
          const notifData = notif.content?.data as any;
          const triggerWeekday = notifData?.weekday ?? (notif.trigger as any)?.weekday;
          const key = notifData?.notificationScheduleKey || 
            getExpectedScheduleKeyForSlot(checklist, notifData?.escalationLevel ?? 0, triggerWeekday);
          if (key) {
            retainedKeys.add(key);
          }
        }

        const missingKeys = Array.from(allowedKeys).filter(key => !retainedKeys.has(key));

        if (allowedKeys.size === 0) {
          try {
            await ChecklistRepository.updateNotificationIds(
              checklist.id,
              checklist.workspaceId,
              [],
              {
                reminder: { enabled: checklist.reminder.enabled, triggerAt: checklist.reminder.triggerAt },
                archivedAt: checklist.archivedAt ?? null,
                updatedAt: checklist.updatedAt,
                revision: checklist.revision,
              }
            );
          } catch (e) {
            console.warn(`[NotificationReconcilerService] Failed to clear blocked checklist notificationIds for ${checklist.id}`, e);
          }
          continue;
        }

        if (retainedOsIds.length === 0) {
          try {
            const updatedChecklist = await rescheduleChecklistReminders(checklist, {
              targetScheduleKeys: Array.from(allowedKeys),
              cancelExisting: true,
            });
            if (updatedChecklist) {
              const updateResult = await ChecklistRepository.updateNotificationIds(
                updatedChecklist.id,
                updatedChecklist.workspaceId,
                updatedChecklist.reminder?.notificationIds,
                {
                  reminder: { enabled: checklist.reminder.enabled, triggerAt: checklist.reminder.triggerAt },
                  archivedAt: checklist.archivedAt ?? null,
                  updatedAt: checklist.updatedAt,
                  revision: checklist.revision,
                }
              );
              if (updateResult === 'state_changed' || updateResult === 'not_found') {
                if (updatedChecklist.reminder?.notificationIds?.length) {
                  await cancelReminderIds(updatedChecklist.reminder.notificationIds, { throwOnError: false });
                }
              }
            }
          } catch (e) {
            console.warn(`[NotificationReconcilerService] Failed to reschedule missing checklist reminder for ${checklist.id}`, e);
          }
        } else if (missingKeys.length > 0) {
          try {
            const updatedChecklist = await rescheduleChecklistReminders(checklist, {
              targetScheduleKeys: missingKeys,
              cancelExisting: false,
              retainedNotificationIds: retainedOsIds,
            });
            if (updatedChecklist) {
              const newlyScheduledIds = (updatedChecklist.reminder?.notificationIds || []).filter(
                id => !retainedOsIds.includes(id)
              );

              const updateResult = await ChecklistRepository.updateNotificationIds(
                updatedChecklist.id,
                updatedChecklist.workspaceId,
                updatedChecklist.reminder?.notificationIds,
                {
                  reminder: { enabled: checklist.reminder.enabled, triggerAt: checklist.reminder.triggerAt },
                  archivedAt: checklist.archivedAt ?? null,
                  updatedAt: checklist.updatedAt,
                  revision: checklist.revision,
                }
              );
              if (updateResult === 'state_changed' || updateResult === 'not_found') {
                if (newlyScheduledIds.length) {
                  await cancelReminderIds(newlyScheduledIds, { throwOnError: false });
                }
              }
            }
          } catch (e) {
            console.warn(`[NotificationReconcilerService] Failed to reschedule missing checklist reminder slots for ${checklist.id}`, e);
          }
        } else {
          const domainIds = checklist.reminder.notificationIds || [];
          const isDomainMismatched = domainIds.length !== retainedOsIds.length || 
                                     domainIds.some(id => !retainedOsIds.includes(id));
          
          if (isDomainMismatched) {
            try {
              await ChecklistRepository.updateNotificationIds(
                checklist.id,
                checklist.workspaceId,
                retainedOsIds,
                {
                  reminder: { enabled: checklist.reminder.enabled, triggerAt: checklist.reminder.triggerAt },
                  archivedAt: checklist.archivedAt ?? null,
                  updatedAt: checklist.updatedAt,
                  revision: checklist.revision,
                }
              );
            } catch (e) {
              console.warn(`[NotificationReconcilerService] Failed to repair domain notificationIds for ${checklist.id}`, e);
            }
          }
        }
      }

    } catch (error) {
      console.warn("[NotificationReconcilerService] Failed to run reconciliation pass.", error);
    }
  }
}