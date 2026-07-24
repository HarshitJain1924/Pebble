import { useCallback } from "react";
import * as Haptics from "expo-haptics";
import { Task, Habit, Workspace, Resource, ResourceCollection, Checklist } from "@/shared/types/domain.types";
import { getCollections, saveCollections, saveChecklists } from "@/services/storage/storage.service";
import { emitStateChange } from "@/services/events/state-events";

export function useResourceLinkState(
  todos: Record<string, Task[]>,
  setTodos: React.Dispatch<React.SetStateAction<Record<string, Task[]>>>,
  habits: Habit[],
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>,
  checklists: Record<string, Checklist[]>,
  setChecklists: React.Dispatch<React.SetStateAction<Record<string, Checklist[]>>>,
  collections: Record<string, ResourceCollection[]>,
  setCollections: React.Dispatch<React.SetStateAction<Record<string, ResourceCollection[]>>>,
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
              const linked = todo.linkedCollectionIds || [];
              const updated = linked.includes(resourceId)
                ? linked.filter((id) => id !== resourceId)
                : [...linked, resourceId];
              return { ...todo, linkedCollectionIds: updated };
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
          const linked = habit.linkedCollectionIds || [];
          const updated = linked.includes(resourceId)
            ? linked.filter((id) => id !== resourceId)
            : [...linked, resourceId];
          return { ...habit, linkedCollectionIds: updated };
        }
        return habit;
      });
      setHabits(nextHabits);
      await persistHabits(nextHabits);
    } else if (itemType === "checklist") {
      setChecklists((current) => {
        const next = { ...current };
        const wsId = openedFolderId || "default";
        if (next[wsId]) {
          next[wsId] = next[wsId].map((chk) => {
            if (chk.id === itemId) {
              const linked = chk.linkedCollectionIds || [];
              const updated = linked.includes(resourceId)
                ? linked.filter((id) => id !== resourceId)
                : [...linked, resourceId];
              return { ...chk, linkedCollectionIds: updated };
            }
            return chk;
          });
        }
        saveChecklists(next).catch(() => {});
        return next;
      });
    }

    try {
      const allCollections = await getCollections();
      const wsId = openedFolderId || "default";
      const list = allCollections[wsId] || [];
      const updatedList = list.map((coll) => {
        if (coll.items) {
          const updatedItems = coll.items.map((item) => {
            if (item.id === resourceId) {
              const linked = item.linkedItemIds || [];
              const updated = linked.includes(itemId)
                ? linked.filter((id) => id !== itemId)
                : [...linked, itemId];
              return { ...item, linkedItemIds: updated };
            }
            return item;
          });
          return { ...coll, items: updatedItems };
        }
        return coll;
      });
      allCollections[wsId] = updatedList;
      await saveCollections(allCollections);
      setCollections(allCollections);
      emitStateChange("vault_changed");
    } catch (e) {
      console.warn("Failed to update reverse link on resource", e);
    }
  }, [selectedList, habits, openedFolderId, lists, collections, setTodos, setHabits, setChecklists, setCollections, persistState, persistHabits]);

  return {
    toggleLinkResource,
  };
}
