import {
  handleHabitXpChange,
  handleTaskXpChange,
} from "@/features/settings/services/settings.service";
import { getDateKey } from "@/features/tasks/utils/task-formatting";
import {
  ChecklistRepository,
  HabitRepository,
  TaskRepository,
  WorkspaceRepository,
} from "@/repositories";
import { emitStateChange } from "@/services/events/state-events";
import { cancelReminderIds } from "@/services/scheduling/reminders.service";
import { appendGratitudeHistoryEntry } from "@/services/storage/storage.service";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { Task, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { generateId } from "@/shared/utils/id";
import * as Haptics from "expo-haptics";
import { useNavigation } from "expo-router";
import { useCallback } from "react";
import { Alert, Dimensions } from "react-native";
import { type Checklist } from "@/shared/types/domain.types";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

function getLastCompletionDate(
  history: { date: string }[],
): string | undefined {
  if (!history || history.length === 0) return undefined;
  const dates = history.map((e) => e.date).sort();
  return dates[dates.length - 1];
}

export interface UseTodayActionsOptions {
  loadDashboardData: () => Promise<void>;
  showUndo?: (options: {
    message: string;
    actionLabel: string;
    onUndo: () => Promise<void>;
  }) => void;
  setFlyingPebbles: React.Dispatch<
    React.SetStateAction<
      Array<{
        id: string;
        startX: number;
        startY: number;
        type: "task" | "habit";
      }>
    >
  >;
  setAllChecklists: React.Dispatch<
    React.SetStateAction<Record<string, Checklist[]>>
  >;
  gratitudeText: string;
  setGratitudeText: (text: string) => void;
  intentionText: string;
  setIntentionText: (text: string) => void;
  setIsReviewModalVisible: (visible: boolean) => void;
  allTodos?: Task[];
  allHabits?: any[];
}

export function useTodayActions({
  loadDashboardData,
  showUndo,
  setFlyingPebbles,
  setAllChecklists,
  gratitudeText,
  setGratitudeText,
  intentionText,
  setIntentionText,
  setIsReviewModalVisible,
  allTodos = [],
  allHabits = [],
}: UseTodayActionsOptions) {
  const handleRecoverMainStreak = useCallback(async () => {
    try {
      const {
        recoverMainStreak,
      } = require("@/features/profile/services/pebble.service");
      const success = await recoverMainStreak();
      if (success) {
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
        Alert.alert(
          "Streak Restored! 🔥",
          "Your daily pebble streak has been successfully restored.",
        );
        await loadDashboardData();
      } else {
        Alert.alert(
          "Insufficient Gems",
          "You need 1 Gem to restore your main streak.",
        );
      }
    } catch (e) {
      console.warn("Failed to recover main streak", e);
    }
  }, [loadDashboardData]);

  const toggleChecklistItemFromDashboard = useCallback(
    async (checklistId: string, itemId: string, folderId: string) => {
      try {
        const result = await EntityCommandService.toggleChecklistItem(checklistId, itemId, folderId, {
          skipEvents: true,
          skipAnalytics: true,
        });

        if (result) {
          const updatedChecklist = result.updated;

          setAllChecklists((prev) => {
            const next = { ...prev };
            if (next[folderId]) {
              next[folderId] = next[folderId].map((c) =>
                c.id === checklistId ? updatedChecklist : c,
              );
            }
            return next;
          });

          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
            () => {},
          );
          emitStateChange("checklists_changed");
        }
      } catch (e) {
        console.warn("Failed to toggle checklist item from dashboard", e);
      }
    },
    [setAllChecklists],
  );

  const completeTodoFromDashboard = useCallback(
    async (todoId: string, event?: any) => {
      try {
        let wsIdFound: string | null = null;
        let prevTodo: any = null;
        // Find the task in memory instead of reading from the repository
        prevTodo = allTodos.find((t) => t.id === todoId) || null;
        wsIdFound = prevTodo?.workspaceId || null;

        if (!prevTodo || !wsIdFound) return;

        const isCompleting = prevTodo.status !== "completed";

        let result;
        if (isCompleting) {
          result = await EntityCommandService.completeTask(todoId, wsIdFound, {
            skipEvents: true,
          });
        } else {
          result = await EntityCommandService.uncompleteTask(todoId, wsIdFound, {
            skipEvents: true,
          });
        }

        if (!result) return;

        if (isCompleting) {
          Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          ).catch(() => {});

          // Spawn flying pebble animation
          let clickX = SCREEN_WIDTH / 2;
          let clickY = SCREEN_HEIGHT * 0.8;
          if (event && event.nativeEvent) {
            clickX =
              event.nativeEvent.pageX || event.nativeEvent.locationX || clickX;
            clickY =
              event.nativeEvent.pageY || event.nativeEvent.locationY || clickY;
          }
          const pebbleId = Math.random().toString(36).substring(7);
          setFlyingPebbles((prev) => [
            ...prev,
            { id: pebbleId, startX: clickX, startY: clickY, type: "task" },
          ]);
        }

        await loadDashboardData();
        emitStateChange("tasks_changed");

        // show undo snackbar — restore previous todo state when undone
        try {
          if (showUndo && isCompleting) {
            showUndo({
              message: "Pebble marked completed.",
              actionLabel: "Undo",
              onUndo: async () => {
                try {
                  await EntityCommandService.uncompleteTask(todoId, wsIdFound!, {
                    skipEvents: true,
                  });
                  await loadDashboardData();
                  emitStateChange("tasks_changed");
                } catch {
                  // ignore
                }
              },
            });
          }
        } catch {
          // ignore undo errors
        }
      } catch {
        // ignore
      }
    },
    [loadDashboardData, showUndo, setFlyingPebbles],
  );

  const completeHabitFromDashboard = useCallback(
    async (habitId: string, event?: any) => {
      try {
        let wsIdFound: string | null = null;
        let prevHabit: any = null;
        // Find the habit in memory instead of reading from the repository
        prevHabit = allHabits.find((h) => h.id === habitId) || null;
        wsIdFound = prevHabit?.workspaceId || null;

        if (!prevHabit || !wsIdFound) return;

        const today = getDateKey();
        const completedToday =
          prevHabit.completionHistory?.some((e: any) => e.date === today) ||
          false;
        const isCompleting = !completedToday;

        let result;
        if (isCompleting) {
          result = await EntityCommandService.completeHabit(habitId, wsIdFound, {
            skipEvents: true,
          });
        } else {
          result = await EntityCommandService.uncompleteHabit(habitId, wsIdFound, {
            skipEvents: true,
          });
        }

        if (!result) return;

        if (isCompleting) {
          Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          ).catch(() => {});

          // Spawn flying pebble animation
          let clickX = SCREEN_WIDTH / 2;
          let clickY = SCREEN_HEIGHT * 0.8;
          if (event && event.nativeEvent) {
            clickX =
              event.nativeEvent.pageX || event.nativeEvent.locationX || clickX;
            clickY =
              event.nativeEvent.pageY || event.nativeEvent.locationY || clickY;
          }
          const pebbleId = Math.random().toString(36).substring(7);
          setFlyingPebbles((prev) => [
            ...prev,
            { id: pebbleId, startX: clickX, startY: clickY, type: "habit" },
          ]);
        }

        await loadDashboardData();
        emitStateChange("habits_changed");
      } catch (e) {
        console.warn("Failed to complete habit on dashboard", e);
      }
    },
    [loadDashboardData, setFlyingPebbles],
  );

  const handleSaveReview = useCallback(async () => {
    try {
      if (!gratitudeText.trim() && !intentionText.trim()) {
        setIsReviewModalVisible(false);
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );

      // 1. Save gratitude text to history logs
      if (gratitudeText.trim()) {
        await appendGratitudeHistoryEntry({
          id: String(Date.now()),
          text: gratitudeText.trim(),
          timestamp: Date.now(),
        });
      }

      // 2. Create tomorrow's intention task
      if (intentionText.trim()) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

        const newTask: Task = {
          id: generateId("task-"),
          title: intentionText.trim(),
          status: "todo",
          priority: "high",
          workspaceId: INBOX_WORKSPACE_ID,
          schedule: { date: tomorrowStr },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        await EntityCommandService.createTask(newTask, INBOX_WORKSPACE_ID, {
          skipEvents: true,
          skipAnalytics: true,
        });
      }

      // Reset fields and close
      setGratitudeText("");
      setIntentionText("");
      setIsReviewModalVisible(false);

      // Refresh listings
      await loadDashboardData();
      emitStateChange("tasks_changed");

      Alert.alert(
        "Review Saved! 🌟",
        "Your gratitude was logged, and your main intention has been scheduled for tomorrow.",
      );
    } catch (e) {
      console.warn("Failed to save review", e);
    }
  }, [
    gratitudeText,
    intentionText,
    loadDashboardData,
    setGratitudeText,
    setIntentionText,
    setIsReviewModalVisible,
  ]);

  return {
    completeTodoFromDashboard,
    completeHabitFromDashboard,
    toggleChecklistItemFromDashboard,
    handleSaveReview,
    handleRecoverMainStreak,
  };
}
