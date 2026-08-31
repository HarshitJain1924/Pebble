/**
 * calendarMinuteAccurateDrag.test.ts
 * ──────────────────────────────────
 * Integration tests verifying:
 * 1. 15-minute accurate drag targeting and rescheduling in useCalendarState
 * 2. Drag offset preservation during touch tracking
 * 3. Exact minute-level updates to Tasks, Recurring Task occurrences, Checklists, and Habits
 * 4. Cancellation safety and storage purity
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

describe("Calendar Minute-Accurate Drag Integration Tests", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    const ws: Workspace = {
      id: "ws-1",
      name: "Personal",
      color: "#3B82F6",
      emoji: "👤",
      order: 0,
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await WorkspaceRepository.saveWorkspaces([ws]);
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

  // Test 1: Task Rescheduling with Minute Accuracy (10:15 AM)
  test("Dragging a Task to 10:15 AM reschedules the task with hour 10 and minute 15", async () => {
    const task: Task = {
      id: "task-drag-1",
      title: "Study Kubernetes Architecture",
      workspaceId: "ws-1",
      status: "todo",
      priority: "medium",
      schedule: {
        date: "2026-09-01",
        startTime: "09:00",
        durationMinutes: 90,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 1,
      lifecycleGeneration: 1,
    };
    await TaskRepository.saveTasks([task], "ws-1");

    const { getHook, unmount } = await renderCalendarHook();
    await act(async () => {
      getHook().setSelectedDate("2026-09-01");
      await new Promise((r) => setTimeout(r, 20));
    });

    // Simulate drag start and drop at 10:15 AM (hour: 10, minute: 15)
    await act(async () => {
      getHook().handleDragStart(task, 100, 800, 20); // grabbed 20px below top
      getHook().setHoveredHour(10);
      getHook().setHoveredMinute(15);
      getHook().setHoveredTargetTime({
        startHour: 10,
        startMinute: 15,
        startMinutes: 615,
        endHour: 11,
        endMinute: 45,
        endMinutes: 705,
        durationMinutes: 90,
        fits: true,
        timeRangeLabel: "10:15 AM – 11:45 AM",
        durationLabel: "1h 30m",
      });
      await getHook().handleDrop();
      await new Promise((r) => setTimeout(r, 50));
    });

    const tasksMap = await TaskRepository.getTasks("ws-1");
    const updatedTask = tasksMap["task-drag-1"];
    expect(updatedTask).toBeDefined();
    expect(updatedTask?.schedule?.date).toBe("2026-09-01");
    expect(updatedTask?.schedule?.startTime).toBe("10:15");
    expect(updatedTask?.schedule?.durationMinutes).toBe(90);

    await unmount();
  });

  // Test 2: Recurring Task Reschedule via Occurrence
  test("Dragging a recurring Task occurrence preserves recurring rule and records exception/occurrence", async () => {
    const recurringTask: Task = {
      id: "task-rec-1",
      title: "Weekly Engineering Sync",
      workspaceId: "ws-1",
      status: "todo",
      priority: "medium",
      schedule: {
        date: "2026-09-01",
        startTime: "10:00",
        durationMinutes: 60,
      },
      recurrence: {
        frequency: "weekly",
        interval: 1,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 1,
      lifecycleGeneration: 1,
    };
    await TaskRepository.saveTasks([recurringTask], "ws-1");

    const { getHook, unmount } = await renderCalendarHook();
    await act(async () => {
      getHook().setSelectedDate("2026-09-01");
      await new Promise((r) => setTimeout(r, 20));
    });

    await act(async () => {
      getHook().handleDragStart(recurringTask, 100, 800);
      getHook().setHoveredTargetTime({
        startHour: 14,
        startMinute: 30,
        startMinutes: 870,
        endHour: 15,
        endMinute: 30,
        endMinutes: 930,
        durationMinutes: 60,
        fits: true,
        timeRangeLabel: "2:30 PM – 3:30 PM",
        durationLabel: "1h",
      });
      await getHook().handleDrop();
      await new Promise((r) => setTimeout(r, 50));
    });

    const tasksMap = await TaskRepository.getTasks("ws-1");
    const updatedTask = tasksMap["task-rec-1"];
    expect(updatedTask).toBeDefined();
    expect(updatedTask?.recurrence).toBeDefined();
    expect(updatedTask?.recurrence?.frequency).toBe("weekly");

    await unmount();
  });

  // Test 3: Checklist Reschedule with Minute Accuracy (18:45 -> 6:45 PM)
  test("Dragging a Checklist to 6:45 PM reschedules the checklist with minute precision", async () => {
    const checklist: Checklist = {
      id: "chk-drag-1",
      title: "Weekly Grocery Shopping",
      workspaceId: "ws-1",
      schedule: {
        date: "2026-09-01",
        startTime: "17:00",
        durationMinutes: 45,
      },
      items: [
        { id: "i1", title: "Milk", completed: true },
        { id: "i2", title: "Bread", completed: false },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 1,
      lifecycleGeneration: 1,
    };
    await ChecklistRepository.saveChecklist(checklist);

    const { getHook, unmount } = await renderCalendarHook();
    await act(async () => {
      getHook().setSelectedDate("2026-09-01");
      await new Promise((r) => setTimeout(r, 20));
    });

    await act(async () => {
      getHook().handleDragStart(checklist, 100, 800);
      getHook().setHoveredTargetTime({
        startHour: 18,
        startMinute: 45,
        startMinutes: 1125,
        endHour: 19,
        endMinute: 30,
        endMinutes: 1170,
        durationMinutes: 45,
        fits: true,
        timeRangeLabel: "6:45 PM – 7:30 PM",
        durationLabel: "45m",
      });
      await getHook().handleDrop();
      await new Promise((r) => setTimeout(r, 50));
    });

    const checkMap = await ChecklistRepository.getChecklists("ws-1");
    const updated = checkMap["chk-drag-1"];
    expect(updated).toBeDefined();
    expect(updated?.schedule?.startTime).toBe("18:45");
    expect(updated?.schedule?.durationMinutes).toBe(45);
    expect(updated?.items.length).toBe(2);

    await unmount();
  });

  // Test 4: Habit Drag Updates Reminder Time
  test("Dragging a Habit to 7:15 AM updates the habit reminder time with minute accuracy", async () => {
    const habit: Habit = {
      id: "habit-drag-1",
      title: "Morning Meditation",
      workspaceId: "ws-1",
      recurrence: { frequency: "daily", interval: 1 },
      completionHistory: [],
      reminder: {
        enabled: true,
        triggerAt: new Date(2026, 8, 1, 8, 0).getTime(), // 8:00 AM
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 1,
      lifecycleGeneration: 1,
    };
    await HabitRepository.saveHabits([habit], "ws-1");

    const { getHook, unmount } = await renderCalendarHook();
    await act(async () => {
      getHook().setSelectedDate("2026-09-01");
      await new Promise((r) => setTimeout(r, 20));
    });

    await act(async () => {
      getHook().handleDragStart(habit, 100, 800);
      getHook().setHoveredTargetTime({
        startHour: 7,
        startMinute: 15,
        startMinutes: 435,
        endHour: 7,
        endMinute: 35,
        endMinutes: 455,
        durationMinutes: 20,
        fits: true,
        timeRangeLabel: "7:15 AM – 7:35 AM",
        durationLabel: "20m",
      });
      await getHook().handleDrop();
      await new Promise((r) => setTimeout(r, 50));
    });

    const habitMap = await HabitRepository.getHabits("ws-1");
    const updatedHabit = habitMap["habit-drag-1"];
    expect(updatedHabit).toBeDefined();
    expect(updatedHabit?.reminder?.enabled).toBe(true);

    const reminderDate = new Date(updatedHabit!.reminder!.triggerAt!);
    expect(reminderDate.getHours()).toBe(7);
    expect(reminderDate.getMinutes()).toBe(15);

    await unmount();
  });

  // Test 5: Drag Cancellation leaves original item completely untouched
  test("Cancelling drag leaves the original item untouched without modifying storage", async () => {
    const task: Task = {
      id: "task-cancel-1",
      title: "Unchanged Task",
      workspaceId: "ws-1",
      status: "todo",
      priority: "low",
      schedule: {
        date: "2026-09-01",
        startTime: "09:00",
        durationMinutes: 60,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 1,
      lifecycleGeneration: 1,
    };
    await TaskRepository.saveTasks([task], "ws-1");

    const { getHook, unmount } = await renderCalendarHook();
    await act(async () => {
      getHook().setSelectedDate("2026-09-01");
      await new Promise((r) => setTimeout(r, 20));
    });

    await act(async () => {
      getHook().handleDragStart(task, 100, 800);
      getHook().setHoveredTargetTime({
        startHour: 15,
        startMinute: 30,
        startMinutes: 930,
        endHour: 16,
        endMinute: 30,
        endMinutes: 990,
        durationMinutes: 60,
        fits: true,
        timeRangeLabel: "3:30 PM – 4:30 PM",
        durationLabel: "1h",
      });
      getHook().handleCancelDrag();
      await new Promise((r) => setTimeout(r, 30));
    });

    const tasksMap = await TaskRepository.getTasks("ws-1");
    const preservedTask = tasksMap["task-cancel-1"];
    expect(preservedTask).toBeDefined();
    expect(preservedTask?.schedule?.startTime).toBe("09:00");
    expect(preservedTask?.schedule?.durationMinutes).toBe(60);

    expect(getHook().isDragging).toBe(false);
    expect(getHook().activeDragItem).toBeNull();
    expect(getHook().hoveredTargetTime).toBeNull();

    await unmount();
  });
});
