import { ScheduleConfig } from "./models";

export interface StructuredSchedule {
  startDate?: string; // YYYY-MM-DD
  startTime?: { hour: number; minute: number };
  duration: number; // in minutes
  isRecurring: boolean;
  sortKey: number; // minutes from midnight
}

/**
 * Parses and returns structured scheduling data from a flat ScheduleConfig.
 */
export function getStructuredSchedule(
  item: ScheduleConfig,
  defaultDuration = 60
): StructuredSchedule {
  let startDate = item.scheduledDate && item.scheduledDate !== "inbox" ? item.scheduledDate : undefined;
  let startHour: number | undefined = item.reminderHour;
  let startMinute: number | undefined = item.reminderMinute;

  // Resolve start time
  if (startHour === undefined || startMinute === undefined) {
    if (item.scheduledTime) {
      const [hStr, mStr] = item.scheduledTime.split(":");
      const h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);
      if (!isNaN(h) && !isNaN(m)) {
        startHour = h;
        startMinute = m;
      }
    } else if (item.alarmTime) {
      const d = new Date(item.alarmTime);
      startHour = d.getHours();
      startMinute = d.getMinutes();
      if (!startDate) {
        startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }
    }
  }

  const hasTime = startHour !== undefined && startMinute !== undefined;
  const startTime = hasTime ? { hour: startHour!, minute: startMinute! } : undefined;
  const duration = item.durationMinutes || defaultDuration;
  const isRecurring = !!item.recurrence || !!(item.reminderDays && item.reminderDays.length > 0);
  const sortKey = hasTime ? startHour! * 60 + startMinute! : 24 * 60; // Sort all-day items to the end

  return {
    startDate,
    startTime,
    duration,
    isRecurring,
    sortKey,
  };
}
