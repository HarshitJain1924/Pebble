import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    AppState,
    AppStateStatus,
    KeyboardAvoidingView,
    LayoutChangeEvent,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { AnimatedCheckbox } from "@/components/AnimatedCheckbox";
import { AppCard } from "@/components/AppCard";
import {
    HabitsEmptyGraphic,
    TasksEmptyGraphic,
} from "@/components/AppGraphics";
import { ListManager } from "@/components/ListManager";
import { ProgressBar } from "@/components/ProgressBar";
import { ScreenSwipeWrapper } from "@/components/ScreenSwipeWrapper";
import { SwipeableCard } from "@/components/SwipeableCard";
import { TimeSelectorDial } from "@/components/TimeSelectorDial";
import { TodoItem } from "@/components/TodoItem";
import { Spacing } from "@/constants/spacing";
import { Colors } from "@/constants/theme";
import { Typography } from "@/constants/typography";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { recordDailyHistorySnapshot } from "@/services/productivityHistory";
import { cancelReminderIds, scheduleReminderBatch } from "@/services/reminders";
import {
    DAILY_STORAGE_KEY,
    DAY_MS,
    TODOS_STORAGE_KEY,
} from "@/services/storage";
import {
    DEFAULT_TASK_CATEGORY,
    getTaskCategoryMeta,
    normalizeTaskCategory,
    TASK_CATEGORY_META,
    type TaskCategory,
} from "@/services/taskCategories";

export type Subtask = {
  id: string;
  title: string;
  completed: boolean;
};

type Todo = {
  id: string;
  title: string;
  completed: boolean;
  category?: TaskCategory;
  alarmId?: string;
  alarmTime?: number;
  notificationIds?: string[];
  reminderHour?: number;
  reminderMinute?: number;
  reminderDays?: number[];
  escalationMinutes?: number[];
  subtasks?: Subtask[];
  priority?: "low" | "medium" | "high";
};

export type Habit = {
  id: string;
  title: string;
  streak: number;
  bestStreak: number;
  completedToday: boolean;
  lastCompletedDate?: string;
  reminderHour?: number;
  reminderMinute?: number;
  reminderDays?: number[];
  notificationIds?: string[];
  escalationMinutes?: number[];
  priority?: "low" | "medium" | "high";
};

type TaskList = { id: string; name: string };

async function loadNotifications() {
  return import("expo-notifications");
}

const STORAGE_KEY = TODOS_STORAGE_KEY;

const initialTodos: Todo[] = [
  {
    id: "1",
    title: "Build the todo app shell",
    completed: true,
    category: "work",
  },
  { id: "2", title: "Add a new task", completed: false, category: "personal" },
  {
    id: "3",
    title: "Tap a task to mark it done",
    completed: false,
    category: "work",
  },
];

const getDateKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const parseDateKey = (value: string) => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

const dayDiff = (fromDateKey: string, toDateKey: string) => {
  const from = parseDateKey(fromDateKey).getTime();
  const to = parseDateKey(toDateKey).getTime();
  return Math.floor((to - from) / DAY_MS);
};

const normalizeHabitsForToday = (habitsList: Habit[]) => {
  const today = getDateKey();

  return habitsList.map((habit) => {
    if (!habit.lastCompletedDate) {
      return { ...habit, completedToday: false };
    }

    const diff = dayDiff(habit.lastCompletedDate, today);

    if (diff <= 0) {
      return {
        ...habit,
        completedToday:
          habit.completedToday && habit.lastCompletedDate === today,
      };
    }

    if (diff === 1) {
      return { ...habit, completedToday: false };
    }

    return {
      ...habit,
      completedToday: false,
      streak: 0,
    };
  });
};

