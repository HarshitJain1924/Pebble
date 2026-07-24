/**
 * HabitRepository.ts
 * ────────────────────────
 * Habit persistence — partitioned by workspaceId / folderId.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_FOLDER_ID, type Habit } from "@/shared/types/repository.types";

export class HabitRepository {
  private static getHabitsKey(folderId: string) {
    return `pebble:v1:habits:${folderId}`;
  }

  private static getLegacyHabitsKey(folderId: string) {
    return `pebble:core:habits:${folderId}`;
  }

  static async getHabit(id: string, folderId: string): Promise<Habit | null> {
    const key = this.getHabitsKey(folderId);
    let raw = await AsyncStorage.getItem(key);
    if (!raw) {
      raw = await AsyncStorage.getItem(this.getLegacyHabitsKey(folderId));
    }
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
    let raw = await AsyncStorage.getItem(key);
    if (!raw) {
      raw = await AsyncStorage.getItem(this.getLegacyHabitsKey(folderId));
    }
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
    const records = await this.getHabits(folderId);

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
    const records = await this.getHabits(folderId);
    if (records[id]) {
      delete records[id];
      await AsyncStorage.setItem(key, JSON.stringify(records));
    }
  }
}
