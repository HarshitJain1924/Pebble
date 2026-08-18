/**
 * storage-utils.ts
 * ──────────────────
 * Utility functions for repository storage management.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GraphRepository } from "@/repositories/GraphRepository";

export async function clearRepositoryStorage(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const keysToRemove = allKeys.filter((key) => {
      return key.startsWith("pebble:");
    });
    let extraKeys: string[] = [];

    await AsyncStorage.multiRemove([...keysToRemove, ...extraKeys]);
    GraphRepository.resetCache();
  } catch (e) {
    console.warn("Failed to clear repository storage", e);
  }
}