const formatReminder = (hour?: number, minute?: number) => {
  if (hour === undefined || minute === undefined) {
    return null;
  }

  return new Date(2020, 0, 1, hour, minute).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getListColors = (name: string, isSelected: boolean) => {
  const lowercase = name.toLowerCase();
  let bg = isSelected ? "#dbeafe" : "rgba(59, 130, 246, 0.08)";
  let text = isSelected ? "#1e3a8a" : "#3B82F6";
  let icon: any = "list";

  if (lowercase.includes("work")) {
    bg = isSelected ? "#dbeafe" : "rgba(59, 130, 246, 0.08)";
    text = isSelected ? "#1e3a8a" : "#3B82F6";
    icon = "briefcase";
  } else if (lowercase.includes("personal") || lowercase.includes("garden")) {
    bg = isSelected ? "#d1fae5" : "rgba(16, 185, 129, 0.08)";
    text = isSelected ? "#064e3b" : "#10B981";
    icon = "user";
  } else if (lowercase.includes("habit")) {
    bg = isSelected ? "#ffedd5" : "rgba(245, 158, 11, 0.08)";
    text = isSelected ? "#7c2d12" : "#F59E0B";
    icon = "activity";
  } else if (lowercase.includes("focus")) {
    bg = isSelected ? "#f3e8ff" : "rgba(168, 85, 247, 0.08)";
    text = isSelected ? "#581c87" : "#A855F7";
    icon = "clock";
  } else {
    bg = isSelected ? "#f1f5f9" : "rgba(100, 116, 139, 0.08)";
    text = isSelected ? "#334155" : "#64748B";
    icon = "grid";
  }

  return { bg, text, icon };
};

const addMinutesToTime = (
  hour: number,
  minute: number,
  offset: number,
  setHour: React.Dispatch<React.SetStateAction<number>>,
  setMinute: React.Dispatch<React.SetStateAction<number>>
) => {
  const totalMinutes = hour * 60 + minute + offset;
  const newHour = Math.floor(totalMinutes / 60) % 24;
  const newMinute = totalMinutes % 60;
  setHour(newHour >= 0 ? newHour : (newHour + 24) % 24);
  setMinute(newMinute >= 0 ? newMinute : (newMinute + 60) % 60);
};

export default function TasksScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  // Search parameters for deep link highlight and segment initialization
  const params = useLocalSearchParams<{
    focusItemId?: string;
    focusItemType?: string;
    segment?: string;
    category?: string;
    quickAdd?: string;
  }>();

  const scrollViewRef = useRef<ScrollView>(null);
  const addTaskInputRef = useRef<TextInput>(null);
  const focusTodoId =
    typeof params.focusItemId === "string" && params.focusItemType === "todo"
      ? params.focusItemId
      : null;

  const focusHabitId =
    typeof params.focusItemId === "string" && params.focusItemType === "habit"
      ? params.focusItemId
      : null;

  // Segment Selector
  const [activeSegment, setActiveSegment] = useState<"tasks" | "habits">(
    "tasks",
  );

  // Tasks Screen State
  const [highlightedTodoId, setHighlightedTodoId] = useState<string | null>(
    null,
  );
  const [lists, setLists] = useState<TaskList[]>([
    { id: "default", name: "My Tasks" },
  ]);
  const [selectedList, setSelectedList] = useState<string>("default");
  const [todos, setTodos] = useState<Record<string, Todo[]>>({
    default: initialTodos,
  });
  const [title, setTitle] = useState("");
  const [selectedTodoCategory, setSelectedTodoCategory] =
    useState<TaskCategory>(DEFAULT_TASK_CATEGORY);
  const [selectedTodoPriority, setSelectedTodoPriority] = useState<"low" | "medium" | "high">("medium");
  const [selectedListPriorityFilter, setSelectedListPriorityFilter] = useState<"all" | "high" | "medium" | "low">("all");

  const [expandedTodoIds, setExpandedTodoIds] = useState<
    Record<string, boolean>
  >({});

  // Overdue & Today expanded chevrons
  const [overdueExpanded, setOverdueExpanded] = useState(true);
  const [todayExpanded, setTodayExpanded] = useState(true);
  const [taskPositions, setTaskPositions] = useState<Record<string, number>>(
    {},
  );

  // Habits Screen State
  const [habits, setHabits] = useState<Habit[]>([]);
  const [expandedHabitIds, setExpandedHabitIds] = useState<
    Record<string, boolean>
  >({});
  const [habitTitle, setHabitTitle] = useState("");
  const [selectedHabitPriority, setSelectedHabitPriority] = useState<"low" | "medium" | "high">("medium");
  const [selectedListHabitPriorityFilter, setSelectedListHabitPriorityFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [reminderMenuHabitId, setReminderMenuHabitId] = useState<string | null>(
    null,
  );
  const [reminderCustomVisible, setReminderCustomVisible] = useState(false);
  const [reminderCustomHour, setReminderCustomHour] = useState<number>(7);
  const [reminderCustomMinute, setReminderCustomMinute] = useState<number>(0);
  const [reminderCustomDays, setReminderCustomDays] = useState<number[]>([]);
  const [showCelebrate, setShowCelebrate] = useState(false);
  const [highlightedHabitId, setHighlightedHabitId] = useState<string | null>(
    null,
  );
  const celebrateDateRef = useRef<string | null>(null);

  // Relocated Alarms State to resolve block scoping
  const [alarmMenu, setAlarmMenu] = useState<string | null>(null);
  const [alarmCustomVisible, setAlarmCustomVisible] = useState(false);
  const [alarmCustomHour, setAlarmCustomHour] = useState<number>(9);
  const [alarmCustomMinute, setAlarmCustomMinute] = useState<number>(0);
  const [alarmCustomDays, setAlarmCustomDays] = useState<number[]>([]);

  const [listsExpanded, setListsExpanded] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [isAddingHabit, setIsAddingHabit] = useState(false);
  const [statsExpanded, setStatsExpanded] = useState(false);

  // Relocated persistHabits Callback to resolve block scoping
  const persistHabits = useCallback(async (nextHabits: Habit[]) => {
    try {
      const payload = { dailyHabits: nextHabits };
      await AsyncStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(payload));
      void recordDailyHistorySnapshot();
    } catch {
      // Ignore
    }
  }, []);

  // Task Memos
  const currentTodos = useMemo(
    () => todos[selectedList] ?? [],
    [todos, selectedList],
  );

  const isOverdue = (todo: Todo) => {
    if (todo.completed) return false;
    const idNum = Number(todo.id);
    if (isNaN(idNum) || idNum < 100000000000) return false;
    const createdDate = new Date(idNum);
    const today = new Date();
    createdDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return createdDate.getTime() < today.getTime();
  };

  const getPriorityWeight = (priority?: string) => {
    if (priority === "high") return 0;
    if (priority === "low") return 2;
    return 1;
  };

  const overdueTodos = useMemo(() => {
    const filtered = currentTodos.filter((todo) => isOverdue(todo));
    const matched = selectedListPriorityFilter === "all"
      ? filtered
      : filtered.filter((todo) => todo.priority === selectedListPriorityFilter);
    return [...matched].sort((a, b) => getPriorityWeight(a.priority) - getPriorityWeight(b.priority));
  }, [currentTodos, selectedListPriorityFilter]);

  const todayTodos = useMemo(() => {
    const filtered = currentTodos.filter((todo) => !isOverdue(todo));
    const matched = selectedListPriorityFilter === "all"
      ? filtered
      : filtered.filter((todo) => todo.priority === selectedListPriorityFilter);
    return [...matched].sort((a, b) => getPriorityWeight(a.priority) - getPriorityWeight(b.priority));
  }, [currentTodos, selectedListPriorityFilter]);

  const remainingCount = useMemo(
    () => currentTodos.filter((todo) => !todo.completed).length,
    [currentTodos],
  );

  const completedCount = currentTodos.length - remainingCount;

  // Habit Memos
  const unfinishedHabitCount = useMemo(
    () => habits.filter((habit) => !habit.completedToday).length,
    [habits],
  );
  const displayedHabits = useMemo(() => {
    const filtered = selectedListHabitPriorityFilter === "all"
      ? habits
      : habits.filter((habit) => habit.priority === selectedListHabitPriorityFilter);
    return [...filtered].sort((a, b) => getPriorityWeight(a.priority) - getPriorityWeight(b.priority));
  }, [habits, selectedListHabitPriorityFilter]);
  const completedHabitCount = habits.length - unfinishedHabitCount;
  const habitCompletionPct =
    habits.length === 0 ? 0 : completedHabitCount / habits.length;
  const longestStreak = useMemo(
    () =>
      habits.reduce((max, habit) => Math.max(max, habit.bestStreak || 0), 0),
    [habits],
  );

  // Initialize and Sync Segment URL Search Parameters
  useEffect(() => {
    if (params.segment === "habits") {
      setActiveSegment("habits");
    } else if (params.segment === "tasks") {
      setActiveSegment("tasks");
    }
  }, [params.segment]);

  useEffect(() => {
    if (typeof params.category === "string") {
      setSelectedTodoCategory(normalizeTaskCategory(params.category));
      setActiveSegment("tasks");
    }
  }, [params.category]);

  useEffect(() => {
    if (params.quickAdd !== "task") {
      return;
    }

    setActiveSegment("tasks");
    const timer = setTimeout(() => {
      addTaskInputRef.current?.focus();
    }, 120);

    return () => clearTimeout(timer);
  }, [params.quickAdd]);

  // Load States on Tab/Screen Focus
  const loadState = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        lists: TaskList[];
        selectedList: string;
        todos: Record<string, Todo[]>;
      };
      if (parsed?.lists) setLists(parsed.lists);
      if (parsed?.selectedList) setSelectedList(parsed.selectedList);
      if (parsed?.todos) {
        const normalizedTodos = Object.fromEntries(
          Object.entries(parsed.todos).map(([listId, listTodos]) => [
            listId,
            listTodos.map((todo) => ({
              ...todo,
              category: normalizeTaskCategory(todo.category),
            })),
          ]),
        ) as Record<string, Todo[]>;
        setTodos(normalizedTodos);
      }

      // Reschedule web alarms for persisted alarmTimes
      if (Platform.OS === "web") {
        Object.values(parsed.todos || {}).forEach((listTodos) => {
          listTodos.forEach((t) => {
            if (t.alarmTime && !t.alarmId && t.alarmTime > Date.now()) {
              const delay = t.alarmTime - Date.now();
              const timeoutId = setTimeout(() => {
                try {
                  new Notification("Todo reminder", { body: t.title });
                } catch {
                  Alert.alert("Reminder", t.title);
                }
              }, delay);
              setTodos((current) => {
                const updatedLists = { ...current };
                for (const lid in updatedLists) {
                  updatedLists[lid] = updatedLists[lid].map((tt) =>
                    tt.id === t.id
                      ? { ...tt, alarmId: `web-${String(timeoutId)}` }
                      : tt,
                  );
                }
                persistState(
                  parsed.lists || lists,
                  parsed.selectedList || selectedList,
                  updatedLists,
                );
                return updatedLists;
              });
            }
          });
        });
      }
    } catch {
      // ignore
    }
  }, []);

  const loadHabits = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
      if (!raw) {
        const starter = [
          "Microsoft Rewards",
          "LeetCode",
          "Gym",
          "Study",
          "Drink Water",
          "Sleep Early",
        ].map((habitTitle) => ({
          id: `habit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: habitTitle,
          streak: 0,
          bestStreak: 0,
          completedToday: false,
        }));
        setHabits(starter);
        await persistHabits(starter);
        return;
      }

      const parsed = JSON.parse(raw) as { dailyHabits: Habit[] };
      const normalized = normalizeHabitsForToday(parsed.dailyHabits ?? []);
      setHabits(normalized);
      await persistHabits(normalized);
    } catch {
      setHabits([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadState();
      void loadHabits();
    }, [loadState, loadHabits]),
  );

  // Sync notification permissions and channels
  useEffect(() => {
    (async () => {
      try {
        const Notifications = await loadNotifications();
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== "granted") {
          await Notifications.requestPermissionsAsync();
        }
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("todo-reminders", {
            name: "Todo Reminders",
            importance: Notifications.AndroidImportance.DEFAULT,
          });
          await Notifications.setNotificationChannelAsync("daily-habits", {
            name: "Daily Habits",
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  // Streak Celebration effect
  useEffect(() => {
    const today = getDateKey();
    if (
      habits.length > 0 &&
      completedHabitCount === habits.length &&
      celebrateDateRef.current !== today
    ) {
      celebrateDateRef.current = today;
      setShowCelebrate(true);
      const timer = setTimeout(() => setShowCelebrate(false), 2200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [completedHabitCount, habits.length]);

  // AppState reload habit streak check
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => {
        if (state !== "active") {
          return;
        }

        setHabits((current) => {
          const normalized = normalizeHabitsForToday(current);
          if (JSON.stringify(normalized) !== JSON.stringify(current)) {
            persistHabits(normalized);
            return normalized;
          }
          return current;
        });
      },
    );

    return () => {
      subscription.remove();
    };
  }, [persistHabits]);

  // Alarms highlight scroll triggers
  useEffect(() => {
    if (focusTodoId) {
      setActiveSegment("tasks");
      setHighlightedTodoId(focusTodoId);
      setExpandedTodoIds((prev) => ({ ...prev, [focusTodoId]: true }));

      const y = taskPositions[focusTodoId];
      if (y !== undefined) {
        scrollViewRef.current?.scrollTo({
          y: y - 80,
          animated: true,
        });
      }

      const timer = setTimeout(() => setHighlightedTodoId(null), 2200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [focusTodoId, taskPositions]);

  useEffect(() => {
    if (focusHabitId) {
      setActiveSegment("habits");
      setHighlightedHabitId(focusHabitId);
      const timer = setTimeout(() => setHighlightedHabitId(null), 2200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [focusHabitId]);

  useEffect(() => {
    if (!alarmMenu) {
      setAlarmCustomVisible(false);
      return;
    }
    const todo = (todos[selectedList] ?? []).find((t) => t.id === alarmMenu);
    setAlarmCustomHour(todo?.reminderHour ?? 9);
    setAlarmCustomMinute(todo?.reminderMinute ?? 0);
    setAlarmCustomDays(todo?.reminderDays ?? []);
    setAlarmCustomVisible(false);
  }, [alarmMenu, todos, selectedList]);

  useEffect(() => {
    if (!reminderMenuHabitId) {
      setReminderCustomVisible(false);
      return;
    }
    const target = habits.find((h) => h.id === reminderMenuHabitId);
    setReminderCustomHour(target?.reminderHour ?? 7);
    setReminderCustomMinute(target?.reminderMinute ?? 0);
    setReminderCustomDays(target?.reminderDays ?? []);
    setReminderCustomVisible(false);
  }, [reminderMenuHabitId, habits]);

  // Task Actions
  const persistState = async (
    listsToSave: TaskList[],
    selected: string,
    todosToSave: Record<string, Todo[]>,
  ) => {
    try {
      const payload = JSON.stringify({
        lists: listsToSave,
        selectedList: selected,
        todos: todosToSave,
      });
      await AsyncStorage.setItem(STORAGE_KEY, payload);
      void recordDailyHistorySnapshot();
    } catch {
      // ignore
    }
  };

  const selectList = (listId: string) => {
    setSelectedList(listId);
    persistState(lists, listId, todos);
  };

  const deleteCurrentList = () => {
    if (lists.length <= 1) {
      Alert.alert("Cannot delete", "At least one list is required.");
      return;
    }

    const updatedLists = lists.filter((list) => list.id !== selectedList);
    const nextSelected = updatedLists[0]?.id ?? "default";
    const updatedTodos = { ...todos };

    (updatedTodos[selectedList] ?? []).forEach((todo) => {
      const alarmId = todo.alarmId;
      if (alarmId && !alarmId.startsWith("web-")) {
        void loadNotifications().then((Notifications) =>
          Notifications.cancelScheduledNotificationAsync(alarmId).catch(
            () => {},
          ),
        );
      }
      if (todo.alarmId && todo.alarmId.startsWith("web-")) {
        clearTimeout(Number(todo.alarmId.replace("web-", "")));
      }
    });

    delete updatedTodos[selectedList];
    if (!updatedTodos[nextSelected]) {
      updatedTodos[nextSelected] = [];
    }

    setLists(updatedLists);
    setTodos(updatedTodos);
    setSelectedList(nextSelected);
    persistState(updatedLists, nextSelected, updatedTodos);
  };

  const addTodo = () => {
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      return;
    }

    setTodos((current) => {
      const listTodos = current[selectedList] ?? [];
      const updated = {
        ...current,
        [selectedList]: [
          {
            id: String(Date.now()),
            title: trimmedTitle,
            completed: false,
            category: selectedTodoCategory,
            priority: selectedTodoPriority,
          },
          ...listTodos,
        ],
      };
      persistState(lists, selectedList, updated);
      return updated;
    });
    setTitle("");
    setSelectedTodoPriority("medium");
  };

  const updateTodoTitle = (id: string, newTitle: string) => {
    setTodos((current) => {
      const listTodos = current[selectedList] ?? [];
      const updatedList = listTodos.map((todo) =>
        todo.id === id ? { ...todo, title: newTitle } : todo,
      );
      const updated = { ...current, [selectedList]: updatedList };
      persistState(lists, selectedList, updated);
      return updated;
    });
  };

  const moveTodoToList = (
    todoId: string,
    fromListId: string,
    toListId: string,
  ) => {
    setTodos((current) => {
      const sourceTodos = current[fromListId] ?? [];
      const targetTodos = current[toListId] ?? [];
      const todoToMove = sourceTodos.find((t) => t.id === todoId);

      if (!todoToMove) return current;

      const updated = {
        ...current,
        [fromListId]: sourceTodos.filter((t) => t.id !== todoId),
        [toListId]: [todoToMove, ...targetTodos],
      };

      persistState(lists, selectedList, updated);

      setExpandedTodoIds((prev) => {
        const next = { ...prev };
        delete next[todoId];
        return next;
      });

      return updated;
    });
  };

  const toggleTodo = (id: string) => {
    setTodos((current) => {
      const listTodos = current[selectedList] ?? [];
      const updatedList = listTodos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo,
      );
      const updated = { ...current, [selectedList]: updatedList };
      persistState(lists, selectedList, updated);
      return updated;
    });
  };

  const deleteTodo = (id: string) => {
    setTodos((current) => {
      const listTodos = current[selectedList] ?? [];
      const toDelete = listTodos.find((t) => t.id === id);
      void cancelReminderIds(
        toDelete?.notificationIds ??
          (toDelete?.alarmId ? [toDelete.alarmId] : []),
      );
      const updated = {
        ...current,
        [selectedList]: listTodos.filter((todo) => todo.id !== id),
      };
      persistState(lists, selectedList, updated);
      return updated;
    });
  };

  const toggleSubtask = (todoId: string, subtaskId: string) => {
    setTodos((current) => {
      const listTodos = current[selectedList] ?? [];
      const updatedList = listTodos.map((todo) => {
        if (todo.id !== todoId) return todo;
        const updatedSubtasks = (todo.subtasks ?? []).map((sub) =>
          sub.id === subtaskId ? { ...sub, completed: !sub.completed } : sub,
        );
        return { ...todo, subtasks: updatedSubtasks };
      });
      const updated = { ...current, [selectedList]: updatedList };
      persistState(lists, selectedList, updated);
      return updated;
    });
  };

  const addSubtask = (todoId: string, text: string) => {
    if (!text.trim()) return;
    setTodos((current) => {
      const listTodos = current[selectedList] ?? [];
      const updatedList = listTodos.map((todo) => {
        if (todo.id !== todoId) return todo;
        const newSub: Subtask = {
          id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          title: text.trim(),
          completed: false,
        };
        return { ...todo, subtasks: [...(todo.subtasks ?? []), newSub] };
      });
      const updated = { ...current, [selectedList]: updatedList };
      persistState(lists, selectedList, updated);
      return updated;
    });
  };

  const deleteSubtask = (todoId: string, subtaskId: string) => {
    setTodos((current) => {
      const listTodos = current[selectedList] ?? [];
      const updatedList = listTodos.map((todo) => {
        if (todo.id !== todoId) return todo;
        return {
          ...todo,
          subtasks: (todo.subtasks ?? []).filter((sub) => sub.id !== subtaskId),
        };
      });
      const updated = { ...current, [selectedList]: updatedList };
      persistState(lists, selectedList, updated);
      return updated;
    });
  };

  const toggleExpand = (todoId: string) => {
    setExpandedTodoIds((prev) => ({ ...prev, [todoId]: !prev[todoId] }));
  };

  const clearCompleted = () => {
    setTodos((current) => {
      const listTodos = current[selectedList] ?? [];
      listTodos.forEach((t) => {
        if (t.completed) {
          void cancelReminderIds(
            t.notificationIds ?? (t.alarmId ? [t.alarmId] : []),
          );
        }
      });
      const updated = {
        ...current,
        [selectedList]: listTodos.filter((todo) => !todo.completed),
      };
      persistState(lists, selectedList, updated);
      return updated;
    });
  };

  const scheduleAlarm = async (todoId: string, minutesFromNow: number) => {
    const todo = (todos[selectedList] ?? []).find((t) => t.id === todoId);
    if (!todo) return;

    await cancelReminderIds(
      todo.notificationIds ?? (todo.alarmId ? [todo.alarmId] : []),
    );

    const triggerTime = Date.now() + minutesFromNow * 60 * 1000;
    const currentRemainingCount = currentTodos.filter(
      (item) => !item.completed,
    ).length;

    const scheduled = await scheduleReminderBatch({
      kind: "todo",
      itemId: todoId,
      title: todo.title,
      oneTimeAt: new Date(triggerTime),
      escalationMinutes: [120, 240],
      channelId: Platform.OS === "android" ? "todo-reminders" : undefined,
      context: {
        title: todo.title,
        remainingCount: currentRemainingCount,
        totalCount: currentTodos.length,
      },
    });

    setTodos((current) => {
      const listTodos = current[selectedList] ?? [];
      const updatedList = listTodos.map((item) =>
        item.id === todoId
          ? {
              ...item,
              alarmId: scheduled.primaryId,
              notificationIds: scheduled.ids,
              alarmTime: triggerTime,
              reminderHour: undefined,
              reminderMinute: undefined,
              escalationMinutes: scheduled.escalationMinutes,
            }
          : item,
      );
      const updated = { ...current, [selectedList]: updatedList };
      persistState(lists, selectedList, updated);
      return updated;
    });
  };

  const scheduleAlarmWithDays = async (
    todoId: string,
    hour: number,
    minute: number,
    days?: number[],
  ) => {
    const todo = (todos[selectedList] ?? []).find((t) => t.id === todoId);
    if (!todo) return;

    await cancelReminderIds(
      todo.notificationIds ?? (todo.alarmId ? [todo.alarmId] : []),
    );

    const scheduled = await scheduleReminderBatch({
      kind: "todo",
      itemId: todoId,
      title: todo.title,
      dailyTime: { hour, minute },
      dailyDays: days,
      escalationMinutes: [120, 240],
      channelId: Platform.OS === "android" ? "todo-reminders" : undefined,
      context: {
        title: todo.title,
        remainingCount: remainingCount,
        totalCount: currentTodos.length,
      },
    });

    setTodos((current) => {
      const listTodos = current[selectedList] ?? [];
      const updatedList = listTodos.map((item) =>
        item.id === todoId
          ? {
              ...item,
              alarmId: scheduled.primaryId,
              notificationIds: scheduled.ids,
              alarmTime: scheduled.alarmTime,
              reminderHour: scheduled.reminderHour,
              reminderMinute: scheduled.reminderMinute,
              reminderDays: days,
              escalationMinutes: scheduled.escalationMinutes,
            }
          : item,
      );
      const updated = { ...current, [selectedList]: updatedList };
      persistState(lists, selectedList, updated);
      return updated;
    });

    setAlarmMenu(null);
    setAlarmCustomVisible(false);
  };

  const cancelAlarm = async (todoId: string) => {
    const todo = (todos[selectedList] ?? []).find((t) => t.id === todoId);
    await cancelReminderIds(
      todo?.notificationIds ?? (todo?.alarmId ? [todo.alarmId] : []),
    );
    setTodos((current) => {
      const listTodos = current[selectedList] ?? [];
      const updatedList = listTodos.map((t) =>
        t.id === todoId
          ? {
              ...t,
              alarmId: undefined,
              alarmTime: undefined,
              notificationIds: [],
              escalationMinutes: undefined,
            }
          : t,
      );
      const updated = { ...current, [selectedList]: updatedList };
      persistState(lists, selectedList, updated);
      return updated;
    });
  };

  const formatAlarm = (ms?: number) => {
    if (!ms) return null;
    const d = new Date(ms);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Habits Business Logic

  const addHabit = () => {
    const trimmed = habitTitle.trim();
    if (!trimmed) {
      return;
    }

    const next: Habit = {
      id: `habit-${Date.now()}`,
      title: trimmed,
      streak: 0,
      bestStreak: 0,
      completedToday: false,
      priority: selectedHabitPriority,
    };

    setHabits((current) => {
      const updated = [next, ...current];
      persistHabits(updated);
      return updated;
    });
    setHabitTitle("");
    setSelectedHabitPriority("medium");
  };

  const deleteHabit = async (id: string) => {
    const target = habits.find((habit) => habit.id === id);
    await cancelReminderIds(target?.notificationIds ?? []);

    setHabits((current) => {
      const updated = current.filter((habit) => habit.id !== id);
      persistHabits(updated);
      return updated;
    });
  };

  const toggleHabit = (id: string) => {
    const today = getDateKey();
    const yesterday = getDateKey(new Date(Date.now() - DAY_MS));

    setHabits((current) => {
      const updated = current.map((habit) => {
        if (habit.id !== id) {
          return habit;
        }

        if (!habit.completedToday) {
          let nextStreak = 1;
          if (habit.lastCompletedDate === today) {
            nextStreak = habit.streak || 1;
          } else if (habit.lastCompletedDate === yesterday) {
            nextStreak = habit.streak + 1;
          }

          return {
            ...habit,
            completedToday: true,
            lastCompletedDate: today,
            streak: nextStreak,
            bestStreak: Math.max(habit.bestStreak, nextStreak),
          };
        }

        const rolledBackStreak = Math.max(0, habit.streak - 1);
        return {
          ...habit,
          completedToday: false,
          streak: rolledBackStreak,
          lastCompletedDate: rolledBackStreak > 0 ? yesterday : undefined,
        };
      });

      persistHabits(updated);
      return updated;
    });
  };

  const setReminderWithDays = async (
    habitId: string,
    hour: number,
    minute: number,
    days?: number[],
  ) => {
    const target = habits.find((habit) => habit.id === habitId);
    if (!target) {
      return;
    }

    try {
      await cancelReminderIds(target.notificationIds ?? []);
      const scheduled = await scheduleReminderBatch({
        kind: "habit",
        itemId: habitId,
        title: target.title,
        dailyTime: { hour, minute },
        dailyDays: days,
        escalationMinutes: [120, 240],
        channelId: Platform.OS === "android" ? "daily-habits" : undefined,
        context: {
          title: target.title,
          remainingCount: unfinishedHabitCount,
          totalCount: habits.length,
          streak: target.streak,
          bestStreak: target.bestStreak,
        },
      });

      setHabits((current) => {
        const updated = current.map((habit) =>
          habit.id === habitId
            ? {
                ...habit,
                reminderHour: hour,
                reminderMinute: minute,
                reminderDays: days,
                notificationIds: scheduled.ids,
                escalationMinutes: scheduled.escalationMinutes,
              }
            : habit,
        );
        persistHabits(updated);
        return updated;
      });
    } catch {
      Alert.alert(
        "Could not schedule",
        "Reminder scheduling failed on this device.",
      );
    }

    setReminderMenuHabitId(null);
    setReminderCustomVisible(false);
  };

  const clearReminder = async (habitId: string) => {
    const target = habits.find((habit) => habit.id === habitId);
    await cancelReminderIds(target?.notificationIds ?? []);

    setHabits((current) => {
      const updated = current.map((habit) =>
        habit.id === habitId
          ? {
              ...habit,
              reminderHour: undefined,
              reminderMinute: undefined,
              notificationIds: [],
              escalationMinutes: undefined,
            }
          : habit,
      );
      persistHabits(updated);
      return updated;
    });

    setReminderMenuHabitId(null);
  };

  const renderTodoItem = (item: Todo) => {
    return (
      <TodoItem
        key={item.id}
        item={item}
        colors={colors}
        colorScheme={colorScheme}
        isOverdue={isOverdue(item)}
        lists={lists}
        selectedList={selectedList}
        isExpanded={!!expandedTodoIds[item.id]}
        onToggleExpand={() => toggleExpand(item.id)}
        onToggleTodo={() => toggleTodo(item.id)}
        onDeleteTodo={() => deleteTodo(item.id)}
        onUpdateTodoTitle={(newTitle) => updateTodoTitle(item.id, newTitle)}
        onMoveTodoToList={(toListId) => moveTodoToList(item.id, selectedList, toListId)}
        onUpdateTodoPriority={(priority) => {
          setTodos((current) => {
            const listTodos = current[selectedList] ?? [];
            const updatedList = listTodos.map((todo) =>
              todo.id === item.id ? { ...todo, priority } : todo,
            );
            const updated = { ...current, [selectedList]: updatedList };
            persistState(lists, selectedList, updated);
            return updated;
          });
        }}
        onToggleSubtask={(subtaskId) => toggleSubtask(item.id, subtaskId)}
        onAddSubtask={(text) => addSubtask(item.id, text)}
        onDeleteSubtask={(subtaskId) => deleteSubtask(item.id, subtaskId)}
        onToggleAlarmMenu={() => setAlarmMenu(alarmMenu === item.id ? null : item.id)}
        onCancelAlarm={() => cancelAlarm(item.id)}
        alarmMenuOpen={alarmMenu === item.id}
        onLayout={(event) => {
          const { y } = event.nativeEvent.layout;
          setTaskPositions((prev) => ({ ...prev, [item.id]: y }));
        }}
      />
    );
  };

  return (
    <ScreenSwipeWrapper prevRoute="/" nextRoute="/calendar">
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: "transparent" }]}
      >
        <Animated.View
          entering={FadeInDown.duration(450).springify()}
          style={{ flex: 1 }}
        >
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.container}>
              {/* Header */}
              <View style={styles.header}>
                <View>
                  <Text style={[styles.kicker, { color: colors.primary }]}>
                    PLANNER
                  </Text>
                  <Text style={[styles.title, { color: colors.text }]}>
                    {activeSegment === "tasks" ? "Tasks" : "Habits"}
                  </Text>
                </View>
                {activeSegment === "tasks" && (
                  <Pressable
                    onPress={clearCompleted}
                    disabled={completedCount === 0}
                    style={styles.clearBtn}
                  >
                    <Text
                      style={{
                        color:
                          completedCount === 0
                            ? colors.textMuted
                            : colors.primary,
                        fontWeight: "600",
                        fontSize: Typography.sizes.sm,
                      }}
                    >
                      Clear completed
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* Segmented Control Selector */}
              <View style={styles.segmentedControlContainer}>
                <Pressable
                  onPress={() => setActiveSegment("tasks")}
                  style={[
                    styles.segmentButton,
                    activeSegment === "tasks" && {
                      backgroundColor: "rgba(99, 102, 241, 0.15)",
                      borderColor: colors.primary,
                    },
                  ]}
                >
                  <Feather
                    name="check-square"
                    size={14}
                    color={
                      activeSegment === "tasks"
                        ? colors.primary
                        : colors.textMuted
                    }
                  />
                  <Text
                    style={[
                      styles.segmentText,
                      {
                        color:
                          activeSegment === "tasks"
                            ? colors.text
                            : colors.textMuted,
                        fontWeight: activeSegment === "tasks" ? "700" : "500",
                      },
                    ]}
                  >
                    Tasks
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setActiveSegment("habits")}
                  style={[
                    styles.segmentButton,
                    activeSegment === "habits" && {
                      backgroundColor: "rgba(245, 158, 11, 0.15)",
                      borderColor: colors.warning,
                    },
                  ]}
                >
                  <Feather
                    name="zap"
                    size={14}
                    color={
                      activeSegment === "habits"
                        ? colors.warning
                        : colors.textMuted
                    }
                  />
                  <Text
                    style={[
                      styles.segmentText,
                      {
                        color:
                          activeSegment === "habits"
                            ? colors.text
                            : colors.textMuted,
                        fontWeight: activeSegment === "habits" ? "700" : "500",
                      },
                    ]}
                  >
                    Habits
                  </Text>
                </Pressable>
              </View>

              {activeSegment === "tasks" ? (
                <ScrollView
                  ref={scrollViewRef}
                  style={styles.flex}
                  contentContainerStyle={{ gap: 16, paddingBottom: 120 }}
                  showsVerticalScrollIndicator={false}
                >
                  {/* List category selector */}
                  <ListManager
                    lists={lists}
                    selectedList={selectedList}
                    todos={todos}
                    onSelectList={selectList}
                    onDeleteCurrentList={deleteCurrentList}
                    onCreateList={(name) => {
                      const id = `list-${Date.now()}`;
                      const updatedLists = [...lists, { id, name }];
                      const updatedTodos = { ...todos, [id]: [] };
                      setLists(updatedLists);
                      setTodos(updatedTodos);
                      setSelectedList(id);
                      persistState(updatedLists, id, updatedTodos);
                    }}
                    onRenameList={(id, newName) => {
                      const updated = lists.map((l) =>
                        l.id === id ? { ...l, name: newName } : l,
                      );
                      setLists(updated);
                      persistState(updated, selectedList, todos);
                    }}
                    listsExpanded={listsExpanded}
                    setListsExpanded={setListsExpanded}
                    colors={colors}
                    colorScheme={colorScheme}
                  />

                  {/* Add task bar */}
                  <AppCard style={styles.addTaskCard}>
                    <TextInput
                      ref={addTaskInputRef}
                      value={title}
                      onChangeText={setTitle}
                      placeholder="Add a new task"
                      placeholderTextColor={colors.textMuted}
                      onSubmitEditing={addTodo}
                      onFocus={() => setIsAddingTask(true)}
                      onBlur={() => {
                        if (title.trim() === "") setIsAddingTask(false);
                      }}
                      style={[styles.addTaskInput, { color: colors.text }]}
                    />
                    <Pressable
                      onPress={addTodo}
                      style={[
                        styles.addBtn,
                        { backgroundColor: colors.primary },
                      ]}
                    >
                      <Feather name="plus" size={20} color="#ffffff" />
                    </Pressable>
                  </AppCard>

                  {(isAddingTask || title.trim().length > 0) && (
                    <View style={styles.categoryChoiceRow}>
                      <Text
                        style={[
                          styles.categoryChoiceLabel,
                          { color: colors.textMuted },
                        ]}
                      >
                        Task type
                      </Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.categoryChoicePills}
                      >
                        {TASK_CATEGORY_META.map((category) => {
                          const isSelected =
                            selectedTodoCategory === category.key;
                          return (
                            <Pressable
                              key={category.key}
                              onPress={() =>
                                setSelectedTodoCategory(category.key)
                              }
                              style={({ pressed }) => [
                                styles.categoryChoicePill,
                                {
                                  backgroundColor: isSelected
                                    ? category.softTint
                                    : colors.cardLight,
                                  borderColor: isSelected
                                    ? category.tint
                                    : colors.border,
                                  opacity: pressed ? 0.9 : 1,
                                },
                              ]}
                            >
                              <Text
                                style={{
                                  color: isSelected ? category.tint : colors.text,
                                  fontWeight: "700",
                                  fontSize: 12,
                                }}
                              >
                                {category.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}

                  {/* Priority Selector */}
                  {(isAddingTask || title.trim().length > 0) && (
                    <View style={styles.categoryChoiceRow}>
                      <Text
                        style={[
                          styles.categoryChoiceLabel,
                          { color: colors.textMuted },
                        ]}
                      >
                        Priority
                      </Text>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        {[
                          { key: "high", label: "🔴 High", color: colors.error, softColor: colorScheme === "light" ? "rgba(220, 38, 38, 0.08)" : "rgba(239, 68, 68, 0.12)" },
                          { key: "medium", label: "🟡 Medium", color: colors.warning, softColor: colorScheme === "light" ? "rgba(217, 119, 6, 0.08)" : "rgba(245, 158, 11, 0.12)" },
                          { key: "low", label: "🟢 Low", color: colors.success, softColor: colorScheme === "light" ? "rgba(5, 150, 105, 0.08)" : "rgba(16, 185, 129, 0.12)" },
                        ].map((p) => {
                          const isSelected = selectedTodoPriority === p.key;
                          return (
                            <Pressable
                              key={p.key}
                              onPress={() => setSelectedTodoPriority(p.key as any)}
                              style={({ pressed }) => [
                                styles.categoryChoicePill,
                                {
                                  backgroundColor: isSelected ? p.softColor : colors.cardLight,
                                  borderColor: isSelected ? p.color : colors.border,
                                  opacity: pressed ? 0.9 : 1,
                                },
                              ]}
                            >
                              <Text
                                style={{
                                  color: isSelected ? p.color : colors.text,
                                  fontWeight: "700",
                                  fontSize: 12,
                                }}
                              >
                                {p.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* Priority Filter Row */}
                  <View style={[styles.categoryChoiceRow, { marginBottom: 8 }]}>
                    <Text
                      style={[
                        styles.categoryChoiceLabel,
                        { color: colors.textMuted },
                      ]}
                    >
                      Filter Priority
                    </Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {[
                        { key: "all", label: "All" },
                        { key: "high", label: "🔴 High" },
                        { key: "medium", label: "🟡 Medium" },
                        { key: "low", label: "🟢 Low" },
                      ].map((p) => {
                        const isSelected = selectedListPriorityFilter === p.key;
                        return (
                          <Pressable
                            key={p.key}
                            onPress={() => setSelectedListPriorityFilter(p.key as any)}
                            style={({ pressed }) => [
                              styles.categoryChoicePill,
                              {
                                backgroundColor: isSelected
                                  ? colorScheme === "light" ? "#E2E8F0" : "#27272A"
                                  : colors.cardLight,
                                borderColor: isSelected ? colors.primary : colors.border,
                                opacity: pressed ? 0.9 : 1,
                              },
                            ]}
                          >
                            <Text
                              style={{
                                color: isSelected ? colors.text : colors.textMuted,
                                fontWeight: isSelected ? "700" : "500",
                                fontSize: 12,
                              }}
                            >
                              {p.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* Tasks List View */}
                  <View style={styles.listContent}>
                    {/* Overdue Section */}
                    {overdueTodos.length > 0 && (
                      <View style={styles.sectionContainer}>
                        <Pressable
                          onPress={() => setOverdueExpanded(!overdueExpanded)}
                          style={styles.sectionHeaderPressable}
                        >
                          <Text
                            style={[
                              styles.sectionHeaderText,
                              { color: colors.text },
                            ]}
                          >
                            Overdue
                          </Text>
                          <Feather
                            name={
                              overdueExpanded ? "chevron-up" : "chevron-down"
                            }
                            size={16}
                            color={colors.textMuted}
                          />
                        </Pressable>
                        {overdueExpanded && (
                          <View style={styles.sectionTasksList}>
                            {overdueTodos.map(renderTodoItem)}
                          </View>
                        )}
                      </View>
                    )}

                    {/* Today Section */}
                    <View style={styles.sectionContainer}>
                      <Pressable
                        onPress={() => setTodayExpanded(!todayExpanded)}
                        style={styles.sectionHeaderPressable}
                      >
                        <Text
                          style={[
                            styles.sectionHeaderText,
                            { color: colors.text },
                          ]}
                        >
                          Today
                        </Text>
                        <Feather
                          name={todayExpanded ? "chevron-up" : "chevron-down"}
                          size={16}
                          color={colors.textMuted}
                        />
                      </Pressable>
                      {todayExpanded && (
                        <View style={styles.sectionTasksList}>
                          {todayTodos.length > 0 ? (
                            todayTodos.map(renderTodoItem)
                          ) : overdueTodos.length === 0 ? (
                            <View
                              style={[
                                styles.emptyState,
                                { borderColor: colors.border, gap: 16 },
                              ]}
                            >
                              <TasksEmptyGraphic />
                              <Text
                                style={[
                                  styles.emptyTitle,
                                  { color: colors.text },
                                ]}
                              >
                                No tasks found
                              </Text>
                              <Text
                                style={[
                                  styles.emptySubtitle,
                                  { color: colors.textMuted },
                                ]}
                              >
                                Add one above and start focusing.
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      )}
                    </View>
                  </View>
                </ScrollView>
              ) : (
                <ScrollView
                  style={styles.flex}
                  contentContainerStyle={{ gap: 16, paddingBottom: 120 }}
                  showsVerticalScrollIndicator={false}
                >
                  {/* Collapsible Stats Section */}
                  <AppCard style={{ padding: 12 }}>
                    <Pressable
                      onPress={() => setStatsExpanded(!statsExpanded)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Feather name="bar-chart-2" size={16} color={colors.primary} />
                        <Text style={{ fontWeight: "700", color: colors.text, fontSize: 14 }}>
                          Daily Progress
                        </Text>
                        <View
                          style={{
                            backgroundColor: `${colors.primary}15`,
                            borderRadius: 12,
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                          }}
                        >
                          <Text style={{ color: colors.primary, fontSize: 10, fontWeight: "700" }}>
                            {Math.round(habitCompletionPct * 100)}% Done
                          </Text>
                        </View>
                      </View>
                      <Feather
                        name={statsExpanded ? "chevron-up" : "chevron-down"}
                        size={18}
                        color={colors.textMuted}
                      />
                    </Pressable>

                    {statsExpanded && (
                      <View style={{ marginTop: 12, gap: 12 }}>
                        {/* Habits Banners */}
                        {unfinishedHabitCount > 0 && (
                          <View
                            style={[
                              styles.warningBanner,
                              {
                                backgroundColor: `${colors.warning}15`,
                                borderColor: `${colors.warning}33`,
                                marginTop: 0,
                              },
                            ]}
                          >
                            <Feather
                              name="alert-triangle"
                              size={16}
                              color={colors.warning}
                            />
                            <Text
                              style={[styles.warningText, { color: colors.warning }]}
                            >
                              {unfinishedHabitCount} habits left today
                            </Text>
                          </View>
                        )}

                        {showCelebrate && (
                          <View
                            style={[
                              styles.successBanner,
                              {
                                backgroundColor: `${colors.success}15`,
                                borderColor: `${colors.success}33`,
                                marginTop: 0,
                              },
                            ]}
                          >
                            <Feather name="award" size={18} color={colors.success} />
                            <Text
                              style={[styles.successText, { color: colors.success }]}
                            >
                              Perfect run! All habits completed today.
                            </Text>
                          </View>
                        )}

                        {/* Summary / Streaks */}
                        <View style={[styles.summaryRow, { gap: 8 }]}>
                          <View style={[styles.summaryHalf, { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, backgroundColor: colors.cardLight }]}>
                            <Text
                              style={[
                                styles.summaryLabel,
                                { color: colors.textMuted, fontSize: 11 },
                              ]}
                            >
                              Completed Today
                            </Text>
                            <Text style={[styles.summaryVal, { color: colors.text, fontSize: 16, fontWeight: "700" }]}>
                              {completedHabitCount}/{habits.length}
                            </Text>
                          </View>
                          <View style={[styles.summaryHalf, { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, backgroundColor: colors.cardLight }]}>
                            <Text
                              style={[
                                styles.summaryLabel,
                                { color: colors.textMuted, fontSize: 11 },
                              ]}
                            >
                              Longest Streak
                            </Text>
                            <Text style={[styles.summaryVal, { color: colors.text, fontSize: 16, fontWeight: "700" }]}>
                              {longestStreak} Days
                            </Text>
                          </View>
                        </View>

                        {/* Progress bar */}
                        <ProgressBar progress={habitCompletionPct} />
                      </View>
                    )}
                  </AppCard>

                  {/* Add Habit input */}
                  <AppCard style={styles.addTaskCard}>
                    <TextInput
                      value={habitTitle}
                      onChangeText={setHabitTitle}
                      placeholder="Add a new habit"
                      placeholderTextColor={colors.textMuted}
                      onSubmitEditing={addHabit}
                      onFocus={() => setIsAddingHabit(true)}
                      onBlur={() => {
                        if (habitTitle.trim() === "") setIsAddingHabit(false);
                      }}
                      style={[styles.addTaskInput, { color: colors.text }]}
                    />
                    <Pressable
                      onPress={addHabit}
                      style={[
                        styles.addBtn,
                        { backgroundColor: colors.primary },
                      ]}
                    >
                      <Feather name="plus" size={20} color="#ffffff" />
                    </Pressable>
                  </AppCard>

                  {/* Habit Priority Selector */}
                  {(isAddingHabit || habitTitle.trim().length > 0) && (
                    <View style={styles.categoryChoiceRow}>
                      <Text
                        style={[
                          styles.categoryChoiceLabel,
                          { color: colors.textMuted },
                        ]}
                      >
                        Priority
                      </Text>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        {[
                          { key: "high", label: "🔴 High", color: colors.error, softColor: colorScheme === "light" ? "rgba(220, 38, 38, 0.08)" : "rgba(239, 68, 68, 0.12)" },
                          { key: "medium", label: "🟡 Medium", color: colors.warning, softColor: colorScheme === "light" ? "rgba(217, 119, 6, 0.08)" : "rgba(245, 158, 11, 0.12)" },
                          { key: "low", label: "🟢 Low", color: colors.success, softColor: colorScheme === "light" ? "rgba(5, 150, 105, 0.08)" : "rgba(16, 185, 129, 0.12)" },
                        ].map((p) => {
                          const isSelected = selectedHabitPriority === p.key;
                          return (
                            <Pressable
                              key={p.key}
                              onPress={() => setSelectedHabitPriority(p.key as any)}
                              style={({ pressed }) => [
                                styles.categoryChoicePill,
                                {
                                  backgroundColor: isSelected ? p.softColor : colors.cardLight,
                                  borderColor: isSelected ? p.color : colors.border,
                                  opacity: pressed ? 0.9 : 1,
                                },
                              ]}
                            >
                              <Text
                                style={{
                                  color: isSelected ? p.color : colors.text,
                                  fontWeight: "700",
                                  fontSize: 12,
                                }}
                              >
                                {p.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* Habit Priority Filter Row */}
                  <View style={[styles.categoryChoiceRow, { marginBottom: 8, marginTop: 10 }]}>
                    <Text
                      style={[
                        styles.categoryChoiceLabel,
                        { color: colors.textMuted },
                      ]}
                    >
                      Filter Priority
                    </Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {[
                        { key: "all", label: "All" },
                        { key: "high", label: "🔴 High" },
                        { key: "medium", label: "🟡 Medium" },
                        { key: "low", label: "🟢 Low" },
                      ].map((p) => {
                        const isSelected = selectedListHabitPriorityFilter === p.key;
                        return (
                          <Pressable
                            key={p.key}
                            onPress={() => setSelectedListHabitPriorityFilter(p.key as any)}
                            style={({ pressed }) => [
                              styles.categoryChoicePill,
                              {
                                backgroundColor: isSelected
                                  ? colorScheme === "light" ? "#E2E8F0" : "#27272A"
                                  : colors.cardLight,
                                borderColor: isSelected ? colors.primary : colors.border,
                                opacity: pressed ? 0.9 : 1,
                              },
                            ]}
                          >
                            <Text
                              style={{
                                color: isSelected ? colors.text : colors.textMuted,
                                fontWeight: isSelected ? "700" : "500",
                                fontSize: 12,
                              }}
                            >
                              {p.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* Habits List View */}
                  <View style={styles.listContent}>
                    {displayedHabits.length > 0 ? (
                      displayedHabits.map((item) => {
                        const baseTime = formatReminder(
                          item.reminderHour,
                          item.reminderMinute,
                        );
                        const DAY_LABELS = [
                          "Sun",
                          "Mon",
                          "Tue",
                          "Wed",
                          "Thu",
                          "Fri",
                          "Sat",
                        ];
                        const formatDays = (days?: number[]) => {
                          if (!days || days.length === 0) return null;
                          const sorted = [...days].sort((a, b) => a - b);
                          return sorted
                            .map((d) => DAY_LABELS[d] ?? d)
                            .join(", ");
                        };
                        const daysText = formatDays(item.reminderDays ?? []);
                        const reminderText = baseTime
                          ? daysText
                          : baseTime
                          ? daysText
                            ? `${daysText} • ${baseTime}`
                            : baseTime
                          : daysText;
                        const reminderMenuVisible =
                          reminderMenuHabitId === item.id;

                        // Mock weekly checklist grid
                        const renderWeeklyGrid = (completed: boolean) => {
                          return (
                            <View style={styles.weeklyGrid}>
                              {["M", "T", "W", "T", "F", "S", "S"].map(
                                (day, idx) => {
                                  const isDone = completed || idx < 3;
                                  return (
                                    <View
                                      key={idx}
                                      style={[
                                        styles.gridDot,
                                        {
                                          backgroundColor: isDone
                                            ? colors.success
                                            : "transparent",
                                          borderColor: isDone
                                            ? colors.success
                                            : colors.border,
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.gridText,
                                          {
                                            color: isDone
                                              ? "#fff"
                                              : colors.textMuted,
                                          },
                                        ]}
                                      >
                                        {day}
                                      </Text>
                                    </View>
                                  );
                                },
                              )}
                            </View>
                          );
                        };

                        const isExpanded = !!expandedHabitIds[item.id];
                        return (
                          <View key={item.id} style={styles.habitWrap}>
                            <SwipeableCard
                              onSwipeRight={() => toggleHabit(item.id)}
                              onSwipeLeft={() => deleteHabit(item.id)}
                            >
                              <AppCard
                                style={[
                                  styles.todoItemCard,
                                  {
                                    borderLeftWidth: 4,
                                    borderLeftColor: item.priority === "high"
                                      ? colors.error
                                      : item.priority === "low"
                                      ? colors.success
                                      : colors.warning,
                                  },
                                  highlightedHabitId === item.id && {
                                    borderColor: colors.primary,
                                  },
                                  item.completedToday && {
                                    borderColor: "rgba(16, 185, 129, 0.18)",
                                    borderWidth: 1,
                                    backgroundColor: "rgba(16, 185, 129, 0.03)",
                                  },
                                ]}
                              >
                                <View style={styles.todoMainRow}>
                                  <View style={styles.todoLeft}>
                                    <AnimatedCheckbox
                                      checked={item.completedToday}
                                      onToggle={() => toggleHabit(item.id)}
                                    />
                                    <Pressable
                                      onPress={() =>
                                        setExpandedHabitIds((prev) => ({
                                          ...prev,
                                          [item.id]: !prev[item.id],
                                        }))
                                      }
                                      style={styles.todoTexts}
                                    >
                                      <View
                                        style={{
                                          flexDirection: "row",
                                          alignItems: "center",
                                          gap: 6,
                                        }}
                                      >
                                        <Text
                                          style={[
                                            styles.todoTitle,
                                            {
                                              color: item.completedToday
                                                ? colors.textMuted
                                                : colors.text,
                                              textDecorationLine:
                                                item.completedToday
                                                  ? "line-through"
                                                  : "none",
                                            },
                                          ]}
                                        >
                                          {item.title}
                                        </Text>
                                        {item.streak > 0 && (
                                          <View
                                            style={{
                                              backgroundColor:
                                                "rgba(249, 115, 22, 0.08)",
                                              paddingHorizontal: 6,
                                              paddingVertical: 1,
                                              borderRadius: 8,
                                            }}
                                          >
                                            <Text
                                              style={{
                                                fontSize: 10,
                                                fontWeight: "800",
                                                color: "#F97316",
                                              }}
                                            >
                                              🔥 {item.streak}d
                                            </Text>
                                          </View>
                                        )}
                                      </View>

                                      <View style={{ flexDirection: "row", gap: 6, alignItems: "center", marginTop: 4, flexWrap: 'wrap' }}>
                                        <View
                                          style={[
                                            styles.tagBadge,
                                            {
                                              backgroundColor: item.priority === "high"
                                                ? `${colors.error}12`
                                                : item.priority === "low"
                                                ? `${colors.success}12`
                                                : `${colors.warning}12`,
                                              borderColor: item.priority === "high"
                                                ? colors.error
                                                : item.priority === "low"
                                                ? colors.success
                                                : colors.warning,
                                            },
                                          ]}
                                        >
                                          <Text
                                            style={[
                                              styles.tagBadgeText,
                                              {
                                                color: item.priority === "high"
                                                  ? colors.error
                                                  : item.priority === "low"
                                                  ? colors.success
                                                  : colors.warning,
                                              },
                                            ]}
                                          >
                                            {item.priority ? item.priority.toUpperCase() : "MEDIUM"}
                                          </Text>
                                        </View>
                                        {reminderText && (
                                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                            <Feather
                                              name="bell"
                                              size={11}
                                              color={colors.primary}
                                            />
                                            <Text
                                              style={[
                                                styles.reminderText,
                                                { color: colors.primary },
                                              ]}
                                            >
                                              {reminderText}
                                            </Text>
                                          </View>
                                        )}
                                      </View>

                                      {renderWeeklyGrid(item.completedToday)}
                                    </Pressable>
                                  </View>

                                  <Pressable
                                    onPress={() =>
                                      setExpandedHabitIds((prev) => ({
                                        ...prev,
                                        [item.id]: !prev[item.id],
                                      }))
                                    }
                                    hitSlop={8}
                                    style={{ padding: 4 }}
                                  >
                                    <Feather
                                      name={
                                        isExpanded
                                          ? "chevron-up"
                                          : "chevron-down"
                                      }
                                      size={18}
                                      color={colors.textMuted}
                                    />
                                  </Pressable>
                                </View>

                                {isExpanded && (
                                  <View
                                    style={[
                                      styles.expandSection,
                                      {
                                        borderTopColor:
                                          "rgba(255,255,255,0.05)",
                                      },
                                    ]}
                                  >
                                    {/* Inline Title Rename */}
                                    <View style={styles.editTaskRow}>
                                      <Text
                                        style={[
                                          styles.editLabel,
                                          { color: colors.textMuted },
                                        ]}
                                      >
                                        Rename
                                      </Text>
                                      <TextInput
                                        value={item.title}
                                        onChangeText={(newTitle) => {
                                          setHabits((curr) => {
                                            const next = curr.map((h) =>
                                              h.id === item.id
                                                ? { ...h, title: newTitle }
                                                : h,
                                            );
                                            persistHabits(next);
                                            return next;
                                          });
                                        }}
                                        placeholder="Habit name"
                                        placeholderTextColor={colors.textMuted}
                                        style={[
                                          styles.editTitleInput,
                                          {
                                            color: colors.text,
                                            borderColor: colors.border,
                                          },
                                        ]}
                                      />
                                    </View>

                                    {/* Priority Selection Selector */}
                                    <View style={styles.editTaskRow}>
                                      <Text style={[styles.editLabel, { color: colors.textMuted }]}>
                                        Priority
                                      </Text>
                                      <View style={{ flexDirection: "row", gap: 6 }}>
                                        {[
                                          { key: "high", label: "🔴 High", color: colors.error, softColor: colorScheme === "light" ? "rgba(220, 38, 38, 0.08)" : "rgba(239, 68, 68, 0.12)" },
                                          { key: "medium", label: "🟡 Medium", color: colors.warning, softColor: colorScheme === "light" ? "rgba(217, 119, 6, 0.08)" : "rgba(245, 158, 11, 0.12)" },
                                          { key: "low", label: "🟢 Low", color: colors.success, softColor: colorScheme === "light" ? "rgba(5, 150, 105, 0.08)" : "rgba(16, 185, 129, 0.12)" },
                                        ].map((p) => {
                                          const isSelected = item.priority === p.key;
                                          return (
                                            <Pressable
                                              key={p.key}
                                              onPress={() => {
                                                setHabits((curr) => {
                                                  const next = curr.map((h) =>
                                                    h.id === item.id
                                                      ? { ...h, priority: p.key as any }
                                                      : h,
                                                  );
                                                  persistHabits(next);
                                                  return next;
                                                });
                                              }}
                                              style={[
                                                styles.migratePill,
                                                {
                                                  backgroundColor: isSelected ? p.softColor : colors.cardLight,
                                                  borderColor: isSelected ? p.color : colors.border,
                                                },
                                              ]}
                                            >
                                              <Text
                                                style={{
                                                  color: isSelected ? p.color : colors.text,
                                                  fontSize: 11,
                                                  fontWeight: "700",
                                                }}
                                              >
                                                {p.label}
                                              </Text>
                                            </Pressable>
                                          );
                                        })}
                                      </View>
                                    </View>

                                    <View style={styles.dividerSmall} />

                                    {/* Habit Actions Row */}
                                    <View style={styles.expandedActionsRow}>
                                      <Pressable
                                        onPress={() =>
                                          setReminderMenuHabitId(
                                            reminderMenuHabitId === item.id
                                              ? null
                                              : item.id,
                                          )
                                        }
                                        style={[
                                          styles.expandedActionBtn,
                                          {
                                            backgroundColor:
                                              item.reminderHour !== undefined
                                                ? "rgba(245, 158, 11, 0.15)"
                                                : "rgba(255, 255, 255, 0.04)",
                                          },
                                        ]}
                                      >
                                        <Feather
                                          name="bell"
                                          size={13}
                                          color={
                                            item.reminderHour !== undefined
                                              ? colors.warning
                                              : colors.textMuted
                                          }
                                        />
                                        <Text
                                          style={[
                                            styles.expandedActionBtnText,
                                            {
                                              color:
                                                item.reminderHour !== undefined
                                                  ? colors.warning
                                                  : colors.textMuted,
                                            },
                                          ]}
                                        >
                                          {item.reminderHour !== undefined
                                            ? formatReminder(
                                                item.reminderHour,
                                                item.reminderMinute,
                                              ) || "Reminder Set"
                                            : "Set Reminder"}
                                        </Text>
                                      </Pressable>
                                      {item.reminderHour !== undefined && (
                                        <Pressable
                                          onPress={() => clearReminder(item.id)}
                                          style={[
                                            styles.expandedActionBtn,
                                            {
                                              backgroundColor:
                                                "rgba(239, 68, 68, 0.08)",
                                            },
                                          ]}
                                        >
                                          <Feather
                                            name="bell-off"
                                            size={13}
                                            color="#EF4444"
                                          />
                                          <Text
                                            style={[
                                              styles.expandedActionBtnText,
                                              { color: "#EF4444" },
                                            ]}
                                          >
                                            Remove
                                          </Text>
                                        </Pressable>
                                      )}
                                      <Pressable
                                        onPress={() => deleteHabit(item.id)}
                                        style={[
                                          styles.expandedActionBtn,
                                          {
                                            backgroundColor:
                                              "rgba(239, 68, 68, 0.08)",
                                            marginLeft: "auto",
                                          },
                                        ]}
                                      >
                                        <Feather
                                          name="trash-2"
                                          size={13}
                                          color="#EF4444"
                                        />
                                        <Text
                                          style={[
                                            styles.expandedActionBtnText,
                                            { color: "#EF4444" },
                                          ]}
                                        >
                                          Delete
                                        </Text>
                                      </Pressable>
                                    </View>
                                  </View>
                                )}
                              </AppCard>
                            </SwipeableCard>

                            {/* Habit alarm modal */}
                            {reminderMenuVisible && (
                              <AppCard style={styles.alarmModal}>
                                <ScrollView
                                  horizontal
                                  showsHorizontalScrollIndicator={false}
                                  contentContainerStyle={styles.alarmOptions}
                                >
                                  {[
                                    { label: "7:00", hour: 7, minute: 0 },
                                    { label: "12:00", hour: 12, minute: 0 },
                                    { label: "18:00", hour: 18, minute: 0 },
                                    { label: "21:00", hour: 21, minute: 0 },
                                  ].map((option) => (
                                    <Pressable
                                      key={option.label}
                                      onPress={() =>
                                        setReminderWithDays(
                                          item.id,
                                          option.hour,
                                          option.minute,
                                        )
                                      }
                                      style={[
                                        styles.alarmBtn,
                                        { backgroundColor: colors.cardLight },
                                      ]}
                                    >
                                      <Text
                                        style={{
                                          color: colors.primary,
                                          fontWeight: "600",
                                        }}
                                      >
                                        {option.label}
                                      </Text>
                                    </Pressable>
                                  ))}
                                </ScrollView>

                                <View style={styles.dropdownBottom}>
                                  <Pressable
                                    onPress={() =>
                                      setReminderCustomVisible((s) => !s)
                                    }
                                    style={[
                                      styles.alarmBtn,
                                      {
                                        backgroundColor: `${colors.primary}22`,
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={{
                                        color: colors.primary,
                                        fontWeight: "700",
                                      }}
                                    >
                                      Custom
                                    </Text>
                                  </Pressable>
                                  <Pressable
                                    onPress={() => clearReminder(item.id)}
                                    style={styles.clearBtn}
                                  >
                                    <Text
                                      style={{
                                        color: colors.error,
                                        fontWeight: "600",
                                      }}
                                    >
                                      Clear alarm
                                    </Text>
                                  </Pressable>
                                </View>

                                {reminderCustomVisible && (
                                  <TimeSelectorDial
                                    initialHour={reminderCustomHour}
                                    initialMinute={reminderCustomMinute}
                                    initialDays={reminderCustomDays}
                                    colors={colors}
                                    onSave={(hour, minute, days) =>
                                      setReminderWithDays(item.id, hour, minute, days?.length ? days : undefined)
                                    }
                                  />
                                )}
                              </AppCard>

                            )}
                          </View>
                        );
                      })
                    ) : (
                      <View
                        style={[
                          styles.emptyState,
                          { borderColor: colors.border, gap: 16 },
                        ]}
                      >
                        <HabitsEmptyGraphic />
                        <Text
                          style={[styles.emptyTitle, { color: colors.text }]}
                        >
                          No habits tracked yet
                        </Text>
                        <Text
                          style={[
                            styles.emptySubtitle,
                            { color: colors.textMuted },
                          ]}
                        >
                          Add one above and start your streaks.
                        </Text>
                      </View>
                    )}
                  </View>
                </ScrollView>
              )}

              {/* Alarm Modal */}
              {alarmMenu && (
                <AppCard style={styles.alarmModal}>
                  <View style={styles.alarmOptions}>
                    {[
                      { label: "5 min", mins: 5 },
                      { label: "30 min", mins: 30 },
                      { label: "1 hour", mins: 60 },
                    ].map(({ label, mins }) => (
                      <Pressable
                        key={label}
                        onPress={() => { scheduleAlarm(alarmMenu, mins); setAlarmMenu(null); }}
                        style={[styles.alarmBtn, { backgroundColor: colors.cardLight }]}
                      >
                        <Text style={{ color: colors.primary, fontWeight: "600" }}>{label}</Text>
                      </Pressable>
                    ))}
                    <Pressable
                      onPress={() => setAlarmCustomVisible((s) => !s)}
                      style={[styles.alarmBtn, { backgroundColor: `${colors.primary}22` }]}
                    >
                      <Text style={{ color: colors.primary, fontWeight: "700" }}>Custom</Text>
                    </Pressable>
                    <Pressable onPress={() => setAlarmMenu(null)} style={styles.closeAlarmBtn}>
                      <Text style={{ color: colors.textMuted }}>Close</Text>
                    </Pressable>
                  </View>
                  {alarmCustomVisible && (
                    <TimeSelectorDial
                      initialHour={alarmCustomHour}
                      initialMinute={alarmCustomMinute}
                      initialDays={alarmCustomDays}
                      colors={colors}
                      onSave={(hour, minute, days) =>
                        scheduleAlarmWithDays(alarmMenu, hour, minute, days)
                      }
                    />
                  )}
                </AppCard>
              )}

            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </SafeAreaView>
    </ScreenSwipeWrapper>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, paddingTop: Platform.OS === "android" ? 44 : 0 },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 16, gap: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  kicker: {
    fontSize: Typography.sizes.xs,
    fontWeight: "700",
    letterSpacing: 2,
  },
  title: {
    fontSize: Typography.sizes.display,
    fontWeight: "700",
    lineHeight: 38,
  },
  clearBtn: {
    paddingVertical: 6,
  },
  listManager: {
    gap: 12,
  },
  listHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: "700",
  },
  listPills: {
    gap: 8,
    paddingVertical: 4,
  },
  listPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  createListRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
  },
  createListInput: {
    flex: 1,
    fontSize: Typography.sizes.sm,
  },
  smallAddBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  addTaskCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 6,
    paddingLeft: 14,
  },
  addTaskInput: {
    flex: 1,
    fontSize: Typography.sizes.md,
    paddingVertical: 10,
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryChoiceRow: {
    gap: 8,
    marginTop: 10,
    marginBottom: 4,
  },
  categoryChoiceLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  categoryChoicePills: {
    gap: 8,
    paddingRight: 4,
  },
  categoryChoicePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  listContent: {
    gap: 10,
    paddingBottom: 120,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 24,
    padding: 32,
    gap: 12,
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: "700",
  },
  emptySubtitle: {
    fontSize: Typography.sizes.sm,
    textAlign: "center",
  },
  todoItemCard: {
    padding: Spacing.md,
    flexDirection: "column",
    gap: 8,
  },
  todoLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  todoTexts: {
    flex: 1,
    gap: 2,
  },
  todoTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: "600",
  },
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  reminderText: {
    fontSize: Typography.sizes.xs,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingLeft: 10,
  },
  alarmModal: {
    position: "absolute",
    bottom: 96,
    left: 0,
    right: 0,
    gap: 12,
    elevation: 12,
    zIndex: 999,
  },
  alarmOptions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  alarmBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  closeAlarmBtn: {
    padding: 8,
  },
  customPicker: {
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    paddingTop: 12,
  },
  timeInputs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timeInput: {
    width: 60,
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    textAlign: "center",
    fontSize: 16,
  },
  weekdayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 4,
  },
  weekdayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  setAlarmBtn: {
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  todoMainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 2,
  },
  subtaskProgressLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  subtaskProgressText: {
    fontSize: Typography.sizes.xs,
    fontWeight: "500",
  },
  expandSection: {
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 4,
    gap: 10,
  },
  subtaskProgressBarWrap: {
    paddingVertical: 2,
  },
  subtaskList: {
    gap: 8,
  },
  subtaskItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  subtaskLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  subtaskCheckbox: {
    padding: 2,
  },
  subtaskTitle: {
    fontSize: Typography.sizes.sm,
    fontWeight: "500",
    flex: 1,
  },
  createSubtaskRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 4,
    marginTop: 2,
  },
  createSubtaskInput: {
    flex: 1,
    fontSize: Typography.sizes.xs,
    paddingVertical: 4,
  },
  subtaskAddBtn: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionContainer: {
    marginBottom: 16,
    gap: 8,
  },
  sectionHeaderPressable: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  sectionHeaderText: {
    fontSize: Typography.sizes.sm,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  sectionTasksList: {
    gap: 10,
  },
  tagBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  tagBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },

  // New Segmented Control Styles
  segmentedControlContainer: {
    flexDirection: "row",
    padding: 4,
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  segmentButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
    gap: 6,
  },
  segmentText: {
    fontSize: 13,
  },

  // Edit / Migrate Options Styles
  editTaskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 2,
  },
  editLabel: {
    fontSize: 12,
    fontWeight: "600",
    width: 54,
  },
  editTitleInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
  },
  migrateCategoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 2,
  },
  migratePills: {
    gap: 6,
    paddingVertical: 2,
  },
  migratePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  dividerSmall: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    marginVertical: 4,
  },
  expandedActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    width: "100%",
  },
  expandedActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  expandedActionBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },

  // Habits Merged Styles
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: Spacing.md,
    borderRadius: 16,
    borderWidth: 1,
  },
  warningText: { fontSize: Typography.sizes.sm, fontWeight: "600" },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: Spacing.md,
    borderRadius: 16,
    borderWidth: 1,
  },
  successText: { fontSize: Typography.sizes.sm, fontWeight: "600" },
  summaryRow: { flexDirection: "row", gap: 12 },
  summaryHalf: { flex: 1, gap: 4, padding: Spacing.md },
  summaryLabel: { fontSize: Typography.sizes.xs, fontWeight: "600" },
  summaryVal: { fontSize: 22, fontWeight: "800" },
  progressSection: { padding: Spacing.lg, gap: Spacing.sm },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressTitle: { fontSize: Typography.sizes.md, fontWeight: "700" },
  progressPercent: { fontSize: Typography.sizes.md, fontWeight: "800" },
  habitWrap: { gap: 8 },
  weeklyGrid: { flexDirection: "row", gap: 6, marginTop: 4 },
  gridDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  gridText: { fontSize: 8, fontWeight: "800" },
  dropdownBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  timeSelectWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 12,
  },
  timeCol: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    minWidth: 70,
  },
  chevronBtn: {
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  timeText: {
    fontSize: 28,
    fontWeight: "700",
    marginVertical: 2,
    fontVariant: ["tabular-nums"],
  },
  presetOffsetsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginVertical: 8,
  },
  offsetBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  offsetBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
});