import type {
  Habit,
  RecurrenceRule,
  TaskPriority,
  TaskSchedule,
} from "@/shared/types/domain.types";

/**
 * The Habit entity as loaded by the Habit Detail screen: the canonical `Habit`
 * shape plus the legacy flat fields that older stored habits may carry and
 * that the existing detail UI still reads/writes (priority, status, completed
 * flags, linked resources, legacy scheduling leftovers).
 *
 * `recurrence` is widened to optional/nullable because the detail screen
 * genuinely handles those runtime values: legacy stored habits may carry
 * `recurrence: null`, the "this occurrence only" edit path constructs a
 * non-recurring copy (`recurrence: undefined`), and the pre-existing save path
 * passes `recurrence: null` when the form's recurrence type is "none". Those
 * values flow through EntityCommandService unchanged; the ECS boundaries cast
 * to the strict `Habit` shape.
 */
export type HabitDetailItem = Omit<Habit, "recurrence"> & {
  recurrence?: RecurrenceRule | null;
  category?: string;
  priority?: TaskPriority;
  completed?: boolean;
  completedToday?: boolean;
  status?: string;
  lastUpdated?: string;
  createdDate?: string;
  folderId?: string;
  linkedCollectionIds?: string[];
  archived?: boolean;
  schedule?: TaskSchedule;
  reminderHour?: number;
  reminderMinute?: number;
  reminderDays?: number[];
  scheduledDate?: string;
};
