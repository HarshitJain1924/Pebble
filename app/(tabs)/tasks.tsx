import React from "react";
import { AppText as Text, AppTextInput as TextInput } from "@/shared/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import {
    Alert,
    BackHandler,
    Dimensions,
    Image as RNImage,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View
} from "react-native";
import * as Haptics from "expo-haptics";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getCircadianArtSource, getCircadianPeriod } from "@/features/today/components/PebbleCircadianHeader";
import { getPebbleDockClearance } from "@/shared/components/navigation/PebbleRadialTabBar";
import { getTasksSubtitleBreakdown } from "@/features/tasks/utils/task-formatting";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

import { Task, Habit, Workspace, Checklist, Resource, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { getTaskOccurrenceState, isTaskCompleted } from "@/shared/utils/domain-selectors";
import { generateId } from "@/shared/utils/id";
import { AppCard } from "@/shared/components/ui/AppCard";
import { HabitStreakCard } from "@/features/habits/components/HabitStreakCard";

import { AppHeader } from "@/shared/components/ui/AppHeader";
import { styles } from "@/shared/constants/taskStyles";
import { Colors, Palette, colorWithAlpha } from "@/shared/constants/theme";
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

import { useTasksState, getDateKey } from "@/features/tasks/hooks/useTasksState";
import { DEFAULT_TASK_CATEGORY, TASK_CATEGORY_META } from "@/features/tasks/services/task-categories";
import { isRecurringOccurrenceForDate } from "@/services/scheduling/recurrence.service";

export function WorkspacesScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const insets = useSafeAreaInsets();
  const topInset = Math.max(
    insets.top,
    Platform.OS === "android" ? 44 : 20,
  );
  const scenicHeight = 180 + topInset;

  const isDark = colorScheme === "dark";
  const isLight = colorScheme === "light";

  const state = useTasksState();

  const [newChecklistTitle, setNewChecklistTitle] = React.useState("");
  const [newChecklistItems, setNewChecklistItems] = React.useState("");
  const [isAddingChecklist, setIsAddingChecklist] = React.useState(false);
  const [editingChecklistId, setEditingChecklistId] = React.useState<string | null>(null);
  const [expandedChecklistIds, setExpandedChecklistIds] = React.useState<Record<string, boolean>>({});
  const [isSearchActive, setIsSearchActive] = React.useState(false);
  const [workspaceMenuVisible, setWorkspaceMenuVisible] = React.useState(false);
  const [inboxProtectionVisible, setInboxProtectionVisible] = React.useState(false);

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
        translucent
        backgroundColor="transparent"
      />

      {/* Background Scenic Art extending full bleed under status bar & camera */}
      {state.activeWorkspaceId ? (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: scenicHeight,
            overflow: "hidden",
            zIndex: 0,
          }}
          pointerEvents="none"
        >
          <RNImage
            source={getCircadianArtSource(getCircadianPeriod(), isDark)}
            style={{ width: "100%", height: scenicHeight }}
            resizeMode="cover"
            accessibilityLabel="Workspace scenic artwork"
          />
          <Svg
            style={StyleSheet.absoluteFill}
            width="100%"
            height={scenicHeight}
          >
            <Defs>
              {/* Subtle top vignette for front camera punch-hole and status bar readability */}
              <LinearGradient id="wsCircadianTopVignette" x1="0" y1="0" x2="0" y2="1">
                <Stop
                  offset="0%"
                  stopColor={Palette.black}
                  stopOpacity={isDark ? "0.32" : "0.15"}
                />
                <Stop offset="100%" stopColor={Palette.black} stopOpacity="0" />
              </LinearGradient>
              {/* Bottom fade into background */}
              <LinearGradient id="wsCircadianFade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={colors.background} stopOpacity="0" />
                <Stop offset="30%" stopColor={colors.background} stopOpacity="0.08" />
                <Stop offset="65%" stopColor={colors.background} stopOpacity={isDark ? "0.7" : "0.55"} />
                <Stop offset="85%" stopColor={colors.background} stopOpacity="1" />
                <Stop offset="100%" stopColor={colors.background} stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Rect
              x="0"
              y="0"
              width="100%"
              height={scenicHeight * 0.4}
              fill="url(#wsCircadianTopVignette)"
            />
            <Rect
              x="0"
              y="0"
              width="100%"
              height={scenicHeight}
              fill="url(#wsCircadianFade)"
            />
          </Svg>
        </View>
      ) : null}

      <SafeAreaView style={[styles.safeArea, { backgroundColor: "transparent" }]}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.container, { paddingTop: 6 }]}>
            {/* Header */}
            {state.activeWorkspaceId ? (
              <View style={{ marginBottom: 14 }}>
                {/* Top Navigation Bar */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 4,
                    paddingTop: 4,
                    paddingBottom: 8,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
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
                      style={{
                        padding: 6,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Feather name="arrow-left" size={20} color={colors.text} />
                    </PressableScale>

                    {(() => {
                      const currentFolder = state.workspaces.find((l) => l.id === state.activeWorkspaceId) as any;
                      const hasIcon = currentFolder?.iconType === "icon";
                      const folderColor = currentFolder?.color || colors.primary;
                      const isInbox = currentFolder?.id === INBOX_WORKSPACE_ID;

                      // Subtitle computation
                      let subtitle = "";
                      if (state.workspaceSegment === "tasks") {
                        const todayCount = state.todayTodos.filter((t) => !isTaskCompleted(t)).length;
                        const earlierCount = state.overdueTodos.filter((t) => !isTaskCompleted(t)).length;
                        const upcomingCount = state.upcomingTodos.filter((t) => !isTaskCompleted(t)).length;
                        const somedayCount = state.inboxTodos.filter((t) => !isTaskCompleted(t)).length;
                        subtitle = getTasksSubtitleBreakdown({
                          today: todayCount,
                          earlier: earlierCount,
                          upcoming: upcomingCount,
                          someday: somedayCount,
                        });
                      } else if (state.workspaceSegment === "habits") {
                        const todayKey = getDateKey();
                        const activeHabits = state.habits.filter(
                          (h) => !h.archivedAt && (h.workspaceId || INBOX_WORKSPACE_ID) === state.activeWorkspaceId
                        );
                        const dueTodayCount = activeHabits.filter((h) =>
                          isRecurringOccurrenceForDate(h, todayKey)
                        ).length;
                        subtitle = `${activeHabits.length} active habits • ${dueTodayCount} due today`;
                      } else if (state.workspaceSegment === "checklists") {
                        const folderChecklists = (
                          state.checklists[state.activeWorkspaceId || INBOX_WORKSPACE_ID] || []
                        ).filter((c) => !c.archivedAt);
                        const completed = folderChecklists.filter(
                          (c) => c.items.length > 0 && c.items.every((i) => i.completed)
                        ).length;
                        subtitle = `${folderChecklists.length} checklists • ${completed} completed`;
                      } else {
                        subtitle = `${allResources.length} resources`;
                      }

                      return (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                          {/* Squircle Badge */}
                          <View
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: 11,
                              backgroundColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.95)",
                              borderWidth: 1,
                              borderColor: colors.border,
                              justifyContent: "center",
                              alignItems: "center",
                            }}
                          >
                            {hasIcon ? (
                              <Feather
                                name={currentFolder?.icon || (isInbox ? "inbox" : "folder")}
                                size={18}
                                color={folderColor}
                              />
                            ) : (
                              <Text style={{ fontSize: 18 }}>{currentFolder?.emoji || (isInbox ? "📥" : "📁")}</Text>
                            )}
                          </View>

                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                fontSize: 19,
                                fontWeight: "800",
                                color: colors.text,
                                letterSpacing: -0.3,
                              }}
                              numberOfLines={1}
                            >
                              {currentFolder?.name || "Workspace"}
                            </Text>
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: "500",
                                color: colors.textMuted,
                                marginTop: 1,
                              }}
                              numberOfLines={1}
                            >
                              {subtitle}
                            </Text>
                          </View>
                        </View>
                      );
                    })()}
                  </View>

                  {/* Circular Search + More Options */}
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <PressableScale
                      onPress={() => {
                        setIsSearchActive(!isSearchActive);
                        if (isSearchActive) {
                          state.setSearchQuery("");
                        }
                      }}
                      haptic
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel="Search"
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.9)",
                        borderWidth: 1,
                        borderColor: isSearchActive ? colors.primary : colors.border,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Feather name="search" size={16} color={isSearchActive ? colors.primary : colors.text} />
                    </PressableScale>

                    <PressableScale
                      onPress={() => setWorkspaceMenuVisible(true)}
                      haptic
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel="More options"
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.9)",
                        borderWidth: 1,
                        borderColor: colors.border,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Feather name="more-horizontal" size={16} color={colors.text} />
                    </PressableScale>
                  </View>
                </View>

                {/* Progressive Search Disclosure Input */}
                {isSearchActive && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: colors.card,
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      height: 38,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor: colors.border,
                      marginHorizontal: 4,
                    }}
                  >
                    <Feather name="search" size={14} color={colors.textMuted} style={{ marginRight: 6 }} />
                    <TextInput
                      value={state.searchQuery}
                      onChangeText={state.setSearchQuery}
                      placeholder={searchPlaceholder}
                      placeholderTextColor={colors.textMuted}
                      style={{
                        flex: 1,
                        color: colors.text,
                        fontSize: 13,
                        height: "100%",
                        padding: 0,
                      }}
                      autoFocus
                    />
                    {state.searchQuery.length > 0 && (
                      <Pressable onPress={() => state.setSearchQuery("")} hitSlop={10}>
                        <Feather name="x" size={14} color={colors.textMuted} />
                      </Pressable>
                    )}
                  </View>
                )}

                {/* 4-Pill Segmented Switcher */}
                <View
                  style={{
                    flexDirection: "row",
                    backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : Palette.white,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: 4,
                    marginHorizontal: 4,
                    marginTop: 6,
                    shadowColor: Palette.black,
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: isDark ? 0.2 : 0.03,
                    shadowRadius: 4,
                    elevation: 1,
                  }}
                >
                  {[
                    { key: "tasks", label: "Tasks", icon: "clipboard" },
                    { key: "habits", label: "Habits", icon: "activity" },
                    { key: "checklists", label: "Checklists", icon: "check-square" },
                    { key: "resources", label: "Resources", icon: "file-text" },
                  ].map((seg) => {
                    const isActive = state.workspaceSegment === seg.key;
                    const activeBg = colorWithAlpha(colors.primary, isDark ? 0.22 : 0.12);
                    const activeColor = isDark ? colors.primaryLight : colors.primary;
                    const inactiveColor = colors.textMuted;

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
                        style={{
                          flex: 1,
                          minHeight: 44,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 5,
                          paddingVertical: 8,
                          paddingHorizontal: 4,
                          borderRadius: 12,
                          backgroundColor: isActive ? activeBg : "transparent",
                        }}
                      >
                        {isActive && (
                          <Feather
                            name={seg.icon as any}
                            size={13}
                            color={activeColor}
                          />
                        )}
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: isActive ? "700" : "600",
                            color: isActive ? activeColor : inactiveColor,
                          }}
                          numberOfLines={1}
                        >
                          {seg.label}
                        </Text>
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
                contentContainerStyle={{ gap: 20, paddingBottom: getPebbleDockClearance(insets.bottom) }}
                showsVerticalScrollIndicator={false}
              >
                {/* Tasks Section */}
                {state.workspaceSegment === "tasks" && (
                  <View style={{ gap: 10 }}>
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
                      onCreateHabit={() => {
                        state.setIsAddingHabit(true);
                      }}
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
                          onCreateItem={() => setIsAddingChecklist(true)}
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

      {/* Create/Edit Checklist Modal */}
      <Modal
        visible={isAddingChecklist}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setIsAddingChecklist(false);
          setEditingChecklistId(null);
          setNewChecklistTitle("");
          setNewChecklistItems("");
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
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
              backgroundColor: colors.card,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: colors.text }}>
                {editingChecklistId ? "Edit Checklist" : "Create Checklist"}
              </Text>
              <TouchableOpacity onPress={() => {
                setIsAddingChecklist(false);
                setEditingChecklistId(null);
                setNewChecklistTitle("");
                setNewChecklistItems("");
              }}>
                <Feather name="x" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 12 }}>
              <TextInput
                value={newChecklistTitle}
                onChangeText={setNewChecklistTitle}
                placeholder="Checklist title (e.g. Packing list)..."
                placeholderTextColor={colors.textMuted}
                style={{
                  backgroundColor: colorScheme === "light" ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)",
                  color: colors.text,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  fontSize: 14,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
              <TextInput
                value={newChecklistItems}
                onChangeText={setNewChecklistItems}
                placeholder="Items (comma-separated, e.g. Bread, Milk, Eggs)..."
                placeholderTextColor={colors.textMuted}
                multiline
                style={{
                  backgroundColor: colorScheme === "light" ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)",
                  color: colors.text,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  fontSize: 14,
                  minHeight: 80,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            </View>

            <TouchableOpacity
              onPress={() => {
                if (newChecklistTitle.trim()) {
                  const itemsArray = newChecklistItems
                    .split(",")
                    .map(i => i.trim())
                    .filter(i => i.length > 0);

                  if (editingChecklistId) {
                    const folderChecklists = state.checklists[state.activeWorkspaceId || INBOX_WORKSPACE_ID] || [];
                    const target = folderChecklists.find(c => c.id === editingChecklistId);
                    if (target) {
                      const updatedItems = itemsArray.map((title) => {
                        const existing = target.items.find(i => i.title.toLowerCase() === title.toLowerCase());
                        return {
                          id: existing?.id || `checklist-item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                          title,
                          completed: existing?.completed || false
                        };
                      });
                      state.updateChecklist({
                        ...target,
                        title: newChecklistTitle.trim(),
                        items: updatedItems
                      });
                    }
                    setEditingChecklistId(null);
                  } else {
                    state.addChecklist(
                      newChecklistTitle.trim(),
                      itemsArray,
                      state.activeWorkspaceId || INBOX_WORKSPACE_ID
                    );
                  }

                  setNewChecklistTitle("");
                  setNewChecklistItems("");
                  setIsAddingChecklist(false);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                } else {
                  Alert.alert("Title Required", "Please enter a checklist title.");
                }
              }}
              style={{
                backgroundColor: colors.primary,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                marginTop: 6,
              }}
            >
              <Text style={{ color: Palette.white, fontWeight: "700", fontSize: 14 }}>
                {editingChecklistId ? "Save Changes" : "Create Checklist"}
              </Text>
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

