import { type TaskCategory } from "@/services/taskCategories";

export type Subtask = {
  id: string;
  title: string;
  completed: boolean;
};

export type Todo = {
  id: string;
  title: string;
  completed: boolean;
  category?: TaskCategory;
  alarmId?: string;
  alarmTime?: number;
  notificationIds?: string[];
  reminderHour?: number;
  reminderMinute?: number;
  reminderDays?: number[];
  escalationMinutes?: number[];
  subtasks?: Subtask[];
  priority?: "low" | "medium" | "high";
  scheduledDate?: string;
  description?: string;
  tags?: string[];
  durationMinutes?: number;
  recurrence?: {
    type: "daily" | "weekdays" | "weekly" | "monthly" | "interval";
    interval?: number;
    unit?: "hours" | "days";
    days?: number[];
    dayOfMonth?: number;
  };
  folderId?: string;
  archived?: boolean;
  createdDate?: string;
  lastUpdated?: string;
  recurrenceExceptions?: string[];
  createdAt?: number;
};

export type Habit = {
  id: string;
  title: string;
  streak: number;
  bestStreak: number;
  completedToday: boolean;
  lastCompletedDate?: string;
  reminderHour?: number;
  reminderMinute?: number;
  reminderDays?: number[];
  notificationIds?: string[];
  escalationMinutes?: number[];
  priority?: "low" | "medium" | "high";
  recurrence?: {
    type: "daily" | "weekdays" | "weekly" | "monthly" | "interval";
    interval?: number;
    unit?: "hours" | "days";
    days?: number[];
    dayOfMonth?: number;
  };
  description?: string;
  category?: TaskCategory;
  folderId?: string;
  archived?: boolean;
  createdDate?: string;
  lastUpdated?: string;
  recurrenceExceptions?: string[];
  createdAt?: number;
};

export type TaskList = {
  id: string;
  name: string;
  emoji?: string;
  icon?: string;
  iconType?: "emoji" | "icon";
  color?: string;
  createdAt?: number;
};
