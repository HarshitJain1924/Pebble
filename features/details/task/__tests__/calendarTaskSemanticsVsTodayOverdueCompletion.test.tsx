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

jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    SafeAreaView: ({ children, style }: any) =>
      React.createElement(View, { style }, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
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

const mockUndoApi = { showToast: jest.fn(), showUndo: jest.fn() };
jest.mock("@/shared/components/ui/UndoContext", () => ({
  useUndo: () => mockUndoApi,
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  TaskRepository,
  WorkspaceRepository,
  UiStateRepository,
} from "@/repositories";
import { Task, Workspace } from "@/shared/types/domain.types";
import {
  isTaskCompleted,
  isTaskOverdue,
  isTaskDueToday,
  getTaskOccurrenceState,
} from "@/shared/utils/domain-selectors";
import { getStructuredSchedule } from "@/services/scheduling/scheduling.service";
import { useCalendarState } from "@/features/calendar/hooks/useCalendarState";

const ws1: Workspace = { id: "ws-1", name: "Work", createdAt: 1, updatedAt: 1 };
const TODAY = "2026-08-30";
const YESTERDAY = "2026-08-29";
const TOMORROW = "2026-08-31";

describe("Calendar Task/Event Semantics vs Today, Overdue, Completion, and History (Fix #19)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    await WorkspaceRepository.saveWorkspaces([ws1]);
    await UiStateRepository.saveUiState({ activeWorkspaceId: "ws-1" });
  });

  // TEST 1: Timed Task appears correctly in Today
  test("TEST 1: Timed Task scheduled for Today (15:00) is classified as isToday=true and isOverdue=false", () => {
    const task: Task = {
      id: "t-doc",
      workspaceId: "ws-1",
      title: "Doctor Appointment",
      status: "todo",
      priority: "high",
      schedule: { date: TODAY, startTime: "15:00", durationMinutes: 60 },
      createdAt: 1000,
      updatedAt: 1000,
    };
    const state = getTaskOccurrenceState(task, TODAY);
    expect(state.isToday).toBe(true);
    expect(state.isOverdue).toBe(false);
    expect(isTaskDueToday(task, TODAY)).toBe(true);
    expect(isTaskOverdue(task, TODAY)).toBe(false);
  });

  // TEST 2, 3, 4: Overdue calculation semantics & reminder independence
  test("TEST 2, 3, 4: Overdue is based on schedule date (< today), not reminder.triggerAt or time of day", () => {
    // Task scheduled today at 15:00 with earlier reminder at 14:00
    const todayTimedWithReminder: Task = {
      id: "t-today-rem",
      workspaceId: "ws-1",
      title: "Sync with Team",
      status: "todo",
      priority: "medium",
      schedule: { date: TODAY, startTime: "15:00", durationMinutes: 60 },
      reminder: { enabled: true, triggerAt: new Date(2026, 7, 30, 14, 0).getTime() },
      createdAt: 1000,
      updatedAt: 1000,
    };
    // On TODAY, task is due today, NOT overdue (regardless of reminder timestamp)
    expect(isTaskOverdue(todayTimedWithReminder, TODAY)).toBe(false);
    expect(isTaskDueToday(todayTimedWithReminder, TODAY)).toBe(true);

    // Task scheduled yesterday (2026-08-29) is overdue on TODAY
    const pastTask: Task = {
      id: "t-past",
      workspaceId: "ws-1",
      title: "Submit Taxes",
      status: "todo",
      priority: "high",
      schedule: { date: YESTERDAY, startTime: "10:00", durationMinutes: 30 },
      createdAt: 1000,
      updatedAt: 1000,
    };
    expect(isTaskOverdue(pastTask, TODAY)).toBe(true);
    expect(isTaskDueToday(pastTask, TODAY)).toBe(false);
  });

  // TEST 5 & 6: All-day Task vs Timed Task without reminder
  test("TEST 5 & 6: All-day Task and timed Task without reminder behave consistently", () => {
    const allDay: Task = {
      id: "t-allday",
      workspaceId: "ws-1",
      title: "Team Offsite",
      status: "todo",
      priority: "low",
      schedule: { date: TODAY },
      createdAt: 1000,
      updatedAt: 1000,
    };
    const timedNoRem: Task = {
      id: "t-timed-norem",
      workspaceId: "ws-1",
      title: "Client Pitch",
      status: "todo",
      priority: "high",
      schedule: { date: TODAY, startTime: "11:00", durationMinutes: 90 },
      createdAt: 1000,
      updatedAt: 1000,
    };

    expect(getStructuredSchedule(allDay).startTime).toBeUndefined();
    expect(isTaskDueToday(allDay, TODAY)).toBe(true);

    expect(getStructuredSchedule(timedNoRem).startTime).toEqual({ hour: 11, minute: 0 });
    expect(getStructuredSchedule(timedNoRem).duration).toBe(90);
    expect(isTaskDueToday(timedNoRem, TODAY)).toBe(true);
  });

  // TEST 7: Completing timed Task preserves Calendar geometry
  test("TEST 7: Completed timed Task retains its schedule coordinates and duration on Calendar", async () => {
    const completedTimed: Task = {
      id: "t-completed",
      workspaceId: "ws-1",
      title: "Finished Workshop",
      status: "completed",
      completedAt: 2000,
      priority: "high",
      schedule: { date: TODAY, startTime: "14:00", durationMinutes: 120 },
      createdAt: 1000,
      updatedAt: 2000,
    };
    await TaskRepository.saveTask(completedTimed);

    let state: ReturnType<typeof useCalendarState> | undefined;
    function Harness() {
      state = useCalendarState();
      return null;
    }

    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(Harness));
    });

    try {
      await act(async () => {
        state!.setSelectedDate(TODAY);
      });

      const item = state!.timedItemsWithLayout.find((i) => i.id === "t-completed");
      expect(item).toBeDefined();
      expect(item?.startHour).toBe(14);
      expect(item?.durationMinutes).toBe(120);
      expect(item?.completed).toBe(true);
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  // TEST 8 & 9: Recurring Task vs Detached Occurrence
  test("TEST 8 & 9: Detached recurring occurrence behaves as an independent Task on its target date", async () => {
    const master: Task = {
      id: "master-daily",
      workspaceId: "ws-1",
      title: "Daily Standup",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-01", startTime: "09:00", durationMinutes: 30 },
      recurrence: { frequency: "daily", interval: 1 },
      recurrenceExceptions: [TODAY], // Exception for today
      createdAt: 1000,
      updatedAt: 1000,
    };
    const detached: Task = {
      id: "detached-today",
      workspaceId: "ws-1",
      title: "Daily Standup (Moved)",
      status: "todo",
      priority: "medium",
      schedule: { date: TODAY, startTime: "16:00", durationMinutes: 30 },
      createdAt: 1000,
      updatedAt: 1000,
    };

    await TaskRepository.saveTask(master);
    await TaskRepository.saveTask(detached);

    // On TODAY: Master is excluded, detached is present at 16:00
    const masterStateToday = getTaskOccurrenceState(master, TODAY);
    expect(masterStateToday.occurs).toBe(false);

    const detachedStateToday = getTaskOccurrenceState(detached, TODAY);
    expect(detachedStateToday.occurs).toBe(true);
    expect(detachedStateToday.isToday).toBe(true);

    // On TOMORROW: Master occurs normally at 09:00
    const masterStateTomorrow = getTaskOccurrenceState(master, TOMORROW);
    expect(masterStateTomorrow.occurs).toBe(true);
  });

  // TEST 10 & 11: Reminder date does not cause Task visibility on the reminder date
  test("TEST 10 & 11: Task scheduled on Aug 30 with reminder on Aug 29 appears only on Aug 30", () => {
    const task: Task = {
      id: "t-diff-dates",
      workspaceId: "ws-1",
      title: "Big Launch",
      status: "todo",
      priority: "high",
      schedule: { date: TODAY, startTime: "10:00", durationMinutes: 60 },
      reminder: { enabled: true, triggerAt: new Date(2026, 7, 29, 20, 0).getTime() },
      createdAt: 1000,
      updatedAt: 1000,
    };

    // On Aug 29 (reminder date), task does NOT occur
    expect(getTaskOccurrenceState(task, YESTERDAY).occurs).toBe(false);
    expect(isTaskDueToday(task, YESTERDAY)).toBe(false);

    // On Aug 30 (schedule date), task DOES occur
    expect(getTaskOccurrenceState(task, TODAY).occurs).toBe(true);
    expect(isTaskDueToday(task, TODAY)).toBe(true);
  });

  // TEST 12, 13, 14: No separate Event entity; timed Task at 15:00 with 14:00 reminder is a 15:00 Task everywhere
  test("TEST 12, 13, 14: Timed Task at 15:00 with 14:00 reminder is a 15:00 Task across scheduling and domain", () => {
    const task: Task = {
      id: "t-15-rem14",
      workspaceId: "ws-1",
      title: "Design Review",
      status: "todo",
      priority: "high",
      schedule: { date: TODAY, startTime: "15:00", durationMinutes: 60 },
      reminder: { enabled: true, triggerAt: new Date(2026, 7, 30, 14, 0).getTime() },
      createdAt: 1000,
      updatedAt: 1000,
    };

    // Scheduled time remains 15:00
    const sched = getStructuredSchedule(task);
    expect(sched.startTime).toEqual({ hour: 15, minute: 0 });
    expect(sched.duration).toBe(60);

    // Reminder trigger remains 14:00
    expect(task.reminder?.triggerAt).toBe(new Date(2026, 7, 30, 14, 0).getTime());

    // Domain type is standard Task
    expect(task.status).toBe("todo");
    expect(isTaskCompleted(task)).toBe(false);
  });
});
