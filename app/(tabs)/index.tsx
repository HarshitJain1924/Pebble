import {
    AppText as Text,
    AppTextInput as TextInput,
} from "@/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Dimensions,
    Modal,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import Animated, {
    FadeInDown,
    interpolateColor,
    runOnJS,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from "react-native-reanimated";

import { AnimatedCheckbox } from "@/components/AnimatedCheckbox";
import { InteractivePebbleJar } from "@/components/profile/InteractivePebbleJar";
import PressableScale from "@/components/ui/PressableScale";
import { useUndo } from "@/components/ui/UndoContext";
import { styles } from "@/constants/dashboardStyles";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { normalizeHabitsForToday } from "@/services/habitService";
import { isRecurringOccurrenceForDate } from "@/services/recurrence";
import { cancelReminderIds } from "@/services/reminders";
import {
    handleHabitXpChange,
    handleTaskXpChange,
    type UserProfile,
} from "@/services/settingsService";
import { addStateListener, emitStateChange } from "@/services/stateEvents";
import {
    appendGratitudeHistoryEntry,
    getCollections,
    getDashboardFilters,
    saveDashboardFilter,
} from "@/services/storage";
import {
    normalizeTaskCategory,
    TASK_CATEGORY_KEYS
} from "@/services/taskCategories";
import {
    ActivityRepository,
    FolderRepository,
} from "@/services/core/repositories";
import * as Haptics from "expo-haptics";

// Reusable UI components
import {
    CategoryChip,
    PriorityIndicator,
    StatusBadge,
} from "@/components/design";
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const CARD_WIDTH = SCREEN_WIDTH - 24;
const CARD_MARGIN = 4;
const JAR_CONTAINER_WIDTH = 70;
const INNER_TEXT_WIDTH =
  SCREEN_WIDTH - 32 - 2 * CARD_MARGIN - 3 - JAR_CONTAINER_WIDTH;

const PEBBLE_SLOTS = [
  // Row 1 (bottom)
  { x: 3, b: 4 },
  { x: 9, b: 4 },
  { x: 15, b: 4 },
  { x: 21, b: 4 },
  { x: 27, b: 4 },
  { x: 33, b: 4 },
  // Row 2
  { x: 6, b: 11 },
  { x: 12, b: 11 },
  { x: 18, b: 11 },
  { x: 24, b: 11 },
  { x: 30, b: 11 },
  // Row 3
  { x: 3, b: 18 },
  { x: 9, b: 18 },
  { x: 15, b: 18 },
  { x: 21, b: 18 },
  { x: 27, b: 18 },
  { x: 33, b: 18 },
  // Row 4
  { x: 6, b: 25 },
  { x: 12, b: 25 },
  { x: 18, b: 25 },
  { x: 24, b: 25 },
  { x: 30, b: 25 },
];

const ProjectilePebble = ({
  startX,
  startY,
  endX,
  endY,
  onComplete,
  type,
}: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  onComplete: () => void;
  type: "task" | "habit";
}) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: 650 }, (finished) => {
      if (finished) {
        runOnJS(onComplete)();
      }
    });
  }, [progress, onComplete]);

  const animatedStyle = useAnimatedStyle(() => {
    const t = progress.value;
    const x = startX + (endX - startX) * t;
    // Parabolic arc curve
    const y = startY + (endY - startY) * t - 150 * 4 * t * (1 - t);
    const scale = 1 - 0.4 * t;
    const rotate = `${t * 360}deg`;

    return {
      position: "absolute",
      left: x - 12,
      top: y - 12,
      zIndex: 99999,
      transform: [{ scale }, { rotate }],
      opacity: 1 - t * t * t,
    };
  });

  return (
    <Animated.Text style={[animatedStyle, { fontSize: 24 }]}>
      {type === "habit" ? "🟡" : "🟣"}
    </Animated.Text>
  );
};

import {
    type Checklist,
    type Habit,
    type Todo
} from "@/modules/types";

