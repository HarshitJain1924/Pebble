import {
  globalLists,
  setGlobalLists,
} from "@/features/tasks/utils/task-formatting";
import { UiStateRepository, WorkspaceRepository } from "@/repositories";
import {
  addStateListener,
  emitStateChange,
} from "@/services/events/state-events";
import { Workspace } from "@/shared/types/domain.types";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";

export function useWorkspaceState() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    segment?: string;
    folderId?: string;
    workspaceId?: string;
  }>();

  const [workspaces, setWorkspaces] = useState<Workspace[]>(
    () => globalLists || [],
  );
  const [isWorkspacesHydrated, setIsWorkspacesHydrated] = useState<boolean>(
    () => globalLists !== null,
  );
  const [selectedWorkspaceId, setSelectedWorkspaceId] =
    useState<string>("default");
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    null,
  );
  const [workspaceSegment, setWorkspaceSegment] = useState<
    "tasks" | "habits" | "checklists" | "resources"
  >("tasks");
  const [activeSegment, setActiveSegment] = useState<
    "tasks" | "habits" | "resources"
  >("tasks");
  const [workspaceModalVisible, setWorkspaceModalVisible] = useState(false);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(
    null,
  );
  const [listsExpanded, setListsExpanded] = useState(false);

  useEffect(() => {
    setGlobalLists(workspaces);
  }, [workspaces]);

  useEffect(() => {
    if (
      params.segment === "tasks" ||
      params.segment === "habits" ||
      params.segment === "resources" ||
      (params.segment as string) === "vault"
    ) {
      const seg = params.segment === "vault" ? "resources" : params.segment;
      setActiveSegment(seg as any);
      setWorkspaceSegment(seg as any);
    }
  }, [params.segment]);

  useEffect(() => {
    const unsub = addStateListener("workspace_segment_request", (seg) => {
      if (seg) {
        const normalized = (seg === "vault" ? "resources" : seg) as
          | "tasks"
          | "habits"
          | "checklists"
          | "resources";
        setWorkspaceSegment(normalized);
        if (
          normalized === "tasks" ||
          normalized === "habits" ||
          normalized === "resources"
        ) {
          setActiveSegment(normalized);
        }
        emitStateChange("workspace_segment_changed", normalized);
      }
    });
    return unsub;
  }, []);

  const targetWsId = params.workspaceId || params.folderId;

  useEffect(() => {
    if (targetWsId && targetWsId !== "null") {
      setActiveWorkspaceId(targetWsId);
      setSelectedWorkspaceId(targetWsId);
      UiStateRepository.saveUiState({ activeWorkspaceId: targetWsId }).catch(
        () => {},
      );
      emitStateChange("workspace_mode_changed", targetWsId);
    }
  }, [targetWsId]);

  const handleSelectWorkspace = useCallback((id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setActiveWorkspaceId(id);
    setSelectedWorkspaceId(id);
    setWorkspaceSegment("tasks");
    UiStateRepository.saveUiState({ activeWorkspaceId: id }).catch(() => {});
    emitStateChange("workspace_mode_changed", id);
    emitStateChange("workspace_changed", "tasks_screen");
  }, []);

  const handleBackToWorkspaces = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setActiveWorkspaceId(null);
    UiStateRepository.saveUiState({ activeWorkspaceId: "default" }).catch(
      () => {},
    );
    try {
      router.setParams({ workspaceId: undefined, folderId: undefined });
    } catch (e) {}
    emitStateChange("workspace_mode_changed", "null");
  }, [router]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    setWorkspaceSegment("tasks");
  }, [activeWorkspaceId]);

  const loadWorkspaces = useCallback(async (): Promise<Workspace[]> => {
    try {
      let currentLists: Workspace[] = [];
      const repositoryWorkspaces = await WorkspaceRepository.getWorkspaces();
      if (repositoryWorkspaces.length > 0) {
        currentLists = repositoryWorkspaces.map((f: any) => ({
          id: f.id,
          name: f.name || f.title || "Untitled Workspace",
          emoji: f.emoji || "📁",
          color: f.color || "#6366F1",
          createdAt: f.createdAt || Date.now(),
          updatedAt: f.updatedAt || Date.now(),
        }));
      }

      if (currentLists.length === 0) {
        const now = Date.now();
        currentLists = [
          {
            id: "default",
            name: "My Pebbles",
            emoji: "⚡",
            color: "#6366F1",
            createdAt: now,
            updatedAt: now,
          },
          {
            id: "personal",
            name: "Personal",
            emoji: "🏠",
            color: "#10B981",
            createdAt: now,
            updatedAt: now,
          },
          {
            id: "work",
            name: "Work",
            emoji: "💼",
            color: "#3B82F6",
            createdAt: now,
            updatedAt: now,
          },
        ];
        await WorkspaceRepository.saveWorkspaces(currentLists);
      }

      setWorkspaces(currentLists);
      setIsWorkspacesHydrated(true);
      const uiState = await UiStateRepository.getUiState();
      const rawActive = uiState.activeWorkspaceId;

      if (
        rawActive &&
        rawActive !== "default" &&
        currentLists.some((l) => l.id === rawActive)
      ) {
        setSelectedWorkspaceId(rawActive);
        setActiveWorkspaceId(rawActive);
        emitStateChange("workspace_mode_changed", rawActive);
      } else if (!rawActive || rawActive === "default") {
        setActiveWorkspaceId(null);
      }
      return currentLists;
    } catch (e) {
      console.warn("Failed to load workspaces", e);
      setIsWorkspacesHydrated(true);
      return [];
    }
  }, []);

  useEffect(() => {
    loadWorkspaces();
    const unsub = addStateListener("workspace_changed", () => {
      loadWorkspaces();
    });
    return () => unsub();
  }, [loadWorkspaces]);

  const handleCreateWorkspace = useCallback(
    async (newWs: Workspace) => {
      await WorkspaceRepository.saveWorkspace(newWs);
      await loadWorkspaces();
      emitStateChange("workspace_changed", "tasks_screen");
    },
    [loadWorkspaces],
  );

  const handleDeleteWorkspace = useCallback(
    async (id: string) => {
      await WorkspaceRepository.deleteWorkspace(id);
      if (selectedWorkspaceId === id) {
        setSelectedWorkspaceId("default");
      }
      if (activeWorkspaceId === id) {
        setActiveWorkspaceId(null);
      }
      await loadWorkspaces();
      emitStateChange("workspace_changed", "tasks_screen");
    },
    [selectedWorkspaceId, activeWorkspaceId, loadWorkspaces],
  );

  return {
    workspaces,
    setWorkspaces,
    isWorkspacesHydrated,
    isHydrated: isWorkspacesHydrated,
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
