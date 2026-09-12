import { parseTimeString, parseDurationMinutes } from "@/services/scheduling/scheduling.service";
import { formatReminderTime } from "@/services/scheduling/schedule-formatter";
import { isRecurringOccurrenceForDate } from "@/services/scheduling/recurrence.service";
import type {
  Checklist,
  Habit,
  Task,
  TaskPriority,
} from "@/shared/types/domain.types";
import {
  getChecklistStats,
  getChecklistOccurrenceStats,
  isChecklistCompletedForDate,
  isHabitCompletedToday,
  isTaskCompleted,
  isTaskOverdue,
  getHabitCurrentStreak,
} from "@/shared/utils/domain-selectors";
import { getTodayDateKey } from "@/shared/utils/date-key";

export type NowFocusState = "active" | "recommended" | "upcoming" | "empty";
export type NowFocusItemType = "task" | "habit" | "checklist";

export interface NowFocusResult {
  state: NowFocusState;
  type?: NowFocusItemType;
  item?: Task | Habit | Checklist;
  timeLabel?: string;
  contextLabel?: string;
  windowMinutes?: number;
  durationMinutes?: number;
  nextScheduledTime?: string;
}

export interface GetNowFocusOptions {
  now?: Date;
  referenceDateKey?: string;
  tasks: Task[];
  habits: Habit[];
  checklists: Checklist[];
  overdueTasks?: Task[];
}

interface ParsedCandidate {
  type: NowFocusItemType;
  item: Task | Habit | Checklist;
  id: string;
  title: string;
  priority: TaskPriority;
  priorityWeight: number; // 3: high, 2: medium, 1: low, 0: none
  isScheduled: boolean;
  startMinutes?: number; // 0..1439
  endMinutes?: number;
  durationMinutes: number;
  hasExplicitDuration: boolean;
  dueTimestamp?: number;
  streak?: number;
  checklistProgress?: {
    completedCount: number;
    totalCount: number;
  };
}

const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};

function formatMinutesToTime(minutes: number): string {
  const norm = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(norm / 60);
  const min = norm % 60;
  return formatReminderTime(hour, min) || "";
}

function formatTimeRange(startMinutes: number, endMinutes: number): string {
  const startStr = formatMinutesToTime(startMinutes);
  const endStr = formatMinutesToTime(endMinutes);
  return `${startStr} – ${endStr}`;
}

/**
 * Pure deterministic selector for Pebble's NOW focus layer.
 *
 * Implements the 4 conceptual states:
 * 1. ACTIVE NOW: Current time is within an incomplete scheduled activity's window.
 * 2. RECOMMENDED NOW: No active activity; candidate fits within available free time before next scheduled event.
 * 3. UPCOMING ("UP NEXT"): No active/recommended item; shows nearest upcoming scheduled activity.
 * 4. EMPTY: No active, recommended, or upcoming item ("Nothing needs your attention right now.").
 *
 * Guaranteed to be non-destructive: never mutates schedules, dates, or items.
 */
