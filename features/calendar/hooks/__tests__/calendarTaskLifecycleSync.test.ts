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
  RecycleBinRepository,
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

describe("Calendar Task Lifecycle Synchronization & Deletion Exclusion (Fix #23)", () => {
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

  test("Test A & B — normal deletion/recycle removes Calendar item and updates persistence truth", async () => {
    const task: Task = {
      id: "task-del-1",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Task to Recycle",
      status: "todo",
      priority: "high",
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

    // 1. Initially present on Calendar
    expect(getState().timedItemsWithLayout.find((i) => i.id === "task-del-1")).toBeDefined();

    // 2. Recycle task via EntityCommandService (emits tasks_changed)
    await act(async () => {
      await EntityCommandService.recycleTask(task.id, INBOX_WORKSPACE_ID, "Inbox");
      await flushPromises();
    });

    // 3. Calendar no longer projects that Task
    expect(getState().timedItemsWithLayout.find((i) => i.id === "task-del-1")).toBeUndefined();
    expect(getState().allTodos.find((t) => t.id === "task-del-1")).toBeUndefined();

    // 4. Persistence truth: deleted from TaskRepository, present in RecycleBinRepository
    const inRepo = await TaskRepository.getTask(task.id, INBOX_WORKSPACE_ID);
    expect(inRepo).toBeNull();

    const binItems = await RecycleBinRepository.getRecycleBinItems();
    expect(binItems.some((b) => b.entityId === task.id)).toBe(true);

    await unmount();
  });

  test("Test C — stale load cannot resurrect deleted Task", async () => {
    const activeTask: Task = {
      id: "task-res-race-1",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Resurrection Test Task",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-31", startTime: "20:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTasks([activeTask], INBOX_WORKSPACE_ID);

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
      if (wsId === INBOX_WORKSPACE_ID) {
        callCount++;
        if (callCount === 1) return deferredA.promise;
        if (callCount === 2) return deferredB.promise;
      }
      return origGetTasks(wsId);
    });

    try {
      // 1. Trigger Load A (reads active task)
      act(() => {
        emitStateChange("tasks_changed", "test");
      });
      await act(async () => {
        await flushPromises();
      });
      expect(callCount).toBe(1);

      // 2. Trigger Load B (e.g. after recycle)
      act(() => {
        emitStateChange("tasks_changed", "test");
      });
      await act(async () => {
        await flushPromises();
      });
      expect(callCount).toBe(2);

      // 3. Resolve Load B first with recycled/empty repository
      await act(async () => {
        deferredB.resolve({});
        await flushPromises();
      });

      // Verify Calendar state is empty
      expect(getState().allTodos.find((t) => t.id === "task-res-race-1")).toBeUndefined();

      // 4. Resolve Load A afterward with active task data
      await act(async () => {
        deferredA.resolve({ [activeTask.id]: activeTask });
        await flushPromises();
      });

      // Calendar MUST NOT resurrect the deleted task
      expect(getState().allTodos.find((t) => t.id === "task-res-race-1")).toBeUndefined();
      expect(getState().timedItemsWithLayout.find((i) => i.id === "task-res-race-1")).toBeUndefined();
    } finally {
      getTasksSpy.mockRestore();
    }

    await unmount();
  });

  test("Test D & E — restore returns item to Calendar with preserved schedule semantics", async () => {
    const task: Task = {
      id: "task-restore-1",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Restorable Task",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-31", startTime: "20:00", durationMinutes: 90 },
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

    // 1. Verify active initially
    expect(getState().timedItemsWithLayout.find((i) => i.id === "task-restore-1")?.startHour).toBe(20);

    // 2. Recycle task
    await act(async () => {
      await EntityCommandService.recycleTask(task.id, INBOX_WORKSPACE_ID, "Inbox");
      await flushPromises();
    });

    // 3. Disappears from Calendar
    expect(getState().timedItemsWithLayout.find((i) => i.id === "task-restore-1")).toBeUndefined();

    // Find bin item
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    const binItem = binItems.find((b) => b.entityId === task.id);
    expect(binItem).toBeDefined();

    // 4. Restore task from Recycle Bin
    await act(async () => {
      await EntityCommandService.restoreTask(binItem!.id);
      await flushPromises();
    });

    // 5. Reappears on Calendar with preserved schedule (20:00, 90 mins)
    const restoredItem = getState().timedItemsWithLayout.find((i) => i.id === "task-restore-1");
    expect(restoredItem).toBeDefined();
    expect(restoredItem?.startHour).toBe(20);
    expect(restoredItem?.durationMinutes).toBe(90);

    await unmount();
  });

  test("Test F — recurring Task lifecycle: recycling removes all occurrences, restoring resumes recurrence", async () => {
    const recurringTask: Task = {
      id: "task-rec-life-1",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Daily Standup Meeting",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-01", startTime: "09:00", durationMinutes: 30 },
      recurrence: { frequency: "daily", interval: 1 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTasks([recurringTask], INBOX_WORKSPACE_ID);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    // Occurrence projected on Aug 31 at 09:00
    expect(getState().timedItemsWithLayout.find((i) => i.id === "task-rec-life-1")?.startHour).toBe(9);

    // Recycle recurring task
    await act(async () => {
      await EntityCommandService.recycleTask(recurringTask.id, INBOX_WORKSPACE_ID, "Inbox");
      await flushPromises();
    });

    // All occurrences removed from Calendar
    expect(getState().timedItemsWithLayout.find((i) => i.id === "task-rec-life-1")).toBeUndefined();
    expect(getState().allTodos.find((t) => t.id === "task-rec-life-1")).toBeUndefined();

    // Restore recurring task
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    const binItem = binItems.find((b) => b.entityId === recurringTask.id);
    expect(binItem).toBeDefined();

    await act(async () => {
      await EntityCommandService.restoreTask(binItem!.id);
      await flushPromises();
    });

    // Recurrence resumes cleanly on Calendar
    const restoredOccurrence = getState().timedItemsWithLayout.find((i) => i.id === "task-rec-life-1");
    expect(restoredOccurrence).toBeDefined();
    expect(restoredOccurrence?.startHour).toBe(9);
    expect(restoredOccurrence?.durationMinutes).toBe(30);

    await unmount();
  });
});
