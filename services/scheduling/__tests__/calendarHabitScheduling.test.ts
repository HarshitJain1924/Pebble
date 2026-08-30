import { getStructuredSchedule } from "../scheduling.service";
import { buildHabit } from "@/features/capture/services/entity-factory.service";
import type { ParsedProductivityItem } from "@/features/capture/services/nlp-parser.service";
import type { Habit } from "@/shared/types/domain.types";

describe("Habit Scheduling and Calendar Projection", () => {
  it("persists parsed time to schedule.startTime and projects to Calendar correctly", () => {
    const item: ParsedProductivityItem = {
      title: "run 5km",
      time: "18:00",
      type: "task",
      confidence: 1,
      recurrence: { type: "daily", interval: 1 },
    };

    const habit = buildHabit(item);

    // 1. Verify EntityFactory built it correctly
    expect(habit.schedule?.startTime).toBe("18:00");

    // 2. Verify getStructuredSchedule prioritizes schedule.startTime
    const schedule = getStructuredSchedule(habit);
    expect(schedule.startTime).toEqual({ hour: 18, minute: 0 });
    expect(schedule.sortKey).toBe(18 * 60); // 1080
  });

  it("does NOT fallback to reminder.triggerAt for Habits without schedule.startTime, maintaining Calendar separation", () => {
    const triggerDate = new Date();
    triggerDate.setHours(9, 30, 0, 0);

    const legacyHabit: Partial<Habit> = {
      title: "Drink water",
      reminder: {
        enabled: true,
        triggerAt: triggerDate.getTime(),
      },
      // NO schedule property
    };

    const schedule = getStructuredSchedule(legacyHabit);
    expect(schedule.startTime).toBeUndefined();
    expect(schedule.sortKey).toBe(24 * 60); // Default for items without time
  });
});
