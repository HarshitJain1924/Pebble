import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { HabitRepository } from "@/repositories";
import { Habit } from "@/shared/types/domain.types";
import {
  isHabitCompletedToday,
  getHabitCurrentStreak,
  getHabitBestStreak,
  getOffsetDateKey,
  getTodayDateKey,
} from "@/shared/utils/domain-selectors";

let mockStore: Record<string, string> = {};

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockImplementation(async (key) => mockStore[key] || null),
  setItem: jest.fn().mockImplementation(async (key, value) => {
    mockStore[key] = String(value);
    return null;
  }),
  removeItem: jest.fn().mockImplementation(async (key) => {
    delete mockStore[key];
    return null;
  }),
  clear: jest.fn().mockImplementation(async () => {
    mockStore = {};
    return null;
  }),
}));

describe("Habit Daily-Cycle & Persistence Regression Suite", () => {
  beforeEach(() => {
    mockStore = {};
    jest.clearAllMocks();
  });

  it("handles completing, uncompleting, and re-completing a daily habit today", async () => {
    const today = getTodayDateKey();
    const habit: Habit = {
      id: "habit-cycle-1",
      workspaceId: "work",
      title: "Daily Meditation",
      recurrence: { frequency: "daily", interval: 1 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completionHistory: [],
    };
    await HabitRepository.saveHabit(habit);

    // Initial state: incomplete today
    expect(isHabitCompletedToday(habit, today)).toBe(false);
    expect(getHabitCurrentStreak(habit, today)).toBe(0);

    // 1. Complete habit today
    const res1 = await EntityCommandService.completeHabit("habit-cycle-1", "work");
    expect(res1).not.toBeNull();
    const completed1 = res1!.updated;
    expect(isHabitCompletedToday(completed1, today)).toBe(true);
    expect(completed1.streak).toBe(1);
    expect(getHabitCurrentStreak(completed1, today)).toBe(1);

    // 2. Uncomplete habit today
    const res2 = await EntityCommandService.uncompleteHabit("habit-cycle-1", "work");
    expect(res2).not.toBeNull();
    const uncompleted = res2!.updated;
    expect(isHabitCompletedToday(uncompleted, today)).toBe(false);
    expect(uncompleted.streak).toBe(0);
    expect(getHabitCurrentStreak(uncompleted, today)).toBe(0);

    // 3. Complete habit again today
    const res3 = await EntityCommandService.completeHabit("habit-cycle-1", "work");
    expect(res3).not.toBeNull();
    const completedAgain = res3!.updated;
    expect(isHabitCompletedToday(completedAgain, today)).toBe(true);
    expect(completedAgain.streak).toBe(1);
    expect(getHabitCurrentStreak(completedAgain, today)).toBe(1);
  });

  it("persists habit state across simulated app restart", async () => {
    const today = getTodayDateKey();
    const habit: Habit = {
      id: "habit-persist-1",
      workspaceId: "work",
      title: "Daily Journal",
      recurrence: { frequency: "daily", interval: 1 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completionHistory: [],
    };
    await HabitRepository.saveHabit(habit);

    await EntityCommandService.completeHabit("habit-persist-1", "work");

    // Simulate app restart by re-reading directly from repository/AsyncStorage
    const habitsMap = await HabitRepository.getHabits("work");
    const reloaded = habitsMap["habit-persist-1"];

    expect(reloaded).toBeDefined();
    expect(isHabitCompletedToday(reloaded, today)).toBe(true);
    expect(reloaded.streak).toBe(1);
    expect(reloaded.completionHistory.length).toBe(1);
    expect(reloaded.completionHistory[0].date).toBe(today);
  });

  it("resets completion state for the next calendar day while maintaining streak", async () => {
    const today = getTodayDateKey();
    const yesterday = getOffsetDateKey(1, today);

    // Habit completed yesterday
    const habit: Habit = {
      id: "habit-nextday-1",
      workspaceId: "work",
      title: "Morning Stretch",
      recurrence: { frequency: "daily", interval: 1 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completionHistory: [{ date: yesterday, completedAt: Date.now() - 86400000 }],
      streak: 1,
      bestStreak: 1,
      lastCompletedDate: yesterday,
    };
    await HabitRepository.saveHabit(habit);

    // Today evaluation: habit is pending today, but streak is preserved from yesterday
    expect(isHabitCompletedToday(habit, today)).toBe(false); // Appears as pending on Today screen
    expect(getHabitCurrentStreak(habit, today)).toBe(1); // Streak active from yesterday

    // Completing it today extends streak to 2
    const res = await EntityCommandService.completeHabit("habit-nextday-1", "work");
    expect(res).not.toBeNull();
    const updated = res!.updated;
    expect(isHabitCompletedToday(updated, today)).toBe(true);
    expect(updated.streak).toBe(2);
    expect(getHabitCurrentStreak(updated, today)).toBe(2);
  });

  it("calculates multi-day streaks correctly for consecutive days and resets on missed days", async () => {
    const today = getTodayDateKey();
    const d1 = getOffsetDateKey(3, today);
    const d2 = getOffsetDateKey(2, today);
    const d3 = getOffsetDateKey(1, today);

    const habit: Habit = {
      id: "habit-streak-1",
      workspaceId: "work",
      title: "Daily Reading",
      recurrence: { frequency: "daily", interval: 1 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completionHistory: [
        { date: d1, completedAt: Date.now() - 3 * 86400000 },
        { date: d2, completedAt: Date.now() - 2 * 86400000 },
        { date: d3, completedAt: Date.now() - 1 * 86400000 },
      ],
      streak: 3,
      bestStreak: 3,
      lastCompletedDate: d3,
    };

    // Before today's completion: 3 consecutive days completed up to yesterday
    expect(getHabitCurrentStreak(habit, today)).toBe(3);
    expect(getHabitBestStreak(habit)).toBe(3);

    // Complete today: streak becomes 4
    await HabitRepository.saveHabit(habit);
    const res = await EntityCommandService.completeHabit("habit-streak-1", "work");
    expect(res!.updated.streak).toBe(4);
    expect(getHabitCurrentStreak(res!.updated, today)).toBe(4);
    expect(getHabitBestStreak(res!.updated)).toBe(4);

    // Test streak reset when a day is missed:
    const missedDayHabit: Habit = {
      ...habit,
      id: "habit-missed-1",
      completionHistory: [
        { date: d1, completedAt: Date.now() - 3 * 86400000 },
        // d2 missed
        // d3 missed
      ],
      streak: 0,
      lastCompletedDate: d1,
    };
    expect(getHabitCurrentStreak(missedDayHabit, today)).toBe(0);
  });

  it("correctly handles weekdays, weekly, and custom interval recurrence rules", () => {
    const { isRecurringOccurrenceForDate } = require("@/services/scheduling/recurrence.service");

    const startMs = new Date(2026, 7, 10).getTime();

    // 1. Weekdays recurrence (Mon-Fri) via weekly daysOfWeek or legacy weekdays frequency
    const weekdayHabit: Habit = {
      id: "habit-weekday",
      workspaceId: "work",
      title: "Work Standup",
      recurrence: { frequency: "weekdays" as any, interval: 1 },
      createdAt: startMs,
      updatedAt: startMs,
      completionHistory: [],
    };
    expect(isRecurringOccurrenceForDate(weekdayHabit, "2026-08-10")).toBe(true); // Monday
    expect(isRecurringOccurrenceForDate(weekdayHabit, "2026-08-14")).toBe(true); // Friday
    expect(isRecurringOccurrenceForDate(weekdayHabit, "2026-08-15")).toBe(false); // Saturday
    expect(isRecurringOccurrenceForDate(weekdayHabit, "2026-08-16")).toBe(false); // Sunday

    // 2. Weekly recurrence (specific days, e.g. Mon=1, Wed=3, Fri=5)
    const weeklyHabit: Habit = {
      id: "habit-weekly",
      workspaceId: "work",
      title: "Gym Workout",
      recurrence: { frequency: "weekly", interval: 1, daysOfWeek: [1, 3, 5] },
      createdAt: startMs,
      updatedAt: startMs,
      completionHistory: [],
    };
    expect(isRecurringOccurrenceForDate(weeklyHabit, "2026-08-10")).toBe(true); // Monday
    expect(isRecurringOccurrenceForDate(weeklyHabit, "2026-08-11")).toBe(false); // Tuesday
    expect(isRecurringOccurrenceForDate(weeklyHabit, "2026-08-12")).toBe(true); // Wednesday
    expect(isRecurringOccurrenceForDate(weeklyHabit, "2026-08-13")).toBe(false); // Thursday

    // 3. Custom interval recurrence (e.g. Every 3 days starting 2026-08-10)
    const customHabit: Habit = {
      id: "habit-custom",
      workspaceId: "work",
      title: "Water Plants",
      recurrence: { frequency: "custom", interval: 3, unit: "days" },
      createdAt: startMs,
      updatedAt: startMs,
      completionHistory: [],
    };
    expect(isRecurringOccurrenceForDate(customHabit, "2026-08-10")).toBe(true); // diff 0
    expect(isRecurringOccurrenceForDate(customHabit, "2026-08-11")).toBe(false); // diff 1
    expect(isRecurringOccurrenceForDate(customHabit, "2026-08-12")).toBe(false); // diff 2
    expect(isRecurringOccurrenceForDate(customHabit, "2026-08-13")).toBe(true); // diff 3
  });
});
