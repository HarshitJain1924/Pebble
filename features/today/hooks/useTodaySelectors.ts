import { useCallback, useMemo } from "react";

import type {
  Checklist,
  Habit,
  Task,
  Workspace,
} from "@/shared/types/domain.types";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { getTodayDateKey } from "@/shared/utils/date-key";
import {
  applyTodayFilters,
  normalizeTodayFilters,
  type TodayFilterState,
} from "@/features/today/utils/todayFilters";

/**
 * Resolves a workspace ID from an entity, falling back to Inbox when older
 * records do not have a workspaceId.
 */
export function resolveWorkspaceId(entity?: {
  workspaceId?: string;
  folderId?: string;
}): string {
  return entity?.workspaceId || entity?.folderId || INBOX_WORKSPACE_ID;
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export interface BuildActiveContextsInput {
  folders: Workspace[];
  displayedTodos: Task[];
  displayedCompletedTodos: Task[];
  displayedOverdue?: Task[];
  pendingHabits?: Habit[];
  completedHabits?: Habit[];
  displayedPendingHabits?: Habit[];
  displayedCompletedHabits?: Habit[];
  displayedChecklists?: Checklist[];
  allChecklists?: Record<string, Checklist[]>;
  /** Legacy fields retained for direct callers; filtering happens upstream. */
  activeFilter?: string;
  searchQuery?: string;
}

export interface TodayActiveContext {
  folder: Workspace;
  tasks: Task[];
  habits: Habit[];
  checklists: Checklist[];
  totalCount: number;
}

/**
 * Groups already-filtered entities for WorkspaceSectionedStream.
 * It intentionally does not apply filter semantics; applyTodayFilters is the
 * single source of truth for that behavior.
 */
export function buildActiveContexts({
  folders,
  displayedTodos,
  displayedCompletedTodos,
  displayedOverdue = [],
  pendingHabits = [],
  completedHabits = [],
  displayedPendingHabits,
  displayedCompletedHabits,
  displayedChecklists,
  allChecklists = {},
}: BuildActiveContextsInput): TodayActiveContext[] {
  const tasks = uniqueById([
    ...displayedTodos,
    ...displayedCompletedTodos,
    ...displayedOverdue,
  ]);
  const habits = uniqueById([
    ...(displayedPendingHabits || pendingHabits),
    ...(displayedCompletedHabits || completedHabits),
  ]);
  const checklists = uniqueById(
    displayedChecklists ||
      Object.values(allChecklists)
        .flat()
        .filter((checklist) => !checklist.archivedAt),
  );

  const contextMap: Record<
    string,
    { tasks: Task[]; habits: Habit[]; checklists: Checklist[] }
  > = {};

  folders.forEach((folder) => {
    contextMap[folder.id] = { tasks: [], habits: [], checklists: [] };
  });

  const ensureContext = (workspaceId: string) => {
    if (!contextMap[workspaceId]) {
      contextMap[workspaceId] = { tasks: [], habits: [], checklists: [] };
    }
    return contextMap[workspaceId];
  };

  tasks.forEach((task) => ensureContext(resolveWorkspaceId(task)).tasks.push(task));
  habits.forEach((habit) => ensureContext(resolveWorkspaceId(habit)).habits.push(habit));
  checklists.forEach((checklist) =>
    ensureContext(resolveWorkspaceId(checklist)).checklists.push(checklist),
  );

  return folders
    .map((folder) => {
      const items = contextMap[folder.id] || {
        tasks: [],
        habits: [],
        checklists: [],
      };
      return {
        folder,
        ...items,
        totalCount: items.tasks.length + items.habits.length + items.checklists.length,
      };
    })
    .filter((context) => context.totalCount > 0);
}

export interface UseTodaySelectorsOptions {
  folders: Workspace[];
  todoStats: {
    pending: Task[];
    overdue: Task[];
    completedTasks?: Task[];
    completed: number;
    total: number;
  };
  pendingHabits: Habit[];
  completedHabits: Habit[];
  allChecklists: Record<string, Checklist[]>;
  searchQuery: string;
  filterState?: TodayFilterState;
  /** Legacy state inputs remain supported for callers outside Today. */
  activeFilter?: string;
  selectedFolderFilter?: string;
  selectedPriorityFilter?: string;
  selectedSortOption?: string;
}

export function useTodaySelectors({
  folders,
  todoStats,
  pendingHabits,
  completedHabits,
  allChecklists,
  searchQuery,
  filterState,
  activeFilter = "all",
  selectedFolderFilter = "all",
  selectedPriorityFilter = "all",
  selectedSortOption = "default",
}: UseTodaySelectorsOptions) {
  const resolvedFilterState = useMemo(
    () =>
      normalizeTodayFilters(
        filterState || {
          filter: activeFilter,
          workspaceId: selectedFolderFilter,
          priority: selectedPriorityFilter,
          sort: selectedSortOption,
        },
      ),
    [
      filterState,
      activeFilter,
      selectedFolderFilter,
      selectedPriorityFilter,
      selectedSortOption,
    ],
  );

  const workspaceNames = useMemo(
    () => Object.fromEntries(folders.map((folder) => [folder.id, folder.name])),
    [folders],
  );

  const flatChecklists = useMemo(
    () =>
      Object.values(allChecklists)
        .flat()
        .filter((checklist) => !checklist.archivedAt),
    [allChecklists],
  );

  const filtered = useMemo(
    () =>
      applyTodayFilters(
        {
          pendingTasks: todoStats.pending,
          completedTasks: todoStats.completedTasks || [],
          overdueTasks: todoStats.overdue,
          pendingHabits,
          completedHabits,
          checklists: flatChecklists,
          searchQuery,
          workspaceNames,
        },
        resolvedFilterState,
        getTodayDateKey(),
      ),
    [
      todoStats.pending,
      todoStats.completedTasks,
      todoStats.overdue,
      pendingHabits,
      completedHabits,
      flatChecklists,
      searchQuery,
      workspaceNames,
      resolvedFilterState,
    ],
  );

  const getFolderById = useCallback(
    (folderId?: string) => {
      const id = resolveWorkspaceId({ workspaceId: folderId });
      const found = folders.find((folder) => folder.id === id);
      if (found) return found;
      return {
        id: INBOX_WORKSPACE_ID,
        name: "Inbox",
        color: "#6366F1",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    },
    [folders],
  );

  const groupTasksByWorkspace = useCallback((taskList: Task[]) => {
    const grouped: Record<string, Task[]> = {};
    taskList.forEach((task) => {
      const workspaceId = resolveWorkspaceId(task);
      if (!grouped[workspaceId]) grouped[workspaceId] = [];
      grouped[workspaceId].push(task);
    });
    return grouped;
  }, []);

  const groupHabitsByWorkspace = useCallback(
    (pending: Habit[], completed: Habit[]) => {
      const grouped: Record<string, { pending: Habit[]; completed: Habit[] }> = {};
      pending.forEach((habit) => {
        const workspaceId = resolveWorkspaceId(habit);
        if (!grouped[workspaceId]) grouped[workspaceId] = { pending: [], completed: [] };
        grouped[workspaceId].pending.push(habit);
      });
      completed.forEach((habit) => {
        const workspaceId = resolveWorkspaceId(habit);
        if (!grouped[workspaceId]) grouped[workspaceId] = { pending: [], completed: [] };
        grouped[workspaceId].completed.push(habit);
      });
      return grouped;
    },
    [],
  );

  const groupedOverdue = useMemo(
    () => groupTasksByWorkspace(filtered.overdueTasks),
    [filtered.overdueTasks, groupTasksByWorkspace],
  );
  const groupedTodayTodos = useMemo(
    () => groupTasksByWorkspace(filtered.tasks),
    [filtered.tasks, groupTasksByWorkspace],
  );
  const groupedTodayHabits = useMemo(
    () => groupHabitsByWorkspace(filtered.pendingHabits, filtered.completedHabits),
    [filtered.pendingHabits, filtered.completedHabits, groupHabitsByWorkspace],
  );

  const sortFolderGroups = useCallback(
    (grouped: Record<string, unknown>) =>
      Object.keys(grouped)
        .map((key) => getFolderById(key))
        .filter((folder, index, self) => self.findIndex((item) => item.id === folder.id) === index)
        .sort((a, b) => {
          const indexA = folders.findIndex((folder) => folder.id === a.id);
          const indexB = folders.findIndex((folder) => folder.id === b.id);
          return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
        }),
    [folders, getFolderById],
  );

  const overdueFolderGroups = useMemo(
    () => sortFolderGroups(groupedOverdue),
    [groupedOverdue, sortFolderGroups],
  );
  const todayFolderGroups = useMemo(
    () => sortFolderGroups(groupedTodayTodos),
    [groupedTodayTodos, sortFolderGroups],
  );
  const habitsFolderGroups = useMemo(
    () => sortFolderGroups(groupedTodayHabits),
    [groupedTodayHabits, sortFolderGroups],
  );

  const continueWorkspace = useMemo(() => {
    if (folders.length === 0 || todoStats.pending.length === 0) return null;
    const counts: Record<string, number> = {};
    todoStats.pending.forEach((task) => {
      const workspaceId = resolveWorkspaceId(task);
      counts[workspaceId] = (counts[workspaceId] || 0) + 1;
    });
    const bestWorkspaceId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    return bestWorkspaceId ? folders.find((folder) => folder.id === bestWorkspaceId) || null : null;
  }, [folders, todoStats.pending]);

  const activeContexts = useMemo(
    () =>
      buildActiveContexts({
        folders,
        displayedTodos: filtered.tasks,
        displayedCompletedTodos: filtered.completedTasks,
        displayedOverdue: filtered.overdueTasks,
        displayedPendingHabits: filtered.pendingHabits,
        displayedCompletedHabits: filtered.completedHabits,
        displayedChecklists: filtered.checklists,
      }),
    [folders, filtered],
  );

  return {
    filterState: resolvedFilterState,
    displayedTodos: filtered.tasks,
    displayedCompletedTodos: filtered.completedTasks,
    displayedOverdue: filtered.overdueTasks,
    displayedPendingHabits: filtered.pendingHabits,
    displayedCompletedHabits: filtered.completedHabits,
    displayedChecklists: filtered.checklists,
    groupedTodayTodos,
    groupedTodayHabits,
    groupedOverdue,
    todayFolderGroups,
    overdueFolderGroups,
    habitsFolderGroups,
    continueWorkspace,
    activeContexts,
    getFolderById,
  };
}
