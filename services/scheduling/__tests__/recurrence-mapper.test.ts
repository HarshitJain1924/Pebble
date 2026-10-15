import {
  recurrenceRuleToScheduler,
  type SchedulerRecurrence,
} from "@/services/scheduling/recurrence-mapper";
import { type RecurrenceRule } from "@/shared/types/domain.types";

describe("recurrenceRuleToScheduler", () => {
  describe("null / undefined input", () => {
    it("should return undefined when rule is null", () => {
      expect(recurrenceRuleToScheduler(null)).toBeUndefined();
    });

    it("should return undefined when rule is undefined", () => {
      expect(recurrenceRuleToScheduler(undefined)).toBeUndefined();
    });
  });

  describe("daily frequency", () => {
    it("should map daily with default interval (1)", () => {
      const rule: RecurrenceRule = { frequency: "daily", interval: 1 };
      const result = recurrenceRuleToScheduler(rule);

      expect(result).toEqual<SchedulerRecurrence>({
        type: "daily",
      });
      expect(result?.interval).toBeUndefined();
    });

    it("should map daily with custom interval", () => {
      const rule: RecurrenceRule = { frequency: "daily", interval: 3 };
      const result = recurrenceRuleToScheduler(rule);

      expect(result).toEqual<SchedulerRecurrence>({
        type: "daily",
        interval: 3,
      });
    });

    it("should omit days and dayOfMonth when not provided", () => {
      const rule: RecurrenceRule = { frequency: "daily", interval: 1 };
      const result = recurrenceRuleToScheduler(rule);

      expect(result?.days).toBeUndefined();
      expect(result?.dayOfMonth).toBeUndefined();
    });
  });

  describe("weekly frequency", () => {
    it("should map weekly with default interval and no days", () => {
      const rule: RecurrenceRule = { frequency: "weekly", interval: 1 };
      const result = recurrenceRuleToScheduler(rule);

      expect(result).toEqual<SchedulerRecurrence>({
        type: "weekly",
      });
      expect(result?.days).toBeUndefined();
    });

    it("should map weekly with specified days of week", () => {
      const rule: RecurrenceRule = {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [1, 3, 5], // Mon, Wed, Fri
      };
      const result = recurrenceRuleToScheduler(rule);

      expect(result).toEqual<SchedulerRecurrence>({
        type: "weekly",
        interval: undefined,
        days: [1, 3, 5],
      });
    });

    it("should map weekly with custom interval and days", () => {
      const rule: RecurrenceRule = {
        frequency: "weekly",
        interval: 2,
        daysOfWeek: [0, 6], // Sun, Sat
      };
      const result = recurrenceRuleToScheduler(rule);

      expect(result).toEqual<SchedulerRecurrence>({
        type: "weekly",
        interval: 2,
        days: [0, 6],
      });
    });
  });

  describe("monthly frequency", () => {
    it("should map monthly with default dayOfMonth", () => {
      const rule: RecurrenceRule = { frequency: "monthly", interval: 1 };
      const result = recurrenceRuleToScheduler(rule);

      expect(result).toEqual<SchedulerRecurrence>({
        type: "monthly",
      });
      expect(result?.dayOfMonth).toBeUndefined();
    });

    it("should map monthly with specific day of month", () => {
      const rule: RecurrenceRule = {
        frequency: "monthly",
        interval: 1,
        dayOfMonth: 15,
      };
      const result = recurrenceRuleToScheduler(rule);

      expect(result).toEqual<SchedulerRecurrence>({
        type: "monthly",
        dayOfMonth: 15,
      });
    });

    it("should map monthly with interval", () => {
      const rule: RecurrenceRule = {
        frequency: "monthly",
        interval: 3,
        dayOfMonth: 1,
      };
      const result = recurrenceRuleToScheduler(rule);

      expect(result).toEqual<SchedulerRecurrence>({
        type: "monthly",
        interval: 3,
        dayOfMonth: 1,
      });
    });
  });

  describe("custom frequency (maps to interval)", () => {
    it("should map custom with default interval", () => {
      const rule: RecurrenceRule = { frequency: "custom", interval: 1 };
      const result = recurrenceRuleToScheduler(rule);

      expect(result).toEqual<SchedulerRecurrence>({
        type: "interval",
        interval: undefined,
      });
    });

    it("should map custom with custom interval", () => {
      const rule: RecurrenceRule = { frequency: "custom", interval: 4 };
      const result = recurrenceRuleToScheduler(rule);

      expect(result).toEqual<SchedulerRecurrence>({
        type: "interval",
        interval: 4,
      });
    });

    it("should not set unit for custom frequency", () => {
      const rule: RecurrenceRule = { frequency: "custom", interval: 2 };
      const result = recurrenceRuleToScheduler(rule);

      expect(result?.unit).toBeUndefined();
    });
  });

  describe("yearly frequency (maps to interval with unit: days)", () => {
    it("should map yearly with interval 1 (every 1 year = 365 days)", () => {
      const rule: RecurrenceRule = { frequency: "yearly", interval: 1 };
      const result = recurrenceRuleToScheduler(rule);

      expect(result).toEqual<SchedulerRecurrence>({
        type: "interval",
        interval: 365,
        unit: "days",
      });
    });

    it("should map yearly with custom interval (2 years = 730 days)", () => {
      const rule: RecurrenceRule = { frequency: "yearly", interval: 2 };
      const result = recurrenceRuleToScheduler(rule);

      expect(result).toEqual<SchedulerRecurrence>({
        type: "interval",
        interval: 730,
        unit: "days",
      });
    });

    it("should fall back to 365 days when interval is 0 or undefined", () => {
      const rule: RecurrenceRule = { frequency: "yearly", interval: 0 };
      const result = recurrenceRuleToScheduler(rule);

      expect(result).toEqual<SchedulerRecurrence>({
        type: "interval",
        interval: 365,
        unit: "days",
      });
    });
  });

  describe("edge cases", () => {
    it("should return daily for unknown frequency (default case)", () => {
      const rule = { frequency: "unknown" as RecurrenceRule["frequency"], interval: 1 };
      const result = recurrenceRuleToScheduler(rule);

      expect(result).toEqual<SchedulerRecurrence>({
        type: "daily",
      });
    });

    it("should handle daysOfWeek with empty array", () => {
      const rule: RecurrenceRule = {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [],
      };
      const result = recurrenceRuleToScheduler(rule);

      expect(result?.days).toBeUndefined();
    });
  });
});
