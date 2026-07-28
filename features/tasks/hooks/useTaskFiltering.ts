import { useState, useMemo } from "react";
import { Task, Habit, Workspace, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { isTaskCompleted, isHabitCompletedToday, getHabitBestStreak } from "@/shared/utils/domain-selectors";
import { isOverdue, getTodoDateKey, getPriorityWeight } from "@/features/tasks/utils/task-formatting";
import { isRecurringOccurrenceForDate, getRecurrenceLabel } from "@/services/scheduling/recurrence.service";

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

  const effectiveSelectedDate = useMemo(() => {
    try {
      const parts = selectedDate.split("-").map(Number);
      const sel = new Date(parts[0], parts[1] - 1, parts[2]);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (sel < today) {
        const y = now.getFullYear();
        const m = `${now.getMonth() + 1}`.padStart(2, "0");
        const d = `${now.getDate()}`.padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
      return selectedDate;
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

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

  const overdueTodos = useMemo(() => {
    let filtered = filteredTodos.filter((todo) => todo.schedule?.date !== "inbox" && isOverdue(todo, selectedDate));
    if (selectedCategoryFilter !== "all") {
      filtered = filtered.filter((todo) => todo.categoryId === selectedCategoryFilter);
    }
    const matched =
      selectedWorkspacePriorityFilter === "all"
        ? filtered
        : filtered.filter((todo) => todo.priority === selectedWorkspacePriorityFilter);
    return [...matched].sort((a, b) => getPriorityWeight(a.priority) - getPriorityWeight(b.priority));
  }, [filteredTodos, selectedWorkspacePriorityFilter, selectedCategoryFilter, selectedDate]);

  const todayTodos = useMemo(() => {
    let filtered = filteredTodos.filter((todo) => {
      if (todo.schedule?.date === "inbox") return false;
      if (isOverdue(todo, selectedDate)) return false;
      return isRecurringOccurrenceForDate(todo, selectedDate);
    });
    if (selectedCategoryFilter !== "all") {
      filtered = filtered.filter((todo) => todo.categoryId === selectedCategoryFilter);
    }
    const matched =
      selectedWorkspacePriorityFilter === "all"
        ? filtered
        : filtered.filter((todo) => todo.priority === selectedWorkspacePriorityFilter);
    return [...matched].sort((a, b) => getPriorityWeight(a.priority) - getPriorityWeight(b.priority));
  }, [filteredTodos, selectedWorkspacePriorityFilter, selectedCategoryFilter, selectedDate]);

  const upcomingTodos = useMemo(() => {
    let filtered = filteredTodos.filter(
      (todo) => todo.schedule?.date !== "inbox" && !isOverdue(todo, selectedDate) && getTodoDateKey(todo) > selectedDate
    );
    if (selectedCategoryFilter !== "all") {
      filtered = filtered.filter((todo) => todo.categoryId === selectedCategoryFilter);
    }
    const matched =
      selectedWorkspacePriorityFilter === "all"
        ? filtered
        : filtered.filter((todo) => todo.priority === selectedWorkspacePriorityFilter);
    return [...matched].sort((a, b) => getPriorityWeight(a.priority) - getPriorityWeight(b.priority));
  }, [filteredTodos, selectedWorkspacePriorityFilter, selectedCategoryFilter, selectedDate]);

  const inboxTodos = useMemo(() => {
    let filtered = filteredTodos.filter((todo) => todo.schedule?.date === "inbox");
    if (selectedCategoryFilter !== "all") {
      filtered = filtered.filter((todo) => todo.categoryId === selectedCategoryFilter);
    }
    const matched =
      selectedWorkspacePriorityFilter === "all"
        ? filtered
        : filtered.filter((todo) => todo.priority === selectedWorkspacePriorityFilter);
    return [...matched].sort((a, b) => getPriorityWeight(a.priority) - getPriorityWeight(b.priority));
  }, [filteredTodos, selectedWorkspacePriorityFilter, selectedCategoryFilter]);

  const remainingCount = useMemo(() => currentTodos.filter((todo) => !isTaskCompleted(todo)).length, [currentTodos]);
  const completedCount = currentTodos.length - remainingCount;

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
    selectedCategoryFilter,
    setSelectedCategoryFilter,
    selectedWorkspaceHabitPriorityFilter,
    setSelectedWorkspaceHabitPriorityFilter,
    effectiveSelectedDate,

    // Memos
    currentTodos,
    filteredTodos,
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