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
import { isMatchingPhysicalNotification } from "@/services/notifications/notification-identity";

export class NotificationReconcilerService {
  /**
   * Reconciles the OS notification state against the current Domain state.
   * 
   * This is an idempotent pass that:
   * 1. Detects and cancels stale OS notifications (deleted/recycled/archived, or outdated triggers).
   * 2. Detects and cancels duplicate OS notifications for the same logical intent.
   * 3. Repairs missing `notificationIds` in Domain State if a perfect OS notification exists.
   * 4. Detects active items missing required OS notifications and schedules them.
   * 
   * The Domain State is considered authoritative. Notification scheduling failures
   * do not crash the pass, they are logged and retried on the next run.
   */
  static async reconcileAll(): Promise<void> {
    try {
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
          allOsNotifications.push({
            identifier: `web-interval-${loopKey}`,
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

        // Check if the OS actually retained valid notifications for this item
        const retainedOsIds = Array.from(validNotifications).filter(id => {
          const osNotif = allOsNotifications.find(n => n.identifier === id);
          return osNotif && 
                 (osNotif.content?.data as any)?.itemId === task.id &&
                 (osNotif.content?.data as any)?.type === "todo";
        });

        const hasPrimaryNotification = retainedOsIds.some(id => {
          const osNotif = allOsNotifications.find(n => n.identifier === id);
          const notifData = osNotif?.content?.data as any;
          return !notifData?.escalationLevel || notifData.escalationLevel === 0;
        });

        const hadStaleNotification = (task.reminder.notificationIds || []).some(id => staleNotifications.has(id));

        if (retainedOsIds.length === 0 || !hasPrimaryNotification || hadStaleNotification) {
          // Missing primary notification, completely missing, or had stale notifications cancelled:
          // clean up any orphan IDs and cleanly reschedule the complete notification set
          if (retainedOsIds.length > 0) {
            await cancelReminderIds(retainedOsIds, { throwOnError: false });
          }
          try {
            const updatedTask = await rescheduleTodoReminders(task);
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
              if (updateResult === 'state_changed') {
                // Domain state was modified concurrently! Cancel newly scheduled notifications to avoid zombies
                if (updatedTask.reminder?.notificationIds?.length) {
                  await cancelReminderIds(updatedTask.reminder.notificationIds, { throwOnError: false });
                }
              }
            }
          } catch (e) {
            console.warn(`[NotificationReconcilerService] Failed to reschedule missing task reminder for ${task.id}`, e);
          }
        } else {
          // The OS HAS valid notifications for this schedule!
          // Does the domain state match what the OS has?
          const domainIds = task.reminder.notificationIds || [];
          
          // Check if domain state needs repair (e.g. crash before save, or array mismatch)
          const isDomainMismatched = domainIds.length !== retainedOsIds.length || 
                                     domainIds.some(id => !retainedOsIds.includes(id));
          
          if (isDomainMismatched) {
            // Repair domain state to match the truth of the OS!
            // Do NOT call rescheduleTodoReminders which would create duplicates.
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

        const retainedOsIds = Array.from(validNotifications).filter(id => {
          const osNotif = allOsNotifications.find(n => n.identifier === id);
          return osNotif && 
                 (osNotif.content?.data as any)?.itemId === habit.id &&
                 (osNotif.content?.data as any)?.type === "habit";
        });

        const hasPrimaryNotification = retainedOsIds.some(id => {
          const osNotif = allOsNotifications.find(n => n.identifier === id);
          const notifData = osNotif?.content?.data as any;
          return !notifData?.escalationLevel || notifData.escalationLevel === 0;
        });

        const hadStaleNotification = (habit.reminder.notificationIds || []).some(id => staleNotifications.has(id));

        if (retainedOsIds.length === 0 || !hasPrimaryNotification || hadStaleNotification) {
          if (retainedOsIds.length > 0) {
            await cancelReminderIds(retainedOsIds, { throwOnError: false });
          }
          try {
            const updatedHabit = await rescheduleHabitReminders(habit);
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
              if (updateResult === 'state_changed') {
                if (updatedHabit.reminder?.notificationIds?.length) {
                  await cancelReminderIds(updatedHabit.reminder.notificationIds, { throwOnError: false });
                }
              }
            }
          } catch (e) {
            console.warn(`[NotificationReconcilerService] Failed to reschedule missing habit reminder for ${habit.id}`, e);
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

        const retainedOsIds = Array.from(validNotifications).filter(id => {
          const osNotif = allOsNotifications.find(n => n.identifier === id);
          return osNotif && 
                 (osNotif.content?.data as any)?.itemId === checklist.id &&
                 (osNotif.content?.data as any)?.type === "checklist";
        });

        const hasPrimaryNotification = retainedOsIds.some(id => {
          const osNotif = allOsNotifications.find(n => n.identifier === id);
          const notifData = osNotif?.content?.data as any;
          return !notifData?.escalationLevel || notifData.escalationLevel === 0;
        });

        const hadStaleChecklistNotif = (checklist.reminder.notificationIds || []).some(id => staleNotifications.has(id));

        if (retainedOsIds.length === 0 || !hasPrimaryNotification || hadStaleChecklistNotif) {
          if (retainedOsIds.length > 0) {
            await cancelReminderIds(retainedOsIds, { throwOnError: false });
          }
          try {
            const updatedChecklist = await rescheduleChecklistReminders(checklist);
            if (updatedChecklist) {
              const updateResult = await ChecklistRepository.updateNotificationIds(
                updatedChecklist.id,
                updatedChecklist.workspaceId,
                updatedChecklist.reminder?.notificationIds,
                {
                  reminder: { enabled: checklist.reminder.enabled, triggerAt: checklist.reminder.triggerAt },
                  archivedAt: checklist.archivedAt ?? null,
                  revision: checklist.revision,
                }
              );
              if (updateResult === 'state_changed') {
                if (updatedChecklist.reminder?.notificationIds?.length) {
                  await cancelReminderIds(updatedChecklist.reminder.notificationIds, { throwOnError: false });
                }
              }
            }
          } catch (e) {
            console.warn(`[NotificationReconcilerService] Failed to reschedule missing checklist reminder for ${checklist.id}`, e);
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
