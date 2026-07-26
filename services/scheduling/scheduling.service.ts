import type { Task, Habit } from "@/shared/types/domain.types";

export interface StructuredSchedule {
  startDate?: string; // YYYY-MM-DD
  startTime?: { hour: number; minute: number };
  duration: number; // in minutes
  isRecurring: boolean;
  sortKey: number; // minutes from midnight
}

/**
 * Parses and returns structured scheduling data from a Task or Habit.
 */
export function getStructuredSchedule(
  item: Task | Habit | any,
  defaultDuration = 60
): StructuredSchedule {
  let startDate = item.schedule?.date || item.scheduledDate;
  let startHour: number | undefined;
  let startMinute: number | undefined;

  if (item.schedule?.startTime) {
    const parts = item.schedule.startTime.split(":").map(Number);
    if (!isNaN(parts[0]) && !isNaN(parts[1])) {
      startHour = parts[0];
      startMinute = parts[1];
    }
  } else if (item.reminder?.triggerAt) {
    const d = new Date(item.reminder.triggerAt);
    startHour = d.getHours();
    startMinute = d.getMinutes();
    if (!startDate) {
      startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }

  const hasTime = startHour !== undefined && startMinute !== undefined;
  const startTime = hasTime ? { hour: startHour!, minute: startMinute! } : undefined;
  const duration = item.schedule?.durationMinutes || defaultDuration;
  const isRecurring = !!item.recurrence;
  const sortKey = hasTime ? startHour! * 60 + startMinute! : 24 * 60;

  return {
    startDate,
    startTime,
    duration,
    isRecurring,
    sortKey,
  };
}
