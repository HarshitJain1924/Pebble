import {
  ChecklistRepository,
  HabitRepository,
  ResourceRepository,
  TaskRepository,
} from "@/repositories";
import {
  buildChecklist,
  buildHabit,
  buildResource,
  buildTask,
  computeTriggerAt,
  parseTime,
} from "@/features/capture/services/entity-factory.service";
import type { ParsedProductivityItem } from "@/features/capture/services/nlp-parser.service";
import { recordDailyHistorySnapshot } from "@/services/analytics/productivity-history.service";
import { emitStateChange } from "@/services/events/state-events";
import {
  rescheduleHabitReminders,
  rescheduleTodoReminders,
  scheduleReminderBatch,
} from "@/services/scheduling/reminders.service";
import {
  INBOX_WORKSPACE_ID,
  type Checklist,
  type Habit,
  type Resource,
  type Task,
} from "@/shared/types/domain.types";

/**
 * Options to control command side-effects.
 */
export interface CreateEntityOptions {
  /** Skip state event emission (useful for batch operations) */
  skipEvents?: boolean;
  /** Skip analytics snapshot trigger */
  skipAnalytics?: boolean;
}

/**
 * Type guard to check if input is a ParsedProductivityItem vs pre-built entity object.
 */
function isParsedProductivityItem(
  input: any,
): input is ParsedProductivityItem {
  return (
    typeof input === "object" &&
    input !== null &&
    typeof input.type === "string" &&
    typeof input.confidence === "number"
  );
}

/**
 * Unified notification scheduling for entity creation.
 *
 * Uses computeTriggerAt / parseTime from EntityFactory for consistent
 * time validation with the entity builders.
 */
async function scheduleCreationNotifications(
  kind: "todo" | "habit",
  entityId: string,
  item: ParsedProductivityItem,
): Promise<string[]> {
  const triggerAt = computeTriggerAt(item);
  if (triggerAt === undefined) return [];

  const { hours, minutes } = parseTime(item);
  if (hours === undefined || minutes === undefined) return [];

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
      `[EntityCommandService] Failed to schedule ${kind} reminder:`,
      e,
    );
    return [];
  }
}

/**
 * Schedule reminder notifications for a task input.
 */
async function scheduleTaskNotifications(
  taskId: string,
  item: ParsedProductivityItem,
): Promise<string[]> {
  return scheduleCreationNotifications("todo", taskId, item);
}

/**
 * Schedule reminder notifications for a habit input.
 */
async function scheduleHabitNotifications(
  habitId: string,
  item: ParsedProductivityItem,
): Promise<string[]> {
  return scheduleCreationNotifications("habit", habitId, item);
}

/**
 * EntityCommandService
 *
 * Single application-level command service responsible for executing entity creation commands.
 *
 * Orchestrates:
 *   Entity construction/normalization → Persistence → Notification scheduling → State events → Analytics
 */
export class EntityCommandService {
  /**
   * Create and persist a Task entity.
   */
  static async createTask(
    input: Task | ParsedProductivityItem,
    workspaceId: string = INBOX_WORKSPACE_ID,
    options?: CreateEntityOptions,
  ): Promise<Task> {
    let task: Task;

    if (isParsedProductivityItem(input)) {
      task = buildTask(input, workspaceId);
      const notificationIds = await scheduleTaskNotifications(task.id, input);
      if (notificationIds.length > 0 && task.reminder) {
        task.reminder.notificationIds = notificationIds;
      }
    } else {
      const targetWorkspace = input.workspaceId || workspaceId || INBOX_WORKSPACE_ID;
      task = {
        ...input,
        workspaceId: targetWorkspace,
        createdAt: input.createdAt || Date.now(),
        updatedAt: Date.now(),
        status: input.status || "todo",
        priority: input.priority || "none",
      };

      if (task.reminder?.enabled && task.reminder?.triggerAt) {
        try {
          task = await rescheduleTodoReminders(task);
        } catch (e) {
          console.warn("[EntityCommandService] Failed to reschedule task reminder:", e);
        }
      }
    }

    await TaskRepository.saveTask(task);

    if (!options?.skipEvents) {
      emitStateChange("tasks_changed");
    }

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    return task;
  }

  /**
   * Create and persist a Habit entity.
   */
  static async createHabit(
    input: Habit | ParsedProductivityItem,
    workspaceId: string = INBOX_WORKSPACE_ID,
    options?: CreateEntityOptions,
  ): Promise<Habit> {
    let habit: Habit;

    if (isParsedProductivityItem(input)) {
      habit = buildHabit(input, workspaceId);
      const notificationIds = await scheduleHabitNotifications(habit.id, input);
      if (notificationIds.length > 0 && habit.reminder) {
        habit.reminder.notificationIds = notificationIds;
      }
    } else {
      const targetWorkspace = input.workspaceId || workspaceId || INBOX_WORKSPACE_ID;
      habit = {
        ...input,
        workspaceId: targetWorkspace,
        createdAt: input.createdAt || Date.now(),
        updatedAt: Date.now(),
        completionHistory: input.completionHistory || [],
      };

      if (habit.reminder?.enabled) {
        try {
          habit = await rescheduleHabitReminders(habit);
        } catch (e) {
          console.warn("[EntityCommandService] Failed to reschedule habit reminder:", e);
        }
      }
    }

    await HabitRepository.saveHabit(habit);

    if (!options?.skipEvents) {
      emitStateChange("habits_changed");
    }

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    return habit;
  }

  /**
   * Create and persist a Checklist entity.
   */
  static async createChecklist(
    input: Checklist | ParsedProductivityItem,
    workspaceId: string = INBOX_WORKSPACE_ID,
    options?: CreateEntityOptions,
  ): Promise<Checklist> {
    let checklist: Checklist;

    if (isParsedProductivityItem(input)) {
      checklist = buildChecklist(input, workspaceId);
    } else {
      const targetWorkspace = input.workspaceId || workspaceId || INBOX_WORKSPACE_ID;
      checklist = {
        ...input,
        workspaceId: targetWorkspace,
        createdAt: input.createdAt || Date.now(),
        updatedAt: Date.now(),
        items: input.items || [],
      };
    }

    await ChecklistRepository.saveChecklist(checklist);

    if (!options?.skipEvents) {
      emitStateChange("checklists_changed");
    }

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    return checklist;
  }

  /**
   * Create and persist a Resource entity.
   */
  static async createResource(
    input: Resource | ParsedProductivityItem,
    workspaceId: string = INBOX_WORKSPACE_ID,
    options?: CreateEntityOptions,
  ): Promise<Resource> {
    let resource: Resource;

    if (isParsedProductivityItem(input)) {
      resource = buildResource(input, workspaceId);
    } else {
      const targetWorkspace = input.workspaceId || workspaceId || INBOX_WORKSPACE_ID;
      resource = {
        ...input,
        workspaceId: targetWorkspace,
        createdAt: input.createdAt || Date.now(),
        updatedAt: Date.now(),
        tags: input.tags || [],
      };
    }

    await ResourceRepository.saveResource(resource);

    if (!options?.skipEvents) {
      emitStateChange("resources_changed");
    }

    if (!options?.skipAnalytics) {
      void recordDailyHistorySnapshot().catch(() => {});
    }

    return resource;
  }
}
