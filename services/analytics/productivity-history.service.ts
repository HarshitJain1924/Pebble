import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { withLock } from "@/shared/utils/mutex";

import {
  HabitRepository,
  TaskRepository,
  UiStateRepository,
} from "@/repositories";
import { HISTORY_STORAGE_KEY, type GratitudeHistoryEntry, getGratitudeHistory, appendGratitudeHistoryEntry } from "@/services/storage/storage.service";
import { isTaskCompleted, isHabitCompletedToday, getHabitCurrentStreak } from "@/shared/utils/domain-selectors";
import { dateKeyFromDate, getTodayDateKey } from "@/shared/utils/date-key";

export type DailyHistory = {
  date: string;
  completedHabits: number;
  totalHabits: number;
  completedTodos: number;
  totalTodos: number;
  score: number;
  completedHabitTitles: string[];
  completedTodoTitles: string[];
};

export type { GratitudeHistoryEntry };
export { getGratitudeHistory, appendGratitudeHistoryEntry };

function toCompletionScore(completed: number, total: number) {
  if (total === 0) {
    return 0;
  }
  return Math.round((completed / total) * 100);
}

export async function getTodaySummary() {
  const uiState = await UiStateRepository.getUiState();
  const wsId = uiState.activeWorkspaceId || INBOX_WORKSPACE_ID;

  const [tasksMap, habitsMap] = await Promise.all([
    TaskRepository.getTasks(wsId),
    HabitRepository.getHabits(wsId),
  ]);

  const habits = Object.values(habitsMap).filter((h) => !h.archivedAt);
  const todos = Object.values(tasksMap).filter((t) => !t.archivedAt);

  const completedHabits = habits.filter((habit) => isHabitCompletedToday(habit)).length;
  const completedTodos = todos.filter((todo) => isTaskCompleted(todo)).length;

  const currentStreak = habits.reduce(
    (max, habit) => Math.max(max, getHabitCurrentStreak(habit)),
    0
  );

  return {
    completedToday: completedHabits + completedTodos,
    totalToday: habits.length + todos.length,
    currentStreak,
    pendingHabits: habits
      .filter((habit) => !isHabitCompletedToday(habit))
      .map((habit) => habit.title),
  };
}

export async function getAllHistory(): Promise<DailyHistory[]> {
  try {
    const historyRaw = await AsyncStorage.getItem(HISTORY_STORAGE_KEY);
    if (!historyRaw) {
      return [];
    }
    const history = JSON.parse(historyRaw);
    return Array.isArray(history) ? (history as DailyHistory[]) : [];
  } catch {
    return [];
  }
}

/**
 * Serializes the daily-history read-modify-write.
 *
 * Nearly every command invokes this fire-and-forget. Without a lock, two
 * concurrent invocations read the same array and each writes
 * `[todaySnapshot, ...]`; the second write drops the first snapshot's content
 * (only today's entry changes, so older days survive, but the derived score can
 * still regress to a stale value). The lock keeps each writer's read and write
 * in one critical section.
 */
const HISTORY_LOCK = "pebble:v1:history";

export async function recordDailyHistorySnapshot() {
  const today = getTodayDateKey();
  const uiState = await UiStateRepository.getUiState();
  const wsId = uiState.activeWorkspaceId || INBOX_WORKSPACE_ID;

  const [tasksMap, habitsMap] = await Promise.all([
    TaskRepository.getTasks(wsId),
    HabitRepository.getHabits(wsId),
  ]);

  const habits = Object.values(habitsMap).filter((h) => !h.archivedAt);
  const todos = Object.values(tasksMap).filter((t) => !t.archivedAt);

  const completedHabits = habits.filter((habit) => isHabitCompletedToday(habit)).length;
  const completedTodos = todos.filter((todo) => isTaskCompleted(todo)).length;
  const totalHabits = habits.length;
  const totalTodos = todos.length;
  const score = toCompletionScore(
    completedHabits + completedTodos,
    totalHabits + totalTodos,
  );

  const snapshot: DailyHistory = {
    date: today,
    completedHabits,
    totalHabits,
    completedTodos,
    totalTodos,
    score,
    completedHabitTitles: habits
      .filter((habit) => isHabitCompletedToday(habit))
      .map((habit) => habit.title),
    completedTodoTitles: todos
      .filter((todo) => isTaskCompleted(todo))
      .map((todo) => todo.title),
  };

  await withLock(HISTORY_LOCK, async () => {
    const historyRaw = await AsyncStorage.getItem(HISTORY_STORAGE_KEY);
    let history: DailyHistory[] = [];
    if (historyRaw) {
      try {
        history = JSON.parse(historyRaw) as DailyHistory[];
      } catch {
        history = [];
      }
    }

    const nextHistory = [
      snapshot,
      ...history.filter((entry) => entry.date !== today),
    ];
    await AsyncStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(nextHistory));
  });

  return snapshot;
}

export async function getHistoryForMonth(year: number, monthIndex: number) {
  const history = await getAllHistory();
  return history.filter((entry) => {
    const [entryYear, entryMonth] = entry.date.split("-").map(Number);
    return entryYear === year && entryMonth === monthIndex + 1;
  });
}

export function historyForDate(history: DailyHistory[], dateKey: string) {
  return history.find((entry) => entry.date === dateKey) ?? null;
}
