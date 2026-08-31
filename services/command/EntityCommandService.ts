import { WorkspaceCommandHandler } from "./handlers/WorkspaceCommandHandler";
import { TaskCommandHandler } from "./handlers/TaskCommandHandler";
import { HabitCommandHandler } from "./handlers/HabitCommandHandler";
import { ChecklistCommandHandler } from "./handlers/ChecklistCommandHandler";
import { ResourceCommandHandler } from "./handlers/ResourceCommandHandler";
import { SystemCommandHandler } from "./handlers/SystemCommandHandler";
import { ConversionCommandHandler } from "./handlers/ConversionCommandHandler";
import { CreateEntityOptions } from "./types/command.types";
import type { ParsedProductivityItem } from "@/features/capture/services/nlp-parser.service";
import { type Task, type Habit, type Checklist, type Resource, type Workspace, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";

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
    return WorkspaceCommandHandler.createWorkspace(workspace);
  }

  /**
   * Update and persist a Workspace entity (e.g. rename workspace).
   */
  static async updateWorkspace(workspace: Workspace): Promise<void> {
    return WorkspaceCommandHandler.updateWorkspace(workspace);
  }

  /**
   * Delete a Workspace entity and gracefully fallback active/selected states.
   * Note: The UI handles cascading deletes or moves of items inside the workspace.
   */
  static async deleteWorkspace(workspaceId: string): Promise<void> {
    return WorkspaceCommandHandler.deleteWorkspace(workspaceId);
  }

  /**
   * Archive a Workspace entity.
   * This is a foundation command. It marks the workspace as archived
   * but does not cascade to children. Contextual filtering of children
   * is handled by selectors.
   */
  static async archiveWorkspace(workspaceId: string): Promise<void> {
    return WorkspaceCommandHandler.archiveWorkspace(workspaceId);
  }

  /**
   * Restore an archived Workspace entity.
   * Restores the workspace to active state without touching children.
   */
  static async restoreWorkspaceArchive(workspaceId: string): Promise<void> {
    return WorkspaceCommandHandler.restoreWorkspaceArchive(workspaceId);
  }

  /**
   * Create and persist a Task entity.
   */
  static async createTask(
    input: Task | ParsedProductivityItem,
    workspaceId: string = INBOX_WORKSPACE_ID,
    options?: CreateEntityOptions,
  ): Promise<Task> {
    return TaskCommandHandler.createTask(input, workspaceId, options);
  }

  /**
   * Fix #9: Atomically reschedules a single occurrence of a recurring Task.
   * Modifies the master's recurrenceExceptions and creates a detached non-recurring Task
   * in a single atomic storage transaction under the workspace partition lock.
   */
  static async rescheduleRecurringOccurrence(
    masterTaskId: string,
    workspaceId: string,
    occurrenceDate: string,
    dropTarget: { hour?: number | null; date?: string | null },
    options?: CreateEntityOptions,
  ): Promise<{ masterTask: Task; occurrenceTask: Task }> {
    return TaskCommandHandler.rescheduleRecurringOccurrence(
      masterTaskId,
      workspaceId,
      occurrenceDate,
      dropTarget,
      options,
    );
  }

  /**
   * Atomically reschedules a single occurrence of a recurring Checklist.
   */
  static async rescheduleChecklistRecurringOccurrence(
    masterChecklistId: string,
    workspaceId: string,
    occurrenceDate: string,
    dropTarget: { hour?: number | null; minute?: number | null; date?: string | null },
    options?: CreateEntityOptions,
  ): Promise<{ masterChecklist: Checklist; occurrenceChecklist: Checklist }> {
    return ChecklistCommandHandler.rescheduleRecurringOccurrence(
      masterChecklistId,
      workspaceId,
      occurrenceDate,
      dropTarget,
      options,
    );
  }

  /**
   * Create and persist a Habit entity.
   */
  static async createHabit(
    input: Habit | ParsedProductivityItem,
    workspaceId: string = INBOX_WORKSPACE_ID,
    options?: CreateEntityOptions,
  ): Promise<Habit> {
    return HabitCommandHandler.createHabit(input, workspaceId, options);
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
    return ConversionCommandHandler.convertTaskToHabit(taskId, workspaceId, options);
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
    return ConversionCommandHandler.convertHabitToTask(habitId, workspaceId, options);
  }

  /**
   * Create and persist a Checklist entity.
   */
  static async createChecklist(
    input: Checklist | ParsedProductivityItem,
    workspaceId: string = INBOX_WORKSPACE_ID,
    options?: CreateEntityOptions,
  ): Promise<Checklist> {
    return ChecklistCommandHandler.createChecklist(input, workspaceId, options);
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
    return ChecklistCommandHandler.mergeChecklistItems(checklistId, workspaceId, newItemsText, options);
  }

  /**
   * Create and persist a Resource entity.
   */
  static async createResource(
    input: Resource | ParsedProductivityItem,
    workspaceId: string = INBOX_WORKSPACE_ID,
    options?: CreateEntityOptions,
  ): Promise<Resource> {
    return ResourceCommandHandler.createResource(input, workspaceId, options);
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
    return TaskCommandHandler.completeTask(taskId, workspaceId, options);
  }

  /**
   * Uncomplete a Task.
   */
  static async uncompleteTask(
    taskId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<{ previous: Task; updated: Task } | null> {
    return TaskCommandHandler.uncompleteTask(taskId, workspaceId, options);
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
    return TaskCommandHandler.updateTask(taskId, workspaceId, updates, options);
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
    return HabitCommandHandler.updateHabit(habitId, workspaceId, updates, options);
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
    items: { taskId: string; workspaceId: string }[],
    options?: CreateEntityOptions,
  ): Promise<Task[]> {
    return TaskCommandHandler.completeTasks(items, options);
  }

  /**
   * Bulk-complete Habits for today with the same side effects as completeHabit.
   */
  static async completeHabits(
    items: { habitId: string; workspaceId: string }[],
    options?: CreateEntityOptions,
  ): Promise<Habit[]> {
    return HabitCommandHandler.completeHabits(items, options);
  }

  /**
   * Bulk-archive Tasks with the same side effects as updateTask({ archivedAt }) —
   * reminder cancellation + notification-ID clearing, events and analytics.
   */
  static async archiveTasks(
    items: { taskId: string; workspaceId: string }[],
    options?: CreateEntityOptions,
  ): Promise<Task[]> {
    return TaskCommandHandler.archiveTasks(items, options);
  }

  /**
   * Bulk-archive Habits with the same side effects as updateHabit({ archivedAt }) —
   * reminder cancellation + notification-ID clearing, events and analytics.
   */
  static async archiveHabits(
    items: { habitId: string; workspaceId: string }[],
    options?: CreateEntityOptions,
  ): Promise<Habit[]> {
    return HabitCommandHandler.archiveHabits(items, options);
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
    return TaskCommandHandler.moveTask(taskId, sourceWorkspaceId, targetWorkspaceId, options);
  }

  /**
   * Complete a Habit for today.
   */
  static async completeHabit(
    habitId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<{ previous: Habit; updated: Habit } | null> {
    return HabitCommandHandler.completeHabit(habitId, workspaceId, options);
  }

  /**
   * Uncomplete a Habit for today.
   */
  static async uncompleteHabit(
    habitId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<{ previous: Habit; updated: Habit } | null> {
    return HabitCommandHandler.uncompleteHabit(habitId, workspaceId, options);
  }

  /**
   * Toggle a Checklist item completion state.
   */
  static async toggleChecklistItem(
    checklistId: string,
    itemId: string,
    workspaceId: string,
    dateKeyOrOptions?: string | CreateEntityOptions,
    options?: CreateEntityOptions,
  ): Promise<{ previous: Checklist; updated: Checklist } | null> {
    return ChecklistCommandHandler.toggleChecklistItem(checklistId, itemId, workspaceId, dateKeyOrOptions, options);
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
    return ChecklistCommandHandler.addChecklistItem(checklistId, itemTitle, workspaceId, options);
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
    return ChecklistCommandHandler.deleteChecklistItem(checklistId, itemId, workspaceId, options);
  }

  /**
   * Recover a Habit's streak by injecting a completion for yesterday.
   */
  static async recoverHabitStreak(
    habitId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<{ previous: Habit; updated: Habit } | null> {
    return HabitCommandHandler.recoverHabitStreak(habitId, workspaceId, options);
  }

  static async recycleHabit(
    habitId: string,
    workspaceId: string,
    options?: CreateEntityOptions
  ): Promise<void> {
    return HabitCommandHandler.recycleHabit(habitId, workspaceId, options);
  }

  static async restoreHabit(
    recycleBinItemId: string,
    options?: CreateEntityOptions
  ): Promise<Habit> {
    return HabitCommandHandler.restoreHabit(recycleBinItemId, options);
  }

  static async recycleChecklist(
    checklistId: string,
    workspaceId: string,
    options?: CreateEntityOptions
  ): Promise<void> {
    return ChecklistCommandHandler.recycleChecklist(checklistId, workspaceId, options);
  }

  static async recycleResource(
    resourceId: string,
    workspaceId: string,
    options?: CreateEntityOptions
  ): Promise<void> {
    return ResourceCommandHandler.recycleResource(resourceId, workspaceId, options);
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
    options?: CreateEntityOptions
  ): Promise<void> {
    return TaskCommandHandler.recycleTask(taskId, workspaceId, originalWorkspaceName, options);
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
    return TaskCommandHandler.recycleTasks(items, options);
  }

  /**
   * Clears all completed tasks in a given workspace, moving them to the recycle bin safely.
   */
  static async clearCompletedTasks(
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<void> {
    return TaskCommandHandler.clearCompletedTasks(workspaceId, options);
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
    options?: CreateEntityOptions
  ): Promise<void> {
    return TaskCommandHandler.permanentlyDeleteTask(taskId, workspaceId, options);
  }

  static async permanentlyDeleteHabit(
    habitId: string,
    workspaceId: string,
    options?: CreateEntityOptions
  ): Promise<void> {
    return HabitCommandHandler.permanentlyDeleteHabit(habitId, workspaceId, options);
  }

  static async permanentlyDeleteChecklist(
    checklistId: string,
    workspaceId: string,
    options?: CreateEntityOptions
  ): Promise<void> {
    return ChecklistCommandHandler.permanentlyDeleteChecklist(checklistId, workspaceId, options);
  }

  static async permanentlyDeleteResource(
    resourceId: string,
    workspaceId: string,
    options?: CreateEntityOptions
  ): Promise<void> {
    return ResourceCommandHandler.permanentlyDeleteResource(resourceId, workspaceId, options);
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
    return TaskCommandHandler.restoreTask(recycleBinItemId, options);
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
    return TaskCommandHandler.restoreTasks(itemsToRestore, options);
  }

  static async restoreChecklist(recycleBinItemId: string, options?: CreateEntityOptions): Promise<Checklist> {
    return ChecklistCommandHandler.restoreChecklist(recycleBinItemId, options);
  }

  static async restoreResource(recycleBinItemId: string, options?: CreateEntityOptions): Promise<Resource> {
    return ResourceCommandHandler.restoreResource(recycleBinItemId, options);
  }

  /**
   * Restore a Workspace from the Recycle Bin.
   *
   * Workspaces are snapshotted as a package `{ list: Workspace, todos: Task[],
   * habits: Habit[] }` (see WorkspaceModal's delete flow) — NOT as a bare
   * Workspace. Restoring the raw package through saveWorkspace would persist a
   * corrupt entity (`id: undefined`, `name: "Untitled Workspace"`), so this
   * restore unwraps `snapshot.list` and persists the real workspace through the
   * canonical WorkspaceRepository.
   *
   * The contained tasks/habits are re-persisted best-effort into their
   * partitioned storage keys (they normally already live there — the workspace
   * delete flow does not purge them — so this is idempotent and purely
   * defensive). The bin entry is removed only after the workspace persist
   * succeeds; saveWorkspace swallows errors, so the persisted workspace is
   * read back to verify the restore actually happened.
   */
  static async restoreWorkspace(
    recycleBinItemId: string,
    options?: CreateEntityOptions,
  ): Promise<Workspace> {
    return WorkspaceCommandHandler.restoreWorkspace(recycleBinItemId, options);
  }

  // ============================================================================
  // Additional Update & Move Methods (Phase 9 Bypasses)
  // ============================================================================

  static async updateChecklist(
    checklistId: string,
    workspaceId: string,
    updates: Partial<Omit<Checklist, "id" | "workspaceId">>,
    options?: CreateEntityOptions,
  ): Promise<Checklist> {
    return ChecklistCommandHandler.updateChecklist(checklistId, workspaceId, updates, options);
  }

  static async updateResource(
    resourceId: string,
    workspaceId: string,
    updates: Partial<Omit<Resource, "id" | "workspaceId">>,
    options?: CreateEntityOptions,
  ): Promise<Resource> {
    return ResourceCommandHandler.updateResource(resourceId, workspaceId, updates, options);
  }

  static async toggleArchiveResource(
    resourceId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<{ resource: Resource, isArchived: boolean }> {
    return ResourceCommandHandler.toggleArchiveResource(resourceId, workspaceId, options);
  }

  static async moveHabit(
    habitId: string,
    sourceWorkspaceId: string,
    targetWorkspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<Habit> {
    return HabitCommandHandler.moveHabit(habitId, sourceWorkspaceId, targetWorkspaceId, options);
  }

  static async moveChecklist(
    checklistId: string,
    sourceWorkspaceId: string,
    targetWorkspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<Checklist> {
    return ChecklistCommandHandler.moveChecklist(checklistId, sourceWorkspaceId, targetWorkspaceId, options);
  }

  static async moveResource(
    resourceId: string,
    sourceWorkspaceId: string,
    targetWorkspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<Resource> {
    return ResourceCommandHandler.moveResource(resourceId, sourceWorkspaceId, targetWorkspaceId, options);
  }

  static async reorderTasks(
    orderedTasks: Task[],
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<void> {
    return TaskCommandHandler.reorderTasks(orderedTasks, workspaceId, options);
  }


  static async recordFocusSession(
    durationSeconds: number,
    taskId?: string,
    itemType?: "task" | "habit" | "checklist",
    options?: { sessionId?: string; startedAt?: number; endedAt?: number }
  ): Promise<void> {
    return SystemCommandHandler.recordFocusSession(durationSeconds, taskId, itemType, options);
  }

  static async logSystemEvent(eventName: string, details?: any): Promise<void> {
    return SystemCommandHandler.logSystemEvent(eventName, details);
  }

  static async reorderWorkspaces(
    orderedWorkspaces: Workspace[],
    options?: CreateEntityOptions,
  ): Promise<void> {
    return WorkspaceCommandHandler.reorderWorkspaces(orderedWorkspaces, options);
  }
}
