import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
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

export type ResourceCategory = "image" | "pdf" | "link" | "note";

export interface ResourceVisualInfo {
  category: ResourceCategory;
  label: string;
  thumbnailUri?: string;
  attachmentCount?: number;
}

/**
 * Robust resource category and thumbnail resolver
 * Identifies images (by MIME or extension), PDFs, links, and notes.
 * Extracts image thumbnail URI from attachments, direct URI, or content.
 */
export function resolveResourceVisual(res: any): ResourceVisualInfo {
  const attachments = Array.isArray(res.attachments) ? res.attachments : [];
  const attachment = attachments[0];
  const name = (attachment?.name || res.title || "").toLowerCase();
  const mime = (attachment?.mimeType || res.mimeType || "").toLowerCase();
  const uri =
    attachment?.uri ||
    res.uri ||
    (typeof res.content === "string" &&
    (res.content.startsWith("file://") ||
      res.content.startsWith("http://") ||
      res.content.startsWith("https://") ||
      res.content.startsWith("data:image/"))
      ? res.content
      : undefined);

  // 1. Image detection
  const isImageMime = mime.startsWith("image/");
  const isImageExt =
    /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(name) ||
    (uri ? /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(uri) : false);

  if (isImageMime || isImageExt) {
    return {
      category: "image",
      label: "Image",
      thumbnailUri: uri,
      attachmentCount: attachments.length,
    };
  }

  // 2. PDF detection
  const isPdfMime = mime.includes("pdf");
  const isPdfExt =
    /\.pdf(\?.*)?$/i.test(name) ||
    (uri ? /\.pdf(\?.*)?$/i.test(uri) : false);

  if (isPdfMime || isPdfExt) {
    return {
      category: "pdf",
      label: "PDF",
      attachmentCount: attachments.length,
    };
  }

  // 3. Link detection
  const isLink =
    res.type === "link" ||
    /^(https?:\/\/|www\.)/i.test(res.title || "") ||
    /^(https?:\/\/|www\.)/i.test(res.content || "") ||
    /^(https?:\/\/|www\.)/i.test(res.body || "");

  if (isLink) {
    return {
      category: "link",
      label: "Link",
      attachmentCount: attachments.length,
    };
  }

  // 4. Note / Idea fallback
  return {
    category: "note",
    label: res.type === "idea" ? "Idea" : "Note",
    attachmentCount: attachments.length,
  };
}

export type WorkspaceItemType = "task" | "habit" | "checklist" | "resource";

