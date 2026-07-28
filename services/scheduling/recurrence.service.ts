import type { RecurrenceRule, Task, Habit } from "@/shared/types/domain.types";

export function getDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function dayDiff(fromDateKey: string, toDateKey: string): number {
  const from = parseDateKey(fromDateKey).getTime();
  const to = parseDateKey(toDateKey).getTime();
  const DAY_MS = 24 * 60 * 60 * 1000;
  return Math.round((to - from) / DAY_MS);
}

/**
 * Check if a task or habit is scheduled for a specific date (YYYY-MM-DD).
 */
export function isRecurringOccurrenceForDate(
  item: Task | Habit | any,
  dateKey: string
): boolean {
  if (item.archivedAt) return false;

  const recurrence: RecurrenceRule | undefined = item.recurrence;
  const scheduleDate = item.schedule?.date || item.scheduledDate;

  // If no recurrence, only matches if scheduled date is exactly dateKey
  if (!recurrence) {
    return scheduleDate === dateKey;
  }

  // Start date of the recurrence
  let startDayKey = scheduleDate || (item.createdAt ? getDateKey(new Date(item.createdAt)) : getDateKey());

  // Cannot occur before its start date
  if (dateKey < startDayKey) {
    return false;
  }

  const targetDate = parseDateKey(dateKey);
  const dayOfWeek = targetDate.getDay(); // 0 = Sunday .. 6 = Saturday

  const freq = recurrence.frequency || (recurrence as any).type || "daily";

  switch (freq) {
    case "daily":
      return true;
    case "weekly": {
      const targetDays = recurrence.daysOfWeek || (recurrence as any).days || [parseDateKey(startDayKey).getDay()];
      return targetDays.includes(dayOfWeek);
    }
    case "monthly": {
      const dayOfMonth = recurrence.dayOfMonth || parseDateKey(startDayKey).getDate();
      return targetDate.getDate() === dayOfMonth;
    }
    case "yearly": {
      const interval = recurrence.interval || 1;
      const diff = dayDiff(startDayKey, dateKey);
      return diff >= 0 && diff % (interval * 365) === 0;
    }
    case "custom": {
      const interval = recurrence.interval || 1;
      const diff = dayDiff(startDayKey, dateKey);
      return diff >= 0 && diff % interval === 0;
    }
    default:
      return true;
  }
}

/**
 * Format a recurrence structure into a user-friendly label.
 */
export function getRecurrenceLabel(recurrence: RecurrenceRule | any): string | null {
  if (!recurrence) return null;
  
  const freq = recurrence.frequency || recurrence.type;

  switch (freq) {
    case "daily":
      return "Daily";
    case "weekly": {
      const daysOfWeek = recurrence.daysOfWeek || recurrence.days;
      if (daysOfWeek && daysOfWeek.length > 0) {
        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        if (daysOfWeek.length === 1) {
          return `Every ${days[daysOfWeek[0]]}`;
        }
        if (daysOfWeek.length === 2 && daysOfWeek.includes(0) && daysOfWeek.includes(6)) {
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
            case 1: return "st";
            case 2: return "nd";
            case 3: return "rd";
            default: return "th";
          }
        };
        return `Monthly on the ${recurrence.dayOfMonth}${suffix(recurrence.dayOfMonth)}`;
      }
      return "Monthly";
    case "custom":
      return recurrence.interval === 1 ? "Every Day" : `Every ${recurrence.interval} Days`;
    default:
      return null;
  }
}
