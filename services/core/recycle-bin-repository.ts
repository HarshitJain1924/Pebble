/**
 * recycle-bin-repository.ts
 * ───────────────────────────
 * Recycle Bin persistence with 30-day auto-cleanup.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { type RecycleBinItem } from "./models";

export class RecycleBinRepository {
  private static readonly RECYCLE_BIN_KEY = "pebble:core:recycle_bin";
  private static readonly DAY_MS = 24 * 60 * 60 * 1000;

  static async getRecycleBinItems(): Promise<RecycleBinItem[]> {
    try {
      const raw = await AsyncStorage.getItem(this.RECYCLE_BIN_KEY);
      return raw ? JSON.parse(raw) : [];
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
    itemType: RecycleBinItem["itemType"],
    item: any,
    originalFolderId: string,
  ): Promise<void> {
    try {
      const items = await this.getRecycleBinItems();
      const newItem: RecycleBinItem = {
        id: item.id || String(Date.now()),
        title: item.title || item.name || "Untitled",
        deletedAt: Date.now(),
        itemType,
        originalFolderId,
        snapshot: JSON.stringify(item),
      };
      await this.saveRecycleBinItems([newItem, ...items]);
    } catch (e) {
      console.warn("Failed to add item to recycle bin", e);
    }
  }

  static async cleanupRecycleBin(): Promise<void> {
    try {
      const items = await this.getRecycleBinItems();
      const now = Date.now();
      const thirtyDaysAgo = now - 30 * this.DAY_MS;
      const remaining = items.filter((item) => item.deletedAt >= thirtyDaysAgo);
      if (remaining.length !== items.length) {
        await this.saveRecycleBinItems(remaining);
      }
    } catch (e) {
      console.warn("Recycle bin cleanup failed", e);
    }
  }
}