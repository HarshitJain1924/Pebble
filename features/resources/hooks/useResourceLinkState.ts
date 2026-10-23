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
  _persistState?: (listsToSave: Workspace[], selected: string, todosToSave: Record<string, Task[]>) => Promise<void>,
  _persistHabits?: (nextHabits: Habit[]) => Promise<void>,
) {
  const toggleLinkResource = useCallback(
    async (
      itemId: string,
      itemType: "task" | "habit" | "checklist",
      resourceId: string,
    ) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const defaultWsId = activeWorkspaceId || selectedWorkspaceId || INBOX_WORKSPACE_ID;

      return withLock(`resource-link:${itemType}:${itemId}`, async () => {
        if (itemType === "task") {
          let targetWsId = defaultWsId;
          if (!todos[defaultWsId]?.some((t) => t.id === itemId)) {
            for (const [wId, list] of Object.entries(todos)) {
              if (list.some((t) => t.id === itemId)) {
                targetWsId = wId;
                break;
              }
            }
          }

          const tasksMap = await TaskRepository.getTasks(targetWsId);
          const currentTask = tasksMap[itemId];

          if (!currentTask) {
            console.warn(`[useResourceLinkState] Task ${itemId} not found in repository. Aborting resource link.`);
            setTodos((prev) => {
              const list = prev[targetWsId];
              if (list && list.some((t) => t.id === itemId)) {
                return {
                  ...prev,
                  [targetWsId]: list.filter((t) => t.id !== itemId),
                };
              }
              return prev;
            });
            return;
          }

          const linked = currentTask.resourceIds || [];
          const updatedResourceIds = linked.includes(resourceId)
            ? linked.filter((id: string) => id !== resourceId)
            : [...linked, resourceId];

          const updatedTask = await EntityCommandService.updateTask(
            itemId,
            targetWsId,
            { resourceIds: updatedResourceIds },
            { skipEvents: true, skipAnalytics: true },
          );

          setTodos((prev) => {
            const list = prev[targetWsId] ?? [];
            return {
              ...prev,
              [targetWsId]: list.map((t) => (t.id === itemId ? updatedTask : t)),
            };
          });

          emitStateChange("tasks_changed", "tasks_screen");
        } else if (itemType === "habit") {
          let targetWsId = defaultWsId;
          const habitInState = habits.find((h) => h.id === itemId);
          if (habitInState?.workspaceId) {
            targetWsId = habitInState.workspaceId;
          }

          const habitsMap = await HabitRepository.getHabits(targetWsId);
          const currentHabit = habitsMap[itemId];

          if (!currentHabit) {
            console.warn(`[useResourceLinkState] Habit ${itemId} not found in repository. Aborting resource link.`);
            setHabits((prev) => prev.filter((h) => h.id !== itemId));
            return;
          }

          const linked = currentHabit.resourceIds || [];
          const updatedResourceIds = linked.includes(resourceId)
            ? linked.filter((id: string) => id !== resourceId)
            : [...linked, resourceId];

          const updatedHabit = await EntityCommandService.updateHabit(
            itemId,
            targetWsId,
            { resourceIds: updatedResourceIds },
            { skipEvents: true, skipAnalytics: true },
          );

          setHabits((prev) => prev.map((h) => (h.id === itemId ? updatedHabit : h)));
          emitStateChange("habits_changed", "tasks_screen");
        } else if (itemType === "checklist") {
          let targetWsId = defaultWsId;
          if (!checklists[defaultWsId]?.some((c) => c.id === itemId)) {
            for (const [wId, list] of Object.entries(checklists)) {
              if (list.some((c) => c.id === itemId)) {
                targetWsId = wId;
                break;
              }
            }
          }

          const checklistsMap = await ChecklistRepository.getChecklists(targetWsId);
          const currentChk = checklistsMap[itemId];

          if (!currentChk) {
            console.warn(`[useResourceLinkState] Checklist ${itemId} not found in repository. Aborting resource link.`);
            setChecklists((prev) => {
              const list = prev[targetWsId];
              if (list && list.some((c) => c.id === itemId)) {
                return {
                  ...prev,
                  [targetWsId]: list.filter((c) => c.id !== itemId),
                };
              }
              return prev;
            });
            return;
          }

          const linked = currentChk.resourceIds || [];
          const updatedResourceIds = linked.includes(resourceId)
            ? linked.filter((id: string) => id !== resourceId)
            : [...linked, resourceId];

          const updatedChecklist = await EntityCommandService.updateChecklist(
            itemId,
            targetWsId,
            { resourceIds: updatedResourceIds },
            { skipEvents: true, skipAnalytics: true },
          );

          setChecklists((prev) => {
            const list = prev[targetWsId] ?? [];
            return {
              ...prev,
              [targetWsId]: list.map((c) => (c.id === itemId ? updatedChecklist : c)),
            };
          });

          emitStateChange("checklists_changed", "tasks_screen");
        }

        try {
          const existing = await ResourceRepository.getResource(resourceId, defaultWsId);
          if (existing) {
            emitStateChange("resources_changed", "tasks_screen");
          }
        } catch (e) {
          console.warn("Failed to update resource link state", e);
        }
      });
    },
    [selectedWorkspaceId, activeWorkspaceId, todos, habits, checklists, setTodos, setHabits, setChecklists],
  );

  return {
    toggleLinkResource,
  };
}
