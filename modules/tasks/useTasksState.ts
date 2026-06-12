import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, AppStateStatus, Platform, ScrollView, TextInput as RNTextInput } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useUndo } from "@/components/ui/UndoContext";

import { Todo, Habit, TaskList } from "../types";

import { pluginManager } from "@/plugin";
import { type ParsedProductivityItem } from "@/services/nlpParser";
import { getNotificationLogs } from "@/services/notificationsLog";
import { recordDailyHistorySnapshot } from "@/services/productivityHistory";
import { earnPebble, undoLastPebble } from "@/services/pebbleService";
import { cancelReminderIds, scheduleReminderBatch, rescheduleTodoReminders, rescheduleHabitReminders } from "@/services/reminders";
import { getProfile, handleTaskXpChange, handleHabitXpChange, type UserProfile } from "@/services/settingsService";
import { addStateListener, emitStateChange } from "@/services/stateEvents";
import {
    DAILY_STORAGE_KEY,
    DAY_MS,
    TODOS_STORAGE_KEY,
    addToRecycleBin,
    getRecycleBinItems,
    saveRecycleBinItems,
} from "@/services/storage";
import { getActiveSuggestions, logTaskCreation, type SmartSuggestion } from "@/services/suggestions";
import { DEFAULT_TASK_CATEGORY, normalizeTaskCategory, TASK_CATEGORY_META, type TaskCategory } from "@/services/taskCategories";
import { syncWidgetData } from "@/services/widgetData";
import { isRecurringOccurrenceForDate, getRecurrenceLabel } from "@/services/recurrence";

const STORAGE_KEY = TODOS_STORAGE_KEY;

const initialTodos: Todo[] = [
  {
    id: "1",
    title: "Collect my first daily pebble",
    completed: true,
    category: "work",
  },
  { id: "2", title: "Add a pebble task to the workspace", completed: false, category: "personal" },
  {
    id: "3",
    title: "Tap a pebble task to mark it done",
    completed: false,
    category: "work",
  },
];

export const getDateKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const parseDateKey = (value: string) => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const dayDiff = (fromDateKey: string, toDateKey: string) => {
  const from = parseDateKey(fromDateKey).getTime();
  const to = parseDateKey(toDateKey).getTime();
  return Math.floor((to - from) / DAY_MS);
};

export const normalizeHabitsForToday = (habitsList: Habit[]) => {
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

    const isWithinRecoveryWindow = habit.streakBrokenDate && (dayDiff(habit.streakBrokenDate, today) <= 1);
    let nextPreviousStreak = habit.previousStreak;
    let nextStreakBrokenDate = habit.streakBrokenDate;

    if (habit.streak > 0) {
      nextPreviousStreak = habit.streak;
      nextStreakBrokenDate = today;
    } else if (!isWithinRecoveryWindow) {
      nextPreviousStreak = undefined;
      nextStreakBrokenDate = undefined;
    }

    return {
      ...habit,
      completedToday: false,
      streak: 0,
      previousStreak: nextPreviousStreak,
      streakBrokenDate: nextStreakBrokenDate,
    };
  });
};

