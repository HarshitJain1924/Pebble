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
    
    const { withLocks } = await import("@/shared/utils/mutex");
    const sourceKey = `pebble:v1:habits:${sourceWorkspaceId}`;
    const targetKey = `pebble:v1:habits:${targetWorkspaceId}`;

    const { moved, operationId } = await withLocks([sourceKey, targetKey], async () => {
      const map = await HabitRepository.getHabits(sourceWorkspaceId);
      const existing = map[habitId];
      if (!existing) throw new Error(`Habit ${habitId} not found`);

      const { assertLifecycleMutationAllowed } = await import("../shared/command-lifecycle-guard");
      await assertLifecycleMutationAllowed("habit", existing, options);

      const { WorkspaceRepository } = await import("@/repositories/WorkspaceRepository");
      const workspaces = await WorkspaceRepository.getWorkspaces();
      const { INBOX_WORKSPACE_ID, MY_PEBBLES_WORKSPACE_ID } = await import("@/shared/types/domain.types");
      if (!workspaces.some(w => w.id === targetWorkspaceId) && targetWorkspaceId !== INBOX_WORKSPACE_ID && targetWorkspaceId !== MY_PEBBLES_WORKSPACE_ID) {
        throw new Error(`Target workspace ${targetWorkspaceId} no longer exists.`);
      }

      const moved: Habit = {
        ...existing,
        workspaceId: targetWorkspaceId,
        revision: (existing.revision ?? 1) + 1,
        lifecycleGeneration: existing.lifecycleGeneration ?? 1,
        updatedAt: Date.now(),
      };

      const { generateId } = await import("@/shared/utils/id");
      const operationId = `move-${generateId()}`;
      const { MoveJournalRepository } = await import("@/repositories/MoveJournalRepository");

      await MoveJournalRepository.addOperation({
        operationId,
        entityId: habitId,
        entityType: "habit",
        sourceWorkspaceId,
        targetWorkspaceId,
        timestamp: Date.now(),
        lifecycleGeneration: existing.lifecycleGeneration ?? 1,
        expectedRevision: existing.revision ?? 1,
      });

      await HabitRepository.saveHabitUnlocked(moved);
      try {
        await HabitRepository.deleteHabitUnlocked(habitId, sourceWorkspaceId);
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to delete source habit ${habitId} during move. Target workspace ${targetWorkspaceId} contains a ghost.`, e);
        throw e;
      }

      return { moved, operationId };
    });

    const { MoveJournalRepository } = await import("@/repositories/MoveJournalRepository");
    await MoveJournalRepository.removeOperation(operationId);
    
    if (!options?.skipEvents) {
      const { emitStateChange } = await import("@/services/events/state-events");
      emitStateChange("habits_changed", options?.source);
    }
    if (!options?.skipAnalytics) {
      const { recordDailyHistorySnapshot } = await import("@/services/analytics/productivity-history.service");
      void recordDailyHistorySnapshot().catch(() => {});
    }
    const { syncWidgetData } = await import("@/services/analytics/widget-data.service");
    void syncWidgetData().catch(() => {});
    
    return moved;
  }

  static async permanentlyDeleteHabit(
    habitId: string,
    workspaceId: string,
    options?: CreateEntityOptions
  ): Promise<void> {
    const { cancelReminderIds } = await import("@/services/scheduling/reminders.service");
    const { emitStateChange } = await import("@/services/events/state-events");
    const { withLock } = await import("@/shared/utils/mutex");
    const { TombstoneRepository } = await import("@/repositories/TombstoneRepository");
    const lockKey = `pebble:v1:habits:${workspaceId}`;

    const deletedHabit = await withLock(lockKey, async () => {
      const habitsMap = await HabitRepository.getHabits(workspaceId);
      let habit = habitsMap[habitId];
      let fromRecycleBin = false;

      if (!habit) {
        const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
        const binItems = await RecycleBinRepository.getRecycleBinItems();
        const rbItem = binItems.find(
          (i) => (i.entityId === habitId || i.id === habitId) && i.entityType === "habit"
        );
        if (rbItem) {
          try {
            habit = JSON.parse(rbItem.snapshot);
            fromRecycleBin = true;
          } catch {}
        }
      }

      if (!habit) throw new Error(`Habit ${habitId} not found`);

      const { assertLifecycleMutationAllowed } = await import("../shared/command-lifecycle-guard");
      await assertLifecycleMutationAllowed("habit", habit, options, { allowTombstoned: true });

      // 1. Add durable tombstone
      await TombstoneRepository.addTombstone({
        id: `ts-habit-${habit.id}-g${habit.lifecycleGeneration ?? 1}`,
        entityType: "habit",
        entityId: habit.id,
        lifecycleGeneration: habit.lifecycleGeneration ?? 1,
        deletionRevision: habit.revision ?? 1,
        deletedAt: Date.now(),
      });

      // 2. Remove from active storage and recycle bin
      await HabitRepository.deleteHabitUnlocked(habitId, workspaceId);
      const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
      await RecycleBinRepository.removeRecycleBinItems([habitId], { throwOnError: true });
      
      return habit;
    });

    // 2. Cancel native reminders (Fire and forget) using the EXACT snapshot we just deleted
    if (deletedHabit.reminder?.notificationIds?.length) {
      cancelReminderIds(deletedHabit.reminder.notificationIds, { throwOnError: false }).catch(e => {
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
    
    // 1. Initial lookup (unlocked)
    const items = await RecycleBinRepository.getRecycleBinItems();
    // Resolve by either the RecycleBin item ID ("rb-{entityId}") or the raw entity
    // ID so callers (e.g. bulk-delete Undo in useTasksState) can pass what they have.
    const cleanId = recycleBinItemId.startsWith("rb-") ? recycleBinItemId.slice(3) : recycleBinItemId;
    const initialItem = items.find(
      (i) => i.id === recycleBinItemId || i.entityId === recycleBinItemId || i.entityId === cleanId || i.id === `rb-${cleanId}` || i.id.startsWith(`rb-${cleanId}-g`)
    );
    if (!initialItem || initialItem.entityType !== "habit") throw new Error("Invalid habit recycle bin item");

    const parsedSnapshot = JSON.parse(initialItem.snapshot);
    const { WorkspaceRepository } = await import("@/repositories/WorkspaceRepository");
    const workspaces = await WorkspaceRepository.getWorkspaces();
    const validWorkspaceIds = new Set(workspaces.map((w) => w.id));
    let targetWorkspaceId = parsedSnapshot.workspaceId || INBOX_WORKSPACE_ID;
    if (
      !validWorkspaceIds.has(targetWorkspaceId) &&
      targetWorkspaceId !== INBOX_WORKSPACE_ID &&
      targetWorkspaceId !== MY_PEBBLES_WORKSPACE_ID
    ) {
      targetWorkspaceId = INBOX_WORKSPACE_ID;
    }
    
    const { generateId } = await import("@/shared/utils/id");
    const { MoveJournalRepository } = await import("@/repositories/MoveJournalRepository");
    const operationId = `restore-${generateId()}`;
    
    const { withLock } = await import("@/shared/utils/mutex");
    const lockKey = `pebble:v1:habits:${targetWorkspaceId}`;

    const restoredHabit = await withLock(lockKey, async () => {
      // 2. Fresh read inside critical section
      const freshItems = await RecycleBinRepository.getRecycleBinItems();
      const item = freshItems.find(
        (i) => i.id === initialItem.id || i.id === recycleBinItemId || i.entityId === recycleBinItemId || i.entityId === cleanId || i.id === `rb-${cleanId}` || i.id.startsWith(`rb-${cleanId}-g`)
      );
      if (!item || item.entityType !== "habit") throw new Error("Habit already restored or permanently deleted");

      const habit: Habit = JSON.parse(item.snapshot);
      habit.workspaceId = targetWorkspaceId;
      habit.updatedAt = Date.now();
      
      habit.reminder = habit.reminder ? { ...habit.reminder, notificationIds: undefined } : undefined;
      
      const { TombstoneRepository } = await import("@/repositories/TombstoneRepository");
      const highestTombstone = await TombstoneRepository.getHighestTombstonedGeneration("habit", habit.id);
      const isDead = (habit.lifecycleGeneration || 1) <= highestTombstone || await TombstoneRepository.isTombstoned("habit", habit.id, habit.lifecycleGeneration);
      if (isDead) {
        try {
          await RecycleBinRepository.removeRecycleBinItems([item.id], { throwOnError: true });
        } catch {}
        throw new Error(`[EntityCommandService] Habit ${habit.id} was permanently deleted.`);
      }

      habit.revision = (habit.revision ?? 1) + 1;
      habit.lifecycleGeneration = habit.lifecycleGeneration ?? 1;

      await MoveJournalRepository.addOperation({
        operationId,
        operationType: "restore",
        entityId: item.entityId,
        entityType: "habit",
        sourceWorkspaceId: targetWorkspaceId,
        targetWorkspaceId,
        timestamp: Date.now(),
        lifecycleGeneration: habit.lifecycleGeneration,
        expectedRevision: habit.revision,
      });

      const existingActiveHabits = await HabitRepository.getHabits(targetWorkspaceId);
      const existingActive = existingActiveHabits[habit.id];
      if (existingActive) {
        // If an active habit already exists with this ID, do NOT overwrite it and do NOT create a duplicate!
        try {
          await RecycleBinRepository.removeRecycleBinItems([item.id], { throwOnError: true });
        } catch {}
        await MoveJournalRepository.removeOperation(operationId);
        return existingActive;
      }

      // 3. Persist to active partition
      const savedHabit = await HabitRepository.saveHabitUnlocked(habit);
      
      // 4. Atomic removal from Recycle Bin
      try {
        await RecycleBinRepository.removeRecycleBinItems([item.id], { throwOnError: true });
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to remove habit from Recycle Bin after restore. Recycle Bin contains a ghost.`, e);
      }
      
      await MoveJournalRepository.removeOperation(operationId);
      
      return savedHabit;
    });

    // 5. Non-domain side effects
    const needsScheduling = restoredHabit.reminder?.enabled && restoredHabit.reminder?.triggerAt;
    if (needsScheduling) {
      let generatedNotificationIds: string[] | undefined = undefined;
      try {
        const { rescheduleHabitReminders } = await import("@/services/scheduling/reminders.service");
        const scheduledHabit = await rescheduleHabitReminders(restoredHabit);
        generatedNotificationIds = scheduledHabit.reminder?.notificationIds;
        if (generatedNotificationIds && generatedNotificationIds.length > 0) {
          const status = await HabitRepository.updateNotificationIds(
            restoredHabit.id,
            restoredHabit.workspaceId,
            generatedNotificationIds,
            {
              reminder: restoredHabit.reminder,
              archivedAt: restoredHabit.archivedAt,
              updatedAt: restoredHabit.updatedAt,
              revision: restoredHabit.revision,
            }
          );
          const verify = await HabitRepository.getHabit(restoredHabit.id, restoredHabit.workspaceId);
          if (status === 'not_found' || status === 'state_changed' || !verify || verify.archivedAt) {
            cancelReminderIds(generatedNotificationIds, { throwOnError: false }).catch(() => {});
            if (restoredHabit.reminder) restoredHabit.reminder.notificationIds = undefined;
          } else {
            if (restoredHabit.reminder) restoredHabit.reminder.notificationIds = generatedNotificationIds;
          }
        }
      } catch (e) {
        console.warn("[EntityCommandService] Failed to schedule habit reminder after restore:", e);
        if (generatedNotificationIds && generatedNotificationIds.length > 0) {
          cancelReminderIds(generatedNotificationIds, { throwOnError: false }).catch(() => {});
        }
        if (restoredHabit.reminder) restoredHabit.reminder.notificationIds = undefined;
      }
    }

    if (!options?.skipEvents) {
      const { emitStateChange } = await import("@/services/events/state-events");
      emitStateChange("habits_changed", options?.source);
    }
    
    if (!options?.skipAnalytics) {
      const { recordDailyHistorySnapshot } = await import("@/services/analytics/productivity-history.service");
      void recordDailyHistorySnapshot().catch(() => {});
    }

    return restoredHabit;
  }

