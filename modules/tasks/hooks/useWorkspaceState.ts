import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { TaskList } from "../../types";
import { FolderRepository } from "@/services/core/repositories";
import { addStateListener, emitStateChange } from "@/services/stateEvents";
import { getDateKey, initialTodos, globalLists, setGlobalLists } from "../utils/taskUtils";

export function useWorkspaceState() {
  const params = useLocalSearchParams<{
    segment?: string;
    folderId?: string;
  }>();

  const [lists, setLists] = useState<TaskList[]>(() => globalLists || [{ id: "default", name: "My Pebbles" }]);
  const [selectedList, setSelectedList] = useState<string>("default");
  const [openedFolderId, setOpenedFolderId] = useState<string | null>(null);
  const [folderSegment, setFolderSegment] = useState<"tasks" | "habits" | "checklists" | "vault">("tasks");
  const [activeSegment, setActiveSegment] = useState<"tasks" | "habits" | "vault">("tasks");
  const [folderModalVisible, setFolderModalVisible] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [listsExpanded, setListsExpanded] = useState(false);

  // Sync global cache
  useEffect(() => {
    setGlobalLists(lists);
  }, [lists]);

  // Emit workspace mode changes
  useEffect(() => {
    emitStateChange("workspace_mode_changed", openedFolderId || "null");
  }, [openedFolderId]);

  useEffect(() => {
    emitStateChange("workspace_segment_changed", folderSegment);
  }, [folderSegment]);

  // Listen for external segment requests
  useEffect(() => {
    const unsub = addStateListener("workspace_segment_request", (seg) => {
      if (seg && ["tasks", "habits", "checklists", "vault"].includes(seg)) {
        setFolderSegment(seg as any);
      }
    });
    return unsub;
  }, []);

  // Sync folder segment from params when a folder is opened
  useEffect(() => {
    if (openedFolderId !== null) {
      if (params.segment && ["tasks", "habits", "checklists", "vault"].includes(params.segment)) {
        setFolderSegment(params.segment as any);
      } else {
        setFolderSegment("tasks");
      }
    }
  }, [openedFolderId, params.segment]);

  // Sync from URL params
  useEffect(() => {
    if (params.segment === "habits") {
      setActiveSegment("habits");
      setFolderSegment("habits");
    } else if (params.segment === "tasks") {
      setActiveSegment("tasks");
      setFolderSegment("tasks");
    } else if (params.segment === "checklists") {
      setFolderSegment("checklists");
    } else if (params.segment === "vault") {
      setFolderSegment("vault");
    }
  }, [params.segment]);

  useEffect(() => {
    if (params.folderId) {
      setOpenedFolderId(params.folderId);
      setSelectedList(params.folderId);
      setActiveSegment("tasks");
    }
  }, [params.folderId]);

  // Reset search/bulk when folder or segment changes
  useEffect(() => {
    setFolderSegment(openedFolderId === "unassigned" ? "vault" : "tasks");
  }, [openedFolderId, activeSegment]);

  const loadWorkspaces = useCallback(async () => {
    try {
      let currentLists: TaskList[] = [];
      const repositoryFolders = await FolderRepository.getFolders();
      if (repositoryFolders.length > 0) {
        currentLists = repositoryFolders.map((f: any) => ({
          id: f.id,
          name: f.name,
          emoji: f.emoji || "📁",
          color: f.color || "#6366F1",
        }));
      }

      // Fallback: migrate from legacy pebble:core:workspaces key
      if (currentLists.length === 0) {
        const rawLists = await AsyncStorage.getItem("pebble:core:workspaces");
        if (rawLists) {
          const legacyLists: TaskList[] = JSON.parse(rawLists);
          if (legacyLists.length > 0) {
            currentLists = legacyLists;
            await Promise.all(
              legacyLists.map((l) =>
                FolderRepository.saveFolder({
                  id: l.id,
                  name: l.name,
                  emoji: l.emoji || "📁",
                  color: l.color || "#6366F1",
                  sortOrder: 0,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                }),
              ),
            );
          }
        }
      }

      if (currentLists.length === 0) {
        currentLists = [{ id: "default", name: "My Pebbles", emoji: "📋", color: "#6366F1" }];
      }

      const rawActive = await AsyncStorage.getItem("pebble:core:active_workspace");
      const activeList = openedFolderId || rawActive || currentLists[0]?.id || "default";

      setLists(currentLists);
      setSelectedList(activeList);

      return { currentLists, activeList };
    } catch (e) {
      console.warn("Failed to load workspaces", e);
      return { currentLists: [{ id: "default", name: "My Pebbles" }], activeList: "default" };
    }
  }, [openedFolderId]);

  const handleCreateWorkspaceFromNLP = useCallback((name: string): string => {
    const newId = `list-${Date.now()}`;
    const newWorkspace: TaskList = {
      id: newId,
      name,
      emoji: "📂",
      icon: "grid",
      iconType: "emoji" as const,
      color: "#6366F1",
      createdAt: Date.now(),
    };
    setLists((prev) => [...prev, newWorkspace]);
    setSelectedList(newId);
    setOpenedFolderId(newId);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    return newId;
  }, []);

  return {
    // State
    lists,
    setLists,
    selectedList,
    setSelectedList,
    openedFolderId,
    setOpenedFolderId,
    folderSegment,
    setFolderSegment,
    activeSegment,
    setActiveSegment,
    folderModalVisible,
    setFolderModalVisible,
    editingFolderId,
    setEditingFolderId,
    listsExpanded,
    setListsExpanded,

    // Functions
    loadWorkspaces,
    handleCreateWorkspaceFromNLP,
  };
}