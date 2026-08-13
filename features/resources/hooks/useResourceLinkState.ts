import { useCallback } from "react";
import * as Haptics from "expo-haptics";
import { Task, Habit, Workspace, Resource, Checklist, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { ResourceRepository, TaskRepository, HabitRepository, ChecklistRepository } from "@/repositories";
import { emitStateChange } from "@/services/events/state-events";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { withLock } from "@/shared/utils/mutex";

export function useResourceLinkState(
  todos: Record<string, Task[]>,
  setTodos: React.Dispatch<React.SetStateAction<Record<string, Task[]>>>,
  habits: Habit[],
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>,
  checklists: Record<string, Checklist[]>,
  setChecklists: React.Dispatch<React.SetStateAction<Record<string, Checklist[]>>>,
  resources: Record<string, Resource[]>,
  selectedWorkspaceId: string,
  activeWorkspaceId: string | null,
  workspaces: Workspace[],
  persistState: (listsToSave: Workspace[], selected: string, todosToSave: Record<string, Task[]>) => Promise<void>,
  persistHabits: (nextHabits: Habit[]) => Promise<void>,
) {
  const toggleLinkResource = useCallback(
    async (
      itemId: string,
      itemType: "task" | "habit" | "checklist",
      resourceId: string,
    ) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const wsId = activeWorkspaceId || selectedWorkspaceId || INBOX_WORKSPACE_ID;

      return withLock(`resource-link:${itemType}:${itemId}`, async () => {
        if (itemType === "task") {
          const tasksMap = await TaskRepository.getTasks(wsId);
          const currentTask = tasksMap[itemId] || todos[wsId]?.find((t) => t.id === itemId);

          const linked = currentTask?.resourceIds || [];
          const updatedResourceIds = linked.includes(resourceId)
            ? linked.filter((id: string) => id !== resourceId)
            : [...linked, resourceId];

          let updatedTask: Task;
          if (tasksMap[itemId]) {
            updatedTask = await EntityCommandService.updateTask(
              itemId,
              wsId,
              { resourceIds: updatedResourceIds },
              { skipEvents: true, skipAnalytics: true },
            );
          } else {
            updatedTask = {
              ...(currentTask || {
                id: itemId,
                workspaceId: wsId,
                title: "",
                status: "todo",
                priority: "none",
                createdAt: Date.now(),
                updatedAt: Date.now(),
              }),
              resourceIds: updatedResourceIds,
              updatedAt: Date.now(),
            };
          }

          if (persistState) {
            const nextTodos = { ...todos };
            const currentList = nextTodos[wsId] || [];
            nextTodos[wsId] = currentList.map((t) => (t.id === itemId ? updatedTask : { ...t }));
            if (!nextTodos[wsId].some((t) => t.id === itemId)) {
              nextTodos[wsId] = [...nextTodos[wsId], updatedTask];
            }
            await persistState(workspaces, wsId, nextTodos);
          }

          setTodos((prev) => {
            const next = { ...prev };
            const currentList = next[wsId] || [];
            next[wsId] = currentList.map((t) => (t.id === itemId ? updatedTask : t));
            if (!next[wsId].some((t) => t.id === itemId)) {
              next[wsId] = [...next[wsId], updatedTask];
            }
            return next;
          });

          emitStateChange("tasks_changed", "tasks_screen");
        } else if (itemType === "habit") {
          const habitsMap = await HabitRepository.getHabits(wsId);
          const currentHabit = habitsMap[itemId] || habits.find((h) => h.id === itemId);

          const linked = currentHabit?.resourceIds || [];
          const updatedResourceIds = linked.includes(resourceId)
            ? linked.filter((id: string) => id !== resourceId)
            : [...linked, resourceId];

          let updatedHabit: Habit;
          if (habitsMap[itemId]) {
            updatedHabit = await EntityCommandService.updateHabit(
              itemId,
              wsId,
              { resourceIds: updatedResourceIds },
              { skipEvents: true, skipAnalytics: true },
            );
          } else {
            updatedHabit = {
              ...(currentHabit || {
                id: itemId,
                workspaceId: wsId,
                title: "",
                recurrence: { frequency: "daily", interval: 1 },
                completionHistory: [],
                createdAt: Date.now(),
                updatedAt: Date.now(),
              }),
              resourceIds: updatedResourceIds,
              updatedAt: Date.now(),
            };
          }

          if (persistHabits) {
            const nextHabits = habits.map((h) => (h.id === itemId ? updatedHabit : h));
            if (!nextHabits.some((h) => h.id === itemId)) {
              nextHabits.push(updatedHabit);
            }
            await persistHabits(nextHabits);
          }

          setHabits((prev) => {
            const exists = prev.some((h) => h.id === itemId);
            return exists ? prev.map((h) => (h.id === itemId ? updatedHabit : h)) : [...prev, updatedHabit];
          });

          emitStateChange("habits_changed", "tasks_screen");
        } else if (itemType === "checklist") {
          const checklistsMap = await ChecklistRepository.getChecklists(wsId);
          const currentChk = checklistsMap[itemId] || (checklists[wsId] || []).find((c) => c.id === itemId);

          const linked = currentChk?.resourceIds || [];
          const updatedResourceIds = linked.includes(resourceId)
            ? linked.filter((id: string) => id !== resourceId)
            : [...linked, resourceId];

          let updatedChecklist: Checklist;
          if (checklistsMap[itemId]) {
            updatedChecklist = await EntityCommandService.updateChecklist(
              itemId,
              wsId,
              { resourceIds: updatedResourceIds },
              { skipEvents: true, skipAnalytics: true },
            );
          } else {
            updatedChecklist = {
              ...(currentChk || {
                id: itemId,
                workspaceId: wsId,
                title: "",
                items: [],
                createdAt: Date.now(),
                updatedAt: Date.now(),
              }),
              resourceIds: updatedResourceIds,
              updatedAt: Date.now(),
            };
          }

          setChecklists((prev) => {
            const next = { ...prev };
            const currentList = next[wsId] || [];
            next[wsId] = currentList.map((c) => (c.id === itemId ? updatedChecklist : c));
            if (!next[wsId].some((c) => c.id === itemId)) {
              next[wsId] = [...next[wsId], updatedChecklist];
            }
            return next;
          });

          emitStateChange("checklists_changed", "tasks_screen");
        }

        try {
          const existing = await ResourceRepository.getResource(resourceId, wsId);
          if (existing) {
            emitStateChange("resources_changed", "tasks_screen");
          }
        } catch (e) {
          console.warn("Failed to update resource link state", e);
        }
      });
    },
    [selectedWorkspaceId, activeWorkspaceId, workspaces, todos, habits, checklists, setTodos, setHabits, setChecklists, persistState, persistHabits],
  );

  return {
    toggleLinkResource,
  };
}
