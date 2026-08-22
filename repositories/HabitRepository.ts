/**
 * HabitRepository.ts
 * ────────────────────────
 * Habit persistence — partitioned by workspaceId using canonical Habit model.
 */
import {
  INBOX_WORKSPACE_ID,
  type Habit,
  type HabitCompletion,
  type RecurrenceRule,
} from "@/shared/types/domain.types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { withLock } from "@/shared/utils/mutex";

export function normalizeHabit(
  rawHabit: any,
  defaultWorkspaceId: string,
): Habit {
  const wsId = rawHabit.workspaceId || defaultWorkspaceId;

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

  // Construct canonical Reminder from legacy flat fields if not already present.
  // Only reconstruct when alarmTime is a valid number — never fall back to Date.now()
  // because that would silently corrupt the stored timestamp.
  let reminder = rawHabit.reminder;
  if (!reminder && typeof rawHabit.alarmTime === "number") {
    reminder = {
      enabled: true,
      triggerAt: rawHabit.alarmTime,
      notificationIds: rawHabit.notificationIds || undefined,
    };
  }

  // Warn about legacy records that have notificationIds or reminderHour but no alarmTime.
  // These cannot be reconstructed into a valid canonical Reminder and would
  // have silently produced Date.now() under the old fallback.
  if (!reminder && (rawHabit.notificationIds?.length || rawHabit.reminderHour != null) && rawHabit.alarmTime == null) {
    console.warn(
      "[Reminder] Legacy habit " + rawHabit.id + " has notificationIds/reminderHour but no alarmTime — reminder not reconstructed"
    );
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
    recurrenceExceptions: rawHabit.recurrenceExceptions || undefined,
    completionHistory,
    reminder: reminder || undefined,
    resourceIds: resourceIds.length > 0 ? resourceIds : undefined,
    createdAt: rawHabit.createdAt || Date.now(),
    updatedAt: rawHabit.updatedAt || Date.now(),
    archivedAt:
      rawHabit.archivedAt || (rawHabit.archived ? Date.now() : undefined),
    streak: typeof rawHabit.streak === "number" ? rawHabit.streak : undefined,
    bestStreak:
      typeof rawHabit.bestStreak === "number" ? rawHabit.bestStreak : undefined,
    lastCompletedDate: rawHabit.lastCompletedDate || undefined,
  };
}

export class HabitRepository {
  private static validateId(id: unknown, method: string): asserts id is string {
    if (
      id === undefined ||
      id === null ||
      typeof id !== "string" ||
      id.trim().length === 0
    ) {
      throw new Error(`HabitRepository.${method}: habit.id is required`);
    }
  }

