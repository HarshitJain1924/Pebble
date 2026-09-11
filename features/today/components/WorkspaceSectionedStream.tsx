import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { type Router } from "expo-router";

import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { Radius } from "@/shared/constants/radii";
import { type ThemeColors } from "@/shared/constants/theme";
import { type Checklist, type Habit, type Task, type Workspace } from "@/shared/types/domain.types";
import {
  isTaskCompleted,
  isHabitCompletedToday,
  getHabitCurrentStreak,
  getTaskOccurrenceState,
} from "@/shared/utils/domain-selectors";
import { getDateKey, getTodoDateKey } from "@/features/tasks/utils/task-formatting";
import {
  getCheckboxAction,
  getRowContentAction,
} from "@/features/today/utils/today-interactions";

/**
 * Pebble Canonical Priority Color Scale
 * High: Crimson (#EF4444)
 * Medium: Amber (#F59E0B)
 * Low: Slate (#64748B)
 */
export const PRIORITY_COLORS: Record<"high" | "medium" | "low", string> = {
  high: "#EF4444",
  medium: "#F59E0B",
  low: "#64748B",
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

export type WorkspaceItemType = "task" | "habit" | "checklist" | "resource";

export interface WorkspaceItemRowProps {
  type: WorkspaceItemType;
  id: string;
  title: string;
  subtitle?: string;
  completed?: boolean;
  priority?: "high" | "medium" | "low";
  timeChip?: {
    label: string;
    isOverdue?: boolean;
  };
  streak?: number;
  checklistMeta?: {
    completedCount: number;
    totalCount: number;
  };
  resourceMeta?: {
    type?: string;
    attachmentCount?: number;
  };
  isExpanded?: boolean;
  accentColor: string;
  colors: ThemeColors;
  colorScheme: "light" | "dark" | null | undefined;
  onToggleComplete?: () => void;
  onPressRow?: () => void;
  checkboxDisabled?: boolean;
  accessibilityLabel?: string;
  children?: React.ReactNode;
}

/**
 * Consolidated WorkspaceItemRow component
 * Unifies visual signatures, hit targets, and interactions across tasks, habits, checklists, and resources.
 */
export const WorkspaceItemRow: React.FC<WorkspaceItemRowProps> = ({
  type,
  id,
  title,
  subtitle,
  completed = false,
  priority,
  timeChip,
  streak,
  checklistMeta,
  resourceMeta,
  isExpanded = false,
  accentColor,
  colors,
  colorScheme,
  onToggleComplete,
  onPressRow,
  checkboxDisabled = false,
  accessibilityLabel,
  children,
}) => {
  const isDark = colorScheme !== "light";
  const priorityColor = priority ? PRIORITY_COLORS[priority] : undefined;

  const renderControl = () => {
    if (type === "resource") {
      const iconName =
        resourceMeta?.type === "link"
          ? "link"
          : resourceMeta?.type === "idea"
          ? "zap"
          : "file-text";

      return (
        <View
          style={[
            styles.resourceIconBadge,
            {
              backgroundColor: isDark
                ? "rgba(14, 165, 233, 0.15)"
                : "#E0F2FE",
              borderColor: isDark
                ? "rgba(14, 165, 233, 0.3)"
                : "#BAE6FD",
            },
          ]}
        >
          <Feather
            name={iconName}
            size={12}
            color={isDark ? "#38BDF8" : "#0284C7"}
          />
        </View>
      );
    }

    if (type === "checklist") {
      return (
        <PressableScale
          disabled={checkboxDisabled || !onToggleComplete}
          onPress={onToggleComplete}
          hitSlop={12}
          haptic
          accessibilityRole="checkbox"
          accessibilityState={{ checked: completed }}
          accessibilityLabel={`Toggle checklist ${title}`}
          style={[
            styles.checklistSquare,
            {
              borderColor: completed
                ? accentColor
                : isDark
                ? "rgba(255,255,255,0.2)"
                : "rgba(0,0,0,0.2)",
              backgroundColor: completed ? accentColor : "transparent",
            },
          ]}
        >
          {completed && <Feather name="check" size={12} color="#ffffff" />}
        </PressableScale>
      );
    }

    // Task or Habit: circular checkbox
    const checkColor = type === "habit" ? "#10B981" : accentColor;
    return (
      <PressableScale
        disabled={checkboxDisabled || !onToggleComplete}
        onPress={onToggleComplete}
        hitSlop={12}
        haptic
        accessibilityRole="checkbox"
        accessibilityState={{ checked: completed }}
        accessibilityLabel={`Mark ${type} ${title} as ${completed ? "incomplete" : "complete"}`}
        style={[
          styles.checkboxBase,
          {
            borderColor: completed
              ? checkColor
              : isDark
              ? "rgba(255,255,255,0.2)"
              : "rgba(0,0,0,0.2)",
            backgroundColor: completed ? checkColor : "transparent",
          },
        ]}
      >
        {completed && <Feather name="check" size={12} color="#ffffff" />}
      </PressableScale>
    );
  };

  const renderBadges = () => {
    return (
      <View style={styles.rowRightWrap}>
        {/* Habit: Dedicated Flame Streak Chip */}
        {type === "habit" && typeof streak === "number" && (
          <View
            style={[
              styles.metaBadgePill,
              styles.streakBadge,
              {
                backgroundColor: isDark
                  ? "rgba(249, 115, 22, 0.16)"
                  : "#FFEDD5",
                borderColor: isDark
                  ? "rgba(249, 115, 22, 0.3)"
                  : "#FDBA74",
              },
            ]}
          >
            <Text
              style={[
                styles.streakBadgeText,
                { color: isDark ? "#FB923C" : "#C2410C" },
              ]}
            >
              {`🔥 ${streak}`}
            </Text>
          </View>
        )}

        {/* Task: Priority Badge (High or Med) */}
        {type === "task" && priority === "high" && (
          <View
            style={[
              styles.metaBadgePill,
              {
                backgroundColor: isDark
                  ? "rgba(239, 68, 68, 0.18)"
                  : "#FEE2E2",
              },
            ]}
          >
            <Text
              style={[
                styles.metaBadgeText,
                { color: isDark ? "#F87171" : "#DC2626" },
              ]}
            >
              High
            </Text>
          </View>
        )}

        {type === "task" && priority === "medium" && (
          <View
            style={[
              styles.metaBadgePill,
              {
                backgroundColor: isDark
                  ? "rgba(245, 158, 11, 0.18)"
                  : "#FEF3C7",
              },
            ]}
          >
            <Text
              style={[
                styles.metaBadgeText,
                { color: isDark ? "#FBBF24" : "#D97706" },
              ]}
            >
              Med
            </Text>
          </View>
        )}

        {/* Task: Prominent Time / Due Chip */}
        {timeChip && (
          <View
            style={[
              styles.metaBadgePill,
              {
                backgroundColor: timeChip.isOverdue
                  ? isDark
                    ? "rgba(239, 68, 68, 0.18)"
                    : "#FEE2E2"
                  : isDark
                  ? "rgba(255, 255, 255, 0.08)"
                  : "#F3F4F6",
              },
            ]}
          >
            <Text
              style={[
                styles.metaBadgeText,
                {
                  color: timeChip.isOverdue
                    ? isDark
                      ? "#F87171"
                      : "#DC2626"
                    : colors.textMuted,
                },
              ]}
            >
              {timeChip.label}
            </Text>
          </View>
        )}

        {/* Type Badges: Distinct non-indigo colors */}
        {type === "habit" && (
          <View
            style={[
              styles.metaBadgePill,
              {
                backgroundColor: isDark
                  ? "rgba(34, 197, 94, 0.18)"
                  : "#DCFCE7",
              },
            ]}
          >
            <Text
              style={[
                styles.metaBadgeText,
                { color: isDark ? "#4ADE80" : "#15803D" },
              ]}
            >
              Habit
            </Text>
          </View>
        )}

        {type === "checklist" && (
          <View
            style={[
              styles.metaBadgePill,
              {
                backgroundColor: isDark
                  ? "rgba(168, 85, 247, 0.18)"
                  : "#F3E8FF",
              },
            ]}
          >
            <Text
              style={[
                styles.metaBadgeText,
                { color: isDark ? "#C084FC" : "#7E22CE" },
              ]}
            >
              Checklist
            </Text>
          </View>
        )}

        {type === "resource" && (
          <View
            style={[
              styles.metaBadgePill,
              {
                backgroundColor: isDark
                  ? "rgba(14, 165, 233, 0.18)"
                  : "#E0F2FE",
              },
            ]}
          >
            <Text
              style={[
                styles.metaBadgeText,
                { color: isDark ? "#38BDF8" : "#0284C7" },
              ]}
            >
              Resource
            </Text>
          </View>
        )}

        {/* Trailing Affordance */}
        {type === "checklist" ? (
          <Feather
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={14}
            color={colors.textMuted}
          />
        ) : (
          <Feather
            name="chevron-right"
            size={14}
            color={colors.textMuted}
            style={{ opacity: 0.6 }}
          />
        )}
      </View>
    );
  };

  return (
    <View style={styles.rowWrapper}>
      <View style={styles.itemRow}>
        {/* Scannable Priority Stripe on Left */}
        <View style={styles.priorityIndicatorContainer}>
          {priorityColor ? (
            <View
              style={[
                styles.priorityBar,
                { backgroundColor: priorityColor },
              ]}
            />
          ) : (
            <View style={styles.prioritySpacer} />
          )}
        </View>

        {/* Control: Checkbox or Resource Icon */}
        {renderControl()}

        <View style={styles.controlSpacer} />

        {/* Clickable Row Content Area */}
        <PressableScale
          onPress={onPressRow}
          disabled={!onPressRow}
          haptic
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel || `${title}, ${subtitle || type}`}
          style={styles.flexOne}
          contentStyle={styles.rowContentStyle}
        >
          <View style={styles.rowTextContainer}>
            <Text
              style={[
                styles.itemTitleText,
                {
                  color: completed ? colors.textMuted : colors.text,
                  textDecorationLine: completed ? "line-through" : "none",
                },
              ]}
              numberOfLines={1}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                style={[
                  styles.itemSubtitleText,
                  {
                    color:
                      timeChip?.isOverdue && !completed
                        ? colors.error
                        : colors.textMuted,
                  },
                ]}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>

          {renderBadges()}
        </PressableScale>
      </View>

      {/* Nested Children (e.g. Expanded Checklist Sub-Items) */}
      {isExpanded && children}
    </View>
  );
};

