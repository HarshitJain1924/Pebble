/**
 * RecycleBinRepository.ts
 * ───────────────────────────
 * Recycle Bin persistence with 30-day auto-cleanup using canonical RecycleBinItem model.
 * Guarantees: no duplicate entries for the same entity ID.
 */
import { type RecycleBinItem } from "@/shared/types/domain.types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { withLock } from "@/shared/utils/mutex";

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

  let parsedSnapshot: any = null;
  try {
    parsedSnapshot = JSON.parse(snapshotStr);
  } catch {}

  const lifecycleGeneration = raw.lifecycleGeneration ?? parsedSnapshot?.lifecycleGeneration ?? 1;

  return {
    id: raw.id || (lifecycleGeneration > 1 ? `rb-${entityId}-g${lifecycleGeneration}` : `rb-${entityId}`),
    entityType,
    entityId,
    lifecycleGeneration,
    snapshot: snapshotStr,
    deletedAt: raw.deletedAt || Date.now(),
  };
}

export class RecycleBinRepository {
  private static readonly RECYCLE_BIN_KEY = "pebble:v1:recycle_bin";
  private static readonly DAY_MS = 24 * 60 * 60 * 1000;

  static async getRecycleBinItems(): Promise<RecycleBinItem[]> {
    try {
      const raw = await AsyncStorage.getItem(this.RECYCLE_BIN_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return parsed.map(normalizeRecycleBinItem);
    } catch (e) {
      console.error("Failed to get recycle bin items", e);
      throw e;
    }
  }

  static async saveRecycleBinItemsUnlocked(
    items: RecycleBinItem[],
    options?: { throwOnError?: boolean }
  ): Promise<void> {
    try {
      await AsyncStorage.setItem(this.RECYCLE_BIN_KEY, JSON.stringify(items));
    } catch (e) {
      if (options?.throwOnError) {
        console.warn("Failed to save recycle bin items (strict mode)", e);
        throw e;
      } else {
        console.warn("Failed to save recycle bin items (tolerant mode)", e);
      }
    }
  }

  static async saveRecycleBinItems(
    items: RecycleBinItem[],
    options?: { throwOnError?: boolean }
  ): Promise<void> {
    await withLock(this.RECYCLE_BIN_KEY, async () => {
      await this.saveRecycleBinItemsUnlocked(items, options);
    });
  }

  static async addToRecycleBin(
    entityType: RecycleBinItem["entityType"],
    item: any,
    originalLocation?: string,
    options?: { throwOnError?: boolean }
  ): Promise<void> {
    try {
      await withLock(this.RECYCLE_BIN_KEY, async () => {
        const items = await this.getRecycleBinItems();
        const entityId = item.id || item.list?.id || String(Date.now());
        const lifecycleGeneration = item.lifecycleGeneration ?? 1;
        const rbItemId = lifecycleGeneration > 1 ? `rb-${entityId}-g${lifecycleGeneration}` : `rb-${entityId}`;

        // Remove any existing entry for the SAME entity ID AND lifecycle generation
        const filtered = items.filter(
          (existing) =>
            !(
              (existing.entityId === entityId || existing.id === entityId || existing.id === rbItemId) &&
              (existing.lifecycleGeneration ?? 1) === lifecycleGeneration
            )
        );

        const newItem: RecycleBinItem = {
          id: rbItemId,
          entityType,
          entityId,
          lifecycleGeneration,
          snapshot: JSON.stringify(item),
          deletedAt: Date.now(),
        };
        await this.saveRecycleBinItemsUnlocked([newItem, ...filtered], options);
      });
    } catch (e) {
      if (options?.throwOnError) {
        console.warn("Failed to add item to recycle bin (strict mode)", e);
        throw e;
      } else {
        console.warn("Failed to add item to recycle bin (tolerant mode)", e);
      }
    }
  }

  static async addMultipleToRecycleBin(
    itemsToAdd: { entityType: RecycleBinItem["entityType"]; item: any }[],
    options?: { throwOnError?: boolean }
  ): Promise<void> {
    if (itemsToAdd.length === 0) return;
    try {
      await withLock(this.RECYCLE_BIN_KEY, async () => {
        const items = await this.getRecycleBinItems();
        
        const newSnapshots = itemsToAdd.map(({ entityType, item }) => {
          const entityId = item.id || item.list?.id || String(Date.now());
          const lifecycleGeneration = item.lifecycleGeneration ?? 1;
          const rbItemId = lifecycleGeneration > 1 ? `rb-${entityId}-g${lifecycleGeneration}` : `rb-${entityId}`;
          return {
            id: rbItemId,
            entityType,
            entityId,
            lifecycleGeneration,
            snapshot: JSON.stringify(item),
            deletedAt: Date.now(),
          } as RecycleBinItem;
        });

        // Remove any existing entry for the same entity IDs and generations
        const matchingKeys = new Set(newSnapshots.map(s => `${s.entityId}:g${s.lifecycleGeneration ?? 1}`));
        const filtered = items.filter(
          (existing) =>
            !matchingKeys.has(`${existing.entityId}:g${existing.lifecycleGeneration ?? 1}`) &&
            !newSnapshots.some(s => s.id === existing.id)
        );

        await this.saveRecycleBinItemsUnlocked([...newSnapshots, ...filtered], options);
      });
    } catch (e) {
      if (options?.throwOnError) {
        console.warn("Failed to add items to recycle bin (strict mode)", e);
        throw e;
      } else {
        console.warn("Failed to add items to recycle bin (tolerant mode)", e);
      }
    }
  }

  static async cleanupRecycleBin(): Promise<void> {
    try {
      await withLock(this.RECYCLE_BIN_KEY, async () => {
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
          await this.saveRecycleBinItemsUnlocked(remaining);
        }
      });
    } catch (e) {
      console.warn("Recycle bin cleanup failed", e);
    }
  }

  static async removeRecycleBinItems(
    idsToRemove: string[],
    options?: { throwOnError?: boolean }
  ): Promise<void> {
    if (idsToRemove.length === 0) return;
    try {
      await withLock(this.RECYCLE_BIN_KEY, async () => {
        const items = await this.getRecycleBinItems();
        const idSet = new Set(idsToRemove);
        const remaining = items.filter(
          (item) => !idSet.has(item.id) && !idSet.has(item.entityId)
        );
        if (remaining.length !== items.length) {
          await this.saveRecycleBinItemsUnlocked(remaining, options);
        }
      });
    } catch (e) {
      if (options?.throwOnError) {
        console.warn("Failed to remove items from recycle bin (strict mode)", e);
        throw e;
      } else {
        console.warn("Failed to remove items from recycle bin (tolerant mode)", e);
      }
    }
  }
}
