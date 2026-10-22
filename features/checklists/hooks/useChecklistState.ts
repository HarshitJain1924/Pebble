import { useState, useCallback } from "react";
import { Checklist, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { ChecklistRepository } from "@/repositories";
import { generateId } from "@/shared/utils/id";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { addToRecycleBin } from "@/services/storage/storage.service";
import { emitStateChange } from "@/services/events/state-events";
import { globalChecklists } from "@/features/tasks/utils/task-formatting";
import { getTodayDateKey } from "@/shared/utils/date-key";
import { getActiveOccurrenceDateKey } from "@/services/scheduling/recurrence.service";

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
        priority: "none",
        items: itemTitles.map((it, idx) => ({
          id: `checklist-item-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
          title: it,
          completed: false,
        })),
        revision: 1,
        lifecycleGeneration: 1,
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
        priority: updated.priority,
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

  /**
   * Toggle one checklist item from the Workspace list.
   *
   * Recurring checklists are completed per occurrence through the canonical
   * `toggleChecklistItem` command (never by writing the master `items` array).
   * Non-recurring checklists keep their existing whole-entity update behavior.
   */
  const toggleChecklistItem = useCallback(async (checklist: Checklist, itemId: string) => {
    try {
      const activeList = checklist.workspaceId || selectedWorkspaceId || INBOX_WORKSPACE_ID;

      if (checklist.recurrence) {
        const dateKey = getActiveOccurrenceDateKey(checklist, getTodayDateKey());
        const result = await EntityCommandService.toggleChecklistItem(
          checklist.id,
          itemId,
          activeList,
          dateKey,
          {
            source: "tasks_screen",
            skipEvents: true, // We emit it below after loading state
            skipAnalytics: true,
          },
        );
        if (!result) return;
      } else {
        const nextItems = checklist.items.map((item) =>
          item.id === itemId
            ? {
                ...item,
                completed: !item.completed,
                completedAt: !item.completed ? Date.now() : undefined,
              }
            : item,
        );
        await EntityCommandService.updateChecklist(
          checklist.id,
          activeList,
          { items: nextItems },
          { skipEvents: true, skipAnalytics: true },
        );
      }

      await loadChecklistsState();
      emitStateChange("checklists_changed", "tasks_screen");
    } catch (e) {
      console.warn("Failed to toggle checklist item current", e);
    }
  }, [selectedWorkspaceId, loadChecklistsState]);

  /**
   * Complete/uncomplete every item from the Workspace list. Recurring
   * checklists fan out to the canonical per-item command so only the resolved
   * occurrence changes; non-recurring checklists keep the existing single write.
   */
  const toggleChecklistAllItems = useCallback(async (checklist: Checklist) => {
    try {
      const activeList = checklist.workspaceId || selectedWorkspaceId || INBOX_WORKSPACE_ID;

      if (checklist.recurrence) {
        const dateKey = getActiveOccurrenceDateKey(checklist, getTodayDateKey());
        const completedIds = new Set(
          checklist.occurrenceHistory?.[dateKey || ""]?.completedItemIds || [],
        );
        const allCompleted =
          checklist.items.length > 0 &&
          checklist.items.every((item) => completedIds.has(item.id));

        for (const item of checklist.items) {
          const isCompleted = completedIds.has(item.id);
          if (isCompleted === !allCompleted) continue;
          await EntityCommandService.toggleChecklistItem(
            checklist.id,
            item.id,
            activeList,
            dateKey,
            { skipEvents: true, skipAnalytics: true },
          );
        }
      } else {
        const allCompleted =
          checklist.items.length > 0 && checklist.items.every((item) => item.completed);
        const nextItems = checklist.items.map((item) => ({
          ...item,
          completed: !allCompleted,
          completedAt: !allCompleted ? Date.now() : undefined,
        }));
        await EntityCommandService.updateChecklist(
          checklist.id,
          activeList,
          { items: nextItems },
          { skipEvents: true, skipAnalytics: true },
        );
      }

      await loadChecklistsState();
      emitStateChange("checklists_changed", "tasks_screen");
    } catch (e) {
      console.warn("Failed to toggle all checklist items", e);
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

  const toggleArchiveChecklist = useCallback(async (id: string, workspaceId?: string) => {
    try {
      const activeList = workspaceId || selectedWorkspaceId || INBOX_WORKSPACE_ID;
      const map = await ChecklistRepository.getChecklists(activeList);
      const checklist = map[id];
      if (!checklist) return;

      const isArchived = !!checklist.archivedAt;

      await EntityCommandService.updateChecklist(id, activeList, {
        archivedAt: isArchived ? undefined : Date.now(),
      }, { skipEvents: true, skipAnalytics: true });

      await loadChecklistsState();
      emitStateChange("checklists_changed", "tasks_screen");
    } catch (e) {
      console.warn("Failed to toggle archive checklist current", e);
    }
  }, [selectedWorkspaceId, loadChecklistsState]);

  return {
    checklists,
    setChecklists,
    loadChecklistsState,
    addChecklist,
    updateChecklist,
    deleteChecklist,
    toggleArchiveChecklist,
    toggleChecklistItem,
    toggleChecklistAllItems,
    addChecklistItem,
    deleteChecklistItem,
  };
}