import { Task, Habit, Workspace, Resource, Checklist } from "@/shared/types/domain.types";
import { isTaskCompleted } from "@/shared/utils/domain-selectors";
import { DAY_MS } from "@/services/storage/storage.service";

export const getDateKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const getListColors = (name: string, isSelected: boolean) => {
  const lowercase = name.toLowerCase();
  let bg = isSelected ? "#dbeafe" : "rgba(59, 130, 246, 0.08)";
  let text = isSelected ? "#1e3a8a" : "#3B82F6";
  let icon: any = "list";

  if (lowercase.includes("work")) {
    bg = isSelected ? "#dbeafe" : "rgba(59, 130, 246, 0.08)";
    text = isSelected ? "#1e3a8a" : "#3B82F6";
    icon = "briefcase";
  } else if (lowercase.includes("personal") || lowercase.includes("garden")) {
    bg = isSelected ? "#d1fae5" : "rgba(16, 185, 129, 0.08)";
    text = isSelected ? "#064e3b" : "#10B981";
    icon = "user";
  } else if (lowercase.includes("habit")) {
    bg = isSelected ? "#ffedd5" : "rgba(245, 158, 11, 0.08)";
    text = isSelected ? "#7c2d12" : "#F59E0B";
    icon = "activity";
  } else if (lowercase.includes("focus")) {
    bg = isSelected ? "#f3e8ff" : "rgba(168, 85, 247, 0.08)";
    text = isSelected ? "#581c87" : "#A855F7";
    icon = "clock";
  } else {
    bg = isSelected ? "#f1f5f9" : "rgba(100, 116, 139, 0.08)";
    text = isSelected ? "#334155" : "#64748B";
    icon = "grid";
  }

  return { bg, text, icon };
};

export const getPriorityWeight = (priority?: string) => {
  if (priority === "high") return 0;
  if (priority === "low") return 2;
  return 1;
};

export const getTodoDateKey = (todo: Task) => {
  if (todo.schedule?.date) {
    return todo.schedule.date;
  }
  if (todo.reminder?.triggerAt) {
    return getDateKey(new Date(todo.reminder.triggerAt));
  }
  const idNum = Number(todo.id);
  if (!isNaN(idNum) && idNum > 100000000000) {
    return getDateKey(new Date(idNum));
  }
  return getDateKey();
};

export const isOverdue = (todo: Task, selectedDate: string) => {
  if (isTaskCompleted(todo)) return false;
  const todoDate = getTodoDateKey(todo);
  return todoDate < selectedDate;
};

export const formatAlarm = (ms?: number) => {
  if (!ms) return null;
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export const getSelectedDateLabel = (selectedDate: string) => {
  if (selectedDate === "inbox") return "Inbox";
  const today = getDateKey();
  if (selectedDate === today) return "Today";
  const tomorrow = getDateKey(new Date(Date.now() + DAY_MS));
  if (selectedDate === tomorrow) return "Tomorrow";
  const nextWeek = getDateKey(new Date(Date.now() + 7 * DAY_MS));
  if (selectedDate === nextWeek) return "Next Week";
  return selectedDate;
};

export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const initialTodos: Task[] = [];

// Global in-memory cache to keep tab states warm on switch and prevent 1s counts flashing
export let globalLists: Workspace[] | null = null;
export let globalTodos: Record<string, Task[]> | null = null;
export let globalHabits: Habit[] | null = null;
export let globalResources: Record<string, Resource[]> | null = null;
export let globalChecklists: Record<string, Checklist[]> | null = null;

export function setGlobalLists(val: Workspace[] | null) { globalLists = val; }
export function setGlobalTodos(val: Record<string, Task[]> | null) { globalTodos = val; }
export function setGlobalHabits(val: Habit[] | null) { globalHabits = val; }
export function setGlobalResources(val: Record<string, Resource[]> | null) { globalResources = val; }
export function setGlobalChecklists(val: Record<string, Checklist[]> | null) { globalChecklists = val; }