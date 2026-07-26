import { getTodaySummary } from "@/services/analytics/productivity-history.service";
import { isTaskCompleted, isHabitCompletedToday, getHabitCurrentStreak } from "@/shared/utils/domain-selectors";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type TodaySummary = Awaited<ReturnType<typeof getTodaySummary>>;

export const WIDGET_PAYLOAD_KEY = "@pebble_widget_payload";

export type WidgetPayload = {
  updatedAt: number;
  currentStreak: number;
  completedTasks: number;
  totalTasks: number;
  completionRate: number;
  nextUpcomingTask: string | null;
  pendingHabitsCount: number;
  pendingHabitTitles: string[];
  activeFocusSessionMinutes: number;
};

export async function exportWidgetPayload(
  completedTasks: number,
  totalTasks: number,
  pendingHabitTitles: string[],
  currentStreak: number,
  focusTimeToday = 0,
): Promise<WidgetPayload> {
  const summary = await getTodaySummary();

  const payload: WidgetPayload = {
    updatedAt: Date.now(),
    currentStreak: Math.max(summary.currentStreak, currentStreak),
    completedTasks,
    totalTasks,
    completionRate:
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    nextUpcomingTask:
      summary.pendingHabits.length > 0 ? summary.pendingHabits[0] : null,
    pendingHabitsCount: pendingHabitTitles.length,
    pendingHabitTitles,
    activeFocusSessionMinutes: focusTimeToday,
  };

  await AsyncStorage.setItem(WIDGET_PAYLOAD_KEY, JSON.stringify(payload));
  return payload;
}

export async function syncWidgetData(
  focusTimeToday = 0,
): Promise<WidgetPayload> {
  let completedTasks = 0;
  let totalTasks = 0;
  let pendingHabitTitles: string[] = [];
  let currentStreak = 0;
  let summaryPending: string | null = null;

  try {
    const { UiStateRepository, TaskRepository, HabitRepository } =
      await import("@/repositories");
    const activeWorkspace =
      (await UiStateRepository.getUiState()).activeWorkspaceId || "default";

    // Load Tasks
    const tasksMap = await TaskRepository.getTasks(activeWorkspace);
    const allTodos = Object.values(tasksMap).filter((t: any) => !t.archivedAt);
    totalTasks = allTodos.length;
    completedTasks = allTodos.filter((t: any) => isTaskCompleted(t)).length;

    // Load Habits
    const habitsMap = await HabitRepository.getHabits(activeWorkspace);
    const allHabits = Object.values(habitsMap).filter((h: any) => !h.archivedAt);

    const pendingHabits = allHabits.filter((h: any) => !isHabitCompletedToday(h));
    pendingHabitTitles = pendingHabits.map((h: any) => h.title);
    currentStreak = allHabits.reduce(
      (max, h: any) => Math.max(max, getHabitCurrentStreak(h)),
      0,
    );
    if (pendingHabitTitles.length > 0) {
      summaryPending = pendingHabitTitles[0];
    }
  } catch (e) {
    console.warn(
      "Failed to aggregate Pebble repository data for widget sync",
      e,
    );
  }

  const payload: WidgetPayload = {
    updatedAt: Date.now(),
    currentStreak,
    completedTasks,
    totalTasks,
    completionRate:
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    nextUpcomingTask: summaryPending,
    pendingHabitsCount: pendingHabitTitles.length,
    pendingHabitTitles,
    activeFocusSessionMinutes: focusTimeToday,
  };

  await AsyncStorage.setItem(WIDGET_PAYLOAD_KEY, JSON.stringify(payload));
  return payload;
}

export async function getWidgetTodaySummary(): Promise<WidgetPayload | null> {
  const raw = await AsyncStorage.getItem(WIDGET_PAYLOAD_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WidgetPayload;
  } catch {
    return null;
  }
}

export function getQuickAddActions() {
  return [
    {
      id: "quick_focus",
      title: "Launch Focus Session",
      subtitle: "Instantly start Pomodoro",
      icon: "clock",
      url: "pebble://focus?action=launch",
    },
    {
      id: "quick_add_task",
      title: "Add New Task",
      subtitle: "Schedule priority goal",
      icon: "plus",
      url: "pebble://planner?action=quickadd",
    },
    {
      id: "quick_streak",
      title: "View Streaks",
      subtitle: "Check habit continuity",
      icon: "zap",
      url: "pebble://daily?action=streak",
    },
  ];
}
