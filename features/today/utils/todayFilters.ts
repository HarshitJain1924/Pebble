import type {
  Checklist,
  Habit,
  Task,
  TaskPriority,
} from "@/shared/types/domain.types";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import {
  getTodayDateKey,
  isChecklistCompletedForDate,
  isHabitCompletedToday,
  isTaskCompleted,
} from "@/shared/utils/domain-selectors";
import { getCategoryMeta } from "@/features/tasks/services/task-categories";

function resolveWorkspaceId(entity: { workspaceId?: string; folderId?: string }): string {
  return entity.workspaceId || entity.folderId || INBOX_WORKSPACE_ID;
}

export type TodayFilterType = "all" | "tasks" | "habits" | "checklists";
export type TodayFilterPriority = "all" | Exclude<TaskPriority, "none">;
export type TodayFilterSchedule = "all" | "scheduled" | "unscheduled";
export type TodayFilterStatus = "all" | "active" | "completed" | "overdue";
export type TodayFilterSort = "default" | "priority" | "alphabetical";

export interface TodayFilterState {
  type: TodayFilterType;
  workspaceId: string;
  categoryId: string;
  priority: TodayFilterPriority;
  schedule: TodayFilterSchedule;
  status: TodayFilterStatus;
  sort: TodayFilterSort;
}

export const DEFAULT_TODAY_FILTERS: TodayFilterState = {
  type: "all",
  workspaceId: "all",
  categoryId: "all",
  priority: "all",
  schedule: "all",
  status: "all",
  sort: "default",
};

export interface PersistedTodayFilters {
  filter?: string | null;
  priority?: string | null;
  workspaceId?: string | null;
  categoryId?: string | null;
  schedule?: string | null;
  status?: string | null;
  sort?: string | null;
}

export interface TodayFilterPersistenceValues {
  filter: string;
  priority: string;
  workspaceId: string;
  categoryId: string;
  schedule: string;
  status: string;
  sort: string;
}

type NormalizeTodayFiltersInput = Partial<
  Record<keyof TodayFilterState, string | null>
> &
  PersistedTodayFilters;

export interface TodayFilterInput {
  pendingTasks: Task[];
  completedTasks: Task[];
  overdueTasks: Task[];
  pendingHabits: Habit[];
  completedHabits: Habit[];
  checklists: Checklist[];
  searchQuery?: string;
  workspaceNames?: Record<string, string>;
}

export interface TodayFilterResult {
  tasks: Task[];
  completedTasks: Task[];
  overdueTasks: Task[];
  pendingHabits: Habit[];
  completedHabits: Habit[];
  checklists: Checklist[];
}

const FILTER_TYPES: TodayFilterType[] = [
  "all",
  "tasks",
  "habits",
  "checklists",
];
const FILTER_PRIORITIES: TodayFilterPriority[] = [
  "all",
  "high",
  "medium",
  "low",
];
const FILTER_SCHEDULES: TodayFilterSchedule[] = [
  "all",
  "scheduled",
  "unscheduled",
];
const FILTER_STATUSES: TodayFilterStatus[] = [
  "all",
  "active",
  "completed",
  "overdue",
];
const FILTER_SORTS: TodayFilterSort[] = [
  "default",
  "priority",
  "alphabetical",
];

function isOneOf<T extends string>(value: string | null | undefined, options: T[]): value is T {
  return Boolean(value && options.includes(value as T));
}

function legacyType(filter?: string | null): TodayFilterType {
  return isOneOf(filter, FILTER_TYPES) ? filter : "all";
}

export function normalizeTodayFilters(
  input: NormalizeTodayFiltersInput = {},
): TodayFilterState {
  const legacyFilter = input.filter;
  const normalizedType = isOneOf(input.type, FILTER_TYPES)
    ? input.type
    : legacyFilter === "overdue"
      ? "all"
      : legacyType(legacyFilter);
  const normalizedStatus = isOneOf(input.status, FILTER_STATUSES)
    ? input.status
    : legacyFilter === "overdue"
      ? "overdue"
      : "all";

  return {
    type: normalizedType,
    workspaceId: input.workspaceId || "all",
    categoryId: input.categoryId || "all",
    priority: isOneOf(input.priority, FILTER_PRIORITIES) ? input.priority : "all",
    schedule: isOneOf(input.schedule, FILTER_SCHEDULES) ? input.schedule : "all",
    status: normalizedStatus,
    sort: isOneOf(input.sort, FILTER_SORTS) ? input.sort : "default",
  };
}

export function toPersistedTodayFilters(
  state: TodayFilterState,
): TodayFilterPersistenceValues {
  return {
    filter: state.status === "overdue" ? "overdue" : state.type,
    priority: state.priority,
    workspaceId: state.workspaceId,
    categoryId: state.categoryId,
    schedule: state.schedule,
    status: state.status,
    sort: state.sort,
  };
}

export function getTodayFilterCount(state: TodayFilterState): number {
  return [
    state.type !== "all",
    state.workspaceId !== "all",
    state.categoryId !== "all",
    state.priority !== "all",
    state.schedule !== "all",
    state.status !== "all",
    state.sort !== "default",
  ].filter(Boolean).length;
}

