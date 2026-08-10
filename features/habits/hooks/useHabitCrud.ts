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
import { EntityCommandService } from "@/services/command/EntityCommandService";
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
import { Habit, INBOX_WORKSPACE_ID, Workspace } from "@/shared/types/domain.types";
import { generateId } from "@/shared/utils/id";
import { isHabitCompletedToday, getTodayDateKey } from "@/shared/utils/domain-selectors";
import * as Haptics from "expo-haptics";
import { useCallback } from "react";

export interface UseHabitCrudDeps {
  habits: Habit[];
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>;
  selectedWorkspaceId: string;
  workspaces: Workspace[];
  showUndo: (opts: { message: string; onUndo: () => Promise<void> }) => void;
  showToast: (msg: string) => void;
}

export function useHabitCrud(deps: UseHabitCrudDeps) {
  const { habits, setHabits, selectedWorkspaceId, workspaces, showUndo, showToast } = deps;

  const persistHabits = useCallback(
    async (nextHabits: Habit[]) => {
      try {
        await Promise.all(
          nextHabits.map((h) =>
            HabitRepository.saveHabit({
              ...h,
              workspaceId: h.workspaceId || selectedWorkspaceId || INBOX_WORKSPACE_ID,
            }),
          ),
        );
        void recordDailyHistorySnapshot();
      } catch (e) {
        console.warn("Failed to persist current habits:", e);
      }
    },
    [selectedWorkspaceId],
  );

  const addHabit = useCallback(
    async (
      title: string,
      priority: "low" | "medium" | "high",
      category: TaskCategory,
    ) => {
      const next: Habit = {
        id: generateId("habit-"),
        title,
        categoryId: category,
        workspaceId: selectedWorkspaceId || INBOX_WORKSPACE_ID,
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

      // Persist via ECS — skip persistHabits as ECS already handled persistence.
      try {
        await EntityCommandService.createHabit(next, selectedWorkspaceId || INBOX_WORKSPACE_ID, {
          skipEvents: true,
        });
      } catch (e) {
        console.warn("Failed to persist habit:", e);
      }

      void syncWidgetData().catch(() => {});
      emitStateChange("habits_changed", "tasks_screen");

      const catLabel =
        TASK_CATEGORY_META.find((c) => c.key === category)?.label || "Health";
      showToast(`✓ Habit added to ${catLabel}`);
    },
    [habits, setHabits, selectedWorkspaceId, showToast],
  );

  const deleteHabit = useCallback(
    async (id: string) => {
      const target = habits.find((habit) => habit.id === id);
      if (!target) return;

      const originalWorkspace =
        workspaces.find((l) => l.id === (target.workspaceId || INBOX_WORKSPACE_ID))?.name ||
        "Inbox";

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
            await HabitRepository.getHabits(selectedWorkspaceId);
          const currentHabits = Object.values(currentHabitsMap);
          if (!currentHabits.some((h) => h.id === id)) {
            await HabitRepository.saveHabit({
              ...rescheduled,
              workspaceId: selectedWorkspaceId,
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
    [habits, setHabits, selectedWorkspaceId, workspaces, persistHabits, showUndo],
  );

  const toggleHabit = useCallback(
    async (id: string) => {
      const today = getTodayDateKey();
      const habit = habits.find((h) => h.id === id);
      if (!habit) return;

      const currentlyCompleted = isHabitCompletedToday(habit, today);
      const isCompleting = !currentlyCompleted;

      let result;
      if (isCompleting) {
        result = await EntityCommandService.completeHabit(id, selectedWorkspaceId || INBOX_WORKSPACE_ID, {
          source: "tasks_screen",
          skipAnalytics: true,
          skipEvents: true,
        });
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
      } else {
        result = await EntityCommandService.uncompleteHabit(id, selectedWorkspaceId || INBOX_WORKSPACE_ID, {
          source: "tasks_screen",
          skipAnalytics: true,
          skipEvents: true,
        });
      }

      if (!result) return;
      const updatedHabit = result.updated;

      const nextHabits = habits.map((h) => (h.id === id ? updatedHabit : h));
      setHabits(nextHabits);
      // Removed duplicate `persistHabits` write since ECS handles persistence natively.

      emitStateChange("habits_changed", "tasks_screen");
    },
    [habits, setHabits, persistHabits, selectedWorkspaceId],
  );

  return {
    addHabit,
    deleteHabit,
    toggleHabit,
    persistHabits,
  };
}
