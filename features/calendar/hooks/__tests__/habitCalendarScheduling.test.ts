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
  HabitRepository,
  UiStateRepository,
} from "@/repositories";
import { Habit, Workspace, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { isRecurringOccurrenceForDate } from "@/services/scheduling/recurrence.service";

const wsMain: Workspace = {
  id: "ws-main",
  name: "Main",
  createdAt: 100,
  updatedAt: 100,
};

describe("Habit Calendar Scheduling & Completion Invariants (Fix #13)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    await WorkspaceRepository.saveWorkspaces([wsMain]);
    await UiStateRepository.saveUiState({ activeWorkspaceId: "ws-main" });
  });

  // TEST 1: Habit Calendar placement follows recurrence rule and projects to allDayItems
  test("TEST 1: Habit appears on dates matching its recurrence rule and resides in allDayItems (Anytime)", async () => {
    const dailyHabit: Habit = {
      id: "habit-daily-1",
      workspaceId: "ws-main",
      title: "Drink Water",
      recurrence: { frequency: "daily", interval: 1 },
      completionHistory: [],
      createdAt: 1000,
      updatedAt: 1000,
    };
    const weekdayHabit: Habit = {
      id: "habit-weekday-1",
      workspaceId: "ws-main",
      title: "Review Team PRs",
      recurrence: { frequency: "weekly", interval: 1, daysOfWeek: [1, 2, 3, 4, 5] },
      completionHistory: [],
      createdAt: 1000,
      updatedAt: 1000,
    };

    await HabitRepository.saveHabit(dailyHabit);
    await HabitRepository.saveHabit(weekdayHabit);

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
      // 2026-08-30 is a Sunday
      await act(async () => {
        state!.setSelectedDate("2026-08-30");
      });

      // Daily habit appears on Sunday, weekday habit does not
      expect(state!.timelineItems.map((h) => h.id)).toContain("habit-daily-1");
      expect(state!.timelineItems.map((h) => h.id)).not.toContain("habit-weekday-1");

      // Both reside in allDayItems ("Anytime")
      expect(state!.allDayItems.map((h) => h.id)).toContain("habit-daily-1");

      // 2026-08-31 is a Monday
      await act(async () => {
        state!.setSelectedDate("2026-08-31");
      });

      // Both appear on Monday
      expect(state!.timelineItems.map((h) => h.id)).toContain("habit-daily-1");
      expect(state!.timelineItems.map((h) => h.id)).toContain("habit-weekday-1");
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  // TEST 2: Habit reminder triggerAt does not change calendar placement
  test("TEST 2: Habit with reminder.triggerAt remains in allDayItems and does not occupy an hourly slot", async () => {
    const habitWithReminder: Habit = {
      id: "habit-with-reminder",
      workspaceId: "ws-main",
      title: "Evening Meditation",
      recurrence: { frequency: "daily", interval: 1 },
      reminder: {
        enabled: true,
        triggerAt: new Date(2026, 7, 30, 20, 30).getTime(), // 8:30 PM reminder
      },
      completionHistory: [],
      createdAt: 1000,
      updatedAt: 1000,
    };

    await HabitRepository.saveHabit(habitWithReminder);

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

      const habitItem = state!.timelineItems.find((h) => h.id === "habit-with-reminder");
      expect(habitItem).toBeDefined();
      expect(habitItem?.timeLabel).toBe("Anytime");

      // Verifies it is in allDayItems, not timedItemsWithLayout
      expect(state!.allDayItems.map((h) => h.id)).toContain("habit-with-reminder");
      expect(state!.timedItemsWithLayout.map((h) => h.id)).not.toContain("habit-with-reminder");
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  // TEST 4 & 5: Completion history is preserved and correctly read per date
  test("TEST 4 & 5: Completion history correctly reflects completed status on completed date and incomplete on other dates", async () => {
    const habitWithHistory: Habit = {
      id: "habit-streak-1",
      workspaceId: "ws-main",
      title: "Daily Journaling",
      recurrence: { frequency: "daily", interval: 1 },
      completionHistory: [
        { date: "2026-08-29", completedAt: 1000 },
        { date: "2026-08-30", completedAt: 2000 },
      ],
      streak: 2,
      createdAt: 1000,
      updatedAt: 1000,
    };

    await HabitRepository.saveHabit(habitWithHistory);

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
      // Aug 30: Completed
      await act(async () => {
        state!.setSelectedDate("2026-08-30");
      });
      const aug30Item = state!.timelineItems.find((h) => h.id === "habit-streak-1");
      expect(aug30Item?.completed).toBe(true);

      // Aug 31: Not yet completed
      await act(async () => {
        state!.setSelectedDate("2026-08-31");
      });
      const aug31Item = state!.timelineItems.find((h) => h.id === "habit-streak-1");
      expect(aug31Item?.completed).toBe(false);
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });
});
