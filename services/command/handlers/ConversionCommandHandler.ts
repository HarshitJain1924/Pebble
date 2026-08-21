import {
  TaskRepository,
  HabitRepository,
} from "@/repositories";
import { recordDailyHistorySnapshot } from "@/services/analytics/productivity-history.service";
import { emitStateChange } from "@/services/events/state-events";
import { cancelReminderIds } from "@/services/scheduling/reminders.service";
import { syncWidgetData } from "@/services/analytics/widget-data.service";
import {
  type Task,
  type Habit,
  INBOX_WORKSPACE_ID,
} from "@/shared/types/domain.types";
import { TaskCommandHandler } from "./TaskCommandHandler";
import { HabitCommandHandler } from "./HabitCommandHandler";
import { CreateEntityOptions } from "../types/command.types";

export class ConversionCommandHandler {
  /**
   * Phase 8: convertHabitToTask
   *
   * Safely converts an existing Habit into a Task.
   * Guarantees that the original Habit is NEVER deleted if Task creation fails.
   */
  static async convertHabitToTask(
    habitId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<Task> {
    const { generateId } = await import("@/shared/utils/id");

    // 1. Load Habit
    const habitMap = await HabitRepository.getHabits(workspaceId);
    const habit = habitMap[habitId];
    if (!habit) {
      throw new Error(`[ConversionCommandHandler] convertHabitToTask failed: Habit ${habitId} not found in workspace ${workspaceId}`);
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
            notificationIds: undefined, // Strip old IDs so createTask generates new ones
          }
        : undefined,
    };

    // 3. Persist Task (internally reschedules reminder with fresh IDs)
    const createdTask = await TaskCommandHandler.createTask(newTask, newTask.workspaceId, {
      skipEvents: true,
      skipAnalytics: true,
    });

    // 4. Cancel Old Reminders (Fire and forget)
    if (habit.reminder && habit.reminder.notificationIds) {
      cancelReminderIds(habit.reminder.notificationIds, { throwOnError: false }).catch(e => {
        console.warn(`[ConversionCommandHandler] Failed to cancel old reminders during Habit->Task conversion for ${habitId}`, e);
      });
    }

    // 5. Delete Habit
    await HabitRepository.deleteHabit(habitId, workspaceId);

    // 6. Side Effects
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
   *
   * Safely converts an existing Task into a Habit.
   * Guarantees that the original Task is NEVER deleted if Habit creation fails.
   */
  static async convertTaskToHabit(
    taskId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<Habit> {
    const { generateId } = await import("@/shared/utils/id");

    // 1. Load Task
    const task = await TaskRepository.getTask(taskId, workspaceId);
    if (!task) {
      throw new Error(`[ConversionCommandHandler] convertTaskToHabit failed: Task ${taskId} not found in workspace ${workspaceId}`);
    }

    // 2. Construct Habit
    const habitId = generateId("habit-");
    const habit: Habit = {
      id: habitId,
      workspaceId: task.workspaceId,
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
            notificationIds: undefined, // Strip old IDs so createHabit generates new ones
          }
        : undefined,
      resourceIds: task.resourceIds,
      createdAt: task.createdAt,
      updatedAt: Date.now(),
      archivedAt: task.archivedAt,
    };

    // 3. Persist Habit (internally reschedules reminder with fresh IDs)
    const newHabit = await HabitCommandHandler.createHabit(habit, habit.workspaceId, {
      skipEvents: true,
      skipAnalytics: true,
    });

    // 4. Cancel Old Reminders (Fire and forget)
    if (task.reminder && task.reminder.notificationIds) {
      cancelReminderIds(task.reminder.notificationIds, { throwOnError: false }).catch(e => {
        console.warn(`[ConversionCommandHandler] Failed to cancel old reminders during Task->Habit conversion for ${taskId}`, e);
      });
    }

    // 5. Delete Task
    await TaskRepository.deleteTask(taskId, workspaceId);

    // 6. Side Effects
    if (!options?.skipEvents) {
      emitStateChange("tasks_changed", options?.source);
      emitStateChange("habits_changed", options?.source);
    }
    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }
    void syncWidgetData().catch(() => {});

    return newHabit;
  }
}
