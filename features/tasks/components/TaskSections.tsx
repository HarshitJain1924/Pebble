import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import { TodoItem } from "@/features/tasks/components/TaskItem";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { styles } from "@/shared/constants/taskStyles";
import { EmptyState } from "@/shared/components/ui/EmptyState";
import { Task, Workspace } from "@/shared/types/domain.types";

const getDateKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const getTodoDateKey = (todo: Task) => {
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
  overdueTodos: Task[];
  todayTodos: Task[];
  upcomingTodos: Task[];
  inboxTodos: Task[];
  lists: Workspace[];
  selectedList: string;
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
  allResources = [],
  onToggleLinkResource,
}: TaskSectionsProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  // Section expanded states
  const [todayExpanded, setTodayExpanded] = useState(true);
  const [upcomingExpanded, setUpcomingExpanded] = useState(true);
  const [somedayExpanded, setSomedayExpanded] = useState(true);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [expandedTodoId, setExpandedTodoId] = useState<string | null>(null);

  const isOverdue = (todo: Task) => {
    if (todo.completed) return false;
    const todoDate = getTodoDateKey(todo);
    return todoDate < selectedDate;
  };

  const renderTodoItem = (item: Task) => {
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
        allResources={allResources}
        onToggleLinkResource={onToggleLinkResource}
        isExpanded={expandedTodoId === item.id}
        onToggleExpand={() => setExpandedTodoId(expandedTodoId === item.id ? null : item.id)}
      />
    );
  };

  // Group tasks naturally
  const todayList = React.useMemo(() => {
    return [...overdueTodos, ...todayTodos].filter((t) => !t.completed);
  }, [overdueTodos, todayTodos]);

  const upcomingList = React.useMemo(() => {
    return upcomingTodos.filter((t) => !t.completed);
  }, [upcomingTodos]);

  const somedayList = React.useMemo(() => {
    return inboxTodos.filter((t) => !t.completed);
  }, [inboxTodos]);

  const completedList = React.useMemo(() => {
    const all = [...todayTodos, ...upcomingTodos, ...inboxTodos, ...overdueTodos];
    // Filter duplicates just in case
    const seen = new Set();
    return all.filter((t) => {
      if (!t.completed) return false;
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  }, [todayTodos, upcomingTodos, inboxTodos, overdueTodos]);

  const hasAnyTasks = todayList.length > 0 || upcomingList.length > 0 || somedayList.length > 0 || completedList.length > 0;

  if (!hasAnyTasks) {
    return (
      <EmptyState
        graphic={<Feather name="check" size={24} color={colors.success} />}
        title="No tasks in this workspace."
        description="Add a task to get started."
        style={{ padding: 32, gap: 8, marginTop: 20 }}
      />
    );
  }

  return (
    <View style={styles.listContent}>
      {/* Clear Completed trigger */}
      {completedList.length > 0 && (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            marginBottom: 4,
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

      {/* Today Section */}
      {todayList.length > 0 && (
        <View style={styles.sectionContainer}>
          <Pressable
            onPress={() => setTodayExpanded(!todayExpanded)}
            style={styles.sectionHeaderPressable}
          >
            <Text style={[styles.sectionHeaderText, { color: colors.textMuted }]}>
              Today
            </Text>
            <Feather
              name={todayExpanded ? "chevron-up" : "chevron-down"}
              size={14}
              color={colors.textMuted}
            />
          </Pressable>
          {todayExpanded && (
            <View style={styles.sectionTasksList}>
              {todayList.map(renderTodoItem)}
            </View>
          )}
        </View>
      )}

      {/* Upcoming Section */}
      {upcomingList.length > 0 && (
        <View style={styles.sectionContainer}>
          <Pressable
            onPress={() => setUpcomingExpanded(!upcomingExpanded)}
            style={styles.sectionHeaderPressable}
          >
            <Text style={[styles.sectionHeaderText, { color: colors.textMuted }]}>
              Upcoming
            </Text>
            <Feather
              name={upcomingExpanded ? "chevron-up" : "chevron-down"}
              size={14}
              color={colors.textMuted}
            />
          </Pressable>
          {upcomingExpanded && (
            <View style={styles.sectionTasksList}>
              {upcomingList.map(renderTodoItem)}
            </View>
          )}
        </View>
      )}

      {/* Someday Section */}
      {somedayList.length > 0 && (
        <View style={styles.sectionContainer}>
          <Pressable
            onPress={() => setSomedayExpanded(!somedayExpanded)}
            style={styles.sectionHeaderPressable}
          >
            <Text style={[styles.sectionHeaderText, { color: colors.textMuted }]}>
              Someday
            </Text>
            <Feather
              name={somedayExpanded ? "chevron-up" : "chevron-down"}
              size={14}
              color={colors.textMuted}
            />
          </Pressable>
          {somedayExpanded && (
            <View style={styles.sectionTasksList}>
              {somedayList.map(renderTodoItem)}
            </View>
          )}
        </View>
      )}

      {/* Completed Section */}
      {completedList.length > 0 && (
        <View style={styles.sectionContainer}>
          <Pressable
            onPress={() => setCompletedExpanded(!completedExpanded)}
            style={styles.sectionHeaderPressable}
          >
            <Text style={[styles.sectionHeaderText, { color: colors.textMuted }]}>
              Completed
            </Text>
            <Feather
              name={completedExpanded ? "chevron-up" : "chevron-down"}
              size={14}
              color={colors.textMuted}
            />
          </Pressable>
          {completedExpanded && (
            <View style={styles.sectionTasksList}>
              {completedList.map(renderTodoItem)}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
