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
  getStructuredSchedule,
  parseTimeString,
  parseDurationMinutes,
  calculateRescheduledTask,
} from "@/services/scheduling/scheduling.service";
import { useCalendarState } from "@/features/calendar/hooks/useCalendarState";
import { TaskRepository, WorkspaceRepository, UiStateRepository } from "@/repositories";
import { Task, Workspace } from "@/shared/types/domain.types";

const ws1: Workspace = { id: "ws-1", name: "Work", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 };

describe("Defensive Calendar Schedule Parsing (Fix #16)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    await WorkspaceRepository.saveWorkspaces([ws1]);
    await UiStateRepository.saveUiState({ activeWorkspaceId: "ws-1" });
  });

  // TEST 1: valid startTime "15:30" parses correctly
  test("TEST 1: valid startTime '15:30' parses correctly", () => {
    expect(parseTimeString("15:30")).toEqual({ hour: 15, minute: 30 });
    const sched = getStructuredSchedule({ schedule: { startTime: "15:30" } });
    expect(sched.startTime).toEqual({ hour: 15, minute: 30 });
    expect(sched.sortKey).toBe(15 * 60 + 30);
  });

  // TEST 2: invalid startTime "25:00" becomes untimed safely
  test("TEST 2: invalid startTime '25:00' becomes untimed safely", () => {
    expect(parseTimeString("25:00")).toBeUndefined();
    const sched = getStructuredSchedule({ schedule: { startTime: "25:00" } });
    expect(sched.startTime).toBeUndefined();
    expect(sched.sortKey).toBe(24 * 60);
  });

  // TEST 3: invalid startTime "12:60" becomes untimed safely
  test("TEST 3: invalid startTime '12:60' becomes untimed safely", () => {
    expect(parseTimeString("12:60")).toBeUndefined();
    const sched = getStructuredSchedule({ schedule: { startTime: "12:60" } });
    expect(sched.startTime).toBeUndefined();
    expect(sched.sortKey).toBe(24 * 60);
  });

  // TEST 4: malformed startTime values cannot produce NaN sortKey
  test("TEST 4: malformed startTime values ('invalid', '-1:00', '15', 'abc:def') produce finite sortKey", () => {
    const malformedList = ["", "   ", "invalid", "-1:00", "12:-1", "15", "9", "abc:def", "12:30:00"];
    for (const val of malformedList) {
      expect(parseTimeString(val)).toBeUndefined();
      const sched = getStructuredSchedule({ schedule: { startTime: val } });
      expect(sched.startTime).toBeUndefined();
      expect(Number.isFinite(sched.sortKey)).toBe(true);
      expect(isNaN(sched.sortKey)).toBe(false);
      expect(sched.sortKey).toBe(24 * 60);
    }
  });

  // TEST 5: duration 30 returns 30
  test("TEST 5: duration 30 returns 30", () => {
    expect(parseDurationMinutes(30)).toBe(30);
    const sched = getStructuredSchedule({ schedule: { durationMinutes: 30 } });
    expect(sched.duration).toBe(30);
  });

  // TEST 6: duration 90 returns 90
  test("TEST 6: duration 90 returns 90", () => {
    expect(parseDurationMinutes(90)).toBe(90);
    const sched = getStructuredSchedule({ schedule: { durationMinutes: 90 } });
    expect(sched.duration).toBe(90);
  });

  // TEST 7: duration 0 safely falls back to default
  test("TEST 7: duration 0 safely falls back to default", () => {
    expect(parseDurationMinutes(0)).toBeUndefined();
    const sched = getStructuredSchedule({ schedule: { durationMinutes: 0 } }, 60);
    expect(sched.duration).toBe(60);
  });

  // TEST 8: negative duration safely falls back to default
  test("TEST 8: negative duration (-30, -1) safely falls back to default", () => {
    expect(parseDurationMinutes(-30)).toBeUndefined();
    expect(parseDurationMinutes(-1)).toBeUndefined();
    const sched = getStructuredSchedule({ schedule: { durationMinutes: -30 } }, 60);
    expect(sched.duration).toBe(60);
  });

  // TEST 9: NaN/Infinity duration cannot produce invalid geometry
  test("TEST 9: NaN, Infinity, -Infinity, null, and object durations fall back to default", () => {
    expect(parseDurationMinutes(NaN)).toBeUndefined();
    expect(parseDurationMinutes(Infinity)).toBeUndefined();
    expect(parseDurationMinutes(-Infinity)).toBeUndefined();
    expect(parseDurationMinutes(null)).toBeUndefined();
    expect(parseDurationMinutes({})).toBeUndefined();

    const sched = getStructuredSchedule({ schedule: { durationMinutes: NaN } }, 60);
    expect(sched.duration).toBe(60);
    expect(Number.isFinite(sched.duration)).toBe(true);
  });

  // TEST 10: legacy 15:00 → 16:30 derives 90 minutes
  test("TEST 10: legacy 15:00 -> 16:30 derives 90 minutes", () => {
    const sched = getStructuredSchedule({
      schedule: { startTime: "15:00", endTime: "16:30" },
    });
    expect(sched.startTime).toEqual({ hour: 15, minute: 0 });
    expect(sched.duration).toBe(90);
  });

  // TEST 11: explicit durationMinutes takes precedence over legacy endTime
  test("TEST 11: explicit durationMinutes (120) takes precedence over legacy endTime (16:00)", () => {
    const sched = getStructuredSchedule({
      schedule: { startTime: "15:00", endTime: "16:00", durationMinutes: 120 },
    });
    expect(sched.startTime).toEqual({ hour: 15, minute: 0 });
    expect(sched.duration).toBe(120);
  });

  // TEST 12: invalid legacy endTime safely falls back to default duration
  test("TEST 12: invalid legacy endTime (14:00 earlier than 15:00, or invalid string) falls back to default", () => {
    // End earlier than start
    const sched1 = getStructuredSchedule({
      schedule: { startTime: "15:00", endTime: "14:00" },
    }, 60);
    expect(sched1.duration).toBe(60);

    // Malformed endTime
    const sched2 = getStructuredSchedule({
      schedule: { startTime: "15:00", endTime: "garbage" },
    }, 60);
    expect(sched2.duration).toBe(60);
  });

  // TEST 13: 23:30 + 90 remains finite and does not corrupt parser output
  test("TEST 13: 23:30 + 90 remains finite and does not corrupt parser output", () => {
    const sched = getStructuredSchedule({
      schedule: { startTime: "23:30", durationMinutes: 90 },
    });
    expect(sched.startTime).toEqual({ hour: 23, minute: 30 });
    expect(sched.duration).toBe(90);
    expect(sched.sortKey).toBe(23 * 60 + 30);
    expect(Number.isFinite(sched.sortKey)).toBe(true);
    expect(Number.isFinite(sched.duration)).toBe(true);
  });

  // TEST 14: Projection test: Task with invalid startTime="25:00" places into allDayItems without crashing
  test("TEST 14: Task with invalid startTime='25:00' projects into allDayItems safely in useCalendarState", async () => {
    const task: Task = {
      id: "task-invalid-time",
      workspaceId: "ws-1",
      title: "Broken Time Task",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30", startTime: "25:00", durationMinutes: -50 },
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

      // Item should safely be in allDayItems (untimed)
      expect(state!.allDayItems.some((i) => i.id === "task-invalid-time")).toBe(true);
      // Item should NOT be in timedItemsWithLayout
      expect(state!.timedItemsWithLayout.some((i) => i.id === "task-invalid-time")).toBe(false);
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  // TEST 15: Drag rescheduling with malformed existing endTime handles gracefully
  test("TEST 15: calculateRescheduledTask safely handles malformed existing endTime", () => {
    const task: Task = {
      id: "task-drag-safe",
      workspaceId: "ws-1",
      title: "Drag Test",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30", startTime: "10:00", endTime: "invalid" },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    const res = calculateRescheduledTask(task, { hour: 14 });
    expect(res.schedule?.startTime).toBe("14:00");
    expect(res.schedule?.endTime).toBe("invalid");
  });
});
