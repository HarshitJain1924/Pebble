/**
 * TombstoneRepository.ts
 * ───────────────────────────
 * Durable Tombstone persistence for permanently deleted entity lifecycles.
 * Guarantees:
 * - Permanent deletion creates a durable generation barrier.
 * - Stale operations targeting a dead generation are rejected.
 */
import { type Tombstone } from "@/shared/types/domain.types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { withLock } from "@/shared/utils/mutex";

export class TombstoneRepository {
  private static readonly TOMBSTONES_KEY = "pebble:v1:tombstones";

  static async getTombstones(): Promise<Tombstone[]> {
    try {
      const raw = await AsyncStorage.getItem(this.TOMBSTONES_KEY);
      if (!raw) return [];
      const parsed: Tombstone[] = JSON.parse(raw);
      return parsed;
    } catch (e) {
      console.error("[TombstoneRepository] Failed to get tombstones", e);
      return [];
    }
  }

  static async saveTombstonesUnlocked(
    tombstones: Tombstone[],
    options?: { throwOnError?: boolean }
  ): Promise<void> {
    try {
      await AsyncStorage.setItem(this.TOMBSTONES_KEY, JSON.stringify(tombstones));
    } catch (e) {
      if (options?.throwOnError) {
        console.warn("[TombstoneRepository] Failed to save tombstones (strict mode)", e);
        throw e;
      } else {
        console.warn("[TombstoneRepository] Failed to save tombstones (tolerant mode)", e);
      }
    }
  }

  static async addTombstone(
    tombstone: Tombstone,
    options?: { throwOnError?: boolean }
  ): Promise<void> {
    await this.addTombstones([tombstone], options);
  }

  static async addTombstones(
    tombstonesToAdd: Tombstone[],
    options?: { throwOnError?: boolean }
  ): Promise<void> {
    if (tombstonesToAdd.length === 0) return;
    try {
      await withLock(this.TOMBSTONES_KEY, async () => {
        const existing = await this.getTombstones();
        const idsToAdd = new Set(tombstonesToAdd.map((t) => t.id));
        const filtered = existing.filter((t) => !idsToAdd.has(t.id));
        await this.saveTombstonesUnlocked([...filtered, ...tombstonesToAdd], options);
      });
    } catch (e) {
      if (options?.throwOnError) {
        throw e;
      }
    }
  }

  static async isTombstoned(
    entityType: string,
    entityId: string,
    lifecycleGeneration?: number
  ): Promise<boolean> {
    const tombstones = await this.getTombstones();
    return tombstones.some((t) => {
      if (t.entityType !== entityType || t.entityId !== entityId) return false;
      if (lifecycleGeneration !== undefined) {
        return t.lifecycleGeneration >= lifecycleGeneration;
      }
      return true;
    });
  }

  static async getHighestTombstonedGeneration(
    entityType: string,
    entityId: string
  ): Promise<number> {
    const tombstones = await this.getTombstones();
    let max = 0;
    for (const t of tombstones) {
      if (t.entityType === entityType && t.entityId === entityId) {
        if (t.lifecycleGeneration > max) {
          max = t.lifecycleGeneration;
        }
      }
    }
    return max;
  }

  static async clearTombstones(): Promise<void> {
    await withLock(this.TOMBSTONES_KEY, async () => {
      await AsyncStorage.removeItem(this.TOMBSTONES_KEY);
    });
  }
}
