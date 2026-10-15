import React, { useState, useMemo } from "react";
import { View, StyleSheet } from "react-native";
import Animated, { FadeOut, LinearTransition } from "react-native-reanimated";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import { TodoItem } from "@/features/tasks/components/TaskItem";
import { Colors, Palette } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { styles } from "@/shared/constants/taskStyles";
import { ROW_SPEC } from "@/shared/constants/rowSpec";
import { Spacing } from "@/shared/constants/spacing";
import { Typography } from "@/shared/constants/typography";
import { WorkspaceEmptyState } from "@/features/workspaces/components/WorkspaceEmptyState";
import { Task, Workspace } from "@/shared/types/domain.types";
import { isTaskCompleted, getTaskOccurrenceState } from "@/shared/utils/domain-selectors";
import { getOffsetDateKey, getTodayDateKey, parseDateKey } from "@/shared/utils/date-key";
import { WEEKDAY_NAMES, MONTH_NAMES, TaskSectionContext } from "@/features/tasks/utils/task-formatting";
import PressableScale from "@/shared/components/ui/PressableScale";
import { DateScopedSectionHeader } from "@/features/workspaces/components/DateScopedSectionHeader";

interface TaskSectionsProps {
  overdueTodos: Task[];
  todayTodos: Task[];
  upcomingTodos: Task[];
  inboxTodos: Task[];
  workspaces: Workspace[];
  selectedWorkspaceId: string;
  selectedDate: string;
  completedCount: number;
  onClearCompleted: () => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
  onEditTodo: (todo: Task) => void;
  onSetAlarm: (id: string) => void;
  onTaskLayout?: (todoId: string, y: number) => void;
  isSelectionMode?: boolean;
  selectedItemIds?: Set<string>;
  onToggleSelectItem?: (id: string) => void;
  allResources?: any[];
  onToggleLinkResource?: (itemId: string, itemType: "task", resourceId: string) => void;
  searchQuery?: string;
  onClearSearch?: () => void;
  onCreateTask?: () => void;
  showWorkspaceBadge?: boolean;
  onSaveEarlierForLater?: () => void;
  onSelectDate?: (dateKey: string) => void;
  onOpenDatePicker?: () => void;
}

const SECTION_ICON_SIZE = 14;
const SECTION_CHEVRON_SIZE = 16;

type SectionTone = "primary" | "secondary" | "quiet";

interface SectionHeaderProps {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  colors: any;
  tone?: SectionTone;
  icon?: any;
  iconColor?: string;
  countNoun?: string;
  accessibilityName: string;
  /** Secondary action rendered to the left of the chevron (e.g. "Move to Someday"). */
  action?: React.ReactNode;
}

/**
 * Unified header for the task backlog sections (Earlier / Tomorrow / Upcoming /
 * Someday / Completed).
 *
 * One grammar everywhere: [icon] title · muted count · optional secondary action ·
 * chevron. The chevron is always present because every one of these sections is
 * collapsible regardless of how many items it holds — the previous count-based
 * rule hid a real affordance on short sections.
 *
 * The date header stays `DateScopedSectionHeader`; date navigation is its own
 * affordance and is deliberately not folded into this system.
 */
