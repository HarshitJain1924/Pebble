import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { LayoutChangeEvent, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AnimatedCheckbox } from "@/components/AnimatedCheckbox";
import { AppCard } from "@/components/AppCard";
import { ProgressBar } from "@/components/ProgressBar";
import { SwipeableCard } from "@/components/SwipeableCard";
import { Spacing } from "@/constants/spacing";
import { Typography } from "@/constants/typography";
import { getTaskCategoryMeta, normalizeTaskCategory } from "@/services/taskCategories";

export type Subtask = {
  id: string;
  title: string;
  completed: boolean;
};

export type Todo = {
  id: string;
  title: string;
  completed: boolean;
  category?: any;
  alarmId?: string;
  alarmTime?: number;
  notificationIds?: string[];
  reminderHour?: number;
  reminderMinute?: number;
  reminderDays?: number[];
  escalationMinutes?: number[];
  subtasks?: Subtask[];
  priority?: "low" | "medium" | "high";
};

type TaskList = { id: string; name: string };

interface TodoItemProps {
  item: Todo;
  colors: any;
  colorScheme: "light" | "dark" | null;
  isOverdue: boolean;
  lists: TaskList[];
  selectedList: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleTodo: () => void;
  onDeleteTodo: () => void;
  onUpdateTodoTitle: (newTitle: string) => void;
  onMoveTodoToList: (toListId: string) => void;
  onUpdateTodoPriority: (priority: "low" | "medium" | "high") => void;
  onToggleSubtask: (subtaskId: string) => void;
  onAddSubtask: (text: string) => void;
  onDeleteSubtask: (subtaskId: string) => void;
  onToggleAlarmMenu: () => void;
  onCancelAlarm: () => void;
  alarmMenuOpen: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
}

