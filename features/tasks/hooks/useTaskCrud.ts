/**
 * useTaskCrud.ts
 * ─────────────────────
 * Task CRUD operations extracted from useTasksState.
 *
 * Owns: task business logic, task persistence, task repository usage.
 * Does NOT own: screen UI state, edit modal visibility, navigation, analytics orchestration.
 */
import {
  earnPebble,
  undoLastPebble,
} from "@/features/profile/services/pebble.service";
import { handleTaskXpChange } from "@/features/settings/services/settings.service";
import type { TaskCategory } from "@/features/tasks/services/task-categories";
import { pluginManager } from "@/plugin";
import { TaskRepository } from "@/repositories";
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
import { Task, Workspace } from "@/shared/types/domain.types";
import { isTaskCompleted } from "@/shared/utils/domain-selectors";
import { useCallback } from "react";

export interface UseTaskCrudDeps {
  todos: Record<string, Task[]>;
  setTodos: React.Dispatch<React.SetStateAction<Record<string, Task[]>>>;
  selectedList: string;
  lists: Workspace[];
  showUndo: (opts: { message: string; onUndo: () => Promise<void> }) => void;
  showToast: (msg: string) => void;
}

export function useTaskCrud(deps: UseTaskCrudDeps) {
  const { todos, setTodos, selectedList, lists, showUndo, showToast } = deps;

  const persistState = useCallback(
    async (
      listsToSave: Workspace[],
      selected: string,
      todosToSave: Record<string, Task[]>,
    ) => {
      try {
        const { WorkspaceRepository, UiStateRepository } =
          await import("@/repositories");
        if (selected && selected !== "null") {
          await UiStateRepository.saveUiState({ activeWorkspaceId: selected });
        }
        await WorkspaceRepository.saveWorkspaces(listsToSave);

        for (const [wsId, taskList] of Object.entries(todosToSave)) {
          await TaskRepository.saveTasks(taskList, wsId);
        }
        void recordDailyHistorySnapshot();
      } catch (e) {
        console.warn("Failed to persist current state:", e);
      }
    },
    [],
  );

  const onSaveNewTask = useCallback(
    async (newTask: Task) => {
      if (!newTask.title || newTask.title.trim() === "") return;

      const targetFolderId = newTask.workspaceId || selectedList || "default";
      const taskWithCreatedAt: Task = {
        ...newTask,
        workspaceId: targetFolderId,
        createdAt: newTask.createdAt || Date.now(),
        updatedAt: Date.now(),
        status: newTask.status || "todo",
        priority: newTask.priority || "none",
      };

      const listTodos = todos[targetFolderId] ?? [];
      const updatedTodos = {
        ...todos,
        [targetFolderId]: [taskWithCreatedAt, ...listTodos],
      };
      setTodos(updatedTodos);

      const wsName =
        lists.find((l) => l.id === targetFolderId)?.name || "My Pebbles";
      showToast(`✓ Task added to ${wsName}`);

      await persistState(lists, selectedList, updatedTodos);
      void syncWidgetData().catch(() => {});
      emitStateChange("tasks_changed", "tasks_screen");

      pluginManager.dispatchTaskCreated(taskWithCreatedAt);
    },
    [todos, setTodos, selectedList, lists, showToast, persistState],
  );

  const updateTodoTitle = useCallback(
    async (id: string, newTitle: string) => {
      const listTodos = todos[selectedList] ?? [];
      const updatedList = listTodos.map((todo) =>
        todo.id === id
          ? { ...todo, title: newTitle, updatedAt: Date.now() }
          : todo,
      );
      const updated = { ...todos, [selectedList]: updatedList };
      setTodos(updated);
      await persistState(lists, selectedList, updated);
      void syncWidgetData().catch(() => {});
      emitStateChange("tasks_changed", "tasks_screen");
    },
    [todos, selectedList, setTodos, lists, persistState],
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
      await persistState(lists, selectedList, updated);
      void syncWidgetData().catch(() => {});
      emitStateChange("tasks_changed", "tasks_screen");
    },
    [todos, selectedList, setTodos, lists, persistState],
  );

  const toggleTodo = useCallback(
    async (id: string) => {
      const listTodos = todos[selectedList] ?? [];
      const todo = listTodos.find((t) => t.id === id);
      if (!todo) return;
      const currentlyCompleted = isTaskCompleted(todo);
      const nextCompleted = !currentlyCompleted;
      await handleTaskXpChange(todo, nextCompleted);
      const updatedTodo: Task = {
        ...todo,
        status: nextCompleted ? "completed" : "todo",
        completedAt: nextCompleted ? Date.now() : undefined,
        updatedAt: Date.now(),
      };

      const currentListTodos = todos[selectedList] ?? [];
      const updatedList = currentListTodos.map((t) =>
        t.id === id ? updatedTodo : t,
      );
      const updatedTodos = { ...todos, [selectedList]: updatedList };
      setTodos(updatedTodos);

      if (nextCompleted) {
        pluginManager.dispatchTaskCompleted(updatedTodo);
        await earnPebble("task");
      } else {
        pluginManager.dispatchTaskUncompleted(updatedTodo);
        await undoLastPebble("task");
      }
      await persistState(lists, selectedList, updatedTodos);
      await syncWidgetData().catch(() => {});
      emitStateChange("tasks_changed", "tasks_screen");
    },
    [todos, selectedList, setTodos, lists, persistState],
  );

  const deleteTodo = useCallback(
    async (id: string) => {
      const listTodos = todos[selectedList] ?? [];
      const toDelete = listTodos.find((t) => t.id === id);
      if (!toDelete) return;

      const originalWorkspace =
        lists.find((l) => l.id === selectedList)?.name || "Default";

      await cancelReminderIds(toDelete.reminder?.notificationIds ?? []);

      await addToRecycleBin("task", toDelete, originalWorkspace);

      const currentListTodos = todos[selectedList] ?? [];
      const updatedTodos = {
        ...todos,
        [selectedList]: currentListTodos.filter((todo) => todo.id !== id),
      };
      setTodos(updatedTodos);

      pluginManager.dispatchTaskDeleted(id);
      await persistState(lists, selectedList, updatedTodos);
      void syncWidgetData().catch(() => {});
      emitStateChange("tasks_changed", "tasks_screen");

      showUndo({
        message: `Deleted "${toDelete.title}"`,
        onUndo: async () => {
          const binItems = await getRecycleBinItems();
          await saveRecycleBinItems(binItems.filter((item) => item.id !== id));

          const rescheduled = await rescheduleTodoReminders(toDelete);

          const currentTasksMap = await TaskRepository.getTasks(selectedList);
          const listTodos = Object.values(currentTasksMap).map((t: any) => ({
            ...t,
            folderId: selectedList,
            scheduledDate: t.scheduledDate || t.dueDate,
          })) as Task[];
          if (!listTodos.some((t) => t.id === id)) {
            await TaskRepository.saveTask({
              ...rescheduled,
              folderId: selectedList,
            });
            const updatedTodosMap = await TaskRepository.getTasks(selectedList);
            const updatedList = Object.values(updatedTodosMap).map(
              (t: any) => ({
                ...t,
                folderId: selectedList,
                scheduledDate: t.scheduledDate || t.dueDate,
              }),
            ) as Task[];
            const updated = { ...todos, [selectedList]: updatedList };
            await persistState(lists, selectedList, updated);
            setTodos(updated);
          }

          void syncWidgetData().catch(() => {});
          emitStateChange("tasks_changed", "tasks_screen");
        },
      });
    },
    [todos, selectedList, setTodos, lists, persistState, showUndo],
  );

  const updateTodoCategory = useCallback(
    async (todoId: string, newCategory: TaskCategory) => {
      const listTodos = todos[selectedList] ?? [];
      const updatedList = listTodos.map((todo) =>
        todo.id === todoId ? { ...todo, category: newCategory } : todo,
      );
      const updated = { ...todos, [selectedList]: updatedList };
      setTodos(updated);
      await persistState(lists, selectedList, updated);
      void syncWidgetData().catch(() => {});
      emitStateChange("tasks_changed", "tasks_screen");
    },
    [todos, selectedList, setTodos, lists, persistState],
  );

  const clearCompleted = useCallback(async () => {
    const listTodos = todos[selectedList] ?? [];
    for (const t of listTodos) {
      if (isTaskCompleted(t)) {
        if (t.reminder?.notificationIds) {
          await cancelReminderIds(t.reminder.notificationIds);
        }
      }
    }
    const updated = {
      ...todos,
      [selectedList]: listTodos.filter((todo) => !isTaskCompleted(todo)),
    };
    setTodos(updated);
    await persistState(lists, selectedList, updated);
    void syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed", "tasks_screen");
  }, [todos, selectedList, setTodos, lists, persistState]);

  const onSaveEditedTask = useCallback(
    async (updatedTask: Task) => {
      const original = Object.values(todos)
        .flat()
        .find((t) => t.id === updatedTask.id);
      if (original?.reminder?.notificationIds) {
        await cancelReminderIds(original.reminder.notificationIds);
      }

      const rescheduledTask = await rescheduleTodoReminders(updatedTask);

      const allLists = { ...todos };
      for (const listId in allLists) {
        allLists[listId] = allLists[listId].map((t) =>
          t.id === rescheduledTask.id ? rescheduledTask : t,
        );
      }

      let foundListId = selectedList;
      for (const listId in allLists) {
        if (allLists[listId].find((t) => t.id === rescheduledTask.id)) {
          foundListId = listId;
          break;
        }
      }
      if (
        rescheduledTask.workspaceId &&
        rescheduledTask.workspaceId !== foundListId
      ) {
        allLists[foundListId] = allLists[foundListId].filter(
          (t) => t.id !== rescheduledTask.id,
        );
        if (!allLists[rescheduledTask.workspaceId])
          allLists[rescheduledTask.workspaceId] = [];
        allLists[rescheduledTask.workspaceId].push(rescheduledTask);
      }

      setTodos(allLists);
      await persistState(lists, selectedList, allLists);
      emitStateChange("tasks_changed", "tasks_screen");
    },
    [todos, selectedList, setTodos, lists, persistState],
  );

  const convertCollectionItemToTask = useCallback(
    async (item: any, targetWorkspaceId?: string) => {
      try {
        const destinationWorkspaceId = targetWorkspaceId || "default";
        const newTask: Task = {
          id: String(Date.now()),
          title: item.title,
          description: item.content || undefined,
          status: "todo",
          categoryId: "work",
          priority: "medium",
          schedule: { date: new Date().toISOString().split("T")[0] },
          workspaceId: destinationWorkspaceId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        await TaskRepository.saveTask(newTask);
        const refreshedTasksMap = await TaskRepository.getTasks(
          newTask.workspaceId || "default",
        );
        const refreshedTodos = Object.values(refreshedTasksMap);
        setTodos({
          ...todos,
          [newTask.workspaceId || "default"]: refreshedTodos,
        });

        await earnPebble("task");

        showToast("✓ Task created from reference (+10 XP!)");
        emitStateChange("tasks_changed", "tasks_screen");
        emitStateChange("profile_changed", "tasks_screen");
      } catch (e) {
        console.warn("Failed to convert collection item to task", e);
      }
    },
    [todos, setTodos, showToast],
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
    onSaveEditedTask,
    convertCollectionItemToTask,
  };
}
