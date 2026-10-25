import {
  getTaskOccurrenceState,
  isTaskOverdue,
  isTaskDueToday,
} from "@/shared/utils/domain-selectors";
import { isRecurringOccurrenceForDate } from "@/services/scheduling/recurrence.service";
import type { Task } from "@/shared/types/domain.types";

// 2026-08-12 is a Wednesday.
const REF = "2026-08-12";

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: "task-1",
  workspaceId: "inbox",
  title: "Test task",
  status: "todo",
  priority: "none",
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

describe("getTaskOccurrenceState — non-recurring tasks", () => {
  it("1. classifies a task scheduled today as due today", () => {
    const task = makeTask({ schedule: { date: REF } });
    const state = getTaskOccurrenceState(task, REF);

    expect(state.occurs).toBe(true);
    expect(state.isToday).toBe(true);
    expect(state.isOverdue).toBe(false);
    expect(state.isUpcoming).toBe(false);
    expect(state.nextOccurrenceDate).toBeNull();
  });

  it("2. classifies a task scheduled yesterday as overdue", () => {
    const task = makeTask({ schedule: { date: "2026-08-11" } });
    const state = getTaskOccurrenceState(task, REF);

    expect(state.occurs).toBe(false);
    expect(state.isToday).toBe(false);
    expect(state.isOverdue).toBe(true);
    expect(state.isUpcoming).toBe(false);
    expect(isTaskOverdue(task, REF)).toBe(true);
  });

  it("3. classifies a task scheduled tomorrow as upcoming", () => {
    const task = makeTask({ schedule: { date: "2026-08-13" } });
    const state = getTaskOccurrenceState(task, REF);

    expect(state.occurs).toBe(false);
    expect(state.isToday).toBe(false);
    expect(state.isOverdue).toBe(false);
    expect(state.isUpcoming).toBe(true);
    expect(state.nextOccurrenceDate).toBe("2026-08-13");
  });

  it("treats inbox (no real schedule) as not occurring on any date", () => {
    const task = makeTask({ schedule: { date: "inbox" } });
    const state = getTaskOccurrenceState(task, REF);

    expect(state.occurs).toBe(false);
    expect(state.isToday).toBe(false);
    expect(state.isOverdue).toBe(false);
    expect(state.isUpcoming).toBe(false);
  });


});

describe("getTaskOccurrenceState — recurring tasks", () => {
  it("4. classifies a daily task as due today on its next occurrence", () => {
    // Base/original date is yesterday — the recurrence must produce today.
    const task = makeTask({
      schedule: { date: "2026-08-11" },
      recurrence: { frequency: "daily", interval: 1 },
    });
    const state = getTaskOccurrenceState(task, REF);

    expect(state.occurs).toBe(true);
    expect(state.isToday).toBe(true);
    expect(state.isOverdue).toBe(false);
    expect(state.isUpcoming).toBe(false);
  });

  it("5. classifies a daily task as due today on a later occurrence", () => {
    const task = makeTask({
      schedule: { date: "2026-08-09" },
      recurrence: { frequency: "daily", interval: 1 },
    });
    const state = getTaskOccurrenceState(task, REF);

    expect(state.occurs).toBe(true);
    expect(state.isToday).toBe(true);
    expect(state.isOverdue).toBe(false);
  });

  it("6. classifies a weekly task as due today on a matching weekday", () => {
    // Started Monday 2026-08-10, recurs every Monday.
    const task = makeTask({
      schedule: { date: "2026-08-10" },
      recurrence: { frequency: "weekly", interval: 1, daysOfWeek: [1] },
    });
    const state = getTaskOccurrenceState(task, "2026-08-17"); // Monday

    expect(state.occurs).toBe(true);
    expect(state.isToday).toBe(true);
    expect(state.isOverdue).toBe(false);
  });

  it("7. classifies a weekly task on a non-matching weekday as upcoming, never overdue", () => {
    const task = makeTask({
      schedule: { date: "2026-08-10" },
      recurrence: { frequency: "weekly", interval: 1, daysOfWeek: [1] },
    });
    const state = getTaskOccurrenceState(task, "2026-08-18"); // Tuesday

    expect(state.occurs).toBe(false);
    expect(state.isToday).toBe(false);
    expect(state.isOverdue).toBe(false);
    expect(state.isUpcoming).toBe(true);
    expect(state.nextOccurrenceDate).toBe("2026-08-24"); // next Monday
  });

  it("8. never flags a recurring task overdue merely because its base date is in the past", () => {
    const task = makeTask({
      schedule: { date: "2026-07-01" },
      recurrence: { frequency: "daily", interval: 1 },
    });
    const state = getTaskOccurrenceState(task, REF);

    expect(state.isOverdue).toBe(false);
    expect(isTaskOverdue(task, REF)).toBe(false);
    expect(state.occurs).toBe(true);
    expect(state.isToday).toBe(true);
  });

  it("honors recurrence exceptions (skipped occurrence)", () => {
    const task = makeTask({
      schedule: { date: "2026-08-11" },
      recurrence: { frequency: "daily", interval: 1 },
      recurrenceExceptions: [REF],
    });
    const state = getTaskOccurrenceState(task, REF);

    expect(state.occurs).toBe(false);
    expect(state.isToday).toBe(false);
  });

  it("finds the next occurrence for interval-based recurrences", () => {
    // Every 3 days from 2026-08-08 → 08-11, 08-14…
    const task = makeTask({
      schedule: { date: "2026-08-08" },
      recurrence: { frequency: "custom", interval: 3, unit: "days" },
    });

    const offDay = getTaskOccurrenceState(task, "2026-08-09");
    expect(offDay.occurs).toBe(false);
    expect(offDay.isOverdue).toBe(false);
    expect(offDay.isUpcoming).toBe(true);
    expect(offDay.nextOccurrenceDate).toBe("2026-08-11");

    const onDay = getTaskOccurrenceState(task, "2026-08-11");
    expect(onDay.occurs).toBe(true);
    expect(onDay.isToday).toBe(true);
  });
});

