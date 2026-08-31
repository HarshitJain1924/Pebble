/**
 * Explicit types for the Pebble notification subsystem.
 *
 * These types are used across notification-identity, notification-routes,
 * reminders.service, NotificationReconcilerService, and the Alert Center UI.
 */

/** The canonical entity types that can own notifications in Pebble. */
export type NotificationEntityType = "todo" | "habit" | "checklist";

/** Backwards-compatible alias for ReminderKind / NotificationKind */
export type NotificationKind = NotificationEntityType;

/** The logical purpose of a notification. */
export type NotificationPurpose = "reminder" | "escalation" | string;

/** Alert status used by the Alert Center UI projection. */
export type NotificationStatus =
  | "scheduled"
  | "due_soon"
  | "overdue"
  | "completed"
  | "cancelled";

/** An Alert Center item derived directly from authoritative domain state. */
export interface AlertCenterItem {
  id: string; // Deterministic logical identifier (`${entityType}:${entityId}`)
  entityId: string;
  entityType: NotificationEntityType;
  title: string;
  /** Epoch ms of the reminder trigger time (or next upcoming occurrence). */
  triggerAt: number;
  /** Computed status derived from current time vs triggerAt + entity state. */
  status: NotificationStatus;
  /** Workspace the entity belongs to. */
  workspaceId: string;
  /** Category ID for color / filtering if applicable. */
  categoryId?: string;
  /** Entity-specific metadata for UI display. */
  meta?: {
    /** Checklist progress: completed / total. */
    completedCount?: number;
    totalCount?: number;
    /** Habit streak. */
    streak?: number;
    bestStreak?: number;
    /** Recurrence metadata. */
    isRecurring?: boolean;
    recurrenceLabel?: string;
    /** Formatted human-readable time strings. */
    timeLabel?: string;
    relativeLabel?: string;
  };
}

/** Structured groups for Alert Center presentation. */
export interface AlertCenterGroups {
  needsAttention: AlertCenterItem[];
  upNext: AlertCenterItem[];
  later: AlertCenterItem[];
  all: AlertCenterItem[];
}
