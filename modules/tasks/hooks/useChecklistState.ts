import { useState, useCallback } from "react";
import { Checklist, ChecklistItem } from "../../types";
import { ActivityRepository } from "@/services/core/repositories";
import { addToRecycleBin } from "@/services/storage";
import { emitStateChange } from "@/services/stateEvents";
import { globalChecklists, setGlobalChecklists } from "../utils/taskUtils";

export function useChecklistState(selectedList: string) {
  const [checklists, setChecklists] = useState<Record<string, Checklist[]>>(() => globalChecklists || {});

  const loadChecklistsState = useCallback(async () => {
    try {
      const activeList = selectedList || "default";
      const checklistsMap = await ActivityRepository.getChecklists(activeList);
      const activeChecklists = Object.values(checklistsMap).map((c) => ({
        id: c.id,
        folderId: activeList,
        title: c.title,
        items: c.items || [],
        createdAt: c.createdAt,
        archived: c.archived || false,
      }));
      setChecklists((prev) => ({
        ...prev,
        [activeList]: activeChecklists,
      }));
    } catch (e) {
      console.warn("Failed to load current checklists", e);
    }
  }, [selectedList]);

  const addChecklist = useCallback(async (title: string, itemTitles: string[], folderId: string) => {
    try {
      const activeList = folderId || selectedList || "default";
      const newChecklist = {
        id: `checklist-${Date.now()}`,
        workspaceId: activeList,
        title,
        items: itemTitles.map((it, idx) => ({
          id: `checklist-item-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
          title: it,
          completed: false,
        })),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        archived: false,
      };
      await ActivityRepository.saveChecklist(newChecklist);
      await loadChecklistsState();
      emitStateChange("checklists_changed", "tasks_screen");
    } catch (e) {
      console.warn("Failed to add checklist current", e);
    }
  }, [selectedList, loadChecklistsState]);

  const updateChecklist = useCallback(async (updated: Checklist) => {
    try {
      const activeList = updated.folderId || selectedList || "default";
      await ActivityRepository.saveChecklist({
        id: updated.id,
        workspaceId: activeList,
        title: updated.title,
        items: updated.items,
        createdAt: updated.createdAt || Date.now(),
        updatedAt: Date.now(),
        archived: updated.archived || false,
      });
      await loadChecklistsState();
      emitStateChange("checklists_changed", "tasks_screen");
    } catch (e) {
      console.warn("Failed to update checklist current", e);
    }
  }, [selectedList, loadChecklistsState]);

  const deleteChecklist = useCallback(async (id: string, folderId: string) => {
    try {
      const activeList = folderId || selectedList || "default";
      const existing = await ActivityRepository.getChecklist(id, activeList);
      if (existing) {
        await addToRecycleBin("checklist", existing, `${activeList}:${id}`);
      }
      await ActivityRepository.deleteChecklist(id, activeList);
      await loadChecklistsState();
      emitStateChange("checklists_changed", "tasks_screen");
    } catch (e) {
      console.warn("Failed to delete checklist current", e);
    }
  }, [selectedList, loadChecklistsState]);

  const toggleChecklistItem = useCallback(async (checklistId: string, itemId: string, folderId: string) => {
    try {
      const activeList = folderId || selectedList || "default";
      const existing = await ActivityRepository.getChecklist(checklistId, activeList);
      if (existing) {
        const nextItems = existing.items.map((i) =>
          i.id === itemId ? { ...i, completed: !i.completed } : i
        );
        await ActivityRepository.saveChecklist({
          ...existing,
          items: nextItems,
          updatedAt: Date.now(),
        });
        await loadChecklistsState();
        emitStateChange("checklists_changed", "tasks_screen");
      }
    } catch (e) {
      console.warn("Failed to toggle checklist item current", e);
    }
  }, [selectedList, loadChecklistsState]);

  return {
    checklists,
    setChecklists,
    loadChecklistsState,
    addChecklist,
    updateChecklist,
    deleteChecklist,
    toggleChecklistItem,
  };
}