  private static getHabitsKey(workspaceId: string) {
    return `pebble:v1:habits:${workspaceId}`;
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
      console.warn(
        `[HabitRepository] Stored value for "${key}" is not a JSON object (${method}); treating as empty.`,
      );
      return {};
    } catch (e) {
      console.warn(
        `[HabitRepository] Failed to parse stored value for "${key}" (${method}); treating as empty.`,
        e,
      );
      return {};
    }
  }

  static async getHabit(
    id: string,
    workspaceId: string,
  ): Promise<Habit | null> {
    const key = this.getHabitsKey(workspaceId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const records: Record<string, any> = this.parseRecords(raw, key, "getHabit");
    const rawHabit = records[id] || null;
    if (rawHabit) {
      return normalizeHabit(rawHabit, workspaceId);
    }
    return null;
  }

  static async getHabits(workspaceId: string): Promise<Record<string, Habit>> {
    const key = this.getHabitsKey(workspaceId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return {};
    const parsed = this.parseRecords(raw, key, "getHabits");
    const records: Record<string, Habit> = {};
    Object.entries(parsed).forEach(([id, rawHabit]: [string, any]) => {
      records[id] = normalizeHabit(rawHabit, workspaceId);
    });
    return records;
  }

  static async saveHabit(habit: any): Promise<void> {
    this.validateId(habit?.id, "saveHabit");
    const workspaceId = habit.workspaceId || INBOX_WORKSPACE_ID;
    const key = this.getHabitsKey(workspaceId);
    
    await withLock(key, async () => {
      await this.saveHabitUnlocked(habit);
    });
  }

  /**
   * Unlocked primitive required by Command layer for multi-key concurrency
   * operations (like updateHabit, moveHabit) where the canonical lock is already held.
   */
  static async saveHabitUnlocked(habit: any): Promise<void> {
    this.validateId(habit?.id, "saveHabitUnlocked");
    const workspaceId = habit.workspaceId || INBOX_WORKSPACE_ID;
    const key = this.getHabitsKey(workspaceId);
    
    const records = await this.getHabits(workspaceId);

    const cleanHabit: Habit = normalizeHabit(habit, workspaceId);
    cleanHabit.updatedAt = Date.now();

    const validTrigger =
      Number.isFinite(cleanHabit.reminder?.triggerAt) &&
      (cleanHabit.reminder?.triggerAt ?? 0) > 0;
    if (cleanHabit.reminder?.enabled && !validTrigger) {
      console.warn(
        "[Reminder] Invalid triggerAt on habit " + cleanHabit.id + " before persistence",
        cleanHabit.reminder
      );
    }

    records[habit.id] = cleanHabit;
    await AsyncStorage.setItem(key, JSON.stringify(records));
  }

  static async saveHabits(habits: any[], workspaceId: string): Promise<void> {
    const key = this.getHabitsKey(workspaceId);
    await withLock(key, async () => {
      const records = await this.getHabits(workspaceId);
      for (const habit of habits) {
        this.validateId(habit?.id, "saveHabits");
        const cleanHabit: Habit = normalizeHabit(habit, workspaceId);
        cleanHabit.updatedAt = Date.now();
        records[habit.id] = cleanHabit;
      }
      await AsyncStorage.setItem(key, JSON.stringify(records));
    });
  }

  /**
   * Unlocked persistence primitive required specifically for WorkspaceCommandHandler
   * to restore habits into a partition while the canonical lock is held dynamically.
   */
  static async saveHabitsUnlocked(habits: any[], workspaceId: string): Promise<void> {
    const key = this.getHabitsKey(workspaceId);
    const records = await this.getHabits(workspaceId);
    for (const habit of habits) {
      this.validateId(habit?.id, "saveHabitsUnlocked");
      const cleanHabit: Habit = normalizeHabit(habit, workspaceId);
      cleanHabit.updatedAt = Date.now();
      records[habit.id] = cleanHabit;
    }
    await AsyncStorage.setItem(key, JSON.stringify(records));
  }

  /**
   * Safely targets notification IDs for modification without disturbing user edits
   * or touching the updatedAt timestamp.
   * Handles workspace moves gracefully by returning not_found if the entity is missing.
   */
  static async updateNotificationIds(id: string, workspaceId: string, notificationIds?: string[]): Promise<'updated' | 'not_found'> {
    this.validateId(id, "updateNotificationIds");
    const targetWorkspaceId = workspaceId || INBOX_WORKSPACE_ID;
    const key = this.getHabitsKey(targetWorkspaceId);
    
    return await withLock(key, async () => {
      const records = await this.getHabits(targetWorkspaceId);
      const existing = records[id];
      if (!existing) {
        return 'not_found';
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

  static async deleteHabit(id: string, workspaceId: string): Promise<void> {
    const key = this.getHabitsKey(workspaceId);
    await withLock(key, async () => {
      const records = await this.getHabits(workspaceId);
      if (records[id]) {
        delete records[id];
        await AsyncStorage.setItem(key, JSON.stringify(records));
      }
    });
  }

  /**
   * Unlocked persistence primitive required specifically for WorkspaceCommandHandler.deleteWorkspace
   * to physically wipe the active partition safely under dynamically held locks.
   */
  static async deletePartitionUnlocked(workspaceId: string): Promise<void> {
    const key = this.getHabitsKey(workspaceId);
    await AsyncStorage.removeItem(key);
  }
}
