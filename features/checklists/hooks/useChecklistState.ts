import { useState, useCallback } from "react";
import { Checklist, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { ChecklistRepository } from "@/repositories";
import { generateId } from "@/shared/utils/id";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { addToRecycleBin } from "@/services/storage/storage.service";
import { emitStateChange } from "@/services/events/state-events";
import { globalChecklists } from "@/features/tasks/utils/task-formatting";

export function useChecklistState(selectedWorkspaceId: string) {
  const [checklists, setChecklists] = useState<Record<string, Checklist[]>>(() => globalChecklists || {});

  const loadChecklistsState = useCallback(async () => {
    try {
      const activeList = selectedWorkspaceId || INBOX_WORKSPACE_ID;
      const checklistsMap = await ChecklistRepository.getChecklists(activeList);
      const activeChecklists = Object.values(checklistsMap);
      setChecklists((prev) => ({
        ...prev,
        [activeList]: activeChecklists,
      }));
    } catch (e) {
      console.warn("Failed to load current checklists", e);
    }
  }, [selectedWorkspaceId]);

  const addChecklist = useCallback(async (title: string, itemTitles: string[], workspaceId?: string) => {
    try {
      const activeList = workspaceId || selectedWorkspaceId || INBOX_WORKSPACE_ID;
      const newChecklist: Checklist = {
        id: generateId("checklist-"),
        workspaceId: activeList,
        title,
        items: itemTitles.map((it, idx) => ({
          id: `checklist-item-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
          title: it,
          completed: false,
        })),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await EntityCommandService.createChecklist(newChecklist, activeList, {
        skipEvents: true,
        skipAnalytics: true,
      });
      await loadChecklistsState();
      emitStateChange("checklists_changed", "tasks_screen");
    } catch (e) {
      console.warn("Failed to add checklist current", e);
    }
  }, [selectedWorkspaceId, loadChecklistsState]);

  const updateChecklist = useCallback(async (updated: Checklist) => {
    try {
      const activeList = updated.workspaceId || selectedWorkspaceId || INBOX_WORKSPACE_ID;
      await EntityCommandService.updateChecklist(updated.id, activeList, {
        title: updated.title,
        items: updated.items,
        archivedAt: updated.archivedAt,
      }, { skipEvents: true, skipAnalytics: true });
      await loadChecklistsState();
      emitStateChange("checklists_changed", "tasks_screen");
    } catch (e) {
      console.warn("Failed to update checklist current", e);
    }
  }, [selectedWorkspaceId, loadChecklistsState]);

  const deleteChecklist = useCallback(async (id: string, workspaceId?: string) => {
    try {
      const activeList = workspaceId || selectedWorkspaceId || INBOX_WORKSPACE_ID;
      await EntityCommandService.recycleChecklist(id, activeList, {
        source: "tasks_screen",
        skipEvents: true,
      });
      await loadChecklistsState();
      emitStateChange("checklists_changed", "tasks_screen");
    } catch (e) {
      console.warn("Failed to delete checklist current", e);
    }
  }, [selectedWorkspaceId, loadChecklistsState]);

  const toggleChecklistItem = useCallback(async (checklistId: string, itemId: string, workspaceId?: string) => {
    try {
      const activeList = workspaceId || selectedWorkspaceId || INBOX_WORKSPACE_ID;
      
      const result = await EntityCommandService.toggleChecklistItem(checklistId, itemId, activeList, {
        source: "tasks_screen",
        skipEvents: true, // We emit it below after loading state
        skipAnalytics: true,
      });

      if (result) {
        await loadChecklistsState();
        emitStateChange("checklists_changed", "tasks_screen");
      }
    } catch (e) {
      console.warn("Failed to toggle checklist item current", e);
    }
  }, [selectedWorkspaceId, loadChecklistsState]);

  const addChecklistItem = useCallback(async (checklistId: string, itemTitle: string, workspaceId?: string) => {
    try {
      const activeList = workspaceId || selectedWorkspaceId || INBOX_WORKSPACE_ID;
      const result = await EntityCommandService.addChecklistItem(checklistId, itemTitle, activeList, {
        source: "tasks_screen",
        skipEvents: true,
        skipAnalytics: true,
      });

      if (result) {
        await loadChecklistsState();
        emitStateChange("checklists_changed", "tasks_screen");
      }
    } catch (e) {
      console.warn("Failed to add checklist item current", e);
    }
  }, [selectedWorkspaceId, loadChecklistsState]);

  const deleteChecklistItem = useCallback(async (checklistId: string, itemId: string, workspaceId?: string) => {
    try {
      const activeList = workspaceId || selectedWorkspaceId || INBOX_WORKSPACE_ID;
      const result = await EntityCommandService.deleteChecklistItem(checklistId, itemId, activeList, {
        source: "tasks_screen",
        skipEvents: true,
        skipAnalytics: true,
      });

      if (result) {
        await loadChecklistsState();
        emitStateChange("checklists_changed", "tasks_screen");
      }
    } catch (e) {
      console.warn("Failed to delete checklist item current", e);
    }
  }, [selectedWorkspaceId, loadChecklistsState]);

  return {
    checklists,
    setChecklists,
    loadChecklistsState,
    addChecklist,
    updateChecklist,
    deleteChecklist,
    toggleChecklistItem,
    addChecklistItem,
    deleteChecklistItem,
  };
}