static async recycleHabit(
    habitId: string,
    workspaceId: string,
    options?: CreateEntityOptions
  ): Promise<void> {
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    const { cancelReminderIds } = await import("@/services/scheduling/reminders.service");
    
    const { withLock } = await import("@/shared/utils/mutex");
    const lockKey = `pebble:v1:habits:${workspaceId}`;

    const habit = await withLock(lockKey, async () => {
      const habitMap = await HabitRepository.getHabits(workspaceId);
      const existing = habitMap[habitId];
      if (!existing) return null;

      const { assertLifecycleMutationAllowed } = await import("../shared/command-lifecycle-guard");
      await assertLifecycleMutationAllowed("habit", existing, options);

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
        lifecycleGeneration: existing.lifecycleGeneration ?? 1,
        expectedRevision: existing.revision ?? 1,
      });

      await RecycleBinRepository.addToRecycleBin("habit", existing, workspaceId, { throwOnError: true });

      try {
        await HabitRepository.deleteHabitUnlocked(habitId, workspaceId);
      } catch (e) {
        console.warn(`[EntityCommandService] Failed to delete active habit ${habitId} during recycle. Recycle bin contains a ghost.`, e);
        throw e;
      }

      await MoveJournalRepository.removeOperation(operationId);
      
      return existing;
    });

    if (!habit) return;

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
    const { withLock } = await import("@/shared/utils/mutex");
    const key = `pebble:v1:habits:${workspaceId}`;

    const result = await withLock(key, async () => {
      const habitsMap = await HabitRepository.getHabits(workspaceId);
      const habit = habitsMap[habitId];
      if (!habit) return null;

      const { assertLifecycleMutationAllowed } = await import("../shared/command-lifecycle-guard");
      await assertLifecycleMutationAllowed("habit", habit, options);

      const today = new Date();
      const yesterday = new Date(today.getTime() - 24 * 60 * 1000 * 60);
      const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

      const updatedHistory = [
        ...(habit.completionHistory || []),
        { date: yesterdayKey, completedAt: Date.now() },
      ];

      const updatedHabit: Habit = {
        ...habit,
        completionHistory: updatedHistory,
        revision: (habit.revision ?? 1) + 1,
        lifecycleGeneration: habit.lifecycleGeneration ?? 1,
        updatedAt: Date.now(),
      };

      await HabitRepository.saveHabitUnlocked(updatedHabit);

      return { previous: habit, updated: updatedHabit };
    });

    if (!result) return null;

    if (!options?.skipEvents) {
      emitStateChange("habits_changed", options?.source);
      emitStateChange("pebbles_changed", options?.source);
    }

    return result;
  }

