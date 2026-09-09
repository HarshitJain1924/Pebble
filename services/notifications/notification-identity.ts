import type { RecurrenceRule } from "@/shared/types/domain.types";
import { recurrenceRuleToScheduler } from "@/services/scheduling/recurrence-mapper";
import { getNextIntervalOccurrenceEpoch } from "@/services/scheduling/recurrence.service";

export type NotificationKind = "todo" | "task" | "habit" | "checklist";
export type NotificationPurpose = "reminder" | "escalation" | string;

export type NotificationScheduleType = "once" | "daily" | "weekly" | "monthly" | "interval";

export type NotificationScheduleOptions =
  | { type: "once"; triggerAt: number; offsetMinutes?: number }
  | { type: "daily"; hour: number; minute: number; offsetMinutes?: number }
  | { type: "weekly"; weekday: number; hour: number; minute: number; offsetMinutes?: number }
  | { type: "monthly"; dayOfMonth: number; hour: number; minute: number; offsetMinutes?: number }
  | { type: "interval"; interval: number; unit: string; anchor?: string | number | Date; offsetMinutes?: number };

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Builds a deterministic, entity-owned notification logical signature.
 * 
 * Format: `${kind}:${itemId}:${purpose}`
 * Example: "todo:task-123:reminder", "habit:habit-456:reminder", "todo:task-123:escalation"
 * 
 * Invariants:
 * - Distinguishes entity type (`todo` vs `habit`)
 * - Distinguishes entity ID (`itemId`)
 * - Distinguishes notification purpose (`reminder` vs `escalation`)
 * - Answers: "Who owns this notification?"
 * - Immutable: NEVER depends on mutable fields like `title`, `triggerAt`, or `updatedAt`.
 */
export function buildNotificationLogicalSignature(
  kind: NotificationKind,
  itemId: string,
  purpose: NotificationPurpose = "reminder"
): string {
  return `${kind}:${itemId}:${purpose}`;
}

/**
 * Builds a deterministic physical schedule identity/version for an OS notification.
 * 
 * Changes whenever the notification's effective schedule changes.
 * Answers: "Does this physical notification represent the current domain reminder schedule?"
 * 
 * Formats:
 * - One-time: `once:<triggerAt>:+<offsetMinutes>`
 * - Daily: `daily:<HH>:<mm>:+<offsetMinutes>`
 * - Weekly: `weekly:w<platformWeekday>:<HH>:<mm>:+<offsetMinutes>`
 * - Monthly: `monthly:d<dayOfMonth>:<HH>:<mm>:+<offsetMinutes>`
 * - Interval: `interval:<interval>:<unit>:<anchorIso>:+<offsetMinutes>`
 */
export function buildNotificationScheduleKey(options: NotificationScheduleOptions): string {
  const offset = options.offsetMinutes ?? 0;
  switch (options.type) {
    case "once":
      return `once:${options.triggerAt}:+${offset}`;
    case "daily":
      return `daily:${pad2(options.hour)}:${pad2(options.minute)}:+${offset}`;
    case "weekly":
      return `weekly:w${options.weekday}:${pad2(options.hour)}:${pad2(options.minute)}:+${offset}`;
    case "monthly":
      return `monthly:d${options.dayOfMonth}:${pad2(options.hour)}:${pad2(options.minute)}:+${offset}`;
    case "interval": {
      let anchorStr = "none";
      if (options.anchor !== undefined && options.anchor !== null) {
        if (options.anchor instanceof Date) {
          anchorStr = options.anchor.toISOString();
        } else if (typeof options.anchor === "number") {
          anchorStr = new Date(options.anchor).toISOString();
        } else {
          anchorStr = String(options.anchor);
        }
      }
      return `interval:${options.interval}:${options.unit}:${anchorStr}:+${offset}`;
    }
  }
}

export interface ParsedNotificationScheduleKey {
  type: NotificationScheduleType;
  offsetMinutes: number;
  triggerAt?: number;
  hour?: number;
  minute?: number;
  weekday?: number;
  dayOfMonth?: number;
  interval?: number;
  unit?: string;
  anchorEpoch?: number;
}

