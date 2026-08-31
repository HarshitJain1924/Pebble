export type NotificationKind = "todo" | "task" | "habit" | "checklist";
export type NotificationPurpose = "reminder" | "escalation" | string;

/**
 * Builds a deterministic, entity-owned notification logical signature.
 * 
 * Format: `${kind}:${itemId}:${purpose}`
 * Example: "todo:task-123:reminder", "habit:habit-456:reminder", "todo:task-123:escalation"
 * 
 * Invariants:
 * - Distinguishes entity type (`todo` vs `habit`)
 * - Distinguishes entity ID (`itemId`)
 * - Distinguishes notification purpose (`reminder` vs `escalation`)
 * - Immutable: NEVER depends on mutable fields like `title`, `triggerAt`, or `updatedAt`.
 */
export function buildNotificationLogicalSignature(
  kind: NotificationKind,
  itemId: string,
  purpose: NotificationPurpose = "reminder"
): string {
  return `${kind}:${itemId}:${purpose}`;
}

/**
 * Checks whether an OS notification data payload matches an active domain entity.
 * 
 * Supports both canonical entity-owned signatures (`${kind}:${itemId}:${purpose}`)
 * and backward-compatible legacy `triggerAt.toString()` signatures.
 */
export function isMatchingNotificationSignature(
  data: { type?: string; itemId?: string; logicalSignature?: string; purpose?: string; escalationLevel?: number } | undefined,
  entity: { id: string; reminder?: { enabled?: boolean; triggerAt?: number } },
  expectedKind: NotificationKind,
  purpose?: NotificationPurpose
): boolean {
  if (!data || data.type !== expectedKind || data.itemId !== entity.id) {
    return false;
  }

  if (!entity.reminder?.enabled || !entity.reminder?.triggerAt) {
    return false;
  }

  if (!data.logicalSignature) {
    return false;
  }

  // 1. Canonical entity-owned signature match (for specific purpose or inferred purpose)
  const effectivePurpose = purpose || data.purpose || (typeof data.escalationLevel === "number" && data.escalationLevel > 0 ? "escalation" : "reminder");
  const canonicalSignature = buildNotificationLogicalSignature(expectedKind, entity.id, effectivePurpose);
  if (data.logicalSignature === canonicalSignature) {
    return true;
  }

  // Also check primary reminder signature
  if (data.logicalSignature === buildNotificationLogicalSignature(expectedKind, entity.id, "reminder")) {
    return true;
  }

  // Also check escalation signature
  if (data.logicalSignature === buildNotificationLogicalSignature(expectedKind, entity.id, "escalation")) {
    return true;
  }

  // 2. Legacy triggerAt signature compatibility (ONLY recognized for existing notifications, never generated)
  if (data.logicalSignature === entity.reminder.triggerAt.toString()) {
    return true;
  }

  return false;
}
