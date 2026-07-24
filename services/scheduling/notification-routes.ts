// Notification route mapping — determines where tapping a notification navigates the user

export interface NotificationPayload {
  type: "todo" | "habit";
  itemId: string;
  escalationLevel?: number;
}

/**
 * Parses notification data and returns a typed payload if valid, otherwise null.
 */
export function getNotificationPayload(data: unknown): NotificationPayload | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.type !== "todo" && d.type !== "habit") return null;
  if (typeof d.itemId !== "string" || !d.itemId) return null;
  return {
    type: d.type,
    itemId: d.itemId,
    escalationLevel: typeof d.escalationLevel === "number" ? d.escalationLevel : 0,
  };
}

/**
 * Returns the app route for a notification payload.
 * Used by the notification listener to navigate on tap.
 */
export function getRouteForPayload(payload: NotificationPayload): string {
  switch (payload.type) {
    case "habit":
      return `/task-details?id=${payload.itemId}&type=habit`;
    case "todo":
    default:
      return `/task-details?id=${payload.itemId}&type=task`;
  }
}
export function getNotificationRoute(data: unknown): string | null {
  const payload = getNotificationPayload(data);
  return payload ? getRouteForPayload(payload) : null;
}