/**
 * Parses a deterministic schedule key back into its structural fields.
 *
 * Formats (see `buildNotificationScheduleKey`):
 * - once:      `once:<triggerAt>:+<offset>`
 * - daily:     `daily:<HH>:<mm>:+<offset>`
 * - weekly:    `weekly:w<weekday>:<HH>:<mm>:+<offset>`
 * - monthly:   `monthly:d<dayOfMonth>:<HH>:<mm>:+<offset>`
 * - interval:  `interval:<interval>:<unit>:<anchorIso>:+<offset>`
 *
 * Interval anchors are ISO strings containing colons, so the interval format is
 * matched greedily from the right (anchor runs up to the final `:+offset`).
 */
export function parseNotificationScheduleKey(
  key: string,
): ParsedNotificationScheduleKey | null {
  if (typeof key !== "string") return null;

  const once = key.match(/^once:(\d+):\+(\d+)$/);
  if (once) {
    return {
      type: "once",
      triggerAt: Number(once[1]),
      offsetMinutes: Number(once[2]),
    };
  }

  const daily = key.match(/^daily:(\d{1,2}):(\d{1,2}):\+(\d+)$/);
  if (daily) {
    return {
      type: "daily",
      hour: Number(daily[1]),
      minute: Number(daily[2]),
      offsetMinutes: Number(daily[3]),
    };
  }

  const weekly = key.match(/^weekly:w(\d{1,2}):(\d{1,2}):(\d{1,2}):\+(\d+)$/);
  if (weekly) {
    return {
      type: "weekly",
      weekday: Number(weekly[1]),
      hour: Number(weekly[2]),
      minute: Number(weekly[3]),
      offsetMinutes: Number(weekly[4]),
    };
  }

  const monthly = key.match(/^monthly:d(\d{1,2}):(\d{1,2}):(\d{1,2}):\+(\d+)$/);
  if (monthly) {
    return {
      type: "monthly",
      dayOfMonth: Number(monthly[1]),
      hour: Number(monthly[2]),
      minute: Number(monthly[3]),
      offsetMinutes: Number(monthly[4]),
    };
  }

  const interval = key.match(/^interval:(\d+):([a-z]+):(.+):\+(\d+)$/);
  if (interval) {
    const anchorEpoch = Number(new Date(interval[3]).getTime());
    if (!Number.isFinite(anchorEpoch)) return null;
    return {
      type: "interval",
      interval: Number(interval[1]),
      unit: interval[2],
      anchorEpoch,
      offsetMinutes: Number(interval[4]),
    };
  }

  return null;
}

function addOffsetToClock(
  hour: number,
  minute: number,
  offsetMinutes: number,
): { hour: number; minute: number } {
  const base = new Date(2020, 0, 1, hour, minute, 0, 0);
  base.setMinutes(base.getMinutes() + offsetMinutes);
  return { hour: base.getHours(), minute: base.getMinutes() };
}

/**
 * Computes the local wall-clock fire time (hour/minute) of a physical
 * notification from its deterministic schedule key.
 *
 * Used to answer "does this scheduled notification fire inside the current
 * quiet-hours window?" — matching the same per-offset clock check that
 * `scheduleReminderBatch` applies when the notification is created.
 *
 * Returns null when the key cannot be parsed or the fire time cannot be
 * determined (callers must then treat the notification as not blocked).
 */
