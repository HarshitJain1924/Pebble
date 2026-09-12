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
  getNextIncompleteChecklistItem,
  isChecklistCompletedForDate,
  isHabitCompletedToday,
  isTaskCompleted,
  isTaskOverdue,
  getHabitCurrentStreak,
} from "@/shared/utils/domain-selectors";
import { dateKeyFromDate } from "@/shared/utils/date-key";

export type NowFocusState = "active" | "recommended" | "upcoming" | "empty";
export type NowFocusItemType = "task" | "habit" | "checklist";

/**
 * Occurrence-aware checklist execution state for the NOW surface.
 * Present only when the focus item is a Checklist.
 */
export interface NowChecklistState {
  completedCount: number;
  total: number;
  /** Next actionable item in canonical checklist order, or null when fully complete. */
  nextItem: { id: string; title: string } | null;
}

export type NowFocusResult =
  | {
      state: "empty";
      type?: undefined;
      item?: undefined;
      timeLabel?: undefined;
      contextLabel?: undefined;
      windowMinutes?: undefined;
      durationMinutes?: undefined;
      nextScheduledTime?: undefined;
      checklistState?: undefined;
    }
  | {
      state: "active" | "recommended" | "upcoming";
      type: NowFocusItemType;
      item: Task | Habit | Checklist;
      timeLabel?: string;
      contextLabel?: string;
      windowMinutes?: number;
      durationMinutes?: number;
      nextScheduledTime?: string;
      /** Checklist-only: occurrence-aware progress + next actionable item. */
      checklistState?: NowChecklistState;
    };

export interface GetNowFocusOptions {
  /**
   * Reference point in time to evaluate NOW for.
   * Required for deterministic time reactivity.
   */
  now?: Date;

  /**
   * Optional reference date key (YYYY-MM-DD).
   * If omitted, derived directly from the provided `now` parameter.
   */
  referenceDateKey?: string;

  /** Today's tasks (completed & overdue items are automatically filtered out). */
  tasks: Task[];

  /** Today's habits. */
  habits: Habit[];

  /** Today's active checklists. */
  checklists: Checklist[];

  /** Optional overdue tasks list for safety / testing (overdue items are excluded from NOW). */
  overdueTasks?: Task[];

  /**
   * Optional policy for day boundary in minutes from midnight (e.g. 1440 for midnight).
   * When omitted and no upcoming scheduled activities exist today, the schedule is treated
   * as open/unconstrained rather than making an arbitrary bedtime assumption (e.g. 10 PM).
   */
  dayBoundaryMinutes?: number;
}

export interface ParsedSchedule {
  isScheduled: boolean;
  startMinutes?: number; // 0..1439
  endMinutes?: number;
  durationMinutes: number;
  hasExplicitDuration: boolean;
  dueMinutes?: number; // minutes from midnight when an explicit deadline/due time exists
  dueDateKey?: string; // YYYY-MM-DD
}

