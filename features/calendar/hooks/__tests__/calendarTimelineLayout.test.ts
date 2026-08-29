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
import { TaskRepository, HabitRepository, WorkspaceRepository, UiStateRepository } from "@/repositories";
import { Task, Habit, Workspace } from "@/shared/types/domain.types";
import { getStructuredSchedule } from "@/services/scheduling/scheduling.service";

const ws1: Workspace = { id: "ws-1", name: "Work", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 };

describe("Calendar Timeline Layout, Overlap, and Duration Rendering Invariants (Fix #15)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    await WorkspaceRepository.saveWorkspaces([ws1]);
    await UiStateRepository.saveUiState({ activeWorkspaceId: "ws-1" });
  });

  // TEST 1: Variable duration block heights & coordinates
  test("TEST 1: 30m, 60m, 90m, 120m tasks calculate exact start and duration geometry", () => {
    const t30: Task = {
      id: "t-30",
      workspaceId: "ws-1",
      title: "Quick Standup",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30", startTime: "09:30", durationMinutes: 30 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const t90: Task = {
      id: "t-90",
      workspaceId: "ws-1",
      title: "Architecture Review",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-30", startTime: "15:30", durationMinutes: 90 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    const s30 = getStructuredSchedule(t30);
    expect(s30.startTime).toEqual({ hour: 9, minute: 30 });
    expect(s30.duration).toBe(30);
    expect(s30.sortKey).toBe(9 * 60 + 30); // 570 min

    const s90 = getStructuredSchedule(t90);
    expect(s90.startTime).toEqual({ hour: 15, minute: 30 });
    expect(s90.duration).toBe(90);
    expect(s90.sortKey).toBe(15 * 60 + 30); // 930 min
  });

  // TEST 2: Overlapping tasks layout clustering & column assignment
  test("TEST 2: Overlapping tasks occupy separate columns, non-overlapping tasks reuse columns", async () => {
    // Task A: 09:00 - 11:00 (120m)
    const taskA: Task = {
      id: "task-A",
      workspaceId: "ws-1",
      title: "Sprint Planning",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-30", startTime: "09:00", durationMinutes: 120 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    // Task B: 09:30 - 10:00 (30m) -> Overlaps with A -> col 1
    const taskB: Task = {
      id: "task-B",
      workspaceId: "ws-1",
      title: "Quick 1:1",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30", startTime: "09:30", durationMinutes: 30 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    // Task C: 10:00 - 11:00 (60m) -> Overlaps with A, touches B -> reuses col 1!
    const taskC: Task = {
      id: "task-C",
      workspaceId: "ws-1",
      title: "Design Review",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30", startTime: "10:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    await TaskRepository.saveTask(taskA);
    await TaskRepository.saveTask(taskB);
    await TaskRepository.saveTask(taskC);

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
        state!.setSelectedDate("2026-08-30");
      });

      const layout = state!.timedItemsWithLayout;
      expect(layout).toHaveLength(3);

      const itemA = layout.find((i) => i.id === "task-A");
      const itemB = layout.find((i) => i.id === "task-B");
      const itemC = layout.find((i) => i.id === "task-C");

      expect(itemA?.colIdx).toBe(0);
      expect(itemA?.totalCols).toBe(2);

      expect(itemB?.colIdx).toBe(1);
      expect(itemB?.totalCols).toBe(2);

      // Task C reuses column 1 because B ended at 10:00!
      expect(itemC?.colIdx).toBe(1);
      expect(itemC?.totalCols).toBe(2);
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  // TEST 3: Touching tasks (09:00-10:00 and 10:00-11:00) do NOT overlap
  test("TEST 3: Touching tasks (09:00-10:00 and 10:00-11:00) are not treated as overlapping", async () => {
    const task1: Task = {
      id: "task-1",
      workspaceId: "ws-1",
      title: "Part 1",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30", startTime: "09:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const task2: Task = {
      id: "task-2",
      workspaceId: "ws-1",
      title: "Part 2",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30", startTime: "10:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    await TaskRepository.saveTask(task1);
    await TaskRepository.saveTask(task2);

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
        state!.setSelectedDate("2026-08-30");
      });

      const layout = state!.timedItemsWithLayout;
      expect(layout).toHaveLength(2);
      // Both occupy single-column width (totalCols = 1)
      expect(layout[0].totalCols).toBe(1);
      expect(layout[1].totalCols).toBe(1);
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  // TEST 4: Mixed all-day items and timed tasks partition cleanly
  test("TEST 4: 2 all-day tasks, 1 habit, and 2 timed tasks partition cleanly without duplication", async () => {
    const allDay1: Task = {
      id: "ad-1",
      workspaceId: "ws-1",
      title: "Pay Bills",
      status: "todo",
      priority: "low",
      schedule: { date: "2026-08-30" },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const allDay2: Task = {
      id: "ad-2",
      workspaceId: "ws-1",
      title: "Quarterly Review Due",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-30" },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const habit: Habit = {
      id: "hab-1",
      workspaceId: "ws-1",
      title: "Daily Meditation",
      recurrence: { frequency: "daily", interval: 1 },
      completionHistory: [],
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const timed1: Task = {
      id: "timed-1",
      workspaceId: "ws-1",
      title: "Doctor Appointment",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-30", startTime: "11:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const timed2: Task = {
      id: "timed-2",
      workspaceId: "ws-1",
      title: "Team Sync",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30", startTime: "14:00", durationMinutes: 30 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    await TaskRepository.saveTask(allDay1);
    await TaskRepository.saveTask(allDay2);
    await HabitRepository.saveHabit(habit);
    await TaskRepository.saveTask(timed1);
    await TaskRepository.saveTask(timed2);

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
        state!.setSelectedDate("2026-08-30");
      });

      expect(state!.timelineItems).toHaveLength(5);
      expect(state!.allDayItems.map((i) => i.id)).toEqual(
        expect.arrayContaining(["ad-1", "ad-2", "hab-1"])
      );
      expect(state!.allDayItems).toHaveLength(3);

      expect(state!.timedItemsWithLayout.map((i) => i.id)).toEqual(
        expect.arrayContaining(["timed-1", "timed-2"])
      );
      expect(state!.timedItemsWithLayout).toHaveLength(2);
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  // TEST 5: Legacy endTime properly derives duration
  test("TEST 5: Task with legacy endTime (15:00-16:30) resolves to 90m duration", () => {
    const legacyTask: Task = {
      id: "task-legacy",
      workspaceId: "ws-1",
      title: "Client Pitch",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-30", startTime: "15:00", endTime: "16:30" },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    const sched = getStructuredSchedule(legacyTask);
    expect(sched.startTime).toEqual({ hour: 15, minute: 0 });
    expect(sched.duration).toBe(90);
  });
});
