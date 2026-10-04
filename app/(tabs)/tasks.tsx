import React from "react";
import { AppText as Text, AppTextInput as TextInput } from "@/shared/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import {
    Alert,
    Animated,
    BackHandler,
    Easing,
    KeyboardAvoidingView,
    Modal,
    PanResponder,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View
} from "react-native";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { getPebbleDockClearance } from "@/shared/components/navigation/PebbleRadialTabBar";
import { MONTH_NAMES, WEEKDAY_NAMES } from "@/features/tasks/utils/task-formatting";

import { Task, Workspace, Checklist, Resource, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { generateId } from "@/shared/utils/id";
import { AppCard } from "@/shared/components/ui/AppCard";
import { HabitStreakCard } from "@/features/habits/components/HabitStreakCard";

import { AppHeader } from "@/shared/components/ui/AppHeader";
import { styles } from "@/shared/constants/taskStyles";
import { Colors, Palette } from "@/shared/constants/theme";
import { Typography } from "@/shared/constants/typography";
import { Spacing } from "@/shared/constants/spacing";
import { Radius } from "@/shared/constants/radii";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import PressableScale from "@/shared/components/ui/PressableScale";

import { WorkspaceModal } from "@/features/workspaces/components/WorkspaceModal";
import { WorkspaceGrid } from "@/features/workspaces/components/WorkspaceGrid";
import { ReminderModal } from "@/features/calendar/components/ReminderModal";
import { AnimatedOverlay } from "@/shared/components/ui/AnimatedOverlay";
import { emitStateChange } from "@/services/events/state-events";
import { TaskSections } from "@/features/tasks/components/TaskSections";
import { HabitSection } from "@/features/habits/components/HabitSection";
import { SuggestionBanner } from "@/features/capture/components/SuggestionBanner";
import { ProgressSection } from "@/features/profile/components/ProgressSection";
import { ResourceSection } from "@/features/resources/components/ResourceSection";
import { ChecklistSection } from "@/features/checklists/components/ChecklistSection";
import { EmptyState } from "@/shared/components/ui/EmptyState";
import { WorkspaceEmptyState } from "@/features/workspaces/components/WorkspaceEmptyState";
import { TaskFilterModal } from "@/features/tasks/components/TaskFilterModal";
import { TaskDatePickerModal } from "@/features/tasks/components/TaskDatePickerModal";

import { useTasksState, getDateKey } from "@/features/tasks/hooks/useTasksState";
import { getTodayDateKey, getOffsetDateKey, parseDateKey } from "@/shared/utils/date-key";
import { DEFAULT_TASK_CATEGORY, TASK_CATEGORY_META } from "@/features/tasks/services/task-categories";

const DATE_DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * 3-day calendar strip (direction #5) providing global temporal context for the
 * active workspace across all peer domains (Tasks, Habits, Checklists, Resources).
 *
 * Visual hierarchy:
 *   [ Prev Day (Sat 3) ]   [ Selected Day (Oct 4 \n Today) ]   [ Next Day (Mon 5) ]
 *
 * Selected date is dominant with Pine accent when Today. Neighbors are quiet and muted.
 * Supports horizontal swipe with spring recovery + directional transition, and tap to
 * open date picker or navigate to adjacent days.
 */
function WorkspaceCalendarStrip({
  dateKey,
  colors,
  onPrevDay,
  onNextDay,
  onOpenDatePicker,
}: {
  dateKey: string;
  colors: any;
  onPrevDay: () => void;
  onNextDay: () => void;
  onOpenDatePicker?: () => void;
}) {
  const dragX = React.useMemo(() => new Animated.Value(0), []);
  const enterX = React.useMemo(() => new Animated.Value(0), []);
  const directionRef = React.useRef(1);
  const previousKeyRef = React.useRef(dateKey);

  React.useEffect(() => {
    if (previousKeyRef.current === dateKey) return;
    previousKeyRef.current = dateKey;
    enterX.setValue(directionRef.current * 16);
    Animated.timing(enterX, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [dateKey, enterX]);

  const handlePrev = React.useCallback(() => {
    directionRef.current = -1;
    Haptics.selectionAsync().catch(() => {});
    onPrevDay();
  }, [onPrevDay]);

  const handleNext = React.useCallback(() => {
    directionRef.current = 1;
    Haptics.selectionAsync().catch(() => {});
    onNextDay();
  }, [onNextDay]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 10 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
        onPanResponderMove: (_event, gesture) => {
          dragX.setValue(gesture.dx * 0.35);
        },
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx <= -36) {
            handleNext();
          } else if (gesture.dx >= 36) {
            handlePrev();
          }
          Animated.spring(dragX, {
            toValue: 0,
            useNativeDriver: true,
            damping: 20,
            stiffness: 220,
            mass: 0.6,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(dragX, { toValue: 0, useNativeDriver: true }).start();
        },
      }),
    [dragX, handleNext, handlePrev],
  );

  const translateX = React.useMemo(
    () => Animated.add(dragX, enterX),
    [dragX, enterX],
  );

  const todayKey = getTodayDateKey();
  const yesterdayKey = getOffsetDateKey(1, todayKey);
  const tomorrowKey = getOffsetDateKey(-1, todayKey);

  const prevDateKey = getOffsetDateKey(1, dateKey);
  const nextDateKey = getOffsetDateKey(-1, dateKey);

  const prevParsed = parseDateKey(prevDateKey);
  const currParsed = parseDateKey(dateKey);
  const nextParsed = parseDateKey(nextDateKey);

  const prevWeekday = WEEKDAY_NAMES[prevParsed.getDay()];
  const prevDayNum = prevParsed.getDate();

  const currMonth = MONTH_NAMES[currParsed.getMonth()];
  const currDayNum = currParsed.getDate();
  const isToday = dateKey === todayKey;

  let currSublabel = DATE_DAY_NAMES[currParsed.getDay()];
  if (isToday) {
    currSublabel = "Today";
  } else if (dateKey === tomorrowKey) {
    currSublabel = "Tomorrow";
  } else if (dateKey === yesterdayKey) {
    currSublabel = "Yesterday";
  }

  const nextWeekday = WEEKDAY_NAMES[nextParsed.getDay()];
  const nextDayNum = nextParsed.getDate();

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        calendarStripStyles.container,
        { transform: [{ translateX }] },
      ]}
    >
      {/* Previous Day Slot */}
      <PressableScale
        onPress={handlePrev}
        haptic
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Previous day, ${prevWeekday} ${prevDayNum}`}
        style={calendarStripStyles.slot}
      >
        <Text
          style={[
            calendarStripStyles.neighborText,
            { color: colors.textMuted },
          ]}
          numberOfLines={1}
        >
          {`${prevWeekday} ${prevDayNum}`}
        </Text>
      </PressableScale>

      {/* Selected Day Slot */}
      <PressableScale
        onPress={onOpenDatePicker}
        haptic
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Selected date, ${currMonth} ${currDayNum}${isToday ? ", Today" : ""}. Tap to open date picker.`}
        style={[calendarStripStyles.slot, calendarStripStyles.centerSlot]}
      >
        <Text
          style={[
            calendarStripStyles.centerDateText,
            { color: colors.text },
          ]}
          numberOfLines={1}
        >
          {`${currMonth} ${currDayNum}`}
        </Text>
        <Text
          style={[
            calendarStripStyles.centerSublabel,
            { color: isToday ? colors.primary : colors.textMuted },
          ]}
          numberOfLines={1}
        >
          {currSublabel}
        </Text>
      </PressableScale>

      {/* Next Day Slot */}
      <PressableScale
        onPress={handleNext}
        haptic
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Next day, ${nextWeekday} ${nextDayNum}`}
        style={calendarStripStyles.slot}
      >
        <Text
          style={[
            calendarStripStyles.neighborText,
            { color: colors.textMuted },
          ]}
          numberOfLines={1}
        >
          {`${nextWeekday} ${nextDayNum}`}
        </Text>
      </PressableScale>
    </Animated.View>
  );
}

const calendarStripStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    minHeight: 44,
  },
  slot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingVertical: Spacing.xs,
  },
  centerSlot: {
    gap: 1,
  },
  neighborText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
    letterSpacing: -0.1,
    opacity: 0.65,
  },
  centerDateText: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.semibold,
    letterSpacing: -0.2,
  },
  centerSublabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    letterSpacing: 0.1,
  },
});

const controlRowStyles = StyleSheet.create({
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    minHeight: 44,
    paddingHorizontal: Spacing.sm,
  },
  filterLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    letterSpacing: -0.1,
  },
});

/**
 * Workspace header chrome — shared by all four peer domains. A single identity
 * row (back, workspace-hued badge + title, the inline reference date, and
 * actions) sits above the invariant domain tabs. All values map onto canonical
 * Typography / Spacing / Radius.
 */
const headerStyles = StyleSheet.create({
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
    minHeight: 44,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
  },
  backButton: {
    width: 32,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  identityCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    flex: 1,
  },
  identityLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexShrink: 1,
    paddingRight: Spacing.sm,
  },
  identityBadge: {
    width: 34,
    height: 34,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  titleStack: {
    flexShrink: 1,
    justifyContent: "center",
    gap: 1,
  },
  identityName: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.semibold,
    letterSpacing: -0.4,
    flexShrink: 1,
  },
  identitySubtitle: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.medium,
    letterSpacing: -0.1,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    height: 44,
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
  },
  searchInput: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
    height: "100%",
    padding: 0,
    margin: 0,
  },
  searchClose: {
    padding: Spacing.xs,
  },
});

/** Per-domain context strip — one quiet count row; never duplicates the title. */
const contextStripStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.sm,
    minHeight: 24,
  },
  label: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
    letterSpacing: -0.1,
  },
});

/**
 * Domain tab metrics — constant heights across all four peer pages so
 * switching Tasks/Habits/Checklists/Resources never shifts the layout.
 */
const domainTabStyles = StyleSheet.create({
  tab: {
    flex: 1,
    paddingTop: 10,
    paddingBottom: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontSize: Typography.sizes.sm,
    letterSpacing: -0.2,
  },
  indicator: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    borderRadius: 1,
  },
});

export function WorkspacesScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const insets = useSafeAreaInsets();
  const isDark = colorScheme === "dark";
  const isLight = colorScheme === "light";

  const state = useTasksState();

  // Domain pager — the same order as the tabs. A swipe that starts on empty
  // content space moves between peer pages via the EXISTING
  // setWorkspaceSegment state (no duplicate domain state).
  const DOMAIN_ORDER = ["tasks", "habits", "checklists", "resources"];

  const goToAdjacentDomain = React.useCallback(
    (dir: 1 | -1) => {
      const currentIndex = DOMAIN_ORDER.indexOf(state.workspaceSegment);
      const nextIndex = (currentIndex + dir + DOMAIN_ORDER.length) % DOMAIN_ORDER.length;
      state.setWorkspaceSegment(DOMAIN_ORDER[nextIndex] as any);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.workspaceSegment],
  );

  const domainSwipePan = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 12 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.6,
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx <= -48) {
            Haptics.selectionAsync().catch(() => {});
            goToAdjacentDomain(1);
          } else if (gesture.dx >= 48) {
            Haptics.selectionAsync().catch(() => {});
            goToAdjacentDomain(-1);
          }
        },
      }),
    [goToAdjacentDomain],
  );

  const [expandedChecklistIds, setExpandedChecklistIds] = React.useState<Record<string, boolean>>({});
  const [isSearchActive, setIsSearchActive] = React.useState(false);
  const [workspaceMenuVisible, setWorkspaceMenuVisible] = React.useState(false);
  const [inboxProtectionVisible, setInboxProtectionVisible] = React.useState(false);
  const [isFilterModalVisible, setIsFilterModalVisible] = React.useState(false);
  const [isDatePickerVisible, setIsDatePickerVisible] = React.useState(false);

  const folderHabits = React.useMemo(() => {
    const raw = state.habits.filter((h) => !h.archivedAt && (h.workspaceId || INBOX_WORKSPACE_ID) === state.activeWorkspaceId);
    if (state.searchQuery.trim() === "") return raw;
    return raw.filter((h) => {
      const matchesTitle = h.title.toLowerCase().includes(state.searchQuery.toLowerCase());
      const matchesDesc = h.description?.toLowerCase().includes(state.searchQuery.toLowerCase()) || false;
      const matchesCategory = h.categoryId?.toLowerCase().includes(state.searchQuery.toLowerCase()) || false;
      return matchesTitle || matchesDesc || matchesCategory;
    });
  }, [state.habits, state.activeWorkspaceId, state.searchQuery]);

  const allResources = React.useMemo(() => {
    return state.resources[state.activeWorkspaceId || INBOX_WORKSPACE_ID] || [];
  }, [state.resources, state.activeWorkspaceId]);

  const currentFolder = React.useMemo(
    () => state.workspaces.find((l) => l.id === state.activeWorkspaceId) as any,
    [state.workspaces, state.activeWorkspaceId],
  );

  const workspaceAccent = currentFolder?.color || colors.primary;

  const searchPlaceholder = React.useMemo(() => {
    switch (state.workspaceSegment) {
      case "habits":
        return "Search habits...";
      case "checklists":
        return "Search checklists...";
      case "resources":
        return "Search resources...";
      case "tasks":
      default:
        return "Search tasks...";
    }
  }, [state.workspaceSegment]);

  const activeChecklistCount = React.useMemo(() => {
    const folderChecklists = state.checklists[state.activeWorkspaceId || INBOX_WORKSPACE_ID] || [];
    return folderChecklists.filter((c) => !c.archivedAt).length;
  }, [state.checklists, state.activeWorkspaceId]);

  const workspaceSubtitle = React.useMemo(() => {
    switch (state.workspaceSegment) {
      case "habits":
        return `${folderHabits.length} habit${folderHabits.length === 1 ? "" : "s"}`;
      case "checklists":
        return `${activeChecklistCount} checklist${activeChecklistCount === 1 ? "" : "s"}`;
      case "resources":
        return `${allResources.length} resource${allResources.length === 1 ? "" : "s"}`;
      case "tasks":
      default:
        return `${state.remainingCount} task${state.remainingCount === 1 ? "" : "s"}`;
    }
  }, [state.workspaceSegment, state.remainingCount, folderHabits.length, activeChecklistCount, allResources.length]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        if (state.activeWorkspaceId) {
          state.handleBackToWorkspaces();
          state.setSearchQuery("");
          setIsSearchActive(false);
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => subscription.remove();
    }, [state.activeWorkspaceId, state.handleBackToWorkspaces])
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar
        style={colorScheme === "dark" ? "light" : "dark"}
      />

      <SafeAreaView edges={["top", "left", "right"]} style={[styles.safeArea, { backgroundColor: "transparent" }]}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View
            style={[
              styles.container,
              { paddingTop: 6 },
              // Active-workspace layout: the header + content ScrollView must
              // read as one continuous stack, so no parent gap between them.
              state.activeWorkspaceId ? { gap: 0 } : null,
            ]}
          >
            {/* Header */}
            {state.activeWorkspaceId ? (
              <View style={{ marginBottom: 0 }}>
                {/* Identity bar — the workspace name is the screen's single anchor.
                    Search expands in place instead of stacking another band. */}
                <View style={headerStyles.navRow}>
                  {isSearchActive ? (
                    <View
                      style={[
                        headerStyles.searchBar,
                        { backgroundColor: colors.card, borderColor: colors.border },
                      ]}
                    >
                      <Feather name="search" size={16} color={colors.textMuted} />
                      <TextInput
                        value={state.searchQuery}
                        onChangeText={state.setSearchQuery}
                        placeholder={searchPlaceholder}
                        placeholderTextColor={colors.textMuted}
                        style={[headerStyles.searchInput, { color: colors.text }]}
                        autoFocus
                      />
                      <Pressable
                        onPress={() => {
                          state.setSearchQuery("");
                          setIsSearchActive(false);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Close search"
                        hitSlop={10}
                        style={headerStyles.searchClose}
                      >
                        <Feather name="x" size={16} color={colors.textMuted} />
                      </Pressable>
                    </View>
                  ) : (
                    <>
                      <View style={headerStyles.identityCluster}>
                        <PressableScale
                          onPress={() => {
                            state.handleBackToWorkspaces();
                            state.setSearchQuery("");
                            setIsSearchActive(false);
                          }}
                          haptic
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel="Back to workspaces"
                          style={headerStyles.backButton}
                        >
                          <Feather name="arrow-left" size={20} color={colors.text} />
                        </PressableScale>

                        {/* Workspace identity — a workspace-hued icon badge + title, with
                            the reference date tucked beneath as quiet context. This is
                            the screen's single anchor on every peer domain. */}
                        <View style={headerStyles.identityLabel}>
                          <View
                            style={[
                              headerStyles.identityBadge,
                              { backgroundColor: `${workspaceAccent}1F` },
                            ]}
                          >
                            {currentFolder?.emoji || (state.activeWorkspaceId === INBOX_WORKSPACE_ID) ? (
                              <Text style={{ fontSize: 17 }}>
                                {currentFolder?.emoji || "📥"}
                              </Text>
                            ) : currentFolder?.icon ? (
                              <Feather
                                name={currentFolder.icon as any}
                                size={17}
                                color={workspaceAccent}
                              />
                            ) : (
                              <Feather name="folder" size={17} color={workspaceAccent} />
                            )}
                          </View>

                          <View style={headerStyles.titleStack}>
                            <Text
                              accessibilityRole="header"
                              style={[headerStyles.identityName, { color: colors.text }]}
                              numberOfLines={1}
                            >
                              {currentFolder?.name || "Workspace"}
                            </Text>
                            <Text
                              style={[headerStyles.identitySubtitle, { color: colors.textMuted }]}
                              numberOfLines={1}
                            >
                              {workspaceSubtitle}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View style={headerStyles.actionsRow}>
                        <PressableScale
                          onPress={() => setIsSearchActive(true)}
                          haptic
                          hitSlop={6}
                          accessibilityRole="button"
                          accessibilityLabel="Search"
                          style={headerStyles.iconButton}
                        >
                          <Feather name="search" size={20} color={colors.text} />
                        </PressableScale>

                        <PressableScale
                          onPress={() => setWorkspaceMenuVisible(true)}
                          haptic
                          hitSlop={6}
                          accessibilityRole="button"
                          accessibilityLabel="More options"
                          style={headerStyles.iconButton}
                        >
                          <Feather name="more-horizontal" size={20} color={colors.text} />
                        </PressableScale>
                      </View>
                    </>
                  )}
                </View>

                {/* 3-day Calendar Strip — global workspace temporal context above all domains */}
                <WorkspaceCalendarStrip
                  dateKey={state.selectedDate}
                  colors={colors}
                  onPrevDay={() => state.setSelectedDate((d) => getOffsetDateKey(1, d))}
                  onNextDay={() => state.setSelectedDate((d) => getOffsetDateKey(-1, d))}
                  onOpenDatePicker={() => setIsDatePickerVisible(true)}
                />

                {/* Domain changer — peer pages, lightweight underline tabs.
                    Fixed rhythm so switching pages never shifts the layout. */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-end",
                    paddingHorizontal: 4,
                    marginTop: Spacing.xs,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  }}
                >
                  {[
                    { key: "tasks", label: "Tasks" },
                    { key: "habits", label: "Habits" },
                    { key: "checklists", label: "Checklists" },
                    { key: "resources", label: "Resources" },
                  ].map((seg) => {
                    const isActive = state.workspaceSegment === seg.key;

                    return (
                      <PressableScale
                        key={seg.key}
                        onPress={() => {
                          state.setWorkspaceSegment(seg.key as any);
                        }}
                        haptic
                        accessibilityRole="tab"
                        accessibilityState={{ selected: isActive }}
                        accessibilityLabel={`${seg.label} tab`}
                        style={domainTabStyles.tab}
                      >
                        <Text
                          style={[
                            domainTabStyles.tabLabel,
                            {
                              color: isActive ? colors.text : colors.textMuted,
                              fontWeight: isActive ? "700" : "600",
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {seg.label}
                        </Text>
                        <View
                          style={[
                            domainTabStyles.indicator,
                            { backgroundColor: isActive ? colors.primary : "transparent" },
                          ]}
                        />
                      </PressableScale>
                    );
                  })}
                </View>
              </View>
            ) : (
              <View style={{ marginBottom: 4 }}>
                <AppHeader
                  kicker="Planner"
                  title="Workspaces"
                  subtitle={`${state.workspaces.length} workspaces active`}
                  profile={state.profile}
                  hasUnreadNotifs={state.hasUnreadNotifs}
                  showProfile={false}
                  showNotifications={false}
                  showArchive={true}
                  showTrash={true}
                />

                {/* Workspaces Search Bar & Filters Row */}
                <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 6, gap: 10 }}>
                  <View
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : Palette.slate100,
                      borderRadius: 16,
                      paddingHorizontal: 14,
                      height: 44,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Feather name="search" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
                    <TextInput
                      value={state.searchQuery}
                      onChangeText={state.setSearchQuery}
                      placeholder="Search workspaces..."
                      placeholderTextColor={colors.textMuted}
                      style={{
                        flex: 1,
                        color: colors.text,
                        fontSize: 14,
                        fontWeight: "500",
                        height: "100%",
                        padding: 0,
                      }}
                    />
                    {state.searchQuery.length > 0 && (
                      <Pressable onPress={() => state.setSearchQuery("")} hitSlop={10}>
                        <Feather name="x" size={16} color={colors.textMuted} />
                      </Pressable>
                    )}
                  </View>
                </View>
              </View>
            )}

            {/* Active Content Screens */}
            {state.activeWorkspaceId === null ? (
              <ScrollView style={styles.flex} contentContainerStyle={{ paddingBottom: getPebbleDockClearance(insets.bottom) }} showsVerticalScrollIndicator={false}>
                <SuggestionBanner
                  activeSuggestions={state.activeSuggestions}
                  loadSuggestions={state.loadSuggestions}
                  setHabits={state.setHabits}
                  setTodos={state.setTodos}
                  activeWorkspaceId={state.activeWorkspaceId}
                  selectedWorkspaceId={state.selectedWorkspaceId}
                  getDateKey={getDateKey}
                />
                <WorkspaceGrid
                  workspaces={state.workspaces}
                  todos={state.todos}
                  habits={state.habits}
                  collections={state.resources as any}
                  checklists={state.checklists}
                  searchQuery={state.searchQuery}
                  isHydrated={state.isHydrated}
                  onSelectWorkspace={(id) => {
                    state.handleSelectWorkspace(id);
                  }}
                  onEditWorkspace={(id) => {
                    if (id === INBOX_WORKSPACE_ID) {
                      setInboxProtectionVisible(true);
                      return;
                    }
                    state.setEditingWorkspaceId(id);
                    state.setWorkspaceModalVisible(true);
                  }}
                  onCreateWorkspace={() => {
                    state.setEditingWorkspaceId(null);
                    state.setWorkspaceModalVisible(true);
                  }}
                />
              </ScrollView>
            ) : (
              <ScrollView
                ref={state.scrollViewRef}
                style={styles.flex}
                contentContainerStyle={{ gap: 2, paddingBottom: getPebbleDockClearance(insets.bottom) }}
                showsVerticalScrollIndicator={false}
                {...domainSwipePan.panHandlers}
              >
                {/* Tasks Section */}
                {state.workspaceSegment === "tasks" && (
                  <View style={{ gap: 0 }}>
                    {/* Quiet utility row: task count + Filter (no date label — the
                        date header above the tabs already owns that context) */}
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingHorizontal: 8,
                        paddingTop: 0,
                        paddingBottom: 0,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "500",
                          color: colors.textMuted,
                          letterSpacing: -0.1,
                        }}
                      >
                        {`${state.remainingCount} task${state.remainingCount === 1 ? "" : "s"}`}
                      </Text>

                      <PressableScale
                        onPress={() => setIsFilterModalVisible(true)}
                        haptic
                        scaleTo={0.94}
                        accessibilityRole="button"
                        accessibilityLabel={`Filter tasks, ${state.activeFilterCount} active filters`}
                        style={controlRowStyles.filterButton}
                      >
                        <Feather
                          name="filter"
                          size={13}
                          color={
                            state.activeFilterCount > 0
                              ? isDark
                                ? colors.primaryLight
                                : colors.primary
                              : colors.textMuted
                          }
                        />
                        <Text
                          style={[
                            controlRowStyles.filterLabel,
                            {
                              color: state.activeFilterCount > 0
                                ? isDark
                                  ? colors.primaryLight
                                  : colors.primary
                                : colors.textMuted,
                            },
                          ]}
                        >
                          Filter
                        </Text>
                        {state.activeFilterCount > 0 && (
                          <Text
                            style={[
                              controlRowStyles.filterLabel,
                              {
                                color: isDark ? colors.primaryLight : colors.primary,
                                fontWeight: "700",
                              },
                            ]}
                          >
                            {`· ${state.activeFilterCount}`}
                          </Text>
                        )}
                      </PressableScale>
                    </View>

                    {/* Tasks List */}
                    <TaskSections
                      overdueTodos={state.overdueTodos}
                      todayTodos={state.todayTodos}
                      upcomingTodos={state.upcomingTodos}
                      inboxTodos={state.inboxTodos}
                      workspaces={state.workspaces}
                      selectedWorkspaceId={state.selectedWorkspaceId}
                      showWorkspaceBadge={!state.activeWorkspaceId || state.activeWorkspaceId === "all"}
                      selectedDate={state.selectedDate}
                      completedCount={state.completedCount}
                      onClearCompleted={state.clearCompleted}
                      onToggleTodo={state.toggleTodo}
                      onDeleteTodo={state.deleteTodo}
                      onEditTodo={(todo) => {
                        router.push(`/task-details?id=${todo.id}&type=task&date=${state.selectedDate}`);
                      }}
                      onSetAlarm={state.setAlarmMenu}
                      onTaskLayout={(todoId, y) => {
                        state.setTaskPositions((prev) => ({ ...prev, [todoId]: y }));
                      }}
                      isSelectionMode={state.isBulkSelectActive}
                      selectedItemIds={state.selectedItemIds}
                      allResources={allResources}
                      onToggleLinkResource={state.toggleLinkResource}
                      onToggleSelectItem={(id) => {
                        state.setSelectedItemIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return next;
                        });
                      }}
                      searchQuery={state.searchQuery}
                      onClearSearch={() => state.setSearchQuery("")}
                      onCreateTask={() => emitStateChange("open_quick_add")}
                      onSaveEarlierForLater={state.handleSaveEarlierForLater}
                    />
                  </View>
                )}

                {/* Habits Section */}
                {state.workspaceSegment === "habits" && (
                  <View style={{ gap: 10 }}>
                    {/* Habits List */}
                    <HabitSection
                      displayedHabits={folderHabits}
                      habits={state.habits}
                      setHabits={state.setHabits}
                      persistHabits={state.persistHabits}
                      toggleHabit={state.toggleHabit}
                      deleteHabit={state.deleteHabit}
                      unfinishedHabitCount={state.unfinishedHabitCount}
                      isSelectionMode={state.isBulkSelectActive}
                      selectedItemIds={state.selectedItemIds}
                      allResources={allResources}
                      onToggleLinkResource={state.toggleLinkResource}
                      onToggleSelectItem={(id) => {
                        state.setSelectedItemIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return next;
                        });
                      }}
                      onEditHabit={(item) => {
                        router.push(`/task-details?id=${item.id}&type=habit`);
                      }}
                      onCreateHabit={() => emitStateChange("open_quick_add")}
                      searchQuery={state.searchQuery}
                      onClearSearch={() => state.setSearchQuery("")}
                    />
                  </View>
                )}

                {/* Checklists Section */}
                {state.workspaceSegment === "checklists" && (() => {
                  const folderChecklists = state.checklists[state.activeWorkspaceId || INBOX_WORKSPACE_ID] || [];
                  const activeChecklists = folderChecklists.filter(c => !c.archivedAt);
                  const filteredChecklists = state.searchQuery.trim() === ""
                    ? activeChecklists
                    : activeChecklists.filter(c => {
                        const matchesTitle = c.title.toLowerCase().includes(state.searchQuery.toLowerCase());
                        const matchesItems = c.items.some(i => i.title.toLowerCase().includes(state.searchQuery.toLowerCase()));
                        return matchesTitle || matchesItems;
                      });
                  
                  return (
                    <View style={{ gap: 10, paddingBottom: 24 }}>
                      {filteredChecklists.length === 0 ? (
                        <WorkspaceEmptyState
                          context="checklists"
                          searchQuery={state.searchQuery}
                          onClearSearch={() => state.setSearchQuery("")}
                          onCreateItem={() => emitStateChange("open_quick_add")}
                          style={{ marginVertical: 16 }}
                        />
                      ) : (
                        <ChecklistSection
                          checklists={filteredChecklists}
                          colors={colors}
                          colorScheme={colorScheme}
                          onUpdateChecklist={state.updateChecklist}
                          onDeleteChecklist={(id) => state.deleteChecklist(id, state.activeWorkspaceId || INBOX_WORKSPACE_ID)}
                          onToggleLinkResource={state.toggleLinkResource}
                        />
                      )}
                    </View>
                  );
                })()}

                {/* Resources Section */}
                {(state.workspaceSegment as string) === "resources" && (
                  <View style={{ gap: 10 }}>
                    {/* Context strip — the only home for this domain's count. */}
                    <View style={contextStripStyles.row}>
                      <Text style={[contextStripStyles.label, { color: colors.textMuted }]}>
                        {`${allResources.length} ${allResources.length === 1 ? "resource" : "resources"}`}
                      </Text>
                    </View>
                    <ResourceSection
                      resources={state.resources}
                      lists={state.workspaces}
                      createResource={state.createResource as any}
                      updateResource={state.updateResource}
                      deleteResource={state.deleteResource}
                      toggleArchiveResource={state.toggleArchiveResource}
                      searchQuery={state.searchQuery}
                      activeFolderId={state.activeWorkspaceId || INBOX_WORKSPACE_ID}
                      stateTodos={Object.values(state.todos).flat()}
                      stateHabits={state.habits}
                      stateChecklists={Object.values(state.checklists).flat()}
                      onToggleLinkResource={state.toggleLinkResource}
                      focusResourceId={state.focusResourceId}
                    />
                  </View>
                )}
              </ScrollView>
            )}

            {/* Workspace Creator Modal */}
            <WorkspaceModal
              visible={state.workspaceModalVisible}
              onClose={() => state.setWorkspaceModalVisible(false)}
              editingWorkspaceId={state.editingWorkspaceId}
              workspaces={state.workspaces}
              setWorkspaces={state.setWorkspaces}
              todos={state.todos}
              setTodos={state.setTodos}
              selectedWorkspaceId={state.selectedWorkspaceId}
              setSelectedWorkspaceId={state.setSelectedWorkspaceId}
              activeWorkspaceId={state.activeWorkspaceId}
              setActiveWorkspaceId={state.setActiveWorkspaceId}
              persistState={state.persistState}
              habits={state.habits}
              setHabits={state.setHabits}
              persistHabits={state.persistHabits}
            />

            {/* Workspace Options Bottom Sheet */}
            <AnimatedOverlay
              visible={workspaceMenuVisible}
              onClose={() => setWorkspaceMenuVisible(false)}
              type="bottom-sheet"
            >
              {(close) => {
                const folder = state.workspaces.find((l) => l.id === state.activeWorkspaceId) as any;
                const folderName = folder ? folder.name : "Workspace";
                const isInbox = state.activeWorkspaceId === null || state.activeWorkspaceId === INBOX_WORKSPACE_ID;

                return (
                  <View
                    style={{
                      backgroundColor: colors.card,
                      borderTopLeftRadius: 24,
                      borderTopRightRadius: 24,
                      paddingTop: 16,
                      paddingHorizontal: 20,
                      paddingBottom: Platform.OS === "ios" ? 36 : 24,
                      borderWidth: 1.5,
                      borderColor: colors.border,
                    }}
                  >
                    {/* Header */}
                    <View
                      style={{
                        alignItems: "center",
                        paddingBottom: 16,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border + "40",
                        marginBottom: 12,
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>
                        {folderName}
                      </Text>
                    </View>

                    {/* Options list */}
                    <View style={{ gap: 4 }}>
                      {/* Workspace Settings */}
                      <TouchableOpacity
                        onPress={() => {
                          close();
                          if (isInbox) {
                            setInboxProtectionVisible(true);
                            return;
                          }
                          if (folder) {
                            state.setEditingWorkspaceId(folder.id);
                            state.setWorkspaceModalVisible(true);
                          }
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingVertical: 14,
                          gap: 12,
                          opacity: isInbox ? 0.4 : 1,
                        }}
                      >
                        <Text style={{ fontSize: 18 }}>⚙️</Text>
                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                          Workspace Settings
                        </Text>
                      </TouchableOpacity>

                      {/* Bulk Select */}
                      <TouchableOpacity
                        onPress={() => {
                          close();
                          state.setIsBulkSelectActive(!state.isBulkSelectActive);
                          state.setSelectedItemIds(new Set());
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingVertical: 14,
                          gap: 12,
                        }}
                      >
                        <Text style={{ fontSize: 18 }}>☑️</Text>
                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                          {state.isBulkSelectActive ? "Disable Bulk Select" : "Bulk Select"}
                        </Text>
                      </TouchableOpacity>

                      {/* Rename Workspace */}
                      <TouchableOpacity
                        onPress={() => {
                          close();
                          if (isInbox) {
                            setInboxProtectionVisible(true);
                            return;
                          }
                          if (folder) {
                            if (Platform.OS === "ios") {
                              setTimeout(() => {
                                Alert.prompt(
                                  "Rename Workspace",
                                  "Enter new name:",
                                  [
                                    { text: "Cancel", style: "cancel" },
                                    {
                                      text: "Rename",
                                      onPress: async (newName?: string) => {
                                        if (newName && newName.trim()) {
                                          const updated = state.workspaces.map((l) =>
                                            l.id === folder.id ? { ...l, name: newName.trim() } : l
                                          );
                                          state.setWorkspaces(updated);
                                          await state.persistState(updated, state.selectedWorkspaceId, state.todos);
                                          emitStateChange("tasks_changed");
                                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                                        }
                                      }
                                    }
                                  ],
                                  "plain-text",
                                  folder.name
                                );
                              }, 300);
                            } else {
                              state.setEditingWorkspaceId(folder.id);
                              state.setWorkspaceModalVisible(true);
                            }
                          }
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingVertical: 14,
                          gap: 12,
                          opacity: isInbox ? 0.4 : 1,
                        }}
                      >
                        <Text style={{ fontSize: 18 }}>✏️</Text>
                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                          Rename Workspace
                        </Text>
                      </TouchableOpacity>

                      {/* Archive Workspace */}
                      <TouchableOpacity
                        onPress={() => {
                          close();
                          if (isInbox) {
                            setInboxProtectionVisible(true);
                            return;
                          }
                          if (folder) {
                            setTimeout(() => {
                              Alert.alert(
                                "Archive Workspace",
                                `Are you sure you want to archive "${folder.name}"?`,
                                [
                                  { text: "Cancel", style: "cancel" },
                                  {
                                    text: "Archive",
                                    style: "destructive",
                                    onPress: async () => {
                                      const updated = state.workspaces.map((l) =>
                                        l.id === folder.id ? { ...l, archivedAt: Date.now() } : l
                                      );
                                      state.setWorkspaces(updated);
                                      await state.persistState(updated, INBOX_WORKSPACE_ID, state.todos);
                                      state.setActiveWorkspaceId(INBOX_WORKSPACE_ID);
                                      state.setSelectedWorkspaceId(INBOX_WORKSPACE_ID);
                                      emitStateChange("tasks_changed");
                                      emitStateChange("habits_changed");
                                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                                    }
                                  }
                                ]
                              );
                            }, 300);
                          }
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingVertical: 14,
                          gap: 12,
                          opacity: isInbox ? 0.4 : 1,
                        }}
                      >
                        <Text style={{ fontSize: 18 }}>📦</Text>
                        <Text style={{ color: colors.error, fontSize: 15, fontWeight: "600" }}>
                          Archive Workspace
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Separator before Cancel */}
                    <View style={{ height: 1.5, backgroundColor: colors.border, marginVertical: 12 }} />

                    {/* Cancel option */}
                    <TouchableOpacity
                      onPress={close}
                      style={{
                        alignItems: "center",
                        justifyContent: "center",
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: isLight ? Palette.slate100 : Palette.zinc800,
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
            </AnimatedOverlay>

            {/* Inbox Protected System Workspace Modal */}
            <AnimatedOverlay
              visible={inboxProtectionVisible}
              onClose={() => setInboxProtectionVisible(false)}
              type="center-modal"
            >
              {(close) => (
                <View
                  style={{
                    width: 280,
                    backgroundColor: colors.card,
                    borderRadius: 24,
                    padding: 24,
                    borderWidth: 1.5,
                    borderColor: colors.border,
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Text style={{ fontSize: 32 }}>📥</Text>
                  <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800", textAlign: "center" }}>
                    Inbox is Protected
                  </Text>
                  <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    System Workspace
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20, marginTop: 4 }}>
                    This workspace is protected because it powers quick capture across Pebble.
                  </Text>
                  <View style={{ height: 1, backgroundColor: colors.border + "40", width: "100%", marginVertical: 8 }} />
                  <TouchableOpacity
                    onPress={close}
                    style={{
                      width: "100%",
                      paddingVertical: 12,
                      borderRadius: 12,
                      backgroundColor: colors.primary,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: Palette.white, fontWeight: "700", fontSize: 14 }}>Got it</Text>
                  </TouchableOpacity>
                </View>
              )}
            </AnimatedOverlay>

            {/* Centered Reminder Modal */}
            <ReminderModal
              visible={!!state.alarmMenu}
              todoId={state.alarmMenu}
              todos={state.todos}
              selectedList={state.selectedWorkspaceId}
              onClose={() => state.setAlarmMenu(null)}
              onScheduleAlarm={state.scheduleAlarm}
              onScheduleAlarmWithDays={state.scheduleAlarmWithDays}
            />
          </View>
        </KeyboardAvoidingView>

        {/* Task Editor — routed to full-screen task-details.tsx */}
        {/* Habit Editor — routed to full-screen task-details.tsx */}
        {/* NLPCapture deprecated in favor of global UnifiedCapture */}

      {/* Workspace Picker Modal for Move Action */}
      <Modal visible={state.isMoveModalVisible} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
        >
          <AppCard
            style={{
              width: "100%",
              padding: 20,
              gap: 16,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.text }}>Move to Workspace</Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: -4 }}>
              Select target workspace for {state.selectedItemIds.size} item(s):
            </Text>
            <ScrollView style={{ maxHeight: 200 }} contentContainerStyle={{ gap: 8 }}>
              {state.workspaces.filter((ws) => !ws.archivedAt).map((ws) => (
                <TouchableOpacity
                  key={ws.id}
                  onPress={() => (state as any).handleBulkMove?.(ws.id)}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: colors.cardLight,
                    borderWidth: 1,
                    borderColor: colors.border,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  {ws.iconType === "icon" || (!ws.emoji && ws.icon) ? (
                    <Feather name={(ws.icon || "folder") as any} size={18} color={ws.color || colors.primary} />
                  ) : (
                    <Text style={{ fontSize: 18 }}>{ws.emoji || "📁"}</Text>
                  )}
                  <Text style={{ color: colors.text, fontWeight: "600", fontSize: 14 }}>{ws.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              onPress={() => state.setIsMoveModalVisible(false)}
              style={{
                alignItems: "center",
                padding: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                marginTop: 8,
              }}
            >
              <Text style={{ color: colors.text, fontWeight: "700" }}>Cancel</Text>
            </TouchableOpacity>
          </AppCard>
        </View>
      </Modal>



      {/* Floating Bulk Actions Bar */}
      {state.isBulkSelectActive && state.selectedItemIds.size > 0 && (
        <View
          style={[
            localStyles.bulkBar,
            {
              backgroundColor: isDark ? "rgba(28, 28, 33, 0.95)" : "rgba(255, 255, 255, 0.95)",
              borderColor: colors.border,
            },
          ]}
        >
          <TouchableOpacity onPress={state.handleBulkComplete} style={localStyles.bulkBtn}>
            <Feather name="check-circle" size={18} color={colors.success} />
            <Text style={[localStyles.bulkBtnText, { color: colors.text }]}>Complete</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={state.handleBulkArchive} style={localStyles.bulkBtn}>
            <Feather name="archive" size={18} color={colors.warning} />
            <Text style={[localStyles.bulkBtnText, { color: colors.text }]}>Archive</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => state.setIsMoveModalVisible(true)} style={localStyles.bulkBtn}>
            <Feather name="folder" size={18} color={colors.primary} />
            <Text style={[localStyles.bulkBtnText, { color: colors.text }]}>Move</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={state.handleBulkDelete} style={localStyles.bulkBtn}>
            <Feather name="trash-2" size={18} color={colors.error} />
            <Text style={[localStyles.bulkBtnText, { color: colors.text }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Task Filters Modal */}
      <TaskFilterModal
        visible={isFilterModalVisible}
        onClose={() => setIsFilterModalVisible(false)}
        statusFilter={state.statusFilter}
        onSelectStatus={state.setStatusFilter}
        priorityFilter={state.priorityFilter}
        onSelectPriority={state.setPriorityFilter}
        scheduleFilter={state.scheduleFilter}
        onSelectSchedule={state.setScheduleFilter}
        reminderFilter={state.reminderFilter}
        onSelectReminder={state.setReminderFilter}
        activeFilterCount={state.activeFilterCount}
        onResetFilters={state.resetFilters}
      />

      {/* Task Date Picker Modal */}
      <TaskDatePickerModal
        visible={isDatePickerVisible}
        onClose={() => setIsDatePickerVisible(false)}
        selectedDate={state.selectedDate}
        onSelectDate={(dateKey) => state.setSelectedDate(dateKey)}
        colors={colors}
        isDark={isDark}
      />

      </SafeAreaView>
    </View>
  );
}

const localStyles = StyleSheet.create({
  bulkBar: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 110 : 96,
    left: 20,
    right: 20,
    height: 64,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 10,
    shadowColor: Palette.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 9999,
  },
  bulkBtn: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    flex: 1,
    height: "100%",
  },
  bulkBtnText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
});

export const TasksScreen = WorkspacesScreen;
export default WorkspacesScreen;

