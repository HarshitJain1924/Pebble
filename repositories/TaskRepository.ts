/**
 * TaskRepository.ts
 * ────────────────────────
 * Task persistence — partitioned by workspaceId / folderId.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_FOLDER_ID, type Task } from "@/shared/types/repository.types";

export class TaskRepository {
  private static getTasksKey(folderId: string) {
    return `pebble:v1:tasks:${folderId}`;
  }

  private static getLegacyTasksKey(folderId: string) {
    return `pebble:core:tasks:${folderId}`;
  }

  static async getTask(id: string, folderId: string): Promise<Task | null> {
    const key = this.getTasksKey(folderId);
    let raw = await AsyncStorage.getItem(key);
    if (!raw) {
      raw = await AsyncStorage.getItem(this.getLegacyTasksKey(folderId));
    }
    if (!raw) return null;
    const records: Record<string, Task> = JSON.parse(raw);
    const task = records[id] || null;
    if (task) {
      return {
        ...task,
        workspaceId: task.folderId || folderId,
        dueDate: task.dueDate || task.scheduledDate,
      } as any;
    }
    return null;
  }

  static async getTasks(folderId: string): Promise<Record<string, Task>> {
    const key = this.getTasksKey(folderId);
    let raw = await AsyncStorage.getItem(key);
    if (!raw) {
      raw = await AsyncStorage.getItem(this.getLegacyTasksKey(folderId));
    }
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const records: Record<string, any> = {};
    Object.entries(parsed).forEach(([id, task]: [string, any]) => {
      records[id] = {
        ...task,
        workspaceId: task.folderId || folderId,
        dueDate: task.dueDate || task.scheduledDate,
      };
    });
    return records;
  }

  static async saveTask(task: any): Promise<void> {
    const folderId = task.folderId || task.workspaceId || DEFAULT_FOLDER_ID;
    const key = this.getTasksKey(folderId);
    const records = await this.getTasks(folderId);

    const cleanTask: Task = {
      id: task.id,
      folderId,
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

  static async deleteTask(id: string, folderId: string): Promise<void> {
    const key = this.getTasksKey(folderId);
    const records = await this.getTasks(folderId);
    if (records[id]) {
      delete records[id];
      await AsyncStorage.setItem(key, JSON.stringify(records));
    }
  }
}
