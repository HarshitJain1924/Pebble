/**
 * HabitRepository.ts
 * ────────────────────────
 * Habit persistence — partitioned by workspaceId.
 */
import {
  DEFAULT_WORKSPACE_ID,
  type Habit,
} from "@/shared/types/repository.types";
import AsyncStorage from "@react-native-async-storage/async-storage";

export class HabitRepository {
  private static getHabitsKey(workspaceId: string) {
    return `pebble:v1:habits:${workspaceId}`;
  }

  private static getLegacyHabitsKey(workspaceId: string) {
    return `pebble:core:habits:${workspaceId}`;
  }

  static async getHabit(
    id: string,
    workspaceId: string,
  ): Promise<Habit | null> {
    const key = this.getHabitsKey(workspaceId);
    let raw = await AsyncStorage.getItem(key);
    if (!raw) {
      raw = await AsyncStorage.getItem(this.getLegacyHabitsKey(workspaceId));
    }
    if (!raw) return null;
    const records: Record<string, Habit> = JSON.parse(raw);
    const habit = records[id] || null;
    if (habit) {
      const resolvedWorkspaceId = habit.workspaceId || (habit as any).folderId || workspaceId;
      return {
        ...habit,
        workspaceId: resolvedWorkspaceId,
        folderId: resolvedWorkspaceId,
      } as any;
    }
    return null;
  }

  static async getHabits(workspaceId: string): Promise<Record<string, Habit>> {
    const key = this.getHabitsKey(workspaceId);
    let raw = await AsyncStorage.getItem(key);
    if (!raw) {
      raw = await AsyncStorage.getItem(this.getLegacyHabitsKey(workspaceId));
    }
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const records: Record<string, any> = {};
    Object.entries(parsed).forEach(([id, habit]: [string, any]) => {
      const resolvedWorkspaceId = habit.workspaceId || habit.folderId || workspaceId;
      records[id] = {
        ...habit,
        workspaceId: resolvedWorkspaceId,
        folderId: resolvedWorkspaceId,
      };
    });
    return records;
  }

  static async saveHabit(habit: any): Promise<void> {
    const workspaceId = habit.workspaceId || habit.folderId || DEFAULT_WORKSPACE_ID;
    const key = this.getHabitsKey(workspaceId);
    const records = await this.getHabits(workspaceId);

    const cleanHabit: Habit = {
      id: habit.id,
      workspaceId,
      folderId: workspaceId,
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

  static async deleteHabit(id: string, workspaceId: string): Promise<void> {
    const key = this.getHabitsKey(workspaceId);
    const records = await this.getHabits(workspaceId);
    if (records[id]) {
      delete records[id];
      await AsyncStorage.setItem(key, JSON.stringify(records));
    }
  }
}
