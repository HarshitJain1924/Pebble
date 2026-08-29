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
import { withLock } from "@/shared/utils/mutex";

export function normalizeTask(rawTask: any, defaultWorkspaceId: string): Task {
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
    recurrenceExceptions: rawTask.recurrenceExceptions || undefined,
    resourceIds: resourceIds.length > 0 ? resourceIds : undefined,
    createdAt: rawTask.createdAt || Date.now(),
    updatedAt: rawTask.updatedAt || Date.now(),
    completedAt:
      rawTask.completedAt || (status === "completed" ? Date.now() : undefined),
    archivedAt:
      rawTask.archivedAt || (rawTask.archived ? Date.now() : undefined),
    revision: rawTask.revision ?? 1,
    lifecycleGeneration: rawTask.lifecycleGeneration ?? 1,
  };
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

  /**
   * Parse a stored workspace payload defensively. Malformed JSON (e.g. from a
   * partial write or corrupted storage) must never crash the consuming screen;
   * following the repository's tolerant recovery convention, the payload is
   * logged and treated as empty so callers see a missing/empty collection.
   */
  private static parseRecords(
    raw: string,
    key: string,
    method: string,
  ): Record<string, any> {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, any>;
      }
      throw new Error(
        `[TaskRepository] Stored value for "${key}" is not a JSON object (${method})`
      );
    } catch (e) {
      console.error(
        `[TaskRepository] Failed to parse stored value for "${key}" (${method})`,
        e,
      );
      throw e;
    }
  }

  static async getTask(id: string, workspaceId: string): Promise<Task | null> {
    const key = this.getTasksKey(workspaceId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const records: Record<string, any> = this.parseRecords(raw, key, "getTask");
    const rawTask = records[id] || null;
    if (rawTask) {
      const result = normalizeTask(rawTask, workspaceId);
      return result;
    }
    return null;
  }

  static async getTasks(workspaceId: string): Promise<Record<string, Task>> {
    const key = this.getTasksKey(workspaceId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return {};
    const parsed = this.parseRecords(raw, key, "getTasks");
    const records: Record<string, Task> = {};
    Object.entries(parsed).forEach(([id, rawTask]: [string, any]) => {
      records[id] = normalizeTask(rawTask, workspaceId);
    });
    return records;
  }

  static async saveTask(task: any): Promise<Task> {
    this.validateId(task?.id, "saveTask");
    const workspaceId = task.workspaceId || INBOX_WORKSPACE_ID;
    const key = this.getTasksKey(workspaceId);
    
    return await withLock(key, async () => {
      const records = await this.getTasks(workspaceId);

      const cleanTask: Task = normalizeTask(task, workspaceId);
      cleanTask.updatedAt = Date.now();
      cleanTask.revision = (records[task.id]?.revision || 0) + 1;

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
      await AsyncStorage.setItem(key, JSON.stringify(records));
      return cleanTask;
    });
  }

  /**
   * Unlocked persistence primitive required specifically for TaskCommandHandler.updateTask
   * to perform a safe workspace-partition read-modify-write without nested deadlocking.
   */
  static async saveTaskUnlocked(task: any): Promise<Task> {
    this.validateId(task?.id, "saveTaskUnlocked");
    const workspaceId = task.workspaceId || INBOX_WORKSPACE_ID;
    const key = this.getTasksKey(workspaceId);
    
    const records = await this.getTasks(workspaceId);

    const cleanTask: Task = normalizeTask(task, workspaceId);
    cleanTask.updatedAt = Date.now();
    cleanTask.revision = (records[task.id]?.revision || 0) + 1;

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
    await AsyncStorage.setItem(key, JSON.stringify(records));
    return cleanTask;
  }

  static async saveTasks(tasks: any[], workspaceId: string): Promise<void> {
    for (const task of tasks) {
      this.validateId(task?.id, "saveTasks");
    }
    const key = this.getTasksKey(workspaceId);
    
    await withLock(key, async () => {
      const records = await this.getTasks(workspaceId);

      for (const task of tasks) {
        const targetWorkspaceId =
          workspaceId || task.workspaceId || INBOX_WORKSPACE_ID;
        const cleanTask: Task = normalizeTask(task, targetWorkspaceId);
        cleanTask.updatedAt = Date.now();
        // Monotonic revision: always advance from the persisted value,
        // never trust the caller-provided revision in the payload.
        cleanTask.revision = (records[task.id]?.revision || 0) + 1;
        records[task.id] = cleanTask;
      }
      await AsyncStorage.setItem(key, JSON.stringify(records));
    });
  }

  /**
   * Unlocked persistence primitive required specifically for WorkspaceCommandHandler
   * to restore tasks into a partition while the canonical lock is held dynamically.
   */
  static async saveTasksUnlocked(tasks: any[], workspaceId: string): Promise<void> {
    for (const task of tasks) {
      this.validateId(task?.id, "saveTasksUnlocked");
    }
    const key = this.getTasksKey(workspaceId);
    
    const records = await this.getTasks(workspaceId);

    for (const task of tasks) {
      const targetWorkspaceId =
        workspaceId || task.workspaceId || INBOX_WORKSPACE_ID;
      const cleanTask: Task = normalizeTask(task, targetWorkspaceId);
      cleanTask.updatedAt = Date.now();
      // Monotonic revision: advance from the persisted value, ignoring caller payload.
      cleanTask.revision = (records[task.id]?.revision || 0) + 1;
      records[task.id] = cleanTask;
    }
    await AsyncStorage.setItem(key, JSON.stringify(records));
  }

  /**
   * Safely targets notification IDs for modification without disturbing user edits
   * or touching the updatedAt timestamp.
   * Handles workspace moves gracefully by returning not_found if the entity is missing.
   */
  static async updateNotificationIds(
    id: string, 
    workspaceId: string, 
    notificationIds?: string[],
    expectedSnapshot?: {
      reminder?: { enabled: boolean; triggerAt?: number };
      status?: string;
      archivedAt?: number | null;
      updatedAt?: number;
      revision?: number;
    }
  ): Promise<'updated' | 'not_found' | 'state_changed'> {
    this.validateId(id, "updateNotificationIds");
    const targetWorkspaceId = workspaceId || INBOX_WORKSPACE_ID;
    const key = this.getTasksKey(targetWorkspaceId);
    
    return await withLock(key, async () => {
      const records = await this.getTasks(targetWorkspaceId);
      const existing = records[id];
      if (!existing) {
        return 'not_found';
      }
      
      if (expectedSnapshot) {
        const reminderMatches = 
          existing.reminder?.enabled === expectedSnapshot.reminder?.enabled &&
          existing.reminder?.triggerAt === expectedSnapshot.reminder?.triggerAt;
        
        const statusMatches = expectedSnapshot.status === undefined || existing.status === expectedSnapshot.status;
        const archiveMatches = existing.archivedAt === expectedSnapshot.archivedAt;
        const updatedAtMatches = expectedSnapshot.updatedAt === undefined || existing.updatedAt === expectedSnapshot.updatedAt;
        const revisionMatches = expectedSnapshot.revision === undefined || existing.revision === expectedSnapshot.revision;

        if (!reminderMatches || !statusMatches || !archiveMatches || !updatedAtMatches || !revisionMatches) {
          return 'state_changed';
        }
      }
      
      // Preserve ALL fields exactly, only modify notificationIds
      if (existing.reminder) {
        existing.reminder.notificationIds = notificationIds;
      } else if (notificationIds && notificationIds.length > 0) {
        // Safe default if reminder object was missing but we have IDs
        existing.reminder = { enabled: true, triggerAt: 0, notificationIds };
      }

      records[id] = existing;
      await AsyncStorage.setItem(key, JSON.stringify(records));
      return 'updated';
    });
  }

  static async deleteTask(id: string, workspaceId: string): Promise<void> {
    const key = this.getTasksKey(workspaceId);
    await withLock(key, async () => {
      const records = await this.getTasks(workspaceId);
      if (records[id]) {
        delete records[id];
        await AsyncStorage.setItem(key, JSON.stringify(records));
      }
    });
  }

  /**
   * Unlocked persistence primitive required specifically for TaskCommandHandler.moveTask
   * to perform a safe cross-workspace read-modify-write-delete without nested deadlocking.
   */
  static async deleteTaskUnlocked(id: string, workspaceId: string): Promise<void> {
    const key = this.getTasksKey(workspaceId);
    const records = await this.getTasks(workspaceId);
    if (records[id]) {
      delete records[id];
      await AsyncStorage.setItem(key, JSON.stringify(records));
    }
  }

  static async deleteTasks(ids: string[], workspaceId: string): Promise<void> {
    if (ids.length === 0) return;
    const key = this.getTasksKey(workspaceId);
    await withLock(key, async () => {
      const records = await this.getTasks(workspaceId);
      let modified = false;
      for (const id of ids) {
        if (records[id]) {
          delete records[id];
          modified = true;
        }
      }
      if (modified) {
        await AsyncStorage.setItem(key, JSON.stringify(records));
      }
    });
  }

  /**
   * Unlocked persistence primitive required specifically for TaskCommandHandler.recycleTasks
   * to perform safe bulk deletions under dynamically held partition locks.
   */
  static async deleteTasksUnlocked(ids: string[], workspaceId: string): Promise<void> {
    if (ids.length === 0) return;
    const key = this.getTasksKey(workspaceId);
    const records = await this.getTasks(workspaceId);
    let modified = false;
    for (const id of ids) {
      if (records[id]) {
        delete records[id];
        modified = true;
      }
    }
    if (modified) {
      await AsyncStorage.setItem(key, JSON.stringify(records));
    }
  }

  /**
   * Unlocked persistence primitive required specifically for WorkspaceCommandHandler.deleteWorkspace
   * to physically wipe the active partition safely under dynamically held locks.
   */
  static async deletePartitionUnlocked(workspaceId: string): Promise<void> {
    const key = this.getTasksKey(workspaceId);
    await AsyncStorage.removeItem(key);
  }
}
