import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import {
  Pressable,
  Alert,
  SafeAreaView,
  ScrollView,
  View,
  Modal,
  StyleSheet,
} from "react-native";
import { AppTextInput as TextInput } from "@/components/ui/AppText";
import { AppText as Text } from "@/components/ui/AppText";
import Animated, { FadeInDown } from "react-native-reanimated";
import { BlurView } from "expo-blur";

import { AnimatedCheckbox } from "@/components/AnimatedCheckbox";
import { AppCard } from "@/components/AppCard";
import PressableScale from "@/components/ui/PressableScale";
import { useUndo } from "@/components/ui/UndoContext";
import { styles } from "@/constants/dashboardStyles";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { cancelReminderIds } from "@/services/reminders";
import { addXp, handleTaskXpChange, handleHabitXpChange, type UserProfile } from "@/services/settingsService";
import { DAILY_STORAGE_KEY, TODOS_STORAGE_KEY } from "@/services/storage";
import {
    normalizeTaskCategory,
    TASK_CATEGORY_KEYS,
    type TaskCategory,
} from "@/services/taskCategories";
import { syncWidgetData } from "@/services/widgetData";
import * as Haptics from "expo-haptics";
import { addStateListener, emitStateChange } from "@/services/stateEvents";
import { InteractivePebbleJar } from "@/components/profile/InteractivePebbleJar";
import { CrowMascot, CrowStreakMascot } from "@/components/profile/PebbleJar";
import { RenderAvatar } from "@/components/profile/RenderAvatar";

// Reusable UI components
import { HabitStreakCard } from "@/components/dashboard/HabitStreakCard";
import { AppHeader } from "@/components/ui/AppHeader";

const getDateKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const getTodoDateKey = (todo: any) => {
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

const getOverdueLabel = (dateStr: string) => {
  if (!dateStr) return "Overdue";
  const todayStr = getDateKey();
  if (dateStr === todayStr) return "Today";
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const [dy, dm, dd] = dateStr.split("-").map(Number);
  const todayDate = new Date(ty, tm - 1, td);
  const taskDate = new Date(dy, dm - 1, dd);
  const diffTime = todayDate.getTime() - taskDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Overdue";
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
};

type Subtask = { id: string; title: string; completed: boolean };
type Todo = {
  id: string;
  title: string;
  completed: boolean;
  category?: TaskCategory;
  priority?: "low" | "medium" | "high";
  alarmTime?: number;
  subtasks?: Subtask[];
  notificationIds?: string[];
  scheduledDate?: string;
  folderId?: string;
  description?: string;
  tags?: string[];
  archived?: boolean;
};
type Habit = {
  id: string;
  title: string;
  streak: number;
  bestStreak: number;
  completedToday: boolean;
  lastCompletedDate?: string;
  priority?: "low" | "medium" | "high";
  archived?: boolean;
  previousStreak?: number;
  streakBrokenDate?: string;
};

export default function DashboardScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const router = useRouter();

  const { showUndo } = useUndo();

  const [lifetimePebbles, setLifetimePebbles] = useState<number>(0);
  const [monthlyPebbles, setMonthlyPebbles] = useState<number>(0);
  const [pebbleBalance, setPebbleBalance] = useState<number>(0);
  const [gemsBalance, setGemsBalance] = useState<number>(0);
  const [mainStreakRecoveryInfo, setMainStreakRecoveryInfo] = useState<any>(null);
  const [monthlyTypes, setMonthlyTypes] = useState<{ task: number; habit: number; focus: number }>({
    task: 0,
    habit: 0,
    focus: 0,
  });
  const [lifetimeTypes, setLifetimeTypes] = useState<{ task: number; habit: number; focus: number }>({
    task: 0,
    habit: 0,
    focus: 0,
  });
  const [fallingPebbleType, setFallingPebbleType] = useState<"task" | "habit" | "focus" | undefined>(undefined);
  const [streak, setStreak] = useState<number>(0);
  const [weeklyStatus, setWeeklyStatus] = useState<any[]>([]);
  const [isMascotExpanded, setIsMascotExpanded] = useState<boolean>(true);

  useEffect(() => {
    AsyncStorage.getItem("todoapp:mascot_expanded").then((val) => {
      if (val !== null) {
        setIsMascotExpanded(val === "true");
      }
    });
  }, []);

  const toggleMascotExpansion = async () => {
    const nextVal = !isMascotExpanded;
    setIsMascotExpanded(nextVal);
    await AsyncStorage.setItem("todoapp:mascot_expanded", String(nextVal));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };
  const [pebbleJarModalVisible, setPebbleJarModalVisible] = useState(false);
  const [showRewardOverlay, setShowRewardOverlay] = useState(false);
  const [rewardStartCount, setRewardStartCount] = useState(0);
  const [rewardTargetCount, setRewardTargetCount] = useState(0);

  const [todoStats, setTodoStats] = useState({
    completed: 0,
    total: 0,
    pending: [] as Todo[],
    overdue: [] as Todo[],
  });
  const [habitStats, setHabitStats] = useState({
    completed: 0,
    total: 0,
    maxStreak: 0,
  });
  const [pendingHabits, setPendingHabits] = useState<Habit[]>([]);
  const [completedHabits, setCompletedHabits] = useState<Habit[]>([]);
  const [activeSegment, setActiveSegment] = useState<"tasks" | "habits">(
    "tasks",
  );
  const [selectedPriorityFilter, setSelectedPriorityFilter] = useState<
    "all" | "high" | "medium" | "low"
  >("all");
  const [nextReminder, setNextReminder] = useState<string | null>(null);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>(
    {},
  );
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [hasUnreadNotifs, setHasUnreadNotifs] = useState<boolean>(false);
  const [folders, setFolders] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  const loadDashboardData = useCallback(async () => {
    try {
      // 1. Load Todos
      const rawTodos = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
      let tCompleted = 0;
      let tTotal = 0;
      let pendingList: Todo[] = [];
      let closestAlarm: number | null = null;
      const nextCategoryCounts = Object.fromEntries(
        TASK_CATEGORY_KEYS.map((key) => [key, 0]),
      ) as Record<string, number>;

      if (rawTodos) {
        const parsed = JSON.parse(rawTodos) as {
          lists?: {
            id: string;
            name: string;
            emoji?: string;
            color?: string;
          }[];
          todos?: Record<string, Todo[]>;
        };

        const defaultFolders = [
          {
            id: "default",
            name: "My Pebbles",
            emoji: "📋",
            color: "#6366F1",
          },
        ];
        const loadedFolders =
          parsed.lists && parsed.lists.length > 0
            ? parsed.lists
            : defaultFolders;
        setFolders(loadedFolders);

        const todayStr = getDateKey();

        const rawList: Todo[] = [];
        Object.entries(parsed.todos || {}).forEach(([folderId, listTodos]) => {
          listTodos.forEach((todo) => {
            rawList.push({
              ...todo,
              folderId: todo.folderId || folderId,
            });
          });
        });

        const allTodos = rawList.filter((todo) => {
          if (todo.archived) return false;
          if (todo.scheduledDate === "inbox") {
            return todo.completed;
          }
          const todoDate = getTodoDateKey(todo);
          if (todoDate > todayStr) {
            return false;
          }
          return true;
        });

        // Separate today's tasks and overdue tasks
        const overdueTodos = allTodos.filter((t) => !t.completed && getTodoDateKey(t) < todayStr);
        const todayTodos = allTodos.filter((t) => getTodoDateKey(t) === todayStr || t.completed);

        tTotal = todayTodos.length;
        tCompleted = todayTodos.filter((t) => t.completed).length;

        // Sort pending today's todos by priority: High -> Medium -> Low
        const pendingTodos = todayTodos.filter((t) => !t.completed);
        pendingTodos.sort((a, b) => {
          const orderA =
            a.priority === "high" ? 0 : a.priority === "low" ? 2 : 1;
          const orderB =
            b.priority === "high" ? 0 : b.priority === "low" ? 2 : 1;
          return orderA - orderB;
        });
        pendingList = pendingTodos;

        // Sort overdue todos by priority: High -> Medium -> Low
        const overdueList = [...overdueTodos];
        overdueList.sort((a, b) => {
          const orderA =
            a.priority === "high" ? 0 : a.priority === "low" ? 2 : 1;
          const orderB =
            b.priority === "high" ? 0 : b.priority === "low" ? 2 : 1;
          return orderA - orderB;
        });

        allTodos.forEach((todo) => {
          if (todo.completed) {
            return;
          }

          const category = normalizeTaskCategory(todo.category);
          nextCategoryCounts[category] =
            (nextCategoryCounts[category] ?? 0) + 1;
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
      }

      // 2. Load Habits
      const rawHabits = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
      let hCompleted = 0;
      let hTotal = 0;
      let maxStreak = 0;
      let unfinishedHabitsList: Habit[] = [];
      let finishedHabitsList: Habit[] = [];

      if (rawHabits) {
        const parsed = JSON.parse(rawHabits) as { dailyHabits: Habit[] };
        const allHabits = (parsed.dailyHabits || []).filter((h) => !h.archived);
        hTotal = allHabits.length;
        hCompleted = allHabits.filter((h) => h.completedToday).length;

        // Sort unfinished habits by priority: High -> Medium -> Low
        const unfinished = allHabits.filter((h) => !h.completedToday);
        unfinished.sort((a, b) => {
          const orderA =
            a.priority === "high" ? 0 : a.priority === "low" ? 2 : 1;
          const orderB =
            b.priority === "high" ? 0 : b.priority === "low" ? 2 : 1;
          return orderA - orderB;
        });
        unfinishedHabitsList = unfinished;
        finishedHabitsList = allHabits.filter((h) => h.completedToday);
        maxStreak = allHabits.reduce(
          (max, h) => Math.max(max, h.streak || 0),
          0,
        );
      }

      setPendingHabits(unfinishedHabitsList);
      setCompletedHabits(finishedHabitsList);
      setHabitStats({ completed: hCompleted, total: hTotal, maxStreak });

      setCategoryCounts({ ...nextCategoryCounts });

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
        const { getProfile } = require("@/services/settingsService");
        const userProfile = await getProfile();
        setProfile(userProfile);

        const { getNotificationLogs } = require("@/services/notificationsLog");
        const logs = await getNotificationLogs();
        const hasUnread = logs.some((l: any) => !l.read);
        setHasUnreadNotifs(hasUnread);

        // Calculate lifetime & monthly pebbles using the new service
        const { getPebbleCounts, getGemsBalance, getMainStreakRecoveryInfo } = require("@/services/pebbleService");
        const pebbleStats = await getPebbleCounts();
        setLifetimePebbles(pebbleStats.lifetime);
        setMonthlyPebbles(pebbleStats.monthly);
        setMonthlyTypes(pebbleStats.monthlyTypes);
        setLifetimeTypes(pebbleStats.lifetimeTypes || { task: 0, habit: 0, focus: 0 });
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
  }, []);

  const handleRecoverMainStreak = useCallback(async () => {
    try {
      const { recoverMainStreak } = require("@/services/pebbleService");
      const success = await recoverMainStreak();
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert("Streak Restored! 🔥", "Your daily pebble streak has been successfully restored.");
        await loadDashboardData();
      } else {
        Alert.alert("Insufficient Gems", "You need 1 Gem to restore your main streak.");
      }
    } catch (e) {
      console.warn("Failed to recover main streak", e);
    }
  }, [loadDashboardData]);

  const completeTodoFromDashboard = useCallback(
    async (todoId: string) => {
      try {
        const rawTodos = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
        if (!rawTodos) {
          return;
        }

        const parsed = JSON.parse(rawTodos) as {
          lists?: { id: string; name: string }[];
          selectedList?: string;
          todos?: Record<string, Todo[]>;
        };

        // capture previous todo for possible undo
        let prevTodo: Todo | null = null;
        Object.values(parsed.todos || {}).forEach((list) => {
          list.forEach((t) => {
            if (t.id === todoId) prevTodo = { ...t };
          });
        });

        let reminderIdsToClear: string[] = [];
        let xpAwarded = false;
        if (prevTodo) {
          const res = await handleTaskXpChange(prevTodo, true);
          xpAwarded = res.xpAwarded;
        }

        const nextTodos = Object.fromEntries(
          Object.entries(parsed.todos || {}).map(([listId, listTodos]) => [
            listId,
            listTodos.map((todo) => {
              if (todo.id !== todoId) {
                return todo;
              }

              reminderIdsToClear = todo.notificationIds ?? [];
              return { ...todo, completed: true, xpAwarded };
            }),
          ]),
        ) as Record<string, Todo[]>;

        await cancelReminderIds(reminderIdsToClear);
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
        await AsyncStorage.setItem(
          TODOS_STORAGE_KEY,
          JSON.stringify({
            lists: parsed.lists ?? [],
            selectedList: parsed.selectedList ?? "default",
            todos: nextTodos,
          }),
        );

        // Earn task pebble
        const { earnPebble } = require("@/services/pebbleService");
        await earnPebble("task");

        // Trigger Pebble Jar animation overlay
        setFallingPebbleType("task");
        setRewardStartCount(lifetimePebbles);
        setRewardTargetCount(lifetimePebbles + 1);
        setShowRewardOverlay(true);

        await loadDashboardData();
        await syncWidgetData().catch(() => {});
        emitStateChange("tasks_changed");

        // show undo snackbar — restore previous todo state when undone
        try {
          if (showUndo) {
            showUndo({
              message: "Pebble marked completed.",
              actionLabel: "Undo",
               onUndo: async () => {
                try {
                  if (!prevTodo) return;
                  await handleTaskXpChange(prevTodo, false);
                  const { undoLastPebble } = require("@/services/pebbleService");
                  await undoLastPebble("task");
                  const raw2 = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
                  if (!raw2) return;
                  const parsed2 = JSON.parse(raw2) as any;
                  const reverted = Object.fromEntries(
                    Object.entries(parsed2.todos || {}).map(
                      ([listId, listTodos]: any) => [
                        listId,
                        listTodos.map((t: any) => {
                          if (t.id !== todoId) return t;
                          return { ...prevTodo };
                        }),
                      ],
                    ),
                  );
                  await AsyncStorage.setItem(
                    TODOS_STORAGE_KEY,
                    JSON.stringify({ ...parsed2, todos: reverted }),
                  );
                  await loadDashboardData();
                  await syncWidgetData().catch(() => {});
                  emitStateChange("tasks_changed");
                } catch {
                  // ignore
                }
              },
            });
          }
        } catch {
          // ignore undo errors
        }
      } catch {
        // ignore
      }
    },
    [loadDashboardData],
  );

  const completeHabitFromDashboard = useCallback(
    async (habitId: string) => {
      try {
        const rawHabits = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
        if (!rawHabits) return;

        const parsed = JSON.parse(rawHabits) as { dailyHabits: Habit[] };
        const today = getDateKey();

        const target = (parsed.dailyHabits || []).find((h) => h.id === habitId);
        if (!target) return;

        const nextCompleted = !target.completedToday;
        const { xpAwardedDate } = await handleHabitXpChange(target, nextCompleted, today);

        const nextHabits = (parsed.dailyHabits || []).map((habit) => {
          if (habit.id !== habitId) return habit;

          let streak = habit.streak || 0;
          if (nextCompleted) {
            streak += 1;
          } else {
            streak = Math.max(0, streak - 1);
          }

          return {
            ...habit,
            completedToday: nextCompleted,
            streak,
            bestStreak: Math.max(habit.bestStreak || 0, streak),
            lastCompletedDate: nextCompleted ? today : habit.lastCompletedDate,
            xpAwardedDate,
          };
        });

        if (nextCompleted) {
          Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          ).catch(() => {});
        }

        await AsyncStorage.setItem(
          DAILY_STORAGE_KEY,
          JSON.stringify({ dailyHabits: nextHabits }),
        );

        // Record history snapshot
        const {
          recordDailyHistorySnapshot,
        } = require("@/services/productivityHistory");
        void recordDailyHistorySnapshot();

        const { earnPebble, undoLastPebble } = require("@/services/pebbleService");
        if (nextCompleted) {
          await earnPebble("habit");
          setFallingPebbleType("habit");
          setRewardStartCount(lifetimePebbles);
          setRewardTargetCount(lifetimePebbles + 1);
          setShowRewardOverlay(true);
        } else {
          await undoLastPebble("habit");
        }

        await loadDashboardData();
        await syncWidgetData().catch(() => {});
        emitStateChange("habits_changed");
      } catch (e) {
        console.warn("Failed to complete habit on dashboard", e);
      }
    },
    [loadDashboardData],
  );

  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [loadDashboardData]),
  );

  // Synchronize dashboard state immediately when tasks/habits/profile are modified in other tabs/modals
  useEffect(() => {
    const unsubscribeTasks = addStateListener("tasks_changed", () => {
      void loadDashboardData();
    });

    const unsubscribeHabits = addStateListener("habits_changed", () => {
      void loadDashboardData();
    });

    const unsubscribeProfile = addStateListener("profile_changed", () => {
      void loadDashboardData();
    });

    const unsubscribePebbles = addStateListener("pebbles_changed", () => {
      void loadDashboardData();
    });

    return () => {
      unsubscribeTasks();
      unsubscribeHabits();
      unsubscribeProfile();
      unsubscribePebbles();
    };
  }, [loadDashboardData]);

  const totalItems = todoStats.total + habitStats.total;
  const completedItems = todoStats.completed + habitStats.completed;
  const progressPct = totalItems === 0 ? 0 : completedItems / totalItems;

  const matchesSearch = (text: string, query: string) => {
    return text?.toLowerCase().includes(query.toLowerCase());
  };

  const displayedTodos = todoStats.pending.filter((todo) => {
    const folder = folders.find((f) => f.id === todo.folderId);
    const folderName = folder?.name || "";
    const tagsStr = todo.tags?.join(" ") || "";
    const queryMatches =
      searchQuery.trim() === "" ||
      matchesSearch(todo.title, searchQuery) ||
      matchesSearch(todo.description || "", searchQuery) ||
      matchesSearch(folderName, searchQuery) ||
      matchesSearch(tagsStr, searchQuery);

    if (!queryMatches) return false;

    if (activeFilter === "high") return todo.priority === "high";
    return todo.folderId === activeFilter;
  });

  const displayedOverdue = todoStats.overdue.filter((todo) => {
    const folder = folders.find((f) => f.id === todo.folderId);
    const folderName = folder?.name || "";
    const tagsStr = todo.tags?.join(" ") || "";
    const queryMatches =
      searchQuery.trim() === "" ||
      matchesSearch(todo.title, searchQuery) ||
      matchesSearch(todo.description || "", searchQuery) ||
      matchesSearch(folderName, searchQuery) ||
      matchesSearch(tagsStr, searchQuery);

    if (!queryMatches) return false;

    if (activeFilter === "all") return true;
    if (activeFilter === "tasks") return true;
    if (activeFilter === "habits") return false;
    if (activeFilter === "high") return todo.priority === "high";
    return todo.folderId === activeFilter;
  });

  const displayedPendingHabits = pendingHabits.filter((habit) => {
    const queryMatches =
      searchQuery.trim() === "" || matchesSearch(habit.title, searchQuery);
    if (!queryMatches) return false;

    if (activeFilter === "all") return true;
    if (activeFilter === "tasks") return false;
    if (activeFilter === "habits") return true;
    if (activeFilter === "high") return habit.priority === "high";
    return false;
  });

  const displayedCompletedHabits = completedHabits.filter((habit) => {
    const queryMatches =
      searchQuery.trim() === "" || matchesSearch(habit.title, searchQuery);
    if (!queryMatches) return false;

    if (activeFilter === "all") return true;
    if (activeFilter === "tasks") return false;
    if (activeFilter === "habits") return true;
    if (activeFilter === "high") return habit.priority === "high";
    return false;
  });

  const getGreetingTime = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "Good morning";
    if (hour >= 12 && hour < 17) return "Good afternoon";
    if (hour >= 17 && hour < 21) return "Good evening";
    return "Late night";
  };

  const continueWorkspace = useMemo(() => {
    if (folders.length === 0 || todoStats.pending.length === 0) return null;

    const counts: Record<string, number> = {};
    todoStats.pending.forEach((todo) => {
      if (todo.folderId) {
        counts[todo.folderId] = (counts[todo.folderId] || 0) + 1;
      }
    });

    let bestFolderId = "";
    let maxCount = 0;
    Object.entries(counts).forEach(([fId, cnt]) => {
      if (cnt > maxCount) {
        maxCount = cnt;
        bestFolderId = fId;
      }
    });

    if (!bestFolderId) return null;
    return folders.find((f) => f.id === bestFolderId) || null;
  }, [folders, todoStats.pending]);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <Animated.View
        entering={FadeInDown.duration(400).springify()}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 110 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <AppHeader
            kicker={getGreetingTime()}
            title={profile ? profile.name : "User"}
            profile={profile}
            nextReminder={nextReminder}
            hasUnreadNotifs={hasUnreadNotifs}
            totalPebbles={lifetimePebbles}
            gemsBalance={gemsBalance}
            onPebblePress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setPebbleJarModalVisible(true);
            }}
          />

          {/* Collapsible Mascot & Streak Banner */}
          {(() => {
            let crowStage: "beginner" | "advanced" | "power" = "beginner";
            if (lifetimePebbles >= 101) {
              crowStage = "power";
            } else if (lifetimePebbles >= 26) {
              crowStage = "advanced";
            }

            const totalItems = todoStats.total + habitStats.total;
            const completedItems = todoStats.completed + habitStats.completed;
            const pendingCount = totalItems - completedItems;

            let crowSpeech = "The sanctuary is quiet today. Ready to drop your first pebble?";
            if (totalItems > 0) {
              if (pendingCount === 0) {
                crowSpeech = "Sensational! All goals complete today. I'm fully refreshed! 💧";
              } else if (completedItems > 0) {
                crowSpeech = `Superb! Just ${pendingCount} more goal${pendingCount === 1 ? "" : "s"} to make the jar visual rise today.`;
              } else {
                crowSpeech = `The crow is waiting patiently. Let's start with a single pebble!`;
              }
            }

            let streakMotivation = "Start your goals today to build consistency!";
            if (streak > 0) {
              if (streak < 3) {
                streakMotivation = "Flame sparked! Complete goals to keep the fire burning.";
              } else if (streak < 7) {
                streakMotivation = "Consistency is key. You're building solid momentum!";
              } else if (streak < 14) {
                streakMotivation = "Double digits soon! Don't break this beautiful chain.";
              } else {
                streakMotivation = "Incredible dedication. You're mastering your routines!";
              }
            }

            if (!isMascotExpanded) {
              return (
                <Pressable
                  onPress={toggleMascotExpansion}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: colors.card,
                    borderColor: streak > 0 ? (colorScheme === "light" ? "#D97706" : "#B45309") : colors.border,
                    borderWidth: 1.5,
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    marginHorizontal: 4,
                    marginTop: 12,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: 16 }}>🔥</Text>
                    <Text style={{ fontSize: 13, fontWeight: "800", color: colors.text }}>
                      {streak} Day Streak
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textMuted }}>
                      • Tap to view motivation
                    </Text>
                  </View>
                  <Feather name="chevron-down" size={16} color={colors.textMuted} />
                </Pressable>
              );
            }

            return (
              <Animated.View
                entering={FadeInDown.duration(350)}
                style={{
                  backgroundColor: colorScheme === "light" 
                    ? (streak > 0 ? "rgba(245, 158, 11, 0.04)" : "rgba(99, 102, 241, 0.03)") 
                    : (streak > 0 ? "rgba(245, 158, 11, 0.025)" : "rgba(99, 102, 241, 0.05)"),
                  borderColor: streak > 0 ? (colorScheme === "light" ? "#D97706" : "#B45309") : colors.border,
                  borderWidth: 1.5,
                  borderRadius: 20,
                  padding: 16,
                  marginHorizontal: 4,
                  marginTop: 12,
                  position: "relative",
                  gap: 12,
                }}
              >
                {/* Close/Minimize Button */}
                <Pressable
                  onPress={toggleMascotExpansion}
                  style={{
                    position: "absolute",
                    top: 14,
                    right: 14,
                    zIndex: 10,
                  }}
                >
                  <Feather name="chevron-up" size={16} color={colors.textMuted} />
                </Pressable>

                {/* Banner Content Split */}
                <View style={{ flexDirection: "row", gap: 12, alignItems: "center", width: "100%" }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={{ fontSize: 24 }}>🔥</Text>
                      <Text style={{ fontSize: 22, fontWeight: "900", color: colors.text, letterSpacing: -0.5 }}>
                        {streak} Day Streak
                      </Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textMuted }}>
                      {streakMotivation}
                    </Text>
                    
                    {/* Crow Speech Bubble */}
                    <View
                      style={{
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        borderWidth: 1,
                        borderRadius: 12,
                        padding: 10,
                        marginTop: 8,
                        position: "relative",
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.text, lineHeight: 14 }}>
                        {crowSpeech}
                      </Text>
                    </View>

                    {/* Main Streak Recovery Panel */}
                    {mainStreakRecoveryInfo?.eligible && (
                      <View
                        style={{
                          marginTop: 10,
                          padding: 12,
                          backgroundColor: colorScheme === "light" ? "rgba(239, 68, 68, 0.05)" : "rgba(239, 68, 68, 0.08)",
                          borderColor: colorScheme === "light" ? "rgba(239, 68, 68, 0.15)" : "rgba(239, 68, 68, 0.2)",
                          borderWidth: 1.2,
                          borderRadius: 12,
                          gap: 6,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "800", color: colors.error }}>
                          💔 Main Streak of {mainStreakRecoveryInfo.previousStreak} Broken!
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.textMuted, lineHeight: 14 }}>
                          Use a Gem to restore your streak before it expires.
                        </Text>
                        <PressableScale
                          onPress={handleRecoverMainStreak}
                          style={{
                            backgroundColor: colorScheme === "light" ? "#FEF3C7" : "rgba(245, 158, 11, 0.15)",
                            borderColor: "#F59E0B",
                            borderWidth: 1,
                            borderRadius: 8,
                            paddingVertical: 6,
                            alignItems: "center",
                            justifyContent: "center",
                            marginTop: 4,
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: "700", color: "#F59E0B" }}>
                            💎 Spend 1 Gem to Restore
                          </Text>
                        </PressableScale>
                      </View>
                    )}
                  </View>

                  {/* Mascot Avatar */}
                  <View style={{ alignItems: "center", justifyContent: "center", width: 75, height: 75 }}>
                    {streak > 0 ? (
                      <CrowStreakMascot size={75} />
                    ) : profile?.avatar && profile.avatar.startsWith("avatar_") ? (
                      <RenderAvatar avatar={profile.avatar} size={75} />
                    ) : (
                      <CrowMascot
                        stage={crowStage}
                        colors={colors}
                        colorScheme={colorScheme ?? "dark"}
                        size={75}
                      />
                    )}
                  </View>
                </View>

                {/* Weekly Completion Track */}
                {weeklyStatus && weeklyStatus.length > 0 && (
                  <View style={{ width: "100%", gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
                    <Text style={{ fontSize: 9, fontWeight: "800", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Weekly Goal Progress
                    </Text>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: "100%", marginTop: 4 }}>
                      {weeklyStatus.map((day: any, idx: number) => {
                        const isCompleted = day.completed;
                        const isToday = day.isToday;
                        const isPrevCompleted = idx > 0 && weeklyStatus[idx - 1].completed;

                        return (
                          <Fragment key={day.dateKey}>
                            {/* Connecting Line Segment */}
                            {idx > 0 && (
                              <View
                                style={{
                                  flex: 1,
                                  height: 3,
                                  backgroundColor: isPrevCompleted ? "#F59E0B" : colors.border,
                                  marginHorizontal: -2,
                                  zIndex: 1,
                                }}
                              />
                            )}

                            {/* Day Node */}
                            <View style={{ alignItems: "center", zIndex: 2 }}>
                              <Text
                                style={{
                                  fontSize: 9,
                                  fontWeight: "700",
                                  color: isToday ? "#F59E0B" : colors.textMuted,
                                  marginBottom: 6,
                                }}
                              >
                                {day.label}
                              </Text>
                              <View
                                style={{
                                  width: 24,
                                  height: 24,
                                  borderRadius: 12,
                                  borderWidth: isToday ? 2 : 1.5,
                                  borderColor: isCompleted ? "#F59E0B" : isToday ? "#F59E0B" : colors.border,
                                  backgroundColor: isCompleted ? "#F59E0B" : colors.card,
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {isCompleted ? (
                                  <Feather name="check" size={12} color="#ffffff" style={{ fontWeight: "900" }} />
                                ) : isToday ? (
                                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#F59E0B" }} />
                                ) : null}
                              </View>
                            </View>
                          </Fragment>
                        );
                      })}
                    </View>
                  </View>
                )}
              </Animated.View>
            );
          })()}

          {/* Search Bar */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.card,
              borderRadius: 16,
              borderWidth: 1.5,
              borderColor: colors.border,
              paddingHorizontal: 12,
              height: 46,
              marginHorizontal: 4,
              marginTop: 12,
            }}
          >
            <Feather
              name="search"
              size={16}
              color={colors.textMuted}
              style={{ marginRight: 8 }}
            />
            <TextInput
              style={{ flex: 1, color: colors.text, fontSize: 14, padding: 0 }}
              placeholder="Search tasks & habits..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery("")}>
                <Feather name="x" size={16} color={colors.textMuted} />
              </Pressable>
            )}
          </View>

          {/* Filter Chips ScrollView */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              flexDirection: "row",
              gap: 8,
              paddingHorizontal: 4,
              paddingVertical: 12,
            }}
          >
            {(() => {
              const staticChips: { id: string; name: string; icon?: string }[] =
                [
                  { id: "all", name: "All" },
                  { id: "tasks", name: "Tasks" },
                  { id: "habits", name: "Habits" },
                  { id: "high", name: "High Priority" },
                ];
              const folderChips: { id: string; name: string; icon?: string }[] =
                folders.map((f) => ({ id: f.id, name: f.name, icon: f.emoji }));

              return [...staticChips, ...folderChips].map((chip) => {
                const isSel = activeFilter === chip.id;
                return (
                  <PressableScale
                    key={chip.id}
                    onPress={() => setActiveFilter(chip.id)}
                    haptic
                    contentStyle={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                    style={{
                      backgroundColor: isSel ? colors.primary : colors.card,
                      borderColor: isSel ? colors.primary : colors.border,
                      borderWidth: 1.5,
                      marginRight: 8,
                    }}
                  >
                    {chip.icon && (
                      <Text style={{ fontSize: 12 }}>{chip.icon}</Text>
                    )}
                    <Text
                      style={{
                        color: isSel ? "#FFFFFF" : colors.text,
                        fontSize: 12,
                        fontWeight: "700",
                        marginLeft: chip.icon ? 6 : 0,
                      }}
                    >
                      {chip.name}
                    </Text>
                  </PressableScale>
                );
              });
            })()}
          </ScrollView>

          {/* Continue Working In Recommendation Card */}
          {continueWorkspace && (
            <Animated.View entering={FadeInDown.duration(400).delay(100)}>
              <PressableScale
                onPress={() =>
                  router.push({
                    pathname: "/tasks",
                    params: { folderId: continueWorkspace.id },
                  } as any)
                }
                haptic
                contentStyle={{ overflow: "hidden" }}
                style={{
                  backgroundColor: colors.card,
                  borderRadius: 20,
                  borderWidth: 1.5,
                  borderColor: `${continueWorkspace.color || colors.primary}40`,
                  marginHorizontal: 4,
                  marginTop: 12,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.08,
                  shadowRadius: 10,
                  elevation: 2,
                }}
              >
                {/* Color accent strip */}
                <View
                  style={{
                    height: 4,
                    backgroundColor: continueWorkspace.color || colors.primary,
                  }}
                />
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    padding: 14,
                  }}
                >
                  {/* Folder icon */}
                  <View
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 14,
                      backgroundColor: `${continueWorkspace.color || colors.primary}20`,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 24 }}>
                      {continueWorkspace.emoji || "📁"}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: 10,
                        fontWeight: "700",
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                      }}
                    >
                      Continue Working In
                    </Text>
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 15,
                        fontWeight: "800",
                        marginTop: 1,
                      }}
                    >
                      {continueWorkspace.name}
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Text
                      style={{
                        color: continueWorkspace.color || colors.primary,
                        fontSize: 12,
                        fontWeight: "700",
                      }}
                    >
                      Open
                    </Text>
                    <Feather
                      name="chevron-right"
                      size={16}
                      color={continueWorkspace.color || colors.primary}
                    />
                  </View>
                </View>
              </PressableScale>
            </Animated.View>
          )}

          <View style={{ gap: 24, marginTop: 12 }}>
            {/* Overdue Tasks Section */}
            {displayedOverdue.length > 0 && (
              <View style={{ gap: 10 }}>
                <View style={styles.sectionHeader}>
                  <View
                    style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                  >
                    <Text
                      style={[
                        styles.sectionTitle,
                        { color: colors.error, fontWeight: "800" },
                      ]}
                    >
                      {"⚠️ Overdue Tasks"}
                    </Text>
                    <View
                      style={[
                        styles.catBadge,
                        {
                          backgroundColor: `${colors.error}12`,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.catBadgeText,
                          {
                            color: colors.error,
                            fontSize: 10,
                            fontWeight: "700",
                          },
                        ]}
                      >
                        {displayedOverdue.length}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.tasksList}>
                  {displayedOverdue.map((todo) => {
                    const overdueLabel = getOverdueLabel(todo.scheduledDate || "");
                    return (
                      <AppCard
                        key={todo.id}
                        style={[
                          styles.taskCard,
                          {
                            borderColor: `${colors.error}25`,
                            borderWidth: 1.2,
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                            backgroundColor: colorScheme === "light" ? "#FFF5F5" : "rgba(239, 68, 68, 0.05)",
                          },
                        ]}
                        onPress={() =>
                          router.push({
                            pathname: "/tasks",
                            params: { folderId: todo.folderId },
                          } as any)
                        }
                      >
                        <AnimatedCheckbox
                          checked={false}
                          onToggle={() => completeTodoFromDashboard(todo.id)}
                          size={22}
                        />
                        <View
                          style={[
                            styles.taskAccent,
                            {
                              backgroundColor: colors.error,
                              width: 3,
                              height: 24,
                            },
                          ]}
                        />
                        <View style={styles.taskContent}>
                          <Text
                            style={[
                              styles.taskTitle,
                              { color: colors.text, fontSize: 14 },
                            ]}
                            numberOfLines={1}
                          >
                            {todo.title}
                          </Text>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                              marginTop: 2,
                            }}
                          >
                            <View
                              style={[
                                styles.catBadge,
                                {
                                  backgroundColor: `${colors.error}12`,
                                  paddingHorizontal: 6,
                                  paddingVertical: 1.5,
                                  borderColor: `${colors.error}20`,
                                  borderWidth: 1,
                                },
                              ]}
                            >
                              <Text
                                style={{
                                  color: colors.error,
                                  fontSize: 8,
                                  fontWeight: "800",
                                }}
                              >
                                {overdueLabel.toUpperCase()}
                              </Text>
                            </View>

                            {/* Workspace tag badge */}
                            {(() => {
                              const folder = folders.find(
                                (f) => f.id === todo.folderId,
                              );
                              if (!folder) return null;
                              return (
                                <View
                                  style={[
                                    styles.catBadge,
                                    {
                                      backgroundColor: `${folder.color || colors.primary}12`,
                                      paddingHorizontal: 6,
                                      paddingVertical: 1.5,
                                      borderColor: `${folder.color || colors.primary}33`,
                                      borderWidth: 1,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={{
                                      color: folder.color || colors.primary,
                                      fontSize: 8,
                                      fontWeight: "800",
                                    }}
                                  >
                                    {folder.emoji} {folder.name.toUpperCase()}
                                  </Text>
                                </View>
                              );
                            })()}
                          </View>
                        </View>
                      </AppCard>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Today's Tasks Section */}
            <View style={{ gap: 10 }}>
              <View style={styles.sectionHeader}>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.text, fontWeight: "800" },
                    ]}
                  >
                    {"Today's Tasks"}
                  </Text>
                  <View
                    style={[
                      styles.catBadge,
                      {
                        backgroundColor: `${colors.primary}12`,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.catBadgeText,
                        {
                          color: colors.primary,
                          fontSize: 10,
                          fontWeight: "700",
                        },
                      ]}
                    >
                      {displayedTodos.length}
                    </Text>
                  </View>
                </View>
                <PressableScale
                  onPress={() => router.push("/tasks")}
                  haptic
                  contentStyle={{ padding: 6 }}
                  style={{ borderRadius: 6 }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: colors.primary,
                    }}
                  >
                    Manage
                  </Text>
                </PressableScale>
              </View>

              {displayedTodos.length > 0 ? (
                <View style={styles.tasksList}>
                  {displayedTodos.map((todo) => {
                    return (
                      <AppCard
                        key={todo.id}
                        style={[
                          styles.taskCard,
                          {
                            borderColor: colors.border,
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                          },
                        ]}
                        onPress={() =>
                          router.push({
                            pathname: "/tasks",
                            params: { folderId: todo.folderId },
                          } as any)
                        }
                      >
                        <AnimatedCheckbox
                          checked={false}
                          onToggle={() => completeTodoFromDashboard(todo.id)}
                          size={22}
                        />
                        <View
                          style={[
                            styles.taskAccent,
                            {
                              backgroundColor:
                                todo.priority === "high"
                                  ? colors.error
                                  : todo.priority === "low"
                                    ? colors.success
                                    : colors.warning,
                              width: 3,
                              height: 24,
                            },
                          ]}
                        />
                        <View style={styles.taskContent}>
                          <Text
                            style={[
                              styles.taskTitle,
                              { color: colors.text, fontSize: 14 },
                            ]}
                            numberOfLines={1}
                          >
                            {todo.title}
                          </Text>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                              marginTop: 2,
                            }}
                          >
                            {/* Workspace tag badge */}
                            {(() => {
                              const folder = folders.find(
                                (f) => f.id === todo.folderId,
                              );
                              if (!folder) return null;
                              return (
                                <View
                                  style={[
                                    styles.catBadge,
                                    {
                                      backgroundColor: `${folder.color || colors.primary}12`,
                                      paddingHorizontal: 6,
                                      paddingVertical: 1.5,
                                      borderColor: `${folder.color || colors.primary}33`,
                                      borderWidth: 1,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={{
                                      color: folder.color || colors.primary,
                                      fontSize: 8,
                                      fontWeight: "800",
                                    }}
                                  >
                                    {folder.emoji} {folder.name.toUpperCase()}
                                  </Text>
                                </View>
                              );
                            })()}

                            {todo.priority && (
                              <View
                                style={[
                                  styles.catBadge,
                                  {
                                    backgroundColor:
                                      todo.priority === "high"
                                        ? `${colors.error}15`
                                        : todo.priority === "low"
                                          ? `${colors.success}15`
                                          : `${colors.warning}15`,
                                    paddingHorizontal: 5,
                                    paddingVertical: 1.5,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.catBadgeText,
                                    {
                                      color:
                                        todo.priority === "high"
                                          ? colors.error
                                          : todo.priority === "low"
                                            ? colors.success
                                            : colors.warning,
                                      fontSize: 8,
                                      fontWeight: "800",
                                    },
                                  ]}
                                >
                                  {todo.priority.toUpperCase()}
                                </Text>
                              </View>
                            )}
                            {todo.alarmTime && todo.alarmTime > Date.now() && (
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 3,
                                }}
                              >
                                <Feather
                                  name="clock"
                                  size={10}
                                  color={colors.textMuted}
                                />
                                <Text
                                  style={[
                                    styles.taskMeta,
                                    { color: colors.textMuted, fontSize: 10 },
                                  ]}
                                >
                                  {new Date(todo.alarmTime).toLocaleTimeString(
                                    [],
                                    {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </AppCard>
                    );
                  })}
                </View>
              ) : (
                <View
                  style={[
                    styles.emptyTasks,
                    { borderColor: colors.border, paddingVertical: 20 },
                  ]}
                >
                  <Feather name="check" size={20} color={colors.success} />
                  <Text
                    style={[
                      styles.emptyText,
                      { color: colors.text, fontSize: 13, fontWeight: "600" },
                    ]}
                  >
                    Drop your first pebble.
                  </Text>
                </View>
              )}
            </View>

            {/* Today's Habits Section */}
            <View style={{ gap: 10 }}>
              <View style={styles.sectionHeader}>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.text, fontWeight: "800" },
                    ]}
                  >
                    {"Today's Habits"}
                  </Text>
                  <View
                    style={[
                      styles.catBadge,
                      {
                        backgroundColor: `${colors.warning}12`,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.catBadgeText,
                        {
                          color: colors.warning,
                          fontSize: 10,
                          fontWeight: "700",
                        },
                      ]}
                    >
                      {displayedPendingHabits.length}
                    </Text>
                  </View>
                </View>
                <Pressable onPress={() => router.push("/tasks?segment=habits")}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: colors.primary,
                    }}
                  >
                    Streaks
                  </Text>
                </Pressable>
              </View>

              {displayedPendingHabits.length > 0 ||
              displayedCompletedHabits.length > 0 ? (
                <View style={styles.tasksList}>
                  {displayedPendingHabits.map((habit) => (
                    <HabitStreakCard
                      key={habit.id}
                      title={habit.title}
                      streak={habit.streak}
                      bestStreak={habit.bestStreak}
                      completedToday={false}
                      priority={habit.priority}
                      onPressToggle={() => completeHabitFromDashboard(habit.id)}
                      onCardPress={() => router.push(`/task-details?id=${habit.id}&type=habit`)}
                    />
                  ))}
                  {displayedCompletedHabits.map((habit) => (
                    <HabitStreakCard
                      key={habit.id}
                      title={habit.title}
                      streak={habit.streak}
                      bestStreak={habit.bestStreak}
                      completedToday={true}
                      priority={habit.priority}
                      onPressToggle={() => completeHabitFromDashboard(habit.id)}
                      onCardPress={() => router.push(`/task-details?id=${habit.id}&type=habit`)}
                    />
                  ))}
                </View>
              ) : (
                <View
                  style={[
                    styles.emptyTasks,
                    { borderColor: colors.border, paddingVertical: 20 },
                  ]}
                >
                  <Feather name="zap" size={20} color={colors.textMuted} />
                  <Text
                    style={[
                      styles.emptyText,
                      { color: colors.textMuted, fontSize: 13 },
                    ]}
                  >
                    Consistency starts with one pebble.
                  </Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </Animated.View>

      {/* Reward Overlay Modal */}
      <Modal
        visible={showRewardOverlay}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRewardOverlay(false)}
      >
        <View style={localStyles.overlayContainer}>
          <BlurView
            intensity={colorScheme === "light" ? 40 : 60}
            style={StyleSheet.absoluteFill}
            tint={colorScheme === "light" ? "light" : "dark"}
          />
          <View
            style={[
              localStyles.overlayContent,
              {
                backgroundColor:
                  colorScheme === "light"
                    ? "rgba(255,255,255,0.9)"
                    : "rgba(24,24,27,0.85)",
                borderColor:
                  colorScheme === "light"
                    ? "rgba(0,0,0,0.08)"
                    : "rgba(255,255,255,0.08)",
              },
            ]}
          >
            <Text style={[localStyles.rewardTitle, { color: colors.primaryLight }]}>
              +1 PEBBLE!
            </Text>
            <InteractivePebbleJar
              mode="reward"
              startCount={rewardStartCount}
              targetCount={rewardTargetCount}
              onComplete={() => {
                setTimeout(() => {
                  setShowRewardOverlay(false);
                }, 400);
              }}
              colors={colors}
              colorScheme={colorScheme ?? "dark"}
              monthlyTypes={monthlyTypes}
              fallingPebbleType={fallingPebbleType}
              profileAvatar={profile?.avatar}
            />
            <Text style={[localStyles.rewardSubtitle, { color: colors.textMuted }]}>
              Adding pebble to your sanctuary jar
            </Text>
          </View>
        </View>
      </Modal>

      {/* Sanctuary Jar Modal */}
      <Modal
        visible={pebbleJarModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPebbleJarModalVisible(false)}
      >
        <View style={localStyles.modalContainer}>
          <BlurView
            intensity={colorScheme === "light" ? 60 : 80}
            style={StyleSheet.absoluteFill}
            tint={colorScheme === "light" ? "light" : "dark"}
          />
          <View
            style={[
              localStyles.modalContent,
              {
                backgroundColor:
                  colorScheme === "light"
                    ? "rgba(255,255,255,0.95)"
                    : "rgba(24,24,27,0.95)",
                borderColor: colors.border,
              },
            ]}
          >
            {/* Header */}
            <View style={localStyles.modalHeader}>
              <Text style={[localStyles.modalHeaderTitle, { color: colors.text }]}>
                Pebble Sanctuary
              </Text>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setPebbleJarModalVisible(false);
                }}
                style={localStyles.closeButton}
              >
                <Feather name="x" size={20} color={colors.text} />
              </Pressable>
            </View>

            {/* Pebble Jar in view mode */}
            <InteractivePebbleJar
              mode="view"
              totalPebbles={lifetimePebbles}
              colors={colors}
              colorScheme={colorScheme ?? "dark"}
              monthlyTypes={monthlyTypes}
              profileAvatar={profile?.avatar}
            />

            {/* Pebble count & stage details (Redesigned Premium Layout) */}
            <View style={{ width: "100%", paddingHorizontal: 4, gap: 16 }}>
              
              {/* Monthly target display panel */}
              <View style={{ alignItems: "center", width: "100%", gap: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3 }}>
                  <Text style={{ fontSize: 44, fontWeight: "900", color: colors.text }}>
                    {monthlyPebbles}
                  </Text>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: colors.textMuted }}>
                    / 100
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "800",
                    color: colors.primary,
                    textTransform: "uppercase",
                    letterSpacing: 1.2,
                  }}
                >
                  Monthly Target (Thirsty Crow)
                </Text>
              </View>

              {(() => {
                const milestoneInfo = getMilestoneInfo(lifetimePebbles);
                return (
                  <View style={{ width: "100%", gap: 14 }}>
                    
                    {/* Stat Split Row */}
                    <View style={{ flexDirection: "row", gap: 8, width: "100%" }}>
                      <View style={{ flex: 1, backgroundColor: colorScheme === "light" ? "rgba(0,0,0,0.015)" : "rgba(255,255,255,0.02)", padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", gap: 2 }}>
                        <Text style={{ fontSize: 15, fontWeight: "800", color: colors.text }}>
                          {Math.min(100, monthlyPebbles)}%
                        </Text>
                        <Text style={{ fontSize: 8, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", textAlign: "center" }}>
                          Water Level
                        </Text>
                      </View>
                      <View style={{ flex: 1, backgroundColor: colorScheme === "light" ? "rgba(0,0,0,0.015)" : "rgba(255,255,255,0.02)", padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", gap: 2 }}>
                        <Text style={{ fontSize: 15, fontWeight: "800", color: "#F59E0B" }}>
                          💎 {gemsBalance}
                        </Text>
                        <Text style={{ fontSize: 8, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", textAlign: "center" }}>
                          Gems
                        </Text>
                      </View>
                      <View style={{ flex: 1, backgroundColor: colorScheme === "light" ? "rgba(0,0,0,0.015)" : "rgba(255,255,255,0.02)", padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", gap: 2 }}>
                        <Text style={{ fontSize: 15, fontWeight: "800", color: colors.text }}>
                          {lifetimePebbles}
                        </Text>
                        <Text style={{ fontSize: 8, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", textAlign: "center" }}>
                          Lifetime
                        </Text>
                      </View>
                    </View>

                    {/* Pebble Sources Breakdown */}
                    <View style={{ width: "100%", gap: 6 }}>
                      <Text style={{ fontSize: 8, fontWeight: "800", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8 }}>
                        Pebble Sources
                      </Text>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        {/* Tasks — purple */}
                        <View style={{ flex: 1, backgroundColor: colorScheme === "light" ? "rgba(139,92,246,0.06)" : "rgba(139,92,246,0.12)", padding: 10, borderRadius: 12, borderWidth: 1, borderColor: "rgba(139,92,246,0.25)", alignItems: "center", gap: 3 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Feather name="check-square" size={11} color="#8B5CF6" />
                            <Text style={{ fontSize: 16, fontWeight: "900", color: "#8B5CF6" }}>
                              {lifetimeTypes.task}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 8, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", textAlign: "center" }}>
                            Tasks
                          </Text>
                        </View>
                        {/* Habits — orange */}
                        <View style={{ flex: 1, backgroundColor: colorScheme === "light" ? "rgba(249,115,22,0.06)" : "rgba(249,115,22,0.12)", padding: 10, borderRadius: 12, borderWidth: 1, borderColor: "rgba(249,115,22,0.25)", alignItems: "center", gap: 3 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Feather name="repeat" size={11} color="#F97316" />
                            <Text style={{ fontSize: 16, fontWeight: "900", color: "#F97316" }}>
                              {lifetimeTypes.habit}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 8, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", textAlign: "center" }}>
                            Habits
                          </Text>
                        </View>
                        {/* Focus — green */}
                        <View style={{ flex: 1, backgroundColor: colorScheme === "light" ? "rgba(16,185,129,0.06)" : "rgba(16,185,129,0.12)", padding: 10, borderRadius: 12, borderWidth: 1, borderColor: "rgba(16,185,129,0.25)", alignItems: "center", gap: 3 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Feather name="zap" size={11} color="#10B981" />
                            <Text style={{ fontSize: 16, fontWeight: "900", color: "#10B981" }}>
                              {lifetimeTypes.focus}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 8, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", textAlign: "center" }}>
                            Focus
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Milestone Card */}
                    <View
                      style={{
                        backgroundColor: colorScheme === "light" ? "rgba(99,102,241,0.03)" : "rgba(99,102,241,0.05)",
                        borderColor: colors.border,
                        borderWidth: 1.2,
                        borderRadius: 16,
                        padding: 14,
                        gap: 12,
                      }}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ fontSize: 11, fontWeight: "800", color: colors.primary, textTransform: "uppercase", letterSpacing: 0.8 }}>
                          Stage {milestoneInfo.stage}/7: {milestoneInfo.name}
                        </Text>
                        <Text style={{ fontSize: 9, fontWeight: "700", color: colors.textMuted }}>
                          {milestoneInfo.range}
                        </Text>
                      </View>

                      <Text style={{ fontSize: 11, color: colors.textMuted, lineHeight: 15 }}>
                        {milestoneInfo.desc}
                      </Text>

                      {/* Progress bar towards next milestone */}
                      {milestoneInfo.stage < 7 && (
                        <View style={{ width: "100%", gap: 6, marginTop: 4 }}>
                          <View
                            style={{
                              height: 5,
                              width: "100%",
                              borderRadius: 2.5,
                              backgroundColor:
                                colorScheme === "light"
                                    ? "rgba(0,0,0,0.06)"
                                    : "rgba(255,255,255,0.06)",
                              overflow: "hidden",
                            }}
                          >
                            {(() => {
                              const current = lifetimePebbles;
                              const ranges = [0, 10, 25, 50, 100, 250, 500];
                              const minVal = ranges[milestoneInfo.stage - 1];
                              const maxVal = ranges[milestoneInfo.stage];
                              const totalInStage = maxVal - minVal;
                              const progressInStage = Math.max(0, current - minVal);
                              const pct = (progressInStage / totalInStage) * 100;

                              return (
                                <View
                                  style={{
                                    height: "100%",
                                    width: `${Math.max(5, Math.min(100, pct))}%`,
                                    backgroundColor: colors.primary,
                                  }}
                                />
                              );
                            })()}
                          </View>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                            {(() => {
                              const nextMilestone = [10, 25, 50, 100, 250, 500][
                                milestoneInfo.stage - 1
                              ];
                              const remaining = nextMilestone - lifetimePebbles;
                              return (
                                <Text style={{ fontSize: 9, fontWeight: "600", color: colors.textMuted }}>
                                  {remaining} pebble{remaining === 1 ? "" : "s"} to Stage {milestoneInfo.stage + 1}
                                </Text>
                              );
                            })()}

                            {(() => {
                              const nextUnlock = [
                                { count: 10, label: "Sprout Jar Nest" },
                                { count: 26, label: "Curious Mascot grows" },
                                { count: 100, label: "Zen Energy floats" },
                                { count: 101, label: "Crowned Mascot & sparkles" },
                                { count: 500, label: "Golden Jar & sparks" },
                              ].find((u) => lifetimePebbles < u.count);

                              if (!nextUnlock) return null;

                              return (
                                <Text style={{ fontSize: 8, fontWeight: "700", textTransform: "uppercase", color: colors.warning }}>
                                  ⚡ Next: {nextUnlock.label}
                                </Text>
                              );
                            })()}
                          </View>
                        </View>
                      )}
                    </View>

                  </View>
                );
              })()}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const getMilestoneInfo = (pebbles: number) => {
  if (pebbles <= 10) {
    return {
      stage: 1,
      name: "First Steps",
      range: "0-10",
      desc: "Gathering the first stones of momentum.",
    };
  }
  if (pebbles <= 25) {
    return {
      stage: 2,
      name: "Sprout",
      range: "11-25",
      desc: "A small base of habit stones.",
    };
  }
  if (pebbles <= 50) {
    return {
      stage: 3,
      name: "Zen Stream",
      range: "26-50",
      desc: "Flowing stream of productivity.",
    };
  }
  if (pebbles <= 100) {
    return {
      stage: 4,
      name: "Sanctuary Base",
      range: "51-100",
      desc: "Solid foundation for daily rhythm.",
    };
  }
  if (pebbles <= 250) {
    return {
      stage: 5,
      name: "Pebble Hoarder",
      range: "101-250",
      desc: "A significant heap of accomplishments.",
    };
  }
  if (pebbles <= 500) {
    return {
      stage: 6,
      name: "Zen Mountain",
      range: "251-500",
      desc: "An impressive, towering mount of zen.",
    };
  }
  return {
    stage: 7,
    name: "Ocean of Focus",
    range: "500+",
    desc: "Infinite zen achieved. Master level.",
  };
};

const localStyles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  overlayContent: {
    width: "85%",
    borderRadius: 32,
    borderWidth: 1.5,
    padding: 24,
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  rewardTitle: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 2,
    textAlign: "center",
    textTransform: "uppercase",
  },
  rewardSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 4,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    borderTopWidth: 1.5,
    padding: 24,
    paddingBottom: 48,
    alignItems: "center",
    gap: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 8,
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(100,100,100,0.1)",
  },
});

const styleOverrides = {
  safeAreaBg: {
    backgroundColor: "transparent",
  },
};
