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

  const habitObj: Habit = {
    id: rawHabit.id,
    workspaceId: wsId,
    title: rawHabit.title || "",
    recurrence,
    completionHistory,
    createdAt: rawHabit.createdAt || Date.now(),
    updatedAt: rawHabit.updatedAt || Date.now(),
    revision: rawHabit.revision ?? 1,
    lifecycleGeneration: rawHabit.lifecycleGeneration ?? 1,
  };

  if (rawHabit.description) habitObj.description = rawHabit.description;
  if (rawHabit.categoryId || rawHabit.category) habitObj.categoryId = rawHabit.categoryId || rawHabit.category;
  if (rawHabit.tags) habitObj.tags = rawHabit.tags;
  if (rawHabit.recurrenceExceptions) habitObj.recurrenceExceptions = rawHabit.recurrenceExceptions;
  if (reminder) habitObj.reminder = reminder;
  if (rawHabit.schedule) habitObj.schedule = rawHabit.schedule;
  if (resourceIds.length > 0) habitObj.resourceIds = resourceIds;
  if (rawHabit.archivedAt || rawHabit.archived) habitObj.archivedAt = rawHabit.archivedAt || (rawHabit.archived ? Date.now() : undefined);
  if (typeof rawHabit.streak === "number") habitObj.streak = rawHabit.streak;
  if (typeof rawHabit.bestStreak === "number") habitObj.bestStreak = rawHabit.bestStreak;
  if (rawHabit.lastCompletedDate) habitObj.lastCompletedDate = rawHabit.lastCompletedDate;

  return habitObj;
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
      throw new Error(
        `[HabitRepository] Stored value for "${key}" is not a JSON object (${method})`
      );
    } catch (e) {
      console.error(
        `[HabitRepository] Failed to parse stored value for "${key}" (${method})`,
        e,
      );
      throw e;
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

  static async saveHabit(habit: any): Promise<Habit> {
    this.validateId(habit?.id, "saveHabit");
    const workspaceId = habit.workspaceId || INBOX_WORKSPACE_ID;
    const key = this.getHabitsKey(workspaceId);
    
    return await withLock(key, async () => {
      return await this.saveHabitUnlocked(habit);
    });
  }

  /**
   * Unlocked primitive required by Command layer for multi-key concurrency
   * operations (like updateHabit, moveHabit) where the canonical lock is already held.
   */
  static async saveHabitUnlocked(habit: any): Promise<Habit> {
    this.validateId(habit?.id, "saveHabitUnlocked");
    const workspaceId = habit.workspaceId || INBOX_WORKSPACE_ID;
    const key = this.getHabitsKey(workspaceId);
    
    const records = await this.getHabits(workspaceId);

    const cleanHabit: Habit = normalizeHabit(habit, workspaceId);
    cleanHabit.updatedAt = Date.now();
    cleanHabit.revision = (records[habit.id]?.revision || 0) + 1;
    cleanHabit.lifecycleGeneration = habit.lifecycleGeneration || records[habit.id]?.lifecycleGeneration || 1;

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
    return cleanHabit;
  }

  static async saveHabits(habits: any[], workspaceId: string): Promise<void> {
    const key = this.getHabitsKey(workspaceId);
    await withLock(key, async () => {
      const records = await this.getHabits(workspaceId);
      for (const habit of habits) {
        this.validateId(habit?.id, "saveHabits");
        const cleanHabit: Habit = normalizeHabit(habit, workspaceId);
        cleanHabit.updatedAt = Date.now();
        // Monotonic revision: always advance from the persisted value,
        // never trust the caller-provided revision in the payload.
        cleanHabit.revision = (records[habit.id]?.revision || 0) + 1;
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
      // Monotonic revision: advance from the persisted value, ignoring caller payload.
      cleanHabit.revision = (records[habit.id]?.revision || 0) + 1;
      records[habit.id] = cleanHabit;
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
      archivedAt?: number | null;
      updatedAt?: number;
      revision?: number;
    }
  ): Promise<'updated' | 'not_found' | 'state_changed'> {
    this.validateId(id, "updateNotificationIds");
    const targetWorkspaceId = workspaceId || INBOX_WORKSPACE_ID;
    const key = this.getHabitsKey(targetWorkspaceId);
    
    return await withLock(key, async () => {
      const records = await this.getHabits(targetWorkspaceId);
      const existing = records[id];
      if (!existing) {
        return 'not_found';
      }
      
      if (expectedSnapshot) {
        const reminderMatches = 
          existing.reminder?.enabled === expectedSnapshot.reminder?.enabled &&
          existing.reminder?.triggerAt === expectedSnapshot.reminder?.triggerAt;
        
        const archiveMatches = (existing.archivedAt ?? null) === (expectedSnapshot.archivedAt ?? null);
        const updatedAtMatches = expectedSnapshot.updatedAt === undefined || existing.updatedAt === expectedSnapshot.updatedAt;
        const revisionMatches = expectedSnapshot.revision === undefined || existing.revision === expectedSnapshot.revision;

        if (!reminderMatches || !archiveMatches || !updatedAtMatches || !revisionMatches) {
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

  static async deleteHabit(id: string, workspaceId: string): Promise<void> {
    const key = this.getHabitsKey(workspaceId);
    await withLock(key, async () => {
      await this.deleteHabitUnlocked(id, workspaceId);
    });
  }

  static async deleteHabitUnlocked(id: string, workspaceId: string): Promise<void> {
    const key = this.getHabitsKey(workspaceId);
    const records = await this.getHabits(workspaceId);
    if (records[id]) {
      delete records[id];
      await AsyncStorage.setItem(key, JSON.stringify(records));
    }
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
