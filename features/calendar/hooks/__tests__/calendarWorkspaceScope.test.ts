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
  WorkspaceRepository,
  TaskRepository,
  HabitRepository,
  UiStateRepository,
} from "@/repositories";
import { Task, Habit, Workspace, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";

const wsWork: Workspace = {
  id: "ws-work",
  name: "Work",
  createdAt: 100,
  updatedAt: 100,
};

const wsPersonal: Workspace = {
  id: "ws-personal",
  name: "Personal",
  createdAt: 200,
  updatedAt: 200,
};

describe("Calendar Workspace Scope & Cross-Workspace Actions (Fix #12)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    await WorkspaceRepository.saveWorkspaces([wsWork, wsPersonal]);
    await UiStateRepository.saveUiState({ activeWorkspaceId: "ws-work" });
  });

  // TEST 1 & 2: Tasks from all workspaces appear on the Calendar
  test("TEST 1 & 2: Tasks from both active workspace (Work) and other workspace (Personal) appear on Calendar", async () => {
    const workTask: Task = {
      id: "task-work-1",
      workspaceId: "ws-work",
      title: "Team Standup",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-30", startTime: "09:00" },
      createdAt: 1000,
      updatedAt: 1000,
    };
    const personalTask: Task = {
      id: "task-pers-1",
      workspaceId: "ws-personal",
      title: "Dentist Appointment",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30", startTime: "15:00" },
      createdAt: 1000,
      updatedAt: 1000,
    };
    const inboxTask: Task = {
      id: "task-inbox-1",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Buy Milk",
      status: "todo",
      priority: "low",
      schedule: { date: "2026-08-30", startTime: "18:00" },
      createdAt: 1000,
      updatedAt: 1000,
    };

    await TaskRepository.saveTask(workTask);
    await TaskRepository.saveTask(personalTask);
    await TaskRepository.saveTask(inboxTask);

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

      const ids = state!.timelineItems.map((item) => item.id);
      expect(ids).toContain("task-work-1");
      expect(ids).toContain("task-pers-1");
      expect(ids).toContain("task-inbox-1");

      const persItem = state!.timelineItems.find((item) => item.id === "task-pers-1");
      expect(persItem?.workspaceId).toBe("ws-personal");
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  // TEST 3: Habit workspace behavior is preserved across all workspaces
  test("TEST 3: Habits from all workspaces appear on Calendar with correct workspaceId", async () => {
    const habitWork: Habit = {
      id: "habit-work-1",
      workspaceId: "ws-work",
      title: "Review PRs",
      recurrence: { frequency: "daily", interval: 1 },
      completionHistory: [],
      createdAt: 1000,
      updatedAt: 1000,
    };
    const habitPersonal: Habit = {
      id: "habit-pers-1",
      workspaceId: "ws-personal",
      title: "Daily Jog",
      recurrence: { frequency: "daily", interval: 1 },
      completionHistory: [],
      createdAt: 1000,
      updatedAt: 1000,
    };

    await HabitRepository.saveHabit(habitWork);
    await HabitRepository.saveHabit(habitPersonal);

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

      const ids = state!.timelineItems.map((item) => item.id);
      expect(ids).toContain("habit-work-1");
      expect(ids).toContain("habit-pers-1");
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  // TEST 6: Drag/Drop mutation targets the entity's actual workspace partition
  test("TEST 6: Dragging a task belonging to ws-personal while activeWorkspace is ws-work updates ws-personal correctly", async () => {
    const personalTask: Task = {
      id: "task-pers-1",
      workspaceId: "ws-personal",
      title: "Dentist Appointment",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30", startTime: "15:00" },
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(personalTask);

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

      const persItem = state!.timelineItems.find((item) => item.id === "task-pers-1");
      expect(persItem).toBeDefined();

      // Start drag of the personal task
      await act(async () => {
        state!.handleDragStart(persItem, 100, 100);
      });

      // Drop on hour 17:00
      await act(async () => {
        state!.setHoveredHour(17);
      });
      await act(async () => {
        await state!.handleDrop();
      });

      // Verify task in ws-personal partition is updated
      const personalTasks = await TaskRepository.getTasks("ws-personal");
      expect(personalTasks["task-pers-1"]).toBeDefined();
      expect(personalTasks["task-pers-1"].schedule?.startTime).toBe("17:00");

      // Verify task was NOT mistakenly written into ws-work
      const workTasks = await TaskRepository.getTasks("ws-work");
      expect(workTasks["task-pers-1"]).toBeUndefined();
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  // TEST 7: Recurring occurrence rescheduling uses the source Task's workspace
  test("TEST 7: Rescheduling recurring occurrence in ws-personal preserves workspace partition isolation", async () => {
    const recurringPersonal: Task = {
      id: "task-rec-pers",
      workspaceId: "ws-personal",
      title: "Weekly Therapy",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-01", startTime: "10:00" },
      recurrence: { frequency: "daily", interval: 1 },
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(recurringPersonal);

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

      const item = state!.timelineItems.find((t) => t.id === "task-rec-pers");
      expect(item).toBeDefined();

      // Drag recurring occurrence to 14:00
      await act(async () => {
        state!.handleDragStart(item, 100, 100);
      });

      await act(async () => {
        state!.setHoveredHour(14);
      });
      await act(async () => {
        await state!.handleDrop();
      });

      // Verify ws-personal partition holds both master with exception and detached task
      const personalTasks = await TaskRepository.getTasks("ws-personal");
      const master = personalTasks["task-rec-pers"];
      expect(master.recurrenceExceptions).toEqual(["2026-08-30"]);

      const tasksList = Object.values(personalTasks);
      const detached = tasksList.find((t) => t.id !== "task-rec-pers");
      expect(detached).toBeDefined();
      expect(detached?.workspaceId).toBe("ws-personal");
      expect(detached?.schedule?.startTime).toBe("14:00");

      // Verify ws-work remains pristine
      const workTasks = await TaskRepository.getTasks("ws-work");
      expect(Object.keys(workTasks)).toHaveLength(0);
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  // TEST 4: Changing active workspace does not lose or accidentally mutate Calendar data
  test("TEST 4: Changing active workspace reloads Calendar and continues to display all scheduled tasks", async () => {
    const workTask: Task = {
      id: "task-work-1",
      workspaceId: "ws-work",
      title: "Team Standup",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-30", startTime: "09:00" },
      createdAt: 1000,
      updatedAt: 1000,
    };
    const personalTask: Task = {
      id: "task-pers-1",
      workspaceId: "ws-personal",
      title: "Dentist Appointment",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30", startTime: "15:00" },
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(workTask);
    await TaskRepository.saveTask(personalTask);

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

      expect(state!.timelineItems.map((t) => t.id)).toEqual(
        expect.arrayContaining(["task-work-1", "task-pers-1"])
      );

      // User switches active workspace to "ws-personal"
      await act(async () => {
        await UiStateRepository.saveUiState({ activeWorkspaceId: "ws-personal" });
        const { emitStateChange } = require("@/services/events/state-events");
        emitStateChange("workspace_changed");
      });

      // Both tasks are still displayed safely without loss
      expect(state!.timelineItems.map((t) => t.id)).toEqual(
        expect.arrayContaining(["task-work-1", "task-pers-1"])
      );
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  // TEST 5: If multiple workspaces contain Tasks with same ID, deduplication handles it safely
  test("TEST 5: Duplicate Task IDs across workspaces are deduplicated by latest updatedAt without crash", async () => {
    const ghostOld: Task = {
      id: "shared-task-id",
      workspaceId: "ws-work",
      title: "Old Version",
      status: "todo",
      priority: "low",
      schedule: { date: "2026-08-30", startTime: "09:00" },
      createdAt: 1000,
      updatedAt: 1000,
    };
    const movedNewer: Task = {
      id: "shared-task-id",
      workspaceId: "ws-personal",
      title: "Newer Version",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-30", startTime: "14:00" },
      createdAt: 1000,
      updatedAt: 2000,
    };
    // Direct partition write to preserve exact simulated timestamps across partition boundaries
    await AsyncStorage.setItem(
      "pebble:v1:tasks:ws-work",
      JSON.stringify({ "shared-task-id": ghostOld })
    );
    await AsyncStorage.setItem(
      "pebble:v1:tasks:ws-personal",
      JSON.stringify({ "shared-task-id": movedNewer })
    );

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

      // Exactly 1 item with ID "shared-task-id" appears, using the newer one
      const matches = state!.timelineItems.filter((t) => t.id === "shared-task-id");
      expect(matches).toHaveLength(1);
      expect(matches[0].title).toBe("Newer Version");
      expect(matches[0].workspaceId).toBe("ws-personal");
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });
});
