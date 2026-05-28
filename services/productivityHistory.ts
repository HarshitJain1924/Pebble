import AsyncStorage from "@react-native-async-storage/async-storage";

import {
    DAILY_STORAGE_KEY,
    HISTORY_STORAGE_KEY,
    TODOS_STORAGE_KEY,
} from "./storage";

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
};

type TodoLike = {
  title: string;
  completed: boolean;
};

type TodosState = {
  todos?: Record<string, TodoLike[]>;
};

type DailyState = {
  dailyHabits?: HabitLike[];
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

async function loadTodosState() {
  const raw = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
  if (!raw) {
    return { todos: {} as Record<string, TodoLike[]> };
  }

  try {
    return JSON.parse(raw) as TodosState;
  } catch {
    return { todos: {} as Record<string, TodoLike[]> };
  }
}

async function loadDailyState() {
  const raw = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
  if (!raw) {
    return { dailyHabits: [] as HabitLike[] };
  }

  try {
    return JSON.parse(raw) as DailyState;
  } catch {
    return { dailyHabits: [] as HabitLike[] };
  }
}

export async function getTodaySummary() {
  const [todosState, dailyState] = await Promise.all([
    loadTodosState(),
    loadDailyState(),
  ]);
  const habits = dailyState.dailyHabits ?? [];
  const todos = Object.values(todosState.todos ?? {}).flat();

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

export async function recordDailyHistorySnapshot() {
  const today = getDateKey();
  const [todosState, dailyState, historyRaw] = await Promise.all([
    loadTodosState(),
    loadDailyState(),
    AsyncStorage.getItem(HISTORY_STORAGE_KEY),
  ]);

  const habits = dailyState.dailyHabits ?? [];
  const todos = Object.values(todosState.todos ?? {}).flat();
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
  const historyRaw = await AsyncStorage.getItem(HISTORY_STORAGE_KEY);
  if (!historyRaw) {
    return [] as DailyHistory[];
  }

  try {
    const history = JSON.parse(historyRaw) as DailyHistory[];
    return history.filter((entry) => {
      const [entryYear, entryMonth] = entry.date.split("-").map(Number);
      return entryYear === year && entryMonth === monthIndex + 1;
    });
  } catch {
    return [] as DailyHistory[];
  }
}

export function historyForDate(history: DailyHistory[], dateKey: string) {
  return history.find((entry) => entry.date === dateKey) ?? null;
}
