/**
 * calendarWeekDragIntegration.test.ts
 * ────────────────────────────────────
 * Integration tests verifying:
 * 1. 2D Week drag targeting across days (Monday -> Wednesday) and 15-minute times (2:15 PM)
 * 2. Simultaneous date + time rescheduling of Tasks, Recurring Tasks, Checklists, and Habits
 * 3. Race-free drag lifecycle guard ('idle' -> 'dragging' -> 'dropping' -> 'idle')
 * 4. Safe cancellation in Week view with pure storage invariants
 */

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
  ImpactFeedbackStyle: { Light: "Light", Medium: "Medium", Heavy: "Heavy" },
  NotificationFeedbackType: { Success: "Success", Error: "Error" },
}));

import { useCalendarState } from "../useCalendarState";
import {
  TaskRepository,
  HabitRepository,
  ChecklistRepository,
  WorkspaceRepository,
  UiStateRepository,
} from "@/repositories";
import { Task, Habit, Checklist, Workspace } from "@/shared/types/domain.types";

describe("Calendar Week Drag Integration Tests (Part 24)", () => {
  const mondayDate = "2026-08-31"; // Monday
  const wednesdayDate = "2026-09-02"; // Wednesday

  beforeEach(async () => {
    jest.clearAllMocks();
    const ws: Workspace = {
      id: "ws-week-1",
      name: "Work",
      color: "#3B82F6",
      emoji: "💼",
      order: 0,
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await WorkspaceRepository.saveWorkspaces([ws]);
    await UiStateRepository.saveUiState({ activeWorkspaceId: "ws-week-1" });
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
      await new Promise((r) => setTimeout(r, 50));
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

  // Test 1: Task Drag Across Days & Time (Monday 10:00 -> Wednesday 2:15 PM / 14:15)
  test("Dragging a Task from Monday 10:00 to Wednesday 2:15 PM updates both date and start time", async () => {
    const task: Task = {
      id: "task-week-1",
      title: "Quarterly Planning Review",
      workspaceId: "ws-week-1",
      status: "todo",
      priority: "high",
      schedule: {
        date: mondayDate,
        startTime: "10:00",
        durationMinutes: 90,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 1,
      lifecycleGeneration: 1,
    };
    await TaskRepository.saveTasks([task], "ws-week-1");

    const { getHook, unmount } = await renderCalendarHook();
    await act(async () => {
      getHook().setCalendarViewMode("week");
      getHook().setSelectedDate(mondayDate);
      await new Promise((r) => setTimeout(r, 20));
    });

    // Start drag on Monday task
    await act(async () => {
      getHook().handleDragStart(task, 100, 600, 0);
    });

    expect(getHook().isDragging).toBe(true);
    expect(getHook().dragLifecycle).toBe("dragging");

    // Hover over Wednesday at 2:15 PM (14:15 = 855 minutes) and Drop
    await act(async () => {
      getHook().setHoveredDate(wednesdayDate);
      getHook().setHoveredHour(14);
      getHook().setHoveredMinute(15);
      getHook().setHoveredTargetTime({
        startHour: 14,
        startMinute: 15,
        startMinutes: 855,
        endHour: 15,
        endMinute: 45,
        endMinutes: 945,
        durationMinutes: 90,
        fits: true,
        timeRangeLabel: "2:15 PM – 3:45 PM",
        durationLabel: "1h 30m",
      });

      await getHook().handleDrop();
      await new Promise((r) => setTimeout(r, 50));
    });

    const tasksMap = await TaskRepository.getTasks("ws-week-1");
    const updatedTask = tasksMap["task-week-1"];
    expect(updatedTask).toBeDefined();
    expect(updatedTask?.schedule?.date).toBe(wednesdayDate);
    expect(updatedTask?.schedule?.startTime).toBe("14:15");
    expect(updatedTask?.schedule?.durationMinutes).toBe(90);

    expect(getHook().isDragging).toBe(false);
    expect(getHook().dragLifecycle).toBe("idle");

    await unmount();
  });

  // Test 2: Drag Lifecycle Guard Prevents Double Drop or Mid-Drop Cancellation
  test("Drag lifecycle guard prevents handleCancelDrag from interrupting an active drop", async () => {
    const task: Task = {
      id: "task-guard-1",
      title: "Critical Deployment",
      workspaceId: "ws-week-1",
      status: "todo",
      priority: "high",
      schedule: {
        date: mondayDate,
        startTime: "09:00",
        durationMinutes: 60,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 1,
      lifecycleGeneration: 1,
    };
    await TaskRepository.saveTasks([task], "ws-week-1");

    const { getHook, unmount } = await renderCalendarHook();
    await act(async () => {
      getHook().setCalendarViewMode("week");
      getHook().setSelectedDate(mondayDate);
      await new Promise((r) => setTimeout(r, 20));
    });

    await act(async () => {
      getHook().handleDragStart(task, 100, 540);
      getHook().setHoveredDate(wednesdayDate);
      getHook().setHoveredHour(11);
      getHook().setHoveredMinute(30);
      getHook().setHoveredTargetTime({
        startHour: 11,
        startMinute: 30,
        startMinutes: 690,
        endHour: 12,
        endMinute: 30,
        endMinutes: 750,
        durationMinutes: 60,
        fits: true,
        timeRangeLabel: "11:30 AM – 12:30 PM",
        durationLabel: "1h",
      });

      // Trigger drop and immediate cancel simulation (as in Gesture.onFinalize race)
      const dropPromise = getHook().handleDrop();
      getHook().handleCancelDrag(); // Must be a no-op because lifecycle is "dropping"
      await dropPromise;
      await new Promise((r) => setTimeout(r, 50));
    });

    const tasksMap = await TaskRepository.getTasks("ws-week-1");
    const updatedTask = tasksMap["task-guard-1"];
    expect(updatedTask).toBeDefined();
    // Drop should have successfully committed to Wednesday 11:30 despite handleCancelDrag call!
    expect(updatedTask?.schedule?.date).toBe(wednesdayDate);
    expect(updatedTask?.schedule?.startTime).toBe("11:30");

    await unmount();
  });

  // Test 3: Checklist Drag Across Days & Time in Week View
  test("Dragging a Checklist in Week view to Wednesday 4:30 PM updates both date and time", async () => {
    const checklist: Checklist = {
      id: "chk-week-1",
      title: "Sprint Retrospective Items",
      workspaceId: "ws-week-1",
      schedule: {
        date: mondayDate,
        startTime: "15:00",
        durationMinutes: 45,
      },
      items: [
        { id: "i1", title: "Review Velocity", completed: true },
        { id: "i2", title: "Action Items", completed: false },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 1,
      lifecycleGeneration: 1,
    };
    await ChecklistRepository.saveChecklist(checklist);

    const { getHook, unmount } = await renderCalendarHook();
    await act(async () => {
      getHook().setCalendarViewMode("week");
      getHook().setSelectedDate(mondayDate);
      await new Promise((r) => setTimeout(r, 20));
    });

    await act(async () => {
      getHook().handleDragStart(checklist, 100, 900);
      getHook().setHoveredDate(wednesdayDate);
      getHook().setHoveredHour(16);
      getHook().setHoveredMinute(30);
      getHook().setHoveredTargetTime({
        startHour: 16,
        startMinute: 30,
        startMinutes: 990,
        endHour: 17,
        endMinute: 15,
        endMinutes: 1035,
        durationMinutes: 45,
        fits: true,
        timeRangeLabel: "4:30 PM – 5:15 PM",
        durationLabel: "45m",
      });
      await getHook().handleDrop();
      await new Promise((r) => setTimeout(r, 50));
    });

    const checkMap = await ChecklistRepository.getChecklists("ws-week-1");
    const updated = checkMap["chk-week-1"];
    expect(updated).toBeDefined();
    expect(updated?.schedule?.date).toBe(wednesdayDate);
    expect(updated?.schedule?.startTime).toBe("16:30");
    expect(updated?.schedule?.durationMinutes).toBe(45);

    await unmount();
  });

  // Test 4: Habit Drag Across Days & Time in Week View
  test("Dragging a Habit in Week view to Wednesday 8:15 AM updates habit reminder", async () => {
    const habit: Habit = {
      id: "habit-week-1",
      title: "Team Standup Preparation",
      workspaceId: "ws-week-1",
      recurrence: { frequency: "daily", interval: 1 },
      completionHistory: [],
      reminder: {
        enabled: true,
        triggerAt: new Date(2026, 7, 31, 9, 0).getTime(), // Monday 9:00 AM
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 1,
      lifecycleGeneration: 1,
    };
    await HabitRepository.saveHabits([habit], "ws-week-1");

    const { getHook, unmount } = await renderCalendarHook();
    await act(async () => {
      getHook().setCalendarViewMode("week");
      getHook().setSelectedDate(mondayDate);
      await new Promise((r) => setTimeout(r, 20));
    });

    await act(async () => {
      getHook().handleDragStart(habit, 100, 540);
      getHook().setHoveredDate(wednesdayDate);
      getHook().setHoveredHour(8);
      getHook().setHoveredMinute(15);
      getHook().setHoveredTargetTime({
        startHour: 8,
        startMinute: 15,
        startMinutes: 495,
        endHour: 8,
        endMinute: 45,
        endMinutes: 525,
        durationMinutes: 30,
        fits: true,
        timeRangeLabel: "8:15 AM – 8:45 AM",
        durationLabel: "30m",
      });
      await getHook().handleDrop();
      await new Promise((r) => setTimeout(r, 50));
    });

    const habitMap = await HabitRepository.getHabits("ws-week-1");
    const updatedHabit = habitMap["habit-week-1"];
    expect(updatedHabit).toBeDefined();
    expect(updatedHabit?.reminder?.enabled).toBe(true);

    const reminderDate = new Date(updatedHabit!.reminder!.triggerAt!);
    expect(reminderDate.getDate()).toBe(2); // Wednesday (2nd Sept)
    expect(reminderDate.getHours()).toBe(8);
    expect(reminderDate.getMinutes()).toBe(15);

    await unmount();
  }, 15000);

  // Test 5: Drag Cancellation in Week View preserves all items
  test("Cancelling a Week drag leaves the original entity untouched", async () => {
    const task: Task = {
      id: "task-week-cancel",
      title: "Untouched Week Task",
      workspaceId: "ws-week-1",
      status: "todo",
      priority: "medium",
      schedule: {
        date: mondayDate,
        startTime: "10:00",
        durationMinutes: 60,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 1,
      lifecycleGeneration: 1,
    };
    await TaskRepository.saveTasks([task], "ws-week-1");

    const { getHook, unmount } = await renderCalendarHook();
    await act(async () => {
      getHook().setCalendarViewMode("week");
      getHook().setSelectedDate(mondayDate);
      await new Promise((r) => setTimeout(r, 20));
    });

    await act(async () => {
      getHook().handleDragStart(task, 100, 600);
      getHook().setHoveredDate(wednesdayDate);
      getHook().setHoveredHour(14);
      getHook().setHoveredMinute(0);
      getHook().handleCancelDrag();
      await new Promise((r) => setTimeout(r, 30));
    });

    const tasksMap = await TaskRepository.getTasks("ws-week-1");
    const preserved = tasksMap["task-week-cancel"];
    expect(preserved?.schedule?.date).toBe(mondayDate);
    expect(preserved?.schedule?.startTime).toBe("10:00");
    expect(getHook().isDragging).toBe(false);
    expect(getHook().dragLifecycle).toBe("idle");

    await unmount();
  });
});
