/**
 * storage-utils.ts
 * ──────────────────
 * Utility functions for repository storage management.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GraphRepository } from "@/repositories/GraphRepository";
import {
  isPebbleOwnedKey,
  isPreservedByContentReset,
} from "@/services/storage/storage-keys";

/**
 * Remove every storage key Pebble owns.
 *
 * Ownership is defined ONCE by `isPebbleOwnedKey` (`services/storage/storage-keys.ts`),
 * which covers `pebble:*`, the legacy `todoapp:*` keys and the widget payload.
 * This used to filter only `key.startsWith("pebble:")`, so a full reset left
 * focus stats, economy ledgers, dashboard preferences, the onboarding mirror,
 * calendar selection and mascot state behind — and would have deleted any
 * non-registry key that merely shared the prefix.
 *
 * Device-local presentation preferences and the onboarding flag survive, because
 * a content reset deletes Pebble's data rather than this installation's state.
 *
 * Intended for tests and full-reset tooling only; the product reset path is
 * `BackupService.clearAllData`, which applies the documented restore policy.
 */
export async function clearRepositoryStorage(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const keysToRemove = allKeys.filter(
      (key) => isPebbleOwnedKey(key) && !isPreservedByContentReset(key),
    );
    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
    }
    GraphRepository.resetCache();
  } catch (e) {
    console.warn("Failed to clear repository storage", e);
  }
}