export function getNotificationFireClock(
  scheduleKey: string,
): { hour: number; minute: number } | null {
  const parsed = parseNotificationScheduleKey(scheduleKey);
  if (!parsed) return null;

  if (parsed.type === "once" && parsed.triggerAt !== undefined) {
    const fire = new Date(
      parsed.triggerAt + parsed.offsetMinutes * 60 * 1000,
    );
    return { hour: fire.getHours(), minute: fire.getMinutes() };
  }

  if (
    (parsed.type === "daily" ||
      parsed.type === "weekly" ||
      parsed.type === "monthly") &&
    parsed.hour !== undefined &&
    parsed.minute !== undefined
  ) {
    return addOffsetToClock(parsed.hour, parsed.minute, parsed.offsetMinutes);
  }

  if (
    parsed.type === "interval" &&
    parsed.interval !== undefined &&
    parsed.unit !== undefined &&
    parsed.anchorEpoch !== undefined
  ) {
    const next = getNextIntervalOccurrenceEpoch(
      parsed.anchorEpoch,
      parsed.interval,
      parsed.unit,
      parsed.offsetMinutes,
      Date.now(),
    );
    const fire = new Date(next);
    return { hour: fire.getHours(), minute: fire.getMinutes() };
  }

  return null;
}

/**
 * Computes the expected schedule key for a specific notification slot
 * (escalation level and optional weekday) of an entity.
 */
export function getExpectedScheduleKeyForSlot(
  entity: {
    reminder?: { enabled?: boolean; triggerAt?: number };
    recurrence?: RecurrenceRule | null;
  },
  escalationLevel: number = 0,
  weekday?: number,
  escalationMinutes: number[] = [120, 240]
): string | null {
  if (!entity.reminder?.enabled || typeof entity.reminder?.triggerAt !== "number") {
    return null;
  }

  const offset = escalationLevel === 0 ? 0 : escalationMinutes[escalationLevel - 1];
  if (offset === undefined) {
    return null;
  }

  if (entity.recurrence) {
    const schedulerRecurrence = recurrenceRuleToScheduler(entity.recurrence);
    if (schedulerRecurrence) {
      if (schedulerRecurrence.type === "interval") {
        return buildNotificationScheduleKey({
          type: "interval",
          interval: schedulerRecurrence.interval || 1,
          unit: schedulerRecurrence.unit || "days",
          anchor: entity.reminder.triggerAt,
          offsetMinutes: offset,
        });
      }

      const triggerDate = new Date(entity.reminder.triggerAt);
      const hour = triggerDate.getHours();
      const minute = triggerDate.getMinutes();

      if (schedulerRecurrence.type === "daily") {
        return buildNotificationScheduleKey({
          type: "daily",
          hour,
          minute,
          offsetMinutes: offset,
        });
      }

      if (schedulerRecurrence.type === "weekly" || schedulerRecurrence.type === "weekdays") {
        const targetDays =
          schedulerRecurrence.type === "weekdays"
            ? [1, 2, 3, 4, 5]
            : (schedulerRecurrence.days && schedulerRecurrence.days.length > 0
                ? schedulerRecurrence.days
                : [triggerDate.getDay()]);

        const validPlatformWeekdays = targetDays.map((d) => Math.min(Math.max(1 + d, 1), 7));
        const chosenWeekday = weekday !== undefined ? weekday : validPlatformWeekdays[0];

        if (!validPlatformWeekdays.includes(chosenWeekday)) {
          return null; // Weekday is no longer part of active recurrence rule
        }

        return buildNotificationScheduleKey({
          type: "weekly",
          weekday: chosenWeekday,
          hour,
          minute,
          offsetMinutes: offset,
        });
      }

      if (schedulerRecurrence.type === "monthly") {
        return buildNotificationScheduleKey({
          type: "monthly",
          dayOfMonth: schedulerRecurrence.dayOfMonth || 1,
          hour,
          minute,
          offsetMinutes: offset,
        });
      }
    }
  }

  // One-time reminder
  return buildNotificationScheduleKey({
    type: "once",
    triggerAt: entity.reminder.triggerAt,
    offsetMinutes: offset,
  });
}

/**
 * Computes the full set of valid physical schedule keys for an active domain entity.
 */
