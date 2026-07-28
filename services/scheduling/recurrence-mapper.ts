import { type RecurrenceRule } from "@/shared/types/domain.types";

/**
 * Internal recurrence format consumed by the scheduler.
 * This is separate from the canonical domain RecurrenceRule.
 * Callers must use recurrenceRuleToScheduler() to convert
 * domain RecurrenceRule into this format before passing it
 * to scheduleReminderBatch().
 */
export type SchedulerRecurrence = {
  type: "daily" | "weekdays" | "weekly" | "monthly" | "interval";
  interval?: number;
  unit?: "hours" | "days";
  days?: number[];
  dayOfMonth?: number;
};

/**
 * Maps a canonical domain RecurrenceRule to the scheduler's internal
 * SchedulerRecurrence format. This is the ONLY place where field name
 * translation occurs:
 *
 *   frequency → type     ("custom" becomes "interval", "yearly" becomes "interval")
 *   daysOfWeek → days
 *
 * Returns undefined when rule is null/undefined, allowing callers to
 * pass through `recurrenceRuleToScheduler(item.recurrence)` without
 * a manual null check.
 */
export function recurrenceRuleToScheduler(
  rule: RecurrenceRule | null | undefined,
): SchedulerRecurrence | undefined {
  if (!rule) return undefined;

  let type: SchedulerRecurrence["type"];
  switch (rule.frequency) {
    case "daily":
      type = "daily";
      break;
    case "weekly":
      type = "weekly";
      break;
    case "monthly":
      type = "monthly";
      break;
    case "custom":
      type = "interval";
      break;
    case "yearly":
      // Domain `interval` for yearly recurrence is interpreted as
      // "every N years", so convert to an interval measured in days.
      return {
        type: "interval",
        interval: (rule.interval || 1) * 365,
        unit: "days",
      };
    default:
      type = "daily";
  }

  return {
    type,
    interval: rule.interval > 1 ? rule.interval : undefined,
    days: rule.daysOfWeek?.length ? rule.daysOfWeek : undefined,
    dayOfMonth: rule.dayOfMonth,
  };
}
