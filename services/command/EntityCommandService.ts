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
   * Update an existing Task.
   * Modifies task fields and intelligently reschedules reminders only if relevant state changed.
   */
  static async updateTask(
    taskId: string,
    workspaceId: string,
    updates: Partial<Task>,
    options?: CreateEntityOptions,
  ): Promise<Task> {
    const tasksMap = await TaskRepository.getTasks(workspaceId);
    const existing = tasksMap[taskId];
    if (!existing) {
      throw new Error(`Task ${taskId} not found in workspace ${workspaceId}`);
    }

    if (updates.workspaceId && updates.workspaceId !== workspaceId) {
      throw new Error("Workspace movement is not supported in updateTask.");
    }

    let updatedTask: Task = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      workspaceId: existing.workspaceId,
      updatedAt: Date.now(),
    };

    // Reminder evaluation
    const titleChanged = updates.title !== undefined && updates.title !== existing.title;
    const categoryChanged = updates.categoryId !== undefined && updates.categoryId !== existing.categoryId;
    const recurrenceChanged = updates.recurrence !== undefined && JSON.stringify(updates.recurrence) !== JSON.stringify(existing.recurrence);
    const reminderChanged = updates.reminder !== undefined && JSON.stringify(updates.reminder) !== JSON.stringify(existing.reminder);
    const statusChanged = updates.status !== undefined && updates.status !== existing.status;
    const scheduleChanged = updates.schedule !== undefined && JSON.stringify(updates.schedule) !== JSON.stringify(existing.schedule);
    const archivedChanged = ("archivedAt" in updates) && updates.archivedAt !== existing.archivedAt;

    const needsReminderUpdate = titleChanged || categoryChanged || recurrenceChanged || reminderChanged || statusChanged || scheduleChanged || archivedChanged;

    if (needsReminderUpdate) {
      // 1. Cancel existing
      if (existing.reminder?.notificationIds?.length) {
        await cancelReminderIds(existing.reminder.notificationIds);
      }
      
      // 2. Reschedule if still applicable
      const isArchived = !!updatedTask.archivedAt;
      const isCompleted = updatedTask.status === "completed";

      if (!isArchived && !isCompleted) {
        try {
          const rescheduled = await rescheduleTodoReminders(updatedTask);
          updatedTask = {
            ...updatedTask,
            reminder: rescheduled.reminder,
          };
        } catch (e) {
          console.warn("[EntityCommandService] Failed to reschedule task reminder during update:", e);
        }
      } else if (isArchived) {
        // Clear reminder IDs explicitly if archived
        if (updatedTask.reminder) {
          updatedTask = {
            ...updatedTask,
            reminder: { ...updatedTask.reminder, notificationIds: undefined },
          };
        }
      }
    }

    await TaskRepository.saveTask(updatedTask);

    if (!options?.skipEvents) {
      emitStateChange("tasks_changed", options?.source);
    }

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    void syncWidgetData().catch(() => {});

    return updatedTask;
  }

  /**
   * Move a Task from one workspace to another.
   * Modifies only the workspaceId and updatedAt.
   * Performs the correct sequence of save and delete to persist the move safely.
   */
  static async moveTask(
    taskId: string,
    sourceWorkspaceId: string,
    targetWorkspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<Task> {
    if (sourceWorkspaceId === targetWorkspaceId) {
      const tasksMap = await TaskRepository.getTasks(sourceWorkspaceId);
      const existing = tasksMap[taskId];
      if (!existing) {
        throw new Error(`Task ${taskId} not found in workspace ${sourceWorkspaceId}`);
      }
      return existing; // Nothing to do
    }

    const tasksMap = await TaskRepository.getTasks(sourceWorkspaceId);
    const existing = tasksMap[taskId];
    if (!existing) {
      throw new Error(`Task ${taskId} not found in workspace ${sourceWorkspaceId}`);
    }

    const movedTask: Task = {
      ...existing,
      workspaceId: targetWorkspaceId,
      updatedAt: Date.now(),
    };

    // Save in new workspace first to avoid data loss
    await TaskRepository.saveTask(movedTask);
    // Then delete from old workspace
    await TaskRepository.deleteTask(taskId, sourceWorkspaceId);

    if (!options?.skipEvents) {
      emitStateChange("tasks_changed", options?.source);
    }

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    void syncWidgetData().catch(() => {});

    return movedTask;
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

  // ─── BATCH 3: RECYCLE TASK ──────────────────────────────────────────────────

  /**
   * Batch 3: recycleTask
   *
   * Safely moves a Task from active storage (TaskRepository) to the RecycleBin,
   * while cancelling any associated native OS reminders.
   *
   * Ordering:
   * 1. Load task from source workspace
   * 2. Verify existence
   * 3. Snapshot task & save to RecycleBinRepository
   * 4. Cancel native reminders
   * 5. Delete from TaskRepository
   * 6. Emit events & analytics
   */
  static async recycleTask(
    taskId: string,
    workspaceId: string,
    originalWorkspaceName: string,
    options?: { skipEvents?: boolean; skipAnalytics?: boolean; source?: string }
  ): Promise<void> {
    const { addToRecycleBin } = await import("@/services/storage/storage.service");
    const { cancelReminderIds } = await import("@/services/scheduling/reminders.service");
    const { emitStateChange } = await import("@/services/events/state-events");

    // 1. Verify existence
    const tasksMap = await TaskRepository.getTasks(workspaceId);
    const task = tasksMap[taskId];
    if (!task) {
      throw new Error(
        `[EntityCommandService] Task ${taskId} not found in workspace ${workspaceId}`
      );
    }

    // 2. Snapshot task into Recycle Bin (Safe operation first)
    await addToRecycleBin("task", task, originalWorkspaceName, { throwOnError: true });

    // 3. Cancel native reminders
    if (task.reminder?.notificationIds && task.reminder.notificationIds.length > 0) {
      await cancelReminderIds(task.reminder.notificationIds, { throwOnError: true });
    }

    // 4. Remove from active storage
    await TaskRepository.deleteTask(taskId, workspaceId);

    // 5. Emit events
    if (!options?.skipEvents) {
      emitStateChange("tasks_changed", options?.source);
    }

    // 6. Analytics
    if (!options?.skipAnalytics) {
      const { recordDailyHistorySnapshot } = await import("@/services/analytics/productivity-history.service");
      void recordDailyHistorySnapshot().catch(() => {});
    }
  }

  /**
   * Batch 5: bulk Task recycling
   *
   * Safely moves multiple Tasks from active storage (TaskRepository) to the RecycleBin,
   * while cancelling any associated native OS reminders.
   */
  static async recycleTasks(
    items: { taskId: string; workspaceId: string }[],
    options?: {
      originalWorkspaceName?: string;
      skipEvents?: boolean;
      skipAnalytics?: boolean;
      source?: string;
    }
  ): Promise<{ recycledCount: number }> {
    const { getRecycleBinItems, saveRecycleBinItems } = await import("@/repositories/RecycleBinRepository").then(m => m.RecycleBinRepository);
    const { cancelReminderIds } = await import("@/services/scheduling/reminders.service");
    const { emitStateChange } = await import("@/services/events/state-events");

    // Group items by workspaceId
    const itemsByWorkspace = new Map<string, Set<string>>();
    for (const item of items) {
      if (!itemsByWorkspace.has(item.workspaceId)) {
        itemsByWorkspace.set(item.workspaceId, new Set<string>());
      }
      itemsByWorkspace.get(item.workspaceId)!.add(item.taskId);
    }

    const validTasksToRecycle: Task[] = [];
    const workspaceTasksMap = new Map<string, Record<string, Task>>();

    // 1. Load active tasks and validate existence
    for (const [workspaceId, taskIds] of itemsByWorkspace.entries()) {
      const activeTasks = await TaskRepository.getTasks(workspaceId);
      workspaceTasksMap.set(workspaceId, activeTasks);

      for (const taskId of taskIds) {
        const task = activeTasks[taskId];
        if (task) {
          validTasksToRecycle.push(task);
        }
      }
    }

    if (validTasksToRecycle.length === 0) {
      return { recycledCount: 0 };
    }

    // 2. Atomic RecycleBin snapshot
    const existingRecycleBinItems = await getRecycleBinItems();
    const newSnapshots = validTasksToRecycle.map(task => {
      const entityId = task.id;
      return {
        id: `rb-${entityId}`,
        entityType: "task" as const,
        entityId,
        snapshot: JSON.stringify(task),
        deletedAt: Date.now(),
      };
    });

    const validEntityIds = new Set(validTasksToRecycle.map(t => t.id));
    const filteredExisting = existingRecycleBinItems.filter(
      item => !validEntityIds.has(item.entityId) && !validEntityIds.has(item.id)
    );

    await saveRecycleBinItems([...newSnapshots, ...filteredExisting], { throwOnError: true });

    // 3. Batch cancel reminders
    const allNotificationIds: string[] = [];
    for (const task of validTasksToRecycle) {
      if (task.reminder?.notificationIds && task.reminder.notificationIds.length > 0) {
        allNotificationIds.push(...task.reminder.notificationIds);
      }
    }

    if (allNotificationIds.length > 0) {
      await cancelReminderIds(allNotificationIds, { throwOnError: true });
    }

    // 4. Remove from active storage and save per workspace
    for (const [workspaceId, activeTasks] of workspaceTasksMap.entries()) {
      const targetIds = Array.from(itemsByWorkspace.get(workspaceId) || []);
      const idsToDelete = targetIds.filter(id => activeTasks[id]);
      if (idsToDelete.length > 0) {
        await TaskRepository.deleteTasks(idsToDelete, workspaceId);
      }
    }

    // 5. Emit events
    if (!options?.skipEvents) {
      emitStateChange("tasks_changed", options?.source);
    }

    // 6. Analytics
    if (!options?.skipAnalytics) {
      const { recordDailyHistorySnapshot } = await import("@/services/analytics/productivity-history.service");
      void recordDailyHistorySnapshot().catch(() => {});
    }

    return { recycledCount: validTasksToRecycle.length };
  }

  // ─── BATCH 4: PERMANENTLY DELETE TASK ───────────────────────────────────────

  /**
   * Batch 4: permanentlyDeleteTask
   *
   * Permanently destroys an ACTIVE TaskRepository task.
   * This is NOT for recycle bin items.
   *
   * Ordering:
   * 1. Load task from source workspace
   * 2. Verify existence
   * 3. Cancel native reminders
   * 4. Delete from TaskRepository
   * 5. Emit events & analytics
   */
  static async permanentlyDeleteTask(
    taskId: string,
    workspaceId: string,
    options?: { skipEvents?: boolean; skipAnalytics?: boolean; source?: string }
  ): Promise<void> {
    const { cancelReminderIds } = await import("@/services/scheduling/reminders.service");
    const { emitStateChange } = await import("@/services/events/state-events");

    // 1. Verify existence
    const tasksMap = await TaskRepository.getTasks(workspaceId);
    const task = tasksMap[taskId];
    if (!task) {
      throw new Error(
        `[EntityCommandService] Task ${taskId} not found in workspace ${workspaceId}`
      );
    }

    // 2. Cancel native reminders
    if (task.reminder?.notificationIds && task.reminder.notificationIds.length > 0) {
      await cancelReminderIds(task.reminder.notificationIds);
    }

    // 3. Remove from active storage
    await TaskRepository.deleteTask(taskId, workspaceId);

    // 4. Emit events
    if (!options?.skipEvents) {
      emitStateChange("tasks_changed", options?.source);
    }

    // 5. Analytics
    // Preserve existing analytics behavior: Currently there are no explicit
    // analytics tracks for permanent deletion of tasks in archive.tsx,
    // so we skip if not asked, or we can use recordDailyHistorySnapshot
    if (!options?.skipAnalytics) {
      const { recordDailyHistorySnapshot } = await import("@/services/analytics/productivity-history.service");
      void recordDailyHistorySnapshot().catch(() => {});
    }
  }

  // ─── BATCH 7D: RESTORE TASK ──────────────────────────────────────────────────

  /**
   * Batch 7D: restoreTask
   *
   * Restores a single Task from the RecycleBin back into the active TaskRepository.
   *
   * Ordering:
   * 1. Read RecycleBin snapshot.
   * 2. Parse/validate Task.
   * 3. Remove stale notificationIds from the in-memory Task.
   * 4. Attempt to reschedule reminders and obtain fresh IDs where possible.
   * 5. Persist Task to TaskRepository.
   * 6. ONLY AFTER successful Task persistence, remove the recycle-bin item.
   * 7. Emit events / analytics / widgets.
   */
  static async restoreTask(
    recycleBinItemId: string,
    options?: CreateEntityOptions
  ): Promise<Task> {
    const { getRecycleBinItems, saveRecycleBinItems } = await import("@/services/storage/storage.service");
    const { rescheduleTodoReminders } = await import("@/services/scheduling/reminders.service");
    const { emitStateChange } = await import("@/services/events/state-events");

    // 1. Load recycle-bin item
    const binItems = await getRecycleBinItems();
    const item = binItems.find((i) => i.id === recycleBinItemId);
    if (!item) {
      throw new Error(`[EntityCommandService] RecycleBin item ${recycleBinItemId} not found.`);
    }

    // 3. Verify it's a task
    if (item.entityType !== "task") {
      throw new Error(`[EntityCommandService] Cannot restore non-task entity (${item.entityType}) via restoreTask.`);
    }

    // 4. Parse snapshot
    let parsedTask: Task;
    try {
      parsedTask = JSON.parse(item.snapshot);
    } catch (e) {
      throw new Error(`[EntityCommandService] Failed to parse RecycleBin snapshot for item ${recycleBinItemId}`);
    }

    // 5. Basic validation
    if (!parsedTask || !parsedTask.id || !parsedTask.workspaceId) {
      throw new Error(`[EntityCommandService] Parsed Task is missing required fields (id or workspaceId).`);
    }

    // 6. Notification Safety (Remove stale IDs)
    if (parsedTask.reminder && parsedTask.reminder.notificationIds) {
      parsedTask.reminder = { ...parsedTask.reminder, notificationIds: undefined };
    }

    // 7. Reschedule reminders (Tolerance: do not fail restoration on reminder error)
    let taskToSave = parsedTask;
    if (parsedTask.reminder && parsedTask.reminder.enabled && parsedTask.reminder.triggerAt) {
      try {
        taskToSave = await rescheduleTodoReminders(parsedTask);
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to reschedule reminders during restore of Task ${parsedTask.id}. Task will be restored without active native notifications.`, e);
        // Leave taskToSave as parsedTask (with notificationIds already stripped)
      }
    }

    // 8. Persist to active storage (Throws on failure, bin untouched)
    await TaskRepository.saveTask(taskToSave);

    // 9. Safely remove from Recycle Bin ONLY AFTER successful active persistence
    try {
      const remainingBinItems = binItems.filter((i) => i.id !== recycleBinItemId);
      await saveRecycleBinItems(remainingBinItems);
    } catch (e) {
      console.warn(`[EntityCommandService] Task ${parsedTask.id} was successfully restored, but failed to remove item ${recycleBinItemId} from Recycle Bin. Duplicate state may exist.`, e);
    }

    // 10. Emit events
    if (!options?.skipEvents) {
      emitStateChange("tasks_changed", options?.source);
    }

    // 11. Analytics & Widget sync
    // 11. Analytics & Widget sync
    if (!options?.skipAnalytics) {
      const { recordDailyHistorySnapshot } = await import("@/services/analytics/productivity-history.service");
      void recordDailyHistorySnapshot().catch(() => {});
    }
    void syncWidgetData().catch(() => {});

    return taskToSave;
  }

  /**
   * Batch 7E: restoreTasks
   *
   * Bulk restores multiple Tasks from the RecycleBin back into the active TaskRepository.
   *
   * Ordering:
   * 1. Separate valid Task items from input array.
   * 2. Parse/validate each Task and verify workspaceId.
   * 3. Remove stale notificationIds before rescheduling.
   * 4. Sequentially reschedule reminders (tolerating failures).
   * 5. Group by workspaceId.
   * 6. Batch persist per workspace.
   * 7. Return IDs of successfully persisted tasks so the caller can remove them from the Recycle Bin.
   */
  static async restoreTasks(
    itemsToRestore: any[],
    options?: CreateEntityOptions
  ): Promise<{ restoredCount: number; successfulItemIds: string[]; failedItemIds: string[] }> {
    const { rescheduleTodoReminders } = await import("@/services/scheduling/reminders.service");
    const { emitStateChange } = await import("@/services/events/state-events");
    const { WorkspaceRepository } = await import("@/repositories");

    const workspaces = await WorkspaceRepository.getWorkspaces();
    const validWorkspaceIds = new Set(workspaces.map((w) => w.id));

    const tasksByWorkspace = new Map<string, { task: Task; itemId: string }[]>();
    const successfulItemIds: string[] = [];
    const failedItemIds: string[] = [];

    // 1. Parse and group valid tasks
    for (const item of itemsToRestore) {
      if (item.entityType !== "task") continue;

      let parsedTask: Task;
      try {
        parsedTask = JSON.parse(item.snapshot);
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to parse snapshot for item ${item.id}`);
        failedItemIds.push(item.id);
        continue;
      }

      if (!parsedTask || !parsedTask.id) {
        failedItemIds.push(item.id);
        continue;
      }

      let workspaceId = parsedTask.workspaceId || "inbox";
      if (!validWorkspaceIds.has(workspaceId)) {
        workspaceId = "inbox";
        parsedTask.workspaceId = "inbox";
      }

      if (parsedTask.reminder && parsedTask.reminder.notificationIds) {
        parsedTask.reminder = { ...parsedTask.reminder, notificationIds: undefined };
      }

      let taskToSave = parsedTask;
      if (parsedTask.reminder && parsedTask.reminder.enabled && parsedTask.reminder.triggerAt) {
        try {
          taskToSave = await rescheduleTodoReminders(parsedTask);
        } catch (e) {
          console.warn(`[EntityCommandService] Failed to reschedule reminders for Task ${parsedTask.id}`, e);
        }
      }

      if (!tasksByWorkspace.has(workspaceId)) {
        tasksByWorkspace.set(workspaceId, []);
      }
      tasksByWorkspace.get(workspaceId)!.push({ task: taskToSave, itemId: item.id });
    }

    // 2. Batch save per workspace
    let restoredCount = 0;
    for (const [workspaceId, wrappedTasks] of tasksByWorkspace.entries()) {
      try {
        const tasks = wrappedTasks.map((w) => w.task);
        await TaskRepository.saveTasks(tasks, workspaceId);
        restoredCount += tasks.length;
        successfulItemIds.push(...wrappedTasks.map((w) => w.itemId));
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to batch save tasks in workspace ${workspaceId}`, e);
        failedItemIds.push(...wrappedTasks.map((w) => w.itemId));
      }
    }

    // 3. Side effects
    if (restoredCount > 0 && !options?.skipEvents) {
      emitStateChange("tasks_changed", options?.source);
    }
    if (restoredCount > 0 && !options?.skipAnalytics) {
      const { recordDailyHistorySnapshot } = await import("@/services/analytics/productivity-history.service");
      void recordDailyHistorySnapshot().catch(() => {});
    }
    if (restoredCount > 0) {
      void syncWidgetData().catch(() => {});
    }

    return { restoredCount, successfulItemIds, failedItemIds };
  }
}
