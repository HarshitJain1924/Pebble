import AsyncStorage from "@react-native-async-storage/async-storage";
import { getTodaySummary } from "./productivityHistory";

export type TodaySummary = Awaited<ReturnType<typeof getTodaySummary>>;

export const WIDGET_PAYLOAD_KEY = "@aura_widget_payload";

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

/**
 * Serializes and writes a lightweight JSON payload of active planner and habits data
 * to a shared storage key, allowing future native iOS Swift / Android Kotlin widget extensions
 * to instantly fetch and render real-time streak and goal updates.
 */
export async function exportWidgetPayload(
  completedTasks: number,
  totalTasks: number,
  pendingHabitTitles: string[],
  currentStreak: number,
  focusTimeToday = 0
): Promise<WidgetPayload> {
  const summary = await getTodaySummary();
  
  const payload: WidgetPayload = {
    updatedAt: Date.now(),
    currentStreak: Math.max(summary.currentStreak, currentStreak),
    completedTasks,
    totalTasks,
    completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    nextUpcomingTask: summary.pendingHabits.length > 0 ? summary.pendingHabits[0] : null,
    pendingHabitsCount: pendingHabitTitles.length,
    pendingHabitTitles,
    activeFocusSessionMinutes: focusTimeToday,
  };

  await AsyncStorage.setItem(WIDGET_PAYLOAD_KEY, JSON.stringify(payload));
  return payload;
}

/**
 * Reads serialized widget data safely.
 */
export async function getWidgetTodaySummary(): Promise<WidgetPayload | null> {
  const raw = await AsyncStorage.getItem(WIDGET_PAYLOAD_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WidgetPayload;
  } catch {
    return null;
  }
}

/**
 * Returns mock configuration guidelines for Quick Action deep links.
 * Used for App Shortcuts and Home Screen quick action launch triggers:
 * - "aura://focus?action=launch" -> Starts Pomodoro directly
 * - "aura://planner?action=quickadd" -> Opens Add Task directly
 */
export function getQuickAddActions() {
  return [
    {
      id: "quick_focus",
      title: "Launch Focus Session",
      subtitle: "Instantly start Pomodoro",
      icon: "clock",
      url: "aura://focus?action=launch",
    },
    {
      id: "quick_add_task",
      title: "Add New Task",
      subtitle: "Schedule priority goal",
      icon: "plus",
      url: "aura://planner?action=quickadd",
    },
    {
      id: "quick_streak",
      title: "View Streaks",
      subtitle: "Check habit continuity",
      icon: "zap",
      url: "aura://daily?action=streak",
    },
  ];
}
