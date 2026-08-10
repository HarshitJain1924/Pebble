import {
  ChecklistRepository,
  HabitRepository,
  ResourceRepository,
  TaskRepository,
  WorkspaceRepository,
} from "@/repositories";
import {
  buildChecklist,
  buildHabit,
  buildResource,
  buildTask,
  computeTriggerAt,
  parseTime,
} from "@/features/capture/services/entity-factory.service";
import type { ParsedProductivityItem } from "@/features/capture/services/nlp-parser.service";
import { recordDailyHistorySnapshot } from "@/services/analytics/productivity-history.service";
import { emitStateChange } from "@/services/events/state-events";
import {
  cancelReminderIds,
  rescheduleHabitReminders,
  rescheduleTodoReminders,
  scheduleReminderBatch,
} from "@/services/scheduling/reminders.service";
import { syncWidgetData } from "@/services/analytics/widget-data.service";
import { handleTaskXpChange, handleHabitXpChange } from "@/features/settings/services/settings.service";
import { earnPebble, undoLastPebble } from "@/features/profile/services/pebble.service";
import { pluginManager } from "@/plugin";
import { getTodayDateKey, getOffsetDateKey, isHabitCompletedToday } from "@/shared/utils/domain-selectors";
import {
  INBOX_WORKSPACE_ID,
  type Checklist,
  type Habit,
  type Resource,
  type Task,
} from "@/shared/types/domain.types";

/**
 * Options to control command side-effects.
 */
export interface CreateEntityOptions {
  /** Skip state event emission (useful for batch operations) */
  skipEvents?: boolean;
  /** Skip analytics snapshot trigger */
  skipAnalytics?: boolean;
  /** Origin identifier for state event emission to prevent self-reload loops */
  source?: string;
}

/**
 * Type guard to check if input is a ParsedProductivityItem vs pre-built entity object.
 */
function isParsedProductivityItem(
  input: any,
): input is ParsedProductivityItem {
  return (
    typeof input === "object" &&
    input !== null &&
    typeof input.type === "string" &&
    typeof input.confidence === "number"
  );
}

/**
 * Unified notification scheduling for entity creation.
 *
 * Uses computeTriggerAt / parseTime from EntityFactory for consistent
 * time validation with the entity builders.
 */
async function scheduleCreationNotifications(
  kind: "todo" | "habit",
  entityId: string,
  item: ParsedProductivityItem,
): Promise<string[]> {
  const triggerAt = computeTriggerAt(item);
  if (triggerAt === undefined) return [];

  const { hours, minutes } = parseTime(item);
  if (hours === undefined || minutes === undefined) return [];

  const category = item.category || (kind === "todo" ? "work" : "personal");
  const channelId =
    kind === "todo"
      ? `task_reminders_${category}`
      : `habit_reminders_${category}`;

  try {
    if (kind === "todo" && !item.recurrence) {
      // One-time task notification
      const batch = await scheduleReminderBatch({
        kind: "todo",
        itemId: entityId,
        title: item.title,
        oneTimeAt: new Date(triggerAt),
        category,
        channelId,
      });
      return batch.ids;
    }

    // Recurring (task with recurrence OR any habit)
    const scheduled = await scheduleReminderBatch({
      kind,
      itemId: entityId,
      title: item.title,
      category,
      dailyTime: { hour: hours, minute: minutes },
      dailyDays:
        item.recurrence?.type === "weekdays"
          ? [1, 2, 3, 4, 5]
          : item.recurrence?.days,
      recurrence: item.recurrence,
      escalationMinutes: [120, 240],
      channelId,
      context:
        kind === "todo"
          ? { title: item.title, remainingCount: 1, totalCount: 1 }
          : { title: item.title, streak: 0 },
    });
    return scheduled.ids;
  } catch (e) {
    console.error(
      `[EntityCommandService] Failed to schedule ${kind} reminder:`,
      e,
    );
    return [];
  }
}

/**
 * Schedule reminder notifications for a task input.
 */
