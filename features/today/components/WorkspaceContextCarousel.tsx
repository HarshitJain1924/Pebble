import React from "react";
import { View, ScrollView, Dimensions } from "react-native";
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
import { styles } from "@/shared/constants/dashboardStyles";
import { type ThemeColors } from "@/shared/constants/theme";
import { type Checklist, type Habit, type Task, type Workspace } from "@/shared/types/domain.types";
import {
  isTaskCompleted,
  isHabitCompletedToday,
  getHabitCurrentStreak,
  getHabitBestStreak,
  getTaskOccurrenceState,
} from "@/shared/utils/domain-selectors";
import { getDateKey, getTodoDateKey } from "@/features/tasks/utils/task-formatting";
import {
  getCheckboxAction,
  getRowContentAction,
} from "@/features/today/utils/today-interactions";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

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

export interface WorkspaceContextCarouselProps {
  activeContexts: ActiveContextItem[];
  colors: ThemeColors;
  colorScheme: "light" | "dark" | null | undefined;
  allCollections?: Record<string, any[]>;
  expandedChecklistIds: Record<string, boolean>;
  setExpandedChecklistIds: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  activeCardIndex: number;
  setActiveCardIndex: (index: number) => void;
  parentScrollRef: React.RefObject<any>;
  router: Router;
  completeTodoFromDashboard: (todoId: string, event?: any, workspaceId?: string) => Promise<void>;
  completeHabitFromDashboard: (habitId: string, event?: any, workspaceId?: string) => Promise<void>;
  toggleChecklistItemFromDashboard: (
    checklistId: string,
    itemId: string,
    folderId: string,
  ) => Promise<void>;
}

export const WorkspaceContextCarousel: React.FC<
  WorkspaceContextCarouselProps
