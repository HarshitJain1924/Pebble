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
    if (sourceWorkspaceId === targetWorkspaceId) {
      const map = await ChecklistRepository.getChecklists(sourceWorkspaceId);
      if (!map[checklistId]) throw new Error(`Checklist ${checklistId} not found`);
      return map[checklistId];
    }
    const map = await ChecklistRepository.getChecklists(sourceWorkspaceId);
    const existing = map[checklistId];
    if (!existing) throw new Error(`Checklist ${checklistId} not found`);
    const moved: Checklist = { ...existing, workspaceId: targetWorkspaceId, updatedAt: Date.now() };

    const operationId = `move-${generateId()}`;
    await MoveJournalRepository.addOperation({
      operationId,
      entityId: checklistId,
      entityType: "checklist",
      sourceWorkspaceId,
      targetWorkspaceId,
      timestamp: Date.now(),
    });

    await ChecklistRepository.saveChecklist(moved);
    try {
      await ChecklistRepository.deleteChecklist(checklistId, sourceWorkspaceId);
    } catch (e) {
      console.warn(`[EntityCommandService] Failed to delete source checklist ${checklistId} during move. Target workspace ${targetWorkspaceId} contains a ghost.`, e);
      throw e;
    }

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
    const map = await ChecklistRepository.getChecklists(workspaceId);
    const existing = map[checklistId];
    if (!existing) throw new Error(`Checklist ${checklistId} not found`);
    const updated = { ...existing, ...updates, updatedAt: Date.now() };
    await ChecklistRepository.saveChecklist(updated);
    if (!options?.skipEvents) emitStateChange("checklists_changed", options?.source);
    if (!options?.skipAnalytics) void recordDailyHistorySnapshot().catch(() => {});
    return updated;
  }

static async restoreChecklist(recycleBinItemId: string, options?: CreateEntityOptions): Promise<Checklist> {
    return restoreEntityFromBin<Checklist>(
      recycleBinItemId,
      "checklist",
      "checklists_changed",
      options,
      (checklist) => ChecklistRepository.saveChecklist(checklist),
      (checklist) => ChecklistRepository.deleteChecklist(checklist.id, checklist.workspaceId || INBOX_WORKSPACE_ID),
    );
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


}
