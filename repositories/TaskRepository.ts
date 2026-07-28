/**
 * TaskRepository.ts
 * ────────────────────────
 * Task persistence — partitioned by workspaceId using canonical Task model.
 */
import {
  INBOX_WORKSPACE_ID,
  type RecurrenceRule,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/shared/types/domain.types";
import AsyncStorage from "@react-native-async-storage/async-storage";

export function normalizeTask(rawTask: any, defaultWorkspaceId: string): Task {
  console.log("[DEBUG-4] task entering normalizeTask():", JSON.stringify({ id: rawTask.id, title: rawTask.title, categoryId: rawTask.categoryId, category: rawTask.category, scheduledDate: rawTask.scheduledDate, schedule: rawTask.schedule, reminder: rawTask.reminder, reminderHour: rawTask.reminderHour, alarmTime: rawTask.alarmTime, workspaceId: rawTask.workspaceId, recurrence: rawTask.recurrence, linkedCollectionIds: rawTask.linkedCollectionIds, resourceIds: rawTask.resourceIds }, null, 2));
  const wsId = rawTask.workspaceId || defaultWorkspaceId;
  const status: TaskStatus =
    rawTask.status === "completed" || rawTask.completed === true
      ? "completed"
      : "todo";

  let priority: TaskPriority = "none";
  if (rawTask.priority) {
    if (["none", "low", "medium", "high"].includes(rawTask.priority)) {
      priority = rawTask.priority as TaskPriority;
    }
  }

  // Construct schedule if present
  let schedule = rawTask.schedule;
  if (!schedule) {
    const date = rawTask.scheduledDate || rawTask.dueDate;
    const startTime = rawTask.scheduledTime;
    if (date || startTime) {
      schedule = {
        date: date || undefined,
        startTime: startTime || undefined,
        endTime: rawTask.endTime || undefined,
        allDay: rawTask.allDay ?? !startTime,
      };
    }
  }

  // Construct canonical Reminder from legacy flat fields if not already present.
  // Only reconstruct when alarmTime is a valid number — never fall back to Date.now()
  // because that would silently corrupt the stored timestamp.
  let reminder = rawTask.reminder;
  if (!reminder && typeof rawTask.alarmTime === "number") {
    reminder = {
      enabled: true,
      triggerAt: rawTask.alarmTime,
      notificationIds:
        rawTask.notificationIds ||
        (rawTask.alarmId ? [rawTask.alarmId] : undefined),
    };
  }

  // Warn about legacy records that have notificationIds but no alarmTime.
  // These cannot be reconstructed into a valid canonical Reminder and would
  // have silently produced Date.now() under the old fallback.
  if (!reminder && rawTask.notificationIds?.length && rawTask.alarmTime == null) {
    console.warn(
      "[Reminder] Legacy task " + rawTask.id + " has notificationIds but no alarmTime — reminder not reconstructed"
    );
  }

  // Normalize recurrence
  let recurrence = rawTask.recurrence;
  if (!recurrence && rawTask.recurrenceConfig) {
    const rc = rawTask.recurrenceConfig;
    let freq: RecurrenceRule["frequency"] = "daily";
    if (rc.type === "weekly" || rc.type === "weekdays") freq = "weekly";
    else if (rc.type === "monthly") freq = "monthly";
    recurrence = {
      frequency: freq,
      interval: rc.interval || 1,
      daysOfWeek: rc.days,
      dayOfMonth: rc.dayOfMonth,
    };
  } else if (recurrence && recurrence.type) {
    // Legacy inline recurrence mapping
    let freq: RecurrenceRule["frequency"] = "daily";
    if (recurrence.type === "weekly" || recurrence.type === "weekdays")
      freq = "weekly";
    else if (recurrence.type === "monthly") freq = "monthly";
    else if (recurrence.type === "interval") freq = "custom";
    recurrence = {
      frequency: freq,
      interval: recurrence.interval || 1,
      daysOfWeek: recurrence.days,
      dayOfMonth: recurrence.dayOfMonth,
    };
  }

  // Normalize resourceIds
  let resourceIds = rawTask.resourceIds || [];
  if (rawTask.resourceId && !resourceIds.includes(rawTask.resourceId)) {
    resourceIds.push(rawTask.resourceId);
  }
  if (Array.isArray(rawTask.linkedResourceIds)) {
    rawTask.linkedResourceIds.forEach((rid: string) => {
      if (!resourceIds.includes(rid)) resourceIds.push(rid);
    });
  }

  const result = {
    id: rawTask.id,
    workspaceId: wsId,
    title: rawTask.title || "",
    description: rawTask.description || undefined,
    categoryId: rawTask.categoryId || rawTask.category || undefined,
    tags: rawTask.tags || undefined,
    status,
    priority,
    schedule: schedule || undefined,
    reminder: reminder || undefined,
    recurrence: recurrence || undefined,
    resourceIds: resourceIds.length > 0 ? resourceIds : undefined,
    createdAt: rawTask.createdAt || Date.now(),
    updatedAt: rawTask.updatedAt || Date.now(),
    completedAt:
      rawTask.completedAt || (status === "completed" ? Date.now() : undefined),
    archivedAt:
      rawTask.archivedAt || (rawTask.archived ? Date.now() : undefined),
  };
  console.log("[DEBUG-5] cleanTask leaving normalizeTask():", JSON.stringify({ id: result.id, title: result.title, categoryId: result.categoryId, schedule: result.schedule, reminder: result.reminder, workspaceId: result.workspaceId, recurrence: result.recurrence, resourceIds: result.resourceIds }, null, 2));
  return result;
}

export class TaskRepository {
  private static validateId(id: unknown, method: string): asserts id is string {
    if (
      id === undefined ||
      id === null ||
      typeof id !== "string" ||
      id.trim().length === 0
    ) {
      throw new Error(`TaskRepository.${method}: task.id is required`);
    }
  }

  private static getTasksKey(workspaceId: string) {
    return `pebble:v1:tasks:${workspaceId}`;
  }

  private static getLegacyTasksKey(workspaceId: string) {
    return `pebble:core:tasks:${workspaceId}`;
  }

  static async getTask(id: string, workspaceId: string): Promise<Task | null> {
    const key = this.getTasksKey(workspaceId);
    let raw = await AsyncStorage.getItem(key);
    if (!raw) {
      raw = await AsyncStorage.getItem(this.getLegacyTasksKey(workspaceId));
    }
    if (!raw) return null;
    const records: Record<string, any> = JSON.parse(raw);
    const rawTask = records[id] || null;
    if (rawTask) {
      const result = normalizeTask(rawTask, workspaceId);
      console.log("[DEBUG-7] object returned by getTask():", JSON.stringify({ id: result.id, title: result.title, categoryId: result.categoryId, schedule: result.schedule, reminder: result.reminder, workspaceId: result.workspaceId, recurrence: result.recurrence, resourceIds: result.resourceIds }, null, 2));
      return result;
    }
    return null;
  }

  static async getTasks(workspaceId: string): Promise<Record<string, Task>> {
    const key = this.getTasksKey(workspaceId);
    let raw = await AsyncStorage.getItem(key);
    if (!raw) {
      raw = await AsyncStorage.getItem(this.getLegacyTasksKey(workspaceId));
    }
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const records: Record<string, Task> = {};
    Object.entries(parsed).forEach(([id, rawTask]: [string, any]) => {
      records[id] = normalizeTask(rawTask, workspaceId);
    });
    return records;
  }

  static async saveTask(task: any): Promise<void> {
    this.validateId(task?.id, "saveTask");
    const workspaceId = task.workspaceId || INBOX_WORKSPACE_ID;
    const key = this.getTasksKey(workspaceId);
    const records = await this.getTasks(workspaceId);

    const cleanTask: Task = normalizeTask(task, workspaceId);
    cleanTask.updatedAt = Date.now();

    // Pre-persistence guard: catch any code path that produces an enabled
    // reminder with an invalid triggerAt (e.g. Date.now() instead of the
    // user-selected time). This would have been silently persisted before.
    const validTrigger =
      Number.isFinite(cleanTask.reminder?.triggerAt) &&
      (cleanTask.reminder?.triggerAt ?? 0) > 0;
    if (cleanTask.reminder?.enabled && !validTrigger) {
      console.warn(
        "[Reminder] Invalid triggerAt on task " + cleanTask.id + " before persistence",
        cleanTask.reminder
      );
    }

    records[task.id] = cleanTask;
    const toWrite = JSON.parse(JSON.stringify(records)); // clone to avoid mutation
    console.log("[DEBUG-6] object written to AsyncStorage:", JSON.stringify({ key, records: Object.fromEntries(Object.entries(toWrite).map(([id, t]: [string, any]) => [id, { id: t.id, title: t.title, categoryId: t.categoryId, schedule: t.schedule, reminder: t.reminder, workspaceId: t.workspaceId, recurrence: t.recurrence, resourceIds: t.resourceIds }])) }, null, 2));
    await AsyncStorage.setItem(key, JSON.stringify(records));
  }

  static async saveTasks(tasks: any[], workspaceId: string): Promise<void> {
    for (const task of tasks) {
      this.validateId(task?.id, "saveTasks");
    }
    const key = this.getTasksKey(workspaceId);
    const records = await this.getTasks(workspaceId);

    for (const task of tasks) {
      const targetWorkspaceId =
        workspaceId || task.workspaceId || INBOX_WORKSPACE_ID;
      const cleanTask: Task = normalizeTask(task, targetWorkspaceId);
      cleanTask.updatedAt = Date.now();
      records[task.id] = cleanTask;
    }
    await AsyncStorage.setItem(key, JSON.stringify(records));
  }

  static async deleteTask(id: string, workspaceId: string): Promise<void> {
    const key = this.getTasksKey(workspaceId);
    const records = await this.getTasks(workspaceId);
    if (records[id]) {
      delete records[id];
      await AsyncStorage.setItem(key, JSON.stringify(records));
    }
  }
}
