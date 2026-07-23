import { useCallback } from "react";
import * as Haptics from "expo-haptics";
import { Todo, Habit, TaskList, Collection, Checklist } from "../../types";
import { getCollections, saveCollections, saveChecklists } from "@/services/storage";
import { emitStateChange } from "@/services/stateEvents";

export function useResourceLinkState(
  todos: Record<string, Todo[]>,
  setTodos: React.Dispatch<React.SetStateAction<Record<string, Todo[]>>>,
  habits: Habit[],
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>,
  checklists: Record<string, Checklist[]>,
  setChecklists: React.Dispatch<React.SetStateAction<Record<string, Checklist[]>>>,
  collections: Record<string, Collection[]>,
  setCollections: React.Dispatch<React.SetStateAction<Record<string, Collection[]>>>,
  selectedList: string,
  openedFolderId: string | null,
  lists: TaskList[],
  persistState: (listsToSave: TaskList[], selected: string, todosToSave: Record<string, Todo[]>) => Promise<void>,
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