async function scheduleTaskNotifications(
  taskId: string,
  item: ParsedProductivityItem,
): Promise<string[]> {
  return scheduleCreationNotifications("todo", taskId, item);
}

/**
 * Schedule reminder notifications for a habit input.
 */
async function scheduleHabitNotifications(
  habitId: string,
  item: ParsedProductivityItem,
): Promise<string[]> {
  return scheduleCreationNotifications("habit", habitId, item);
}

/**
 * EntityCommandService
 *
 * Single application-level command service responsible for executing entity creation commands.
 *
 * Orchestrates:
 *   Entity construction/normalization → Persistence → Notification scheduling → State events → Analytics
 */
export class EntityCommandService {
  /**
   * Create and persist a Task entity.
   */
  static async createTask(
    input: Task | ParsedProductivityItem,
    workspaceId: string = INBOX_WORKSPACE_ID,
    options?: CreateEntityOptions,
  ): Promise<Task> {
    let task: Task;

    if (isParsedProductivityItem(input)) {
      task = buildTask(input, workspaceId);
      const notificationIds = await scheduleTaskNotifications(task.id, input);
      if (notificationIds.length > 0 && task.reminder) {
        task.reminder.notificationIds = notificationIds;
      }
    } else {
      const targetWorkspace = input.workspaceId || workspaceId || INBOX_WORKSPACE_ID;
      task = {
        ...input,
        workspaceId: targetWorkspace,
        createdAt: input.createdAt || Date.now(),
        updatedAt: Date.now(),
        status: input.status || "todo",
        priority: input.priority || "none",
      };

      if (task.reminder?.enabled && task.reminder?.triggerAt) {
        try {
          task = await rescheduleTodoReminders(task);
        } catch (e) {
          console.warn("[EntityCommandService] Failed to reschedule task reminder:", e);
        }
      }
    }

    await TaskRepository.saveTask(task);

    if (!options?.skipEvents) {
      emitStateChange("tasks_changed", options?.source);
    }

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    return task;
  }

  /**
   * Create and persist a Habit entity.
   */
  static async createHabit(
    input: Habit | ParsedProductivityItem,
    workspaceId: string = INBOX_WORKSPACE_ID,
    options?: CreateEntityOptions,
  ): Promise<Habit> {
    let habit: Habit;

    if (isParsedProductivityItem(input)) {
      habit = buildHabit(input, workspaceId);
      const notificationIds = await scheduleHabitNotifications(habit.id, input);
      if (notificationIds.length > 0 && habit.reminder) {
        habit.reminder.notificationIds = notificationIds;
      }
    } else {
      const targetWorkspace = input.workspaceId || workspaceId || INBOX_WORKSPACE_ID;
      habit = {
        ...input,
        workspaceId: targetWorkspace,
        createdAt: input.createdAt || Date.now(),
        updatedAt: Date.now(),
        completionHistory: input.completionHistory || [],
      };

      if (habit.reminder?.enabled) {
        try {
          habit = await rescheduleHabitReminders(habit);
        } catch (e) {
          console.warn("[EntityCommandService] Failed to reschedule habit reminder:", e);
        }
      }
    }

    await HabitRepository.saveHabit(habit);

    if (!options?.skipEvents) {
      emitStateChange("habits_changed", options?.source);
    }

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    return habit;
  }

  /**
   * Create and persist a Checklist entity.
   */
  static async createChecklist(
    input: Checklist | ParsedProductivityItem,
    workspaceId: string = INBOX_WORKSPACE_ID,
    options?: CreateEntityOptions,
  ): Promise<Checklist> {
    let checklist: Checklist;

    if (isParsedProductivityItem(input)) {
      checklist = buildChecklist(input, workspaceId);
    } else {
      const targetWorkspace = input.workspaceId || workspaceId || INBOX_WORKSPACE_ID;
      checklist = {
        ...input,
        workspaceId: targetWorkspace,
        createdAt: input.createdAt || Date.now(),
        updatedAt: Date.now(),
        items: input.items || [],
      };
    }

    await ChecklistRepository.saveChecklist(checklist);

    if (!options?.skipEvents) {
      emitStateChange("checklists_changed", options?.source);
    }

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    return checklist;
  }

