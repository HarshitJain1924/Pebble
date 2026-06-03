import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import { TodoItem } from "@/components/TodoItem";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { styles } from "@/constants/taskStyles";
import { type Todo, type TaskList } from "../types";

const getDateKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const getTodoDateKey = (todo: Todo) => {
  if (todo.scheduledDate) {
    return todo.scheduledDate;
  }
  if (todo.alarmTime) {
    return getDateKey(new Date(todo.alarmTime));
  }
  const idNum = Number(todo.id);
  if (!isNaN(idNum) && idNum > 100000000000) {
    return getDateKey(new Date(idNum));
  }
  return getDateKey();
};

interface TaskSectionsProps {
  overdueTodos: Todo[];
  todayTodos: Todo[];
  upcomingTodos: Todo[];
  inboxTodos: Todo[];
  lists: TaskList[];
  selectedList: string;
  selectedDate: string;
  completedCount: number;
  onClearCompleted: () => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
  onEditTodo: (todo: Todo) => void;
  onSetAlarm: (id: string) => void;
  onTaskLayout?: (todoId: string, y: number) => void;
  isSelectionMode?: boolean;
  selectedItemIds?: Set<string>;
  onToggleSelectItem?: (id: string) => void;
}

export function TaskSections({
  overdueTodos,
  todayTodos,
  upcomingTodos,
  inboxTodos,
  lists,
  selectedList,
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
}: TaskSectionsProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  // Collapsible sections expanded states managed internally
  const [overdueExpanded, setOverdueExpanded] = useState(true);
  const [todayExpanded, setTodayExpanded] = useState(true);
  const [inboxExpanded, setInboxExpanded] = useState(true);

  const isOverdue = (todo: Todo) => {
    if (todo.completed) return false;
    const todoDate = getTodoDateKey(todo);
    return todoDate < selectedDate;
  };

  const renderTodoItem = (item: Todo) => {
    return (
      <TodoItem
        key={item.id}
        item={item}
        colors={colors}
        colorScheme={colorScheme}
        isOverdue={isOverdue(item)}
        lists={lists}
        selectedList={selectedList}
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
      />
    );
  };

  return (
    <View style={styles.listContent}>
      {/* Clear Completed trigger */}
      {completedCount > 0 && (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            marginBottom: 8,
          }}
        >
          <Pressable
            onPress={onClearCompleted}
            style={{ paddingHorizontal: 12, paddingVertical: 4 }}
          >
            <Text
              style={{
                color: colors.primary,
                fontWeight: "700",
                fontSize: 12,
              }}
            >
              Clear completed
            </Text>
          </Pressable>
        </View>
      )}

      {/* Overdue Section */}
      {overdueTodos.length > 0 && (
        <View style={styles.sectionContainer}>
          <Pressable
            onPress={() => setOverdueExpanded(!overdueExpanded)}
            style={styles.sectionHeaderPressable}
          >
            <Text style={[styles.sectionHeaderText, { color: colors.text }]}>
              Overdue
            </Text>
            <Feather
              name={overdueExpanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={colors.textMuted}
            />
          </Pressable>
          {overdueExpanded && (
            <View style={styles.sectionTasksList}>
              {overdueTodos.map(renderTodoItem)}
            </View>
          )}
        </View>
      )}

      {/* Today / Scheduled Section */}
      <View style={styles.sectionContainer}>
        <Pressable
          onPress={() => setTodayExpanded(!todayExpanded)}
          style={styles.sectionHeaderPressable}
        >
          <Text style={[styles.sectionHeaderText, { color: colors.text }]}>
            Active Tasks
          </Text>
          <Feather
            name={todayExpanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={colors.textMuted}
          />
        </Pressable>
        {todayExpanded && (
          <View style={styles.sectionTasksList}>
            {todayTodos.length > 0 || upcomingTodos.length > 0 ? (
              <>
                {todayTodos.map(renderTodoItem)}
                {upcomingTodos.map(renderTodoItem)}
              </>
            ) : overdueTodos.length === 0 ? (
              <View
                style={[
                  styles.emptyState,
                  {
                    borderColor: colors.border,
                    padding: 24,
                    gap: 8,
                  },
                ]}
              >
                <Feather name="check" size={24} color={colors.success} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  Drop your first pebble.
                </Text>
                <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                  Add the first pebble.
                </Text>
              </View>
            ) : (
              <View
                style={[
                  styles.emptyState,
                  { borderColor: colors.border, padding: 24 },
                ]}
              >
                <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                  No active tasks scheduled.
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Inbox / Unscheduled Section */}
      {inboxTodos.length > 0 && (
        <View style={styles.sectionContainer}>
          <Pressable
            onPress={() => setInboxExpanded(!inboxExpanded)}
            style={styles.sectionHeaderPressable}
          >
            <Text style={[styles.sectionHeaderText, { color: colors.text }]}>
              Inbox (No Date)
            </Text>
            <Feather
              name={inboxExpanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={colors.textMuted}
            />
          </Pressable>
          {inboxExpanded && (
            <View style={styles.sectionTasksList}>
              {inboxTodos.map(renderTodoItem)}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
