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
  item: {
    id: string;
    scheduledDate?: string;
    alarmTime?: number;
    recurrence?: {
      type: "daily" | "weekdays" | "weekly" | "monthly" | "interval";
      interval?: number;
      unit?: "hours" | "days";
      days?: number[];
      dayOfMonth?: number;
    };
    recurrenceExceptions?: string[];
    archived?: boolean;
  },
  dateKey: string
): boolean {
  if (item.archived) return false;

  // Check if date is excluded as an exception
  if (item.recurrenceExceptions?.includes(dateKey)) {
    return false;
  }

  // If no recurrence, only matches if scheduledDate is exactly the dateKey
  if (!item.recurrence) {
    return item.scheduledDate === dateKey;
  }

  // Start date of the recurrence
  let startDayKey = item.scheduledDate && item.scheduledDate !== "inbox"
    ? item.scheduledDate
    : undefined;

  if (!startDayKey) {
    if (item.alarmTime) {
      startDayKey = getDateKey(new Date(item.alarmTime));
    } else {
      // Fallback: parse creation time from numeric id
      const idNum = Number(item.id.replace(/[^\d]/g, ""));
      if (!isNaN(idNum) && idNum > 1000000000000) {
        startDayKey = getDateKey(new Date(idNum));
      } else {
        startDayKey = getDateKey(new Date());
      }
    }
  }

  // Cannot occur before its start date
  if (dateKey < startDayKey) {
    return false;
  }

  const targetDate = parseDateKey(dateKey);
  const dayOfWeek = targetDate.getDay(); // 0 = Sunday .. 6 = Saturday

  switch (item.recurrence.type) {
    case "daily":
      return true;
    case "weekdays":
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    case "weekly": {
      const targetDays = item.recurrence.days && item.recurrence.days.length > 0
        ? item.recurrence.days
        : [parseDateKey(startDayKey).getDay()];
      return targetDays.includes(dayOfWeek);
    }
    case "monthly": {
      const dayOfMonth = item.recurrence.dayOfMonth || parseDateKey(startDayKey).getDate();
      return targetDate.getDate() === dayOfMonth;
    }
    case "interval": {
      if (item.recurrence.unit === "days") {
        const interval = item.recurrence.interval || 1;
        const diff = dayDiff(startDayKey, dateKey);
        return diff >= 0 && diff % interval === 0;
      }
      // If hourly, it occurs daily on the day view
      return true;
    }
    default:
      return false;
  }
}

/**
 * Format a recurrence structure into a user-friendly label.
 */
export function getRecurrenceLabel(recurrence: any): string | null {
  if (!recurrence) return null;
  
  switch (recurrence.type) {
    case "daily":
      return "Daily";
    case "weekdays":
      return "Weekdays";
    case "weekly":
      if (recurrence.days && recurrence.days.length > 0) {
        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        if (recurrence.days.length === 1) {
          return `Every ${days[recurrence.days[0]]}`;
        }
        if (recurrence.days.length === 2 && recurrence.days.includes(0) && recurrence.days.includes(6)) {
          return "Every Weekend";
        }
        return `Weekly (${recurrence.days.map((d: number) => days[d].substring(0, 3)).join(", ")})`;
      }
      return "Weekly";
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
    case "interval":
      if (recurrence.unit === "hours") {
        return recurrence.interval === 1 ? "Every Hour" : `Every ${recurrence.interval} Hours`;
      }
      return recurrence.interval === 1 ? "Every Day" : `Every ${recurrence.interval} Days`;
    default:
      return null;
  }
}
