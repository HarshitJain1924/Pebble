import type { Habit, RecurrenceRule, Task } from "@/shared/types/domain.types";
import {
  dateKeyFromDate,
  parseDateKey as parseDateKeyCanonical,
} from "@/shared/utils/date-key";

// Public API preserved for the many callers of this module; implementations
// delegate to the canonical date-key helpers (local-time YYYY-MM-DD).
export function getDateKey(date = new Date()): string {
  return dateKeyFromDate(date);
}

export function parseDateKey(value: string): Date {
  return parseDateKeyCanonical(value);
}

export function dayDiff(fromDateKey: string, toDateKey: string): number {
  const from = parseDateKey(fromDateKey).getTime();
  const to = parseDateKey(toDateKey).getTime();
  const DAY_MS = 24 * 60 * 60 * 1000;
  return Math.round((to - from) / DAY_MS);
}

function countWeekdayOccurrences(startDateKey: string, endDateKey: string): number {
  let count = 0;
  const current = parseDateKey(startDateKey);
  const end = parseDateKey(endDateKey);
  while (current.getTime() <= end.getTime()) {
    const day = current.getDay();
    if (day >= 1 && day <= 5) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

function countWeeklyOccurrences(
  startDateKey: string,
  endDateKey: string,
  targetDays: number[],
  interval: number = 1,
): number {
  let count = 0;
  const current = parseDateKey(startDateKey);
  const end = parseDateKey(endDateKey);
  while (current.getTime() <= end.getTime()) {
    const currKey = dateKeyFromDate(current);
    const weeksDiff = Math.floor(dayDiff(startDateKey, currKey) / 7);
    if (weeksDiff % interval === 0 && targetDays.includes(current.getDay())) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

function countMonthlyOccurrences(
  startDateKey: string,
  endDateKey: string,
  dayOfMonth: number,
  interval: number = 1,
): number {
  let count = 0;
  const start = parseDateKey(startDateKey);
  const end = parseDateKey(endDateKey);
  let year = start.getFullYear();
  let month = start.getMonth();

  while (true) {
    const d = new Date(year, month, dayOfMonth);
    if (d.getDate() === dayOfMonth) {
      const dKey = dateKeyFromDate(d);
      if (dKey >= startDateKey && dKey <= endDateKey) {
        const monthDiff = (year - start.getFullYear()) * 12 + (month - start.getMonth());
        if (monthDiff % interval === 0) {
          count++;
        }
      } else if (dKey > endDateKey) {
        break;
      }
    }
    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
    if (new Date(year, month, 1).getTime() > end.getTime()) {
      break;
    }
  }
  return count;
}

/**
 * Check if a task or habit is scheduled for a specific date (YYYY-MM-DD).
 */
export function isRecurringOccurrenceForDate(
  item: Task | Habit | any,
  dateKey: string,
): boolean {
  if (item.archivedAt) return false;

  if (
    item.recurrenceExceptions &&
    Array.isArray(item.recurrenceExceptions) &&
    item.recurrenceExceptions.includes(dateKey)
  ) {
    return false;
  }

  const recurrence: RecurrenceRule | undefined = item.recurrence;
  const scheduleDate = item.schedule?.date;

  // Unscheduled / inbox items must not produce calendar occurrences
  if (scheduleDate === "inbox") {
    return false;
  }

  // If no recurrence, only matches if scheduled date is exactly dateKey
  if (!recurrence) {
    return scheduleDate === dateKey;
  }

  // Start date of the recurrence
  let startDayKey =
    scheduleDate ||
    (item.createdAt ? getDateKey(new Date(item.createdAt)) : getDateKey());

  // Cannot occur before its start date
  if (dateKey < startDayKey) {
    return false;
  }

  // Cannot occur after its configured end date
  if (recurrence.endDate && dateKey > recurrence.endDate) {
    return false;
  }

  const targetDate = parseDateKey(dateKey);
  const dayOfWeek = targetDate.getDay(); // 0 = Sunday .. 6 = Saturday

  const freq: string = (recurrence.frequency ||
    (recurrence as any).type ||
    "daily") as string;

  let isMatch = false;

  switch (freq) {
    case "daily": {
      const interval = recurrence.interval || 1;
      const diff = dayDiff(startDayKey, dateKey);
      if (diff >= 0 && diff % interval === 0) {
        if (recurrence.occurrences !== undefined && recurrence.occurrences > 0) {
          const occurrenceNumber = Math.floor(diff / interval) + 1;
          isMatch = occurrenceNumber <= recurrence.occurrences;
        } else {
          isMatch = true;
        }
      }
      break;
    }
    case "weekdays": {
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        if (recurrence.occurrences !== undefined && recurrence.occurrences > 0) {
          const count = countWeekdayOccurrences(startDayKey, dateKey);
          isMatch = count <= recurrence.occurrences;
        } else {
          isMatch = true;
        }
      }
      break;
    }
    case "weekly": {
      const targetDays = recurrence.daysOfWeek ||
        (recurrence as any).days || [parseDateKey(startDayKey).getDay()];
      const interval = recurrence.interval || 1;
      const weeksDiff = Math.floor(dayDiff(startDayKey, dateKey) / 7);
      if (weeksDiff % interval === 0 && targetDays.includes(dayOfWeek)) {
        if (recurrence.occurrences !== undefined && recurrence.occurrences > 0) {
          const count = countWeeklyOccurrences(startDayKey, dateKey, targetDays, interval);
          isMatch = count <= recurrence.occurrences;
        } else {
          isMatch = true;
        }
      }
      break;
    }
    case "monthly": {
      const dayOfMonth =
        recurrence.dayOfMonth || parseDateKey(startDayKey).getDate();
      const interval = recurrence.interval || 1;
      if (targetDate.getDate() === dayOfMonth) {
        const start = parseDateKey(startDayKey);
        const monthDiff =
          (targetDate.getFullYear() - start.getFullYear()) * 12 +
          (targetDate.getMonth() - start.getMonth());
        if (monthDiff >= 0 && monthDiff % interval === 0) {
          if (recurrence.occurrences !== undefined && recurrence.occurrences > 0) {
            const count = countMonthlyOccurrences(startDayKey, dateKey, dayOfMonth, interval);
            isMatch = count <= recurrence.occurrences;
          } else {
            isMatch = true;
          }
        }
      }
      break;
    }
    case "yearly": {
      const interval = recurrence.interval || 1;
      const diff = dayDiff(startDayKey, dateKey);
      if (diff >= 0 && diff % (interval * 365) === 0) {
        if (recurrence.occurrences !== undefined && recurrence.occurrences > 0) {
          const occurrenceNumber = Math.floor(diff / (interval * 365)) + 1;
          isMatch = occurrenceNumber <= recurrence.occurrences;
        } else {
          isMatch = true;
        }
      }
      break;
    }
    case "interval":
    case "custom": {
      const interval = recurrence.interval || 1;
      const unit = recurrence.unit || (recurrence as any).unit || "days";
      if (unit === "hours") {
        isMatch = true;
      } else {
        const diff = dayDiff(startDayKey, dateKey);
        if (diff >= 0 && diff % interval === 0) {
          if (recurrence.occurrences !== undefined && recurrence.occurrences > 0) {
            const occurrenceNumber = Math.floor(diff / interval) + 1;
            isMatch = occurrenceNumber <= recurrence.occurrences;
          } else {
            isMatch = true;
          }
        }
      }
      break;
    }
    default:
      isMatch = true;
      break;
  }

  return isMatch;
}

/**
 * Occurrence-aware reminder scheduling bounds.
 *
 * A recurrence series with exceptions cannot be represented by a repeating OS
 * trigger (repeating triggers have no per-date exclusion), so the scheduler
 * materialises the upcoming occurrences as individual one-time notifications.
 * The window is bounded so a long series can never exhaust the platform's
 * pending-notification budget; the startup reconciler tops the window up.
 */
export const EXCEPTION_MODE_HORIZON_DAYS = 30;
export const EXCEPTION_MODE_MAX_OCCURRENCES = 10;

/**
 * Recurrence rules whose occurrences are identified by a calendar date key.
 * Hourly (`custom` + `unit: "hours"`) series have no date-key occurrence model
 * and therefore keep their existing interval scheduling.
 */
export function recurrenceSupportsDateExceptions(
  recurrence?: RecurrenceRule | null,
): boolean {
  if (!recurrence) return false;
  if (recurrence.frequency === "custom" && recurrence.unit === "hours") {
    return false;
  }
  return true;
}

/**
 * Resolve which occurrence date a date-less surface (Today stream, Workspace
 * list) should read and write for a recurring entity.
 *
 * - Today, when today is a real occurrence (the common case).
 * - Otherwise the next real occurrence, so an off-day tap still targets a
 *   valid occurrence instead of mutating the master template.
 * - `undefined` for non-recurring entities: they have no occurrence dimension.
 *
 * Uses the canonical `isRecurringOccurrenceForDate` (exceptions, end date and
 * occurrence limits included); it never re-implements recurrence math.
 */
export function getActiveOccurrenceDateKey(
  item: { recurrence?: RecurrenceRule | null; [key: string]: any },
  referenceDateKey: string = getDateKey(),
  lookaheadDays: number = 62,
): string | undefined {
  if (!item?.recurrence) return undefined;
  if (isRecurringOccurrenceForDate(item, referenceDateKey)) {
    return referenceDateKey;
  }

  const reference = parseDateKey(referenceDateKey);
  for (let offset = 1; offset <= lookaheadDays; offset++) {
    const candidate = new Date(
      reference.getFullYear(),
      reference.getMonth(),
      reference.getDate() + offset,
    );
    const candidateKey = dateKeyFromDate(candidate);
    if (isRecurringOccurrenceForDate(item, candidateKey)) {
      return candidateKey;
    }
  }

  // The series has no upcoming occurrence (ended). Keep a date key so callers
  // still have a consistent display target; the command will reject the write.
  return referenceDateKey;
}

/**
 * Upcoming, non-excepted occurrence timestamps for a recurring entity, using
 * the reminder's wall-clock time and walking forward from `now`.
 *
 * Returns one epoch per occurrence date (bounded by the exception-mode
 * window), honoring `recurrenceExceptions`, `endDate` and `occurrences`.
 */
export function getUpcomingOccurrenceEpochs(
  item: {
    recurrence?: RecurrenceRule | null;
    recurrenceExceptions?: string[];
    schedule?: { date?: string };
  },
  triggerAt: number,
  options: {
    now?: number;
    horizonDays?: number;
    maxOccurrences?: number;
  } = {},
): number[] {
  const now = options.now ?? Date.now();
  const horizonDays = options.horizonDays ?? EXCEPTION_MODE_HORIZON_DAYS;
  const maxOccurrences = options.maxOccurrences ?? EXCEPTION_MODE_MAX_OCCURRENCES;

  const trigger = new Date(triggerAt);
  const hour = trigger.getHours();
  const minute = trigger.getMinutes();

  const start = new Date(now);
  const epochs: number[] = [];

  for (
    let offset = 0;
    offset <= horizonDays && epochs.length < maxOccurrences;
    offset++
  ) {
    const day = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + offset,
    );
    const dateKey = dateKeyFromDate(day);
    if (!isRecurringOccurrenceForDate(item, dateKey)) continue;

    const epoch = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      hour,
      minute,
      0,
      0,
    ).getTime();

    if (epoch <= now) continue;
    epochs.push(epoch);
  }

  return epochs;
}

/**
 * Format a recurrence structure into a user-friendly label.
 */
export function getRecurrenceLabel(
  recurrence: RecurrenceRule | any,
): string | null {
  if (!recurrence) return null;

  const freq: string = (recurrence.frequency || recurrence.type) as string;

  switch (freq) {
    case "daily":
      return "Daily";
    case "weekdays":
      return "Weekdays";
    case "weekly": {
      const daysOfWeek = recurrence.daysOfWeek || recurrence.days;
      if (daysOfWeek && daysOfWeek.length > 0) {
        const days = [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ];
        if (daysOfWeek.length === 1) {
          return `Every ${days[daysOfWeek[0]]}`;
        }
        if (
          daysOfWeek.length === 2 &&
          daysOfWeek.includes(0) &&
          daysOfWeek.includes(6)
        ) {
          return "Every Weekend";
        }
        return `Weekly (${daysOfWeek.map((d: number) => days[d].substring(0, 3)).join(", ")})`;
      }
      return "Weekly";
    }
    case "monthly":
      if (recurrence.dayOfMonth) {
        const suffix = (day: number) => {
          if (day > 3 && day < 21) return "th";
          switch (day % 10) {
            case 1:
              return "st";
            case 2:
              return "nd";
            case 3:
              return "rd";
            default:
              return "th";
          }
        };
        return `Monthly on the ${recurrence.dayOfMonth}${suffix(recurrence.dayOfMonth)}`;
      }
      return "Monthly";
    case "interval":
    case "custom": {
      const interval = recurrence.interval || 1;
      const unit = recurrence.unit || (recurrence as any).unit || "days";
      if (unit === "hours") {
        return interval === 1 ? "Every Hour" : `Every ${interval} Hours`;
      }
      return interval === 1 ? "Every Day" : `Every ${interval} Days`;
    }
    default:
      return null;
  }
}

/**
 * Calculates the next upcoming occurrence timestamp for an anchored interval recurrence.
 *
 * Invariants:
 * - Anchored: All occurrences align with the grid: `anchor + offsetMinutes + k * stepMs`.
 * - Strictly in the future: If the target anchor time has passed, steps forward by full interval cycles.
 * - Deterministic: Given the same anchor, interval, unit, offset, and reference time (now),
 *   produces the identical epoch timestamp across Native OS, Web, Alert Center, and Reconciler.
 */
export function getNextIntervalOccurrenceEpoch(
  anchor: number,
  interval: number,
  unit: "hours" | "days" | string = "hours",
  offsetMinutes: number = 0,
  now: number = Date.now(),
): number {
  const stepMs =
    unit === "hours"
      ? (interval || 1) * 60 * 60 * 1000
      : (interval || 1) * 24 * 60 * 60 * 1000;

  const targetTime = anchor + offsetMinutes * 60 * 1000;
  if (targetTime > now) {
    return targetTime;
  }

  const passed = now - targetTime;
  const cycles = Math.floor(passed / stepMs) + 1;
  return targetTime + cycles * stepMs;
}
