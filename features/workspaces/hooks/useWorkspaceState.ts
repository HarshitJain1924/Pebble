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
    workspaceId?: string;
  }>();

  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => globalLists || [{ id: "default", name: "My Pebbles" }]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("default");
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [workspaceSegment, setWorkspaceSegment] = useState<"tasks" | "habits" | "checklists" | "resources">("tasks");
  const [activeSegment, setActiveSegment] = useState<"tasks" | "habits" | "resources">("tasks");
  const [workspaceModalVisible, setWorkspaceModalVisible] = useState(false);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [listsExpanded, setListsExpanded] = useState(false);

  useEffect(() => {
    setGlobalLists(workspaces);
  }, [workspaces]);

  useEffect(() => {
    if (params.segment === "tasks" || params.segment === "habits" || params.segment === "resources" || (params.segment as string) === "vault") {
      const seg = params.segment === "vault" ? "resources" : params.segment;
      setActiveSegment(seg as any);
      setWorkspaceSegment(seg as any);
    }
  }, [params.segment]);

  useEffect(() => {
    const unsub = addStateListener("workspace_segment_request", (seg) => {
      if (seg) {
        const normalized = (seg === "vault" ? "resources" : seg) as "tasks" | "habits" | "checklists" | "resources";
        setWorkspaceSegment(normalized);
        if (normalized === "tasks" || normalized === "habits" || normalized === "resources") {
          setActiveSegment(normalized);
        }
        emitStateChange("workspace_segment_changed", normalized);
      }
    });
    return unsub;
  }, []);

  const targetWsId = params.workspaceId || params.folderId;

  useEffect(() => {
    if (targetWsId) {
      setActiveWorkspaceId(targetWsId);
      setSelectedWorkspaceId(targetWsId);
      AsyncStorage.setItem("pebble:v1:active_workspace", targetWsId).catch(() => {});
      emitStateChange("workspace_mode_changed", targetWsId);
    }
  }, [targetWsId]);

  const handleSelectWorkspace = useCallback((id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setActiveWorkspaceId(id);
    setSelectedWorkspaceId(id);
    setWorkspaceSegment(id === "unassigned" ? "resources" : "tasks");

    if (id === "unassigned") {
      setActiveSegment("resources");
    }
    AsyncStorage.setItem("pebble:v1:active_workspace", id).catch(() => {});
    emitStateChange("workspace_mode_changed", id);
    emitStateChange("workspace_changed", "tasks_screen");
  }, []);

  const handleBackToWorkspaces = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setActiveWorkspaceId(null);
    AsyncStorage.removeItem("pebble:v1:active_workspace").catch(() => {});
    emitStateChange("workspace_mode_changed", "null");
    emitStateChange("workspace_changed", "tasks_screen");
  }, []);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    setWorkspaceSegment(activeWorkspaceId === "unassigned" ? "resources" : "tasks");
  }, [activeWorkspaceId]);

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

      setWorkspaces(currentLists);
      const rawActive = await AsyncStorage.getItem("pebble:v1:active_workspace") || await AsyncStorage.getItem("pebble:core:active_workspace");
      if (rawActive && rawActive !== "null" && currentLists.some((l) => l.id === rawActive)) {
        setSelectedWorkspaceId(rawActive);
        setActiveWorkspaceId(rawActive);
        emitStateChange("workspace_mode_changed", rawActive);
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
    if (selectedWorkspaceId === id) {
      setSelectedWorkspaceId("default");
    }
    if (activeWorkspaceId === id) {
      setActiveWorkspaceId(null);
    }
    await loadWorkspaces();
    emitStateChange("workspace_changed", "tasks_screen");
  }, [selectedWorkspaceId, activeWorkspaceId, loadWorkspaces]);

  return {
    workspaces,
    setWorkspaces,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    activeWorkspaceId,
    setActiveWorkspaceId,
    workspaceSegment,
    setWorkspaceSegment,
    activeSegment,
    setActiveSegment,
    workspaceModalVisible,
    setWorkspaceModalVisible,
    editingWorkspaceId,
    setEditingWorkspaceId,
    listsExpanded,
    setListsExpanded,
    handleSelectWorkspace,
    handleBackToWorkspaces,
    handleCreateWorkspace,
    handleDeleteWorkspace,
    loadWorkspaces,
    // Canonical aliases for backwards compatibility across UI callers
    lists: workspaces,
    setLists: setWorkspaces,
    selectedList: selectedWorkspaceId,
    setSelectedList: setSelectedWorkspaceId,
    openedFolderId: activeWorkspaceId,
    setOpenedFolderId: setActiveWorkspaceId,
    folderSegment: workspaceSegment,
    setFolderSegment: setWorkspaceSegment,
    folderModalVisible: workspaceModalVisible,
    setFolderModalVisible: setWorkspaceModalVisible,
    editingFolderId: editingWorkspaceId,
    setEditingFolderId: setEditingWorkspaceId,
  };
}