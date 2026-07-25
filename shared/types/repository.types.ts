/**
 * models.ts
 * ──────────
 * Pebble current Unified Domain Models.
 */

export const DEFAULT_WORKSPACE_ID = "default";

export type ItemRef = {
  id: string;
  type: "task" | "habit" | "checklist" | "resource" | "focus_session";
};

export type ActivityCategory =
  | "work"
  | "finance"
  | "health"
  | "personal"
  | string;

export interface ScheduleConfig {
  scheduledDate?: string; // YYYY-MM-DD
  scheduledTime?: string; // HH:MM
  durationMinutes?: number; // Block length on calendar view
  alarmTime?: number; // Epoch MS for OS notification trigger
  alarmId?: string; // OS scheduled notification ID
  reminderHour?: number;
  reminderMinute?: number;
  reminderDays?: number[]; // [0..6] (Sunday..Saturday)
  notificationIds?: string[];
  recurrence?: {
    type: "daily" | "weekdays" | "weekly" | "monthly" | "interval";
    interval?: number;
    unit?: "hours" | "days";
    days?: number[];
    dayOfMonth?: number;
  };
}

export interface Task extends ScheduleConfig {
  id: string;
  workspaceId: string;
  folderId?: string;
  title: string;
  completed: boolean;
  completedAt?: number;
  priority: "low" | "medium" | "high";
  category: ActivityCategory;
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
  description?: string;
  dueDate?: string; // Alias for scheduledDate
}

export interface Habit extends ScheduleConfig {
  id: string;
  workspaceId: string;
  folderId?: string;
  title: string;
  streak: number;
  bestStreak: number;
  completedDates: string[]; // YYYY-MM-DD completion list
  recurrenceRule: string; // iCal recurrence rule (e.g. "FREQ=DAILY")
  priority?: "low" | "medium" | "high";
  category?: ActivityCategory;
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
  description?: string;
}

export interface Checklist {
  id: string;
  workspaceId: string;
  folderId?: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
  items: {
    id: string;
    title: string;
    completed: boolean;
  }[];
}

// Unified Resource Model (Notes, Ideas, Links, Files)
export type ResourceType = "note" | "idea" | "link" | "file";

export interface Resource {
  id: string;
  workspaceId: string;
  title: string;
  resourceType: ResourceType;
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
  pinned?: boolean;
  tags?: string[];
  body: {
    content?: string; // for Note / Idea
    url?: string; // for Link
    localUri?: string; // for File
    mimeType?: string; // for File
    fileSize?: number; // for File
  };
  payload?: any; // Alias for body
}

export interface FocusSession {
  id: string;
  workspaceId?: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  target?: {
    id: string;
    type: "task" | "habit";
  };
  linkedItem?: { id: string; type: "task" | "habit" }; // Alias for target
}

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

export interface SystemEventLog {
  id: string;
  workspaceId: string;
  itemId: string;
  itemType: "task" | "habit" | "checklist" | "resource" | "focus_session";
  action: "created" | "completed" | "archived" | "focused" | "status_change";
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface RecycleBinItem {
  id: string;
  title: string;
  deletedAt: number;
  itemType: "workspace" | "task" | "habit" | "checklist" | "resource";
  originalLocation: string;
  snapshot: string; // Stringified JSON payload for recovery
}

export interface Settings {
  theme: "dark" | "light" | "system";
  quietHours: {
    enabled: boolean;
    startHour: number;
    endHour: number;
  };
  categoriesEnabled: Record<string, boolean>;
  escalationEnabled: boolean;
  mascotVisible: boolean;
}

export interface UserProfile {
  name: string;
  email: string;
  avatar: string;
  level: number;
  xp: number;
}

export interface UiState {
  activeWorkspaceId: string;
  lastOpenedWorkspaceId?: string;
  completedOnboarding: boolean;
  themeCache: "dark" | "light";
}