export function getTodayFilterLabel(value: string): string {
  if (value === "all") return "All";
  if (value === "default") return "Default";
  if (value === "alphabetical") return "Alphabetical";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function getTodayCategoryLabel(categoryId: string): string {
  return getCategoryMeta(categoryId)?.label || getTodayFilterLabel(categoryId);
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function isScheduled(item: Task | Habit | Checklist): boolean {
  const schedule = item.schedule;
  if (!schedule) return false;
  if (schedule.date === "inbox") return false;
  return Boolean(schedule.date || schedule.startTime || schedule.endTime);
}

function matchesSharedFilters(
  item: Task | Habit | Checklist,
  state: TodayFilterState,
  searchQuery: string,
  workspaceNames: Record<string, string>,
): boolean {
  if (
    state.workspaceId !== "all" &&
    resolveWorkspaceId(item) !== state.workspaceId
  ) {
    return false;
  }

  if (state.categoryId !== "all" && item.categoryId !== state.categoryId) {
    return false;
  }

  if (state.schedule !== "all" && (isScheduled(item) !== (state.schedule === "scheduled"))) {
    return false;
  }

  if (state.priority !== "all") {
    if (!("priority" in item) || item.priority !== state.priority) {
      return false;
    }
  }

  const query = searchQuery.trim().toLowerCase();
  if (!query) return true;

  const workspaceName = workspaceNames[resolveWorkspaceId(item)] || "";
  return [item.title, item.description || "", workspaceName]
    .some((value) => value.toLowerCase().includes(query));
}

function matchesType(
  type: TodayFilterType,
  itemType: Exclude<TodayFilterType, "all">,
): boolean {
  return type === "all" || type === itemType;
}

function priorityWeight(priority?: TaskPriority): number {
  if (priority === "high") return 0;
  if (priority === "medium") return 1;
  if (priority === "low") return 2;
  return 3;
}

function sortItems<T extends Task | Habit | Checklist>(items: T[], sort: TodayFilterSort): T[] {
  if (sort === "alphabetical") {
    return [...items].sort((a, b) => a.title.localeCompare(b.title));
  }
  if (sort === "priority") {
    return [...items].sort((a, b) => {
      const aPriority = "priority" in a ? a.priority : undefined;
      const bPriority = "priority" in b ? b.priority : undefined;
      return priorityWeight(aPriority) - priorityWeight(bPriority);
    });
  }
  return items;
}

/**
 * Applies the complete Today filter contract in one place.
 * NOW deliberately does not consume this result; it remains an independent
 * projection over the unfiltered dashboard entities.
 */
export function applyTodayFilters(
  input: TodayFilterInput,
  state: TodayFilterState,
  referenceDateKey: string = getTodayDateKey(),
): TodayFilterResult {
  const workspaceNames = input.workspaceNames || {};
  const overdueIds = new Set(input.overdueTasks.map((task) => task.id));
  const allTasks = uniqueById([
    ...input.pendingTasks,
    ...input.completedTasks,
    ...input.overdueTasks,
  ]);
  const allHabits = uniqueById([...input.pendingHabits, ...input.completedHabits]);
  const allChecklists = uniqueById(input.checklists);

  const includeTask = (task: Task, status: TodayFilterStatus): boolean => {
    const completed = isTaskCompleted(task);
    const overdue = overdueIds.has(task.id);
    if (status === "overdue") return overdue && !completed;
    if (status === "active") return !completed && !overdue;
    if (status === "completed") return completed;
    return completed || !overdue;
  };

  const includeHabit = (habit: Habit, status: TodayFilterStatus): boolean => {
    const completed = isHabitCompletedToday(habit, referenceDateKey);
    if (status === "overdue") return false;
    if (status === "active") return !completed;
    if (status === "completed") return completed;
    return true;
  };

  const includeChecklist = (checklist: Checklist, status: TodayFilterStatus): boolean => {
    const completed = isChecklistCompletedForDate(checklist, referenceDateKey);
    if (status === "overdue") return false;
    if (status === "active") return !completed;
    if (status === "completed") return completed;
    return true;
  };

  const filterTask = (task: Task): boolean =>
    matchesType(state.type, "tasks") &&
    matchesSharedFilters(task, state, input.searchQuery || "", workspaceNames);
  const filterHabit = (habit: Habit): boolean =>
    matchesType(state.type, "habits") &&
    matchesSharedFilters(habit, state, input.searchQuery || "", workspaceNames);
  const filterChecklist = (checklist: Checklist): boolean =>
    matchesType(state.type, "checklists") &&
    matchesSharedFilters(checklist, state, input.searchQuery || "", workspaceNames);

  const tasks = sortItems(
    allTasks.filter((task) => filterTask(task) && includeTask(task, state.status) && !isTaskCompleted(task)),
    state.sort,
  );
  const completedTasks = sortItems(
    allTasks.filter((task) => filterTask(task) && includeTask(task, state.status) && isTaskCompleted(task)),
    state.sort,
  );
  const overdueTasks = sortItems(
    state.status === "overdue"
      ? allTasks.filter((task) => filterTask(task) && includeTask(task, "overdue"))
      : [],
    state.sort,
  );
  const pendingHabits = sortItems(
    allHabits.filter((habit) => filterHabit(habit) && includeHabit(habit, state.status) && !isHabitCompletedToday(habit, referenceDateKey)),
    state.sort,
  );
  const completedHabits = sortItems(
    allHabits.filter((habit) => filterHabit(habit) && includeHabit(habit, state.status) && isHabitCompletedToday(habit, referenceDateKey)),
    state.sort,
  );
  const checklists = sortItems(
    allChecklists.filter((checklist) => filterChecklist(checklist) && includeChecklist(checklist, state.status)),
    state.sort,
  );

  return {
    tasks: state.status === "overdue" ? [] : tasks,
    completedTasks: state.status === "overdue" ? [] : completedTasks,
    overdueTasks,
    pendingHabits: state.status === "overdue" ? [] : pendingHabits,
    completedHabits: state.status === "overdue" ? [] : completedHabits,
    checklists: state.status === "overdue" ? [] : checklists,
  };
}
