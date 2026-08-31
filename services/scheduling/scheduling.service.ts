import type { Task, Habit } from "@/shared/types/domain.types";

export interface StructuredSchedule {
  startDate?: string; // YYYY-MM-DD
  startTime?: { hour: number; minute: number };
  duration: number; // in minutes
  isRecurring: boolean;
  sortKey: number; // minutes from midnight
}

/**
 * Safely parses a time string in HH:mm format (00 <= HH <= 23, 00 <= mm <= 59).
 * Returns undefined for invalid or malformed strings.
 */
export function parseTimeString(timeStr?: unknown): { hour: number; minute: number } | undefined {
  if (typeof timeStr !== "string" || !timeStr.trim()) {
    return undefined;
  }
  const parts = timeStr.trim().split(":");
  if (parts.length !== 2) {
    return undefined;
  }
  const [hStr, mStr] = parts;
  if (!/^\d{1,2}$/.test(hStr) || !/^\d{1,2}$/.test(mStr)) {
    return undefined;
  }
  const hour = Number(hStr);
  const minute = Number(mStr);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return undefined;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return undefined;
  }
  return { hour, minute };
}

/**
 * Safely parses a duration in minutes.
 * Returns undefined if non-numeric, non-positive, non-finite, or NaN.
 */
export function parseDurationMinutes(val: unknown): number | undefined {
  if (typeof val === "number" && Number.isFinite(val) && val > 0) {
    return Math.round(val);
  }
  if (typeof val === "string" && /^\d+$/.test(val.trim())) {
    const parsed = Number(val.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed);
    }
  }
  return undefined;
}

/**
 * Parses and returns structured scheduling data from a Task or Habit.
 */
export function getStructuredSchedule(
  item: Task | Habit | any,
  defaultDuration = 60
): StructuredSchedule {
  const startDate = item?.schedule?.date;
  const parsedStartTime = parseTimeString(item?.schedule?.startTime);
  const startTime = parsedStartTime;
  const hasTime = !!parsedStartTime;

  let resolvedDuration: number | undefined;

  // Authority 1: Explicit durationMinutes
  const explicitDuration = parseDurationMinutes(item?.schedule?.durationMinutes);
  if (explicitDuration !== undefined) {
    resolvedDuration = explicitDuration;
  } else if (parsedStartTime && item?.schedule?.endTime) {
    // Authority 2: Legacy endTime derivation if durationMinutes is absent
    const parsedEndTime = parseTimeString(item.schedule.endTime);
    if (parsedEndTime) {
      const diff = (parsedEndTime.hour * 60 + parsedEndTime.minute) - (parsedStartTime.hour * 60 + parsedStartTime.minute);
      if (diff > 0) {
        resolvedDuration = diff;
      }
    }
  }

  // Authority 3: Safe positive finite defaultDuration
  const safeDefault = typeof defaultDuration === "number" && Number.isFinite(defaultDuration) && defaultDuration > 0
    ? Math.round(defaultDuration)
    : 60;

  const duration = resolvedDuration !== undefined ? resolvedDuration : safeDefault;
  const isRecurring = !!item?.recurrence;
  const sortKey = parsedStartTime ? parsedStartTime.hour * 60 + parsedStartTime.minute : 24 * 60;

  return {
    startDate,
    startTime,
    duration,
    isRecurring,
    sortKey,
  };
}

/**
 * Calculates updated Task schedule fields following a Calendar drag/drop event
 * or Quick Slot planning action.
 * Preserves existing duration when endTime or durationMinutes was present, and guarantees
 * Task.reminder is untouched.
 */
export function calculateRescheduledTask(
  todo: Task,
  dropTarget: { hour?: number | null; minute?: number | null; date?: string | null },
  fallbackDate?: string
): Partial<Task> {
  const schedule = todo.schedule || {};

  if (dropTarget.hour !== undefined && dropTarget.hour !== null) {
    const min =
      dropTarget.minute !== undefined && dropTarget.minute !== null && Number.isInteger(dropTarget.minute)
        ? Math.max(0, Math.min(59, dropTarget.minute))
        : 0;
    const formattedStartTime = `${String(dropTarget.hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    let newEndTime = schedule.endTime;

    if (schedule.startTime && schedule.endTime) {
      const sTime = parseTimeString(schedule.startTime);
      const eTime = parseTimeString(schedule.endTime);
      if (sTime && eTime) {
        const diffMinutes = (eTime.hour * 60 + eTime.minute) - (sTime.hour * 60 + sTime.minute);
        if (diffMinutes > 0) {
          const endTotalMinutes = dropTarget.hour * 60 + min + diffMinutes;
          if (endTotalMinutes >= 24 * 60) {
            newEndTime = "23:59";
          } else {
            const endH = Math.floor(endTotalMinutes / 60);
            const endM = endTotalMinutes % 60;
            newEndTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
          }
        }
      }
    } else if (schedule.durationMinutes && Number.isFinite(schedule.durationMinutes) && schedule.durationMinutes > 0) {
      const endTotalMinutes = dropTarget.hour * 60 + min + schedule.durationMinutes;
      if (endTotalMinutes >= 24 * 60) {
        newEndTime = "23:59";
      } else {
        const endH = Math.floor(endTotalMinutes / 60);
        const endM = endTotalMinutes % 60;
        newEndTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
      }
    }

    return {
      schedule: {
        ...schedule,
        date: fallbackDate || dropTarget.date || schedule.date,
        startTime: formattedStartTime,
        ...(newEndTime ? { endTime: newEndTime } : {}),
      },
    };
  }

  if (dropTarget.date) {
    return {
      schedule: {
        ...schedule,
        date: dropTarget.date,
      },
    };
  }

  return {};
}


