/**
 * useHabitCrud.ts
 * ─────────────────────
 * Habit CRUD operations extracted from useTasksState.
 *
 * Owns: habit repository persistence, reminder scheduling/cancellation,
 * streak updates, recycle bin integration, undo support.
 *
 * Does NOT own: UI state (habitTitle, selectedHabitPriority, editingHabit,
 * showCelebrate, highlightedHabitId, modal visibility, input state,
 * filtering, search, navigation, hydration, controller logic).
 */
import {
    earnPebble,
    undoLastPebble,
} from "@/features/profile/services/pebble.service";
import { handleHabitXpChange } from "@/features/settings/services/settings.service";
import {
    TASK_CATEGORY_META,
    type TaskCategory,
} from "@/features/tasks/services/task-categories";
import { getDateKey } from "@/features/tasks/utils/task-formatting";
import { pluginManager } from "@/plugin";
import { HabitRepository } from "@/repositories";
import { recordDailyHistorySnapshot } from "@/services/analytics/productivity-history.service";
import { syncWidgetData } from "@/services/analytics/widget-data.service";
import { emitStateChange } from "@/services/events/state-events";
import { dayDiff } from "@/services/scheduling/recurrence.service";
import {
    cancelReminderIds,
    rescheduleHabitReminders,
    scheduleReminderBatch,
} from "@/services/scheduling/reminders.service";
import {
    addToRecycleBin,
    DAY_MS,
    getRecycleBinItems,
    saveRecycleBinItems,
} from "@/services/storage/storage.service";
import type { Habit, Workspace } from "@/shared/types/domain.types";
import * as Haptics from "expo-haptics";
import { useCallback } from "react";
import { Platform } from "react-native";

export interface UseHabitCrudDeps {
  habits: Habit[];
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>;
  selectedList: string;
  lists: Workspace[];
  showUndo: (opts: { message: string; onUndo: () => Promise<void> }) => void;
  showToast: (msg: string) => void;
}

