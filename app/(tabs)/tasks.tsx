import { AppText as Text, AppTextInput as TextInput } from "@/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    AppState,
    AppStateStatus,
    Dimensions,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    TextInput as RNTextInput,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

import { AppCard } from "@/components/AppCard";
import {
    HabitsEmptyGraphic
} from "@/components/AppGraphics";
import { HabitStreakCard } from "@/components/dashboard/HabitStreakCard";
import NLPCapture from "@/components/NLPCapture";
import { ProgressBar } from "@/components/ProgressBar";
import { SwipeableCard } from "@/components/SwipeableCard";
import { TaskEditorSheet } from "@/components/TaskEditorSheet";
import { TimeSelectorDial } from "@/components/TimeSelectorDial";
import { TodoItem } from "@/components/TodoItem";
import { AppHeader } from "@/components/ui/AppHeader";
import { SegmentedSwitcher } from "@/components/ui/SegmentedSwitcher";
import { styles } from "@/constants/taskStyles";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { pluginManager } from "@/plugin";
import { type ParsedProductivityItem } from "@/services/nlpParser";
import { getNotificationLogs } from "@/services/notificationsLog";
import { recordDailyHistorySnapshot } from "@/services/productivityHistory";
import { cancelReminderIds, scheduleReminderBatch } from "@/services/reminders";
import {
    addXp,
    getProfile,
    type UserProfile,
} from "@/services/settingsService";
import { addStateListener, emitStateChange } from "@/services/stateEvents";
import {
    DAILY_STORAGE_KEY,
    DAY_MS,
    TODOS_STORAGE_KEY,
} from "@/services/storage";
import {
    getActiveSuggestions,
    logTaskCreation,
    resolveSuggestion,
    type SmartSuggestion,
} from "@/services/suggestions";
import {
    DEFAULT_TASK_CATEGORY,
    normalizeTaskCategory,
    TASK_CATEGORY_META,
    type TaskCategory
} from "@/services/taskCategories";
import { syncWidgetData } from "@/services/widgetData";
import * as Haptics from "expo-haptics";

import { WorkspaceModal } from "../../modules/workspaces/WorkspaceModal";
import { WorkspaceGrid } from "../../modules/workspaces/WorkspaceGrid";
import { AlarmModal } from "../../modules/reminders/AlarmModal";
import { TaskSections } from "../../modules/tasks/TaskSections";
import { HabitSection } from "../../modules/habits/HabitSection";
import { SuggestionBanner } from "../../modules/suggestions/SuggestionBanner";
import { ProgressSection } from "../../modules/stats/ProgressSection";
import { type Todo, type Habit, type TaskList, type Subtask } from "../../modules/types";

