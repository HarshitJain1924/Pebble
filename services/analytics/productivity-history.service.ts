import AsyncStorage from "@react-native-async-storage/async-storage";

import {
    HISTORY_STORAGE_KEY
} from "@/services/storage/storage.service";

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

type HabitLike = {
  title: string;
  completedToday: boolean;
  streak?: number;
  bestStreak?: number;
  archived?: boolean;
};

type TodoLike = {
  title: string;
  completed: boolean;
  archived?: boolean;
};

type TodosState = {
  todos?: Record<string, TodoLike[]>;
};

type DailyState = {
  dailyHabits?: HabitLike[];
};

type GratitudeHistoryEntry = {
  id: string;
  text: string;
  timestamp: number;
};

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toCompletionScore(completed: number, total: number) {
  if (total === 0) {
    return 0;
  }
  return Math.round((completed / total) * 100);
}

async function loadTodosState(): Promise<TodosState> {
  try {
    const activeWorkspace =
      (await AsyncStorage.getItem("pebble:core:active_workspace")) || "default";
    const raw = await AsyncStorage.getItem(
      `pebble:core:tasks:${activeWorkspace}`,
    );
    if (!raw) {
      return { todos: {} };
    }
    const tasksMap = JSON.parse(raw);
    const todos = Object.values(tasksMap).map((t: any) => ({
      title: t.title,
      completed: t.completed,
      archived: t.archived,
    }));
    return { todos: { [activeWorkspace]: todos } };
  } catch {
    return { todos: {} };
  }
}

async function loadDailyState(): Promise<DailyState> {
  try {
    const activeWorkspace =
      (await AsyncStorage.getItem("pebble:core:active_workspace")) || "default";
    const raw = await AsyncStorage.getItem(
      `pebble:core:habits:${activeWorkspace}`,
    );
    if (!raw) {
      return { dailyHabits: [] };
    }
    const habitsMap = JSON.parse(raw);
    const today = getDateKey();
    const dailyHabits = Object.values(habitsMap).map((h: any) => ({
      title: h.title,
      completedToday: h.completedDates?.includes(today) || false,
      streak: h.streak,
      bestStreak: h.bestStreak,
      archived: h.archived,
    }));
    return { dailyHabits };
  } catch {
    return { dailyHabits: [] };
  }
}

export async function getTodaySummary() {
  const [todosState, dailyState] = await Promise.all([
    loadTodosState(),
    loadDailyState(),
  ]);
  const habits = (dailyState.dailyHabits ?? []).filter((h) => !h.archived);
  const todos = Object.values(todosState.todos ?? {})
    .flat()
    .filter((t) => !t.archived);

  const completedHabits = habits.filter((habit) => habit.completedToday).length;
  const completedTodos = todos.filter((todo) => todo.completed).length;

  return {
    completedToday: completedHabits + completedTodos,
    totalToday: habits.length + todos.length,
    currentStreak: habits.reduce(
      (max, habit) => Math.max(max, habit.streak ?? 0),
      0,
    ),
    pendingHabits: habits
      .filter((habit) => !habit.completedToday)
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

export async function recordDailyHistorySnapshot() {
  const today = getDateKey();
  const [todosState, dailyState, historyRaw] = await Promise.all([
    loadTodosState(),
    loadDailyState(),
    AsyncStorage.getItem(HISTORY_STORAGE_KEY),
  ]);

  const habits = (dailyState.dailyHabits ?? []).filter((h) => !h.archived);
  const todos = Object.values(todosState.todos ?? {})
    .flat()
    .filter((t) => !t.archived);
  const completedHabits = habits.filter((habit) => habit.completedToday).length;
  const completedTodos = todos.filter((todo) => todo.completed).length;
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
      .filter((habit) => habit.completedToday)
      .map((habit) => habit.title),
    completedTodoTitles: todos
      .filter((todo) => todo.completed)
      .map((todo) => todo.title),
  };

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

  return snapshot;
}

export async function getHistoryForMonth(year: number, monthIndex: number) {
  const history = await getAllHistory();
  return history.filter((entry) => {
    const [entryYear, entryMonth] = entry.date.split("-").map(Number);
    return entryYear === year && entryMonth === monthIndex + 1;
  });
}

export async function getGratitudeHistory(): Promise<GratitudeHistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem("todoapp:gratitude_history");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendGratitudeHistoryEntry(
  entry: GratitudeHistoryEntry,
): Promise<void> {
  const history = await getGratitudeHistory();
  history.push(entry);
  await AsyncStorage.setItem(
    "todoapp:gratitude_history",
    JSON.stringify(history),
  );
}

export function historyForDate(history: DailyHistory[], dateKey: string) {
  return history.find((entry) => entry.date === dateKey) ?? null;
}
