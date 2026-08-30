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
import { Task, Habit, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { emitStateChange } from "@/services/events/state-events";

describe("Calendar Selected Date Data Preservation (Fix #15)", () => {
  const taskAug30: Task = {
    id: "task-aug-30",
    workspaceId: INBOX_WORKSPACE_ID,
    title: "Task on August 30",
    status: "todo",
    priority: "medium",
    schedule: { date: "2026-08-30", startTime: "10:00" },
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  const taskAug31: Task = {
    id: "task-aug-31",
    workspaceId: INBOX_WORKSPACE_ID,
    title: "Task on August 31",
    status: "todo",
    priority: "high",
    schedule: { date: "2026-08-31", startTime: "15:00" },
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  const taskSep05: Task = {
    id: "task-sep-05",
    workspaceId: INBOX_WORKSPACE_ID,
    title: "Task on September 5",
    status: "todo",
    priority: "low",
    schedule: { date: "2026-09-05", startTime: "09:00" },
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  const habitDaily: Habit = {
    id: "habit-daily",
    workspaceId: INBOX_WORKSPACE_ID,
    title: "Daily Morning Reading",
    recurrence: { frequency: "daily", interval: 1 },
    completionHistory: [],
    schedule: { startTime: "08:00" },
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();

    await WorkspaceRepository.saveWorkspaces([
      { id: "ws-1", name: "Main", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ]);
    await UiStateRepository.saveUiState({ activeWorkspaceId: "ws-1" });

    await TaskRepository.saveTasks([taskAug30, taskAug31, taskSep05], INBOX_WORKSPACE_ID);
    await HabitRepository.saveHabits([habitDaily], INBOX_WORKSPACE_ID);
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
      await new Promise((r) => setTimeout(r, 20));
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

  test("Test A: changing selected date preserves loaded data and updates projection", async () => {
    const { getHook, unmount } = await renderCalendarHook();

    // Verify initial load has all 3 tasks and 1 habit loaded in state
    expect(getHook().allTodos.length).toBe(3);
    expect(getHook().allHabits.length).toBe(1);

    // 1. Select August 30
    await act(async () => {
      getHook().setSelectedDate("2026-08-30");
    });
    expect(getHook().selectedDate).toBe("2026-08-30");
    expect(getHook().allTodos.length).toBe(3);
    expect(getHook().allHabits.length).toBe(1);
    const titlesAug30 = getHook().timelineItems.map((item) => item.title);
    expect(titlesAug30).toContain("Task on August 30");
    expect(titlesAug30).toContain("Daily Morning Reading");
    expect(titlesAug30).not.toContain("Task on August 31");
    expect(titlesAug30).not.toContain("Task on September 5");

    // 2. Select August 31
    await act(async () => {
      getHook().setSelectedDate("2026-08-31");
    });
    expect(getHook().selectedDate).toBe("2026-08-31");
    expect(getHook().allTodos.length).toBe(3);
    expect(getHook().allHabits.length).toBe(1);
    const titlesAug31 = getHook().timelineItems.map((item) => item.title);
    expect(titlesAug31).toContain("Task on August 31");
    expect(titlesAug31).toContain("Daily Morning Reading");
    expect(titlesAug31).not.toContain("Task on August 30");
    expect(titlesAug31).not.toContain("Task on September 5");

    // 3. Select September 5
    await act(async () => {
      getHook().setSelectedDate("2026-09-05");
    });
    expect(getHook().selectedDate).toBe("2026-09-05");
    expect(getHook().allTodos.length).toBe(3);
    expect(getHook().allHabits.length).toBe(1);
    const titlesSep05 = getHook().timelineItems.map((item) => item.title);
    expect(titlesSep05).toContain("Task on September 5");
    expect(titlesSep05).toContain("Daily Morning Reading");
    expect(titlesSep05).not.toContain("Task on August 30");
    expect(titlesSep05).not.toContain("Task on August 31");

    // 4. Return to August 30
    await act(async () => {
      getHook().setSelectedDate("2026-08-30");
    });
    expect(getHook().selectedDate).toBe("2026-08-30");
    expect(getHook().allTodos.length).toBe(3);
    expect(getHook().allHabits.length).toBe(1);
    const titlesAug30Again = getHook().timelineItems.map((item) => item.title);
    expect(titlesAug30Again).toContain("Task on August 30");
    expect(titlesAug30Again).toContain("Daily Morning Reading");

    await unmount();
  });

  test("Test B: date selection does not trigger unnecessary repository loading", async () => {
    const { getHook, unmount } = await renderCalendarHook();

    // Verify initial load completed
    expect(getHook().allTodos.length).toBe(3);

    // Spy on repository getTasks and getHabits calls
    const getTasksSpy = jest.spyOn(TaskRepository, "getTasks");
    const getHabitsSpy = jest.spyOn(HabitRepository, "getHabits");
    getTasksSpy.mockClear();
    getHabitsSpy.mockClear();

    // Change date within the same month
    await act(async () => {
      getHook().setSelectedDate("2026-08-31");
    });

    // Change date across month boundaries
    await act(async () => {
      getHook().setSelectedDate("2026-09-15");
    });

    // Change date via prev/next month
    await act(async () => {
      getHook().handlePrevMonth();
    });

    await act(async () => {
      getHook().handleNextMonth();
    });

    // Assert that TaskRepository and HabitRepository were NOT called during date/month changes
    expect(getTasksSpy).not.toHaveBeenCalled();
    expect(getHabitsSpy).not.toHaveBeenCalled();

    getTasksSpy.mockRestore();
    getHabitsSpy.mockRestore();
    await unmount();
  });

  test("Test C: month synchronization remains correct during date navigation", async () => {
    const { getHook, unmount } = await renderCalendarHook();

    await act(async () => {
      getHook().setSelectedDate("2026-08-30");
    });
    expect(getHook().month).toEqual({ year: 2026, month: 7 }); // August

    await act(async () => {
      getHook().setSelectedDate("2026-09-15");
    });
    expect(getHook().month).toEqual({ year: 2026, month: 8 }); // September
    expect(getHook().selectedDate).toBe("2026-09-15");

    await act(async () => {
      getHook().setSelectedDate("2026-10-01");
    });
    expect(getHook().month).toEqual({ year: 2026, month: 9 }); // October
    expect(getHook().selectedDate).toBe("2026-10-01");

    await unmount();
  });

  test("Test D: legitimate state events still trigger repository reloads", async () => {
    const { getHook, unmount } = await renderCalendarHook();

    expect(getHook().allTodos.length).toBe(3);

    const getTasksSpy = jest.spyOn(TaskRepository, "getTasks");
    getTasksSpy.mockClear();

    // Emit tasks_changed event
    await act(async () => {
      emitStateChange("tasks_changed", "test");
      await new Promise((r) => setTimeout(r, 20));
    });

    // Assert that TaskRepository WAS called in response to legitimate event
    expect(getTasksSpy).toHaveBeenCalled();

    getTasksSpy.mockRestore();
    await unmount();
  });
});
