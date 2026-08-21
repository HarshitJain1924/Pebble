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

import { CreateEntityOptions, isParsedProductivityItem } from "../types/command.types";
import { scheduleTaskNotifications } from "../shared/command-notifications";
import { restoreEntityFromBin } from "../shared/command-recovery";

export class TaskCommandHandler {
static async reorderTasks(
    orderedTasks: Task[],
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<void> {
    await TaskRepository.saveTasks(orderedTasks, workspaceId);
    if (!options?.skipEvents) emitStateChange("tasks_changed", options?.source);
    if (!options?.skipAnalytics) void recordDailyHistorySnapshot().catch(() => {});
    void syncWidgetData().catch(() => {});
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

    // 0. Resolve raw entity/bin IDs to RecycleBin items. Callers may pass either
    //    full RecycleBinItem objects (Recycle Bin screen) or plain task entity IDs
    //    (bulk-delete Undo in useTasksState.handleBulkDelete).
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    const resolvedItems: any[] = [];
    for (const entry of itemsToRestore) {
      if (typeof entry === "string") {
        const match = binItems.find(
          (i) => i.id === entry || i.entityId === entry,
        );
        if (match && match.entityType === "task") {
          resolvedItems.push(match);
        } else {
          console.warn(
            `[EntityCommandService] No RecycleBin task entry found for "${entry}"; skipping restore.`
          );
          failedItemIds.push(entry);
        }
      } else {
        resolvedItems.push(entry);
      }
    }

    // 1. Parse and group valid tasks
    for (const item of resolvedItems) {
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

      if (!tasksByWorkspace.has(workspaceId)) {
        tasksByWorkspace.set(workspaceId, []);
      }
      tasksByWorkspace.get(workspaceId)!.push({ task: taskToSave, itemId: item.id });
    }

    // 2. Batch save per workspace (DOMAIN PERSISTENCE FIRST)
    let restoredCount = 0;
    const tasksToReschedule: Task[] = [];
    
    const { generateId } = await import("@/shared/utils/id");
    const { MoveJournalRepository } = await import("@/repositories/MoveJournalRepository");
    const operations: MoveJournalEntry[] = [];
    for (const [workspaceId, wrappedTasks] of tasksByWorkspace.entries()) {
      for (const w of wrappedTasks) {
        operations.push({
          operationId: `restore-${generateId()}`,
          operationType: "restore",
          entityId: w.task.id,
          entityType: "task",
          sourceWorkspaceId: workspaceId,
          targetWorkspaceId: workspaceId,
          timestamp: Date.now(),
        });
      }
    }
    await MoveJournalRepository.addOperations(operations);

    for (const [workspaceId, wrappedTasks] of tasksByWorkspace.entries()) {
      try {
        const tasks = wrappedTasks.map((w) => w.task);
        await TaskRepository.saveTasks(tasks, workspaceId);
        restoredCount += tasks.length;
        successfulItemIds.push(...wrappedTasks.map((w) => w.itemId));
        tasksToReschedule.push(...tasks.filter(t => t.reminder?.enabled && t.reminder?.triggerAt));
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to batch save tasks in workspace ${workspaceId}`, e);
        failedItemIds.push(...wrappedTasks.map((w) => w.itemId));
      }
    }

    // 2.5 Reschedule reminders (Isolated)
    for (const task of tasksToReschedule) {
      try {
        const rescheduled = await rescheduleTodoReminders(task);
        await TaskRepository.updateNotificationIds(rescheduled.id, rescheduled.workspaceId, rescheduled.reminder?.notificationIds);
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to reschedule reminders for Task ${task.id}`, e);
      }
    }

    // 3. Remove successfully restored entries from the Recycle Bin (best-effort,
    //    never fail the restore because bin cleanup failed).
    if (successfulItemIds.length > 0) {
      try {
        const remainingBinItems = binItems.filter(
          (i) => !successfulItemIds.includes(i.id),
        );
        await RecycleBinRepository.saveRecycleBinItems(remainingBinItems, { throwOnError: true });
      } catch (e) {
        console.warn(
          `[EntityCommandService] Tasks restored, but failed to remove their Recycle Bin entries. Duplicate state may exist.`,
          e,
        );
      }
    }

    await MoveJournalRepository.removeOperations(operations.map(op => op.operationId));

    // 4. Side effects
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

    // 1. Load recycle-bin item. Resolve by either the RecycleBin item ID
    // ("rb-{entityId}") or the raw task entity ID so callers (e.g. the
    // delete-Undo in useTaskCrud, which passes the task ID) both work.
    const binItems = await getRecycleBinItems();
    const item = binItems.find(
      (i) => i.id === recycleBinItemId || i.entityId === recycleBinItemId,
    );
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

    const { generateId } = await import("@/shared/utils/id");
    const { MoveJournalRepository } = await import("@/repositories/MoveJournalRepository");
    const operationId = `restore-${generateId()}`;
    await MoveJournalRepository.addOperation({
      operationId,
      operationType: "restore",
      entityId: parsedTask.id,
      entityType: "task",
      sourceWorkspaceId: parsedTask.workspaceId,
      targetWorkspaceId: parsedTask.workspaceId,
      timestamp: Date.now(),
    });

    // 7. Persist to active storage (Throws on failure, bin untouched)
    const activeTaskToSave = { ...parsedTask };
    await TaskRepository.saveTask(activeTaskToSave);

    // 8. Safely remove from Recycle Bin ONLY AFTER successful active persistence
    try {
      const remainingBinItems = binItems.filter((i) => i.id !== item.id);
      await saveRecycleBinItems(remainingBinItems, { throwOnError: true });
    } catch (e) {
      console.warn(`[EntityCommandService] Failed to remove task from Recycle Bin after restore. Recycle Bin contains a ghost.`, e);
    }
    
    await MoveJournalRepository.removeOperation(operationId);

    // 9. Reschedule reminders (Tolerance: do not fail restoration on reminder error)
    if (parsedTask.reminder && parsedTask.reminder.enabled && parsedTask.reminder.triggerAt) {
      try {
        const taskWithReminders = await rescheduleTodoReminders(parsedTask);
        await TaskRepository.updateNotificationIds(taskWithReminders.id, taskWithReminders.workspaceId, taskWithReminders.reminder?.notificationIds);
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to reschedule reminders during restore of Task ${parsedTask.id}. Task will be restored without active native notifications.`, e);
      }
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

    return activeTaskToSave;
  }

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

/**
   * Clears all completed tasks in a given workspace, moving them to the recycle bin safely.
   */
  static async clearCompletedTasks(
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<void> {
    const tasks = await TaskRepository.getTasks(workspaceId);
    const completedTasks = Object.values(tasks).filter(
      (t) => t.status === "completed" || !!t.completedAt,
    );
    if (completedTasks.length === 0) return;

    await this.recycleTasks(
      completedTasks.map((t) => ({ taskId: t.id, workspaceId })),
      { source: options?.source || "clear_completed" },
    );
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

    const operationId = `move-${generateId()}`;
    await MoveJournalRepository.addOperation({
      operationId,
      entityId: taskId,
      entityType: "task",
      sourceWorkspaceId,
      targetWorkspaceId,
      timestamp: Date.now(),
    });

    // Save in new workspace first to avoid data loss
    await TaskRepository.saveTask(movedTask);
    // Then delete from old workspace
    try {
      await TaskRepository.deleteTask(taskId, sourceWorkspaceId);
    } catch (e) {
      console.warn(`[EntityCommandService] Failed to delete source task ${taskId} during move. Target workspace ${targetWorkspaceId} contains a ghost.`, e);
      throw e;
    }

    await MoveJournalRepository.removeOperation(operationId);

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
   * Bulk-archive Tasks with the same side effects as updateTask({ archivedAt }) —
   * reminder cancellation + notification-ID clearing, events and analytics.
   */
  static async archiveTasks(
    items: { taskId: string; workspaceId: string }[],
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
   * Bulk-complete Tasks with the same side effects as completeTask.
   */
  static async completeTasks(
    items: { taskId: string; workspaceId: string }[],
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

    if (needsReminderUpdate && updatedTask.reminder && updatedTask.reminder.notificationIds) {
      updatedTask.reminder = { ...updatedTask.reminder, notificationIds: undefined }; // Strip so reconciler uses fresh IDs
    }

    // 1. Domain persistence FIRST
    await TaskRepository.saveTask(updatedTask);

    // 2. OS Notification Scheduling SECOND (isolated)
    if (needsReminderUpdate) {
      // Fire and forget cancel existing
      if (existing.reminder?.notificationIds?.length) {
        cancelReminderIds(existing.reminder.notificationIds, { throwOnError: false }).catch(e => {
          console.warn("[EntityCommandService] Failed to cancel old reminder IDs during update", e);
        });
      }
      
      // Reschedule if still applicable
      const isArchived = !!updatedTask.archivedAt;
      const isCompleted = updatedTask.status === "completed";

      if (!isArchived && !isCompleted) {
        try {
          updatedTask = await rescheduleTodoReminders(updatedTask);
          await TaskRepository.updateNotificationIds(updatedTask.id, updatedTask.workspaceId, updatedTask.reminder?.notificationIds);
        } catch (e) {
          console.warn("[EntityCommandService] Failed to reschedule task reminder during update:", e);
        }
      }
    }

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
   * Create and persist a Task entity.
   */
  static async createTask(
    input: Task | ParsedProductivityItem,
    workspaceId: string = INBOX_WORKSPACE_ID,
    options?: CreateEntityOptions,
  ): Promise<Task> {
    let task: Task;
    let needsScheduling = false;
    let parsedInput: ParsedProductivityItem | undefined;

    if (isParsedProductivityItem(input)) {
      task = buildTask(input, workspaceId);
      needsScheduling = true;
      parsedInput = input;
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

      if (task.reminder && task.reminder.notificationIds) {
        task.reminder.notificationIds = undefined; // Strip so reconciler uses fresh IDs
      }
      if (task.reminder?.enabled && task.reminder?.triggerAt) {
        needsScheduling = true;
      }
    }

    // 1. Domain persistence FIRST
    await TaskRepository.saveTask(task);

    // 2. OS Notification Scheduling SECOND (isolated)
    if (needsScheduling) {
      try {
        if (parsedInput) {
          const notificationIds = await scheduleTaskNotifications(task.id, parsedInput);
          if (notificationIds.length > 0 && task.reminder) {
            task.reminder.notificationIds = notificationIds;
            await TaskRepository.updateNotificationIds(task.id, task.workspaceId, notificationIds);
          }
        } else {
          task = await rescheduleTodoReminders(task);
          await TaskRepository.updateNotificationIds(task.id, task.workspaceId, task.reminder?.notificationIds);
        }
      } catch (e) {
        console.warn("[EntityCommandService] Failed to schedule task reminder after persistence:", e);
      }
    }

    if (!options?.skipEvents) {
      emitStateChange("tasks_changed", options?.source);
    }

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    return task;
  }


}
