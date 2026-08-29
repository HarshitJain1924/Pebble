import {
  getDateKey
} from "@/features/tasks/utils/task-formatting";
import {
  type Checklist,
  type Habit,
  type Task,
  type Workspace,
  INBOX_WORKSPACE_ID,
} from "@/shared/types/domain.types";
import { isTaskOverdue } from "@/shared/utils/domain-selectors";
import { useCallback, useMemo } from "react";

/**
 * Resolves a workspace ID from an entity, falling back to INBOX_WORKSPACE_ID if none is set.
 */
export function resolveWorkspaceId(entity?: {
  workspaceId?: string;
  folderId?: string;
}): string {
  return entity?.workspaceId || entity?.folderId || INBOX_WORKSPACE_ID;
}

export interface BuildActiveContextsInput {
  folders: Workspace[];
  displayedTodos: Task[];
  displayedCompletedTodos: Task[];
  displayedOverdue: Task[];
  pendingHabits: Habit[];
  completedHabits: Habit[];
  allChecklists: Record<string, Checklist[]>;
  activeFilter: string;
  searchQuery: string;
}

export interface TodayActiveContext {
  folder: Workspace;
  tasks: Task[];
  habits: Habit[];
  checklists: Checklist[];
  totalCount: number;
}

/**
 * Builds the per-workspace contexts rendered by the Today screen carousel.
 *
 * Completed tasks are included alongside pending ones so they stay visible in
 * their workspace after being checked off (the carousel applies their completed
 * styling and locks their checkbox).
 */
export function buildActiveContexts({
  folders,
  displayedTodos,
  displayedCompletedTodos,
  displayedOverdue,
  pendingHabits,
  completedHabits,
  allChecklists,
  activeFilter,
  searchQuery,
}: BuildActiveContextsInput): TodayActiveContext[] {
  const todayStr = getDateKey();

  const contextMap: Record<
    string,
    {
      tasks: Task[];
      habits: Habit[];
      checklists: Checklist[];
    }
  > = {};

  const activeTasks = [...displayedTodos, ...displayedCompletedTodos];
  const overdueTasks = displayedOverdue;
  const activeHabits = [...pendingHabits, ...completedHabits];

  const activeChecklists: Checklist[] = [];
  Object.entries(allChecklists).forEach(([_fId, list]) => {
    list.forEach((c) => {
      if (!c.archivedAt) {
        activeChecklists.push(c);
      }
    });
  });

  folders.forEach((f) => {
    contextMap[f.id] = { tasks: [], habits: [], checklists: [] };
  });

  activeTasks.forEach((t) => {
    const fId = resolveWorkspaceId(t);
    if (!contextMap[fId])
      contextMap[fId] = { tasks: [], habits: [], checklists: [] };
    contextMap[fId].tasks.push(t);
  });
  overdueTasks.forEach((t) => {
    const fId = resolveWorkspaceId(t);
    if (!contextMap[fId])
      contextMap[fId] = { tasks: [], habits: [], checklists: [] };
    if (!contextMap[fId].tasks.some((existing) => existing.id === t.id)) {
      contextMap[fId].tasks.push(t);
    }
  });

  activeHabits.forEach((h) => {
    const fId = resolveWorkspaceId(h);
    if (!contextMap[fId])
      contextMap[fId] = { tasks: [], habits: [], checklists: [] };
    contextMap[fId].habits.push(h);
  });

  activeChecklists.forEach((c) => {
    const fId = resolveWorkspaceId(c);
    if (!contextMap[fId])
      contextMap[fId] = { tasks: [], habits: [], checklists: [] };
    contextMap[fId].checklists.push(c);
  });

  const activeList = folders
    .map((folder) => {
      const items = contextMap[folder.id] || {
        tasks: [],
        habits: [],
        checklists: [],
      };

      let filteredTasks = items.tasks;
      let filteredHabits = items.habits;
      let filteredChecklists = items.checklists;

      if (activeFilter === "tasks") {
        filteredHabits = [];
        filteredChecklists = [];
      } else if (activeFilter === "habits") {
        filteredTasks = [];
        filteredChecklists = [];
      } else if (activeFilter === "checklists") {
        filteredTasks = [];
        filteredHabits = [];
      } else if (activeFilter === "overdue") {
        filteredTasks = items.tasks.filter((t) => isTaskOverdue(t, todayStr));
        filteredHabits = [];
        filteredChecklists = [];
      }

      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase();
        filteredTasks = filteredTasks.filter((t) =>
          t.title.toLowerCase().includes(query),
        );
        filteredHabits = filteredHabits.filter((h) =>
          h.title.toLowerCase().includes(query),
        );
        filteredChecklists = filteredChecklists.filter((c) =>
          c.title.toLowerCase().includes(query),
        );
      }

      const totalItemsCount =
        filteredTasks.length +
        filteredHabits.length +
        filteredChecklists.length;

      return {
        folder,
        tasks: filteredTasks,
        habits: filteredHabits,
        checklists: filteredChecklists,
        totalCount: totalItemsCount,
      };
    })
    .filter((ctx) => ctx.totalCount > 0);

  return activeList;
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
  activeFilter: string;
  selectedFolderFilter: string;
  selectedPriorityFilter: string;
  selectedSortOption: string;
}

