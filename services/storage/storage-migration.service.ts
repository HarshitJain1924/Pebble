/**
 * storage-migration.service.ts
 * ─────────────────────────────
 * Idempotent automatic migration service from pebble:core:* keys to pebble:v1:* keys.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const MIGRATION_COMPLETE_KEY = "pebble:v1:migration_complete";

export class StorageMigrationService {
  /**
   * Run the storage key migration once. Safely transforms legacy pebble:core:* keys to pebble:v1:*.
   * Idempotent & safe to re-run if interrupted.
   */
  static async runMigration(): Promise<void> {
    try {
      const isMigrated = await AsyncStorage.getItem(MIGRATION_COMPLETE_KEY);
      if (isMigrated === "true") {
        return;
      }

      console.log("[StorageMigrationService] Starting pebble:v1:* namespace migration...");
      const allKeys = await AsyncStorage.getAllKeys();
      const legacyKeys = allKeys.filter((k) => k.startsWith("pebble:core:"));

      if (legacyKeys.length === 0) {
        console.log("[StorageMigrationService] No legacy pebble:core:* keys found.");
        await AsyncStorage.setItem(MIGRATION_COMPLETE_KEY, "true");
        return;
      }

      for (const legacyKey of legacyKeys) {
        try {
          const value = await AsyncStorage.getItem(legacyKey);
          if (value !== null) {
            // Map legacy key to canonical pebble:v1 key
            let canonicalKey = legacyKey.replace("pebble:core:", "pebble:v1:");
            if (legacyKey === "pebble:core:folders") {
              canonicalKey = "pebble:v1:workspaces";
            }

            // Write to new canonical key if not already present
            const existingNew = await AsyncStorage.getItem(canonicalKey);
            if (!existingNew) {
              await AsyncStorage.setItem(canonicalKey, value);
              console.log(`[StorageMigrationService] Migrated ${legacyKey} -> ${canonicalKey}`);
            }
          }
        } catch (err) {
          console.warn(`[StorageMigrationService] Failed to migrate key ${legacyKey}:`, err);
        }
      }

      await AsyncStorage.setItem(MIGRATION_COMPLETE_KEY, "true");
      console.log("[StorageMigrationService] Migration to pebble:v1:* completed successfully.");
    } catch (e) {
      console.warn("[StorageMigrationService] Migration failed:", e);
    }
  }
}