export const getListColors = (name: string, isSelected: boolean) => {
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

export const getPriorityWeight = (priority?: string) => {
  if (priority === "high") return 0;
  if (priority === "low") return 2;
  return 1;
};

export const getTodoDateKey = (todo: Todo) => {
  if (todo.scheduledDate) {
    return todo.scheduledDate;
  }
  if (todo.alarmTime) {
    return getDateKey(new Date(todo.alarmTime));
  }
  const idNum = Number(todo.id);
  if (!isNaN(idNum) && idNum > 100000000000) {
    return getDateKey(new Date(idNum));
  }
  return getDateKey();
};

export function useTasksState() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    focusItemId?: string;
    focusItemType?: string;
    segment?: string;
    category?: string;
    quickAdd?: string;
    folderId?: string;
  }>();

  const scrollViewRef = useRef<ScrollView>(null);
  const addTaskInputRef = useRef<RNTextInput>(null);
  const focusTodoId =
    typeof params.focusItemId === "string" && params.focusItemType === "todo"
      ? params.focusItemId
      : null;

  const focusHabitId =
    typeof params.focusItemId === "string" && params.focusItemType === "habit"
      ? params.focusItemId
      : null;

  // Segment Selector
  const [activeSegment, setActiveSegment] = useState<"tasks" | "habits">("tasks");
  const [selectedDate, setSelectedDate] = useState<string>(getDateKey());

  // Tasks Screen State
  const [searchQuery, setSearchQuery] = useState("");
  const [isBulkSelectActive, setIsBulkSelectActive] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [isMoveModalVisible, setIsMoveModalVisible] = useState(false);
  const [openedFolderId, setOpenedFolderId] = useState<string | null>(null);
  const [folderModalVisible, setFolderModalVisible] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [highlightedTodoId, setHighlightedTodoId] = useState<string | null>(null);
  const [lists, setLists] = useState<TaskList[]>([{ id: "default", name: "My Pebbles" }]);
  const [selectedList, setSelectedList] = useState<string>("default");
  const [todos, setTodos] = useState<Record<string, Todo[]>>({
    default: initialTodos,
  });
  const [title, setTitle] = useState("");
  const [selectedTodoCategory, setSelectedTodoCategory] = useState<TaskCategory>(DEFAULT_TASK_CATEGORY);
  const [selectedTodoPriority, setSelectedTodoPriority] = useState<"low" | "medium" | "high">("medium");
  const [selectedListPriorityFilter, setSelectedListPriorityFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<TaskCategory | "all">("all");

  const [editingTask, setEditingTask] = useState<Todo | null>(null);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);

  const [expandedTodoIds, setExpandedTodoIds] = useState<Record<string, boolean>>({});
  const [taskPositions, setTaskPositions] = useState<Record<string, number>>({});

  // Habits Screen State
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitTitle, setHabitTitle] = useState("");
  const [selectedHabitPriority, setSelectedHabitPriority] = useState<"low" | "medium" | "high">("medium");
  const [selectedListHabitPriorityFilter, setSelectedListHabitPriorityFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [showCelebrate, setShowCelebrate] = useState(false);
  const [highlightedHabitId, setHighlightedHabitId] = useState<string | null>(null);
  const celebrateDateRef = useRef<string | null>(null);

  // Alarms State
  const [alarmMenu, setAlarmMenu] = useState<string | null>(null);

  const [listsExpanded, setListsExpanded] = useState(false);
  const [addingTask, setAddingTask] = useState<Todo | null>(null);
  const [selectedTodoDate, setSelectedTodoDate] = useState<string>(getDateKey());
  const [isAddingHabit, setIsAddingHabit] = useState(false);
  const [statsExpanded, setStatsExpanded] = useState(false);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [hasUnreadNotifs, setHasUnreadNotifs] = useState<boolean>(false);

  // NLP Modal & Heuristic Suggestions States
  const [nlpVisible, setNlpVisible] = useState(false);
  const [activeSuggestions, setActiveSuggestions] = useState<SmartSuggestion[]>([]);

  const { showUndo, showToast } = useUndo();

  const persistHabits = useCallback(async (nextHabits: Habit[]) => {
    console.log("🔍 [persistHabits] Saving habits to storage:", JSON.stringify(nextHabits, null, 2));
    try {
      const payload = { dailyHabits: nextHabits };
      await AsyncStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(payload));
      void recordDailyHistorySnapshot();
    } catch (e) {
      console.warn("Failed to persist habits:", e);
    }
  }, []);

  // 14-Day Scrollable Week Strip
  const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const weekDaysStrip = useMemo(() => {
    const list = [];
    const today = new Date();
    for (let i = -3; i <= 10; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      list.push({
        dateString: getDateKey(d),
        dayNum: String(d.getDate()).padStart(2, "0"),
        dayName: WEEKDAY_NAMES[d.getDay()],
        isToday: getDateKey(d) === getDateKey(today),
      });
    }
    return list;
  }, []);

  const formatSelectedDayName = useMemo(() => {
    const today = getDateKey();
    if (selectedDate === today) return "Today";
    const tomorrow = getDateKey(new Date(Date.now() + DAY_MS));
    if (selectedDate === tomorrow) return "Tomorrow";
    try {
      const parsed = parseDateKey(selectedDate);
      return parsed.toLocaleDateString([], {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  const currentTodos = useMemo(
    () => (todos[selectedList] ?? []).filter((t) => !t.archived),
    [todos, selectedList]
  );

  const filteredTodos = useMemo(() => {
    const raw = (todos[selectedList] ?? []).filter((t) => !t.archived);
    if (searchQuery.trim() === "") return raw;
    return raw.filter((todo) => {
      const matchesTitle = todo.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDesc = todo.description?.toLowerCase().includes(searchQuery.toLowerCase()) || false;
      const matchesCategory = todo.category?.toLowerCase().includes(searchQuery.toLowerCase()) || false;
      const wsName = lists.find((l) => l.id === todo.folderId)?.name || "";
      const matchesWorkspace = wsName.toLowerCase().includes(searchQuery.toLowerCase());
      const recLabel = getRecurrenceLabel(todo.recurrence) || "";
      const matchesRecurrence = recLabel.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTitle || matchesDesc || matchesCategory || matchesWorkspace || matchesRecurrence;
    });
  }, [todos, selectedList, searchQuery, lists]);

  const isOverdue = (todo: Todo) => {
    if (todo.completed) return false;
    const todoDate = getTodoDateKey(todo);
    return todoDate < selectedDate;
  };



  const overdueTodos = useMemo(() => {
    let filtered = filteredTodos.filter((todo) => todo.scheduledDate !== "inbox" && isOverdue(todo));
    if (selectedCategoryFilter !== "all") {
      filtered = filtered.filter((todo) => todo.category === selectedCategoryFilter);
    }
    const matched =
      selectedListPriorityFilter === "all"
        ? filtered
        : filtered.filter((todo) => todo.priority === selectedListPriorityFilter);
    return [...matched].sort((a, b) => getPriorityWeight(a.priority) - getPriorityWeight(b.priority));
  }, [filteredTodos, selectedListPriorityFilter, selectedCategoryFilter, selectedDate]);

  const todayTodos = useMemo(() => {
    let filtered = filteredTodos.filter((todo) => {
      if (todo.scheduledDate === "inbox") return false;
      if (isOverdue(todo)) return false;
      return isRecurringOccurrenceForDate(todo, selectedDate);
    });
    if (selectedCategoryFilter !== "all") {
      filtered = filtered.filter((todo) => todo.category === selectedCategoryFilter);
    }
    const matched =
      selectedListPriorityFilter === "all"
        ? filtered
        : filtered.filter((todo) => todo.priority === selectedListPriorityFilter);
    return [...matched].sort((a, b) => getPriorityWeight(a.priority) - getPriorityWeight(b.priority));
  }, [filteredTodos, selectedListPriorityFilter, selectedCategoryFilter, selectedDate]);

  const upcomingTodos = useMemo(() => {
    let filtered = filteredTodos.filter(
      (todo) => todo.scheduledDate !== "inbox" && !isOverdue(todo) && getTodoDateKey(todo) > selectedDate
    );
    if (selectedCategoryFilter !== "all") {
      filtered = filtered.filter((todo) => todo.category === selectedCategoryFilter);
    }
    const matched =
      selectedListPriorityFilter === "all"
        ? filtered
        : filtered.filter((todo) => todo.priority === selectedListPriorityFilter);
    return [...matched].sort((a, b) => getPriorityWeight(a.priority) - getPriorityWeight(b.priority));
  }, [filteredTodos, selectedListPriorityFilter, selectedCategoryFilter, selectedDate]);

  const inboxTodos = useMemo(() => {
    let filtered = filteredTodos.filter((todo) => todo.scheduledDate === "inbox");
    if (selectedCategoryFilter !== "all") {
      filtered = filtered.filter((todo) => todo.category === selectedCategoryFilter);
    }
    const matched =
      selectedListPriorityFilter === "all"
        ? filtered
        : filtered.filter((todo) => todo.priority === selectedListPriorityFilter);
    return [...matched].sort((a, b) => getPriorityWeight(a.priority) - getPriorityWeight(b.priority));
  }, [filteredTodos, selectedListPriorityFilter, selectedCategoryFilter]);

  const remainingCount = useMemo(() => currentTodos.filter((todo) => !todo.completed).length, [currentTodos]);
  const completedCount = currentTodos.length - remainingCount;

  // Habit Memos
  const unfinishedHabitCount = useMemo(() => habits.filter((habit) => !habit.completedToday).length, [habits]);

  const displayedHabits = useMemo(() => {
    const dateParts = selectedDate.split("-").map(Number);
    const selDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    const dayOfWeek = selDate.getDay();

    console.log("🔍 [displayedHabits] Filtering habits. habits count:", habits.length, "selectedDate:", selectedDate, "dayOfWeek:", dayOfWeek);

    const activeHabits = habits.filter((habit) => {
      if (habit.archived) {
        console.log(`🔍 [displayedHabits] Habit "${habit.title}" is archived`);
        return false;
      }
      if (habit.recurrence) {
        const isRec = isRecurringOccurrenceForDate(habit, selectedDate);
        console.log(`🔍 [displayedHabits] Habit "${habit.title}" has recurrence:`, JSON.stringify(habit.recurrence), "isRecurringOccurrenceForDate:", isRec);
        return isRec;
      }
      const hasReminderDaysMatch = (
        !habit.reminderDays ||
        habit.reminderDays.length === 0 ||
        habit.reminderDays.includes(dayOfWeek)
      );
      console.log(`🔍 [displayedHabits] Habit "${habit.title}" has no recurrence. reminderDays:`, habit.reminderDays, "hasReminderDaysMatch:", hasReminderDaysMatch);
      return hasReminderDaysMatch;
    });

    const filtered =
      selectedListHabitPriorityFilter === "all"
        ? activeHabits
        : activeHabits.filter((habit) => habit.priority === selectedListHabitPriorityFilter);

    const searchFiltered =
      searchQuery.trim() === ""
        ? filtered
        : filtered.filter((h) => {
            const matchesTitle = h.title.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesDesc = h.description?.toLowerCase().includes(searchQuery.toLowerCase()) || false;
            const matchesCategory = h.category?.toLowerCase().includes(searchQuery.toLowerCase()) || false;
            const wsName = lists.find((l) => l.id === h.folderId)?.name || "";
            const matchesWorkspace = wsName.toLowerCase().includes(searchQuery.toLowerCase());
            const recLabel = getRecurrenceLabel(h.recurrence) || "";
            const matchesRecurrence = recLabel.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesTitle || matchesDesc || matchesCategory || matchesWorkspace || matchesRecurrence;
          });

    console.log("🔍 [displayedHabits] Final filtered habits:", searchFiltered.map(h => h.title));
    return [...searchFiltered].sort((a, b) => getPriorityWeight(a.priority) - getPriorityWeight(b.priority));
  }, [habits, selectedListHabitPriorityFilter, selectedDate, searchQuery, lists]);

  const completedHabitCount = habits.length - unfinishedHabitCount;
  const habitCompletionPct = habits.length === 0 ? 0 : completedHabitCount / habits.length;
  const longestStreak = useMemo(() => habits.reduce((max, habit) => Math.max(max, habit.bestStreak || 0), 0), [habits]);



  // Sync parameters
  useEffect(() => {
    if (params.segment === "habits") {
      setActiveSegment("habits");
    } else if (params.segment === "tasks") {
      setActiveSegment("tasks");
    }
  }, [params.segment]);

  useEffect(() => {
    if (params.folderId) {
      setOpenedFolderId(params.folderId);
      setSelectedList(params.folderId);
      setActiveSegment("tasks");
    }
  }, [params.folderId]);

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

  const loadState = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const defaultFolders = [{ id: "default", name: "My Pebbles", emoji: "📋", color: "#6366F1" }];
        const defaultTodos = { default: [] };
        setLists(defaultFolders as any);
        setTodos(defaultTodos as any);
        setSelectedList("default");
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            lists: defaultFolders,
            selectedList: "default",
            todos: defaultTodos,
          })
        );
        return;
      }
      const parsed = JSON.parse(raw) as {
        lists: TaskList[];
        selectedList: string;
        todos: Record<string, Todo[]>;
      };
      if (parsed?.lists) setLists(parsed.lists);
      if (openedFolderId) {
        setSelectedList(openedFolderId);
      } else if (parsed?.selectedList) {
        setSelectedList(parsed.selectedList);
      }
      if (parsed?.todos) {
        const normalizedTodos = Object.fromEntries(
          Object.entries(parsed.todos).map(([listId, listTodos]) => {
            const normalized = listTodos.map((todo) => {
              return {
                ...todo,
                category: normalizeTaskCategory(todo.category),
                folderId: listId,
              };
            });
            return [listId, normalized];
          })
        ) as Record<string, Todo[]>;
        setTodos(normalizedTodos);
      }

      try {
        const userProfile = await getProfile();
        setProfile(userProfile);
        const logs = await getNotificationLogs();
        const hasUnread = logs.some((l: any) => !l.read);
        setHasUnreadNotifs(hasUnread);
      } catch {}

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
                    tt.id === t.id ? { ...tt, alarmId: `web-${String(timeoutId)}` } : tt
                  );
                }
                persistState(parsed.lists || [], parsed.selectedList || "default", updatedLists);
                return updatedLists;
              });
            }
          });
        });
      }
    } catch {}
  }, [openedFolderId]);

  const loadHabits = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
      console.log("🔍 [loadHabits] Loaded raw habits from storage:", raw);
      if (!raw) {
        setHabits([]);
        return;
      }

      const parsed = JSON.parse(raw) as { dailyHabits: Habit[] };
      const normalized = normalizeHabitsForToday(parsed.dailyHabits ?? []);
      console.log("🔍 [loadHabits] Normalized habits:", JSON.stringify(normalized, null, 2));
      setHabits(normalized);
      await persistHabits(normalized);
    } catch (e) {
      console.warn("Failed to load habits:", e);
      setHabits([]);
    }
  }, []);

  const loadSuggestions = useCallback(async () => {
    try {
      const active = await getActiveSuggestions();
      setActiveSuggestions(active);
    } catch {}
  }, []);

  const handleSaveParsedItem = async (parsed: ParsedProductivityItem, targetWorkspaceId?: string) => {
    if (!parsed.title || parsed.title.trim() === "") return;

    if (parsed.type === "task") {
      const generatedTaskId = String(Date.now());
      let alarmTime: number | undefined;
      let notificationIds: string[] = [];
      let alarmId: string | undefined;

      if (parsed.time && parsed.recurrence) {
        try {
          const scheduled = await scheduleReminderBatch({
            kind: "todo",
            itemId: generatedTaskId,
            title: parsed.title,
            category: parsed.category || DEFAULT_TASK_CATEGORY,
            dailyTime: {
              hour: Number(parsed.time.split(":")[0]),
              minute: Number(parsed.time.split(":")[1]),
            },
            recurrence: parsed.recurrence,
            escalationMinutes: [120, 240],
            channelId: Platform.OS === "android" ? "todo-reminders" : undefined,
            context: {
              title: parsed.title,
              remainingCount: 1,
              totalCount: 1,
            },
          });
          alarmId = scheduled.primaryId;
          notificationIds = scheduled.ids;
        } catch (e) {
          console.error("Failed to schedule NLP recurring task reminder:", e);
        }
      } else if (parsed.time && parsed.date) {
        const [hours, minutes] = parsed.time.split(":").map(Number);
        const [year, monthVal, dayVal] = parsed.date.split("-").map(Number);
        const dateObj = new Date(year, monthVal - 1, dayVal, hours, minutes, 0, 0);

        if (parsed.reminderOffsetMinutes) {
          dateObj.setMinutes(dateObj.getMinutes() - parsed.reminderOffsetMinutes);
        }

        if (dateObj.getTime() > Date.now()) {
          alarmTime = dateObj.getTime();
          try {
            const scheduled = await scheduleReminderBatch({
              kind: "todo",
              itemId: generatedTaskId,
              title: parsed.title,
              category: parsed.category || DEFAULT_TASK_CATEGORY,
              oneTimeAt: dateObj,
              escalationMinutes: [120, 240],
              channelId: Platform.OS === "android" ? "todo-reminders" : undefined,
              context: {
                title: parsed.title,
                remainingCount: 1,
                totalCount: 1,
              },
            });
            alarmId = scheduled.primaryId;
            notificationIds = scheduled.ids;
          } catch (e) {
            console.error("Failed to schedule NLP task reminder:", e);
          }
        }
      }

      const destinationWorkspaceId = targetWorkspaceId || openedFolderId || "default";

      const newTodo: Todo = {
        id: generatedTaskId,
        title: parsed.title,
        completed: false,
        category: parsed.category || DEFAULT_TASK_CATEGORY,
        priority: parsed.priority || "medium",
        scheduledDate: parsed.date || "inbox",
        alarmTime,
        alarmId,
        notificationIds,
        reminderHour: parsed.time ? Number(parsed.time.split(":")[0]) : undefined,
        reminderMinute: parsed.time ? Number(parsed.time.split(":")[1]) : undefined,
        recurrence: parsed.recurrence,
        folderId: destinationWorkspaceId,
        createdAt: Date.now(),
        createdDate: getDateKey(),
      };

      const listTodos = todos[destinationWorkspaceId] ?? [];
      const updatedTodos = {
        ...todos,
        [destinationWorkspaceId]: [newTodo, ...listTodos],
      };
      setTodos(updatedTodos);

      const wsName = lists.find((l) => l.id === destinationWorkspaceId)?.name || "My Pebbles";
      showToast(`✓ Task added to ${wsName}`);

      await persistState(lists, selectedList, updatedTodos);
      emitStateChange("tasks_changed", "tasks_screen");
      pluginManager.dispatchTaskCreated(newTodo);

      const newSuggestion = await logTaskCreation(parsed.title);
      if (newSuggestion) {
        await loadSuggestions();
      }
    } else {
      const hour = parsed.time ? Number(parsed.time.split(":")[0]) : undefined;
      const minute = parsed.time ? Number(parsed.time.split(":")[1]) : undefined;
      let notificationIds: string[] = [];

      let reminderDays: number[] | undefined = undefined;
      if (parsed.recurrence) {
        if (parsed.recurrence.type === "weekdays") {
          reminderDays = [1, 2, 3, 4, 5];
        } else if (parsed.recurrence.type === "weekly") {
          reminderDays = parsed.recurrence.days;
        }
      }

      const generatedHabitId = `habit-${Date.now()}`;
      if (hour !== undefined && minute !== undefined) {
        try {
          const scheduled = await scheduleReminderBatch({
            kind: "habit",
            itemId: generatedHabitId,
            title: parsed.title,
            dailyTime: { hour, minute },
            dailyDays: reminderDays,
            recurrence: parsed.recurrence,
            escalationMinutes: [120, 240],
            channelId: Platform.OS === "android" ? "daily-habits" : undefined,
            context: {
              title: parsed.title,
              remainingCount: 1,
              totalCount: 1,
              streak: 0,
              bestStreak: 0,
            },
          });
          notificationIds = scheduled.ids;
        } catch (e) {
          console.error("Failed to schedule NLP habit reminder:", e);
        }
      }

      const newHabit: Habit = {
        id: generatedHabitId,
        title: parsed.title,
        streak: 0,
        bestStreak: 0,
        completedToday: false,
        priority: parsed.priority || "medium",
        reminderDays,
        reminderHour: hour,
        reminderMinute: minute,
        recurrence: parsed.recurrence,
        notificationIds,
        category: parsed.category || "health",
        folderId: targetWorkspaceId || "default",
        createdAt: Date.now(),
        createdDate: getDateKey(),
        startDate: getDateKey(),
      };

      console.log("🔍 [handleSaveParsedItem] Creating NLP habit:", JSON.stringify(newHabit, null, 2));
      const nextHabits = [newHabit, ...habits];
      setHabits(nextHabits);
      await persistHabits(nextHabits);

      const catLabel = TASK_CATEGORY_META.find((c) => c.key === (newHabit.category || "health"))?.label || "Health";
      showToast(`✓ Habit added to ${catLabel}`);

      emitStateChange("habits_changed", "tasks_screen");
      pluginManager.dispatchHabitCompleted(newHabit);
    }

    void syncWidgetData().catch(() => {});
    void recordDailyHistorySnapshot();
  };

  const handleUpdateExistingFromNLP = async (
    parsed: ParsedProductivityItem,
    existingId: string,
    type: "task" | "habit"
  ) => {
    if (type === "habit") {
      const existing = habits.find((h) => h.id === existingId);
      if (!existing) return;
      const updatedHabit = {
        ...existing,
        title: parsed.title,
        category: parsed.category || existing.category,
        reminderHour: parsed.time ? Number(parsed.time.split(":")[0]) : existing.reminderHour,
        reminderMinute: parsed.time ? Number(parsed.time.split(":")[1]) : existing.reminderMinute,
        recurrence: parsed.recurrence || existing.recurrence,
        priority: parsed.priority || existing.priority,
      };

      let reminderDays: number[] | undefined = undefined;
      if (updatedHabit.recurrence) {
        if (updatedHabit.recurrence.type === "weekdays") {
          reminderDays = [1, 2, 3, 4, 5];
        } else if (updatedHabit.recurrence.type === "weekly") {
          reminderDays = updatedHabit.recurrence.days;
        }
      }
      updatedHabit.reminderDays = reminderDays;

      await handleSaveEditedHabit(updatedHabit);
      showToast(`✓ Habit updated`);
    } else {
      let existingTask: Todo | undefined;
      for (const listId in todos) {
        const found = todos[listId].find((t) => t.id === existingId);
        if (found) {
          existingTask = found;
          break;
        }
      }
      if (!existingTask) return;

      const [hours, minutes] = parsed.time ? parsed.time.split(":").map(Number) : [undefined, undefined];

      const updatedTask = {
        ...existingTask,
        title: parsed.title,
        category: parsed.category || existingTask.category,
        scheduledDate: parsed.date || existingTask.scheduledDate,
        reminderHour: hours !== undefined ? hours : existingTask.reminderHour,
        reminderMinute: minutes !== undefined ? minutes : existingTask.reminderMinute,
        recurrence: parsed.recurrence || existingTask.recurrence,
        priority: parsed.priority || existingTask.priority,
      };

      onSaveEditedTask(updatedTask);
      showToast(`✓ Task updated`);
    }
  };

  const handleSaveEditedHabit = async (updated: Habit) => {
    let notificationIds = updated.notificationIds || [];

    const original = habits.find((h) => h.id === updated.id);
    const reminderChanged =
      updated.reminderHour !== original?.reminderHour ||
      updated.reminderMinute !== original?.reminderMinute ||
      JSON.stringify(updated.reminderDays || []) !== JSON.stringify(original?.reminderDays || []) ||
      JSON.stringify(updated.recurrence) !== JSON.stringify(original?.recurrence);

    if (reminderChanged) {
      await cancelReminderIds(original?.notificationIds);
      notificationIds = [];

      if (updated.reminderHour !== undefined && updated.reminderMinute !== undefined) {
        let reminderDays: number[] | undefined = undefined;
        if (updated.recurrence) {
          if (updated.recurrence.type === "weekdays") {
            reminderDays = [1, 2, 3, 4, 5];
          } else if (updated.recurrence.type === "weekly") {
            reminderDays = updated.recurrence.days;
          }
        }

        try {
          const scheduled = await scheduleReminderBatch({
            kind: "habit",
            itemId: updated.id,
            title: updated.title,
            dailyTime: { hour: updated.reminderHour, minute: updated.reminderMinute },
            dailyDays: reminderDays,
            recurrence: updated.recurrence || undefined,
            escalationMinutes: [120, 240],
            channelId: Platform.OS === "android" ? "daily-habits" : undefined,
            context: {
              title: updated.title,
              remainingCount: 1,
              totalCount: 1,
              streak: updated.streak,
              bestStreak: updated.bestStreak,
            },
          });
          notificationIds = scheduled.ids;
        } catch (e) {
          console.error("Failed to reschedule habit reminder:", e);
        }
      }
    }

    const finalHabit = {
      ...updated,
      notificationIds,
    };

    const nextHabits = habits.map((h) => (h.id === finalHabit.id ? finalHabit : h));
    setHabits(nextHabits);
    await persistHabits(nextHabits);

    emitStateChange("habits_changed");
  };

  const handleDeleteEditedHabit = async (id: string) => {
    await deleteHabit(id);
  };

  const handleCreateWorkspaceFromNLP = (name: string): string => {
    const newId = `list-${Date.now()}`;
    const newWorkspace = {
      id: newId,
      name,
      emoji: "📂",
      icon: "grid",
      iconType: "emoji" as const,
      color: "#6366F1",
      createdAt: Date.now(),
    };
    const updatedLists = [...lists, newWorkspace];
    const updatedTodos = { ...todos, [newId]: [] };

    setLists(updatedLists);
    setTodos(updatedTodos);
    setSelectedList(newId);
    setOpenedFolderId(newId);
    persistState(updatedLists, newId, updatedTodos);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    return newId;
  };

  useFocusEffect(
    useCallback(() => {
      void loadState();
      void loadHabits();
      void loadSuggestions();
    }, [loadState, loadHabits, loadSuggestions])
  );

  // Sync notification permissions and channels
  useEffect(() => {
    (async () => {
      try {
        const Notifications = await import("expo-notifications");
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
      } catch {}
    })();
  }, []);

  // Streak Celebration effect
  useEffect(() => {
    const today = getDateKey();
    if (habits.length > 0 && completedHabitCount === habits.length && celebrateDateRef.current !== today) {
      celebrateDateRef.current = today;
      setShowCelebrate(true);
      const timer = setTimeout(() => setShowCelebrate(false), 2200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [completedHabitCount, habits.length]);

  // AppState reload habit streak check
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") {
        return;
      }

      setHabits((current) => {
        const normalized = normalizeHabitsForToday(current);
        if (JSON.stringify(normalized) !== JSON.stringify(current)) {
          void persistHabits(normalized).then(() => {
            emitStateChange("habits_changed");
          });
          return normalized;
        }
        return current;
      });
    });

    return () => {
      subscription.remove();
    };
  }, [persistHabits]);

  useEffect(() => {
    setSearchQuery("");
    setIsBulkSelectActive(false);
    setSelectedItemIds(new Set());
  }, [openedFolderId, activeSegment]);

  // Listen for global task and habit updates to sync state immediately
  useEffect(() => {
    const unsubscribeTasks = addStateListener("tasks_changed", (emitterId) => {
      if (emitterId !== "tasks_screen") {
        void loadState();
      }
    });

    const unsubscribeHabits = addStateListener("habits_changed", (emitterId) => {
      if (emitterId !== "tasks_screen") {
        void loadHabits();
      }
    });

    return () => {
      unsubscribeTasks();
      unsubscribeHabits();
    };
  }, [loadState, loadHabits]);

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

  // Task Actions
  const persistState = async (listsToSave: TaskList[], selected: string, todosToSave: Record<string, Todo[]>) => {
    try {
      const payload = JSON.stringify({
        lists: listsToSave,
        selectedList: selected,
        todos: todosToSave,
      });
      await AsyncStorage.setItem(STORAGE_KEY, payload);
      void recordDailyHistorySnapshot();
    } catch {}
  };

  const selectList = (listId: string) => {
    setSelectedList(listId);
    persistState(lists, listId, todos);
  };

  const cycleCategory = () => {
    const index = TASK_CATEGORY_META.findIndex((c) => c.key === selectedTodoCategory);
    const nextIndex = (index + 1) % TASK_CATEGORY_META.length;
    setSelectedTodoCategory(TASK_CATEGORY_META[nextIndex].key);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const cyclePriority = () => {
    const priorities: ("high" | "medium" | "low")[] = ["high", "medium", "low"];
    const index = priorities.indexOf(selectedTodoPriority);
    const nextIndex = (index + 1) % priorities.length;
    setSelectedTodoPriority(priorities[nextIndex]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const cycleDate = () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    const dates = [getDateKey(today), getDateKey(tomorrow), getDateKey(nextWeek), "inbox"];
    const index = dates.indexOf(selectedTodoDate);
    const nextIndex = (index + 1) % dates.length;
    setSelectedTodoDate(dates[nextIndex]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const getSelectedDateLabel = () => {
    if (selectedTodoDate === "inbox") return "Inbox";
    const today = getDateKey();
    if (selectedTodoDate === today) return "Today";
    const tomorrow = getDateKey(new Date(Date.now() + DAY_MS));
    if (selectedTodoDate === tomorrow) return "Tomorrow";
    const nextWeek = getDateKey(new Date(Date.now() + 7 * DAY_MS));
    if (selectedTodoDate === nextWeek) return "Next Week";
    return selectedTodoDate;
  };

  const onSaveNewTask = async (newTask: Todo) => {
    if (!newTask.title || newTask.title.trim() === "") return;

    const targetFolderId = newTask.folderId || selectedList || "default";
    const taskWithCreatedAt = {
      ...newTask,
      createdAt: newTask.createdAt || Date.now(),
    };

    const listTodos = todos[targetFolderId] ?? [];
    const updatedTodos = {
      ...todos,
      [targetFolderId]: [{ ...taskWithCreatedAt, folderId: targetFolderId }, ...listTodos],
    };
    setTodos(updatedTodos);

    const wsName = lists.find((l) => l.id === targetFolderId)?.name || "My Pebbles";
    showToast(`✓ Task added to ${wsName}`);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    await persistState(lists, selectedList, updatedTodos);
    void syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed", "tasks_screen");

    pluginManager.dispatchTaskCreated(taskWithCreatedAt);
    setAddingTask(null);
  };

  const updateTodoTitle = async (id: string, newTitle: string) => {
    const listTodos = todos[selectedList] ?? [];
    const updatedList = listTodos.map((todo) => (todo.id === id ? { ...todo, title: newTitle } : todo));
    const updated = { ...todos, [selectedList]: updatedList };
    setTodos(updated);
    await persistState(lists, selectedList, updated);
    void syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed", "tasks_screen");
  };

  const moveTodoToList = async (todoId: string, fromListId: string, toListId: string) => {
    const sourceTodos = todos[fromListId] ?? [];
    const targetTodos = todos[toListId] ?? [];
    const todoToMove = sourceTodos.find((t) => t.id === todoId);
    if (!todoToMove) return;

    const updated = {
      ...todos,
      [fromListId]: sourceTodos.filter((t) => t.id !== todoId),
      [toListId]: [todoToMove, ...targetTodos],
    };

    setTodos(updated);
    await persistState(lists, selectedList, updated);
    setExpandedTodoIds((prev) => {
      const next = { ...prev };
      delete next[todoId];
      return next;
    });
    void syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed", "tasks_screen");
  };

  const toggleTodo = async (id: string) => {
    const listTodos = todos[selectedList] ?? [];
    const todo = listTodos.find((t) => t.id === id);
    if (!todo) return;
    const nextCompleted = !todo.completed;
    const { xpAwarded } = await handleTaskXpChange(todo, nextCompleted);
    const updatedTodo = { ...todo, completed: nextCompleted, xpAwarded };

    if (nextCompleted) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }

    const currentListTodos = todos[selectedList] ?? [];
    const updatedList = currentListTodos.map((t) => (t.id === id ? updatedTodo : t));
    const updatedTodos = { ...todos, [selectedList]: updatedList };
    setTodos(updatedTodos);

    if (nextCompleted) {
      pluginManager.dispatchTaskCompleted(updatedTodo);
      await earnPebble("task");
    } else {
      pluginManager.dispatchTaskUncompleted(updatedTodo);
      await undoLastPebble("task");
    }
    await persistState(lists, selectedList, updatedTodos);
    await syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed", "tasks_screen");
  };

  const deleteTodo = async (id: string) => {
    const listTodos = todos[selectedList] ?? [];
    const toDelete = listTodos.find((t) => t.id === id);
    if (!toDelete) return;

    const originalWorkspace = lists.find((l) => l.id === selectedList)?.name || "Default";

    await cancelReminderIds(toDelete.notificationIds ?? (toDelete.alarmId ? [toDelete.alarmId] : []));

    await addToRecycleBin("task", toDelete, originalWorkspace);

    const currentListTodos = todos[selectedList] ?? [];
    const updatedTodos = {
      ...todos,
      [selectedList]: currentListTodos.filter((todo) => todo.id !== id),
    };
    setTodos(updatedTodos);

    pluginManager.dispatchTaskDeleted(id);
    await persistState(lists, selectedList, updatedTodos);
    void syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed", "tasks_screen");

    showUndo({
      message: `Deleted "${toDelete.title}"`,
      onUndo: async () => {
        const binItems = await getRecycleBinItems();
        await saveRecycleBinItems(binItems.filter((item) => item.id !== id));

        const rescheduled = await rescheduleTodoReminders(toDelete);

        const raw = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
        let currentTodos: Record<string, Todo[]> = {};
        let currentLists = lists;
        if (raw) {
          const parsed = JSON.parse(raw);
          currentTodos = parsed.todos || {};
          currentLists = parsed.lists || lists;
        }
        const listTodos = currentTodos[selectedList] ?? [];
        if (!listTodos.some((t) => t.id === id)) {
          const updated = {
            ...currentTodos,
            [selectedList]: [...listTodos, rescheduled],
          };
          await persistState(currentLists, selectedList, updated);
          setTodos(updated);
        }

        void syncWidgetData().catch(() => {});
        emitStateChange("tasks_changed", "tasks_screen");
      },
    });
  };

  const updateTodoCategory = async (todoId: string, newCategory: TaskCategory) => {
    const listTodos = todos[selectedList] ?? [];
    const updatedList = listTodos.map((todo) => (todo.id === todoId ? { ...todo, category: newCategory } : todo));
    const updated = { ...todos, [selectedList]: updatedList };
    setTodos(updated);
    await persistState(lists, selectedList, updated);
    void syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed", "tasks_screen");
  };

  const toggleExpand = (todoId: string) => {
    setExpandedTodoIds((prev) => ({ ...prev, [todoId]: !prev[todoId] }));
  };

  const clearCompleted = async () => {
    const listTodos = todos[selectedList] ?? [];
    for (const t of listTodos) {
      if (t.completed) {
        await cancelReminderIds(t.notificationIds ?? (t.alarmId ? [t.alarmId] : []));
      }
    }
    const updated = {
      ...todos,
      [selectedList]: listTodos.filter((todo) => !todo.completed),
    };
    setTodos(updated);
    await persistState(lists, selectedList, updated);
    void syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed", "tasks_screen");
  };

  const scheduleAlarm = async (todoId: string, minutesFromNow: number) => {
    const todo = (todos[selectedList] ?? []).find((t) => t.id === todoId);
    if (!todo) return;

    await cancelReminderIds(todo.notificationIds ?? (todo.alarmId ? [todo.alarmId] : []));

    const triggerTime = Date.now() + minutesFromNow * 60 * 1000;
    const currentRemainingCount = currentTodos.filter((item) => !item.completed).length;

    const scheduled = await scheduleReminderBatch({
      kind: "todo",
      itemId: todoId,
      title: todo.title,
      category: todo.category,
      oneTimeAt: new Date(triggerTime),
      escalationMinutes: [120, 240],
      channelId: Platform.OS === "android" ? "todo-reminders" : undefined,
      context: {
        title: todo.title,
        remainingCount: currentRemainingCount,
        totalCount: currentTodos.length,
      },
    });

    const listTodos = todos[selectedList] ?? [];
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
        : item
    );
    const updated = { ...todos, [selectedList]: updatedList };
    setTodos(updated);
    await persistState(lists, selectedList, updated);
    void syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed", "tasks_screen");
  };

  const scheduleAlarmWithDays = async (todoId: string, hour: number, minute: number, days?: number[]) => {
    const todo = (todos[selectedList] ?? []).find((t) => t.id === todoId);
    if (!todo) return;

    await cancelReminderIds(todo.notificationIds ?? (todo.alarmId ? [todo.alarmId] : []));

    const scheduled = await scheduleReminderBatch({
      kind: "todo",
      itemId: todoId,
      title: todo.title,
      category: todo.category,
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

    const listTodos = todos[selectedList] ?? [];
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
        : item
    );
    const updated = { ...todos, [selectedList]: updatedList };
    setTodos(updated);
    await persistState(lists, selectedList, updated);
    void syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed", "tasks_screen");

    setAlarmMenu(null);
  };

  const cancelAlarm = async (todoId: string) => {
    const todo = (todos[selectedList] ?? []).find((t) => t.id === todoId);
    await cancelReminderIds(todo?.notificationIds ?? (todo?.alarmId ? [todo.alarmId] : []));
    const listTodos = todos[selectedList] ?? [];
    const updatedList = listTodos.map((t) =>
      t.id === todoId
        ? {
            ...t,
            alarmId: undefined,
            alarmTime: undefined,
            notificationIds: [],
            escalationMinutes: undefined,
          }
        : t
    );
    const updated = { ...todos, [selectedList]: updatedList };
    setTodos(updated);
    await persistState(lists, selectedList, updated);
    void syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed", "tasks_screen");
  };

  const formatAlarm = (ms?: number) => {
    if (!ms) return null;
    const d = new Date(ms);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Habits Business Logic
  const addHabit = async () => {
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
      category: selectedTodoCategory || "health",
      createdAt: Date.now(),
      createdDate: getDateKey(),
      startDate: getDateKey(),
    };

    const nextHabits = [next, ...habits];
    setHabits(nextHabits);
    await persistHabits(nextHabits);
    void syncWidgetData().catch(() => {});
    emitStateChange("habits_changed", "tasks_screen");

    const catLabel = TASK_CATEGORY_META.find((c) => c.key === (next.category || "health"))?.label || "Health";
    showToast(`✓ Habit added to ${catLabel}`);
    setHabitTitle("");
    setSelectedHabitPriority("medium");
  };

  const deleteHabit = async (id: string) => {
    const target = habits.find((habit) => habit.id === id);
    if (!target) return;

    const originalWorkspace = lists.find((l) => l.id === (target.folderId || "default"))?.name || "Default";

    await cancelReminderIds(target.notificationIds ?? []);

    await addToRecycleBin("habit", target, originalWorkspace);

    const updated = habits.filter((habit) => habit.id !== id);
    setHabits(updated);
    await persistHabits(updated);
    void syncWidgetData().catch(() => {});
    emitStateChange("habits_changed", "tasks_screen");

    showUndo({
      message: `Deleted "${target.title}"`,
      onUndo: async () => {
        const binItems = await getRecycleBinItems();
        await saveRecycleBinItems(binItems.filter((item) => item.id !== id));

        const rescheduled = await rescheduleHabitReminders(target);

        const raw = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
        let currentHabits: Habit[] = [];
        if (raw) {
          const parsed = JSON.parse(raw) as { dailyHabits?: Habit[] };
          currentHabits = parsed.dailyHabits ?? [];
        }
        if (!currentHabits.some((h) => h.id === id)) {
          const restored = [...currentHabits, rescheduled];
          await persistHabits(restored);
          setHabits(restored);
        }

        void syncWidgetData().catch(() => {});
        emitStateChange("habits_changed", "tasks_screen");
      },
    });
  };

  const toggleHabit = async (id: string) => {
    const today = getDateKey();
    const yesterday = getDateKey(new Date(Date.now() - DAY_MS));
    const habit = habits.find((h) => h.id === id);
    if (!habit) return;

    let updatedHabit;
    const isCompleting = !habit.completedToday;
    const { xpAwardedDate } = await handleHabitXpChange(habit, isCompleting, today);
    if (isCompleting) {
      let nextStreak = 1;
      if (habit.lastCompletedDate === today) {
        nextStreak = habit.streak || 1;
      } else if (habit.lastCompletedDate === yesterday) {
        nextStreak = habit.streak + 1;
      }
      updatedHabit = {
        ...habit,
        completedToday: true,
        lastCompletedDate: today,
        streak: nextStreak,
        bestStreak: Math.max(habit.bestStreak, nextStreak),
        xpAwardedDate,
      };

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      const rolledBackStreak = Math.max(0, habit.streak - 1);
      updatedHabit = {
        ...habit,
        completedToday: false,
        streak: rolledBackStreak,
        lastCompletedDate: rolledBackStreak > 0 ? yesterday : undefined,
        xpAwardedDate,
      };
    }

    const nextHabits = habits.map((h) => (h.id === id ? updatedHabit : h));
    setHabits(nextHabits);
    await persistHabits(nextHabits);

    if (isCompleting) {
      await earnPebble("habit");
    } else {
      await undoLastPebble("habit");
    }

    pluginManager.dispatchHabitCompleted(updatedHabit);
    void recordDailyHistorySnapshot();
    await syncWidgetData().catch(() => {});
    emitStateChange("habits_changed", "tasks_screen");
  };

  const recoverHabitStreak = async (id: string, method: "pebbles" | "focus"): Promise<boolean> => {
    const today = getDateKey();
    const yesterday = getDateKey(new Date(Date.now() - DAY_MS));
    const habit = habits.find((h) => h.id === id);
    if (!habit || !habit.previousStreak) return false;

    // Verify eligibility
    const isWithinRecoveryWindow = habit.streakBrokenDate && (dayDiff(habit.streakBrokenDate, today) <= 1);
    if (!isWithinRecoveryWindow) return false;

    if (method === "pebbles") {
      const { spendGems } = require("@/services/pebbleService");
      const success = await spendGems(1);
      if (!success) return false;
    }

    const restoredStreak = habit.previousStreak;
    const updatedHabit = {
      ...habit,
      streak: restoredStreak,
      bestStreak: Math.max(habit.bestStreak, restoredStreak),
      lastCompletedDate: yesterday,
      previousStreak: undefined,
      streakBrokenDate: undefined,
    };

    const nextHabits = habits.map((h) => (h.id === id ? updatedHabit : h));
    setHabits(nextHabits);
    await persistHabits(nextHabits);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    emitStateChange("habits_changed", "tasks_screen");
    emitStateChange("pebbles_changed", "tasks_screen");
    return true;
  };

  const onSaveEditedTask = async (updatedTask: Todo) => {
    const original = Object.values(todos).flat().find((t) => t.id === updatedTask.id);
    if (original?.notificationIds) {
      await cancelReminderIds(original.notificationIds);
    }

    const rescheduledTask = await rescheduleTodoReminders(updatedTask);

    const allLists = { ...todos };
    for (const listId in allLists) {
      allLists[listId] = allLists[listId].map((t) => (t.id === rescheduledTask.id ? rescheduledTask : t));
    }

    let foundListId = selectedList;
    for (const listId in allLists) {
      if (allLists[listId].find((t) => t.id === rescheduledTask.id)) {
        foundListId = listId;
        break;
      }
    }
    if (rescheduledTask.folderId && rescheduledTask.folderId !== foundListId) {
      allLists[foundListId] = allLists[foundListId].filter((t) => t.id !== rescheduledTask.id);
      if (!allLists[rescheduledTask.folderId]) allLists[rescheduledTask.folderId] = [];
      allLists[rescheduledTask.folderId].push(rescheduledTask);
    }

    setTodos(allLists);
    await persistState(lists, selectedList, allLists);
    emitStateChange("tasks_changed", "tasks_screen");
  };

  const handleBulkComplete = async () => {
    const isTask = activeSegment === "tasks";
    if (isTask) {
      const nextTodos = { ...todos };
      for (const listId in nextTodos) {
        nextTodos[listId] = nextTodos[listId].map((t) => {
          if (selectedItemIds.has(t.id)) {
            return { ...t, completed: true, lastUpdated: getDateKey() };
          }
          return t;
        });
      }
      setTodos(nextTodos);
      await persistState(lists, selectedList, nextTodos);
      emitStateChange("tasks_changed", "tasks_screen");
    } else {
      const today = getDateKey();
      const yesterday = getDateKey(new Date(Date.now() - DAY_MS));
      const nextHabits = habits.map((h) => {
        if (selectedItemIds.has(h.id)) {
          let nextStreak = 1;
          if (h.lastCompletedDate === today) {
            nextStreak = h.streak || 1;
          } else if (h.lastCompletedDate === yesterday) {
            nextStreak = h.streak + 1;
          }
          return {
            ...h,
            completedToday: true,
            lastCompletedDate: today,
            streak: nextStreak,
            bestStreak: Math.max(h.bestStreak || 0, nextStreak),
            lastUpdated: today,
          };
        }
        return h;
      });
      setHabits(nextHabits);
      await persistHabits(nextHabits);
      emitStateChange("habits_changed", "tasks_screen");
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setIsBulkSelectActive(false);
    setSelectedItemIds(new Set());
  };

  const handleBulkArchive = async () => {
    const isTask = activeSegment === "tasks";
    if (isTask) {
      const nextTodos = { ...todos };
      for (const listId in nextTodos) {
        nextTodos[listId] = nextTodos[listId].map((t) => {
          if (selectedItemIds.has(t.id)) {
            void cancelReminderIds(t.notificationIds || []);
            return { ...t, archived: true, notificationIds: [], lastUpdated: getDateKey() };
          }
          return t;
        });
      }
      setTodos(nextTodos);
      await persistState(lists, selectedList, nextTodos);
      emitStateChange("tasks_changed", "tasks_screen");
    } else {
      const nextHabits = habits.map((h) => {
        if (selectedItemIds.has(h.id)) {
          void cancelReminderIds(h.notificationIds || []);
          return { ...h, archived: true, notificationIds: [], lastUpdated: getDateKey() };
        }
        return h;
      });
      setHabits(nextHabits);
      await persistHabits(nextHabits);
      emitStateChange("habits_changed", "tasks_screen");
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setIsBulkSelectActive(false);
    setSelectedItemIds(new Set());
  };

  const handleBulkDelete = () => {
    const itemCount = selectedItemIds.size;
    Alert.alert(
      "Delete Selected",
      `Are you sure you want to delete the ${itemCount} selected item(s)? They will be moved to the Recycle Bin.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const isTask = activeSegment === "tasks";
            const originalWorkspaceName = lists.find((l) => l.id === selectedList)?.name || "Default";

            if (isTask) {
              const listTodos = todos[selectedList] ?? [];
              const todosToDelete = listTodos.filter((t) => selectedItemIds.has(t.id));

              for (const todo of todosToDelete) {
                await cancelReminderIds(todo.notificationIds || []);
                const folderName = lists.find((l) => l.id === (todo.folderId || selectedList))?.name || originalWorkspaceName;
                await addToRecycleBin("task", todo, folderName);
              }

              const nextTodos = { ...todos };
              for (const listId in nextTodos) {
                nextTodos[listId] = nextTodos[listId].filter((t) => !selectedItemIds.has(t.id));
              }
              setTodos(nextTodos);
              await persistState(lists, selectedList, nextTodos);
              emitStateChange("tasks_changed", "tasks_screen");

              showUndo({
                message: `Deleted ${itemCount} task(s)`,
                onUndo: async () => {
                  const binItems = await getRecycleBinItems();
                  await saveRecycleBinItems(binItems.filter((item) => !selectedItemIds.has(item.id)));

                  const rescheduledTodos = await Promise.all(
                    todosToDelete.map((t) => rescheduleTodoReminders(t))
                  );

                  const raw = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
                  let currentTodos: Record<string, Todo[]> = {};
                  let currentLists = lists;
                  if (raw) {
                    const parsed = JSON.parse(raw);
                    currentTodos = parsed.todos || {};
                    currentLists = parsed.lists || lists;
                  }
                  rescheduledTodos.forEach((todo) => {
                    const listId = todo.folderId || selectedList;
                    if (!currentTodos[listId]) currentTodos[listId] = [];
                    if (!currentTodos[listId].some((t) => t.id === todo.id)) {
                      currentTodos[listId] = [...currentTodos[listId], todo];
                    }
                  });
                  await persistState(currentLists, selectedList, currentTodos);
                  setTodos(currentTodos);
                  emitStateChange("tasks_changed", "tasks_screen");
                },
              });
            } else {
              const habitsToDelete = habits.filter((h) => selectedItemIds.has(h.id));

              for (const habit of habitsToDelete) {
                await cancelReminderIds(habit.notificationIds || []);
                const folderName = lists.find((l) => l.id === (habit.folderId || "default"))?.name || "Default";
                await addToRecycleBin("habit", habit, folderName);
              }

              const nextHabits = habits.filter((h) => !selectedItemIds.has(h.id));
              setHabits(nextHabits);
              await persistHabits(nextHabits);
              emitStateChange("habits_changed", "tasks_screen");

              showUndo({
                message: `Deleted ${itemCount} habit(s)`,
                onUndo: async () => {
                  const binItems = await getRecycleBinItems();
                  await saveRecycleBinItems(binItems.filter((item) => !selectedItemIds.has(item.id)));

                  const rescheduledHabits = await Promise.all(
                    habitsToDelete.map((h) => rescheduleHabitReminders(h))
                  );

                  const raw = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
                  let currentHabits: Habit[] = [];
                  if (raw) {
                    const parsed = JSON.parse(raw) as { dailyHabits?: Habit[] };
                    currentHabits = parsed.dailyHabits ?? [];
                  }
                  const filtered = currentHabits.filter((h) => !selectedItemIds.has(h.id));
                  const restored = [...filtered, ...rescheduledHabits];
                  await persistHabits(restored);
                  setHabits(restored);
                  emitStateChange("habits_changed", "tasks_screen");
                },
              });
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            setIsBulkSelectActive(false);
            setSelectedItemIds(new Set());
          },
        },
      ]
    );
  };

  const handleBulkMove = async (targetFolderId: string) => {
    setIsMoveModalVisible(false);
    const isTask = activeSegment === "tasks";
    if (isTask) {
      const nextTodos = { ...todos };
      const itemsToMove: Todo[] = [];
      for (const listId in nextTodos) {
        const itemsToKeep: Todo[] = [];
        nextTodos[listId].forEach((t) => {
          if (selectedItemIds.has(t.id)) {
            itemsToMove.push({ ...t, folderId: targetFolderId, lastUpdated: getDateKey() });
          } else {
            itemsToKeep.push(t);
          }
        });
        nextTodos[listId] = itemsToKeep;
      }
      if (!nextTodos[targetFolderId]) {
        nextTodos[targetFolderId] = [];
      }
      nextTodos[targetFolderId] = [...itemsToMove, ...nextTodos[targetFolderId]];
      setTodos(nextTodos);
      await persistState(lists, selectedList, nextTodos);
      emitStateChange("tasks_changed", "tasks_screen");
    } else {
      const nextHabits = habits.map((h) => {
        if (selectedItemIds.has(h.id)) {
          return { ...h, folderId: targetFolderId, lastUpdated: getDateKey() };
        }
        return h;
      });
      setHabits(nextHabits);
      await persistHabits(nextHabits);
      emitStateChange("habits_changed", "tasks_screen");
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setIsBulkSelectActive(false);
    setSelectedItemIds(new Set());
  };

  return {
    activeSegment,
    setActiveSegment,
    selectedDate,
    setSelectedDate,
    searchQuery,
    setSearchQuery,
    isBulkSelectActive,
    setIsBulkSelectActive,
    selectedItemIds,
    setSelectedItemIds,
    isMoveModalVisible,
    setIsMoveModalVisible,
    openedFolderId,
    setOpenedFolderId,
    folderModalVisible,
    setFolderModalVisible,
    editingFolderId,
    setEditingFolderId,
    highlightedTodoId,
    setHighlightedTodoId,
    lists,
    setLists,
    selectedList,
    setSelectedList,
    todos,
    setTodos,
    title,
    setTitle,
    selectedTodoCategory,
    setSelectedTodoCategory,
    selectedTodoPriority,
    setSelectedTodoPriority,
    selectedListPriorityFilter,
    setSelectedListPriorityFilter,
    selectedCategoryFilter,
    setSelectedCategoryFilter,
    editingTask,
    setEditingTask,
    editingHabit,
    setEditingHabit,
    expandedTodoIds,
    setExpandedTodoIds,
    taskPositions,
    setTaskPositions,
    habits,
    setHabits,
    habitTitle,
    setHabitTitle,
    selectedHabitPriority,
    setSelectedHabitPriority,
    selectedListHabitPriorityFilter,
    setSelectedListHabitPriorityFilter,
    showCelebrate,
    setShowCelebrate,
    highlightedHabitId,
    setHighlightedHabitId,
    alarmMenu,
    setAlarmMenu,
    listsExpanded,
    setListsExpanded,
    addingTask,
    setAddingTask,
    selectedTodoDate,
    setSelectedTodoDate,
    isAddingHabit,
    setIsAddingHabit,
    statsExpanded,
    setStatsExpanded,
    profile,
    setProfile,
    hasUnreadNotifs,
    setHasUnreadNotifs,
    nlpVisible,
    setNlpVisible,
    activeSuggestions,
    setActiveSuggestions,

    // Refs
    scrollViewRef,
    addTaskInputRef,

    // Memoized values
    weekDaysStrip,
    formatSelectedDayName,
    filteredTodos,
    overdueTodos,
    todayTodos,
    upcomingTodos,
    inboxTodos,
    remainingCount,
    completedCount,
    unfinishedHabitCount,
    displayedHabits,
    completedHabitCount,
    habitCompletionPct,
    longestStreak,

    // Callbacks & Handlers
    loadState,
    loadHabits,
    loadSuggestions,
    handleSaveParsedItem,
    handleUpdateExistingFromNLP,
    handleSaveEditedHabit,
    handleDeleteEditedHabit,
    handleCreateWorkspaceFromNLP,
    persistState,
    persistHabits,
    selectList,
    cycleCategory,
    cyclePriority,
    cycleDate,
    getSelectedDateLabel,
    onSaveNewTask,
    updateTodoTitle,
    moveTodoToList,
    toggleTodo,
    deleteTodo,
    updateTodoCategory,
    toggleExpand,
    clearCompleted,
    scheduleAlarm,
    scheduleAlarmWithDays,
    onSaveEditedTask,
    cancelAlarm,
    formatAlarm,
    addHabit,
    deleteHabit,
    toggleHabit,
    recoverHabitStreak,
    handleBulkComplete,
    handleBulkArchive,
    handleBulkDelete,
    handleBulkMove,
  };
}