export function TodoItem({
  item,
  colors,
  colorScheme,
  isOverdue: overdue,
  lists,
  selectedList,
  isExpanded,
  onToggleExpand,
  onToggleTodo,
  onDeleteTodo,
  onUpdateTodoTitle,
  onMoveTodoToList,
  onUpdateTodoPriority,
  onToggleSubtask,
  onAddSubtask,
  onDeleteSubtask,
  onToggleAlarmMenu,
  onCancelAlarm,
  alarmMenuOpen,
  onLayout,
}: TodoItemProps) {
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");

  const subtasks = item.subtasks ?? [];
  const hasSubtasks = subtasks.length > 0;
  const completedSubtasks = subtasks.filter((s) => s.completed).length;
  const subtaskProgress = hasSubtasks ? completedSubtasks / subtasks.length : 0;
  const category = getTaskCategoryMeta(normalizeTaskCategory(item.category));
  const overdueTagBg = overdue ? "rgba(245, 158, 11, 0.08)" : "transparent";
  const overdueTagColor = overdue ? colors.warning : colors.textMuted;

  const handleAddSubtask = () => {
    const trimmed = newSubtaskTitle.trim();
    if (!trimmed) return;
    onAddSubtask(trimmed);
    setNewSubtaskTitle("");
  };

  const formatAlarm = (ms?: number) => {
    if (!ms) return null;
    const d = new Date(ms);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <SwipeableCard
      onSwipeRight={onToggleTodo}
      onSwipeLeft={onDeleteTodo}
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
              <AnimatedCheckbox
                checked={item.completed}
                onToggle={onToggleTodo}
              />
              <Pressable onPress={onToggleExpand} style={styles.todoTexts}>
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
                  {hasSubtasks && (
                    <View style={styles.subtaskProgressLabelRow}>
                      <Feather
                        name="list"
                        size={12}
                        color={colors.textMuted}
                      />
                      <Text
                        style={[
                          styles.subtaskProgressText,
                          { color: colors.textMuted },
                        ]}
                      >
                        {completedSubtasks}/{subtasks.length} subtasks
                      </Text>
                    </View>
                  )}
                </View>
              </Pressable>
            </View>

            <Pressable
              onPress={onToggleExpand}
              hitSlop={8}
              style={{ padding: 4 }}
            >
              <Feather
                name={isExpanded ? "chevron-up" : "chevron-down"}
                size={18}
                color={colors.textMuted}
              />
            </Pressable>
          </View>

          {/* Expanded Checklist & Progress Section */}
          {isExpanded && (
            <View
              style={[
                styles.expandSection,
                { borderTopColor: "rgba(255,255,255,0.05)" },
              ]}
            >
              {/* Inline Title Rename */}
              <View style={styles.editTaskRow}>
                <Text style={[styles.editLabel, { color: colors.textMuted }]}>
                  Rename
                </Text>
                <TextInput
                  value={item.title}
                  onChangeText={onUpdateTodoTitle}
                  placeholder="Task name"
                  placeholderTextColor={colors.textMuted}
                  style={[
                    styles.editTitleInput,
                    { color: colors.text, borderColor: colors.border },
                  ]}
                />
              </View>

              {/* Category List Migration Selector */}
              <View style={styles.migrateCategoryRow}>
                <Text style={[styles.editLabel, { color: colors.textMuted }]}>
                  Move to
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.migratePills}
                >
                  {lists.map((lst) => {
                    const isCurrent = lst.id === selectedList;
                    return (
                      <Pressable
                        key={lst.id}
                        onPress={() => {
                          if (isCurrent) return;
                          onMoveTodoToList(lst.id);
                        }}
                        style={[
                          styles.migratePill,
                          {
                            backgroundColor: isCurrent
                              ? `${colors.primary}22`
                              : colors.cardLight,
                            borderColor: isCurrent
                              ? colors.primary
                              : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: isCurrent ? colors.primary : colors.text,
                            fontSize: 11,
                            fontWeight: "600",
                          }}
                        >
                          {lst.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Priority Selection Selector */}
              <View style={styles.editTaskRow}>
                <Text style={[styles.editLabel, { color: colors.textMuted }]}>
                  Priority
                </Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {[
                    {
                      key: "high",
                      label: "🔴 High",
                      color: colors.error,
                      softColor:
                        colorScheme === "light"
                          ? "rgba(220, 38, 38, 0.08)"
                          : "rgba(239, 68, 68, 0.12)",
                    },
                    {
                      key: "medium",
                      label: "🟡 Medium",
                      color: colors.warning,
                      softColor:
                        colorScheme === "light"
                          ? "rgba(217, 119, 6, 0.08)"
                          : "rgba(245, 158, 11, 0.12)",
                    },
                    {
                      key: "low",
                      label: "🟢 Low",
                      color: colors.success,
                      softColor:
                        colorScheme === "light"
                          ? "rgba(5, 150, 105, 0.08)"
                          : "rgba(16, 185, 129, 0.12)",
                    },
                  ].map((p) => {
                    const isSelected = item.priority === p.key;
                    return (
                      <Pressable
                        key={p.key}
                        onPress={() =>
                          onUpdateTodoPriority(p.key as any)
                        }
                        style={[
                          styles.migratePill,
                          {
                            backgroundColor: isSelected
                              ? p.softColor
                              : colors.cardLight,
                            borderColor: isSelected ? p.color : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: isSelected ? p.color : colors.text,
                            fontSize: 11,
                            fontWeight: "700",
                          }}
                        >
                          {p.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.dividerSmall} />

              {/* Subtasks Progress Bar */}
              {hasSubtasks && (
                <View style={styles.subtaskProgressBarWrap}>
                  <ProgressBar progress={subtaskProgress} />
                </View>
              )}

              {/* Subtasks Checklist */}
              {hasSubtasks && (
                <View style={styles.subtaskList}>
                  {subtasks.map((sub) => (
                    <View key={sub.id} style={styles.subtaskItem}>
                      <View style={styles.subtaskLeft}>
                        <Pressable
                          onPress={() => onToggleSubtask(sub.id)}
                          style={styles.subtaskCheckbox}
                        >
                          <Feather
                            name={sub.completed ? "check-circle" : "circle"}
                            size={16}
                            color={
                              sub.completed
                                ? colors.success
                                : colors.textMuted
                            }
                          />
                        </Pressable>
                        <Text
                          style={[
                            styles.subtaskTitle,
                            {
                              color: sub.completed
                                ? colors.textMuted
                                : colors.text,
                              textDecorationLine: sub.completed
                                ? "line-through"
                                : "none",
                            },
                          ]}
                        >
                          {sub.title}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => onDeleteSubtask(sub.id)}
                        hitSlop={6}
                      >
                        <Feather
                          name="x"
                          size={14}
                          color={colors.textMuted}
                        />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}

              {/* Add Inline Subtask Row */}
              <View
                style={[
                  styles.createSubtaskRow,
                  { borderColor: colors.border },
                ]}
              >
                <TextInput
                  value={newSubtaskTitle}
                  onChangeText={setNewSubtaskTitle}
                  placeholder="Add a subtask..."
                  placeholderTextColor={colors.textMuted}
                  onSubmitEditing={handleAddSubtask}
                  style={[styles.createSubtaskInput, { color: colors.text }]}
                />
                <Pressable
                  onPress={handleAddSubtask}
                  style={[
                    styles.subtaskAddBtn,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Feather name="plus" size={14} color="#ffffff" />
                </Pressable>
              </View>

              {/* Task Actions Row in Expanded View */}
              <View style={styles.expandedActionsRow}>
                <Pressable
                  onPress={onToggleAlarmMenu}
                  style={[
                    styles.expandedActionBtn,
                    {
                      backgroundColor: item.alarmId
                        ? "rgba(99, 102, 241, 0.15)"
                        : "rgba(255, 255, 255, 0.04)",
                    },
                  ]}
                >
                  <Feather
                    name="bell"
                    size={13}
                    color={item.alarmId ? colors.primary : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.expandedActionBtnText,
                      {
                        color: item.alarmId ? colors.primary : colors.textMuted,
                      },
                    ]}
                  >
                    {item.alarmId
                      ? formatAlarm(item.alarmTime) || "Reminder Set"
                      : "Set Reminder"}
                  </Text>
                </Pressable>
                {item.alarmId && (
                  <Pressable
                    onPress={onCancelAlarm}
                    style={[
                      styles.expandedActionBtn,
                      { backgroundColor: "rgba(239, 68, 68, 0.08)" },
                    ]}
                  >
                    <Feather name="bell-off" size={13} color="#EF4444" />
                    <Text
                      style={[
                        styles.expandedActionBtnText,
                        { color: "#EF4444" },
                      ]}
                    >
                      Remove
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={onDeleteTodo}
                  style={[
                    styles.expandedActionBtn,
                    {
                      backgroundColor: "rgba(239, 68, 68, 0.08)",
                      marginLeft: "auto",
                    },
                  ]}
                >
                  <Feather name="trash-2" size={13} color="#EF4444" />
                  <Text
                    style={[
                      styles.expandedActionBtnText,
                      { color: "#EF4444" },
                    ]}
                  >
                    Delete
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </AppCard>
      </View>
    </SwipeableCard>
  );
}

const styles = StyleSheet.create({
  todoItemCard: {
    padding: Spacing.md,
    flexDirection: "column",
    gap: 8,
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
    gap: 12,
  },
  todoTexts: {
    flex: 1,
    gap: 2,
  },
  todoTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 2,
    flexWrap: "wrap",
  },
  tagBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  tagBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  reminderText: {
    fontSize: Typography.sizes.xs,
    fontWeight: "600",
  },
  subtaskProgressLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  subtaskProgressText: {
    fontSize: Typography.sizes.xs,
    fontWeight: "500",
  },
  expandSection: {
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 4,
    gap: 10,
  },
  editTaskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 2,
  },
  editLabel: {
    fontSize: 12,
    fontWeight: "600",
    width: 54,
  },
  editTitleInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
  },
  migrateCategoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 2,
  },
  migratePills: {
    gap: 6,
    paddingVertical: 2,
  },
  migratePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  dividerSmall: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    marginVertical: 4,
  },
  subtaskProgressBarWrap: {
    paddingVertical: 2,
  },
  subtaskList: {
    gap: 8,
  },
  subtaskItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  subtaskLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  subtaskCheckbox: {
    padding: 2,
  },
  subtaskTitle: {
    fontSize: Typography.sizes.sm,
    fontWeight: "500",
    flex: 1,
  },
  createSubtaskRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 4,
    marginTop: 2,
  },
  createSubtaskInput: {
    flex: 1,
    fontSize: Typography.sizes.xs,
    paddingVertical: 4,
  },
  subtaskAddBtn: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  expandedActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    width: "100%",
  },
  expandedActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  expandedActionBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
