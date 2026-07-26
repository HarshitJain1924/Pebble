/**
 * useHabitCrud.ts
 * ─────────────────────
 * Habit CRUD operations extracted from useTasksState using canonical Habit model.
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
import {
  cancelReminderIds,
  rescheduleHabitReminders,
} from "@/services/scheduling/reminders.service";
import {
  addToRecycleBin,
  getRecycleBinItems,
  saveRecycleBinItems,
} from "@/services/storage/storage.service";
import type { Habit, Workspace, HabitCompletion } from "@/shared/types/domain.types";
import { isHabitCompletedToday, getTodayDateKey } from "@/shared/utils/domain-selectors";
import * as Haptics from "expo-haptics";
import { useCallback } from "react";

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
              ...h,
              workspaceId: h.workspaceId || selectedList || "default",
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
        categoryId: category,
        workspaceId: selectedList || "default",
        recurrence: {
          frequency: "daily",
          interval: 1,
        },
        completionHistory: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const nextHabits = [next, ...habits];
      setHabits(nextHabits);
      await persistHabits(nextHabits);
      void syncWidgetData().catch(() => {});
      emitStateChange("habits_changed", "tasks_screen");

      const catLabel =
        TASK_CATEGORY_META.find((c) => c.key === category)?.label || "Health";
      showToast(`✓ Habit added to ${catLabel}`);
    },
    [habits, setHabits, selectedList, persistHabits, showToast],
  );

  const deleteHabit = useCallback(
    async (id: string) => {
      const target = habits.find((habit) => habit.id === id);
      if (!target) return;

      const originalWorkspace =
        lists.find((l) => l.id === (target.workspaceId || "default"))?.name ||
        "Default";

      await cancelReminderIds(target.reminder?.notificationIds ?? []);

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
          const currentHabits = Object.values(currentHabitsMap);
          if (!currentHabits.some((h) => h.id === id)) {
            await HabitRepository.saveHabit({
              ...rescheduled,
              workspaceId: selectedList,
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
      const today = getTodayDateKey();
      const habit = habits.find((h) => h.id === id);
      if (!habit) return;

      const currentlyCompleted = isHabitCompletedToday(habit, today);
      const isCompleting = !currentlyCompleted;
      await handleHabitXpChange(habit, isCompleting, today);

      let nextHistory: HabitCompletion[];
      if (isCompleting) {
        nextHistory = [
          ...habit.completionHistory.filter((c) => c.date !== today),
          { date: today, completedAt: Date.now() },
        ];
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
      } else {
        nextHistory = habit.completionHistory.filter((c) => c.date !== today);
      }

      const updatedHabit: Habit = {
        ...habit,
        completionHistory: nextHistory,
        updatedAt: Date.now(),
      };

      const nextHabits = habits.map((h) => (h.id === id ? updatedHabit : h));
      setHabits(nextHabits);
      await persistHabits(nextHabits);

      if (isCompleting) {
        await earnPebble("habit");
        pluginManager.dispatchHabitCompleted(updatedHabit);
      } else {
        await undoLastPebble("habit");
      }

      void syncWidgetData().catch(() => {});
      emitStateChange("habits_changed", "tasks_screen");
    },
    [habits, setHabits, persistHabits],
  );

  return {
    addHabit,
    deleteHabit,
    toggleHabit,
    persistHabits,
  };
}
