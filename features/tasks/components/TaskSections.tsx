import React, { useState, useMemo } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import Animated, { FadeOut, LinearTransition } from "react-native-reanimated";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import { TodoItem } from "@/features/tasks/components/TaskItem";
import { Colors, Palette } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { styles } from "@/shared/constants/taskStyles";
import { ROW_SPEC } from "@/shared/constants/rowSpec";
import { WorkspaceEmptyState } from "@/features/workspaces/components/WorkspaceEmptyState";
import { Task, Workspace } from "@/shared/types/domain.types";
import { isTaskCompleted, getTaskOccurrenceState } from "@/shared/utils/domain-selectors";
import { getOffsetDateKey, getTodayDateKey } from "@/shared/utils/date-key";
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

  // Section expanded states (Earlier, Today and Tomorrow default open, Upcoming and Someday collapsed per reference)
  const [earlierExpanded, setEarlierExpanded] = useState(true);
  const [todayExpanded, setTodayExpanded] = useState(true);
  const [tomorrowExpanded, setTomorrowExpanded] = useState(true);
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const [somedayExpanded, setSomedayExpanded] = useState(false);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [expandedTodoId, setExpandedTodoId] = useState<string | null>(null);

  const renderTodoItem = (item: Task, isEarlier = false) => {
    return (
      <TodoItem
        key={item.id}
        item={item}
        colors={colors}
        colorScheme={colorScheme}
        isOverdue={getTaskOccurrenceState(item, selectedDate).isOverdue}
        omitOverdueLabel={isEarlier}
        selectedDate={selectedDate}
        lists={workspaces}
        selectedWorkspaceId={selectedWorkspaceId}
        showWorkspaceBadge={showWorkspaceBadge}
        onToggleTodo={() => onToggleTodo(item.id)}
        onDeleteTodo={() => onDeleteTodo(item.id)}
        onEditTodo={() => onEditTodo(item)}
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
        isExpanded={expandedTodoId === item.id}
        onToggleExpand={() => setExpandedTodoId(expandedTodoId === item.id ? null : item.id)}
      />
    );
  };

  // Group tasks naturally
  const earlierList = useMemo(() => {
    return overdueTodos.filter((t) => !isTaskCompleted(t));
  }, [overdueTodos]);

  const todayList = useMemo(() => {
    return todayTodos.filter((t) => !isTaskCompleted(t));
  }, [todayTodos]);

  const tomorrowKey = useMemo(() => {
    return getOffsetDateKey(-1, selectedDate || getTodayDateKey());
  }, [selectedDate]);

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

  const renderSection = (
    title: string,
    list: Task[],
    isExpanded: boolean,
    onToggle: () => void,
    extraHeaderRight?: React.ReactNode,
    isEarlier = false,
  ) => {
    if (list.length === 0) return null;

    return (
      <View style={{ marginBottom: 16 }}>
        {/* Section Header */}
        <PressableScale
          onPress={onToggle}
          haptic
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`${title} section, ${list.length} tasks, ${isExpanded ? "expanded" : "collapsed"}`}
          style={{
            width: "100%",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 6,
            paddingHorizontal: 4,
            marginBottom: 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Text
              style={{
                fontSize: 17,
                fontWeight: "800",
                color: colors.text,
                letterSpacing: -0.3,
              }}
            >
              {title}
            </Text>
            <Text
              style={{
                fontSize: 13,
                fontWeight: "500",
                color: colors.textMuted,
              }}
            >
              {`${list.length} task${list.length === 1 ? "" : "s"}`}
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {extraHeaderRight}
            <Feather
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={colors.textMuted}
            />
          </View>
        </PressableScale>

        {/* Enclosing Card Surface */}
        {isExpanded && (
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: "hidden",
              shadowColor: Palette.black,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: isDark ? 0.25 : 0.04,
              shadowRadius: 8,
              elevation: 2,
            }}
          >
            {list.map((item, index) => (
              <Animated.View
                key={item.id}
                exiting={FadeOut.duration(180)}
                layout={LinearTransition.duration(200)}
              >
                {index > 0 && (
                  <View
                    style={{
                      height: StyleSheet.hairlineWidth,
                      backgroundColor: isDark
                        ? "rgba(255, 255, 255, 0.08)"
                        : "rgba(0, 0, 0, 0.06)",
                      marginLeft: ROW_SPEC.dividerInset,
                    }}
                  />
                )}
                {renderTodoItem(item, isEarlier)}
              </Animated.View>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.listContent}>
      {/* Earlier Section (tasks carried over from previous days — pressure-free triage) */}
      {earlierList.length > 0 &&
        renderSection(
          "Earlier",
          earlierList,
          earlierExpanded,
          () => setEarlierExpanded(!earlierExpanded),
          earlierExpanded && onSaveEarlierForLater ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onSaveEarlierForLater();
              }}
              hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Move all earlier tasks to Someday"
            >
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 8,
                  backgroundColor: isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.06)",
                  borderWidth: 1,
                  borderColor: isDark ? "rgba(255, 255, 255, 0.14)" : "rgba(0, 0, 0, 0.08)",
                }}
              >
                <Text
                  style={{
                    color: isDark ? colors.primaryLight : colors.primary,
                    fontWeight: "600",
                    fontSize: 11,
                  }}
                >
                  Move all to Someday
                </Text>
              </View>
            </Pressable>
          ) : null,
          true,
        )}

      {/* Today Section */}
      {renderSection("Today", todayList, todayExpanded, () => setTodayExpanded(!todayExpanded))}

      {/* Tomorrow Section */}
      {renderSection("Tomorrow", tomorrowList, tomorrowExpanded, () => setTomorrowExpanded(!tomorrowExpanded))}

      {/* Upcoming Section */}
      {renderSection("Upcoming", upcomingList, upcomingExpanded, () => setUpcomingExpanded(!upcomingExpanded))}

      {/* Someday Section */}
      {renderSection("Someday", somedayList, somedayExpanded, () => setSomedayExpanded(!somedayExpanded))}

      {/* Completed Section */}
      {renderSection(
        "Completed",
        completedList,
        completedExpanded,
        () => setCompletedExpanded(!completedExpanded),
        completedExpanded && completedList.length > 0 ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onClearCompleted();
            }}
            hitSlop={8}
            style={{ paddingHorizontal: 8, paddingVertical: 2 }}
          >
            <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>
              Clear
            </Text>
          </Pressable>
        ) : null,
      )}
    </View>
  );
}
