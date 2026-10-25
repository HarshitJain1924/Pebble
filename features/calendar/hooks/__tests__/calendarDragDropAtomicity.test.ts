import React from "react";
import { act, create } from "react-test-renderer";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), setParams: jest.fn() }),
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: any) => {
      React.useEffect(() => {
        cb();
      }, [cb]);
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
import { calculateRescheduledTask } from "@/services/scheduling/scheduling.service";

describe("Calendar Drag/Drop Atomicity & Non-Creation (Fix #17)", () => {
  const taskA: Task = {
    id: "TASK_A",
    workspaceId: INBOX_WORKSPACE_ID,
    title: "Study Kubernetes",
    status: "todo",
    priority: "high",
    schedule: { date: "2026-08-31", startTime: "20:00", durationMinutes: 60 },
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();

    await WorkspaceRepository.saveWorkspaces([
      { id: "ws-1", name: "Main", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ]);
    await UiStateRepository.saveUiState({ activeWorkspaceId: "ws-1" });
    await TaskRepository.saveTasks([taskA], INBOX_WORKSPACE_ID);
  });

  async function renderCalendarHook() {
    let hookResult: ReturnType<typeof useCalendarState> = null as any;
    function TestComponent() {
      hookResult = useCalendarState();
      return null;
    }
    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(TestComponent));
      await new Promise((r) => setTimeout(r, 20));
    });
    return {
      getHook: () => hookResult,
      unmount: async () => {
        await act(async () => {
          renderer.unmount();
        });
      },
    };
  }

  test("Test A: dragging existing task updates schedule on the same entity identity", async () => {
    const { getHook, unmount } = await renderCalendarHook();

    // Verify initial state
    expect(getHook().allTodos.length).toBe(1);
    expect(getHook().allTodos[0].id).toBe("TASK_A");
    expect(getHook().allTodos[0].schedule?.startTime).toBe("20:00");

    // Perform rescheduling to 21:00 on 2026-08-31 via updateTask
    const updates = calculateRescheduledTask(taskA, { hour: 21 }, "2026-08-31");
    const updated = await EntityCommandService.updateTask(taskA.id, INBOX_WORKSPACE_ID, updates);

    expect(updated.id).toBe("TASK_A");
    expect(updated.schedule?.date).toBe("2026-08-31");
    expect(updated.schedule?.startTime).toBe("21:00");

    // Verify repository state directly
    const persisted = await TaskRepository.getTask("TASK_A", INBOX_WORKSPACE_ID);
    expect(persisted?.id).toBe("TASK_A");
    expect(persisted?.schedule?.startTime).toBe("21:00");
    expect(persisted?.schedule?.date).toBe("2026-08-31");

    await unmount();
  });

  test("Test B: dragging does NOT create duplicate tasks or alter workspace tasks count", async () => {
    const { getHook, unmount } = await renderCalendarHook();

    // Reschedule to another date: 2026-09-01
    const updates = calculateRescheduledTask(taskA, { date: "2026-09-01" });
    const updated = await EntityCommandService.updateTask(taskA.id, INBOX_WORKSPACE_ID, updates);

    expect(updated.id).toBe("TASK_A");
    expect(updated.schedule?.date).toBe("2026-09-01");
    expect(updated.schedule?.startTime).toBe("20:00"); // preserved

    const allTasksInRepo = await TaskRepository.getTasks(INBOX_WORKSPACE_ID);
    const taskIds = Object.keys(allTasksInRepo);

    // Assert strictly only ONE task exists with original ID
    expect(taskIds).toEqual(["TASK_A"]);
    expect(taskIds.length).toBe(1);

    await unmount();
  });

  test("Test C: failure in persistence preserves original schedule without corrupting entity", async () => {
    const originalPersisted = await TaskRepository.getTask("TASK_A", INBOX_WORKSPACE_ID);
    expect(originalPersisted?.schedule?.startTime).toBe("20:00");

    // Simulate repository failure
    const saveSpy = jest.spyOn(TaskRepository, "saveTaskUnlocked").mockImplementationOnce(async () => {
      throw new Error("Disk write failed");
    });

    let threw = false;
    try {
      const updates = calculateRescheduledTask(taskA, { hour: 10 }, "2026-08-31");
      await EntityCommandService.updateTask(taskA.id, INBOX_WORKSPACE_ID, updates);
    } catch (err: any) {
      threw = true;
      expect(err.message).toBe("Disk write failed");
    }

    expect(threw).toBe(true);

    // Verify task in repository still has original unmutated schedule
    saveSpy.mockRestore();
    const afterFailedPersist = await TaskRepository.getTask("TASK_A", INBOX_WORKSPACE_ID);
    expect(afterFailedPersist?.id).toBe("TASK_A");
    expect(afterFailedPersist?.schedule?.startTime).toBe("20:00");
    expect(afterFailedPersist?.schedule?.date).toBe("2026-08-31");
  });

  test("Test D: calendar timeline projection updates atomically from old date/time to new date/time", async () => {
    const { getHook, unmount } = await renderCalendarHook();

    // 1. On August 31, TASK_A is at 20:00
    await act(async () => {
      getHook().setSelectedDate("2026-08-31");
    });
    const itemsAug31 = getHook().timelineItems.filter((i) => i.id === "TASK_A");
    expect(itemsAug31.length).toBe(1);
    expect(itemsAug31[0].startHour).toBe(20);

    // 2. Move TASK_A to September 1 at 21:00
    const updates = {
      schedule: {
        ...taskA.schedule,
        date: "2026-09-01",
        startTime: "21:00",
      },
    };
    await act(async () => {
      await EntityCommandService.updateTask(taskA.id, INBOX_WORKSPACE_ID, updates);
      await new Promise((r) => setTimeout(r, 20));
    });

    // Emit event and re-check calendar projection
    await act(async () => {
      getHook().setSelectedDate("2026-08-31");
    });
    // Trigger storage load to update hook state
    await act(async () => {
      getHook().setSelectedDate("2026-09-01");
    });

    // On September 1, TASK_A is now at 21:00
    const itemsSep01 = getHook().timelineItems.filter((i) => i.id === "TASK_A");
    expect(itemsSep01.length).toBe(1);
    expect(itemsSep01[0].startHour).toBe(21);

    // On August 31, TASK_A is absent
    await act(async () => {
      getHook().setSelectedDate("2026-08-31");
    });
    const itemsAug31After = getHook().timelineItems.filter((i) => i.id === "TASK_A");
    expect(itemsAug31After.length).toBe(0);

    await unmount();
  });
});
