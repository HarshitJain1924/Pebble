import { useEffect, useMemo, useState } from "react";

import type { TodayActiveContext } from "@/features/today/hooks/useTodaySelectors";
import {
  resolveItemCategorySymbol,
  type ItemCategorySymbol,
} from "@/features/today/utils/item-presentation";
import {
  resolveResourceVisual,
  type ResourceVisualInfo,
} from "@/features/today/utils/resource-presentation";
import {
  formatFrequency,
  formatTime,
  getDaysOverdue,
  getOverdueLabel,
} from "@/features/today/utils/stream-formatting";
import { getDateKey, getTodoDateKey } from "@/features/tasks/utils/task-formatting";
import type {
  Checklist,
  Habit,
  Resource,
  Task,
  Workspace,
} from "@/shared/types/domain.types";
import {
  getHabitCurrentStreak,
  getTaskOccurrenceState,
  isHabitCompletedToday,
  isTaskCompleted,
} from "@/shared/utils/domain-selectors";

/**
 * Workspace Stream presentation model.
 *
 * This layer converts the already-filtered, workspace-grouped Today data
 * (`useTodaySelectors.activeContexts`) into a fully prepared view model. The
 * React layer only reads fields — it never re-derives domain semantics.
 *
 * ── Counting semantics (explicit, and regression-tested) ──────────────────
 * A workspace's `totalItems` / `completedItems` / `progress` and every tab
 * badge are measured in **work units**:
 *
 *     tasks + habits + checklist items
 *
 * i.e. a checklist contributes one unit per item. That is the historical Today
 * behaviour and the number the progress ring and "N open items" line report.
 *
 * The rows actually rendered (`items`) are **entities**, where one checklist is
 * one row, and `remainingCount` (the "+N more" gateway) is entity-based too.
 * The two rules answer different questions ("how much work is left" vs "how
 * many rows do I draw") and are deliberately kept distinct.
 */

/** Relevance bands. Lower sorts first. The deck answers "what matters now". */
export const STREAM_RELEVANCE = {
  OVERDUE_TASK: 0,
  SCHEDULED_TASK: 1,
  ACTIVE_HABIT: 2,
  OPEN_CHECKLIST: 3,
  OPEN_TASK: 4,
  DONE: 100,
} as const;

export const TYPE_ORDER: Record<WorkspaceStreamItem["type"], number> = {
  habit: 0,
  task: 1,
  checklist: 2,
};

/** Per-workspace preview cap. */
export const PREVIEW_LIMIT = 5;
/** Resource strip preview cap. */
export const RESOURCE_PREVIEW_LIMIT = 3;
/** Global "All" drawer cap. Generous enough that most days never hit it. */
export const AGGREGATE_PREVIEW_LIMIT = 12;
/** Synthetic workspace id used for the aggregate "All Work" drawer. */
export const AGGREGATE_KEY = "__all_workspaces__";

export type WorkspaceStreamStateTone = "alert" | "success" | "neutral";

export interface WorkspaceStreamItem {
  type: "task" | "habit" | "checklist";
  id: string;
  key: string;
  completed: boolean;
  title: string;
  subtitle: string;
  timeText?: string;
  frequencyText?: string;
  categorySymbol: ItemCategorySymbol;
  isOverdue?: boolean;
  hasReminder?: boolean;
  priority?: "high" | "medium" | "low";
  streak?: number;
  checklistProgress?: {
    completedCount: number;
    totalCount: number;
  };
  original: Task | Habit | Checklist;
  /** Owning workspace, carried so the All drawer can mark each row. */
  workspaceId: string;
  workspaceName: string;
  workspaceColor: string;
  relevance: number;
  tiebreak: number;
}

export interface WorkspaceStreamResource {
  id: string;
  title: string;
  visual: ResourceVisualInfo;
}

export interface WorkspaceStreamSection {
  workspace: Workspace;
  /** Header title ("All Work" for the aggregate drawer). */
  displayName: string;
  isAggregate: boolean;
  workspaceColor: string;
  /** Work units: tasks + habits + checklist items. */
  totalItems: number;
  /** Completed work units. */
  completedItems: number;
  progress: number;
  stateText: string;
  stateTone: WorkspaceStreamStateTone;
  /** Rendered rows (entities — one checklist is one row). */
  items: WorkspaceStreamItem[];
  /** Max rows this drawer renders before the "+N more" gateway. */
  previewLimit: number;
  /** Rows beyond the preview cap. */
  remainingCount: number;
  resources: WorkspaceStreamResource[];
  resourcesTotal: number;
}

