import {
  getDateKey,
  parseDateKey,
  dayDiff,
  isRecurringOccurrenceForDate,
  getRecurrenceLabel,
} from "../recurrence";

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
      scheduledDate: "2026-06-09",
    };

    const mockItemDaily = {
      id: "task-2",
      title: "Daily task",
      scheduledDate: "2026-06-09",
      recurrence: { type: "daily" as const },
    };

    const mockItemWeekdays = {
      id: "task-3",
      title: "Weekday task",
      scheduledDate: "2026-06-08", // Monday
      recurrence: { type: "weekdays" as const },
    };

    const mockItemWeekly = {
      id: "task-4",
      title: "Weekly task",
      scheduledDate: "2026-06-08", // Monday
      recurrence: {
        type: "weekly" as const,
        days: [1, 4], // Monday, Thursday
      },
    };

    const mockItemInterval = {
      id: "task-5",
      title: "Interval task",
      scheduledDate: "2026-06-08", // Monday
      recurrence: {
        type: "interval" as const,
        interval: 3,
        unit: "days" as const,
      },
    };

    it("should ignore archived items", () => {
      const archived = { ...mockItemDaily, archived: true };
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
    });
  });
});
