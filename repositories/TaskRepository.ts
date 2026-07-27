/**
 * TaskRepository.ts
 * ────────────────────────
 * Task persistence — partitioned by workspaceId using canonical Task model.
 */
import {
  DEFAULT_WORKSPACE_ID,
  type RecurrenceRule,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/shared/types/domain.types";
import AsyncStorage from "@react-native-async-storage/async-storage";

export function normalizeTask(rawTask: any, defaultWorkspaceId: string): Task {
  const wsId = rawTask.workspaceId || rawTask.folderId || defaultWorkspaceId;
  const status: TaskStatus = rawTask.status
    ? rawTask.status
    : rawTask.completed
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

  // Construct reminder if present
  let reminder = rawTask.reminder;
  if (!reminder && (rawTask.alarmTime || rawTask.notificationIds)) {
    reminder = {
      enabled: true,
      triggerAt: rawTask.alarmTime || Date.now(),
      notificationIds:
        rawTask.notificationIds ||
        (rawTask.alarmId ? [rawTask.alarmId] : undefined),
    };
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

  return {
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
      return normalizeTask(rawTask, workspaceId);
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
    const workspaceId = task.workspaceId || DEFAULT_WORKSPACE_ID;
    const key = this.getTasksKey(workspaceId);
    const records = await this.getTasks(workspaceId);

    const cleanTask: Task = normalizeTask(task, workspaceId);
    cleanTask.updatedAt = Date.now();

    records[task.id] = cleanTask;
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
        workspaceId || task.workspaceId || DEFAULT_WORKSPACE_ID;
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
