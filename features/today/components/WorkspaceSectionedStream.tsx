import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { type Router } from "expo-router";

import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import {
  CategoryChip,
  PriorityIndicator,
  StatusBadge,
} from "@/shared/components/design-system";
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
  const [collapsedMap, setCollapsedMap] = React.useState<Record<string, boolean>>({});

  const toggleCollapse = (folderId: string) => {
    setCollapsedMap((prev) => ({
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

        const taskItems = tasks.map((todo) => {
          const isOverdue = getTaskOccurrenceState(
            todo,
            getDateKey(),
          ).isOverdue;
          return {
            type: "task" as const,
            id: todo.id,
            key: `task-${todo.id}`,
            completed: isTaskCompleted(todo),
            title: todo.title,
            priority: todo.priority === "none" ? undefined : todo.priority,
            isOverdue,
            original: todo,
          };
        });

        const habitItems = habits.map((habit) => ({
          type: "habit" as const,
          id: habit.id,
          key: `habit-${habit.id}`,
          completed: Boolean(habit.completionHistory && isHabitCompletedToday(habit)),
          title: habit.title,
          streak: getHabitCurrentStreak(habit),
          priority: undefined,
          original: habit,
        }));

        const checklistItems = checklists.map((checklist) => {
          const completedCount = checklist.items.filter(
            (item) => item.completed,
          ).length;
          const totalCount = checklist.items.length;
          return {
            type: "checklist" as const,
            id: checklist.id,
            key: `checklist-${checklist.id}`,
            completed: completedCount === totalCount && totalCount > 0,
            title: checklist.title,
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
        const isCollapsed = !!collapsedMap[folder.id];

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

              <View style={styles.headerRightActions}>
                {resourcesCount > 0 && (
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
                    haptic
                    style={[
                      styles.resourcePill,
                      {
                        backgroundColor:
                          colorScheme === "light"
                            ? "#F3F4F6"
                            : "rgba(255,255,255,0.06)",
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text style={styles.resourcePillEmoji}>📎</Text>
                    <Text
                      style={[
                        styles.resourcePillText,
                        { color: colors.textMuted },
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
                const isLast = index === displayedItems.length - 1;
                const itemColor = folderColor;

                if (item.type === "task") {
                  const todo = item.original;
                  let subtitle = "Today";
                  if (isTaskCompleted(todo)) {
                    subtitle = "Completed";
                  } else if (item.isOverdue) {
                    const dateKey = getTodoDateKey(todo);
                    subtitle = `Overdue • ${getOverdueLabel(dateKey)}`;
                  } else if (todo.recurrence?.frequency) {
                    subtitle = `Recurs • ${todo.recurrence.frequency.charAt(0).toUpperCase() + todo.recurrence.frequency.slice(1)}`;
                  } else if (todo.reminder?.triggerAt !== undefined) {
                    const d = new Date(todo.reminder.triggerAt);
                    const ampm = d.getHours() >= 12 ? "PM" : "AM";
                    const displayHour = d.getHours() % 12 || 12;
                    const displayMinute = String(d.getMinutes()).padStart(2, "0");
                    subtitle = `Today • ${displayHour}:${displayMinute} ${ampm}`;
                  }

                  const isCompleted = isTaskCompleted(todo);
                  const checkboxAction = getCheckboxAction("task", isCompleted);
                  const contentAction = getRowContentAction("task", todo.id);

                  return (
                    <View key={item.key}>
                      <View style={styles.itemRow}>
                        <PriorityIndicator
                          priority={todo.priority === "none" ? undefined : todo.priority}
                        />
                        <View style={styles.prioritySpacer} />

                        <PressableScale
                          disabled={checkboxAction === "locked"}
                          onPress={(e) =>
                            completeTodoFromDashboard(todo.id, e, folder.id)
                          }
                          hitSlop={12}
                          haptic
                          style={[
                            styles.checkboxBase,
                            {
                              borderColor: isCompleted
                                ? itemColor
                                : "rgba(255,255,255,0.2)",
                              backgroundColor: isCompleted
                                ? itemColor
                                : "transparent",
                            },
                          ]}
                        >
                          {isCompleted && (
                            <Feather name="check" size={12} color="#ffffff" />
                          )}
                        </PressableScale>

                        <View style={styles.checkboxSpacer} />

                        <PressableScale
                          onPress={() => {
                            if (contentAction.action === "open-details") {
                              router.push(contentAction.route);
                            }
                          }}
                          style={styles.flexOne}
                          contentStyle={styles.rowContentStyle}
                        >
                          <View style={styles.rowTextContainer}>
                            <Text
                              style={[
                                styles.itemTitleText,
                                {
                                  color: isCompleted
                                    ? colors.textMuted
                                    : colors.text,
                                  textDecorationLine: isCompleted
                                    ? "line-through"
                                    : "none",
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {todo.title}
                            </Text>
                            <Text
                              style={[
                                styles.itemSubtitleText,
                                {
                                  color: item.isOverdue && !isCompleted
                                    ? colors.error
                                    : colors.textMuted,
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {subtitle}
                            </Text>
                          </View>

                          <View style={styles.rowRightWrap}>
                            {todo.priority === "high" && (
                              <View
                                style={[
                                  styles.metaBadgePill,
                                  {
                                    backgroundColor:
                                      colorScheme === "light"
                                        ? "#FEE2E2"
                                        : "rgba(239, 68, 68, 0.18)",
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.metaBadgeText,
                                    {
                                      color:
                                        colorScheme === "light"
                                          ? "#DC2626"
                                          : "#F87171",
                                    },
                                  ]}
                                >
                                  High
                                </Text>
                              </View>
                            )}
                            <Feather
                              name="chevron-right"
                              size={14}
                              color={colors.textMuted}
                              style={{ opacity: 0.6 }}
                            />
                          </View>
                        </PressableScale>
                      </View>
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
                  const isCompletedHabit = Boolean(habit.completionHistory && isHabitCompletedToday(habit));
                  const checkboxAction = getCheckboxAction("habit", isCompletedHabit);
                  const contentAction = getRowContentAction("habit", habit.id);
                  const currentStreak = getHabitCurrentStreak(habit);

                  let subtitle = "";
                  if (isCompletedHabit) {
                    subtitle = "Completed";
                  } else {
                    const detail = habit.description
                      ? habit.description
                      : `${currentStreak} day streak`;
                    subtitle = `Day ${currentStreak + 1} • ${detail}`;
                  }

                  return (
                    <View key={item.key}>
                      <View style={styles.itemRow}>
                        <PriorityIndicator priority={undefined} />
                        <View style={styles.prioritySpacer} />

                        <PressableScale
                          disabled={checkboxAction === "locked"}
                          onPress={(e) =>
                            completeHabitFromDashboard(habit.id, e, folder.id)
                          }
                          hitSlop={12}
                          haptic
                          style={[
                            styles.checkboxBase,
                            {
                              borderColor: isCompletedHabit
                                ? "#F59E0B"
                                : "rgba(255,255,255,0.2)",
                              backgroundColor: isCompletedHabit
                                ? "#F59E0B"
                                : "transparent",
                            },
                          ]}
                        >
                          {isCompletedHabit && (
                            <Feather name="check" size={12} color="#ffffff" />
                          )}
                        </PressableScale>

                        <View style={styles.checkboxSpacer} />

                        <PressableScale
                          onPress={() => {
                            if (contentAction.action === "open-details") {
                              router.push(contentAction.route);
                            }
                          }}
                          style={styles.flexOne}
                          contentStyle={styles.rowContentStyle}
                        >
                          <View style={styles.rowTextContainer}>
                            <Text
                              style={[
                                styles.itemTitleText,
                                {
                                  color: isCompletedHabit
                                    ? colors.textMuted
                                    : colors.text,
                                  textDecorationLine: isCompletedHabit
                                    ? "line-through"
                                    : "none",
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {habit.title}
                            </Text>
                            <Text
                              style={[
                                styles.itemSubtitleText,
                                { color: colors.textMuted },
                              ]}
                              numberOfLines={1}
                            >
                              {subtitle}
                            </Text>
                          </View>

                          <View style={styles.rowRightWrap}>
                            <View
                              style={[
                                styles.metaBadgePill,
                                {
                                  backgroundColor:
                                    colorScheme === "light"
                                      ? "#DCFCE7"
                                      : "rgba(34, 197, 94, 0.18)",
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.metaBadgeText,
                                  {
                                    color:
                                      colorScheme === "light"
                                        ? "#15803D"
                                        : "#4ADE80",
                                  },
                                ]}
                              >
                                Habit
                              </Text>
                            </View>
                            <Feather
                              name="chevron-right"
                              size={14}
                              color={colors.textMuted}
                              style={{ opacity: 0.6 }}
                            />
                          </View>
                        </PressableScale>
                      </View>
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
                  const remaining = item.totalCount - item.completedCount;
                  const subtitle = item.completed
                    ? "Completed"
                    : `${item.completedCount} of ${item.totalCount} items • ${remaining} left`;

                  return (
                    <View key={item.key}>
                      <View style={styles.itemRow}>
                        <View style={{ width: 2 }} />
                        <View style={styles.prioritySpacer} />

                        <PressableScale
                          disabled={checkboxAction === "locked"}
                          onPress={() => {
                            if (checkboxAction === "toggle-expand") {
                              setExpandedChecklistIds((prev) => ({
                                ...prev,
                                [checklist.id]: !isExpanded,
                              }));
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                            }
                          }}
                          hitSlop={12}
                          haptic
                          style={[
                            styles.checklistSquare,
                            {
                              borderColor: item.completed
                                ? itemColor
                                : "rgba(255,255,255,0.2)",
                              backgroundColor: item.completed
                                ? itemColor
                                : "transparent",
                            },
                          ]}
                        >
                          {item.completed && (
                            <Feather name="check" size={12} color="#ffffff" />
                          )}
                        </PressableScale>

                        <View style={styles.checkboxSpacer} />

                        <PressableScale
                          onPress={() => {
                            if (contentAction.action === "toggle-expand") {
                              setExpandedChecklistIds((prev) => ({
                                ...prev,
                                [checklist.id]: !isExpanded,
                              }));
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                            }
                          }}
                          style={styles.flexOne}
                          contentStyle={styles.rowContentStyle}
                        >
                          <View style={styles.rowTextContainer}>
                            <Text
                              style={[
                                styles.itemTitleText,
                                {
                                  color: item.completed
                                    ? colors.textMuted
                                    : colors.text,
                                  textDecorationLine: item.completed
                                    ? "line-through"
                                    : "none",
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {checklist.title}
                            </Text>
                            <Text
                              style={[
                                styles.itemSubtitleText,
                                { color: colors.textMuted },
                              ]}
                              numberOfLines={1}
                            >
                              {subtitle}
                            </Text>
                          </View>

                          <View style={styles.rowRightWrap}>
                            <View
                              style={[
                                styles.metaBadgePill,
                                {
                                  backgroundColor:
                                    colorScheme === "light"
                                      ? "#F3E8FF"
                                      : "rgba(168, 85, 247, 0.18)",
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.metaBadgeText,
                                  {
                                    color:
                                      colorScheme === "light"
                                        ? "#7E22CE"
                                        : "#C084FC",
                                  },
                                ]}
                              >
                                Checklist
                              </Text>
                            </View>
                            <Feather
                              name={isExpanded ? "chevron-up" : "chevron-down"}
                              size={15}
                              color={colors.textMuted}
                            />
                          </View>
                        </PressableScale>
                      </View>

                      {/* Expanded Sub-items */}
                      {isExpanded && checklist.items && (
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
                                style={[
                                  styles.subItemCheckbox,
                                  {
                                    borderColor: subItem.completed
                                      ? itemColor
                                      : "rgba(255,255,255,0.2)",
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
    borderRadius: 20,
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
    borderRadius: 10,
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
    gap: 8,
  },
  resourcePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
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
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  progressBarTrack: {
    height: 3,
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
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    minHeight: 44,
  },
  prioritySpacer: {
    width: 6,
  },
  checkboxSpacer: {
    width: 10,
  },
  checkboxBase: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  checklistSquare: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
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
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  metaBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.2,
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
    minHeight: 32,
  },
  subItemCheckbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  subItemTitle: {
    fontSize: 12,
    flex: 1,
  },
  previewGatewayBtn: {
    borderRadius: 12,
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
