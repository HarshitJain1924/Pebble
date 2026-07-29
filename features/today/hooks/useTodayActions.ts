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
import {
  INBOX_WORKSPACE_ID,
  type Checklist,
} from "@/shared/types/domain.types";
import * as Haptics from "expo-haptics";
import { useCallback } from "react";
import { Alert, Dimensions } from "react-native";

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
        const checklistsMap = await ChecklistRepository.getChecklists(folderId);
        const checklist = checklistsMap[checklistId];
        if (checklist) {
          const updatedChecklist = {
            ...checklist,
            items: (checklist.items || []).map((i) =>
              i.id === itemId ? { ...i, completed: !i.completed } : i,
            ),
          };
          await ChecklistRepository.saveChecklist(updatedChecklist as any);

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
        let prevTodo: any = null;
        const workspaceList = await WorkspaceRepository.getWorkspaces();
        const workspaceIds = Array.from(
          new Set([INBOX_WORKSPACE_ID, ...workspaceList.map((f: any) => f.id)]),
        );

        for (const wsId of workspaceIds) {
          const tasksMap = await TaskRepository.getTasks(wsId);
          if (tasksMap[todoId]) {
            prevTodo = tasksMap[todoId];
            break;
          }
        }

        if (!prevTodo) return;

        const { xpAwarded } = await handleTaskXpChange(prevTodo, true);

        // Cancel reminders from canonical reminder.notificationIds
        await cancelReminderIds(prevTodo.reminder?.notificationIds);
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});

        await TaskRepository.saveTask({
          ...prevTodo,
          status: "completed",
          completedAt: Date.now(),
          xpAwarded,
        });

        // Earn task pebble
        const {
          earnPebble,
        } = require("@/features/profile/services/pebble.service");
        await earnPebble("task");

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

        await loadDashboardData();
        emitStateChange("tasks_changed");

        // show undo snackbar — restore previous todo state when undone
        try {
          if (showUndo) {
            showUndo({
              message: "Pebble marked completed.",
              actionLabel: "Undo",
              onUndo: async () => {
                try {
                  if (!prevTodo) return;
                  await handleTaskXpChange(prevTodo, false);
                  const {
                    undoLastPebble,
                  } = require("@/features/profile/services/pebble.service");
                  await undoLastPebble("task");

                  await TaskRepository.saveTask({
                    ...prevTodo,
                    status: "todo",
                    completedAt: undefined,
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
        let prevHabit: any = null;
        const workspaceList = await WorkspaceRepository.getWorkspaces();
        const workspaceIds = Array.from(
          new Set([INBOX_WORKSPACE_ID, ...workspaceList.map((f: any) => f.id)]),
        );

        for (const wsId of workspaceIds) {
          const habitsMap = await HabitRepository.getHabits(wsId);
          if (habitsMap[habitId]) {
            prevHabit = habitsMap[habitId];
            break;
          }
        }

        if (!prevHabit) return;

        const today = getDateKey();
        const yesterday = getDateKey(
          new Date(Date.now() - 24 * 60 * 60 * 1000),
        );

        const completedToday =
          prevHabit.completionHistory?.some((e: any) => e.date === today) ||
          false;
        const nextCompleted = !completedToday;
        const { xpAwardedDate } = await handleHabitXpChange(
          {
            ...prevHabit,
            completedToday: !!completedToday,
          },
          nextCompleted,
          today,
        );

        let streak = prevHabit.streak || 0;
        let completionHistory = [...(prevHabit.completionHistory || [])];
        if (nextCompleted) {
          if (!completionHistory.some((e: any) => e.date === today)) {
            completionHistory.push({ date: today, completedAt: Date.now() });
          }
          let nextStreak = 1;
          const lastDate = getLastCompletionDate(completionHistory);
          if (lastDate === today) {
            nextStreak = prevHabit.streak || 1;
          } else if (lastDate === yesterday) {
            nextStreak = (prevHabit.streak || 0) + 1;
          }
          streak = nextStreak;
        } else {
          completionHistory = completionHistory.filter(
            (e: any) => e.date !== today,
          );
          streak = Math.max(0, streak - 1);
        }

        const updatedHabit = {
          ...prevHabit,
          completionHistory,
          streak,
          bestStreak: Math.max(prevHabit.bestStreak || 0, streak),
          lastCompletedDate: nextCompleted
            ? today
            : streak > 0
              ? yesterday
              : undefined,
          xpAwardedDate,
        };

        await HabitRepository.saveHabit(updatedHabit);

        if (nextCompleted) {
          Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          ).catch(() => {});
        }

        // Record history snapshot
        const {
          recordDailyHistorySnapshot,
        } = require("@/services/analytics/productivity-history.service");
        void recordDailyHistorySnapshot();

        const {
          earnPebble,
          undoLastPebble,
        } = require("@/features/profile/services/pebble.service");
        if (nextCompleted) {
          await earnPebble("habit");

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
        } else {
          await undoLastPebble("habit");
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

        const newTodo = {
          id: String(Date.now()),
          title: intentionText.trim(),
          completed: false,
          priority: "high", // high priority!
          workspaceId: INBOX_WORKSPACE_ID,
          scheduledDate: tomorrowStr,
          created: Date.now(),
        };

        await TaskRepository.saveTask(newTodo);
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