export function getExpectedNotificationScheduleKeys(
  entity: {
    reminder?: { enabled?: boolean; triggerAt?: number };
    recurrence?: RecurrenceRule | null;
  },
  escalationMinutes: number[] = [120, 240]
): Set<string> {
  const keys = new Set<string>();

  if (!entity.reminder?.enabled || typeof entity.reminder?.triggerAt !== "number") {
    return keys;
  }

  const offsets = [0, ...escalationMinutes];

  if (entity.recurrence) {
    const schedulerRecurrence = recurrenceRuleToScheduler(entity.recurrence);
    if (schedulerRecurrence) {
      if (schedulerRecurrence.type === "interval") {
        const interval = schedulerRecurrence.interval || 1;
        const unit = schedulerRecurrence.unit || "days";
        const anchor = entity.reminder.triggerAt;
        for (const offset of offsets) {
          keys.add(buildNotificationScheduleKey({ type: "interval", interval, unit, anchor, offsetMinutes: offset }));
        }
        return keys;
      }

      const triggerDate = new Date(entity.reminder.triggerAt);
      const hour = triggerDate.getHours();
      const minute = triggerDate.getMinutes();

      if (schedulerRecurrence.type === "daily") {
        for (const offset of offsets) {
          keys.add(buildNotificationScheduleKey({ type: "daily", hour, minute, offsetMinutes: offset }));
        }
        return keys;
      }

      if (schedulerRecurrence.type === "weekly" || schedulerRecurrence.type === "weekdays") {
        const targetDays =
          schedulerRecurrence.type === "weekdays"
            ? [1, 2, 3, 4, 5]
            : (schedulerRecurrence.days && schedulerRecurrence.days.length > 0
                ? schedulerRecurrence.days
                : [triggerDate.getDay()]);

        for (const day of targetDays) {
          const platformWeekday = Math.min(Math.max(1 + day, 1), 7);
          for (const offset of offsets) {
            keys.add(
              buildNotificationScheduleKey({
                type: "weekly",
                weekday: platformWeekday,
                hour,
                minute,
                offsetMinutes: offset,
              })
            );
          }
        }
        return keys;
      }

      if (schedulerRecurrence.type === "monthly") {
        const dayOfMonth = schedulerRecurrence.dayOfMonth || 1;
        for (const offset of offsets) {
          keys.add(
            buildNotificationScheduleKey({
              type: "monthly",
              dayOfMonth,
              hour,
              minute,
              offsetMinutes: offset,
            })
          );
        }
        return keys;
      }
    }
  }

  // One-time reminder
  for (const offset of offsets) {
    keys.add(
      buildNotificationScheduleKey({
        type: "once",
        triggerAt: entity.reminder.triggerAt,
        offsetMinutes: offset,
      })
    );
  }

  return keys;
}

/**
 * Validates logical ownership of a notification payload:
 * Answers: "Does this notification belong to the specified entity and purpose?"
 */
export function isMatchingNotificationOwnership(
  data: {
    type?: string;
    itemId?: string;
    logicalSignature?: string;
    purpose?: string;
    escalationLevel?: number;
  } | undefined,
  entity: { id: string; reminder?: { enabled?: boolean; triggerAt?: number } },
  expectedKind: NotificationKind,
  purpose?: NotificationPurpose
): boolean {
  if (!data || data.type !== expectedKind || data.itemId !== entity.id) {
    return false;
  }

  if (!entity.reminder?.enabled || typeof entity.reminder?.triggerAt !== "number") {
    return false;
  }

  if (!data.logicalSignature) {
    return false;
  }

  // 1. Explicit purpose requested by caller: enforce exact purpose matching.
  if (purpose !== undefined) {
    if (data.purpose && data.purpose !== purpose) {
      return false;
    }

    const expectedSignature = buildNotificationLogicalSignature(expectedKind, entity.id, purpose);
    if (data.logicalSignature === expectedSignature) {
      return true;
    }

    // Legacy triggerAt signature compatibility: legacy notifications are primary reminders
    if (
      purpose === "reminder" &&
      (!data.escalationLevel || data.escalationLevel === 0) &&
      data.logicalSignature === entity.reminder.triggerAt.toString()
    ) {
      return true;
    }

    return false;
  }

  // 2. Broad lookup (no purpose specified by caller): preserve existing compatibility behavior.
  const inferredPurpose =
    data.purpose || (typeof data.escalationLevel === "number" && data.escalationLevel > 0 ? "escalation" : "reminder");
  const canonicalSignature = buildNotificationLogicalSignature(expectedKind, entity.id, inferredPurpose);
  if (data.logicalSignature === canonicalSignature) {
    return true;
  }

  // Also check primary reminder signature
  if (data.logicalSignature === buildNotificationLogicalSignature(expectedKind, entity.id, "reminder")) {
    return true;
  }

  // Also check escalation signature
  if (data.logicalSignature === buildNotificationLogicalSignature(expectedKind, entity.id, "escalation")) {
    return true;
  }

  // Legacy triggerAt signature compatibility (ONLY recognized for existing notifications, never generated)
  if (data.logicalSignature === entity.reminder.triggerAt.toString()) {
    return true;
  }

  return false;
}

