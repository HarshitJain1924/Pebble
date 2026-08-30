import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { TaskRepository } from "@/repositories/TaskRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { rescheduleTodoReminders, rescheduleHabitReminders, cancelReminderIds } from "@/services/scheduling/reminders.service";
import * as Notifications from "expo-notifications";
import { Task, Habit, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { isMatchingNotificationSignature } from "@/services/notifications/notification-identity";

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
      if (typeof Notifications.getAllScheduledNotificationsAsync !== "function") return;

      const allOsNotifications = await Notifications.getAllScheduledNotificationsAsync();
      
      const workspaces = await WorkspaceRepository.getWorkspaces();
      const activeWorkspaces = workspaces.filter(w => !w.archivedAt);
      const workspaceIds = new Set<string>(activeWorkspaces.map(w => w.id));
      if (!workspaces.some(w => w.id === INBOX_WORKSPACE_ID && w.archivedAt)) {
        workspaceIds.add(INBOX_WORKSPACE_ID);
      }
      
      const activeTasks = new Map<string, Task>();
      const activeHabits = new Map<string, Habit>();
      
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
      }

      // 2. Audit existing OS notifications
      const notificationsByLogicalInstance = new Map<string, string[]>();
      const validNotifications = new Set<string>();
      const notificationsToCancel = new Set<string>();

      for (const osNotif of allOsNotifications) {
        const data = osNotif.content?.data as any;
        const itemId = data?.itemId;
        const escalationLevel = data?.escalationLevel ?? 0;
        const logicalSignature = data?.logicalSignature;
        const id = osNotif.identifier;

        // Ignore notifications that don't belong to our subsystem
        if (data?.type !== "todo" && data?.type !== "habit") {
          continue;
        }

        if (!itemId || !logicalSignature) {
          // Malformed payload for our type, cancel it.
          notificationsToCancel.add(id);
          continue;
        }

        let isMatch = false;
        if (data.type === "todo") {
          const task = activeTasks.get(itemId);
          if (task && isMatchingNotificationSignature(data, task, "todo")) {
            isMatch = true;
          }
        } else if (data.type === "habit") {
          const habit = activeHabits.get(itemId);
          if (habit && isMatchingNotificationSignature(data, habit, "habit")) {
            isMatch = true;
          }
        }

        if (!isMatch) {
          // Stale notification (entity deleted/completed/archived, or trigger time changed)
          notificationsToCancel.add(id);
          continue;
        }

        const isCanonical = typeof logicalSignature === "string" && logicalSignature.startsWith(`${data.type}:${itemId}:`);
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
          const currentPrimarySig = (currentPrimaryNotif?.content?.data as any)?.logicalSignature;
          const currentIsCanonical = typeof currentPrimarySig === "string" && currentPrimarySig.startsWith(`${data.type}:${itemId}:`);

          if (!currentIsCanonical && isCanonical) {
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

        if (retainedOsIds.length === 0) {
          // Completely missing from OS, MUST RESCHEDULE
          try {
            const updatedTask = await rescheduleTodoReminders(task);
            await TaskRepository.updateNotificationIds(updatedTask.id, updatedTask.workspaceId, updatedTask.reminder?.notificationIds);
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
              await TaskRepository.updateNotificationIds(task.id, task.workspaceId, retainedOsIds);
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

        if (retainedOsIds.length === 0) {
          try {
            const updatedHabit = await rescheduleHabitReminders(habit);
            await HabitRepository.updateNotificationIds(updatedHabit.id, updatedHabit.workspaceId, updatedHabit.reminder?.notificationIds);
          } catch (e) {
            console.warn(`[NotificationReconcilerService] Failed to reschedule missing habit reminder for ${habit.id}`, e);
          }
        } else {
          const domainIds = habit.reminder.notificationIds || [];
          const isDomainMismatched = domainIds.length !== retainedOsIds.length || 
                                     domainIds.some(id => !retainedOsIds.includes(id));
          
          if (isDomainMismatched) {
            try {
              await HabitRepository.updateNotificationIds(habit.id, habit.workspaceId, retainedOsIds);
            } catch (e) {
              console.warn(`[NotificationReconcilerService] Failed to repair domain notificationIds for ${habit.id}`, e);
            }
          }
        }
      }

    } catch (error) {
      console.warn("[NotificationReconcilerService] Failed to run reconciliation pass.", error);
    }
  }
}
