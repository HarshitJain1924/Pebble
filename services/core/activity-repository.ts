/**
 * activity-repository.ts
 * ────────────────────────
 * Task, Habit, and Checklist persistence — partitioned by folderId.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_FOLDER_ID, type Task, type Habit, type Checklist } from "./models";

export class ActivityRepository {
  private static getTasksKey(folderId: string) {
    return `pebble:core:tasks:${folderId}`;
  }
  private static getHabitsKey(folderId: string) {
    return `pebble:core:habits:${folderId}`;
  }
  private static getChecklistsKey(folderId: string) {
    return `pebble:core:checklists:${folderId}`;
  }

  // ─── Tasks ────────────────────────────────────────────────────────

  static async getTask(id: string, folderId: string): Promise<Task | null> {
    const key = this.getTasksKey(folderId);
    const raw = await AsyncStorage.getItem(key);
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
    const raw = await AsyncStorage.getItem(key);
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
    const raw = await AsyncStorage.getItem(key);
    const records: Record<string, Task> = raw ? JSON.parse(raw) : {};

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
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return;
    const records: Record<string, Task> = JSON.parse(raw);
    if (records[id]) {
      delete records[id];
      await AsyncStorage.setItem(key, JSON.stringify(records));
    }
  }

  // ─── Habits ───────────────────────────────────────────────────────

  static async getHabit(id: string, folderId: string): Promise<Habit | null> {
    const key = this.getHabitsKey(folderId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const records: Record<string, Habit> = JSON.parse(raw);
    const habit = records[id] || null;
    if (habit) {
      return {
        ...habit,
        workspaceId: habit.folderId || folderId,
      } as any;
    }
    return null;
  }

  static async getHabits(folderId: string): Promise<Record<string, Habit>> {
    const key = this.getHabitsKey(folderId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const records: Record<string, any> = {};
    Object.entries(parsed).forEach(([id, habit]: [string, any]) => {
      records[id] = {
        ...habit,
        workspaceId: habit.folderId || folderId,
      };
    });
    return records;
  }

  static async saveHabit(habit: any): Promise<void> {
    const folderId = habit.folderId || habit.workspaceId || DEFAULT_FOLDER_ID;
    const key = this.getHabitsKey(folderId);
    const raw = await AsyncStorage.getItem(key);
    const records: Record<string, Habit> = raw ? JSON.parse(raw) : {};

    const cleanHabit: Habit = {
      id: habit.id,
      folderId,
      title: habit.title,
      streak: habit.streak || 0,
      bestStreak: habit.bestStreak || 0,
      completedDates: habit.completedDates || [],
      recurrenceRule: habit.recurrenceRule || "FREQ=DAILY",
      priority: habit.priority || "medium",
      category: habit.category || "work",
      recurrence: habit.recurrence || undefined,
      createdAt: habit.createdAt || Date.now(),
      updatedAt: Date.now(),
      archived: habit.archived || false,
      description: habit.description || undefined,
      reminderHour: habit.reminderHour || undefined,
      reminderMinute: habit.reminderMinute || undefined,
      reminderDays: habit.reminderDays || undefined,
      notificationIds: habit.notificationIds || undefined,
    };

    records[habit.id] = cleanHabit;
    await AsyncStorage.setItem(key, JSON.stringify(records));
  }

  static async deleteHabit(id: string, folderId: string): Promise<void> {
    const key = this.getHabitsKey(folderId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return;
    const records: Record<string, Habit> = JSON.parse(raw);
    if (records[id]) {
      delete records[id];
      await AsyncStorage.setItem(key, JSON.stringify(records));
    }
  }

  // ─── Checklists ───────────────────────────────────────────────────

  static async getChecklist(id: string, folderId: string): Promise<Checklist | null> {
    const key = this.getChecklistsKey(folderId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const records: Record<string, Checklist> = JSON.parse(raw);
    const checklist = records[id] || null;
    if (checklist) {
      return {
        ...checklist,
        workspaceId: checklist.folderId || folderId,
      } as any;
    }
    return null;
  }

  static async getChecklists(folderId: string): Promise<Record<string, Checklist>> {
    const key = this.getChecklistsKey(folderId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const records: Record<string, any> = {};
    Object.entries(parsed).forEach(([id, checklist]: [string, any]) => {
      records[id] = {
        ...checklist,
        workspaceId: checklist.folderId || folderId,
      };
    });
    return records;
  }

  static async saveChecklist(checklist: any): Promise<void> {
    const folderId = checklist.folderId || checklist.workspaceId || DEFAULT_FOLDER_ID;
    const key = this.getChecklistsKey(folderId);
    const raw = await AsyncStorage.getItem(key);
    const records: Record<string, Checklist> = raw ? JSON.parse(raw) : {};

    const cleanChecklist: Checklist = {
      id: checklist.id,
      folderId,
      title: checklist.title,
      createdAt: checklist.createdAt || Date.now(),
      updatedAt: Date.now(),
      archived: checklist.archived || false,
      items: checklist.items || [],
    };

    records[checklist.id] = cleanChecklist;
    await AsyncStorage.setItem(key, JSON.stringify(records));
  }

  static async deleteChecklist(id: string, folderId: string): Promise<void> {
    const key = this.getChecklistsKey(folderId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return;
    const records: Record<string, Checklist> = JSON.parse(raw);
    if (records[id]) {
      delete records[id];
      await AsyncStorage.setItem(key, JSON.stringify(records));
    }
  }
}