import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { TaskRepository } from "@/repositories/TaskRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { rescheduleTodoReminders, rescheduleHabitReminders, cancelReminderIds } from "@/services/scheduling/reminders.service";
import * as Notifications from "expo-notifications";
import { Task, Habit } from "@/shared/types/domain.types";

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
      
      const activeTasks = new Map<string, Task>();
      const activeHabits = new Map<string, Habit>();
      
      // 1. Load authoritative domain state
      for (const ws of activeWorkspaces) {
        const tasks = await TaskRepository.getTasks(ws.id);
        Object.values(tasks).forEach(t => {
          if (!t.archivedAt && t.status !== "completed") {
            activeTasks.set(t.id, t);
          }
        });
        
        const habits = await HabitRepository.getHabits(ws.id);
        Object.values(habits).forEach(h => {
          if (!h.archivedAt) {
            activeHabits.set(h.id, h);
          }
        });
      }

      // Compute REQUIRED logical signatures based on active domain state
      const requiredSignatures = new Set<string>();
      
      for (const task of activeTasks.values()) {
        if (task.reminder?.enabled && task.reminder?.triggerAt) {
          requiredSignatures.add(`${task.id}|${task.reminder.triggerAt.toString()}`);
        }
      }

      for (const habit of activeHabits.values()) {
        if (habit.reminder?.enabled && habit.reminder?.triggerAt) {
          requiredSignatures.add(`${habit.id}|${habit.reminder.triggerAt.toString()}`);
        }
      }

      // 2. Audit existing OS notifications
      // A unique logical instance is itemId + logicalSignature + escalationLevel
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

        // Is this notification currently REQUIRED by the domain state?
        const domainRequiresIt = requiredSignatures.has(`${itemId}|${logicalSignature}`);

        if (!domainRequiresIt) {
          // Stale notification (entity deleted/completed/archived, or trigger time changed)
          notificationsToCancel.add(id);
          continue;
        }

        // Deduplicate identical logical notifications
        const instanceKey = `${itemId}|${logicalSignature}|${escalationLevel}`;
        if (!notificationsByLogicalInstance.has(instanceKey)) {
          notificationsByLogicalInstance.set(instanceKey, [id]);
          validNotifications.add(id);
        } else {
          // Duplicate exactly matching logical instance! Keep first, cancel this one.
          notificationsToCancel.add(id);
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

        const expectedLogicalSignature = task.reminder.triggerAt.toString();
        // Check if the OS actually retained valid notifications for this item
        const retainedOsIds = Array.from(validNotifications).filter(id => {
          const osNotif = allOsNotifications.find(n => n.identifier === id);
          return osNotif && (osNotif.content?.data as any)?.itemId === task.id;
        });

        if (retainedOsIds.length === 0) {
          // Completely missing from OS, MUST RESCHEDULE
          try {
            const updatedTask = await rescheduleTodoReminders(task);
            await TaskRepository.saveTask(updatedTask);
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
              const updatedTask = {
                ...task,
                reminder: {
                  ...task.reminder,
                  notificationIds: retainedOsIds,
                }
              };
              await TaskRepository.saveTask(updatedTask);
            } catch (e) {
              console.warn(`[NotificationReconcilerService] Failed to repair domain notificationIds for ${task.id}`, e);
            }
          }
        }
      }

      for (const habit of Array.from(activeHabits.values())) {
        if (!habit.reminder?.enabled || !habit.reminder?.triggerAt) continue;

        const expectedLogicalSignature = habit.reminder.triggerAt.toString();
        const retainedOsIds = Array.from(validNotifications).filter(id => {
          const osNotif = allOsNotifications.find(n => n.identifier === id);
          return osNotif && (osNotif.content?.data as any)?.itemId === habit.id;
        });

        if (retainedOsIds.length === 0) {
          try {
            const updatedHabit = await rescheduleHabitReminders(habit);
            await HabitRepository.saveHabit(updatedHabit);
          } catch (e) {
            console.warn(`[NotificationReconcilerService] Failed to reschedule missing habit reminder for ${habit.id}`, e);
          }
        } else {
          const domainIds = habit.reminder.notificationIds || [];
          const isDomainMismatched = domainIds.length !== retainedOsIds.length || 
                                     domainIds.some(id => !retainedOsIds.includes(id));
          
          if (isDomainMismatched) {
            try {
              const updatedHabit = {
                ...habit,
                reminder: {
                  ...habit.reminder,
                  notificationIds: retainedOsIds,
                }
              };
              await HabitRepository.saveHabit(updatedHabit);
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
