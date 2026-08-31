import type { Reminder } from "@/shared/types/domain.types";
import { computeTriggerEpoch } from "@/features/details/task/hooks/useTaskDetailForm";

export interface SchedulableEntity {
  schedule?: {
    date?: string;
    startTime?: string;
    endTime?: string;
    durationMinutes?: number;
    allDay?: boolean;
  };
  reminder?: Reminder;
}

/**
 * Canonical schedule-to-reminder normalization.
 *
 * Implements the Pebble domain invariant:
 * 1. When an entity receives a concrete scheduled start time (via creation, planning, or movement),
 *    the default reminder is automatically set to the scheduled start time.
 * 2. If the user previously configured a reminder with an offset (e.g. 30 minutes before),
 *    that relative offset is preserved when the entity is rescheduled to a new time or date.
 * 3. If the user explicitly chose "No reminder" (reminder.enabled === false), the reminder
 *    must NOT be automatically recreated or re-enabled when moving or scheduling the entity.
 * 4. If the caller explicitly provides a `reminder` field in `updates`, that explicit
 *    update takes absolute precedence and is untouched.
 */
export function normalizeScheduleReminder<T extends SchedulableEntity>(
  existing: T,
  updates: Partial<T>,
): Partial<T> {
  // 1. Explicit reminder update in payload takes precedence
  if ("reminder" in updates) {
    return updates;
  }

  // 2. Explicit "No reminder" (disabled by user) is preserved
  if (existing.reminder?.enabled === false) {
    return updates;
  }

  const existingSchedule = existing.schedule;
  const updatedSchedule = "schedule" in updates ? updates.schedule : existingSchedule;

  const oldDate = existingSchedule?.date;
  const oldTime = existingSchedule?.startTime;
  const newDate = updatedSchedule?.date || oldDate;
  const newTime = updatedSchedule?.startTime;

  // If no concrete startTime is present in the updated schedule
  if (!updatedSchedule || !newTime) {
    return updates;
  }

  const isScheduleTimeOrDateChanged = newTime !== oldTime || newDate !== oldDate;

  // If schedule time and date didn't change and reminder is already set, keep as-is
  if (!isScheduleTimeOrDateChanged && existing.reminder?.triggerAt) {
    return updates;
  }

  // Parse new start time
  const [newH, newM] = newTime.split(":").map(Number);
  if (isNaN(newH) || isNaN(newM)) {
    return updates;
  }

  const targetDateStr = newDate && newDate !== "inbox" ? newDate : undefined;
  const scheduledStartEpoch = computeTriggerEpoch(newH, newM, targetDateStr);

  // Preserve existing reminder offset if one was previously configured
  let offsetMs = 0;
  if (existing.reminder?.triggerAt && oldTime) {
    const [oldH, oldM] = oldTime.split(":").map(Number);
    if (!isNaN(oldH) && !isNaN(oldM)) {
      const oldScheduledEpoch = computeTriggerEpoch(
        oldH,
        oldM,
        oldDate && oldDate !== "inbox" ? oldDate : undefined,
      );
      const computedOffset = oldScheduledEpoch - existing.reminder.triggerAt;
      // Sanity check: only apply positive offset within 24 hours (e.g. 10m, 30m, 1h before)
      if (computedOffset > 0 && computedOffset <= 24 * 60 * 60 * 1000) {
        offsetMs = computedOffset;
      }
    }
  }

  const newTriggerAt = scheduledStartEpoch - offsetMs;

  return {
    ...updates,
    reminder: {
      enabled: true,
      triggerAt: newTriggerAt,
      notificationIds: undefined, // Notification reconciler will schedule fresh OS notification
    },
  };
}