export default function DashboardScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const router = useRouter();

  const { showUndo } = useUndo();

  const [flyingPebbles, setFlyingPebbles] = useState<
    { id: string; startX: number; startY: number; type: "task" | "habit" }[]
  >([]);
  const miniJarRef = useRef<View>(null);
  const parentScrollRef = useRef<ScrollView>(null);
  const [targetCoordinates, setTargetCoordinates] = useState<{
    x: number;
    y: number;
  }>({ x: 200, y: 150 });

  const handlePebbleAnimationComplete = useCallback((id: string) => {
    setFlyingPebbles((prev) => prev.filter((p) => p.id !== id));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const [lifetimePebbles, setLifetimePebbles] = useState<number>(0);
  const [monthlyPebbles, setMonthlyPebbles] = useState<number>(0);
  const [pebbleBalance, setPebbleBalance] = useState<number>(0);
  const [gemsBalance, setGemsBalance] = useState<number>(0);
  const [mainStreakRecoveryInfo, setMainStreakRecoveryInfo] =
    useState<any>(null);
  const [monthlyTypes, setMonthlyTypes] = useState<{
    task: number;
    habit: number;
    focus: number;
  }>({
    task: 0,
    habit: 0,
    focus: 0,
  });
  const [lifetimeTypes, setLifetimeTypes] = useState<{
    task: number;
    habit: number;
    focus: number;
  }>({
    task: 0,
    habit: 0,
    focus: 0,
  });
  const [fallingPebbleType, setFallingPebbleType] = useState<
    "task" | "habit" | "focus" | undefined
  >(undefined);
  const [streak, setStreak] = useState<number>(0);
  const [weeklyStatus, setWeeklyStatus] = useState<any[]>([]);
  const [pebbleJarModalVisible, setPebbleJarModalVisible] = useState(false);
  const [isZenModeActive, setIsZenModeActive] = useState(false);
  const [isReviewModalVisible, setIsReviewModalVisible] = useState(false);
  const [gratitudeText, setGratitudeText] = useState("");
  const [intentionText, setIntentionText] = useState("");
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
  const [selectedFolderFilter, setSelectedFolderFilter] =
    useState<string>("all");
  const [selectedSortOption, setSelectedSortOption] = useState<
    "default" | "priority" | "alphabetical"
  >("default");
  const [nextReminder, setNextReminder] = useState<string | null>(null);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>(
    {},
  );
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [hasUnreadNotifs, setHasUnreadNotifs] = useState<boolean>(false);
  const [folders, setFolders] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [allChecklists, setAllChecklists] = useState<
    Record<string, Checklist[]>
  >({});
  const [expandedChecklistIds, setExpandedChecklistIds] = useState<
    Record<string, boolean>
  >({});
  const [allCollections, setAllCollections] = useState<Record<string, any[]>>(
    {},
  );
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const jarFillAnim = useSharedValue(0);
  const cardScrollX = useSharedValue(0);
  const breathScale = useSharedValue(1);

  useEffect(() => {
    if (isZenModeActive) {
      breathScale.value = withRepeat(
        withSequence(
          withTiming(1.25, { duration: 4000 }),
          withTiming(1.0, { duration: 4000 }),
        ),
        -1,
        true,
      );
    } else {
      breathScale.value = 1;
    }
  }, [isZenModeActive]);

  const breathStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: breathScale.value }],
    };
  });

  const crowAnimatedStyle = useAnimatedStyle(() => {
    const ratio = Math.max(
      0,
      Math.min(1, cardScrollX.value / (INNER_TEXT_WIDTH || 1)),
    );
    return {
      opacity: ratio,
      transform: [{ scale: ratio }],
    };
  });

  const liquidAnimatedStyle = useAnimatedStyle(() => {
    const ratio = Math.max(
      0,
      Math.min(1, cardScrollX.value / (INNER_TEXT_WIDTH || 1)),
    );
    const todayY = 46 * (1 - jarFillAnim.value);
    const monthlyY = 46 * (1 - Math.min(100, monthlyPebbles) / 100);
    const translateY = todayY + (monthlyY - todayY) * ratio;

    // Sloshing rotation driven by sine of scroll offset
    const rotation = `${Math.sin(ratio * Math.PI) * 7}deg`;

    const backgroundColor = interpolateColor(
      cardScrollX.value,
      [0, INNER_TEXT_WIDTH || 1],
      [colors.primary, "#F59E0B"],
    );

    const opacity = 0.22 + (0.25 - 0.22) * ratio;

    return {
      transform: [{ translateY }, { rotate: rotation }],
      backgroundColor,
      opacity,
    };
  });

  const todayPebblesAnimatedStyle = useAnimatedStyle(() => {
    const ratio = Math.max(
      0,
      Math.min(1, cardScrollX.value / (INNER_TEXT_WIDTH || 1)),
    );
    return {
      opacity: 1 - ratio,
    };
  });

  const monthlyPebblesAnimatedStyle = useAnimatedStyle(() => {
    const ratio = Math.max(
      0,
      Math.min(1, cardScrollX.value / (INNER_TEXT_WIDTH || 1)),
    );
    return {
      opacity: ratio,
    };
  });

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      cardScrollX.value = event.contentOffset.x;
    },
  });
  const onJarLayout = useCallback(() => {
    setTimeout(() => {
      miniJarRef.current?.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          setTargetCoordinates({
            x: x + width / 2,
            y: y + height / 2,
          });
        }
      });
    }, 150);
  }, []);

  const loadDashboardData = useCallback(async () => {
    try {
      const todayStr = getDateKey();

      // 1. Load Folders and Tasks via Repositories
      const folderList = await FolderRepository.getFolders();
      const folderIds = Array.from(
        new Set(["default", "unassigned", ...folderList.map((f) => f.id)]),
      );

      const foldersData =
        folderList.length > 0
          ? folderList.map((f) => ({
              id: f.id,
              name: f.name,
              emoji: f.emoji || "📁",
              color: f.color || "#6366F1",
            }))
          : [
              {
                id: "default",
                name: "My Pebbles",
                emoji: "📋",
                color: "#6366F1",
              },
            ];
      setFolders(foldersData);

      let tCompleted = 0;
      let tTotal = 0;
      let pendingList: Todo[] = [];
      let closestAlarm: number | null = null;
      const nextCategoryCounts = Object.fromEntries(
        TASK_CATEGORY_KEYS.map((key) => [key, 0]),
      ) as Record<string, number>;

      const rawList: Todo[] = [];
      const rawHabitsList: Habit[] = [];

      for (const folderId of folderIds) {
        // Load tasks
        const tasksMap = await ActivityRepository.getTasks(folderId);
        Object.values(tasksMap).forEach((task) => {
          rawList.push({
            id: task.id,
            folderId,
            title: task.title,
            completed: task.completed,
            completedAt: task.completedAt,
            priority: task.priority || "medium",
            category: normalizeTaskCategory(task.category),
            createdAt: task.createdAt,
            archived: task.archived,
            description: task.description,
            scheduledDate: task.scheduledDate || "inbox",
            scheduledTime: task.scheduledTime,
            durationMinutes: task.durationMinutes,
            alarmTime: task.alarmTime,
            alarmId: task.alarmId,
            notificationIds: task.notificationIds,
          });
        });

        // Load habits
        const habitsMap = await ActivityRepository.getHabits(folderId);
        Object.values(habitsMap).forEach((habit) => {
          rawHabitsList.push({
            id: habit.id,
            folderId: habit.folderId || folderId,
            title: habit.title,
            completedToday: habit.completedDates?.includes(todayStr) || false,
            streak: habit.streak || 0,
            bestStreak: habit.bestStreak || 0,
            priority: habit.priority || "medium",
            category: normalizeTaskCategory(habit.category),
            createdAt: habit.createdAt,
            archived: habit.archived,
            reminderHour: habit.reminderHour,
            reminderMinute: habit.reminderMinute,
            reminderDays: habit.reminderDays,
            recurrence: habit.recurrence,
            notificationIds: habit.notificationIds,
          });
        });
      }

      const allTodos = rawList.filter((todo) => {
        if (todo.archived) return false;
        if (todo.scheduledDate === "inbox") {
          return true;
        }
        const todoDate = getTodoDateKey(todo);
        if (todoDate > todayStr) {
          return false;
        }
        return true;
      });

      // Separate today's tasks and overdue tasks
      const overdueTodos = allTodos.filter(
        (t) =>
          !t.completed &&
          getTodoDateKey(t) < todayStr &&
          getTodoDateKey(t) !== "inbox",
      );
      const todayTodos = allTodos.filter(
        (t) =>
          getTodoDateKey(t) === todayStr ||
          t.completed ||
          getTodoDateKey(t) === "inbox",
      );

      tTotal = todayTodos.length;
      tCompleted = todayTodos.filter((t) => t.completed).length;

      // Sort pending today's todos by priority: High -> Medium -> Low
      const pendingTodos = todayTodos.filter((t) => !t.completed);
      pendingTodos.sort((a, b) => {
        const orderA = a.priority === "high" ? 0 : a.priority === "low" ? 2 : 1;
        const orderB = b.priority === "high" ? 0 : b.priority === "low" ? 2 : 1;
        return orderA - orderB;
      });
      pendingList = pendingTodos;

      // Sort overdue todos by priority: High -> Medium -> Low
      const overdueList = [...overdueTodos];
      overdueList.sort((a, b) => {
        const orderA = a.priority === "high" ? 0 : a.priority === "low" ? 2 : 1;
        const orderB = b.priority === "high" ? 0 : b.priority === "low" ? 2 : 1;
        return orderA - orderB;
      });

      allTodos.forEach((todo) => {
        if (todo.completed) {
          return;
        }

        const category = normalizeTaskCategory(todo.category);
        nextCategoryCounts[category] = (nextCategoryCounts[category] ?? 0) + 1;
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

      // 2. Load and Normalize Habits
      let hCompleted = 0;
      let hTotal = 0;
      let maxStreak = 0;
      let unfinishedHabitsList: Habit[] = [];
      let finishedHabitsList: Habit[] = [];

      const normalized = normalizeHabitsForToday(rawHabitsList);
      if (JSON.stringify(normalized) !== JSON.stringify(rawHabitsList)) {
        for (const normalizedHabit of normalized) {
          const originalHabit = rawHabitsList.find(
            (h) => h.id === normalizedHabit.id,
          );
          if (
            originalHabit &&
            JSON.stringify(originalHabit) !== JSON.stringify(normalizedHabit)
          ) {
            const habitsMap = await ActivityRepository.getHabits(
              normalizedHabit.folderId || "default",
            );
            const originalFull = habitsMap[normalizedHabit.id];
            if (originalFull) {
              await ActivityRepository.saveHabit({
                ...originalFull,
                streak: normalizedHabit.streak,
                bestStreak: normalizedHabit.bestStreak,
              });
            }
          }
        }
      }

      const todayDate = new Date();
      const dayOfWeek = todayDate.getDay();
      const allHabits = normalized.filter((h) => {
        if (h.archived) return false;
        if (h.recurrence) {
          return isRecurringOccurrenceForDate(h, todayStr);
        }
        return (
          !h.reminderDays ||
          h.reminderDays.length === 0 ||
          h.reminderDays.includes(dayOfWeek)
        );
      });
      hTotal = allHabits.length;
      hCompleted = allHabits.filter((h) => h.completedToday).length;

      // Sort unfinished habits by priority: High -> Medium -> Low
      const unfinished = allHabits.filter((h) => !h.completedToday);
      unfinished.sort((a, b) => {
        const orderA = a.priority === "high" ? 0 : a.priority === "low" ? 2 : 1;
        const orderB = b.priority === "high" ? 0 : b.priority === "low" ? 2 : 1;
        return orderA - orderB;
      });
      unfinishedHabitsList = unfinished;
      finishedHabitsList = allHabits.filter((h) => h.completedToday);
      maxStreak = allHabits.reduce((max, h) => Math.max(max, h.streak || 0), 0);

      setPendingHabits(unfinishedHabitsList);
      setCompletedHabits(finishedHabitsList);
      setHabitStats({ completed: hCompleted, total: hTotal, maxStreak });

      setCategoryCounts({ ...nextCategoryCounts });

      // 3. Load Checklists via Repository
      const loadedChecklists: Record<string, any[]> = {};
      for (const fId of folderIds) {
        const checklistsMap = await ActivityRepository.getChecklists(fId);
        loadedChecklists[fId] = Object.values(checklistsMap).map((c: any) => ({
          id: c.id,
          folderId: fId,
          title: c.title,
          items: c.items || [],
          createdAt: c.createdAt,
          archived: c.archived || false,
        }));
      }
      setAllChecklists(loadedChecklists);

      // 4. Load Collections
      const loadedCollections = await getCollections();
      setAllCollections(loadedCollections);

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
        const {
          getPebbleCounts,
          getGemsBalance,
          getMainStreakRecoveryInfo,
        } = require("@/services/pebbleService");
        const pebbleStats = await getPebbleCounts();
        setLifetimePebbles(pebbleStats.lifetime);
        setMonthlyPebbles(pebbleStats.monthly);
        setMonthlyTypes(pebbleStats.monthlyTypes);
        setLifetimeTypes(
          pebbleStats.lifetimeTypes || { task: 0, habit: 0, focus: 0 },
        );
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
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
        Alert.alert(
          "Streak Restored! 🔥",
          "Your daily pebble streak has been successfully restored.",
        );
        await loadDashboardData();
      } else {
        Alert.alert(
          "Insufficient Gems",
          "You need 1 Gem to restore your main streak.",
        );
      }
    } catch (e) {
      console.warn("Failed to recover main streak", e);
    }
  }, [loadDashboardData]);

  const toggleChecklistItemFromDashboard = useCallback(
    async (checklistId: string, itemId: string, folderId: string) => {
      try {
        const checklistsMap = await ActivityRepository.getChecklists(folderId);
        const checklist = checklistsMap[checklistId];
        if (checklist) {
          const updatedChecklist = {
            ...checklist,
            items: (checklist.items || []).map((i) =>
              i.id === itemId ? { ...i, completed: !i.completed } : i,
            ),
          };
          await ActivityRepository.saveChecklist(updatedChecklist as any);

          setAllChecklists((prev) => {
            const next = { ...prev };
            if (next[folderId]) {
              next[folderId] = next[folderId].map((c) =>
                c.id === checklistId ? updatedChecklist : c,
              );
            }
            return next;
          });

          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
            () => {},
          );
          emitStateChange("checklists_changed");
        }
      } catch (e) {
        console.warn("Failed to toggle checklist item from dashboard", e);
      }
    },
    [],
  );

  const completeTodoFromDashboard = useCallback(
    async (todoId: string, event?: any) => {
      try {
        let prevTodo: any = null;
        let targetFolderId = "default";
        const folderList = await FolderRepository.getFolders();
        const folderIds = Array.from(
          new Set([
            "default",
            "unassigned",
            ...folderList.map((f: any) => f.id),
          ]),
        );

        for (const fId of folderIds) {
          const tasksMap = await ActivityRepository.getTasks(fId);
          if (tasksMap[todoId]) {
            prevTodo = tasksMap[todoId];
            targetFolderId = fId;
            break;
          }
        }

        if (!prevTodo) return;

        let reminderIdsToClear: string[] = [];
        let xpAwarded = false;
        if (prevTodo) {
          const res = await handleTaskXpChange(prevTodo, true);
          xpAwarded = res.xpAwarded;
          reminderIdsToClear = prevTodo.notificationIds ?? [];
        }

        await cancelReminderIds(reminderIdsToClear);
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});

        await ActivityRepository.saveTask({
          ...prevTodo,
          completed: true,
          completedAt: Date.now(),
          xpAwarded,
        });

        // Earn task pebble
        const { earnPebble } = require("@/services/pebbleService");
        await earnPebble("task");

        // Spawn flying pebble animation
        let clickX = SCREEN_WIDTH / 2;
        let clickY = SCREEN_HEIGHT * 0.8;
        if (event && event.nativeEvent) {
          clickX =
            event.nativeEvent.pageX || event.nativeEvent.locationX || clickX;
          clickY =
            event.nativeEvent.pageY || event.nativeEvent.locationY || clickY;
        }
        const pebbleId = Math.random().toString(36).substring(7);
        setFlyingPebbles((prev) => [
          ...prev,
          { id: pebbleId, startX: clickX, startY: clickY, type: "task" },
        ]);

        await loadDashboardData();
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
                  const {
                    undoLastPebble,
                  } = require("@/services/pebbleService");
                  await undoLastPebble("task");

                  await ActivityRepository.saveTask({
                    ...prevTodo,
                    completed: false,
                    completedAt: undefined,
                  });
                  await loadDashboardData();
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
    [loadDashboardData, showUndo],
  );

  const completeHabitFromDashboard = useCallback(
    async (habitId: string, event?: any) => {
      try {
        let prevHabit: any = null;
        let targetFolderId = "default";
        const folderList = await FolderRepository.getFolders();
        const folderIds = Array.from(
          new Set([
            "default",
            "unassigned",
            ...folderList.map((f: any) => f.id),
          ]),
        );

        for (const fId of folderIds) {
          const habitsMap = await ActivityRepository.getHabits(fId);
          if (habitsMap[habitId]) {
            prevHabit = habitsMap[habitId];
            targetFolderId = fId;
            break;
          }
        }

        if (!prevHabit) return;

        const today = getDateKey();
        const yesterday = getDateKey(
          new Date(Date.now() - 24 * 60 * 60 * 1000),
        );

        const habitForXp = {
          ...prevHabit,
          completedToday: prevHabit.completedDates?.includes(today) || false,
        };
        const nextCompleted = !habitForXp.completedToday;
        const { xpAwardedDate } = await handleHabitXpChange(
          habitForXp,
          nextCompleted,
          today,
        );

        let streak = prevHabit.streak || 0;
        let completedDates = [...(prevHabit.completedDates || [])];
        if (nextCompleted) {
          if (!completedDates.includes(today)) {
            completedDates.push(today);
          }
          let nextStreak = 1;
          if (prevHabit.lastCompletedDate === today) {
            nextStreak = prevHabit.streak || 1;
          } else if (prevHabit.lastCompletedDate === yesterday) {
            nextStreak = (prevHabit.streak || 0) + 1;
          }
          streak = nextStreak;
        } else {
          completedDates = completedDates.filter((d: string) => d !== today);
          streak = Math.max(0, streak - 1);
        }

        const updatedHabit = {
          ...prevHabit,
          completedDates,
          streak,
          bestStreak: Math.max(prevHabit.bestStreak || 0, streak),
          lastCompletedDate: nextCompleted
            ? today
            : streak > 0
              ? yesterday
              : undefined,
          xpAwardedDate,
        };

        await ActivityRepository.saveHabit(updatedHabit);

        if (nextCompleted) {
          Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          ).catch(() => {});
        }

        // Record history snapshot
        const {
          recordDailyHistorySnapshot,
        } = require("@/services/productivityHistory");
        void recordDailyHistorySnapshot();

        const {
          earnPebble,
          undoLastPebble,
        } = require("@/services/pebbleService");
        if (nextCompleted) {
          await earnPebble("habit");

          // Spawn flying pebble animation
          let clickX = SCREEN_WIDTH / 2;
          let clickY = SCREEN_HEIGHT * 0.8;
          if (event && event.nativeEvent) {
            clickX =
              event.nativeEvent.pageX || event.nativeEvent.locationX || clickX;
            clickY =
              event.nativeEvent.pageY || event.nativeEvent.locationY || clickY;
          }
          const pebbleId = Math.random().toString(36).substring(7);
          setFlyingPebbles((prev) => [
            ...prev,
            { id: pebbleId, startX: clickX, startY: clickY, type: "habit" },
          ]);
        } else {
          await undoLastPebble("habit");
        }

        await loadDashboardData();
        emitStateChange("habits_changed");
      } catch (e) {
        console.warn("Failed to complete habit on dashboard", e);
      }
    },
    [loadDashboardData],
  );

  const handleSaveReview = useCallback(async () => {
    try {
      if (!gratitudeText.trim() && !intentionText.trim()) {
        setIsReviewModalVisible(false);
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );

      // 1. Save gratitude text to history logs
      if (gratitudeText.trim()) {
        await appendGratitudeHistoryEntry({
          id: String(Date.now()),
          text: gratitudeText.trim(),
          timestamp: Date.now(),
        });
      }

      // 2. Create tomorrow's intention task
      if (intentionText.trim()) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

        const newTodo = {
          id: String(Date.now()),
          title: intentionText.trim(),
          completed: false,
          priority: "high", // high priority!
          folderId: "default",
          scheduledDate: tomorrowStr,
          created: Date.now(),
        };

        await ActivityRepository.saveTask(newTodo);
      }

      // Reset fields and close
      setGratitudeText("");
      setIntentionText("");
      setIsReviewModalVisible(false);

      // Refresh listings
      await loadDashboardData();
      emitStateChange("tasks_changed");

      Alert.alert(
        "Review Saved! 🌟",
        "Your gratitude was logged, and your main intention has been scheduled for tomorrow.",
      );
    } catch (e) {
      console.warn("Failed to save review", e);
    }
  }, [gratitudeText, intentionText, loadDashboardData]);

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

    const unsubscribeChecklists = addStateListener("checklists_changed", () => {
      void loadDashboardData();
    });

    const unsubscribeZen = addStateListener("zen_mode_toggle", () => {
      setIsZenModeActive(true);
    });

    const unsubscribeReview = addStateListener("review_day_open", () => {
      setIsReviewModalVisible(true);
    });

    return () => {
      unsubscribeTasks();
      unsubscribeHabits();
      unsubscribeProfile();
      unsubscribePebbles();
      unsubscribeChecklists();
      unsubscribeZen();
      unsubscribeReview();
    };
  }, [loadDashboardData]);

  // Load dashboard filters from storage and listen to changes from bottom tab drawer
  useEffect(() => {
    const loadSavedFilters = async () => {
      try {
        const { filter, priority } = await getDashboardFilters();
        if (filter) setActiveFilter(filter);
        if (priority) setSelectedPriorityFilter(priority as any);
      } catch (e) {
        console.warn("Failed to load dashboard filters on mount", e);
      }
    };

    void loadSavedFilters();

    const unsubscribeFilters = addStateListener(
      "dashboard_filter_changed",
      () => {
        void loadSavedFilters();
      },
    );

    return () => {
      unsubscribeFilters();
    };
  }, []);

  const totalItems = todoStats.total + habitStats.total;
  const completedItems = todoStats.completed + habitStats.completed;
  const progressPct = totalItems === 0 ? 0 : completedItems / totalItems;

  useEffect(() => {
    jarFillAnim.value = withTiming(progressPct, { duration: 600 });
  }, [progressPct]);

  const matchesSearch = (text: string, query: string) => {
    return text?.toLowerCase().includes(query.toLowerCase());
  };

  const getFolderById = useCallback(
    (folderId?: string) => {
      const fId = folderId === "unassigned" || !folderId ? "default" : folderId;
      const found = folders.find((f) => f.id === fId);
      if (found) return found;
      return {
        id: "default",
        name: "My Pebbles",
        emoji: "📋",
        color: "#6366F1",
      };
    },
    [folders],
  );

  const displayedTodos = useMemo(() => {
    const filtered = todoStats.pending.filter((todo) => {
      const folder = getFolderById(todo.folderId);
      const folderName = folder?.name || "";
      const queryMatches =
        searchQuery.trim() === "" ||
        matchesSearch(todo.title, searchQuery) ||
        matchesSearch(todo.description || "", searchQuery) ||
        matchesSearch(folderName, searchQuery);

      if (!queryMatches) return false;

      if (activeFilter === "habits") return false;

      const fId =
        todo.folderId === "unassigned" || !todo.folderId
          ? "default"
          : todo.folderId;
      if (selectedFolderFilter !== "all" && fId !== selectedFolderFilter) {
        return false;
      }

      if (
        selectedPriorityFilter !== "all" &&
        todo.priority !== selectedPriorityFilter
      ) {
        return false;
      }

      return true;
    });

    if (selectedSortOption === "priority") {
      return [...filtered].sort((a, b) => {
        const orderA = a.priority === "high" ? 0 : a.priority === "low" ? 2 : 1;
        const orderB = b.priority === "high" ? 0 : b.priority === "low" ? 2 : 1;
        return orderA - orderB;
      });
    } else if (selectedSortOption === "alphabetical") {
      return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    }
    return filtered;
  }, [
    todoStats.pending,
    folders,
    searchQuery,
    activeFilter,
    selectedFolderFilter,
    selectedPriorityFilter,
    selectedSortOption,
    getFolderById,
  ]);

  const displayedOverdue = useMemo(() => {
    const filtered = todoStats.overdue.filter((todo) => {
      const folder = getFolderById(todo.folderId);
      const folderName = folder?.name || "";
      const queryMatches =
        searchQuery.trim() === "" ||
        matchesSearch(todo.title, searchQuery) ||
        matchesSearch(todo.description || "", searchQuery) ||
        matchesSearch(folderName, searchQuery);

      if (!queryMatches) return false;

      if (activeFilter === "habits") return false;

      const fId =
        todo.folderId === "unassigned" || !todo.folderId
          ? "default"
          : todo.folderId;
      if (selectedFolderFilter !== "all" && fId !== selectedFolderFilter) {
        return false;
      }

      if (
        selectedPriorityFilter !== "all" &&
        todo.priority !== selectedPriorityFilter
      ) {
        return false;
      }

      return true;
    });

    if (selectedSortOption === "priority") {
      return [...filtered].sort((a, b) => {
        const orderA = a.priority === "high" ? 0 : a.priority === "low" ? 2 : 1;
        const orderB = b.priority === "high" ? 0 : b.priority === "low" ? 2 : 1;
        return orderA - orderB;
      });
    } else if (selectedSortOption === "alphabetical") {
      return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    }
    return filtered;
  }, [
    todoStats.overdue,
    folders,
    searchQuery,
    activeFilter,
    selectedFolderFilter,
    selectedPriorityFilter,
    selectedSortOption,
    getFolderById,
  ]);

  const displayedPendingHabits = useMemo(() => {
    const filtered = pendingHabits.filter((habit) => {
      const queryMatches =
        searchQuery.trim() === "" || matchesSearch(habit.title, searchQuery);
      if (!queryMatches) return false;

      if (activeFilter === "tasks") return false;

      const fId =
        habit.folderId === "unassigned" || !habit.folderId
          ? "default"
          : habit.folderId;
      if (selectedFolderFilter !== "all" && fId !== selectedFolderFilter) {
        return false;
      }

      if (
        selectedPriorityFilter !== "all" &&
        habit.priority !== selectedPriorityFilter
      ) {
        return false;
      }

      return true;
    });

    if (selectedSortOption === "priority") {
      return [...filtered].sort((a, b) => {
        const orderA = a.priority === "high" ? 0 : a.priority === "low" ? 2 : 1;
        const orderB = b.priority === "high" ? 0 : b.priority === "low" ? 2 : 1;
        return orderA - orderB;
      });
    } else if (selectedSortOption === "alphabetical") {
      return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    }
    return filtered;
  }, [
    pendingHabits,
    searchQuery,
    activeFilter,
    selectedFolderFilter,
    selectedPriorityFilter,
    selectedSortOption,
  ]);

  const displayedCompletedHabits = useMemo(() => {
    const filtered = completedHabits.filter((habit) => {
      const queryMatches =
        searchQuery.trim() === "" || matchesSearch(habit.title, searchQuery);
      if (!queryMatches) return false;

      if (activeFilter === "tasks") return false;

      const fId =
        habit.folderId === "unassigned" || !habit.folderId
          ? "default"
          : habit.folderId;
      if (selectedFolderFilter !== "all" && fId !== selectedFolderFilter) {
        return false;
      }

      if (
        selectedPriorityFilter !== "all" &&
        habit.priority !== selectedPriorityFilter
      ) {
        return false;
      }

      return true;
    });

    if (selectedSortOption === "priority") {
      return [...filtered].sort((a, b) => {
        const orderA = a.priority === "high" ? 0 : a.priority === "low" ? 2 : 1;
        const orderB = b.priority === "high" ? 0 : b.priority === "low" ? 2 : 1;
        return orderA - orderB;
      });
    } else if (selectedSortOption === "alphabetical") {
      return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    }
    return filtered;
  }, [
    completedHabits,
    searchQuery,
    activeFilter,
    selectedFolderFilter,
    selectedPriorityFilter,
    selectedSortOption,
  ]);

  const groupTasksByFolder = useCallback((taskList: Todo[]) => {
    const grouped: Record<string, Todo[]> = {};
    taskList.forEach((todo) => {
      const fId =
        todo.folderId === "unassigned" || !todo.folderId
          ? "default"
          : todo.folderId;
      if (!grouped[fId]) {
        grouped[fId] = [];
      }
      grouped[fId].push(todo);
    });
    return grouped;
  }, []);

  const groupHabitsByFolder = useCallback(
    (pending: Habit[], completed: Habit[]) => {
      const grouped: Record<string, { pending: Habit[]; completed: Habit[] }> =
        {};
      pending.forEach((habit) => {
        const fId =
          habit.folderId === "unassigned" || !habit.folderId
            ? "default"
            : habit.folderId;
        if (!grouped[fId]) {
          grouped[fId] = { pending: [], completed: [] };
        }
        grouped[fId].pending.push(habit);
      });
      completed.forEach((habit) => {
        const fId =
          habit.folderId === "unassigned" || !habit.folderId
            ? "default"
            : habit.folderId;
        if (!grouped[fId]) {
          grouped[fId] = { pending: [], completed: [] };
        }
        grouped[fId].completed.push(habit);
      });
      return grouped;
    },
    [],
  );

  const groupedOverdue = useMemo(() => {
    return groupTasksByFolder(displayedOverdue);
  }, [displayedOverdue, groupTasksByFolder]);

  const overdueFolderGroups = useMemo(() => {
    const keys = Object.keys(groupedOverdue);
    return keys
      .map((key) => getFolderById(key))
      .filter((f, idx, self) => self.findIndex((x) => x.id === f.id) === idx)
      .sort((a, b) => {
        const idxA = folders.findIndex((f) => f.id === a.id);
        const idxB = folders.findIndex((f) => f.id === b.id);
        return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
      });
  }, [groupedOverdue, getFolderById, folders]);

  const groupedTodayTodos = useMemo(() => {
    return groupTasksByFolder(displayedTodos);
  }, [displayedTodos, groupTasksByFolder]);

  const todayFolderGroups = useMemo(() => {
    const keys = Object.keys(groupedTodayTodos);
    return keys
      .map((key) => getFolderById(key))
      .filter((f, idx, self) => self.findIndex((x) => x.id === f.id) === idx)
      .sort((a, b) => {
        const idxA = folders.findIndex((f) => f.id === a.id);
        const idxB = folders.findIndex((f) => f.id === b.id);
        return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
      });
  }, [groupedTodayTodos, getFolderById, folders]);

  const groupedTodayHabits = useMemo(() => {
    return groupHabitsByFolder(
      displayedPendingHabits,
      displayedCompletedHabits,
    );
  }, [displayedPendingHabits, displayedCompletedHabits, groupHabitsByFolder]);

  const habitsFolderGroups = useMemo(() => {
    const keys = Object.keys(groupedTodayHabits);
    return keys
      .map((key) => getFolderById(key))
      .filter((f, idx, self) => self.findIndex((x) => x.id === f.id) === idx)
      .sort((a, b) => {
        const idxA = folders.findIndex((f) => f.id === a.id);
        const idxB = folders.findIndex((f) => f.id === b.id);
        return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
      });
  }, [groupedTodayHabits, getFolderById, folders]);

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
      const fId =
        todo.folderId === "unassigned" || !todo.folderId
          ? "default"
          : todo.folderId;
      counts[fId] = (counts[fId] || 0) + 1;
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

  const activeContexts = useMemo(() => {
    const todayStr = getDateKey();

    // Group active items by folder ID
    const contextMap: Record<
      string,
      {
        tasks: Todo[];
        habits: Habit[];
        checklists: Checklist[];
      }
    > = {};

    // 1. Group tasks
    const activeTasks = displayedTodos;
    const overdueTasks = displayedOverdue;

    // 2. Group habits
    const activeHabits = [...pendingHabits, ...completedHabits];

    // 3. Group checklists
    const activeChecklists: Checklist[] = [];
    Object.entries(allChecklists).forEach(([folderId, list]) => {
      list.forEach((c) => {
        if (!c.archived) {
          activeChecklists.push(c);
        }
      });
    });

    // Populate contextMap
    folders.forEach((f) => {
      contextMap[f.id] = { tasks: [], habits: [], checklists: [] };
    });

    // Add tasks
    activeTasks.forEach((t) => {
      const fId = t.folderId || "default";
      if (!contextMap[fId])
        contextMap[fId] = { tasks: [], habits: [], checklists: [] };
      contextMap[fId].tasks.push(t);
    });
    overdueTasks.forEach((t) => {
      const fId = t.folderId || "default";
      if (!contextMap[fId])
        contextMap[fId] = { tasks: [], habits: [], checklists: [] };
      if (!contextMap[fId].tasks.some((existing) => existing.id === t.id)) {
        contextMap[fId].tasks.push(t);
      }
    });

    // Add habits
    activeHabits.forEach((h) => {
      const fId = h.folderId || "default";
      if (!contextMap[fId])
        contextMap[fId] = { tasks: [], habits: [], checklists: [] };
      contextMap[fId].habits.push(h);
    });

    // Add checklists
    activeChecklists.forEach((c) => {
      const fId = c.folderId || "default";
      if (!contextMap[fId])
        contextMap[fId] = { tasks: [], habits: [], checklists: [] };
      contextMap[fId].checklists.push(c);
    });

    // Build the final list of active contexts
    const activeList = folders
      .map((folder) => {
        const items = contextMap[folder.id] || {
          tasks: [],
          habits: [],
          checklists: [],
        };

        let filteredTasks = items.tasks;
        let filteredHabits = items.habits;
        let filteredChecklists = items.checklists;

        if (activeFilter === "tasks") {
          filteredHabits = [];
          filteredChecklists = [];
        } else if (activeFilter === "habits") {
          filteredTasks = [];
          filteredChecklists = [];
        } else if (activeFilter === "checklists") {
          filteredTasks = [];
          filteredHabits = [];
        } else if (activeFilter === "overdue") {
          filteredTasks = items.tasks.filter(
            (t) => getTodoDateKey(t) < todayStr && t.scheduledDate !== "inbox",
          );
          filteredHabits = [];
          filteredChecklists = [];
        }

        // Only include search matches if search query is active
        if (searchQuery.trim() !== "") {
          const query = searchQuery.toLowerCase();
          filteredTasks = filteredTasks.filter((t) =>
            t.title.toLowerCase().includes(query),
          );
          filteredHabits = filteredHabits.filter((h) =>
            h.title.toLowerCase().includes(query),
          );
          filteredChecklists = filteredChecklists.filter((c) =>
            c.title.toLowerCase().includes(query),
          );
        }

        const totalItemsCount =
          filteredTasks.length +
          filteredHabits.length +
          filteredChecklists.length;

        return {
          folder,
          tasks: filteredTasks,
          habits: filteredHabits,
          checklists: filteredChecklists,
          totalCount: totalItemsCount,
        };
      })
      .filter((ctx) => ctx.totalCount > 0);

    return activeList;
  }, [
    folders,
    displayedTodos,
    displayedOverdue,
    pendingHabits,
    completedHabits,
    allChecklists,
    allCollections,
    activeFilter,
    searchQuery,
  ]);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <Animated.View
        entering={FadeInDown.duration(400).springify()}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={parentScrollRef}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 160 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <AppHeader
            kicker={getGreetingTime()}
            title={profile ? profile.name : "User"}
            profile={profile}
            nextReminder={nextReminder}
            hasUnreadNotifs={hasUnreadNotifs}
            streak={streak}
            showSearch={true}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
          />

          {/* Glassmorphic Swipeable Progress Cards (Today & Monthly) */}
          {(() => {
            const completedCount = todoStats.completed + habitStats.completed;
            const totalCount = todoStats.total + habitStats.total;
            const progressPct =
              totalCount > 0 ? completedCount / totalCount : 0;
            const displayPercent = Math.round(progressPct * 100);

            const monthlyPebblesCount = Math.min(100, monthlyPebbles);
            const milestoneInfo = getMilestoneInfo(lifetimePebbles);

            return (
              <View
                style={{ width: "100%", marginTop: 12, position: "relative" }}
              >
                {/* Single Premium Outer Card Container */}
                <View
                  style={{
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderWidth: 1.5,
                    borderRadius: 20,
                    marginHorizontal: CARD_MARGIN,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: colorScheme === "light" ? 0.04 : 0.2,
                    shadowRadius: 12,
                    elevation: 2,
                    overflow: "hidden", // Important to clip sliding content
                    height: 108, // Fixed height to prevent layout shifts
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <Animated.ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    snapToInterval={INNER_TEXT_WIDTH}
                    decelerationRate="fast"
                    scrollEventThrottle={16}
                    nestedScrollEnabled={true}
                    directionalLockEnabled={true}
                    onScrollBeginDrag={() => {
                      parentScrollRef.current?.setNativeProps({
                        scrollEnabled: false,
                      });
                    }}
                    onScrollEndDrag={() => {
                      parentScrollRef.current?.setNativeProps({
                        scrollEnabled: true,
                      });
                    }}
                    onMomentumScrollEnd={() => {
                      parentScrollRef.current?.setNativeProps({
                        scrollEnabled: true,
                      });
                    }}
                    onScroll={scrollHandler}
                    style={{ width: INNER_TEXT_WIDTH, height: "100%" }}
                  >
                    {/* Mode 1 Content: Today's Progress Text */}
                    <View
                      style={{
                        width: INNER_TEXT_WIDTH,
                        paddingLeft: 16,
                        paddingRight: 8,
                        paddingVertical: 14,
                        justifyContent: "center",
                        height: "100%",
                      }}
                    >
                      <View style={{ gap: 4 }}>
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "800",
                            color: colors.primary,
                            textTransform: "uppercase",
                            letterSpacing: 1,
                          }}
                        >
                          Today's Pebble Jar
                        </Text>
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: "800",
                            color: colors.text,
                          }}
                          numberOfLines={1}
                        >
                          {totalCount > 0
                            ? `${completedCount} of ${totalCount} pebbles dropped`
                            : "No target pebbles today"}
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            color: colors.textMuted,
                          }}
                          numberOfLines={2}
                        >
                          {totalCount > 0
                            ? `${displayPercent}% of daily jar filled`
                            : "Add some tasks or habits to get started!"}
                        </Text>
                      </View>
                    </View>

                    {/* Mode 2 Content: Monthly Progress Text */}
                    <View
                      style={{
                        width: INNER_TEXT_WIDTH,
                        paddingLeft: 16,
                        paddingRight: 8,
                        paddingVertical: 14,
                        justifyContent: "center",
                        height: "100%",
                      }}
                    >
                      <View style={{ gap: 4 }}>
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "800",
                            color: "#F59E0B",
                            textTransform: "uppercase",
                            letterSpacing: 1,
                          }}
                        >
                          Monthly Sanctuary
                        </Text>
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: "800",
                            color: colors.text,
                          }}
                          numberOfLines={1}
                        >
                          {monthlyPebblesCount} of 100 pebbles
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            color: colors.textMuted,
                          }}
                          numberOfLines={2}
                        >
                          {milestoneInfo
                            ? `Stage ${milestoneInfo.stage} • ${milestoneInfo.name}`
                            : "Thirsty Crow Milestone"}
                        </Text>
                      </View>
                    </View>
                  </Animated.ScrollView>

                  {/* Stationary Glass Jar (Outside ScrollView) */}
                  <View
                    style={{
                      width: JAR_CONTAINER_WIDTH,
                      height: "100%",
                      alignItems: "center",
                      justifyContent: "center",
                      paddingRight: 12,
                    }}
                  >
                    <View
                      ref={miniJarRef}
                      onLayout={onJarLayout}
                      style={{
                        alignItems: "center",
                        justifyContent: "center",
                        width: 55,
                        height: 66,
                        position: "relative",
                      }}
                    >
                      {/* Perched Crow Emoji (Animated fade/scale based on swipe) */}
                      <Animated.Text
                        style={[
                          {
                            position: "absolute",
                            left: -13,
                            top: 8,
                            fontSize: 18,
                            zIndex: 2,
                          },
                          crowAnimatedStyle,
                        ]}
                      >
                        🦅
                      </Animated.Text>

                      {/* Jar Lid */}
                      <View
                        style={{
                          width: 26,
                          height: 5,
                          borderRadius: 2.5,
                          backgroundColor:
                            colorScheme === "light"
                              ? "rgba(0,0,0,0.5)"
                              : "rgba(255,255,255,0.5)",
                        }}
                      />
                      {/* Jar Neck */}
                      <View
                        style={{
                          width: 18,
                          height: 5,
                          borderLeftWidth: 2,
                          borderRightWidth: 2,
                          borderColor:
                            colorScheme === "light"
                              ? "rgba(0,0,0,0.5)"
                              : "rgba(255,255,255,0.5)",
                          backgroundColor: "transparent",
                          marginTop: -1,
                          zIndex: 1,
                        }}
                      />
                      {/* Jar Body */}
                      <View
                        style={{
                          width: 42,
                          height: 46,
                          borderRadius: 12,
                          borderWidth: 2,
                          borderColor:
                            colorScheme === "light"
                              ? "rgba(0,0,0,0.5)"
                              : "rgba(255,255,255,0.5)",
                          backgroundColor:
                            colorScheme === "light"
                              ? "rgba(0,0,0,0.01)"
                              : "rgba(255,255,255,0.01)",
                          overflow: "hidden",
                          justifyContent: "flex-end",
                          position: "relative",
                          marginTop: -1,
                        }}
                      >
                        {/* Dynamic Liquid Wave Fill (With morphing color and level) */}
                        <Animated.View
                          style={[
                            {
                              position: "absolute",
                              left: -10,
                              right: -10,
                              bottom: -5,
                              height: 56,
                            },
                            liquidAnimatedStyle,
                          ]}
                        />

                        {/* Stacked Pebbles (Today - Fading out) */}
                        <Animated.View
                          style={[
                            StyleSheet.absoluteFill,
                            todayPebblesAnimatedStyle,
                          ]}
                          pointerEvents="none"
                        >
                          {(() => {
                            const slots = PEBBLE_SLOTS;
                            const pebblesToRender = [];
                            for (
                              let i = 0;
                              i < Math.min(completedCount, slots.length);
                              i++
                            ) {
                              const slot = slots[i];
                              const isTask = i < todoStats.completed;
                              pebblesToRender.push(
                                <View
                                  key={`today-pebble-${i}`}
                                  style={{
                                    position: "absolute",
                                    left: slot.x,
                                    bottom: slot.b,
                                    width: 6,
                                    height: 6,
                                    borderRadius: 3,
                                    backgroundColor: isTask
                                      ? "#818CF8"
                                      : "#F59E0B",
                                    shadowColor: "#000",
                                    shadowOffset: { width: 0, height: 1 },
                                    shadowOpacity: 0.15,
                                    shadowRadius: 1,
                                  }}
                                />,
                              );
                            }
                            return pebblesToRender;
                          })()}
                        </Animated.View>

                        {/* Stacked Pebbles (Monthly - Fading in) */}
                        <Animated.View
                          style={[
                            StyleSheet.absoluteFill,
                            monthlyPebblesAnimatedStyle,
                          ]}
                          pointerEvents="none"
                        >
                          {(() => {
                            const slots = PEBBLE_SLOTS;
                            const pebblesToRender = [];
                            const monthlyPebblesToRender = Math.min(
                              Math.round(monthlyPebblesCount / 6.5),
                              15,
                            );
                            for (let i = 0; i < monthlyPebblesToRender; i++) {
                              const slot = slots[i];
                              const isPurple = i % 2 === 0;
                              pebblesToRender.push(
                                <View
                                  key={`monthly-pebble-${i}`}
                                  style={{
                                    position: "absolute",
                                    left: slot.x,
                                    bottom: slot.b,
                                    width: 6,
                                    height: 6,
                                    borderRadius: 3,
                                    backgroundColor: isPurple
                                      ? "#818CF8"
                                      : "#F59E0B",
                                    shadowColor: "#000",
                                    shadowOffset: { width: 0, height: 1 },
                                    shadowOpacity: 0.15,
                                    shadowRadius: 1,
                                  }}
                                />,
                              );
                            }
                            return pebblesToRender;
                          })()}
                        </Animated.View>

                        {/* Glass Reflection Highlight */}
                        <View
                          style={{
                            position: "absolute",
                            top: 4,
                            left: 4,
                            width: 3,
                            height: 30,
                            borderRadius: 1.5,
                            backgroundColor: "rgba(255, 255, 255, 0.25)",
                          }}
                        />
                      </View>
                    </View>
                  </View>
                </View>

                {/* Sliding Pagination Dot Line Track */}
                <View
                  style={{
                    width: 36,
                    height: 3,
                    borderRadius: 1.5,
                    backgroundColor: colors.border,
                    alignSelf: "center",
                    marginTop: 8,
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <Animated.View
                    style={[
                      {
                        width: 18,
                        height: 3,
                        borderRadius: 1.5,
                        backgroundColor: colors.primary,
                        position: "absolute",
                        left: 0,
                      },
                      useAnimatedStyle(() => {
                        const maxScroll = INNER_TEXT_WIDTH;
                        const translate =
                          maxScroll > 0
                            ? (cardScrollX.value / maxScroll) * 18
                            : 0;
                        return {
                          transform: [{ translateX: translate }],
                        };
                      }),
                    ]}
                  />
                </View>
              </View>
            );
          })()}

          {/* Compact Streak Banner */}
          {mainStreakRecoveryInfo?.eligible &&
            (() => {
              let streakMotivation =
                "Start your goals today to build consistency!";
              if (streak > 0) {
                if (streak < 3) {
                  streakMotivation = "Flame sparked! Keep it burning.";
                } else if (streak < 7) {
                  streakMotivation = "You're building solid momentum!";
                } else if (streak < 14) {
                  streakMotivation = "Don't break this beautiful chain.";
                } else {
                  streakMotivation = "You're mastering your routines!";
                }
              }

              return (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: colors.card,
                    borderColor:
                      streak > 0
                        ? colorScheme === "light"
                          ? "#D97706"
                          : "#B45309"
                        : colors.border,
                    borderWidth: 1.5,
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    marginHorizontal: 4,
                    marginTop: 12,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      flex: 1,
                    }}
                  >
                    <Text style={{ fontSize: 16 }}>🔥</Text>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "800",
                        color: colors.text,
                      }}
                    >
                      {streak} Day Streak
                    </Text>
                    <Text
                      style={{ fontSize: 12, color: colors.textMuted, flex: 1 }}
                      numberOfLines={1}
                    >
                      • {streakMotivation}
                    </Text>
                  </View>
                  {mainStreakRecoveryInfo?.eligible && (
                    <PressableScale
                      onPress={handleRecoverMainStreak}
                      haptic
                      style={{
                        backgroundColor:
                          colorScheme === "light"
                            ? "#FEF3C7"
                            : "rgba(245, 158, 11, 0.15)",
                        borderColor: "#F59E0B",
                        borderWidth: 1,
                        borderRadius: 8,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "700",
                          color: "#F59E0B",
                        }}
                      >
                        💎 Spend 1 Gem to Restore
                      </Text>
                    </PressableScale>
                  )}
                </View>
              );
            })()}

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

          {/* Global Filter Row */}
          <View style={{ marginTop: 16, marginHorizontal: -16 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 16,
                gap: 8,
                paddingVertical: 4,
              }}
            >
              {[
                { key: "all", label: "All" },
                { key: "tasks", label: "Tasks" },
                { key: "habits", label: "Habits" },
                { key: "checklists", label: "Checklists" },
                { key: "overdue", label: "Overdue" },
              ].map((filter) => {
                const isSelected = activeFilter === filter.key;
                return (
                  <PressableScale
                    key={filter.key}
                    onPress={async () => {
                      setActiveFilter(filter.key);
                      await saveDashboardFilter(filter.key);
                      Haptics.impactAsync(
                        Haptics.ImpactFeedbackStyle.Light,
                      ).catch(() => {});
                    }}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 20,
                      backgroundColor: isSelected
                        ? colors.primary
                        : colors.card,
                      borderColor: isSelected ? colors.primary : colors.border,
                      borderWidth: 1.5,
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: isSelected ? 0.1 : 0.02,
                      shadowRadius: 4,
                      elevation: 1,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: isSelected ? "#FFFFFF" : colors.textMuted,
                      }}
                    >
                      {filter.label}
                    </Text>
                  </PressableScale>
                );
              })}
            </ScrollView>
          </View>

          {/* Swipeable Today Contexts Carousel */}
          <View style={{ marginTop: 16, marginHorizontal: -16 }}>
            {activeContexts.length === 0 ? (
              <View
                style={{
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderWidth: 1.5,
                  borderRadius: 20,
                  paddingVertical: 32,
                  marginHorizontal: 16,
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: `${colors.primary}12`,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name="check" size={24} color={colors.primary} />
                </View>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 15,
                    fontWeight: "800",
                  }}
                >
                  All clear for today!
                </Text>
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 13,
                    textAlign: "center",
                    paddingHorizontal: 24,
                  }}
                >
                  No active tasks, habits, or checklists matching your
                  selection.
                </Text>
              </View>
            ) : (
              <View>
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  snapToInterval={SCREEN_WIDTH}
                  decelerationRate="fast"
                  scrollEventThrottle={16}
                  onScrollBeginDrag={() => {
                    parentScrollRef.current?.setNativeProps({
                      scrollEnabled: false,
                    });
                  }}
                  onScrollEndDrag={() => {
                    parentScrollRef.current?.setNativeProps({
                      scrollEnabled: true,
                    });
                  }}
                  onMomentumScrollEnd={(e) => {
                    parentScrollRef.current?.setNativeProps({
                      scrollEnabled: true,
                    });
                    const index = Math.round(
                      e.nativeEvent.contentOffset.x / SCREEN_WIDTH,
                    );
                    setActiveCardIndex(index);
                  }}
                  style={{ width: SCREEN_WIDTH }}
                >
                  {activeContexts.map((context) => {
                    const { folder, tasks, habits, checklists } = context;
                    const totalItems =
                      tasks.length +
                      habits.length +
                      checklists.reduce((sum, c) => sum + c.items.length, 0);
                    const completedItems =
                      tasks.filter((t) => t.completed).length +
                      habits.filter((h) => h.completedToday).length +
                      checklists.reduce(
                        (sum, c) =>
                          sum + c.items.filter((i) => i.completed).length,
                        0,
                      );
                    const progress =
                      totalItems > 0 ? completedItems / totalItems : 0;
                    const folderCollections = allCollections[folder.id] || [];
                    const resourcesCount = folderCollections.length;

                    return (
                      <View
                        key={folder.id}
                        style={{
                          width: SCREEN_WIDTH,
                          paddingHorizontal: 16,
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: colors.card,
                            borderColor: colors.border,
                            borderWidth: 1.5,
                            borderRadius: 20,
                            padding: 16,
                            shadowColor: "#000",
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity:
                              colorScheme === "light" ? 0.03 : 0.15,
                            shadowRadius: 10,
                            elevation: 2,
                            minHeight: 180,
                          }}
                        >
                          {/* Folder Card Header */}
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "space-between",
                              marginBottom: 12,
                            }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 8,
                                flex: 1,
                              }}
                            >
                              <View
                                style={{
                                  width: 38,
                                  height: 38,
                                  borderRadius: 12,
                                  backgroundColor: `${folder.color || colors.primary}15`,
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <Text style={{ fontSize: 20 }}>
                                  {folder.emoji || "📁"}
                                </Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text
                                  style={{
                                    fontSize: 15,
                                    fontWeight: "800",
                                    color: colors.text,
                                  }}
                                  numberOfLines={1}
                                >
                                  {folder.name}
                                </Text>
                                <Text
                                  style={{
                                    fontSize: 10,
                                    color: colors.textMuted,
                                  }}
                                >
                                  {completedItems}/{totalItems} Completed
                                </Text>
                              </View>
                            </View>
                            {resourcesCount > 0 && (
                              <PressableScale
                                onPress={() => {
                                  router.push({
                                    pathname: "/tasks",
                                    params: {
                                      folderId: folder.id,
                                      segment: "vault",
                                    },
                                  } as any);
                                }}
                                haptic
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 4,
                                  backgroundColor:
                                    colorScheme === "light"
                                      ? "#F3F4F6"
                                      : "rgba(255,255,255,0.05)",
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                  borderRadius: 8,
                                  borderColor: colors.border,
                                  borderWidth: 1,
                                }}
                              >
                                <Text style={{ fontSize: 11 }}>📎</Text>
                                <Text
                                  style={{
                                    fontSize: 10,
                                    fontWeight: "700",
                                    color: colors.textMuted,
                                  }}
                                >
                                  {resourcesCount}{" "}
                                  {resourcesCount === 1
                                    ? "Resource"
                                    : "Resources"}
                                </Text>
                              </PressableScale>
                            )}
                          </View>

                          {/* Progress Bar */}
                          {totalItems > 0 && (
                            <View
                              style={{
                                height: 4,
                                backgroundColor: colors.border,
                                borderRadius: 2,
                                overflow: "hidden",
                                marginBottom: 12,
                              }}
                            >
                              <View
                                style={{
                                  width: `${progress * 100}%`,
                                  height: "100%",
                                  backgroundColor:
                                    folder.color || colors.primary,
                                }}
                              />
                            </View>
                          )}

                          {/* Unified actions preview list */}
                          {(() => {
                            const taskItems = tasks.map((todo) => {
                              const isInbox = todo.scheduledDate === "inbox";
                              const isOverdue =
                                getTodoDateKey(todo) < getDateKey() && !isInbox;
                              return {
                                type: "task" as const,
                                id: todo.id,
                                key: `task-${todo.id}`,
                                completed: todo.completed,
                                title: todo.title,
                                priority: todo.priority,
                                isOverdue,
                                original: todo,
                              };
                            });

                            const habitItems = habits.map((habit) => ({
                              type: "habit" as const,
                              id: habit.id,
                              key: `habit-${habit.id}`,
                              completed: habit.completedToday,
                              title: habit.title,
                              streak: habit.streak,
                              bestStreak: habit.bestStreak,
                              priority: habit.priority,
                              original: habit,
                            }));

                            const checklistItems = checklists.map(
                              (checklist) => {
                                const completedCount = checklist.items.filter(
                                  (item) => item.completed,
                                ).length;
                                const totalCount = checklist.items.length;
                                return {
                                  type: "checklist" as const,
                                  id: checklist.id,
                                  key: `checklist-${checklist.id}`,
                                  completed:
                                    completedCount === totalCount &&
                                    totalCount > 0,
                                  title: checklist.title,
                                  completedCount,
                                  totalCount,
                                  original: checklist,
                                };
                              },
                            );

                            const actionItems = [
                              ...habitItems,
                              ...taskItems,
                              ...checklistItems,
                            ];

                            // Sort incomplete items first, then by type (habit, task, checklist)
                            const sortedActionItems = actionItems.sort(
                              (a, b) => {
                                if (a.completed !== b.completed) {
                                  return a.completed ? 1 : -1;
                                }
                                const typeOrder = {
                                  habit: 0,
                                  task: 1,
                                  checklist: 2,
                                };
                                return typeOrder[a.type] - typeOrder[b.type];
                              },
                            );

                            const PREVIEW_LIMIT = 5;
                            const displayedItems = sortedActionItems.slice(
                              0,
                              PREVIEW_LIMIT,
                            );
                            const remainingCount =
                              sortedActionItems.length - PREVIEW_LIMIT;

                            return (
                              <View style={{ gap: 4, marginTop: 4 }}>
                                <View style={{ gap: 2 }}>
                                  {displayedItems.map((item, index) => {
                                    const isLast =
                                      index === displayedItems.length - 1;
                                    const itemColor =
                                      folder.color || colors.primary;

                                    if (item.type === "task") {
                                      const todo = item.original;

                                      let subtitle = "TODAY";
                                      if (todo.completed) {
                                        subtitle = "COMPLETED";
                                      } else if (item.isOverdue) {
                                        const dateKey = getTodoDateKey(todo);
                                        const overdueLabel =
                                          getOverdueLabel(
                                            dateKey,
                                          ).toUpperCase();
                                        subtitle = `OVERDUE • ${overdueLabel}`;
                                      } else if (todo.recurrence) {
                                        const typeLabel =
                                          todo.recurrence.type.toUpperCase();
                                        subtitle = `RECURS • ${typeLabel}`;
                                      } else if (
                                        todo.reminderHour !== undefined
                                      ) {
                                        const ampm =
                                          todo.reminderHour >= 12 ? "PM" : "AM";
                                        const displayHour =
                                          todo.reminderHour % 12 || 12;
                                        const displayMinute = String(
                                          todo.reminderMinute || 0,
                                        ).padStart(2, "0");
                                        subtitle = `TODAY • ${displayHour}:${displayMinute} ${ampm}`;
                                      }

                                      return (
                                        <View key={item.key}>
                                          <View
                                            style={{
                                              flexDirection: "row",
                                              alignItems: "center",
                                              paddingVertical: 12,
                                            }}
                                          >
                                            {/* Priority Indicator Spacer (2px wide) */}
                                            <PriorityIndicator
                                              priority={todo.priority}
                                            />

                                            {/* Gap between priority line and checkbox */}
                                            <View style={{ width: 6 }} />

                                            <PressableScale
                                              onPress={(e) =>
                                                completeTodoFromDashboard(
                                                  todo.id,
                                                  e,
                                                )
                                              }
                                              haptic
                                              style={{
                                                width: 20,
                                                height: 20,
                                                borderRadius: 10,
                                                borderWidth: 2,
                                                borderColor: todo.completed
                                                  ? itemColor
                                                  : "rgba(255,255,255,0.2)",
                                                backgroundColor: todo.completed
                                                  ? itemColor
                                                  : "transparent",
                                                alignItems: "center",
                                                justifyContent: "center",
                                              }}
                                            >
                                              {todo.completed && (
                                                <Feather
                                                  name="check"
                                                  size={12}
                                                  color="#ffffff"
                                                />
                                              )}
                                            </PressableScale>

                                            {/* Gap between checkbox and content */}
                                            <View style={{ width: 10 }} />

                                            <PressableScale
                                              onPress={() =>
                                                router.push({
                                                  pathname: "/tasks",
                                                  params: {
                                                    folderId: todo.folderId,
                                                  },
                                                } as any)
                                              }
                                              style={{ flex: 1 }}
                                              contentStyle={{
                                                flex: 1,
                                                flexDirection: "row",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                              }}
                                            >
                                              <View style={{ flex: 1, gap: 2 }}>
                                                <Text
                                                  style={{
                                                    color: todo.completed
                                                      ? colors.textMuted
                                                      : colors.text,
                                                    fontSize: 14,
                                                    fontWeight: "600",
                                                    textDecorationLine:
                                                      todo.completed
                                                        ? "line-through"
                                                        : "none",
                                                  }}
                                                  numberOfLines={1}
                                                >
                                                  {todo.title}
                                                </Text>
                                                <StatusBadge
                                                  status={
                                                    todo.completed
                                                      ? "completed"
                                                      : item.isOverdue
                                                        ? "overdue"
                                                        : "today"
                                                  }
                                                  text={subtitle}
                                                />
                                              </View>

                                              <CategoryChip
                                                category={todo.category}
                                                size="sm"
                                              />
                                            </PressableScale>
                                          </View>
                                          {!isLast && (
                                            <View
                                              style={{
                                                height: 1,
                                                backgroundColor: colors.border,
                                                opacity: 0.2,
                                                marginVertical: 4,
                                              }}
                                            />
                                          )}
                                        </View>
                                      );
                                    }

                                    if (item.type === "habit") {
                                      const habit = item.original;

                                      let subtitle = "";
                                      if (habit.completedToday) {
                                        subtitle = "COMPLETED";
                                      } else {
                                        const detail = habit.description
                                          ? habit.description.toUpperCase()
                                          : `🔥 ${habit.streak} DAY STREAK`;
                                        subtitle = `DAY ${habit.streak + 1} • ${detail}`;
                                      }

                                      return (
                                        <View key={item.key}>
                                          <View
                                            style={{
                                              flexDirection: "row",
                                              alignItems: "center",
                                              paddingVertical: 12,
                                            }}
                                          >
                                            {/* Priority Indicator Spacer (2px wide) */}
                                            <PriorityIndicator
                                              priority={habit.priority}
                                            />

                                            {/* Gap between priority line and checkbox */}
                                            <View style={{ width: 6 }} />

                                            <PressableScale
                                              onPress={(e) =>
                                                completeHabitFromDashboard(
                                                  habit.id,
                                                  e,
                                                )
                                              }
                                              haptic
                                              style={{
                                                width: 20,
                                                height: 20,
                                                borderRadius: 10,
                                                borderWidth: 2,
                                                borderColor:
                                                  habit.completedToday
                                                    ? "#F59E0B"
                                                    : "rgba(255,255,255,0.2)",
                                                backgroundColor:
                                                  habit.completedToday
                                                    ? "#F59E0B"
                                                    : "transparent",
                                                alignItems: "center",
                                                justifyContent: "center",
                                              }}
                                            >
                                              {habit.completedToday && (
                                                <Feather
                                                  name="check"
                                                  size={12}
                                                  color="#ffffff"
                                                />
                                              )}
                                            </PressableScale>

                                            {/* Gap between checkbox and content */}
                                            <View style={{ width: 10 }} />

                                            <PressableScale
                                              onPress={() =>
                                                router.push(
                                                  `/task-details?id=${habit.id}&type=habit`,
                                                )
                                              }
                                              style={{ flex: 1 }}
                                              contentStyle={{
                                                flex: 1,
                                                flexDirection: "row",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                              }}
                                            >
                                              <View style={{ flex: 1, gap: 2 }}>
                                                <Text
                                                  style={{
                                                    color: habit.completedToday
                                                      ? colors.textMuted
                                                      : colors.text,
                                                    fontSize: 14,
                                                    fontWeight: "600",
                                                    textDecorationLine:
                                                      habit.completedToday
                                                        ? "line-through"
                                                        : "none",
                                                  }}
                                                  numberOfLines={1}
                                                >
                                                  {habit.title}
                                                </Text>
                                                <StatusBadge
                                                  status={
                                                    habit.completedToday
                                                      ? "completed"
                                                      : "active"
                                                  }
                                                  text={subtitle}
                                                />
                                              </View>

                                              <CategoryChip
                                                category={habit.category}
                                                size="sm"
                                              />
                                            </PressableScale>
                                          </View>
                                          {!isLast && (
                                            <View
                                              style={{
                                                height: 1,
                                                backgroundColor: colors.border,
                                                opacity: 0.2,
                                                marginVertical: 4,
                                              }}
                                            />
                                          )}
                                        </View>
                                      );
                                    }

                                    if (item.type === "checklist") {
                                      const checklist = item.original;
                                      const isExpanded =
                                        !!expandedChecklistIds[checklist.id];
                                      const remainingCount =
                                        item.totalCount - item.completedCount;
                                      const subtitle = item.completed
                                        ? "COMPLETED"
                                        : `${item.completedCount} OF ${item.totalCount} ITEMS • ${remainingCount} LEFT`;

                                      return (
                                        <View key={item.key}>
                                          <View
                                            style={{
                                              flexDirection: "row",
                                              alignItems: "center",
                                              paddingVertical: 12,
                                            }}
                                          >
                                            {/* Priority Indicator Spacer (2px wide) */}
                                            <View style={{ width: 2 }} />

                                            {/* Gap between priority line spacer and checkbox */}
                                            <View style={{ width: 6 }} />

                                            <PressableScale
                                              onPress={() => {
                                                setExpandedChecklistIds(
                                                  (prev) => ({
                                                    ...prev,
                                                    [checklist.id]: !isExpanded,
                                                  }),
                                                );
                                                Haptics.impactAsync(
                                                  Haptics.ImpactFeedbackStyle
                                                    .Light,
                                                ).catch(() => {});
                                              }}
                                              style={{
                                                width: 20,
                                                height: 20,
                                                borderRadius: 4,
                                                borderWidth: 2,
                                                borderColor: item.completed
                                                  ? itemColor
                                                  : "rgba(255,255,255,0.2)",
                                                backgroundColor: item.completed
                                                  ? itemColor
                                                  : "transparent",
                                                alignItems: "center",
                                                justifyContent: "center",
                                              }}
                                            >
                                              {item.completed && (
                                                <Feather
                                                  name="check"
                                                  size={12}
                                                  color="#ffffff"
                                                />
                                              )}
                                            </PressableScale>

                                            {/* Gap between checkbox and content */}
                                            <View style={{ width: 10 }} />

                                            <PressableScale
                                              onPress={() => {
                                                setExpandedChecklistIds(
                                                  (prev) => ({
                                                    ...prev,
                                                    [checklist.id]: !isExpanded,
                                                  }),
                                                );
                                                Haptics.impactAsync(
                                                  Haptics.ImpactFeedbackStyle
                                                    .Light,
                                                ).catch(() => {});
                                              }}
                                              style={{ flex: 1 }}
                                              contentStyle={{
                                                flex: 1,
                                                flexDirection: "row",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                              }}
                                            >
                                              <View style={{ flex: 1, gap: 2 }}>
                                                <Text
                                                  style={{
                                                    color: colors.text,
                                                    fontSize: 14,
                                                    fontWeight: "600",
                                                  }}
                                                  numberOfLines={1}
                                                >
                                                  {checklist.title}
                                                </Text>
                                                <StatusBadge
                                                  status={
                                                    item.completed
                                                      ? "completed"
                                                      : "active"
                                                  }
                                                  text={subtitle}
                                                />
                                              </View>

                                              <View
                                                style={{
                                                  flexDirection: "row",
                                                  alignItems: "center",
                                                  gap: 8,
                                                }}
                                              >
                                                <CategoryChip
                                                  category={undefined}
                                                  size="sm"
                                                />
                                                <Feather
                                                  name={
                                                    isExpanded
                                                      ? "chevron-up"
                                                      : "chevron-down"
                                                  }
                                                  size={14}
                                                  color={colors.textMuted}
                                                />
                                              </View>
                                            </PressableScale>
                                          </View>

                                          {/* Expanded checklist items */}
                                          {isExpanded &&
                                            checklist.items.length > 0 && (
                                              <View
                                                style={{
                                                  paddingLeft: 24,
                                                  paddingBottom: 6,
                                                  gap: 6,
                                                }}
                                              >
                                                {checklist.items.map(
                                                  (subItem) => (
                                                    <View
                                                      key={subItem.id}
                                                      style={{
                                                        flexDirection: "row",
                                                        alignItems: "center",
                                                        gap: 8,
                                                        paddingVertical: 4,
                                                      }}
                                                    >
                                                      <PressableScale
                                                        onPress={() =>
                                                          toggleChecklistItemFromDashboard(
                                                            checklist.id,
                                                            subItem.id,
                                                            folder.id,
                                                          )
                                                        }
                                                        haptic
                                                        style={{
                                                          width: 16,
                                                          height: 16,
                                                          borderRadius: 4,
                                                          borderWidth: 2,
                                                          borderColor:
                                                            subItem.completed
                                                              ? itemColor
                                                              : "rgba(255,255,255,0.2)",
                                                          backgroundColor:
                                                            subItem.completed
                                                              ? itemColor
                                                              : "transparent",
                                                          alignItems: "center",
                                                          justifyContent:
                                                            "center",
                                                        }}
                                                      >
                                                        {subItem.completed && (
                                                          <Feather
                                                            name="check"
                                                            size={10}
                                                            color="#ffffff"
                                                          />
                                                        )}
                                                      </PressableScale>
                                                      <Text
                                                        style={{
                                                          color:
                                                            subItem.completed
                                                              ? colors.textMuted
                                                              : colors.text,
                                                          fontSize: 12,
                                                          textDecorationLine:
                                                            subItem.completed
                                                              ? "line-through"
                                                              : "none",
                                                          flex: 1,
                                                        }}
                                                      >
                                                        {subItem.title}
                                                      </Text>
                                                    </View>
                                                  ),
                                                )}
                                              </View>
                                            )}

                                          {!isLast && (
                                            <View
                                              style={{
                                                height: 1,
                                                backgroundColor: colors.border,
                                                opacity: 0.2,
                                                marginVertical: 4,
                                              }}
                                            />
                                          )}
                                        </View>
                                      );
                                    }

                                    return null;
                                  })}
                                </View>

                                {/* More items indicator */}
                                {remainingCount > 0 && (
                                  <Text
                                    style={[
                                      styles.moreItemsText,
                                      { color: colors.textMuted },
                                    ]}
                                  >
                                    + {remainingCount} more{" "}
                                    {remainingCount === 1
                                      ? "action"
                                      : "actions"}{" "}
                                    in Workspace
                                  </Text>
                                )}

                                <PressableScale
                                  onPress={() =>
                                    router.push({
                                      pathname: "/tasks",
                                      params: { folderId: folder.id },
                                    } as any)
                                  }
                                  haptic
                                  style={[
                                    styles.continueCardButton,
                                    { borderTopColor: colors.border },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.continueCardText,
                                      { color: folder.color || colors.primary },
                                    ]}
                                  >
                                    Continue in {folder.name}
                                  </Text>
                                  <Feather
                                    name="arrow-right"
                                    size={14}
                                    color={folder.color || colors.primary}
                                  />
                                </PressableScale>
                              </View>
                            );
                          })()}
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>

                {/* Carousel Pagination Dots */}
                {activeContexts.length > 1 && (
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 6,
                      marginTop: 12,
                    }}
                  >
                    {activeContexts.map((_, idx) => (
                      <View
                        key={`dot-${idx}`}
                        style={{
                          width: idx === activeCardIndex ? 16 : 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor:
                            idx === activeCardIndex
                              ? colors.primary
                              : colors.border,
                        }}
                      />
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        </ScrollView>
      </Animated.View>

      {/* Reward Overlay Modal is rendered globally by MascotOverlay */}

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
              <Text
                style={[localStyles.modalHeaderTitle, { color: colors.text }]}
              >
                Pebble Sanctuary
              </Text>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                    () => {},
                  );
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
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "baseline",
                    gap: 3,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 44,
                      fontWeight: "900",
                      color: colors.text,
                    }}
                  >
                    {monthlyPebbles}
                  </Text>
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: "700",
                      color: colors.textMuted,
                    }}
                  >
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
                    <View
                      style={{ flexDirection: "row", gap: 8, width: "100%" }}
                    >
                      <View
                        style={{
                          flex: 1,
                          backgroundColor:
                            colorScheme === "light"
                              ? "rgba(0,0,0,0.015)"
                              : "rgba(255,255,255,0.02)",
                          padding: 10,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: colors.border,
                          alignItems: "center",
                          gap: 2,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: "800",
                            color: colors.text,
                          }}
                        >
                          {Math.min(100, monthlyPebbles)}%
                        </Text>
                        <Text
                          style={{
                            fontSize: 8,
                            fontWeight: "700",
                            color: colors.textMuted,
                            textTransform: "uppercase",
                            textAlign: "center",
                          }}
                        >
                          Water Level
                        </Text>
                      </View>
                      <View
                        style={{
                          flex: 1,
                          backgroundColor:
                            colorScheme === "light"
                              ? "rgba(0,0,0,0.015)"
                              : "rgba(255,255,255,0.02)",
                          padding: 10,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: colors.border,
                          alignItems: "center",
                          gap: 2,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: "800",
                            color: "#F59E0B",
                          }}
                        >
                          💎 {gemsBalance}
                        </Text>
                        <Text
                          style={{
                            fontSize: 8,
                            fontWeight: "700",
                            color: colors.textMuted,
                            textTransform: "uppercase",
                            textAlign: "center",
                          }}
                        >
                          Gems
                        </Text>
                      </View>
                      <View
                        style={{
                          flex: 1,
                          backgroundColor:
                            colorScheme === "light"
                              ? "rgba(0,0,0,0.015)"
                              : "rgba(255,255,255,0.02)",
                          padding: 10,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: colors.border,
                          alignItems: "center",
                          gap: 2,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: "800",
                            color: colors.text,
                          }}
                        >
                          {lifetimePebbles}
                        </Text>
                        <Text
                          style={{
                            fontSize: 8,
                            fontWeight: "700",
                            color: colors.textMuted,
                            textTransform: "uppercase",
                            textAlign: "center",
                          }}
                        >
                          Lifetime
                        </Text>
                      </View>
                    </View>

                    {/* Pebble Sources Breakdown */}
                    <View style={{ width: "100%", gap: 6 }}>
                      <Text
                        style={{
                          fontSize: 8,
                          fontWeight: "800",
                          color: colors.textMuted,
                          textTransform: "uppercase",
                          letterSpacing: 0.8,
                        }}
                      >
                        Pebble Sources
                      </Text>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        {/* Tasks — purple */}
                        <View
                          style={{
                            flex: 1,
                            backgroundColor:
                              colorScheme === "light"
                                ? "rgba(139,92,246,0.06)"
                                : "rgba(139,92,246,0.12)",
                            padding: 10,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: "rgba(139,92,246,0.25)",
                            alignItems: "center",
                            gap: 3,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <Feather
                              name="check-square"
                              size={11}
                              color="#8B5CF6"
                            />
                            <Text
                              style={{
                                fontSize: 16,
                                fontWeight: "900",
                                color: "#8B5CF6",
                              }}
                            >
                              {lifetimeTypes.task}
                            </Text>
                          </View>
                          <Text
                            style={{
                              fontSize: 8,
                              fontWeight: "700",
                              color: colors.textMuted,
                              textTransform: "uppercase",
                              textAlign: "center",
                            }}
                          >
                            Tasks
                          </Text>
                        </View>
                        {/* Habits — orange */}
                        <View
                          style={{
                            flex: 1,
                            backgroundColor:
                              colorScheme === "light"
                                ? "rgba(249,115,22,0.06)"
                                : "rgba(249,115,22,0.12)",
                            padding: 10,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: "rgba(249,115,22,0.25)",
                            alignItems: "center",
                            gap: 3,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <Feather name="repeat" size={11} color="#F97316" />
                            <Text
                              style={{
                                fontSize: 16,
                                fontWeight: "900",
                                color: "#F97316",
                              }}
                            >
                              {lifetimeTypes.habit}
                            </Text>
                          </View>
                          <Text
                            style={{
                              fontSize: 8,
                              fontWeight: "700",
                              color: colors.textMuted,
                              textTransform: "uppercase",
                              textAlign: "center",
                            }}
                          >
                            Habits
                          </Text>
                        </View>
                        {/* Focus — green */}
                        <View
                          style={{
                            flex: 1,
                            backgroundColor:
                              colorScheme === "light"
                                ? "rgba(16,185,129,0.06)"
                                : "rgba(16,185,129,0.12)",
                            padding: 10,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: "rgba(16,185,129,0.25)",
                            alignItems: "center",
                            gap: 3,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <Feather name="zap" size={11} color="#10B981" />
                            <Text
                              style={{
                                fontSize: 16,
                                fontWeight: "900",
                                color: "#10B981",
                              }}
                            >
                              {lifetimeTypes.focus}
                            </Text>
                          </View>
                          <Text
                            style={{
                              fontSize: 8,
                              fontWeight: "700",
                              color: colors.textMuted,
                              textTransform: "uppercase",
                              textAlign: "center",
                            }}
                          >
                            Focus
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Milestone Card */}
                    <View
                      style={{
                        backgroundColor:
                          colorScheme === "light"
                            ? "rgba(99,102,241,0.03)"
                            : "rgba(99,102,241,0.05)",
                        borderColor: colors.border,
                        borderWidth: 1.2,
                        borderRadius: 16,
                        padding: 14,
                        gap: 12,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "800",
                            color: colors.primary,
                            textTransform: "uppercase",
                            letterSpacing: 0.8,
                          }}
                        >
                          Stage {milestoneInfo.stage}/7: {milestoneInfo.name}
                        </Text>
                        <Text
                          style={{
                            fontSize: 9,
                            fontWeight: "700",
                            color: colors.textMuted,
                          }}
                        >
                          {milestoneInfo.range}
                        </Text>
                      </View>

                      <Text
                        style={{
                          fontSize: 11,
                          color: colors.textMuted,
                          lineHeight: 15,
                        }}
                      >
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
                              const progressInStage = Math.max(
                                0,
                                current - minVal,
                              );
                              const pct =
                                (progressInStage / totalInStage) * 100;

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
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            {(() => {
                              const nextMilestone = [10, 25, 50, 100, 250, 500][
                                milestoneInfo.stage - 1
                              ];
                              const remaining = nextMilestone - lifetimePebbles;
                              return (
                                <Text
                                  style={{
                                    fontSize: 9,
                                    fontWeight: "600",
                                    color: colors.textMuted,
                                  }}
                                >
                                  {remaining} pebble{remaining === 1 ? "" : "s"}{" "}
                                  to Stage {milestoneInfo.stage + 1}
                                </Text>
                              );
                            })()}

                            {(() => {
                              const nextUnlock = [
                                { count: 10, label: "Sprout Jar Nest" },
                                { count: 26, label: "Curious Mascot grows" },
                                { count: 100, label: "Zen Energy floats" },
                                {
                                  count: 101,
                                  label: "Crowned Mascot & sparkles",
                                },
                                { count: 500, label: "Golden Jar & sparks" },
                              ].find((u) => lifetimePebbles < u.count);

                              if (!nextUnlock) return null;

                              return (
                                <Text
                                  style={{
                                    fontSize: 8,
                                    fontWeight: "700",
                                    textTransform: "uppercase",
                                    color: colors.warning,
                                  }}
                                >
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

      {/* Zen Mode Overlay */}
      <Modal
        visible={isZenModeActive}
        transparent
        animationType="fade"
        onRequestClose={() => setIsZenModeActive(false)}
      >
        <View style={{ flex: 1 }}>
          <BlurView
            intensity={colorScheme === "light" ? 70 : 90}
            style={StyleSheet.absoluteFill}
            tint={colorScheme === "light" ? "light" : "dark"}
          />
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              padding: 24,
            }}
          >
            {/* Top Exit Button */}
            <View style={{ position: "absolute", top: 50, right: 24 }}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                    () => {},
                  );
                  setIsZenModeActive(false);
                }}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: colors.card,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1.5,
                  borderColor: colors.border,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 4,
                  elevation: 2,
                }}
              >
                <Feather name="x" size={22} color={colors.text} />
              </Pressable>
            </View>

            {/* Breathing Wave Backdrop */}
            <Animated.View
              style={[
                {
                  width: 280,
                  height: 280,
                  borderRadius: 140,
                  backgroundColor:
                    colorScheme === "light"
                      ? "rgba(99, 102, 241, 0.06)"
                      : "rgba(99, 102, 241, 0.1)",
                  position: "absolute",
                  alignSelf: "center",
                  zIndex: -1,
                },
                breathStyle,
              ]}
            />

            {/* Content Area */}
            {(() => {
              const activeZenTask = todoStats.pending[0];
              const activeZenHabit = pendingHabits[0];
              if (activeZenTask) {
                const folder = activeZenTask.folderId
                  ? getFolderById(activeZenTask.folderId)
                  : null;
                return (
                  <View
                    style={{ alignItems: "center", gap: 24, width: "100%" }}
                  >
                    <View style={{ alignItems: "center", gap: 6 }}>
                      <Text style={{ fontSize: 18 }}>🧘</Text>
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "800",
                          color: colors.primary,
                          textTransform: "uppercase",
                          letterSpacing: 1.5,
                          textAlign: "center",
                        }}
                      >
                        {folder
                          ? `${folder.emoji} ${folder.name}`
                          : "FOCUS PEBBLE"}
                      </Text>
                    </View>

                    <Text
                      style={{
                        fontSize: 26,
                        fontWeight: "900",
                        color: colors.text,
                        textAlign: "center",
                        lineHeight: 36,
                        marginHorizontal: 16,
                      }}
                    >
                      {activeZenTask.title}
                    </Text>

                    <View
                      style={{ marginTop: 32, alignItems: "center", gap: 10 }}
                    >
                      <AnimatedCheckbox
                        checked={false}
                        onToggle={async (e) => {
                          await completeTodoFromDashboard(activeZenTask.id, e);
                          setTimeout(() => {
                            setIsZenModeActive(false);
                          }, 350);
                        }}
                        size={64}
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color: colors.textMuted,
                          marginTop: 4,
                        }}
                      >
                        Tap to complete and drop pebble
                      </Text>
                    </View>
                  </View>
                );
              } else if (activeZenHabit) {
                const folder = activeZenHabit.folderId
                  ? getFolderById(activeZenHabit.folderId)
                  : null;
                return (
                  <View
                    style={{ alignItems: "center", gap: 24, width: "100%" }}
                  >
                    <View style={{ alignItems: "center", gap: 6 }}>
                      <Text style={{ fontSize: 18 }}>⚡</Text>
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "800",
                          color: "#F59E0B",
                          textTransform: "uppercase",
                          letterSpacing: 1.5,
                          textAlign: "center",
                        }}
                      >
                        {folder
                          ? `${folder.emoji} ${folder.name} • HABIT`
                          : "FOCUS HABIT"}
                      </Text>
                    </View>

                    <Text
                      style={{
                        fontSize: 26,
                        fontWeight: "900",
                        color: colors.text,
                        textAlign: "center",
                        lineHeight: 36,
                        marginHorizontal: 16,
                      }}
                    >
                      {activeZenHabit.title}
                    </Text>

                    {activeZenHabit.streak > 0 && (
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: "#F59E0B",
                          marginTop: -12,
                        }}
                      >
                        🔥 {activeZenHabit.streak} Day Streak
                      </Text>
                    )}

                    <View
                      style={{ marginTop: 32, alignItems: "center", gap: 10 }}
                    >
                      <AnimatedCheckbox
                        checked={false}
                        onToggle={async (e) => {
                          await completeHabitFromDashboard(
                            activeZenHabit.id,
                            e,
                          );
                          setTimeout(() => {
                            setIsZenModeActive(false);
                          }, 350);
                        }}
                        size={64}
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color: colors.textMuted,
                          marginTop: 4,
                        }}
                      >
                        Tap to complete and drop pebble
                      </Text>
                    </View>
                  </View>
                );
              }

              return (
                <View style={{ alignItems: "center", gap: 12 }}>
                  <Text style={{ fontSize: 32 }}>✨</Text>
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: "800",
                      color: colors.text,
                      textAlign: "center",
                    }}
                  >
                    Clear mind, quiet jar.
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: colors.textMuted,
                      textAlign: "center",
                      marginHorizontal: 24,
                      lineHeight: 18,
                    }}
                  >
                    All tasks and habits completed for today. Take a moment to
                    enjoy the stillness.
                  </Text>
                </View>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Review My Day Modal */}
      <Modal
        visible={isReviewModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsReviewModalVisible(false)}
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
              <Text
                style={[localStyles.modalHeaderTitle, { color: colors.text }]}
              >
                Review My Day
              </Text>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                    () => {},
                  );
                  setIsReviewModalVisible(false);
                }}
                style={localStyles.closeButton}
              >
                <Feather name="x" size={20} color={colors.text} />
              </Pressable>
            </View>

            {/* Illustration/Moon Header */}
            <View style={{ alignItems: "center", marginVertical: 8, gap: 4 }}>
              <Text style={{ fontSize: 44 }}>🌙</Text>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "800",
                  color: colors.text,
                  textAlign: "center",
                }}
              >
                Reflect & Plan
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: colors.textMuted,
                  textAlign: "center",
                  marginHorizontal: 24,
                }}
              >
                Letting go of today lets you focus on tomorrow.
              </Text>
            </View>

            {/* Gratitude Input */}
            <View style={{ width: "100%", gap: 6 }}>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "800",
                  color: colors.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                }}
              >
                What are you grateful for today?
              </Text>
              <TextInput
                style={{
                  width: "100%",
                  minHeight: 64,
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderWidth: 1.5,
                  borderRadius: 16,
                  padding: 12,
                  fontSize: 14,
                  color: colors.text,
                  textAlignVertical: "top",
                }}
                placeholder="A warm coffee, finishing a hard project..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
                value={gratitudeText}
                onChangeText={setGratitudeText}
              />
            </View>

            {/* Intention Input */}
            <View style={{ width: "100%", gap: 6, marginTop: 4 }}>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "800",
                  color: colors.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                }}
              >
                What is your main focus for tomorrow?
              </Text>
              <TextInput
                style={{
                  width: "100%",
                  minHeight: 64,
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderWidth: 1.5,
                  borderRadius: 16,
                  padding: 12,
                  fontSize: 14,
                  color: colors.text,
                  textAlignVertical: "top",
                }}
                placeholder="Finish task writing, run in morning..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
                value={intentionText}
                onChangeText={setIntentionText}
              />
            </View>

            {/* Save Button */}
            <PressableScale
              onPress={handleSaveReview}
              haptic
              style={{
                backgroundColor: colors.primary,
                borderRadius: 16,
                paddingVertical: 14,
                width: "100%",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 12,
              }}
            >
              <Text
                style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 15 }}
              >
                Save & Close
              </Text>
            </PressableScale>
          </View>
        </View>
      </Modal>

      {flyingPebbles.map((pebble) => (
        <ProjectilePebble
          key={pebble.id}
          startX={pebble.startX}
          startY={pebble.startY}
          endX={targetCoordinates.x}
          endY={targetCoordinates.y}
          type={pebble.type}
          onComplete={() => handlePebbleAnimationComplete(pebble.id)}
        />
      ))}
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