export function useHabitCrud(deps: UseHabitCrudDeps) {
  const { habits, setHabits, selectedList, lists, showUndo, showToast } = deps;

  const persistHabits = useCallback(
    async (nextHabits: Habit[]) => {
      try {
        await Promise.all(
          nextHabits.map((h) =>
            HabitRepository.saveHabit({
              id: h.id,
              folderId: h.folderId || selectedList,
              title: h.title,
              streak: h.streak || 0,
              bestStreak: h.bestStreak || 0,
              completedDates: h.completedToday ? [getDateKey()] : [],
              recurrenceRule: "FREQ=DAILY",
              createdAt: h.createdAt || Date.now(),
              archived: h.archived || false,
            }),
          ),
        );
        void recordDailyHistorySnapshot();
      } catch (e) {
        console.warn("Failed to persist current habits:", e);
      }
    },
    [selectedList],
  );

  const addHabit = useCallback(
    async (
      title: string,
      priority: "low" | "medium" | "high",
      category: TaskCategory,
    ) => {
      const next: Habit = {
        id: `habit-${Date.now()}`,
        title,
        streak: 0,
        bestStreak: 0,
        completedToday: false,
        priority,
        workspaceId: selectedList || "default",
        folderId: selectedList || "default",
        createdAt: Date.now(),
        createdDate: getDateKey(),
        startDate: getDateKey(),
      };

      const nextHabits = [next, ...habits];
      setHabits(nextHabits);
      await persistHabits(nextHabits);
      void syncWidgetData().catch(() => {});
      emitStateChange("habits_changed", "tasks_screen");

      const catLabel =
        TASK_CATEGORY_META.find((c) => c.key === (next.category || "health"))
          ?.label || "Health";
      showToast(`✓ Habit added to ${catLabel}`);
    },
    [habits, setHabits, selectedList, persistHabits, showToast],
  );

  const deleteHabit = useCallback(
    async (id: string) => {
      const target = habits.find((habit) => habit.id === id);
      if (!target) return;

      const originalWorkspace =
        lists.find((l) => l.id === (target.folderId || "default"))?.name ||
        "Default";

      await cancelReminderIds(target.notificationIds ?? []);

      await addToRecycleBin("habit", target, originalWorkspace);

      const updated = habits.filter((habit) => habit.id !== id);
      setHabits(updated);
      await persistHabits(updated);
      void syncWidgetData().catch(() => {});
      emitStateChange("habits_changed", "tasks_screen");

      showUndo({
        message: `Deleted "${target.title}"`,
        onUndo: async () => {
          const binItems = await getRecycleBinItems();
          await saveRecycleBinItems(binItems.filter((item) => item.id !== id));

          const rescheduled = await rescheduleHabitReminders(target);

          const currentHabitsMap =
            await HabitRepository.getHabits(selectedList);
          const currentHabits = Object.values(currentHabitsMap).map(
            (h: any) => ({
              ...h,
              folderId: selectedList,
              completedToday: h.completedDates?.includes(getDateKey()) || false,
            }),
          ) as Habit[];
          if (!currentHabits.some((h) => h.id === id)) {
            await HabitRepository.saveHabit({
              ...rescheduled,
              folderId: selectedList,
            });
            const restored = [...currentHabits, rescheduled];
            await persistHabits(restored);
            setHabits(restored);
          }

          void syncWidgetData().catch(() => {});
          emitStateChange("habits_changed", "tasks_screen");
        },
      });
    },
    [habits, setHabits, selectedList, lists, persistHabits, showUndo],
  );

  const toggleHabit = useCallback(
    async (id: string) => {
      const today = getDateKey();
      const yesterday = getDateKey(new Date(Date.now() - DAY_MS));
      const habit = habits.find((h) => h.id === id);
      if (!habit) return;

      let updatedHabit;
      const isCompleting = !habit.completedToday;
      const { xpAwardedDate } = await handleHabitXpChange(
        habit,
        isCompleting,
        today,
      );
      if (isCompleting) {
        let nextStreak = 1;
        if (habit.lastCompletedDate === today) {
          nextStreak = habit.streak || 1;
        } else if (habit.lastCompletedDate === yesterday) {
          nextStreak = habit.streak + 1;
        }
        updatedHabit = {
          ...habit,
          completedToday: true,
          lastCompletedDate: today,
          streak: nextStreak,
          bestStreak: Math.max(habit.bestStreak, nextStreak),
          xpAwardedDate,
        };

        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
      } else {
        const rolledBackStreak = Math.max(0, habit.streak - 1);
        updatedHabit = {
          ...habit,
          completedToday: false,
          streak: rolledBackStreak,
          lastCompletedDate: rolledBackStreak > 0 ? yesterday : undefined,
          xpAwardedDate,
        };
      }

      const nextHabits = habits.map((h) => (h.id === id ? updatedHabit : h));
      setHabits(nextHabits);
      await persistHabits(nextHabits);

      if (isCompleting) {
        await earnPebble("habit");
      } else {
        await undoLastPebble("habit");
      }

      pluginManager.dispatchHabitCompleted(updatedHabit);
      void recordDailyHistorySnapshot();
      await syncWidgetData().catch(() => {});
      emitStateChange("habits_changed", "tasks_screen");
    },
    [habits, setHabits, persistHabits],
  );

  const recoverHabitStreak = useCallback(
    async (id: string, method: "pebbles" | "focus"): Promise<boolean> => {
      const today = getDateKey();
      const yesterday = getDateKey(new Date(Date.now() - DAY_MS));
      const habit = habits.find((h) => h.id === id);
      if (!habit || !habit.previousStreak) return false;

      const isWithinRecoveryWindow =
        habit.streakBrokenDate && dayDiff(habit.streakBrokenDate, today) <= 1;
      if (!isWithinRecoveryWindow) return false;

      if (method === "pebbles") {
        const {
          spendGems,
        } = require("@/features/profile/services/pebble.service");
        const success = await spendGems(1);
        if (!success) return false;
      }

      const restoredStreak = habit.previousStreak;
      const updatedHabit = {
        ...habit,
        streak: restoredStreak,
        bestStreak: Math.max(habit.bestStreak, restoredStreak),
        lastCompletedDate: yesterday,
        previousStreak: undefined,
        streakBrokenDate: undefined,
      };

      const nextHabits = habits.map((h) => (h.id === id ? updatedHabit : h));
      setHabits(nextHabits);
      await persistHabits(nextHabits);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      emitStateChange("habits_changed", "tasks_screen");
      emitStateChange("pebbles_changed", "tasks_screen");
      return true;
    },
    [habits, setHabits, persistHabits],
  );

  const handleSaveEditedHabit = useCallback(
    async (updated: Habit) => {
      let notificationIds = updated.notificationIds || [];

      const original = habits.find((h) => h.id === updated.id);
      const reminderChanged =
        updated.reminderHour !== original?.reminderHour ||
        updated.reminderMinute !== original?.reminderMinute ||
        JSON.stringify(updated.reminderDays || []) !==
          JSON.stringify(original?.reminderDays || []) ||
        JSON.stringify(updated.recurrence) !==
          JSON.stringify(original?.recurrence);

      if (reminderChanged) {
        await cancelReminderIds(original?.notificationIds);
        notificationIds = [];

        if (
          updated.reminderHour !== undefined &&
          updated.reminderMinute !== undefined
        ) {
          let reminderDays: number[] | undefined = undefined;
          if (updated.recurrence) {
            if (updated.recurrence.type === "weekdays") {
              reminderDays = [1, 2, 3, 4, 5];
            } else if (updated.recurrence.type === "weekly") {
              reminderDays = updated.recurrence.days;
            }
          }

          try {
            const scheduled = await scheduleReminderBatch({
              kind: "habit",
              itemId: updated.id,
              title: updated.title,
              dailyTime: {
                hour: updated.reminderHour,
                minute: updated.reminderMinute,
              },
              dailyDays: reminderDays,
              recurrence: updated.recurrence || undefined,
              escalationMinutes: [120, 240],
              channelId: Platform.OS === "android" ? "daily-habits" : undefined,
              context: {
                title: updated.title,
                remainingCount: 1,
                totalCount: 1,
                streak: updated.streak,
                bestStreak: updated.bestStreak,
              },
            });
            notificationIds = scheduled.ids;
          } catch (e) {
            console.error("Failed to reschedule habit reminder:", e);
          }
        }
      }

      const finalHabit = {
        ...updated,
        notificationIds,
      };

      const exists = habits.some((h) => h.id === finalHabit.id);
      let nextHabits;
      if (exists) {
        nextHabits = habits.map((h) =>
          h.id === finalHabit.id ? finalHabit : h,
        );
      } else {
        nextHabits = [finalHabit, ...habits];
      }
      setHabits(nextHabits);
      await persistHabits(nextHabits);

      emitStateChange("habits_changed");
    },
    [habits, setHabits, persistHabits],
  );

  const handleDeleteEditedHabit = useCallback(
    async (id: string) => {
      await deleteHabit(id);
    },
    [deleteHabit],
  );

  return {
    persistHabits,
    addHabit,
    deleteHabit,
    toggleHabit,
    recoverHabitStreak,
    handleSaveEditedHabit,
    handleDeleteEditedHabit,
  };
}