export interface WorkspaceStreamTab {
  id: string;
  name: string;
  color: string;
  itemCount: number;
  /** Undefined for the aggregate "All" tab. */
  workspace?: Workspace;
}

export interface WorkspaceStreamUnitCounts {
  counts: Record<string, number>;
  total: number;
}

interface WorkspaceRef {
  id: string;
  name: string;
  color: string;
}

/**
 * Single ordering rule for both a workspace drawer and the All drawer, so
 * "All" is just a merge of the same relevance model.
 */
export function compareStreamItems(
  a: WorkspaceStreamItem,
  b: WorkspaceStreamItem,
): number {
  return (
    a.relevance - b.relevance ||
    a.tiebreak - b.tiebreak ||
    TYPE_ORDER[a.type] - TYPE_ORDER[b.type]
  );
}

/**
 * The section header's single line of prose. This is the "point of view" the
 * old count-badge row never had: it names the thing that needs attention
 * rather than restating a total that appears three other places.
 */
export function buildWorkspaceStateLine(input: {
  openCount: number;
  overdueCount: number;
  completedCount: number;
  bestStreakAtRisk: number;
}): { text: string; tone: WorkspaceStreamStateTone } {
  const { openCount, overdueCount, completedCount, bestStreakAtRisk } = input;

  if (overdueCount > 0) {
    return {
      text:
        openCount > overdueCount
          ? `${overdueCount} overdue · ${openCount} open`
          : `${overdueCount} overdue`,
      tone: "alert",
    };
  }

  if (openCount === 0) {
    return {
      text:
        completedCount > 0 ? `All clear · ${completedCount} done` : "All clear",
      tone: "success",
    };
  }

  if (bestStreakAtRisk > 0) {
    return {
      text: `${openCount} open · keep a ${bestStreakAtRisk}-day streak`,
      tone: "neutral",
    };
  }

  if (completedCount > 0) {
    return {
      text: `${openCount} open · ${completedCount} done`,
      tone: "neutral",
    };
  }

  return { text: `${openCount} open`, tone: "neutral" };
}

/**
 * Work-unit count for one workspace context:
 * `tasks + habits + checklist items`. See the module doc-comment for why
 * checklist items count individually here.
 */
export function countWorkspaceUnits(
  context: Pick<TodayActiveContext, "tasks" | "habits" | "checklists">,
): { totalUnits: number; completedUnits: number } {
  const totalUnits =
    context.tasks.length +
    context.habits.length +
    context.checklists.reduce((sum, checklist) => sum + checklist.items.length, 0);

  const completedUnits =
    context.tasks.filter((task) => isTaskCompleted(task)).length +
    context.habits.filter(
      (habit) => Boolean(habit.completionHistory && isHabitCompletedToday(habit)),
    ).length +
    context.checklists.reduce(
      (sum, checklist) =>
        sum + checklist.items.filter((item) => item.completed).length,
      0,
    );

  return { totalUnits, completedUnits };
}

/** Per-workspace work-unit lookup used by the tab rail. */
export function countWorkspaceUnitsByWorkspace(
  contexts: TodayActiveContext[],
): WorkspaceStreamUnitCounts {
  const counts: Record<string, number> = {};
  let total = 0;
  contexts.forEach((context) => {
    const { totalUnits } = countWorkspaceUnits(context);
    counts[context.folder.id] = totalUnits;
    total += totalUnits;
  });
  return { counts, total };
}

