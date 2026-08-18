import type { Task } from "@/shared/types/domain.types";

/**
 * The Task entity as loaded by the Task Detail screen: the canonical `Task`
 * shape plus the legacy flat fields that older stored tasks may carry and that
 * the existing detail UI still reads/writes. Keeping this type local to the
 * Task Detail feature documents the legacy surface without loosening the
 * canonical `Task` type itself.
 */
export interface TaskDetailItem extends Task {
  category?: string;
  completed?: boolean;
  completedToday?: boolean;
  streak?: number;
  bestStreak?: number;
  lastUpdated?: string;
  createdDate?: string;
  folderId?: string;
  linkedCollectionIds?: string[];
  archived?: boolean;
  reminderHour?: number;
  reminderMinute?: number;
  reminderDays?: number[];
  scheduledDate?: string;
}
