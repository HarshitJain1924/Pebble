import AsyncStorage from "@react-native-async-storage/async-storage";
import React from "react";
import { act, create } from "react-test-renderer";
import { useResourceLinkState } from "@/features/resources/hooks/useResourceLinkState";
import { Task, Workspace } from "@/shared/types/domain.types";
import { TaskRepository } from "@/repositories";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { addStateListener } from "@/services/events/state-events";

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

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
  impactAsync: jest.fn(async () => undefined),
}));

const workspace: Workspace = { id: "ws-1", name: "Work", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 };
const initialTask: Task = {
  id: "task-1",
  workspaceId: "ws-1",
  title: "Build Feature",
  status: "todo",
  priority: "none",
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
};

describe("Resource Link Mutation Architecture Suite", () => {
  beforeEach(() => {
    mockStore = {};
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it("1 & 2. performs successful link and unlink with persistence/reload consistency", async () => {
    await TaskRepository.saveTask(initialTask);

    let latestTodos: Record<string, Task[]> = { "ws-1": [initialTask] };
    const setTodos = (updater: any) => {
      latestTodos = typeof updater === "function" ? updater(latestTodos) : updater;
    };

    let api: ReturnType<typeof useResourceLinkState> | undefined;
    function Harness() {
      api = useResourceLinkState(
        latestTodos,
        setTodos,
        [],
        jest.fn(),
        {},
        jest.fn(),
        {},
        "ws-1",
        null,
        [workspace],
      );
      return null;
    }

    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(Harness));
    });

    try {
      // 1. Link resource
      await act(async () => {
        await api!.toggleLinkResource("task-1", "task", "res-1");
      });

      expect(latestTodos["ws-1"][0].resourceIds).toEqual(["res-1"]);

      // Verify persistence reload consistency
      let reloaded = await TaskRepository.getTasks("ws-1");
      expect(reloaded["task-1"].resourceIds).toEqual(["res-1"]);

      // 2. Unlink resource
      await act(async () => {
        await api!.toggleLinkResource("task-1", "task", "res-1");
      });

      expect(latestTodos["ws-1"][0].resourceIds || []).toEqual([]);

      reloaded = await TaskRepository.getTasks("ws-1");
      expect(reloaded["task-1"].resourceIds).toBeFalsy();
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  it("3. handles persistence failure cleanly without corrupting local state", async () => {
    await TaskRepository.saveTask(initialTask);

    let latestTodos: Record<string, Task[]> = { "ws-1": [initialTask] };
    const setTodos = jest.fn((updater: any) => {
      latestTodos = typeof updater === "function" ? updater(latestTodos) : updater;
    });

    jest.spyOn(EntityCommandService, "updateTask").mockRejectedValueOnce(
      new Error("Disk Full / Storage Error")
    );

    let api: ReturnType<typeof useResourceLinkState> | undefined;
    function Harness() {
      api = useResourceLinkState(
        latestTodos,
        setTodos,
        [],
        jest.fn(),
        {},
        jest.fn(),
        {},
        "ws-1",
        null,
        [workspace],
      );
      return null;
    }

    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(Harness));
    });

    try {
      let thrownErr: Error | null = null;
      await act(async () => {
        try {
          await api!.toggleLinkResource("task-1", "task", "res-1");
        } catch (e: any) {
          thrownErr = e;
        }
      });

      expect(thrownErr).not.toBeNull();
      expect(thrownErr!.message).toBe("Disk Full / Storage Error");
      expect(setTodos).not.toHaveBeenCalled();
      expect(latestTodos["ws-1"][0].resourceIds).toBeUndefined();
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  it("4. handles rapid out-of-order link/unlink operations via deterministic deferred promises", async () => {
    await TaskRepository.saveTask(initialTask);

    let latestTodos: Record<string, Task[]> = { "ws-1": [initialTask] };
    const pendingResolves: Array<{ resolve: () => void }> = [];

    const setTodos = (updater: any) => {
      latestTodos = typeof updater === "function" ? updater(latestTodos) : updater;
    };

    const origUpdate = EntityCommandService.updateTask.bind(EntityCommandService);
    jest.spyOn(EntityCommandService, "updateTask").mockImplementation(async (id, ws, patch, opts) => {
      await new Promise<void>((resolve) => pendingResolves.push({ resolve }));
      return origUpdate(id, ws, patch, opts);
    });

    let api: ReturnType<typeof useResourceLinkState> | undefined;
    function Harness() {
      api = useResourceLinkState(
        latestTodos,
        setTodos,
        [],
        jest.fn(),
        {},
        jest.fn(),
        {},
        "ws-1",
        null,
        [workspace],
      );
      return null;
    }

    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(Harness));
    });

    try {
      // Start both calls without awaiting them inside act immediately
      const p1 = api!.toggleLinkResource("task-1", "task", "res-1");
      const p2 = api!.toggleLinkResource("task-1", "task", "res-1");

      // Give microtasks time to start p1 and block p2 at mutex
      await new Promise((r) => setTimeout(r, 20));
      expect(pendingResolves).toHaveLength(1);

      await act(async () => {
        pendingResolves[0].resolve();
        await p1;
      });

      // After p1 resolves, p2 proceeds and enters critical section
      await new Promise((r) => setTimeout(r, 20));
      expect(pendingResolves).toHaveLength(2);

      await act(async () => {
        pendingResolves[1].resolve();
        await p2;
      });

      expect(latestTodos["ws-1"][0].resourceIds || []).toEqual([]);
      const persisted = await TaskRepository.getTasks("ws-1");
      expect(persisted["task-1"].resourceIds).toBeFalsy();
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  it("6. emits state events upon successful resource linking mutation", async () => {
    await TaskRepository.saveTask(initialTask);

    let latestTodos: Record<string, Task[]> = { "ws-1": [initialTask] };
    const setTodos = (updater: any) => {
      latestTodos = typeof updater === "function" ? updater(latestTodos) : updater;
    };

    const eventsFired: string[] = [];
    const unsubscribe = addStateListener("tasks_changed", () => {
      eventsFired.push("tasks_changed");
    });

    let api: ReturnType<typeof useResourceLinkState> | undefined;
    function Harness() {
      api = useResourceLinkState(
        latestTodos,
        setTodos,
        [],
        jest.fn(),
        {},
        jest.fn(),
        {},
        "ws-1",
        null,
        [workspace],
      );
      return null;
    }

    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(Harness));
    });

    try {
      await act(async () => {
        await api!.toggleLinkResource("task-1", "task", "res-1");
      });

      expect(eventsFired).toContain("tasks_changed");
    } finally {
      unsubscribe();
      act(() => {
        renderer.unmount();
      });
    }
  });
});
