/**
 * RecycleBinRepository.ts
 * ───────────────────────────
 * Recycle Bin persistence with 30-day auto-cleanup using canonical RecycleBinItem model.
 * Guarantees: no duplicate entries for the same entity ID.
 */
import { type RecycleBinItem } from "@/shared/types/domain.types";
import AsyncStorage from "@react-native-async-storage/async-storage";

export function normalizeRecycleBinItem(raw: any): RecycleBinItem {
  let entityType: RecycleBinItem["entityType"] = "task";
  const rawType = raw.entityType || raw.itemType;
  if (
    ["workspace", "task", "habit", "checklist", "resource"].includes(rawType)
  ) {
    entityType = rawType as RecycleBinItem["entityType"];
  }

  const entityId = raw.entityId || raw.id || String(Date.now());
  const snapshotStr =
    typeof raw.snapshot === "string"
      ? raw.snapshot
      : JSON.stringify(raw.data || raw);

  return {
    id: raw.id || entityId,
    entityType,
    entityId,
    snapshot: snapshotStr,
    deletedAt: raw.deletedAt || Date.now(),
  };
}

export class RecycleBinRepository {
  private static readonly RECYCLE_BIN_KEY = "pebble:v1:recycle_bin";
  private static readonly LEGACY_RECYCLE_BIN_KEY = "pebble:core:recycle_bin";
  private static readonly DAY_MS = 24 * 60 * 60 * 1000;

  static async getRecycleBinItems(): Promise<RecycleBinItem[]> {
    try {
      let raw = await AsyncStorage.getItem(this.RECYCLE_BIN_KEY);
      if (!raw) {
        raw = await AsyncStorage.getItem(this.LEGACY_RECYCLE_BIN_KEY);
      }
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return parsed.map(normalizeRecycleBinItem);
    } catch (e) {
      console.warn("Failed to get recycle bin items", e);
      return [];
    }
  }

  static async saveRecycleBinItems(items: RecycleBinItem[]): Promise<void> {
    try {
      await AsyncStorage.setItem(this.RECYCLE_BIN_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn("Failed to save recycle bin items", e);
    }
  }

  static async addToRecycleBin(
    entityType: RecycleBinItem["entityType"],
    item: any,
    originalLocation?: string,
  ): Promise<void> {
    try {
      const items = await this.getRecycleBinItems();
      const entityId = item.id || item.list?.id || String(Date.now());

      // Remove any existing entry for the same entity ID to prevent duplicates
      const filtered = items.filter(
        (existing) =>
          existing.entityId !== entityId && existing.id !== entityId,
      );

      const newItem: RecycleBinItem = {
        id: `rb-${entityId}`,
        entityType,
        entityId,
        snapshot: JSON.stringify(item),
        deletedAt: Date.now(),
      };
      await this.saveRecycleBinItems([newItem, ...filtered]);
    } catch (e) {
      console.warn("Failed to add item to recycle bin", e);
    }
  }

  static async cleanupRecycleBin(): Promise<void> {
    try {
      const items = await this.getRecycleBinItems();
      const now = Date.now();
      const thirtyDaysAgo = now - 30 * this.DAY_MS;
      const expired = items.filter((item) => item.deletedAt < thirtyDaysAgo);
      const remaining = items.filter((item) => item.deletedAt >= thirtyDaysAgo);

      if (expired.length > 0) {
        const notificationIdsToCancel: string[] = [];
        for (const item of expired) {
          if (item.snapshot) {
            try {
              const parsed = JSON.parse(item.snapshot);
              if (
                parsed.reminder?.notificationIds &&
                Array.isArray(parsed.reminder.notificationIds)
              ) {
                notificationIdsToCancel.push(
                  ...parsed.reminder.notificationIds,
                );
              } else if (
                parsed.notificationIds &&
                Array.isArray(parsed.notificationIds)
              ) {
                notificationIdsToCancel.push(...parsed.notificationIds);
              }
            } catch {}
          }
        }
        if (notificationIdsToCancel.length > 0) {
          const { cancelReminderIds } =
            await import("@/services/scheduling/reminders.service");
          await cancelReminderIds(notificationIdsToCancel);
        }
      }

      if (remaining.length !== items.length) {
        await this.saveRecycleBinItems(remaining);
      }
    } catch (e) {
      console.warn("Recycle bin cleanup failed", e);
    }
  }
}
