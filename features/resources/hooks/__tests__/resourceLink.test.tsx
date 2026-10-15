jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
import React from "react";
import { act, create } from "react-test-renderer";
import { useResourceLinkState } from "@/features/resources/hooks/useResourceLinkState";
import type { Task, Workspace } from "@/shared/types/domain.types";

jest.mock("expo-haptics", () => ({ ImpactFeedbackStyle: { Light: "light" }, impactAsync: jest.fn(async () => undefined) }));

const workspace: Workspace = { id: "ws", name: "Workspace", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 };
const task: Task = { id: "task", workspaceId: "ws", title: "Task", status: "todo", priority: "none", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 };

describe("Phase 0 resource-link persistence", () => {
  it("loads the actual hook without introducing a new production dependency", () => {
    expect(typeof useResourceLinkState).toBe("function");
  });

  test("does not leave a local link visible when task-link persistence fails", async () => {
    let latestTodos: Record<string, Task[]> = { ws: [task] };
    const setTodos = (updater: any) => { latestTodos = typeof updater === "function" ? updater(latestTodos) : updater; };
    const persistState = jest.fn(async () => { throw new Error("task-link persistence failed"); });
    let api: ReturnType<typeof useResourceLinkState> | undefined;
    function Harness() {
      api = useResourceLinkState(latestTodos, setTodos, [], jest.fn(), {}, jest.fn(), {}, "ws", null, [workspace], persistState, jest.fn());
      return null;
    }
    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(Harness));
    });
    try {
      await act(async () => {
        try {
          await api!.toggleLinkResource("task", "task", "resource-1");
        } catch (e) {
          // Expected error
        }
      });
      expect(latestTodos.ws[0].resourceIds).toBeUndefined();
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  test("keeps persisted state aligned when rapid toggle writes resolve out of order", async () => {
    let latestTodos: Record<string, Task[]> = { ws: [task] };
    let persistedTodos: Record<string, Task[]> = latestTodos;
    const pending: Array<{ next: Record<string, Task[]>; resolve: () => void }> = [];
    const setTodos = (updater: any) => { latestTodos = typeof updater === "function" ? updater(latestTodos) : updater; };
    const persistState = jest.fn(async (_lists: Workspace[], _selected: string, next: Record<string, Task[]>) => {
      await new Promise<void>((resolve) => pending.push({ next, resolve }));
      persistedTodos = next;
    });
    let api: ReturnType<typeof useResourceLinkState> | undefined;
    function Harness() {
      api = useResourceLinkState(latestTodos, setTodos, [], jest.fn(), {}, jest.fn(), {}, "ws", null, [workspace], persistState, jest.fn());
      return null;
    }
    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(Harness));
    });
    try {
      let first: Promise<any>;
      let second: Promise<any>;
      await act(async () => {
        first = api!.toggleLinkResource("task", "task", "resource-1");
        second = api!.toggleLinkResource("task", "task", "resource-1");
      });
      expect(pending).toHaveLength(1);
      await act(async () => {
        pending[0].resolve();
      });
      expect(pending).toHaveLength(2);
      await act(async () => {
        pending[1].resolve();
        await Promise.all([first, second]);
      });
      expect(persistedTodos).toEqual(latestTodos);
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });
});
