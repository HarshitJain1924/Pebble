import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable,
    SafeAreaView,
    ScrollView,
    
    
    View } from "react-native";
import { AppTextInput as TextInput } from "@/components/ui/AppText";
import { AppText as Text } from "@/components/ui/AppText";
import Animated, { FadeInDown } from "react-native-reanimated";

import { AnimatedCheckbox } from "@/components/AnimatedCheckbox";
import { AppCard } from "@/components/AppCard";
import PressableScale from "@/components/ui/PressableScale";
import { useUndo } from "@/components/ui/UndoContext";
import { styles } from "@/constants/dashboardStyles";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { cancelReminderIds } from "@/services/reminders";
import { addXp, type UserProfile } from "@/services/settingsService";
import { DAILY_STORAGE_KEY, TODOS_STORAGE_KEY } from "@/services/storage";
import {
    normalizeTaskCategory,
    TASK_CATEGORY_KEYS,
    type TaskCategory,
} from "@/services/taskCategories";
import { syncWidgetData } from "@/services/widgetData";
import * as Haptics from "expo-haptics";
import { addStateListener, emitStateChange } from "@/services/stateEvents";

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
};

export default function DashboardScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const router = useRouter();

  const { showUndo } = useUndo();

  const [todoStats, setTodoStats] = useState({
    completed: 0,
    total: 0,
    pending: [] as Todo[],
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
        tTotal = allTodos.length;
        tCompleted = allTodos.filter((t) => t.completed).length;

        // Sort pending todos by priority: High -> Medium -> Low
        const pendingTodos = allTodos.filter((t) => !t.completed);
        pendingTodos.sort((a, b) => {
          const orderA =
            a.priority === "high" ? 0 : a.priority === "low" ? 2 : 1;
          const orderB =
            b.priority === "high" ? 0 : b.priority === "low" ? 2 : 1;
          return orderA - orderB;
        });
        pendingList = pendingTodos;

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
      }

      setTodoStats({
        completed: tCompleted,
        total: tTotal,
        pending: pendingList,
      });

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
      } catch {
        // ignore
      }
    } catch {
      // ignore
    }
  }, []);

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

        const nextTodos = Object.fromEntries(
          Object.entries(parsed.todos || {}).map(([listId, listTodos]) => [
            listId,
            listTodos.map((todo) => {
              if (todo.id !== todoId) {
                return todo;
              }

              reminderIdsToClear = todo.notificationIds ?? [];
              return { ...todo, completed: true };
            }),
          ]),
        ) as Record<string, Todo[]>;

        await cancelReminderIds(reminderIdsToClear);
        await addXp(10).catch(() => {});
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

        await loadDashboardData();
        await syncWidgetData().catch(() => {});
        emitStateChange("tasks_changed");

        // show undo snackbar — restore previous todo state when undone
        try {
          if (showUndo) {
            showUndo({
              message: "Pebble added.",
              actionLabel: "Undo",
              onUndo: async () => {
                try {
                  if (!prevTodo) return;
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

        const nextHabits = (parsed.dailyHabits || []).map((habit) => {
          if (habit.id !== habitId) return habit;

          const completed = !habit.completedToday;
          let streak = habit.streak || 0;
          if (completed) {
            streak += 1;
          } else {
            streak = Math.max(0, streak - 1);
          }

          return {
            ...habit,
            completedToday: completed,
            streak,
            bestStreak: Math.max(habit.bestStreak || 0, streak),
            lastCompletedDate: completed ? today : habit.lastCompletedDate,
          };
        });

        // Award +15 XP bonus for completing habit
        await addXp(15).catch(() => {});
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});

        await AsyncStorage.setItem(
          DAILY_STORAGE_KEY,
          JSON.stringify({ dailyHabits: nextHabits }),
        );

        // Record history snapshot
        const {
          recordDailyHistorySnapshot,
        } = require("@/services/productivityHistory");
        void recordDailyHistorySnapshot();

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

  // Synchronize dashboard state immediately when tasks/habits are modified in other tabs/modals
  useEffect(() => {
    const unsubscribeTasks = addStateListener("tasks_changed", () => {
      void loadDashboardData();
    });

    const unsubscribeHabits = addStateListener("habits_changed", () => {
      void loadDashboardData();
    });

    return () => {
      unsubscribeTasks();
      unsubscribeHabits();
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
          />

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
    </SafeAreaView>
  );
}

const styleOverrides = {
  safeAreaBg: {
    backgroundColor: "transparent",
  },
};
