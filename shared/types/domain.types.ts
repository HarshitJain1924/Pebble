// ==========================================
// PEBBLE CANONICAL DOMAIN MODEL
// ==========================================

export const INBOX_WORKSPACE_ID = "inbox";
export const MY_PEBBLES_WORKSPACE_ID = "my-pebbles";

/**
 * 1. Workspace Entity
 */
export interface Workspace {
  id: string;
  name: string;
  emoji?: string;
  color?: string;
  description?: string;
  type?: "list" | "tag" | "smart";
  filterRules?: any;
  order?: number;
  revision: number;
  lifecycleGeneration: number;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
}

/**
 * 2. Shared Value Objects
 */
export type TaskStatus = "todo" | "completed";
export type TaskPriority = "none" | "low" | "medium" | "high";

export interface TaskSchedule {
  date?: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  durationMinutes?: number; // Duration in minutes
  allDay?: boolean;
}

export interface Reminder {
  enabled: boolean;
  triggerAt: number; // Epoch timestamp in ms
  notificationIds?: string[];
}

export interface RecurrenceRule {
  frequency: "daily" | "weekly" | "monthly" | "yearly" | "custom";
  interval: number;
  unit?: "hours" | "days";
  daysOfWeek?: number[]; // 0 = Sunday ... 6 = Saturday
  dayOfMonth?: number;
  endDate?: string; // YYYY-MM-DD
  occurrences?: number;
}

/**
 * 3. Task Entity
 */
export interface Task {
  id: string;
  workspaceId: string;
  title: string;
  description?: string;
  categoryId?: string;
  tags?: string[];
  revision: number;
  lifecycleGeneration: number;
  status: TaskStatus;
  priority: TaskPriority;
  schedule?: TaskSchedule;
  reminder?: Reminder;
  recurrence?: RecurrenceRule;
  recurrenceExceptions?: string[];
  resourceIds?: string[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  archivedAt?: number;
}

/**
 * 4. Habit Entity & Completion History
 */
export interface HabitCompletion {
  date: string; // YYYY-MM-DD
  completedAt: number; // Epoch timestamp in ms
}

export interface Habit {
  id: string;
  workspaceId: string;
  title: string;
  description?: string;
  categoryId?: string;
  revision: number;
  lifecycleGeneration: number;
  tags?: string[];
  recurrence: RecurrenceRule;
  recurrenceExceptions?: string[];
  completionHistory: HabitCompletion[];
  schedule?: TaskSchedule;
  reminder?: Reminder;
  resourceIds?: string[];
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
  streak?: number; // Added for UI tracking
  bestStreak?: number; // Added for UI tracking
  lastCompletedDate?: string; // Added for UI tracking
}

/**
 * 5. Checklist Entity & Item
 */
export interface ChecklistItem {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: number;
}

export interface ChecklistOccurrenceRecord {
  completedItemIds?: string[];
  completedAt?: number;
}

export interface Checklist {
  id: string;
  workspaceId: string;
  title: string;
  description?: string;
  items: ChecklistItem[];
  categoryId?: string;
  tags?: string[];
  revision: number;
  lifecycleGeneration: number;
  resourceIds?: string[];
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
  pebbleAwarded?: boolean;

  // ── Schedulable Checklist Extensions ──
  schedule?: TaskSchedule;
  recurrence?: RecurrenceRule;
  recurrenceExceptions?: string[];
  reminder?: Reminder;
  occurrenceHistory?: Record<string, ChecklistOccurrenceRecord>;
}

/**
 * 6. Resource Entity, ResourceType & Attachment
 */
export type ResourceType = "note" | "link" | "idea";

export interface Attachment {
  id: string;
  name: string;
  uri: string;
  mimeType: string;
  size?: number;
}

export interface Resource {
  id: string;
  workspaceId: string;
  title: string;
  type: ResourceType;
  content?: string;
  body?: string;
  attachments?: Attachment[];
  categoryId?: string;
  tags?: string[];
  revision: number;
  lifecycleGeneration: number;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
}

/**
 * 7. FocusSession Entity
 */
export interface FocusSession {
  id: string;
  taskId?: string;
  startedAt: number;
  endedAt?: number;
  duration: number; // seconds
}

/**
 * 8. RecycleBinItem Entity
 */
export interface RecycleBinItem {
  id: string;
  entityType: "workspace" | "task" | "habit" | "checklist" | "resource";
  entityId: string;
  lifecycleGeneration: number;
  snapshot: string; // Stringified JSON representation of deleted entity
  deletedAt: number;
}

/**
 * 9. Settings Entity
 */
export interface Settings {
  theme: "dark" | "light" | "system";
  quietHours: {
    enabled: boolean;
    startHour: number;
    endHour: number;
  };
  categories: Record<string, boolean>;
  escalationEnabled: boolean;
  showDuration?: boolean;
  showRepeat?: boolean;
  showReminder?: boolean;
  showTags?: boolean;
  showNotes?: boolean;
  showMascot?: boolean;
  defaultTimeEstimate?: number;
  editorRowOrder?: string[];
}

/**
 * 10. UserProfile Entity
 */
export interface UserProfile {
  name: string;
  email: string;
  avatar: string;
}

/**
 * 11. Category Entity
 */
export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  order: number;
  createdAt: number;
}

/**
 * 12. UiState Entity
 */
export interface UiState {
  activeWorkspaceId: string | null;
  completedOnboarding: boolean;
  themeCache: "dark" | "light";
}

/**
 * 13. Relationship Entity
 */
export interface Relationship {
  id: string;
  source: { id: string; type: string };
  target: { id: string; type: string };
  relationType:
    | "supports"
    | "references"
    | "blocked_by"
    | "focuses_on"
    | "related";
  createdAt: number;
}

/**
 * 14. SystemEventLog Entity
 */
export interface SystemEventLog {
  id: string;
  workspaceId: string;
  itemId: string;
  itemType: "task" | "habit" | "checklist" | "resource" | "focus_session";
  action: "created" | "completed" | "archived" | "focused" | "status_change";
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * 15. MoveJournalEntry Entity
 */
export interface MoveJournalEntry {
  operationId: string;
  operationType?: "move" | "recycle" | "restore";
  entityId: string;
  entityType: "task" | "habit" | "checklist" | "resource" | "workspace";
  sourceWorkspaceId: string;
  targetWorkspaceId: string;
  timestamp: number;
  lifecycleGeneration: number;
  expectedRevision: number;
  sequence?: number;
}

/**
 * 16. ConversionJournalEntry Entity
 */
export interface ConversionJournalEntry {
  operationId: string;
  operationType: "habit_to_task" | "task_to_habit";
  sourceId: string;
  sourceWorkspaceId: string;
  targetId: string;
  targetWorkspaceId: string;
  phase: "PREPARED" | "DESTINATION_WRITTEN";
  timestamp: number;
  sourceRevision: number;
  sourceGeneration: number;
  targetGeneration: number;
  targetCreatedAt?: number;
  targetFingerprint?: string;
  sequence?: number;
}

/**
 * 17. Tombstone Entity
 */
export interface Tombstone {
  id: string;
  entityType: "task" | "habit" | "checklist" | "resource" | "workspace";
  entityId: string;
  lifecycleGeneration: number;
  deletionRevision?: number;
  deletedAt: number;
}