/** Transform a Task into a prepared stream row. */
export function buildTaskStreamItem(
  todo: Task,
  workspace: WorkspaceRef,
  todayKey: string,
  isDark: boolean,
): WorkspaceStreamItem {
  const completed = isTaskCompleted(todo);
  const daysOverdue = completed
    ? null
    : (() => {
        const state = getTaskOccurrenceState(todo, todayKey);
        return state.isOverdue ? getDaysOverdue(getTodoDateKey(todo)) : null;
      })();
  const isOverdue = daysOverdue !== null;
  const triggerAt = todo.reminder?.enabled ? todo.reminder?.triggerAt : undefined;
  const hasReminder = triggerAt !== undefined;
  const recurrenceLabel = todo.recurrence?.frequency
    ? formatFrequency(todo.recurrence.frequency)
    : null;

  let timeText: string | undefined = undefined;
  if (triggerAt !== undefined) {
    timeText = formatTime(triggerAt);
  } else if (todo.schedule?.startTime) {
    timeText = todo.schedule.startTime;
  } else if (todo.schedule?.durationMinutes) {
    timeText = `${todo.schedule.durationMinutes} min`;
  }

  let subtitle = "Today";
  if (completed) {
    subtitle = "Completed";
  } else if (isOverdue) {
    subtitle = `Overdue · ${getOverdueLabel(daysOverdue)}`;
  } else if (timeText) {
    subtitle = timeText;
  } else if (recurrenceLabel) {
    subtitle = recurrenceLabel;
  }

  const relevance = completed
    ? STREAM_RELEVANCE.DONE
    : isOverdue
      ? STREAM_RELEVANCE.OVERDUE_TASK
      : hasReminder
        ? STREAM_RELEVANCE.SCHEDULED_TASK
        : STREAM_RELEVANCE.OPEN_TASK;

  // Most overdue first; then earliest scheduled time.
  const tiebreak = isOverdue
    ? -(daysOverdue ?? 0)
    : hasReminder && triggerAt !== undefined
      ? triggerAt
      : 0;

  return {
    type: "task",
    id: todo.id,
    key: `task-${todo.id}`,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    workspaceColor: workspace.color,
    completed,
    title: todo.title,
    subtitle,
    timeText,
    categorySymbol: resolveItemCategorySymbol(
      {
        type: "task",
        title: todo.title,
        categoryId: todo.categoryId,
        original: todo,
      },
      isDark,
    ),
    isOverdue,
    hasReminder,
    priority:
      todo.priority === "none"
        ? undefined
        : (todo.priority as "high" | "medium" | "low" | undefined),
    original: todo,
    relevance,
    tiebreak,
  };
}

/** Transform a Habit into a prepared stream row. */
export function buildHabitStreamItem(
  habit: Habit,
  workspace: WorkspaceRef,
  isDark: boolean,
): WorkspaceStreamItem {
  const completed = Boolean(
    habit.completionHistory && isHabitCompletedToday(habit),
  );
  const currentStreak = getHabitCurrentStreak(habit);
  const habitRecurrence =
    habit.recurrence?.frequency || (habit as any).frequency;
  const frequencyText = formatFrequency(habitRecurrence);

  let subtitle = `Day ${currentStreak + 1}`;
  if (completed) {
    subtitle = "Completed";
  } else if (frequencyText) {
    subtitle = frequencyText;
  } else if (habit.description) {
    subtitle = habit.description;
  }

  return {
    type: "habit",
    id: habit.id,
    key: `habit-${habit.id}`,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    workspaceColor: workspace.color,
    completed,
    title: habit.title,
    subtitle,
    frequencyText: frequencyText || undefined,
    categorySymbol: resolveItemCategorySymbol(
      {
        type: "habit",
        title: habit.title,
        categoryId: habit.categoryId,
        original: habit,
      },
      isDark,
    ),
    streak: currentStreak,
    original: habit,
    relevance: completed
      ? STREAM_RELEVANCE.DONE
      : currentStreak > 0
        ? STREAM_RELEVANCE.ACTIVE_HABIT
        : STREAM_RELEVANCE.OPEN_TASK,
    tiebreak: -currentStreak,
  };
}

/** Transform a Checklist into a prepared stream row (one entity). */
export function buildChecklistStreamItem(
  checklist: Checklist,
  workspace: WorkspaceRef,
  isDark: boolean,
): WorkspaceStreamItem {
  const completedCount = checklist.items.filter((item) => item.completed).length;
  const totalCount = checklist.items.length;
  const remaining = totalCount - completedCount;
  const completed = completedCount === totalCount && totalCount > 0;

  let subtitle = "No items yet";
  if (completed) {
    subtitle = "All done";
  } else if (remaining === 1) {
    subtitle = "1 item left";
  } else if (remaining > 0) {
    subtitle = `${remaining} items left`;
  }

  return {
    type: "checklist",
    id: checklist.id,
    key: `checklist-${checklist.id}`,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    workspaceColor: workspace.color,
    completed,
    title: checklist.title,
    subtitle,
    categorySymbol: resolveItemCategorySymbol(
      {
        type: "checklist",
        title: checklist.title,
        categoryId: checklist.categoryId,
        original: checklist,
      },
      isDark,
    ),
    checklistProgress: { completedCount, totalCount },
    original: checklist,
    relevance: completed
      ? STREAM_RELEVANCE.DONE
      : STREAM_RELEVANCE.OPEN_CHECKLIST,
    tiebreak: remaining,
  };
}

