import type { Task, Habit, Checklist, RecurrenceRule } from "@/shared/types/domain.types";
import { isRecurringOccurrenceForDate } from "@/services/scheduling/recurrence.service";
import {
  dateKeyFromDate,
  getOffsetDateKey,
  getTodayDateKey,
} from "@/shared/utils/date-key";

// Canonical date-key helpers live in @/shared/utils/date-key; re-export for
// backward compatibility with existing importers of this module.
export { getOffsetDateKey, getTodayDateKey };

/**
 * Task Derived Selectors
 */
export function isTaskCompleted(task: Task): boolean {
  return task.status === "completed";
}

/**
 * Read the raw schedule date key of a task, tolerating the legacy
 * canonical `schedule.date` migration.
 */
function getScheduleDateKey(task: Task): string | undefined {
  return task.schedule?.date;
}

/**
 * Authoritative per-date classification for a task.
 *
 * Every surface that buckets tasks (Tasks screen, Today dashboard, calendar
 * and drawers) must consume this single path so one-off and recurring tasks
 * cannot drift apart.
 *
 * Completion semantics: Pebble models task completion globally via
 * `status === "completed"`. There is no per-occurrence completion record for
 * recurring tasks, so an individually missed occurrence cannot be told apart
 * from a series that simply continues. Recurring tasks are therefore NEVER
 * flagged `isOverdue` — they surface again on their next occurrence instead.
 * This is a documented model limitation, not a recurrence computation choice.
 */
export interface TaskOccurrenceState {
  /** Whether the task has an occurrence on `dateKey` (completion-independent). */
  occurs: boolean;
  /** Next occurrence date strictly after `dateKey`, or null when none exists (completion-independent). */
  nextOccurrenceDate: string | null;
  /** Occurrence is due on `dateKey` and the task is not completed. */
  isToday: boolean;
  /** One-off task scheduled before `dateKey` and not completed. Recurring tasks are never overdue. */
  isOverdue: boolean;
  /** No occurrence on `dateKey` but a future one exists after it, and the task is not completed. */
  isUpcoming: boolean;
  /** Global completion state of the task (occurrence-specific completion is not modeled). */
  isCompleted: boolean;
  /** Effective date key the task is anchored to for display purposes. */
  occurrenceDate: string;
}

/**
 * Classify a single task against a reference date (YYYY-MM-DD).
 *
 * - Non-recurring tasks are classified purely by their schedule date.
 * - Recurring tasks are classified by the recurrence rule (reused from
 *   `isRecurringOccurrenceForDate`); their base `schedule.date` is only the
 *   series start date and must never be treated as the current occurrence.
 */
export function getTaskOccurrenceState(
  task: Task,
  dateKey: string,
): TaskOccurrenceState {
  const isCompleted = isTaskCompleted(task);
  const scheduleDate = getScheduleDateKey(task);
  const hasRecurrence = !!task.recurrence;

  const occurs = hasRecurrence
    ? isRecurringOccurrenceForDate(task, dateKey)
    : !!scheduleDate && scheduleDate !== "inbox" && scheduleDate === dateKey;

  const nextOccurrenceDate = hasRecurrence
    ? getNextOccurrenceDateKey(task, dateKey)
    : !!scheduleDate && scheduleDate !== "inbox" && scheduleDate > dateKey
      ? scheduleDate
      : null;

  return {
    occurs,
    nextOccurrenceDate,
    isToday: occurs && !isCompleted,
    isOverdue:
      !isCompleted &&
      !hasRecurrence &&
      !!scheduleDate &&
      scheduleDate !== "inbox" &&
      scheduleDate < dateKey,
    // Bucket selector semantics: today and upcoming are mutually exclusive.
    isUpcoming: !isCompleted && !occurs && nextOccurrenceDate !== null,
    isCompleted,
    occurrenceDate: scheduleDate || getTodayDateKey(),
  };
}

export function isTaskOverdue(task: Task, referenceDateKey?: string): boolean {
  const todayKey = referenceDateKey || getTodayDateKey();
  return getTaskOccurrenceState(task, todayKey).isOverdue;
}

export function isTaskDueToday(task: Task, referenceDateKey?: string): boolean {
  const todayKey = referenceDateKey || getTodayDateKey();
  return getTaskOccurrenceState(task, todayKey).isToday;
}

/**
 * Find the next occurrence date strictly after `dateKey` for a recurring task.
 *
 * Reuses `isRecurringOccurrenceForDate` (the single recurrence matcher) with a
 * frequency-aware scan bound, so the result can never contradict the matcher.
 */
function getNextOccurrenceDateKey(task: Task, dateKey: string): string | null {
  const recurrence = task.recurrence;
  if (!recurrence) return null;

  const startDayKey = getScheduleDateKey(task) || (task.createdAt ? getDateKeyFromEpoch(task.createdAt) : undefined);

  // The recurrence start date is an occurrence of itself in every normal
  // configuration, so if it lies after the reference date it is the next
  // occurrence. Verify through the matcher anyway to stay safe with
  // misaligned weekly day lists.
  if (
    startDayKey &&
    startDayKey > dateKey &&
    isRecurringOccurrenceForDate(task, startDayKey)
  ) {
    return startDayKey;
  }

  const bound = getOccurrenceScanBound(recurrence);
  for (let offset = 1; offset <= bound; offset++) {
    // getOffsetDateKey subtracts; a negative offset yields the future date.
    const candidate = getOffsetDateKey(-offset, dateKey);
    if (isRecurringOccurrenceForDate(task, candidate)) return candidate;
  }
  return null;
}

