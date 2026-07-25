import { useState, useCallback } from "react";
import * as Haptics from "expo-haptics";
import { Resource } from "@/shared/types/domain.types";
import { ResourceRepository } from "@/repositories";
import { addToRecycleBin } from "@/services/storage/storage.service";
import { emitStateChange } from "@/services/events/state-events";
import { globalResources, setGlobalResources } from "@/features/tasks/utils/task-formatting";

/**
 * Canonical hook for Resource domain state management (Pebble V3 Flat Database).
 */
export function useResourceState(
  selectedList: string,
  showToast: (msg: string) => void,
) {
  const [resources, setResources] = useState<Record<string, Resource[]>>(() => globalResources || {});

  const loadResourcesState = useCallback(async (targetWorkspaceId?: string) => {
    try {
      const activeList = targetWorkspaceId || selectedList || "default";

      // Fetch all flat current resources from repository
      const resourcesMap = await ResourceRepository.getResources(activeList);
      const list: Resource[] = Object.values(resourcesMap).map((r: any) => ({
        id: r.id,
        workspaceId: r.workspaceId || r.folderId || activeList,
        type: (r.resourceType || r.type || "note") as any,
        kind: r.kind || (r.resourceType === "idea" || r.type === "idea" ? "idea" : undefined),
        title: r.title,
        content: r.content !== undefined ? r.content : (r.payload?.content || r.body?.content || undefined),
        url: r.url !== undefined ? r.url : (r.payload?.url || r.body?.url || undefined),
        mediaUri: r.mediaUri,
        previewImageUrl: r.previewImageUrl,
        archived: r.archived || false,
        pinned: r.pinned || false,
        linkedItemIds: r.linkedItemIds || [],
        tags: r.tags || [],
        createdAt: r.createdAt || Date.now(),
        updatedAt: r.updatedAt || Date.now(),
        fileName: r.fileName || r.payload?.fileName || r.body?.fileName,
        fileSize: r.fileSize || r.payload?.fileSize || r.body?.fileSize,
        mimeType: r.mimeType || r.payload?.mimeType || r.body?.mimeType,
        localUri: r.localUri || r.payload?.localUri || r.body?.localUri,
      }));

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
  }, [selectedList]);

  const createResource = useCallback(async (
    workspaceId: string,
    item: Omit<Resource, "id" | "createdAt">
  ) => {
    try {
      const resourceId = `res-${Date.now()}`;
      const wsId = workspaceId || selectedList || "default";
      const payload = item.type === "link" ? { url: item.url || "" } :
                      item.type === "file" ? { localUri: item.localUri || "", mimeType: item.mimeType || "", fileSize: item.fileSize || 0, fileName: item.fileName || item.title } :
                      { content: item.content || "" };

      await ResourceRepository.saveResource({
        id: resourceId,
        workspaceId: wsId,
        folderId: wsId,
        title: item.title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        resourceType: item.type as any,
        payload,
        pinned: item.pinned || false,
        archived: item.archived || false,
        tags: item.tags || [],
        linkedItemIds: item.linkedItemIds || [],
      });

      await loadResourcesState(wsId);
      emitStateChange("resources_changed", "tasks_screen");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showToast(`✓ Created "${item.title}"`);
    } catch (e) {
      console.warn("Failed to create resource", e);
    }
  }, [selectedList, loadResourcesState, showToast]);

  const updateResource = useCallback(async (
    resourceId: string,
    workspaceId: string,
    updates: Partial<Resource>
  ) => {
    try {
      const wsId = workspaceId || selectedList || "default";
      const existing = await ResourceRepository.getResource(resourceId, wsId);
      if (!existing) return;

      const payload = {
        ...existing.payload,
        content: updates.content !== undefined ? updates.content : (existing.payload as any)?.content,
        url: updates.url !== undefined ? updates.url : (existing.payload as any)?.url,
      };

      await ResourceRepository.saveResource({
        ...existing,
        title: updates.title !== undefined ? updates.title : existing.title,
        payload,
        pinned: updates.pinned !== undefined ? updates.pinned : existing.pinned,
        archived: updates.archived !== undefined ? updates.archived : existing.archived,
        updatedAt: Date.now(),
      });

      await loadResourcesState(wsId);
      emitStateChange("resources_changed", "tasks_screen");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      showToast("✓ Resource updated");
    } catch (e) {
      console.warn("Failed to update resource", e);
    }
  }, [selectedList, loadResourcesState, showToast]);

  const deleteResource = useCallback(async (resourceId: string, workspaceId: string) => {
    try {
      const wsId = workspaceId || selectedList || "default";
      const existing = await ResourceRepository.getResource(resourceId, wsId);
      if (existing) {
        await addToRecycleBin("resource" as any, {
          id: existing.id,
          type: existing.resourceType,
          title: existing.title,
          content: (existing.payload as any)?.content,
          url: (existing.payload as any)?.url,
          createdAt: existing.createdAt,
        }, wsId);
      }
      await ResourceRepository.deleteResource(resourceId, wsId);
      await loadResourcesState(wsId);
      emitStateChange("resources_changed", "tasks_screen");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      showToast("✓ Resource deleted (Recycle Bin)");
    } catch (e) {
      console.warn("Failed to delete resource", e);
    }
  }, [selectedList, loadResourcesState, showToast]);

  const toggleArchiveResource = useCallback(async (resourceId: string, workspaceId: string) => {
    try {
      const wsId = workspaceId || selectedList || "default";
      const existing = await ResourceRepository.getResource(resourceId, wsId);
      if (!existing) return;

      const nextArchived = !existing.archived;
      await ResourceRepository.saveResource({
        ...existing,
        archived: nextArchived,
        updatedAt: Date.now(),
      });

      await loadResourcesState(wsId);
      emitStateChange("resources_changed", "tasks_screen");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      showToast(nextArchived ? "✓ Resource archived" : "✓ Resource unarchived");
    } catch (e) {
      console.warn("Failed to toggle archive resource", e);
    }
  }, [selectedList, loadResourcesState, showToast]);

  const togglePinResource = useCallback(async (resourceId: string, workspaceId: string) => {
    try {
      const wsId = workspaceId || selectedList || "default";
      const existing = await ResourceRepository.getResource(resourceId, wsId);
      if (!existing) return;

      const nextPinned = !existing.pinned;
      await ResourceRepository.saveResource({
        ...existing,
        pinned: nextPinned,
        updatedAt: Date.now(),
      });

      await loadResourcesState(wsId);
      emitStateChange("resources_changed", "tasks_screen");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      showToast(nextPinned ? "✓ Pinned to Quick Access" : "✓ Removed from Quick Access");
    } catch (e) {
      console.warn("Failed to toggle pin resource", e);
    }
  }, [selectedList, loadResourcesState, showToast]);

  return {
    resources,
    setResources,
    loadResourcesState,
    createResource,
    updateResource,
    deleteResource,
    toggleArchiveResource,
    togglePinResource,
  };
}