async function loadNotifications() {
  return import("expo-notifications");
}

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
  setMinute: React.Dispatch<React.SetStateAction<number>>,
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
  const [activeSegment, setActiveSegment] = useState<"tasks" | "habits">(
    "tasks",
  );

  const [selectedDate, setSelectedDate] = useState<string>(getDateKey());

  const getTodoDateKey = (todo: Todo) => {
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

  // Tasks Screen State
  const [searchQuery, setSearchQuery] = useState("");
  const [openedFolderId, setOpenedFolderId] = useState<string | null>(null);
  const [folderModalVisible, setFolderModalVisible] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [highlightedTodoId, setHighlightedTodoId] = useState<string | null>(
    null,
  );
  const [lists, setLists] = useState<TaskList[]>([
    { id: "default", name: "My Pebbles" },
  ]);
  const [selectedList, setSelectedList] = useState<string>("default");
  const [todos, setTodos] = useState<Record<string, Todo[]>>({
    default: initialTodos,
  });
  const [title, setTitle] = useState("");
  const [selectedTodoCategory, setSelectedTodoCategory] =
    useState<TaskCategory>(DEFAULT_TASK_CATEGORY);
  const [selectedTodoPriority, setSelectedTodoPriority] = useState<
    "low" | "medium" | "high"
  >("medium");
  const [selectedListPriorityFilter, setSelectedListPriorityFilter] = useState<
    "all" | "high" | "medium" | "low"
  >("all");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<
    TaskCategory | "all"
  >("all");

  const [editingTask, setEditingTask] = useState<Todo | null>(null);

  const [expandedTodoIds, setExpandedTodoIds] = useState<
    Record<string, boolean>
  >({});

  const [taskPositions, setTaskPositions] = useState<Record<string, number>>(
    {},
  );

  // Habits Screen State
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitTitle, setHabitTitle] = useState("");
  const [selectedHabitPriority, setSelectedHabitPriority] = useState<
    "low" | "medium" | "high"
  >("medium");
  const [selectedListHabitPriorityFilter, setSelectedListHabitPriorityFilter] =
    useState<"all" | "high" | "medium" | "low">("all");
  const [showCelebrate, setShowCelebrate] = useState(false);
  const [highlightedHabitId, setHighlightedHabitId] = useState<string | null>(
    null,
  );
  const celebrateDateRef = useRef<string | null>(null);

  // Relocated Alarms State to resolve block scoping
  const [alarmMenu, setAlarmMenu] = useState<string | null>(null);

  const [listsExpanded, setListsExpanded] = useState(false);
  const [addingTask, setAddingTask] = useState<Todo | null>(null);
  const [selectedTodoDate, setSelectedTodoDate] =
    useState<string>(getDateKey());
  const [isAddingHabit, setIsAddingHabit] = useState(false);
  const [statsExpanded, setStatsExpanded] = useState(false);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [hasUnreadNotifs, setHasUnreadNotifs] = useState<boolean>(false);

  // NLP Modal & Heuristic Suggestions States
  const [nlpVisible, setNlpVisible] = useState(false);
  const [activeSuggestions, setActiveSuggestions] = useState<SmartSuggestion[]>(
    [],
  );

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

  // 14-Day Scrollable Week Strip
  const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const weekDaysStrip = useMemo(() => {
    const list = [];
    const today = new Date();
    // Render 3 days before today up to 10 days after today
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

  // Task Memos
  // Task Memos
  const currentTodos = useMemo(
    () => todos[selectedList] ?? [],
    [todos, selectedList],
  );

  const filteredTodos = useMemo(() => {
    const raw = todos[selectedList] ?? [];
    if (searchQuery.trim() === "") return raw;
    return raw.filter((todo) => {
      const matchesTitle = todo.title
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesDesc =
        todo.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        false;
      const matchesTags =
        todo.tags?.some((tag) =>
          tag.toLowerCase().includes(searchQuery.toLowerCase()),
        ) || false;
      return matchesTitle || matchesDesc || matchesTags;
    });
  }, [todos, selectedList, searchQuery]);

  const isOverdue = (todo: Todo) => {
    if (todo.completed) return false;
    const todoDate = getTodoDateKey(todo);
    return todoDate < selectedDate;
  };

  const getPriorityWeight = (priority?: string) => {
    if (priority === "high") return 0;
    if (priority === "low") return 2;
    return 1;
  };

  const overdueTodos = useMemo(() => {
    let filtered = filteredTodos.filter(
      (todo) => todo.scheduledDate !== "inbox" && isOverdue(todo),
    );
    if (selectedCategoryFilter !== "all") {
      filtered = filtered.filter(
        (todo) => todo.category === selectedCategoryFilter,
      );
    }
    const matched =
      selectedListPriorityFilter === "all"
        ? filtered
        : filtered.filter(
            (todo) => todo.priority === selectedListPriorityFilter,
          );
    return [...matched].sort(
      (a, b) => getPriorityWeight(a.priority) - getPriorityWeight(b.priority),
    );
  }, [
    filteredTodos,
    selectedListPriorityFilter,
    selectedCategoryFilter,
    selectedDate,
  ]);

  const todayTodos = useMemo(() => {
    let filtered = filteredTodos.filter(
      (todo) =>
        todo.scheduledDate !== "inbox" &&
        !isOverdue(todo) &&
        getTodoDateKey(todo) === selectedDate,
    );
    if (selectedCategoryFilter !== "all") {
      filtered = filtered.filter(
        (todo) => todo.category === selectedCategoryFilter,
      );
    }
    const matched =
      selectedListPriorityFilter === "all"
        ? filtered
        : filtered.filter(
            (todo) => todo.priority === selectedListPriorityFilter,
          );
    return [...matched].sort(
      (a, b) => getPriorityWeight(a.priority) - getPriorityWeight(b.priority),
    );
  }, [
    filteredTodos,
    selectedListPriorityFilter,
    selectedCategoryFilter,
    selectedDate,
  ]);

  const upcomingTodos = useMemo(() => {
    let filtered = filteredTodos.filter(
      (todo) =>
        todo.scheduledDate !== "inbox" &&
        !isOverdue(todo) &&
        getTodoDateKey(todo) > selectedDate,
    );
    if (selectedCategoryFilter !== "all") {
      filtered = filtered.filter(
        (todo) => todo.category === selectedCategoryFilter,
      );
    }
    const matched =
      selectedListPriorityFilter === "all"
        ? filtered
        : filtered.filter(
            (todo) => todo.priority === selectedListPriorityFilter,
          );
    return [...matched].sort(
      (a, b) => getPriorityWeight(a.priority) - getPriorityWeight(b.priority),
    );
  }, [
    filteredTodos,
    selectedListPriorityFilter,
    selectedCategoryFilter,
    selectedDate,
  ]);

  const inboxTodos = useMemo(() => {
    let filtered = filteredTodos.filter(
      (todo) => todo.scheduledDate === "inbox",
    );
    if (selectedCategoryFilter !== "all") {
      filtered = filtered.filter(
        (todo) => todo.category === selectedCategoryFilter,
      );
    }
    const matched =
      selectedListPriorityFilter === "all"
        ? filtered
        : filtered.filter(
            (todo) => todo.priority === selectedListPriorityFilter,
          );
    return [...matched].sort(
      (a, b) => getPriorityWeight(a.priority) - getPriorityWeight(b.priority),
    );
  }, [filteredTodos, selectedListPriorityFilter, selectedCategoryFilter]);

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
    const dateParts = selectedDate.split("-").map(Number);
    const selDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    const dayOfWeek = selDate.getDay();

    const activeHabits = habits.filter((habit) => {
      return (
        !habit.reminderDays ||
        habit.reminderDays.length === 0 ||
        habit.reminderDays.includes(dayOfWeek)
      );
    });

    const filtered =
      selectedListHabitPriorityFilter === "all"
        ? activeHabits
        : activeHabits.filter(
            (habit) => habit.priority === selectedListHabitPriorityFilter,
          );

    const searchFiltered =
      searchQuery.trim() === ""
        ? filtered
        : filtered.filter((h) =>
            h.title.toLowerCase().includes(searchQuery.toLowerCase()),
          );

    return [...searchFiltered].sort(
      (a, b) => getPriorityWeight(a.priority) - getPriorityWeight(b.priority),
    );
  }, [habits, selectedListHabitPriorityFilter, selectedDate, searchQuery]);

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

  // Load States on Tab/Screen Focus
  const loadState = useCallback(async () => {
    console.log("=== LOAD STATE START ===");
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const defaultFolders = [
          { id: "default", name: "My Pebbles", emoji: "📋", color: "#6366F1" },
        ];
        const defaultTodos = {
          default: [],
        };
        setLists(defaultFolders as any);
        setTodos(defaultTodos as any);
        setSelectedList("default");
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            lists: defaultFolders,
            selectedList: "default",
            todos: defaultTodos,
          }),
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
            console.log(`\nWorkspace Key: "${listId}"`);
            const normalized = listTodos.map((todo) => {
              console.log(`Task Title: "${todo.title}"`);
              console.log(`Task folderId: "${todo.folderId || "undefined"}"`);
              if (todo.folderId && todo.folderId !== listId) {
                console.warn(
                  `[MISMATCH FLAGGED] ⚠️ Workspace Key "${listId}" does not match Task folderId "${todo.folderId}"! (Auto-Healed)`,
                );
              } else {
                console.log(
                  `[MATCH VERIFIED] ✓ Workspace Key and Task folderId are in sync.`,
                );
              }
              return {
                ...todo,
                category: normalizeTaskCategory(todo.category),
                folderId: listId, // Force/sanitize folderId to match dictionary key!
              };
            });
            return [listId, normalized];
          }),
        ) as Record<string, Todo[]>;
        setTodos(normalizedTodos);
      }

      try {
        const userProfile = await getProfile();
        setProfile(userProfile);
        const logs = await getNotificationLogs();
        const hasUnread = logs.some((l: any) => !l.read);
        setHasUnreadNotifs(hasUnread);
      } catch {
        // ignore
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
                  parsed.lists || [],
                  parsed.selectedList || "default",
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
    } finally {
      console.log("=== LOAD STATE END ===");
    }
  }, [openedFolderId]);

  const loadHabits = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
      if (!raw) {
        setHabits([]);
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

  const loadSuggestions = useCallback(async () => {
    try {
      const active = await getActiveSuggestions();
      setActiveSuggestions(active);
    } catch {
      // ignore
    }
  }, []);

  const handleSaveParsedItem = async (
    parsed: ParsedProductivityItem,
    targetWorkspaceId?: string,
  ) => {
    if (!parsed.title || parsed.title.trim() === "") return;

    if (parsed.type === "task") {
      let alarmTime: number | undefined;
      let notificationIds: string[] = [];
      let alarmId: string | undefined;

      if (parsed.time && parsed.date) {
        const [hours, minutes] = parsed.time.split(":").map(Number);
        const [year, monthVal, dayVal] = parsed.date
          .split("-")
          .map(Number);
        const dateObj = new Date(
          year,
          monthVal - 1,
          dayVal,
          hours,
          minutes,
          0,
          0,
        );

        // Subtract lead reminder offset in minutes if specified
        if (parsed.reminderOffsetMinutes) {
          dateObj.setMinutes(
            dateObj.getMinutes() - parsed.reminderOffsetMinutes,
          );
        }

        if (dateObj.getTime() > Date.now()) {
          alarmTime = dateObj.getTime();
          try {
            const scheduled = await scheduleReminderBatch({
              kind: "todo",
              itemId: String(Date.now()),
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

      const destinationWorkspaceId =
        targetWorkspaceId || openedFolderId || "default";

      const newTodo: Todo = {
        id: String(Date.now()),
        title: parsed.title,
        completed: false,
        category: parsed.category || DEFAULT_TASK_CATEGORY,
        priority: parsed.priority || "medium",
        scheduledDate: parsed.date || "inbox",
        alarmTime,
        alarmId,
        notificationIds,
        reminderHour: parsed.time
          ? Number(parsed.time.split(":")[0])
          : undefined,
        reminderMinute: parsed.time
          ? Number(parsed.time.split(":")[1])
          : undefined,
        folderId: destinationWorkspaceId,
      };

      const totalBefore = Object.values(todos).reduce(
        (sum, list) => sum + list.length,
        0,
        );
      console.log("TASK COUNT BEFORE", totalBefore);

      setTodos((current) => {
        const listTodos = current[destinationWorkspaceId] ?? [];
        const updated = {
          ...current,
          [destinationWorkspaceId]: [newTodo, ...listTodos],
        };
        persistState(lists, selectedList, updated);

        const totalAfter = Object.values(updated).reduce(
          (sum, list) => sum + list.length,
          0,
        );
        console.log("TASK COUNT AFTER", totalAfter);

        return updated;
      });

      emitStateChange("tasks_changed");

      await addXp(10).catch(() => {});
      pluginManager.dispatchTaskCreated(newTodo);

      const newSuggestion = await logTaskCreation(parsed.title);
      if (newSuggestion) {
        await loadSuggestions();
      }
    } else {
      const reminderDays =
        parsed.recurrence === "weekdays"
          ? [1, 2, 3, 4, 5]
          : parsed.recurrence === "weekends"
            ? [0, 6]
            : [];

      const hour = parsed.time ? Number(parsed.time.split(":")[0]) : undefined;
      const minute = parsed.time ? Number(parsed.time.split(":")[1]) : undefined;
      let notificationIds: string[] = [];

      if (hour !== undefined && minute !== undefined) {
        try {
          const scheduled = await scheduleReminderBatch({
            kind: "habit",
            itemId: `habit-${Date.now()}`,
            title: parsed.title,
            dailyTime: { hour, minute },
            dailyDays: reminderDays.length > 0 ? reminderDays : undefined,
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
        id: `habit-${Date.now()}`,
        title: parsed.title,
        streak: 0,
        bestStreak: 0,
        completedToday: false,
        priority: parsed.priority || "medium",
        reminderDays: reminderDays.length > 0 ? reminderDays : undefined,
        reminderHour: hour,
        reminderMinute: minute,
        notificationIds,
      };

      setHabits((current) => {
        const updated = [newHabit, ...current];
        persistHabits(updated);
        return updated;
      });

      emitStateChange("habits_changed");

      await addXp(5).catch(() => {});
      pluginManager.dispatchHabitCompleted(newHabit);
    }

    void syncWidgetData().catch(() => {});
    void recordDailyHistorySnapshot();
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
    };
    const updatedLists = [...lists, newWorkspace];
    const updatedTodos = { ...todos, [newId]: [] };

    setLists(updatedLists);
    setTodos(updatedTodos);
    persistState(updatedLists, selectedList, updatedTodos);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
    return newId;
  };

  useFocusEffect(
    useCallback(() => {
      void loadState();
      void loadHabits();
      void loadSuggestions();
    }, [loadState, loadHabits, loadSuggestions]),
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

  useEffect(() => {
    setSearchQuery("");
  }, [openedFolderId, activeSegment]);

  // Log after workspace navigation
  useEffect(() => {
    console.log(`\n=== WORKSPACE NAVIGATION ===`);
    console.log(`Workspace Key (selectedList): "${selectedList}"`);
    console.log(
      `Opened Folder ID (openedFolderId): "${openedFolderId || "null"}"`,
    );
    if (openedFolderId) {
      const folder = lists.find((l) => l.id === openedFolderId);
      console.log(`Workspace Name: "${folder?.name || "Unknown"}"`);
    } else {
      console.log(`Workspace Name: "Workspaces Grid (All)"`);
    }
    console.log(`============================\n`);
  }, [openedFolderId, selectedList, lists]);

  // Listen for global task and habit updates to sync state immediately
  useEffect(() => {
    const unsubscribeTasks = addStateListener("tasks_changed", () => {
      console.log(
        "🔔 [EVENT RECEIVED] tasks_changed inside Tasks screen. Syncing state...",
      );
      void loadState();
    });

    const unsubscribeHabits = addStateListener("habits_changed", () => {
      console.log(
        "🔔 [EVENT RECEIVED] habits_changed inside Tasks screen. Syncing state...",
      );
      void loadHabits();
    });

    return () => {
      unsubscribeTasks();
      unsubscribeHabits();
    };
  }, [loadState, loadHabits]);

  // Diagnostics: Run on every single render to print the currently visible task count
  useEffect(() => {
    const visibleTaskCount =
      overdueTodos.length +
      todayTodos.length +
      upcomingTodos.length +
      inboxTodos.length;
    console.log("VISIBLE TASK COUNT", visibleTaskCount);
  });

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



  const cycleCategory = () => {
    const index = TASK_CATEGORY_META.findIndex(
      (c) => c.key === selectedTodoCategory,
    );
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

    const dates = [
      getDateKey(today),
      getDateKey(tomorrow),
      getDateKey(nextWeek),
      "inbox",
    ];
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

  const onSaveNewTask = (newTask: Todo) => {
    if (!newTask.title || newTask.title.trim() === "") return;

    const targetFolderId = newTask.folderId || selectedList || "default";

    const totalBefore = Object.values(todos).reduce(
      (sum, list) => sum + list.length,
      0,
    );
    console.log("TASK COUNT BEFORE", totalBefore);

    setTodos((current) => {
      const listTodos = current[targetFolderId] ?? [];
      const updated = {
        ...current,
        [targetFolderId]: [
          { ...newTask, folderId: targetFolderId },
          ...listTodos,
        ],
      };
      persistState(lists, selectedList, updated);
      void syncWidgetData().catch(() => {});

      const totalAfter = Object.values(updated).reduce(
        (sum, list) => sum + list.length,
        0,
      );
      console.log("TASK COUNT AFTER", totalAfter);

      return updated;
    });

    emitStateChange("tasks_changed");

    pluginManager.dispatchTaskCreated(newTask);
    setAddingTask(null);
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

  const toggleTodo = async (id: string) => {
    const listTodos = todos[selectedList] ?? [];
    const todo = listTodos.find((t) => t.id === id);
    if (!todo) return;
    const nextCompleted = !todo.completed;
    const updatedTodo = { ...todo, completed: nextCompleted };

    if (nextCompleted) {
      await addXp(10).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    } else {
      await addXp(-10).catch(() => {});
    }

    setTodos((current) => {
      const currentListTodos = current[selectedList] ?? [];
      const updatedList = currentListTodos.map((t) =>
        t.id === id ? updatedTodo : t,
      );
      const updated = { ...current, [selectedList]: updatedList };
      persistState(lists, selectedList, updated);
      return updated;
    });

    if (nextCompleted) {
      pluginManager.dispatchTaskCompleted(updatedTodo);
    } else {
      pluginManager.dispatchTaskUncompleted(updatedTodo);
    }
    await syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed");
  };

  const deleteTodo = (id: string) => {
    const listTodos = todos[selectedList] ?? [];
    const toDelete = listTodos.find((t) => t.id === id);
    if (!toDelete) return;

    setTodos((current) => {
      const currentListTodos = current[selectedList] ?? [];
      void cancelReminderIds(
        toDelete?.notificationIds ??
          (toDelete?.alarmId ? [toDelete.alarmId] : []),
      );
      const updated = {
        ...current,
        [selectedList]: currentListTodos.filter((todo) => todo.id !== id),
      };
      persistState(lists, selectedList, updated);
      void syncWidgetData().catch(() => {});
      return updated;
    });

    pluginManager.dispatchTaskDeleted(id);
    emitStateChange("tasks_changed");
  };

  const updateTodoCategory = (todoId: string, newCategory: TaskCategory) => {
    setTodos((current) => {
      const listTodos = current[selectedList] ?? [];
      const updatedList = listTodos.map((todo) =>
        todo.id === todoId ? { ...todo, category: newCategory } : todo,
      );
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
      void syncWidgetData().catch(() => {});
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
      void syncWidgetData().catch(() => {});
      return updated;
    });

    setAlarmMenu(null);
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
      void syncWidgetData().catch(() => {});
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
      void syncWidgetData().catch(() => {});
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
      void syncWidgetData().catch(() => {});
      return updated;
    });
  };

  const toggleHabit = async (id: string) => {
    const today = getDateKey();
    const yesterday = getDateKey(new Date(Date.now() - DAY_MS));
    const habit = habits.find((h) => h.id === id);
    if (!habit) return;

    let updatedHabit;
    const isCompleting = !habit.completedToday;
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
      };

      // Award +15 XP
      await addXp(15).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    } else {
      const rolledBackStreak = Math.max(0, habit.streak - 1);
      updatedHabit = {
        ...habit,
        completedToday: false,
        streak: rolledBackStreak,
        lastCompletedDate: rolledBackStreak > 0 ? yesterday : undefined,
      };

      // Deduct 15 XP
      await addXp(-15).catch(() => {});
    }

    setHabits((current) => {
      const updated = current.map((h) => (h.id === id ? updatedHabit : h));
      persistHabits(updated);
      return updated;
    });

    pluginManager.dispatchHabitCompleted(updatedHabit);
    void recordDailyHistorySnapshot();
    await syncWidgetData().catch(() => {});
  };



  const onSaveEditedTask = (updatedTask: Todo) => {
    setTodos((current) => {
      const allLists = { ...current };
      for (const listId in allLists) {
        allLists[listId] = allLists[listId].map((t) =>
          t.id === updatedTask.id ? updatedTask : t,
        );
      }

      let foundListId = selectedList;
      for (const listId in allLists) {
        if (allLists[listId].find((t) => t.id === updatedTask.id)) {
          foundListId = listId;
          break;
        }
      }
      if (updatedTask.folderId && updatedTask.folderId !== foundListId) {
        allLists[foundListId] = allLists[foundListId].filter(
          (t) => t.id !== updatedTask.id,
        );
        if (!allLists[updatedTask.folderId])
          allLists[updatedTask.folderId] = [];
        allLists[updatedTask.folderId].push(updatedTask);
      }

      persistState(lists, selectedList, allLists);
      return allLists;
    });
    emitStateChange("tasks_changed");
  };





  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
      onStartShouldSetResponderCapture={(evt) => {
        console.log("TOUCH CAPTURE: screen touched at", {
          x: evt.nativeEvent.locationX,
          y: evt.nativeEvent.locationY,
        });
        return false; // Let events bubble down to children
      }}
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
            {openedFolderId ? (
              <View style={{ marginBottom: 12 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                    paddingHorizontal: 4,
                  }}
                >
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(
                        Haptics.ImpactFeedbackStyle.Light,
                      ).catch(() => {});
                      setOpenedFolderId(null);
                      setSelectedList("default"); // Force selectedList in sync!
                      setSearchQuery(""); // Clear search query when going back
                    }}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: colors.cardLight,
                    }}
                  >
                    <Feather name="arrow-left" size={18} color={colors.text} />
                  </Pressable>

                  {(() => {
                    const currentFolder = lists.find(
                      (l) => l.id === openedFolderId,
                    ) as any;
                    const folderColor = currentFolder?.color || colors.primary;
                    const hasIcon = currentFolder?.iconType === "icon";
                    return (
                      <View
                        style={{
                          flex: 1,
                          flexDirection: "row",
                          alignItems: "center",
                          marginLeft: 12,
                        }}
                      >
                        {hasIcon ? (
                          <Feather
                            name={currentFolder?.icon || "briefcase"}
                            size={20}
                            color={folderColor}
                            style={{ marginRight: 8 }}
                          />
                        ) : (
                          <Text style={{ fontSize: 20, marginRight: 6 }}>
                            {currentFolder?.emoji || "📁"}
                          </Text>
                        )}
                        <Text
                          style={{
                            fontSize: 18,
                            fontWeight: "800",
                            color: colors.text,
                          }}
                          numberOfLines={1}
                        >
                          {currentFolder?.name}
                        </Text>
                      </View>
                    );
                  })()}

                  <Pressable
                    onPress={() => {
                      const folder = lists.find(
                        (l) => l.id === openedFolderId,
                      ) as any;
                      if (folder) {
                        setEditingFolderId(folder.id);
                        setFolderModalVisible(true);
                      }
                    }}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: colors.cardLight,
                    }}
                  >
                    <Feather
                      name="sliders"
                      size={16}
                      color={colors.textMuted}
                    />
                  </Pressable>
                </View>

                {/* Tasks Search Bar inside Workspace */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: colors.card,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    height: 40,
                    marginTop: 4,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Feather
                    name="search"
                    size={16}
                    color={colors.textMuted}
                    style={{ marginRight: 8 }}
                  />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search tasks..."
                    placeholderTextColor={colors.textMuted}
                    style={{
                      flex: 1,
                      color: colors.text,
                      fontSize: 13,
                      height: "100%",
                      padding: 0,
                    }}
                  />
                  {searchQuery.length > 0 && (
                    <Pressable onPress={() => setSearchQuery("")} hitSlop={10}>
                      <Feather name="x" size={16} color={colors.textMuted} />
                    </Pressable>
                  )}
                </View>
              </View>
            ) : (
              <View style={{ marginBottom: 4 }}>
                <AppHeader
                  kicker="Planner"
                  title={activeSegment === "tasks" ? "Workspaces" : "Habits"}
                  subtitle={
                    activeSegment === "tasks"
                      ? `${lists.length} workspaces active`
                      : `${unfinishedHabitCount} habits remaining`
                  }
                  profile={profile}
                  hasUnreadNotifs={hasUnreadNotifs}
                  showProfile={false}
                  showNotifications={false}
                />

                {/* Segment Selector */}
                <View style={{ marginVertical: 4 }}>
                  <SegmentedSwitcher
                    options={[
                      { key: "tasks", label: "Workspaces" },
                      { key: "habits", label: "All Habits" },
                    ]}
                    activeKey={activeSegment}
                    onChange={(val) => {
                      setActiveSegment(val as any);
                      setSearchQuery(""); // Clear search when switching tabs
                    }}
                  />
                </View>

                {/* Heuristic Quick NLP Capture Pill */}
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(
                      Haptics.ImpactFeedbackStyle.Light,
                    ).catch(() => {});
                    setNlpVisible(true);
                  }}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor: colors.card,
                    borderWidth: 1.5,
                    borderColor: colors.border,
                    borderRadius: 14,
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    marginVertical: 4,
                  }}
                >
                  <Feather name="zap" size={14} color={colors.primary} />
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                  >
                    Pebble Capture
                  </Text>
                </TouchableOpacity>

                {/* Workspaces Search Bar */}
                {activeSegment === "tasks" && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: colors.card,
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      height: 40,
                      marginVertical: 4,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Feather
                      name="search"
                      size={16}
                      color={colors.textMuted}
                      style={{ marginRight: 8 }}
                    />
                    <TextInput
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      placeholder="Search workspaces..."
                      placeholderTextColor={colors.textMuted}
                      style={{
                        flex: 1,
                        color: colors.text,
                        fontSize: 13,
                        height: "100%",
                        padding: 0,
                      }}
                    />
                    {searchQuery.length > 0 && (
                      <Pressable
                        onPress={() => setSearchQuery("")}
                        hitSlop={10}
                      >
                        <Feather name="x" size={16} color={colors.textMuted} />
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* Active Content Screens */}
            {activeSegment === "tasks" ? (
              openedFolderId === null ? (
                <ScrollView
                  style={styles.flex}
                  contentContainerStyle={{ paddingBottom: 120 }}
                  showsVerticalScrollIndicator={false}
                >
                  <SuggestionBanner
                    activeSuggestions={activeSuggestions}
                    loadSuggestions={loadSuggestions}
                    setHabits={setHabits}
                    persistHabits={persistHabits}
                    setTodos={setTodos}
                    persistState={persistState}
                    lists={lists}
                    selectedList={selectedList}
                    openedFolderId={openedFolderId}
                    getDateKey={getDateKey}
                  />
                  <WorkspaceGrid
                    lists={lists}
                    todos={todos}
                    searchQuery={searchQuery}
                    onSelectWorkspace={(id) => {
                      setOpenedFolderId(id);
                      setSelectedList(id);
                    }}
                    onEditWorkspace={(id) => {
                      setEditingFolderId(id);
                      setFolderModalVisible(true);
                    }}
                    onCreateWorkspace={() => {
                      setEditingFolderId(null);
                      setFolderModalVisible(true);
                    }}
                  />
                </ScrollView>
              ) : (
                <ScrollView
                  ref={scrollViewRef}
                  style={styles.flex}
                  contentContainerStyle={{ gap: 16, paddingBottom: 120 }}
                  showsVerticalScrollIndicator={false}
                >
                  {/* Add task bar */}
                  <Pressable
                    onPress={() => {
                      console.log("STEP 1: Add button pressed");
                      console.log("STEP 2: Setting addingTask");
                      setAddingTask({
                        id: String(Date.now()),
                        title: "",
                        completed: false,
                        category: DEFAULT_TASK_CATEGORY,
                        priority: "medium",
                        scheduledDate: getDateKey(),
                        folderId: openedFolderId || "default",
                      });
                    }}
                  >
                    <AppCard style={styles.addTaskCard}>
                      <View
                        style={[
                          styles.addTaskInput,
                          { justifyContent: "center" },
                        ]}
                      >
                        <Text style={{ color: colors.textMuted }}>
                          {`Add a task to ${lists.find((l) => l.id === openedFolderId)?.name}`}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.addBtn,
                          { backgroundColor: colors.primary },
                        ]}
                      >
                        <Feather name="plus" size={20} color="#ffffff" />
                      </View>
                    </AppCard>
                  </Pressable>

                  {/* Tasks List */}
                  <TaskSections
                    overdueTodos={overdueTodos}
                    todayTodos={todayTodos}
                    upcomingTodos={upcomingTodos}
                    inboxTodos={inboxTodos}
                    lists={lists}
                    selectedList={selectedList}
                    selectedDate={selectedDate}
                    completedCount={completedCount}
                    onClearCompleted={clearCompleted}
                    onToggleTodo={toggleTodo}
                    onDeleteTodo={deleteTodo}
                    onEditTodo={(todo) => {
                      console.log("STEP 1: Edit button pressed");
                      console.log("STEP 2: Setting editingTask");
                      setEditingTask(todo);
                    }}
                    onSetAlarm={setAlarmMenu}
                    onTaskLayout={(todoId, y) => {
                      setTaskPositions((prev) => ({ ...prev, [todoId]: y }));
                    }}
                  />
                </ScrollView>
              )
            ) : (
              <ScrollView
                style={styles.flex}
                contentContainerStyle={{ gap: 16, paddingBottom: 120 }}
                showsVerticalScrollIndicator={false}
              >
                <ProgressSection
                  statsExpanded={statsExpanded}
                  setStatsExpanded={setStatsExpanded}
                  habitCompletionPct={habitCompletionPct}
                  unfinishedHabitCount={unfinishedHabitCount}
                  showCelebrate={showCelebrate}
                  completedHabitCount={completedHabitCount}
                  totalHabitsCount={habits.length}
                  longestStreak={longestStreak}
                />

                {/* Add Habit input */}
                <AppCard style={styles.addTaskCard}>
                  <TextInput
                    value={habitTitle}
                    onChangeText={setHabitTitle}
                    placeholder="Add a new habit"
                    placeholderTextColor={colors.textMuted}
                    onSubmitEditing={addHabit}
                    onFocus={() => {
                      setIsAddingHabit(true);
                    }}
                    onBlur={() => {
                      if (habitTitle.trim() === "") setIsAddingHabit(false);
                    }}
                    style={[styles.addTaskInput, { color: colors.text }]}
                  />
                  <Pressable
                    onPress={addHabit}
                    style={[styles.addBtn, { backgroundColor: colors.primary }]}
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
                        {
                          key: "high",
                          label: "🔴 High",
                          color: colors.error,
                          softColor:
                            colorScheme === "light"
                              ? "rgba(220, 38, 38, 0.08)"
                              : "rgba(239, 68, 68, 0.12)",
                        },
                        {
                          key: "medium",
                          label: "🟡 Medium",
                          color: colors.warning,
                          softColor:
                            colorScheme === "light"
                              ? "rgba(217, 119, 6, 0.08)"
                              : "rgba(245, 158, 11, 0.12)",
                        },
                        {
                          key: "low",
                          label: "🟢 Low",
                          color: colors.success,
                          softColor:
                            colorScheme === "light"
                              ? "rgba(5, 150, 105, 0.08)"
                              : "rgba(16, 185, 129, 0.12)",
                        },
                      ].map((p) => {
                        const isSelected = selectedHabitPriority === p.key;
                        return (
                          <Pressable
                            key={p.key}
                            onPress={() =>
                              setSelectedHabitPriority(p.key as any)
                            }
                            style={({ pressed }) => [
                              styles.categoryChoicePill,
                              {
                                backgroundColor: isSelected
                                  ? p.softColor
                                  : colors.cardLight,
                                borderColor: isSelected
                                  ? p.color
                                  : colors.border,
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
                <View
                  style={[
                    styles.categoryChoiceRow,
                    { marginBottom: 8, marginTop: 10 },
                  ]}
                >
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
                      const isSelected =
                        selectedListHabitPriorityFilter === p.key;
                      return (
                        <Pressable
                          key={p.key}
                          onPress={() =>
                            setSelectedListHabitPriorityFilter(p.key as any)
                          }
                          style={({ pressed }) => [
                            styles.categoryChoicePill,
                            {
                              backgroundColor: isSelected
                                ? colorScheme === "light"
                                  ? "#E2E8F0"
                                  : "#27272A"
                                : colors.cardLight,
                              borderColor: isSelected
                                ? colors.primary
                                : colors.border,
                              opacity: pressed ? 0.9 : 1,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              color: isSelected
                                ? colors.text
                                : colors.textMuted,
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
                <HabitSection
                  displayedHabits={displayedHabits}
                  habits={habits}
                  setHabits={setHabits}
                  persistHabits={persistHabits}
                  toggleHabit={toggleHabit}
                  deleteHabit={deleteHabit}
                  unfinishedHabitCount={unfinishedHabitCount}
                />
              </ScrollView>
            )}

            {/* Workspace Creator Modal */}
            <WorkspaceModal
              visible={folderModalVisible}
              onClose={() => setFolderModalVisible(false)}
              editingFolderId={editingFolderId}
              lists={lists}
              setLists={setLists}
              todos={todos}
              setTodos={setTodos}
              selectedList={selectedList}
              setSelectedList={setSelectedList}
              openedFolderId={openedFolderId}
              setOpenedFolderId={setOpenedFolderId}
              persistState={persistState}
            />

            {/* Centered Alarm Modal */}
            <AlarmModal
              visible={!!alarmMenu}
              todoId={alarmMenu}
              todos={todos}
              selectedList={selectedList}
              onClose={() => setAlarmMenu(null)}
              onScheduleAlarm={scheduleAlarm}
              onScheduleAlarmWithDays={scheduleAlarmWithDays}
            />
          </View>
        </KeyboardAvoidingView>

        <TaskEditorSheet
          task={editingTask || addingTask}
          lists={lists}
          mode={addingTask ? "add" : "edit"}
          onClose={() => {
            if (editingTask) setEditingTask(null);
            if (addingTask) setAddingTask(null);
          }}
          onSave={addingTask ? onSaveNewTask : onSaveEditedTask}
          onDelete={editingTask ? deleteTodo : undefined}
        />
        <NLPCapture
          visible={nlpVisible}
          onClose={() => setNlpVisible(false)}
          onSave={handleSaveParsedItem}
          workspaces={lists}
          currentWorkspaceId={openedFolderId || "default"}
          onCreateWorkspace={handleCreateWorkspaceFromNLP}
          todos={todos}
        />
      </Animated.View>

      {/* Premium Floating NLP Button */}
      <Animated.View
        entering={FadeInDown.delay(600).duration(400)}
        style={{
          position: "absolute",
          right: 20,
          bottom: Platform.OS === "ios" ? 110 : 96,
          zIndex: 99,
        }}
      >
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
              () => {},
            );
            setNlpVisible(true);
          }}
          activeOpacity={0.85}
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: colors.primary,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.35,
            shadowRadius: 10,
            elevation: 8,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.15)",
          }}
        >
          <Feather name="zap" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  workspaceGridCard: {
    width: (SCREEN_WIDTH - 44) / 2,
    borderRadius: 18,
    overflow: "hidden",
    position: "relative",
    minHeight: 140,
  },
  workspaceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  workspaceName: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  workspaceCount: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
});
