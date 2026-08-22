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

import { CreateEntityOptions, isParsedProductivityItem } from "../types/command.types";
import { scheduleCreationNotifications, scheduleTaskNotifications, scheduleHabitNotifications } from "../shared/command-notifications";
import { restoreEntityFromBin } from "../shared/command-recovery";

export class HabitCommandHandler {
static async moveHabit(
    habitId: string,
    sourceWorkspaceId: string,
    targetWorkspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<Habit> {
    if (sourceWorkspaceId === targetWorkspaceId) {
      const map = await HabitRepository.getHabits(sourceWorkspaceId);
      if (!map[habitId]) throw new Error(`Habit ${habitId} not found`);
      return map[habitId];
    }
    const map = await HabitRepository.getHabits(sourceWorkspaceId);
    const existing = map[habitId];
    if (!existing) throw new Error(`Habit ${habitId} not found`);
    const moved: Habit = { ...existing, workspaceId: targetWorkspaceId, updatedAt: Date.now() };

    const operationId = `move-${generateId()}`;
    await MoveJournalRepository.addOperation({
      operationId,
      entityId: habitId,
      entityType: "habit",
      sourceWorkspaceId,
      targetWorkspaceId,
      timestamp: Date.now(),
    });

    await HabitRepository.saveHabit(moved);
    try {
      await HabitRepository.deleteHabit(habitId, sourceWorkspaceId);
    } catch (e) {
      console.warn(`[EntityCommandService] Failed to delete source habit ${habitId} during move. Target workspace ${targetWorkspaceId} contains a ghost.`, e);
      throw e;
    }

    await MoveJournalRepository.removeOperation(operationId);
    if (!options?.skipEvents) emitStateChange("habits_changed", options?.source);
    if (!options?.skipAnalytics) void recordDailyHistorySnapshot().catch(() => {});
    void syncWidgetData().catch(() => {});
    return moved;
  }

static async permanentlyDeleteHabit(
    habitId: string,
    workspaceId: string,
    options?: { skipEvents?: boolean; skipAnalytics?: boolean; source?: string }
  ): Promise<void> {
    const { cancelReminderIds } = await import("@/services/scheduling/reminders.service");
    const { emitStateChange } = await import("@/services/events/state-events");

    const habitsMap = await HabitRepository.getHabits(workspaceId);
    const habit = habitsMap[habitId];
    if (!habit) throw new Error(`Habit ${habitId} not found`);

    // 1. Remove from active storage FIRST
    await HabitRepository.deleteHabit(habitId, workspaceId);

    // 2. Cancel native reminders (Fire and forget)
    if (habit.reminder?.notificationIds?.length) {
      cancelReminderIds(habit.reminder.notificationIds, { throwOnError: false }).catch(e => {
        console.warn(`[EntityCommandService] Failed to cancel reminders for permanently deleted habit ${habitId}`, e);
      });
    }

    if (!options?.skipEvents) emitStateChange("habits_changed", options?.source);
    if (!options?.skipAnalytics) {
      const { recordDailyHistorySnapshot } = await import("@/services/analytics/productivity-history.service");
      void recordDailyHistorySnapshot().catch(() => {});
    }
  }

static async restoreHabit(
    recycleBinItemId: string,
    options?: CreateEntityOptions
  ): Promise<Habit> {
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    
    const items = await RecycleBinRepository.getRecycleBinItems();
    // Resolve by either the RecycleBin item ID ("rb-{entityId}") or the raw entity
    // ID so callers (e.g. bulk-delete Undo in useTasksState) can pass what they have.
    const item = items.find(i => i.id === recycleBinItemId || i.entityId === recycleBinItemId);
    if (!item || item.entityType !== "habit") throw new Error("Invalid habit recycle bin item");

    const habit: Habit = JSON.parse(item.snapshot);
    habit.reminder = habit.reminder ? { ...habit.reminder, notificationIds: undefined } : undefined;
    
    const targetWorkspaceId = habit.workspaceId || INBOX_WORKSPACE_ID;
    const { generateId } = await import("@/shared/utils/id");
    const { MoveJournalRepository } = await import("@/repositories/MoveJournalRepository");
    const operationId = `restore-${generateId()}`;
    
    await MoveJournalRepository.addOperation({
      operationId,
      operationType: "restore",
      entityId: item.entityId,
      entityType: "habit",
      sourceWorkspaceId: targetWorkspaceId,
      targetWorkspaceId,
      timestamp: Date.now(),
    });

    const restored = await this.createHabit(habit, targetWorkspaceId, options);
    
    try {
      const remaining = items.filter(i => i.id !== item.id);
      await RecycleBinRepository.saveRecycleBinItems(remaining, { throwOnError: true });
    } catch (e) {
      console.warn(`[EntityCommandService] Failed to remove habit from Recycle Bin after restore. Recycle Bin contains a ghost.`, e);
    }
    
    await MoveJournalRepository.removeOperation(operationId);
    
    return restored;
  }

static async recycleHabit(
    habitId: string,
    workspaceId: string,
    options?: { skipEvents?: boolean; skipAnalytics?: boolean; source?: string }
  ): Promise<void> {
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    const { cancelReminderIds } = await import("@/services/scheduling/reminders.service");
    
    const habitMap = await HabitRepository.getHabits(workspaceId);
    const habit = habitMap[habitId];
    if (!habit) return;

    const { generateId } = await import("@/shared/utils/id");
    const { MoveJournalRepository } = await import("@/repositories/MoveJournalRepository");
    const operationId = `recycle-${generateId()}`;
    await MoveJournalRepository.addOperation({
      operationId,
      operationType: "recycle",
      entityId: habitId,
      entityType: "habit",
      sourceWorkspaceId: workspaceId,
      targetWorkspaceId: workspaceId,
      timestamp: Date.now(),
    });

    await RecycleBinRepository.addToRecycleBin("habit", habit, workspaceId, { throwOnError: true });

    try {
      await HabitRepository.deleteHabit(habitId, workspaceId);
    } catch (e) {
      console.warn(`[EntityCommandService] Failed to delete active habit ${habitId} during recycle. Recycle bin contains a ghost.`, e);
      throw e;
    }

    await MoveJournalRepository.removeOperation(operationId);

    if (habit.reminder?.notificationIds?.length) {
      cancelReminderIds(habit.reminder.notificationIds, { throwOnError: false }).catch(e => {
        console.warn(`[EntityCommandService] Failed to cancel reminders for recycled habit ${habitId}`, e);
      });
    }

    if (!options?.skipEvents) {
      emitStateChange("habits_changed", options?.source);
    }
  }

/**
   * Recover a Habit's streak by injecting a completion for yesterday.
   */
  static async recoverHabitStreak(
    habitId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<{ previous: Habit; updated: Habit } | null> {
    const habitsMap = await HabitRepository.getHabits(workspaceId);
    const habit = habitsMap[habitId];
    if (!habit) return null;

    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

    const updatedHistory = [
      ...(habit.completionHistory || []),
      { date: yesterdayKey, completedAt: Date.now() },
    ];

    const updatedHabit: Habit = {
      ...habit,
      completionHistory: updatedHistory,
      updatedAt: Date.now(),
    };

    await HabitRepository.saveHabit(updatedHabit);

    if (!options?.skipEvents) {
      emitStateChange("habits_changed", options?.source);
      emitStateChange("pebbles_changed", options?.source);
    }

    return { previous: habit, updated: updatedHabit };
  }

/**
   * Uncomplete a Habit for today.
   */
  static async uncompleteHabit(
    habitId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<{ previous: Habit; updated: Habit } | null> {
    const habitsMap = await HabitRepository.getHabits(workspaceId);
    const habit = habitsMap[habitId];
    if (!habit) return null;

    const today = getTodayDateKey();
    if (!isHabitCompletedToday(habit, today)) {
      return { previous: habit, updated: habit };
    }

    const completionHistory = (habit.completionHistory || []).filter(
      (c) => c.date !== today
    );

    const tempHabit: Habit = { ...habit, completionHistory };
    const streak = getHabitCurrentStreak(tempHabit, today);
    const lastCompletedDate = getHabitLastCompletedDate(tempHabit);

    const updatedHabit: Habit = {
      ...habit,
      completionHistory,
      streak,
      lastCompletedDate,
      updatedAt: Date.now(),
    };

    await HabitRepository.saveHabit(updatedHabit);

    await reversePebbleReward(`habit:${habit.id}:${today}`);

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    void syncWidgetData().catch(() => {});

    if (!options?.skipEvents) {
      emitStateChange("habits_changed", options?.source);
    }

    return { previous: habit, updated: updatedHabit };
  }

/**
   * Complete a Habit for today.
   */
  static async completeHabit(
    habitId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<{ previous: Habit; updated: Habit } | null> {
    const habitsMap = await HabitRepository.getHabits(workspaceId);
    const habit = habitsMap[habitId];
    if (!habit) return null;

    const today = getTodayDateKey();
    if (isHabitCompletedToday(habit, today)) {
      return { previous: habit, updated: habit };
    }

    const completionHistory = [...(habit.completionHistory || [])];
    if (!completionHistory.some((e: any) => e.date === today)) {
      completionHistory.push({ date: today, completedAt: Date.now() });
    }

    const tempHabit: Habit = { ...habit, completionHistory };
    const streak = getHabitCurrentStreak(tempHabit, today);
    const bestStreak = Math.max(habit.bestStreak || 0, getHabitBestStreak(tempHabit));

    const updatedHabit: Habit = {
      ...habit,
      completionHistory,
      streak,
      bestStreak,
      lastCompletedDate: today,
      updatedAt: Date.now(),
    };

    await HabitRepository.saveHabit(updatedHabit);

    await earnPebble("habit", `habit:${habit.id}:${today}`);
    pluginManager.dispatchHabitCompleted(updatedHabit);

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    void syncWidgetData().catch(() => {});

    if (!options?.skipEvents) {
      emitStateChange("habits_changed", options?.source);
    }

    return { previous: habit, updated: updatedHabit };
  }

/**
   * Bulk-archive Habits with the same side effects as updateHabit({ archivedAt }) —
   * reminder cancellation + notification-ID clearing, events and analytics.
   */
  static async archiveHabits(
    items: { habitId: string; workspaceId: string }[],
    options?: CreateEntityOptions,
  ): Promise<Habit[]> {
    const updated: Habit[] = [];
    for (const item of items) {
      const habit = await this.updateHabit(
        item.habitId,
        item.workspaceId,
        { archivedAt: Date.now(), updatedAt: Date.now() },
        { source: options?.source, skipEvents: true, skipAnalytics: true },
      );
      updated.push(habit);
    }
    if (updated.length > 0) {
      if (!options?.skipAnalytics) {
        void recordDailyHistorySnapshot().catch(() => {});
      }
      if (!options?.skipEvents) {
        emitStateChange("habits_changed", options?.source);
      }
    }
    return updated;
  }

/**
   * Bulk-complete Habits for today with the same side effects as completeHabit.
   */
  static async completeHabits(
    items: { habitId: string; workspaceId: string }[],
    options?: CreateEntityOptions,
  ): Promise<Habit[]> {
    const updated: Habit[] = [];
    for (const item of items) {
      const result = await this.completeHabit(item.habitId, item.workspaceId, {
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
      // Widget sync already fires per item inside completeHabit.
      if (!options?.skipEvents) {
        emitStateChange("habits_changed", options?.source);
      }
    }
    return updated;
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
    const { withLock } = await import("@/shared/utils/mutex");
    const key = `pebble:v1:habits:${workspaceId}`;

    let needsReminderUpdate = false;
    let existing: Habit | undefined;
    
    let updatedHabit = await withLock(key, async () => {
      const habitsMap = await HabitRepository.getHabits(workspaceId);
      existing = habitsMap[habitId];
      if (!existing) {
        throw new Error(`Habit ${habitId} not found in workspace ${workspaceId}`);
      }

      if (updates.workspaceId && updates.workspaceId !== workspaceId) {
        throw new Error("Workspace movement is not supported in updateHabit.");
      }

      let mergedHabit: Habit = {
        ...existing,
        ...updates,
        updatedAt: Date.now(),
      };

      const titleChanged = updates.title !== undefined && updates.title !== existing.title;
      const categoryChanged = updates.categoryId !== undefined && updates.categoryId !== existing.categoryId;
      const recurrenceChanged = updates.recurrence !== undefined && JSON.stringify(updates.recurrence) !== JSON.stringify(existing.recurrence);
      const reminderChanged = updates.reminder !== undefined && JSON.stringify(updates.reminder) !== JSON.stringify(existing.reminder);
      const archivedChanged = ("archivedAt" in updates) && updates.archivedAt !== existing.archivedAt;

      needsReminderUpdate = titleChanged || categoryChanged || recurrenceChanged || reminderChanged || archivedChanged;

      if (needsReminderUpdate && mergedHabit.reminder && mergedHabit.reminder.notificationIds) {
        mergedHabit.reminder = { ...mergedHabit.reminder, notificationIds: undefined }; // Strip so reconciler uses fresh IDs
      }

      // 1. Domain persistence FIRST
      await HabitRepository.saveHabitUnlocked(mergedHabit);
      return mergedHabit;
    });

    // 2. OS Notification Scheduling SECOND (isolated)
    if (needsReminderUpdate) {
      // Fire and forget cancel existing
      if (existing?.reminder?.notificationIds?.length) {
        cancelReminderIds(existing.reminder.notificationIds, { throwOnError: false }).catch(e => {
          console.warn("[EntityCommandService] Failed to cancel old reminder IDs during habit update", e);
        });
      }
      
      // Reschedule if still applicable
      const isArchived = !!updatedHabit.archivedAt;

      if (!isArchived) {
        try {
          updatedHabit = await rescheduleHabitReminders(updatedHabit);
          await HabitRepository.updateNotificationIds(updatedHabit.id, updatedHabit.workspaceId, updatedHabit.reminder?.notificationIds);
        } catch (e) {
          console.warn("[EntityCommandService] Failed to reschedule habit reminder during update:", e);
        }
      }
    }

    if (!options?.skipEvents) {
      emitStateChange("habits_changed", options?.source);
    }

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    return updatedHabit;
  }

/**
   * Create and persist a Habit entity.
   */
  static async createHabit(
    input: Habit | ParsedProductivityItem,
    workspaceId: string = INBOX_WORKSPACE_ID,
    options?: CreateEntityOptions,
  ): Promise<Habit> {
    let habit: Habit;
    let needsScheduling = false;
    let parsedInput: ParsedProductivityItem | undefined;

    if (isParsedProductivityItem(input)) {
      habit = buildHabit(input, workspaceId);
      needsScheduling = true;
      parsedInput = input;
    } else {
      const targetWorkspace = input.workspaceId || workspaceId || INBOX_WORKSPACE_ID;
      habit = {
        ...input,
        workspaceId: targetWorkspace,
        createdAt: input.createdAt || Date.now(),
        updatedAt: Date.now(),
        completionHistory: [],
      };
      
      if (habit.reminder && habit.reminder.notificationIds) {
        habit.reminder.notificationIds = undefined;
      }
      if (habit.reminder?.enabled && habit.reminder?.triggerAt) {
        needsScheduling = true;
      }
    }

    // 1. Domain persistence FIRST
    await HabitRepository.saveHabit(habit);

    // 2. OS Notification Scheduling SECOND (isolated)
    if (needsScheduling) {
      try {
        if (parsedInput) {
          const notificationIds = await scheduleHabitNotifications(habit.id, parsedInput);
          if (notificationIds.length > 0 && habit.reminder) {
            habit.reminder.notificationIds = notificationIds;
            await HabitRepository.updateNotificationIds(habit.id, habit.workspaceId, notificationIds);
          }
        } else {
          // Assuming rescheduleHabitReminders behaves like rescheduleTodoReminders
          habit = await rescheduleHabitReminders(habit);
          await HabitRepository.updateNotificationIds(habit.id, habit.workspaceId, habit.reminder?.notificationIds);
        }
      } catch (e) {
        console.warn("[EntityCommandService] Failed to schedule habit reminder after persistence:", e);
      }
    }

    if (!options?.skipEvents) {
      emitStateChange("habits_changed", options?.source);
    }

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    return habit;
  }


}
