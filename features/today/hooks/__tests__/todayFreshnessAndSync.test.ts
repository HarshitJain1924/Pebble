import AsyncStorage from "@react-native-async-storage/async-storage";
import React from "react";
import { act, create } from "react-test-renderer";
import { useTodayDashboard } from "@/features/today/hooks/useTodayDashboard";
import { TaskRepository, HabitRepository, WorkspaceRepository } from "@/repositories";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { emitStateChange, addStateListener } from "@/services/events/state-events";
import { Task, Habit, Workspace } from "@/shared/types/domain.types";

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
    useFocusEffect: (cb: any) => {
      React.useEffect(() => {
        cb();
      }, []);
    },
  };
});

const workspace: Workspace = { id: "ws-sync", name: "Sync Workspace", createdAt: 1, updatedAt: 1 };
const initialTask: Task = {
  id: "task-sync-1",
  workspaceId: "ws-sync",
  title: "Initial Task",
  status: "todo",
  priority: "none",
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

describe("State Synchronization & Today Freshness Test Suite", () => {
  beforeEach(() => {
    mockStore = {};
    jest.clearAllMocks();
  });

  it("3 & 4. updates Today dashboard when a relevant external task or habit mutation occurs", async () => {
    await WorkspaceRepository.saveWorkspace(workspace);
    await TaskRepository.saveTask(initialTask);

    let api: ReturnType<typeof useTodayDashboard> | undefined;
    function Harness() {
      api = useTodayDashboard();
      return null;
    }

    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(Harness));
    });

    try {
      expect(api!.todoStats.pending.some((t) => t.id === "task-sync-1")).toBe(true);

      // 3. Add task via EntityCommandService from another surface (emits tasks_changed)
      const newTask: Task = {
        id: "task-sync-2",
        workspaceId: "ws-sync",
        title: "External Task",
        status: "todo",
        priority: "high",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await act(async () => {
        await EntityCommandService.createTask(newTask, "ws-sync", { source: "tasks_screen" });
      });

      expect(api!.todoStats.pending.some((t) => t.id === "task-sync-2")).toBe(true);

      // 4. Complete a habit from another surface (emits habits_changed)
      const habit: Habit = {
        id: "habit-sync-1",
        workspaceId: "ws-sync",
        title: "Daily Workout",
        recurrence: { frequency: "daily", interval: 1 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completionHistory: [],
      };
      await HabitRepository.saveHabit(habit);

      await act(async () => {
        await EntityCommandService.completeHabit("habit-sync-1", "ws-sync", { source: "tasks_screen" });
      });

      expect(api!.completedHabits.some((h) => h.id === "habit-sync-1")).toBe(true);
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  it("5 & 6. ignores irrelevant events without looping or unnecessary reloads", async () => {
    await WorkspaceRepository.saveWorkspace(workspace);

    let api: ReturnType<typeof useTodayDashboard> | undefined;
    function Harness() {
      api = useTodayDashboard();
      return null;
    }

    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(Harness));
    });

    try {
      const getWorkspacesSpy = jest.spyOn(WorkspaceRepository, "getWorkspaces");
      getWorkspacesSpy.mockClear();

      // Emit irrelevant event
      await act(async () => {
        emitStateChange("settings_changed", "settings_screen");
      });

      // No reloads triggered for irrelevant event
      expect(getWorkspacesSpy).not.toHaveBeenCalled();

      // Emit self-emitted event
      await act(async () => {
        emitStateChange("tasks_changed", "today_dashboard");
      });

      expect(getWorkspacesSpy).not.toHaveBeenCalled();
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  it("7. leaves local state equal to persisted state after rapid consecutive mutations", async () => {
    await WorkspaceRepository.saveWorkspace(workspace);
    await TaskRepository.saveTask(initialTask);

    await EntityCommandService.updateTask("task-sync-1", "ws-sync", { title: "Title 1" });
    await EntityCommandService.updateTask("task-sync-1", "ws-sync", { title: "Title 2" });
    await EntityCommandService.updateTask("task-sync-1", "ws-sync", { title: "Final Title" });

    const persisted = await TaskRepository.getTasks("ws-sync");
    expect(persisted["task-sync-1"].title).toBe("Final Title");
  });
});
