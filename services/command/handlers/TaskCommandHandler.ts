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
    const { rescheduleTodoReminders, cancelReminderIds } = await import("@/services/scheduling/reminders.service");
    const { emitStateChange } = await import("@/services/events/state-events");
    const { WorkspaceRepository } = await import("@/repositories");
    const { withLocks } = await import("@/shared/utils/mutex");
    const { generateId } = await import("@/shared/utils/id");
    const { MoveJournalRepository } = await import("@/repositories/MoveJournalRepository");
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");

    const workspaces = await WorkspaceRepository.getWorkspaces();
    const validWorkspaceIds = new Set(workspaces.map((w) => w.id));

    // Phase 1: Unlocked pre-flight to determine which workspaces we need to lock
    const initialBinItems = await RecycleBinRepository.getRecycleBinItems();
    
    const preflightWorkspaces = new Set<string>();
    for (const entry of itemsToRestore) {
      let snapshotStr = "";
      if (typeof entry === "string") {
        const cleanEntry = entry.startsWith("rb-") ? entry.slice(3) : entry;
        const item = initialBinItems.find(
          (i) => i.id === entry || i.entityId === entry || i.entityId === cleanEntry || i.id === `rb-${cleanEntry}` || i.id.startsWith(`rb-${cleanEntry}-g`)
        );
        if (item && item.entityType === "task") snapshotStr = item.snapshot;
      } else if (entry && entry.entityType === "task") {
        snapshotStr = entry.snapshot;
      }

      if (snapshotStr) {
        try {
          const parsedTask = JSON.parse(snapshotStr);
          if (parsedTask && parsedTask.id) {
            let wsId = parsedTask.workspaceId || "inbox";
            if (!validWorkspaceIds.has(wsId)) wsId = "inbox";
            preflightWorkspaces.add(wsId);
          }
        } catch {}
      }
    }

    const locksToAcquire = Array.from(preflightWorkspaces).map(ws => `pebble:v1:tasks:${ws}`);
    const tasksToReschedule: Task[] = [];
    let restoredCount = 0;
    const successfulItemIds: string[] = [];
    const failedItemIds: string[] = [];
    const operationIdsToRemove: string[] = [];
    
    // Phase 2: Domain Persistence under partition locks
    await withLocks(locksToAcquire, async () => {
      const currentBinItems = await RecycleBinRepository.getRecycleBinItems();
      const tasksByWorkspace = new Map<string, { task: Task; itemId: string; operationId?: string }[]>();

      for (const entry of itemsToRestore) {
        const cleanEntry = typeof entry === "string" && entry.startsWith("rb-") ? entry.slice(3) : (typeof entry === "string" ? entry : "");
        // Must resolve against CURRENT bin items to avoid ghost resurrection
        const match = typeof entry === "string" 
          ? currentBinItems.find((i) => i.id === entry || i.entityId === entry || i.entityId === cleanEntry || i.id === `rb-${cleanEntry}` || i.id.startsWith(`rb-${cleanEntry}-g`))
          : currentBinItems.find((i) => i.id === entry.id || i.entityId === entry.entityId || i.id.startsWith(`rb-${entry.entityId}-g`));
          
        if (match && match.entityType === "task") {
          let parsedTask: Task;
          try {
            parsedTask = JSON.parse(match.snapshot);
          } catch (e) {
            failedItemIds.push(match.id);
            continue;
          }

          if (!parsedTask || !parsedTask.id) {
            failedItemIds.push(match.id);
            continue;
          }

          const { TombstoneRepository } = await import("@/repositories/TombstoneRepository");
          const highestTombstone = await TombstoneRepository.getHighestTombstonedGeneration("task", parsedTask.id);
          const isDead = (parsedTask.lifecycleGeneration || 1) <= highestTombstone || await TombstoneRepository.isTombstoned("task", parsedTask.id, parsedTask.lifecycleGeneration || 1);
          if (isDead) {
            failedItemIds.push(match.id);
            try {
              await RecycleBinRepository.removeRecycleBinItems([match.id], { throwOnError: false });
            } catch {}
            continue;
          }

          let wsId = parsedTask.workspaceId || "inbox";
          if (!validWorkspaceIds.has(wsId)) wsId = "inbox";
          parsedTask.workspaceId = wsId;

          // Strip stale notification IDs
          if (parsedTask.reminder && parsedTask.reminder.notificationIds) {
            parsedTask.reminder = { ...parsedTask.reminder, notificationIds: undefined };
          }

          parsedTask.revision = (parsedTask.revision ?? 1) + 1;
          parsedTask.lifecycleGeneration = parsedTask.lifecycleGeneration ?? 1;

          // Check if active task in target workspace is from a newer generation
          const activeTasksMap = await TaskRepository.getTasks(wsId);
          const activeTask = activeTasksMap[parsedTask.id];
          if (activeTask && (activeTask.lifecycleGeneration || 1) >= parsedTask.lifecycleGeneration) {
            successfulItemIds.push(match.id);
            continue;
          }

          if (!tasksByWorkspace.has(wsId)) tasksByWorkspace.set(wsId, []);
          tasksByWorkspace.get(wsId)!.push({ task: parsedTask, itemId: match.id });
        } else {
          // It's gone from the bin (concurrently restored or deleted)
          failedItemIds.push(typeof entry === "string" ? entry : entry.id);
        }
      }

      // Add MoveJournal entries inside lock
      const operations: MoveJournalEntry[] = [];
      for (const [workspaceId, wrappedTasks] of tasksByWorkspace.entries()) {
        for (const w of wrappedTasks) {
          const opId = `restore-${generateId()}`;
          w.operationId = opId;
          operations.push({
            operationId: opId,
            operationType: "restore",
            entityId: w.task.id,
            entityType: "task",
            sourceWorkspaceId: workspaceId,
            targetWorkspaceId: workspaceId,
            timestamp: Date.now(),
            lifecycleGeneration: w.task.lifecycleGeneration,
            expectedRevision: w.task.revision,
          });
        }
      }
      
      if (operations.length > 0) {
        await MoveJournalRepository.addOperations(operations);
      }

      // Persist active tasks
      for (const [workspaceId, wrappedTasks] of tasksByWorkspace.entries()) {
        try {
          const tasks = wrappedTasks.map((w) => w.task);
          await TaskRepository.saveTasksUnlocked(tasks, workspaceId);
          restoredCount += tasks.length;
          successfulItemIds.push(...wrappedTasks.map((w) => w.itemId));
          operationIdsToRemove.push(...wrappedTasks.map((w) => w.operationId!));
          tasksToReschedule.push(...tasks.filter(t => t.reminder?.enabled && t.reminder?.triggerAt));
        } catch (e) {
          console.warn(`[EntityCommandService] Failed to batch save tasks in workspace ${workspaceId}`, e);
          failedItemIds.push(...wrappedTasks.map((w) => w.itemId));
        }
      }

      // Remove successfully restored entries from RecycleBin safely inside the lock
      if (successfulItemIds.length > 0) {
        try {
          await RecycleBinRepository.removeRecycleBinItems(successfulItemIds, { throwOnError: true });
        } catch (e) {
          console.warn(
            `[EntityCommandService] Tasks restored, but failed to remove their Recycle Bin entries. Duplicate state may exist.`,
            e,
          );
        }
      }
    });
    
    // Cleanup move journal operations OUTSIDE the lock
    if (operationIdsToRemove.length > 0) {
      await MoveJournalRepository.removeOperations(operationIdsToRemove);
    }

    // Phase 3: OS Side effects outside the lock
    for (const task of tasksToReschedule) {
      let generatedNotificationIds: string[] | undefined = undefined;
      try {
        const rescheduled = await rescheduleTodoReminders(task);
        generatedNotificationIds = rescheduled.reminder?.notificationIds;
        
        if (generatedNotificationIds && generatedNotificationIds.length > 0) {
          const status = await TaskRepository.updateNotificationIds(rescheduled.id, rescheduled.workspaceId, generatedNotificationIds);
          
          // Domain verification to prevent zombie notifications
          const verify = await TaskRepository.getTask(rescheduled.id, rescheduled.workspaceId);
          if (status === 'not_found' || !verify || verify.status === "completed" || verify.archivedAt) {
            cancelReminderIds(generatedNotificationIds, { throwOnError: false }).catch(() => {});
          }
        }
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to reschedule reminders for Task ${task.id}`, e);
        if (generatedNotificationIds && generatedNotificationIds.length > 0) {
          cancelReminderIds(generatedNotificationIds, { throwOnError: false }).catch(() => {});
        }
      }
    }

    // Phase 4: App State effects
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
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    const { rescheduleTodoReminders } = await import("@/services/scheduling/reminders.service");
    const { emitStateChange } = await import("@/services/events/state-events");

    // 1. Load recycle-bin item. Resolve by either the RecycleBin item ID
    // ("rb-{entityId}") or the raw task entity ID so callers (e.g. the
    // delete-Undo in useTaskCrud, which passes the task ID) both work.
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    const cleanId = recycleBinItemId.startsWith("rb-") ? recycleBinItemId.slice(3) : recycleBinItemId;
    const item = binItems.find(
      (i) => i.id === recycleBinItemId || i.entityId === recycleBinItemId || i.entityId === cleanId || i.id === `rb-${cleanId}` || i.id.startsWith(`rb-${cleanId}-g`),
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

    const { WorkspaceRepository } = await import("@/repositories/WorkspaceRepository");
    const workspaces = await WorkspaceRepository.getWorkspaces();
    const validWorkspaceIds = new Set(workspaces.map((w) => w.id));
    let targetWorkspaceId = parsedTask.workspaceId || INBOX_WORKSPACE_ID;
    if (
      !validWorkspaceIds.has(targetWorkspaceId) &&
      targetWorkspaceId !== INBOX_WORKSPACE_ID &&
      targetWorkspaceId !== MY_PEBBLES_WORKSPACE_ID
    ) {
      targetWorkspaceId = INBOX_WORKSPACE_ID;
    }

    const { withLock } = await import("@/shared/utils/mutex");
    const lockKey = `pebble:v1:tasks:${targetWorkspaceId}`;
    
    const restoredData = await withLock(lockKey, async () => {
      // 5. Fresh read inside critical section
      const freshItems = await RecycleBinRepository.getRecycleBinItems();
      const itemInside = freshItems.find(
        (i) => i.id === item.id || i.id === recycleBinItemId || i.entityId === recycleBinItemId || i.entityId === cleanId || i.id === `rb-${cleanId}` || i.id.startsWith(`rb-${cleanId}-g`)
      );
      if (!itemInside || itemInside.entityType !== "task") {
        throw new Error("Task already restored or permanently deleted");
      }

      let parsedTaskInside: Task;
      try {
        parsedTaskInside = JSON.parse(itemInside.snapshot);
      } catch (e) {
        throw new Error(`[EntityCommandService] Failed to parse RecycleBin snapshot for item ${recycleBinItemId}`);
      }

      if (!parsedTaskInside || !parsedTaskInside.id) {
        throw new Error(`[EntityCommandService] Parsed Task is missing required fields (id).`);
      }
      parsedTaskInside.workspaceId = targetWorkspaceId;

      if (parsedTaskInside.reminder && parsedTaskInside.reminder.notificationIds) {
        parsedTaskInside.reminder = { ...parsedTaskInside.reminder, notificationIds: undefined };
      }

      const { TombstoneRepository } = await import("@/repositories/TombstoneRepository");
      const highestTombstone = await TombstoneRepository.getHighestTombstonedGeneration("task", parsedTaskInside.id);
      const isDead = (parsedTaskInside.lifecycleGeneration || 1) <= highestTombstone || await TombstoneRepository.isTombstoned("task", parsedTaskInside.id, parsedTaskInside.lifecycleGeneration);
      if (isDead) {
        const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
        await RecycleBinRepository.removeRecycleBinItems([itemInside.id], { throwOnError: true });
        throw new Error(`[EntityCommandService] Task ${parsedTaskInside.id} was permanently deleted.`);
      }

      parsedTaskInside.revision = (parsedTaskInside.revision ?? 1) + 1;
      parsedTaskInside.lifecycleGeneration = parsedTaskInside.lifecycleGeneration ?? 1;

      const { generateId } = await import("@/shared/utils/id");
      const { MoveJournalRepository } = await import("@/repositories/MoveJournalRepository");
      const operationId = `restore-${generateId()}`;
      await MoveJournalRepository.addOperation({
        operationId,
        operationType: "restore",
        entityId: parsedTaskInside.id,
        entityType: "task",
        sourceWorkspaceId: parsedTaskInside.workspaceId,
        targetWorkspaceId: parsedTaskInside.workspaceId,
        timestamp: Date.now(),
        lifecycleGeneration: parsedTaskInside.lifecycleGeneration,
        expectedRevision: parsedTaskInside.revision,
      });

      const { TaskRepository } = await import("@/repositories/TaskRepository");
      const existingActiveTasks = await TaskRepository.getTasks(targetWorkspaceId);
      if (existingActiveTasks[parsedTaskInside.id]) {
        // If an active entity already exists with this ID, do NOT overwrite it and do NOT create a duplicate!
        // The restore is obsolete because the active entity is already present.
        const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
        await RecycleBinRepository.removeRecycleBinItems([itemInside.id], { throwOnError: true });
        return { activeTaskToSave: existingActiveTasks[parsedTaskInside.id], itemInside, operationId };
      }

      // 7. Persist to active storage
      const activeTaskToSave = { ...parsedTaskInside };
      await TaskRepository.saveTaskUnlocked(activeTaskToSave);

      // 8. Safely remove from Recycle Bin inside the lock
      try {
        const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
        await RecycleBinRepository.removeRecycleBinItems([itemInside.id], { throwOnError: true });
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to remove task from Recycle Bin after restore. Recycle Bin contains a ghost.`, e);
      }

      return { activeTaskToSave, itemInside, operationId };
    });
    
    const { MoveJournalRepository } = await import("@/repositories/MoveJournalRepository");
    await MoveJournalRepository.removeOperation(restoredData.operationId);

    const restoredTask = restoredData.activeTaskToSave;

    // 9. Reschedule reminders (Tolerance: do not fail restoration on reminder error)
    if (restoredTask.reminder && restoredTask.reminder.enabled && restoredTask.reminder.triggerAt) {
      let generatedNotificationIds: string[] | undefined = undefined;
      try {
        const taskWithReminders = await rescheduleTodoReminders(restoredTask);
        generatedNotificationIds = taskWithReminders.reminder?.notificationIds;
        
        if (generatedNotificationIds && generatedNotificationIds.length > 0) {
          const status = await TaskRepository.updateNotificationIds(taskWithReminders.id, taskWithReminders.workspaceId, generatedNotificationIds);
          
          // Re-verify domain state to prevent Zombie notifications in case of concurrent mutation
          const verify = await TaskRepository.getTask(taskWithReminders.id, taskWithReminders.workspaceId);
          if (status === 'not_found' || !verify || verify.status === "completed" || verify.archivedAt) {
            cancelReminderIds(generatedNotificationIds, { throwOnError: false }).catch(() => {});
          }
        }
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to reschedule reminders during restore of Task ${restoredTask.id}. Task will be restored without active native notifications.`, e);
        if (generatedNotificationIds && generatedNotificationIds.length > 0) {
          cancelReminderIds(generatedNotificationIds, { throwOnError: false }).catch(() => {});
        }
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

    return restoredTask;
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
   * 3. Add durable tombstone
   * 4. Cancel native reminders
   * 5. Delete from TaskRepository
   * 6. Emit events & analytics
   */
  static async permanentlyDeleteTask(
    taskId: string,
    workspaceId: string,
    options?: { skipEvents?: boolean; skipAnalytics?: boolean; source?: string }
  ): Promise<void> {
    const { cancelReminderIds } = await import("@/services/scheduling/reminders.service");
    const { emitStateChange } = await import("@/services/events/state-events");
    const { TombstoneRepository } = await import("@/repositories/TombstoneRepository");
    const { withLock } = await import("@/shared/utils/mutex");

    const lockKey = `pebble:v1:tasks:${workspaceId}`;
    const deletedTask = await withLock(lockKey, async () => {
      // 1. Verify existence under lock (active storage or recycle bin)
      const tasksMap = await TaskRepository.getTasks(workspaceId);
      let task = tasksMap[taskId];
      let fromRecycleBin = false;

      if (!task) {
        const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
        const binItems = await RecycleBinRepository.getRecycleBinItems();
        const rbItem = binItems.find(
          (i) => (i.entityId === taskId || i.id === taskId) && i.entityType === "task"
        );
        if (rbItem) {
          try {
            task = JSON.parse(rbItem.snapshot);
            fromRecycleBin = true;
          } catch {}
        }
      }

      if (!task) {
        throw new Error(
          `[EntityCommandService] Task ${taskId} not found in workspace ${workspaceId}`
        );
      }

      // 2. Add durable tombstone
      await TombstoneRepository.addTombstone({
        id: `ts-task-${task.id}-g${task.lifecycleGeneration ?? 1}`,
        entityType: "task",
        entityId: task.id,
        lifecycleGeneration: task.lifecycleGeneration ?? 1,
        deletionRevision: task.revision ?? 1,
        deletedAt: Date.now(),
      });

      // 3. Remove from active storage and recycle bin
      if (!fromRecycleBin) {
        await TaskRepository.deleteTaskUnlocked(taskId, workspaceId);
      }
      const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
      await RecycleBinRepository.removeRecycleBinItems([taskId]);

      return task;
    });

    // 4. Cancel native reminders (Fire and forget)
    if (deletedTask.reminder?.notificationIds && deletedTask.reminder.notificationIds.length > 0) {
      cancelReminderIds(deletedTask.reminder.notificationIds, { throwOnError: false }).catch(e => {
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
    const { withLocks } = await import("@/shared/utils/mutex");

    // Group items by workspaceId
    const itemsByWorkspace = new Map<string, Set<string>>();
    const workspaceIds = new Set<string>();
    for (const item of items) {
      if (!itemsByWorkspace.has(item.workspaceId)) {
        itemsByWorkspace.set(item.workspaceId, new Set<string>());
      }
      itemsByWorkspace.get(item.workspaceId)!.add(item.taskId);
      workspaceIds.add(item.workspaceId);
    }

    const lockKeys = Array.from(workspaceIds).map(id => `pebble:v1:tasks:${id}`);

    const { recycledCount, validTasksToRecycle } = await withLocks(lockKeys, async () => {
      const validTasks: Task[] = [];
      const workspaceTasksMap = new Map<string, Record<string, Task>>();

      // 1. Load active tasks under locks
      for (const [workspaceId, taskIds] of itemsByWorkspace.entries()) {
        const activeTasks = await TaskRepository.getTasks(workspaceId);
        workspaceTasksMap.set(workspaceId, activeTasks);

        for (const taskId of taskIds) {
          const task = activeTasks[taskId];
          if (task) {
            validTasks.push(task);
          }
        }
      }

      if (validTasks.length === 0) {
        return { recycledCount: 0, validTasksToRecycle: [] };
      }

      // 2. Atomic RecycleBin snapshot
      const itemsToAdd = validTasks.map(task => ({
        entityType: "task" as const,
        item: task,
      }));

      const { generateId } = await import("@/shared/utils/id");
      const { MoveJournalRepository } = await import("@/repositories/MoveJournalRepository");
      const operations = validTasks.map(task => ({
        operationId: `recycle-${generateId()}`,
        operationType: "recycle" as const,
        entityId: task.id,
        entityType: "task" as const,
        sourceWorkspaceId: task.workspaceId,
        targetWorkspaceId: task.workspaceId,
        timestamp: Date.now(),
        lifecycleGeneration: task.lifecycleGeneration || 1,
        expectedRevision: task.revision || 1,
      }));
      await MoveJournalRepository.addOperations(operations);

      await RecycleBinRepository.addMultipleToRecycleBin(itemsToAdd, { throwOnError: true });

      try {
        // 3. Remove from active storage using Unlocked primitive
        for (const [workspaceId, activeTasks] of workspaceTasksMap.entries()) {
          const targetIds = Array.from(itemsByWorkspace.get(workspaceId) || []);
          const idsToDelete = targetIds.filter(id => activeTasks[id]);
          if (idsToDelete.length > 0) {
            await TaskRepository.deleteTasksUnlocked(idsToDelete, workspaceId);
          }
        }
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to delete active tasks during batch recycle. Recycle bin contains ghosts.`, e);
        throw e;
      }

      await MoveJournalRepository.removeOperations(operations.map(op => op.operationId));

      return { recycledCount: validTasks.length, validTasksToRecycle: validTasks };
    });

    if (recycledCount === 0) return { recycledCount: 0 };

    // 4. Batch cancel reminders (Fire and forget outside locks)
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
    const { withLock } = await import("@/shared/utils/mutex");

    const key = `pebble:v1:tasks:${workspaceId}`;

    const { task, operationId } = await withLock(key, async () => {
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
        lifecycleGeneration: task.lifecycleGeneration ?? 1,
        expectedRevision: task.revision ?? 1,
      });

      // 3. Snapshot task into Recycle Bin (Safe operation first)
      await addToRecycleBin("task", task, originalWorkspaceName, { throwOnError: true });

      try {
        // 4. Remove from active storage (Commit Point)
        await TaskRepository.deleteTaskUnlocked(taskId, workspaceId);
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to delete active task ${taskId} during recycle. Recycle bin contains a ghost.`, e);
        throw e;
      }

      return { task, operationId };
    });

    const { MoveJournalRepository } = await import("@/repositories/MoveJournalRepository");
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

    const { withLocks } = await import("@/shared/utils/mutex");
    const sourceLock = `pebble:v1:tasks:${sourceWorkspaceId}`;
    const targetLock = `pebble:v1:tasks:${targetWorkspaceId}`;

    return await withLocks([sourceLock, targetLock], async () => {
      const tasksMap = await TaskRepository.getTasks(sourceWorkspaceId);
      const existing = tasksMap[taskId];
      if (!existing) {
        throw new Error(`Task ${taskId} not found in workspace ${sourceWorkspaceId}`);
      }

      const { WorkspaceRepository } = await import("@/repositories/WorkspaceRepository");
      const workspaces = await WorkspaceRepository.getWorkspaces();
      const { INBOX_WORKSPACE_ID, MY_PEBBLES_WORKSPACE_ID } = await import("@/shared/types/domain.types");
      if (!workspaces.some(w => w.id === targetWorkspaceId) && targetWorkspaceId !== INBOX_WORKSPACE_ID && targetWorkspaceId !== MY_PEBBLES_WORKSPACE_ID) {
        throw new Error(`Target workspace ${targetWorkspaceId} no longer exists.`);
      }

      const movedTask: Task = {
        ...existing,
        workspaceId: targetWorkspaceId,
        revision: (existing.revision ?? 1) + 1,
        lifecycleGeneration: existing.lifecycleGeneration ?? 1,
        updatedAt: Date.now(),
      };

      const { generateId } = await import("@/shared/utils/id");
      const { emitStateChange } = await import("@/services/events/state-events");
      const { MoveJournalRepository } = await import("@/repositories/MoveJournalRepository");
      const { recordDailyHistorySnapshot } = await import("@/services/analytics/productivity-history.service");
      const { syncWidgetData } = await import("@/services/analytics/widget-data.service");

      const operationId = `move-${generateId()}`;
      await MoveJournalRepository.addOperation({
        operationId,
        entityId: taskId,
        entityType: "task",
        sourceWorkspaceId,
        targetWorkspaceId,
        timestamp: Date.now(),
        lifecycleGeneration: existing.lifecycleGeneration ?? 1,
        expectedRevision: existing.revision ?? 1,
      });

      // Save in new workspace first to avoid data loss, using unlocked primitives
      // to avoid deadlocking with our outer withLocks.
      await TaskRepository.saveTaskUnlocked(movedTask);
      
      // Then delete from old workspace, again using unlocked primitives.
      try {
        await TaskRepository.deleteTaskUnlocked(taskId, sourceWorkspaceId);
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to delete source task ${taskId} during move. Target workspace ${targetWorkspaceId} contains a ghost.`, e);
        throw e;
      }

      await MoveJournalRepository.removeOperation(operationId);

      // Side effects can run inside the lock because they are mostly fire-and-forget
      // or fast, but we keep the structure exactly as before.
      if (!options?.skipEvents) {
        emitStateChange("tasks_changed", options?.source);
      }

      if (!options?.skipAnalytics) {
        void recordDailyHistorySnapshot().catch(() => {});
      }

      void syncWidgetData().catch(() => {});

      return movedTask;
    });
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
   * Fix #9: Hardened recurring occurrence drag/drop.
   * Atomically creates a recurrence exception on a master Task and creates a detached
   * non-recurring Task for the moved occurrence in a single atomic storage transaction.
   */
  static async rescheduleRecurringOccurrence(
    masterTaskId: string,
    workspaceId: string,
    occurrenceDate: string,
    dropTarget: { hour?: number | null; date?: string | null },
    options?: CreateEntityOptions,
  ): Promise<{ masterTask: Task; occurrenceTask: Task }> {
    const { withLock } = await import("@/shared/utils/mutex");
    const { generateId } = await import("@/shared/utils/id");
    const { calculateRescheduledTask } = await import("@/services/scheduling/scheduling.service");
    const key = `pebble:v1:tasks:${workspaceId}`;

    const { updatedMaster, newCopy, needsReminderScheduling } = await withLock(key, async () => {
      const tasksMap = await TaskRepository.getTasks(workspaceId);
      const master = tasksMap[masterTaskId];
      if (!master) {
        throw new Error(
          `[TaskCommandHandler] rescheduleRecurringOccurrence failed: Task ${masterTaskId} not found in workspace ${workspaceId}`
        );
      }

      if (!master.recurrence) {
        throw new Error(
          `[TaskCommandHandler] rescheduleRecurringOccurrence failed: Task ${masterTaskId} is not a recurring task`
        );
      }

      // 1. Calculate new schedule for the dropped occurrence
      const updates = calculateRescheduledTask(master, dropTarget, occurrenceDate);

      // 2. Add occurrence date to master's recurrenceExceptions (idempotent set)
      const existingExceptions = master.recurrenceExceptions || [];
      const updatedExceptions = existingExceptions.includes(occurrenceDate)
        ? existingExceptions
        : [...existingExceptions, occurrenceDate];

      const updatedMaster: Task = {
        ...master,
        recurrenceExceptions: updatedExceptions,
        updatedAt: Date.now(),
      };

      // 3. Construct detached non-recurring task
      const targetDate = dropTarget.date || occurrenceDate;
      const newTaskId = generateId("task-");
      const newCopy: Task = {
        ...master,
        id: newTaskId,
        workspaceId,
        recurrence: undefined, // Detached non-recurring copy
        recurrenceExceptions: undefined,
        schedule: {
          ...master.schedule,
          ...updates.schedule,
          date: targetDate,
        },
        reminder: master.reminder
          ? {
              ...master.reminder,
              notificationIds: undefined, // Strip so fresh IDs are scheduled
            }
          : undefined,
        status: "todo",
        completedAt: undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // 4. Atomic Domain Persistence: write BOTH master and copy in a SINGLE partition write
      await TaskRepository.saveTasksUnlocked([updatedMaster, newCopy], workspaceId);

      const needsReminderScheduling = !!(newCopy.reminder?.enabled && newCopy.reminder?.triggerAt);

      return { updatedMaster, newCopy, needsReminderScheduling };
    });

    // 5. Post-persistence notification scheduling for the new copy (isolated)
    let finalOccurrenceTask = newCopy;
    if (needsReminderScheduling) {
      try {
        const { rescheduleTodoReminders } = await import("@/services/scheduling/reminders.service");
        const scheduled = await rescheduleTodoReminders(newCopy);
        if (scheduled.reminder?.notificationIds?.length) {
          await TaskRepository.updateNotificationIds(
            scheduled.id,
            workspaceId,
            scheduled.reminder.notificationIds
          );
          finalOccurrenceTask = scheduled;
        }
      } catch (e) {
        console.warn("[TaskCommandHandler] Failed to schedule reminder for detached occurrence:", e);
      }
    }

    // 6. Post-persistence events & analytics
    if (!options?.skipEvents) {
      emitStateChange("tasks_changed", options?.source);
    }
    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }
    void syncWidgetData().catch(() => {});

    return { masterTask: updatedMaster, occurrenceTask: finalOccurrenceTask };
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
    const { withLock } = await import("@/shared/utils/mutex");
    const key = `pebble:v1:tasks:${workspaceId}`;

    const { updatedTask, existing, needsReminderUpdate } = await withLock(key, async () => {
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
        revision: (existing.revision ?? 1) + 1,
        lifecycleGeneration: existing.lifecycleGeneration ?? 1,
        updatedAt: Date.now(),
      };

      // Reminder evaluation
      const titleChanged = "title" in updates && updates.title !== existing.title;
      const categoryChanged = "categoryId" in updates && updates.categoryId !== existing.categoryId;
      const recurrenceChanged = "recurrence" in updates && JSON.stringify(updates.recurrence) !== JSON.stringify(existing.recurrence);
      const reminderChanged = "reminder" in updates && JSON.stringify(updates.reminder) !== JSON.stringify(existing.reminder);
      const statusChanged = "status" in updates && updates.status !== existing.status;
      const scheduleChanged = "schedule" in updates && JSON.stringify(updates.schedule) !== JSON.stringify(existing.schedule);
      const archivedChanged = "archivedAt" in updates && updates.archivedAt !== existing.archivedAt;

      const needsReminderUpdate = titleChanged || categoryChanged || recurrenceChanged || reminderChanged || statusChanged || scheduleChanged || archivedChanged;

      if (needsReminderUpdate && updatedTask.reminder && updatedTask.reminder.notificationIds) {
        updatedTask.reminder = { ...updatedTask.reminder, notificationIds: undefined }; // Strip so reconciler uses fresh IDs
      }

      // 1. Domain persistence FIRST
      await TaskRepository.saveTaskUnlocked(updatedTask);

      return { updatedTask, existing, needsReminderUpdate };
    });

    let finalTask = updatedTask;

    // 2. OS Notification Scheduling SECOND (isolated)
    if (needsReminderUpdate) {
      // Fire and forget cancel existing
      if (existing.reminder?.notificationIds?.length) {
        cancelReminderIds(existing.reminder.notificationIds, { throwOnError: false }).catch(e => {
          console.warn("[EntityCommandService] Failed to cancel old reminder IDs during update", e);
        });
      }
      
      // Reschedule if still applicable
      const isArchived = !!finalTask.archivedAt;
      const isCompleted = finalTask.status === "completed";

      if (!isArchived && !isCompleted) {
        try {
          finalTask = await rescheduleTodoReminders(finalTask);
          if (finalTask.reminder?.notificationIds?.length) {
            const status = await TaskRepository.updateNotificationIds(finalTask.id, finalTask.workspaceId, finalTask.reminder.notificationIds);
            
            // Re-verify domain state to prevent Zombie notifications.
            // If the task was completed, archived, deleted, or moved by a concurrent operation
            // while we were talking to the OS, we MUST cancel the newly scheduled notifications.
            const verify = await TaskRepository.getTask(finalTask.id, finalTask.workspaceId);
            if (status === 'not_found' || !verify || verify.status === "completed" || verify.archivedAt) {
              cancelReminderIds(finalTask.reminder.notificationIds, { throwOnError: false }).catch(() => {});
            }
          }
        } catch (e) {
          console.warn("[EntityCommandService] Failed to reschedule task reminder during update:", e);
          if (finalTask.reminder?.notificationIds?.length) {
            cancelReminderIds(finalTask.reminder.notificationIds, { throwOnError: false }).catch(() => {});
          }
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

    return finalTask;
  }

/**
   * Uncomplete a Task.
   */
  static async uncompleteTask(
    taskId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<{ previous: Task; updated: Task } | null> {
    const { withLock } = await import("@/shared/utils/mutex");
    const key = `pebble:v1:tasks:${workspaceId}`;

    const result = await withLock(key, async () => {
      const tasksMap = await TaskRepository.getTasks(workspaceId);
      const task = tasksMap[taskId];
      if (!task) return null;

      if (task.status !== "completed") {
        return { previous: task, updated: task, skipped: true }; // Already uncompleted
      }

      let updatedTask: Task = {
        ...task,
        status: "todo",
        completedAt: undefined,
        revision: (task.revision ?? 1) + 1,
        lifecycleGeneration: task.lifecycleGeneration ?? 1,
        updatedAt: Date.now(),
        ...(task.reminder
          ? {
              reminder: {
                ...task.reminder,
                notificationIds: undefined,
              },
            }
          : {}),
      };

      // 1. Domain persistence FIRST
      await TaskRepository.saveTaskUnlocked(updatedTask);

      return { previous: task, updated: updatedTask, skipped: false };
    });

    if (!result) return null;
    if (result.skipped) return { previous: result.previous, updated: result.updated };

    const { previous } = result;
    let updatedTask = result.updated;

    await reversePebbleReward(`task:${previous.id}`);

    // 2. OS Notification Scheduling SECOND (isolated)
    try {
      // If the task has an enabled reminder in the future or recurrence, it must be re-scheduled
      // because completeTask previously cancelled it.
      const finalTask = await rescheduleTodoReminders(updatedTask);
      if (finalTask.reminder?.notificationIds?.length) {
        const status = await TaskRepository.updateNotificationIds(finalTask.id, finalTask.workspaceId, finalTask.reminder.notificationIds);
        
        // Re-verify domain state to prevent Zombie notifications in case of concurrent mutation
        const verify = await TaskRepository.getTask(finalTask.id, finalTask.workspaceId);
        if (status === 'not_found' || !verify || verify.status === "completed" || verify.archivedAt) {
          cancelReminderIds(finalTask.reminder.notificationIds, { throwOnError: false }).catch(() => {});
        }
      }
      updatedTask = finalTask;
    } catch (e) {
      console.warn("[EntityCommandService] Failed to reschedule reminders after uncomplete", e);
      if (updatedTask.reminder?.notificationIds?.length) {
        cancelReminderIds(updatedTask.reminder.notificationIds, { throwOnError: false }).catch(() => {});
      }
    }

    pluginManager.dispatchTaskUncompleted(updatedTask);

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    void syncWidgetData().catch(() => {});

    if (!options?.skipEvents) {
      emitStateChange("tasks_changed", options?.source);
    }

    return { previous, updated: updatedTask };
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
    const { withLock } = await import("@/shared/utils/mutex");
    const key = `pebble:v1:tasks:${workspaceId}`;

    const result = await withLock(key, async () => {
      const tasksMap = await TaskRepository.getTasks(workspaceId);
      const task = tasksMap[taskId];
      if (!task) return null;

      if (task.status === "completed") {
        return { previous: task, updated: task, skipped: true }; // Already completed
      }

      const updatedTask: Task = {
        ...task,
        status: "completed",
        completedAt: Date.now(),
        revision: (task.revision ?? 1) + 1,
        lifecycleGeneration: task.lifecycleGeneration ?? 1,
        updatedAt: Date.now(),
        ...(task.reminder
          ? {
              reminder: {
                ...task.reminder,
                notificationIds: undefined,
              },
            }
          : {}),
      };

      await TaskRepository.saveTaskUnlocked(updatedTask);

      return { previous: task, updated: updatedTask, skipped: false };
    });

    if (!result) return null;
    if (result.skipped) return { previous: result.previous, updated: result.updated };

    const { previous, updated: updatedTask } = result;

    if (previous.reminder?.notificationIds) {
      cancelReminderIds(previous.reminder.notificationIds, { throwOnError: false }).catch(e => {
        console.warn(`[EntityCommandService] Failed to cancel reminders for completed task ${taskId}`, e);
      });
    }

    await earnPebble("task", `task:${updatedTask.id}`);
    pluginManager.dispatchTaskCompleted(updatedTask);

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    void syncWidgetData().catch(() => {});

    if (!options?.skipEvents) {
      emitStateChange("tasks_changed", options?.source);
    }

    return { previous, updated: updatedTask };
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

    const targetWorkspace = isParsedProductivityItem(input)
      ? workspaceId || INBOX_WORKSPACE_ID
      : input.workspaceId || workspaceId || INBOX_WORKSPACE_ID;

    const { withLock } = await import("@/shared/utils/mutex");
    const { TombstoneRepository } = await import("@/repositories/TombstoneRepository");
    const lockKey = `pebble:v1:tasks:${targetWorkspace}`;

    task = await withLock(lockKey, async () => {
      let candidate: Task;
      if (isParsedProductivityItem(input)) {
        candidate = buildTask(input, targetWorkspace);
        needsScheduling = true;
        parsedInput = input;
      } else {
        candidate = {
          ...input,
          workspaceId: targetWorkspace,
          revision: input.revision ?? 1,
          lifecycleGeneration: input.lifecycleGeneration ?? 1,
          createdAt: input.createdAt || Date.now(),
          updatedAt: Date.now(),
          status: input.status || "todo",
          priority: input.priority || "none",
        };

        if (candidate.reminder && candidate.reminder.notificationIds) {
          candidate.reminder.notificationIds = undefined; // Strip so reconciler uses fresh IDs
        }
        if (candidate.reminder?.enabled && candidate.reminder?.triggerAt) {
          needsScheduling = true;
        }
      }

      // Authoritative generation allocation inside the partition lock:
      const highestTombstone = candidate.id
        ? await TombstoneRepository.getHighestTombstonedGeneration("task", candidate.id)
        : 0;
      const allocatedGen = Math.max(candidate.lifecycleGeneration || 1, highestTombstone + 1);

      candidate.lifecycleGeneration = allocatedGen;
      candidate.revision = candidate.revision || 1;

      // 1. Domain persistence FIRST
      await TaskRepository.saveTaskUnlocked(candidate);
      return candidate;
    });

    // 2. OS Notification Scheduling SECOND (isolated)
    if (needsScheduling) {
      let generatedNotificationIds: string[] | undefined = undefined;
      try {
        if (parsedInput) {
          generatedNotificationIds = await scheduleTaskNotifications(task.id, parsedInput);
          if (generatedNotificationIds.length > 0 && task.reminder) {
            task.reminder.notificationIds = generatedNotificationIds;
            const status = await TaskRepository.updateNotificationIds(task.id, task.workspaceId, generatedNotificationIds);
            
            // Re-verify domain state to prevent Zombie notifications in case of concurrent mutation
            const verify = await TaskRepository.getTask(task.id, task.workspaceId);
            if (status === 'not_found' || !verify || verify.status === "completed" || verify.archivedAt) {
              cancelReminderIds(generatedNotificationIds, { throwOnError: false }).catch(() => {});
            }
          }
        } else {
          task = await rescheduleTodoReminders(task);
          generatedNotificationIds = task.reminder?.notificationIds;
          if (generatedNotificationIds && generatedNotificationIds.length > 0) {
            const status = await TaskRepository.updateNotificationIds(task.id, task.workspaceId, generatedNotificationIds);
            
            // Re-verify domain state to prevent Zombie notifications in case of concurrent mutation
            const verify = await TaskRepository.getTask(task.id, task.workspaceId);
            if (status === 'not_found' || !verify || verify.status === "completed" || verify.archivedAt) {
              cancelReminderIds(generatedNotificationIds, { throwOnError: false }).catch(() => {});
            }
          }
        }
      } catch (e) {
        console.warn("[EntityCommandService] Failed to schedule task reminder after persistence:", e);
        if (generatedNotificationIds && generatedNotificationIds.length > 0) {
          cancelReminderIds(generatedNotificationIds, { throwOnError: false }).catch(() => {});
        }
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
