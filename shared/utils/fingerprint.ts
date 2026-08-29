/**
 * Generates a stable deterministic fingerprint (53-bit string hash) for an entity.
 * Ignores mutable persistence metadata (updatedAt, revision) and transient scheduling states (notificationIds).
 */
export function generateEntityFingerprint(entity: any): string {
  if (!entity || typeof entity !== "object") return "";

  // 1. Strip fields that are legitimately mutated by the persistence layer
  //    or by immediate post-persistence scheduling.
  const { updatedAt, revision, reminder, lifecycleGeneration, ...stableFields } = entity;

  (stableFields as any).lifecycleGeneration = lifecycleGeneration ?? 1;

  // 2. Handle nested objects like reminder which have volatile notificationIds
  if (reminder) {
    const { notificationIds, ...stableReminder } = reminder;
    (stableFields as any).reminder = stableReminder;
  }

  // 3. Sort keys recursively (or at least top-level) to ensure stable JSON serialization.
  // Given our domain model, top-level sorting + reminder handling is sufficient.
  const sortedKeys = Object.keys(stableFields).sort();
  const sortedEntity: Record<string, any> = {};
  for (const key of sortedKeys) {
    sortedEntity[key] = stableFields[key];
  }

  const jsonString = JSON.stringify(sortedEntity);
  return cyrb53(jsonString);
}

/**
 * Fast, non-cryptographic 53-bit hash function (cyrb53)
 * Suitable for deterministic state fingerprinting.
 */
function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
