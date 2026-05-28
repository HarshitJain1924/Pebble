import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Dimensions,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { FloatingGlow } from "@/components/AmbientBackground";
import { AnimatedCheckbox } from "@/components/AnimatedCheckbox";
import { AppCard } from "@/components/AppCard";
import { DashboardEmptyGraphic } from "@/components/AppGraphics";
import { ProgressRing } from "@/components/ProgressRing";
import { ScreenSwipeWrapper } from "@/components/ScreenSwipeWrapper";
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
import * as Haptics from "expo-haptics";

const getDateKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_GAP = 10;
const CARD_WIDTH = (SCREEN_WIDTH - 32 - CARD_GAP) / 2; // 2 columns (pill widgets)

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
};
type Habit = {
  id: string;
  title: string;
  streak: number;
  bestStreak: number;
  completedToday: boolean;
  lastCompletedDate?: string;
  priority?: "low" | "medium" | "high";
};

// ─── Mini SVG Category Illustrations ────────────────────────────
function WorkMiniSvg() {
  return (
    <Svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <Rect
        x="4"
        y="6"
        width="24"
        height="16"
        rx="3"
        fill="#3b82f6"
        fillOpacity={0.25}
      />
      <Rect x="6" y="8" width="10" height="2" rx="1" fill="#60a5fa" />
      <Rect
        x="6"
        y="12"
        width="16"
        height="1.5"
        rx="0.75"
        fill="#3b82f6"
        fillOpacity={0.3}
      />
      <Circle cx="16" cy="12" r="3" fill="#34d399" fillOpacity={0.5} />
    </Svg>
  );
}

