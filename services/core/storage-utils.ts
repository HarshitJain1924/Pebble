/**
 * storage-utils.ts
 * ──────────────────
 * Utility functions for repository storage management.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GraphRepository } from "./graph-repository";

export async function clearRepositoryStorage(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const keysToRemove = allKeys.filter((key) => key.startsWith("pebble:core:"));
    const extraKeys = ["pebble:schema_version"];

    await AsyncStorage.multiRemove([...keysToRemove, ...extraKeys]);
    GraphRepository.resetCache();
  } catch (e) {
    console.warn("Failed to clear repository storage", e);
  }
}