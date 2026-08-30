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
  ImpactFeedbackStyle: { Medium: "Medium", Light: "Light" },
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
import {
  getStructuredSchedule,
  calculateRescheduledTask,
} from "@/services/scheduling/scheduling.service";

describe("Preserve Timed Task Duration in Calendar (Fix #19)", () => {
  const task30: Task = {
    id: "task-30m",
    workspaceId: INBOX_WORKSPACE_ID,
    title: "Quick Standup",
    status: "todo",
    priority: "medium",
    schedule: { date: "2026-08-31", startTime: "09:00", durationMinutes: 30 },
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  const task90: Task = {
    id: "task-90m",
    workspaceId: INBOX_WORKSPACE_ID,
    title: "Architecture Review",
    status: "todo",
    priority: "high",
    schedule: { date: "2026-08-31", startTime: "20:00", durationMinutes: 90 },
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  const task120: Task = {
    id: "task-120m",
    workspaceId: INBOX_WORKSPACE_ID,
    title: "Deep Work Session",
    status: "todo",
    priority: "high",
    schedule: { date: "2026-08-31", startTime: "14:00", durationMinutes: 120 },
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  const taskNoDuration: Task = {
    id: "task-no-dur",
    workspaceId: INBOX_WORKSPACE_ID,
    title: "Default Duration Task",
    status: "todo",
    priority: "low",
    schedule: { date: "2026-08-31", startTime: "10:00" }, // No durationMinutes
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
    await TaskRepository.saveTasks([task30, task90, task120, taskNoDuration], INBOX_WORKSPACE_ID);
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

  test("Test A: projection preserves variable durations (30m, 90m, 120m)", async () => {
    const { getHook, unmount } = await renderCalendarHook();

    await act(async () => {
      getHook().setSelectedDate("2026-08-31");
    });

    const item30 = getHook().timedItemsWithLayout.find((i) => i.id === "task-30m");
    expect(item30).toBeDefined();
    expect(item30?.durationMinutes).toBe(30);

    const item90 = getHook().timedItemsWithLayout.find((i) => i.id === "task-90m");
    expect(item90).toBeDefined();
    expect(item90?.durationMinutes).toBe(90);

    const item120 = getHook().timedItemsWithLayout.find((i) => i.id === "task-120m");
    expect(item120).toBeDefined();
    expect(item120?.durationMinutes).toBe(120);

    await unmount();
  });

  test("Test B: drag/drop to a new start time preserves durationMinutes in persistence", async () => {
    // Move 90-minute task from 20:00 to 22:00
    const updates = calculateRescheduledTask(task90, { hour: 22 }, "2026-08-31");
    const updated = await EntityCommandService.updateTask(task90.id, INBOX_WORKSPACE_ID, updates);

    expect(updated.id).toBe("task-90m");
    expect(updated.schedule?.startTime).toBe("22:00");
    expect(updated.schedule?.durationMinutes).toBe(90);

    // Verify persistence
    const persisted = await TaskRepository.getTask("task-90m", INBOX_WORKSPACE_ID);
    expect(persisted?.schedule?.startTime).toBe("22:00");
    expect(persisted?.schedule?.durationMinutes).toBe(90);
  });

  test("Test C: missing duration uses safe default in projection without mutating persisted entity", async () => {
    const { getHook, unmount } = await renderCalendarHook();

    await act(async () => {
      getHook().setSelectedDate("2026-08-31");
    });

    const itemNoDur = getHook().timedItemsWithLayout.find((i) => i.id === "task-no-dur");
    expect(itemNoDur).toBeDefined();
    expect(itemNoDur?.durationMinutes).toBe(60); // Canonical default

    // Assert that Task in storage still does NOT have durationMinutes written
    const persisted = await TaskRepository.getTask("task-no-dur", INBOX_WORKSPACE_ID);
    expect(persisted?.schedule?.durationMinutes).toBeUndefined();

    await unmount();
  });

  test("Test D: persistence failure does not corrupt or overwrite duration", async () => {
    const saveSpy = jest.spyOn(TaskRepository, "saveTaskUnlocked").mockImplementationOnce(async () => {
      throw new Error("Disk error");
    });

    let threw = false;
    try {
      const updates = calculateRescheduledTask(task90, { hour: 21 }, "2026-08-31");
      await EntityCommandService.updateTask(task90.id, INBOX_WORKSPACE_ID, updates);
    } catch (err: any) {
      threw = true;
      expect(err.message).toBe("Disk error");
    }

    expect(threw).toBe(true);
    saveSpy.mockRestore();

    const persisted = await TaskRepository.getTask("task-90m", INBOX_WORKSPACE_ID);
    expect(persisted?.schedule?.startTime).toBe("20:00");
    expect(persisted?.schedule?.durationMinutes).toBe(90);
  });

  test("Test E: late evening task crossing midnight preserves 120m duration and schedule date", () => {
    const lateTask: Task = {
      id: "task-late-120",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Midnight Hackathon",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-31", startTime: "23:30", durationMinutes: 120 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    const sched = getStructuredSchedule(lateTask);
    expect(sched.startDate).toBe("2026-08-31");
    expect(sched.startTime).toEqual({ hour: 23, minute: 30 });
    expect(sched.duration).toBe(120);
    expect(sched.sortKey).toBe(23 * 60 + 30);
  });
});
