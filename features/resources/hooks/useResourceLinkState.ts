import { useCallback } from "react";
import * as Haptics from "expo-haptics";
import { Task, Habit, Workspace, Resource, Checklist } from "@/shared/types/domain.types";
import { ResourceRepository, ChecklistRepository } from "@/repositories";
import { emitStateChange } from "@/services/events/state-events";

export function useResourceLinkState(
  todos: Record<string, Task[]>,
  setTodos: React.Dispatch<React.SetStateAction<Record<string, Task[]>>>,
  habits: Habit[],
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>,
  checklists: Record<string, Checklist[]>,
  setChecklists: React.Dispatch<React.SetStateAction<Record<string, Checklist[]>>>,
  resources: Record<string, Resource[]>,
  selectedList: string,
  openedFolderId: string | null,
  lists: Workspace[],
  persistState: (listsToSave: Workspace[], selected: string, todosToSave: Record<string, Task[]>) => Promise<void>,
  persistHabits: (nextHabits: Habit[]) => Promise<void>,
) {
  const toggleLinkResource = useCallback(async (
    itemId: string,
    itemType: "task" | "habit" | "checklist",
    resourceId: string,
  ) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (itemType === "task") {
      setTodos((current) => {
        const next = { ...current };
        const wsId = openedFolderId || selectedList || "default";
        if (next[wsId]) {
          next[wsId] = next[wsId].map((todo) => {
            if (todo.id === itemId) {
              const linked = todo.resourceIds || [];
              const updated = linked.includes(resourceId)
                ? linked.filter((id: string) => id !== resourceId)
                : [...linked, resourceId];
              return { ...todo, resourceIds: updated, updatedAt: Date.now() };
            }
            return todo;
          });
        }
        persistState(lists, wsId, next);
        return next;
      });
    } else if (itemType === "habit") {
      const nextHabits = habits.map((habit) => {
        if (habit.id === itemId) {
          const linked = habit.resourceIds || [];
          const updated = linked.includes(resourceId)
            ? linked.filter((id: string) => id !== resourceId)
            : [...linked, resourceId];
          return { ...habit, resourceIds: updated, updatedAt: Date.now() };
        }
        return habit;
      });
      setHabits(nextHabits);
      await persistHabits(nextHabits);
    } else if (itemType === "checklist") {
      const wsId = openedFolderId || "default";
      setChecklists((current) => {
        const next = { ...current };
        if (next[wsId]) {
          next[wsId] = next[wsId].map((chk) => {
            if (chk.id === itemId) {
              const linked = chk.resourceIds || [];
              const updated = linked.includes(resourceId)
                ? linked.filter((id: string) => id !== resourceId)
                : [...linked, resourceId];
              const updatedChk: Checklist = { ...chk, resourceIds: updated, workspaceId: wsId, updatedAt: Date.now() };
              void ChecklistRepository.saveChecklist(updatedChk);
              return updatedChk;
            }
            return chk;
          });
        }
        return next;
      });
    }

    try {
      const wsId = openedFolderId || selectedList || "default";
      const existing = await ResourceRepository.getResource(resourceId, wsId);
      if (existing) {
        const updatedResources = await ResourceRepository.getResources(wsId);
        const list: Resource[] = Object.values(updatedResources);
        emitStateChange("resources_changed");
      }
    } catch (e) {
      console.warn("Failed to update resource link state", e);
    }
  }, [selectedList, habits, openedFolderId, lists, setTodos, setHabits, setChecklists, persistState, persistHabits]);

  return {
    toggleLinkResource,
  };
}
