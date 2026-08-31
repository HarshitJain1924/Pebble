/**
 * Explicit types for the Pebble notification subsystem.
 *
 * These types are used across notification-identity, notification-routes,
 * reminders.service, NotificationReconcilerService, and the Alert Center UI.
 */

/** The entity types that can own notifications. */
export type NotificationEntityType = "todo" | "habit" | "checklist";

/** Alert status used by the Alert Center UI projection. */
export type NotificationStatus =
  | "scheduled"
  | "due_soon"
  | "overdue"
  | "completed"
  | "cancelled";

/** An Alert Center item derived from domain state + notification metadata. */
export interface AlertCenterItem {
  entityId: string;
  entityType: NotificationEntityType;
  title: string;
  /** Epoch ms of the reminder trigger time. */
  triggerAt: number;
  /** Computed status derived from current time vs triggerAt + entity state. */
  status: NotificationStatus;
  /** Workspace the entity belongs to. */
  workspaceId: string;
  /** Entity-specific metadata. */
  meta?: {
    /** Checklist progress: completed / total. */
    completedCount?: number;
    totalCount?: number;
    /** Habit streak. */
    streak?: number;
    /** Recurrence label (e.g. "Daily", "Weekdays"). */
    recurrenceLabel?: string;
  };
}
