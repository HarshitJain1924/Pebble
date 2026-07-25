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
  setResources: React.Dispatch<React.SetStateAction<Record<string, Resource[]>>>,
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
              const linked = todo.linkedResourceIds || todo.linkedCollectionIds || [];
              const updated = linked.includes(resourceId)
                ? linked.filter((id: string) => id !== resourceId)
                : [...linked, resourceId];
              return { ...todo, linkedResourceIds: updated, linkedCollectionIds: updated };
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
          const linked = habit.linkedResourceIds || habit.linkedCollectionIds || [];
          const updated = linked.includes(resourceId)
            ? linked.filter((id: string) => id !== resourceId)
            : [...linked, resourceId];
          return { ...habit, linkedResourceIds: updated, linkedCollectionIds: updated };
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
              const linked = chk.linkedResourceIds || chk.linkedCollectionIds || [];
              const updated = linked.includes(resourceId)
                ? linked.filter((id: string) => id !== resourceId)
                : [...linked, resourceId];
              const updatedChk = { ...chk, linkedResourceIds: updated, linkedCollectionIds: updated, workspaceId: wsId };
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
        const linked = (existing as any).linkedItemIds || [];
        const updated = linked.includes(itemId)
          ? linked.filter((id: string) => id !== itemId)
          : [...linked, itemId];
        await ResourceRepository.saveResource({
          ...existing,
          linkedItemIds: updated,
          updatedAt: Date.now(),
        });

        const updatedResources = await ResourceRepository.getResources(wsId);
        const list: Resource[] = Object.values(updatedResources).map((r: any) => ({
          id: r.id,
          workspaceId: r.workspaceId || r.folderId || wsId,
          type: (r.resourceType || r.type || "note") as any,
          title: r.title,
          content: r.content !== undefined ? r.content : (r.payload?.content || r.body?.content),
          url: r.url !== undefined ? r.url : (r.payload?.url || r.body?.url),
          archived: r.archived || false,
          pinned: r.pinned || false,
          linkedItemIds: r.linkedItemIds || [],
          tags: r.tags || [],
          createdAt: r.createdAt || Date.now(),
          updatedAt: r.updatedAt || Date.now(),
        }));
        setResources((prev) => ({ ...prev, [wsId]: list }));
        emitStateChange("resources_changed");
      }
    } catch (e) {
      console.warn("Failed to update reverse link on resource", e);
    }
  }, [selectedList, habits, openedFolderId, lists, setTodos, setHabits, setChecklists, setResources, persistState, persistHabits]);

  return {
    toggleLinkResource,
  };
}
