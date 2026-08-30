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
import { parseTimeString } from "@/services/scheduling/scheduling.service";
import { generateId } from "@/shared/utils/id";
import { computeTriggerEpoch } from "@/features/details/task/hooks/useTaskDetailForm";

export function parseTime(item: ParsedProductivityItem): {
  hours: number | undefined;
  minutes: number | undefined;
} {
  const timeToUse = item.reminderTime || item.time;
  if (!timeToUse) return { hours: undefined, minutes: undefined };
  const [h, m] = timeToUse.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return { hours: undefined, minutes: undefined };
  return { hours: h, minutes: m };
}

/**
 * Compute the epoch triggerAt for a parsed item.
 *
 * ONLY computes a trigger timestamp when a reminder was explicitly requested
 * (e.g. "remind me 30 minutes before", "remind me at 7 PM", "remind me to...", etc.).
 * A schedule time alone (e.g. "Study Kubernetes at 8 PM") is strictly for calendar/timeline
 * and does NOT create a reminder.
 */
export function computeTriggerAt(item: ParsedProductivityItem): number | undefined {
  if (!item.explicitReminder && item.reminderOffsetMinutes === undefined) {
    return undefined;
  }

  const { hours, minutes } = parseTime(item);
  if (hours === undefined || minutes === undefined) return undefined;

  const targetDateStr = item.date && item.date !== "inbox" ? item.date : undefined;
  let epoch = computeTriggerEpoch(hours, minutes, targetDateStr);
  if (item.reminderOffsetMinutes) {
    epoch -= item.reminderOffsetMinutes * 60 * 1000;
  }
  return epoch;
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

  const parsedTime = parseTimeString(item.time);
  const formattedStartTime = parsedTime
    ? `${String(parsedTime.hour).padStart(2, "0")}:${String(parsedTime.minute).padStart(2, "0")}`
    : undefined;

  return {
    id,
    workspaceId,
    title: item.title,
    status: "todo",
    priority: priorityMap[item.priority || "medium"] || "medium",
    categoryId: item.category || "work",
    schedule: {
      date: item.date || (formattedStartTime ? getDateKey() : "inbox"),
      startTime: formattedStartTime,
    },
    reminder: triggerAt
      ? { enabled: true, triggerAt, notificationIds: undefined }
      : undefined,
    recurrence: item.recurrence ? buildRecurrenceRule(item.recurrence) : undefined,
    lifecycleGeneration: 1,
    revision: 1,
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

  const parsedTime = parseTimeString(item.time);
  const formattedStartTime = parsedTime
    ? `${String(parsedTime.hour).padStart(2, "0")}:${String(parsedTime.minute).padStart(2, "0")}`
    : undefined;

  return {
    id,
    workspaceId,
    title: item.title,
    categoryId: item.category || "health",
    recurrence: persistedRecurrence,
    completionHistory: [],
    schedule: formattedStartTime ? { startTime: formattedStartTime } : undefined,
    reminder: triggerAt
      ? { enabled: true, triggerAt, notificationIds: undefined }
      : undefined,
    lifecycleGeneration: 1,
    revision: 1,
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
    lifecycleGeneration: 1,
    revision: 1,
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
    lifecycleGeneration: 1,
    revision: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