/**
 * Validates physical schedule identity of a notification payload:
 * Answers: "Does this physical notification represent the current reminder generation/trigger?"
 */
export function isMatchingNotificationSchedule(
  data: {
    notificationScheduleKey?: string;
    logicalSignature?: string;
    escalationLevel?: number;
    weekday?: number;
  } | undefined,
  entity: {
    reminder?: { enabled?: boolean; triggerAt?: number };
    recurrence?: RecurrenceRule | null;
  }
): boolean {
  if (!entity.reminder?.enabled || typeof entity.reminder?.triggerAt !== "number") {
    return false;
  }

  const escalationLevel = data?.escalationLevel ?? 0;
  const weekday = data?.weekday;

  // 1. New deterministic schedule identity is present in payload
  if (data?.notificationScheduleKey) {
    const expectedKey = getExpectedScheduleKeyForSlot(entity, escalationLevel, weekday);
    if (!expectedKey) {
      return false;
    }
    return data.notificationScheduleKey === expectedKey;
  }

  // 2. Legacy compatibility: if notificationScheduleKey is missing,
  // ONLY accept legacy representation that can safely be proven current.
  // The only legacy representation encoding schedule information is primary one-time
  // where logicalSignature === entity.reminder.triggerAt.toString().
  if (
    !entity.recurrence &&
    escalationLevel === 0 &&
    data?.logicalSignature === entity.reminder.triggerAt.toString()
  ) {
    return true;
  }

  // Legacy notifications with generic logicalSignature (e.g. "todo:123:reminder")
  // cannot be proven current because they lack schedule versioning.
  return false;
}

/**
 * Validates BOTH logical ownership AND physical schedule identity:
 * A physical OS notification is valid ONLY when its logical owner AND its physical schedule
 * identity match the current domain reminder.
 */
export function isMatchingPhysicalNotification(
  data: {
    type?: string;
    itemId?: string;
    logicalSignature?: string;
    purpose?: string;
    escalationLevel?: number;
    notificationScheduleKey?: string;
    weekday?: number;
  } | undefined,
  entity: {
    id: string;
    reminder?: { enabled?: boolean; triggerAt?: number };
    recurrence?: RecurrenceRule | null;
  },
  expectedKind: NotificationKind,
  purpose?: NotificationPurpose
): boolean {
  if (!isMatchingNotificationOwnership(data, entity, expectedKind, purpose)) {
    return false;
  }
  return isMatchingNotificationSchedule(data, entity);
}

/**
 * Backward compatibility alias for isMatchingNotificationOwnership.
 */
export function isMatchingNotificationSignature(
  data: {
    type?: string;
    itemId?: string;
    logicalSignature?: string;
    purpose?: string;
    escalationLevel?: number;
  } | undefined,
  entity: { id: string; reminder?: { enabled?: boolean; triggerAt?: number } },
  expectedKind: NotificationKind,
  purpose?: NotificationPurpose
): boolean {
  return isMatchingNotificationOwnership(data, entity, expectedKind, purpose);
}
