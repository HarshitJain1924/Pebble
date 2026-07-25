import { useCallback } from "react";
import {
  ChecklistRepository,
  HabitRepository,
  TaskRepository,
  WorkspaceRepository,
} from "@/repositories";
import {
  getDateKey,
  getTodoDateKey,
} from "@/features/tasks/utils/task-formatting";
import {
  TASK_CATEGORY_KEYS,
  normalizeTaskCategory,
} from "@/features/tasks/services/task-categories";
import { normalizeHabitsForToday } from "@/features/habits/services/habit.service";
import { isRecurringOccurrenceForDate } from "@/services/scheduling/recurrence.service";
import { type UserProfile } from "@/features/settings/services/settings.service";
import {
  type Checklist,
  type Habit,
  type Task,
  type Workspace,
} from "@/shared/types/domain.types";

export interface UseTodayDashboardOptions {
  setFolders: React.Dispatch<React.SetStateAction<Workspace[]>>;
  setTodoStats: React.Dispatch<
    React.SetStateAction<{
      completed: number;
      total: number;
      pending: Task[];
      overdue: Task[];
    }>
  >;
  setPendingHabits: React.Dispatch<React.SetStateAction<Habit[]>>;
  setCompletedHabits: React.Dispatch<React.SetStateAction<Habit[]>>;
  setHabitStats: React.Dispatch<
    React.SetStateAction<{
      completed: number;
      total: number;
      maxStreak: number;
    }>
  >;
  setCategoryCounts: React.Dispatch<
    React.SetStateAction<Record<string, number>>
  >;
  setAllChecklists: React.Dispatch<
    React.SetStateAction<Record<string, Checklist[]>>
  >;
  setNextReminder: React.Dispatch<React.SetStateAction<string | null>>;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  setHasUnreadNotifs: React.Dispatch<React.SetStateAction<boolean>>;
  setLifetimePebbles: React.Dispatch<React.SetStateAction<number>>;
  setMonthlyPebbles: React.Dispatch<React.SetStateAction<number>>;
  setMonthlyTypes: React.Dispatch<
    React.SetStateAction<{ task: number; habit: number; focus: number }>
  >;
  setLifetimeTypes: React.Dispatch<
    React.SetStateAction<{ task: number; habit: number; focus: number }>
  >;
  setStreak: React.Dispatch<React.SetStateAction<number>>;
  setWeeklyStatus: React.Dispatch<React.SetStateAction<boolean[]>>;
  setGemsBalance: React.Dispatch<React.SetStateAction<number>>;
  setMainStreakRecoveryInfo: React.Dispatch<
    React.SetStateAction<{ canRecover: boolean; cost: number }>
  >;
}