/**
   * Uncomplete a Habit for today.
   */
  static async uncompleteHabit(
    habitId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<{ previous: Habit; updated: Habit } | null> {
    const { withLock } = await import("@/shared/utils/mutex");
    const key = `pebble:v1:habits:${workspaceId}`;

    const result = await withLock(key, async () => {
      const habitsMap = await HabitRepository.getHabits(workspaceId);
      const habit = habitsMap[habitId];
      if (!habit) return null;

      const { assertLifecycleMutationAllowed } = await import("../shared/command-lifecycle-guard");
      await assertLifecycleMutationAllowed("habit", habit, options);

      const today = getTodayDateKey();
      if (!isHabitCompletedToday(habit, today)) {
        return { previous: habit, updated: habit, skipped: true };
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
        revision: (habit.revision ?? 1) + 1,
        lifecycleGeneration: habit.lifecycleGeneration ?? 1,
        updatedAt: Date.now(),
      };

      await HabitRepository.saveHabitUnlocked(updatedHabit);

      return { previous: habit, updated: updatedHabit, skipped: false, today };
    });

    if (!result) return null;
    if (result.skipped) return { previous: result.previous, updated: result.updated };

    const { previous, updated: updatedHabit, today } = result;

    await reversePebbleReward(`habit:${updatedHabit.id}:${today}`);

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    void syncWidgetData().catch(() => {});

    if (!options?.skipEvents) {
      emitStateChange("habits_changed", options?.source);
    }

    return { previous, updated: updatedHabit };
  }

/**
   * Complete a Habit for today.
   */
  static async completeHabit(
    habitId: string,
    workspaceId: string,
    options?: CreateEntityOptions,
  ): Promise<{ previous: Habit; updated: Habit } | null> {
    const { withLock } = await import("@/shared/utils/mutex");
    const key = `pebble:v1:habits:${workspaceId}`;

    const result = await withLock(key, async () => {
      const habitsMap = await HabitRepository.getHabits(workspaceId);
      const habit = habitsMap[habitId];
      if (!habit) return null;

      const { assertLifecycleMutationAllowed } = await import("../shared/command-lifecycle-guard");
      await assertLifecycleMutationAllowed("habit", habit, options);

      const today = getTodayDateKey();
      if (isHabitCompletedToday(habit, today)) {
        return { previous: habit, updated: habit, skipped: true };
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
        revision: (habit.revision ?? 1) + 1,
        lifecycleGeneration: habit.lifecycleGeneration ?? 1,
        updatedAt: Date.now(),
      };

      await HabitRepository.saveHabitUnlocked(updatedHabit);

      return { previous: habit, updated: updatedHabit, skipped: false, today };
    });

    if (!result) return null;
    if (result.skipped) return { previous: result.previous, updated: result.updated };

    const { previous, updated: updatedHabit, today } = result;

    await earnPebble("habit", `habit:${updatedHabit.id}:${today}`);
    pluginManager.dispatchHabitCompleted(updatedHabit);

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    void syncWidgetData().catch(() => {});

    if (!options?.skipEvents) {
      emitStateChange("habits_changed", options?.source);
    }

    return { previous, updated: updatedHabit };
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

      const { assertLifecycleMutationAllowed } = await import("../shared/command-lifecycle-guard");
      await assertLifecycleMutationAllowed("habit", existing, options);

      if (updates.workspaceId && updates.workspaceId !== workspaceId) {
        throw new Error("Workspace movement is not supported in updateHabit.");
      }

      let mergedHabit: Habit = {
        ...existing,
        ...updates,
        revision: (existing.revision ?? 1) + 1,
        lifecycleGeneration: existing.lifecycleGeneration ?? 1,
        updatedAt: Date.now(),
      };

      const titleChanged = "title" in updates && updates.title !== existing.title;
      const categoryChanged = "categoryId" in updates && updates.categoryId !== existing.categoryId;
      const recurrenceChanged = "recurrence" in updates && JSON.stringify(updates.recurrence) !== JSON.stringify(existing.recurrence);
      const reminderChanged = "reminder" in updates && JSON.stringify(updates.reminder) !== JSON.stringify(existing.reminder);
      const archivedChanged = "archivedAt" in updates && updates.archivedAt !== existing.archivedAt;

      needsReminderUpdate = titleChanged || categoryChanged || recurrenceChanged || reminderChanged || archivedChanged;

      if (needsReminderUpdate && mergedHabit.reminder && mergedHabit.reminder.notificationIds) {
        mergedHabit.reminder = { ...mergedHabit.reminder, notificationIds: undefined }; // Strip so reconciler uses fresh IDs
      }

      // 1. Domain persistence FIRST
      const savedHabit = await HabitRepository.saveHabitUnlocked(mergedHabit);
      return savedHabit;
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
        let generatedNotificationIds: string[] | undefined = undefined;
        try {
          const scheduled = await rescheduleHabitReminders(updatedHabit);
          generatedNotificationIds = scheduled.reminder?.notificationIds;
          if (generatedNotificationIds && generatedNotificationIds.length > 0) {
            const status = await HabitRepository.updateNotificationIds(
              updatedHabit.id, 
              updatedHabit.workspaceId, 
              generatedNotificationIds,
              {
                reminder: updatedHabit.reminder,
                archivedAt: updatedHabit.archivedAt,
                updatedAt: updatedHabit.updatedAt,
                revision: updatedHabit.revision,
              }
            );

            const verify = await HabitRepository.getHabit(updatedHabit.id, updatedHabit.workspaceId);
            if (status === 'not_found' || status === 'state_changed' || !verify || verify.archivedAt) {
              cancelReminderIds(generatedNotificationIds, { throwOnError: false }).catch(() => {});
              if (updatedHabit.reminder) updatedHabit.reminder.notificationIds = undefined;
            } else {
              if (updatedHabit.reminder) updatedHabit.reminder.notificationIds = generatedNotificationIds;
            }
          }
        } catch (e) {
          console.warn("[EntityCommandService] Failed to reschedule habit reminder during update:", e);
          if (generatedNotificationIds && generatedNotificationIds.length > 0) {
            cancelReminderIds(generatedNotificationIds, { throwOnError: false }).catch(() => {});
          }
          if (updatedHabit.reminder) updatedHabit.reminder.notificationIds = undefined;
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

    const targetWorkspace = isParsedProductivityItem(input)
      ? workspaceId || INBOX_WORKSPACE_ID
      : input.workspaceId || workspaceId || INBOX_WORKSPACE_ID;

    const { withLock } = await import("@/shared/utils/mutex");
    const { TombstoneRepository } = await import("@/repositories/TombstoneRepository");
    const lockKey = `pebble:v1:habits:${targetWorkspace}`;

    habit = await withLock(lockKey, async () => {
      let candidate: Habit;
      if (isParsedProductivityItem(input)) {
        candidate = buildHabit(input, targetWorkspace);
        if (options?.explicitId) {
          candidate.id = options.explicitId;
        }
        needsScheduling = true;
        parsedInput = input;
      } else {
        const { generateId } = await import("@/shared/utils/id");
        candidate = {
          ...input,
          id: options?.explicitId || (input as any).id || generateId("habit-"),
          workspaceId: targetWorkspace,
          revision: input.revision ?? 1,
          lifecycleGeneration: input.lifecycleGeneration ?? 1,
          createdAt: input.createdAt || Date.now(),
          updatedAt: Date.now(),
          completionHistory: input.completionHistory || [],
        };

        if (candidate.reminder && candidate.reminder.notificationIds) {
          candidate.reminder.notificationIds = undefined;
        }
        if (candidate.reminder?.enabled && candidate.reminder?.triggerAt) {
          needsScheduling = true;
        }
      }

      // Authoritative generation allocation inside the partition lock:
      const activeHabits = await HabitRepository.getHabits(targetWorkspace);
      const activeExisting = candidate.id ? activeHabits[candidate.id] : undefined;
      const activeGen = activeExisting?.lifecycleGeneration || 0;
      const highestTombstone = candidate.id
        ? await TombstoneRepository.getHighestTombstonedGeneration("habit", candidate.id)
        : 0;
      const allocatedGen = Math.max(
        candidate.lifecycleGeneration || 1,
        activeGen + (activeExisting ? 1 : 0),
        highestTombstone + 1
      );

      candidate.lifecycleGeneration = allocatedGen;
      candidate.revision = candidate.revision || 1;

      // 1. Domain persistence FIRST
      return await HabitRepository.saveHabitUnlocked(candidate);
    });

    // 2. OS Notification Scheduling SECOND (isolated)
    if (needsScheduling) {
      let generatedNotificationIds: string[] | undefined = undefined;
      try {
        if (parsedInput) {
          generatedNotificationIds = await scheduleHabitNotifications(habit.id, parsedInput);
        } else {
          const scheduled = await rescheduleHabitReminders(habit);
          generatedNotificationIds = scheduled.reminder?.notificationIds;
        }

        if (generatedNotificationIds && generatedNotificationIds.length > 0) {
          const status = await HabitRepository.updateNotificationIds(
            habit.id, 
            habit.workspaceId, 
            generatedNotificationIds,
            {
              reminder: habit.reminder,
              archivedAt: habit.archivedAt,
              updatedAt: habit.updatedAt,
              revision: habit.revision,
            }
          );

          // Re-verify domain state to prevent Zombie notifications in case of concurrent mutation
          const verify = await HabitRepository.getHabit(habit.id, habit.workspaceId);
          if (status === 'not_found' || status === 'state_changed' || !verify || verify.archivedAt) {
            cancelReminderIds(generatedNotificationIds, { throwOnError: false }).catch(() => {});
            if (habit.reminder) habit.reminder.notificationIds = undefined;
          } else {
            if (habit.reminder) habit.reminder.notificationIds = generatedNotificationIds;
          }
        }
      } catch (e) {
        console.warn("[EntityCommandService] Failed to schedule habit reminder after persistence:", e);
        if (generatedNotificationIds && generatedNotificationIds.length > 0) {
          cancelReminderIds(generatedNotificationIds, { throwOnError: false }).catch(() => {});
        }
        if (habit.reminder) habit.reminder.notificationIds = undefined;
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