export interface WorkspaceItemRowProps {
  type: WorkspaceItemType;
  id: string;
  title: string;
  subtitle?: string;
  isOverdue?: boolean;
  completed?: boolean;
  priority?: "high" | "medium" | "low";
  hasReminder?: boolean;
  streak?: number;
  checklistProgress?: {
    completedCount: number;
    totalCount: number;
  };
  resourceVisual?: ResourceVisualInfo;
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
 * Consolidated WorkspaceItemRow Component
 * Enforces clean two-line typography hierarchy:
 *   TITLE
 *   secondary context
 * Priority is communicated exclusively via the left vertical stripe.
 * Right side hosts only secondary state (streak, checklist count, reminder bell, trailing chevron).
 */
export const WorkspaceItemRow: React.FC<WorkspaceItemRowProps> = ({
  type,
  id,
  title,
  subtitle,
  isOverdue = false,
  completed = false,
  priority,
  hasReminder = false,
  streak,
  checklistProgress,
  resourceVisual,
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

  const renderResourceVisual = () => {
    const visual = resourceVisual || { category: "note" as const, label: "Note" };

    if (visual.category === "image") {
      if (visual.thumbnailUri) {
        return (
          <View
            style={[
              styles.resourceThumbnailWrap,
              {
                borderColor: isDark
                  ? "rgba(255, 255, 255, 0.12)"
                  : "rgba(0, 0, 0, 0.08)",
              },
            ]}
          >
            <ExpoImage
              source={{ uri: visual.thumbnailUri }}
              style={styles.resourceThumbnail}
              contentFit="cover"
              transition={150}
            />
          </View>
        );
      }

      return (
        <View
          style={[
            styles.resourceIconBadge,
            {
              backgroundColor: isDark
                ? "rgba(14, 165, 233, 0.12)"
                : "#E0F2FE",
              borderColor: isDark
                ? "rgba(14, 165, 233, 0.25)"
                : "#BAE6FD",
            },
          ]}
        >
          <Feather name="image" size={15} color={isDark ? "#38BDF8" : "#0284C7"} />
        </View>
      );
    }

    if (visual.category === "pdf") {
      return (
        <View
          style={[
            styles.resourceIconBadge,
            {
              backgroundColor: isDark
                ? "rgba(239, 68, 68, 0.12)"
                : "#FEE2E2",
              borderColor: isDark
                ? "rgba(239, 68, 68, 0.25)"
                : "#FECACA",
            },
          ]}
        >
          <Feather name="file-text" size={15} color={isDark ? "#F87171" : "#DC2626"} />
        </View>
      );
    }

    if (visual.category === "link") {
      return (
        <View
          style={[
            styles.resourceIconBadge,
            {
              backgroundColor: isDark
                ? "rgba(59, 130, 246, 0.12)"
                : "#DBEAFE",
              borderColor: isDark
                ? "rgba(59, 130, 246, 0.25)"
                : "#BFDBFE",
            },
          ]}
        >
          <Feather name="link" size={15} color={isDark ? "#60A5FA" : "#2563EB"} />
        </View>
      );
    }

    // Default Note / Document
    return (
      <View
        style={[
          styles.resourceIconBadge,
          {
            backgroundColor: isDark
              ? "rgba(139, 92, 246, 0.12)"
              : "#EDE9FE",
            borderColor: isDark
              ? "rgba(139, 92, 246, 0.25)"
              : "#DDD6FE",
          },
        ]}
      >
        <Feather name="file-text" size={15} color={isDark ? "#A78BFA" : "#7C3AED"} />
      </View>
    );
  };

  const renderControl = () => {
    if (type === "resource") {
      return renderResourceVisual();
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

  const renderTrailingMeta = () => {
    // Habit: Streak chip
    if (type === "habit" && typeof streak === "number") {
      return (
        <View
          style={[
            styles.streakChip,
            {
              backgroundColor: isDark
                ? "rgba(249, 115, 22, 0.14)"
                : "#FFEDD5",
            },
          ]}
        >
          <Text
            style={[
              styles.streakText,
              { color: isDark ? "#FB923C" : "#C2410C" },
            ]}
          >
            {`🔥 ${streak}`}
          </Text>
        </View>
      );
    }

    // Checklist: Progress count (e.g. 0/2)
    if (type === "checklist" && checklistProgress) {
      return (
        <Text style={[styles.trailingCounterText, { color: colors.textMuted }]}>
          {`${checklistProgress.completedCount}/${checklistProgress.totalCount}`}
        </Text>
      );
    }

    // Task: Subtle bell icon if reminder scheduled
    if (type === "task" && hasReminder && !completed) {
      return (
        <Feather
          name="bell"
          size={12}
          color={colors.textMuted}
          style={styles.bellIcon}
        />
      );
    }

    // Resource: Attachment count if multiple
    if (
      type === "resource" &&
      resourceVisual?.attachmentCount &&
      resourceVisual.attachmentCount > 1
    ) {
      return (
        <View style={styles.resourceAttachmentCountWrap}>
          <Feather name="paperclip" size={11} color={colors.textMuted} />
          <Text
            style={[
              styles.resourceAttachmentCountText,
              { color: colors.textMuted },
            ]}
          >
            {resourceVisual.attachmentCount}
          </Text>
        </View>
      );
    }

    return null;
  };

  return (
    <View style={styles.rowWrapper}>
      <View style={styles.itemRow}>
        {/* Priority stripe on left edge only */}
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

        {/* Completion Control or Resource Visual */}
        {renderControl()}

        <View style={styles.controlSpacer} />

        {/* Clickable Content Area */}
        <PressableScale
          onPress={onPressRow}
          disabled={!onPressRow}
          haptic
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel || `${title}, ${subtitle || type}`}
          style={styles.flexOne}
          contentStyle={styles.rowContentStyle}
        >
          {/* Two-line title + secondary context */}
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
                    color: isOverdue && !completed
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

          {/* Right side: Secondary state + trailing affordance */}
          <View style={styles.rowRightWrap}>
            {renderTrailingMeta()}

            {type === "checklist" ? (
              <Feather
                name={isExpanded ? "chevron-up" : "chevron-down"}
                size={14}
                color={colors.textMuted}
                style={{ opacity: 0.6 }}
              />
            ) : (
              <Feather
                name="chevron-right"
                size={14}
                color={colors.textMuted}
                style={{ opacity: 0.35 }}
              />
            )}
          </View>
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

        // Format tasks: priority communicated via stripe; secondary context has due/time
        const taskItems = tasks.map((todo) => {
          const isOverdue = getTaskOccurrenceState(
            todo,
            getDateKey(),
          ).isOverdue;
          const isCompleted = isTaskCompleted(todo);
          const hasReminder = Boolean(todo.reminder?.enabled && todo.reminder?.triggerAt !== undefined);

          let subtitle = "Today";
          if (isCompleted) {
            subtitle = "Completed";
          } else if (isOverdue) {
            const dateKey = getTodoDateKey(todo);
            const overdueText = getOverdueLabel(dateKey);
            subtitle = `Overdue · ${overdueText}`;
          } else if (todo.reminder?.triggerAt !== undefined) {
            const d = new Date(todo.reminder.triggerAt);
            const ampm = d.getHours() >= 12 ? "PM" : "AM";
            const displayHour = d.getHours() % 12 || 12;
            const displayMinute = String(d.getMinutes()).padStart(2, "0");
            const timeText = `${displayHour}:${displayMinute} ${ampm}`;
            subtitle = `Today · ${timeText}`;
          } else if (todo.recurrence?.frequency) {
            const freq = todo.recurrence.frequency.toLowerCase();
            const freqLabel =
              freq === "daily"
                ? "Daily"
                : freq === "weekly"
                ? "Weekly"
                : freq.charAt(0).toUpperCase() + freq.slice(1);
            subtitle = `Recurs · ${freqLabel}`;
          }

          return {
            type: "task" as const,
            id: todo.id,
            key: `task-${todo.id}`,
            completed: isCompleted,
            title: todo.title,
            subtitle,
            isOverdue,
            hasReminder,
            priority: todo.priority === "none" ? undefined : (todo.priority as "high" | "medium" | "low" | undefined),
            original: todo,
          };
        });

        // Format habits: streak on right side; secondary context has recurrence
        const habitItems = habits.map((habit) => {
          const isCompletedHabit = Boolean(habit.completionHistory && isHabitCompletedToday(habit));
          const currentStreak = getHabitCurrentStreak(habit);
          let subtitle = "";
          if (isCompletedHabit) {
            subtitle = "Completed";
          } else if (habit.recurrence?.frequency) {
            const freq = habit.recurrence.frequency.toLowerCase();
            subtitle = freq === "daily" ? "Every day" : `Every ${freq}`;
          } else if (habit.description) {
            subtitle = habit.description;
          } else {
            subtitle = `Day ${currentStreak + 1}`;
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

        // Format checklists: 0/2 on right side; secondary context has items left
        const checklistItems = checklists.map((checklist) => {
          const completedCount = checklist.items.filter(
            (item) => item.completed,
          ).length;
          const totalCount = checklist.items.length;
          const remaining = totalCount - completedCount;
          const isCompleted = completedCount === totalCount && totalCount > 0;

          let subtitle = "";
          if (isCompleted) {
            subtitle = "Completed";
          } else if (remaining === 1) {
            subtitle = "1 item left";
          } else {
            subtitle = `${remaining} items left`;
          }

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
            {/* Clean Workspace Section Header */}
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
                    {`${completedItems} / ${totalItems} completed`}
                  </Text>
                </View>
              </PressableScale>

              {/* Compact Header Actions */}
              <View style={styles.headerRightActions}>
                {resourcesCount > 0 && (
                  <PressableScale
                    onPress={() => toggleResourcesExpanded(folder.id)}
                    hitSlop={8}
                    haptic
                    accessibilityRole="button"
                    accessibilityLabel={`Workspace resources, ${resourcesCount} available. Tap to ${isResourcesExpanded ? "hide" : "show"}.`}
                    style={[
                      styles.resourceCountButton,
                      {
                        backgroundColor: isResourcesExpanded
                          ? isDark
                            ? "rgba(14, 165, 233, 0.18)"
                            : "#E0F2FE"
                          : isDark
                          ? "rgba(255, 255, 255, 0.05)"
                          : "#F3F4F6",
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
                  </PressableScale>
                )}

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
                    styles.compactActionBtn,
                    {
                      backgroundColor:
                        colorScheme === "light"
                          ? "#F3F4F6"
                          : "rgba(255, 255, 255, 0.05)",
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
                    styles.compactActionBtn,
                    {
                      backgroundColor:
                        colorScheme === "light"
                          ? "#F3F4F6"
                          : "rgba(255, 255, 255, 0.05)",
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

            {/* Subtle Progress Bar */}
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
                            isOverdue={item.isOverdue}
                            completed={item.completed}
                            priority={item.priority}
                            hasReminder={item.hasReminder}
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
                            checklistProgress={{
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
                    <View style={styles.resourcesSectionHeader}>
                      <Text
                        style={[styles.resourcesSectionTitle, { color: colors.textMuted }]}
                      >
                        {`Resources · ${folderCollections.length}`}
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
                      const visual = resolveResourceVisual(res);

                      let resSubtitle = visual.label;
                      if (visual.attachmentCount && visual.attachmentCount > 0) {
                        resSubtitle += ` · ${visual.attachmentCount} attachment${visual.attachmentCount > 1 ? "s" : ""}`;
                      } else if (res.content && visual.category === "note") {
                        const snippet = res.content.trim().slice(0, 28);
                        if (snippet) {
                          resSubtitle += ` · ${snippet}${res.content.length > 28 ? "..." : ""}`;
                        }
                      }

                      return (
                        <View key={`resource-${res.id || idx}`}>
                          <WorkspaceItemRow
                            type="resource"
                            id={res.id || `res-${idx}`}
                            title={res.title || "Untitled Resource"}
                            subtitle={resSubtitle}
                            resourceVisual={visual}
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
                            : "rgba(255, 255, 255, 0.05)",
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
    marginBottom: 8,
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
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  resourceCountButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    minHeight: 28,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  resourcePillEmoji: {
    fontSize: 11,
  },
  resourcePillText: {
    fontSize: 11,
    fontWeight: "600",
  },
  compactActionBtn: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  progressBarTrack: {
    height: 2.5,
    borderRadius: 1.5,
    overflow: "hidden",
    marginBottom: 10,
    opacity: 0.6,
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 1.5,
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
    paddingVertical: 9,
    minHeight: 44,
  },
  priorityIndicatorContainer: {
    width: 3,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  priorityBar: {
    width: 3,
    height: 24,
    borderRadius: 1.5,
  },
  prioritySpacer: {
    width: 3,
    height: 24,
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
    borderRadius: Radius.sm - 2,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  resourceThumbnailWrap: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    overflow: "hidden",
    borderWidth: 1,
    backgroundColor: "rgba(128, 128, 128, 0.1)",
  },
  resourceThumbnail: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
  },
  resourceIconBadge: {
    width: 32,
    height: 32,
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
    paddingRight: 8,
  },
  itemTitleText: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  itemSubtitleText: {
    fontSize: 11,
    fontWeight: "400",
    marginTop: 1,
  },
  rowRightWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 4,
  },
  streakChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm - 2,
    alignItems: "center",
    justifyContent: "center",
  },
  streakText: {
    fontSize: 11,
    fontWeight: "700",
  },
  trailingCounterText: {
    fontSize: 12,
    fontWeight: "500",
  },
  bellIcon: {
    marginRight: 2,
  },
  resourceAttachmentCountWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  resourceAttachmentCountText: {
    fontSize: 11,
    fontWeight: "500",
  },
  itemDivider: {
    height: 1,
    opacity: 0.12,
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
    borderTopColor: "rgba(255, 255, 255, 0.06)",
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
    fontSize: 12,
    fontWeight: "600",
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
