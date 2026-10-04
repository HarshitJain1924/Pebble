import React, { useState, useMemo } from "react";
import { View, StyleSheet } from "react-native";
import Animated, { FadeOut, LinearTransition } from "react-native-reanimated";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import { TodoItem } from "@/features/tasks/components/TaskItem";
import { Colors, Palette, colorWithAlpha } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { styles } from "@/shared/constants/taskStyles";
import { ROW_SPEC } from "@/shared/constants/rowSpec";
import { WorkspaceEmptyState } from "@/features/workspaces/components/WorkspaceEmptyState";
import { Task, Workspace } from "@/shared/types/domain.types";
import { isTaskCompleted, getTaskOccurrenceState } from "@/shared/utils/domain-selectors";
import { getOffsetDateKey, getTodayDateKey, parseDateKey } from "@/shared/utils/date-key";
import { WEEKDAY_NAMES, MONTH_NAMES, TaskSectionContext } from "@/features/tasks/utils/task-formatting";
import PressableScale from "@/shared/components/ui/PressableScale";

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
    earlierList.length > 0 ||
    todayList.length > 0 ||
    todayCompletedCount > 0 ||
    tomorrowList.length > 0 ||
    upcomingList.length > 0 ||
    somedayList.length > 0 ||
    completedList.length > 0;

  if (!hasAnyTasks) {
    return (
      <WorkspaceEmptyState
        context="tasks"
        searchQuery={searchQuery}
        onClearSearch={onClearSearch}
        onCreateItem={onCreateTask}
        style={{ marginVertical: 16 }}
      />
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
        omitOverdueLabel={false}
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
  const renderTodaySection = () => {
    const isAllDone = todayList.length === 0 && todayCompletedCount > 0;

    return (
      <View style={sectionStyles.todaySectionContainer}>
        <PressableScale
          onPress={() => setTodayExpanded(!todayExpanded)}
          haptic
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`${primaryTitle} section, ${todayList.length} active tasks, ${todayExpanded ? "expanded" : "collapsed"}`}
          style={sectionStyles.todayHeaderRow}
        >
          <View style={sectionStyles.todayTitleLeft}>
            {/* Visual anchor accent pip */}
            <View
              style={[
                sectionStyles.todayAccentPip,
                { backgroundColor: isDark ? colors.primaryLight : colors.primary },
              ]}
            />
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
              <Text
                style={[
                  sectionStyles.todayTitleText,
                  { color: colors.text },
                ]}
              >
                {primaryTitle}
              </Text>
              {todayProgressText ? (
                <Text
                  style={[
                    sectionStyles.todayProgressText,
                    {
                      color: isAllDone
                        ? isDark
                          ? Palette.emerald400
                          : Palette.emerald600
                        : colors.textMuted,
                    },
                  ]}
                >
                  {todayProgressText}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather
              name={todayExpanded ? "chevron-up" : "chevron-down"}
              size={18}
              color={colors.textMuted}
            />
          </View>
        </PressableScale>

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
                    : "No tasks scheduled for today"}
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

  // 2. EARLIER: Past / Unfinished carryovers triage (Restrained amber treatment)
  const renderEarlierSection = () => {
    if (earlierList.length === 0) return null;

    return (
      <View style={sectionStyles.earlierSectionContainer}>
        <PressableScale
          onPress={() => setEarlierExpanded(!earlierExpanded)}
          haptic
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Earlier section, ${earlierList.length} tasks, ${earlierExpanded ? "expanded" : "collapsed"}`}
          style={sectionStyles.earlierHeaderRow}
        >
          <View style={sectionStyles.sectionTitleLeft}>
            <Text
              style={[
                sectionStyles.earlierTitleText,
                { color: colors.text },
              ]}
            >
              Earlier
            </Text>
            <Text style={[sectionStyles.sectionCountText, { color: colors.textMuted }]}>
              {`${earlierList.length} task${earlierList.length === 1 ? "" : "s"}`}
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {earlierExpanded && onSaveEarlierForLater ? (
              <PressableScale
                onPress={(e: any) => {
                  e?.stopPropagation?.();
                  onSaveEarlierForLater();
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                haptic
                accessibilityRole="button"
                accessibilityLabel="Move all earlier tasks to Someday"
                style={sectionStyles.quietAction}
              >
                <Text
                  style={[
                    sectionStyles.quietActionText,
                    { color: isDark ? colors.primaryLight : colors.primary },
                  ]}
                >
                  Move to Someday
                </Text>
              </PressableScale>
            ) : null}

            <Feather
              name={earlierExpanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={colors.textMuted}
            />
          </View>
        </PressableScale>

        {earlierExpanded && renderTaskList(earlierList, "earlier")}
      </View>
    );
  };

  // 3. TOMORROW: Secondary Horizon preview
  const renderTomorrowSection = () => {
    if (tomorrowList.length === 0) return null;

    return (
      <View style={sectionStyles.tomorrowSectionContainer}>
        <PressableScale
          onPress={() => setTomorrowExpanded(!tomorrowExpanded)}
          haptic
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Tomorrow section, ${tomorrowList.length} tasks, ${tomorrowExpanded ? "expanded" : "collapsed"}`}
          style={sectionStyles.tomorrowHeaderRow}
        >
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Text
              style={[
                sectionStyles.tomorrowTitleText,
                { color: colors.text },
              ]}
            >
              Tomorrow
            </Text>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "500",
                color: colors.textMuted,
              }}
            >
              {`· ${tomorrowList.length} task${tomorrowList.length === 1 ? "" : "s"}`}
            </Text>
          </View>

          <Feather
            name={tomorrowExpanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={colors.textMuted}
          />
        </PressableScale>

        {tomorrowExpanded && renderTaskList(tomorrowList, "tomorrow")}
      </View>
    );
  };

  // 4. UPCOMING: Future Backlog (Compressed, collapsed by default)
  const renderUpcomingSection = () => {
    if (upcomingList.length === 0) return null;

    return (
      <View style={sectionStyles.compressedSectionContainer}>
        <PressableScale
          onPress={() => setUpcomingExpanded(!upcomingExpanded)}
          haptic
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Upcoming section, ${upcomingList.length} tasks, ${upcomingExpanded ? "expanded" : "collapsed"}`}
          style={sectionStyles.compressedHeaderRow}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            <Feather name="calendar" size={13} color={colors.textMuted} />
            <Text
              style={[
                sectionStyles.compressedTitleText,
                { color: colors.textMuted },
              ]}
            >
              Upcoming
            </Text>
            <Text style={[sectionStyles.sectionCountText, { color: colors.textMuted }]}>
              {`${upcomingList.length} task${upcomingList.length === 1 ? "" : "s"}`}
            </Text>
          </View>

          <Feather
            name={upcomingExpanded ? "chevron-up" : "chevron-down"}
            size={15}
            color={colors.textMuted}
          />
        </PressableScale>

        {upcomingExpanded && renderTaskList(upcomingList, "upcoming")}
      </View>
    );
  };

  // 5. SOMEDAY: Unscheduled Backlog / Inbox (Compressed, collapsed by default)
  const renderSomedaySection = () => {
    if (somedayList.length === 0) return null;

    return (
      <View style={sectionStyles.compressedSectionContainer}>
        <PressableScale
          onPress={() => setSomedayExpanded(!somedayExpanded)}
          haptic
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Someday section, ${somedayList.length} tasks, ${somedayExpanded ? "expanded" : "collapsed"}`}
          style={sectionStyles.compressedHeaderRow}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            <Feather name="inbox" size={13} color={colors.textMuted} />
            <Text
              style={[
                sectionStyles.compressedTitleText,
                { color: colors.textMuted },
              ]}
            >
              Someday
            </Text>
            <Text style={[sectionStyles.sectionCountText, { color: colors.textMuted }]}>
              {`${somedayList.length} task${somedayList.length === 1 ? "" : "s"}`}
            </Text>
          </View>

          <Feather
            name={somedayExpanded ? "chevron-up" : "chevron-down"}
            size={15}
            color={colors.textMuted}
          />
        </PressableScale>

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
        <PressableScale
          onPress={() => setCompletedExpanded(!completedExpanded)}
          haptic
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Completed section, ${completedList.length} tasks, ${completedExpanded ? "expanded" : "collapsed"}`}
          style={sectionStyles.completedHeaderRow}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            <Feather name="check-circle" size={13} color={colors.textMuted} />
            <Text
              style={[
                sectionStyles.completedTitleText,
                { color: colors.textMuted },
              ]}
            >
              Completed
            </Text>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "500",
                color: colors.textMuted,
              }}
            >
              {`· ${completedList.length}`}
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {completedExpanded && completedList.length > 0 ? (
              <PressableScale
                onPress={(e: any) => {
                  e?.stopPropagation?.();
                  onClearCompleted();
                }}
                hitSlop={8}
                haptic
                style={{ paddingHorizontal: 8, paddingVertical: 2 }}
              >
                <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>
                  Clear
                </Text>
              </PressableScale>
            ) : null}

            <Feather
              name={completedExpanded ? "chevron-up" : "chevron-down"}
              size={15}
              color={colors.textMuted}
            />
          </View>
        </PressableScale>

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
    marginBottom: 8,
  },
  todayHeaderRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 6,
    marginBottom: 0,
  },
  todayTitleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  todayAccentPip: {
    width: 3.5,
    height: 20,
    borderRadius: 2,
  },
  todayTitleText: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  todayProgressText: {
    fontSize: 13,
    fontWeight: "600",
  },
  todayQuietEmptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 8,
    opacity: 0.75,
  },
  todayDateContext: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 1,
  },
  todayEmptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  todayEmptyText: {
    fontSize: 13,
    fontWeight: "500",
  },
  earlierSectionContainer: {
    marginBottom: 8,
  },
  earlierHeaderRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 6,
    marginBottom: 0,
  },
  earlierTitleText: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  // Shared section-header grammar: title + optional muted count
  sectionTitleLeft: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  sectionCountText: {
    fontSize: 12,
    fontWeight: "500",
  },
  // Text-only quiet action (no pill container)
  quietAction: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  quietActionText: {
    fontSize: 12,
    fontWeight: "500",
    opacity: 0.85,
  },
  tomorrowSectionContainer: {
    marginBottom: 8,
  },
  tomorrowHeaderRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 6,
    marginBottom: 0,
  },
  tomorrowTitleText: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  compressedSectionContainer: {
    marginBottom: 8,
  },
  compressedHeaderRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 6,
    marginBottom: 0,
  },
  compressedTitleText: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  completedSectionContainer: {
    marginTop: 4,
    marginBottom: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  completedHeaderRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  completedTitleText: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
});