describe("getTaskOccurrenceState — completion semantics", () => {
  it("9. excludes a completed non-recurring task from active buckets", () => {
    const task = makeTask({
      schedule: { date: REF },
      status: "completed",
      completedAt: Date.now(),
    });
    const state = getTaskOccurrenceState(task, REF);

    expect(state.isCompleted).toBe(true);
    expect(state.occurs).toBe(true); // schedule truth is preserved
    expect(state.isToday).toBe(false);
    expect(state.isOverdue).toBe(false);
    expect(state.isUpcoming).toBe(false);
  });

  it("9b. excludes a completed recurring task from active buckets", () => {
    const task = makeTask({
      schedule: { date: "2026-08-11" },
      recurrence: { frequency: "daily", interval: 1 },
      status: "completed",
      completedAt: Date.now(),
    });
    const state = getTaskOccurrenceState(task, REF);

    expect(state.isToday).toBe(false);
    expect(state.isOverdue).toBe(false);
    expect(state.isUpcoming).toBe(false);
    expect(isTaskDueToday(task, REF)).toBe(false);
  });
});

describe("getTaskOccurrenceState — recurrence behavior and date normalization", () => {
  it("10. preserves the existing recurrence matcher semantics", () => {
    // Same expectations as services/__tests__/recurrence.test.ts — the
    // classification must reuse, not reinvent, the matcher.
    const daily = makeTask({
      schedule: { date: "2026-06-09" },
      recurrence: { frequency: "daily", interval: 1 },
    });
    expect(isRecurringOccurrenceForDate(daily, "2026-06-20")).toBe(true);

    const weekdays = makeTask({
      schedule: { date: "2026-06-08" }, // Monday
      // Legacy shape used by the parser; the matcher accepts `type: weekdays`.
      recurrence: { type: "weekdays" as const } as unknown as Task["recurrence"],
    });
    expect(isRecurringOccurrenceForDate(weekdays, "2026-06-12")).toBe(true); // Fri
    expect(isRecurringOccurrenceForDate(weekdays, "2026-06-13")).toBe(false); // Sat

    const state = getTaskOccurrenceState(weekdays, "2026-06-13");
    expect(state.occurs).toBe(false);
    expect(state.isOverdue).toBe(false);
    expect(state.isUpcoming).toBe(true); // next weekday is Monday
    expect(state.nextOccurrenceDate).toBe("2026-06-15");
  });

  it("11. classifies occurrences across month and year boundaries", () => {
    const dailyAcrossYear = makeTask({
      schedule: { date: "2025-12-31" },
      recurrence: { frequency: "daily", interval: 1 },
    });
    const newYear = getTaskOccurrenceState(dailyAcrossYear, "2026-01-01");
    expect(newYear.occurs).toBe(true);
    expect(newYear.isToday).toBe(true);
    expect(newYear.isOverdue).toBe(false);

    const monthly = makeTask({
      schedule: { date: "2026-01-15" },
      recurrence: { frequency: "monthly", interval: 1, dayOfMonth: 15 },
    });
    const feb = getTaskOccurrenceState(monthly, "2026-02-15");
    expect(feb.occurs).toBe(true);
    expect(feb.isToday).toBe(true);
  });

  it("11b. a weekly task anchored on a past weekday is upcoming, not overdue", () => {
    const task = makeTask({
      schedule: { date: "2026-08-10" }, // Monday
      recurrence: { frequency: "weekly", interval: 1, daysOfWeek: [1] },
    });
    const state = getTaskOccurrenceState(task, "2026-08-13"); // Thursday

    expect(state.isOverdue).toBe(false);
    expect(state.occurs).toBe(false);
    expect(state.isUpcoming).toBe(true);
    expect(state.nextOccurrenceDate).toBe("2026-08-17");
  });

  it("11c. handles a weekly recurrence whose day list excludes the start weekday", () => {
    // Started Monday but configured to recur only on Tuesdays — the start
    // date itself is not an occurrence, so the next occurrence must be found
    // by scanning rather than assuming the start date.
    const task = makeTask({
      schedule: { date: "2026-08-10" }, // Monday
      recurrence: { frequency: "weekly", interval: 1, daysOfWeek: [2] }, // Tuesday
    });
    const state = getTaskOccurrenceState(task, "2026-08-09"); // Sunday

    expect(state.occurs).toBe(false);
    expect(state.isUpcoming).toBe(true);
    expect(state.nextOccurrenceDate).toBe("2026-08-11"); // first Tuesday
  });
});

