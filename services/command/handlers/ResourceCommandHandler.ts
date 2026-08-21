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
    if (sourceWorkspaceId === targetWorkspaceId) {
      const map = await ResourceRepository.getResources(sourceWorkspaceId);
      if (!map[resourceId]) throw new Error(`Resource ${resourceId} not found`);
      return map[resourceId];
    }
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

    await ResourceRepository.saveResource(moved);
    try {
      await ResourceRepository.deleteResource(resourceId, sourceWorkspaceId);
    } catch (e) {
      console.warn(`[EntityCommandService] Failed to delete source resource ${resourceId} during move. Target workspace ${targetWorkspaceId} contains a ghost.`, e);
      throw e;
    }

    await MoveJournalRepository.removeOperation(operationId);
    if (!options?.skipEvents) emitStateChange("resources_changed", options?.source);
    if (!options?.skipAnalytics) void recordDailyHistorySnapshot().catch(() => {});
    return moved;
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
    const map = await ResourceRepository.getResources(workspaceId);
    const existing = map[resourceId];
    if (!existing) throw new Error(`Resource ${resourceId} not found`);
    const updated = { ...existing, ...updates, updatedAt: Date.now() };
    await ResourceRepository.saveResource(updated);
    if (!options?.skipEvents) emitStateChange("resources_changed", options?.source);
    if (!options?.skipAnalytics) void recordDailyHistorySnapshot().catch(() => {});
    return updated;
  }

static async restoreResource(recycleBinItemId: string, options?: CreateEntityOptions): Promise<Resource> {
    return restoreEntityFromBin<Resource>(
      recycleBinItemId,
      "resource",
      "resources_changed",
      options,
      (resource) => ResourceRepository.saveResource(resource),
      (resource) => ResourceRepository.deleteResource(resource.id, resource.workspaceId || INBOX_WORKSPACE_ID),
    );
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
