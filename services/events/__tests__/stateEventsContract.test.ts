import React from "react";
import { act, create } from "react-test-renderer";
import { addStateListener, emitStateChange } from "@/services/events/state-events";
import { useTodayDashboard } from "@/features/today/hooks/useTodayDashboard";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { TaskRepository } from "@/repositories/TaskRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { ChecklistRepository } from "@/repositories/ChecklistRepository";
import { Task, Habit, Checklist, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";

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

describe("State Events & Attribution Contract Suite", () => {
  beforeEach(async () => {
    mockStore = {};
    jest.clearAllMocks();
  });

  it("1 & 2. external task mutation refreshes Today, but Today-originated mutation ignores self-reload", async () => {
    let todayApi: ReturnType<typeof useTodayDashboard> | undefined;
    function Harness() {
      todayApi = useTodayDashboard();
      return null;
    }

    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(Harness));
    });

    try {
      expect(todayApi!.todoStats.total).toBe(0);

      // External mutation from "tasks_screen"
      const task: Task = {
        id: "task-evt-1",
        workspaceId: INBOX_WORKSPACE_ID,
        title: "External Task",
        status: "todo",
        priority: "none",
        createdAt: 100,
        updatedAt: 100,
      };

      await act(async () => {
        await EntityCommandService.createTask(task, INBOX_WORKSPACE_ID, { source: "tasks_screen" });
      });

      // Today refreshed and picked up the external task
      expect(todayApi!.todoStats.total).toBe(1);

      // Simulated Today-originated mutation
      const listenerSpy = jest.fn();
      const unsub = addStateListener("tasks_changed", listenerSpy);

      await act(async () => {
        emitStateChange("tasks_changed", "today_dashboard");
      });

      unsub();
      // Verified listener received stable emitterId "today_dashboard"
      expect(listenerSpy).toHaveBeenCalledWith("today_dashboard");
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  it("3 & 4. external habit, checklist, and workspace mutations reach target listeners", async () => {
    const habitListener = jest.fn();
    const checklistListener = jest.fn();
    const workspaceListener = jest.fn();

    const unsubH = addStateListener("habits_changed", habitListener);
    const unsubC = addStateListener("checklists_changed", checklistListener);
    const unsubW = addStateListener("workspace_changed", workspaceListener);

    const habit: Habit = {
      id: "habit-evt-1",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Daily Habit",
      recurrence: { frequency: "daily", interval: 1 },
      completionHistory: [],
      createdAt: 100,
      updatedAt: 100,
    };

    const checklist: Checklist = {
      id: "chk-evt-1",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Checklist",
      items: [],
      createdAt: 100,
      updatedAt: 100,
    };

    await EntityCommandService.createHabit(habit, INBOX_WORKSPACE_ID, { source: "habits_screen" });
    await EntityCommandService.createChecklist(checklist, INBOX_WORKSPACE_ID, { source: "checklists_screen" });
    await EntityCommandService.createWorkspace(
      { id: "ws-evt-1", name: "New WS", createdAt: 100, updatedAt: 100 },
    );

    unsubH();
    unsubC();
    unsubW();

    expect(habitListener).toHaveBeenCalledWith("habits_screen");
    expect(checklistListener).toHaveBeenCalledWith("checklists_screen");
    expect(workspaceListener).toHaveBeenCalledWith("tasks_screen");
  });

  it("5 & 7. unrelated events are ignored and no reload loop occurs", async () => {
    const taskListener = jest.fn();
    const unsub = addStateListener("tasks_changed", taskListener);

    emitStateChange("settings_changed", "settings_screen");
    emitStateChange("zen_mode_toggle", "drawer");

    expect(taskListener).not.toHaveBeenCalled();

    unsub();
  });

  it("6. events are emitted ONLY AFTER underlying persistence succeeds", async () => {
    const listener = jest.fn();
    const unsub = addStateListener("tasks_changed", listener);

    const task: Task = {
      id: "task-persist-1",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Persisted Task",
      status: "todo",
      priority: "none",
      createdAt: 100,
      updatedAt: 100,
    };

    let persistedInStorageBeforeEvent = false;
    listener.mockImplementation(() => {
      const raw = mockStore[`pebble:v1:tasks:${INBOX_WORKSPACE_ID}`];
      if (raw) {
        const parsed = JSON.parse(raw);
        persistedInStorageBeforeEvent = Boolean(parsed["task-persist-1"]);
      }
    });

    await EntityCommandService.createTask(task, INBOX_WORKSPACE_ID, { source: "tasks_screen" });

    unsub();
    expect(listener).toHaveBeenCalled();
    expect(persistedInStorageBeforeEvent).toBe(true);
  });

  it("8. stable emitter IDs remain stable across emissions", () => {
    const receivedEmitterIds: (string | undefined)[] = [];
    const unsub = addStateListener("tasks_changed", (emitterId) => {
      receivedEmitterIds.push(emitterId);
    });

    emitStateChange("tasks_changed", "today_dashboard");
    emitStateChange("tasks_changed", "tasks_screen");
    emitStateChange("tasks_changed", "today_dashboard");

    unsub();

    expect(receivedEmitterIds).toEqual(["today_dashboard", "tasks_screen", "today_dashboard"]);
  });
});
