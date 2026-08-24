import {
  TaskRepository,
  HabitRepository,
  ConversionJournalRepository
} from "@/repositories";
import { recordDailyHistorySnapshot } from "@/services/analytics/productivity-history.service";
import { emitStateChange } from "@/services/events/state-events";
import { cancelReminderIds } from "@/services/scheduling/reminders.service";
import { syncWidgetData } from "@/services/analytics/widget-data.service";
import { scheduleTaskNotifications, scheduleHabitNotifications } from "../shared/command-notifications";
import { withLocks } from "@/shared/utils/mutex";
import {
  type Task,
  type Habit,
  INBOX_WORKSPACE_ID,
} from "@/shared/types/domain.types";
import { CreateEntityOptions } from "../types/command.types";

export class ConversionCommandHandler {
  /**
   * Phase 8: convertHabitToTask
   *
   * Safely converts an existing Habit into a Task with guaranteed rollback using ConversionJournal.
   */
  static async convertHabitToTask(
    habitId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<Task> {
    const { generateId } = await import("@/shared/utils/id");

    const targetWorkspaceId = workspaceId || INBOX_WORKSPACE_ID;
    const journalLock = "pebble:v1:conversion_journal";
    const taskLock = `pebble:v1:tasks:${targetWorkspaceId}`;
    const habitLock = `pebble:v1:habits:${targetWorkspaceId}`;
    const locks = [journalLock, habitLock, taskLock].sort(); // Deterministic ABBA prevention

    let createdTask: Task | undefined;
    let oldNotificationIds: string[] | undefined;

    await withLocks(locks, async () => {
      // 1. Fresh read inside the lock
      const habitsMap = await HabitRepository.getHabits(targetWorkspaceId);
      const habit = habitsMap[habitId];
      if (!habit) {
        throw new Error(`[ConversionCommandHandler] convertHabitToTask failed: Habit ${habitId} not found in workspace ${targetWorkspaceId}`);
      }

      // 2. Construct Task
      const newTaskId = generateId("task-");
      const newTask: Task = {
        id: newTaskId,
        workspaceId: habit.workspaceId || INBOX_WORKSPACE_ID,
        title: habit.title,
        description: habit.description,
        status: "todo",
        priority: "medium",
        categoryId: habit.categoryId || "work",
        schedule: { date: new Date().toISOString().split("T")[0] },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        reminder: habit.reminder
          ? {
              enabled: habit.reminder.enabled,
              triggerAt: habit.reminder.triggerAt,
              notificationIds: undefined,
            }
          : undefined,
      };

      if (habit.reminder?.notificationIds) {
        oldNotificationIds = [...habit.reminder.notificationIds];
      }

      const operationId = `conv-${Date.now()}-${generateId("")}`;

      // Crash-Safe Sequence:
      // A. Write PREPARED to Journal
      await ConversionJournalRepository.addOperationUnlocked({
        operationId,
        operationType: "habit_to_task",
        sourceId: habitId,
        sourceWorkspaceId: targetWorkspaceId,
        targetId: newTaskId,
        targetWorkspaceId: targetWorkspaceId,
        phase: "PREPARED",
        timestamp: Date.now()
      });

      // B. Create Destination (Task)
      await TaskRepository.saveTaskUnlocked(newTask);

      // C. Update Journal to DESTINATION_WRITTEN
      await ConversionJournalRepository.updateOperationUnlocked(operationId, { phase: "DESTINATION_WRITTEN" });

      // D. Remove Source (Habit)
      await HabitRepository.deleteHabitUnlocked(habitId, targetWorkspaceId);

      // E. Clear Journal
      await ConversionJournalRepository.removeOperationUnlocked(operationId);

      createdTask = newTask;
    });

    if (!createdTask) {
       throw new Error("Conversion transaction aborted");
    }

    if (oldNotificationIds && oldNotificationIds.length > 0) {
      cancelReminderIds(oldNotificationIds, { throwOnError: false }).catch(e => {
        console.warn(`[ConversionCommandHandler] Failed to cancel old reminders for ${habitId}`, e);
      });
    }

    if (createdTask.reminder?.enabled) {
       try {
           const newNotificationIds = await scheduleTaskNotifications(createdTask.id, createdTask as any);
           if (newNotificationIds && newNotificationIds.length > 0) {
               await TaskRepository.updateNotificationIds(createdTask.id, createdTask.workspaceId, newNotificationIds);
               const verify = await TaskRepository.getTask(createdTask.id, createdTask.workspaceId);
               if (!verify || verify.status === "completed" || verify.archivedAt) {
                   cancelReminderIds(newNotificationIds, { throwOnError: false }).catch(() => {});
               }
           }
       } catch (e) {
           console.warn(`[ConversionCommandHandler] Failed to schedule new reminders for ${habitId}`, e);
       }
    }

    if (!options?.skipEvents) {
      emitStateChange("tasks_changed", options?.source);
      emitStateChange("habits_changed", options?.source);
    }
    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }
    void syncWidgetData().catch(() => {});

    return createdTask;
  }

