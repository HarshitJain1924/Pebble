import { Palette } from "@/shared/constants/theme";
import { Task, Habit, Workspace, Resource, Checklist } from "@/shared/types/domain.types";
import { getTaskOccurrenceState } from "@/shared/utils/domain-selectors";
import { dateKeyFromDate } from "@/shared/utils/date-key";
const DAY_MS = 86_400_000;

// Public API preserved for the many callers of this module; implementation
// delegates to the canonical date-key helper (local YYYY-MM-DD).
export const getDateKey = (date = new Date()) => dateKeyFromDate(date);

export const getListColors = (name: string, isSelected: boolean) => {
  const lowercase = name.toLowerCase();
  let bg = isSelected ? Palette.blue100 : "rgba(59, 130, 246, 0.08)";
  let text = isSelected ? Palette.blue800 : Palette.blue500;
  let icon: any = "list";

  if (lowercase.includes("work")) {
    bg = isSelected ? Palette.blue100 : "rgba(59, 130, 246, 0.08)";
    text = isSelected ? Palette.blue800 : Palette.blue500;
    icon = "briefcase";
  } else if (lowercase.includes("personal") || lowercase.includes("garden")) {
    bg = isSelected ? Palette.emerald100 : "rgba(16, 185, 129, 0.08)";
    text = isSelected ? Palette.emerald900 : Palette.emerald500;
    icon = "user";
  } else if (lowercase.includes("habit")) {
    bg = isSelected ? Palette.orange100 : "rgba(245, 158, 11, 0.08)";
    text = isSelected ? Palette.orange900 : Palette.amber500;
    icon = "activity";
  } else if (lowercase.includes("focus")) {
    bg = isSelected ? Palette.violet50 : "rgba(168, 85, 247, 0.08)";
    text = isSelected ? Palette.violet800 : Palette.violet500;
    icon = "clock";
  } else {
    bg = isSelected ? Palette.slate100 : "rgba(100, 116, 139, 0.08)";
    text = isSelected ? Palette.slate700 : Palette.slate500;
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
  // Delegates to the authoritative occurrence classification so recurring
  // tasks are never marked overdue merely because their base date is past.
  return getTaskOccurrenceState(todo, selectedDate).isOverdue;
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
export const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

/**
 * Relative date formatter for tasks in Earlier / backlog.
 * Returns human-friendly relative date and whether it escalates to warning (3+ days old).
 * - 1 day ago: "Yesterday" (muted)
 * - 2 days ago: "2d ago" (muted)
 * - 3-6 days ago: "3d ago", ... (warning)
 * - 7+ days ago: "Sep 11" (warning)
 */
export function formatRelativeTaskDate(
  dateStr?: string,
  referenceDateStr?: string,
): { label: string; isWarning: boolean; daysAgo: number } | null {
  if (!dateStr || dateStr === "inbox") return null;

  const [ry, rm, rd] = (referenceDateStr || getDateKey()).split("-").map(Number);
  const [dy, dm, dd] = dateStr.split("-").map(Number);
  if (!dy || !dm || !dd) return null;

  const refDate = new Date(ry, (rm || 1) - 1, rd || 1);
  const taskDate = new Date(dy, (dm || 1) - 1, dd || 1);
  const diffTime = refDate.getTime() - taskDate.getTime();
  const daysAgo = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (daysAgo <= 0) {
    return { label: "Today", isWarning: false, daysAgo };
  }
  if (daysAgo === 1) {
    return { label: "Yesterday", isWarning: false, daysAgo: 1 };
  }
  if (daysAgo >= 2 && daysAgo < 7) {
    return { label: `${daysAgo}d ago`, isWarning: daysAgo >= 3, daysAgo };
  }

  const monthName = MONTH_NAMES[taskDate.getMonth()];
  const dayNum = taskDate.getDate();
  return { label: `${monthName} ${dayNum}`, isWarning: true, daysAgo };
}

export interface TaskSectionCounts {
  today: number;
  earlier: number;
  upcoming?: number;
  someday: number;
}

/**
 * Subtitle breakdown consistent with task sections (e.g. "2 today · 5 earlier · 1 someday").
 * Omits zero-count sections.
 */
export function getTasksSubtitleBreakdown(counts: TaskSectionCounts): string {
  const parts: string[] = [];
  if (counts.today > 0) parts.push(`${counts.today} today`);
  if (counts.earlier > 0) parts.push(`${counts.earlier} earlier`);
  if (counts.upcoming && counts.upcoming > 0) parts.push(`${counts.upcoming} upcoming`);
  if (counts.someday > 0) parts.push(`${counts.someday} someday`);
  return parts.length > 0 ? parts.join(" · ") : "No tasks";
}

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