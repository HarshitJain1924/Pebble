import type { TaskCategory } from "@/features/tasks/services/task-categories";
import { pluginManager } from "@/plugin";
import { TaskRepository } from "@/repositories";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { recordDailyHistorySnapshot } from "@/services/analytics/productivity-history.service";
import { syncWidgetData } from "@/services/analytics/widget-data.service";
import { emitStateChange } from "@/services/events/state-events";
import {
  cancelReminderIds,
  rescheduleTodoReminders,
} from "@/services/scheduling/reminders.service";
import {
  addToRecycleBin,
  getRecycleBinItems,
  saveRecycleBinItems,
} from "@/services/storage/storage.service";
import { INBOX_WORKSPACE_ID, Task, Workspace } from "@/shared/types/domain.types";
import { generateId } from "@/shared/utils/id";
import { isTaskCompleted } from "@/shared/utils/domain-selectors";
import { useCallback, useRef } from "react";

export interface UseTaskCrudDeps {
  todos: Record<string, Task[]>;
  setTodos: React.Dispatch<React.SetStateAction<Record<string, Task[]>>>;
  selectedWorkspaceId: string;
  workspaces: Workspace[];
  showUndo: (opts: { message: string; onUndo: () => Promise<void> }) => void;
  showToast: (msg: string) => void;
}

