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
import { ChecklistCommandHandler } from "./ChecklistCommandHandler";

import { CreateEntityOptions, isParsedProductivityItem } from "../types/command.types";
import { scheduleCreationNotifications, scheduleTaskNotifications, scheduleHabitNotifications } from "../shared/command-notifications";
import { restoreEntityFromBin } from "../shared/command-recovery";

export class ResourceCommandHandler {
  static async moveResource(
    resourceId: string,
    sourceWorkspaceId: string,
    targetWorkspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<Resource> {
    const { withLocks } = await import("@/shared/utils/mutex");

    if (sourceWorkspaceId === targetWorkspaceId) {
      const map = await ResourceRepository.getResources(sourceWorkspaceId);
      if (!map[resourceId]) throw new Error(`Resource ${resourceId} not found`);
      return map[resourceId];
    }

    const sourceKey = `pebble:v1:resources:${sourceWorkspaceId}`;
    const targetKey = `pebble:v1:resources:${targetWorkspaceId}`;

    return await withLocks([sourceKey, targetKey], async () => {
      const map = await ResourceRepository.getResources(sourceWorkspaceId);
      const existing = map[resourceId];
      if (!existing) throw new Error(`Resource ${resourceId} not found`);

      const { WorkspaceRepository } = await import("@/repositories/WorkspaceRepository");
      const workspaces = await WorkspaceRepository.getWorkspaces();
      const { INBOX_WORKSPACE_ID, MY_PEBBLES_WORKSPACE_ID } = await import("@/shared/types/domain.types");
      if (!workspaces.some(w => w.id === targetWorkspaceId) && targetWorkspaceId !== INBOX_WORKSPACE_ID && targetWorkspaceId !== MY_PEBBLES_WORKSPACE_ID) {
        throw new Error(`Target workspace ${targetWorkspaceId} no longer exists.`);
      }

      const currentGen = existing.lifecycleGeneration || 1;
      const nextRev = (existing.revision || 1) + 1;
      const moved: Resource = {
        ...existing,
        workspaceId: targetWorkspaceId,
        revision: nextRev,
        lifecycleGeneration: currentGen,
        updatedAt: Date.now(),
      };

      const operationId = `move-${generateId()}`;
      await MoveJournalRepository.addOperation({
        operationId,
        operationType: "move",
        entityId: resourceId,
        entityType: "resource",
        sourceWorkspaceId,
        targetWorkspaceId,
        timestamp: Date.now(),
        lifecycleGeneration: currentGen,
        expectedRevision: existing.revision || 1,
      });

      await ResourceRepository.saveResourceUnlocked(moved);
      try {
        await ResourceRepository.deleteResourceUnlocked(resourceId, sourceWorkspaceId);
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to delete source resource ${resourceId} during move. Target workspace ${targetWorkspaceId} contains a ghost.`, e);
        throw e;
      }

      await MoveJournalRepository.removeOperation(operationId);
      if (!options?.skipEvents) emitStateChange("resources_changed", options?.source);
      if (!options?.skipAnalytics) void recordDailyHistorySnapshot().catch(() => {});
      return moved;
    });
  }

  static async toggleArchiveResource(
    resourceId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<{ resource: Resource; isArchived: boolean }> {
    const { withLock } = await import("@/shared/utils/mutex");
    const lockKey = `pebble:v1:resources:${workspaceId}`;

    const { updated, isArchived } = await withLock(lockKey, async () => {
      const map = await ResourceRepository.getResources(workspaceId);
      const existing = map[resourceId];
      if (!existing) throw new Error(`Resource ${resourceId} not found`);

      const willBeArchived = !existing.archivedAt;
      const merged: Resource = {
        ...existing,
        archivedAt: willBeArchived ? Date.now() : undefined,
        updatedAt: Date.now(),
      };
      await ResourceRepository.saveResourceUnlocked(merged);
      return { updated: merged, isArchived: willBeArchived };
    });

    if (!options?.skipEvents) emitStateChange("resources_changed", options?.source);
    if (!options?.skipAnalytics) void recordDailyHistorySnapshot().catch(() => {});
    return { resource: updated, isArchived };
  }

  static async updateResource(
    resourceId: string,
    workspaceId: string,
    updates: Partial<Omit<Resource, "id" | "workspaceId">>,
    options?: CreateEntityOptions,
  ): Promise<Resource> {
    const { withLock } = await import("@/shared/utils/mutex");
    const lockKey = `pebble:v1:resources:${workspaceId}`;

    const updated = await withLock(lockKey, async () => {
      const map = await ResourceRepository.getResources(workspaceId);
      const existing = map[resourceId];
      if (!existing) throw new Error(`Resource ${resourceId} not found`);
      const merged = { ...existing, ...updates, updatedAt: Date.now() };
      await ResourceRepository.saveResourceUnlocked(merged);
      return merged;
    });

    if (!options?.skipEvents) emitStateChange("resources_changed", options?.source);
    if (!options?.skipAnalytics) void recordDailyHistorySnapshot().catch(() => {});
    return updated;
  }

  static async restoreResource(recycleBinItemId: string, options?: CreateEntityOptions): Promise<Resource> {
    const { withLock } = await import("@/shared/utils/mutex");
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    
    // Unlocked read to determine the target workspace before locking
    const initialBinItems = await RecycleBinRepository.getRecycleBinItems();
    const cleanId = recycleBinItemId.startsWith("rb-") ? recycleBinItemId.slice(3) : recycleBinItemId;
    const initialItem = initialBinItems.find(
      (i) => i.id === recycleBinItemId || i.entityId === recycleBinItemId || i.entityId === cleanId || i.id === `rb-${cleanId}` || i.id.startsWith(`rb-${cleanId}-g`)
    );
    if (!initialItem || initialItem.entityType !== "resource") {
      throw new Error(`RecycleBin item not found or not resource`);
    }
    
    const parsedData = JSON.parse(initialItem.snapshot) as Resource & { workspaceId?: string };
    const targetWorkspaceId = parsedData.workspaceId || "inbox";
    const lockKey = `pebble:v1:resources:${targetWorkspaceId}`;
    
    return await withLock(lockKey, async () => {
      // Re-read inside the lock to ensure it wasn't already restored
      const binItems = await RecycleBinRepository.getRecycleBinItems();
      const item = binItems.find(
        (i) => i.id === initialItem.id || i.id === recycleBinItemId || i.entityId === recycleBinItemId || i.entityId === cleanId || i.id === `rb-${cleanId}` || i.id.startsWith(`rb-${cleanId}-g`)
      );
      if (!item || item.entityType !== "resource") {
        throw new Error(`RecycleBin item not found or not resource`);
      }

      const currentParsedData = JSON.parse(item.snapshot) as Resource & { workspaceId?: string };
      const currentWorkspaceId = currentParsedData.workspaceId || "inbox";
      
      if (currentWorkspaceId !== targetWorkspaceId) {
        throw new Error(`Concurrent modification: Target workspace changed from ${targetWorkspaceId} to ${currentWorkspaceId}`);
      }

      const { TombstoneRepository } = await import("@/repositories/TombstoneRepository");
      const highestTombstone = await TombstoneRepository.getHighestTombstonedGeneration("resource", currentParsedData.id);
      const isDead = (currentParsedData.lifecycleGeneration || 1) <= highestTombstone || await TombstoneRepository.isTombstoned("resource", currentParsedData.id, currentParsedData.lifecycleGeneration || 1);
      if (isDead) {
        try {
          await RecycleBinRepository.removeRecycleBinItems([item.id, recycleBinItemId], { throwOnError: true });
        } catch {}
        throw new Error(`[EntityCommandService] Resource ${currentParsedData.id} was permanently deleted.`);
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
        entityType: "resource",
        sourceWorkspaceId: targetWorkspaceId,
        targetWorkspaceId,
        timestamp: Date.now(),
        lifecycleGeneration: currentParsedData.lifecycleGeneration,
        expectedRevision: currentParsedData.revision,
      });

      const { ResourceRepository } = await import("@/repositories/ResourceRepository");
      const existingActiveMap = await ResourceRepository.getResources(targetWorkspaceId);
      const existingActive = existingActiveMap[currentParsedData.id];
      if (existingActive) {
        try {
          await RecycleBinRepository.removeRecycleBinItems([item.id, recycleBinItemId], { throwOnError: true });
        } catch {}
        await MoveJournalRepository.removeOperation(operationId);
        return existingActive;
      }

      await ResourceRepository.saveResourceUnlocked(currentParsedData);

      try {
        await RecycleBinRepository.removeRecycleBinItems([item.id, recycleBinItemId], { throwOnError: true });
      } catch (e) {
        console.warn(`[CommandRecovery] Failed to remove entity from Recycle Bin after restore. Recycle Bin contains a ghost.`, e);
      }

      await MoveJournalRepository.removeOperation(operationId);

      if (!options?.skipEvents) {
        const { emitStateChange } = await import("@/services/events/state-events");
        emitStateChange("resources_changed", options?.source);
      }
      return currentParsedData;
    });
  }

  static async permanentlyDeleteResource(
    resourceId: string,
    workspaceId: string,
    options?: { skipEvents?: boolean; skipAnalytics?: boolean; source?: string }
  ): Promise<void> {
    const { emitStateChange } = await import("@/services/events/state-events");
    const { withLock } = await import("@/shared/utils/mutex");
    const { TombstoneRepository } = await import("@/repositories/TombstoneRepository");

    const lockKey = `pebble:v1:resources:${workspaceId}`;
    await withLock(lockKey, async () => {
      const resourcesMap = await ResourceRepository.getResources(workspaceId);
      let resource = resourcesMap[resourceId];
      let fromRecycleBin = false;

      if (!resource) {
        const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
        const binItems = await RecycleBinRepository.getRecycleBinItems();
        const rbItem = binItems.find(
          (i) => (i.entityId === resourceId || i.id === resourceId) && i.entityType === "resource"
        );
        if (rbItem) {
          try {
            resource = JSON.parse(rbItem.snapshot);
            fromRecycleBin = true;
          } catch {}
        }
      }

      if (!resource) throw new Error(`Resource ${resourceId} not found`);

      // 1. Add durable tombstone
      await TombstoneRepository.addTombstone({
        id: `ts-resource-${resource.id}-g${resource.lifecycleGeneration ?? 1}`,
        entityType: "resource",
        entityId: resource.id,
        lifecycleGeneration: resource.lifecycleGeneration ?? 1,
        deletionRevision: resource.revision ?? 1,
        deletedAt: Date.now(),
      });

      // 2. Remove from active storage and recycle bin
      if (!fromRecycleBin) {
        await ResourceRepository.deleteResourceUnlocked(resourceId, workspaceId);
      }
      const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
      await RecycleBinRepository.removeRecycleBinItems([resourceId]);
    });

    if (!options?.skipEvents) emitStateChange("resources_changed", options?.source);
    if (!options?.skipAnalytics) {
      const { recordDailyHistorySnapshot } = await import("@/services/analytics/productivity-history.service");
      void recordDailyHistorySnapshot().catch(() => {});
    }
  }

  static async recycleResource(
    resourceId: string,
    workspaceId: string,
    options?: { skipEvents?: boolean; source?: string }
  ): Promise<void> {
    const { withLock } = await import("@/shared/utils/mutex");
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    const { ResourceRepository } = await import("@/repositories/ResourceRepository");
    
    const lockKey = `pebble:v1:resources:${workspaceId}`;
    await withLock(lockKey, async () => {
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
        lifecycleGeneration: resource.lifecycleGeneration || 1,
        expectedRevision: resource.revision || 1,
      });

      await RecycleBinRepository.addToRecycleBin("resource", resource, workspaceId, { throwOnError: true });
      try {
        await ResourceRepository.deleteResourceUnlocked(resourceId, workspaceId);
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to delete active resource ${resourceId} during recycle. Recycle bin contains a ghost.`, e);
        throw e;
      }

      await MoveJournalRepository.removeOperation(operationId);
    });

    if (!options?.skipEvents) {
      emitStateChange("resources_changed", options?.source);
    }
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

    const targetWorkspace = isParsedProductivityItem(input)
      ? workspaceId || INBOX_WORKSPACE_ID
      : input.workspaceId || workspaceId || INBOX_WORKSPACE_ID;

    const { withLock } = await import("@/shared/utils/mutex");
    const { TombstoneRepository } = await import("@/repositories/TombstoneRepository");
    const lockKey = `pebble:v1:resources:${targetWorkspace}`;

    resource = await withLock(lockKey, async () => {
      let candidate: Resource;
      if (isParsedProductivityItem(input)) {
        candidate = buildResource(input, targetWorkspace);
      } else {
        candidate = {
          ...input,
          workspaceId: targetWorkspace,
          revision: input.revision ?? 1,
          lifecycleGeneration: input.lifecycleGeneration ?? 1,
          createdAt: input.createdAt || Date.now(),
          updatedAt: Date.now(),
          tags: input.tags || [],
        };
      }

      // Authoritative generation allocation inside the partition lock:
      const highestTombstone = candidate.id
        ? await TombstoneRepository.getHighestTombstonedGeneration("resource", candidate.id)
        : 0;
      const allocatedGen = Math.max(candidate.lifecycleGeneration || 1, highestTombstone + 1);

      candidate.lifecycleGeneration = allocatedGen;
      candidate.revision = candidate.revision || 1;

      // 1. Domain persistence FIRST
      await ResourceRepository.saveResourceUnlocked(candidate);
      return candidate;
    });

    if (!options?.skipEvents) {
      emitStateChange("resources_changed", options?.source);
    }

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    return resource;
  }
}
