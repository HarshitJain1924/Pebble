import type { ParsedProductivityItem } from "@/features/capture/services/nlp-parser.service";
import { computeTriggerAt, parseTime } from "@/features/capture/services/entity-factory.service";
import { scheduleReminderBatch } from "@/services/scheduling/reminders.service";
import { buildNotificationLogicalSignature } from "@/services/notifications/notification-identity";

/**
 * Unified notification scheduling for entity creation.
 *
 * Uses computeTriggerAt / parseTime from EntityFactory for consistent
 * time validation with the entity builders.
 */
export async function scheduleCreationNotifications(
  kind: "todo" | "habit",
  entityId: string,
  item: ParsedProductivityItem | any,
): Promise<string[]> {
  const triggerAt = item.reminder?.triggerAt ?? computeTriggerAt(item);
  if (triggerAt === undefined) return [];

  let { hours, minutes } = parseTime(item);
  if (hours === undefined || minutes === undefined) {
    if (triggerAt) {
      const d = new Date(triggerAt);
      hours = d.getHours();
      minutes = d.getMinutes();
    } else {
      return [];
    }
  }

  const category = item.category || (kind === "todo" ? "work" : "personal");
  const channelId =
    kind === "todo"
      ? `task_reminders_${category}`
      : `habit_reminders_${category}`;

  try {
    if (kind === "todo" && !item.recurrence) {
      // One-time task notification
      const batch = await scheduleReminderBatch({
        kind: "todo",
        itemId: entityId,
        title: item.title,
        oneTimeAt: new Date(triggerAt),
        category,
        channelId,
      });
      return batch.ids;
    }

    // Recurring (task with recurrence OR any habit)
    const scheduled = await scheduleReminderBatch({
      kind,
      itemId: entityId,
      title: item.title,
      category,
      dailyTime: { hour: hours, minute: minutes },
      dailyDays:
        item.recurrence?.type === "weekdays"
          ? [1, 2, 3, 4, 5]
          : item.recurrence?.days,
      recurrence: item.recurrence,
      escalationMinutes: [120, 240],
      channelId,
      context:
        kind === "todo"
          ? { title: item.title, remainingCount: 1, totalCount: 1 }
          : { title: item.title, streak: 0 },
    });
    return scheduled.ids;
  } catch (e) {
    console.error(
      `[CommandNotifications] Failed to schedule ${kind} reminder:`,
      e,
    );
    return [];
  }
}

/**
 * Schedule reminder notifications for a task input.
 */
export async function scheduleTaskNotifications(
  taskId: string,
  item: ParsedProductivityItem,
): Promise<string[]> {
  return scheduleCreationNotifications("todo", taskId, item);
}

/**
 * Schedule reminder notifications for a habit input.
 */
export async function scheduleHabitNotifications(
  habitId: string,
  item: ParsedProductivityItem,
): Promise<string[]> {
  return scheduleCreationNotifications("habit", habitId, item);
}
