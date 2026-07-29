/**
 * CaptureService
 * ─────────────────
 * Orchestrator for Quick Capture.
 *
 * Coordinates the complete save workflow:
 *   1. EntityFactory.build*() — pure entity construction
 *   2. scheduleReminderBatch() — notification scheduling (task/habit only)
 *   3. Repository.save*() — persistence (canonical model)
 *   4. emitStateChange() — global UI refresh
 *   5. recordDailyHistorySnapshot() — analytics
 *
 * This is the SINGLE entry point for creating entities from capture.
 * No screen, component, or hook should duplicate this workflow.
 */

import { Platform } from "react-native";
import {
  INBOX_WORKSPACE_ID,
  type Task,
  type Habit,
  type Checklist,
  type Resource,
} from "@/shared/types/domain.types";
import { type ParsedProductivityItem } from "@/features/capture/services/nlp-parser.service";
import {
  TaskRepository,
  HabitRepository,
  ChecklistRepository,
  ResourceRepository,
} from "@/repositories";
import {
  buildTask,
  buildHabit,
  buildChecklist,
  buildResource,
  computeTriggerAt,
  parseTime,
} from "@/features/capture/services/entity-factory.service";
import { scheduleReminderBatch } from "@/services/scheduling/reminders.service";
import { emitStateChange } from "@/services/events/state-events";
import { recordDailyHistorySnapshot } from "@/services/analytics/productivity-history.service";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Schedule notifications for a task or habit.
 * Returns the notificationIds to attach to the entity's reminder.
 * If no time is set or the time is in the past, returns [].
 */
async function scheduleNotifications(
  kind: "todo" | "habit",
  itemId: string,
  item: ParsedProductivityItem,
): Promise<string[]> {
  const triggerAt = computeTriggerAt(item);
  if (triggerAt === undefined) return [];

  const { hours, minutes } = parseTime(item);
  if (hours === undefined || minutes === undefined) return [];

  const category = item.category || (kind === "todo" ? "work" : "health");
  const channelId =
    Platform.OS === "android"
      ? kind === "todo"
        ? "todo-reminders"
        : "daily-habits"
      : undefined;

  try {
    if (item.recurrence) {
      // Recurring: daily time + recurrence rule
      const scheduled = await scheduleReminderBatch({
        kind,
        itemId,
        title: item.title,
        category,
        dailyTime: { hour: hours, minute: minutes },
        dailyDays:
          item.recurrence.type === "weekdays"
            ? [1, 2, 3, 4, 5]
            : item.recurrence.days,
        recurrence: item.recurrence,
        escalationMinutes: [120, 240],
        channelId,
        context: { title: item.title, remainingCount: 1, totalCount: 1 },
      });
      return scheduled.ids;
    }

    // One-time: exact date+time or today+time
    const oneTimeAt =
      item.date && item.date !== "inbox"
        ? new Date(`${item.date}T${item.time}:00`)
        : (() => {
            const d = new Date();
            d.setHours(hours, minutes, 0, 0);
            return d;
          })();

    const batch = await scheduleReminderBatch({
      kind,
      itemId,
      title: item.title,
      oneTimeAt,
      category,
      channelId,
    });
    return batch.ids;
  } catch (e) {
    console.error(`[CaptureService] Failed to schedule ${kind} reminder:`, e);
    return [];
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export type SavedEntity = Task | Habit | Checklist | Resource;

/**
 * Save a parsed productivity item through the complete capture pipeline.
 *
 * Orchestrates:
 *   Entity construction → Reminder scheduling → Persistence → State events
 *
 * @returns The saved canonical entity.
 */
export async function saveParsedItem(
  item: ParsedProductivityItem,
  workspaceId: string = INBOX_WORKSPACE_ID,
): Promise<SavedEntity> {
  let entity: SavedEntity;

  switch (item.type) {
    case "task": {
      const task = buildTask(item, workspaceId);
      const notificationIds = await scheduleNotifications("todo", task.id, item);
      if (notificationIds.length > 0 && task.reminder) {
        task.reminder.notificationIds = notificationIds;
      }
      await TaskRepository.saveTask(task);
      emitStateChange("tasks_changed");
      entity = task;
      break;
    }

    case "habit": {
      const habit = buildHabit(item, workspaceId);
      const notificationIds = await scheduleNotifications("habit", habit.id, item);
      if (notificationIds.length > 0 && habit.reminder) {
        habit.reminder.notificationIds = notificationIds;
      }
      await HabitRepository.saveHabit(habit);
      emitStateChange("habits_changed");
      entity = habit;
      break;
    }

    case "checklist": {
      const checklist = buildChecklist(item, workspaceId);
      await ChecklistRepository.saveChecklist(checklist);
      emitStateChange("checklists_changed");
      entity = checklist;
      break;
    }

    case "note":
    case "idea":
    case "link":
    case "file": {
      const resource = buildResource(item, workspaceId);
      await ResourceRepository.saveResource(resource);
      emitStateChange("resources_changed");
      entity = resource;
      break;
    }

    default: {
      // Fallback: treat as task
      const task = buildTask(item, workspaceId);
      const notificationIds = await scheduleNotifications("todo", task.id, item);
      if (notificationIds.length > 0 && task.reminder) {
        task.reminder.notificationIds = notificationIds;
      }
      await TaskRepository.saveTask(task);
      emitStateChange("tasks_changed");
      entity = task;
    }
  }

  // Record analytics snapshot (fire-and-forget)
  try {
    await recordDailyHistorySnapshot();
  } catch {
    // Analytics failure is non-blocking
  }

  return entity;
}