function HealthMiniSvg() {
  return (
    <Svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <Path
        d="M16 26C16 26 6 20 6 13C6 10 8.5 7 11.5 7C13.5 7 15 8.5 16 10C17 8.5 18.5 7 20.5 7C23.5 7 26 10 26 13C26 20 16 26 16 26Z"
        fill="#f43f5e"
        fillOpacity={0.25}
        stroke="#f43f5e"
        strokeWidth="1.2"
      />
      <Path
        d="M12 15L15 18L21 12"
        stroke="#f43f5e"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function LearningMiniSvg() {
  return (
    <Svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <Path
        d="M6 12L16 7L26 12L16 17L6 12Z"
        fill="#a855f7"
        fillOpacity={0.25}
        stroke="#a855f7"
        strokeWidth="1"
      />
      <Path
        d="M10 14V21C10 21 12.5 24 16 24C19.5 24 22 21 22 21V14"
        stroke="#a855f7"
        strokeWidth="1.2"
        fill="none"
      />
      <Path
        d="M26 12V20"
        stroke="#a855f7"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function CreativeMiniSvg() {
  return (
    <Svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <Circle
        cx="12"
        cy="14"
        r="6"
        fill="#f59e0b"
        fillOpacity={0.2}
        stroke="#f59e0b"
        strokeWidth="1"
      />
      <Circle
        cx="20"
        cy="14"
        r="6"
        fill="#ef4444"
        fillOpacity={0.15}
        stroke="#ef4444"
        strokeWidth="1"
      />
      <Circle
        cx="16"
        cy="20"
        r="6"
        fill="#3b82f6"
        fillOpacity={0.15}
        stroke="#3b82f6"
        strokeWidth="1"
      />
    </Svg>
  );
}

function FocusMiniSvg() {
  return (
    <Svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <Circle
        cx="16"
        cy="16"
        r="10"
        stroke="#06b6d4"
        strokeWidth="1.5"
        strokeOpacity={0.3}
      />
      <Circle
        cx="16"
        cy="16"
        r="6"
        stroke="#06b6d4"
        strokeWidth="1.2"
        strokeOpacity={0.5}
      />
      <Circle cx="16" cy="16" r="2.5" fill="#06b6d4" fillOpacity={0.6} />
      <Path
        d="M16 4V8"
        stroke="#06b6d4"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <Path
        d="M16 24V28"
        stroke="#06b6d4"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <Path
        d="M4 16H8"
        stroke="#06b6d4"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <Path
        d="M24 16H28"
        stroke="#06b6d4"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function PersonalMiniSvg() {
  return (
    <Svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <Circle cx="16" cy="12" r="4" fill="#f97316" fillOpacity={0.28} />
      <Path
        d="M8 24C8 20.5 11 18 16 18C21 18 24 20.5 24 24"
        stroke="#f97316"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <Path
        d="M12 12C12 14.2 13.8 16 16 16C18.2 16 20 14.2 20 12"
        stroke="#f97316"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CategoryBackgroundSvg({
  catKey,
  color,
}: {
  catKey: string;
  color: string;
}) {
  const colorScheme = useColorScheme();
  const isLight = colorScheme === "light";
  const op = isLight
    ? {
        fill: 0.16,
        fillMedium: 0.22,
        fillStrong: 0.28,
        stroke: 0.26,
        strokeStrong: 0.38,
      }
    : {
        fill: 0.04,
        fillMedium: 0.06,
        fillStrong: 0.08,
        stroke: 0.1,
        strokeStrong: 0.15,
      };

  if (catKey === "work") {
    return (
      <View style={styles.catBgDecorator}>
        <Svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <Rect
            x="10"
            y="30"
            width="30"
            height="40"
            rx="3"
            fill={color}
            fillOpacity={op.fillMedium}
          />
          <Rect
            x="45"
            y="15"
            width="25"
            height="55"
            rx="3"
            fill={color}
            fillOpacity={op.fillStrong}
          />
          <Circle
            cx="60"
            cy="15"
            r="10"
            stroke={color}
            strokeWidth="1"
            strokeOpacity={op.stroke}
          />
          <Path
            d="M10 50 L35 40 L50 60 L70 30"
            stroke={color}
            strokeWidth="1.2"
            strokeOpacity={op.strokeStrong}
            strokeDasharray="3 3"
          />
        </Svg>
      </View>
    );
  }
  if (catKey === "personal") {
    return (
      <View style={styles.catBgDecorator}>
        <Svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <Path
            d="M10 50 L40 20 L70 50 Z"
            stroke={color}
            strokeWidth="1"
            strokeOpacity={op.stroke}
          />
          <Circle cx="40" cy="45" r="16" fill={color} fillOpacity={op.fill} />
          <Path
            d="M40 35 L43 41 L49 42 L45 46 L46 52 L40 49 L34 52 L35 46 L31 42 L37 41 Z"
            fill={color}
            fillOpacity={op.fillStrong}
          />
        </Svg>
      </View>
    );
  }
  if (catKey === "health") {
    return (
      <View style={styles.catBgDecorator}>
        <Svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <Path
            d="M5 45 L20 45 L26 25 L34 60 L42 35 L48 48 L54 45 L75 45"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={op.strokeStrong}
          />
          <Circle cx="34" cy="60" r="4" fill={color} fillOpacity={op.stroke} />
          <Circle cx="26" cy="25" r="4" fill={color} fillOpacity={op.stroke} />
        </Svg>
      </View>
    );
  }
  if (catKey === "learning") {
    return (
      <View style={styles.catBgDecorator}>
        <Svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <Path
            d="M10 25 C30 20, 50 30, 70 25 L70 65 C50 70, 30 60, 10 65 Z"
            fill={color}
            fillOpacity={op.fill}
            stroke={color}
            strokeWidth="0.8"
            strokeOpacity={op.fillStrong}
          />
          <Path
            d="M40 25 L40 63"
            stroke={color}
            strokeWidth="1"
            strokeOpacity={op.stroke}
          />
          <Circle
            cx="55"
            cy="45"
            r="12"
            stroke={color}
            strokeWidth="1.2"
            strokeOpacity={op.fillStrong}
            strokeDasharray="2 2"
          />
        </Svg>
      </View>
    );
  }
  if (catKey === "creative") {
    return (
      <View style={styles.catBgDecorator}>
        <Svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <Circle
            cx="40"
            cy="35"
            r="18"
            fill={color}
            fillOpacity={op.fill}
            stroke={color}
            strokeWidth="1"
            strokeOpacity={op.fillStrong}
          />
          <Path
            d="M40 53 C40 53 45 42 45 35 M40 53 C40 53 35 42 35 35"
            stroke={color}
            strokeWidth="1.2"
            strokeOpacity={op.stroke}
          />
          <Path
            d="M34 56 H46"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeOpacity={op.stroke}
          />
          <Path
            d="M40 10 V15 M15 35 H20 M60 35 H65 M22 22 L26 26 M58 22 L54 26"
            stroke={color}
            strokeWidth="1"
            strokeLinecap="round"
            strokeOpacity={op.strokeStrong}
          />
        </Svg>
      </View>
    );
  }
  if (catKey === "focus") {
    return (
      <View style={styles.catBgDecorator}>
        <Svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <Circle
            cx="40"
            cy="40"
            r="28"
            stroke={color}
            strokeWidth="1"
            strokeOpacity={op.fillMedium}
          />
          <Circle
            cx="40"
            cy="40"
            r="18"
            stroke={color}
            strokeWidth="1.2"
            strokeOpacity={op.stroke}
            strokeDasharray="3 3"
          />
          <Circle
            cx="40"
            cy="40"
            r="8"
            fill={color}
            fillOpacity={op.fillStrong}
          />
          <Path
            d="M40 5 V20 M40 60 V75 M5 40 H20 M60 40 H75"
            stroke={color}
            strokeWidth="1.2"
            strokeOpacity={op.stroke}
          />
        </Svg>
      </View>
    );
  }
  return null;
}

// ─── Category Config ────────────────────────────────────────────
type CategoryConfig = {
  key: string;
  name: string;
  bg: string;
  textColor: string;
  countColor: string;
  icon: React.ReactNode;
  route: string;
  routeParam?: string;
};

const CATEGORY_CONFIG: CategoryConfig[] = [
  {
    key: "work",
    name: "Work",
    bg: "rgba(99, 102, 241, 0.10)",
    textColor: "#c7d2fe",
    countColor: "#a5b4fc",
    icon: <WorkMiniSvg />,
    route: "/tasks",
    routeParam: "category=work",
  },
  {
    key: "personal",
    name: "Personal",
    bg: "rgba(16, 185, 129, 0.08)",
    textColor: "#bbf7d0",
    countColor: "#86efac",
    icon: <PersonalMiniSvg />,
    route: "/tasks",
    routeParam: "category=personal",
  },
  {
    key: "health",
    name: "Health",
    bg: "rgba(245, 158, 11, 0.08)",
    textColor: "#fde68a",
    countColor: "#fcd34d",
    icon: <HealthMiniSvg />,
    route: "/tasks",
    routeParam: "category=health",
  },
  {
    key: "learning",
    name: "Learning",
    bg: "rgba(59, 130, 246, 0.08)",
    textColor: "#bfdbfe",
    countColor: "#93c5fd",
    icon: <LearningMiniSvg />,
    route: "/tasks",
    routeParam: "category=learning",
  },
  {
    key: "creative",
    name: "Creative",
    bg: "rgba(168, 85, 247, 0.08)",
    textColor: "#e9d5ff",
    countColor: "#c084fc",
    icon: <CreativeMiniSvg />,
    route: "/tasks",
    routeParam: "category=creative",
  },
  {
    key: "focus",
    name: "Focus",
    bg: "rgba(6, 182, 212, 0.08)",
    textColor: "#a5f3fc",
    countColor: "#67e8f9",
    icon: <FocusMiniSvg />,
    route: "/tasks",
    routeParam: "category=focus",
  },
];

export default function DashboardScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const router = useRouter();

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
          lists?: { id: string; name: string }[];
          todos?: Record<string, Todo[]>;
        };
        const allTodos = Object.values(parsed.todos || {}).flat();
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
        pendingList = pendingTodos.slice(0, 3);

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

      if (rawHabits) {
        const parsed = JSON.parse(rawHabits) as { dailyHabits: Habit[] };
        const allHabits = parsed.dailyHabits || [];
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
        maxStreak = allHabits.reduce(
          (max, h) => Math.max(max, h.streak || 0),
          0,
        );
      }

      setPendingHabits(unfinishedHabitsList);
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

  const totalItems = todoStats.total + habitStats.total;
  const completedItems = todoStats.completed + habitStats.completed;
  const progressPct = totalItems === 0 ? 0 : completedItems / totalItems;

  const displayedTodos = todoStats.pending.filter((t) => {
    if (selectedPriorityFilter === "all") return true;
    return t.priority === selectedPriorityFilter;
  });

  const displayedHabits = pendingHabits.filter((h) => {
    if (selectedPriorityFilter === "all") return true;
    return h.priority === selectedPriorityFilter;
  });

  // Short, breathing Aura message
  const getAuraMessage = () => {
    const hour = new Date().getHours();
    const pending = totalItems - completedItems;

    if (totalItems === 0)
      return "Your day is a blank canvas. Start with one intention.";
    if (completedItems === totalItems)
      return "Everything done. You've earned your rest. ✨";

    if (hour >= 5 && hour < 12) {
      if (pending <= 2)
        return "Almost there — just a couple left to crush this morning.";
      return "Morning clarity. Your best focus hours are now.";
    }
    if (hour >= 12 && hour < 17) {
      return `${pending} things left. A short focus block can clear half.`;
    }
    if (hour >= 17 && hour < 21) {
      return "Wind down strong — finish what matters most tonight.";
    }
    return "Late hours. Rest well, tomorrow's a fresh start.";
  };

  const getGreetingTime = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "Good morning";
    if (hour >= 12 && hour < 17) return "Good afternoon";
    if (hour >= 17 && hour < 21) return "Good evening";
    return "Late night";
  };

  return (
    <ScreenSwipeWrapper nextRoute="/tasks">
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: "transparent" }]}
      >
        <Animated.View
          entering={FadeInDown.duration(400).springify()}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* ─── Header ─── */}
            <Animated.View
              entering={FadeInUp.delay(50).duration(500)}
              style={styles.header}
            >
              <View style={styles.greetingWrap}>
                <Text
                  style={[styles.greetingTime, { color: colors.textMuted }]}
                >
                  {getGreetingTime()}
                </Text>
                <Text style={[styles.greeting, { color: colors.text }]}>
                  {profile ? profile.name : "User"} 👋
                </Text>
              </View>
              <View style={styles.headerRight}>
                <Pressable
                  style={({ pressed }) => [
                    styles.bellButton,
                    {
                      borderColor: colors.border,
                      backgroundColor:
                        colorScheme === "light"
                          ? "#FFFFFF"
                          : "rgba(255,255,255,0.05)",
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Open notifications"
                  onPress={() => router.push("/notifications" as any)}
                >
                  <Feather name="bell" size={16} color={colors.textMuted} />
                  {(nextReminder || hasUnreadNotifs) && (
                    <View
                      style={[
                        styles.bellDot,
                        {
                          backgroundColor: colors.primary,
                          borderColor:
                            colorScheme === "light" ? "#FFFFFF" : "#18181B",
                          top: 2,
                          right: 2,
                        },
                      ]}
                    />
                  )}
                </Pressable>

                <Pressable
                  style={styles.profileHeaderWrap}
                  accessibilityRole="button"
                  accessibilityLabel="Open profile"
                  onPress={() => router.push("/profile" as any)}
                >
                  <View
                    style={[
                      styles.profileHeaderCircle,
                      {
                        borderColor: colors.border,
                        backgroundColor:
                          colorScheme === "light"
                            ? "#FFFFFF"
                            : "rgba(255,255,255,0.05)",
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 16 }}>
                      {profile ? profile.avatar : "👨‍💻"}
                    </Text>
                    {hasUnreadNotifs && (
                      <View
                        style={[
                          styles.avatarNotifDot,
                          { backgroundColor: colors.primary },
                        ]}
                      />
                    )}
                  </View>
                  <View
                    style={[
                      styles.profileHeaderBadge,
                      {
                        backgroundColor: colors.primary,
                      },
                    ]}
                  >
                    <Text style={styles.profileHeaderBadgeText}>
                      {profile ? `Lvl ${profile.level}` : "Lvl 1"}
                    </Text>
                  </View>
                </Pressable>
              </View>
            </Animated.View>

            {/* ─── Hero Aura Card ─── */}
            <Animated.View entering={FadeInUp.delay(100).duration(500)}>
              <View
                style={[
                  styles.heroCard,
                  {
                    backgroundColor: "rgba(99, 102, 241, 0.06)",
                    borderColor: "rgba(99, 102, 241, 0.12)",
                  },
                ]}
              >
                <View style={styles.heroGlowWrap}>
                  <FloatingGlow
                    color={colors.primary}
                    size={100}
                    opacity={0.12}
                    pulseSpeed={8000}
                    style={{ position: "absolute", left: -20, top: -20 }}
                  />
                </View>
                <View style={styles.heroContent}>
                  <View style={styles.heroIconRow}>
                    <View
                      style={[
                        styles.auraChip,
                        { backgroundColor: "rgba(99, 102, 241, 0.15)" },
                      ]}
                    >
                      <Feather
                        name="cpu"
                        size={11}
                        color={colors.primaryLight}
                      />
                      <Text
                        style={[
                          styles.auraChipText,
                          { color: colors.primaryLight },
                        ]}
                      >
                        AURA
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.heroText, { color: colors.text }]}>
                    {getAuraMessage()}
                  </Text>
                </View>
              </View>
            </Animated.View>

            {/* ─── Category Grid (3×2) ─── */}
            <Animated.View entering={FadeInUp.delay(180).duration(500)}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                CATEGORIES
              </Text>
              <View style={styles.categoryGrid}>
                {CATEGORY_CONFIG.map((cat) => {
                  const count = categoryCounts[cat.key] || 0;
                  const countLabel =
                    cat.key === "focus" ? `${count}` : `${count}`;

                  const isLight = colorScheme === "light";
                  let bg = cat.bg;
                  let textColor = cat.textColor;
                  let countColor = cat.countColor;

                  if (isLight) {
                    const lightBgs: Record<string, string> = {
                      work: "rgba(99, 102, 241, 0.08)",
                      personal: "rgba(16, 185, 129, 0.06)",
                      health: "rgba(245, 158, 11, 0.06)",
                      learning: "rgba(59, 130, 246, 0.06)",
                      creative: "rgba(168, 85, 247, 0.06)",
                      focus: "rgba(6, 182, 212, 0.06)",
                    };
                    bg = lightBgs[cat.key] ?? bg;

                    const lightText: Record<string, string> = {
                      work: "#312E81",
                      personal: "#065F46",
                      health: "#78350F",
                      learning: "#1E3A8A",
                      creative: "#581C87",
                      focus: "#164E63",
                    };
                    textColor = lightText[cat.key] ?? colors.text;

                    const lightCounts: Record<string, string> = {
                      work: "#4F46E5",
                      personal: "#059669",
                      health: "#D97706",
                      learning: "#2563EB",
                      creative: "#7C3AED",
                      focus: "#0891B2",
                    };
                    countColor = lightCounts[cat.key] ?? colors.primary;
                  }

                  return (
                    <Pressable
                      key={cat.key}
                      onPress={() => {
                        if (cat.routeParam) {
                          router.push(`${cat.route}?${cat.routeParam}` as any);
                        } else {
                          router.push(cat.route as any);
                        }
                      }}
                      style={({ pressed }) => [
                        styles.categoryCard,
                        {
                          backgroundColor: bg,
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}
                    >
                      <CategoryBackgroundSvg
                        catKey={cat.key}
                        color={countColor}
                      />
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          zIndex: 1,
                        }}
                      >
                        <View style={styles.catIconWrap}>{cat.icon}</View>
                        <Text
                          style={[
                            styles.catName,
                            { color: textColor, marginTop: 0 },
                          ]}
                        >
                          {cat.name}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.catCount,
                          { color: countColor, zIndex: 1 },
                        ]}
                      >
                        {countLabel}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>

            {/* ─── Progress Overview ─── */}
            <Animated.View entering={FadeInUp.delay(260).duration(500)}>
              <AppCard style={styles.progressCard}>
                <View style={styles.progressLeft}>
                  <Text style={[styles.cardKicker, { color: colors.primary }]}>
                    TODAY
                  </Text>
                  <Text style={[styles.progressTitle, { color: colors.text }]}>
                    {completedItems}/{totalItems} completed
                  </Text>
                  <Text
                    style={[styles.progressSub, { color: colors.textMuted }]}
                  >
                    {totalItems === 0
                      ? "No tasks yet"
                      : `${Math.round(progressPct * 100)}% of today's goals`}
                  </Text>
                </View>
                <View
                  style={{ justifyContent: "center", alignItems: "center" }}
                >
                  <FloatingGlow
                    color={colors.primary}
                    size={100}
                    opacity={0.12}
                    pulseSpeed={7000}
                    style={{ position: "absolute" }}
                  />
                  <ProgressRing
                    progress={progressPct}
                    size={80}
                    strokeWidth={7}
                  />
                </View>
              </AppCard>
            </Animated.View>

            {/* ─── Today Insight Strip ─── */}
            <Animated.View entering={FadeInUp.delay(300).duration(500)}>
              <View
                style={[
                  styles.insightStrip,
                  {
                    borderColor: colors.border,
                    backgroundColor:
                      colorScheme === "light"
                        ? "#FFFFFF"
                        : "rgba(255,255,255,0.02)",
                  },
                ]}
              >
                <View style={styles.insightPill}>
                  <Feather name="clock" size={12} color={colors.primary} />
                  <Text style={[styles.insightText, { color: colors.text }]}>
                    Focus first, then clear the rest
                  </Text>
                </View>
                <Text style={[styles.insightMeta, { color: colors.textMuted }]}>
                  {nextReminder
                    ? `Next reminder ${nextReminder}`
                    : "No reminder scheduled"}
                </Text>
              </View>
            </Animated.View>

            {/* ─── Ongoing Tasks & Habits Segment ─── */}
            <Animated.View entering={FadeInUp.delay(340).duration(500)}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Ongoing Intention
                </Text>
                <Pressable
                  onPress={() =>
                    router.push(
                      activeSegment === "tasks"
                        ? "/tasks?segment=tasks"
                        : ("/tasks?segment=habits" as any),
                    )
                  }
                >
                  <Text
                    style={{
                      color: colors.primary,
                      fontWeight: "600",
                      fontSize: 13,
                    }}
                  >
                    See all
                  </Text>
                </Pressable>
              </View>

              {/* Segment Toggle Picker */}
              <View
                style={[
                  styles.segmentContainer,
                  {
                    backgroundColor:
                      colorScheme === "light" ? "#E2E8F0" : "#27272A",
                  },
                ]}
              >
                <Pressable
                  style={({ pressed }) => [
                    styles.segmentButton,
                    activeSegment === "tasks" && [
                      styles.segmentActive,
                      { backgroundColor: colors.primary },
                    ],
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(
                      Haptics.ImpactFeedbackStyle.Light,
                    ).catch(() => {});
                    setActiveSegment("tasks");
                  }}
                >
                  <Feather
                    name="edit-3"
                    size={13}
                    color={
                      activeSegment === "tasks" ? "#FFFFFF" : colors.textMuted
                    }
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.segmentText,
                      {
                        color:
                          activeSegment === "tasks"
                            ? "#FFFFFF"
                            : colors.textMuted,
                        fontWeight: activeSegment === "tasks" ? "700" : "600",
                      },
                    ]}
                  >
                    Tasks ({todoStats.pending.length})
                  </Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.segmentButton,
                    activeSegment === "habits" && [
                      styles.segmentActive,
                      { backgroundColor: colors.primary },
                    ],
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(
                      Haptics.ImpactFeedbackStyle.Light,
                    ).catch(() => {});
                    setActiveSegment("habits");
                  }}
                >
                  <Feather
                    name="activity"
                    size={13}
                    color={
                      activeSegment === "habits" ? "#FFFFFF" : colors.textMuted
                    }
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.segmentText,
                      {
                        color:
                          activeSegment === "habits"
                            ? "#FFFFFF"
                            : colors.textMuted,
                        fontWeight: activeSegment === "habits" ? "700" : "600",
                      },
                    ]}
                  >
                    Habits ({pendingHabits.length})
                  </Text>
                </Pressable>
              </View>

              {/* Priority Filter Bar */}
              <View style={styles.filterPillsRow}>
                {[
                  { key: "all", label: "All Priorities" },
                  { key: "high", label: "🔴 High" },
                  { key: "medium", label: "🟡 Medium" },
                  { key: "low", label: "🟢 Low" },
                ].map((p) => {
                  const isSelected = selectedPriorityFilter === p.key;
                  return (
                    <Pressable
                      key={p.key}
                      onPress={() => {
                        Haptics.impactAsync(
                          Haptics.ImpactFeedbackStyle.Light,
                        ).catch(() => {});
                        setSelectedPriorityFilter(p.key as any);
                      }}
                      style={[
                        styles.filterPill,
                        {
                          backgroundColor: isSelected
                            ? colorScheme === "light"
                              ? "#E2E8F0"
                              : "#27272A"
                            : "transparent",
                          borderColor: isSelected
                            ? colors.primary
                            : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterPillText,
                          {
                            color: isSelected ? colors.text : colors.textMuted,
                            fontWeight: isSelected ? "700" : "500",
                          },
                        ]}
                      >
                        {p.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {activeSegment === "tasks" ? (
                displayedTodos.length > 0 ? (
                  <View style={styles.tasksList}>
                    {displayedTodos.map((todo, idx) => {
                      const subtasks = todo.subtasks || [];
                      const totalSubs = subtasks.length;
                      const completedSubs = subtasks.filter(
                        (s) => s.completed,
                      ).length;

                      const catColors = [
                        {
                          bg: "rgba(99, 102, 241, 0.08)",
                          accent: colors.primary,
                        },
                        {
                          bg: "rgba(16, 185, 129, 0.08)",
                          accent: colors.success,
                        },
                        {
                          bg: "rgba(245, 158, 11, 0.08)",
                          accent: colors.warning,
                        },
                      ];
                      const catC = catColors[idx % catColors.length];

                      return (
                        <AppCard
                          key={todo.id}
                          style={[
                            styles.taskCard,
                            { borderColor: colors.border },
                          ]}
                          onPress={() => router.push("/tasks" as any)}
                        >
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
                              },
                            ]}
                          />
                          <View style={styles.taskContent}>
                            <Text
                              style={[styles.taskTitle, { color: colors.text }]}
                              numberOfLines={1}
                            >
                              {todo.title}
                            </Text>
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                                flexWrap: "wrap",
                                marginTop: 4,
                              }}
                            >
                              {todo.category && (
                                <View
                                  style={[
                                    styles.catBadge,
                                    { backgroundColor: `${catC.accent}12` },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.catBadgeText,
                                      { color: catC.accent },
                                    ]}
                                  >
                                    {todo.category.toUpperCase()}
                                  </Text>
                                </View>
                              )}
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
                                        fontWeight: "800",
                                      },
                                    ]}
                                  >
                                    {todo.priority.toUpperCase()}
                                  </Text>
                                </View>
                              )}
                              {totalSubs > 0 && (
                                <Text
                                  style={[
                                    styles.taskMeta,
                                    { color: colors.textMuted },
                                  ]}
                                >
                                  {completedSubs}/{totalSubs} subtasks
                                </Text>
                              )}
                              {todo.alarmTime &&
                                todo.alarmTime > Date.now() && (
                                  <View
                                    style={{
                                      flexDirection: "row",
                                      alignItems: "center",
                                      gap: 3,
                                    }}
                                  >
                                    <Feather
                                      name="clock"
                                      size={11}
                                      color={colors.textMuted}
                                    />
                                    <Text
                                      style={[
                                        styles.taskMeta,
                                        { color: colors.textMuted },
                                      ]}
                                    >
                                      {new Date(
                                        todo.alarmTime,
                                      ).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </Text>
                                  </View>
                                )}
                            </View>
                          </View>
                          <AnimatedCheckbox
                            checked={false}
                            onToggle={() => completeTodoFromDashboard(todo.id)}
                            size={24}
                          />
                        </AppCard>
                      );
                    })}
                  </View>
                ) : (
                  <View
                    style={[styles.emptyTasks, { borderColor: colors.border }]}
                  >
                    <DashboardEmptyGraphic />
                    <Text
                      style={[styles.emptyText, { color: colors.textMuted }]}
                    >
                      All caught up! Enjoy your moment.
                    </Text>
                  </View>
                )
              ) : displayedHabits.length > 0 ? (
                <View style={styles.tasksList}>
                  {displayedHabits.map((habit) => {
                    return (
                      <AppCard
                        key={habit.id}
                        style={[
                          styles.taskCard,
                          { borderColor: colors.border },
                        ]}
                        onPress={() =>
                          router.push("/tasks?segment=habits" as any)
                        }
                      >
                        <View
                          style={[
                            styles.taskAccent,
                            {
                              backgroundColor:
                                habit.priority === "high"
                                  ? colors.error
                                  : habit.priority === "low"
                                    ? colors.success
                                    : colors.warning,
                            },
                          ]}
                        />
                        <View style={styles.taskContent}>
                          <Text
                            style={[styles.taskTitle, { color: colors.text }]}
                            numberOfLines={1}
                          >
                            {habit.title}
                          </Text>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                              flexWrap: "wrap",
                              marginTop: 4,
                            }}
                          >
                            <View
                              style={[
                                styles.catBadge,
                                { backgroundColor: "rgba(245, 158, 11, 0.08)" },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.catBadgeText,
                                  { color: colors.warning },
                                ]}
                              >
                                🔥 {habit.streak}D STREAK
                              </Text>
                            </View>
                            {habit.priority && (
                              <View
                                style={[
                                  styles.catBadge,
                                  {
                                    backgroundColor:
                                      habit.priority === "high"
                                        ? `${colors.error}15`
                                        : habit.priority === "low"
                                          ? `${colors.success}15`
                                          : `${colors.warning}15`,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.catBadgeText,
                                    {
                                      color:
                                        habit.priority === "high"
                                          ? colors.error
                                          : habit.priority === "low"
                                            ? colors.success
                                            : colors.warning,
                                      fontWeight: "800",
                                    },
                                  ]}
                                >
                                  {habit.priority.toUpperCase()}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                        <AnimatedCheckbox
                          checked={habit.completedToday}
                          onToggle={() => completeHabitFromDashboard(habit.id)}
                          size={24}
                        />
                      </AppCard>
                    );
                  })}
                </View>
              ) : (
                <View
                  style={[styles.emptyTasks, { borderColor: colors.border }]}
                >
                  <DashboardEmptyGraphic />
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                    {"All habits checked off today! You're on fire!"}
                  </Text>
                </View>
              )}
            </Animated.View>

            {/* duplicate nav/reminder blocks removed */}
          </ScrollView>
        </Animated.View>
      </SafeAreaView>
    </ScreenSwipeWrapper>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, paddingTop: Platform.OS === "android" ? 44 : 0 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 20,
    paddingBottom: 120,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  greetingWrap: { gap: 2 },
  greetingTime: { fontSize: 13, fontWeight: "500" },
  greeting: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },

  profileHeaderWrap: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  profileHeaderCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  avatarNotifDot: {
    position: "absolute",
    top: 1,
    right: 1,
    width: 8,
    height: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bellButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
    borderWidth: 1,
  },
  bellDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  profileHeaderBadge: {
    position: "absolute",
    top: -1,
    right: -3,
    minWidth: 18,
    height: 14,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  profileHeaderBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    color: "#ffffff",
    lineHeight: 12,
  },

  // Hero Aura
  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    overflow: "hidden",
  },
  heroGlowWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
  },
  heroContent: { gap: 8 },
  heroIconRow: { flexDirection: "row", alignItems: "center" },
  auraChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  auraChipText: { fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },
  heroText: { fontSize: 16, fontWeight: "600", lineHeight: 22 },

  // Categories
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: CARD_GAP,
  },
  categoryCard: {
    width: CARD_WIDTH,
    height: 56,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  catIconWrap: { alignSelf: "center" },
  catName: { fontSize: 12, fontWeight: "700", marginTop: 0 },
  catCount: { fontSize: 16, fontWeight: "800" },
  catBgDecorator: {
    position: "absolute",
    right: -8,
    bottom: -14,
    zIndex: 0,
  },

  // Progress
  progressCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
  },
  progressLeft: { gap: 4, flex: 1, paddingRight: 12 },
  cardKicker: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5 },
  progressTitle: { fontSize: 20, fontWeight: "800" },
  progressSub: { fontSize: 13, fontWeight: "500" },

  // Insight
  insightStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  insightPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  insightText: { fontSize: 13, fontWeight: "600" },
  insightMeta: { fontSize: 11, fontWeight: "500" },

  // Tasks
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700" },
  tasksList: { gap: 8 },
  taskCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  taskAccent: {
    width: 4,
    height: 28,
    borderRadius: 2,
  },
  taskContent: { flex: 1, gap: 2 },
  taskTitle: { fontSize: 14, fontWeight: "600" },
  taskMeta: { fontSize: 12, fontWeight: "500" },
  catBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  catBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  todoCompleteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTasks: {
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 20,
    padding: 28,
    justifyContent: "center",
  },
  emptyText: { fontSize: 13, fontWeight: "500" },

  segmentContainer: {
    flexDirection: "row",
    borderRadius: 14,
    padding: 4,
    marginBottom: 12,
  },
  segmentButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
  },
  segmentActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "600",
  },
  filterPillsRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 11,
  },

  // Quick Actions
  quickRow: {
    flexDirection: "row",
    gap: 10,
  },
  quickCard: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  quickLabel: { fontSize: 13, fontWeight: "700" },
  quickSub: { fontSize: 10, fontWeight: "500" },

  // Reminder
  reminderCard: { padding: 14 },
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  reminderIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  reminderTitle: { fontSize: 14, fontWeight: "700" },
  reminderSub: { fontSize: 12, fontWeight: "500" },

  // FAB
});
