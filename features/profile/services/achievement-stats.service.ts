/**
 * achievement-stats.service.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Single canonical source for the activity numbers that achievements are
 * evaluated against.
 *
 * Both the Profile gateway ("Achievements · N of 10") and the Achievements
 * screen read from here so the unlocked count can never disagree between the
 * two surfaces. The calculation is the exact pipeline the Achievements screen
 * has always used — this is an extraction, not a behaviour change.
 *
 * Pebble/Gem currency totals are NOT computed here; those come from
 * `pebble.service.ts` (`getPebbleCounts` / `getGemsBalance`).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  HabitRepository,
  TaskRepository,
  WorkspaceRepository,
} from "@/repositories";
import {
  INBOX_WORKSPACE_ID,
  MY_PEBBLES_WORKSPACE_ID,
} from "@/shared/types/domain.types";
import {
  isHabitCompletedToday,
  isTaskCompleted,
} from "@/shared/utils/domain-selectors";
import { getTodayDateKey } from "@/shared/utils/date-key";
import { getPebbleCounts } from "@/features/profile/services/pebble.service";

const FOCUS_STATS_KEY = "todoapp:focus:stats";
const HISTORY_KEY = "pebble:history";

export interface AchievementStats {
  todosCompleted: number;
  habitsCompleted: number;
  activeStreak: number;
  focusSessions: number;
  focusTime: number;
}

export async function getAchievementStats(): Promise<AchievementStats> {
  const folderList = await WorkspaceRepository.getWorkspaces();
  const folderIds = Array.from(
    new Set([
      INBOX_WORKSPACE_ID,
      MY_PEBBLES_WORKSPACE_ID,
      ...folderList.map((f) => f.id),
    ]),
  );

  let totalCompletedTodos = 0;
  for (const fId of folderIds) {
    const tasksMap = await TaskRepository.getTasks(fId);
    Object.values(tasksMap).forEach((t: any) => {
      if (isTaskCompleted(t)) totalCompletedTodos += 1;
    });
  }

  const todayKey = getTodayDateKey();
  let totalCompletedHabitsToday = 0;
  let activeStreak = 0;

  for (const fId of folderIds) {
    const habitsMap = await HabitRepository.getHabits(fId);
    Object.values(habitsMap).forEach((h: any) => {
      if (isHabitCompletedToday(h, todayKey)) totalCompletedHabitsToday += 1;
      activeStreak = Math.max(activeStreak, h.streak || 0, h.bestStreak || 0);
    });
  }

  // Lifetime history for days before today (same semantics as before).
  const rawHistory = await AsyncStorage.getItem(HISTORY_KEY);
  let pastTodosCompleted = 0;
  let pastHabitsCompleted = 0;
  if (rawHistory) {
    try {
      const historyList = JSON.parse(rawHistory);
      if (Array.isArray(historyList)) {
        historyList.forEach((entry: any) => {
          if (entry.date !== todayKey) {
            pastTodosCompleted += entry.completedTodos || 0;
            pastHabitsCompleted += entry.completedHabits || 0;
          }
        });
      }
    } catch {
      // ignore malformed history
    }
  }

  const pebbleCounts = await getPebbleCounts();

  let focusTime = 0;
  const rawFocus = await AsyncStorage.getItem(FOCUS_STATS_KEY);
  if (rawFocus) {
    try {
      const parsed = JSON.parse(rawFocus);
      focusTime = parsed.totalFocusTime ?? 0;
    } catch {
      // ignore malformed focus stats
    }
  }

  return {
    todosCompleted: pastTodosCompleted + totalCompletedTodos,
    habitsCompleted: pastHabitsCompleted + totalCompletedHabitsToday,
    activeStreak: Math.max(
      pebbleCounts.streak,
      pebbleCounts.bestStreak,
      activeStreak,
    ),
    focusSessions: pebbleCounts.lifetimeTypes?.focus ?? 0,
    focusTime,
  };
}