export interface ActiveContextItem {
  folder: Workspace;
  tasks: Task[];
  habits: Habit[];
  checklists: Checklist[];
  totalCount: number;
}

export interface WorkspaceSectionedStreamProps {
  activeContexts: ActiveContextItem[];
  colors: ThemeColors;
  colorScheme: "light" | "dark" | null | undefined;
  allCollections?: Record<string, any[]>;
  expandedChecklistIds: Record<string, boolean>;
  setExpandedChecklistIds: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  router: Router;
  completeTodoFromDashboard: (todoId: string, event?: any, workspaceId?: string) => Promise<void>;
  completeHabitFromDashboard: (habitId: string, event?: any, workspaceId?: string) => Promise<void>;
  toggleChecklistItemFromDashboard: (
    checklistId: string,
    itemId: string,
    folderId: string,
  ) => Promise<void>;
}

const PREVIEW_LIMIT = 5;

export const WorkspaceSectionedStream: React.FC<WorkspaceSectionedStreamProps> = ({
  activeContexts,
  colors,
  colorScheme,
  allCollections = {},
  expandedChecklistIds,
  setExpandedChecklistIds,
  router,
  completeTodoFromDashboard,
  completeHabitFromDashboard,
  toggleChecklistItemFromDashboard,
}) => {
  const isDark = colorScheme !== "light";
  const [collapsedMap, setCollapsedMap] = React.useState<Record<string, boolean>>({});
  const [expandedResourceFolders, setExpandedResourceFolders] = React.useState<Record<string, boolean>>({});

  const toggleCollapse = (folderId: string) => {
    setCollapsedMap((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const toggleResourcesExpanded = (folderId: string) => {
    setExpandedResourceFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  if (activeContexts.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View
          style={[
            styles.emptyIconWrap,
            { backgroundColor: `${colors.primary}15` },
          ]}
        >
          <Feather name="check" size={24} color={colors.primary} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          All clear for today!
        </Text>
        <Text style={[styles.emptySub, { color: colors.textMuted }]}>
          No active tasks, habits, or checklists matching your selection.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.streamContainer}>
      {activeContexts.map((context) => {
        const { folder, tasks, habits, checklists } = context;
        const totalItems =
          tasks.length +
          habits.length +
          checklists.reduce((sum, c) => sum + c.items.length, 0);
        const completedItems =
          tasks.filter((t) => isTaskCompleted(t)).length +
          habits.filter((h) => Boolean(h.completionHistory && isHabitCompletedToday(h))).length +
          checklists.reduce(
            (sum, c) => sum + c.items.filter((i) => i.completed).length,
            0,
          );
        const progress = totalItems > 0 ? completedItems / totalItems : 0;
        const folderCollections = allCollections[folder.id] || [];
        const resourcesCount: number = folderCollections.length;
        const folderColor = folder.color || colors.primary;
        const isCollapsed = !!collapsedMap[folder.id];
        const isResourcesExpanded = !!expandedResourceFolders[folder.id];

        const taskItems = tasks.map((todo) => {
          const isOverdue = getTaskOccurrenceState(
            todo,
            getDateKey(),
          ).isOverdue;
          const isCompleted = isTaskCompleted(todo);

          let subtitle = "Today";
          let timeChip: { label: string; isOverdue?: boolean } | undefined;

          if (isCompleted) {
            subtitle = "Completed";
          } else if (isOverdue) {
            const dateKey = getTodoDateKey(todo);
            const overdueText = getOverdueLabel(dateKey);
            subtitle = `Overdue • ${overdueText}`;
            timeChip = { label: overdueText, isOverdue: true };
          } else if (todo.reminder?.triggerAt !== undefined) {
            const d = new Date(todo.reminder.triggerAt);
            const ampm = d.getHours() >= 12 ? "PM" : "AM";
            const displayHour = d.getHours() % 12 || 12;
            const displayMinute = String(d.getMinutes()).padStart(2, "0");
            const timeText = `${displayHour}:${displayMinute} ${ampm}`;
            subtitle = `Today • ${timeText}`;
            timeChip = { label: timeText, isOverdue: false };
          } else if (todo.recurrence?.frequency) {
            subtitle = `Recurs • ${todo.recurrence.frequency.charAt(0).toUpperCase() + todo.recurrence.frequency.slice(1)}`;
          }

          return {
            type: "task" as const,
            id: todo.id,
            key: `task-${todo.id}`,
            completed: isCompleted,
            title: todo.title,
            subtitle,
            timeChip,
            priority: todo.priority === "none" ? undefined : (todo.priority as "high" | "medium" | "low" | undefined),
            isOverdue,
            original: todo,
          };
        });

        const habitItems = habits.map((habit) => {
          const isCompletedHabit = Boolean(habit.completionHistory && isHabitCompletedToday(habit));
          const currentStreak = getHabitCurrentStreak(habit);
          let subtitle = "";
          if (isCompletedHabit) {
            subtitle = "Completed";
          } else {
            subtitle = habit.description ? habit.description : `Day ${currentStreak + 1}`;
          }

          return {
            type: "habit" as const,
            id: habit.id,
            key: `habit-${habit.id}`,
            completed: isCompletedHabit,
            title: habit.title,
            subtitle,
            streak: currentStreak,
            priority: undefined,
            original: habit,
          };
        });

        const checklistItems = checklists.map((checklist) => {
          const completedCount = checklist.items.filter(
            (item) => item.completed,
          ).length;
          const totalCount = checklist.items.length;
          const remaining = totalCount - completedCount;
          const isCompleted = completedCount === totalCount && totalCount > 0;
          const subtitle = isCompleted
            ? "Completed"
            : `${completedCount} of ${totalCount} items • ${remaining} left`;

          return {
            type: "checklist" as const,
            id: checklist.id,
            key: `checklist-${checklist.id}`,
            completed: isCompleted,
            title: checklist.title,
            subtitle,
            completedCount,
            totalCount,
            original: checklist,
          };
        });

        const actionItems = [
          ...habitItems,
          ...taskItems,
          ...checklistItems,
        ];

        // Incomplete items first, then by type (habit, task, checklist)
        const sortedActionItems = actionItems.sort((a, b) => {
          if (a.completed !== b.completed) {
            return a.completed ? 1 : -1;
          }
          const typeOrder = { habit: 0, task: 1, checklist: 2 };
          return typeOrder[a.type] - typeOrder[b.type];
        });

        const displayedItems = sortedActionItems.slice(0, PREVIEW_LIMIT);
        const remainingCount = sortedActionItems.length - PREVIEW_LIMIT;

        return (
          <View
            key={folder.id}
            style={[
              styles.workspaceCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                shadowOpacity: colorScheme === "light" ? 0.03 : 0.15,
              },
            ]}
          >
            {/* Workspace Section Header */}
            <View style={styles.workspaceHeader}>
              <PressableScale
                onPress={() => toggleCollapse(folder.id)}
                style={styles.headerLeftPressable}
                contentStyle={styles.headerLeftContent}
                haptic
                accessibilityRole="button"
                accessibilityLabel={`${folder.name}, ${completedItems} of ${totalItems} completed. Tap to ${isCollapsed ? "expand" : "collapse"}.`}
              >
                <View
                  style={[
                    styles.folderEmojiWrap,
                    { backgroundColor: `${folderColor}18` },
                  ]}
                >
                  <Text style={styles.folderEmojiText}>
                    {folder.emoji || "📁"}
                  </Text>
                </View>
                <View style={styles.headerTitleWrap}>
                  <Text
                    style={[styles.folderNameText, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {folder.name}
                  </Text>
                  <Text
                    style={[styles.folderMetaText, { color: colors.textMuted }]}
                  >
                    {completedItems}/{totalItems} Completed
                  </Text>
                </View>
              </PressableScale>

              {/* Grouped Header Actions: Info Cluster separated from Action Cluster */}
              <View style={styles.headerRightGroup}>
                {/* Info Cluster: Interactive Resource Count Pill */}
                {resourcesCount > 0 && (
                  <View style={styles.headerInfoCluster}>
                    <PressableScale
                      onPress={() => toggleResourcesExpanded(folder.id)}
                      hitSlop={8}
                      haptic
                      accessibilityRole="button"
                      accessibilityLabel={`Workspace resources, ${resourcesCount} available. Tap to ${isResourcesExpanded ? "hide" : "show"}.`}
                      style={[
                        styles.resourcePill,
                        {
                          backgroundColor: isResourcesExpanded
                            ? colorScheme === "light"
                              ? "#E0F2FE"
                              : "rgba(14, 165, 233, 0.18)"
                            : colorScheme === "light"
                            ? "#F3F4F6"
                            : "rgba(255,255,255,0.06)",
                          borderColor: isResourcesExpanded
                            ? isDark
                              ? "rgba(14, 165, 233, 0.35)"
                              : "#BAE6FD"
                            : colors.border,
                        },
                      ]}
                    >
                      <Text style={styles.resourcePillEmoji}>📎</Text>
                      <Text
                        style={[
                          styles.resourcePillText,
                          {
                            color: isResourcesExpanded
                              ? isDark
                                ? "#38BDF8"
                                : "#0284C7"
                              : colors.textMuted,
                          },
                        ]}
                      >
                        {resourcesCount}
                      </Text>
                      <Feather
                        name={isResourcesExpanded ? "chevron-up" : "chevron-down"}
                        size={11}
                        color={
                          isResourcesExpanded
                            ? isDark
                              ? "#38BDF8"
                              : "#0284C7"
                            : colors.textMuted
                        }
                        style={{ marginLeft: 2 }}
                      />
                    </PressableScale>
                  </View>
                )}

                {/* Visual spacer separating Info from Actions */}
                {resourcesCount > 0 && <View style={styles.clusterDividerSpacer} />}

                {/* Action Cluster: Navigate to Workspace + Collapse Toggle */}
                <View style={styles.headerActionCluster}>
                  <PressableScale
                    onPress={() =>
                      router.push({
                        pathname: "/tasks",
                        params: { workspaceId: folder.id },
                      } as any)
                    }
                    hitSlop={8}
                    haptic
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${folder.name} workspace`}
                    style={[
                      styles.gatewayButton,
                      {
                        backgroundColor:
                          colorScheme === "light"
                            ? "#F3F4F6"
                            : "rgba(255,255,255,0.06)",
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Feather
                      name="arrow-right"
                      size={14}
                      color={folderColor}
                    />
                  </PressableScale>

                  <PressableScale
                    onPress={() => toggleCollapse(folder.id)}
                    hitSlop={8}
                    haptic
                    accessibilityRole="button"
                    accessibilityLabel={isCollapsed ? `Expand ${folder.name}` : `Collapse ${folder.name}`}
                    style={[
                      styles.gatewayButton,
                      {
                        backgroundColor:
                          colorScheme === "light"
                            ? "#F3F4F6"
                            : "rgba(255,255,255,0.06)",
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Feather
                      name={isCollapsed ? "chevron-down" : "chevron-up"}
                      size={14}
                      color={colors.textMuted}
                    />
                  </PressableScale>
                </View>
              </View>
            </View>

            {/* Subtle Workspace Progress Line */}
            {totalItems > 0 && (
              <View
                style={[
                  styles.progressBarTrack,
                  { backgroundColor: colors.border },
                ]}
              >
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${progress * 100}%`,
                      backgroundColor: folderColor,
                    },
                  ]}
                />
              </View>
            )}

            {!isCollapsed && (
              <>
                {/* Items Stream */}
                <View style={styles.itemsListWrap}>
                  {displayedItems.map((item, index) => {
                    const isLast = index === displayedItems.length - 1 && (!isResourcesExpanded || folderCollections.length === 0);
                    const itemColor = folderColor;

                    if (item.type === "task") {
                      const todo = item.original;
                      const checkboxAction = getCheckboxAction("task", item.completed);
                      const contentAction = getRowContentAction("task", todo.id);

                      return (
                        <View key={item.key}>
                          <WorkspaceItemRow
                            type="task"
                            id={todo.id}
                            title={todo.title}
                            subtitle={item.subtitle}
                            completed={item.completed}
                            priority={item.priority}
                            timeChip={item.timeChip}
                            accentColor={itemColor}
                            colors={colors}
                            colorScheme={colorScheme}
                            checkboxDisabled={checkboxAction === "locked"}
                            onToggleComplete={(e?: any) =>
                              completeTodoFromDashboard(todo.id, e, folder.id)
                            }
                            onPressRow={() => {
                              if (contentAction.action === "open-details") {
                                router.push(contentAction.route);
                              }
                            }}
                          />
                          {!isLast && (
                            <View
                              style={[
                                styles.itemDivider,
                                { backgroundColor: colors.border },
                              ]}
                            />
                          )}
                        </View>
                      );
                    }

                    if (item.type === "habit") {
                      const habit = item.original;
                      const checkboxAction = getCheckboxAction("habit", item.completed);
                      const contentAction = getRowContentAction("habit", habit.id);

                      return (
                        <View key={item.key}>
                          <WorkspaceItemRow
                            type="habit"
                            id={habit.id}
                            title={habit.title}
                            subtitle={item.subtitle}
                            completed={item.completed}
                            streak={item.streak}
                            accentColor={itemColor}
                            colors={colors}
                            colorScheme={colorScheme}
                            checkboxDisabled={checkboxAction === "locked"}
                            onToggleComplete={(e?: any) =>
                              completeHabitFromDashboard(habit.id, e, folder.id)
                            }
                            onPressRow={() => {
                              if (contentAction.action === "open-details") {
                                router.push(contentAction.route);
                              }
                            }}
                          />
                          {!isLast && (
                            <View
                              style={[
                                styles.itemDivider,
                                { backgroundColor: colors.border },
                              ]}
                            />
                          )}
                        </View>
                      );
                    }

                    if (item.type === "checklist") {
                      const checklist = item.original;
                      const isExpanded = !!expandedChecklistIds[checklist.id];
                      const checkboxAction = getCheckboxAction("checklist", item.completed);
                      const contentAction = getRowContentAction("checklist", checklist.id);

                      const handleChecklistExpandToggle = () => {
                        setExpandedChecklistIds((prev) => ({
                          ...prev,
                          [checklist.id]: !isExpanded,
                        }));
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      };

                      return (
                        <View key={item.key}>
                          <WorkspaceItemRow
                            type="checklist"
                            id={checklist.id}
                            title={checklist.title}
                            subtitle={item.subtitle}
                            completed={item.completed}
                            checklistMeta={{
                              completedCount: item.completedCount,
                              totalCount: item.totalCount,
                            }}
                            isExpanded={isExpanded}
                            accentColor={itemColor}
                            colors={colors}
                            colorScheme={colorScheme}
                            checkboxDisabled={checkboxAction === "locked"}
                            onToggleComplete={() => {
                              if (checkboxAction === "toggle-expand") {
                                handleChecklistExpandToggle();
                              }
                            }}
                            onPressRow={() => {
                              if (contentAction.action === "toggle-expand") {
                                handleChecklistExpandToggle();
                              }
                            }}
                          >
                            {checklist.items && (
                              <View style={styles.subItemsWrapper}>
                                {checklist.items.map((subItem) => (
                                  <View
                                    key={subItem.id}
                                    style={styles.subItemRow}
                                  >
                                    <PressableScale
                                      onPress={() =>
                                        toggleChecklistItemFromDashboard(
                                          checklist.id,
                                          subItem.id,
                                          folder.id,
                                        )
                                      }
                                      hitSlop={8}
                                      haptic
                                      accessibilityRole="checkbox"
                                      accessibilityState={{ checked: subItem.completed }}
                                      accessibilityLabel={`Checklist item ${subItem.title}`}
                                      style={[
                                        styles.subItemCheckbox,
                                        {
                                          borderColor: subItem.completed
                                            ? itemColor
                                            : isDark
                                            ? "rgba(255,255,255,0.2)"
                                            : "rgba(0,0,0,0.2)",
                                          backgroundColor: subItem.completed
                                            ? itemColor
                                            : "transparent",
                                        },
                                      ]}
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
                                      style={[
                                        styles.subItemTitle,
                                        {
                                          color: subItem.completed
                                            ? colors.textMuted
                                            : colors.text,
                                          textDecorationLine: subItem.completed
                                            ? "line-through"
                                            : "none",
                                        },
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {subItem.title}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </WorkspaceItemRow>
                          {!isLast && (
                            <View
                              style={[
                                styles.itemDivider,
                                { backgroundColor: colors.border },
                              ]}
                            />
                          )}
                        </View>
                      );
                    }

                    return null;
                  })}
                </View>

                {/* Inline Collapsible Resources Section */}
                {isResourcesExpanded && folderCollections.length > 0 && (
                  <View style={styles.resourcesSectionWrap}>
                    <View
                      style={[
                        styles.resourcesSectionHeader,
                        { borderBottomColor: colors.border },
                      ]}
                    >
                      <Text
                        style={[styles.resourcesSectionTitle, { color: colors.textMuted }]}
                      >
                        {`WORKSPACE RESOURCES (${folderCollections.length})`}
                      </Text>
                      <PressableScale
                        onPress={() => {
                          router.push({
                            pathname: "/tasks",
                            params: {
                              workspaceId: folder.id,
                              segment: "vault",
                            },
                          } as any);
                        }}
                        hitSlop={8}
                        haptic
                        accessibilityRole="button"
                        accessibilityLabel="Open all resources in Vault"
                      >
                        <Text style={[styles.viewVaultLinkText, { color: folderColor }]}>
                          View Vault →
                        </Text>
                      </PressableScale>
                    </View>

                    {folderCollections.map((res: any, idx: number) => {
                      const isLastRes = idx === folderCollections.length - 1;
                      const resType = res.type || "note";
                      const attachmentCount = res.attachments?.length || 0;
                      let resSubtitle = resType.charAt(0).toUpperCase() + resType.slice(1);
                      if (attachmentCount > 0) {
                        resSubtitle += ` • ${attachmentCount} attachment${attachmentCount > 1 ? "s" : ""}`;
                      } else if (res.content) {
                        const snippet = res.content.trim().slice(0, 32);
                        resSubtitle += ` • ${snippet}${res.content.length > 32 ? "..." : ""}`;
                      }

                      return (
                        <View key={`resource-${res.id || idx}`}>
                          <WorkspaceItemRow
                            type="resource"
                            id={res.id || `res-${idx}`}
                            title={res.title || "Untitled Resource"}
                            subtitle={resSubtitle}
                            resourceMeta={{
                              type: resType,
                              attachmentCount,
                            }}
                            accentColor="#0EA5E9"
                            colors={colors}
                            colorScheme={colorScheme}
                            onPressRow={() => {
                              router.push({
                                pathname: "/tasks",
                                params: {
                                  workspaceId: folder.id,
                                  segment: "vault",
                                  resourceId: res.id,
                                },
                              } as any);
                            }}
                          />
                          {!isLastRes && (
                            <View
                              style={[
                                styles.itemDivider,
                                { backgroundColor: colors.border },
                              ]}
                            />
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Preview Cap: View all items gateway */}
                {remainingCount > 0 && (
                  <PressableScale
                    onPress={() =>
                      router.push({
                        pathname: "/tasks",
                        params: { workspaceId: folder.id },
                      } as any)
                    }
                    haptic
                    accessibilityRole="button"
                    accessibilityLabel={`View all items in ${folder.name}, ${remainingCount} more`}
                    style={[
                      styles.previewGatewayBtn,
                      {
                        backgroundColor:
                          colorScheme === "light"
                            ? "#F3F4F6"
                            : "rgba(255,255,255,0.05)",
                        borderColor: colors.border,
                      },
                    ]}
                    contentStyle={styles.previewGatewayContent}
                  >
                    <Text
                      style={[
                        styles.previewGatewayText,
                        { color: folderColor },
                      ]}
                    >
                      {`+${remainingCount} more in ${folder.name}`}
                    </Text>
                    <Feather
                      name="arrow-right"
                      size={13}
                      color={folderColor}
                    />
                  </PressableScale>
                )}
              </>
            )}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  streamContainer: {
    gap: 16,
    marginTop: 16,
  },
  workspaceCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  workspaceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerLeftPressable: {
    flex: 1,
  },
  headerLeftContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  folderEmojiWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  folderEmojiText: {
    fontSize: 18,
  },
  headerTitleWrap: {
    flex: 1,
  },
  folderNameText: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  folderMetaText: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 1,
  },
  headerRightGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerInfoCluster: {
    flexDirection: "row",
    alignItems: "center",
  },
  clusterDividerSpacer: {
    width: 10,
  },
  headerActionCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  resourcePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    minHeight: 32,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  resourcePillEmoji: {
    fontSize: 11,
  },
  resourcePillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  gatewayButton: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  progressBarTrack: {
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 10,
    opacity: 0.6,
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  itemsListWrap: {
    gap: 2,
  },
  rowWrapper: {
    width: "100%",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    minHeight: 44,
  },
  priorityIndicatorContainer: {
    width: 4,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  priorityBar: {
    width: 3,
    height: 18,
    borderRadius: 1.5,
  },
  prioritySpacer: {
    width: 3,
  },
  controlSpacer: {
    width: 10,
  },
  checkboxBase: {
    width: 20,
    height: 20,
    borderRadius: Radius.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  checklistSquare: {
    width: 20,
    height: 20,
    borderRadius: Radius.sm,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  resourceIconBadge: {
    width: 20,
    height: 20,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  flexOne: {
    flex: 1,
  },
  rowContentStyle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  rowTextContainer: {
    flex: 1,
    gap: 2,
  },
  itemTitleText: {
    fontSize: 14,
    fontWeight: "600",
  },
  itemSubtitleText: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 1,
  },
  rowRightWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 8,
  },
  metaBadgePill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  metaBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  streakBadge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  streakBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  itemDivider: {
    height: 1,
    opacity: 0.15,
  },
  subItemsWrapper: {
    paddingLeft: 36,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 6,
  },
  subItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
    minHeight: 36,
  },
  subItemCheckbox: {
    width: 16,
    height: 16,
    borderRadius: Radius.sm / 2,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  subItemTitle: {
    fontSize: 12,
    flex: 1,
  },
  resourcesSectionWrap: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    gap: 2,
  },
  resourcesSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    marginBottom: 4,
  },
  resourcesSectionTitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  viewVaultLinkText: {
    fontSize: 11,
    fontWeight: "600",
  },
  previewGatewayBtn: {
    borderRadius: Radius.md,
    borderWidth: 1,
    marginTop: 10,
    minHeight: 38,
  },
  previewGatewayContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  previewGatewayText: {
    fontSize: 12,
    fontWeight: "700",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  emptySub: {
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 32,
    lineHeight: 18,
  },
});
