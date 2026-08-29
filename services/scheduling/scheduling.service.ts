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
  }

  const hasTime = startHour !== undefined && startMinute !== undefined;
  const startTime = hasTime ? { hour: startHour!, minute: startMinute! } : undefined;

  let derivedDuration = item.schedule?.durationMinutes;
  if (derivedDuration === undefined && item.schedule?.startTime && item.schedule?.endTime) {
    const [sH, sM] = item.schedule.startTime.split(":").map(Number);
    const [eH, eM] = item.schedule.endTime.split(":").map(Number);
    if (!isNaN(sH) && !isNaN(sM) && !isNaN(eH) && !isNaN(eM)) {
      const diff = (eH * 60 + eM) - (sH * 60 + sM);
      if (diff > 0) {
        derivedDuration = diff;
      }
    }
  }

  const duration = derivedDuration !== undefined ? derivedDuration : defaultDuration;
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

/**
 * Calculates updated Task schedule fields following a Calendar drag/drop event.
 * Preserves existing duration when endTime was present, and guarantees
 * Task.reminder is untouched.
 */
export function calculateRescheduledTask(
  todo: Task,
  dropTarget: { hour?: number | null; date?: string | null },
  fallbackDate?: string
): Partial<Task> {
  const schedule = todo.schedule || {};

  if (dropTarget.hour !== undefined && dropTarget.hour !== null) {
    const formattedStartTime = `${String(dropTarget.hour).padStart(2, "0")}:00`;
    let newEndTime = schedule.endTime;

    if (schedule.startTime && schedule.endTime) {
      const [sH, sM] = schedule.startTime.split(":").map(Number);
      const [eH, eM] = schedule.endTime.split(":").map(Number);
      if (!isNaN(sH) && !isNaN(sM) && !isNaN(eH) && !isNaN(eM)) {
        const diffMinutes = (eH * 60 + eM) - (sH * 60 + sM);
        if (diffMinutes > 0) {
          const endTotalMinutes = dropTarget.hour * 60 + diffMinutes;
          if (endTotalMinutes >= 24 * 60) {
            newEndTime = "23:59";
          } else {
            const endH = Math.floor(endTotalMinutes / 60);
            const endM = endTotalMinutes % 60;
            newEndTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
          }
        }
      }
    }

    return {
      schedule: {
        ...schedule,
        date: fallbackDate || schedule.date,
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

export interface CalendarDropPlan {
  isRecurringOccurrence: boolean;
  masterUpdate?: {
    id: string;
    workspaceId: string;
    patch: Partial<Task>;
  };
  createdExceptionCopy?: Task;
  directTaskUpdate?: {
    id: string;
    workspaceId: string;
    patch: Partial<Task>;
  };
}

/**
 * Plans the persistent mutations for a Calendar drag-drop action.
 * For non-recurring tasks, plans a direct update to the task.
 * For recurring task occurrences, adds the dragged occurrence date to the master's
 * recurrenceExceptions and creates a detached non-recurring copy for the occurrence.
 */
export function planCalendarTaskDrop(
  todo: Task,
  workspaceId: string,
  dropTarget: { hour?: number | null; date?: string | null },
  selectedDate: string,
  generateNewId: () => string
): CalendarDropPlan {
  const isRecurring = !!todo.recurrence;

  if (!isRecurring) {
    const updates = calculateRescheduledTask(todo, dropTarget, selectedDate);
    return {
      isRecurringOccurrence: false,
      directTaskUpdate: {
        id: todo.id,
        workspaceId,
        patch: updates,
      },
    };
  }

  // Recurring Task Occurrence Exception
  const updates = calculateRescheduledTask(todo, dropTarget, selectedDate);
  const updatedExceptions = [
    ...(todo.recurrenceExceptions || []).filter((d) => d !== selectedDate),
    selectedDate,
  ];

  const targetDate = dropTarget.date || selectedDate;
  const newCopy: Task = {
    ...todo,
    id: generateNewId(),
    workspaceId,
    recurrence: undefined, // Detached non-recurring copy
    recurrenceExceptions: undefined,
    schedule: {
      ...todo.schedule,
      ...updates.schedule,
      date: targetDate,
    },
    reminder: todo.reminder,
    status: "todo",
    completedAt: undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return {
    isRecurringOccurrence: true,
    masterUpdate: {
      id: todo.id,
      workspaceId,
      patch: { recurrenceExceptions: updatedExceptions },
    },
    createdExceptionCopy: newCopy,
  };
}