export function useTaskCrud(deps: UseTaskCrudDeps) {
  const { todos, setTodos, selectedWorkspaceId, workspaces, showUndo, showToast } = deps;
  const deletingTaskIdsRef = useRef<Set<string>>(new Set());
  const todosRef = useRef(todos);
  todosRef.current = todos;
  const taskMutationChainsRef = useRef<Map<string, Promise<any>>>(new Map());

  /**
   * Updates state targetedly and keeps todosRef.current synchronously updated
   * so chained/microtask mutations immediately observe optimistic changes.
   * Evaluates the pure updater once against current in-memory state and updates
   * both todosRef.current and React state deterministically.
   */
  const updateTodosTargeted = useCallback(
    (updater: (prev: Record<string, Task[]>) => Record<string, Task[]>) => {
      setTodos((prev) => {
        const next = updater(prev);
        todosRef.current = next;
        return next;
      });
    },
    [setTodos],
  );

  /**
   * Serializes mutations strictly per-task ID.
   * Mutations on distinct tasks run completely concurrently without blocking.
   * Cleans up settled queue entries on both success and rejection without
   * creating unhandled promise rejections or poisoning subsequent operations.
   */
  const runTaskMutation = useCallback(<T>(taskId: string, fn: () => Promise<T>): Promise<T> => {
    const previous = taskMutationChainsRef.current.get(taskId) ?? Promise.resolve();

    // The execution promise runs after previous settles (even if previous rejected)
    const execution = previous.catch(() => {}).then(() => fn());

    // The queue promise tracks serialization and ensures cleanup without unhandled rejections
    const queuePromise = execution.catch(() => {}).then(() => {
      if (taskMutationChainsRef.current.get(taskId) === queuePromise) {
        taskMutationChainsRef.current.delete(taskId);
      }
    });

    taskMutationChainsRef.current.set(taskId, queuePromise);

    return execution;
  }, []);

  /**
   * Helper to find a task and its workspace in a given todos map.
   */
  const findTask = useCallback(
    (id: string, sourceTodos: Record<string, Task[]>, defaultWorkspaceId: string) => {
      let targetWorkspaceId = defaultWorkspaceId;
      let targetTask = (sourceTodos[defaultWorkspaceId] ?? []).find((t) => t.id === id);
      if (!targetTask) {
        for (const [wsId, list] of Object.entries(sourceTodos)) {
          const found = list.find((t) => t.id === id);
          if (found) {
            targetTask = found;
            targetWorkspaceId = wsId;
            break;
          }
        }
      }
      if (targetTask?.workspaceId) {
        targetWorkspaceId = targetTask.workspaceId;
      }
      return { targetTask, targetWorkspaceId };
    },
    [],
  );

  // ── Focused Persistence Helpers ────────────────────────────────────────

  /** Persist active workspace ID in UI state. */
  const persistUiState = useCallback(async (workspaceId: string) => {
    const { UiStateRepository } = await import("@/repositories");
    if (workspaceId && workspaceId !== "null") {
      await UiStateRepository.saveUiState({ activeWorkspaceId: workspaceId });
    }
  }, []);

  /** Persist the workspace list. */
  const persistWorkspaceState = useCallback(async (listsToSave: Workspace[]) => {
    const { EntityCommandService } = await import("@/services/command/EntityCommandService");
    await EntityCommandService.reorderWorkspaces(listsToSave, { skipEvents: true, skipAnalytics: true });
  }, []);

  /** Batch-save all task collections. */
  const persistTaskState = useCallback(
    async (todosToSave: Record<string, Task[]>) => {
      const { EntityCommandService } = await import("@/services/command/EntityCommandService");
      for (const [wsId, taskList] of Object.entries(todosToSave)) {
        await EntityCommandService.reorderTasks(taskList, wsId, { skipEvents: true, skipAnalytics: true });
      }
    },
    [],
  );

  /** Fire daily history snapshot (fire-and-forget). */
  const recordAnalyticsSnapshot = useCallback(() => {
    void recordDailyHistorySnapshot();
  }, []);

  /** Finalize a mutation: sync widgets, emit state events. */
  const finalizeMutation = useCallback(() => {
    void syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed", "tasks_screen");
  }, []);

  /**
   * Persist all state in a single batch.
   *
   * Delegates to focused helpers while preserving the original
   * failure semantics: if ANY step fails, the whole batch is caught.
   */
  const persistState = useCallback(
    async (
      listsToSave: Workspace[],
      selected: string,
      todosToSave: Record<string, Task[]>,
    ) => {
      try {
        await persistUiState(selected);
        await persistWorkspaceState(listsToSave);
        await persistTaskState(todosToSave);
        recordAnalyticsSnapshot(); // fire-and-forget, matching original behavior
      } catch (e) {
        console.warn("Failed to persist current state:", e);
        throw e;
      }
    },
    [persistUiState, persistWorkspaceState, persistTaskState, recordAnalyticsSnapshot],
  );

  const onSaveNewTask = useCallback(
    async (newTask: Task) => {
      if (!newTask.title || newTask.title.trim() === "") return;

      const targetWorkspaceId = newTask.workspaceId || selectedWorkspaceId || INBOX_WORKSPACE_ID;
      const taskWithCreatedAt: Task = {
        ...newTask,
        workspaceId: targetWorkspaceId,
        createdAt: newTask.createdAt || Date.now(),
        updatedAt: Date.now(),
        status: newTask.status || "todo",
        priority: newTask.priority || "none",
      };

      // Targeted optimistic addition
      updateTodosTargeted((prev) => {
        const listTodos = prev[targetWorkspaceId] ?? [];
        return {
          ...prev,
          [targetWorkspaceId]: [taskWithCreatedAt, ...listTodos.filter((t) => t.id !== taskWithCreatedAt.id)],
        };
      });

      const wsName =
        workspaces.find((l) => l.id === targetWorkspaceId)?.name || "My Pebbles";
      showToast(`✓ Task added to ${wsName}`);

      try {
        await EntityCommandService.createTask(taskWithCreatedAt, targetWorkspaceId, {
          skipEvents: true,
          skipAnalytics: true,
        });
        await persistUiState(selectedWorkspaceId);
        recordAnalyticsSnapshot();
      } catch (e) {
        console.warn("Failed to persist current state:", e);
        // Targeted rollback: remove the failed new task without touching concurrent mutations
        updateTodosTargeted((prev) => {
          const listTodos = prev[targetWorkspaceId] ?? [];
          return {
            ...prev,
            [targetWorkspaceId]: listTodos.filter((t) => t.id !== taskWithCreatedAt.id),
          };
        });
        return;
      }

      finalizeMutation();
      pluginManager.dispatchTaskCreated(taskWithCreatedAt);
    },
    [
      updateTodosTargeted,
      selectedWorkspaceId,
      workspaces,
      showToast,
      persistUiState,
      recordAnalyticsSnapshot,
      finalizeMutation,
    ],
  );

  const updateTodoTitle = useCallback(
    (id: string, newTitle: string) => {
      return runTaskMutation(id, async () => {
        const { targetTask, targetWorkspaceId } = findTask(id, todosRef.current, selectedWorkspaceId);
        if (!targetTask) return;
        const previousTitle = targetTask.title;
        const now = Date.now();

        // Targeted optimistic update with pure updater
        updateTodosTargeted((prev) => {
          const list = prev[targetWorkspaceId] ?? [];
          return {
            ...prev,
            [targetWorkspaceId]: list.map((todo) =>
              todo.id === id ? { ...todo, title: newTitle, updatedAt: now } : todo,
            ),
          };
        });

        try {
          await EntityCommandService.updateTask(id, targetWorkspaceId, { title: newTitle }, { skipEvents: true });
          finalizeMutation();
        } catch (err) {
          console.warn("[useTaskCrud] updateTodoTitle failed:", err);
          const rollbackTime = Date.now();
          // Targeted rollback: revert ONLY this task's title without touching other tasks
          updateTodosTargeted((prev) => {
            const list = prev[targetWorkspaceId] ?? [];
            return {
              ...prev,
              [targetWorkspaceId]: list.map((todo) =>
                todo.id === id ? { ...todo, title: previousTitle, updatedAt: rollbackTime } : todo,
              ),
            };
          });
        }
      });
    },
    [runTaskMutation, findTask, selectedWorkspaceId, updateTodosTargeted, finalizeMutation],
  );

  const moveTodoToList = useCallback(
    (todoId: string, fromListId: string, toListId: string) => {
      return runTaskMutation(todoId, async () => {
        const currentFrom = todosRef.current[fromListId] ?? [];
        const todoToMove = currentFrom.find((t) => t.id === todoId);
        if (!todoToMove) return;

        const previousTask = todoToMove;
        const movedTodo: Task = {
          ...previousTask,
          workspaceId: toListId,
          updatedAt: Date.now(),
        };

        // Targeted optimistic move
        updateTodosTargeted((prev) => {
          const fromList = (prev[fromListId] ?? []).filter((t) => t.id !== todoId);
          const toList = [movedTodo, ...(prev[toListId] ?? []).filter((t) => t.id !== todoId)];
          return {
            ...prev,
            [fromListId]: fromList,
            [toListId]: toList,
          };
        });

        try {
          await EntityCommandService.moveTask(todoId, fromListId, toListId, { skipEvents: true });
          finalizeMutation();
        } catch (err) {
          console.warn("[useTaskCrud] moveTodoToList failed:", err);
          // Targeted rollback: restore previousTask back to fromListId and remove from toListId
          updateTodosTargeted((prev) => {
            const toList = (prev[toListId] ?? []).filter((t) => t.id !== todoId);
            const fromList = [previousTask, ...(prev[fromListId] ?? []).filter((t) => t.id !== todoId)];
            return {
              ...prev,
              [fromListId]: fromList,
              [toListId]: toList,
            };
          });
        }
      });
    },
    [runTaskMutation, updateTodosTargeted, finalizeMutation],
  );

  const toggleTodo = useCallback(
    (id: string) => {
      return runTaskMutation(id, async () => {
        const { targetTask, targetWorkspaceId } = findTask(id, todosRef.current, selectedWorkspaceId);
        if (!targetTask) return;

        const previousTodo = targetTask;
        const currentlyCompleted = isTaskCompleted(targetTask);
        const nextCompleted = !currentlyCompleted;

        // 1. Targeted optimistic update for instant feedback
        const optimisticTodo: Task = {
          ...targetTask,
          status: nextCompleted ? "completed" : "todo",
          completedAt: nextCompleted ? Date.now() : undefined,
          updatedAt: Date.now(),
        };

        updateTodosTargeted((prev) => {
          const list = prev[targetWorkspaceId] ?? [];
          return {
            ...prev,
            [targetWorkspaceId]: list.map((t) => (t.id === id ? optimisticTodo : t)),
          };
        });

        // 2. Delegate persistence and side-effects to EntityCommandService
        let result;
        try {
          if (nextCompleted) {
            result = await EntityCommandService.completeTask(id, targetWorkspaceId, {
              source: "tasks_screen",
              skipAnalytics: true,
              skipEvents: true,
            });
          } else {
            result = await EntityCommandService.uncompleteTask(id, targetWorkspaceId, {
              source: "tasks_screen",
              skipAnalytics: true,
              skipEvents: true,
            });
          }
        } catch (err) {
          console.warn("[useTaskCrud] EntityCommandService toggleTask failed", err);
        }

        if (!result) {
          // Targeted rollback to previousTodo without overwriting concurrent mutations
          updateTodosTargeted((prev) => {
            const list = prev[targetWorkspaceId] ?? [];
            return {
              ...prev,
              [targetWorkspaceId]: list.map((t) => (t.id === id ? previousTodo : t)),
            };
          });
          return;
        }

        // 3. Commit authoritative result targetedly
        const updatedTodo = result.updated;
        updateTodosTargeted((prev) => {
          const list = prev[targetWorkspaceId] ?? [];
          return {
            ...prev,
            [targetWorkspaceId]: list.map((t) => (t.id === id ? updatedTodo : t)),
          };
        });

        emitStateChange("tasks_changed", "tasks_screen");
      });
    },
    [runTaskMutation, findTask, selectedWorkspaceId, updateTodosTargeted],
  );

  const deleteTodo = useCallback(
    (id: string) => {
      if (deletingTaskIdsRef.current.has(id)) return Promise.resolve();
      deletingTaskIdsRef.current.add(id);

      return runTaskMutation(id, async () => {
        try {
          const { targetTask, targetWorkspaceId } = findTask(id, todosRef.current, selectedWorkspaceId);
          if (!targetTask) return;

          const toDelete = targetTask;
          const originalWorkspace =
            workspaces.find((l) => l.id === targetWorkspaceId)?.name || "Inbox";

          // Targeted optimistic deletion
          updateTodosTargeted((prev) => {
            const list = prev[targetWorkspaceId] ?? [];
            return {
              ...prev,
              [targetWorkspaceId]: list.filter((t) => t.id !== id),
            };
          });

          try {
            await EntityCommandService.recycleTask(
              id,
              targetWorkspaceId,
              originalWorkspace,
              { source: "useTaskCrud" }
            );
          } catch (e) {
            console.warn("[useTaskCrud] Failed to recycle task:", e);
            // Targeted rollback: reinsert toDelete without touching concurrent changes
            updateTodosTargeted((prev) => {
              const list = prev[targetWorkspaceId] ?? [];
              if (!list.some((t) => t.id === id)) {
                return {
                  ...prev,
                  [targetWorkspaceId]: [toDelete, ...list],
                };
              }
              return prev;
            });
            return;
          }

          pluginManager.dispatchTaskDeleted(id);
          finalizeMutation();

          showUndo({
            message: `Deleted "${toDelete.title}"`,
            onUndo: async () => {
              try {
                const restoredTask = await EntityCommandService.restoreTask(id, { skipEvents: true, skipAnalytics: true });
                updateTodosTargeted((prevTodos) => {
                  const targetWs = restoredTask.workspaceId;
                  const currentList = prevTodos[targetWs] || [];
                  if (!currentList.some((t) => t.id === restoredTask.id)) {
                    return {
                      ...prevTodos,
                      [targetWs]: [restoredTask, ...currentList],
                    };
                  }
                  return prevTodos;
                });
                finalizeMutation();
              } catch (e) {
                console.warn("Failed to restore task", e);
                showToast("Failed to restore task");
              }
            },
          });
        } finally {
          deletingTaskIdsRef.current.delete(id);
        }
      });
    },
    [runTaskMutation, findTask, selectedWorkspaceId, updateTodosTargeted, workspaces, finalizeMutation, showUndo, showToast],
  );

  const updateTodoCategory = useCallback(
    (todoId: string, newCategory: TaskCategory) => {
      return runTaskMutation(todoId, async () => {
        const { targetTask, targetWorkspaceId } = findTask(todoId, todosRef.current, selectedWorkspaceId);
        if (!targetTask) return;

        const previousCategoryId = targetTask.categoryId;
        const optimisticUpdatedAt = Date.now();

        // Targeted optimistic update with pure updater
        updateTodosTargeted((prev) => {
          const list = prev[targetWorkspaceId] ?? [];
          return {
            ...prev,
            [targetWorkspaceId]: list.map((todo) =>
              todo.id === todoId
                ? { ...todo, categoryId: newCategory, updatedAt: optimisticUpdatedAt }
                : todo,
            ),
          };
        });

        try {
          await EntityCommandService.updateTask(todoId, targetWorkspaceId, { categoryId: newCategory }, { skipEvents: true });
          finalizeMutation();
        } catch (err) {
          console.warn("[useTaskCrud] updateTodoCategory failed:", err);
          const rollbackUpdatedAt = Date.now();
          // Targeted rollback: revert ONLY this task's category
          updateTodosTargeted((prev) => {
            const list = prev[targetWorkspaceId] ?? [];
            return {
              ...prev,
              [targetWorkspaceId]: list.map((todo) =>
                todo.id === todoId
                  ? { ...todo, categoryId: previousCategoryId, updatedAt: rollbackUpdatedAt }
                  : todo,
              ),
            };
          });
        }
      });
    },
    [runTaskMutation, findTask, selectedWorkspaceId, updateTodosTargeted, finalizeMutation],
  );

  const clearCompleted = useCallback(async () => {
    // Delegate to ECS FIRST. clearCompletedTasks snapshots every completed task
    // into the Recycle Bin before removing it from active storage, so the
    // operation is atomic: on failure nothing is deleted. Local UI state is
    // only updated after persistence succeeds so the UI never claims a
    // deletion that did not happen.
    try {
      await EntityCommandService.clearCompletedTasks(selectedWorkspaceId, { source: "tasks_screen" });

      // Persistence succeeded — reflect the removal targetedly in local UI state.
      updateTodosTargeted((prev) => {
        const listTodos = prev[selectedWorkspaceId] ?? [];
        return {
          ...prev,
          [selectedWorkspaceId]: listTodos.filter((todo) => !isTaskCompleted(todo)),
        };
      });

      finalizeMutation();
    } catch (e) {
      // Snapshot/delete failed: the active tasks remain in the repository and
      // the local UI is left untouched (no deletion claimed).
      console.warn("Failed to clear completed tasks", e);
    }
  }, [selectedWorkspaceId, updateTodosTargeted, finalizeMutation]);

  const convertCollectionItemToTask = useCallback(
    async (item: any, targetWorkspaceId?: string) => {
      try {
        const destinationWorkspaceId = targetWorkspaceId || INBOX_WORKSPACE_ID;
        const newTask: Task = {
          id: generateId("task-"),
          title: item.title,
          description: item.content || undefined,
          status: "todo",
          categoryId: "work",
          priority: "medium",
          schedule: { date: new Date().toISOString().split("T")[0] },
          workspaceId: destinationWorkspaceId,
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        await EntityCommandService.createTask(newTask, destinationWorkspaceId, {
          skipEvents: true,
          skipAnalytics: true,
        });
        const refreshedTasksMap = await TaskRepository.getTasks(
          destinationWorkspaceId,
        );
        const refreshedTodos = Object.values(refreshedTasksMap);
        updateTodosTargeted((prev) => ({
          ...prev,
          [destinationWorkspaceId]: refreshedTodos,
        }));

        showToast("✓ Task created from reference");
        emitStateChange("tasks_changed", "tasks_screen");
      } catch (e) {
        console.warn("Failed to convert collection item to task", e);
      }
    },
    [updateTodosTargeted, showToast],
  );

  const saveEarlierForLater = useCallback(
    async (earlierTasks: Task[]) => {
      const activeTasks = earlierTasks.filter((t) => !isTaskCompleted(t));
      if (activeTasks.length === 0) return;

      const { EntityCommandService } = await import("@/services/command/EntityCommandService");
      const now = Date.now();

      updateTodosTargeted((prev) => {
        const nextTodos = { ...prev };
        for (const task of activeTasks) {
          const wsId = task.workspaceId || INBOX_WORKSPACE_ID;
          const currentList = nextTodos[wsId] ?? [];
          nextTodos[wsId] = currentList.map((t) =>
            t.id === task.id
              ? { ...t, schedule: { ...t.schedule, date: "inbox" }, updatedAt: now }
              : t,
          );
        }
        return nextTodos;
      });

      try {
        for (const task of activeTasks) {
          const wsId = task.workspaceId || INBOX_WORKSPACE_ID;
          await EntityCommandService.updateTask(
            task.id,
            wsId,
            { schedule: { ...task.schedule, date: "inbox" } },
            { source: "tasks_screen", skipAnalytics: true },
          );
        }
      } catch (e) {
        console.warn("[useTaskCrud] saveEarlierForLater failed:", e);
      }

      finalizeMutation();
      showToast(
        `✓ Saved ${activeTasks.length} task${activeTasks.length === 1 ? "" : "s"} for later`,
      );
    },
    [updateTodosTargeted, finalizeMutation, showToast],
  );

  return {
    persistState,
    onSaveNewTask,
    updateTodoTitle,
    moveTodoToList,
    toggleTodo,
    deleteTodo,
    updateTodoCategory,
    clearCompleted,
    convertCollectionItemToTask,
    saveEarlierForLater,
  };
}
