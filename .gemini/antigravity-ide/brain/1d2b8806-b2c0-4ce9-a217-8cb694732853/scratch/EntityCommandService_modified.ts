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

import { earnPebble, reversePebbleReward } from "@/features/profile/services/pebble.service";
import { GraphRepository } from "@/repositories/GraphRepository";
import { MoveJournalRepository } from "@/repositories/MoveJournalRepository";
import { generateId } from "@/shared/utils/id";
import { pluginManager } from "@/plugin";
import {
  getTodayDateKey,
  getOffsetDateKey,
  isHabitCompletedToday,
  getHabitCurrentStreak,
  getHabitBestStreak,
  getHabitLastCompletedDate,
} from "@/shared/utils/domain-selectors";
import {
  type Task,
  type Habit,
  type Checklist,
  type Resource,
  type Workspace,
  type RecycleBinItem,
  type MoveJournalEntry,
  INBOX_WORKSPACE_ID,
  MY_PEBBLES_WORKSPACE_ID,
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
 * Restore a snapshot-only (non-task, non-habit) entity from the Recycle Bin.
 *
 * Shared by restoreChecklist / restoreResource, which both follow the
 * identical sequence: resolve the bin item by ID, validate its entity type,
 * parse the snapshot, persist the entity, remove the bin entry, then emit the
 * entity's change event.
 *
 * Tasks and Habits are deliberately NOT routed through here: restoring them
 * additionally requires reminder rescheduling and fresh notification IDs, so
 * they keep their own restore commands (restoreTask / restoreHabit).
 * Workspaces are also excluded: their bin snapshot is a `{ list, todos,
 * habits }` package that must be unwrapped (see restoreWorkspace).
 */
async function restoreEntityFromBin<T>(
  recycleBinItemId: string,
  entityType: RecycleBinItem["entityType"],
  eventName: "checklists_changed" | "resources_changed" | "workspace_mode_changed",
  options: CreateEntityOptions | undefined,
  persist: (entity: T) => Promise<void>,
  rollback: (entity: T) => Promise<void>,
): Promise<T> {
  const { getRecycleBinItems, saveRecycleBinItems } = await import("@/services/storage/storage.service");
  const { emitStateChange } = await import("@/services/events/state-events");

  const binItems = await getRecycleBinItems();
  const item = binItems.find((i) => i.id === recycleBinItemId);
  if (!item || item.entityType !== entityType) {
    throw new Error(`RecycleBin item not found or not ${entityType}`);
  }

  const parsedData = JSON.parse(item.snapshot) as T & { workspaceId?: string };
  const targetWorkspaceId = parsedData.workspaceId || "inbox";
  const { generateId } = await import("@/shared/utils/id");
  const { MoveJournalRepository } = await import("@/repositories/MoveJournalRepository");
  const operationId = `restore-${generateId()}`;
  
  await MoveJournalRepository.addOperation({
    operationId,
    operationType: "restore",
    entityId: item.entityId,
    entityType,
    sourceWorkspaceId: targetWorkspaceId,
    targetWorkspaceId,
    timestamp: Date.now(),
  });

  await persist(parsedData);

  try {
    const remainingBinItems = binItems.filter((i) => i.id !== recycleBinItemId);
    await saveRecycleBinItems(remainingBinItems, { throwOnError: true });
  } catch (e) {
    console.warn(`[EntityCommandService] Failed to remove entity from Recycle Bin after restore. Recycle Bin contains a ghost.`, e);
  }

  await MoveJournalRepository.removeOperation(operationId);

  if (!options?.skipEvents) emitStateChange(eventName, options?.source);
  return parsedData;
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
   * Create and persist a Workspace entity.
   */
  static async createWorkspace(workspace: Workspace): Promise<void> {
    try {
      await WorkspaceRepository.saveWorkspace(workspace);
      emitStateChange("workspace_changed", "tasks_screen");
    } catch (e) {
      console.warn("Failed to create workspace", e);
      throw e;
    }
  }

  /**
   * Update and persist a Workspace entity (e.g. rename workspace).
   */
  static async updateWorkspace(workspace: Workspace): Promise<void> {
    try {
      await WorkspaceRepository.saveWorkspace(workspace);
      emitStateChange("workspace_changed", "tasks_screen");
    } catch (e) {
      console.warn("Failed to update workspace", e);
      throw e;
    }
  }

  /**
   * Delete a Workspace entity and gracefully fallback active/selected states.
   * Note: The UI handles cascading deletes or moves of items inside the workspace.
   */
  static async deleteWorkspace(workspaceId: string): Promise<void> {
    try {
      if (workspaceId === INBOX_WORKSPACE_ID || workspaceId === MY_PEBBLES_WORKSPACE_ID) {
        throw new Error("Cannot delete protected workspace.");
      }

      const { withLock } = await import("@/shared/utils/mutex");
      await withLock(`ws_lifecycle_${workspaceId}`, async () => {
        // 1. Fetch complete workspace snapshot
        const workspaces = await WorkspaceRepository.getWorkspaces();
      const workspace = workspaces.find((w) => w.id === workspaceId);
      if (!workspace) throw new Error("Workspace not found");

      const { TaskRepository } = await import("@/repositories/TaskRepository");
      const { HabitRepository } = await import("@/repositories/HabitRepository");
      const { ChecklistRepository } = await import("@/repositories/ChecklistRepository");
      const { ResourceRepository } = await import("@/repositories/ResourceRepository");
      const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
      const { cancelReminderIds } = await import("@/services/scheduling/reminders.service");

      const todosMap = await TaskRepository.getTasks(workspaceId);
      const habitsMap = await HabitRepository.getHabits(workspaceId);
      const checklistsMap = await ChecklistRepository.getChecklists(workspaceId);
      const resourcesMap = await ResourceRepository.getResources(workspaceId);

      const todos = Object.values(todosMap);
      const habits = Object.values(habitsMap);
      const checklists = Object.values(checklistsMap);
      const resources = Object.values(resourcesMap);

      // 3. Add to Recycle Bin (Safe operation first)
      await RecycleBinRepository.addToRecycleBin(
        "workspace",
        {
          list: workspace,
          todos,
          habits,
          checklists,
          resources,
        },
        "Workspaces",
        { throwOnError: true }
      );

      // 4. Delete Workspace record (Commit Point)
      await WorkspaceRepository.deleteWorkspace(workspaceId, { throwOnError: true });

      // 5. Async Cleanup (Fire and forget)
      const cleanup = async () => {
        try {
          // 5a. Delete graph relationships
          const allEntityIds = [
            ...todos.map(t => t.id),
            ...habits.map(h => h.id),
            ...checklists.map(c => c.id),
            ...resources.map(r => r.id),
          ];
          if (allEntityIds.length > 0) {
            await GraphRepository.deleteRelationshipsForEntities(allEntityIds);
          }

          // 5b. Remove active partitions
          const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
          await AsyncStorage.multiRemove([
            `pebble:v1:tasks:${workspaceId}`,
            `pebble:v1:habits:${workspaceId}`,
            `pebble:v1:checklists:${workspaceId}`,
            `pebble:v1:resources:${workspaceId}`,
          ]);

          // 5c. Cancel notifications
          const notificationIdsToCancel: string[] = [];
          for (const todo of todos) {
            if (todo.reminder?.notificationIds) {
              notificationIdsToCancel.push(...todo.reminder.notificationIds);
            }
          }
          for (const habit of habits) {
            if (habit.reminder?.notificationIds) {
              notificationIdsToCancel.push(...habit.reminder.notificationIds);
            }
          }
          if (notificationIdsToCancel.length > 0) {
            await cancelReminderIds(notificationIdsToCancel, { throwOnError: false });
          }
        } catch (e) {
          console.warn(`[EntityCommandService] Async cleanup failed after deleting Workspace ${workspaceId}`, e);
          throw new Error("Workspace deleted, but some related data could not be fully cleaned up.");
        }
      };

      await cleanup();

      // 6. Emit event
      emitStateChange("workspace_changed", "tasks_screen");
      void recordDailyHistorySnapshot().catch(() => {});
      });
    } catch (e) {
      console.warn("Failed to delete workspace", e);
      throw e;
    }
  }

  /**
   * Archive a Workspace entity.
   * This is a foundation command. It marks the workspace as archived
   * but does not cascade to children. Contextual filtering of children
   * is handled by selectors.
   */
  static async archiveWorkspace(workspaceId: string): Promise<void> {
    if (workspaceId === INBOX_WORKSPACE_ID || workspaceId === MY_PEBBLES_WORKSPACE_ID) {
      throw new Error("Cannot archive protected workspace.");
    }

    const workspaces = await WorkspaceRepository.getWorkspaces();
    const workspace = workspaces.find((w) => w.id === workspaceId);
    if (!workspace) throw new Error("Workspace not found");

    if (workspace.archivedAt) {
      // Already archived, idempotent
      return;
    }

    const updated = {
      ...workspace,
      archivedAt: Date.now(),
      updatedAt: Date.now(),
    };

    await WorkspaceRepository.saveWorkspace(updated);
    emitStateChange("workspace_changed");
  }

  /**
   * Restore an archived Workspace entity.
   * Restores the workspace to active state without touching children.
   */
  static async restoreWorkspaceArchive(workspaceId: string): Promise<void> {
    const workspaces = await WorkspaceRepository.getWorkspaces();
    const workspace = workspaces.find((w) => w.id === workspaceId);
    if (!workspace) throw new Error("Workspace not found");

    if (!workspace.archivedAt) {
      // Already active, idempotent
      return;
    }

    const updated = {
      ...workspace,
      archivedAt: undefined,
      updatedAt: Date.now(),
    };

    await WorkspaceRepository.saveWorkspace(updated);
    emitStateChange("workspace_changed");
  }

  /**
   * Create and persist a Task entity.
   */
  static async createTask(
    input: Task | ParsedProductivityItem,
    workspaceId: string = INBOX_WORKSPACE_ID,
    options?: CreateEntityOptions,
  ): Promise<Task> {
    return TaskCommandHandler.createTask(input, workspaceId, options?);
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
    let needsScheduling = false;
    let parsedInput: ParsedProductivityItem | undefined;

    if (isParsedProductivityItem(input)) {
      habit = buildHabit(input, workspaceId);
      needsScheduling = true;
      parsedInput = input;
    } else {
      const targetWorkspace = input.workspaceId || workspaceId || INBOX_WORKSPACE_ID;
      habit = {
        ...input,
        workspaceId: targetWorkspace,
        createdAt: input.createdAt || Date.now(),
        updatedAt: Date.now(),
        completionHistory: [],
      };
      
      if (habit.reminder && habit.reminder.notificationIds) {
        habit.reminder.notificationIds = undefined;
      }
      if (habit.reminder?.enabled && habit.reminder?.triggerAt) {
        needsScheduling = true;
      }
    }

    // 1. Domain persistence FIRST
    await HabitRepository.saveHabit(habit);

    // 2. OS Notification Scheduling SECOND (isolated)
    if (needsScheduling) {
      try {
        if (parsedInput) {
          const notificationIds = await scheduleHabitNotifications(habit.id, parsedInput);
          if (notificationIds.length > 0 && habit.reminder) {
            habit.reminder.notificationIds = notificationIds;
            await HabitRepository.updateNotificationIds(habit.id, habit.workspaceId, notificationIds);
          }
        } else {
          // Assuming rescheduleHabitReminders behaves like rescheduleTodoReminders
          habit = await rescheduleHabitReminders(habit);
          await HabitRepository.updateNotificationIds(habit.id, habit.workspaceId, habit.reminder?.notificationIds);
        }
      } catch (e) {
        console.warn("[EntityCommandService] Failed to schedule habit reminder after persistence:", e);
      }
    }

    if (!options?.skipEvents) {
      emitStateChange("habits_changed", options?.source);
    }

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    return habit;
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
      throw new Error(`[EntityCommandService] convertTaskToHabit failed: Task ${taskId} not found in workspace ${workspaceId}`);
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
    const newHabit = await this.createHabit(habit, habit.workspaceId, {
      skipEvents: true,
      skipAnalytics: true,
    });

    // 4. Cancel Old Reminders (Fire and forget)
    if (task.reminder && task.reminder.notificationIds) {
      cancelReminderIds(task.reminder.notificationIds, { throwOnError: false }).catch(e => {
        console.warn(`[EntityCommandService] Failed to cancel old reminders during Task->Habit conversion for ${taskId}`, e);
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
      throw new Error(`[EntityCommandService] convertHabitToTask failed: Habit ${habitId} not found in workspace ${workspaceId}`);
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
    const createdTask = await this.createTask(newTask, newTask.workspaceId, {
      skipEvents: true,
      skipAnalytics: true,
    });

    // 4. Cancel Old Reminders (Fire and forget)
    if (habit.reminder && habit.reminder.notificationIds) {
      cancelReminderIds(habit.reminder.notificationIds, { throwOnError: false }).catch(e => {
        console.warn(`[EntityCommandService] Failed to cancel old reminders during Habit->Task conversion for ${habitId}`, e);
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
   * Merge new missing items into an existing Checklist entity.
   */
  static async mergeChecklistItems(
    checklistId: string,
    workspaceId: string,
    newItemsText: string[],
    options?: CreateEntityOptions,
  ): Promise<Checklist> {
    const map = await ChecklistRepository.getChecklists(workspaceId);
    const existing = map[checklistId];
    if (!existing) throw new Error(`Checklist ${checklistId} not found`);

    const normalize = (text: string) => text.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
    const existingNorms = new Set(existing.items.map(i => normalize(i.title)));

    const itemsToAdd = newItemsText
      .filter(text => {
        const norm = normalize(text);
        return norm.length > 0 && !existingNorms.has(norm);
      })
      .map(text => ({
        id: "item-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 8),
        title: text,
        completed: false,
      }));

    if (itemsToAdd.length === 0) return existing;

    const updated = {
      ...existing,
      items: [...existing.items, ...itemsToAdd],
      updatedAt: Date.now(),
    };

    await ChecklistRepository.saveChecklist(updated);

    if (!options?.skipEvents) emitStateChange("checklists_changed", options?.source);
    if (!options?.skipAnalytics) void recordDailyHistorySnapshot().catch(() => {});

    return updated;
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
  ): Promise<{
    return TaskCommandHandler.completeTask(taskId, workspaceId, options?);
  } | null> {
    const tasksMap = await TaskRepository.getTasks(workspaceId);
    const task = tasksMap[taskId];
    if (!task) return null;

    if (task.status === "completed") {
      return { previous: task, updated: task }; // Already completed
    }


    if (task.reminder?.notificationIds) {
      cancelReminderIds(task.reminder.notificationIds, { throwOnError: false }).catch(e => {
        console.warn(`[EntityCommandService] Failed to cancel reminders for completed task ${taskId}`, e);
      });
    }

    const updatedTask: Task = {
      ...task,
      status: "completed",
      completedAt: Date.now(),
      updatedAt: Date.now(),
    };

    await TaskRepository.saveTask(updatedTask);

    await earnPebble("task", `task:${task.id}`);
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
  ): Promise<{
    return TaskCommandHandler.uncompleteTask(taskId, workspaceId, options?);
  } | null> {
    const tasksMap = await TaskRepository.getTasks(workspaceId);
    const task = tasksMap[taskId];
    if (!task) return null;

    if (task.status !== "completed") {
      return { previous: task, updated: task }; // Already uncompleted
    }

    await reversePebbleReward(`task:${task.id}`);

    let updatedTask: Task = {
      ...task,
      status: "todo",
      completedAt: undefined,
      updatedAt: Date.now(),
    };
    if (updatedTask.reminder && updatedTask.reminder.notificationIds) {
      updatedTask.reminder.notificationIds = undefined; // Strip so reconciler uses fresh IDs
    }

    // 1. Domain persistence FIRST
    await TaskRepository.saveTask(updatedTask);

    // 2. OS Notification Scheduling SECOND (isolated)
    try {
      // If the task has an enabled reminder in the future, it must be re-scheduled
      // because completeTask previously cancelled it.
      const finalTask = await rescheduleTodoReminders(updatedTask);
      await TaskRepository.updateNotificationIds(finalTask.id, finalTask.workspaceId, finalTask.reminder?.notificationIds);
      updatedTask = finalTask;
    } catch (e) {
      console.warn("[EntityCommandService] Failed to reschedule reminders after uncomplete", e);
    }

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
    return TaskCommandHandler.updateTask(taskId, workspaceId, updates, options?);
  }

  /**
   * Update an existing Habit.
   * Modifies habit fields and intelligently reschedules reminders only if relevant state changed.
   */
  static async updateHabit(
    habitId: string,
    workspaceId: string,
    updates: Partial<Habit>,
    options?: CreateEntityOptions,
  ): Promise<Habit> {
    const habitsMap = await HabitRepository.getHabits(workspaceId);
    const existing = habitsMap[habitId];
    if (!existing) {
      throw new Error(`Habit ${habitId} not found in workspace ${workspaceId}`);
    }

    if (updates.workspaceId && updates.workspaceId !== workspaceId) {
      throw new Error("Workspace movement is not supported in updateHabit.");
    }

    let updatedHabit: Habit = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    const titleChanged = updates.title !== undefined && updates.title !== existing.title;
    const categoryChanged = updates.categoryId !== undefined && updates.categoryId !== existing.categoryId;
    const recurrenceChanged = updates.recurrence !== undefined && JSON.stringify(updates.recurrence) !== JSON.stringify(existing.recurrence);
    const reminderChanged = updates.reminder !== undefined && JSON.stringify(updates.reminder) !== JSON.stringify(existing.reminder);
    const archivedChanged = ("archivedAt" in updates) && updates.archivedAt !== existing.archivedAt;

    const needsReminderUpdate = titleChanged || categoryChanged || recurrenceChanged || reminderChanged || archivedChanged;

    if (needsReminderUpdate && updatedHabit.reminder && updatedHabit.reminder.notificationIds) {
      updatedHabit.reminder = { ...updatedHabit.reminder, notificationIds: undefined }; // Strip so reconciler uses fresh IDs
    }

    // 1. Domain persistence FIRST
    await HabitRepository.saveHabit(updatedHabit);

    // 2. OS Notification Scheduling SECOND (isolated)
    if (needsReminderUpdate) {
      // Fire and forget cancel existing
      if (existing.reminder?.notificationIds?.length) {
        cancelReminderIds(existing.reminder.notificationIds, { throwOnError: false }).catch(e => {
          console.warn("[EntityCommandService] Failed to cancel old reminder IDs during habit update", e);
        });
      }
      
      // Reschedule if still applicable
      const isArchived = !!updatedHabit.archivedAt;

      if (!isArchived) {
        try {
          updatedHabit = await rescheduleHabitReminders(updatedHabit);
          await HabitRepository.updateNotificationIds(updatedHabit.id, updatedHabit.workspaceId, updatedHabit.reminder?.notificationIds);
        } catch (e) {
          console.warn("[EntityCommandService] Failed to reschedule habit reminder during update:", e);
        }
      }
    }

    if (!options?.skipEvents) {
      emitStateChange("habits_changed", options?.source);
    }

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    return updatedHabit;
  }

  // ─── BATCH: BULK COMPLETE / ARCHIVE ──────────────────────────────────────────
  // Bulk variants of the single-item commands so the Tasks screen bulk-select
  // actions produce the same lifecycle side effects (pebble rewards, reminder
  // cancellation, plugin events, analytics, widget sync) as their single-item
  // counterparts. Events/analytics are consolidated into a single emission per
  // batch; per-item side effects (rewards, plugins, reminders) stay per-item.

  /**
   * Bulk-complete Tasks with the same side effects as completeTask.
   */
  static async completeTasks(
    items: {
    return TaskCommandHandler.completeTasks();
  }[],
    options?: CreateEntityOptions,
  ): Promise<Task[]> {
    const updated: Task[] = [];
    for (const item of items) {
      const result = await this.completeTask(item.taskId, item.workspaceId, {
        source: options?.source,
        skipEvents: true,
        skipAnalytics: true,
      });
      if (result) updated.push(result.updated);
    }
    if (updated.length > 0) {
      if (!options?.skipAnalytics) {
        void recordDailyHistorySnapshot().catch(() => {});
      }
      // Widget sync already fires per item inside completeTask.
      if (!options?.skipEvents) {
        emitStateChange("tasks_changed", options?.source);
      }
    }
    return updated;
  }

  /**
   * Bulk-complete Habits for today with the same side effects as completeHabit.
   */
  static async completeHabits(
    items: { habitId: string; workspaceId: string }[],
    options?: CreateEntityOptions,
  ): Promise<Habit[]> {
    const updated: Habit[] = [];
    for (const item of items) {
      const result = await this.completeHabit(item.habitId, item.workspaceId, {
        source: options?.source,
        skipEvents: true,
        skipAnalytics: true,
      });
      if (result) updated.push(result.updated);
    }
    if (updated.length > 0) {
      if (!options?.skipAnalytics) {
        void recordDailyHistorySnapshot().catch(() => {});
      }
      // Widget sync already fires per item inside completeHabit.
      if (!options?.skipEvents) {
        emitStateChange("habits_changed", options?.source);
      }
    }
    return updated;
  }

  /**
   * Bulk-archive Tasks with the same side effects as updateTask({ archivedAt }) —
   * reminder cancellation + notification-ID clearing, events and analytics.
   */
  static async archiveTasks(
    items: {
    return TaskCommandHandler.archiveTasks();
  }[],
    options?: CreateEntityOptions,
  ): Promise<Task[]> {
    const updated: Task[] = [];
    for (const item of items) {
      const task = await this.updateTask(
        item.taskId,
        item.workspaceId,
        { archivedAt: Date.now(), updatedAt: Date.now() },
        { source: options?.source, skipEvents: true, skipAnalytics: true },
      );
      updated.push(task);
    }
    if (updated.length > 0) {
      if (!options?.skipAnalytics) {
        void recordDailyHistorySnapshot().catch(() => {});
      }
      // Widget sync already fires per item inside updateTask.
      if (!options?.skipEvents) {
        emitStateChange("tasks_changed", options?.source);
      }
    }
    return updated;
  }

  /**
   * Bulk-archive Habits with the same side effects as updateHabit({ archivedAt }) —
   * reminder cancellation + notification-ID clearing, events and analytics.
   */
  static async archiveHabits(
    items: { habitId: string; workspaceId: string }[],
    options?: CreateEntityOptions,
  ): Promise<Habit[]> {
    const updated: Habit[] = [];
    for (const item of items) {
      const habit = await this.updateHabit(
        item.habitId,
        item.workspaceId,
        { archivedAt: Date.now(), updatedAt: Date.now() },
        { source: options?.source, skipEvents: true, skipAnalytics: true },
      );
      updated.push(habit);
    }
    if (updated.length > 0) {
      if (!options?.skipAnalytics) {
        void recordDailyHistorySnapshot().catch(() => {});
      }
      if (!options?.skipEvents) {
        emitStateChange("habits_changed", options?.source);
      }
    }
    return updated;
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
    return TaskCommandHandler.moveTask(taskId, sourceWorkspaceId, targetWorkspaceId, options?);
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

    const completionHistory = [...(habit.completionHistory || [])];
    if (!completionHistory.some((e: any) => e.date === today)) {
      completionHistory.push({ date: today, completedAt: Date.now() });
    }

    const tempHabit: Habit = { ...habit, completionHistory };
    const streak = getHabitCurrentStreak(tempHabit, today);
    const bestStreak = Math.max(habit.bestStreak || 0, getHabitBestStreak(tempHabit));

    const updatedHabit: Habit = {
      ...habit,
      completionHistory,
      streak,
      bestStreak,
      lastCompletedDate: today,
      updatedAt: Date.now(),
    };

    await HabitRepository.saveHabit(updatedHabit);

    await earnPebble("habit", `habit:${habit.id}:${today}`);
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

    const completionHistory = (habit.completionHistory || []).filter(
      (c) => c.date !== today
    );

    const tempHabit: Habit = { ...habit, completionHistory };
    const streak = getHabitCurrentStreak(tempHabit, today);
    const lastCompletedDate = getHabitLastCompletedDate(tempHabit);

    const updatedHabit: Habit = {
      ...habit,
      completionHistory,
      streak,
      lastCompletedDate,
      updatedAt: Date.now(),
    };

    await HabitRepository.saveHabit(updatedHabit);

    await reversePebbleReward(`habit:${habit.id}:${today}`);

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

    const wasComplete = checklist.items && checklist.items.length > 0 && checklist.items.every(i => i.completed);
    const isNowComplete = nextItems.length > 0 && nextItems.every(i => i.completed);

    const updatedChecklist: Checklist = {
      ...checklist,
      items: nextItems,
      updatedAt: Date.now(),
    };

    if (isNowComplete && !wasComplete && !checklist.pebbleAwarded) {
      updatedChecklist.pebbleAwarded = true;
      await earnPebble("checklist", `checklist:${checklist.id}`);
    }

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
   * Add an item to a Checklist.
   */
  static async addChecklistItem(
    checklistId: string,
    itemTitle: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<{ previous: Checklist; updated: Checklist } | null> {
    const checklistsMap = await ChecklistRepository.getChecklists(workspaceId);
    const checklist = checklistsMap[checklistId];
    if (!checklist) return null;

    const newItem = {
      id: `checklist-item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: itemTitle,
      completed: false,
    };

    const updatedChecklist: Checklist = {
      ...checklist,
      items: [...(checklist.items || []), newItem],
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
   * Delete an item from a Checklist.
   */
  static async deleteChecklistItem(
    checklistId: string,
    itemId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<{ previous: Checklist; updated: Checklist } | null> {
    const checklistsMap = await ChecklistRepository.getChecklists(workspaceId);
    const checklist = checklistsMap[checklistId];
    if (!checklist) return null;

    const updatedChecklist: Checklist = {
      ...checklist,
      items: (checklist.items || []).filter((i) => i.id !== itemId),
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

  static async recycleHabit(
    habitId: string,
    workspaceId: string,
    options?: { skipEvents?: boolean; skipAnalytics?: boolean; source?: string }
  ): Promise<void> {
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    const { cancelReminderIds } = await import("@/services/scheduling/reminders.service");
    
    const habitMap = await HabitRepository.getHabits(workspaceId);
    const habit = habitMap[habitId];
    if (!habit) return;

    const { generateId } = await import("@/shared/utils/id");
    const { MoveJournalRepository } = await import("@/repositories/MoveJournalRepository");
    const operationId = `recycle-${generateId()}`;
    await MoveJournalRepository.addOperation({
      operationId,
      operationType: "recycle",
      entityId: habitId,
      entityType: "habit",
      sourceWorkspaceId: workspaceId,
      targetWorkspaceId: workspaceId,
      timestamp: Date.now(),
    });

    await RecycleBinRepository.addToRecycleBin("habit", habit, workspaceId, { throwOnError: true });

    try {
      await HabitRepository.deleteHabit(habitId, workspaceId);
    } catch (e) {
      console.warn(`[EntityCommandService] Failed to delete active habit ${habitId} during recycle. Recycle bin contains a ghost.`, e);
      throw e;
    }

    await MoveJournalRepository.removeOperation(operationId);

    if (habit.reminder?.notificationIds?.length) {
      cancelReminderIds(habit.reminder.notificationIds, { throwOnError: false }).catch(e => {
        console.warn(`[EntityCommandService] Failed to cancel reminders for recycled habit ${habitId}`, e);
      });
    }

    if (!options?.skipEvents) {
      emitStateChange("habits_changed", options?.source);
    }
  }

  static async restoreHabit(
    recycleBinItemId: string,
    options?: CreateEntityOptions
  ): Promise<Habit> {
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    
    const items = await RecycleBinRepository.getRecycleBinItems();
    // Resolve by either the RecycleBin item ID ("rb-{entityId}") or the raw entity
    // ID so callers (e.g. bulk-delete Undo in useTasksState) can pass what they have.
    const item = items.find(i => i.id === recycleBinItemId || i.entityId === recycleBinItemId);
    if (!item || item.entityType !== "habit") throw new Error("Invalid habit recycle bin item");

    const habit: Habit = JSON.parse(item.snapshot);
    habit.reminder = habit.reminder ? { ...habit.reminder, notificationIds: undefined } : undefined;
    
    const targetWorkspaceId = habit.workspaceId || INBOX_WORKSPACE_ID;
    const { generateId } = await import("@/shared/utils/id");
    const { MoveJournalRepository } = await import("@/repositories/MoveJournalRepository");
    const operationId = `restore-${generateId()}`;
    
    await MoveJournalRepository.addOperation({
      operationId,
      operationType: "restore",
      entityId: item.entityId,
      entityType: "habit",
      sourceWorkspaceId: targetWorkspaceId,
      targetWorkspaceId,
      timestamp: Date.now(),
    });

    const restored = await this.createHabit(habit, targetWorkspaceId, options);
    
    try {
      const remaining = items.filter(i => i.id !== item.id);
      await RecycleBinRepository.saveRecycleBinItems(remaining, { throwOnError: true });
    } catch (e) {
      console.warn(`[EntityCommandService] Failed to remove habit from Recycle Bin after restore. Recycle Bin contains a ghost.`, e);
    }
    
    await MoveJournalRepository.removeOperation(operationId);
    
    return restored;
  }

  static async recycleChecklist(
    checklistId: string,
    workspaceId: string,
    options?: { skipEvents?: boolean; source?: string }
  ): Promise<void> {
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    const { ChecklistRepository } = await import("@/repositories/ChecklistRepository");
    
    const checklists = await ChecklistRepository.getChecklists(workspaceId);
    const checklist = checklists[checklistId];
    if (!checklist) return;

    const { generateId } = await import("@/shared/utils/id");
    const { MoveJournalRepository } = await import("@/repositories/MoveJournalRepository");
    const operationId = `recycle-${generateId()}`;
    await MoveJournalRepository.addOperation({
      operationId,
      operationType: "recycle",
      entityId: checklistId,
      entityType: "checklist",
      sourceWorkspaceId: workspaceId,
      targetWorkspaceId: workspaceId,
      timestamp: Date.now(),
    });

    await RecycleBinRepository.addToRecycleBin("checklist", checklist, workspaceId, { throwOnError: true });
    try {
      await ChecklistRepository.deleteChecklist(checklistId, workspaceId);
    } catch (e) {
      console.warn(`[EntityCommandService] Failed to delete active checklist ${checklistId} during recycle. Recycle bin contains a ghost.`, e);
      throw e;
    }
    
    await MoveJournalRepository.removeOperation(operationId);

    if (!options?.skipEvents) {
      emitStateChange("checklists_changed", options?.source);
    }
  }

  static async recycleResource(
    resourceId: string,
    workspaceId: string,
    options?: { skipEvents?: boolean; source?: string }
  ): Promise<void> {
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    const { ResourceRepository } = await import("@/repositories/ResourceRepository");
    
    const resources = await ResourceRepository.getResources(workspaceId);
    const resource = resources[resourceId];
    if (!resource) return;

    const { generateId } = await import("@/shared/utils/id");
    const { MoveJournalRepository } = await import("@/repositories/MoveJournalRepository");
    const operationId = `recycle-${generateId()}`;
    await MoveJournalRepository.addOperation({
      operationId,
      operationType: "recycle",
      entityId: resourceId,
      entityType: "resource",
      sourceWorkspaceId: workspaceId,
      targetWorkspaceId: workspaceId,
      timestamp: Date.now(),
    });

    await RecycleBinRepository.addToRecycleBin("resource", resource, workspaceId, { throwOnError: true });
    try {
      await ResourceRepository.deleteResource(resourceId, workspaceId);
    } catch (e) {
      console.warn(`[EntityCommandService] Failed to delete active resource ${resourceId} during recycle. Recycle bin contains a ghost.`, e);
      throw e;
    }

    await MoveJournalRepository.removeOperation(operationId);

    if (!options?.skipEvents) {
      emitStateChange("resources_changed", options?.source);
    }
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
    options?: {
    return TaskCommandHandler.recycleTask();
  }
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

    // 2. Add intent to MoveJournal
    const { generateId } = await import("@/shared/utils/id");
    const { MoveJournalRepository } = await import("@/repositories/MoveJournalRepository");
    const operationId = `recycle-${generateId()}`;
    await MoveJournalRepository.addOperation({
      operationId,
      operationType: "recycle",
      entityId: taskId,
      entityType: "task",
      sourceWorkspaceId: workspaceId,
      targetWorkspaceId: workspaceId,
      timestamp: Date.now(),
    });

    // 3. Snapshot task into Recycle Bin (Safe operation first)
    await addToRecycleBin("task", task, originalWorkspaceName, { throwOnError: true });

    try {
      // 4. Remove from active storage (Commit Point)
      await TaskRepository.deleteTask(taskId, workspaceId);
    } catch (e) {
      console.warn(`[EntityCommandService] Failed to delete active task ${taskId} during recycle. Recycle bin contains a ghost.`, e);
      throw e;
    }

    await MoveJournalRepository.removeOperation(operationId);

    // 4. Cancel native reminders (Fire and forget)
    if (task.reminder?.notificationIds && task.reminder.notificationIds.length > 0) {
      cancelReminderIds(task.reminder.notificationIds, { throwOnError: false }).catch(e => {
        console.warn(`[EntityCommandService] Failed to cancel reminders for recycled task ${taskId}`, e);
      });
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
  }

  /**
   * Batch 5: bulk Task recycling
   *
   * Safely moves multiple Tasks from active storage (TaskRepository) to the RecycleBin,
   * while cancelling any associated native OS reminders.
   */
  static async recycleTasks(
    items: {
    return TaskCommandHandler.recycleTasks();
  }[],
    options?: {
      originalWorkspaceName?: string;
      skipEvents?: boolean;
      skipAnalytics?: boolean;
      source?: string;
    }
  ): Promise<{ recycledCount: number }> {
    // Call through the class reference: destructuring the static methods off the
    // class would lose the `this` binding, silently writing to the wrong storage
    // key ("undefined") because the methods read this.RECYCLE_BIN_KEY.
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
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
    const existingRecycleBinItems = await RecycleBinRepository.getRecycleBinItems();
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

    const { generateId } = await import("@/shared/utils/id");
    const { MoveJournalRepository } = await import("@/repositories/MoveJournalRepository");
    const operations = validTasksToRecycle.map(task => ({
      operationId: `recycle-${generateId()}`,
      operationType: "recycle" as const,
      entityId: task.id,
      entityType: "task" as const,
      sourceWorkspaceId: task.workspaceId,
      targetWorkspaceId: task.workspaceId,
      timestamp: Date.now(),
    }));
    await MoveJournalRepository.addOperations(operations);

    await RecycleBinRepository.saveRecycleBinItems([...newSnapshots, ...filteredExisting], { throwOnError: true });

    try {
      // 3. Remove from active storage and save per workspace
      for (const [workspaceId, activeTasks] of workspaceTasksMap.entries()) {
        const targetIds = Array.from(itemsByWorkspace.get(workspaceId) || []);
        const idsToDelete = targetIds.filter(id => activeTasks[id]);
        if (idsToDelete.length > 0) {
          await TaskRepository.deleteTasks(idsToDelete, workspaceId);
        }
      }
    } catch (e) {
      console.warn(`[EntityCommandService] Failed to delete active tasks during batch recycle. Recycle bin contains ghosts.`, e);
      throw e;
    }

    await MoveJournalRepository.removeOperations(operations.map(op => op.operationId));

    // 4. Batch cancel reminders (Fire and forget)
    const allNotificationIds: string[] = [];
    for (const task of validTasksToRecycle) {
      if (task.reminder?.notificationIds && task.reminder.notificationIds.length > 0) {
        allNotificationIds.push(...task.reminder.notificationIds);
      }
    }

    if (allNotificationIds.length > 0) {
      cancelReminderIds(allNotificationIds, { throwOnError: false }).catch(e => {
        console.warn(`[EntityCommandService] Failed to cancel reminders during batch recycle`, e);
      });
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

  /**
   * Clears all completed tasks in a given workspace, moving them to the recycle bin safely.
   */
  static async clearCompletedTasks(
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<void> {
    return TaskCommandHandler.clearCompletedTasks(workspaceId, options?);
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
    options?: {
    return TaskCommandHandler.permanentlyDeleteTask();
  }
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

    // 2. Remove from active storage FIRST (Commit Point)
    await TaskRepository.deleteTask(taskId, workspaceId);

    // 3. Cancel native reminders (Fire and forget)
    if (task.reminder?.notificationIds && task.reminder.notificationIds.length > 0) {
      cancelReminderIds(task.reminder.notificationIds, { throwOnError: false }).catch(e => {
        console.warn(`[EntityCommandService] Failed to cancel reminders for permanently deleted task ${taskId}`, e);
      });
    }

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

  static async permanentlyDeleteHabit(
    habitId: string,
    workspaceId: string,
    options?: { skipEvents?: boolean; skipAnalytics?: boolean; source?: string }
  ): Promise<void> {
    const { cancelReminderIds } = await import("@/services/scheduling/reminders.service");
    const { emitStateChange } = await import("@/services/events/state-events");

    const habitsMap = await HabitRepository.getHabits(workspaceId);
    const habit = habitsMap[habitId];
    if (!habit) throw new Error(`Habit ${habitId} not found`);

    // 1. Remove from active storage FIRST
    await HabitRepository.deleteHabit(habitId, workspaceId);

    // 2. Cancel native reminders (Fire and forget)
    if (habit.reminder?.notificationIds?.length) {
      cancelReminderIds(habit.reminder.notificationIds, { throwOnError: false }).catch(e => {
        console.warn(`[EntityCommandService] Failed to cancel reminders for permanently deleted habit ${habitId}`, e);
      });
    }

    if (!options?.skipEvents) emitStateChange("habits_changed", options?.source);
    if (!options?.skipAnalytics) {
      const { recordDailyHistorySnapshot } = await import("@/services/analytics/productivity-history.service");
      void recordDailyHistorySnapshot().catch(() => {});
    }
  }

  static async permanentlyDeleteChecklist(
    checklistId: string,
    workspaceId: string,
    options?: { skipEvents?: boolean; skipAnalytics?: boolean; source?: string }
  ): Promise<void> {
    const { emitStateChange } = await import("@/services/events/state-events");

    const checklistsMap = await ChecklistRepository.getChecklists(workspaceId);
    if (!checklistsMap[checklistId]) throw new Error(`Checklist ${checklistId} not found`);

    await ChecklistRepository.deleteChecklist(checklistId, workspaceId);

    if (!options?.skipEvents) emitStateChange("checklists_changed", options?.source);
    if (!options?.skipAnalytics) {
      const { recordDailyHistorySnapshot } = await import("@/services/analytics/productivity-history.service");
      void recordDailyHistorySnapshot().catch(() => {});
    }
  }

  static async permanentlyDeleteResource(
    resourceId: string,
    workspaceId: string,
    options?: { skipEvents?: boolean; skipAnalytics?: boolean; source?: string }
  ): Promise<void> {
    const { emitStateChange } = await import("@/services/events/state-events");

    const resourcesMap = await ResourceRepository.getResources(workspaceId);
    if (!resourcesMap[resourceId]) throw new Error(`Resource ${resourceId} not found`);

    await ResourceRepository.deleteResource(resourceId, workspaceId);

    if (!options?.skipEvents) emitStateChange("resources_changed", options?.source);
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
    return TaskCommandHandler.restoreTask(recycleBinItemId, options?);
  }