/** Build one workspace's stream section from an already-grouped context. */
export function buildWorkspaceStreamSection(
  context: TodayActiveContext,
  resources: readonly Resource[],
  options: { isDark: boolean; primaryColor: string; todayKey?: string },
): WorkspaceStreamSection {
  const { isDark, primaryColor } = options;
  const todayKey = options.todayKey ?? getDateKey();
  const { folder, tasks, habits, checklists } = context;
  const workspaceColor = folder.color || primaryColor;
  const workspaceRef: WorkspaceRef = {
    id: folder.id,
    name: folder.name,
    color: workspaceColor,
  };

  const taskItems = tasks.map((todo) =>
    buildTaskStreamItem(todo, workspaceRef, todayKey, isDark),
  );
  const habitItems = habits.map((habit) =>
    buildHabitStreamItem(habit, workspaceRef, isDark),
  );
  const checklistItems = checklists.map((checklist) =>
    buildChecklistStreamItem(checklist, workspaceRef, isDark),
  );

  const items = [...habitItems, ...taskItems, ...checklistItems].sort(
    compareStreamItems,
  );

  // Work units (checklist items count individually) drive progress + state line.
  const { totalUnits: totalItems, completedUnits: completedItems } =
    countWorkspaceUnits(context);
  const progress = totalItems > 0 ? completedItems / totalItems : 0;
  const openCount = Math.max(totalItems - completedItems, 0);
  const overdueCount = taskItems.filter(
    (item) => item.isOverdue && !item.completed,
  ).length;
  const bestStreakAtRisk = habitItems.reduce(
    (best, item) =>
      !item.completed && (item.streak ?? 0) > best ? item.streak ?? 0 : best,
    0,
  );

  const stateLine = buildWorkspaceStateLine({
    openCount,
    overdueCount,
    completedCount: completedItems,
    bestStreakAtRisk,
  });

  return {
    workspace: folder,
    displayName: folder.name,
    isAggregate: false,
    workspaceColor,
    totalItems,
    completedItems,
    progress,
    stateText: stateLine.text,
    stateTone: stateLine.tone,
    items,
    previewLimit: PREVIEW_LIMIT,
    remainingCount: Math.max(items.length - PREVIEW_LIMIT, 0),
    resources: resources
      .slice(0, RESOURCE_PREVIEW_LIMIT)
      .map((resource, index) => ({
        id: resource.id || `res-${index}`,
        title: resource.title || "Untitled Resource",
        visual: resolveResourceVisual(resource),
      })),
    resourcesTotal: resources.length,
  };
}

/** Build the sections for a set of displayed contexts. */
export function buildWorkspaceStreamSections(
  contexts: TodayActiveContext[],
  resourcesByWorkspace: Record<string, Resource[] | undefined>,
  options: { isDark: boolean; primaryColor: string; todayKey?: string },
): WorkspaceStreamSection[] {
  return contexts.map((context) =>
    buildWorkspaceStreamSection(
      context,
      resourcesByWorkspace[context.folder.id] || [],
      options,
    ),
  );
}

/**
 * The All drawer merges every workspace's items under one relevance ordering,
 * so its length scales with today's work rather than with how many workspaces
 * the user has created.
 */
export function buildWorkspaceAggregateSection(
  sections: WorkspaceStreamSection[],
  options: { primaryColor: string },
): WorkspaceStreamSection {
  const { primaryColor } = options;
  const items = sections
    .flatMap((section) => section.items)
    .sort(compareStreamItems);
  const totalItems = sections.reduce(
    (sum, section) => sum + section.totalItems,
    0,
  );
  const completedItems = sections.reduce(
    (sum, section) => sum + section.completedItems,
    0,
  );
  const openCount = Math.max(totalItems - completedItems, 0);
  const overdueCount = items.filter(
    (item) => item.isOverdue && !item.completed,
  ).length;
  const bestStreakAtRisk = items.reduce(
    (best, item) =>
      !item.completed && (item.streak ?? 0) > best ? item.streak ?? 0 : best,
    0,
  );
  const stateLine = buildWorkspaceStateLine({
    openCount,
    overdueCount,
    completedCount: completedItems,
    bestStreakAtRisk,
  });

  return {
    workspace: {
      id: AGGREGATE_KEY,
      name: "All",
      icon: "layers",
      iconType: "icon",
      color: primaryColor,
      order: 0,
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 0,
      updatedAt: 0,
    },
    displayName: "All Work",
    isAggregate: true,
    workspaceColor: primaryColor,
    totalItems,
    completedItems,
    progress: totalItems > 0 ? completedItems / totalItems : 0,
    stateText: stateLine.text,
    stateTone: stateLine.tone,
    items,
    previewLimit: AGGREGATE_PREVIEW_LIMIT,
    remainingCount: Math.max(items.length - AGGREGATE_PREVIEW_LIMIT, 0),
    resources: [],
    resourcesTotal: 0,
  };
}

