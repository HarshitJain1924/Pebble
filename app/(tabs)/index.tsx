import { type UserProfile } from "@/features/settings/services/settings.service";
import { addStateListener } from "@/services/events/state-events";
import {
  getDashboardFilters,
  saveDashboardFilter,
} from "@/services/storage/storage.service";
import { useUndo } from "@/shared/components/ui/UndoContext";
import { styles } from "@/shared/constants/dashboardStyles";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { ContinueWorkspaceCard } from "@/features/today/components/ContinueWorkspaceCard";
import { DashboardFilterBar } from "@/features/today/components/DashboardFilterBar";
import { PebbleJarProgressCard } from "@/features/today/components/PebbleJarProgressCard";
import { PebbleSanctuaryModal } from "@/features/today/components/PebbleSanctuaryModal";
import { ProjectilePebble } from "@/features/today/components/ProjectilePebble";
import { ReviewMyDayModal } from "@/features/today/components/ReviewMyDayModal";
import { StreakBanner } from "@/features/today/components/StreakBanner";
import { WorkspaceContextCarousel } from "@/features/today/components/WorkspaceContextCarousel";
import { ZenModeModal } from "@/features/today/components/ZenModeModal";
import { useTodayActions } from "@/features/today/hooks/useTodayActions";
import { useTodayDashboard } from "@/features/today/hooks/useTodayDashboard";
import { useTodaySelectors } from "@/features/today/hooks/useTodaySelectors";
import { AppHeader } from "@/shared/components/ui/AppHeader";
import type { Checklist } from "@/shared/types/domain.types";
import { getPebbleCounts, getGemsBalance } from "@/features/profile/services/pebble.service";
import { dateKeyFromDate, getTodayDateKey } from "@/shared/utils/date-key";

const getTodoDateKey = (todo: any) => {
  // Canonical schedule.date (repository normalizes scheduledDate → schedule.date)
  if (todo.schedule?.date) {
    return todo.schedule.date;
  }
  // Derive from canonical reminder.triggerAt
  if (todo.reminder?.triggerAt) {
    return dateKeyFromDate(new Date(todo.reminder.triggerAt));
  }
  const idNum = Number(todo.id);
  if (!isNaN(idNum) && idNum > 100000000000) {
    return dateKeyFromDate(new Date(idNum));
  }
  return getTodayDateKey();
};

