import AsyncStorage from "@react-native-async-storage/async-storage";
import React from "react";
import { act, create } from "react-test-renderer";
import { useWorkspaceState } from "@/features/workspaces/hooks/useWorkspaceState";
import { useTodayDashboard } from "@/features/today/hooks/useTodayDashboard";
import { WorkspaceRepository, TaskRepository, UiStateRepository } from "@/repositories";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { addStateListener } from "@/services/events/state-events";
import { Task, Workspace, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";

let mockStore: Record<string, string> = {};

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockImplementation(async (key) => mockStore[key] || null),
  setItem: jest.fn().mockImplementation(async (key, value) => {
    mockStore[key] = String(value);
    return null;
  }),
  removeItem: jest.fn().mockImplementation(async (key) => {
    delete mockStore[key];
    return null;
  }),
  clear: jest.fn().mockImplementation(async () => {
    mockStore = {};
    return null;
  }),
}));

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), setParams: jest.fn() }),
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: any) => {
      React.useEffect(() => {
        cb();
      }, []);
    },
  };
});

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(async () => undefined),
}));

const wsA: Workspace = { id: "ws-a", name: "Workspace A", revision: 1, lifecycleGeneration: 1, createdAt: 10, updatedAt: 10 };
const wsB: Workspace = { id: "ws-b", name: "Workspace B", revision: 1, lifecycleGeneration: 1, createdAt: 20, updatedAt: 20 };

const taskA: Task = {
  id: "task-a",
  workspaceId: "ws-a",
  title: "Task in A",
  status: "todo",
  priority: "high",
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 10,
  updatedAt: 10,
};

const taskB: Task = {
  id: "task-b",
  workspaceId: "ws-b",
  title: "Task in B",
  status: "todo",
  priority: "medium",
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 20,
  updatedAt: 20,
};

describe("Workspace State & UX Regression Suite", () => {
  beforeEach(() => {
    mockStore = {};
    jest.clearAllMocks();
  });

  it("1. persists workspace selection and restores it across reload", async () => {
    await WorkspaceRepository.saveWorkspaces([wsA, wsB]);
    await UiStateRepository.saveUiState({ activeWorkspaceId: "ws-b" });

    let api: ReturnType<typeof useWorkspaceState> | undefined;
    function Harness() {
      api = useWorkspaceState();
      return null;
    }

    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(Harness));
    });

    try {
      expect(api!.selectedWorkspaceId).toBe("ws-b");
      expect(api!.activeWorkspaceId).toBe("ws-b");
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  it("2 & 3. switching A -> B -> A preserves task isolation and state", async () => {
    await WorkspaceRepository.saveWorkspaces([wsA, wsB]);
    await TaskRepository.saveTask(taskA);
    await TaskRepository.saveTask(taskB);

    let api: ReturnType<typeof useWorkspaceState> | undefined;
    function Harness() {
      api = useWorkspaceState();
      return null;
    }

    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(Harness));
    });

    try {
      // Switch to A
      await act(async () => {
        await api!.handleSelectWorkspace("ws-a");
      });
      expect(api!.selectedWorkspaceId).toBe("ws-a");

      let tasksInA = await TaskRepository.getTasks("ws-a");
      expect(Object.keys(tasksInA)).toEqual(["task-a"]);

      // Switch to B
      await act(async () => {
        await api!.handleSelectWorkspace("ws-b");
      });
      expect(api!.selectedWorkspaceId).toBe("ws-b");

      let tasksInB = await TaskRepository.getTasks("ws-b");
      expect(Object.keys(tasksInB)).toEqual(["task-b"]);

      // Return to A
      await act(async () => {
        await api!.handleSelectWorkspace("ws-a");
      });
      expect(api!.selectedWorkspaceId).toBe("ws-a");
      tasksInA = await TaskRepository.getTasks("ws-a");
      expect(Object.keys(tasksInA)).toEqual(["task-a"]);
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  it("4 & 6. workspace creation/rename propagates to Today and mounted listeners", async () => {
    await WorkspaceRepository.saveWorkspaces([wsA]);

    let todayApi: ReturnType<typeof useTodayDashboard> | undefined;
    function TodayHarness() {
      todayApi = useTodayDashboard();
      return null;
    }

    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(TodayHarness));
    });

    try {
      expect(todayApi!.folders.some((f) => f.id === "ws-a")).toBe(true);

      // Create workspace
      await act(async () => {
        await EntityCommandService.createWorkspace(wsB);
      });

      expect(todayApi!.folders.some((f) => f.id === "ws-b")).toBe(true);

      // Rename workspace
      const renamedWsB = { ...wsB, name: "Renamed Workspace B" };
      await act(async () => {
        await EntityCommandService.updateWorkspace(renamedWsB);
      });

      expect(todayApi!.folders.find((f) => f.id === "ws-b")?.name).toBe("Renamed Workspace B");
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  it("5. handles rapid workspace switching without read-modify-write state corruption", async () => {
    await WorkspaceRepository.saveWorkspaces([wsA, wsB]);

    let api: ReturnType<typeof useWorkspaceState> | undefined;
    function Harness() {
      api = useWorkspaceState();
      return null;
    }

    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(Harness));
    });

    try {
      let p1!: Promise<void>;
      let p2!: Promise<void>;
      let p3!: Promise<void>;

      await act(async () => {
        p1 = api!.handleSelectWorkspace("ws-a");
        p2 = api!.handleSelectWorkspace("ws-b");
        p3 = api!.handleSelectWorkspace("ws-a");
        await Promise.all([p1, p2, p3]);
      });

      const persistedUi = await UiStateRepository.getUiState();
      expect(persistedUi.activeWorkspaceId).toBe("ws-a");
      expect(api!.selectedWorkspaceId).toBe("ws-a");
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });
});
