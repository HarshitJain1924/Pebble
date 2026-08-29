import { WorkspaceCommandHandler } from "./WorkspaceCommandHandler";
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
import { HabitCommandHandler } from "./HabitCommandHandler";

import { CreateEntityOptions, isParsedProductivityItem } from "../types/command.types";
import { scheduleCreationNotifications, scheduleTaskNotifications, scheduleHabitNotifications } from "../shared/command-notifications";
import { restoreEntityFromBin } from "../shared/command-recovery";

export class ChecklistCommandHandler {
static async moveChecklist(
    checklistId: string,
    sourceWorkspaceId: string,
    targetWorkspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<Checklist> {
    const { withLocks } = await import("@/shared/utils/mutex");

    if (sourceWorkspaceId === targetWorkspaceId) {
      const map = await ChecklistRepository.getChecklists(sourceWorkspaceId);
      if (!map[checklistId]) throw new Error(`Checklist ${checklistId} not found`);
      return map[checklistId];
    }
    
    const sourceKey = `pebble:v1:checklists:${sourceWorkspaceId}`;
    const targetKey = `pebble:v1:checklists:${targetWorkspaceId}`;

    const { moved, operationId } = await withLocks([sourceKey, targetKey], async () => {
      const map = await ChecklistRepository.getChecklists(sourceWorkspaceId);
      const existing = map[checklistId];
      if (!existing) throw new Error(`Checklist ${checklistId} not found`);

      const { assertLifecycleMutationAllowed } = await import("../shared/command-lifecycle-guard");
      await assertLifecycleMutationAllowed("checklist", existing, options);

      const { WorkspaceRepository } = await import("@/repositories/WorkspaceRepository");
      const workspaces = await WorkspaceRepository.getWorkspaces();
      const { INBOX_WORKSPACE_ID, MY_PEBBLES_WORKSPACE_ID } = await import("@/shared/types/domain.types");
      if (!workspaces.some(w => w.id === targetWorkspaceId) && targetWorkspaceId !== INBOX_WORKSPACE_ID && targetWorkspaceId !== MY_PEBBLES_WORKSPACE_ID) {
        throw new Error(`Target workspace ${targetWorkspaceId} no longer exists.`);
      }

      const currentGen = existing.lifecycleGeneration || 1;
      const nextRev = (existing.revision || 1) + 1;
      const movedEntity: Checklist = {
        ...existing,
        workspaceId: targetWorkspaceId,
        revision: nextRev,
        lifecycleGeneration: currentGen,
        updatedAt: Date.now(),
      };

      const opId = `move-${generateId()}`;
      await MoveJournalRepository.addOperation({
        operationId: opId,
        operationType: "move",
        entityId: checklistId,
        entityType: "checklist",
        sourceWorkspaceId,
        targetWorkspaceId,
        timestamp: Date.now(),
        lifecycleGeneration: currentGen,
        expectedRevision: existing.revision || 1,
      });

      await ChecklistRepository.saveChecklistUnlocked(movedEntity);
      try {
        await ChecklistRepository.deleteChecklistUnlocked(checklistId, sourceWorkspaceId);
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to delete source checklist ${checklistId} during move. Target workspace ${targetWorkspaceId} contains a ghost.`, e);
        throw e;
      }

      return { moved: movedEntity, operationId: opId };
    });

    await MoveJournalRepository.removeOperation(operationId);
    if (!options?.skipEvents) emitStateChange("checklists_changed", options?.source);
    if (!options?.skipAnalytics) void recordDailyHistorySnapshot().catch(() => {});
    return moved;
  }

  static async updateChecklist(
    checklistId: string,
    workspaceId: string,
    updates: Partial<Omit<Checklist, "id" | "workspaceId">>,
    options?: CreateEntityOptions,
  ): Promise<Checklist> {
    const { withLock } = await import("@/shared/utils/mutex");
    const lockKey = `pebble:v1:checklists:${workspaceId}`;

    const updated = await withLock(lockKey, async () => {
      const map = await ChecklistRepository.getChecklists(workspaceId);
      const existing = map[checklistId];
      if (!existing) throw new Error(`Checklist ${checklistId} not found`);

      const { assertLifecycleMutationAllowed } = await import("../shared/command-lifecycle-guard");
      await assertLifecycleMutationAllowed("checklist", existing, options);

      const merged: Checklist = {
        ...existing,
        ...updates,
        revision: (existing.revision ?? 1) + 1,
        lifecycleGeneration: existing.lifecycleGeneration ?? 1,
        updatedAt: Date.now(),
      };
      await ChecklistRepository.saveChecklistUnlocked(merged);
      return merged;
    });

    if (!options?.skipEvents) emitStateChange("checklists_changed", options?.source);
    if (!options?.skipAnalytics) void recordDailyHistorySnapshot().catch(() => {});
    return updated;
  }

  static async restoreChecklist(recycleBinItemId: string, options?: CreateEntityOptions): Promise<Checklist> {
    const { withLock } = await import("@/shared/utils/mutex");
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    
    // Unlocked read to determine the target workspace before locking
    const initialBinItems = await RecycleBinRepository.getRecycleBinItems();
    const cleanId = recycleBinItemId.startsWith("rb-") ? recycleBinItemId.slice(3) : recycleBinItemId;
    const initialItem = initialBinItems.find(
      (i) => i.id === recycleBinItemId || i.entityId === recycleBinItemId || i.entityId === cleanId || i.id === `rb-${cleanId}` || i.id.startsWith(`rb-${cleanId}-g`)
    );
    if (!initialItem || initialItem.entityType !== "checklist") {
      throw new Error(`RecycleBin item not found or not checklist`);
    }
    
    const parsedData = JSON.parse(initialItem.snapshot) as Checklist & { workspaceId?: string };
    const targetWorkspaceId = parsedData.workspaceId || "inbox";
    const lockKey = `pebble:v1:checklists:${targetWorkspaceId}`;
    
    return await withLock(lockKey, async () => {
      // Re-read inside the lock to ensure it wasn't already restored
      const binItems = await RecycleBinRepository.getRecycleBinItems();
      const item = binItems.find(
        (i) => i.id === initialItem.id || i.id === recycleBinItemId || i.entityId === recycleBinItemId || i.entityId === cleanId || i.id === `rb-${cleanId}` || i.id.startsWith(`rb-${cleanId}-g`)
      );
      if (!item || item.entityType !== "checklist") {
        throw new Error(`RecycleBin item not found or not checklist`);
      }

      const currentParsedData = JSON.parse(item.snapshot) as Checklist & { workspaceId?: string };
      const currentWorkspaceId = currentParsedData.workspaceId || "inbox";
      
      if (currentWorkspaceId !== targetWorkspaceId) {
        throw new Error(`Concurrent modification: Target workspace changed from ${targetWorkspaceId} to ${currentWorkspaceId}`);
      }

      const { TombstoneRepository } = await import("@/repositories/TombstoneRepository");
      const highestTombstone = await TombstoneRepository.getHighestTombstonedGeneration("checklist", currentParsedData.id);
      const isDead = (currentParsedData.lifecycleGeneration || 1) <= highestTombstone || await TombstoneRepository.isTombstoned("checklist", currentParsedData.id, currentParsedData.lifecycleGeneration || 1);
      if (isDead) {
        try {
          await RecycleBinRepository.removeRecycleBinItems([item.id, recycleBinItemId], { throwOnError: true });
        } catch {}
        throw new Error(`[EntityCommandService] Checklist ${currentParsedData.id} was permanently deleted.`);
      }

      currentParsedData.revision = (currentParsedData.revision ?? 1) + 1;
      currentParsedData.lifecycleGeneration = currentParsedData.lifecycleGeneration ?? 1;

      const { generateId } = await import("@/shared/utils/id");
      const { MoveJournalRepository } = await import("@/repositories/MoveJournalRepository");
      const operationId = `restore-${generateId()}`;
      
      await MoveJournalRepository.addOperation({
        operationId,
        operationType: "restore",
        entityId: item.entityId,
        entityType: "checklist",
        sourceWorkspaceId: targetWorkspaceId,
        targetWorkspaceId,
        timestamp: Date.now(),
        lifecycleGeneration: currentParsedData.lifecycleGeneration,
        expectedRevision: currentParsedData.revision,
      });

      const { ChecklistRepository } = await import("@/repositories/ChecklistRepository");
      const existingActiveMap = await ChecklistRepository.getChecklists(targetWorkspaceId);
      const existingActive = existingActiveMap[currentParsedData.id];
      if (existingActive) {
        try {
          await RecycleBinRepository.removeRecycleBinItems([item.id, recycleBinItemId], { throwOnError: true });
        } catch {}
        await MoveJournalRepository.removeOperation(operationId);
        return existingActive;
      }

      await ChecklistRepository.saveChecklistUnlocked(currentParsedData);

      try {
        await RecycleBinRepository.removeRecycleBinItems([item.id, recycleBinItemId], { throwOnError: true });
      } catch (e) {
        console.warn(`[CommandRecovery] Failed to remove entity from Recycle Bin after restore. Recycle Bin contains a ghost.`, e);
      }

      await MoveJournalRepository.removeOperation(operationId);

      if (!options?.skipEvents) {
        const { emitStateChange } = await import("@/services/events/state-events");
        emitStateChange("checklists_changed", options?.source);
      }
      return currentParsedData;
    });
  }

  static async permanentlyDeleteChecklist(
    checklistId: string,
    workspaceId: string,
    options?: CreateEntityOptions
  ): Promise<void> {
    const { emitStateChange } = await import("@/services/events/state-events");
    const { withLock } = await import("@/shared/utils/mutex");
    const { TombstoneRepository } = await import("@/repositories/TombstoneRepository");

    const lockKey = `pebble:v1:checklists:${workspaceId}`;
    await withLock(lockKey, async () => {
      const checklistsMap = await ChecklistRepository.getChecklists(workspaceId);
      let checklist = checklistsMap[checklistId];
      let fromRecycleBin = false;

      if (!checklist) {
        const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
        const binItems = await RecycleBinRepository.getRecycleBinItems();
        const rbItem = binItems.find(
          (i) => (i.entityId === checklistId || i.id === checklistId) && i.entityType === "checklist"
        );
        if (rbItem) {
          try {
            checklist = JSON.parse(rbItem.snapshot);
            fromRecycleBin = true;
          } catch {}
        }
      }

      if (!checklist) throw new Error(`Checklist ${checklistId} not found`);

      const { assertLifecycleMutationAllowed } = await import("../shared/command-lifecycle-guard");
      await assertLifecycleMutationAllowed("checklist", checklist, options, { allowTombstoned: true });

      // 1. Add durable tombstone
      await TombstoneRepository.addTombstone({
        id: `ts-checklist-${checklist.id}-g${checklist.lifecycleGeneration ?? 1}`,
        entityType: "checklist",
        entityId: checklist.id,
        lifecycleGeneration: checklist.lifecycleGeneration ?? 1,
        deletionRevision: checklist.revision ?? 1,
        deletedAt: Date.now(),
      });

      // 2. Remove from active storage and recycle bin
      await ChecklistRepository.deleteChecklistUnlocked(checklistId, workspaceId);
      const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
      await RecycleBinRepository.removeRecycleBinItems([checklistId], { throwOnError: true });
    });

    if (!options?.skipEvents) emitStateChange("checklists_changed", options?.source);
    if (!options?.skipAnalytics) {
      const { recordDailyHistorySnapshot } = await import("@/services/analytics/productivity-history.service");
      void recordDailyHistorySnapshot().catch(() => {});
    }
  }

static async recycleChecklist(
    checklistId: string,
    workspaceId: string,
    options?: CreateEntityOptions
  ): Promise<void> {
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    const { ChecklistRepository } = await import("@/repositories/ChecklistRepository");
    const { withLock } = await import("@/shared/utils/mutex");

    const lockKey = `pebble:v1:checklists:${workspaceId}`;

    await withLock(lockKey, async () => {
      const checklists = await ChecklistRepository.getChecklists(workspaceId);
      const checklist = checklists[checklistId];
      if (!checklist) return;

      const { assertLifecycleMutationAllowed } = await import("../shared/command-lifecycle-guard");
      await assertLifecycleMutationAllowed("checklist", checklist, options);

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
        lifecycleGeneration: checklist.lifecycleGeneration || 1,
        expectedRevision: checklist.revision || 1,
      });

      await RecycleBinRepository.addToRecycleBin("checklist", checklist, workspaceId, { throwOnError: true });
      try {
        await ChecklistRepository.deleteChecklistUnlocked(checklistId, workspaceId);
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to delete active checklist ${checklistId} during recycle. Recycle bin contains a ghost.`, e);
        throw e;
      }
      
      await MoveJournalRepository.removeOperation(operationId);
    });

    if (!options?.skipEvents) {
      emitStateChange("checklists_changed", options?.source);
    }
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
    const { withLock } = await import("@/shared/utils/mutex");
    const lockKey = `pebble:v1:checklists:${workspaceId}`;

    const result = await withLock(lockKey, async () => {
      const checklistsMap = await ChecklistRepository.getChecklists(workspaceId);
      const checklist = checklistsMap[checklistId];
      if (!checklist) return null;

      const { assertLifecycleMutationAllowed } = await import("../shared/command-lifecycle-guard");
      await assertLifecycleMutationAllowed("checklist", checklist, options);

      const updatedChecklist: Checklist = {
        ...checklist,
        items: (checklist.items || []).filter((i) => i.id !== itemId),
        revision: (checklist.revision ?? 1) + 1,
        lifecycleGeneration: checklist.lifecycleGeneration ?? 1,
        updatedAt: Date.now(),
      };

      await ChecklistRepository.saveChecklistUnlocked(updatedChecklist);

      return { previous: checklist, updated: updatedChecklist };
    });

    if (!result) return null;

    if (!options?.skipEvents) {
      emitStateChange("checklists_changed", options?.source);
    }

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    return result;
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
    const { withLock } = await import("@/shared/utils/mutex");
    const lockKey = `pebble:v1:checklists:${workspaceId}`;

    const result = await withLock(lockKey, async () => {
      const checklistsMap = await ChecklistRepository.getChecklists(workspaceId);
      const checklist = checklistsMap[checklistId];
      if (!checklist) return null;

      const { assertLifecycleMutationAllowed } = await import("../shared/command-lifecycle-guard");
      await assertLifecycleMutationAllowed("checklist", checklist, options);

      const newItem = {
        id: `checklist-item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title: itemTitle,
        completed: false,
      };

      const updatedChecklist: Checklist = {
        ...checklist,
        items: [...(checklist.items || []), newItem],
        revision: (checklist.revision ?? 1) + 1,
        lifecycleGeneration: checklist.lifecycleGeneration ?? 1,
        updatedAt: Date.now(),
      };

      await ChecklistRepository.saveChecklistUnlocked(updatedChecklist);
      
      return { previous: checklist, updated: updatedChecklist };
    });
    
    if (!result) return null;

    if (!options?.skipEvents) {
      emitStateChange("checklists_changed", options?.source);
    }

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    return result;
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
    const { withLock } = await import("@/shared/utils/mutex");
    const lockKey = `pebble:v1:checklists:${workspaceId}`;

    const result = await withLock(lockKey, async () => {
      const checklistsMap = await ChecklistRepository.getChecklists(workspaceId);
      const checklist = checklistsMap[checklistId];
      if (!checklist) return null;

      const { assertLifecycleMutationAllowed } = await import("../shared/command-lifecycle-guard");
      await assertLifecycleMutationAllowed("checklist", checklist, options);

      const nextItems = (checklist.items || []).map((i) =>
        i.id === itemId ? { ...i, completed: !i.completed } : i
      );

      const wasComplete = checklist.items && checklist.items.length > 0 && checklist.items.every(i => i.completed);
      const isNowComplete = nextItems.length > 0 && nextItems.every(i => i.completed);

      const updatedChecklist: Checklist = {
        ...checklist,
        items: nextItems,
        revision: (checklist.revision ?? 1) + 1,
        lifecycleGeneration: checklist.lifecycleGeneration ?? 1,
        updatedAt: Date.now(),
      };

      if (isNowComplete && !wasComplete && !checklist.pebbleAwarded) {
        updatedChecklist.pebbleAwarded = true;
        await earnPebble("checklist", `checklist:${checklist.id}`);
      }

      await ChecklistRepository.saveChecklistUnlocked(updatedChecklist);

      return { previous: checklist, updated: updatedChecklist };
    });

    if (!result) return null;

    if (!options?.skipEvents) {
      emitStateChange("checklists_changed", options?.source);
    }

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    return result;
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
    const { withLock } = await import("@/shared/utils/mutex");
    const lockKey = `pebble:v1:checklists:${workspaceId}`;

    const { updated, skipped } = await withLock(lockKey, async () => {
      const map = await ChecklistRepository.getChecklists(workspaceId);
      const existing = map[checklistId];
      if (!existing) throw new Error(`Checklist ${checklistId} not found`);

      const { assertLifecycleMutationAllowed } = await import("../shared/command-lifecycle-guard");
      await assertLifecycleMutationAllowed("checklist", existing, options);

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

      if (itemsToAdd.length === 0) {
        return { updated: existing, skipped: true };
      }

      const updatedChecklist = {
        ...existing,
        items: [...existing.items, ...itemsToAdd],
        revision: (existing.revision ?? 1) + 1,
        lifecycleGeneration: existing.lifecycleGeneration ?? 1,
        updatedAt: Date.now(),
      };

      await ChecklistRepository.saveChecklistUnlocked(updatedChecklist);

      return { updated: updatedChecklist, skipped: false };
    });

    if (!skipped) {
      if (!options?.skipEvents) emitStateChange("checklists_changed", options?.source);
      if (!options?.skipAnalytics) void recordDailyHistorySnapshot().catch(() => {});
    }

    return updated;
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

    const targetWorkspace = isParsedProductivityItem(input)
      ? workspaceId || INBOX_WORKSPACE_ID
      : input.workspaceId || workspaceId || INBOX_WORKSPACE_ID;

    const { withLock } = await import("@/shared/utils/mutex");
    const { TombstoneRepository } = await import("@/repositories/TombstoneRepository");
    const lockKey = `pebble:v1:checklists:${targetWorkspace}`;

    checklist = await withLock(lockKey, async () => {
      let candidate: Checklist;
      if (isParsedProductivityItem(input)) {
        candidate = buildChecklist(input, targetWorkspace);
        if (options?.explicitId) {
          candidate.id = options.explicitId;
        }
      } else {
        const { generateId } = await import("@/shared/utils/id");
        candidate = {
          ...input,
          id: options?.explicitId || (input as any).id || generateId("checklist-"),
          workspaceId: targetWorkspace,
          revision: input.revision ?? 1,
          lifecycleGeneration: input.lifecycleGeneration ?? 1,
          createdAt: input.createdAt || Date.now(),
          updatedAt: Date.now(),
          items: input.items || [],
        };
      }

      // Authoritative generation allocation inside the partition lock:
      const activeChecklists = await ChecklistRepository.getChecklists(targetWorkspace);
      const activeExisting = candidate.id ? activeChecklists[candidate.id] : undefined;
      const activeGen = activeExisting?.lifecycleGeneration || 0;
      const highestTombstone = candidate.id
        ? await TombstoneRepository.getHighestTombstonedGeneration("checklist", candidate.id)
        : 0;
      const allocatedGen = Math.max(
        candidate.lifecycleGeneration || 1,
        activeGen + (activeExisting ? 1 : 0),
        highestTombstone + 1
      );

      candidate.lifecycleGeneration = allocatedGen;
      candidate.revision = candidate.revision || 1;

      // 1. Domain persistence FIRST
      await ChecklistRepository.saveChecklistUnlocked(candidate);
      return candidate;
    });

    if (!options?.skipEvents) {
      emitStateChange("checklists_changed", options?.source);
    }

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    return checklist;
  }


}
