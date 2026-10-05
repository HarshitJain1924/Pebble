import React from "react";
import { create, act } from "react-test-renderer";
import { useHabitStats } from "../useHabitStats";
import { Habit } from "@/shared/types/domain.types";
import { getTodayDateKey, getOffsetDateKey } from "@/shared/utils/date-key";

describe("useHabitStats Hook", () => {
  const today = getTodayDateKey();
  const yesterday = getOffsetDateKey(1, today);
  const twoDaysAgo = getOffsetDateKey(2, today);

  it("calculates completed dates, times completed, and marked dates from habit completionHistory", async () => {
    let hookData: any = null;
    function Harness() {
      hookData = useHabitStats();
      return null;
    }

    act(() => {
      create(<Harness />);
    });

    const habit: Habit = {
      id: "h-test-1",
      workspaceId: "ws-1",
      title: "Morning Run",
      recurrence: { frequency: "daily", interval: 1 },
      createdAt: Date.now() - 7 * 86400000,
      updatedAt: Date.now(),
      revision: 1,
      lifecycleGeneration: 1,
      completionHistory: [
        { date: twoDaysAgo, completedAt: 1000 },
        { date: yesterday, completedAt: 2000 },
        { date: today, completedAt: 3000 },
      ],
    };

    await act(async () => {
      await hookData.loadStats(habit);
    });

    expect(hookData.timesCompleted).toBe(3);
    expect(hookData.completedDates).toEqual([twoDaysAgo, yesterday, today].sort());
    expect(hookData.calendarMarkedDates[today]).toBeDefined();
    expect(hookData.calendarMarkedDates[today].selected).toBe(true);
    expect(hookData.calendarMarkedDates[yesterday].selected).toBe(true);
    expect(hookData.completionRate).toBeGreaterThan(0);
  });

  it("retains historical stats when a habit is renamed (entity identity persistence)", async () => {
    let hookData: any = null;
    function Harness() {
      hookData = useHabitStats();
      return null;
    }

    act(() => {
      create(<Harness />);
    });

    const habit: Habit = {
      id: "h-rename-1",
      workspaceId: "ws-1",
      title: "Gym",
      recurrence: { frequency: "daily", interval: 1 },
      createdAt: Date.now() - 5 * 86400000,
      updatedAt: Date.now(),
      revision: 1,
      lifecycleGeneration: 1,
      completionHistory: [
        { date: yesterday, completedAt: 1000 },
        { date: today, completedAt: 2000 },
      ],
    };

    await act(async () => {
      await hookData.loadStats(habit);
    });

    expect(hookData.timesCompleted).toBe(2);

    // Now rename the habit
    const renamedHabit: Habit = {
      ...habit,
      title: "Morning Gym Workout",
    };

    await act(async () => {
      await hookData.loadStats(renamedHabit);
    });

    // Stats remain intact because they are tied to entity identity / completionHistory
    expect(hookData.timesCompleted).toBe(2);
    expect(hookData.completedDates).toEqual([yesterday, today].sort());
  });

  it("keeps stats strictly isolated between two habits with the identical title", async () => {
    let hookDataA: any = null;
    let hookDataB: any = null;

    function HarnessA() {
      hookDataA = useHabitStats();
      return null;
    }
    function HarnessB() {
      hookDataB = useHabitStats();
      return null;
    }

    act(() => {
      create(<HarnessA />);
      create(<HarnessB />);
    });

    const habitA: Habit = {
      id: "h-a",
      workspaceId: "ws-1",
      title: "Read",
      recurrence: { frequency: "daily", interval: 1 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 1,
      lifecycleGeneration: 1,
      completionHistory: [{ date: today, completedAt: 1000 }],
    };

    const habitB: Habit = {
      id: "h-b",
      workspaceId: "ws-2",
      title: "Read", // Same title!
      recurrence: { frequency: "daily", interval: 1 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 1,
      lifecycleGeneration: 1,
      completionHistory: [], // No completions
    };

    await act(async () => {
      await hookDataA.loadStats(habitA);
      await hookDataB.loadStats(habitB);
    });

    expect(hookDataA.timesCompleted).toBe(1);
    expect(hookDataB.timesCompleted).toBe(0);
    expect(hookDataB.completedDates).toHaveLength(0);
    expect(hookDataB.completionRate).toBe(0);
  });
});
