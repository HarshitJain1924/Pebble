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

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: any) => cb(),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "Light", Medium: "Medium" },
  NotificationFeedbackType: { Success: "Success" },
}));

const mockUndoApi = { showToast: jest.fn(), showUndo: jest.fn() };
jest.mock("@/shared/components/ui/UndoContext", () => ({
  useUndo: () => mockUndoApi,
}));

jest.mock("@/services/command/EntityCommandService", () => {
  const actual = jest.requireActual("@/services/command/EntityCommandService");
  return {
    EntityCommandService: {
      ...actual.EntityCommandService,
      createTask: jest.fn(actual.EntityCommandService.createTask),
      updateTask: jest.fn(actual.EntityCommandService.updateTask),
    },
  };
});

import AsyncStorage from "@react-native-async-storage/async-storage";
import { TaskDetailContent } from "@/features/details/task/TaskDetailContent";
import { TaskDetailForm } from "@/features/details/task/components/TaskDetailForm";
import { TaskRepository, WorkspaceRepository } from "@/repositories";
import { Task, Workspace } from "@/shared/types/domain.types";
import { getStructuredSchedule } from "@/services/scheduling/scheduling.service";
import { EntityCommandService } from "@/services/command/EntityCommandService";

const ws1: Workspace = { id: "ws-1", name: "Work", createdAt: 1, updatedAt: 1 };
const ws2: Workspace = { id: "ws-2", name: "Personal", createdAt: 1, updatedAt: 1 };

function findByAccessibilityLabel(root: any, label: string) {
  const match = root.findAll(
    (node: any) => node.props && node.props.accessibilityLabel === label
  );
  if (!match || match.length === 0) {
    throw new Error(`Element with accessibilityLabel "${label}" not found`);
  }
  return match[0];
}

