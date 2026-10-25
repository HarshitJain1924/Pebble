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
  type Relationship,
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
    // Order-only merge: a reorder snapshot must never revert a concurrent
    // rename nor delete a concurrently created workspace (see
    // WorkspaceRepository.applyWorkspaceOrder).
    // Strict: a failed write must reject the command instead of emitting a
    // success event while the persisted order stays the old one (task parity).
    await WorkspaceRepository.applyWorkspaceOrder(orderedWorkspaces, {
      throwOnError: true,
    });
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
   * defensive). Graph edges recorded in the package are re-added after the
   * partitions settle, but only when both endpoints are live again
   * (`restoreArchivedRelationships`). The bin entry is removed only after the
   * workspace persist succeeds; saveWorkspace swallows errors, so the persisted
   * workspace is read back to verify the restore actually happened.
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

      // 3. Persist the workspace metadata, but only if it is not already active.
      //
      // Retry safety: once the metadata write has committed, a later child
      // failure leaves the workspace active with its bin snapshot retained. The
      // retry must NOT re-apply the snapshot, or it would revert metadata the
      // user edited after the first attempt. Metadata persistence is therefore
      // the first durable checkpoint of the restore.
      const persistedWorkspaces = await WorkspaceRepository.getWorkspaces();
      const alreadyActive = persistedWorkspaces.some(
        (w) => w.id === workspace.id,
      );
      if (!alreadyActive) {
        workspace.revision = (workspace.revision ?? 1) + 1;
        workspace.lifecycleGeneration = workspace.lifecycleGeneration ?? 1;
        await WorkspaceRepository.saveWorkspace(workspace);

        // saveWorkspace swallows storage errors, so verify the workspace actually
        // persisted. If it did not, abort WITHOUT removing the bin item.
        const afterSave = await WorkspaceRepository.getWorkspaces();
        if (!afterSave.some((w) => w.id === workspace.id)) {
          throw new Error(`[EntityCommandService] Workspace ${workspace.id} failed to persist during restore`);
        }
      }

    // 5. Restore the archived children into their canonical partitions by MERGING
    // on id — never by replacing the partition. A partition may already contain
    // entities the user created (or the previous attempt already restored) after
    // the snapshot was taken; those must survive the retry untouched.
    let childRestoreSuccess = true;

    if (Array.isArray(parsed?.todos) && parsed.todos.length > 0) {
      try {
        await WorkspaceCommandHandler.mergeArchivedChildren(
          parsed.todos,
          () => TaskRepository.getTasks(workspace.id),
          (merged) => TaskRepository.saveTasksUnlocked(merged, workspace.id),
        );
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to restore tasks for workspace ${workspace.id}`, e);
        childRestoreSuccess = false;
      }
    }
    if (Array.isArray(parsed?.habits) && parsed.habits.length > 0) {
      try {
        await WorkspaceCommandHandler.mergeArchivedChildren(
          parsed.habits,
          () => HabitRepository.getHabits(workspace.id),
          (merged) => HabitRepository.saveHabitsUnlocked(merged, workspace.id),
        );
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to restore habits for workspace ${workspace.id}`, e);
        childRestoreSuccess = false;
      }
    }
    if (Array.isArray(parsed?.checklists) && parsed.checklists.length > 0) {
      try {
        const { ChecklistRepository } = await import("@/repositories/ChecklistRepository");
        await WorkspaceCommandHandler.mergeArchivedChildren(
          parsed.checklists,
          () => ChecklistRepository.getChecklists(workspace.id),
          (merged) => ChecklistRepository.saveChecklistsUnlocked(merged, workspace.id),
        );
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to restore checklists for workspace ${workspace.id}`, e);
        childRestoreSuccess = false;
      }
    }
    if (Array.isArray(parsed?.resources) && parsed.resources.length > 0) {
      try {
        const { ResourceRepository } = await import("@/repositories/ResourceRepository");
        await WorkspaceCommandHandler.mergeArchivedChildren(
          parsed.resources,
          () => ResourceRepository.getResources(workspace.id),
          (merged) => ResourceRepository.saveResourcesUnlocked(merged, workspace.id),
        );
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to restore resources for workspace ${workspace.id}`, e);
        childRestoreSuccess = false;
      }
    }

    // 5b. Rebuild the graph edges archived with the package. Runs after every
    // child partition so endpoints can be verified against live state.
    if (Array.isArray(parsed?.relationships) && parsed.relationships.length > 0) {
      try {
        await WorkspaceCommandHandler.restoreArchivedRelationships(
          parsed.relationships,
          workspace.id,
        );
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to restore relationships for workspace ${workspace.id}`, e);
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

    // 7. Emit one event per domain that actually changed. The workspace event
    // alone left open lists (tasks/habits/checklists/resources) showing stale
    // data until an unrelated event or refocus, because each screen subscribes
    // to its own domain event.
    if (!options?.skipEvents) {
      emitStateChange("workspace_mode_changed", options?.source);
      emitStateChange("workspace_changed", options?.source);
      if (Array.isArray(parsed?.todos) && parsed.todos.length > 0) {
        emitStateChange("tasks_changed", options?.source);
      }
      if (Array.isArray(parsed?.habits) && parsed.habits.length > 0) {
        emitStateChange("habits_changed", options?.source);
      }
      if (Array.isArray(parsed?.checklists) && parsed.checklists.length > 0) {
        emitStateChange("checklists_changed", options?.source);
      }
      if (Array.isArray(parsed?.resources) && parsed.resources.length > 0) {
        emitStateChange("resources_changed", options?.source);
      }
    }

    // 8. Reconcile notifications for restored workspace entities
    void import("@/services/notifications/NotificationReconcilerService")
      .then(({ NotificationReconcilerService }) => NotificationReconcilerService.reconcileAll())
      .catch((err) => console.warn("[restoreWorkspace] Notification reconciliation failed", err));

    return workspace;
    });
  }

/**
   * Restore an archived Workspace entity.
   * Restores the workspace to active state without touching children.
   */
  static async restoreWorkspaceArchive(
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<void> {
    const { withLock } = await import("@/shared/utils/mutex");

    // Lifecycle mutation: read, decide and write inside the workspace lifecycle
    // lock so a concurrent rename/archive cannot be reverted by a stale record,
    // and a failed write cannot be reported as success.
    const changed = await withLock(`ws_lifecycle_${workspaceId}`, async () => {
      const workspaces = await WorkspaceRepository.getWorkspaces();
      const workspace = workspaces.find((w) => w.id === workspaceId);
      if (!workspace) throw new Error("Workspace not found");

      const { assertLifecycleMutationAllowed } = await import(
        "../shared/command-lifecycle-guard"
      );
      await assertLifecycleMutationAllowed("workspace", workspace, options);

      if (!workspace.archivedAt) {
        // Already active, idempotent: no write, no event.
        return false;
      }

      const updated: Workspace = {
        ...workspace,
        archivedAt: undefined,
        revision: (workspace.revision ?? 1) + 1,
        lifecycleGeneration: workspace.lifecycleGeneration ?? 1,
        updatedAt: Date.now(),
      };

      await WorkspaceRepository.saveWorkspace(updated, { throwOnError: true });
      return true;
    });

    if (changed && !options?.skipEvents) {
      emitStateChange("workspace_changed", options?.source);
    }
  }

  static async archiveWorkspace(
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<void> {
    if (workspaceId === INBOX_WORKSPACE_ID || workspaceId === MY_PEBBLES_WORKSPACE_ID) {
      throw new Error("Cannot archive protected workspace.");
    }

    const { withLock } = await import("@/shared/utils/mutex");

    // Same lifecycle discipline as `restoreWorkspaceArchive` and
    // `updateWorkspace`: the whole read/decide/write sequence runs under
    // `ws_lifecycle_<id>`, the write is strict, and events are emitted only
    // after the record was durably persisted.
    const changed = await withLock(`ws_lifecycle_${workspaceId}`, async () => {
      const workspaces = await WorkspaceRepository.getWorkspaces();
      const workspace = workspaces.find((w) => w.id === workspaceId);
      if (!workspace) throw new Error("Workspace not found");

      const { assertLifecycleMutationAllowed } = await import(
        "../shared/command-lifecycle-guard"
      );
      await assertLifecycleMutationAllowed("workspace", workspace, options);

      if (workspace.archivedAt) {
        // Already archived, idempotent: no write, no event.
        return false;
      }

      const now = Date.now();
      const updated: Workspace = {
        ...workspace,
        archivedAt: now,
        revision: (workspace.revision ?? 1) + 1,
        lifecycleGeneration: workspace.lifecycleGeneration ?? 1,
        updatedAt: now,
      };

      await WorkspaceRepository.saveWorkspace(updated, { throwOnError: true });
      return true;
    });

    if (!changed) return;

    // Archiving the workspace must also silence its children's scheduled
    // reminders. They are cancelled after the durable archive commit (the
    // reconciler would eventually catch them, but only on its next pass, so the
    // reminder could fire for an archived workspace first). Cancellation is
    // best effort: the archive itself is already committed.
    try {
      const [tasksMap, habitsMap] = await Promise.all([
        TaskRepository.getTasks(workspaceId),
        HabitRepository.getHabits(workspaceId),
      ]);
      const ids = [
        ...Object.values(tasksMap).flatMap(
          (task) => task.reminder?.notificationIds ?? [],
        ),
        ...Object.values(habitsMap).flatMap(
          (habit) => habit.reminder?.notificationIds ?? [],
        ),
      ];
      if (ids.length > 0) {
        await cancelReminderIds(ids, { throwOnError: false });
      }
    } catch (e) {
      console.warn(
        `[EntityCommandService] Failed to cancel reminders for archived workspace ${workspaceId}`,
        e,
      );
    }

    if (!options?.skipEvents) {
      emitStateChange("workspace_changed", options?.source);
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

      const { withLocks } = await import("@/shared/utils/mutex");
      const locks = [
        `pebble:v1:tasks:${workspaceId}`,
        `pebble:v1:habits:${workspaceId}`,
        `pebble:v1:checklists:${workspaceId}`,
        `pebble:v1:resources:${workspaceId}`,
        `ws_lifecycle_${workspaceId}`
      ];
      let allEntityIds: string[] = [];
      let notificationIdsToCancel: string[] = [];

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

        const todosMap = await TaskRepository.getTasks(workspaceId);
        const habitsMap = await HabitRepository.getHabits(workspaceId);
        const checklistsMap = await ChecklistRepository.getChecklists(workspaceId);
        const resourcesMap = await ResourceRepository.getResources(workspaceId);

        const todos = Object.values(todosMap);
        const habits = Object.values(habitsMap);
        const checklists = Object.values(checklistsMap);
        const resources = Object.values(resourcesMap);

        allEntityIds = [
          ...todos.map(t => t.id),
          ...habits.map(h => h.id),
          ...checklists.map(c => c.id),
          ...resources.map(r => r.id),
        ];

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
        for (const checklist of checklists) {
          if (checklist.reminder?.notificationIds) {
            notificationIdsToCancel.push(...checklist.reminder.notificationIds);
          }
        }

        // 3. Capture the graph edges this package owns BEFORE anything is
        // destroyed. The entities travel with the package, but their
        // relationships are deleted below; without recording them a later
        // restore could never rebuild the internal graph (conversion
        // "supports"/"references" edges, manual "related" links).
        //
        // Ownership rule: only edges whose endpoints are ALL part of this
        // package are captured. An edge to an entity in another workspace is
        // owned by that dataset and cannot be verified as live during a
        // restore, so it is not resurrected. Focus provenance edges are
        // captured because the focus-session ledger survives the workspace;
        // the restore re-verifies that the session still exists.
        const entityIdSet = new Set(allEntityIds);
        const relationships = (await GraphRepository.getAllRelationships()).filter(
          (rel) => WorkspaceCommandHandler.isWorkspaceOwnedEdge(rel, entityIdSet),
        );

        // 4. Add to Recycle Bin (Safe operation first)
        await RecycleBinRepository.addToRecycleBin(
          "workspace",
          {
            list: workspace,
            todos,
            habits,
            checklists,
            resources,
            relationships,
          },
          "Workspaces",
          { throwOnError: true }
        );

        // 5. Delete Workspace record FIRST (Commit Point)
        // This MUST happen before partition cleanup. If partition cleanup happens first 
        // and metadata deletion fails, a subsequent retry will overwrite the safe Recycle Bin backup 
        // with empty partitions, causing permanent data loss.
        await WorkspaceRepository.deleteWorkspace(workspaceId, { throwOnError: true });

        // 6. Remove active partitions securely inside the lock boundary.
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

        // 7. Delete the archived entities' graph edges INSIDE the lifecycle
        // lock. Doing it after releasing the locks left a window where a
        // concurrent restore could re-add the package's edges and then have
        // them deleted by this (already committed) recycle.
        if (allEntityIds.length > 0) {
          try {
            await GraphRepository.deleteRelationshipsForEntities(allEntityIds);
          } catch (e) {
            console.warn(`[EntityCommandService] Failed to clean up graph edges for workspace ${workspaceId}`, e);
          }
        }
      });

      // 8. Secondary cleanup (OUTSIDE the partition locks: OS notification calls
      // must never extend the lock region).
      try {
        if (notificationIdsToCancel.length > 0) {
          await cancelReminderIds(notificationIdsToCancel, { throwOnError: false });
        }
      } catch (e) {
        console.warn(`[EntityCommandService] Async cleanup failed after deleting Workspace ${workspaceId}`, e);
        throw new Error("Workspace deleted, but some related data could not be fully cleaned up.");
      }

      // 7. Emit events
      emitStateChange("workspace_changed", "tasks_screen");
      void recordDailyHistorySnapshot().catch(() => {});
    } catch (e) {
      console.warn("Failed to delete workspace", e);
      throw e;
    }
  }  /**
   * Merge archived children into an active partition, keyed by entity id.
   *
   * Archived entities that already exist in the active partition are left as
   * they are (they are either the result of a previous partial attempt or an
   * entity the user created/edited afterwards). Only missing ids are added and
   * only those ids are written, so the operation is idempotent and never
   * truncates or rewrites live data.
   */
  private static async mergeArchivedChildren<T extends { id: string }>(
    archived: T[],
    readActive: () => Promise<Record<string, T>>,
    save: (missing: T[]) => Promise<void>,
  ): Promise<void> {
    const activeMap = await readActive();
    const missing = (Array.isArray(archived) ? archived : []).filter(
      (child) => child?.id && !activeMap[child.id],
    );
    if (missing.length === 0) return;
    // Persist ONLY the archived ids that are absent from the live partition.
    // Re-writing the whole merged map would bump `revision`/`updatedAt` on
    // unrelated live entities on every retry of an interrupted restore, which
    // looks like a user edit to the move reconciler and invalidates the
    // optimistic-concurrency tokens held by open screens.
    await save(missing);
  }

  /**
   * Whether a graph edge is owned by a workspace package, i.e. whether deleting
   * the workspace destroys information that ONLY the package can restore.
   */
  private static isWorkspaceOwnedEdge(
    rel: Relationship,
    entityIds: Set<string>,
  ): boolean {
    if (!rel?.source?.id || !rel?.target?.id) return false;
    const isChild = (endpoint: { id: string }) => entityIds.has(endpoint.id);
    // Both endpoints travel with the package: fully owned by the workspace.
    if (isChild(rel.source) && isChild(rel.target)) return true;
    // Focus provenance: the session lives in its own ledger and survives the
    // workspace, so this edge is restorable once the entity returns.
    if (rel.source.type === "focus" && isChild(rel.target)) return true;
    if (rel.target.type === "focus" && isChild(rel.source)) return true;
    return false;
  }

  /**
   * Re-add the graph edges archived with a workspace package.
   *
   * Endpoint existence is verified against LIVE state, so a restore can never
   * resurrect a dangling edge: child endpoints must be present in their
   * partitions after the merge, and focus endpoints must still exist in the
   * focus-session ledger. `GraphRepository.saveRelationship` is idempotent by
   * logical edge (relation type + endpoints), so retrying a partially-completed
   * restore cannot duplicate an edge.
   */
  private static async restoreArchivedRelationships(
    relationships: any[],
    workspaceId: string,
  ): Promise<void> {
    const { ChecklistRepository } = await import("@/repositories/ChecklistRepository");
    const { ResourceRepository } = await import("@/repositories/ResourceRepository");

    const liveEntityIds = new Set<string>();
    const livePartitions = await Promise.all([
      TaskRepository.getTasks(workspaceId),
      HabitRepository.getHabits(workspaceId),
      ChecklistRepository.getChecklists(workspaceId),
      ResourceRepository.getResources(workspaceId),
    ]);
    for (const partition of livePartitions) {
      for (const id of Object.keys(partition as Record<string, unknown>)) {
        liveEntityIds.add(id);
      }
    }

    const focusSessionIds = new Set(
      (await GraphRepository.getFocusSessions()).map((session) => session.id),
    );

    for (const rel of relationships) {
      if (
        !rel ||
        typeof rel.id !== "string" ||
        !rel.id ||
        !rel.source?.id ||
        !rel.target?.id ||
        !rel.relationType
      ) {
        continue;
      }
      const endpointAlive = (endpoint: { id: string; type?: string }) =>
        endpoint.type === "focus"
          ? focusSessionIds.has(endpoint.id)
          : liveEntityIds.has(endpoint.id);
      if (!endpointAlive(rel.source) || !endpointAlive(rel.target)) continue;
      await GraphRepository.saveRelationship(rel);
    }
  }

  /**
   * Permanently destroy a Workspace that is sitting in the Recycle Bin.
   *
   * This is the canonical counterpart of `permanentlyDeleteTask` for the
   * workspace *package* snapshot written by `deleteWorkspace`
   * (`{ list, todos, habits, checklists, resources }`). It:
   *   1. adds tombstones for the workspace and every archived child,
   *   2. purges the workspace metadata and its four partitioned keys,
   *   3. deletes graph relationships for the archived children,
   *   4. cancels the archived children's reminders,
   *   5. removes the bin entry (strict write) as the final commit step.
   *
   * Step 5 runs inside the same lock region as the destructive steps, so a
   * crash leaves the snapshot in the bin and the retry re-runs the sequence;
   * every step is a no-op when it already applied.
   */
  static async permanentlyDeleteWorkspace(
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<void> {
    if (
      workspaceId === INBOX_WORKSPACE_ID ||
      workspaceId === MY_PEBBLES_WORKSPACE_ID
    ) {
      throw new Error("Cannot delete protected workspace.");
    }

    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    const { TombstoneRepository } = await import("@/repositories/TombstoneRepository");
    const { withLocks } = await import("@/shared/utils/mutex");

    const partitionKeys = [
      `pebble:v1:tasks:${workspaceId}`,
      `pebble:v1:habits:${workspaceId}`,
      `pebble:v1:checklists:${workspaceId}`,
      `pebble:v1:resources:${workspaceId}`,
    ];
    const locks = [...partitionKeys, `ws_lifecycle_${workspaceId}`];

    type ArchivedChild = {
      type: "task" | "habit" | "checklist" | "resource";
      entity: {
        id?: string;
        lifecycleGeneration?: number;
        revision?: number;
        reminder?: { notificationIds?: string[] };
      };
    };

    let notificationIdsToCancel: string[] = [];

    await withLocks(locks, async () => {
      // EVERY input to the destructive decision is read INSIDE the lock.
      //
      // The previous version resolved the bin item, the archived snapshot and
      // the active workspace before acquiring the locks. A concurrent
      // `restoreWorkspace` (or a create reusing the id) committing in that
      // window made those pre-lock values stale: `activeWorkspace` stayed
      // undefined, so the metadata survived while the partitions were purged and
      // tombstones were written for a now-live workspace. Reading inside the lock
      // makes the decision observe the state it is about to destroy.
      const binItems = await RecycleBinRepository.getRecycleBinItems();
      const binItem = binItems.find(
        (i) =>
          i.entityType === "workspace" &&
          (i.entityId === workspaceId ||
            i.id === workspaceId ||
            i.id === `rb-${workspaceId}` ||
            i.id.startsWith(`rb-${workspaceId}-g`)),
      );

      let parsed: any = null;
      if (binItem) {
        try {
          parsed = JSON.parse(binItem.snapshot);
        } catch (e) {
          // Malformed snapshot: fail before any destructive step runs.
          throw new Error(
            `[EntityCommandService] Failed to parse workspace snapshot for ${workspaceId}`,
          );
        }
      }

      const archivedWorkspace: Workspace | undefined =
        parsed?.list ?? parsed ?? undefined;
      const activeWorkspaces = await WorkspaceRepository.getWorkspaces();
      const activeWorkspace = activeWorkspaces.find(
        (w) => w.id === workspaceId,
      );

      // Nothing active and nothing archived: the workspace was already destroyed.
      if (!activeWorkspace && !archivedWorkspace && !binItem) {
        throw new Error(`Workspace ${workspaceId} not found`);
      }

      const childPartitions: Array<[ArchivedChild["type"], any]> = [
        ["task", parsed?.todos],
        ["habit", parsed?.habits],
        ["checklist", parsed?.checklists],
        ["resource", parsed?.resources],
      ];
      const archivedChildren: ArchivedChild[] = childPartitions.flatMap(
        ([type, list]) =>
          (Array.isArray(list) ? list : []).map((entity: any) => ({
            type,
            entity,
          })),
      );
      const childIds = archivedChildren
        .map((child) => child.entity?.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
      notificationIdsToCancel = archivedChildren.flatMap(
        (child) => child.entity?.reminder?.notificationIds ?? [],
      );

      const now = Date.now();

      // 1. Tombstones — workspace + archived children, so neither can be
      // resurrected by a concurrent restore on the same device.
      if (archivedWorkspace?.id || activeWorkspace?.id) {
        const target = activeWorkspace ?? (archivedWorkspace as Workspace);
        await TombstoneRepository.addTombstone({
          id: `ts-workspace-${workspaceId}-g${target.lifecycleGeneration ?? 1}`,
          entityType: "workspace",
          entityId: workspaceId,
          lifecycleGeneration: target.lifecycleGeneration ?? 1,
          deletionRevision: target.revision ?? 1,
          deletedAt: now,
        });
      }

      for (const { type, entity } of archivedChildren) {
        if (!entity?.id) continue;
        await TombstoneRepository.addTombstone({
          id: `ts-${type}-${entity.id}-g${entity.lifecycleGeneration ?? 1}`,
          entityType: type,
          entityId: entity.id,
          lifecycleGeneration: entity.lifecycleGeneration ?? 1,
          deletionRevision: entity.revision ?? 1,
          deletedAt: now,
        });
      }

      // 2. Workspace metadata + child partitions.
      if (activeWorkspace) {
        await WorkspaceRepository.deleteWorkspace(workspaceId, {
          throwOnError: true,
        });
      }
      const AsyncStorage = (
        await import("@react-native-async-storage/async-storage")
      ).default;
      await AsyncStorage.multiRemove(partitionKeys);

      // 3. Graph relationships.
      if (childIds.length > 0) {
        await GraphRepository.deleteRelationshipsForEntitiesUnlocked(childIds);
      }

      // 4. Bin entry removal is the commit point — strict write.
      await RecycleBinRepository.removeRecycleBinItems(
        [binItem?.id ?? workspaceId, workspaceId],
        { throwOnError: true },
      );
    });

    if (notificationIdsToCancel.length > 0) {
      try {
        await cancelReminderIds(notificationIdsToCancel, {
          throwOnError: false,
        });
      } catch (e) {
        console.warn(
          `[EntityCommandService] Failed to cancel reminders for permanently deleted workspace ${workspaceId}`,
          e,
        );
      }
    }

    if (!options?.skipEvents) {
      emitStateChange("workspace_changed", options?.source);
    }
    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }
  }

/**
   * Update and persist a Workspace entity (e.g. rename workspace).
   */
  static async updateWorkspace(workspace: Workspace, options?: CreateEntityOptions): Promise<void> {
    try {
      const { withLock } = await import("@/shared/utils/mutex");
      const lockKey = `ws_lifecycle_${workspace.id}`;
      await withLock(lockKey, async () => {
        const workspaces = await WorkspaceRepository.getWorkspaces();
        const existing = workspaces.find((w) => w.id === workspace.id);
        if (!existing) {
          throw new Error(`Workspace ${workspace.id} not found`);
        }

        const { assertLifecycleMutationAllowed } = await import("../shared/command-lifecycle-guard");
        await assertLifecycleMutationAllowed("workspace", existing, options);

        const merged: Workspace = {
          ...existing,
          ...workspace,
          // Lifecycle state is owned by archive/restore, not by an edit. The
          // caller passes a whole snapshot that may predate a concurrent
          // archive (normalizeWorkspace always materializes `archivedAt`), so
          // taking it verbatim could silently unarchive the workspace when a
          // rename lands after an archive.
          id: existing.id,
          createdAt: existing.createdAt,
          archivedAt: existing.archivedAt,
          revision: (existing.revision ?? 1) + 1,
          lifecycleGeneration: existing.lifecycleGeneration ?? 1,
          updatedAt: Date.now(),
        };

        await WorkspaceRepository.saveWorkspace(merged, { throwOnError: true });
        emitStateChange("workspace_changed", options?.source || "tasks_screen");
      });
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
