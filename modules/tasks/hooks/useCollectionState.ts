import { useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Collection, CollectionItem } from "../../types";
import { ResourceRepository } from "@/services/core/repositories";
import { addToRecycleBin } from "@/services/storage";
import { emitStateChange } from "@/services/stateEvents";
import { getDateKey, globalCollections, setGlobalCollections } from "../utils/taskUtils";

export function useCollectionState(
  selectedList: string,
  showToast: (msg: string) => void,
) {
  const [collections, setCollections] = useState<Record<string, Collection[]>>(() => globalCollections || {});

  // Sync global cache
  useState(() => {
    // This runs once on mount to initialize from global cache
  });

  const loadVaultState = useCallback(async () => {
    try {
      const activeList = selectedList || "default";

      // Load custom collections metadata mapping
      const metadataRaw = await AsyncStorage.getItem(`pebble:core:collections_metadata:${activeList}`);
      const collectionsMeta: { id: string; name: string; emoji: string }[] = metadataRaw ? JSON.parse(metadataRaw) : [];

      // If metadata is empty, add a default folder
      if (collectionsMeta.length === 0) {
        collectionsMeta.push({ id: "default_vault", name: "Vault", emoji: "📦" });
      }

      // Fetch all flat current resources
      const resourcesMap = await ResourceRepository.getResources(activeList);
      const repositoryResources = Object.values(resourcesMap);

      // Map resources to old CollectionItem format and group by tag
      const builtCollections: Collection[] = collectionsMeta.map((meta) => {
        const matchingItems: CollectionItem[] = repositoryResources
          .filter((r) => r.tags?.includes(`collection_${meta.id}`))
          .map((r) => ({
            id: r.id,
            type: r.resourceType as any,
            title: r.title,
            content: r.resourceType === "note" || r.resourceType === "idea" ? (r.payload as any).content : undefined,
            url: r.resourceType === "link" ? (r.payload as any).url : undefined,
            localUri: r.resourceType === "file" ? (r.payload as any).localUri : undefined,
            fileSize: r.resourceType === "file" ? (r.payload as any).fileSize : undefined,
            mimeType: r.resourceType === "file" ? (r.payload as any).mimeType : undefined,
            createdAt: r.createdAt,
            pinned: r.pinned || false,
            archived: r.archived || false,
            kind: r.resourceType === "idea" ? ("idea" as const) : undefined,
          }));

        // If default folder, also include resources without any collection tag
        if (meta.id === "default_vault") {
          const untagged = repositoryResources
            .filter((r) => !r.tags?.some((t) => t.startsWith("collection_")))
            .map((r) => ({
              id: r.id,
              type: r.resourceType as any,
              title: r.title,
              content: r.resourceType === "note" || r.resourceType === "idea" ? (r.payload as any).content : undefined,
              url: r.resourceType === "link" ? (r.payload as any).url : undefined,
              localUri: r.resourceType === "file" ? (r.payload as any).localUri : undefined,
              fileSize: r.resourceType === "file" ? (r.payload as any).fileSize : undefined,
              mimeType: r.resourceType === "file" ? (r.payload as any).mimeType : undefined,
              createdAt: r.createdAt,
              pinned: r.pinned || false,
              archived: r.archived || false,
              kind: r.resourceType === "idea" ? ("idea" as const) : undefined,
            }));
          matchingItems.push(...untagged);
        }

        return {
          id: meta.id,
          workspaceId: activeList,
          name: meta.name,
          emoji: meta.emoji,
          createdAt: Date.now(),
          items: matchingItems,
        };
      });

      setCollections((prev) => ({
        ...prev,
        [activeList]: builtCollections,
      }));
    } catch (e) {
      console.warn("Failed to load current collections", e);
    }
  }, [selectedList]);

  const createCollection = useCallback(async (workspaceId: string, name: string, emoji: string) => {
    try {
      const metadataRaw = await AsyncStorage.getItem(`pebble:core:collections_metadata:${workspaceId}`);
      const collectionsMeta: any[] = metadataRaw ? JSON.parse(metadataRaw) : [];

      const newId = `coll-${Date.now()}`;
      collectionsMeta.push({ id: newId, name, emoji });
      await AsyncStorage.setItem(`pebble:core:collections_metadata:${workspaceId}`, JSON.stringify(collectionsMeta));

      await loadVaultState();
      emitStateChange("vault_changed", "tasks_screen");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showToast(`✓ Collection "${name}" created`);
    } catch (e) {
      console.warn("Failed to create collection", e);
    }
  }, [loadVaultState, showToast]);

  const deleteCollection = useCallback(async (collectionId: string, workspaceId: string) => {
    try {
      const metadataRaw = await AsyncStorage.getItem(`pebble:core:collections_metadata:${workspaceId}`);
      const collectionsMeta: any[] = metadataRaw ? JSON.parse(metadataRaw) : [];
      const updatedMeta = collectionsMeta.filter((c) => c.id !== collectionId);
      await AsyncStorage.setItem(`pebble:core:collections_metadata:${workspaceId}`, JSON.stringify(updatedMeta));

      // Cascade delete resources in this collection
      const resourcesMap = await ResourceRepository.getResources(workspaceId);
      for (const res of Object.values(resourcesMap)) {
        if (res.tags?.includes(`collection_${collectionId}`)) {
          await ResourceRepository.deleteResource(res.id, workspaceId);
        }
      }

      await loadVaultState();
      emitStateChange("vault_changed", "tasks_screen");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      showToast("✓ Collection deleted");
    } catch (e) {
      console.warn("Failed to delete collection", e);
    }
  }, [loadVaultState, showToast]);

  const renameCollection = useCallback(async (collectionId: string, workspaceId: string, newName: string, newEmoji: string) => {
    try {
      const metadataRaw = await AsyncStorage.getItem(`pebble:core:collections_metadata:${workspaceId}`);
      const collectionsMeta: any[] = metadataRaw ? JSON.parse(metadataRaw) : [];
      const updatedMeta = collectionsMeta.map((c) =>
        c.id === collectionId ? { ...c, name: newName, emoji: newEmoji } : c
      );
      await AsyncStorage.setItem(`pebble:core:collections_metadata:${workspaceId}`, JSON.stringify(updatedMeta));

      await loadVaultState();
      emitStateChange("vault_changed", "tasks_screen");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      showToast("✓ Collection renamed");
    } catch (e) {
      console.warn("Failed to rename collection", e);
    }
  }, [loadVaultState, showToast]);

  const addCollectionItem = useCallback(async (
    workspaceId: string,
    collectionId: string,
    item: Omit<CollectionItem, "id" | "createdAt">
  ) => {
    try {
      const itemId = `item-${Date.now()}`;
      const payload = item.type === "link" ? { url: item.url || "" } :
                      item.type === "file" ? { localUri: item.localUri || "", mimeType: item.mimeType || "", fileSize: item.fileSize || 0 } :
                      { content: item.content || "" };

      await ResourceRepository.saveResource({
        id: itemId,
        workspaceId,
        title: item.title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        resourceType: item.type as any,
        payload,
        pinned: item.pinned || false,
        archived: item.archived || false,
        tags: [`collection_${collectionId}`],
      });

      await loadVaultState();
      emitStateChange("vault_changed", "tasks_screen");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showToast("✓ Reference added to collection");
    } catch (e) {
      console.warn("Failed to add collection item", e);
    }
  }, [loadVaultState, showToast]);

  const updateCollectionItem = useCallback(async (
    itemId: string,
    collectionId: string,
    workspaceId: string,
    updates: Partial<Pick<CollectionItem, "title" | "url" | "content">>
  ) => {
    try {
      const existing = await ResourceRepository.getResource(itemId, workspaceId);
      if (!existing) return;

      const payload = {
        ...existing.payload,
        content: updates.content !== undefined ? updates.content : (existing.payload as any).content,
        url: updates.url !== undefined ? updates.url : (existing.payload as any).url,
      };

      await ResourceRepository.saveResource({
        ...existing,
        title: updates.title !== undefined ? updates.title : existing.title,
        payload,
        updatedAt: Date.now(),
      });

      await loadVaultState();
      emitStateChange("vault_changed", "tasks_screen");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      showToast("✓ Resource updated");
    } catch (e) {
      console.warn("Failed to update collection item", e);
    }
  }, [loadVaultState, showToast]);

  const deleteCollectionItem = useCallback(async (itemId: string, collectionId: string, workspaceId: string) => {
    try {
      const existing = await ResourceRepository.getResource(itemId, workspaceId);
      if (existing) {
        await addToRecycleBin("collection_item", {
          id: existing.id,
          type: existing.resourceType,
          title: existing.title,
          content: (existing.payload as any).content,
          url: (existing.payload as any).url,
          createdAt: existing.createdAt,
        }, `${workspaceId}:${collectionId}`);
      }
      await ResourceRepository.deleteResource(itemId, workspaceId);
      await loadVaultState();
      emitStateChange("vault_changed", "tasks_screen");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      showToast("✓ Item deleted (Recycle Bin)");
    } catch (e) {
      console.warn("Failed to delete collection item", e);
    }
  }, [loadVaultState, showToast]);

  const toggleArchiveCollectionItem = useCallback(async (itemId: string, collectionId: string, workspaceId: string) => {
    try {
      const existing = await ResourceRepository.getResource(itemId, workspaceId);
      if (!existing) return;

      const nextArchived = !existing.archived;
      await ResourceRepository.saveResource({
        ...existing,
        archived: nextArchived,
        updatedAt: Date.now(),
      });

      await loadVaultState();
      emitStateChange("vault_changed", "tasks_screen");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      showToast(nextArchived ? "✓ Item archived" : "✓ Item unarchived");
    } catch (e) {
      console.warn("Failed to toggle archive on collection item", e);
    }
  }, [loadVaultState, showToast]);

  const togglePinCollectionItem = useCallback(async (itemId: string, collectionId: string, workspaceId: string) => {
    try {
      const existing = await ResourceRepository.getResource(itemId, workspaceId);
      if (!existing) return;

      const nextPinned = !existing.pinned;
      await ResourceRepository.saveResource({
        ...existing,
        pinned: nextPinned,
        updatedAt: Date.now(),
      });

      await loadVaultState();
      emitStateChange("vault_changed", "tasks_screen");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      showToast(nextPinned ? "✓ Pinned to Quick Access" : "✓ Removed from Quick Access");
    } catch (e) {
      console.warn("Failed to toggle pin on collection item", e);
    }
  }, [loadVaultState, showToast]);

  return {
    collections,
    setCollections,
    loadVaultState,
    createCollection,
    deleteCollection,
    renameCollection,
    addCollectionItem,
    updateCollectionItem,
    deleteCollectionItem,
    toggleArchiveCollectionItem,
    togglePinCollectionItem,
  };
}