> = ({
  activeContexts,
  colors,
  colorScheme,
  allCollections = {},
  expandedChecklistIds,
  setExpandedChecklistIds,
  activeCardIndex,
  setActiveCardIndex,
  parentScrollRef,
  router,
  completeTodoFromDashboard,
  completeHabitFromDashboard,
  toggleChecklistItemFromDashboard,
}) => {
  return (
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
            No active tasks, habits, or checklists matching your selection.
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
                tasks.filter((t) => isTaskCompleted(t)).length +
                habits.filter((h) => isHabitCompletedToday(h)).length +
                checklists.reduce(
                  (sum, c) =>
                    sum + c.items.filter((i) => i.completed).length,
                  0,
                );
              const progress =
                totalItems > 0 ? completedItems / totalItems : 0;
              const folderCollections = allCollections[folder.id] || [];
              const resourcesCount: number = folderCollections.length;

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
                                workspaceId: folder.id,
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
                        completed: isHabitCompletedToday(habit),
                        title: habit.title,
                        streak: getHabitCurrentStreak(habit),
                        bestStreak: getHabitBestStreak(habit),
                        priority: undefined,
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
                                if (isTaskCompleted(todo)) {
                                  subtitle = "COMPLETED";
                                } else if (item.isOverdue) {
                                  const dateKey = getTodoDateKey(todo);
                                  const overdueLabel =
                                    getOverdueLabel(
                                      dateKey,
                                    ).toUpperCase();
                                  subtitle = `OVERDUE • ${overdueLabel}`;
                                } else if (todo.recurrence?.frequency) {
                                  const typeLabel =
                                    todo.recurrence.frequency.toUpperCase();
                                  subtitle = `RECURS • ${typeLabel}`;
                                } else if (
                                  todo.reminder?.triggerAt !== undefined
                                ) {
                                  const d = new Date(todo.reminder.triggerAt);
                                  const ampm = d.getHours() >= 12 ? "PM" : "AM";
                                  const displayHour = d.getHours() % 12 || 12;
                                  const displayMinute = String(d.getMinutes()).padStart(2, "0");
                                  subtitle = `TODAY • ${displayHour}:${displayMinute} ${ampm}`;
                                }

                                const isCompleted = isTaskCompleted(todo);
                                const checkboxAction = getCheckboxAction(
                                  "task",
                                  isCompleted,
                                );
                                const contentAction = getRowContentAction(
                                  "task",
                                  todo.id,
                                );

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
                                        priority={todo.priority === "none" ? undefined : todo.priority}
                                      />

                                      {/* Gap between priority line and checkbox */}
                                      <View style={{ width: 6 }} />

                                      <PressableScale
                                        disabled={checkboxAction === "locked"}
                                        onPress={(e) =>
                                          completeTodoFromDashboard(
                                            todo.id,
                                            e,
                                            folder.id,
                                          )
                                        }
                                        haptic
                                        style={{
                                          width: 20,
                                          height: 20,
                                          borderRadius: 10,
                                          borderWidth: 2,
                                          borderColor: isCompleted
                                            ? itemColor
                                            : "rgba(255,255,255,0.2)",
                                          backgroundColor: isCompleted
                                            ? itemColor
                                            : "transparent",
                                          alignItems: "center",
                                          justifyContent: "center",
                                        }}
                                      >
                                        {isCompleted && (
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
                                          if (
                                            contentAction.action ===
                                            "open-details"
                                          ) {
                                            router.push(contentAction.route);
                                          }
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
                                              fontWeight: "600",
                                              textDecorationLine:
                                                isTaskCompleted(todo)
                                                  ? "line-through"
                                                  : "none",
                                            }}
                                            numberOfLines={1}
                                          >
                                            {todo.title}
                                          </Text>
                                          <StatusBadge
                                            status={
                                              isTaskCompleted(todo)
                                                ? "completed"
                                                : item.isOverdue
                                                  ? "overdue"
                                                  : "today"
                                            }
                                            text={subtitle}
                                          />
                                        </View>

                                        <CategoryChip
                                          category={todo.categoryId}
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
                                const isCompletedHabit = isHabitCompletedToday(habit);
                                const checkboxAction = getCheckboxAction(
                                  "habit",
                                  isCompletedHabit,
                                );
                                const contentAction = getRowContentAction(
                                  "habit",
                                  habit.id,
                                );
                                const currentStreak = getHabitCurrentStreak(habit);

                                let subtitle = "";
                                if (isCompletedHabit) {
                                  subtitle = "COMPLETED";
                                } else {
                                  const detail = habit.description
                                    ? habit.description.toUpperCase()
                                    : `🔥 ${currentStreak} DAY STREAK`;
                                  subtitle = `DAY ${currentStreak + 1} • ${detail}`;
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
                                        priority={undefined}
                                      />

                                      {/* Gap between priority line and checkbox */}
                                      <View style={{ width: 6 }} />

                                      <PressableScale
                                        disabled={checkboxAction === "locked"}
                                        onPress={(e) =>
                                          completeHabitFromDashboard(
                                            habit.id,
                                            e,
                                            folder.id,
                                          )
                                        }
                                        haptic
                                        style={{
                                          width: 20,
                                          height: 20,
                                          borderRadius: 10,
                                          borderWidth: 2,
                                          borderColor:
                                            isCompletedHabit
                                              ? "#F59E0B"
                                              : "rgba(255,255,255,0.2)",
                                          backgroundColor:
                                            isCompletedHabit
                                              ? "#F59E0B"
                                              : "transparent",
                                          alignItems: "center",
                                          justifyContent: "center",
                                        }}
                                      >
                                        {isCompletedHabit && (
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
                                          if (
                                            contentAction.action ===
                                            "open-details"
                                          ) {
                                            router.push(contentAction.route);
                                          }
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
                                              color: isCompletedHabit
                                                ? colors.textMuted
                                                : colors.text,
                                              fontSize: 14,
                                              fontWeight: "600",
                                              textDecorationLine:
                                                isHabitCompletedToday(habit)
                                                  ? "line-through"
                                                  : "none",
                                            }}
                                            numberOfLines={1}
                                          >
                                            {habit.title}
                                          </Text>
                                          <StatusBadge
                                            status={
                                              isHabitCompletedToday(habit)
                                                ? "completed"
                                                : "active"
                                            }
                                            text={subtitle}
                                          />
                                        </View>

                                        <CategoryChip
                                          category={habit.categoryId}
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
                                const checkboxAction = getCheckboxAction(
                                  "checklist",
                                  item.completed,
                                );
                                const contentAction = getRowContentAction(
                                  "checklist",
                                  checklist.id,
                                );
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
                                        disabled={checkboxAction === "locked"}
                                        onPress={() => {
                                          if (checkboxAction === "toggle-expand") {
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
                                          }
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
                                          if (
                                            contentAction.action ===
                                            "toggle-expand"
                                          ) {
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
                                          }
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
                                                     color: subItem.completed
                                                       ? colors.textMuted
                                                       : colors.text,
                                                     fontSize: 12,
                                                     textDecorationLine: subItem.completed
                                                       ? "line-through"
                                                       : "none",
                                                     flex: 1,
                                                   }}
                                                   numberOfLines={1}
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
                                params: { workspaceId: folder.id },
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
  );
};
