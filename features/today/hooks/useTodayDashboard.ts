import {
  getMainStreakRecoveryInfo,
  StreakRecoveryInfo,
} from "@/features/profile/services/pebble.service";
import {
  ChecklistRepository,
  HabitRepository,
  TaskRepository,
  WorkspaceRepository,
} from "@/repositories";
import {
  getDateKey,
  isRecurringOccurrenceForDate,
} from "@/services/scheduling/recurrence.service";
import { Checklist, Habit, Task, Workspace } from "@/shared/types/domain.types";
import {
  getHabitCurrentStreak,
  isHabitCompletedToday,
  isTaskCompleted,
  isTaskOverdue,
} from "@/shared/utils/domain-selectors";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

export interface TodayDashboardStats {
  todoStats: {
    pending: Task[];
    overdue: Task[];
    completed: number;
    total: number;
  };
  pendingHabits: Habit[];
  completedHabits: Habit[];
  allChecklists: Record<string, Checklist[]>;
  categoryCounts: Record<string, number>;
  habitStats: {
    completed: number;
    total: number;
    maxStreak: number;
  };
  folders: Workspace[];
  mainStreak: number;
  recoveryInfo: StreakRecoveryInfo | null;
  closestReminderTime: number | null;
  isLoading: boolean;
  loadDashboardData: () => Promise<void>;
}

export function useTodayDashboard(): TodayDashboardStats {
  const [todoStats, setTodoStats] = useState({
    pending: [] as Task[],
    overdue: [] as Task[],
    completed: 0,
    total: 0,
  });
  const [pendingHabits, setPendingHabits] = useState<Habit[]>([]);
  const [completedHabits, setCompletedHabits] = useState<Habit[]>([]);
  const [allChecklists, setAllChecklists] = useState<
    Record<string, Checklist[]>
  >({});
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>(
    {},
  );
  const [habitStats, setHabitStats] = useState({
    completed: 0,
    total: 0,
    maxStreak: 0,
  });
  const [folders, setFolders] = useState<Workspace[]>([]);
  const [mainStreak, setMainStreak] = useState(0);
  const [recoveryInfo, setRecoveryInfo] = useState<StreakRecoveryInfo | null>(
    null,
  );
  const [closestReminderTime, setClosestReminderTime] = useState<number | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    try {
      setIsLoading(true);
      const todayStr = getDateKey();
      const loadedFolders = await WorkspaceRepository.getWorkspaces();
      setFolders(loadedFolders);

      const workspaceIds = Array.from(
        new Set(["default", ...loadedFolders.map((f) => f.id)]),
      );

      const allTasks: Task[] = [];
      const allHabitsList: Habit[] = [];
      const checklistsMap: Record<string, Checklist[]> = {};

      for (const wsId of workspaceIds) {
        const tasks = await TaskRepository.getTasks(wsId);
        Object.values(tasks).forEach((t) => {
          if (!t.archivedAt) {
            allTasks.push(t);
          }
        });

        const habits = await HabitRepository.getHabits(wsId);
        Object.values(habits).forEach((h) => {
          if (!h.archivedAt) {
            allHabitsList.push(h);
          }
        });

        const chks = await ChecklistRepository.getChecklists(wsId);
        checklistsMap[wsId] = Object.values(chks).filter((c) => !c.archivedAt);
      }

      setAllChecklists(checklistsMap);

      // Tasks processing
      const overdueTasks = allTasks.filter(
        (t) => !isTaskCompleted(t) && isTaskOverdue(t, todayStr),
      );
      const pendingTasks = allTasks.filter(
        (t) => !isTaskCompleted(t) && !isTaskOverdue(t, todayStr),
      );
      const completedTasksCount = allTasks.filter((t) =>
        isTaskCompleted(t),
      ).length;

      pendingTasks.sort((a, b) => {
        const orderA = a.priority === "high" ? 0 : a.priority === "low" ? 2 : 1;
        const orderB = b.priority === "high" ? 0 : b.priority === "low" ? 2 : 1;
        return orderA - orderB;
      });

      overdueTasks.sort((a, b) => {
        const orderA = a.priority === "high" ? 0 : a.priority === "low" ? 2 : 1;
        const orderB = b.priority === "high" ? 0 : b.priority === "low" ? 2 : 1;
        return orderA - orderB;
      });

      const nextCategoryCounts: Record<string, number> = {};
      let closestReminder: number | null = null;

      allTasks.forEach((t) => {
        if (!isTaskCompleted(t)) {
          const cat = t.categoryId || "general";
          nextCategoryCounts[cat] = (nextCategoryCounts[cat] ?? 0) + 1;

          if (t.reminder?.triggerAt && t.reminder.triggerAt > Date.now()) {
            if (!closestReminder || t.reminder.triggerAt < closestReminder) {
              closestReminder = t.reminder.triggerAt;
            }
          }
        }
      });

      setTodoStats({
        pending: pendingTasks,
        overdue: overdueTasks,
        completed: completedTasksCount,
        total: allTasks.length,
      });
      setCategoryCounts(nextCategoryCounts);
      setClosestReminderTime(closestReminder);

      // Habits processing
      const todayHabits = allHabitsList.filter((h) => {
        if (h.recurrence) {
          return isRecurringOccurrenceForDate(h, todayStr);
        }
        return true;
      });

      const pendingH = todayHabits.filter(
        (h) => !isHabitCompletedToday(h, todayStr),
      );
      const completedH = todayHabits.filter((h) =>
        isHabitCompletedToday(h, todayStr),
      );
      const maxStk = todayHabits.reduce(
        (max, h) => Math.max(max, getHabitCurrentStreak(h, todayStr)),
        0,
      );

      setPendingHabits(pendingH);
      setCompletedHabits(completedH);
      setHabitStats({
        completed: completedH.length,
        total: todayHabits.length,
        maxStreak: maxStk,
      });

      // Streak recovery info
      const recovery = await getMainStreakRecoveryInfo();
      setRecoveryInfo(recovery);
      setMainStreak(maxStk);
    } catch (e) {
      console.warn("Failed to load today dashboard", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [loadDashboard]),
  );

  return {
    todoStats,
    pendingHabits,
    completedHabits,
    allChecklists,
    categoryCounts,
    habitStats,
    folders,
    mainStreak,
    recoveryInfo,
    closestReminderTime,
    isLoading,
    loadDashboardData: loadDashboard,
  };
}
