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
      const moved: Resource = { ...existing, workspaceId: targetWorkspaceId, updatedAt: Date.now() };

      const operationId = `move-${generateId()}`;
      await MoveJournalRepository.addOperation({
        operationId,
        entityId: resourceId,
        entityType: "resource",
        sourceWorkspaceId,
        targetWorkspaceId,
        timestamp: Date.now(),
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
  ): Promise<{ resource: Resource, isArchived: boolean }> {
    const map = await ResourceRepository.getResources(workspaceId);
    const existing = map[resourceId];
    if (!existing) throw new Error(`Resource ${resourceId} not found`);
    
    const isArchived = !!existing.archivedAt;
    const updated = await this.updateResource(
      resourceId,
      workspaceId,
      { archivedAt: isArchived ? undefined : Date.now() },
      options
    );

    return { resource: updated, isArchived: !isArchived };
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
    const { getRecycleBinItems } = await import("@/services/storage/storage.service");
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    
    // Unlocked read to determine the target workspace before locking
    const initialBinItems = await getRecycleBinItems();
    const initialItem = initialBinItems.find((i) => i.id === recycleBinItemId);
    if (!initialItem || initialItem.entityType !== "resource") {
      throw new Error(`RecycleBin item not found or not resource`);
    }
    
    const parsedData = JSON.parse(initialItem.snapshot) as Resource & { workspaceId?: string };
    const targetWorkspaceId = parsedData.workspaceId || "inbox";
    const lockKey = `pebble:v1:resources:${targetWorkspaceId}`;
    
    return await withLock(lockKey, async () => {
      // Re-read inside the lock to ensure it wasn't already restored
      const binItems = await getRecycleBinItems();
      const item = binItems.find((i) => i.id === recycleBinItemId);
      if (!item || item.entityType !== "resource") {
        throw new Error(`RecycleBin item not found or not resource`);
      }

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
      });

      const { ResourceRepository } = await import("@/repositories/ResourceRepository");
      await ResourceRepository.saveResourceUnlocked(parsedData);

      try {
        await RecycleBinRepository.removeRecycleBinItems([recycleBinItemId], { throwOnError: true });
      } catch (e) {
        console.warn(`[CommandRecovery] Failed to remove entity from Recycle Bin after restore. Recycle Bin contains a ghost.`, e);
      }

      await MoveJournalRepository.removeOperation(operationId);

      if (!options?.skipEvents) {
        const { emitStateChange } = await import("@/services/events/state-events");
        emitStateChange("resources_changed", options?.source);
      }
      return parsedData;
    });
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


}
