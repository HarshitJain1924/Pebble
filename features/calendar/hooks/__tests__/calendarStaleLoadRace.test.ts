import React from "react";
import { act, create } from "react-test-renderer";

jest.mock("@react-native-async-storage/async-storage", () => {
  const store: Record<string, string> = {};
  return {
    __store: store,
    getItem: jest.fn().mockImplementation(async (key: string) => store[key] || null),
    setItem: jest.fn().mockImplementation(async (key: string, value: any) => {
      store[key] = String(value);
      return null;
    }),
    removeItem: jest.fn().mockImplementation(async (key: string) => {
      delete store[key];
      return null;
    }),
    clear: jest.fn().mockImplementation(async () => {
      for (const k in store) delete store[k];
      return null;
    }),
  };
});

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
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Medium: "Medium" },
  NotificationFeedbackType: { Success: "Success" },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCalendarState } from "@/features/calendar/hooks/useCalendarState";
import {
  TaskRepository,
  HabitRepository,
  WorkspaceRepository,
  UiStateRepository,
} from "@/repositories";
import { Task, Habit, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { emitStateChange } from "@/services/events/state-events";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flushPromises = () => new Promise((r) => setImmediate(r));

describe("Calendar Stale Load Race Prevention and Concurrent Loading (Fix #2 & Fix #7)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    await WorkspaceRepository.saveWorkspaces([
      { id: "ws-1", name: "Main", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ]);
    await UiStateRepository.saveUiState({ activeWorkspaceId: "ws-1" });
  });

  test("An older asynchronous load cannot overwrite state after a newer load has committed", async () => {
    const oldTask: Task = {
      id: "task-old",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Old Task Data",
      status: "todo",
      priority: "low",
      schedule: { date: "2026-08-30" },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    const newTask: Task = {
      id: "task-new",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "New Task Data",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-30", startTime: "14:00" },
      revision: 2,
      lifecycleGeneration: 1,
      createdAt: 2000,
      updatedAt: 2000,
    };

    let state: ReturnType<typeof useCalendarState> | undefined;
    function TestHarness() {
      state = useCalendarState();
      return null;
    }

    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(TestHarness));
    });

    // Initial state is loaded
    expect(state?.allTodos).toEqual([]);

    // Prepare two deferred responses for TaskRepository.getTasks on INBOX_WORKSPACE_ID
    const deferredA = createDeferred<Record<string, Task>>();
    const deferredB = createDeferred<Record<string, Task>>();

    let callCount = 0;
    let inboxTriggerCount = 0;
    const realGetTasks = TaskRepository.getTasks.bind(TaskRepository);
    const getTasksSpy = jest.spyOn(TaskRepository, "getTasks").mockImplementation(async (wsId: string) => {
      callCount++;
      if (wsId === INBOX_WORKSPACE_ID) {
        inboxTriggerCount++;
        if (inboxTriggerCount === 1) {
          // Load A inbox
          return deferredA.promise;
        }
        if (inboxTriggerCount === 2) {
          // Load B inbox
          return deferredB.promise;
        }
      }
      return {};
    });

    // 1. Trigger Load A
    act(() => {
      emitStateChange("tasks_changed", "test");
    });
    await act(async () => {
      await flushPromises();
    });

    // 2. Trigger Load B
    act(() => {
      emitStateChange("tasks_changed", "test");
    });
    await act(async () => {
      await flushPromises();
    });

    expect(inboxTriggerCount).toBe(2);

    // 3. Resolve Load B first with NEW task data
    await act(async () => {
      deferredB.resolve({ [newTask.id]: newTask });
      await flushPromises();
    });

    // Verify Calendar state has committed Load B (NEW data)
    expect(state?.allTodos.some((t) => t.id === "task-new")).toBe(true);
    expect(state?.allTodos.some((t) => t.id === "task-old")).toBe(false);

    // 4. Resolve Load A afterward with OLD task data
    await act(async () => {
      deferredA.resolve({ [oldTask.id]: oldTask });
      await flushPromises();
    });

    // Verify Calendar state STILL contains Load B (NEW data) and was NOT overwritten by stale Load A
    expect(state?.allTodos.some((t) => t.id === "task-new")).toBe(true);
    expect(state?.allTodos.some((t) => t.id === "task-old")).toBe(false);

    getTasksSpy.mockRestore();
    await act(async () => {
      renderer.unmount();
    });
  });

  test("Concurrent Task and Habit reads across workspaces resolve independently to assemble correct full calendar state", async () => {
    const taskInbox: Task = {
      id: "task-inbox-1",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Inbox Task",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30" },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    const taskWs1: Task = {
      id: "task-ws1-1",
      workspaceId: "ws-1",
      title: "Workspace Task",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-30" },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    const habitInbox: Habit = {
      id: "habit-inbox-1",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Daily Meditation",
      recurrence: { frequency: "daily", interval: 1 },
      completionHistory: [],
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    const habitWs1: Habit = {
      id: "habit-ws1-1",
      workspaceId: "ws-1",
      title: "Evening Walk",
      recurrence: { frequency: "daily", interval: 1 },
      completionHistory: [],
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    // Pre-populate tasks and habits in AsyncStorage
    await TaskRepository.saveTask(taskInbox);
    await TaskRepository.saveTask(taskWs1);
    await HabitRepository.saveHabit(habitInbox);
    await HabitRepository.saveHabit(habitWs1);

    let state: ReturnType<typeof useCalendarState> | undefined;
    function TestHarness() {
      state = useCalendarState();
      return null;
    }

    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(TestHarness));
      await flushPromises();
    });

    // Verify all tasks and habits from both workspaces loaded completely
    expect(state?.allTodos.map((t) => t.id).sort()).toEqual(["task-inbox-1", "task-ws1-1"]);
    expect(state?.allHabits.map((h) => h.id).sort()).toEqual(["habit-inbox-1", "habit-ws1-1"]);

    await act(async () => {
      renderer.unmount();
    });
  });
});
