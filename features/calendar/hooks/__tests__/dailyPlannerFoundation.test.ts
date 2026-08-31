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
import {
  useCalendarState,
  calculateInitialTimelineScrollOffset,
  calculateCurrentTimePosition,
  formatCurrentTimeLabel,
} from "@/features/calendar/hooks/useCalendarState";
import {
  TaskRepository,
  HabitRepository,
  WorkspaceRepository,
  UiStateRepository,
} from "@/repositories";
import { Task, Habit, Workspace, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";

const flushPromises = () => new Promise((r) => setImmediate(r));

const ws1: Workspace = {
  id: "ws-1",
  name: "Main Workspace",
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1000,
  updatedAt: 1000,
};

const wsOther: Workspace = {
  id: "ws-other",
  name: "Other Workspace",
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1000,
  updatedAt: 1000,
};

describe("Daily Planner Foundation Tests (Pebble Daily View)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    await WorkspaceRepository.saveWorkspaces([ws1, wsOther]);
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

  // Test A — Day view scheduled Tasks
  test("Test A — A scheduled Task appears in the Daily Planner's existing Day Calendar", async () => {
    const scheduledTask: Task = {
      id: "task-sched-1",
      workspaceId: "ws-1",
      title: "Study Kubernetes",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-31", startTime: "09:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(scheduledTask);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    const item = getState().timedItemsWithLayout.find((i) => i.id === "task-sched-1");
    expect(item).toBeDefined();
    expect(item?.title).toBe("Study Kubernetes");
    expect(item?.startHour).toBe(9);

    await unmount();
  });

  // Test B — Pending Task discovery
  test("Test B — An active incomplete unscheduled Task appears in Plan Your Day", async () => {
    const pendingTask: Task = {
      id: "task-pending-1",
      workspaceId: "ws-1",
      title: "Review Kubernetes notes",
      status: "todo",
      priority: "medium",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(pendingTask);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    const pending = getState().pendingTasks.find((t) => t.id === "task-pending-1");
    expect(pending).toBeDefined();
    expect(pending?.title).toBe("Review Kubernetes notes");

    await unmount();
  });

  // Test C — Completed Task exclusion
  test("Test C — A completed Task does not appear as a pending planning candidate", async () => {
    const completedTask: Task = {
      id: "task-completed-1",
      workspaceId: "ws-1",
      title: "Finished documentation",
      status: "completed",
      completedAt: 1200,
      priority: "low",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1200,
    };
    await TaskRepository.saveTask(completedTask);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    const pending = getState().pendingTasks.find((t) => t.id === "task-completed-1");
    expect(pending).toBeUndefined();

    await unmount();
  });

  // Test D — Scheduled Task exclusion
  test("Test D — A Task already scheduled for the selected day is not duplicated in the pending section", async () => {
    const scheduledTask: Task = {
      id: "task-sched-d",
      workspaceId: "ws-1",
      title: "Morning Workout",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-31", startTime: "11:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(scheduledTask);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    // Appears on timeline
    expect(getState().timedItemsWithLayout.some((i) => i.id === "task-sched-d")).toBe(true);
    // Does NOT appear in pending tasks
    expect(getState().pendingTasks.some((t) => t.id === "task-sched-d")).toBe(false);

    await unmount();
  });

  // Test E — Recurring Task
  test("Test E — A recurring Task appears on the correct occurrence date", async () => {
    const recurringTask: Task = {
      id: "rec-task-e",
      workspaceId: "ws-1",
      title: "Daily Standup",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-01", startTime: "10:00", durationMinutes: 30 },
      recurrence: { frequency: "daily", interval: 1 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(recurringTask);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    const item = getState().timedItemsWithLayout.find((i) => i.id === "rec-task-e");
    expect(item).toBeDefined();
    expect(item?.startHour).toBe(10);
    expect(item?.startMinute).toBe(0);

    // It is excluded from pendingTasks because it is scheduled for this date
    expect(getState().pendingTasks.some((t) => t.id === "rec-task-e")).toBe(false);

    await unmount();
  });

  // Test F — Recurrence boundary
  test("Test F — An occurrence after endDate is absent", async () => {
    const boundedRec: Task = {
      id: "rec-task-f",
      workspaceId: "ws-1",
      title: "Summer Sprint",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-01", startTime: "15:00", durationMinutes: 60 },
      recurrence: { frequency: "daily", interval: 1, endDate: "2026-08-20" },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(boundedRec);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    // 2026-08-31 is after endDate 2026-08-20, so absent from timeline
    expect(getState().timedItemsWithLayout.some((i) => i.id === "rec-task-f")).toBe(false);

    await unmount();
  });

  // Test G — Habit
  test("Test G — A relevant Habit appears for the selected date", async () => {
    const habit: Habit = {
      id: "habit-g",
      workspaceId: "ws-1",
      title: "Exercise",
      recurrence: { frequency: "daily", interval: 1 },
      completionHistory: [],
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await HabitRepository.saveHabit(habit);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    const habitInTimeline = getState().allDayItems.find((i) => i.id === "habit-g");
    expect(habitInTimeline).toBeDefined();
    expect(habitInTimeline?.title).toBe("Exercise");

    const habitInPlanner = getState().plannerHabits.find((h) => h.id === "habit-g");
    expect(habitInPlanner).toBeDefined();

    await unmount();
  });

  // Test H — All-day Task
  test("Test H — An all-day Task remains all-day and does not become a timed block", async () => {
    const allDayTask: Task = {
      id: "task-allday-h",
      workspaceId: "ws-1",
      title: "Submit application",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-31" },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(allDayTask);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    const allDayItem = getState().allDayItems.find((i) => i.id === "task-allday-h");
    expect(allDayItem).toBeDefined();
    expect(allDayItem?.timeLabel).toBe("All Day");
    expect(allDayItem?.startHour).toBeUndefined();

    // Absent from timed blocks
    expect(getState().timedItemsWithLayout.some((i) => i.id === "task-allday-h")).toBe(false);

    await unmount();
  });

  // Test I — Duration
  test("Test I — A 90-minute Task occupies 90 minutes of the timeline", async () => {
    const ninetyMinTask: Task = {
      id: "task-90m-i",
      workspaceId: "ws-1",
      title: "Architecture Design Session",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-31", startTime: "20:00", durationMinutes: 90 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(ninetyMinTask);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    const item = getState().timedItemsWithLayout.find((i) => i.id === "task-90m-i");
    expect(item).toBeDefined();
    expect(item?.startHour).toBe(20);
    expect(item?.durationMinutes).toBe(90);

    await unmount();
  });

  // Test J & K — Plan existing Task & No duplicate Task
  test("Test J & K — Planning a pending Task schedules the EXISTING Task without duplicates", async () => {
    const originalCreatedAt = 123456789;
    const pendingTask: Task = {
      id: "task-to-plan-j",
      workspaceId: "ws-1",
      title: "Apply to jobs",
      status: "todo",
      priority: "high",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: originalCreatedAt,
      updatedAt: originalCreatedAt,
    };
    await TaskRepository.saveTask(pendingTask);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    // Plan task for 14:00
    await act(async () => {
      await getState().planTask("task-to-plan-j", { hour: 14 });
      await flushPromises();
    });

    // Verify task in persistence
    const inRepo = await TaskRepository.getTask("task-to-plan-j", "ws-1");
    expect(inRepo).toBeDefined();
    expect(inRepo?.id).toBe("task-to-plan-j");
    expect(inRepo?.workspaceId).toBe("ws-1");
    expect(inRepo?.createdAt).toBe(originalCreatedAt);
    expect(inRepo?.schedule?.date).toBe("2026-08-31");
    expect(inRepo?.schedule?.startTime).toBe("14:00");

    // Verify no duplicates in repository
    const allInRepo = await TaskRepository.getTasks("ws-1");
    const matches = Object.values(allInRepo).filter((t) => t.title === "Apply to jobs");
    expect(matches).toHaveLength(1);

    // Verify it now appears on timeline and is removed from pendingTasks
    expect(getState().timedItemsWithLayout.some((i) => i.id === "task-to-plan-j")).toBe(true);
    expect(getState().pendingTasks.some((t) => t.id === "task-to-plan-j")).toBe(false);

    await unmount();
  });

  // Test L — Selected date
  test("Test L — Changing selectedDate changes the Daily Planner projection without repository reloads", async () => {
    const taskAug31: Task = {
      id: "task-aug-31",
      workspaceId: "ws-1",
      title: "Aug 31 Task",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-31", startTime: "10:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const taskSep01: Task = {
      id: "task-sep-01",
      workspaceId: "ws-1",
      title: "Sep 01 Task",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-09-01", startTime: "16:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(taskAug31);
    await TaskRepository.saveTask(taskSep01);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    expect(getState().timedItemsWithLayout.some((i) => i.id === "task-aug-31")).toBe(true);
    expect(getState().timedItemsWithLayout.some((i) => i.id === "task-sep-01")).toBe(false);

    // Track repository read calls
    const getTasksSpy = jest.spyOn(TaskRepository, "getTasks");

    // Change selectedDate to 2026-09-01
    await act(async () => {
      getState().setSelectedDate("2026-09-01");
      await flushPromises();
    });

    // Repository was NOT reloaded
    expect(getTasksSpy).not.toHaveBeenCalled();

    // Projection updated cleanly
    expect(getState().timedItemsWithLayout.some((i) => i.id === "task-aug-31")).toBe(false);
    expect(getState().timedItemsWithLayout.some((i) => i.id === "task-sep-01")).toBe(true);

    getTasksSpy.mockRestore();
    await unmount();
  });

  // Test M — Workspace isolation
  test("Test M — Tasks from another workspace never appear in the Daily Planner's pending list", async () => {
    const taskWs1: Task = {
      id: "task-in-ws1",
      workspaceId: "ws-1",
      title: "Main WS Pending Task",
      status: "todo",
      priority: "high",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const taskWsOther: Task = {
      id: "task-in-other",
      workspaceId: "ws-other",
      title: "Other WS Pending Task",
      status: "todo",
      priority: "high",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    await TaskRepository.saveTask(taskWs1);
    await TaskRepository.saveTask(taskWsOther);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    // Active workspace is ws-1: pendingTasks must contain only ws-1 tasks
    expect(getState().pendingTasks.some((t) => t.id === "task-in-ws1")).toBe(true);
    expect(getState().pendingTasks.some((t) => t.id === "task-in-other")).toBe(false);

    await unmount();
  });

  // Test N — Duration preservation during time slotting
  test("Test N — Planning a task with existing duration preserves duration and calculates correct endTime", async () => {
    const task45m: Task = {
      id: "task-45m-n",
      workspaceId: "ws-1",
      title: "Sprint Retrospective",
      status: "todo",
      priority: "medium",
      schedule: { durationMinutes: 45 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(task45m);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    // Slot task at 10:30 AM
    await act(async () => {
      await getState().planTask("task-45m-n", { hour: 10, minute: 30 });
      await flushPromises();
    });

    const inRepo = await TaskRepository.getTask("task-45m-n", "ws-1");
    expect(inRepo).toBeDefined();
    expect(inRepo?.schedule?.date).toBe("2026-08-31");
    expect(inRepo?.schedule?.startTime).toBe("10:30");
    expect(inRepo?.schedule?.endTime).toBe("11:15");
    expect(inRepo?.schedule?.durationMinutes).toBe(45);

    await unmount();
  });

  // Test O — Moving a scheduled task preserves existing startTime and endTime
  test("Test O — Moving a task to a new date preserves existing startTime and endTime when not explicitly changed", async () => {
    const timedTask: Task = {
      id: "task-timed-o",
      workspaceId: "ws-1",
      title: "Weekly Sync",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-30", startTime: "14:00", endTime: "15:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(timedTask);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    // Plan onto selectedDate (2026-08-31) without passing hour or isAllDay
    await act(async () => {
      await getState().planTask("task-timed-o");
      await flushPromises();
    });

    const inRepo = await TaskRepository.getTask("task-timed-o", "ws-1");
    expect(inRepo).toBeDefined();
    expect(inRepo?.schedule?.date).toBe("2026-08-31");
    expect(inRepo?.schedule?.startTime).toBe("14:00");
    expect(inRepo?.schedule?.endTime).toBe("15:00");
    expect(inRepo?.schedule?.durationMinutes).toBe(60);

    await unmount();
  });

  // Test P — Explicit All-Day choice clears time
  test("Test P — Explicitly choosing isAllDay removes startTime and endTime while keeping date and duration", async () => {
    const timedTask: Task = {
      id: "task-timed-p",
      workspaceId: "ws-1",
      title: "Self Study",
      status: "todo",
      priority: "low",
      schedule: { date: "2026-08-31", startTime: "09:00", endTime: "10:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(timedTask);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    // Explicitly make it All Day
    await act(async () => {
      await getState().planTask("task-timed-p", { isAllDay: true });
      await flushPromises();
    });

    const inRepo = await TaskRepository.getTask("task-timed-p", "ws-1");
    expect(inRepo).toBeDefined();
    expect(inRepo?.schedule?.date).toBe("2026-08-31");
    expect(inRepo?.schedule?.startTime).toBeUndefined();
    expect(inRepo?.schedule?.endTime).toBeUndefined();
    expect(inRepo?.schedule?.durationMinutes).toBe(60);

    await unmount();
  });

  // Test Q — Free Time Gaps detection
  test("Test Q — Free time gaps are accurately calculated between scheduled items", async () => {
    const morningTask: Task = {
      id: "task-morning-q",
      workspaceId: "ws-1",
      title: "Morning Meeting",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-31", startTime: "08:30", endTime: "09:30", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const lunchTask: Task = {
      id: "task-lunch-q",
      workspaceId: "ws-1",
      title: "Lunch Sync",
      status: "todo",
      priority: "low",
      schedule: { date: "2026-08-31", startTime: "12:00", endTime: "13:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(morningTask);
    await TaskRepository.saveTask(lunchTask);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    const gaps = getState().freeTimeGaps;
    expect(gaps.length).toBeGreaterThanOrEqual(1);

    // Gap from 9:30 (570 min) to 12:00 (720 min) is 150 min (2.5h)
    const midGap = gaps.find((g) => g.startMinutes === 9 * 60 + 30);
    expect(midGap).toBeDefined();
    expect(midGap?.durationMinutes).toBe(150);

    await unmount();
  });

  // Test R — Quick slot minute precision
  test("Test R — Quick slotting sets exact hour and minute with correct timeline layout position", async () => {
    const unscheduledTask: Task = {
      id: "task-quick-r",
      workspaceId: "ws-1",
      title: "Code Review Session",
      status: "todo",
      priority: "high",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(unscheduledTask);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    // Quick slot to 16:30 (4:30 PM)
    await act(async () => {
      await getState().planTask("task-quick-r", { hour: 16, minute: 30 });
      await flushPromises();
    });

    const inRepo = await TaskRepository.getTask("task-quick-r", "ws-1");
    expect(inRepo?.schedule?.startTime).toBe("16:30");
    expect(inRepo?.schedule?.date).toBe("2026-08-31");

    const timelineItem = getState().timedItemsWithLayout.find((i) => i.id === "task-quick-r");
    expect(timelineItem).toBeDefined();
    expect(timelineItem?.startHour).toBe(16);
    expect(timelineItem?.startMinute).toBe(30);

    await unmount();
  });

  // Test S — Timeline-First exact time placement at 10:30 AM
  test("Test S — Timeline-first placement assigns exact 10:30 AM startTime and preserves task duration", async () => {
    const unplacedTask: Task = {
      id: "task-tf-s",
      workspaceId: "ws-1",
      title: "API Error Handling",
      status: "todo",
      priority: "high",
      schedule: { durationMinutes: 45 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(unplacedTask);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    // Unplaced task is present in pendingTasks
    expect(getState().pendingTasks.some((t) => t.id === "task-tf-s")).toBe(true);

    // User taps 10:30 AM timeline slot and selects this task
    await act(async () => {
      await getState().planTask("task-tf-s", { hour: 10, minute: 30 });
      await flushPromises();
    });

    // Verify task is scheduled at exactly 10:30 with duration 45m (10:30 - 11:15)
    const inRepo = await TaskRepository.getTask("task-tf-s", "ws-1");
    expect(inRepo?.schedule?.date).toBe("2026-08-31");
    expect(inRepo?.schedule?.startTime).toBe("10:30");
    expect(inRepo?.schedule?.endTime).toBe("11:15");
    expect(inRepo?.schedule?.durationMinutes).toBe(45);

    // Verify it appears on timeline and is removed from pending
    expect(getState().timedItemsWithLayout.some((i) => i.id === "task-tf-s")).toBe(true);
    expect(getState().pendingTasks.some((t) => t.id === "task-tf-s")).toBe(false);

    await unmount();
  });

  // Test T — Timeline-First task eligibility excludes completed and already-scheduled tasks
  test("Test T — Timeline-first eligible task pool strictly excludes completed and already-scheduled tasks", async () => {
    const pendingTask: Task = {
      id: "task-eligible-t",
      workspaceId: "ws-1",
      title: "Eligible Pending Task",
      status: "todo",
      priority: "medium",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const completedTask: Task = {
      id: "task-completed-t",
      workspaceId: "ws-1",
      title: "Completed Task",
      status: "completed",
      completedAt: 2000,
      priority: "low",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 2000,
    };
    const alreadyScheduledTask: Task = {
      id: "task-scheduled-t",
      workspaceId: "ws-1",
      title: "Already Scheduled Task",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-31", startTime: "14:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(pendingTask);
    await TaskRepository.saveTask(completedTask);
    await TaskRepository.saveTask(alreadyScheduledTask);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    const candidates = getState().pendingTasks;
    expect(candidates.some((t) => t.id === "task-eligible-t")).toBe(true);
    expect(candidates.some((t) => t.id === "task-completed-t")).toBe(false);
    expect(candidates.some((t) => t.id === "task-scheduled-t")).toBe(false);

    await unmount();
  });

  // Test U — Overlapping timeline placement cleanly clusters without corrupting existing items
  test("Test U — Placing a task over an existing scheduled item creates clean overlap layout without corrupting existing item", async () => {
    const existingTask: Task = {
      id: "task-existing-u",
      workspaceId: "ws-1",
      title: "Existing 10 AM Meeting",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-31", startTime: "10:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const newTask: Task = {
      id: "task-new-u",
      workspaceId: "ws-1",
      title: "Parallel Work Session",
      status: "todo",
      priority: "medium",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(existingTask);
    await TaskRepository.saveTask(newTask);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    // Place new task at 10:00 AM
    await act(async () => {
      await getState().planTask("task-new-u", { hour: 10, minute: 0 });
      await flushPromises();
    });

    // Both items exist and share 2-column layout
    const itemA = getState().timedItemsWithLayout.find((i) => i.id === "task-existing-u");
    const itemB = getState().timedItemsWithLayout.find((i) => i.id === "task-new-u");

    expect(itemA).toBeDefined();
    expect(itemB).toBeDefined();
    expect(itemA?.totalCols).toBe(2);
    expect(itemB?.totalCols).toBe(2);
    expect(itemA?.colIdx).not.toBe(itemB?.colIdx);

    // Existing item data was not corrupted
    const existingInRepo = await TaskRepository.getTask("task-existing-u", "ws-1");
    expect(existingInRepo?.title).toBe("Existing 10 AM Meeting");
    expect(existingInRepo?.schedule?.startTime).toBe("10:00");

    await unmount();
  });

  // Test V — Inline free-time gaps are calculated and positioned precisely between scheduled items
  test("Test V — Inline free-time gaps are positioned strictly between scheduled items", async () => {
    const taskA: Task = {
      id: "task-sched-a",
      workspaceId: "ws-1",
      title: "Study Kubernetes",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-31", startTime: "09:00", durationMinutes: 90 }, // 09:00 - 10:30 (540-630)
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const taskB: Task = {
      id: "task-sched-b",
      workspaceId: "ws-1",
      title: "Lunch",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-31", startTime: "12:00", durationMinutes: 60 }, // 12:00 - 13:00 (720-780)
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const taskC: Task = {
      id: "task-sched-c",
      workspaceId: "ws-1",
      title: "Project Work",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-31", startTime: "15:00", durationMinutes: 90 }, // 15:00 - 16:30 (900-990)
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(taskA);
    await TaskRepository.saveTask(taskB);
    await TaskRepository.saveTask(taskC);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    const gaps = getState().freeTimeGaps;
    // Expected gaps across full 24h day:
    // Gap 1: 00:00 - 09:00 (540m, startMinutes: 0) -> before Task A
    // Gap 2: 10:30 - 12:00 (90m, startMinutes: 630) -> between Task A and Task B
    // Gap 3: 13:00 - 15:00 (120m, startMinutes: 780) -> between Task B and Task C
    // Gap 4: 16:30 - 24:00 (450m, startMinutes: 990) -> after Task C

    const gapPreA = gaps.find((g) => g.startMinutes === 0);
    expect(gapPreA).toBeDefined();
    expect(gapPreA?.durationMinutes).toBe(540); // 9h available before 09:00

    const gapBetweenAandB = gaps.find((g) => g.startMinutes === 630);
    expect(gapBetweenAandB).toBeDefined();
    expect(gapBetweenAandB?.durationMinutes).toBe(90); // 1h 30m available

    const gapBetweenBandC = gaps.find((g) => g.startMinutes === 780);
    expect(gapBetweenBandC).toBeDefined();
    expect(gapBetweenBandC?.durationMinutes).toBe(120); // 2h available

    const gapPostC = gaps.find((g) => g.startMinutes === 990);
    expect(gapPostC).toBeDefined();
    expect(gapPostC?.durationMinutes).toBe(450); // 7.5h available after 16:30

    await unmount();
  });

  // Test W — Placing an existing task into a free gap preserves ID, duration, and creates NO duplicate task
  test("Test W — Placing an unplaced task into a free gap preserves task ID and creates no duplicate task", async () => {
    const unplacedTask: Task = {
      id: "task-preserve-w",
      workspaceId: "ws-1",
      title: "Write Architecture Spec",
      status: "todo",
      priority: "high",
      schedule: { durationMinutes: 90 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(unplacedTask);

    const initialTasks = await TaskRepository.getTasks("ws-1");
    const initialCount = initialTasks.length;

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    // User taps the 10:30 free gap and chooses the unplaced task
    await act(async () => {
      await getState().planTask("task-preserve-w", { hour: 10, minute: 30 });
      await flushPromises();
    });

    const afterTasks = await TaskRepository.getTasks("ws-1");
    expect(afterTasks.length).toBe(initialCount); // Assert: No duplicate task created

    const updatedTask = await TaskRepository.getTask("task-preserve-w", "ws-1");
    expect(updatedTask).toBeDefined();
    expect(updatedTask?.id).toBe("task-preserve-w"); // Assert: originalTask.id === updatedTask.id
    expect(updatedTask?.schedule?.date).toBe("2026-08-31");
    expect(updatedTask?.schedule?.startTime).toBe("10:30");
    expect(updatedTask?.schedule?.endTime).toBe("12:00");
    expect(updatedTask?.schedule?.durationMinutes).toBe(90); // Assert: duration is preserved

    await unmount();
  });

  // Test X — All-day tasks remain in allDayItems and do not corrupt timeline free-time gaps
  test("Test X — All-day tasks remain in allDayItems and do not corrupt timeline free-time gaps", async () => {
    const allDayTask: Task = {
      id: "task-allday-x",
      workspaceId: "ws-1",
      title: "All Day Strategic Review",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-31" }, // date without startTime
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(allDayTask);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    // Assert: present in allDayItems
    expect(getState().allDayItems.some((i) => i.id === "task-allday-x")).toBe(true);

    // Assert: free gaps are unobstructed across full 24 hours (1440 min)
    const fullGap = getState().freeTimeGaps.find((g) => g.startMinutes === 0);
    expect(fullGap?.durationMinutes).toBe(1440);

    await unmount();
  });

  // Test Z1 — Today's Day view initially targets the current hour with 1h visual headroom
  test("Test Z1 — Today's Day view targets current hour during normal waking hours", () => {
    const offset10AM = calculateInitialTimelineScrollOffset({
      selectedDate: "2026-08-31",
      currentDate: "2026-08-31",
      currentHour: 10,
      hourHeight: 80,
    });
    // Target hour: 10 - 1 = 9 -> 9 * 80 = 720
    expect(offset10AM).toBe(720);

    const offset2PM = calculateInitialTimelineScrollOffset({
      selectedDate: "2026-08-31",
      currentDate: "2026-08-31",
      currentHour: 14,
      hourHeight: 80,
    });
    // Target hour: 14 - 1 = 13 -> 13 * 80 = 1040
    expect(offset2PM).toBe(1040);
  });

  // Test Z2 — Very early morning (< 7 AM) falls back to 7:00 AM rather than midnight
  test("Test Z2 — Very early morning (< 7 AM) falls back to 7:00 AM rather than midnight", () => {
    const offset4AM = calculateInitialTimelineScrollOffset({
      selectedDate: "2026-08-31",
      currentDate: "2026-08-31",
      currentHour: 4,
      hourHeight: 80,
    });
    // Target hour: 7 (fallback) -> 7 * 80 = 560
    expect(offset4AM).toBe(560);

    const offsetMidnight = calculateInitialTimelineScrollOffset({
      selectedDate: "2026-08-31",
      currentDate: "2026-08-31",
      currentHour: 0,
      hourHeight: 80,
    });
    // Target hour: 7 (fallback) -> 7 * 80 = 560
    expect(offsetMidnight).toBe(560);
  });

  // Test Z3 — Non-today selected date targets 7:00 AM morning position regardless of current hour
  test("Test Z3 — Non-today selected date targets 7:00 AM morning position regardless of current hour", () => {
    const offsetFutureDate = calculateInitialTimelineScrollOffset({
      selectedDate: "2026-09-15",
      currentDate: "2026-08-31",
      currentHour: 15,
      hourHeight: 80,
    });
    // Target hour: 7 -> 7 * 80 = 560
    expect(offsetFutureDate).toBe(560);

    const offsetPastDate = calculateInitialTimelineScrollOffset({
      selectedDate: "2026-08-10",
      currentDate: "2026-08-31",
      currentHour: 20,
      hourHeight: 80,
    });
    // Target hour: 7 -> 7 * 80 = 560
    expect(offsetPastDate).toBe(560);
  });

  // Test Z4 — Custom hour heights and header offsets are computed accurately
  test("Test Z4 — Custom hour heights and header offsets are computed accurately", () => {
    const offsetWithHeader = calculateInitialTimelineScrollOffset({
      selectedDate: "2026-08-31",
      currentDate: "2026-08-31",
      currentHour: 9,
      hourHeight: 60,
      headerOffset: 50,
    });
    // Target hour: 9 - 1 = 8 -> 8 * 60 + 50 = 530
    expect(offsetWithHeader).toBe(530);
  });

  // Test CT1 — calculateCurrentTimePosition computes minute-accurate Y position
  test("Test CT1 — calculateCurrentTimePosition computes minute-accurate Y position", () => {
    // 08:00 -> (480 / 60) * 80 = 640
    expect(calculateCurrentTimePosition(8, 0, 80)).toBe(640);
    // 08:30 -> (510 / 60) * 80 = 680
    expect(calculateCurrentTimePosition(8, 30, 80)).toBe(680);
    // 09:15 -> (555 / 60) * 80 = 740
    expect(calculateCurrentTimePosition(9, 15, 80)).toBe(740);
    // 14:45 -> (885 / 60) * 80 = 1180
    expect(calculateCurrentTimePosition(14, 45, 80)).toBe(1180);
  });

  // Test CT2 — calculateCurrentTimePosition clamps boundaries safely
  test("Test CT2 — calculateCurrentTimePosition clamps boundaries safely", () => {
    expect(calculateCurrentTimePosition(-5, -10, 80)).toBe(0);
    expect(calculateCurrentTimePosition(25, 80, 80)).toBe(
      ((23 * 60 + 59) / 60) * 80,
    );
  });

  // Test FT1 — Free-time calculation covers full 24-hour day including early morning
  test("Test FT1 — Free-time calculation covers full 24-hour day including early morning", async () => {
    const morningTask: Task = {
      id: "task-early-morn",
      workspaceId: "ws-1",
      title: "Early Dawn Workout",
      status: "todo",
      priority: "high",
      schedule: {
        date: "2026-08-31",
        startTime: "05:00",
        endTime: "06:30",
        durationMinutes: 90,
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(morningTask);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    const gaps = getState().freeTimeGaps;
    // Gap before 05:00: 00:00 - 05:00 (300 min)
    const earlyGap = gaps.find((g) => g.startMinutes === 0);
    expect(earlyGap).toBeDefined();
    expect(earlyGap?.durationMinutes).toBe(300);

    // Gap after 06:30: 06:30 - 24:00 (1050 min = 17.5h)
    const postWorkoutGap = gaps.find((g) => g.startMinutes === 6 * 60 + 30);
    expect(postWorkoutGap).toBeDefined();
    expect(postWorkoutGap?.durationMinutes).toBe(1050);

    await unmount();
  });

  // Test FT2 — Gaps shorter than 30 minutes are suppressed
  test("Test FT2 — Gaps shorter than 30 minutes are suppressed in 24h timeline", async () => {
    const task1: Task = {
      id: "task-tight-1",
      workspaceId: "ws-1",
      title: "Standup",
      status: "todo",
      priority: "medium",
      schedule: {
        date: "2026-08-31",
        startTime: "10:00",
        endTime: "10:30",
        durationMinutes: 30,
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const task2: Task = {
      id: "task-tight-2",
      workspaceId: "ws-1",
      title: "Quick Sync",
      status: "todo",
      priority: "medium",
      schedule: {
        date: "2026-08-31",
        startTime: "10:45", // 15-min gap between 10:30 and 10:45
        endTime: "11:15",
        durationMinutes: 30,
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(task1);
    await TaskRepository.saveTask(task2);

    const { getState, unmount } = await renderCalendarHook();
    await act(async () => {
      getState().setSelectedDate("2026-08-31");
      await flushPromises();
    });

    const gaps = getState().freeTimeGaps;
    // 15 min gap between 10:30 (630) and 10:45 (645) should NOT be present
    const tightGap = gaps.find((g) => g.startMinutes === 630);
    expect(tightGap).toBeUndefined();

    await unmount();
  });

  // Test TL1 — formatCurrentTimeLabel formats 12-hour wall-clock times with AM/PM
  test("Test TL1 — formatCurrentTimeLabel formats 12-hour wall-clock times with AM/PM", () => {
    expect(formatCurrentTimeLabel(11, 48)).toBe("11:48 AM");
    expect(formatCurrentTimeLabel(17, 48)).toBe("5:48 PM");
    expect(formatCurrentTimeLabel(9, 5)).toBe("9:05 AM");
    expect(formatCurrentTimeLabel(14, 0)).toBe("2:00 PM");
  });

  // Test TL2 — formatCurrentTimeLabel handles all boundary hours cleanly
  test("Test TL2 — formatCurrentTimeLabel handles boundary hours cleanly", () => {
    expect(formatCurrentTimeLabel(0, 0)).toBe("12:00 AM");
    expect(formatCurrentTimeLabel(0, 1)).toBe("12:01 AM");
    expect(formatCurrentTimeLabel(11, 59)).toBe("11:59 AM");
    expect(formatCurrentTimeLabel(12, 0)).toBe("12:00 PM");
    expect(formatCurrentTimeLabel(12, 1)).toBe("12:01 PM");
    expect(formatCurrentTimeLabel(23, 59)).toBe("11:59 PM");
  });

  // Test TL3 — formatCurrentTimeLabel clamps safely on out-of-range inputs
  test("Test TL3 — formatCurrentTimeLabel clamps safely on out-of-range inputs", () => {
    expect(formatCurrentTimeLabel(-1, -5)).toBe("12:00 AM");
    expect(formatCurrentTimeLabel(25, 99)).toBe("11:59 PM");
  });
});
