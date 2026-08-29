import {
  globalLists,
  setGlobalLists,
} from "@/features/tasks/utils/task-formatting";
import { UiStateRepository, WorkspaceRepository } from "@/repositories";
import {
  addStateListener,
  emitStateChange,
} from "@/services/events/state-events";
import {
  INBOX_WORKSPACE_ID,
  MY_PEBBLES_WORKSPACE_ID,
  type Workspace,
} from "@/shared/types/domain.types";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";

export function useWorkspaceState() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    segment?: string;
    workspaceId?: string;
  }>();

  const [workspaces, setWorkspaces] = useState<Workspace[]>(
    () => globalLists || [],
  );
  const [isWorkspacesHydrated, setIsWorkspacesHydrated] = useState<boolean>(
    () => globalLists !== null,
  );
  const [selectedWorkspaceId, setSelectedWorkspaceId] =
    useState<string>(INBOX_WORKSPACE_ID);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    null,
  );

  const isProtectedWorkspace = useCallback((id: string) => {
    return id === INBOX_WORKSPACE_ID || id === MY_PEBBLES_WORKSPACE_ID;
  }, []);

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

  const targetWsId = params.workspaceId;

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

  const handleSelectWorkspace = useCallback(async (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setActiveWorkspaceId(id);
    setSelectedWorkspaceId(id);
    setWorkspaceSegment("tasks");
    try {
      await UiStateRepository.saveUiState({ activeWorkspaceId: id });
    } catch (e) {}
    emitStateChange("workspace_mode_changed", id);
    emitStateChange("workspace_changed", "tasks_screen");
  }, []);

  const handleBackToWorkspaces = useCallback(async () => {
    Haptics.selectionAsync().catch(() => {});
    setActiveWorkspaceId(null);
    try {
      await UiStateRepository.saveUiState({
        activeWorkspaceId: null,
      });
    } catch (e) {}
    try {
      router.setParams({ workspaceId: undefined });
    } catch (e) {}
    emitStateChange("workspace_mode_changed", "null");
    emitStateChange("workspace_changed", "tasks_screen");
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
          revision: f.revision || 1,
          lifecycleGeneration: f.lifecycleGeneration || 1,
          createdAt: f.createdAt || Date.now(),
          updatedAt: f.updatedAt || Date.now(),
        }));
      }

      if (currentLists.length === 0) {
        const now = Date.now();
        currentLists = [
          {
            id: INBOX_WORKSPACE_ID,
            name: "Inbox",
            emoji: "📥",
            color: "#6366F1",
            revision: 1,
            lifecycleGeneration: 1,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: MY_PEBBLES_WORKSPACE_ID,
            name: "My Pebbles",
            emoji: "⚡",
            color: "#8B5CF6",
            revision: 1,
            lifecycleGeneration: 1,
            createdAt: now,
            updatedAt: now,
          },
        ];
        const { EntityCommandService } = require("@/services/command/EntityCommandService");
        await EntityCommandService.reorderWorkspaces(currentLists, { skipEvents: true, skipAnalytics: true });
      }

      setWorkspaces(currentLists);
      setIsWorkspacesHydrated(true);
      const uiState = await UiStateRepository.getUiState();
      const rawActive = uiState.activeWorkspaceId;

      if (rawActive && currentLists.some((l) => l.id === rawActive)) {
        setSelectedWorkspaceId(rawActive);
        setActiveWorkspaceId(rawActive);
        emitStateChange("workspace_mode_changed", rawActive);
      } else {
        setSelectedWorkspaceId((prev) => (currentLists.some((l) => l.id === prev) ? prev : INBOX_WORKSPACE_ID));
        setActiveWorkspaceId((prev) => (prev && currentLists.some((l) => l.id === prev) ? prev : null));
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
      const { EntityCommandService } = await import("@/services/command/EntityCommandService");
      await EntityCommandService.createWorkspace(newWs);
      await loadWorkspaces();
    },
    [loadWorkspaces],
  );

  const handleUpdateWorkspace = useCallback(
    async (updatedWs: Workspace) => {
      const { EntityCommandService } = await import("@/services/command/EntityCommandService");
      await EntityCommandService.updateWorkspace(updatedWs);
      await loadWorkspaces();
    },
    [loadWorkspaces],
  );

  const handleDeleteWorkspace = useCallback(
    async (id: string) => {
      if (isProtectedWorkspace(id)) {
        return;
      }
      const { EntityCommandService } = await import("@/services/command/EntityCommandService");
      await EntityCommandService.deleteWorkspace(id);
      if (selectedWorkspaceId === id) {
        setSelectedWorkspaceId(INBOX_WORKSPACE_ID);
      }
      if (activeWorkspaceId === id) {
        setActiveWorkspaceId(null);
      }
      await loadWorkspaces();
    },
    [
      selectedWorkspaceId,
      activeWorkspaceId,
      isProtectedWorkspace,
      loadWorkspaces,
    ],
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
    isProtectedWorkspace,
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
    handleUpdateWorkspace,
    handleDeleteWorkspace,
    loadWorkspaces,
  };
}
