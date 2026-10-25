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

describe("Preserve All-Day Task Semantics in Calendar (Fix #18)", () => {
  const allDayTask: Task = {
    id: "task-allday-1",
    workspaceId: INBOX_WORKSPACE_ID,
    title: "Read Documentation",
    status: "todo",
    priority: "medium",
    schedule: { date: "2026-08-31" }, // No startTime, no durationMinutes
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  const timedTask: Task = {
    id: "task-timed-1",
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
    await TaskRepository.saveTasks([allDayTask, timedTask], INBOX_WORKSPACE_ID);
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

  test("Test A: all-day projection places all-day task into allDayItems and excludes it from timed timeline", async () => {
    const { getHook, unmount } = await renderCalendarHook();

    await act(async () => {
      getHook().setSelectedDate("2026-08-31");
    });

    // Verify allDayItems contains allDayTask
    const inAllDay = getHook().allDayItems.find((item) => item.id === "task-allday-1");
    expect(inAllDay).toBeDefined();
    expect(inAllDay?.timeLabel).toBe("All Day");
    expect(inAllDay?.startHour).toBeUndefined();
    expect(inAllDay?.startMinute).toBeUndefined();

    // Verify timedItemsWithLayout does NOT contain allDayTask
    const inTimed = getHook().timedItemsWithLayout.find((item) => item.id === "task-allday-1");
    expect(inTimed).toBeUndefined();

    await unmount();
  });

  test("Test B: no synthesized time is generated or persisted during projection", async () => {
    const { getHook, unmount } = await renderCalendarHook();

    await act(async () => {
      getHook().setSelectedDate("2026-08-31");
    });

    const sched = getStructuredSchedule(allDayTask);
    expect(sched.startDate).toBe("2026-08-31");
    expect(sched.startTime).toBeUndefined();
    expect(sched.sortKey).toBe(24 * 60);

    // Verify repository persisted Task remains strictly without startTime
    const persisted = await TaskRepository.getTask("task-allday-1", INBOX_WORKSPACE_ID);
    expect(persisted?.schedule?.startTime).toBeUndefined();
    expect(persisted?.schedule?.date).toBe("2026-08-31");

    await unmount();
  });

  test("Test C: all-day task drag/drop to another date preserves absence of startTime", async () => {
    const updates = calculateRescheduledTask(allDayTask, { date: "2026-09-01" });
    const updated = await EntityCommandService.updateTask(allDayTask.id, INBOX_WORKSPACE_ID, updates);

    expect(updated.id).toBe("task-allday-1");
    expect(updated.schedule?.date).toBe("2026-09-01");
    expect(updated.schedule?.startTime).toBeUndefined();

    // Check persistent storage
    const persisted = await TaskRepository.getTask("task-allday-1", INBOX_WORKSPACE_ID);
    expect(persisted?.schedule?.date).toBe("2026-09-01");
    expect(persisted?.schedule?.startTime).toBeUndefined();
  });

  test("Test D: explicit move to an hourly slot transitions all-day task to timed with startTime", async () => {
    // Explicitly dropping onto 14:00 (2 PM)
    const updates = calculateRescheduledTask(allDayTask, { hour: 14 }, "2026-08-31");
    const updated = await EntityCommandService.updateTask(allDayTask.id, INBOX_WORKSPACE_ID, updates);

    expect(updated.id).toBe("task-allday-1");
    expect(updated.schedule?.date).toBe("2026-08-31");
    expect(updated.schedule?.startTime).toBe("14:00");

    const sched = getStructuredSchedule(updated);
    expect(sched.startTime).toEqual({ hour: 14, minute: 0 });
    expect(sched.sortKey).toBe(14 * 60);
  });

  test("Test E: existing timed task remains in timed timeline and is excluded from allDayItems", async () => {
    const { getHook, unmount } = await renderCalendarHook();

    await act(async () => {
      getHook().setSelectedDate("2026-08-31");
    });

    // Verify timedTask is in timedItemsWithLayout
    const inTimed = getHook().timedItemsWithLayout.find((item) => item.id === "task-timed-1");
    expect(inTimed).toBeDefined();
    expect(inTimed?.startHour).toBe(20);
    expect(inTimed?.startMinute).toBe(0);
    expect(inTimed?.timeLabel).toBe("8:00 PM");

    // Verify timedTask is NOT in allDayItems
    const inAllDay = getHook().allDayItems.find((item) => item.id === "task-timed-1");
    expect(inAllDay).toBeUndefined();

    await unmount();
  });
});
