import React from "react";
import { act, create } from "react-test-renderer";

import {
  defaultWeeklyDay,
  effectiveWeeklyDays,
  useChecklistDetailForm,
} from "@/features/details/checklist/hooks/useChecklistDetailForm";
import type { Checklist } from "@/shared/types/domain.types";

const baseChecklist = (overrides: Partial<Checklist> = {}): Checklist =>
  ({
    id: "checklist-1",
    workspaceId: "inbox",
    title: "Weekly routine",
    items: [],
    resourceIds: [],
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1755000000000,
    updatedAt: 1755000000000,
    ...overrides,
  } as Checklist);

const renderForm = () => {
  const ref: { current: ReturnType<typeof useChecklistDetailForm> | null } = {
    current: null,
  };

  const Probe = () => {
    ref.current = useChecklistDetailForm();
    return null;
  };

  let renderer: any;
  act(() => {
    renderer = create(<Probe />);
  });

  return { ref, renderer };
};

describe("checklist detail form — weekly recurrence defaults", () => {
  describe("defaultWeeklyDay", () => {
    it("uses the schedule date's weekday (the recurrence engine's start-day convention)", () => {
      expect(defaultWeeklyDay("2026-08-29")).toBe(6); // Saturday
      expect(defaultWeeklyDay("2026-09-01")).toBe(2); // Tuesday
    });

    it("falls back to today when the checklist is unscheduled", () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-10-23T12:00:00")); // Friday
      try {
        expect(defaultWeeklyDay("inbox")).toBe(5);
        expect(defaultWeeklyDay(undefined)).toBe(5);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("effectiveWeeklyDays", () => {
    it("keeps explicit days, de-duplicated and sorted", () => {
      expect(effectiveWeeklyDays([4, 2, 2], "2026-08-29")).toEqual([2, 4]);
      expect(effectiveWeeklyDays([0], "2026-08-29")).toEqual([0]);
    });

    it("derives the anchor weekday when no valid day is selected", () => {
      expect(effectiveWeeklyDays([], "2026-08-29")).toEqual([6]);
      expect(effectiveWeeklyDays(undefined, "2026-09-01")).toEqual([2]);
      expect(effectiveWeeklyDays([9, -1] as number[], "2026-09-01")).toEqual([2]);
    });
  });

  describe("editor initialization", () => {
    it("surfaces the anchor weekday for a weekly rule stored without days", () => {
      const { ref } = renderForm();

      act(() => {
        ref.current!.reset(
          baseChecklist({
            schedule: { date: "2026-08-29" }, // Saturday
            recurrence: { frequency: "weekly", interval: 2, daysOfWeek: [] },
          }),
        );
      });

      expect(ref.current!.form.recurrenceType).toBe("weekly");
      expect(ref.current!.form.intervalVal).toBe(2);
      expect(ref.current!.form.recurrenceDays).toEqual([6]);
    });

    it("keeps explicit weekdays and interval when editing an existing rule", () => {
      const { ref } = renderForm();

      act(() => {
        ref.current!.reset(
          baseChecklist({
            schedule: { date: "2026-09-01" },
            recurrence: {
              frequency: "weekly",
              interval: 3,
              daysOfWeek: [2, 4],
            },
          }),
        );
      });

      expect(ref.current!.form.recurrenceDays).toEqual([2, 4]);
      expect(ref.current!.form.intervalVal).toBe(3);
    });

    it("seeds a visible anchor day when the user selects weekly", () => {
      const { ref } = renderForm();

      act(() => {
        ref.current!.reset(
          baseChecklist({
            schedule: { date: "2026-08-29" }, // Saturday
            recurrence: { frequency: "daily", interval: 1 },
          }),
        );
      });
      expect(ref.current!.form.recurrenceDays).toEqual([]);

      act(() => {
        ref.current!.selectRecurrenceType("weekly");
      });

      expect(ref.current!.form.recurrenceType).toBe("weekly");
      expect(ref.current!.form.recurrenceDays).toEqual([6]);

      // Toggling the seeded day off and back on still produces a concrete day.
      act(() => {
        ref.current!.toggleDay(6);
      });
      expect(ref.current!.form.recurrenceDays).toEqual([]);
      act(() => {
        ref.current!.toggleDay(2);
      });
      expect(ref.current!.form.recurrenceDays).toEqual([2]);
    });

    it("does not seed days for non-weekly recurrence types", () => {
      const { ref } = renderForm();

      act(() => {
        ref.current!.reset(
          baseChecklist({
            schedule: { date: "2026-08-29" },
            recurrence: { frequency: "monthly", interval: 1, dayOfMonth: 15 },
          }),
        );
      });

      act(() => {
        ref.current!.selectRecurrenceType("monthly");
      });

      expect(ref.current!.form.recurrenceType).toBe("monthly");
      expect(ref.current!.form.recurrenceDays).toEqual([]);
    });
  });
});
