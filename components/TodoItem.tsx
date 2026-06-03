import { Feather } from "@expo/vector-icons";
import React from "react";
import { LayoutChangeEvent, Pressable, StyleSheet,  View } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";

import { AnimatedCheckbox } from "@/components/AnimatedCheckbox";
import { AppCard } from "@/components/AppCard";
import { SwipeableCard } from "@/components/SwipeableCard";
import { Typography } from "@/constants/typography";
import { getTaskCategoryMeta, normalizeTaskCategory, type TaskCategory } from "@/services/taskCategories";

export type Todo = {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  completed: boolean;
  category?: any;
  alarmId?: string;
  alarmTime?: number;
  notificationIds?: string[];
  reminderHour?: number;
  reminderMinute?: number;
  reminderDays?: number[];
  escalationMinutes?: number[];
  priority?: "low" | "medium" | "high";
  scheduledDate?: string;
  durationMinutes?: number;
  repeatType?: "none" | "daily" | "weekly" | "monthly";
};

export type TaskList = { id: string; name: string };

const getFormattedDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

interface TodoItemProps {
  item: Todo;
  colors: any;
  colorScheme: "light" | "dark" | null;
  isOverdue: boolean;
  lists: TaskList[];
  selectedList: string;
  onToggleTodo: () => void;
  onDeleteTodo: () => void;
  onEditTodo?: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
}

export function TodoItem({
  item,
  colors,
  colorScheme,
  isOverdue: overdue,
  lists,
  selectedList,
  onToggleTodo,
  onDeleteTodo,
  onEditTodo,
  onLayout,
  isSelectionMode = false,
  isSelected = false,
  onSelect,
}: TodoItemProps) {
  const category = getTaskCategoryMeta(normalizeTaskCategory(item.category));
  const overdueTagBg = overdue ? "rgba(245, 158, 11, 0.08)" : "transparent";
  const overdueTagColor = overdue ? colors.warning : colors.textMuted;
  const isLight = colorScheme === "light";

  const formatAlarm = (ms?: number) => {
    if (!ms) return null;
    const d = new Date(ms);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <SwipeableCard
      onSwipeRight={onToggleTodo}
      onSwipeLeft={onDeleteTodo}
      disabled={isSelectionMode}
    >
      <View onLayout={onLayout}>
        <AppCard
          style={[
            styles.todoItemCard,
            {
              borderLeftWidth: 4,
              borderLeftColor:
                item.priority === "high"
                  ? colors.error
                  : item.priority === "low"
                  ? colors.success
                  : colors.warning,
            },
          ]}
        >
          {/* Parent Task Main Info Row */}
          <View style={styles.todoMainRow}>
            <View style={styles.todoLeft}>
              {isSelectionMode ? (
                <Pressable onPress={onSelect} style={{ padding: 4 }}>
                  <Feather
                    name={isSelected ? "check-circle" : "circle"}
                    size={18}
                    color={isSelected ? colors.primary : colors.textMuted}
                  />
                </Pressable>
              ) : (
                <AnimatedCheckbox
                  checked={item.completed}
                  onToggle={onToggleTodo}
                />
              )}
              <Pressable onPress={isSelectionMode ? onSelect : onEditTodo} style={styles.todoTexts}>
                <Text
                  style={[
                    styles.todoTitle,
                    {
                      color: item.completed ? colors.textMuted : colors.text,
                      textDecorationLine: item.completed
                        ? "line-through"
                        : "none",
                    },
                  ]}
                >
                  {item.title}
                </Text>
                <View style={styles.metaRow}>
                  <View
                    style={[
                      styles.tagBadge,
                      {
                        backgroundColor: category.softTint,
                        borderColor: category.tint,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.tagBadgeText, { color: category.tint }]}
                    >
                      {category.label}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.tagBadge,
                      {
                        backgroundColor:
                          item.priority === "high"
                            ? `${colors.error}12`
                            : item.priority === "low"
                            ? `${colors.success}12`
                            : `${colors.warning}12`,
                        borderColor:
                          item.priority === "high"
                            ? colors.error
                            : item.priority === "low"
                            ? colors.success
                            : colors.warning,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tagBadgeText,
                        {
                          color:
                            item.priority === "high"
                              ? colors.error
                              : item.priority === "low"
                              ? colors.success
                              : colors.warning,
                        },
                      ]}
                    >
                      {item.priority ? item.priority.toUpperCase() : "MEDIUM"}
                    </Text>
                  </View>
                  {overdue && (
                    <View
                      style={[
                        styles.tagBadge,
                        {
                          backgroundColor: overdueTagBg,
                          borderColor: colors.warning,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.tagBadgeText,
                          { color: overdueTagColor },
                        ]}
                      >
                        Overdue
                      </Text>
                    </View>
                  )}
                  {item.scheduledDate && item.scheduledDate !== "inbox" && (
                    <View
                      style={[
                        styles.tagBadge,
                        {
                          backgroundColor: `${colors.primary}12`,
                          borderColor: colors.primary,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.tagBadgeText, { color: colors.primary }]}
                      >
                        📅 {item.scheduledDate === getFormattedDateKey(new Date())
                          ? "Today"
                          : item.scheduledDate === getFormattedDateKey(addDays(new Date(), 1))
                          ? "Tomorrow"
                          : item.scheduledDate}
                      </Text>
                    </View>
                  )}
                  {item.alarmTime && (
                    <View style={styles.reminderRow}>
                      <Feather name="bell" size={12} color={colors.primary} />
                      <Text
                        style={[
                          styles.reminderText,
                          { color: colors.primary },
                        ]}
                      >
                        {formatAlarm(item.alarmTime)}
                      </Text>
                    </View>
                  )}
                </View>
              </Pressable>
            </View>

            {!isSelectionMode && (
              <Pressable
                onPress={onEditTodo}
                hitSlop={8}
                style={{ padding: 4 }}
              >
                <Feather
                  name="edit-2"
                  size={16}
                  color={colors.textMuted}
                />
              </Pressable>
            )}
          </View>
        </AppCard>
      </View>
    </SwipeableCard>
  );
}

const styles = StyleSheet.create({
  todoItemCard: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "column",
    gap: 4,
  },
  todoMainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  todoLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  todoTexts: {
    flex: 1,
    gap: 1,
  },
  todoTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 1,
    flexWrap: "wrap",
  },
  tagBadge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  tagBadgeText: {
    fontSize: 8,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  reminderText: {
    fontSize: 10,
    fontWeight: "600",
  },
});