const getOverdueLabel = (dateStr: string) => {
  if (!dateStr) return "Overdue";
  const todayStr = getTodayDateKey();
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

export function TodayScreen() {
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
  const [todayPebbles, setTodayPebbles] = useState<number>(0);
  const [todayTypes, setTodayTypes] = useState<{
    task: number;
    habit: number;
    focus: number;
    checklist: number;
  }>({
    task: 0,
    habit: 0,
    focus: 0,
    checklist: 0,
  });
  const [pebbleBalance, setPebbleBalance] = useState<number>(0);
  const [gemsBalance, setGemsBalance] = useState<number>(0);
  const [monthlyTypes, setMonthlyTypes] = useState<{
    task: number;
    habit: number;
    focus: number;
    checklist: number;
  }>({
    task: 0,
    habit: 0,
    focus: 0,
    checklist: 0,
  });
  const [lifetimeTypes, setLifetimeTypes] = useState<{
    task: number;
    habit: number;
    focus: number;
    checklist: number;
  }>({
    task: 0,
    habit: 0,
    focus: 0,
    checklist: 0,
  });
  const [fallingPebbleType, setFallingPebbleType] = useState<
    "task" | "habit" | "focus" | "checklist" | undefined
  >(undefined);
  const [weeklyStatus, setWeeklyStatus] = useState<any[]>([]);
  const [pebbleJarModalVisible, setPebbleJarModalVisible] = useState(false);
  const [isZenModeActive, setIsZenModeActive] = useState(false);
  const [isReviewModalVisible, setIsReviewModalVisible] = useState(false);
  const [gratitudeText, setGratitudeText] = useState("");
  const [intentionText, setIntentionText] = useState("");
  const [showRewardOverlay, setShowRewardOverlay] = useState(false);
  const [rewardStartCount, setRewardStartCount] = useState(0);
  const [rewardTargetCount, setRewardTargetCount] = useState(0);

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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [hasUnreadNotifs, setHasUnreadNotifs] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [expandedChecklistIds, setExpandedChecklistIds] = useState<
    Record<string, boolean>
  >({});
  const [allChecklistsLocal, setAllChecklistsLocal] = useState<
    Record<string, Checklist[]>
  >({});
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

  // Single source of truth for dashboard data — useTodayDashboard owns all state
  const {
    todoStats,
    pendingHabits,
    completedHabits,
    allChecklists,
    allResources,
    categoryCounts,
    habitStats,
    folders,
    mainStreak,
    recoveryInfo: mainStreakRecoveryInfo,
    closestReminderTime: nextReminder,
    isLoading,
    loadDashboardData,
  } = useTodayDashboard();

  const {
    completeTodoFromDashboard,
    completeHabitFromDashboard,
    toggleChecklistItemFromDashboard,
    handleSaveReview,
    handleRecoverMainStreak,
  } = useTodayActions({
    loadDashboardData,
    showUndo,
    setFlyingPebbles,
    setAllChecklists: setAllChecklistsLocal,
    gratitudeText,
    setGratitudeText,
    intentionText,
    setIntentionText,
    setIsReviewModalVisible,
    allTodos: todoStats.pending
      .concat(todoStats.overdue)
      .concat(todoStats.completedTasks ?? []),
    allHabits: pendingHabits.concat(completedHabits),
  });

  const loadPebbleStats = useCallback(async () => {
    try {
      const counts = await getPebbleCounts();
      setLifetimePebbles(counts.lifetime);
      setMonthlyPebbles(counts.monthly);
      setTodayPebbles(counts.today ?? 0);
      setTodayTypes(counts.todayTypes ?? { task: 0, habit: 0, focus: 0, checklist: 0 });
      setMonthlyTypes(counts.monthlyTypes);
      setLifetimeTypes(counts.lifetimeTypes);
      setWeeklyStatus(counts.weeklyStatus);

      const gems = await getGemsBalance();
      setGemsBalance(gems);
    } catch (e) {
      console.warn("Failed to load pebble stats", e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
      void loadPebbleStats();
    }, [loadDashboardData, loadPebbleStats]),
  );

  // Synchronize dashboard state immediately when tasks/habits/profile are modified in other tabs/modals
  useEffect(() => {
    const unsubscribeTasks = addStateListener("tasks_changed", () => {
      console.log("[INSTRUMENT] [TodayScreen] tasks_changed listener FIRED, calling loadDashboardData()");
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
      void loadPebbleStats();
    });

    const unsubscribeChecklists = addStateListener("checklists_changed", () => {
      void loadDashboardData();
    });

    const unsubscribeResources = addStateListener("resources_changed", () => {
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
      unsubscribeResources();
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

  const getGreetingTime = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "Good morning";
    if (hour >= 12 && hour < 17) return "Good afternoon";
    if (hour >= 17 && hour < 21) return "Good evening";
    return "Late night";
  };

  const {
    displayedTodos,
    displayedOverdue,
    displayedPendingHabits,
    displayedCompletedHabits,
    groupedTodayTodos,
    groupedTodayHabits,
    groupedOverdue,
    todayFolderGroups,
    overdueFolderGroups,
    habitsFolderGroups,
    continueWorkspace,
    activeContexts,
    getFolderById,
  } = useTodaySelectors({
    folders,
    todoStats,
    pendingHabits,
    completedHabits,
    allChecklists,
    searchQuery,
    activeFilter,
    selectedFolderFilter,
    selectedPriorityFilter,
    selectedSortOption,
  });

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
            nextReminder={nextReminder !== null ? String(nextReminder) : null}
            hasUnreadNotifs={hasUnreadNotifs}
            streak={mainStreak}
            showSearch={true}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
          />

          {/* Glassmorphic Swipeable Progress Cards (Today & Monthly) */}
          <PebbleJarProgressCard
            colors={colors}
            colorScheme={colorScheme ?? "dark"}
            todoStats={todoStats}
            habitStats={habitStats}
            todayPebbles={todayPebbles}
            todayTypes={todayTypes}
            monthlyTypes={monthlyTypes}
            monthlyPebbles={monthlyPebbles}
            lifetimePebbles={lifetimePebbles}
            jarFillAnim={jarFillAnim}
            cardScrollX={cardScrollX}
            miniJarRef={miniJarRef}
            onJarLayout={onJarLayout}
            breathScale={breathScale}
            parentScrollRef={parentScrollRef}
          />

          {/* Compact Streak Banner */}
          <StreakBanner
            streak={mainStreak}
            recoveryInfo={mainStreakRecoveryInfo}
            onRecover={handleRecoverMainStreak}
            colors={colors}
            colorScheme={colorScheme ?? "dark"}
          />

          {/* Continue Working In Recommendation Card */}
          <ContinueWorkspaceCard
            continueWorkspace={continueWorkspace}
            onPressWorkspace={(workspaceId) =>
              router.push({
                pathname: "/tasks",
                params: { workspaceId },
              } as any)
            }
            colors={colors}
          />

          {/* Global Filter Row */}
          <DashboardFilterBar
            activeFilter={activeFilter}
            onSelectFilter={async (filterKey) => {
              setActiveFilter(filterKey);
              await saveDashboardFilter(filterKey);
            }}
            colors={colors}
          />

          {/* Swipeable Today Contexts Carousel */}
          <WorkspaceContextCarousel
            activeContexts={activeContexts}
            colors={colors}
            colorScheme={colorScheme}
            allCollections={allResources}
            expandedChecklistIds={expandedChecklistIds}
            setExpandedChecklistIds={setExpandedChecklistIds}
            activeCardIndex={activeCardIndex}
            setActiveCardIndex={setActiveCardIndex}
            parentScrollRef={parentScrollRef}
            router={router}
            completeTodoFromDashboard={completeTodoFromDashboard}
            completeHabitFromDashboard={completeHabitFromDashboard}
            toggleChecklistItemFromDashboard={toggleChecklistItemFromDashboard}
          />
        </ScrollView>
      </Animated.View>

      {/* Reward Overlay Modal is rendered globally by MascotOverlay */}

      {/* Sanctuary Jar Modal */}
      <PebbleSanctuaryModal
        visible={pebbleJarModalVisible}
        onClose={() => setPebbleJarModalVisible(false)}
        colorScheme={colorScheme}
        colors={colors}
        lifetimePebbles={lifetimePebbles}
        monthlyPebbles={monthlyPebbles}
        gemsBalance={gemsBalance}
        monthlyTypes={monthlyTypes}
        lifetimeTypes={lifetimeTypes}
        profileAvatar={profile?.avatar}
        getMilestoneInfo={getMilestoneInfo}
      />

      {/* Zen Mode Overlay */}
      <ZenModeModal
        visible={isZenModeActive}
        onClose={() => setIsZenModeActive(false)}
        colorScheme={colorScheme}
        colors={colors}
        breathStyle={breathStyle}
        activeZenTask={todoStats.pending[0] || null}
        activeZenHabit={pendingHabits[0] || null}
        getFolderById={getFolderById}
        onCompleteTask={completeTodoFromDashboard}
        onCompleteHabit={completeHabitFromDashboard}
      />

      {/* Review My Day Modal */}
      <ReviewMyDayModal
        visible={isReviewModalVisible}
        onClose={() => setIsReviewModalVisible(false)}
        colorScheme={colorScheme}
        colors={colors}
        gratitudeText={gratitudeText}
        setGratitudeText={setGratitudeText}
        intentionText={intentionText}
        setIntentionText={setIntentionText}
        onSaveReview={handleSaveReview}
      />

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

export const DashboardScreen = TodayScreen;
export default TodayScreen;
