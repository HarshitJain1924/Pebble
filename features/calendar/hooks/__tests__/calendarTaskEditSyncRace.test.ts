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
  WorkspaceRepository,
  UiStateRepository,
} from "@/repositories";
import { Task, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
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

describe("Calendar Task Edit Synchronization and Stale-Load Race Protection (Fix #22)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    await WorkspaceRepository.saveWorkspaces([
      { id: "ws-1", name: "Main", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ]);
    await UiStateRepository.saveUiState({ activeWorkspaceId: "ws-1" });
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

  test("Test A — schedule edit refreshes Calendar through tasks_changed event", async () => {
    const task: Task = {
      id: "task-sync-1",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Sync Test Task",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-31", startTime: "20:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTasks([task], INBOX_WORKSPACE_ID);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    // Initially at 20:00
    const initialItem = getState().timedItemsWithLayout.find((i) => i.id === "task-sync-1");
    expect(initialItem).toBeDefined();
    expect(initialItem?.startHour).toBe(20);

    // Edit to 21:00 via EntityCommandService (emits tasks_changed)
    await act(async () => {
      await EntityCommandService.updateTask(
        task.id,
        INBOX_WORKSPACE_ID,
        { schedule: { date: "2026-08-31", startTime: "21:00", durationMinutes: 60 } },
        { source: "task_detail" },
      );
      await flushPromises();
    });

    // Calendar must now reflect 21:00
    const updatedItem = getState().timedItemsWithLayout.find((i) => i.id === "task-sync-1");
    expect(updatedItem).toBeDefined();
    expect(updatedItem?.startHour).toBe(21);

    await unmount();
  });

  test("Test B — stale reload cannot overwrite newer edit", async () => {
    const oldTask: Task = {
      id: "task-race-1",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Race Task",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-31", startTime: "20:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTasks([oldTask], INBOX_WORKSPACE_ID);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    const deferredA = createDeferred<Record<string, Task>>();
    const deferredB = createDeferred<Record<string, Task>>();

    let inboxCallCount = 0;
    const origGetTasks = TaskRepository.getTasks.bind(TaskRepository);
    const getTasksSpy = jest.spyOn(TaskRepository, "getTasks").mockImplementation(async (wsId: string) => {
      if (wsId === INBOX_WORKSPACE_ID) {
        inboxCallCount++;
        if (inboxCallCount === 1) {
          // Load A: slow load returning old task (20:00)
          return deferredA.promise;
        }
        if (inboxCallCount === 2) {
          // Load B: fast load returning new task (21:00)
          return deferredB.promise;
        }
      }
      return origGetTasks(wsId);
    });

    try {
      // 1. Trigger Load A (e.g. background event or refresh)
      act(() => {
        emitStateChange("tasks_changed", "test");
      });
      await act(async () => {
        await flushPromises();
      });
      expect(inboxCallCount).toBe(1);

      // 2. Perform edit to 21:00 in background/persisted storage
      const newTask: Task = {
        ...oldTask,
        schedule: { date: "2026-08-31", startTime: "21:00", durationMinutes: 60 },
        revision: 2,
      };

      // 3. Trigger Load B (e.g. tasks_changed fired by the edit)
      act(() => {
        emitStateChange("tasks_changed", "test");
      });
      await act(async () => {
        await flushPromises();
      });
      expect(inboxCallCount).toBe(2);

      // 4. Resolve Load B first with new Task (21:00)
      await act(async () => {
        deferredB.resolve({ [newTask.id]: newTask });
        await flushPromises();
      });

      // State is 21:00
      expect(getState().timedItemsWithLayout.find((i) => i.id === "task-race-1")?.startHour).toBe(21);

      // 5. Resolve Load A afterward with old Task (20:00)
      await act(async () => {
        deferredA.resolve({ [oldTask.id]: oldTask });
        await flushPromises();
      });

      // State MUST STILL be 21:00, NOT overwritten by 20:00
      expect(getState().timedItemsWithLayout.find((i) => i.id === "task-race-1")?.startHour).toBe(21);
    } finally {
      getTasksSpy.mockRestore();
    }
    await unmount();
  });

  test("Test C — multiple rapid edits: 20:00 -> 21:00 -> 22:00 with hostile load resolution order", async () => {
    const task20: Task = {
      id: "task-rapid-1",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Rapid Edit Task",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-31", startTime: "20:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const task21: Task = { ...task20, schedule: { ...task20.schedule, startTime: "21:00" }, revision: 2 };
    const task22: Task = { ...task20, schedule: { ...task20.schedule, startTime: "22:00" }, revision: 3 };

    await TaskRepository.saveTasks([task20], INBOX_WORKSPACE_ID);

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
      if (wsId === INBOX_WORKSPACE_ID) {
        callCount++;
        if (callCount === 1) return def1.promise;
        if (callCount === 2) return def2.promise;
        if (callCount === 3) return def3.promise;
      }
      return origGetTasks(wsId);
    });

    try {
      // Fire Load 1 and wait for it to reach TaskRepository.getTasks
      act(() => { emitStateChange("tasks_changed", "test"); });
      await act(async () => { await flushPromises(); });
      expect(callCount).toBe(1);

      // Fire Load 2 and wait for it to reach TaskRepository.getTasks
      act(() => { emitStateChange("tasks_changed", "test"); });
      await act(async () => { await flushPromises(); });
      expect(callCount).toBe(2);

      // Fire Load 3 and wait for it to reach TaskRepository.getTasks
      act(() => { emitStateChange("tasks_changed", "test"); });
      await act(async () => { await flushPromises(); });
      expect(callCount).toBe(3);

      // Resolve in hostile order: Load 2, then Load 1, then Load 3
      await act(async () => {
        def2.resolve({ [task21.id]: task21 });
        await flushPromises();
      });
      await act(async () => {
        def1.resolve({ [task20.id]: task20 });
        await flushPromises();
      });
      await act(async () => {
        def3.resolve({ [task22.id]: task22 });
        await flushPromises();
      });

      // Final Calendar state must be 22:00
      const finalItem = getState().timedItemsWithLayout.find((i) => i.id === "task-rapid-1");
      expect(finalItem).toBeDefined();
      expect(finalItem?.startHour).toBe(22);
    } finally {
      getTasksSpy.mockRestore();
    }

    await unmount();
  });

  test("Test D — date move: Aug 31 20:00 -> Sep 1 20:00 updates Calendar synchronization", async () => {
    const task: Task = {
      id: "task-move-1",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Date Move Task",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-31", startTime: "20:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTasks([task], INBOX_WORKSPACE_ID);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    expect(getState().timedItemsWithLayout.find((i) => i.id === "task-move-1")).toBeDefined();

    // Move to Sep 1
    await act(async () => {
      await EntityCommandService.updateTask(
        task.id,
        INBOX_WORKSPACE_ID,
        { schedule: { date: "2026-09-01", startTime: "20:00", durationMinutes: 60 } },
        { source: "task_detail" },
      );
      await flushPromises();
    });

    // On Aug 31, it is absent
    expect(getState().timedItemsWithLayout.find((i) => i.id === "task-move-1")).toBeUndefined();

    // Switch selected date to Sep 1: it is present
    await act(async () => {
      getState().setSelectedDate("2026-09-01");
      await flushPromises();
    });
    expect(getState().timedItemsWithLayout.find((i) => i.id === "task-move-1")).toBeDefined();
    expect(getState().timedItemsWithLayout.find((i) => i.id === "task-move-1")?.startHour).toBe(20);

    await unmount();
  });

  test("Test E — all-day/timed transitions synchronize back and forth cleanly", async () => {
    const allDayTask: Task = {
      id: "task-trans-1",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Transition Task",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-31" },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTasks([allDayTask], INBOX_WORKSPACE_ID);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    // 1. Starts as all-day
    expect(getState().allDayItems.find((i) => i.id === "task-trans-1")).toBeDefined();
    expect(getState().timedItemsWithLayout.find((i) => i.id === "task-trans-1")).toBeUndefined();

    // 2. Edit all-day -> 20:00
    await act(async () => {
      await EntityCommandService.updateTask(
        allDayTask.id,
        INBOX_WORKSPACE_ID,
        { schedule: { date: "2026-08-31", startTime: "20:00", durationMinutes: 60 } },
        { source: "task_detail" },
      );
      await flushPromises();
    });

    expect(getState().allDayItems.find((i) => i.id === "task-trans-1")).toBeUndefined();
    expect(getState().timedItemsWithLayout.find((i) => i.id === "task-trans-1")?.startHour).toBe(20);

    // 3. Edit 20:00 -> all-day
    await act(async () => {
      await EntityCommandService.updateTask(
        allDayTask.id,
        INBOX_WORKSPACE_ID,
        { schedule: { date: "2026-08-31", startTime: undefined, durationMinutes: undefined } },
        { source: "task_detail" },
      );
      await flushPromises();
    });

    expect(getState().allDayItems.find((i) => i.id === "task-trans-1")).toBeDefined();
    expect(getState().timedItemsWithLayout.find((i) => i.id === "task-trans-1")).toBeUndefined();

    await unmount();
  });
});
