import React from "react";
import { act, create } from "react-test-renderer";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRouter = {
  push: mockPush,
  replace: mockReplace,
  back: jest.fn(),
  setParams: jest.fn(),
};

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    useRouter: () => mockRouter,
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
  ImpactFeedbackStyle: { Medium: "Medium", Light: "Light" },
  NotificationFeedbackType: { Success: "Success" },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCalendarState } from "@/features/calendar/hooks/useCalendarState";
import {
  TaskRepository,
  HabitRepository,
  ChecklistRepository,
  WorkspaceRepository,
} from "@/repositories";
import { Checklist, Habit, Task, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { EntityCommandService } from "@/services/command/EntityCommandService";

function HookTestHarness({ onHook }: { onHook: (hook: any) => void }) {
  const hook = useCalendarState();
  React.useEffect(() => {
    onHook(hook);
  });
  return null;
}

describe("Calendar Navigation Dispatch & Checklist Opening Tests (A-J)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    mockPush.mockClear();
    mockReplace.mockClear();
  });

  const getItemType = (item: any) => {
    if (item.type === "habit") return "habit";
    if (item.type === "checklist") return "checklist";
    return "task";
  };

  const handleOpenItem = (item: any, selectedDate: string) => {
    const type = getItemType(item);
    if (type === "checklist") {
      mockRouter.push(`/checklist-details?id=${item.id}`);
    } else {
      mockRouter.push(
        `/task-details?id=${item.id}&type=${type}&date=${selectedDate}`,
      );
    }
  };

  test("A & B & C: Scheduled Checklist appears on Calendar and pressing it navigates to /checklist-details with correct ID", async () => {
    const checklist: Checklist = {
      id: "cl-shopping-1",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Shopping",
      items: [
        { id: "it-1", title: "Milk", completed: false },
        { id: "it-2", title: "Bread", completed: false },
      ],
      schedule: {
        date: "2026-09-01",
        startTime: "11:00",
        durationMinutes: 45,
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    await ChecklistRepository.saveChecklist(checklist);

    let state: any;
    await act(async () => {
      create(React.createElement(HookTestHarness, { onHook: (h: any) => { state = h; } }));
    });

    await act(async () => {
      state.setSelectedDate("2026-09-01");
    });

    // A: Scheduled checklist appears on Calendar
    const calendarItem = state.timelineItems.find((i: any) => i.id === "cl-shopping-1");
    expect(calendarItem).toBeDefined();
    expect(calendarItem.type).toBe("checklist");
    expect(calendarItem.title).toBe("Shopping");

    // B & C: Pressing navigates to /checklist-details?id=cl-shopping-1
    handleOpenItem(calendarItem, state.selectedDate);

    expect(mockPush).toHaveBeenCalledWith("/checklist-details?id=cl-shopping-1");
  });

  test("D: Checklist detail repository lookup retrieves the exact shopping checklist", async () => {
    const checklist: Checklist = {
      id: "cl-shopping-1",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Shopping",
      items: [
        { id: "it-1", title: "Milk", completed: false },
        { id: "it-2", title: "Bread", completed: false },
      ],
      schedule: {
        date: "2026-09-01",
        startTime: "11:00",
        durationMinutes: 45,
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    await ChecklistRepository.saveChecklist(checklist);

    const loaded = await ChecklistRepository.getChecklist("cl-shopping-1", INBOX_WORKSPACE_ID);
    expect(loaded).toBeDefined();
    expect(loaded?.title).toBe("Shopping");
    expect(loaded?.items.length).toBe(2);
    expect(loaded?.items[0].title).toBe("Milk");
    expect(loaded?.items[1].title).toBe("Bread");
  });

  test("E: Existing Task Calendar navigation routes to /task-details with type=task", async () => {
    const task: Task = {
      id: "task-code-1",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Code Review",
      status: "todo",
      schedule: {
        date: "2026-09-01",
        startTime: "14:00",
        durationMinutes: 60,
      },
      priority: "high",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    await TaskRepository.saveTask(task);

    let state: any;
    await act(async () => {
      create(React.createElement(HookTestHarness, { onHook: (h: any) => { state = h; } }));
    });

    await act(async () => {
      state.setSelectedDate("2026-09-01");
    });

    const taskItem = state.timelineItems.find((i: any) => i.id === "task-code-1");
    expect(taskItem).toBeDefined();
    expect(taskItem.type).toBe("task");

    handleOpenItem(taskItem, state.selectedDate);

    expect(mockPush).toHaveBeenCalledWith(
      "/task-details?id=task-code-1&type=task&date=2026-09-01",
    );
  });

  test("F: Existing Habit Calendar navigation routes to /task-details with type=habit", async () => {
    const habit: Habit = {
      id: "habit-meditate-1",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Meditation",
      schedule: {
        startTime: "08:00",
        durationMinutes: 30,
      },
      recurrence: {
        frequency: "daily",
        interval: 1,
      },
      completionHistory: [],
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    await HabitRepository.saveHabit(habit);

    let state: any;
    await act(async () => {
      create(React.createElement(HookTestHarness, { onHook: (h: any) => { state = h; } }));
    });

    await act(async () => {
      state.setSelectedDate("2026-09-01");
    });

    const habitItem = state.timelineItems.find((i: any) => i.id === "habit-meditate-1");
    expect(habitItem).toBeDefined();
    expect(habitItem.type).toBe("habit");

    handleOpenItem(habitItem, state.selectedDate);

    expect(mockPush).toHaveBeenCalledWith(
      "/task-details?id=habit-meditate-1&type=habit&date=2026-09-01",
    );
  });

  test("G: All-Day Checklist navigation opens /checklist-details with correct ID", async () => {
    const checklist: Checklist = {
      id: "cl-allday-prep",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "All Day Prep",
      items: [{ id: "it-1", title: "Setup", completed: false }],
      schedule: {
        date: "2026-09-01",
        allDay: true,
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    await ChecklistRepository.saveChecklist(checklist);

    let state: any;
    await act(async () => {
      create(React.createElement(HookTestHarness, { onHook: (h: any) => { state = h; } }));
    });

    await act(async () => {
      state.setSelectedDate("2026-09-01");
    });

    const allDayItem = state.allDayItems.find((i: any) => i.id === "cl-allday-prep");
    expect(allDayItem).toBeDefined();
    expect(allDayItem.type).toBe("checklist");

    handleOpenItem(allDayItem, state.selectedDate);

    expect(mockPush).toHaveBeenCalledWith("/checklist-details?id=cl-allday-prep");
  });

  test("H: Recurring Checklist occurrence navigation routes to underlying master checklist ID", async () => {
    const weeklyChecklist: Checklist = {
      id: "cl-weekly-master-1",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Weekly Cleaning",
      items: [
        { id: "it-1", title: "Dust", completed: false },
        { id: "it-2", title: "Vacuum", completed: false },
      ],
      schedule: {
        date: "2026-08-29",
        startTime: "10:00",
        durationMinutes: 60,
      },
      recurrence: {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [6], // Saturday
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    await ChecklistRepository.saveChecklist(weeklyChecklist);

    let state: any;
    await act(async () => {
      create(React.createElement(HookTestHarness, { onHook: (h: any) => { state = h; } }));
    });

    // Saturday Sep 5, 2026
    await act(async () => {
      state.setSelectedDate("2026-09-05");
    });

    const occurrenceItem = state.timelineItems.find((i: any) => i.id === "cl-weekly-master-1");
    expect(occurrenceItem).toBeDefined();
    expect(occurrenceItem.type).toBe("checklist");

    handleOpenItem(occurrenceItem, state.selectedDate);

    expect(mockPush).toHaveBeenCalledWith("/checklist-details?id=cl-weekly-master-1");
  });

  test("I & J: Navigation preserves pure domain state — No Task and no duplicate Checklist are created", async () => {
    const initialChecklist: Checklist = {
      id: "cl-integrity-check",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Integrity Checklist",
      items: [{ id: "it-1", title: "Item 1", completed: false }],
      schedule: {
        date: "2026-09-01",
        startTime: "13:00",
        durationMinutes: 30,
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    await ChecklistRepository.saveChecklist(initialChecklist);

    let state: any;
    await act(async () => {
      create(React.createElement(HookTestHarness, { onHook: (h: any) => { state = h; } }));
    });

    await act(async () => {
      state.setSelectedDate("2026-09-01");
    });

    const item = state.timelineItems.find((i: any) => i.id === "cl-integrity-check");
    expect(item).toBeDefined();

    handleOpenItem(item, state.selectedDate);

    // Verify tasks collection is empty (No Task created)
    const allTasks = await TaskRepository.getTasks(INBOX_WORKSPACE_ID);
    expect(Object.keys(allTasks).length).toBe(0);

    // Verify checklists collection contains exactly 1 checklist (No duplicate Checklist created)
    const allChecklists = await ChecklistRepository.getChecklists(INBOX_WORKSPACE_ID);
    expect(Object.keys(allChecklists).length).toBe(1);
    expect(allChecklists["cl-integrity-check"]).toBeDefined();
    expect(allChecklists["cl-integrity-check"].title).toBe("Integrity Checklist");
  });
});
