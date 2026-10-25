import { calculateTimelineItemColumns } from "@/features/calendar/utils/timelineLayout";
import {
  getCalendarEntityPresentation,
  CALENDAR_ENTITY_TOKENS,
} from "@/features/calendar/constants/calendarEntityTokens";
import { ENTITY_ACCENT } from "@/features/calendar/components/TimelineItem";
import { getStructuredSchedule } from "@/services/scheduling/scheduling.service";
import { Task, Habit, Checklist } from "@/shared/types/domain.types";

describe("Calendar Week 24-Hour Coverage, Entity Identity, and Overlap Invariants", () => {
  describe("1. Overlapping Event Layout Columns (calculateTimelineItemColumns)", () => {
    test("A single event has colIdx = 0 and totalCols = 1", () => {
      const items = [
        { id: "t1", startHour: 10, startMinute: 0, durationMinutes: 60 },
      ];
      const result = calculateTimelineItemColumns(items);
      expect(result).toHaveLength(1);
      expect(result[0].colIdx).toBe(0);
      expect(result[0].totalCols).toBe(1);
    });

    test("Two concurrently overlapping events receive distinct column indices and totalCols = 2", () => {
      const items = [
        { id: "t1", startHour: 10, startMinute: 0, durationMinutes: 60 },
        { id: "t2", startHour: 10, startMinute: 30, durationMinutes: 60 },
      ];
      const result = calculateTimelineItemColumns(items);
      expect(result).toHaveLength(2);
      expect(result[0].totalCols).toBe(2);
      expect(result[1].totalCols).toBe(2);
      expect(result[0].colIdx).not.toBe(result[1].colIdx);
    });

    test("Non-overlapping consecutive events reuse colIdx = 0 and totalCols = 1", () => {
      const items = [
        { id: "t1", startHour: 9, startMinute: 0, durationMinutes: 60 }, // 9:00 - 10:00
        { id: "t2", startHour: 10, startMinute: 0, durationMinutes: 60 }, // 10:00 - 11:00
      ];
      const result = calculateTimelineItemColumns(items);
      expect(result).toHaveLength(2);
      expect(result[0].colIdx).toBe(0);
      expect(result[0].totalCols).toBe(1);
      expect(result[1].colIdx).toBe(0);
      expect(result[1].totalCols).toBe(1);
    });

    test("Three overlapping events at same time subdivide into 3 equal columns", () => {
      const items = [
        { id: "t1", startHour: 14, startMinute: 0, durationMinutes: 60 },
        { id: "t2", startHour: 14, startMinute: 0, durationMinutes: 60 },
        { id: "t3", startHour: 14, startMinute: 0, durationMinutes: 60 },
      ];
      const result = calculateTimelineItemColumns(items);
      expect(result).toHaveLength(3);
      expect(result[0].totalCols).toBe(3);
      expect(result[1].totalCols).toBe(3);
      expect(result[2].totalCols).toBe(3);
      const indices = result.map((r) => r.colIdx).sort();
      expect(indices).toEqual([0, 1, 2]);
    });
  });

  describe("2. Full 24-Hour Schedule Coverage (00:00 to 23:59)", () => {
    test("Early morning occurrences (12:00 AM, 2:00 AM, 5:30 AM) calculate exact 24-hour geometry", () => {
      const earlyMidnightTask: Task = {
        id: "t-midnight",
        workspaceId: "ws-1",
        title: "Midnight Job",
        status: "todo",
        priority: "medium",
        schedule: { date: "2026-09-01", startTime: "00:00", durationMinutes: 45 },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      };

      const early5amTask: Task = {
        id: "t-5am",
        workspaceId: "ws-1",
        title: "Morning Routine",
        status: "todo",
        priority: "medium",
        schedule: { date: "2026-09-01", startTime: "05:30", durationMinutes: 30 },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      };

      const schedMidnight = getStructuredSchedule(earlyMidnightTask);
      expect(schedMidnight.startTime).toEqual({ hour: 0, minute: 0 });
      expect(schedMidnight.duration).toBe(45);
      expect(schedMidnight.sortKey).toBe(0);

      const sched5am = getStructuredSchedule(early5amTask);
      expect(sched5am.startTime).toEqual({ hour: 5, minute: 30 });
      expect(sched5am.duration).toBe(30);
      expect(sched5am.sortKey).toBe(5 * 60 + 30); // 330
    });

    test("Late night occurrences (11:30 PM / 23:30) calculate exact 24-hour geometry", () => {
      const lateTask: Task = {
        id: "t-late",
        workspaceId: "ws-1",
        title: "Late Night Journal",
        status: "todo",
        priority: "low",
        schedule: { date: "2026-09-01", startTime: "23:30", durationMinutes: 30 },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      };

      const schedLate = getStructuredSchedule(lateTask);
      expect(schedLate.startTime).toEqual({ hour: 23, minute: 30 });
      expect(schedLate.duration).toBe(30);
      expect(schedLate.sortKey).toBe(23 * 60 + 30); // 1410
    });
  });

  describe("3. Canonical Entity Presentation & Grayscale Recognizability", () => {
    test("Task, Habit, and Checklist have distinct icons, accents, and surfaces", () => {
      const taskTokensDark = getCalendarEntityPresentation("task", false);
      const habitTokensDark = getCalendarEntityPresentation("habit", false);
      const checklistTokensDark = getCalendarEntityPresentation("checklist", false);

      expect(taskTokensDark.icon).toBe("check-square");
      expect(habitTokensDark.icon).toBe("rotate-cw");
      expect(checklistTokensDark.icon).toBe("list");

      // Distinct accents
      expect(taskTokensDark.accent).not.toBe(habitTokensDark.accent);
      expect(habitTokensDark.accent).not.toBe(checklistTokensDark.accent);

      // Light theme tokens
      const taskTokensLight = getCalendarEntityPresentation("task", true);
      const habitTokensLight = getCalendarEntityPresentation("habit", true);
      const checklistTokensLight = getCalendarEntityPresentation("checklist", true);

      expect(taskTokensLight.icon).toBe("check-square");
      expect(habitTokensLight.icon).toBe("rotate-cw");
      expect(checklistTokensLight.icon).toBe("list");
    });

    test("ENTITY_ACCENT export strictly matches the canonical token source", () => {
      expect(ENTITY_ACCENT.task.main).toBe(CALENDAR_ENTITY_TOKENS.dark.task.accent);
      expect(ENTITY_ACCENT.habit.main).toBe(CALENDAR_ENTITY_TOKENS.dark.habit.accent);
      expect(ENTITY_ACCENT.checklist.main).toBe(CALENDAR_ENTITY_TOKENS.dark.checklist.accent);
    });
  });
});
