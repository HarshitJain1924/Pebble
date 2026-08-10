/**
 * EntityFactory
 * ─────────────────
 * PURE entity builder for Quick Capture.
 *
 * The ONLY responsibility is converting ParsedProductivityItem into
 * canonical Pebble domain entities (Task, Habit, Checklist, Resource).
 *
 * NO side effects:
 *   - Does NOT schedule reminders
 *   - Does NOT call repositories
 *   - Does NOT emit events
 *   - Does NOT record analytics
 *
 * CaptureService owns orchestration. EntityFactory owns construction.
 *
 * Future entity types: create a new build* function here.
 */

import {
  INBOX_WORKSPACE_ID,
  type Task,
  type Habit,
  type Checklist,
  type Resource,
  type RecurrenceRule,
  type Attachment,
} from "@/shared/types/domain.types";
import { type ParsedProductivityItem } from "@/features/capture/services/nlp-parser.service";
import { getDateKey } from "@/services/scheduling/recurrence.service";

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateId(prefix: string = ""): string {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function parseTime(item: ParsedProductivityItem): {
  hours: number | undefined;
  minutes: number | undefined;
} {
  if (!item.time) return { hours: undefined, minutes: undefined };
  const [h, m] = item.time.split(":").map(Number);
  return { hours: h, minutes: m };
}

/**
 * Compute the epoch triggerAt for a parsed item.
 *
 * Priority:
 *   1. If date + time are specified and future → use exact date+time
 *   2. If only time is specified → use today at that time
 *   3. Otherwise → undefined
 */
export function computeTriggerAt(item: ParsedProductivityItem): number | undefined {
  const { hours, minutes } = parseTime(item);
  if (hours === undefined || minutes === undefined) return undefined;

  if (item.date && item.date !== "inbox") {
    const date = new Date(`${item.date}T${item.time}:00`);
    if (item.reminderOffsetMinutes) {
      date.setMinutes(date.getMinutes() - item.reminderOffsetMinutes);
    }
    if (date.getTime() > Date.now()) return date.getTime();
    // Past time on the specified date — don't schedule a stale reminder
    return undefined;
  }

  // Inbox or no date: use today at the specified time
  const todayAtTime = new Date();
  todayAtTime.setHours(hours, minutes, 0, 0);
  if (item.reminderOffsetMinutes) {
    todayAtTime.setMinutes(todayAtTime.getMinutes() - item.reminderOffsetMinutes);
  }
  if (todayAtTime.getTime() > Date.now()) return todayAtTime.getTime();
  // Time already passed today — don't schedule a stale reminder
  return undefined;
}

/**
 * Map parser recurrence → canonical RecurrenceRule.
 *
 * Parser uses:  type: "daily" | "weekdays" | "weekly" | "monthly" | "interval"
 * Canonical:    frequency: "daily" | "weekly" | "monthly" | "yearly" | "custom"
 */
export function buildRecurrenceRule(
  parserRecurrence: NonNullable<ParsedProductivityItem["recurrence"]>,
): RecurrenceRule {
  const frequencyMap: Record<string, RecurrenceRule["frequency"]> = {
    daily: "daily",
    weekdays: "weekly",
    weekly: "weekly",
    monthly: "monthly",
    interval: "custom",
  };

  return {
    frequency: frequencyMap[parserRecurrence.type] || "daily",
    interval: parserRecurrence.interval || 1,
    unit: parserRecurrence.unit,
    daysOfWeek:
      parserRecurrence.type === "weekdays"
        ? [1, 2, 3, 4, 5]
        : parserRecurrence.days,
    dayOfMonth: parserRecurrence.dayOfMonth,
  };
}

// ─── Public API (PURE — no side effects) ────────────────────────────────────

/**
 * Build a Task from a parsed item.
 * Returns a canonical Task entity. Does NOT save or schedule.
 * The reminder field includes triggerAt (if a time was parsed) but
 * notificationIds are filled in later by CaptureService after scheduling.
 */
export function buildTask(
  item: ParsedProductivityItem,
  workspaceId: string = INBOX_WORKSPACE_ID,
): Task {
  const id = `task-${generateId()}`;
  const triggerAt = computeTriggerAt(item);

  const priorityMap: Record<string, Task["priority"]> = {
    high: "high",
    medium: "medium",
    low: "low",
  };

  return {
    id,
    workspaceId,
    title: item.title,
    status: "todo",
    priority: priorityMap[item.priority || "medium"] || "medium",
    categoryId: item.category || "work",
    schedule: {
      date: item.date || (item.time ? getDateKey() : "inbox"),
    },
    reminder: triggerAt
      ? { enabled: true, triggerAt, notificationIds: undefined }
      : undefined,
    recurrence: item.recurrence ? buildRecurrenceRule(item.recurrence) : undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Build a Habit from a parsed item.
 * Habits always have a daily recurrence if none was parsed.
 */
export function buildHabit(
  item: ParsedProductivityItem,
  workspaceId: string = INBOX_WORKSPACE_ID,
): Habit {
  const id = `habit-${generateId()}`;
  const triggerAt = computeTriggerAt(item);

  const persistedRecurrence: RecurrenceRule = item.recurrence
    ? buildRecurrenceRule(item.recurrence)
    : { frequency: "daily", interval: 1 };

  return {
    id,
    workspaceId,
    title: item.title,
    categoryId: item.category || "health",
    recurrence: persistedRecurrence,
    completionHistory: [],
    reminder: triggerAt
      ? { enabled: true, triggerAt, notificationIds: undefined }
      : undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Build a Checklist from a parsed item.
 */
export function buildChecklist(
  item: ParsedProductivityItem,
  workspaceId: string = INBOX_WORKSPACE_ID,
): Checklist {
  const id = `checklist-${generateId()}`;
  const itemsArray = item.items || [];

  return {
    id,
    workspaceId,
    title: item.title,
    items: itemsArray.map((title, index) => ({
      id: `${id}-item-${index}`,
      title,
      completed: false,
    })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Build a Resource (note, link, idea) from a parsed item.
 */
export function buildResource(
  item: ParsedProductivityItem,
  workspaceId: string = INBOX_WORKSPACE_ID,
): Resource {
  const id = `res-${generateId()}`;

  const typeMap: Record<string, Resource["type"]> = {
    note: "note",
    idea: "idea",
    link: "link",
    file: "note",
  };

  return {
    id,
    workspaceId,
    type: typeMap[item.type] || "note",
    title: item.title,
    body: item.type === "link" ? item.url || item.title : undefined,
    attachments: item.attachments && item.attachments.length > 0 ? item.attachments : undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
