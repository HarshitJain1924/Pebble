import { useState, useMemo } from "react";
import { Todo, Habit, TaskList } from "../../types";
import { DAY_MS } from "@/services/storage";
import { isRecurringOccurrenceForDate, getRecurrenceLabel, parseDateKey } from "@/services/recurrence";
import { TaskCategory } from "@/services/taskCategories";
import { getDateKey, getPriorityWeight, getTodoDateKey, isOverdue, WEEKDAY_NAMES } from "../utils/taskUtils";

export function useTaskFiltering(
  todos: Record<string, Todo[]>,
  habits: Habit[],
  lists: TaskList[],
  selectedList: string,
) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedListPriorityFilter, setSelectedListPriorityFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<TaskCategory | "all">("all");
  const [selectedListHabitPriorityFilter, setSelectedListHabitPriorityFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [selectedDate, setSelectedDate] = useState<string>(getDateKey());

  // 14-Day Scrollable Week Strip
  const weekDaysStrip = useMemo(() => {
    const list = [];
    const today = new Date();
    for (let i = -3; i <= 10; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      list.push({
        dateString: getDateKey(d),
        dayNum: String(d.getDate()).padStart(2, "0"),
        dayName: WEEKDAY_NAMES[d.getDay()],
        isToday: getDateKey(d) === getDateKey(today),
      });
    }
    return list;
  }, []);

  const formatSelectedDayName = useMemo(() => {
    const today = getDateKey();
    if (selectedDate === today) return "Today";
    const tomorrow = getDateKey(new Date(Date.now() + DAY_MS));
    if (selectedDate === tomorrow) return "Tomorrow";
    try {
      const parsed = parseDateKey(selectedDate);
      return parsed.toLocaleDateString([], {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  const currentTodos = useMemo(
    () => (todos[selectedList] ?? []).filter((t) => !t.archived),
    [todos, selectedList]
  );

  const filteredTodos = useMemo(() => {
    const raw = (todos[selectedList] ?? []).filter((t) => !t.archived);
    if (searchQuery.trim() === "") return raw;
    return raw.filter((todo) => {
      const matchesTitle = todo.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDesc = todo.description?.toLowerCase().includes(searchQuery.toLowerCase()) || false;
      const matchesCategory = todo.category?.toLowerCase().includes(searchQuery.toLowerCase()) || false;
      const wsName = lists.find((l) => l.id === todo.folderId)?.name || "";
      const matchesWorkspace = wsName.toLowerCase().includes(searchQuery.toLowerCase());
      const recLabel = getRecurrenceLabel(todo.recurrence) || "";
      const matchesRecurrence = recLabel.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTitle || matchesDesc || matchesCategory || matchesWorkspace || matchesRecurrence;
    });
  }, [todos, selectedList, searchQuery, lists]);

  const overdueTodos = useMemo(() => {
    let filtered = filteredTodos.filter((todo) => todo.scheduledDate !== "inbox" && isOverdue(todo, selectedDate));
    if (selectedCategoryFilter !== "all") {
      filtered = filtered.filter((todo) => todo.category === selectedCategoryFilter);
    }
    const matched =
      selectedListPriorityFilter === "all"
        ? filtered
        : filtered.filter((todo) => todo.priority === selectedListPriorityFilter);
    return [...matched].sort((a, b) => getPriorityWeight(a.priority) - getPriorityWeight(b.priority));
  }, [filteredTodos, selectedListPriorityFilter, selectedCategoryFilter, selectedDate]);

  const todayTodos = useMemo(() => {
    let filtered = filteredTodos.filter((todo) => {
      if (todo.scheduledDate === "inbox") return false;
      if (isOverdue(todo, selectedDate)) return false;
      return isRecurringOccurrenceForDate(todo, selectedDate);
    });
    if (selectedCategoryFilter !== "all") {
      filtered = filtered.filter((todo) => todo.category === selectedCategoryFilter);
    }
    const matched =
      selectedListPriorityFilter === "all"
        ? filtered
        : filtered.filter((todo) => todo.priority === selectedListPriorityFilter);
    return [...matched].sort((a, b) => getPriorityWeight(a.priority) - getPriorityWeight(b.priority));
  }, [filteredTodos, selectedListPriorityFilter, selectedCategoryFilter, selectedDate]);

  const upcomingTodos = useMemo(() => {
    let filtered = filteredTodos.filter(
      (todo) => todo.scheduledDate !== "inbox" && !isOverdue(todo, selectedDate) && getTodoDateKey(todo) > selectedDate
    );
    if (selectedCategoryFilter !== "all") {
      filtered = filtered.filter((todo) => todo.category === selectedCategoryFilter);
    }
    const matched =
      selectedListPriorityFilter === "all"
        ? filtered
        : filtered.filter((todo) => todo.priority === selectedListPriorityFilter);
    return [...matched].sort((a, b) => getPriorityWeight(a.priority) - getPriorityWeight(b.priority));
  }, [filteredTodos, selectedListPriorityFilter, selectedCategoryFilter, selectedDate]);

  const inboxTodos = useMemo(() => {
    let filtered = filteredTodos.filter((todo) => todo.scheduledDate === "inbox");
    if (selectedCategoryFilter !== "all") {
      filtered = filtered.filter((todo) => todo.category === selectedCategoryFilter);
    }
    const matched =
      selectedListPriorityFilter === "all"
        ? filtered
        : filtered.filter((todo) => todo.priority === selectedListPriorityFilter);
    return [...matched].sort((a, b) => getPriorityWeight(a.priority) - getPriorityWeight(b.priority));
  }, [filteredTodos, selectedListPriorityFilter, selectedCategoryFilter]);

  const remainingCount = useMemo(() => currentTodos.filter((todo) => !todo.completed).length, [currentTodos]);
  const completedCount = currentTodos.length - remainingCount;

  // Habit Memos
  const unfinishedHabitCount = useMemo(() => habits.filter((habit) => !habit.completedToday).length, [habits]);

  const displayedHabits = useMemo(() => {
    const dateParts = selectedDate.split("-").map(Number);
    const selDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    const dayOfWeek = selDate.getDay();

    const activeHabits = habits.filter((habit) => {
      if ((habit.folderId || "default") !== selectedList) {
        return false;
      }
      if (habit.archived) {
        return false;
      }
      if (habit.recurrence) {
        return isRecurringOccurrenceForDate(habit, selectedDate);
      }
      const hasReminderDaysMatch = (
        !habit.reminderDays ||
        habit.reminderDays.length === 0 ||
        habit.reminderDays.includes(dayOfWeek)
      );
      return hasReminderDaysMatch;
    });

    const filtered =
      selectedListHabitPriorityFilter === "all"
        ? activeHabits
        : activeHabits.filter((habit) => habit.priority === selectedListHabitPriorityFilter);

    const searchFiltered =
      searchQuery.trim() === ""
        ? filtered
        : filtered.filter((h) => {
            const matchesTitle = h.title.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesDesc = h.description?.toLowerCase().includes(searchQuery.toLowerCase()) || false;
            const matchesCategory = h.category?.toLowerCase().includes(searchQuery.toLowerCase()) || false;
            const wsName = lists.find((l) => l.id === h.folderId)?.name || "";
            const matchesWorkspace = wsName.toLowerCase().includes(searchQuery.toLowerCase());
            const recLabel = getRecurrenceLabel(h.recurrence) || "";
            const matchesRecurrence = recLabel.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesTitle || matchesDesc || matchesCategory || matchesWorkspace || matchesRecurrence;
          });

    return [...searchFiltered].sort((a, b) => getPriorityWeight(a.priority) - getPriorityWeight(b.priority));
  }, [habits, selectedListHabitPriorityFilter, selectedDate, searchQuery, lists, selectedList]);

  const completedHabitCount = habits.length - unfinishedHabitCount;
  const habitCompletionPct = habits.length === 0 ? 0 : completedHabitCount / habits.length;
  const longestStreak = useMemo(() => habits.reduce((max, habit) => Math.max(max, habit.bestStreak || 0), 0), [habits]);

  return {
    // State
    searchQuery,
    setSearchQuery,
    selectedListPriorityFilter,
    setSelectedListPriorityFilter,
    selectedCategoryFilter,
    setSelectedCategoryFilter,
    selectedListHabitPriorityFilter,
    setSelectedListHabitPriorityFilter,
    selectedDate,
    setSelectedDate,

    // Derived values
    weekDaysStrip,
    formatSelectedDayName,
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