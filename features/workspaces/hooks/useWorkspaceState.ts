import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { Workspace } from "@/shared/types/domain.types";
import { WorkspaceRepository } from "@/repositories";
import { addStateListener, emitStateChange } from "@/services/events/state-events";
import { globalLists, setGlobalLists } from "@/features/tasks/utils/task-formatting";

export function useWorkspaceState() {
  const params = useLocalSearchParams<{
    segment?: string;
    folderId?: string;
  }>();

  const [lists, setLists] = useState<Workspace[]>(() => globalLists || [{ id: "default", name: "My Pebbles" }]);
  const [selectedList, setSelectedList] = useState<string>("default");
  const [openedFolderId, setOpenedFolderId] = useState<string | null>(null);
  const [folderSegment, setFolderSegment] = useState<"tasks" | "habits" | "checklists" | "resources">("tasks");
  const [activeSegment, setActiveSegment] = useState<"tasks" | "habits" | "resources">("tasks");
  const [folderModalVisible, setFolderModalVisible] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [listsExpanded, setListsExpanded] = useState(false);

  useEffect(() => {
    setGlobalLists(lists);
  }, [lists]);

  useEffect(() => {
    if (params.segment === "tasks" || params.segment === "habits" || params.segment === "resources" || (params.segment as string) === "vault") {
      const seg = params.segment === "vault" ? "resources" : params.segment;
      setActiveSegment(seg as any);
      setFolderSegment(seg as any);
    }
  }, [params.segment]);

  useEffect(() => {
    if (params.folderId) {
      setOpenedFolderId(params.folderId);
      setSelectedList(params.folderId);
      emitStateChange("workspace_mode_changed", params.folderId);
    }
  }, [params.folderId]);

  const handleSelectWorkspace = useCallback((id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setOpenedFolderId(id);
    setSelectedList(id);
    setFolderSegment(id === "unassigned" ? "resources" : "tasks");

    if (id === "unassigned") {
      setActiveSegment("resources");
    }
    emitStateChange("workspace_mode_changed", id);
    emitStateChange("workspace_changed", "tasks_screen");
  }, []);

  const handleBackToWorkspaces = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setOpenedFolderId(null);
    emitStateChange("workspace_mode_changed", "null");
    emitStateChange("workspace_changed", "tasks_screen");
  }, []);

  useEffect(() => {
    if (!openedFolderId) return;
    setFolderSegment(openedFolderId === "unassigned" ? "resources" : "tasks");
  }, [openedFolderId, activeSegment]);

  const loadWorkspaces = useCallback(async () => {
    try {
      let currentLists: Workspace[] = [];
      const repositoryWorkspaces = await WorkspaceRepository.getWorkspaces();
      if (repositoryWorkspaces.length > 0) {
        currentLists = repositoryWorkspaces.map((f: any) => ({
          id: f.id,
          title: f.title || f.name,
          name: f.name || f.title,
          emoji: f.emoji || "📁",
          color: f.color || "#6366F1",
        }));
      }

      if (currentLists.length === 0) {
        currentLists = [
          { id: "default", name: "My Pebbles", emoji: "⚡", color: "#6366F1" },
          { id: "personal", name: "Personal", emoji: "🏠", color: "#10B981" },
          { id: "work", name: "Work", emoji: "💼", color: "#3B82F6" },
        ];
        await Promise.all(
          currentLists.map((l: any) =>
            WorkspaceRepository.saveWorkspace({
              id: l.id,
              name: l.name,
              emoji: l.emoji,
              color: l.color,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }),
          ),
        );
      }

      setLists(currentLists);
      const rawActive = await AsyncStorage.getItem("pebble:v1:active_workspace") || await AsyncStorage.getItem("pebble:core:active_workspace");
      if (rawActive && currentLists.some((l) => l.id === rawActive)) {
        setSelectedList(rawActive);
      }
    } catch (e) {
      console.warn("Failed to load workspaces", e);
    }
  }, []);

  useEffect(() => {
    loadWorkspaces();
    const unsub = addStateListener("workspace_changed", () => {
      loadWorkspaces();
    });
    return () => unsub();
  }, [loadWorkspaces]);

  const handleCreateWorkspace = useCallback(async (newWs: Workspace) => {
    await WorkspaceRepository.saveWorkspace(newWs);
    await loadWorkspaces();
    emitStateChange("workspace_changed", "tasks_screen");
  }, [loadWorkspaces]);

  const handleDeleteWorkspace = useCallback(async (id: string) => {
    await WorkspaceRepository.deleteWorkspace(id);
    if (selectedList === id) {
      setSelectedList("default");
    }
    if (openedFolderId === id) {
      setOpenedFolderId(null);
    }
    await loadWorkspaces();
    emitStateChange("workspace_changed", "tasks_screen");
  }, [selectedList, openedFolderId, loadWorkspaces]);

  return {
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
    handleSelectWorkspace,
    handleBackToWorkspaces,
    handleCreateWorkspace,
    handleDeleteWorkspace,
    loadWorkspaces,
  };
}