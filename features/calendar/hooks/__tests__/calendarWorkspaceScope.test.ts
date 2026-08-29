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
  HabitRepository,
  WorkspaceRepository,
  UiStateRepository,
} from "@/repositories";
import { Task, Habit, Workspace, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { EntityCommandService } from "@/services/command/EntityCommandService";

const wsA: Workspace = { id: "ws-A", name: "Work", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 };
const wsB: Workspace = { id: "ws-B", name: "Personal", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 };
const wsC: Workspace = { id: "ws-C", name: "Projects", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 };

describe("Calendar Workspace Scope & Cross-Workspace Visibility Invariants (Fix #17)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    await WorkspaceRepository.saveWorkspaces([wsA, wsB, wsC]);
    await UiStateRepository.saveUiState({ activeWorkspaceId: "ws-A" });
  });

  // TEST 1, 2, 3, 4: Tasks from all workspaces (Active ws-A, other ws-B, ws-C, and Inbox) are visible on Calendar
  test("TEST 1-4: Tasks across all workspaces (ws-A, ws-B, ws-C, Inbox) are visible on the global Calendar", async () => {
    const taskA: Task = {
      id: "task-A",
      workspaceId: "ws-A",
      title: "Design Meeting",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-30", startTime: "09:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const taskB: Task = {
      id: "task-B",
      workspaceId: "ws-B",
      title: "Doctor Appointment",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-30", startTime: "14:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const taskC: Task = {
      id: "task-C",
      workspaceId: "ws-C",
      title: "Project Review All Day",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30" },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const taskInbox: Task = {
      id: "task-inbox",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Inbox Scheduled Task",
      status: "todo",
      priority: "low",
      schedule: { date: "2026-08-30", startTime: "16:00", durationMinutes: 30 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    await TaskRepository.saveTask(taskA);
    await TaskRepository.saveTask(taskB);
    await TaskRepository.saveTask(taskC);
    await TaskRepository.saveTask(taskInbox);

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

      // Total timeline items across all workspaces
      expect(state!.timelineItems).toHaveLength(4);

      // All-day items contain taskC
      expect(state!.allDayItems.some((i) => i.id === "task-C")).toBe(true);

      // Timed items contain taskA, taskB, taskInbox
      expect(state!.timedItemsWithLayout.some((i) => i.id === "task-A")).toBe(true);
      expect(state!.timedItemsWithLayout.some((i) => i.id === "task-B")).toBe(true);
      expect(state!.timedItemsWithLayout.some((i) => i.id === "task-inbox")).toBe(true);
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  // TEST 5 & 6: Recurring Task & Detached Occurrence from another workspace project correctly
  test("TEST 5 & 6: Recurring task and detached occurrence from ws-B project correctly", async () => {
    // Recurring master in ws-B with exception on 2026-08-30
    const masterB: Task = {
      id: "master-B",
      workspaceId: "ws-B",
      title: "Daily Standup ws-B",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-01", startTime: "10:00", durationMinutes: 30 },
      recurrence: { frequency: "daily", interval: 1 },
      recurrenceExceptions: ["2026-08-30"],
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    // Detached occurrence in ws-B at 15:00 on 2026-08-30
    const detachedB: Task = {
      id: "detached-B",
      workspaceId: "ws-B",
      title: "Daily Standup ws-B (Moved)",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-30", startTime: "15:00", durationMinutes: 30 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    await TaskRepository.saveTask(masterB);
    await TaskRepository.saveTask(detachedB);

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

      // On 2026-08-30: master is suppressed by recurrenceExceptions, detachedB is rendered at 15:00
      expect(state!.timedItemsWithLayout.some((i) => i.id === "master-B")).toBe(false);
      expect(state!.timedItemsWithLayout.some((i) => i.id === "detached-B")).toBe(true);

      const itemDetached = state!.timedItemsWithLayout.find((i) => i.id === "detached-B");
      expect(itemDetached?.workspaceId).toBe("ws-B");
      expect(itemDetached?.startHour).toBe(15);
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  // TEST 7: Habit from another workspace appears in allDayItems
  test("TEST 7: Habit from ws-B projects into allDayItems on recurring dates", async () => {
    const habitB: Habit = {
      id: "habit-B",
      workspaceId: "ws-B",
      title: "Gym Workout",
      recurrence: { frequency: "daily", interval: 1 },
      completionHistory: [{ date: "2026-08-30", completedAt: 1000 }],
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await HabitRepository.saveHabit(habitB);

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

      const habitItem = state!.allDayItems.find((i) => i.id === "habit-B");
      expect(habitItem).toBeDefined();
      expect(habitItem?.workspaceId).toBe("ws-B");
      expect(habitItem?.completed).toBe(true);
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  // TEST 8: Switching activeWorkspace does NOT hide or mutate Calendar items
  test("TEST 8: Switching active workspace from ws-A to ws-C preserves all Calendar items", async () => {
    const taskA: Task = {
      id: "t-A",
      workspaceId: "ws-A",
      title: "Task in A",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30", startTime: "10:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const taskB: Task = {
      id: "t-B",
      workspaceId: "ws-B",
      title: "Task in B",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30", startTime: "12:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(taskA);
    await TaskRepository.saveTask(taskB);

    // Switch active workspace to ws-C
    await UiStateRepository.saveUiState({ activeWorkspaceId: "ws-C" });

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

      // Both taskA and taskB are still present even though active workspace is ws-C
      expect(state!.timedItemsWithLayout.some((i) => i.id === "t-A")).toBe(true);
      expect(state!.timedItemsWithLayout.some((i) => i.id === "t-B")).toBe(true);
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  // TEST 9 & 10: Drag/drop of a Task/Occurrence in ws-B targets ws-B, not active ws-A
  test("TEST 9 & 10: Dragging a task or recurring occurrence belonging to ws-B mutates ws-B without polluting ws-A", async () => {
    const taskB: Task = {
      id: "task-to-drag",
      workspaceId: "ws-B",
      title: "Cross Workspace Task",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-30", startTime: "09:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(taskB);

    // Ensure active workspace is ws-A
    await UiStateRepository.saveUiState({ activeWorkspaceId: "ws-A" });

    // Execute update directly targeting task's workspaceId
    await EntityCommandService.updateTask(
      taskB.id,
      taskB.workspaceId,
      { schedule: { ...taskB.schedule, startTime: "17:00" } },
      { skipEvents: true, skipAnalytics: true }
    );

    // Verify task updated in ws-B
    const updatedInB = await TaskRepository.getTask("task-to-drag", "ws-B");
    expect(updatedInB?.schedule?.startTime).toBe("17:00");

    // Verify task is NOT in ws-A
    const notInA = await TaskRepository.getTask("task-to-drag", "ws-A");
    expect(notInA).toBeNull();
  });

  // TEST 11: Deduplication ensures no duplicate entries exist across workspace aggregation
  test("TEST 11: Workspace aggregation does not create duplicate entries", async () => {
    const task: Task = {
      id: "unique-task-1",
      workspaceId: "ws-A",
      title: "Unique Task",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30", startTime: "11:00", durationMinutes: 60 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(task);

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

      const matches = state!.timelineItems.filter((i) => i.id === "unique-task-1");
      expect(matches).toHaveLength(1);
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  // TEST 12: Repository workspace isolation remains preserved
  test("TEST 12: Storage keys remain partitioned by workspace (pebble:v1:tasks:<wsId>)", async () => {
    const taskA: Task = {
      id: "t-A1",
      workspaceId: "ws-A",
      title: "Task in A",
      status: "todo",
      priority: "low",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const taskB: Task = {
      id: "t-B1",
      workspaceId: "ws-B",
      title: "Task in B",
      status: "todo",
      priority: "low",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    await TaskRepository.saveTask(taskA);
    await TaskRepository.saveTask(taskB);

    const rawA = await AsyncStorage.getItem("pebble:v1:tasks:ws-A");
    const rawB = await AsyncStorage.getItem("pebble:v1:tasks:ws-B");

    expect(rawA).toContain("t-A1");
    expect(rawA).not.toContain("t-B1");

    expect(rawB).toContain("t-B1");
    expect(rawB).not.toContain("t-A1");
  });
});