export function getNowFocus({
  now = new Date(),
  referenceDateKey,
  tasks = [],
  habits = [],
  checklists = [],
}: GetNowFocusOptions): NowFocusResult {
  const dateKey = referenceDateKey || getTodayDateKey();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const nowMinutes = currentHour * 60 + currentMinute;

  // ─────────────────────────────────────────────────────────────
  // 1. Filter out completed, archived, and overdue items
  // ─────────────────────────────────────────────────────────────

  // Tasks: non-completed, non-overdue, today or unscheduled
  const eligibleTasks = tasks.filter((task) => {
    if (task.archivedAt) return false;
    if (isTaskCompleted(task)) return false;
    if (isTaskOverdue(task, dateKey)) return false;
    // Scheduled for another date in the future?
    if (task.schedule?.date && task.schedule.date !== dateKey) return false;
    return true;
  });

  // Habits: non-archived, non-completed today, recurring today
  const eligibleHabits = habits.filter((habit) => {
    if (habit.archivedAt) return false;
    if (isHabitCompletedToday(habit, dateKey)) return false;
    if (habit.recurrence && !isRecurringOccurrenceForDate(habit, dateKey)) {
      return false;
    }
    if (habit.schedule?.date && habit.schedule.date !== dateKey) return false;
    return true;
  });

  // Checklists: non-archived, non-completed today
  const eligibleChecklists = checklists.filter((checklist) => {
    if (checklist.archivedAt) return false;
    if (isChecklistCompletedForDate(checklist, dateKey)) return false;
    if (
      checklist.recurrence &&
      !isRecurringOccurrenceForDate(checklist as any, dateKey)
    ) {
      return false;
    }
    if (
      checklist.schedule?.date &&
      checklist.schedule.date !== dateKey
    ) {
      return false;
    }
    return true;
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Parse candidates into unified model
  // ─────────────────────────────────────────────────────────────

  const parsedCandidates: ParsedCandidate[] = [];

  // Parse Tasks
  for (const task of eligibleTasks) {
    const priority = task.priority || "none";
    const startTimeParsed = parseTimeString(task.schedule?.startTime);
    const explicitDuration = parseDurationMinutes(
      task.schedule?.durationMinutes,
    );
    let duration = explicitDuration;
    let hasExplicitDuration = explicitDuration !== undefined;

    let startMinutes: number | undefined = undefined;
    let endMinutes: number | undefined = undefined;

    if (startTimeParsed) {
      startMinutes = startTimeParsed.hour * 60 + startTimeParsed.minute;
      if (!duration && task.schedule?.endTime) {
        const endTimeParsed = parseTimeString(task.schedule.endTime);
        if (endTimeParsed) {
          const diff =
            endTimeParsed.hour * 60 +
            endTimeParsed.minute -
            startMinutes;
          if (diff > 0) {
            duration = diff;
            hasExplicitDuration = true;
          }
        }
      }
      duration = duration || 30; // fallback duration for scheduled task without explicit duration
      endMinutes = startMinutes + duration;
    } else {
      duration = duration || 30; // default estimated duration for unscheduled task
    }

    let dueTimestamp: number | undefined = undefined;
    if (task.reminder?.triggerAt) {
      dueTimestamp = task.reminder.triggerAt;
    }

    parsedCandidates.push({
      type: "task",
      item: task,
      id: task.id,
      title: task.title,
      priority,
      priorityWeight: PRIORITY_WEIGHTS[priority] ?? 0,
      isScheduled: startMinutes !== undefined,
      startMinutes,
      endMinutes,
      durationMinutes: duration,
      hasExplicitDuration,
      dueTimestamp,
    });
  }

  // Parse Habits
  for (const habit of eligibleHabits) {
    const habitPriority: TaskPriority = (habit as any).priority || "none";
    const startTimeParsed = parseTimeString(habit.schedule?.startTime);
    const explicitDuration = parseDurationMinutes(
      habit.schedule?.durationMinutes,
    );
    let duration = explicitDuration;
    let hasExplicitDuration = explicitDuration !== undefined;

    let startMinutes: number | undefined = undefined;
    let endMinutes: number | undefined = undefined;

    if (startTimeParsed) {
      startMinutes = startTimeParsed.hour * 60 + startTimeParsed.minute;
      if (!duration && habit.schedule?.endTime) {
        const endTimeParsed = parseTimeString(habit.schedule.endTime);
        if (endTimeParsed) {
          const diff =
            endTimeParsed.hour * 60 +
            endTimeParsed.minute -
            startMinutes;
          if (diff > 0) {
            duration = diff;
            hasExplicitDuration = true;
          }
        }
      }
      duration = duration || 30;
      endMinutes = startMinutes + duration;
    } else {
      duration = duration || 30;
    }

    const streak = getHabitCurrentStreak(habit, dateKey);

    parsedCandidates.push({
      type: "habit",
      item: habit,
      id: habit.id,
      title: habit.title,
      priority: habitPriority,
      priorityWeight: PRIORITY_WEIGHTS[habitPriority] ?? 0,
      isScheduled: startMinutes !== undefined,
      startMinutes,
      endMinutes,
      durationMinutes: duration,
      hasExplicitDuration,
      streak,
    });
  }

  // Parse Checklists
  for (const checklist of eligibleChecklists) {
    const checklistPriority: TaskPriority =
      (checklist as any).priority || "none";
    const startTimeParsed = parseTimeString(checklist.schedule?.startTime);
    const explicitDuration = parseDurationMinutes(
      checklist.schedule?.durationMinutes,
    );
    let duration = explicitDuration;
    let hasExplicitDuration = explicitDuration !== undefined;

    let startMinutes: number | undefined = undefined;
    let endMinutes: number | undefined = undefined;

    if (startTimeParsed) {
      startMinutes = startTimeParsed.hour * 60 + startTimeParsed.minute;
      if (!duration && checklist.schedule?.endTime) {
        const endTimeParsed = parseTimeString(checklist.schedule.endTime);
        if (endTimeParsed) {
          const diff =
            endTimeParsed.hour * 60 +
            endTimeParsed.minute -
            startMinutes;
          if (diff > 0) {
            duration = diff;
            hasExplicitDuration = true;
          }
        }
      }
      duration = duration || 30;
      endMinutes = startMinutes + duration;
    } else {
      duration = duration || 30;
    }

    const stats = checklist.recurrence
      ? getChecklistOccurrenceStats(checklist, dateKey)
      : getChecklistStats(checklist);

    parsedCandidates.push({
      type: "checklist",
      item: checklist,
      id: checklist.id,
      title: checklist.title,
      priority: checklistPriority,
      priorityWeight: PRIORITY_WEIGHTS[checklistPriority] ?? 0,
      isScheduled: startMinutes !== undefined,
      startMinutes,
      endMinutes,
      durationMinutes: duration,
      hasExplicitDuration,
      checklistProgress: {
        completedCount: stats.completedCount,
        totalCount: stats.total,
      },
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 3. STEP 1: Check for ACTIVE scheduled activities
  // ─────────────────────────────────────────────────────────────

  const activeCandidates = parsedCandidates.filter(
    (c) =>
      c.isScheduled &&
      c.startMinutes !== undefined &&
      c.endMinutes !== undefined &&
      nowMinutes >= c.startMinutes &&
      nowMinutes < c.endMinutes,
  );

  if (activeCandidates.length > 0) {
    // Sort deterministically:
    // 1. Priority weight (descending: high > medium > low > none)
    // 2. Earliest start time (ascending)
    // 3. Stable ID tie-breaker
    activeCandidates.sort((a, b) => {
      if (b.priorityWeight !== a.priorityWeight) {
        return b.priorityWeight - a.priorityWeight;
      }
      if ((a.startMinutes ?? 0) !== (b.startMinutes ?? 0)) {
        return (a.startMinutes ?? 0) - (b.startMinutes ?? 0);
      }
      return a.id.localeCompare(b.id);
    });

    const active = activeCandidates[0];
    const timeLabel =
      active.startMinutes !== undefined && active.endMinutes !== undefined
        ? formatTimeRange(active.startMinutes, active.endMinutes)
        : undefined;

    return {
      state: "active",
      type: active.type,
      item: active.item,
      timeLabel,
      durationMinutes: active.durationMinutes,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 4. STEP 2: Reason about available free time window
  // ─────────────────────────────────────────────────────────────

  // Find upcoming scheduled candidates today (startMinutes > nowMinutes)
  const upcomingScheduled = parsedCandidates
    .filter((c) => c.isScheduled && c.startMinutes !== undefined && c.startMinutes > nowMinutes)
    .sort((a, b) => (a.startMinutes ?? 0) - (b.startMinutes ?? 0));

  const nextScheduled = upcomingScheduled[0];
  let availableWindowMinutes: number;

  if (nextScheduled && nextScheduled.startMinutes !== undefined) {
    availableWindowMinutes = nextScheduled.startMinutes - nowMinutes;
  } else {
    // No scheduled activity remaining today. Available window extends until end of day (e.g. 22:00 / 10 PM)
    const endOfDayMinutes = 22 * 60; // 10:00 PM
    availableWindowMinutes = Math.max(0, endOfDayMinutes - nowMinutes);
    // If it's already late night, provide at least a nominal window
    if (availableWindowMinutes <= 0) {
      availableWindowMinutes = 60;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 5. STEP 3: Recommend an unscheduled actionable item that fits
  // ─────────────────────────────────────────────────────────────

  // Candidates for recommendation: items that are unscheduled
  const recommendationCandidates = parsedCandidates.filter((c) => {
    // A scheduled item that is upcoming is part of the schedule, not an unscheduled recommendation
    if (c.isScheduled) return false;

    // Must fit within available free window
    if (c.hasExplicitDuration) {
      // Explicit duration MUST be <= available window
      return c.durationMinutes <= availableWindowMinutes;
    } else {
      // Unspecified duration requires available window to be at least candidate default (30m)
      // or at least 15m for quick actions if window is tight
      return availableWindowMinutes >= Math.min(30, c.durationMinutes);
    }
  });

  if (recommendationCandidates.length > 0) {
    // Deterministic ranking:
    // 1. Priority (high > medium > low > none)
    // 2. Due time proximity (tasks with earlier dueTimestamp or reminder)
    // 3. Fits window well (duration closer to window)
    // 4. Stable ID tie-breaker
    recommendationCandidates.sort((a, b) => {
      // 1. Priority
      if (b.priorityWeight !== a.priorityWeight) {
        return b.priorityWeight - a.priorityWeight;
      }

      // 2. Due proximity
      if (a.dueTimestamp && b.dueTimestamp) {
        if (a.dueTimestamp !== b.dueTimestamp) {
          return a.dueTimestamp - b.dueTimestamp;
        }
      } else if (a.dueTimestamp && !b.dueTimestamp) {
        return -1;
      } else if (!a.dueTimestamp && b.dueTimestamp) {
        return 1;
      }

      // 3. Duration fit (prefers candidate that fits comfortably)
      if (b.durationMinutes !== a.durationMinutes) {
        return b.durationMinutes - a.durationMinutes;
      }

      // 4. Stable ID
      return a.id.localeCompare(b.id);
    });

    const recommended = recommendationCandidates[0];
    const durationStr = `~${recommended.durationMinutes} min`;

    let contextLabel: string;
    if (availableWindowMinutes >= 60) {
      const hours = Math.round((availableWindowMinutes / 60) * 10) / 10;
      contextLabel = `${durationStr} · Fits ${hours}h free time`;
    } else {
      contextLabel = `${durationStr} · Fits ${availableWindowMinutes}m free time`;
    }

    return {
      state: "recommended",
      type: recommended.type,
      item: recommended.item,
      contextLabel,
      windowMinutes: availableWindowMinutes,
      durationMinutes: recommended.durationMinutes,
      nextScheduledTime:
        nextScheduled && nextScheduled.startMinutes !== undefined
          ? formatMinutesToTime(nextScheduled.startMinutes)
          : undefined,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 6. STEP 4: UPCOMING ("UP NEXT")
  // ─────────────────────────────────────────────────────────────

  if (nextScheduled && nextScheduled.startMinutes !== undefined) {
    const timeLabel = formatMinutesToTime(nextScheduled.startMinutes);
    return {
      state: "upcoming",
      type: nextScheduled.type,
      item: nextScheduled.item,
      timeLabel: `Starts at ${timeLabel}`,
      durationMinutes: nextScheduled.durationMinutes,
      windowMinutes: availableWindowMinutes,
      nextScheduledTime: timeLabel,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 7. STEP 5: Calm empty state
  // ─────────────────────────────────────────────────────────────

  return {
    state: "empty",
  };
}
