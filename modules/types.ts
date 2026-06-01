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
  repeatType?: "none" | "daily" | "weekly" | "monthly";
  folderId?: string;
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
};

export type TaskList = {
  id: string;
  name: string;
  emoji?: string;
  icon?: string;
  iconType?: "emoji" | "icon";
  color?: string;
};
