import { type TaskCategory } from "@/features/tasks/services/task-categories";
import { type ScheduleConfig } from "@/shared/types/repository.types";

// ==========================================
// SHARED BUILDING BLOCKS (VALUE OBJECTS)
// ==========================================

/** System Audit Trail composed by all root entities */
export interface AuditInfo {
  createdAt?: number;
  updatedAt?: number;
  archivedAt?: number;
}

/** Composable Time Schedule for Tasks */
export interface Schedule {
  scheduledDate?: string; // Format: "YYYY-MM-DD"
  scheduledTime?: string; // Format: "HH:mm"
  deadlineDate?: string;  // Format: "YYYY-MM-DD"
  durationMinutes?: number;
}

/** Composable Push Notification Alert Configuration */
export interface Reminder {
  alarmTime?: number;      // Epoch timestamp (ms)
  notificationIds?: string[];
  escalationMinutes?: number[];
}

/** Composable Recurrence Rule */
export interface RecurrenceRule {
  type: "daily" | "weekdays" | "weekly" | "monthly" | "interval";
  interval?: number;
  unit?: "hours" | "days";
  days?: number[];         // 0 = Sunday ... 6 = Saturday
  dayOfMonth?: number;
}

/** Composable Physical/Digital Location */
export interface TaskLocation {
  locationName?: string;
  locationUrl?: string;
}

// ==========================================
// CONSTITUTIONAL DOMAIN ENTITIES
// ==========================================

/** Top-Level Workspace Entity */
export interface Workspace extends AuditInfo {
  id: string;
  name: string;
  emoji?: string;
  icon?: string;
  iconType?: "emoji" | "icon";
  color?: string;
  description?: string;
  archived?: boolean;
}

/** First-Class Task Entity (Atomic Commitment) */
export interface Task extends AuditInfo, ScheduleConfig {
  id: string;
  workspaceId?: string;
  folderId?: string; // Backwards compatible mapping
  title: string;
  description?: string;
  completed: boolean;
  completedAt?: number;
  priority?: "low" | "medium" | "high";
  category?: TaskCategory;
  archived?: boolean;
  isEvent?: boolean;
  
  // Composable Value Objects & Scheduling
  schedule?: Schedule;
  reminder?: Reminder;
  location?: TaskLocation;
  recurrenceConfig?: RecurrenceRule;
  escalationMinutes?: number[];
  alarmTime?: number;
  alarmId?: string;
  notificationIds?: string[];
  dueDate?: string;
  scheduledDate?: string;
  
  // Cross-Domain & Legacy Metadata
  resourceId?: string;
  linkedResourceIds?: string[];
  linkedCollectionIds?: string[];
  xpAwarded?: boolean;
  createdDate?: string;
  startDate?: string;
  lastUpdated?: string;
  recurrenceExceptions?: string[];
}

/** First-Class Habit Entity (Behavioral Routine) */
export interface Habit extends AuditInfo, ScheduleConfig {
  id: string;
  workspaceId?: string;
  folderId?: string; // Backwards compatible mapping
  title: string;
  description?: string;
  category?: TaskCategory;
  archived?: boolean;
  priority?: "low" | "medium" | "high";
  
  // Streak & History State
  streak: number;
  bestStreak: number;
  completedToday: boolean;
  completedDates?: string[]; // List of "YYYY-MM-DD" completion dates
  lastCompletedDate?: string;
  previousStreak?: number;
  streakBrokenDate?: string;
  xpAwardedDate?: string;
  
  // Recurrence Schedule & Reminders
  reminderDays?: number[];
  reminderHour?: number;
  reminderMinute?: number;
  escalationMinutes?: number[];
  
  // Cross-Domain & Legacy Metadata
  resourceId?: string;
  linkedResourceIds?: string[];
  linkedCollectionIds?: string[];
  createdDate?: string;
  startDate?: string;
  lastUpdated?: string;
  recurrenceExceptions?: string[];
}

/** Individual Checklist Item (Owned by Checklist) */
export interface ChecklistItem {
  id: string;
  title: string;
  text?: string;
  completed: boolean;
  completedAt?: number;
}

/** First-Class Checklist Entity (Independent Collection of Checkable Items) */
export interface Checklist extends AuditInfo {
  id: string;
  workspaceId?: string;
  folderId?: string; // Backwards compatible mapping
  title: string;
  description?: string;
  category?: TaskCategory;
  archived?: boolean;
  items: ChecklistItem[];
  
  // Cross-Domain & Legacy Metadata
  resourceId?: string;
  linkedResourceIds?: string[];
  linkedCollectionIds?: string[];
}

export type ResourceType = "link" | "note" | "idea" | "file";

/** First-Class Resource Entity (Preserved Reference Material) */
export interface Resource extends AuditInfo {
  id: string;
  workspaceId?: string;
  type: ResourceType;
  kind?: "idea";
  title: string;
  content?: string;        // Text content or note snippet
  url?: string;            // Web URL for link resources
  mediaUri?: string;
  previewImageUrl?: string;
  archived?: boolean;
  pinned?: boolean;
  linkedItemIds?: string[];
  tags?: string[];
  createdAt: number;
  updatedAt?: number;
  
  // File metadata
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  localUri?: string;
}

/** Recycle Bin Snapshot Entity */
export interface RecycleBinItem {
  id: string;
  title: string;
  deletedAt: number;
  itemType:
    | "task"
    | "habit"
    | "workspace"
    | "resource"
    | "checklist"
    | "checklist_item"
    // Legacy support
    | "vault"
    | "collection"
    | "collection_item";
  originalLocation: string;
  data: any;
}



