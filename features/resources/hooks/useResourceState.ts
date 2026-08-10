import { useState, useCallback } from "react";
import * as Haptics from "expo-haptics";
import { Resource, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { generateId } from "@/shared/utils/id";
import { ResourceRepository } from "@/repositories";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { addToRecycleBin } from "@/services/storage/storage.service";
import { emitStateChange } from "@/services/events/state-events";
import { globalResources, setGlobalResources } from "@/features/tasks/utils/task-formatting";

/**
 * Canonical hook for Resource domain state management.
 */
export function useResourceState(
  selectedWorkspaceId: string,
  showToast: (msg: string) => void,
) {
  const [resources, setResources] = useState<Record<string, Resource[]>>(() => globalResources || {});

  const loadResourcesState = useCallback(async (targetWorkspaceId?: string) => {
    try {
      const activeList = targetWorkspaceId || selectedWorkspaceId || INBOX_WORKSPACE_ID;

      const resourcesMap = await ResourceRepository.getResources(activeList);
      const list: Resource[] = Object.values(resourcesMap);

      setResources((prev) => {
        const next = { ...prev, [activeList]: list };
        setGlobalResources(next);
        return next;
      });
      return list;
    } catch (e) {
      console.warn("Failed to load resources state", e);
      return [];
    }
  }, [selectedWorkspaceId]);

  const createResource = useCallback(async (
    workspaceId: string,
    item: Omit<Resource, "id" | "createdAt">
  ) => {
    try {
      const resourceId = generateId("res-");
      const wsId = workspaceId || selectedWorkspaceId || INBOX_WORKSPACE_ID;

      const newResource: Resource = {
        id: resourceId,
        workspaceId: wsId,
        type: item.type || "note",
        title: item.title,
        body: item.body || undefined,
        tags: item.tags || undefined,
        attachments: item.attachments || undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await EntityCommandService.createResource(newResource, wsId, {
        skipEvents: true,
        skipAnalytics: true,
      });
      await loadResourcesState(wsId);
      emitStateChange("resources_changed", "tasks_screen");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showToast(`✓ Created "${item.title}"`);
    } catch (e) {
      console.warn("Failed to create resource", e);
    }
  }, [selectedWorkspaceId, loadResourcesState, showToast]);

  const updateResource = useCallback(async (
    resourceId: string,
    workspaceId: string,
    updates: Partial<Resource>
  ) => {
    try {
      const wsId = workspaceId || selectedWorkspaceId || INBOX_WORKSPACE_ID;
      const existing = await ResourceRepository.getResource(resourceId, wsId);
      if (!existing) return;

      const updatedResource: Resource = {
        ...existing,
        ...updates,
        updatedAt: Date.now(),
      };

      await ResourceRepository.saveResource(updatedResource);
      await loadResourcesState(wsId);
      emitStateChange("resources_changed", "tasks_screen");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      showToast("✓ Resource updated");
    } catch (e) {
      console.warn("Failed to update resource", e);
    }
  }, [selectedWorkspaceId, loadResourcesState, showToast]);

  const deleteResource = useCallback(async (resourceId: string, workspaceId: string) => {
    try {
      const wsId = workspaceId || selectedWorkspaceId || INBOX_WORKSPACE_ID;
      await EntityCommandService.recycleResource(resourceId, wsId, {
        source: "tasks_screen",
        skipEvents: true,
      });
      await loadResourcesState(wsId);
      emitStateChange("resources_changed", "tasks_screen");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      showToast("✓ Resource deleted (Recycle Bin)");
    } catch (e) {
      console.warn("Failed to delete resource", e);
    }
  }, [selectedWorkspaceId, loadResourcesState, showToast]);

  const toggleArchiveResource = useCallback(async (resourceId: string, workspaceId: string) => {
    try {
      const wsId = workspaceId || selectedWorkspaceId || INBOX_WORKSPACE_ID;
      const existing = await ResourceRepository.getResource(resourceId, wsId);
      if (!existing) return;

      const isArchived = !!existing.archivedAt;
      const updatedResource: Resource = {
        ...existing,
        archivedAt: isArchived ? undefined : Date.now(),
        updatedAt: Date.now(),
      };
      await ResourceRepository.saveResource(updatedResource);

      await loadResourcesState(wsId);
      emitStateChange("resources_changed", "tasks_screen");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      showToast(isArchived ? "✓ Resource unarchived" : "✓ Resource archived");
    } catch (e) {
      console.warn("Failed to toggle archive resource", e);
    }
  }, [selectedWorkspaceId, loadResourcesState, showToast]);

  return {
    resources,
    loadResourcesState,
    createResource,
    updateResource,
    deleteResource,
    toggleArchiveResource,
  };
}
