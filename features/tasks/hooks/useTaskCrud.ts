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
import { useCallback } from "react";

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

      const listTodos = todos[targetWorkspaceId] ?? [];
      const updatedTodos = {
        ...todos,
        [targetWorkspaceId]: [taskWithCreatedAt, ...listTodos],
      };
      setTodos(updatedTodos);

      const wsName =
        workspaces.find((l) => l.id === targetWorkspaceId)?.name || "My Pebbles";
      showToast(`✓ Task added to ${wsName}`);

      // Persist via ECS: creates the task, then persist non-task state separately.
      // persistTaskState is intentionally skipped — ECS already persisted the entity.
      try {
        await EntityCommandService.createTask(taskWithCreatedAt, targetWorkspaceId, {
          skipEvents: true,
          skipAnalytics: true,
        });
        await persistUiState(selectedWorkspaceId);
        await persistWorkspaceState(workspaces);
        recordAnalyticsSnapshot();
      } catch (e) {
        console.warn("Failed to persist current state:", e);
      }

      finalizeMutation();

      pluginManager.dispatchTaskCreated(taskWithCreatedAt);
    },
    [
      todos,
      setTodos,
      selectedWorkspaceId,
      workspaces,
      showToast,
      persistUiState,
      persistWorkspaceState,
      recordAnalyticsSnapshot,
    ],
  );

  const updateTodoTitle = useCallback(
    async (id: string, newTitle: string) => {
      let targetWorkspaceId = selectedWorkspaceId;
      let targetTask = (todos[selectedWorkspaceId] ?? []).find((t) => t.id === id);
      if (!targetTask) {
        for (const [wsId, list] of Object.entries(todos)) {
          const found = list.find((t) => t.id === id);
          if (found) {
            targetTask = found;
            targetWorkspaceId = wsId;
            break;
          }
        }
      }
      if (!targetTask) return;
      targetWorkspaceId = targetTask.workspaceId || targetWorkspaceId;

      const updatedTodos: Record<string, Task[]> = {};
      for (const [wsId, list] of Object.entries(todos)) {
        if (list.some((t) => t.id === id)) {
          updatedTodos[wsId] = list.map((todo) =>
            todo.id === id
              ? { ...todo, title: newTitle, updatedAt: Date.now() }
              : todo,
          );
        } else {
          updatedTodos[wsId] = list;
        }
      }
      setTodos(updatedTodos);
      
      await EntityCommandService.updateTask(id, targetWorkspaceId, { title: newTitle }, { skipEvents: true });
      finalizeMutation();
    },
    [todos, selectedWorkspaceId, setTodos, finalizeMutation],
  );

  const moveTodoToList = useCallback(
    async (todoId: string, fromListId: string, toListId: string) => {
      const sourceTodos = todos[fromListId] ?? [];
      const targetTodos = todos[toListId] ?? [];
      const todoToMove = sourceTodos.find((t) => t.id === todoId);
      if (!todoToMove) return;

      const movedTodo: Task = {
        ...todoToMove,
        workspaceId: toListId,
        updatedAt: Date.now(),
      };

      const updated = {
        ...todos,
        [fromListId]: sourceTodos.filter((t) => t.id !== todoId),
        [toListId]: [movedTodo, ...targetTodos],
      };

      setTodos(updated);
      
      // Persist the move through EntityCommandService without emitting an event
      // since we already updated the optimistic local state.
      await EntityCommandService.moveTask(todoId, fromListId, toListId, { skipEvents: true });
      
      finalizeMutation();
    },
    [todos, setTodos, finalizeMutation],
  );

  const toggleTodo = useCallback(
    async (id: string) => {
      let targetWorkspaceId = selectedWorkspaceId;
      let todo = (todos[selectedWorkspaceId] ?? []).find((t) => t.id === id);
      if (!todo) {
        for (const [wsId, list] of Object.entries(todos)) {
          const found = list.find((t) => t.id === id);
          if (found) {
            todo = found;
            targetWorkspaceId = wsId;
            break;
          }
        }
      }
      if (!todo) return;
      targetWorkspaceId = todo.workspaceId || targetWorkspaceId;

      const currentlyCompleted = isTaskCompleted(todo);
      const nextCompleted = !currentlyCompleted;

      // 1. Optimistic local state update for instant UI feedback
      const optimisticTodo: Task = {
        ...todo,
        status: nextCompleted ? "completed" : "todo",
        completedAt: nextCompleted ? Date.now() : undefined,
        updatedAt: Date.now(),
      };

      const optimisticTodos: Record<string, Task[]> = {};
      for (const [wsId, list] of Object.entries(todos)) {
        if (list.some((t) => t.id === id)) {
          optimisticTodos[wsId] = list.map((t) =>
            t.id === id ? optimisticTodo : t,
          );
        } else {
          optimisticTodos[wsId] = list;
        }
      }
      setTodos(optimisticTodos);

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
        // Rollback to prior state if command handler rejected
        setTodos(todos);
        return;
      }

      const updatedTodo = result.updated;
      const committedTodos: Record<string, Task[]> = {};
      for (const [wsId, list] of Object.entries(todos)) {
        if (list.some((t) => t.id === id)) {
          committedTodos[wsId] = list.map((t) =>
            t.id === id ? updatedTodo : t,
          );
        } else {
          committedTodos[wsId] = list;
        }
      }
      setTodos(committedTodos);

      emitStateChange("tasks_changed", "tasks_screen");
    },
    [todos, selectedWorkspaceId, setTodos],
  );

  const deleteTodo = useCallback(
    async (id: string) => {
      let targetWorkspaceId = selectedWorkspaceId;
      let toDelete = (todos[selectedWorkspaceId] ?? []).find((t) => t.id === id);
      if (!toDelete) {
        for (const [wsId, list] of Object.entries(todos)) {
          const found = list.find((t) => t.id === id);
          if (found) {
            toDelete = found;
            targetWorkspaceId = wsId;
            break;
          }
        }
      }
      if (!toDelete) return;
      targetWorkspaceId = toDelete.workspaceId || targetWorkspaceId;

      const originalWorkspace =
        workspaces.find((l) => l.id === targetWorkspaceId)?.name || "Inbox";

      // Delegate repository mutation and side effects to ECS
      await EntityCommandService.recycleTask(
        id,
        targetWorkspaceId,
        originalWorkspace,
        { source: "useTaskCrud" }
      );

      const updatedTodos: Record<string, Task[]> = {};
      for (const [wsId, list] of Object.entries(todos)) {
        updatedTodos[wsId] = list.filter((todo) => todo.id !== id);
      }
      setTodos(updatedTodos);

      pluginManager.dispatchTaskDeleted(id);
      finalizeMutation();

      showUndo({
        message: `Deleted "${toDelete.title}"`,
        onUndo: async () => {
          try {
            const restoredTask = await EntityCommandService.restoreTask(id, { skipEvents: true, skipAnalytics: true });
            
            setTodos((prevTodos) => {
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
    },
    [todos, selectedWorkspaceId, setTodos, workspaces, showUndo, showToast, finalizeMutation],
  );

  const updateTodoCategory = useCallback(
    async (todoId: string, newCategory: TaskCategory) => {
      let targetWorkspaceId = selectedWorkspaceId;
      let targetTask = (todos[selectedWorkspaceId] ?? []).find((t) => t.id === todoId);
      if (!targetTask) {
        for (const [wsId, list] of Object.entries(todos)) {
          const found = list.find((t) => t.id === todoId);
          if (found) {
            targetTask = found;
            targetWorkspaceId = wsId;
            break;
          }
        }
      }
      targetWorkspaceId = targetTask?.workspaceId || targetWorkspaceId;

      const updatedTodos: Record<string, Task[]> = {};
      for (const [wsId, list] of Object.entries(todos)) {
        if (list.some((t) => t.id === todoId)) {
          updatedTodos[wsId] = list.map((todo) =>
            todo.id === todoId ? { ...todo, category: newCategory as any } : todo,
          );
        } else {
          updatedTodos[wsId] = list;
        }
      }
      setTodos(updatedTodos);
      
      await EntityCommandService.updateTask(todoId, targetWorkspaceId, { categoryId: newCategory }, { skipEvents: true });
      finalizeMutation();
    },
    [todos, selectedWorkspaceId, setTodos, finalizeMutation],
  );

  const clearCompleted = useCallback(async () => {
    // Delegate to ECS FIRST. clearCompletedTasks snapshots every completed task
    // into the Recycle Bin before removing it from active storage, so the
    // operation is atomic: on failure nothing is deleted. Local UI state is
    // only updated after persistence succeeds so the UI never claims a
    // deletion that did not happen.
    try {
      await EntityCommandService.clearCompletedTasks(selectedWorkspaceId, { source: "tasks_screen" });

      // Persistence succeeded — reflect the removal in local UI state.
      const listTodos = todos[selectedWorkspaceId] ?? [];
      const updated = {
        ...todos,
        [selectedWorkspaceId]: listTodos.filter((todo) => !isTaskCompleted(todo)),
      };
      setTodos(updated);

      finalizeMutation();
    } catch (e) {
      // Snapshot/delete failed: the active tasks remain in the repository and
      // the local UI is left untouched (no deletion claimed).
      console.warn("Failed to clear completed tasks", e);
    }
  }, [todos, selectedWorkspaceId, setTodos, finalizeMutation]);

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
        setTodos({
          ...todos,
          [destinationWorkspaceId]: refreshedTodos,
        });

        showToast("✓ Task created from reference");
        emitStateChange("tasks_changed", "tasks_screen");
      } catch (e) {
        console.warn("Failed to convert collection item to task", e);
      }
    },
    [todos, setTodos, showToast],
  );

  const saveEarlierForLater = useCallback(
    async (earlierTasks: Task[]) => {
      const activeTasks = earlierTasks.filter((t) => !isTaskCompleted(t));
      if (activeTasks.length === 0) return;

      const { EntityCommandService } = await import("@/services/command/EntityCommandService");
      const nextTodos = { ...todos };

      for (const task of activeTasks) {
        const wsId = task.workspaceId || INBOX_WORKSPACE_ID;
        const currentList = nextTodos[wsId] ?? [];
        nextTodos[wsId] = currentList.map((t) =>
          t.id === task.id
            ? { ...t, schedule: { ...t.schedule, date: "inbox" }, updatedAt: Date.now() }
            : t,
        );
      }
      setTodos(nextTodos);

      for (const task of activeTasks) {
        const wsId = task.workspaceId || INBOX_WORKSPACE_ID;
        await EntityCommandService.updateTask(
          task.id,
          wsId,
          { schedule: { ...task.schedule, date: "inbox" } },
          { source: "tasks_screen", skipAnalytics: true },
        );
      }

      finalizeMutation();
      showToast(
        `✓ Saved ${activeTasks.length} task${activeTasks.length === 1 ? "" : "s"} for later`,
      );
    },
    [todos, setTodos, finalizeMutation, showToast],
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