export function useTodaySelectors({
  folders,
  todoStats,
  pendingHabits,
  completedHabits,
  allChecklists,
  searchQuery,
  activeFilter,
  selectedFolderFilter,
  selectedPriorityFilter,
  selectedSortOption,
}: UseTodaySelectorsOptions) {
  const matchesSearch = useCallback((text: string, query: string) => {
    return text?.toLowerCase().includes(query.toLowerCase());
  }, []);

  const getFolderById = useCallback(
    (folderId?: string) => {
      const fId = resolveWorkspaceId({ workspaceId: folderId });
      const found = folders.find((f) => f.id === fId);
      if (found) return found;
      return {
        id: INBOX_WORKSPACE_ID,
        name: "Inbox",
        emoji: "📥",
        color: "#6366F1",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    },
    [folders],
  );

  const displayedTodos = useMemo(() => {
    const filtered = todoStats.pending.filter((todo) => {
      const folder = getFolderById(resolveWorkspaceId(todo));
      const folderName = folder?.name || "";
      const queryMatches =
        searchQuery.trim() === "" ||
        matchesSearch(todo.title, searchQuery) ||
        matchesSearch(todo.description || "", searchQuery) ||
        matchesSearch(folderName, searchQuery);

      if (!queryMatches) return false;

      if (activeFilter === "habits") return false;

      const fId = resolveWorkspaceId(todo);
      if (selectedFolderFilter !== "all" && fId !== selectedFolderFilter) {
        return false;
      }

      if (
        selectedPriorityFilter !== "all" &&
        todo.priority !== selectedPriorityFilter
      ) {
        return false;
      }

      return true;
    });

    if (selectedSortOption === "priority") {
      return [...filtered].sort((a, b) => {
        const orderA = a.priority === "high" ? 0 : a.priority === "low" ? 2 : 1;
        const orderB = b.priority === "high" ? 0 : b.priority === "low" ? 2 : 1;
        return orderA - orderB;
      });
    } else if (selectedSortOption === "alphabetical") {
      return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    }
    return filtered;
  }, [
    todoStats.pending,
    folders,
    searchQuery,
    activeFilter,
    selectedFolderFilter,
    selectedPriorityFilter,
    selectedSortOption,
    getFolderById,
    matchesSearch,
  ]);

  const displayedCompletedTodos = useMemo(() => {
    const list = todoStats.completedTasks || [];
    return list.filter((todo) => {
      const folder = getFolderById(resolveWorkspaceId(todo));
      const folderName = folder?.name || "";
      const queryMatches =
        searchQuery.trim() === "" ||
        matchesSearch(todo.title, searchQuery) ||
        matchesSearch(todo.description || "", searchQuery) ||
        matchesSearch(folderName, searchQuery);

      if (!queryMatches) return false;
      if (activeFilter === "habits") return false;

      const fId = resolveWorkspaceId(todo);
      if (selectedFolderFilter !== "all" && fId !== selectedFolderFilter) {
        return false;
      }
      if (
        selectedPriorityFilter !== "all" &&
        todo.priority !== selectedPriorityFilter
      ) {
        return false;
      }
      return true;
    });
  }, [
    todoStats.completedTasks,
    getFolderById,
    searchQuery,
    activeFilter,
    selectedFolderFilter,
    selectedPriorityFilter,
    matchesSearch,
  ]);

  const displayedOverdue = useMemo(() => {
    const filtered = todoStats.overdue.filter((todo) => {
      const folder = getFolderById(resolveWorkspaceId(todo));
      const folderName = folder?.name || "";
      const queryMatches =
        searchQuery.trim() === "" ||
        matchesSearch(todo.title, searchQuery) ||
        matchesSearch(todo.description || "", searchQuery) ||
        matchesSearch(folderName, searchQuery);

      if (!queryMatches) return false;

      if (activeFilter === "habits") return false;

      const fId = resolveWorkspaceId(todo);
      if (selectedFolderFilter !== "all" && fId !== selectedFolderFilter) {
        return false;
      }

      if (
        selectedPriorityFilter !== "all" &&
        todo.priority !== selectedPriorityFilter
      ) {
        return false;
      }

      return true;
    });

    if (selectedSortOption === "priority") {
      return [...filtered].sort((a, b) => {
        const orderA = a.priority === "high" ? 0 : a.priority === "low" ? 2 : 1;
        const orderB = b.priority === "high" ? 0 : b.priority === "low" ? 2 : 1;
        return orderA - orderB;
      });
    } else if (selectedSortOption === "alphabetical") {
      return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    }
    return filtered;
  }, [
    todoStats.overdue,
    folders,
    searchQuery,
    activeFilter,
    selectedFolderFilter,
    selectedPriorityFilter,
    selectedSortOption,
    getFolderById,
    matchesSearch,
  ]);

  const displayedPendingHabits = useMemo(() => {
    const filtered = pendingHabits.filter((habit) => {
      const queryMatches =
        searchQuery.trim() === "" || matchesSearch(habit.title, searchQuery);
      if (!queryMatches) return false;

      if (activeFilter === "tasks") return false;

      const fId = resolveWorkspaceId(habit);
      if (selectedFolderFilter !== "all" && fId !== selectedFolderFilter) {
        return false;
      }

      if (
        selectedPriorityFilter !== "all" &&
        (habit as any).priority &&
        (habit as any).priority !== selectedPriorityFilter
      ) {
        return false;
      }

      return true;
    });

    if (selectedSortOption === "priority") {
      return [...filtered].sort((a, b) => {
        const orderA =
          (a as any).priority === "high"
            ? 0
            : (a as any).priority === "low"
              ? 2
              : 1;
        const orderB =
          (b as any).priority === "high"
            ? 0
            : (b as any).priority === "low"
              ? 2
              : 1;
        return orderA - orderB;
      });
    } else if (selectedSortOption === "alphabetical") {
      return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    }
    return filtered;
  }, [
    pendingHabits,
    searchQuery,
    activeFilter,
    selectedFolderFilter,
    selectedPriorityFilter,
    selectedSortOption,
    matchesSearch,
  ]);

  const displayedCompletedHabits = useMemo(() => {
    const filtered = completedHabits.filter((habit) => {
      const queryMatches =
        searchQuery.trim() === "" || matchesSearch(habit.title, searchQuery);
      if (!queryMatches) return false;

      if (activeFilter === "tasks") return false;

      const fId = resolveWorkspaceId(habit);
      if (selectedFolderFilter !== "all" && fId !== selectedFolderFilter) {
        return false;
      }

      if (
        selectedPriorityFilter !== "all" &&
        (habit as any).priority &&
        (habit as any).priority !== selectedPriorityFilter
      ) {
        return false;
      }

      return true;
    });

    if (selectedSortOption === "priority") {
      return [...filtered].sort((a, b) => {
        const orderA =
          (a as any).priority === "high"
            ? 0
            : (a as any).priority === "low"
              ? 2
              : 1;
        const orderB =
          (b as any).priority === "high"
            ? 0
            : (b as any).priority === "low"
              ? 2
              : 1;
        return orderA - orderB;
      });
    } else if (selectedSortOption === "alphabetical") {
      return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    }
    return filtered;
  }, [
    completedHabits,
    searchQuery,
    activeFilter,
    selectedFolderFilter,
    selectedPriorityFilter,
    selectedSortOption,
    matchesSearch,
  ]);

  const groupTasksByWorkspace = useCallback((taskList: Task[]) => {
    const grouped: Record<string, Task[]> = {};
    taskList.forEach((todo) => {
      const fId = resolveWorkspaceId(todo);
      if (!grouped[fId]) {
        grouped[fId] = [];
      }
      grouped[fId].push(todo);
    });
    return grouped;
  }, []);

  const groupHabitsByWorkspace = useCallback(
    (pending: Habit[], completed: Habit[]) => {
      const grouped: Record<string, { pending: Habit[]; completed: Habit[] }> =
        {};
      pending.forEach((habit) => {
        const fId = resolveWorkspaceId(habit);
        if (!grouped[fId]) {
          grouped[fId] = { pending: [], completed: [] };
        }
        grouped[fId].pending.push(habit);
      });
      completed.forEach((habit) => {
        const fId = resolveWorkspaceId(habit);
        if (!grouped[fId]) {
          grouped[fId] = { pending: [], completed: [] };
        }
        grouped[fId].completed.push(habit);
      });
      return grouped;
    },
    [],
  );

  const groupedOverdue = useMemo(() => {
    return groupTasksByWorkspace(displayedOverdue);
  }, [displayedOverdue, groupTasksByWorkspace]);

  const overdueFolderGroups = useMemo(() => {
    const keys = Object.keys(groupedOverdue);
    return keys
      .map((key) => getFolderById(key))
      .filter((f, idx, self) => self.findIndex((x) => x.id === f.id) === idx)
      .sort((a, b) => {
        const idxA = folders.findIndex((f) => f.id === a.id);
        const idxB = folders.findIndex((f) => f.id === b.id);
        return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
      });
  }, [groupedOverdue, getFolderById, folders]);

  const groupedTodayTodos = useMemo(() => {
    return groupTasksByWorkspace(displayedTodos);
  }, [displayedTodos, groupTasksByWorkspace]);

  const todayFolderGroups = useMemo(() => {
    const keys = Object.keys(groupedTodayTodos);
    return keys
      .map((key) => getFolderById(key))
      .filter((f, idx, self) => self.findIndex((x) => x.id === f.id) === idx)
      .sort((a, b) => {
        const idxA = folders.findIndex((f) => f.id === a.id);
        const idxB = folders.findIndex((f) => f.id === b.id);
        return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
      });
  }, [groupedTodayTodos, getFolderById, folders]);

  const groupedTodayHabits = useMemo(() => {
    return groupHabitsByWorkspace(
      displayedPendingHabits,
      displayedCompletedHabits,
    );
  }, [
    displayedPendingHabits,
    displayedCompletedHabits,
    groupHabitsByWorkspace,
  ]);

  const habitsFolderGroups = useMemo(() => {
    const keys = Object.keys(groupedTodayHabits);
    return keys
      .map((key) => getFolderById(key))
      .filter((f, idx, self) => self.findIndex((x) => x.id === f.id) === idx)
      .sort((a, b) => {
        const idxA = folders.findIndex((f) => f.id === a.id);
        const idxB = folders.findIndex((f) => f.id === b.id);
        return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
      });
  }, [groupedTodayHabits, getFolderById, folders]);

  const continueWorkspace = useMemo(() => {
    if (folders.length === 0 || todoStats.pending.length === 0) return null;

    const counts: Record<string, number> = {};
    todoStats.pending.forEach((todo) => {
      const fId = resolveWorkspaceId(todo);
      counts[fId] = (counts[fId] || 0) + 1;
    });

    let bestFolderId = "";
    let maxCount = 0;
    Object.entries(counts).forEach(([fId, cnt]) => {
      if (cnt > maxCount) {
        maxCount = cnt;
        bestFolderId = fId;
      }
    });

    if (!bestFolderId) return null;
    return folders.find((f) => f.id === bestFolderId) || null;
  }, [folders, todoStats.pending]);

  const activeContexts = useMemo(
    () =>
      buildActiveContexts({
        folders,
        displayedTodos,
        displayedCompletedTodos,
        displayedOverdue,
        pendingHabits,
        completedHabits,
        allChecklists,
        activeFilter,
        searchQuery,
      }),
    [
      displayedTodos,
      displayedCompletedTodos,
      displayedOverdue,
      pendingHabits,
      completedHabits,
      allChecklists,
      folders,
      activeFilter,
      searchQuery,
    ],
  );

  return {
    displayedTodos,
    displayedOverdue,
    displayedPendingHabits,
    displayedCompletedHabits,
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
