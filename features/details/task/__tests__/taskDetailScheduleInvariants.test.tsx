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
import { getTodayDateKey } from "@/shared/utils/date-key";
import { getStructuredSchedule } from "@/services/scheduling/scheduling.service";

describe("Task Detail Schedule Invariants & Calendar Integration (Fix #21)", () => {
  const todayKey = getTodayDateKey();

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();

    await WorkspaceRepository.saveWorkspaces([
      { id: "ws-1", name: "Main", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ]);
    await UiStateRepository.saveUiState({ activeWorkspaceId: "ws-1" });
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

  test("Test A: edit all-day Task to timed schedules 20:00 and projects on timeline", async () => {
    const allDayTask: Task = {
      id: "task-edit-1",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Study Kubernetes",
      status: "todo",
      priority: "high",
      schedule: { date: todayKey },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTasks([allDayTask], INBOX_WORKSPACE_ID);

    // Perform edit flow: set startTime = "20:00", durationMinutes = 60
    const updatedSchedule = {
      ...allDayTask.schedule,
      date: todayKey,
      startTime: "20:00",
      durationMinutes: 60,
    };
    const saved = await EntityCommandService.updateTask(
      allDayTask.id,
      INBOX_WORKSPACE_ID,
      { schedule: updatedSchedule },
      { source: "task_detail", skipEvents: true },
    );

    expect(saved.schedule?.date).toBe(todayKey);
    expect(saved.schedule?.startTime).toBe("20:00");
    expect(saved.schedule?.durationMinutes).toBe(60);

    // Verify in Calendar projection
    const { getHook, unmount } = await renderCalendarHook();
    await act(async () => {
      getHook().setSelectedDate(todayKey);
    });

    const inTimed = getHook().timedItemsWithLayout.find((i) => i.id === "task-edit-1");
    expect(inTimed).toBeDefined();
    expect(inTimed?.startHour).toBe(20);
    expect(inTimed?.startMinute).toBe(0);
    expect(inTimed?.durationMinutes).toBe(60);

    const inAllDay = getHook().allDayItems.find((i) => i.id === "task-edit-1");
    expect(inAllDay).toBeUndefined();

    await unmount();
  });

  test("Test B: edit timed Task to all-day removes startTime without synthesizing '00:00'", async () => {
    const timedTask: Task = {
      id: "task-edit-2",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Team Retrospective",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-31", startTime: "20:00", durationMinutes: 90 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTasks([timedTask], INBOX_WORKSPACE_ID);

    // User clears time in Task Detail
    const updatedSchedule = {
      ...timedTask.schedule,
      date: "2026-08-31",
      startTime: undefined,
      durationMinutes: undefined,
    };
    const saved = await EntityCommandService.updateTask(
      timedTask.id,
      INBOX_WORKSPACE_ID,
      { schedule: updatedSchedule },
      { source: "task_detail", skipEvents: true },
    );

    expect(saved.schedule?.date).toBe("2026-08-31");
    expect(saved.schedule?.startTime).toBeUndefined();
    expect(saved.schedule?.durationMinutes).toBeUndefined();

    // Verify Calendar projection
    const { getHook, unmount } = await renderCalendarHook();
    await act(async () => {
      getHook().setSelectedDate("2026-08-31");
    });

    const inAllDay = getHook().allDayItems.find((i) => i.id === "task-edit-2");
    expect(inAllDay).toBeDefined();
    expect(inAllDay?.timeLabel).toBe("All Day");
    expect(inAllDay?.startHour).toBeUndefined();

    const inTimed = getHook().timedItemsWithLayout.find((i) => i.id === "task-edit-2");
    expect(inTimed).toBeUndefined();

    await unmount();
  });

  test("Test C: changing start time from 20:00 to 21:00 preserves existing 90-minute duration", async () => {
    const timedTask: Task = {
      id: "task-edit-3",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "System Architecture",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-31", startTime: "20:00", durationMinutes: 90 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTasks([timedTask], INBOX_WORKSPACE_ID);

    // Edit start time to 21:00, preserving existing durationMinutes
    const updatedSchedule = {
      ...timedTask.schedule,
      date: "2026-08-31",
      startTime: "21:00",
      durationMinutes: timedTask.schedule?.durationMinutes,
    };
    const saved = await EntityCommandService.updateTask(
      timedTask.id,
      INBOX_WORKSPACE_ID,
      { schedule: updatedSchedule },
      { source: "task_detail", skipEvents: true },
    );

    expect(saved.schedule?.startTime).toBe("21:00");
    expect(saved.schedule?.durationMinutes).toBe(90);

    const sched = getStructuredSchedule(saved);
    expect(sched.startTime).toEqual({ hour: 21, minute: 0 });
    expect(sched.duration).toBe(90);
  });

  test("Test D: moving scheduled task to inbox clears calendar schedule cleanly", async () => {
    const scheduledTask: Task = {
      id: "task-edit-4",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Inbox Transfer",
      status: "todo",
      priority: "low",
      schedule: { date: "2026-08-31", startTime: "10:00" },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTasks([scheduledTask], INBOX_WORKSPACE_ID);

    const updatedSchedule = {
      date: "inbox",
      startTime: undefined,
      durationMinutes: undefined,
    };
    const saved = await EntityCommandService.updateTask(
      scheduledTask.id,
      INBOX_WORKSPACE_ID,
      { schedule: updatedSchedule },
      { source: "task_detail", skipEvents: true },
    );

    expect(saved.schedule?.date).toBe("inbox");
    expect(saved.schedule?.startTime).toBeUndefined();

    // Verify absent on Calendar
    const { getHook, unmount } = await renderCalendarHook();
    await act(async () => {
      getHook().setSelectedDate("2026-08-31");
    });
    expect(getHook().timelineItems.find((i) => i.id === "task-edit-4")).toBeUndefined();

    await unmount();
  });

  test("Test E: setting schedule time to 20:00 does not implicitly generate a reminder", async () => {
    const task: Task = {
      id: "task-edit-5",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "No Reminder Test",
      status: "todo",
      priority: "medium",
      schedule: { date: todayKey },
      reminder: undefined,
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTasks([task], INBOX_WORKSPACE_ID);

    const updatedSchedule = {
      ...task.schedule,
      startTime: "20:00",
    };
    const saved = await EntityCommandService.updateTask(
      task.id,
      INBOX_WORKSPACE_ID,
      { schedule: updatedSchedule, reminder: undefined },
      { source: "task_detail", skipEvents: true },
    );

    expect(saved.schedule?.startTime).toBe("20:00");
    expect(saved.reminder).toBeUndefined();
  });

  test("Test F: edited task appears on today's calendar timeline at 20:00", async () => {
    const task: Task = {
      id: "task-edit-6",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Evening Review",
      status: "todo",
      priority: "medium",
      schedule: { date: todayKey, startTime: "20:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTasks([task], INBOX_WORKSPACE_ID);

    const { getHook, unmount } = await renderCalendarHook();
    await act(async () => {
      getHook().setSelectedDate(todayKey);
    });

    const item = getHook().timedItemsWithLayout.find((i) => i.id === "task-edit-6");
    expect(item).toBeDefined();
    expect(item?.startHour).toBe(20);
    expect(item?.startMinute).toBe(0);
    expect(item?.timeLabel).toBe("8:00 PM");

    await unmount();
  });
});
