import { useState, useMemo } from "react";
import { Task, Habit, Workspace, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import {
  isTaskCompleted,
  isHabitCompletedToday,
  getHabitBestStreak,
  getTaskOccurrenceState,
} from "@/shared/utils/domain-selectors";
import { getPriorityWeight } from "@/features/tasks/utils/task-formatting";
import { isRecurringOccurrenceForDate, getRecurrenceLabel } from "@/services/scheduling/recurrence.service";

/**
 * Resolves time of day in minutes from midnight for a task.
 * Prioritizes `schedule.startTime`, then falls back to `reminder.triggerAt`.
 */
export function getTaskTimeMinutes(task: Task): number | null {
  if (task.schedule?.startTime) {
    const [h, m] = task.schedule.startTime.split(":").map(Number);
    if (!isNaN(h) && !isNaN(m)) return h * 60 + m;
  }
  if (task.reminder?.triggerAt) {
    const d = new Date(task.reminder.triggerAt);
    return d.getHours() * 60 + d.getMinutes();
  }
  return null;
}

/**
 * Stable task comparator:
 * 1. Priority (high -> medium/none -> low)
 * 2. schedule.date ascending
 * 3. Time of day ascending (timed tasks before untimed)
 * 4. Stable tiebreaker (task.id)
 */
export function compareTasks(a: Task, b: Task): number {
  // 1. Priority
  const pA = getPriorityWeight(a.priority);
  const pB = getPriorityWeight(b.priority);
  if (pA !== pB) return pA - pB;

  // 2. Schedule Date
  const dateA = a.schedule?.date || "";
  const dateB = b.schedule?.date || "";
  if (dateA !== dateB) {
    if (!dateA || dateA === "inbox") return 1;
    if (!dateB || dateB === "inbox") return -1;
    const dateComp = dateA.localeCompare(dateB);
    if (dateComp !== 0) return dateComp;
  }

  // 3. Time
  const timeA = getTaskTimeMinutes(a);
  const timeB = getTaskTimeMinutes(b);
  if (timeA !== null && timeB !== null) {
    if (timeA !== timeB) return timeA - timeB;
  } else if (timeA !== null) {
    return -1;
  } else if (timeB !== null) {
    return 1;
  }

  // 4. Stable tiebreak
  return a.id.localeCompare(b.id);
}

export type TaskStatusFilter = "all" | "active" | "completed";
export type TaskPriorityFilter = "all" | "high" | "medium" | "low";
export type TaskScheduleFilter = "all" | "scheduled" | "unscheduled";
export type TaskReminderFilter = "all" | "has_reminder" | "no_reminder";

export function useTaskFiltering(
  todos: Record<string, Task[]>,
  habits: Habit[],
  selectedWorkspaceId: string,
  selectedDate: string,
  workspaces: Workspace[],
) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWorkspacePriorityFilter, setSelectedWorkspacePriorityFilter] = useState("all");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("all");
  const [selectedWorkspaceHabitPriorityFilter, setSelectedWorkspaceHabitPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>("all");
  const [scheduleFilter, setScheduleFilter] = useState<TaskScheduleFilter>("all");
  const [reminderFilter, setReminderFilter] = useState<TaskReminderFilter>("all");

  const currentTodos = useMemo(
    () => (todos[selectedWorkspaceId] ?? []).filter((t) => !t.archivedAt),
    [todos, selectedWorkspaceId]
  );

  const filteredTodos = useMemo(() => {
    const raw = (todos[selectedWorkspaceId] ?? []).filter((t) => !t.archivedAt);
    if (searchQuery.trim() === "") return raw;
    return raw.filter((todo) => {
      const matchesTitle = todo.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDesc = todo.description?.toLowerCase().includes(searchQuery.toLowerCase()) || false;
      const matchesCategory = todo.categoryId?.toLowerCase().includes(searchQuery.toLowerCase()) || false;
      const wsName = workspaces.find((l) => l.id === todo.workspaceId)?.name || "";
      const matchesWorkspace = wsName.toLowerCase().includes(searchQuery.toLowerCase());
      const recLabel = getRecurrenceLabel(todo.recurrence) || "";
      const matchesRecurrence = recLabel.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTitle || matchesDesc || matchesCategory || matchesWorkspace || matchesRecurrence;
    });
  }, [todos, selectedWorkspaceId, searchQuery, workspaces]);

  // Context-aware filter composition (status, schedule, reminder)
  const contextFilteredTodos = useMemo(() => {
    return filteredTodos.filter((todo) => {
      // 1. Status Filter
      if (statusFilter === "active" && isTaskCompleted(todo)) return false;
      if (statusFilter === "completed" && !isTaskCompleted(todo)) return false;

      // 2. Schedule Filter
      const isScheduled = !!(todo.schedule?.date && todo.schedule.date !== "inbox");
      if (scheduleFilter === "scheduled" && !isScheduled) return false;
      if (scheduleFilter === "unscheduled" && isScheduled) return false;

      // 3. Reminder Filter
      const hasReminder = !!(todo.reminder?.enabled && todo.reminder?.triggerAt);
      if (reminderFilter === "has_reminder" && !hasReminder) return false;
      if (reminderFilter === "no_reminder" && hasReminder) return false;

      return true;
    });
  }, [filteredTodos, statusFilter, scheduleFilter, reminderFilter]);

  // All task buckets consume the single authoritative classification path
  // (getTaskOccurrenceState) so recurring tasks are bucketed by their
  // occurrence on the selected date, never by their base schedule date.
  const overdueTodos = useMemo(() => {
    let filtered = contextFilteredTodos.filter(
      (todo) => todo.schedule?.date !== "inbox" && getTaskOccurrenceState(todo, selectedDate).isOverdue
    );
    if (selectedCategoryFilter !== "all") {
      filtered = filtered.filter((todo) => todo.categoryId === selectedCategoryFilter);
    }
    const matched =
      selectedWorkspacePriorityFilter === "all"
        ? filtered
        : filtered.filter((todo) => todo.priority === selectedWorkspacePriorityFilter);
    return [...matched].sort(compareTasks);
  }, [contextFilteredTodos, selectedWorkspacePriorityFilter, selectedCategoryFilter, selectedDate]);

  // `occurs` is completion-independent: TaskSections routes completed items
  // to the Completed section while keeping them visible for that date.
  const todayTodos = useMemo(() => {
    let filtered = contextFilteredTodos.filter((todo) => {
      if (todo.schedule?.date === "inbox") return false;
      return getTaskOccurrenceState(todo, selectedDate).occurs;
    });
    if (selectedCategoryFilter !== "all") {
      filtered = filtered.filter((todo) => todo.categoryId === selectedCategoryFilter);
    }
    const matched =
      selectedWorkspacePriorityFilter === "all"
        ? filtered
        : filtered.filter((todo) => todo.priority === selectedWorkspacePriorityFilter);
    return [...matched].sort(compareTasks);
  }, [contextFilteredTodos, selectedWorkspacePriorityFilter, selectedCategoryFilter, selectedDate]);

  const upcomingTodos = useMemo(() => {
    let filtered = contextFilteredTodos.filter((todo) => {
      if (todo.schedule?.date === "inbox") return false;
      const state = getTaskOccurrenceState(todo, selectedDate);
      return !state.occurs && state.nextOccurrenceDate !== null;
    });
    if (selectedCategoryFilter !== "all") {
      filtered = filtered.filter((todo) => todo.categoryId === selectedCategoryFilter);
    }
    const matched =
      selectedWorkspacePriorityFilter === "all"
        ? filtered
        : filtered.filter((todo) => todo.priority === selectedWorkspacePriorityFilter);
    return [...matched].sort(compareTasks);
  }, [contextFilteredTodos, selectedWorkspacePriorityFilter, selectedCategoryFilter, selectedDate]);

  const inboxTodos = useMemo(() => {
    let filtered = contextFilteredTodos.filter((todo) => todo.schedule?.date === "inbox");
    if (selectedCategoryFilter !== "all") {
      filtered = filtered.filter((todo) => todo.categoryId === selectedCategoryFilter);
    }
    const matched =
      selectedWorkspacePriorityFilter === "all"
        ? filtered
        : filtered.filter((todo) => todo.priority === selectedWorkspacePriorityFilter);
    return [...matched].sort(compareTasks);
  }, [contextFilteredTodos, selectedWorkspacePriorityFilter, selectedCategoryFilter]);

  const remainingCount = useMemo(() => currentTodos.filter((todo) => !isTaskCompleted(todo)).length, [currentTodos]);
  const completedCount = currentTodos.length - remainingCount;

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedWorkspacePriorityFilter !== "all") count++;
    if (statusFilter !== "all") count++;
    if (scheduleFilter !== "all") count++;
    if (reminderFilter !== "all") count++;
    if (selectedCategoryFilter !== "all") count++;
    return count;
  }, [selectedWorkspacePriorityFilter, statusFilter, scheduleFilter, reminderFilter, selectedCategoryFilter]);

  const resetFilters = () => {
    setSelectedWorkspacePriorityFilter("all");
    setStatusFilter("all");
    setScheduleFilter("all");
    setReminderFilter("all");
    setSelectedCategoryFilter("all");
  };

  // Habit Memos
  const unfinishedHabitCount = useMemo(() => habits.filter((habit) => !isHabitCompletedToday(habit)).length, [habits]);

  const displayedHabits = useMemo(() => {
    const activeHabits = habits.filter((habit) => {
      if ((habit.workspaceId || INBOX_WORKSPACE_ID) !== selectedWorkspaceId) {
        return false;
      }
      if (habit.archivedAt) {
        return false;
      }
      if (habit.recurrence) {
        return isRecurringOccurrenceForDate(habit, selectedDate);
      }
      return true;
    });

    const searchFiltered =
      searchQuery.trim() === ""
        ? activeHabits
        : activeHabits.filter((h) => {
            const matchesTitle = h.title.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesDesc = h.description?.toLowerCase().includes(searchQuery.toLowerCase()) || false;
            const matchesCategory = h.categoryId?.toLowerCase().includes(searchQuery.toLowerCase()) || false;
            const wsName = workspaces.find((l) => l.id === h.workspaceId)?.name || "";
            const matchesWorkspace = wsName.toLowerCase().includes(searchQuery.toLowerCase());
            const recLabel = getRecurrenceLabel(h.recurrence) || "";
            const matchesRecurrence = recLabel.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesTitle || matchesDesc || matchesCategory || matchesWorkspace || matchesRecurrence;
          });

    return searchFiltered;
  }, [habits, selectedDate, searchQuery, workspaces, selectedWorkspaceId]);

  const completedHabitCount = habits.length - unfinishedHabitCount;
  const habitCompletionPct = habits.length === 0 ? 0 : completedHabitCount / habits.length;
  const longestStreak = useMemo(() => habits.reduce((max, habit) => Math.max(max, getHabitBestStreak(habit)), 0), [habits]);

  return {
    // State
    searchQuery,
    setSearchQuery,
    selectedWorkspacePriorityFilter,
    setSelectedWorkspacePriorityFilter,
    priorityFilter: selectedWorkspacePriorityFilter as TaskPriorityFilter,
    setPriorityFilter: setSelectedWorkspacePriorityFilter as (p: TaskPriorityFilter) => void,
    statusFilter,
    setStatusFilter,
    scheduleFilter,
    setScheduleFilter,
    reminderFilter,
    setReminderFilter,
    activeFilterCount,
    resetFilters,
    selectedCategoryFilter,
    setSelectedCategoryFilter,
    selectedWorkspaceHabitPriorityFilter,
    setSelectedWorkspaceHabitPriorityFilter,

    // Memos
    currentTodos,
    filteredTodos,
    contextFilteredTodos,
    overdueTodos,
    todayTodos,
    upcomingTodos,
    inboxTodos,
    remainingCount,
    completedCount,
    unfinishedHabitCount,
    displayedHabits,
    completedHabitCount,
    habitCompletionPct,
    longestStreak,
  };
}