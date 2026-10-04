import { Palette } from "@/shared/constants/theme";
import { Task, Habit, Workspace, Resource, Checklist } from "@/shared/types/domain.types";
import { getTaskOccurrenceState, isTaskCompleted } from "@/shared/utils/domain-selectors";
import { dateKeyFromDate } from "@/shared/utils/date-key";
import { resolveResourceVisual } from "@/features/today/utils/resource-presentation";
import { getRecurrenceLabel } from "@/services/scheduling/recurrence.service";
import { formatReminderTime } from "@/services/scheduling/schedule-formatter";
const DAY_MS = 86_400_000;

export function getResourcePresentation(res: any) {
  const visual = resolveResourceVisual(res);
  const isImage = visual.category === "image" && Boolean(visual.thumbnailUri || res.mediaUri);

  if (isImage) {
    return {
      visual,
      isImage: true as const,
      imageUri: visual.thumbnailUri || res.mediaUri,
      title: "",
      domain: null,
      badge: null,
    };
  }

  if (visual.category === "link") {
    const raw = res.url || res.content || res.title || "";
    let domain: string | null = null;
    try {
      const match = String(raw).match(/^(?:https?:\/\/)?(?:www\.)?([^\/\?#]+)/i);
      if (match && match[1]) {
        domain = match[1];
      }
    } catch {
      // fallback
    }

    const rawTitle = res.title || "";
    const isTitleUrl =
      /^https?:\/\//i.test(rawTitle) ||
      /^www\./i.test(rawTitle) ||
      (domain && rawTitle.toLowerCase() === domain.toLowerCase());

    const displayTitle = isTitleUrl ? (domain || rawTitle || "Web Link") : rawTitle;

    return {
      visual,
      isImage: false as const,
      imageUri: null,
      title: displayTitle,
      domain: !isTitleUrl && domain ? domain : null,
      badge: null,
    };
  }

  if (visual.category === "pdf") {
    const rawTitle = (res.title || "Document").replace(/\.pdf$/i, "");
    return {
      visual,
      isImage: false as const,
      imageUri: null,
      title: rawTitle,
      domain: null,
      badge: "PDF",
    };
  }

  return {
    visual,
    isImage: false as const,
    imageUri: null,
    title: res.title || visual.label || "Note",
    domain: null,
    badge: null,
  };
}


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

export function formatTimeString(timeStr?: string): string | null {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  const ampm = h >= 12 ? "PM" : "AM";
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  const displayMinute = String(m).padStart(2, "0");
  return `${displayHour}:${displayMinute} ${ampm}`;
}

export function formatTimeRange(
  startTime?: string,
  endTime?: string,
  durationMinutes?: number
): string | null {
  const start = formatTimeString(startTime);
  if (!start) return null;

  let end: string | null = null;
  if (endTime && endTime !== startTime) {
    end = formatTimeString(endTime);
  } else if (durationMinutes && durationMinutes > 0) {
    const [h, m] = (startTime || "").split(":").map(Number);
    if (!isNaN(h) && !isNaN(m)) {
      const totalMinutes = h * 60 + m + durationMinutes;
      const endH = Math.floor(totalMinutes / 60) % 24;
      const endM = totalMinutes % 60;
      const endAmPm = endH >= 12 ? "PM" : "AM";
      const displayEndH = endH % 12 === 0 ? 12 : endH % 12;
      const displayEndM = String(endM).padStart(2, "0");
      end = `${displayEndH}:${displayEndM} ${endAmPm}`;
    }
  }

  if (end && end !== start) {
    // If both start and end share the same period (e.g. "2:00 PM" and "5:00 PM"),
    // compact to "2:00–5:00 PM" per the target metadata contract
    if (start.endsWith(" PM") && end.endsWith(" PM")) {
      return `${start.replace(" PM", "")}–${end}`;
    }
    if (start.endsWith(" AM") && end.endsWith(" AM")) {
      return `${start.replace(" AM", "")}–${end}`;
    }
    return `${start}–${end}`;
  }

  return start;
}

export function formatDurationMinutes(durationMinutes?: number): string | null {
  if (!durationMinutes || durationMinutes <= 0) return null;
  if (durationMinutes < 60) return `${durationMinutes}m`;
  const hrs = Math.floor(durationMinutes / 60);
  const rem = durationMinutes % 60;
  return rem === 0 ? `${hrs}h` : `${hrs}h ${rem}m`;
}

/**
 * Concise, scannable schedule date formatter for task metadata.
 * - Today: "Today"
 * - Tomorrow: "Tomorrow"
 * - Within 2-6 days: Short weekday (e.g. "Thu")
 * - 7+ days ahead: "Sep 11"
 * - 1 day ago: "Yesterday"
 * - 2+ days ago (overdue): "Sep 11"
 */
export function formatTaskScheduleDate(
  dateStr?: string,
  referenceDateStr?: string,
): { label: string; isOverdue?: boolean; daysDiff: number } | null {
  if (!dateStr || dateStr === "inbox") return null;

  const refKey = referenceDateStr || getDateKey();
  const [ry, rm, rd] = refKey.split("-").map(Number);
  const [dy, dm, dd] = dateStr.split("-").map(Number);
  if (!dy || !dm || !dd) return null;

  const refDate = new Date(ry, (rm || 1) - 1, rd || 1);
  const taskDate = new Date(dy, (dm || 1) - 1, dd || 1);
  const diffTime = taskDate.getTime() - refDate.getTime();
  const daysDiff = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (daysDiff === 0) {
    return { label: "Today", daysDiff: 0 };
  }
  if (daysDiff === 1) {
    return { label: "Tomorrow", daysDiff: 1 };
  }
  if (daysDiff >= 2 && daysDiff <= 6) {
    return { label: WEEKDAY_NAMES[taskDate.getDay()], daysDiff };
  }
  if (daysDiff === -1) {
    return { label: "Yesterday", isOverdue: true, daysDiff: -1 };
  }

  const monthName = MONTH_NAMES[taskDate.getMonth()];
  const dayNum = taskDate.getDate();
  const isPast = daysDiff < 0;
  return { label: `${monthName} ${dayNum}`, isOverdue: isPast, daysDiff };
}

export type TaskMetadataPartKey =
  | "category"
  | "overdue"
  | "recurrence"
  | "date"
  | "time"
  | "duration"
  | "reminder";

export type TaskMetadataIcon = "clock" | "calendar" | "repeat" | "bell";

export interface TaskMetadataPart {
  key: TaskMetadataPartKey;
  text: string;
  color?: string;
  isWarning?: boolean;
  icon?: TaskMetadataIcon;
}

export type TaskSectionContext =
  | "today"
  | "earlier"
  | "tomorrow"
  | "upcoming"
  | "someday"
  | "completed";

export interface TaskMetadataOptions {
  referenceDate?: string;
  sectionContext?: TaskSectionContext;
  isCompleted?: boolean;
  overdue?: boolean;
  omitOverdueLabel?: boolean;
  workspaceName?: string | null;
  colors?: {
    textMuted?: string;
    error?: string;
    [key: string]: any;
  };
}

/**
 * Deterministic metadata generator for TaskItem.
 * Ensures metadata is clean, quiet, informative, scannable, and free of redundant "metadata soup".
 */
export function getTaskMetadataParts(
  task: Task,
  options: TaskMetadataOptions = {}
): TaskMetadataPart[] {
  const parts: TaskMetadataPart[] = [];
  const textMuted = options.colors?.textMuted;
  const errorColor = options.colors?.error;

  // 1. Workspace context: only when viewing cross-workspace / requested by container
  if (options.workspaceName) {
    parts.push({
      key: "category",
      text: options.workspaceName,
      color: textMuted,
    });
  }

  const isCompleted = options.isCompleted ?? isTaskCompleted(task);
  const referenceDate = options.referenceDate || getDateKey();
  const scheduleDate = task.schedule?.date;
  const isInboxTask = !scheduleDate || scheduleDate === "inbox";
  const hasRecurrence = Boolean(task.recurrence);
  const durationMinutes = (task.schedule as any)?.durationMinutes;

  // Occurrence classification against reference date
  const occState = getTaskOccurrenceState(task, referenceDate);
  const isOverdue = !isCompleted && Boolean(options.overdue || occState.isOverdue);

  // 2. Overdue label: leading temporal state indicator
  // Suppress "Overdue" when in "earlier" section unless explicitly forced,
  // because the section header already establishes that all items are past carryovers.
  const isEarlierSection = options.sectionContext === "earlier";
  const shouldOmitOverdue =
    options.omitOverdueLabel !== undefined
      ? options.omitOverdueLabel
      : isEarlierSection;

  if (isOverdue && !shouldOmitOverdue) {
    parts.push({
      key: "overdue",
      text: "Overdue",
      color: errorColor,
    });
  }

  // 3. Date / Recurrence context
  if (hasRecurrence) {
    // Recurring tasks: NEVER present the base schedule date as current occurrence.
    const rawLabel = getRecurrenceLabel(task.recurrence);
    if (rawLabel) {
      const cleanLabel = rawLabel.replace(/[↻↻↻]/g, "").trim();
      parts.push({
        key: "recurrence",
        text: cleanLabel,
        color: textMuted,
        icon: "repeat",
      });
    }
  } else if (!isInboxTask) {
    // Scheduled non-recurring task
    const dateInfo = formatTaskScheduleDate(scheduleDate, referenceDate);
    if (dateInfo) {
      // Context-aware suppression:
      // When tasks are displayed within a section that already establishes the temporal context,
      // redundant date labels that duplicate the section header are omitted:
      // - Inside "today" section: suppress "Today"
      // - Inside "tomorrow" section: suppress "Tomorrow"
      // In "earlier", we keep the date (e.g. "Yesterday" or "Oct 1") because the section
      // label alone does not communicate the specific date.
      const isRedundantDate =
        (options.sectionContext === "today" && (dateInfo.label === "Today" || dateInfo.daysDiff === 0)) ||
        (options.sectionContext === "tomorrow" && (dateInfo.label === "Tomorrow" || dateInfo.daysDiff === 1));

      if (!isRedundantDate) {
        parts.push({
          key: "date",
          text: dateInfo.label,
          color: textMuted,
          icon: "calendar",
        });
      }
    }
  }

  // 4. Time / Time Range (if task has schedule startTime)
  const timeRange = formatTimeRange(
    task.schedule?.startTime,
    task.schedule?.endTime,
    durationMinutes
  );
  if (timeRange && (!isInboxTask || hasRecurrence)) {
    parts.push({
      key: "time",
      text: timeRange,
      color: textMuted,
      icon: "clock",
    });
  }

  // 5. Standalone Duration: ONLY if no startTime and duration exists
  if (durationMinutes && !task.schedule?.startTime) {
    const formattedDuration = formatDurationMinutes(durationMinutes);
    if (formattedDuration) {
      parts.push({
        key: "duration",
        text: formattedDuration,
        color: textMuted,
        icon: "clock",
      });
    }
  }

  // 6. Reminder: only if enabled, not completed, and not colliding with schedule start time
  if (task.reminder?.enabled && task.reminder?.triggerAt && !isCompleted) {
    const d = new Date(task.reminder.triggerAt);
    const reminderTime = formatReminderTime(d.getHours(), d.getMinutes());
    const scheduleStartTime = formatTimeString(task.schedule?.startTime);
    // Suppress reminder if it duplicates the schedule start time
    if (reminderTime && reminderTime !== scheduleStartTime) {
      parts.push({
        key: "reminder",
        text: reminderTime,
        color: textMuted,
        icon: "bell",
      });
    }
  }

  // 7. Enforce strict single-line budget (max 3 items) to prevent task row overflow:
  // If items exceed 3, drop lowest-priority secondary items (reminder first).
  if (parts.length > 3) {
    const reminderIdx = parts.findIndex((p) => p.key === "reminder");
    if (reminderIdx !== -1) {
      parts.splice(reminderIdx, 1);
    }
  }
  if (parts.length > 3) {
    parts.length = 3;
  }

  return parts;
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