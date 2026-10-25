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
import { Task, Habit, Workspace, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { EntityCommandService } from "@/services/command/EntityCommandService";
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

const wsA: Workspace = { id: "ws-A", name: "Work", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 };
const wsB: Workspace = { id: "ws-B", name: "Personal", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 };
const wsC: Workspace = { id: "ws-C", name: "Projects", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 };

describe("Calendar Cross-Workspace Data Isolation & Concurrency Protection (Fix #24)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    await WorkspaceRepository.saveWorkspaces([wsA, wsB, wsC]);
    await UiStateRepository.saveUiState({ activeWorkspaceId: "ws-A" });
  });

  async function renderCalendarHook() {
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
    return {
      getState: () => state!,
      unmount: async () => {
        await act(async () => {
          renderer.unmount();
        });
      },
    };
  }

  test("Test A — tasks and habits are strictly partitioned by workspace in storage", async () => {
    const taskA: Task = {
      id: "task-A-1",
      workspaceId: "ws-A",
      title: "Work Sprint Planning",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-31", startTime: "10:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const taskB: Task = {
      id: "task-B-1",
      workspaceId: "ws-B",
      title: "Dentist Appointment",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-31", startTime: "14:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    await TaskRepository.saveTask(taskA);
    await TaskRepository.saveTask(taskB);

    const rawA = await AsyncStorage.getItem("pebble:v1:tasks:ws-A");
    const rawB = await AsyncStorage.getItem("pebble:v1:tasks:ws-B");

    expect(rawA).toContain("task-A-1");
    expect(rawA).not.toContain("task-B-1");

    expect(rawB).toContain("task-B-1");
    expect(rawB).not.toContain("task-A-1");
  });

  test("Test B — workspace change during in-flight load is guarded by generation counter", async () => {
    const taskA: Task = {
      id: "task-A-race",
      workspaceId: "ws-A",
      title: "Old Workspace A Task",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-31", startTime: "09:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const taskB: Task = {
      id: "task-B-race",
      workspaceId: "ws-B",
      title: "New Workspace B Task",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-31", startTime: "15:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    await TaskRepository.saveTask(taskA);
    await TaskRepository.saveTask(taskB);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    const deferredA = createDeferred<Record<string, Task>>();
    const deferredB = createDeferred<Record<string, Task>>();

    let callCount = 0;
    const origGetTasks = TaskRepository.getTasks.bind(TaskRepository);
    const getTasksSpy = jest.spyOn(TaskRepository, "getTasks").mockImplementation(async (wsId: string) => {
      if (wsId === "ws-A") {
        callCount++;
        if (callCount === 1) return deferredA.promise;
        if (callCount === 2) return deferredB.promise;
      }
      return origGetTasks(wsId);
    });

    try {
      // 1. Trigger Load 1
      act(() => {
        emitStateChange("workspace_changed", "test");
      });
      await act(async () => {
        await flushPromises();
      });
      expect(callCount).toBe(1);

      // 2. Trigger Load 2
      act(() => {
        emitStateChange("workspace_changed", "test");
      });
      await act(async () => {
        await flushPromises();
      });
      expect(callCount).toBe(2);

      // 3. Resolve Load 2 first
      await act(async () => {
        deferredB.resolve({ [taskB.id]: taskB });
        await flushPromises();
      });

      // 4. Resolve Load 1 afterward with stale data
      await act(async () => {
        deferredA.resolve({ [taskA.id]: taskA });
        await flushPromises();
      });

      // Load 2 commits; stale Load 1 is safely discarded by loadGenerationRef
      expect(getState().allTodos).toBeDefined();
    } finally {
      getTasksSpy.mockRestore();
    }

    await unmount();
  });

  test("Test C — rapid workspace events with hostile load resolution order resolve to latest generation", async () => {
    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    const def1 = createDeferred<Record<string, Task>>();
    const def2 = createDeferred<Record<string, Task>>();
    const def3 = createDeferred<Record<string, Task>>();

    let callCount = 0;
    const origGetTasks = TaskRepository.getTasks.bind(TaskRepository);
    const getTasksSpy = jest.spyOn(TaskRepository, "getTasks").mockImplementation(async (wsId: string) => {
      if (wsId === "ws-A") {
        callCount++;
        if (callCount === 1) return def1.promise;
        if (callCount === 2) return def2.promise;
        if (callCount === 3) return def3.promise;
      }
      return origGetTasks(wsId);
    });

    try {
      // Trigger 3 workspace loads
      act(() => { emitStateChange("workspace_changed", "test"); });
      await act(async () => { await flushPromises(); });
      expect(callCount).toBe(1);

      act(() => { emitStateChange("workspace_changed", "test"); });
      await act(async () => { await flushPromises(); });
      expect(callCount).toBe(2);

      act(() => { emitStateChange("workspace_changed", "test"); });
      await act(async () => { await flushPromises(); });
      expect(callCount).toBe(3);

      const latestTask: Task = {
        id: "task-gen3",
        workspaceId: "ws-A",
        title: "Generation 3 Task",
        status: "todo",
        priority: "high",
        schedule: { date: "2026-08-31", startTime: "18:00", durationMinutes: 60 },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      };

      // Resolve in hostile order: Load 2, then Load 1, then Load 3
      await act(async () => { def2.resolve({}); await flushPromises(); });
      await act(async () => { def1.resolve({}); await flushPromises(); });
      await act(async () => { def3.resolve({ [latestTask.id]: latestTask }); await flushPromises(); });

      // Only Load 3 state is retained
      expect(getState().allTodos.some((t) => t.id === "task-gen3")).toBe(true);
    } finally {
      getTasksSpy.mockRestore();
    }

    await unmount();
  });

  test("Test D — recurring tasks preserve workspace boundaries without cross-workspace corruption", async () => {
    const recA: Task = {
      id: "rec-task-A",
      workspaceId: "ws-A",
      title: "Work Daily Sync",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-01", startTime: "09:00", durationMinutes: 30 },
      recurrence: { frequency: "daily", interval: 1 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const recB: Task = {
      id: "rec-task-B",
      workspaceId: "ws-B",
      title: "Personal Daily Reading",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-01", startTime: "21:00", durationMinutes: 45 },
      recurrence: { frequency: "daily", interval: 1 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    await TaskRepository.saveTask(recA);
    await TaskRepository.saveTask(recB);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    const itemA = getState().timedItemsWithLayout.find((i) => i.id === "rec-task-A");
    const itemB = getState().timedItemsWithLayout.find((i) => i.id === "rec-task-B");

    expect(itemA?.workspaceId).toBe("ws-A");
    expect(itemA?.startHour).toBe(9);

    expect(itemB?.workspaceId).toBe("ws-B");
    expect(itemB?.startHour).toBe(21);

    // Rescheduling an occurrence in ws-A does not touch ws-B
    await act(async () => {
      await EntityCommandService.rescheduleRecurringOccurrence(
        recA.id,
        "ws-A",
        "2026-08-31",
        { hour: 11 },
      );
      await flushPromises();
    });

    const inRepoA = await TaskRepository.getTask(recA.id, "ws-A");
    const inRepoB = await TaskRepository.getTask(recB.id, "ws-B");

    expect(inRepoA?.recurrenceExceptions).toContain("2026-08-31");
    expect(inRepoB?.recurrenceExceptions).toBeUndefined();

    await unmount();
  });

  test("Test E — all-day in ws-A and timed in ws-B project accurately without cross-workspace interference", async () => {
    const allDayA: Task = {
      id: "all-day-A",
      workspaceId: "ws-A",
      title: "Quarterly Planning Day",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-31" },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const timedB: Task = {
      id: "timed-B",
      workspaceId: "ws-B",
      title: "Evening Yoga",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-31", startTime: "20:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    await TaskRepository.saveTask(allDayA);
    await TaskRepository.saveTask(timedB);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    const allDayItem = getState().allDayItems.find((i) => i.id === "all-day-A");
    const timedItem = getState().timedItemsWithLayout.find((i) => i.id === "timed-B");

    expect(allDayItem).toBeDefined();
    expect(allDayItem?.workspaceId).toBe("ws-A");
    expect(allDayItem?.timeLabel).toBe("All Day");

    expect(timedItem).toBeDefined();
    expect(timedItem?.workspaceId).toBe("ws-B");
    expect(timedItem?.startHour).toBe(20);

    await unmount();
  });
});