/** Build the workspace tab rail ("All" + one tab per active workspace). */
export function buildWorkspaceStreamTabs(
  contexts: TodayActiveContext[],
  unitCounts: WorkspaceStreamUnitCounts,
  primaryColor: string,
): WorkspaceStreamTab[] {
  return [
    {
      id: "all",
      name: "All",
      color: primaryColor,
      itemCount: unitCounts.total,
    },
    ...contexts.map((context) => ({
      id: context.folder.id,
      name: context.folder.name,
      color: context.folder.color || primaryColor,
      itemCount: unitCounts.counts[context.folder.id] ?? 0,
      workspace: context.folder,
    })),
  ];
}

export interface UseWorkspaceStreamOptions {
  activeContexts: TodayActiveContext[];
  allResources: Record<string, Resource[]>;
  primaryColor: string;
  colorScheme: "light" | "dark" | null | undefined;
}

export interface UseWorkspaceStreamResult {
  selectedWorkspaceId: string;
  setSelectedWorkspaceId: React.Dispatch<React.SetStateAction<string>>;
  /** Resolved open drawer: the selected workspace, or "all". */
  openDrawerId: string;
  /** Prepared sections for the displayed contexts. */
  sections: WorkspaceStreamSection[];
  /** The sections to actually render (aggregate or the single open workspace). */
  displayedSections: WorkspaceStreamSection[];
  aggregateSection: WorkspaceStreamSection | null;
  tabs: WorkspaceStreamTab[];
  workspaceUnitCounts: WorkspaceStreamUnitCounts;
  hasTabs: boolean;
}

/**
 * Converts filtered workspace contexts into the prepared workspace stream view
 * model, and owns the tab-selection UI state that the model depends on.
 *
 * It consumes data only from Today state (`activeContexts` / `allResources`);
 * it never queries repositories, so it introduces no second source of truth.
 */
export function useWorkspaceStream({
  activeContexts,
  allResources,
  primaryColor,
  colorScheme,
}: UseWorkspaceStreamOptions): UseWorkspaceStreamResult {
  const isDark = colorScheme !== "light";
  const [selectedWorkspaceId, setSelectedWorkspaceId] =
    useState<string>("all");

  const todayKey = getDateKey();

  // Revert to "all" if the selected workspace is no longer present.
  useEffect(() => {
    if (selectedWorkspaceId !== "all") {
      const exists = activeContexts.some(
        (context) => context.folder.id === selectedWorkspaceId,
      );
      if (!exists) {
        setSelectedWorkspaceId("all");
      }
    }
  }, [activeContexts, selectedWorkspaceId]);

  const workspaceUnitCounts = useMemo(
    () => countWorkspaceUnitsByWorkspace(activeContexts),
    [activeContexts],
  );

  /**
   * A workspace shows exactly one open drawer. If the open workspace disappears
   * (a filter removed it, say), fall back to the All drawer rather than
   * rendering several drawers at once.
   */
  const openDrawerId = useMemo(() => {
    if (selectedWorkspaceId === "all") return "all";
    const exists = activeContexts.some(
      (context) => context.folder.id === selectedWorkspaceId,
    );
    return exists ? selectedWorkspaceId : "all";
  }, [activeContexts, selectedWorkspaceId]);

  const displayedContexts = useMemo(() => {
    if (openDrawerId === "all") return activeContexts;
    const filtered = activeContexts.filter(
      (context) => context.folder.id === openDrawerId,
    );
    return filtered.length > 0 ? filtered : activeContexts;
  }, [activeContexts, openDrawerId]);

  const sections = useMemo(
    () =>
      buildWorkspaceStreamSections(displayedContexts, allResources, {
        isDark,
        primaryColor,
        todayKey,
      }),
    [displayedContexts, allResources, isDark, primaryColor, todayKey],
  );

  const aggregateSection = useMemo(
    () =>
      openDrawerId === "all" && activeContexts.length >= 2
        ? buildWorkspaceAggregateSection(sections, { primaryColor })
        : null,
    [sections, openDrawerId, activeContexts.length, primaryColor],
  );

  // A workspace holds one open drawer: either the All drawer or a single workspace.
  const displayedSections = aggregateSection
    ? [aggregateSection]
    : sections.slice(0, 1);

  const tabs = useMemo(
    () => buildWorkspaceStreamTabs(activeContexts, workspaceUnitCounts, primaryColor),
    [activeContexts, workspaceUnitCounts, primaryColor],
  );

  return {
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    openDrawerId,
    sections,
    displayedSections,
    aggregateSection,
    tabs,
    workspaceUnitCounts,
    hasTabs: activeContexts.length > 1,
  };
}