/**
 * Maximum day offset to scan for a next occurrence per recurrence shape.
 * Chosen so the first future match is always found while keeping the scan cheap.
 */
function getOccurrenceScanBound(recurrence: RecurrenceRule): number {
  const freq: string = recurrence.frequency || (recurrence as RecurrenceRule & { type?: string }).type || "daily";
  const interval = recurrence.interval || 1;
  switch (freq) {
    case "daily":
      return 1;
    case "weekdays":
      return 3; // Friday → Monday gap
    case "weekly":
      return 8;
    case "monthly":
      // Worst gap: a 31st-of-month occurrence followed by a 30-day month,
      // e.g. Aug 31 → Oct 31 (61 days). 63 covers it with margin.
      return 63;
    case "yearly":
      return 366 * interval + 1;
    case "interval":
    case "custom": {
      const unit = recurrence.unit || "days";
      return unit === "hours" ? 1 : interval + 1;
    }
    default:
      return 370;
  }
}

function getDateKeyFromEpoch(epochMs: number): string {
  return dateKeyFromDate(new Date(epochMs));
}

export function isTaskScheduled(task: Task): boolean {
  return !!(task.schedule?.date || task.schedule?.startTime);
}

export function hasTaskReminder(task: Task): boolean {
  return !!(task.reminder && task.reminder.enabled && task.reminder.triggerAt);
}

/**
 * Habit Derived Selectors
 */
export function isHabitCompletedToday(habit: Habit, referenceDateKey?: string): boolean {
  const todayKey = referenceDateKey || getTodayDateKey();
  return habit.completionHistory.some((entry) => entry.date === todayKey);
}

export function getHabitLastCompletedDate(habit: Habit): string | undefined {
  if (!habit.completionHistory || habit.completionHistory.length === 0) return undefined;
  const dates = habit.completionHistory.map((c) => c.date).sort();
  return dates[dates.length - 1];
}

export function getHabitCurrentStreak(habit: Habit, referenceDateKey?: string): number {
  if (!habit.completionHistory || habit.completionHistory.length === 0) return 0;
  
  const completedDates = new Set(habit.completionHistory.map((c) => c.date));
  const today = referenceDateKey || getTodayDateKey();
  const yesterday = getOffsetDateKey(1, today);

  let streak = 0;
  let checkOffset = 0;

  if (completedDates.has(today)) {
    streak = 1;
    checkOffset = 1;
    while (true) {
      const key = getOffsetDateKey(checkOffset, today);
      if (completedDates.has(key)) {
        streak++;
        checkOffset++;
      } else {
        break;
      }
    }
  } else if (completedDates.has(yesterday)) {
    streak = 1;
    checkOffset = 2;
    while (true) {
      const key = getOffsetDateKey(checkOffset, today);
      if (completedDates.has(key)) {
        streak++;
        checkOffset++;
      } else {
        break;
      }
    }
  }

  return streak;
}

export function getHabitBestStreak(habit: Habit): number {
  if (!habit.completionHistory || habit.completionHistory.length === 0) return 0;

  const completedDates = Array.from(
    new Set(habit.completionHistory.map((c) => c.date))
  ).sort();

  if (completedDates.length === 0) return 0;

  let maxStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < completedDates.length; i++) {
    const prevDate = new Date(completedDates[i - 1]);
    const currDate = new Date(completedDates[i]);
    const diffTime = currDate.getTime() - prevDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      currentStreak++;
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak;
      }
    } else if (diffDays > 1) {
      currentStreak = 1;
    }
  }

  return Math.max(maxStreak, getHabitCurrentStreak(habit));
}

export function getHabitCompletionRate(habit: Habit, windowDays: number = 30): number {
  if (!habit.completionHistory || habit.completionHistory.length === 0) return 0;
  const today = getTodayDateKey();
  let completedCount = 0;

  for (let i = 0; i < windowDays; i++) {
    const dateKey = getOffsetDateKey(i, today);
    if (habit.completionHistory.some((c) => c.date === dateKey)) {
      completedCount++;
    }
  }

  return Math.round((completedCount / windowDays) * 100);
}

/**
 * Checklist Derived Selectors
 */
export function getChecklistStats(checklist: Checklist) {
  const total = checklist.items ? checklist.items.length : 0;
  const completedCount = checklist.items
    ? checklist.items.filter((item) => item.completed).length
    : 0;
  const remainingCount = total - completedCount;
  const completionPercentage =
    total > 0 ? Math.round((completedCount / total) * 100) : 0;

  return {
    total,
    completedCount,
    remainingCount,
    completionPercentage,
  };
}

