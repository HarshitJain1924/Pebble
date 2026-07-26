/**
 * HabitRepository.ts
 * ────────────────────────
 * Habit persistence — partitioned by workspaceId using canonical Habit model.
 */
import {
  DEFAULT_WORKSPACE_ID,
  type Habit,
  type HabitCompletion,
  type RecurrenceRule,
} from "@/shared/types/domain.types";
import AsyncStorage from "@react-native-async-storage/async-storage";

export function normalizeHabit(rawHabit: any, defaultWorkspaceId: string): Habit {
  const wsId = rawHabit.workspaceId || rawHabit.folderId || defaultWorkspaceId;

  // Convert completion history
  let completionHistory: HabitCompletion[] = [];
  if (Array.isArray(rawHabit.completionHistory)) {
    completionHistory = rawHabit.completionHistory;
  } else if (Array.isArray(rawHabit.completedDates)) {
    const now = Date.now();
    completionHistory = rawHabit.completedDates.map((dateStr: string) => ({
      date: dateStr,
      completedAt: now,
    }));
  }

  // Construct recurrence
  let recurrence: RecurrenceRule = rawHabit.recurrence;
  if (!recurrence) {
    recurrence = {
      frequency: "daily",
      interval: 1,
    };
  }

  // Construct reminder if present
  let reminder = rawHabit.reminder;
  if (!reminder && (rawHabit.reminderHour !== undefined || rawHabit.alarmTime)) {
    reminder = {
      enabled: true,
      triggerAt: rawHabit.alarmTime || Date.now(),
      notificationIds: rawHabit.notificationIds || undefined,
    };
  }

  // Construct resourceIds
  let resourceIds = rawHabit.resourceIds || [];
  if (rawHabit.resourceId && !resourceIds.includes(rawHabit.resourceId)) {
    resourceIds.push(rawHabit.resourceId);
  }
  if (Array.isArray(rawHabit.linkedResourceIds)) {
    rawHabit.linkedResourceIds.forEach((rid: string) => {
      if (!resourceIds.includes(rid)) resourceIds.push(rid);
    });
  }

  return {
    id: rawHabit.id,
    workspaceId: wsId,
    title: rawHabit.title || "",
    description: rawHabit.description || undefined,
    categoryId: rawHabit.categoryId || rawHabit.category || undefined,
    tags: rawHabit.tags || undefined,
    recurrence,
    completionHistory,
    reminder: reminder || undefined,
    resourceIds: resourceIds.length > 0 ? resourceIds : undefined,
    createdAt: rawHabit.createdAt || Date.now(),
    updatedAt: rawHabit.updatedAt || Date.now(),
    archivedAt: rawHabit.archivedAt || (rawHabit.archived ? Date.now() : undefined),
  };
}

export class HabitRepository {
  private static getHabitsKey(workspaceId: string) {
    return `pebble:v1:habits:${workspaceId}`;
  }

  private static getLegacyHabitsKey(workspaceId: string) {
    return `pebble:core:habits:${workspaceId}`;
  }

  static async getHabit(
    id: string,
    workspaceId: string
  ): Promise<Habit | null> {
    const key = this.getHabitsKey(workspaceId);
    let raw = await AsyncStorage.getItem(key);
    if (!raw) {
      raw = await AsyncStorage.getItem(this.getLegacyHabitsKey(workspaceId));
    }
    if (!raw) return null;
    const records: Record<string, any> = JSON.parse(raw);
    const rawHabit = records[id] || null;
    if (rawHabit) {
      return normalizeHabit(rawHabit, workspaceId);
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
    const records: Record<string, Habit> = {};
    Object.entries(parsed).forEach(([id, rawHabit]: [string, any]) => {
      records[id] = normalizeHabit(rawHabit, workspaceId);
    });
    return records;
  }

  static async saveHabit(habit: any): Promise<void> {
    const workspaceId = habit.workspaceId || DEFAULT_WORKSPACE_ID;
    const key = this.getHabitsKey(workspaceId);
    const records = await this.getHabits(workspaceId);

    const cleanHabit: Habit = normalizeHabit(habit, workspaceId);
    cleanHabit.updatedAt = Date.now();

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