  /**
   * Create and persist a Resource entity.
   */
  static async createResource(
    input: Resource | ParsedProductivityItem,
    workspaceId: string = INBOX_WORKSPACE_ID,
    options?: CreateEntityOptions,
  ): Promise<Resource> {
    let resource: Resource;

    if (isParsedProductivityItem(input)) {
      resource = buildResource(input, workspaceId);
    } else {
      const targetWorkspace = input.workspaceId || workspaceId || INBOX_WORKSPACE_ID;
      resource = {
        ...input,
        workspaceId: targetWorkspace,
        createdAt: input.createdAt || Date.now(),
        updatedAt: Date.now(),
        tags: input.tags || [],
      };
    }

    await ResourceRepository.saveResource(resource);

    if (!options?.skipEvents) {
      emitStateChange("resources_changed", options?.source);
    }

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    return resource;
  }

  // ==========================================
  // MUTATIONS (Complete / Uncomplete)
  // ==========================================

  /**
   * Complete a Task.
   * Handles XP, pebbles, analytics, side effects, and state emission.
   */
  static async completeTask(
    taskId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<{ previous: Task; updated: Task } | null> {
    const tasksMap = await TaskRepository.getTasks(workspaceId);
    const task = tasksMap[taskId];
    if (!task) return null;

    if (task.status === "completed") {
      return { previous: task, updated: task }; // Already completed
    }

    const { xpAwarded } = await handleTaskXpChange(task, true);

    if (task.reminder?.notificationIds) {
      await cancelReminderIds(task.reminder.notificationIds);
    }

    const updatedTask: Task = {
      ...task,
      status: "completed",
      completedAt: Date.now(),
      updatedAt: Date.now(),
      xpAwarded,
    };

    await TaskRepository.saveTask(updatedTask);

    await earnPebble("task");
    pluginManager.dispatchTaskCompleted(updatedTask);

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    void syncWidgetData().catch(() => {});

    if (!options?.skipEvents) {
      emitStateChange("tasks_changed", options?.source);
    }

    return { previous: task, updated: updatedTask };
  }

  /**
   * Uncomplete a Task.
   */
  static async uncompleteTask(
    taskId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<{ previous: Task; updated: Task } | null> {
    const tasksMap = await TaskRepository.getTasks(workspaceId);
    const task = tasksMap[taskId];
    if (!task) return null;

    if (task.status !== "completed") {
      return { previous: task, updated: task }; // Already uncompleted
    }

    await handleTaskXpChange(task, false);
    await undoLastPebble("task");

    const updatedTask: Task = {
      ...task,
      status: "todo",
      completedAt: undefined,
      updatedAt: Date.now(),
    };

    await TaskRepository.saveTask(updatedTask);

    pluginManager.dispatchTaskUncompleted(updatedTask);

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    void syncWidgetData().catch(() => {});

    if (!options?.skipEvents) {
      emitStateChange("tasks_changed", options?.source);
    }

    return { previous: task, updated: updatedTask };
  }

  /**
   * Complete a Habit for today.
   */
  static async completeHabit(
    habitId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<{ previous: Habit; updated: Habit } | null> {
    const habitsMap = await HabitRepository.getHabits(workspaceId);
    const habit = habitsMap[habitId];
    if (!habit) return null;

    const today = getTodayDateKey();
    if (isHabitCompletedToday(habit, today)) {
      return { previous: habit, updated: habit };
    }

    const yesterday = getOffsetDateKey(1, today);

    // For XP, we mock completedToday = false
    const { xpAwardedDate } = await handleHabitXpChange(
      { ...habit, completedToday: false } as any,
      true,
      today,
    );

    let streak = habit.streak || 0;
    const completionHistory = [...(habit.completionHistory || [])];
    
    if (!completionHistory.some((e: any) => e.date === today)) {
      completionHistory.push({ date: today, completedAt: Date.now() });
    }

    // Sort completion history
    const dates = completionHistory.map((e) => e.date).sort();
    const lastDateBeforeToday = dates.length > 1 ? dates[dates.length - 2] : undefined;

    let nextStreak = 1;
    if (lastDateBeforeToday === yesterday) {
      nextStreak = (habit.streak || 0) + 1;
    }
    streak = nextStreak;

    const updatedHabit: Habit = {
      ...habit,
      completionHistory,
      streak,
      bestStreak: Math.max(habit.bestStreak || 0, streak),
      lastCompletedDate: today,
      xpAwardedDate,
      updatedAt: Date.now(),
    };

    await HabitRepository.saveHabit(updatedHabit);

    await earnPebble("habit");
    pluginManager.dispatchHabitCompleted(updatedHabit);

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    void syncWidgetData().catch(() => {});

    if (!options?.skipEvents) {
      emitStateChange("habits_changed", options?.source);
    }

    return { previous: habit, updated: updatedHabit };
  }

  /**
   * Uncomplete a Habit for today.
   */
  static async uncompleteHabit(
    habitId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<{ previous: Habit; updated: Habit } | null> {
    const habitsMap = await HabitRepository.getHabits(workspaceId);
    const habit = habitsMap[habitId];
    if (!habit) return null;

    const today = getTodayDateKey();
    if (!isHabitCompletedToday(habit, today)) {
      return { previous: habit, updated: habit };
    }

    const yesterday = getOffsetDateKey(1, today);

    // For XP, we mock completedToday = true
    const { xpAwardedDate } = await handleHabitXpChange(
      { ...habit, completedToday: true } as any,
      false,
      today,
    );

    let streak = habit.streak || 0;
    const completionHistory = (habit.completionHistory || []).filter(
      (c) => c.date !== today
    );

    streak = Math.max(0, streak - 1);

    const updatedHabit: Habit = {
      ...habit,
      completionHistory,
      streak,
      lastCompletedDate: streak > 0 ? yesterday : undefined,
      xpAwardedDate,
      updatedAt: Date.now(),
    };

    await HabitRepository.saveHabit(updatedHabit);

    await undoLastPebble("habit");

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    void syncWidgetData().catch(() => {});

    if (!options?.skipEvents) {
      emitStateChange("habits_changed", options?.source);
    }

    return { previous: habit, updated: updatedHabit };
  }

  /**
   * Toggle a Checklist item completion state.
   */
  static async toggleChecklistItem(
    checklistId: string,
    itemId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<{ previous: Checklist; updated: Checklist } | null> {
    const checklistsMap = await ChecklistRepository.getChecklists(workspaceId);
    const checklist = checklistsMap[checklistId];
    if (!checklist) return null;

    const nextItems = (checklist.items || []).map((i) =>
      i.id === itemId ? { ...i, completed: !i.completed } : i
    );

    const updatedChecklist: Checklist = {
      ...checklist,
      items: nextItems,
      updatedAt: Date.now(),
    };

    await ChecklistRepository.saveChecklist(updatedChecklist);

    if (!options?.skipEvents) {
      emitStateChange("checklists_changed", options?.source);
    }

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    return { previous: checklist, updated: updatedChecklist };
  }

  /**
   * Recover a Habit's streak by injecting a completion for yesterday.
   */
  static async recoverHabitStreak(
    habitId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<{ previous: Habit; updated: Habit } | null> {
    const habitsMap = await HabitRepository.getHabits(workspaceId);
    const habit = habitsMap[habitId];
    if (!habit) return null;

    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

    const updatedHistory = [
      ...(habit.completionHistory || []),
      { date: yesterdayKey, completedAt: Date.now() },
    ];

    const updatedHabit: Habit = {
      ...habit,
      completionHistory: updatedHistory,
      updatedAt: Date.now(),
    };

    await HabitRepository.saveHabit(updatedHabit);

    if (!options?.skipEvents) {
      emitStateChange("habits_changed", options?.source);
      emitStateChange("pebbles_changed", options?.source);
    }

    return { previous: habit, updated: updatedHabit };
  }
}