export function useTodayDashboard({
  setFolders,
  setTodoStats,
  setPendingHabits,
  setCompletedHabits,
  setHabitStats,
  setCategoryCounts,
  setAllChecklists,
  setNextReminder,
  setProfile,
  setHasUnreadNotifs,
  setLifetimePebbles,
  setMonthlyPebbles,
  setMonthlyTypes,
  setLifetimeTypes,
  setStreak,
  setWeeklyStatus,
  setGemsBalance,
  setMainStreakRecoveryInfo,
}: UseTodayDashboardOptions) {
  const loadDashboardData = useCallback(async () => {
    try {
      const todayStr = getDateKey();

      // 1. Load Folders and Tasks via Repositories
      const folderList = await WorkspaceRepository.getWorkspaces();
      const folderIds = Array.from(
        new Set(["default", "unassigned", ...folderList.map((f) => f.id)]),
      );

      const foldersData =
        folderList.length > 0
          ? folderList.map((f) => ({
              id: f.id,
              name: f.name,
              emoji: f.emoji || "📁",
              color: f.color || "#6366F1",
            }))
          : [
              {
                id: "default",
                name: "My Pebbles",
                emoji: "📋",
                color: "#6366F1",
              },
            ];
      setFolders(foldersData);

      let tCompleted = 0;
      let tTotal = 0;
      let pendingList: Task[] = [];
      let closestAlarm: number | null = null;
      const nextCategoryCounts = Object.fromEntries(
        TASK_CATEGORY_KEYS.map((key) => [key, 0]),
      ) as Record<string, number>;

      const rawList: Task[] = [];
      const rawHabitsList: Habit[] = [];

      for (const folderId of folderIds) {
        // Load tasks
        const tasksMap = await TaskRepository.getTasks(folderId);
        Object.values(tasksMap).forEach((task) => {
          const resolvedWorkspaceId =
            task.workspaceId || (task as any).folderId || folderId;
          rawList.push({
            id: task.id,
            workspaceId: resolvedWorkspaceId,
            folderId: resolvedWorkspaceId,
            title: task.title,
            completed: task.completed,
            completedAt: task.completedAt,
            priority: task.priority || "medium",
            category: normalizeTaskCategory(task.category),
            createdAt: task.createdAt,
            archived: task.archived,
            description: task.description,
            scheduledDate: task.scheduledDate || "inbox",
            scheduledTime: task.scheduledTime,
            durationMinutes: task.durationMinutes,
            alarmTime: task.alarmTime,
            alarmId: task.alarmId,
            notificationIds: task.notificationIds,
          });
        });

        // Load habits
        const habitsMap = await HabitRepository.getHabits(folderId);
        Object.values(habitsMap).forEach((habit) => {
          const resolvedWorkspaceId =
            habit.workspaceId || (habit as any).folderId || folderId;
          rawHabitsList.push({
            id: habit.id,
            workspaceId: resolvedWorkspaceId,
            folderId: resolvedWorkspaceId,
            title: habit.title,
            completedToday: habit.completedDates?.includes(todayStr) || false,
            streak: habit.streak || 0,
            bestStreak: habit.bestStreak || 0,
            priority: habit.priority || "medium",
            category: normalizeTaskCategory(habit.category),
            createdAt: habit.createdAt,
            archived: habit.archived,
            reminderHour: habit.reminderHour,
            reminderMinute: habit.reminderMinute,
            reminderDays: habit.reminderDays,
            recurrence: habit.recurrence,
            notificationIds: habit.notificationIds,
          });
        });
      }

      const allTodos = rawList.filter((todo) => {
        if (todo.archived) return false;
        if (todo.scheduledDate === "inbox") {
          return true;
        }
        const todoDate = getTodoDateKey(todo);
        if (todoDate > todayStr) {
          return false;
        }
        return true;
      });

      // Separate today's tasks and overdue tasks
      const overdueTodos = allTodos.filter(
        (t) =>
          !t.completed &&
          getTodoDateKey(t) < todayStr &&
          getTodoDateKey(t) !== "inbox",
      );
      const todayTodos = allTodos.filter(
        (t) =>
          getTodoDateKey(t) === todayStr ||
          t.completed ||
          getTodoDateKey(t) === "inbox",
      );

      tTotal = todayTodos.length;
      tCompleted = todayTodos.filter((t) => t.completed).length;

      // Sort pending today's todos by priority: High -> Medium -> Low
      const pendingTodos = todayTodos.filter((t) => !t.completed);
      pendingTodos.sort((a, b) => {
        const orderA = a.priority === "high" ? 0 : a.priority === "low" ? 2 : 1;
        const orderB = b.priority === "high" ? 0 : b.priority === "low" ? 2 : 1;
        return orderA - orderB;
      });
      pendingList = pendingTodos;

      // Sort overdue todos by priority: High -> Medium -> Low
      const overdueList = [...overdueTodos];
      overdueList.sort((a, b) => {
        const orderA = a.priority === "high" ? 0 : a.priority === "low" ? 2 : 1;
        const orderB = b.priority === "high" ? 0 : b.priority === "low" ? 2 : 1;
        return orderA - orderB;
      });

      allTodos.forEach((todo) => {
        if (todo.completed) {
          return;
        }

        const category = normalizeTaskCategory(todo.category);
        nextCategoryCounts[category] = (nextCategoryCounts[category] ?? 0) + 1;
      });

      allTodos.forEach((t) => {
        if (t.alarmTime && t.alarmTime > Date.now()) {
          if (!closestAlarm || t.alarmTime < closestAlarm)
            closestAlarm = t.alarmTime;
        }
      });

      setTodoStats({
        completed: tCompleted,
        total: tTotal,
        pending: pendingList,
        overdue: overdueList,
      });

      // 2. Load and Normalize Habits
      let hCompleted = 0;
      let hTotal = 0;
      let maxStreak = 0;
      let unfinishedHabitsList: Habit[] = [];
      let finishedHabitsList: Habit[] = [];

      const normalized = normalizeHabitsForToday(rawHabitsList);
      if (JSON.stringify(normalized) !== JSON.stringify(rawHabitsList)) {
        for (const normalizedHabit of normalized) {
          const originalHabit = rawHabitsList.find(
            (h) => h.id === normalizedHabit.id,
          );
          if (
            originalHabit &&
            JSON.stringify(originalHabit) !== JSON.stringify(normalizedHabit)
          ) {
            const habitsMap = await HabitRepository.getHabits(
              normalizedHabit.folderId || "default",
            );
            const originalFull = habitsMap[normalizedHabit.id];
            if (originalFull) {
              await HabitRepository.saveHabit({
                ...originalFull,
                streak: normalizedHabit.streak,
                bestStreak: normalizedHabit.bestStreak,
              });
            }
          }
        }
      }

      const todayDate = new Date();
      const dayOfWeek = todayDate.getDay();
      const allHabits = normalized.filter((h) => {
        if (h.archived) return false;
        if (h.recurrence) {
          return isRecurringOccurrenceForDate(h, todayStr);
        }
        return (
          !h.reminderDays ||
          h.reminderDays.length === 0 ||
          h.reminderDays.includes(dayOfWeek)
        );
      });
      hTotal = allHabits.length;
      hCompleted = allHabits.filter((h) => h.completedToday).length;

      // Sort unfinished habits by priority: High -> Medium -> Low
      const unfinished = allHabits.filter((h) => !h.completedToday);
      unfinished.sort((a, b) => {
        const orderA = a.priority === "high" ? 0 : a.priority === "low" ? 2 : 1;
        const orderB = b.priority === "high" ? 0 : b.priority === "low" ? 2 : 1;
        return orderA - orderB;
      });
      unfinishedHabitsList = unfinished;
      finishedHabitsList = allHabits.filter((h) => h.completedToday);
      maxStreak = allHabits.reduce((max, h) => Math.max(max, h.streak || 0), 0);

      setPendingHabits(unfinishedHabitsList);
      setCompletedHabits(finishedHabitsList);
      setHabitStats({ completed: hCompleted, total: hTotal, maxStreak });

      setCategoryCounts({ ...nextCategoryCounts });

      // 3. Load Checklists via Repository
      const loadedChecklists: Record<string, any[]> = {};
      for (const fId of folderIds) {
        const checklistsMap = await ChecklistRepository.getChecklists(fId);
        loadedChecklists[fId] = Object.values(checklistsMap).map((c: any) => ({
          id: c.id,
          folderId: fId,
          title: c.title,
          items: c.items || [],
          createdAt: c.createdAt,
          archived: c.archived || false,
        }));
      }
      setAllChecklists(loadedChecklists);

      if (closestAlarm) {
        const d = new Date(closestAlarm);
        setNextReminder(
          d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        );
      } else {
        setNextReminder(null);
      }

      // Load Profile & Notifications Inbox status
      try {
        const {
          getProfile,
        } = require("@/features/settings/services/settings.service");
        const userProfile = await getProfile();
        setProfile(userProfile);

        const {
          getNotificationLogs,
        } = require("@/services/scheduling/notifications-log");
        const logs = await getNotificationLogs();
        const hasUnread = logs.some((l: any) => !l.read);
        setHasUnreadNotifs(hasUnread);

        // Calculate lifetime & monthly pebbles using the new service
        const {
          getPebbleCounts,
          getGemsBalance,
          getMainStreakRecoveryInfo,
        } = require("@/features/profile/services/pebble.service");
        const pebbleStats = await getPebbleCounts();
        setLifetimePebbles(pebbleStats.lifetime);
        setMonthlyPebbles(pebbleStats.monthly);
        setMonthlyTypes(pebbleStats.monthlyTypes);
        setLifetimeTypes(
          pebbleStats.lifetimeTypes || { task: 0, habit: 0, focus: 0 },
        );
        setStreak(pebbleStats.streak);
        setWeeklyStatus(pebbleStats.weeklyStatus);

        const balance = await getGemsBalance();
        setGemsBalance(balance);

        const recInfo = await getMainStreakRecoveryInfo();
        setMainStreakRecoveryInfo(recInfo);
      } catch {
        // ignore
      }
    } catch {
      // ignore
    }
  }, [
    setFolders,
    setTodoStats,
    setPendingHabits,
    setCompletedHabits,
    setHabitStats,
    setCategoryCounts,
    setAllChecklists,
    setNextReminder,
    setProfile,
    setHasUnreadNotifs,
    setLifetimePebbles,
    setMonthlyPebbles,
    setMonthlyTypes,
    setLifetimeTypes,
    setStreak,
    setWeeklyStatus,
    setGemsBalance,
    setMainStreakRecoveryInfo,
  ]);

  return { loadDashboardData };
}
