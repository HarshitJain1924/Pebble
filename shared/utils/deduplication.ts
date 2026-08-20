/**
 * Deduplicates an array of entities by their `id`.
 * If multiple entities share the same `id`, the one with the highest `updatedAt` wins.
 * This guarantees we read the authoritative Target entity when a move operation
 * fails to delete the Source ghost.
 * 
 * Note: While the Durable Move Journal guarantees eventual consistency, this acts as a 
 * defensive fallback to ensure ghosts are never exposed in the UI or Backup if 
 * reconciliation fails or is delayed.
 */
export function deduplicateEntities<T extends { id: string; updatedAt?: number }>(
  items: T[]
): T[] {
  const map = new Map<string, T>();

  for (const item of items) {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
    } else {
      const existingTime = existing.updatedAt || 0;
      const newTime = item.updatedAt || 0;
      if (newTime > existingTime) {
        map.set(item.id, item);
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Deduplicates a record map of arrays (e.g. grouped by workspaceId) globally.
 * Returns a new record map where each entity appears exactly once across ALL arrays,
 * placed in the workspace array of the authoritative entity.
 * 
 * Note: Defensive fallback against historical ghosts or delayed reconciliation.
 */
export function deduplicateEntityMap<T extends { id: string; updatedAt?: number }>(
  mapOfArrays: Record<string, T[]>
): Record<string, T[]> {
  // First, flatten and deduplicate globally
  const allItems: T[] = [];
  for (const arr of Object.values(mapOfArrays)) {
    allItems.push(...arr);
  }
  const deduplicated = deduplicateEntities(allItems);

  // Then rebuild the map based on the authoritative workspace partitions
  const result: Record<string, T[]> = {};
  for (const key of Object.keys(mapOfArrays)) {
    result[key] = [];
  }

  for (const item of deduplicated) {
    // If the item has a workspaceId and it exists in the keys, put it there
    const wsId = (item as any).workspaceId;
    if (wsId && result[wsId] !== undefined) {
      result[wsId].push(item);
    } else {
      // Fallback: put it in the first available key if we can't determine
      const firstKey = Object.keys(result)[0];
      if (firstKey) {
        result[firstKey].push(item);
      }
    }
  }

  return result;
}
