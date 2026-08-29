import { TaskCommandHandler } from "./TaskCommandHandler";
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
import { scheduleCreationNotifications, scheduleTaskNotifications, scheduleHabitNotifications } from "../shared/command-notifications";
import { restoreEntityFromBin } from "../shared/command-recovery";

export class WorkspaceCommandHandler {
static async reorderWorkspaces(
    orderedWorkspaces: Workspace[],
    options?: CreateEntityOptions,
  ): Promise<void> {
    await WorkspaceRepository.saveWorkspaces(orderedWorkspaces);
    if (!options?.skipEvents) emitStateChange("workspace_changed", options?.source);
    if (!options?.skipAnalytics) void recordDailyHistorySnapshot().catch(() => {});
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
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    const { emitStateChange } = await import("@/services/events/state-events");

    // 1. Resolve the bin item by its RecycleBin item id ("rb-<workspaceId>") or
    // the raw workspace id so callers that pass either work.
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    const cleanId = recycleBinItemId.startsWith("rb-") ? recycleBinItemId.slice(3) : recycleBinItemId;
    const item = binItems.find(
      (i) => i.id === recycleBinItemId || i.entityId === recycleBinItemId || i.entityId === cleanId || i.id === `rb-${cleanId}` || i.id.startsWith(`rb-${cleanId}-g`),
    );
    if (!item || item.entityType !== "workspace") {
      throw new Error(`RecycleBin item not found or not workspace`);
    }

    // 2. Parse the snapshot package and unwrap the actual Workspace. Tolerate a
    // bare Workspace snapshot (backward compatibility).
    let parsed: any;
    try {
      parsed = JSON.parse(item.snapshot);
    } catch (e) {
      throw new Error(`[EntityCommandService] Failed to parse workspace snapshot for ${recycleBinItemId}`);
    }
    const workspace: Workspace = parsed?.list ?? parsed;
    if (!workspace || !workspace.id) {
      throw new Error(`[EntityCommandService] Invalid workspace snapshot for ${recycleBinItemId}`);
    }

    const { withLocks } = await import("@/shared/utils/mutex");
    const locks = [
      `pebble:v1:tasks:${workspace.id}`,
      `pebble:v1:habits:${workspace.id}`,
      `pebble:v1:checklists:${workspace.id}`,
      `pebble:v1:resources:${workspace.id}`,
      `ws_lifecycle_${workspace.id}`
    ];
    return withLocks(locks, async () => {
      const { TombstoneRepository } = await import("@/repositories/TombstoneRepository");
      const highestTombstone = await TombstoneRepository.getHighestTombstonedGeneration("workspace", workspace.id);
      const isDead = (workspace.lifecycleGeneration || 1) <= highestTombstone || await TombstoneRepository.isTombstoned("workspace", workspace.id, workspace.lifecycleGeneration || 1);
      if (isDead) {
        try {
          const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
          await RecycleBinRepository.removeRecycleBinItems([item.id], { throwOnError: true });
        } catch {}
        throw new Error(`[EntityCommandService] Workspace ${workspace.id} was permanently deleted.`);
      }

      workspace.revision = (workspace.revision ?? 1) + 1;
      workspace.lifecycleGeneration = workspace.lifecycleGeneration ?? 1;

      // 3. Persist the workspace through the canonical repository.
      await WorkspaceRepository.saveWorkspace(workspace);

    // 4. saveWorkspace swallows storage errors, so verify the workspace actually
    // persisted. If it did not, abort WITHOUT removing the bin item.
    const persistedWorkspaces = await WorkspaceRepository.getWorkspaces();
    if (!persistedWorkspaces.some((w) => w.id === workspace.id)) {
      throw new Error(`[EntityCommandService] Workspace ${workspace.id} failed to persist during restore`);
    }

    // 5. Best-effort restore of the contained tasks/habits into their canonical
    // partitioned keys (idempotent — they normally already exist in storage).
    let childRestoreSuccess = true;

    if (Array.isArray(parsed?.todos) && parsed.todos.length > 0) {
      try {
        await TaskRepository.saveTasksUnlocked(parsed.todos, workspace.id);
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to restore tasks for workspace ${workspace.id}`, e);
        childRestoreSuccess = false;
      }
    }
    if (Array.isArray(parsed?.habits) && parsed.habits.length > 0) {
      try {
        await HabitRepository.saveHabitsUnlocked(parsed.habits, workspace.id);
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to restore habits for workspace ${workspace.id}`, e);
        childRestoreSuccess = false;
      }
    }
    if (Array.isArray(parsed?.checklists) && parsed.checklists.length > 0) {
      try {
        const { ChecklistRepository } = await import("@/repositories/ChecklistRepository");
        await ChecklistRepository.saveChecklistsUnlocked(parsed.checklists, workspace.id);
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to restore checklists for workspace ${workspace.id}`, e);
        childRestoreSuccess = false;
      }
    }
    if (Array.isArray(parsed?.resources) && parsed.resources.length > 0) {
      try {
        const { ResourceRepository } = await import("@/repositories/ResourceRepository");
        await ResourceRepository.saveResourcesUnlocked(parsed.resources, workspace.id);
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to restore resources for workspace ${workspace.id}`, e);
        childRestoreSuccess = false;
      }
    }

    if (!childRestoreSuccess) {
      throw new Error(`[EntityCommandService] Workspace ${workspace.id} restored partially. Recovery snapshot retained.`);
    }

    // 6. Remove the bin entry only after active persistence succeeded.
    try {
      const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
      await RecycleBinRepository.removeRecycleBinItems([item.id], { throwOnError: true });
    } catch (e) {
      console.warn(`[EntityCommandService] Failed to remove workspace from Recycle Bin after restore. Recycle Bin contains a ghost.`, e);
    }

    // 7. Emit the workspace state event.
    if (!options?.skipEvents) {
      emitStateChange("workspace_mode_changed", options?.source);
    }

    return workspace;
    });
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
   * Delete a Workspace entity and gracefully fallback active/selected states.
   * Note: The UI handles cascading deletes or moves of items inside the workspace.
   */
  static async deleteWorkspace(workspaceId: string): Promise<void> {
    try {
      if (workspaceId === INBOX_WORKSPACE_ID || workspaceId === MY_PEBBLES_WORKSPACE_ID) {
        throw new Error("Cannot delete protected workspace.");
      }

      const { withLocks } = await import("@/shared/utils/mutex");
      const locks = [
        `pebble:v1:tasks:${workspaceId}`,
        `pebble:v1:habits:${workspaceId}`,
        `pebble:v1:checklists:${workspaceId}`,
        `pebble:v1:resources:${workspaceId}`,
        `ws_lifecycle_${workspaceId}`
      ];
      await withLocks(locks, async () => {
        // 1. Fetch complete workspace snapshot
        const workspaces = await WorkspaceRepository.getWorkspaces();
      const workspace = workspaces.find((w) => w.id === workspaceId);
      if (!workspace) {
        console.error("Workspace not found! Available workspaces:", workspaces, "Looking for:", workspaceId);
        throw new Error("Workspace not found");
      }

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

      // 4. Delete Workspace record FIRST (Commit Point)
      // This MUST happen before partition cleanup. If partition cleanup happens first 
      // and metadata deletion fails, a subsequent retry will overwrite the safe Recycle Bin backup 
      // with empty partitions, causing permanent data loss.
      await WorkspaceRepository.deleteWorkspace(workspaceId, { throwOnError: true });

      // 5. Remove active partitions securely inside the lock boundary.
      // We use a transactional multiRemove. If it fails, the partitions are orphaned on disk,
      // which is benign because they are inaccessible and will be safely overwritten if resurrected.
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      try {
        await AsyncStorage.multiRemove([
          `pebble:v1:tasks:${workspaceId}`,
          `pebble:v1:habits:${workspaceId}`,
          `pebble:v1:checklists:${workspaceId}`,
          `pebble:v1:resources:${workspaceId}`
        ]);
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to clean up partitions for workspace ${workspaceId}`, e);
        // We DO NOT throw here. The workspace metadata is already deleted. Throwing would abort the cleanup
        // of related entities (graph, notifications) and leave the system in a worse state.
      }

      // 6. Async Cleanup (Fire and forget)
      const cleanup = async () => {
        try {
          // 6a. Delete graph relationships
          const allEntityIds = [
            ...todos.map(t => t.id),
            ...habits.map(h => h.id),
            ...checklists.map(c => c.id),
            ...resources.map(r => r.id),
          ];
          if (allEntityIds.length > 0) {
            await GraphRepository.deleteRelationshipsForEntities(allEntityIds);
          }

          // 6b. Cancel notifications
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
   * Create and persist a Workspace entity.
   */
  static async createWorkspace(workspace: Workspace): Promise<void> {
    try {
      const { TombstoneRepository } = await import("@/repositories/TombstoneRepository");
      const highestTombstone = workspace.id
        ? await TombstoneRepository.getHighestTombstonedGeneration("workspace", workspace.id)
        : 0;
      const allocatedGen = Math.max(workspace.lifecycleGeneration || 1, highestTombstone + 1);
      const candidate: Workspace = {
        ...workspace,
        lifecycleGeneration: allocatedGen,
        revision: workspace.revision || 1,
      };

      await WorkspaceRepository.saveWorkspace(candidate, { throwOnError: true });
      emitStateChange("workspace_changed", "tasks_screen");
    } catch (e) {
      console.warn("Failed to create workspace", e);
      throw e;
    }
  }
}