interface ParsedCandidate {
  type: NowFocusItemType;
  item: Task | Habit | Checklist;
  id: string;
  title: string;
  priority: TaskPriority;
  priorityWeight: number; // 3: high, 2: medium, 1: low, 0: none
  isScheduled: boolean;
  startMinutes?: number;
  endMinutes?: number;
  durationMinutes: number;
  hasExplicitDuration: boolean;
  dueMinutes?: number;
  dueDateKey?: string;
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
 * Parses scheduling and due-time information uniformly across Tasks, Habits, and Checklists.
 *
 * NOTE ON PEBBLE DUE-TIME SEMANTICS:
 * Pebble's Task model contains `schedule?: TaskSchedule` with `date`, `startTime`, `endTime`,
 * and `durationMinutes`. It also contains `reminder?: Reminder` with `triggerAt`.
 *
 * A reminder time (`reminder.triggerAt`) is an OS notification alert trigger, NOT the due time.
 * The true due / target time of day is:
 * 1. An explicit `dueTime` field (if present on the item or schedule), OR
 * 2. `schedule.endTime` (an explicit deadline), OR
 * 3. `schedule.startTime` (scheduled target time of day).
 *
 * `reminder.triggerAt` is intentionally NEVER treated as the due time.
 */
export function parseItemSchedule(
  item: Task | Habit | Checklist,
  defaultDuration = 30,
): ParsedSchedule {
  const schedule = item.schedule;
  const startTimeParsed = parseTimeString(schedule?.startTime);
  const endTimeParsed = parseTimeString(schedule?.endTime);
  const explicitDuration = parseDurationMinutes(schedule?.durationMinutes);

  // Parse explicit due time if provided (e.g. "16:00" or dueTime on schedule/item)
  const rawDue = (item as { dueTime?: unknown }).dueTime || (schedule as { dueTime?: unknown } | undefined)?.dueTime;
  let dueMinutes: number | undefined = undefined;

  if (typeof rawDue === "string") {
    const parsed = parseTimeString(rawDue);
    if (parsed) dueMinutes = parsed.hour * 60 + parsed.minute;
  } else if (typeof rawDue === "number" && Number.isFinite(rawDue)) {
    const d = new Date(rawDue);
    dueMinutes = d.getHours() * 60 + d.getMinutes();
  }

  // If no explicit dueTime was set, derive from endTime (deadline) or startTime (target)
  if (dueMinutes === undefined) {
    if (endTimeParsed) {
      dueMinutes = endTimeParsed.hour * 60 + endTimeParsed.minute;
    } else if (startTimeParsed) {
      dueMinutes = startTimeParsed.hour * 60 + startTimeParsed.minute;
    }
  }

  // Resolve duration
  let duration: number;
  let hasExplicitDuration = false;

  if (explicitDuration !== undefined) {
    duration = explicitDuration;
    hasExplicitDuration = true;
  } else if (startTimeParsed && endTimeParsed) {
    const startM = startTimeParsed.hour * 60 + startTimeParsed.minute;
    const endM = endTimeParsed.hour * 60 + endTimeParsed.minute;
    const diff = endM - startM;
    if (diff > 0) {
      duration = diff;
      hasExplicitDuration = true;
    } else {
      duration = defaultDuration;
    }
  } else {
    duration = defaultDuration;
  }

  // Resolve scheduled status and window
  const isScheduled = startTimeParsed !== undefined;
  let startMinutes: number | undefined = undefined;
  let endMinutes: number | undefined = undefined;

  if (startTimeParsed) {
    startMinutes = startTimeParsed.hour * 60 + startTimeParsed.minute;
    endMinutes = startMinutes + duration;
  }

  return {
    isScheduled,
    startMinutes,
    endMinutes,
    durationMinutes: duration,
    hasExplicitDuration,
    dueMinutes,
    dueDateKey: schedule?.date && schedule.date !== "inbox" ? schedule.date : undefined,
  };
}

/**
 * Pure deterministic selector for Pebble's NOW focus layer.
 *
 * Implements the 4 conceptual states:
 * 1. ACTIVE NOW: Current time is inside an incomplete scheduled activity's window.
 * 2. RECOMMENDED NOW: Free time before next scheduled event; candidate fits within available window.
 * 3. UPCOMING ("UP NEXT"): No active/recommended item; surfaces nearest upcoming scheduled activity.
 * 4. EMPTY: No active, recommended, or upcoming item ("Nothing needs your attention right now.").
 *
 * Strict Invariants:
 * - Read-only: never mutates schedules, tasks, or calendar data.
 * - Overdue is separate: overdue tasks are excluded from becoming NOW.
 * - Entity-neutral: works natively across Tasks, Habits, and Checklists.
 * - Time-reactive: accepts explicit `now` parameter with no hidden `Date.now()` calls.
 */
export function getNowFocus({
  now = new Date(),
  referenceDateKey,
  tasks = [],
  habits = [],
  checklists = [],
  dayBoundaryMinutes,
}: GetNowFocusOptions): NowFocusResult {
  const dateKey = referenceDateKey || dateKeyFromDate(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // ─────────────────────────────────────────────────────────────
  // 1. Filter out completed, archived, and overdue items
  // ─────────────────────────────────────────────────────────────

  // Helper: check if scheduled for another date (Pebble uses "inbox" as sentinel for unscheduled)
  const isScheduledForDifferentDate = (d?: string) =>
    Boolean(d && d !== "inbox" && d !== dateKey);

  // Tasks: non-completed, non-overdue, today or unscheduled
  const eligibleTasks = tasks.filter((task) => {
    if (task.archivedAt) return false;
    if (isTaskCompleted(task)) return false;
    if (isTaskOverdue(task, dateKey)) return false;
    if (isScheduledForDifferentDate(task.schedule?.date)) return false;
    return true;
  });

  // Habits: non-archived, non-completed today, recurring today
  const eligibleHabits = habits.filter((habit) => {
    if (habit.archivedAt) return false;
    if (isHabitCompletedToday(habit, dateKey)) return false;
    if (habit.recurrence && !isRecurringOccurrenceForDate(habit, dateKey)) {
      return false;
    }
    if (isScheduledForDifferentDate(habit.schedule?.date)) return false;
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
    if (isScheduledForDifferentDate(checklist.schedule?.date)) {
      return false;
    }
    return true;
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Parse candidates uniformly into unified representation
  // ─────────────────────────────────────────────────────────────

  const parsedCandidates: ParsedCandidate[] = [];

  /**
   * Projects the occurrence-aware checklist execution state onto the result so the
   * NOW card stays presentational (no completion/recurrence logic in the component).
   */
  const resolveChecklistState = (
    candidate: ParsedCandidate,
  ): NowChecklistState | undefined => {
    if (candidate.type !== "checklist") return undefined;
    const nextItem = getNextIncompleteChecklistItem(
      candidate.item as Checklist,
      dateKey,
    );
    return {
      completedCount: candidate.checklistProgress?.completedCount ?? 0,
      total: candidate.checklistProgress?.totalCount ?? 0,
      nextItem: nextItem ? { id: nextItem.id, title: nextItem.title } : null,
    };
  };

  // Parse Tasks
  for (const task of eligibleTasks) {
    const priority = task.priority || "none";
    const sched = parseItemSchedule(task);

    parsedCandidates.push({
      type: "task",
      item: task,
      id: task.id,
      title: task.title,
      priority,
      priorityWeight: PRIORITY_WEIGHTS[priority] ?? 0,
      isScheduled: sched.isScheduled,
      startMinutes: sched.startMinutes,
      endMinutes: sched.endMinutes,
      durationMinutes: sched.durationMinutes,
      hasExplicitDuration: sched.hasExplicitDuration,
      dueMinutes: sched.dueMinutes,
      dueDateKey: sched.dueDateKey,
    });
  }

  // Parse Habits
  for (const habit of eligibleHabits) {
    const priority: TaskPriority = (habit as { priority?: TaskPriority }).priority || "none";
    const sched = parseItemSchedule(habit);
    const streak = getHabitCurrentStreak(habit, dateKey);

    parsedCandidates.push({
      type: "habit",
      item: habit,
      id: habit.id,
      title: habit.title,
      priority,
      priorityWeight: PRIORITY_WEIGHTS[priority] ?? 0,
      isScheduled: sched.isScheduled,
      startMinutes: sched.startMinutes,
      endMinutes: sched.endMinutes,
      durationMinutes: sched.durationMinutes,
      hasExplicitDuration: sched.hasExplicitDuration,
      dueMinutes: sched.dueMinutes,
      dueDateKey: sched.dueDateKey,
      streak,
    });
  }

  // Parse Checklists
  for (const checklist of eligibleChecklists) {
    const priority: TaskPriority = (checklist as { priority?: TaskPriority }).priority || "none";
    const sched = parseItemSchedule(checklist);
    const stats = checklist.recurrence
      ? getChecklistOccurrenceStats(checklist, dateKey)
      : getChecklistStats(checklist);

    parsedCandidates.push({
      type: "checklist",
      item: checklist,
      id: checklist.id,
      title: checklist.title,
      priority,
      priorityWeight: PRIORITY_WEIGHTS[priority] ?? 0,
      isScheduled: sched.isScheduled,
      startMinutes: sched.startMinutes,
      endMinutes: sched.endMinutes,
      durationMinutes: sched.durationMinutes,
      hasExplicitDuration: sched.hasExplicitDuration,
      dueMinutes: sched.dueMinutes,
      dueDateKey: sched.dueDateKey,
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
      checklistState: resolveChecklistState(active),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 4. STEP 2: Reason about available free time window
  // ─────────────────────────────────────────────────────────────

  // Find upcoming scheduled candidates today (startMinutes > nowMinutes)
  const upcomingScheduled = parsedCandidates
    .filter(
      (c) =>
        c.isScheduled &&
        c.startMinutes !== undefined &&
        c.startMinutes > nowMinutes,
    )
    .sort((a, b) => (a.startMinutes ?? 0) - (b.startMinutes ?? 0));

  const nextScheduled = upcomingScheduled[0];
  let availableWindowMinutes: number | undefined = undefined;

  if (nextScheduled && nextScheduled.startMinutes !== undefined) {
    // When an upcoming scheduled activity exists, the free window is bounded and exact
    availableWindowMinutes = nextScheduled.startMinutes - nowMinutes;
  } else if (dayBoundaryMinutes !== undefined) {
    // Explicit day boundary passed by caller
    availableWindowMinutes = Math.max(0, dayBoundaryMinutes - nowMinutes);
  } else {
    // No upcoming scheduled events for the rest of today.
    // Pebble does not impose an artificial bedtime assumption (e.g. 10 PM).
    // The schedule is open (unconstrained).
    availableWindowMinutes = undefined;
  }

  // ─────────────────────────────────────────────────────────────
  // 5. STEP 3: Recommend an unscheduled actionable item that fits
  // ─────────────────────────────────────────────────────────────

  // Unscheduled candidates: actionable items that are not fixed timeline events
  const recommendationCandidates = parsedCandidates.filter((c) => {
    // Fixed upcoming scheduled events belong on the timeline, not as unscheduled recommendations
    if (c.isScheduled) return false;

    // Check if item fits the available window (if window is bounded)
    if (availableWindowMinutes !== undefined) {
      if (c.hasExplicitDuration) {
        return c.durationMinutes <= availableWindowMinutes;
      } else {
        // Unspecified duration requires available window to be at least candidate default (30m)
        // or at least 15m for quick actions
        return availableWindowMinutes >= Math.min(30, c.durationMinutes);
      }
    }

    // When the schedule is open/unbounded, any actionable unscheduled candidate fits
    return true;
  });

  if (recommendationCandidates.length > 0) {
    // Deterministic ranking:
    // 1. Priority (high > medium > low > none)
    // 2. Real due-time proximity (earlier due time today ranks first)
    // 3. Due date proximity (due today before due tomorrow/later)
    // 4. Duration fit (prefers item that makes good use of window)
    // 5. Stable ID tie-breaker
    recommendationCandidates.sort((a, b) => {
      // 1. Priority
      if (b.priorityWeight !== a.priorityWeight) {
        return b.priorityWeight - a.priorityWeight;
      }

      // 2. Real due time of day proximity (HH:mm)
      if (a.dueMinutes !== undefined && b.dueMinutes !== undefined) {
        if (a.dueMinutes !== b.dueMinutes) {
          return a.dueMinutes - b.dueMinutes;
        }
      } else if (a.dueMinutes !== undefined && b.dueMinutes === undefined) {
        return -1;
      } else if (a.dueMinutes === undefined && b.dueMinutes !== undefined) {
        return 1;
      }

      // 3. Due date key proximity (today before future dates)
      const aIsToday = a.dueDateKey === dateKey;
      const bIsToday = b.dueDateKey === dateKey;
      if (aIsToday && !bIsToday) return -1;
      if (!aIsToday && bIsToday) return 1;

      // 4. Duration fit
      if (b.durationMinutes !== a.durationMinutes) {
        return b.durationMinutes - a.durationMinutes;
      }

      // 5. Stable ID
      return a.id.localeCompare(b.id);
    });

    const recommended = recommendationCandidates[0];
    const durationStr = `~${recommended.durationMinutes} min`;

    let contextLabel: string;
    if (availableWindowMinutes !== undefined) {
      if (availableWindowMinutes >= 60) {
        const hours = Math.round((availableWindowMinutes / 60) * 10) / 10;
        contextLabel = `${durationStr} · Fits ${hours}h free time`;
      } else {
        contextLabel = `${durationStr} · Fits ${availableWindowMinutes}m free time`;
      }
    } else {
      contextLabel = `${durationStr} · Open schedule`;
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
      checklistState: resolveChecklistState(recommended),
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
      checklistState: resolveChecklistState(nextScheduled),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 7. STEP 5: Calm empty state
  // ─────────────────────────────────────────────────────────────

  return {
    state: "empty",
  };
}