  /**
   * Batch 7F: convertTaskToHabit
   */
  static async convertTaskToHabit(
    taskId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<Habit> {
    const { generateId } = await import("@/shared/utils/id");

    const targetWorkspaceId = workspaceId || INBOX_WORKSPACE_ID;
    const journalLock = "pebble:v1:conversion_journal";
    const taskLock = `pebble:v1:tasks:${targetWorkspaceId}`;
    const habitLock = `pebble:v1:habits:${targetWorkspaceId}`;
    const locks = [journalLock, habitLock, taskLock].sort();

    let createdHabit: Habit | undefined;
    let oldNotificationIds: string[] | undefined;

    await withLocks(locks, async () => {
      const tasksMap = await TaskRepository.getTasks(targetWorkspaceId);
      const task = tasksMap[taskId];
      if (!task) {
        throw new Error(`[ConversionCommandHandler] convertTaskToHabit failed: Task ${taskId} not found`);
      }

      const habitId = generateId("habit-");
      const habit: Habit = {
        id: habitId,
        workspaceId: task.workspaceId || INBOX_WORKSPACE_ID,
        title: task.title,
        description: task.description,
        categoryId: task.categoryId || "work",
        tags: task.tags,
        recurrence: task.recurrence || { frequency: "daily", interval: 1 },
        recurrenceExceptions: task.recurrenceExceptions,
        completionHistory: [],
        reminder: task.reminder
          ? {
              enabled: task.reminder.enabled,
              triggerAt: task.reminder.triggerAt,
              notificationIds: undefined,
            }
          : undefined,
        resourceIds: task.resourceIds,
        createdAt: task.createdAt,
        updatedAt: Date.now(),
        archivedAt: task.archivedAt,
      };

      if (task.reminder?.notificationIds) {
        oldNotificationIds = [...task.reminder.notificationIds];
      }

      const operationId = `conv-${Date.now()}-${generateId("")}`;

      // Crash-Safe Sequence:
      // A. Write PREPARED to Journal
      await ConversionJournalRepository.addOperationUnlocked({
        operationId,
        operationType: "task_to_habit",
        sourceId: taskId,
        sourceWorkspaceId: targetWorkspaceId,
        targetId: habitId,
        targetWorkspaceId: targetWorkspaceId,
        phase: "PREPARED",
        timestamp: Date.now()
      });

      // B. Create Destination (Habit)
      await HabitRepository.saveHabitUnlocked(habit);

      // C. Update Journal to DESTINATION_WRITTEN
      await ConversionJournalRepository.updateOperationUnlocked(operationId, { phase: "DESTINATION_WRITTEN" });

      // D. Remove Source (Task)
      await TaskRepository.deleteTaskUnlocked(taskId, targetWorkspaceId);

      // E. Clear Journal
      await ConversionJournalRepository.removeOperationUnlocked(operationId);

      createdHabit = habit;
    });

    if (!createdHabit) {
       throw new Error("Conversion transaction aborted");
    }

    if (oldNotificationIds && oldNotificationIds.length > 0) {
      cancelReminderIds(oldNotificationIds, { throwOnError: false }).catch(e => {
        console.warn(`[ConversionCommandHandler] Failed to cancel old reminders for ${taskId}`, e);
      });
    }

    if (createdHabit.reminder?.enabled) {
       try {
           const newNotificationIds = await scheduleHabitNotifications(createdHabit.id, createdHabit as any);
           if (newNotificationIds && newNotificationIds.length > 0) {
               await HabitRepository.updateNotificationIds(createdHabit.id, createdHabit.workspaceId, newNotificationIds);
               const verify = await HabitRepository.getHabit(createdHabit.id, createdHabit.workspaceId);
               if (!verify || verify.archivedAt) {
                   cancelReminderIds(newNotificationIds, { throwOnError: false }).catch(() => {});
               }
           }
       } catch (e) {
           console.warn(`[ConversionCommandHandler] Failed to schedule new reminders for ${taskId}`, e);
       }
    }

    if (!options?.skipEvents) {
      emitStateChange("tasks_changed", options?.source);
      emitStateChange("habits_changed", options?.source);
    }
    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }
    void syncWidgetData().catch(() => {});

    return createdHabit;
  }
}
