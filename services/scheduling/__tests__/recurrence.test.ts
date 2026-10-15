import {
  getDateKey,
  parseDateKey,
  dayDiff,
  isRecurringOccurrenceForDate,
  getRecurrenceLabel,
} from "@/services/scheduling/recurrence.service";
import type { Task } from "@/shared/types/domain.types";

describe("recurrence service unit tests", () => {
  describe("getDateKey and parseDateKey", () => {
    it("should format date key as YYYY-MM-DD", () => {
      const date = new Date(2026, 5, 9); // June 9, 2026 (0-indexed month)
      expect(getDateKey(date)).toBe("2026-06-09");
    });

    it("should parse date key back to Date object", () => {
      const date = parseDateKey("2026-06-09");
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(5); // June
      expect(date.getDate()).toBe(9);
    });
  });

  describe("dayDiff", () => {
    it("should compute positive or negative day difference between two keys", () => {
      expect(dayDiff("2026-06-09", "2026-06-12")).toBe(3);
      expect(dayDiff("2026-06-09", "2026-06-09")).toBe(0);
      expect(dayDiff("2026-06-09", "2026-06-05")).toBe(-4);
    });
  });

  describe("isRecurringOccurrenceForDate", () => {
    const mockItemNonRecurring = {
      id: "task-1",
      title: "One-off task",
      schedule: { date: "2026-06-09" },
    };

    const mockItemDaily = {
      id: "task-2",
      title: "Daily task",
      schedule: { date: "2026-06-09" },
      recurrence: { type: "daily" as const },
    };

    const mockItemWeekdays = {
      id: "task-3",
      title: "Weekday task",
      schedule: { date: "2026-06-08" }, // Monday
      recurrence: { type: "weekdays" as const },
    };

    const mockItemWeekly = {
      id: "task-4",
      title: "Weekly task",
      schedule: { date: "2026-06-08" }, // Monday
      recurrence: {
        type: "weekly" as const,
        days: [1, 4], // Monday, Thursday
      },
    };

    const mockItemInterval = {
      id: "task-5",
      title: "Interval task",
      schedule: { date: "2026-06-08" }, // Monday
      recurrence: {
        type: "interval" as const,
        interval: 3,
        unit: "days" as const,
      },
    };

    it("should ignore archived items", () => {
      const archived = { ...mockItemDaily, archivedAt: Date.now() };
      expect(isRecurringOccurrenceForDate(archived, "2026-06-10")).toBe(false);
    });

    it("should honor recurrence exceptions list", () => {
      const excepted = { ...mockItemDaily, recurrenceExceptions: ["2026-06-10"] };
      expect(isRecurringOccurrenceForDate(excepted, "2026-06-09")).toBe(true);
      expect(isRecurringOccurrenceForDate(excepted, "2026-06-10")).toBe(false);
    });

    it("should handle non-recurring schedules correctly", () => {
      expect(isRecurringOccurrenceForDate(mockItemNonRecurring, "2026-06-09")).toBe(true);
      expect(isRecurringOccurrenceForDate(mockItemNonRecurring, "2026-06-10")).toBe(false);
    });

    it("should prevent occurrences before the start date", () => {
      expect(isRecurringOccurrenceForDate(mockItemDaily, "2026-06-08")).toBe(false);
    });

    it("should correctly handle daily recurrence", () => {
      expect(isRecurringOccurrenceForDate(mockItemDaily, "2026-06-09")).toBe(true);
      expect(isRecurringOccurrenceForDate(mockItemDaily, "2026-06-10")).toBe(true);
      expect(isRecurringOccurrenceForDate(mockItemDaily, "2026-06-20")).toBe(true);
    });

    it("should correctly handle weekdays recurrence", () => {
      // 2026-06-08 is Monday (weekdays: true)
      // 2026-06-13 is Saturday (weekdays: false)
      expect(isRecurringOccurrenceForDate(mockItemWeekdays, "2026-06-08")).toBe(true); // Mon
      expect(isRecurringOccurrenceForDate(mockItemWeekdays, "2026-06-09")).toBe(true); // Tue
      expect(isRecurringOccurrenceForDate(mockItemWeekdays, "2026-06-12")).toBe(true); // Fri
      expect(isRecurringOccurrenceForDate(mockItemWeekdays, "2026-06-13")).toBe(false); // Sat
      expect(isRecurringOccurrenceForDate(mockItemWeekdays, "2026-06-14")).toBe(false); // Sun
    });

    it("should correctly handle weekly recurrence with days", () => {
      expect(isRecurringOccurrenceForDate(mockItemWeekly, "2026-06-08")).toBe(true); // Mon
      expect(isRecurringOccurrenceForDate(mockItemWeekly, "2026-06-09")).toBe(false); // Tue
      expect(isRecurringOccurrenceForDate(mockItemWeekly, "2026-06-11")).toBe(true); // Thu
    });

    it("should correctly handle interval recurrence in days", () => {
      // starts 2026-06-08, interval 3 days
      expect(isRecurringOccurrenceForDate(mockItemInterval, "2026-06-08")).toBe(true); // diff 0
      expect(isRecurringOccurrenceForDate(mockItemInterval, "2026-06-09")).toBe(false); // diff 1
      expect(isRecurringOccurrenceForDate(mockItemInterval, "2026-06-11")).toBe(true); // diff 3
      expect(isRecurringOccurrenceForDate(mockItemInterval, "2026-06-14")).toBe(true); // diff 6
    });

    // Fix #4: Recurrence End Boundaries
    it("Test A: should enforce endDate boundary (Aug 30 exists, Aug 31 does not)", () => {
      const itemWithEndDate: Task = {
        id: "task-end-date",
        workspaceId: "ws-1",
        title: "Daily Task With End Date",
        status: "todo",
        priority: "medium",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
        schedule: { date: "2026-08-25" },
        recurrence: {
          frequency: "daily",
          interval: 1,
          endDate: "2026-08-30",
        },
      };

      expect(isRecurringOccurrenceForDate(itemWithEndDate, "2026-08-25")).toBe(true);
      expect(isRecurringOccurrenceForDate(itemWithEndDate, "2026-08-29")).toBe(true);
      expect(isRecurringOccurrenceForDate(itemWithEndDate, "2026-08-30")).toBe(true);
      expect(isRecurringOccurrenceForDate(itemWithEndDate, "2026-08-31")).toBe(false);
      expect(isRecurringOccurrenceForDate(itemWithEndDate, "2026-09-01")).toBe(false);
    });

    it("Test B: should enforce occurrence count limit (occurrences = 3)", () => {
      const itemWithCountLimit: Task = {
        id: "task-count-limit",
        workspaceId: "ws-1",
        title: "Daily Task With 3 Occurrences",
        status: "todo",
        priority: "medium",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
        schedule: { date: "2026-08-25" },
        recurrence: {
          frequency: "daily",
          interval: 1,
          occurrences: 3,
        },
      };

      expect(isRecurringOccurrenceForDate(itemWithCountLimit, "2026-08-25")).toBe(true); // Occurrence 1
      expect(isRecurringOccurrenceForDate(itemWithCountLimit, "2026-08-26")).toBe(true); // Occurrence 2
      expect(isRecurringOccurrenceForDate(itemWithCountLimit, "2026-08-27")).toBe(true); // Occurrence 3
      expect(isRecurringOccurrenceForDate(itemWithCountLimit, "2026-08-28")).toBe(false); // Occurrence 4 (exceeds 3)
      expect(isRecurringOccurrenceForDate(itemWithCountLimit, "2026-08-29")).toBe(false);
    });

    it("Test C: should prevent occurrences before start date", () => {
      const itemWithStartDate: Task = {
        id: "task-start-bound",
        workspaceId: "ws-1",
        title: "Daily Task Starting Aug 25",
        status: "todo",
        priority: "medium",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
        schedule: { date: "2026-08-25" },
        recurrence: {
          frequency: "daily",
          interval: 1,
        },
      };

      expect(isRecurringOccurrenceForDate(itemWithStartDate, "2026-08-24")).toBe(false);
      expect(isRecurringOccurrenceForDate(itemWithStartDate, "2026-08-25")).toBe(true);
    });

    // Fix #5: Prevent Inbox/Unscheduled Recurring Tasks From Appearing on Calendar
    it("Fix #5 Test A: inbox + daily recurring Task never produces calendar occurrences", () => {
      const inboxDailyTask: Task = {
        id: "task-inbox-daily",
        workspaceId: "ws-1",
        title: "Unscheduled Daily Task",
        status: "todo",
        priority: "medium",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
        schedule: { date: "inbox" },
        recurrence: {
          frequency: "daily",
          interval: 1,
        },
      };

      expect(isRecurringOccurrenceForDate(inboxDailyTask, "2026-08-30")).toBe(false);
      expect(isRecurringOccurrenceForDate(inboxDailyTask, "2026-08-31")).toBe(false);
      expect(isRecurringOccurrenceForDate(inboxDailyTask, "2026-09-01")).toBe(false);
      expect(isRecurringOccurrenceForDate(inboxDailyTask, "2026-12-25")).toBe(false);
    });

    it("Fix #5 Test B: inbox + weekly recurring Task produces no calendar occurrence", () => {
      const inboxWeeklyTask: Task = {
        id: "task-inbox-weekly",
        workspaceId: "ws-1",
        title: "Unscheduled Weekly Task",
        status: "todo",
        priority: "medium",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
        schedule: { date: "inbox" },
        recurrence: {
          frequency: "weekly",
          daysOfWeek: [1, 3, 5],
          interval: 1,
        },
      };

      expect(isRecurringOccurrenceForDate(inboxWeeklyTask, "2026-08-31")).toBe(false); // Monday
      expect(isRecurringOccurrenceForDate(inboxWeeklyTask, "2026-09-02")).toBe(false); // Wednesday
      expect(isRecurringOccurrenceForDate(inboxWeeklyTask, "2026-09-04")).toBe(false); // Friday
    });

    it("Fix #5 Test C: inbox + monthly/custom recurring Task produces no calendar occurrence", () => {
      const inboxMonthlyTask: Task = {
        id: "task-inbox-monthly",
        workspaceId: "ws-1",
        title: "Unscheduled Monthly Task",
        status: "todo",
        priority: "medium",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
        schedule: { date: "inbox" },
        recurrence: {
          frequency: "monthly",
          dayOfMonth: 15,
          interval: 1,
        },
      };

      expect(isRecurringOccurrenceForDate(inboxMonthlyTask, "2026-09-15")).toBe(false);
      expect(isRecurringOccurrenceForDate(inboxMonthlyTask, "2026-10-15")).toBe(false);
    });

    it("Fix #5 Test D: scheduled recurrence still works as expected", () => {
      const scheduledTask: Task = {
        id: "task-scheduled-daily",
        workspaceId: "ws-1",
        title: "Scheduled Daily Task",
        status: "todo",
        priority: "medium",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
        schedule: { date: "2026-08-25" },
        recurrence: {
          frequency: "daily",
          interval: 1,
        },
      };

      expect(isRecurringOccurrenceForDate(scheduledTask, "2026-08-25")).toBe(true);
      expect(isRecurringOccurrenceForDate(scheduledTask, "2026-08-26")).toBe(true);
      expect(isRecurringOccurrenceForDate(scheduledTask, "2026-08-27")).toBe(true);
    });
  });

  describe("getRecurrenceLabel", () => {
    it("should return human readable formats", () => {
      expect(getRecurrenceLabel({ type: "daily" })).toBe("Daily");
      expect(getRecurrenceLabel({ type: "weekdays" })).toBe("Weekdays");
      expect(getRecurrenceLabel({ type: "weekly", days: [1] })).toBe("Every Monday");
      expect(getRecurrenceLabel({ type: "weekly", days: [0, 6] })).toBe("Every Weekend");
      expect(getRecurrenceLabel({ type: "weekly", days: [1, 3] })).toBe("Weekly (Mon, Wed)");
      expect(getRecurrenceLabel({ type: "monthly", dayOfMonth: 15 })).toBe("Monthly on the 15th");
      expect(getRecurrenceLabel({ type: "monthly", dayOfMonth: 1 })).toBe("Monthly on the 1st");
      expect(getRecurrenceLabel({ type: "monthly", dayOfMonth: 2 })).toBe("Monthly on the 2nd");
      expect(getRecurrenceLabel({ type: "monthly", dayOfMonth: 3 })).toBe("Monthly on the 3rd");
      expect(getRecurrenceLabel({ type: "interval", unit: "hours", interval: 1 })).toBe("Every Hour");
      expect(getRecurrenceLabel({ type: "interval", unit: "days", interval: 5 })).toBe("Every 5 Days");
      expect(getRecurrenceLabel({ frequency: "custom", unit: "hours", interval: 1 })).toBe("Every Hour");
      expect(getRecurrenceLabel({ frequency: "custom", unit: "hours", interval: 2 })).toBe("Every 2 Hours");
    });
  });
});
