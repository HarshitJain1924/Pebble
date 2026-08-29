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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { TaskDetailContent } from "@/features/details/task/TaskDetailContent";
import { TaskDetailForm } from "@/features/details/task/components/TaskDetailForm";
import { TaskRepository, WorkspaceRepository } from "@/repositories";
import { Task, Workspace } from "@/shared/types/domain.types";
import { getStructuredSchedule } from "@/services/scheduling/scheduling.service";
import { computeTriggerEpoch } from "@/features/details/task/hooks/useTaskDetailForm";

const ws1: Workspace = { id: "ws-1", name: "Work", createdAt: 1, updatedAt: 1 };

function findByAccessibilityLabel(root: any, label: string) {
  const match = root.findAll(
    (node: any) => node.props && node.props.accessibilityLabel === label
  );
  if (!match || match.length === 0) {
    throw new Error(`Element with accessibilityLabel "${label}" not found`);
  }
  return match[0];
}

describe("Calendar Task Creation & Edit Semantics (Fix #18)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    await WorkspaceRepository.saveWorkspaces([ws1]);
  });

  // TEST 1, 2, 3: Calendar slot creation persists schedule.startTime, date, and leaves reminder undefined
  test("TEST 1, 2, 3: Calendar 15:00 and 09:00 creation persists startTime and leaves reminder undefined", async () => {
    let renderer15: any;
    await act(async () => {
      renderer15 = create(
        <TaskDetailContent
          taskId="new-15"
          workspaceId="ws-1"
          selectedOccurrenceDate="2026-08-30"
          initialStartTime="15:00"
          onBack={() => {}}
          onConvertedToHabit={() => {}}
        />
      );
    });

    const form15 = renderer15.root.findByType(TaskDetailForm);
    expect(form15.props.form.startTime).toBe("15:00");
    expect(form15.props.form.reminderTime).toBeUndefined();

    await act(async () => {
      form15.props.update({ title: "3 PM Meeting" });
    });
    await act(async () => {
      findByAccessibilityLabel(renderer15.root, "Save task").props.onPress();
    });

    const saved15 = await TaskRepository.getTask("new-15", "ws-1");
    expect(saved15?.schedule?.date).toBe("2026-08-30");
    expect(saved15?.schedule?.startTime).toBe("15:00");
    expect(saved15?.reminder).toBeUndefined(); // TEST 3: No accidental reminder

    // 09:00 creation
    let renderer09: any;
    await act(async () => {
      renderer09 = create(
        <TaskDetailContent
          taskId="new-09"
          workspaceId="ws-1"
          selectedOccurrenceDate="2026-08-30"
          initialStartTime="09:00"
          onBack={() => {}}
          onConvertedToHabit={() => {}}
        />
      );
    });

    const form09 = renderer09.root.findByType(TaskDetailForm);
    expect(form09.props.form.startTime).toBe("09:00");
    await act(async () => {
      form09.props.update({ title: "Morning Standup" });
    });
    await act(async () => {
      findByAccessibilityLabel(renderer09.root, "Save task").props.onPress();
    });

    const saved09 = await TaskRepository.getTask("new-09", "ws-1");
    expect(saved09?.schedule?.startTime).toBe("09:00");
    expect(saved09?.reminder).toBeUndefined();
  });

  // TEST 4: Existing Task opened from Calendar does not get its persisted startTime overwritten
  test("TEST 4: Existing Task opened with route param initialStartTime='15:00' keeps persisted '09:00'", async () => {
    const existing: Task = {
      id: "task-persist-time",
      workspaceId: "ws-1",
      title: "Persisted Morning Task",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-30", startTime: "09:00", durationMinutes: 60 },
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(existing);

    let renderer: any;
    await act(async () => {
      renderer = create(
        <TaskDetailContent
          taskId="task-persist-time"
          workspaceId="ws-1"
          selectedOccurrenceDate="2026-08-30"
          initialStartTime="15:00" // Route context
          onBack={() => {}}
          onConvertedToHabit={() => {}}
        />
      );
    });

    const task = await TaskRepository.getTask("task-persist-time", "ws-1");
    expect(task?.schedule?.startTime).toBe("09:00");
  });

  // TEST 5 & 6: Changing startTime changes placement; changing reminder does not change placement
  test("TEST 5 & 6: Changing startTime changes placement; changing reminder leaves placement untouched", async () => {
    const task: Task = {
      id: "task-modify-time",
      workspaceId: "ws-1",
      title: "Flexible Event",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30", startTime: "15:00", durationMinutes: 60 },
      reminder: { enabled: true, triggerAt: new Date(2026, 7, 30, 14, 0).getTime() },
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(task);

    // Initial check: Calendar placement 15:00
    expect(getStructuredSchedule(task).startTime).toEqual({ hour: 15, minute: 0 });

    // Modify reminder to 16:00
    let renderer: any;
    await act(async () => {
      renderer = create(
        <TaskDetailContent
          taskId="task-modify-time"
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

    const form = renderer.root.findByType(TaskDetailForm);
    await act(async () => {
      form.props.update({ reminderTime: { hour: 16, minute: 0 } });
    });
    await act(async () => {
      findByAccessibilityLabel(renderer.root, "Save task").props.onPress();
    });

    const updatedTask = await TaskRepository.getTask("task-modify-time", "ws-1");
    // Calendar placement remains at 15:00
    expect(getStructuredSchedule(updatedTask!).startTime).toEqual({ hour: 15, minute: 0 });
    // Reminder is now at 16:00
    expect(updatedTask?.reminder?.triggerAt).toBe(new Date(2026, 7, 30, 16, 0).getTime());
  });

  // TEST 7 & 8: Removing startTime converts to all-day; removing reminder clears reminder
  test("TEST 7 & 8: Clearing startTime converts to all-day; clearing reminder deletes reminder object", async () => {
    const task: Task = {
      id: "task-clear-fields",
      workspaceId: "ws-1",
      title: "To Be Cleared",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30", startTime: "15:00", durationMinutes: 60 },
      reminder: { enabled: true, triggerAt: new Date(2026, 7, 30, 14, 0).getTime() },
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(task);

    let renderer: any;
    await act(async () => {
      renderer = create(
        <TaskDetailContent
          taskId="task-clear-fields"
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

    const form = renderer.root.findByType(TaskDetailForm);
    await act(async () => {
      form.props.update({ startTime: undefined, reminderTime: undefined, reminderDate: undefined });
    });
    await act(async () => {
      findByAccessibilityLabel(renderer.root, "Save task").props.onPress();
    });

    const cleared = await TaskRepository.getTask("task-clear-fields", "ws-1");
    expect(cleared?.schedule?.startTime).toBeUndefined();
    expect(cleared?.schedule?.date).toBe("2026-08-30"); // All-day on 2026-08-30
    expect(cleared?.reminder).toBeUndefined(); // Stale reminder deleted
  });

  // TEST 9 & 10: 30-minute and 90-minute durations survive save and reopen
  test("TEST 9 & 10: 30m and 90m durations survive save and reopen", async () => {
    const t30: Task = {
      id: "t-30-survive",
      workspaceId: "ws-1",
      title: "30 Min Block",
      status: "todo",
      priority: "low",
      schedule: { date: "2026-08-30", startTime: "10:00", durationMinutes: 30 },
      createdAt: 1000,
      updatedAt: 1000,
    };
    const t90: Task = {
      id: "t-90-survive",
      workspaceId: "ws-1",
      title: "90 Min Block",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-30", startTime: "14:00", durationMinutes: 90 },
      createdAt: 1000,
      updatedAt: 1000,
    };

    await TaskRepository.saveTask(t30);
    await TaskRepository.saveTask(t90);

    const sched30 = getStructuredSchedule(await TaskRepository.getTask("t-30-survive", "ws-1"));
    const sched90 = getStructuredSchedule(await TaskRepository.getTask("t-90-survive", "ws-1"));

    expect(sched30.duration).toBe(30);
    expect(sched90.duration).toBe(90);
  });

  // TEST 11: Legacy endTime remains compatible where required
  test("TEST 11: Legacy endTime computes 90m duration when durationMinutes is absent", () => {
    const legacy: Task = {
      id: "t-legacy",
      workspaceId: "ws-1",
      title: "Legacy Workshop",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30", startTime: "15:00", endTime: "16:30" },
      createdAt: 1000,
      updatedAt: 1000,
    };
    expect(getStructuredSchedule(legacy).duration).toBe(90);
  });

  // TEST 12: Malformed/invalid duration falls back safely
  test("TEST 12: Negative duration (-45) falls back safely to default duration", () => {
    const badDuration: Task = {
      id: "t-bad-dur",
      workspaceId: "ws-1",
      title: "Corrupt Duration",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30", startTime: "10:00", durationMinutes: -45 },
      createdAt: 1000,
      updatedAt: 1000,
    };
    expect(getStructuredSchedule(badDuration).duration).toBe(60);
  });

  // TEST 13, 14, 15: Reminder date + time produce correct trigger epoch, independent from calendar date
  test("TEST 13, 14, 15: computeTriggerEpoch generates exact timestamp independent from calendar date", () => {
    // Schedule date is 2026-08-30, reminder date is 2026-08-29 20:00
    const epoch = computeTriggerEpoch(20, 0, "2026-08-29");
    const expected = new Date(2026, 7, 29, 20, 0, 0, 0).getTime();
    expect(epoch).toBe(expected);
  });
});