function SectionHeader({
  title,
  count,
  expanded,
  onToggle,
  colors,
  tone = "secondary",
  icon,
  iconColor,
  countNoun = "task",
  accessibilityName,
  action,
}: SectionHeaderProps) {
  const titleStyle =
    tone === "primary"
      ? sectionStyles.sectionTitlePrimary
      : tone === "quiet"
        ? sectionStyles.sectionTitleQuiet
        : sectionStyles.sectionTitleSecondary;

  return (
    <PressableScale
      onPress={onToggle}
      haptic
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={`${accessibilityName} section, ${count} ${countNoun}${
        count === 1 ? "" : "s"
      }, ${expanded ? "expanded" : "collapsed"}`}
      style={sectionStyles.sectionHeaderRow}
    >
      <View style={sectionStyles.sectionTitleCluster}>
        {icon ? (
          <Feather
            name={icon}
            size={SECTION_ICON_SIZE}
            color={iconColor ?? colors.textMuted}
            style={sectionStyles.sectionIcon}
          />
        ) : null}
        <Text
          style={[titleStyle, { color: tone === "primary" ? colors.text : colors.textMuted }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text
          style={[sectionStyles.sectionCount, { color: colors.textMuted }]}
          numberOfLines={1}
        >
          {`${count} ${countNoun}${count === 1 ? "" : "s"}`}
        </Text>
      </View>

      <View style={sectionStyles.sectionRightCluster}>
        {action}
        <Feather
          name={expanded ? "chevron-up" : "chevron-down"}
          size={SECTION_CHEVRON_SIZE}
          color={colors.textMuted}
        />
      </View>
    </PressableScale>
  );
}

export function TaskSections({
  overdueTodos,
  todayTodos,
  upcomingTodos,
  inboxTodos,
  workspaces,
  selectedWorkspaceId,
  selectedDate,
  completedCount,
  onClearCompleted,
  onToggleTodo,
  onDeleteTodo,
  onEditTodo,
  onSetAlarm,
  onTaskLayout,
  isSelectionMode = false,
  selectedItemIds = new Set(),
  onToggleSelectItem,
  allResources = [],
  onToggleLinkResource,
  searchQuery,
  onClearSearch,
  onCreateTask,
  showWorkspaceBadge,
  onSaveEarlierForLater,
  onSelectDate,
  onOpenDatePicker,
}: TaskSectionsProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isDark = colorScheme !== "light";

  // Section expanded states: Today, Earlier and Tomorrow default open; Upcoming, Someday and Completed collapsed
  const [todayExpanded, setTodayExpanded] = useState(true);
  const [earlierExpanded, setEarlierExpanded] = useState(true);
  const [tomorrowExpanded, setTomorrowExpanded] = useState(true);
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const [somedayExpanded, setSomedayExpanded] = useState(false);
  const [completedExpanded, setCompletedExpanded] = useState(false);

  const todayKey = useMemo(() => getTodayDateKey(), []);

  // Determine section title relative to selected date
  const { primaryTitle, isSelectedDateToday } = useMemo(() => {
    const sDate = selectedDate || todayKey;
    const isToday = sDate === todayKey;
    const tomorrowDateKey = getOffsetDateKey(-1, todayKey);
    const yesterdayDateKey = getOffsetDateKey(1, todayKey);
    const isTomorrow = sDate === tomorrowDateKey;
    const isYesterday = sDate === yesterdayDateKey;

    let title = "Today";

    if (!isToday) {
      if (isTomorrow) {
        title = "Tomorrow";
      } else if (isYesterday) {
        title = "Yesterday";
      } else {
        const parsed = parseDateKey(sDate);
        const weekday = WEEKDAY_NAMES[parsed.getDay()] ?? "";
        const month = MONTH_NAMES[parsed.getMonth()] ?? "";
        const dayNum = parsed.getDate();
        title = `${weekday}, ${month} ${dayNum}`;
      }
    }

    return {
      primaryTitle: title,
      isSelectedDateToday: isToday,
    };
  }, [selectedDate, todayKey]);

  // Group tasks naturally
  const earlierList = useMemo(() => {
    return overdueTodos.filter((t) => !isTaskCompleted(t));
  }, [overdueTodos]);

  const todayList = useMemo(() => {
    return todayTodos.filter((t) => !isTaskCompleted(t));
  }, [todayTodos]);

  const todayCompletedCount = useMemo(() => {
    return todayTodos.filter(isTaskCompleted).length;
  }, [todayTodos]);

  const totalTodayTasks = todayList.length + todayCompletedCount;

  const todayProgressText = useMemo(() => {
    if (totalTodayTasks === 0) return null;
    if (todayList.length === 0 && todayCompletedCount > 0) {
      return "All done";
    }
    if (todayCompletedCount > 0) {
      return `${todayCompletedCount}/${totalTodayTasks} done`;
    }
    return `${todayList.length} task${todayList.length === 1 ? "" : "s"}`;
  }, [totalTodayTasks, todayList.length, todayCompletedCount]);

  const tomorrowKey = useMemo(() => {
    return getOffsetDateKey(-1, selectedDate || todayKey);
  }, [selectedDate, todayKey]);

  const tomorrowFormattedDate = useMemo(() => {
    const parsed = parseDateKey(tomorrowKey);
    const weekday = WEEKDAY_NAMES[parsed.getDay()] ?? "";
    const month = MONTH_NAMES[parsed.getMonth()] ?? "";
    const dayNum = parsed.getDate();
    return `${weekday}, ${month} ${dayNum}`;
  }, [tomorrowKey]);

  const { tomorrowList, upcomingList } = useMemo(() => {
    const uncompletedUpcoming = upcomingTodos.filter((t) => !isTaskCompleted(t));
    const tomorrow: Task[] = [];
    const later: Task[] = [];

    for (const t of uncompletedUpcoming) {
      const occState = getTaskOccurrenceState(t, selectedDate);
      const isForTomorrow =
        t.schedule?.date === tomorrowKey ||
        occState.nextOccurrenceDate === tomorrowKey;

      if (isForTomorrow) {
        tomorrow.push(t);
      } else {
        later.push(t);
      }
    }

    return { tomorrowList: tomorrow, upcomingList: later };
  }, [upcomingTodos, selectedDate, tomorrowKey]);

  const somedayList = useMemo(() => {
    return inboxTodos.filter((t) => !isTaskCompleted(t));
  }, [inboxTodos]);

  const completedList = useMemo(() => {
    const all = [...todayTodos, ...upcomingTodos, ...inboxTodos, ...overdueTodos];
    const seen = new Set<string>();
    return all.filter((t) => {
      if (!isTaskCompleted(t)) return false;
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  }, [todayTodos, upcomingTodos, inboxTodos, overdueTodos]);

  const hasAnyTasks =
    (isSelectedDateToday ? earlierList.length > 0 : false) ||
    todayList.length > 0 ||
    todayCompletedCount > 0 ||
    (isSelectedDateToday ? tomorrowList.length > 0 || upcomingList.length > 0 : false) ||
    somedayList.length > 0 ||
    completedList.length > 0;

  if (!hasAnyTasks) {
    return (
      <View style={[styles.listContent, { gap: 0, paddingBottom: 0 }]}>
        {renderTodaySection()}
        <WorkspaceEmptyState
          context="tasks"
          searchQuery={searchQuery}
          onClearSearch={onClearSearch}
          onCreateItem={onCreateTask}
          style={{ marginVertical: 16 }}
        />
      </View>
    );
  }

  const renderTodoItem = (
    item: Task,
    sectionContext: TaskSectionContext = "today",
  ) => {
    return (
      <TodoItem
        key={item.id}
        item={item}
        colors={colors}
        colorScheme={colorScheme}
        isOverdue={getTaskOccurrenceState(item, selectedDate).isOverdue}
        omitOverdueLabel={sectionContext === "earlier"}
        sectionContext={sectionContext}
        selectedDate={selectedDate}
        lists={workspaces}
        selectedWorkspaceId={selectedWorkspaceId}
        showWorkspaceBadge={showWorkspaceBadge}
        onToggleTodo={() => onToggleTodo(item.id)}
        onDeleteTodo={() => onDeleteTodo(item.id)}
        onEditTodo={() => onEditTodo(item)}
        onSetAlarm={() => onSetAlarm(item.id)}
        onSchedule={() => onEditTodo(item)}
        isSelectionMode={isSelectionMode}
        isSelected={selectedItemIds.has(item.id)}
        onSelect={() => onToggleSelectItem?.(item.id)}
        onLayout={(event) => {
          if (onTaskLayout) {
            const { y } = event.nativeEvent.layout;
            onTaskLayout(item.id, y);
          }
        }}
        allResources={allResources}
        onToggleLinkResource={onToggleLinkResource}
      />
    );
  };

  const renderTaskList = (
    list: Task[],
    sectionContext: TaskSectionContext = "today",
  ) => {
    return (
      <View style={{ marginTop: 0 }}>
        {list.map((item, index) => {
          return (
            <Animated.View
              key={item.id}
              exiting={FadeOut.duration(180)}
              layout={LinearTransition.duration(200)}
            >
              {/* Hairline divider between consecutive rows */}
              {index > 0 && (
                <View
                  style={{
                    height: StyleSheet.hairlineWidth,
                    backgroundColor: isDark
                      ? "rgba(255, 255, 255, 0.07)"
                      : "rgba(0, 0, 0, 0.05)",
                    marginLeft: ROW_SPEC.dividerInset,
                  }}
                />
              )}
              {renderTodoItem(item, sectionContext)}
            </Animated.View>
          );
        })}
      </View>
    );
  };

  // 1. TODAY: Primary Active Zone (Anchor of the screen)
  function renderTodaySection() {
    const isAllDone = todayList.length === 0 && todayCompletedCount > 0;

    return (
      <View style={sectionStyles.todaySectionContainer}>
        <DateScopedSectionHeader
          dateKey={selectedDate || todayKey}
          onSelectDate={onSelectDate || (() => {})}
          onOpenDatePicker={onOpenDatePicker}
          colors={colors}
          isDark={isDark}
          progressText={todayProgressText}
          itemCount={totalTodayTasks}
          isExpanded={todayExpanded}
          onToggleExpand={() => setTodayExpanded(!todayExpanded)}
        />

        {todayExpanded && (
          <View>
            {todayList.length === 0 ? (
              <View style={sectionStyles.todayQuietEmptyRow}>
                <Feather
                  name={isAllDone ? "check-circle" : "calendar"}
                  size={14}
                  color={isAllDone ? (isDark ? Palette.emerald400 : Palette.emerald500) : colors.textMuted}
                />
                <Text style={[sectionStyles.todayEmptyText, { color: colors.textMuted }]}>
                  {isAllDone
                    ? "All tasks completed for today"
                    : isSelectedDateToday
                      ? "No tasks scheduled for today"
                      : "No tasks scheduled for this day"}
                </Text>
              </View>
            ) : (
              renderTaskList(todayList, "today")
            )}
          </View>
        )}
      </View>
    );
  };

  // 2. EARLIER: Past / Unfinished carryovers triage.
  // Most prominent backlog header; the amber icon is the restrained overdue cue.
  const renderEarlierSection = () => {
    if (!isSelectedDateToday || earlierList.length === 0) return null;

    return (
      <View style={sectionStyles.sectionContainer}>
        <SectionHeader
          title="Earlier"
          count={earlierList.length}
          expanded={earlierExpanded}
          onToggle={() => setEarlierExpanded(!earlierExpanded)}
          colors={colors}
          tone="primary"
          icon="alert-circle"
          iconColor={colors.warning}
          accessibilityName="Earlier"
          action={
            earlierExpanded && onSaveEarlierForLater ? (
              <PressableScale
                onPress={(e: any) => {
                  e?.stopPropagation?.();
                  onSaveEarlierForLater();
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                haptic
                accessibilityRole="button"
                accessibilityLabel="Move all earlier tasks to Someday"
                style={sectionStyles.sectionAction}
              >
                <Text
                  style={[
                    sectionStyles.sectionActionText,
                    { color: isDark ? colors.primaryLight : colors.primary },
                  ]}
                >
                  Move to Someday
                </Text>
              </PressableScale>
            ) : null
          }
        />

        {earlierExpanded && renderTaskList(earlierList, "earlier")}
      </View>
    );
  };

  // 3. TOMORROW: Secondary horizon preview (same grammar as the other backlog headers)
  const renderTomorrowSection = () => {
    if (!isSelectedDateToday || tomorrowList.length === 0) return null;

    return (
      <View style={sectionStyles.sectionContainer}>
        <SectionHeader
          title="Tomorrow"
          count={tomorrowList.length}
          expanded={tomorrowExpanded}
          onToggle={() => setTomorrowExpanded(!tomorrowExpanded)}
          colors={colors}
          icon="sunrise"
          accessibilityName="Tomorrow"
        />

        {tomorrowExpanded && renderTaskList(tomorrowList, "tomorrow")}
      </View>
    );
  };

  // 4. UPCOMING: Future backlog (collapsed by default)
  const renderUpcomingSection = () => {
    if (!isSelectedDateToday || upcomingList.length === 0) return null;

    return (
      <View style={sectionStyles.sectionContainer}>
        <SectionHeader
          title="Upcoming"
          count={upcomingList.length}
          expanded={upcomingExpanded}
          onToggle={() => setUpcomingExpanded(!upcomingExpanded)}
          colors={colors}
          icon="calendar"
          accessibilityName="Upcoming"
        />

        {upcomingExpanded && renderTaskList(upcomingList, "upcoming")}
      </View>
    );
  };

  // 5. SOMEDAY: Unscheduled backlog / inbox (collapsed by default)
  const renderSomedaySection = () => {
    if (somedayList.length === 0) return null;

    return (
      <View style={sectionStyles.sectionContainer}>
        <SectionHeader
          title="Someday"
          count={somedayList.length}
          expanded={somedayExpanded}
          onToggle={() => setSomedayExpanded(!somedayExpanded)}
          colors={colors}
          icon="inbox"
          accessibilityName="Someday"
        />

        {somedayExpanded && renderTaskList(somedayList, "someday")}
      </View>
    );
  };

  // 6. COMPLETED: History Drawer (Quiet archive at the bottom, collapsed by default)
  const renderCompletedSection = () => {
    if (completedList.length === 0) return null;

    return (
      <View
        style={[
          sectionStyles.completedSectionContainer,
          {
            borderTopColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)",
          },
        ]}
      >
        <SectionHeader
          title="Completed"
          count={completedList.length}
          expanded={completedExpanded}
          onToggle={() => setCompletedExpanded(!completedExpanded)}
          colors={colors}
          tone="quiet"
          icon="check-circle"
          accessibilityName="Completed"
          action={
            completedExpanded && completedList.length > 0 ? (
              <PressableScale
                onPress={(e: any) => {
                  e?.stopPropagation?.();
                  onClearCompleted();
                }}
                hitSlop={8}
                haptic
                accessibilityRole="button"
                accessibilityLabel="Clear completed tasks"
                style={sectionStyles.sectionAction}
              >
                <Text style={[sectionStyles.sectionActionText, { color: colors.primary }]}>
                  Clear
                </Text>
              </PressableScale>
            ) : null
          }
        />

        {completedExpanded && renderTaskList(completedList, "completed")}
      </View>
    );
  };

  return (
    <View style={[styles.listContent, { gap: 0, paddingBottom: 0 }]}>
      {/* 1. Today (Primary Active Zone / Visual Anchor) */}
      {renderTodaySection()}

      {/* 2. Earlier (Past uncompleted carryovers) */}
      {renderEarlierSection()}

      {/* 3. Tomorrow (Next day preview) */}
      {renderTomorrowSection()}

      {/* 4. Upcoming (Future schedule) */}
      {renderUpcomingSection()}

      {/* 5. Someday (Unscheduled backlog) */}
      {renderSomedaySection()}

      {/* 6. Completed (History drawer) */}
      {renderCompletedSection()}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  todaySectionContainer: {
    marginBottom: Spacing.sm,
  },
  todayQuietEmptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    opacity: 0.75,
  },
  todayEmptyText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
  },

  // ---- Unified section-header system ---------------------------------------
  // Shared by Earlier / Tomorrow / Upcoming / Someday / Completed. The Today
  // header remains DateScopedSectionHeader (date navigation is its own affordance).
  sectionContainer: {
    marginBottom: Spacing.sm,
  },
  sectionHeaderRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 40,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  sectionTitleCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexShrink: 1,
    minWidth: 0,
  },
  sectionIcon: {
    flexShrink: 0,
  },
  sectionTitlePrimary: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    letterSpacing: -0.2,
  },
  sectionTitleSecondary: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    letterSpacing: -0.1,
  },
  sectionTitleQuiet: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    letterSpacing: -0.1,
  },
  sectionCount: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.medium,
    flexShrink: 0,
  },
  sectionRightCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexShrink: 0,
  },
  sectionAction: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: Spacing.xs,
  },
  sectionActionText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.medium,
  },
  // Quiet history drawer: same header grammar, but visually separated and lighter.
  completedSectionContainer: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