describe("getTaskOccurrenceState — monthly day-of-month across a skipped February", () => {
  // 2026 is not a leap year: February 2026 has 28 days, so day 29/30/31
  // occurrences are skipped entirely that month. The next occurrence lands
  // in March, up to 59 days after the January occurrence — beyond the old
  // 33-day scan horizon. See getOccurrenceScanBound's monthly case.
  it.each([
    { day: 29, anchor: "2026-01-29", next: "2026-03-29", ref: "2026-02-15" },
    { day: 30, anchor: "2026-01-30", next: "2026-03-30", ref: "2026-02-10" },
    { day: 31, anchor: "2026-01-31", next: "2026-03-31", ref: "2026-02-01" },
  ])("day $day: February is skipped, next occurrence is $next", ({ day, anchor, next, ref }) => {
    const task = makeTask({
      schedule: { date: anchor },
      recurrence: { frequency: "monthly", interval: 1, dayOfMonth: day },
    });

    // Matcher agrees: no occurrence anywhere in February, next one in March.
    expect(isRecurringOccurrenceForDate(task, "2026-02-28")).toBe(false);
    expect(isRecurringOccurrenceForDate(task, next)).toBe(true);

    // The classifier must still surface the task as upcoming during the gap.
    const state = getTaskOccurrenceState(task, ref);
    expect(state.occurs).toBe(false);
    expect(state.isOverdue).toBe(false);
    expect(state.isUpcoming).toBe(true);
    expect(state.nextOccurrenceDate).toBe(next);
  });

  it("handles the worst-case 61-day gap (Aug 31 → Oct 31)", () => {
    // A 31st-of-month occurrence followed by a 30-day month (September):
    // the next 31st is 61 days later, the largest monthly gap possible.
    const task = makeTask({
      schedule: { date: "2026-08-31" },
      recurrence: { frequency: "monthly", interval: 1, dayOfMonth: 31 },
    });

    expect(isRecurringOccurrenceForDate(task, "2026-09-30")).toBe(false);
    expect(isRecurringOccurrenceForDate(task, "2026-10-31")).toBe(true);

    const state = getTaskOccurrenceState(task, "2026-09-01");
    expect(state.occurs).toBe(false);
    expect(state.isOverdue).toBe(false);
    expect(state.isUpcoming).toBe(true);
    expect(state.nextOccurrenceDate).toBe("2026-10-31");
  });
});