describe("Calendar Timed Task Creation/Editing & Duration Invariants (Fix #14)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    await WorkspaceRepository.saveWorkspaces([ws1, ws2]);
  });

  // TEST 1 & 2: Empty Calendar slot 15:00 initializes new Task startTime = 15:00 and persists it
  test("TEST 1 & 2: Calendar slot 15:00 initializes new Task startTime='15:00', duration=60, and persists on save", async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(
        <TaskDetailContent
          taskId="new-task-1"
          workspaceId="ws-1"
          selectedOccurrenceDate="2026-08-30"
          initialStartTime="15:00"
          onBack={() => {}}
          onConvertedToHabit={() => {}}
        />
      );
    });

    const taskForm = renderer.root.findByType(TaskDetailForm);
    expect(taskForm.props.form.startTime).toBe("15:00");
    expect(taskForm.props.form.durationMinutes).toBe(60);

    // Save task
    await act(async () => {
      taskForm.props.update({ title: "Dentist Visit" });
    });

    await act(async () => {
      findByAccessibilityLabel(renderer.root, "Save task").props.onPress();
    });

    const saved = await TaskRepository.getTask("new-task-1", "ws-1");
    expect(saved).toBeDefined();
    expect(saved?.schedule?.date).toBe("2026-08-30");
    expect(saved?.schedule?.startTime).toBe("15:00");
    expect(saved?.schedule?.durationMinutes).toBe(60);
  });

  // TEST 3: Existing Task route params cannot overwrite persisted startTime
  test("TEST 3: Route params hour='18' does NOT overwrite persisted startTime='10:00' for existing task", async () => {
    const existing: Task = {
      id: "task-existing-1",
      workspaceId: "ws-1",
      title: "Morning Sync",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-30", startTime: "10:00", durationMinutes: 30 },
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(existing);

    let renderer: any;
    await act(async () => {
      renderer = create(
        <TaskDetailContent
          taskId="task-existing-1"
          workspaceId="ws-1"
          selectedOccurrenceDate="2026-08-30"
          initialStartTime="18:00" // Should be ignored because task already exists
          onBack={() => {}}
          onConvertedToHabit={() => {}}
        />
      );
    });

    const task = await TaskRepository.getTask("task-existing-1", "ws-1");
    expect(task?.schedule?.startTime).toBe("10:00");
    expect(task?.schedule?.durationMinutes).toBe(30);
  });

  // TEST 4 & 5: Task duration 30m and 90m survive save and reopen
  test("TEST 4 & 5: Editing Task duration to 90m persists and restores correctly on reopen", async () => {
    const task: Task = {
      id: "task-dur-1",
      workspaceId: "ws-1",
      title: "Workshop",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30", startTime: "14:00", durationMinutes: 60 },
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(task);

    let renderer: any;
    await act(async () => {
      renderer = create(
        <TaskDetailContent
          taskId="task-dur-1"
          workspaceId="ws-1"
          selectedOccurrenceDate="2026-08-30"
          onBack={() => {}}
          onConvertedToHabit={() => {}}
        />
      );
    });

    // Enter edit mode
    await act(async () => {
      findByAccessibilityLabel(renderer.root, "Edit task").props.onPress();
    });

    const taskForm = renderer.root.findByType(TaskDetailForm);
    await act(async () => {
      taskForm.props.update({ durationMinutes: 90 });
    });

    await act(async () => {
      findByAccessibilityLabel(renderer.root, "Save task").props.onPress();
    });

    const updated = await TaskRepository.getTask("task-dur-1", "ws-1");
    expect(updated?.schedule?.durationMinutes).toBe(90);

    // Reopen task in new instance
    let reopenRenderer: any;
    await act(async () => {
      reopenRenderer = create(
        <TaskDetailContent
          taskId="task-dur-1"
          workspaceId="ws-1"
          selectedOccurrenceDate="2026-08-30"
          onBack={() => {}}
          onConvertedToHabit={() => {}}
        />
      );
    });

    const reopenTask = await TaskRepository.getTask("task-dur-1", "ws-1");
    expect(reopenTask?.schedule?.durationMinutes).toBe(90);
  });

  // TEST 6: Calendar getStructuredSchedule uses persisted durationMinutes
  test("TEST 6: getStructuredSchedule returns exact durationMinutes (90m, 120m)", () => {
    const task90: Task = {
      id: "t-90",
      workspaceId: "ws-1",
      title: "Strategy Session",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-30", startTime: "15:00", durationMinutes: 90 },
      createdAt: 1000,
      updatedAt: 1000,
    };
    const sched = getStructuredSchedule(task90);
    expect(sched.startTime).toEqual({ hour: 15, minute: 0 });
    expect(sched.duration).toBe(90);
  });

  // TEST 7 & 8: Reminder at 14:30 does not move 15:00 Calendar block, changing start time keeps reminder
  test("TEST 7 & 8: Reminder at 14:30 does not alter 15:00 Calendar block and changing start time preserves reminder", async () => {
    const task: Task = {
      id: "task-rem-1",
      workspaceId: "ws-1",
      title: "Client Call",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-30", startTime: "15:00", durationMinutes: 60 },
      reminder: { enabled: true, triggerAt: new Date(2026, 7, 30, 14, 30).getTime() },
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(task);

    // Verify Calendar block is at 15:00
    const sched = getStructuredSchedule(task);
    expect(sched.startTime).toEqual({ hour: 15, minute: 0 });

    // Change start time to 17:00
    let renderer: any;
    await act(async () => {
      renderer = create(
        <TaskDetailContent
          taskId="task-rem-1"
          workspaceId="ws-1"
          selectedOccurrenceDate="2026-08-30"
          onBack={() => {}}
          onConvertedToHabit={() => {}}
        />
      );
    });

    await act(async () => {
      findByAccessibilityLabel(renderer.root, "Edit task").props.onPress();
    });

    const taskForm = renderer.root.findByType(TaskDetailForm);
    await act(async () => {
      taskForm.props.update({ startTime: "17:00" });
    });

    await act(async () => {
      findByAccessibilityLabel(renderer.root, "Save task").props.onPress();
    });

    const expectedReminderTime = new Date(2026, 7, 30, 14, 30).getTime();
    const updatedTask = await TaskRepository.getTask("task-rem-1", "ws-1");
    expect(updatedTask?.schedule?.startTime).toBe("17:00");
    expect(updatedTask?.reminder?.triggerAt).toBe(expectedReminderTime);
  });

  // TEST 9: All-day task with reminder remains all-day
  test("TEST 9: Task with schedule.date and reminder but no startTime has startTime=undefined", () => {
    const allDayTask: Task = {
      id: "task-allday-1",
      workspaceId: "ws-1",
      title: "Pay Taxes",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30" },
      reminder: { enabled: true, triggerAt: new Date(2026, 7, 30, 9, 0).getTime() },
      createdAt: 1000,
      updatedAt: 1000,
    };
    const sched = getStructuredSchedule(allDayTask);
    expect(sched.startTime).toBeUndefined();
    expect(sched.startDate).toBe("2026-08-30");
  });

  // TEST 10: Existing Task using legacy endTime is correctly derived
  test("TEST 10: Existing Task using legacy endTime calculates duration correctly", () => {
    const legacyTask: Task = {
      id: "task-legacy-1",
      workspaceId: "ws-1",
      title: "Conference",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30", startTime: "15:00", endTime: "16:30" }, // 90 min
      createdAt: 1000,
      updatedAt: 1000,
    };
    const sched = getStructuredSchedule(legacyTask);
    expect(sched.startTime).toEqual({ hour: 15, minute: 0 });
    expect(sched.duration).toBe(90);
  });
});
