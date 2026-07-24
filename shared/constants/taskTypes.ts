// Shared types for task/habit screens

export type ChecklistItem = {
  id: string;
  title: string;
  completed: boolean;
};

export type Task = {
  id: string;
  title: string;
  completed: boolean;
  category?: string;
  alarmId?: string;
  alarmTime?: number;
  notificationIds?: string[];
  reminderHour?: number;
  reminderMinute?: number;
  reminderDays?: number[];
  escalationMinutes?: number[];
  priority?: "low" | "medium" | "high";
  scheduledDate?: string;
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
  previousStreak?: number;
  streakBrokenDate?: string;
};

export type Workspace = { id: string; name: string };
