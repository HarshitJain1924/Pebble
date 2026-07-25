/**
 * TaskRepository.ts
 * ────────────────────────
 * Task persistence — partitioned by workspaceId.
 */
import {
  DEFAULT_WORKSPACE_ID,
  type Task,
} from "@/shared/types/repository.types";
import AsyncStorage from "@react-native-async-storage/async-storage";

export class TaskRepository {
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
    const records: Record<string, Task> = JSON.parse(raw);
    const task = records[id] || null;
    if (task) {
      const resolvedWorkspaceId = task.workspaceId || (task as any).folderId || workspaceId;
      return {
        ...task,
        workspaceId: resolvedWorkspaceId,
        folderId: resolvedWorkspaceId,
        dueDate: task.dueDate || task.scheduledDate,
      } as any;
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
    const records: Record<string, any> = {};
    Object.entries(parsed).forEach(([id, task]: [string, any]) => {
      const resolvedWorkspaceId = task.workspaceId || task.folderId || workspaceId;
      records[id] = {
        ...task,
        workspaceId: resolvedWorkspaceId,
        folderId: resolvedWorkspaceId,
        dueDate: task.dueDate || task.scheduledDate,
      };
    });
    return records;
  }

  static async saveTask(task: any): Promise<void> {
    const workspaceId = task.workspaceId || task.folderId || DEFAULT_WORKSPACE_ID;
    const key = this.getTasksKey(workspaceId);
    const records = await this.getTasks(workspaceId);

    const cleanTask: Task = {
      id: task.id,
      workspaceId,
      folderId: workspaceId,
      title: task.title,
      completed: task.completed,
      completedAt: task.completedAt,
      priority: task.priority || "medium",
      category: task.category || "work",
      createdAt: task.createdAt || Date.now(),
      updatedAt: Date.now(),
      archived: task.archived || false,
      description: task.description || undefined,
      scheduledDate: task.scheduledDate || task.dueDate || undefined,
      scheduledTime: task.scheduledTime || undefined,
      durationMinutes: task.durationMinutes || undefined,
      alarmTime: task.alarmTime || undefined,
      alarmId: task.alarmId || undefined,
      notificationIds: task.notificationIds || undefined,
    };

    records[task.id] = cleanTask;
    await AsyncStorage.setItem(key, JSON.stringify(records));
  }

  /**
   * Batch-save multiple tasks for the same workspace in a single write.
   * Eliminates N redundant read-write cycles when persisting a full workspace.
   */
  static async saveTasks(tasks: any[], workspaceId: string): Promise<void> {
    const key = this.getTasksKey(workspaceId);
    const records = await this.getTasks(workspaceId);

    for (const task of tasks) {
      const targetWorkspaceId = workspaceId || task.workspaceId || task.folderId || DEFAULT_WORKSPACE_ID;
      const cleanTask: Task = {
        id: task.id,
        workspaceId: targetWorkspaceId,
        folderId: targetWorkspaceId,
        title: task.title,
        completed: task.completed,
        completedAt: task.completedAt,
        priority: task.priority || "medium",
        category: task.category || "work",
        createdAt: task.createdAt || Date.now(),
        updatedAt: Date.now(),
        archived: task.archived || false,
        description: task.description || undefined,
        scheduledDate: task.scheduledDate || task.dueDate || undefined,
        scheduledTime: task.scheduledTime || undefined,
        durationMinutes: task.durationMinutes || undefined,
        alarmTime: task.alarmTime || undefined,
        alarmId: task.alarmId || undefined,
        notificationIds: task.notificationIds || undefined,
      };
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
