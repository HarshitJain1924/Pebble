import {
  getTaskMetadataParts,
  formatTaskScheduleDate,
  formatTimeRange,
  formatDurationMinutes,
} from "../task-formatting";
import type { Task } from "@/shared/types/domain.types";

describe("Task Metadata Formatter Suite", () => {
  const referenceDate = "2026-10-05"; // Monday, Oct 5, 2026
  const colors = {
    textMuted: "#888888",
    error: "#EF4444",
  };

  const baseTask: Task = {
    id: "task-1",
    workspaceId: "ws-work",
    title: "Test Task",
    status: "todo",
    priority: "none",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: new Date("2026-10-01").getTime(),
    updatedAt: new Date("2026-10-01").getTime(),
  };

  describe("1. Unscheduled Tasks", () => {
    it("returns no temporal metadata for unscheduled tasks (no 'No schedule' or 'No date')", () => {
      const task: Task = {
        ...baseTask,
        title: "Buy groceries",
        schedule: undefined,
      };

      const parts = getTaskMetadataParts(task, { referenceDate, colors });
      expect(parts).toEqual([]);
    });

    it("returns no temporal metadata when schedule date is 'inbox'", () => {
      const task: Task = {
        ...baseTask,
        title: "Buy groceries",
        schedule: { date: "inbox" } as any,
      };

      const parts = getTaskMetadataParts(task, { referenceDate, colors });
      expect(parts).toEqual([]);
    });

    it("shows only workspace context when viewing cross-workspace for an unscheduled task", () => {
      const task: Task = {
        ...baseTask,
        title: "Buy groceries",
      };

      const parts = getTaskMetadataParts(task, {
        referenceDate,
        workspaceName: "Home",
        colors,
      });

      expect(parts.map((p) => p.text)).toEqual(["Home"]);
    });
  });

  describe("2. Today", () => {
    it("formats Today with no time as simply 'Today'", () => {
      const task: Task = {
        ...baseTask,
        title: "Review tasks",
        schedule: { date: "2026-10-05" },
      };

      const parts = getTaskMetadataParts(task, { referenceDate, colors });
      expect(parts.map((p) => p.text)).toEqual(["Today"]);
    });

    it("formats Today with a start time as 'Today · 2:00 PM'", () => {
      const task: Task = {
        ...baseTask,
        title: "Finish portfolio",
        schedule: { date: "2026-10-05", startTime: "14:00" },
      };

      const parts = getTaskMetadataParts(task, { referenceDate, colors });
      expect(parts.map((p) => p.text)).toEqual(["Today", "2:00 PM"]);
    });

    it("formats Today with a time range as 'Today · 2:00–5:00 PM'", () => {
      const task: Task = {
        ...baseTask,
        title: "Workshop",
        schedule: {
          date: "2026-10-05",
          startTime: "14:00",
          endTime: "17:00",
        },
      };

      const parts = getTaskMetadataParts(task, { referenceDate, colors });
      expect(parts.map((p) => p.text)).toEqual(["Today", "2:00–5:00 PM"]);
    });

    it("compacts time range from startTime and durationMinutes without extra duration chunk", () => {
      const task: Task = {
        ...baseTask,
        schedule: {
          date: "2026-10-05",
          startTime: "14:00",
          durationMinutes: 180,
        } as any,
      };

      const parts = getTaskMetadataParts(task, { referenceDate, colors });
      // Should format 2:00–5:00 PM and NOT append "3h"
      expect(parts.map((p) => p.text)).toEqual(["Today", "2:00–5:00 PM"]);
    });
  });

  describe("3. Future Dates", () => {
    it("formats Tomorrow with time as 'Tomorrow · 7:00 AM'", () => {
      const task: Task = {
        ...baseTask,
        title: "Gym",
        schedule: { date: "2026-10-06", startTime: "07:00" },
      };

      const parts = getTaskMetadataParts(task, { referenceDate, colors });
      expect(parts.map((p) => p.text)).toEqual(["Tomorrow", "7:00 AM"]);
    });

    it("formats later this week (2-6 days) with short weekday e.g. 'Thu · 2:00 PM'", () => {
      // 2026-10-08 is Thursday (+3 days from Oct 5)
      const task: Task = {
        ...baseTask,
        schedule: { date: "2026-10-08", startTime: "14:00" },
      };

      const parts = getTaskMetadataParts(task, { referenceDate, colors });
      expect(parts.map((p) => p.text)).toEqual(["Thu", "2:00 PM"]);
    });

    it("formats dates further away (7+ days) with month and day e.g. 'Nov 12 · 2:00 PM'", () => {
      const task: Task = {
        ...baseTask,
        schedule: { date: "2026-11-12", startTime: "14:00" },
      };

      const parts = getTaskMetadataParts(task, { referenceDate, colors });
      expect(parts.map((p) => p.text)).toEqual(["Nov 12", "2:00 PM"]);
    });
  });

  describe("4. Overdue Tasks", () => {
    it("leads with 'Overdue' in error color followed by past date and time", () => {
      const task: Task = {
        ...baseTask,
        title: "Submit application",
        schedule: { date: "2026-09-11", startTime: "11:00" },
      };

      const parts = getTaskMetadataParts(task, {
        referenceDate,
        colors,
      });

      expect(parts.map((p) => p.text)).toEqual(["Overdue", "Sep 11", "11:00 AM"]);
      expect(parts[0].color).toBe(colors.error);
      expect(parts[1].color).toBe(colors.textMuted);
    });

    it("formats yesterday as 'Yesterday' when overdue", () => {
      const task: Task = {
        ...baseTask,
        schedule: { date: "2026-10-04", startTime: "16:00" },
      };

      const parts = getTaskMetadataParts(task, { referenceDate, colors });
      expect(parts.map((p) => p.text)).toEqual(["Overdue", "Yesterday", "4:00 PM"]);
    });

    it("omits the 'Overdue' label when omitOverdueLabel is true (e.g. Earlier section)", () => {
      const task: Task = {
        ...baseTask,
        schedule: { date: "2026-10-04" },
      };

      const parts = getTaskMetadataParts(task, {
        referenceDate,
        omitOverdueLabel: true,
        colors,
      });

      expect(parts.map((p) => p.text)).toEqual(["Yesterday"]);
      expect(parts.find((p) => p.text === "Overdue")).toBeUndefined();
    });

    it("does not mark a completed task as overdue even if its schedule date is past", () => {
      const task: Task = {
        ...baseTask,
        status: "completed",
        completedAt: Date.now(),
        schedule: { date: "2026-09-11", startTime: "11:00" },
      };

      const parts = getTaskMetadataParts(task, {
        referenceDate,
        isCompleted: true,
        colors,
      });

      expect(parts.map((p) => p.text)).toEqual(["Sep 11", "11:00 AM"]);
      expect(parts.find((p) => p.text === "Overdue")).toBeUndefined();
    });
  });

  describe("5. Reminders & Collision Handling", () => {
    it("suppresses reminder when schedule start time and reminder time match", () => {
      // Schedule at 2:00 PM, Reminder at 2:00 PM (14:00)
      const task: Task = {
        ...baseTask,
        schedule: { date: "2026-10-05", startTime: "14:00" },
        reminder: {
          enabled: true,
          triggerAt: new Date(2026, 9, 5, 14, 0).getTime(),
        },
      };

      const parts = getTaskMetadataParts(task, { referenceDate, colors });
      // Only "Today" and "2:00 PM" — NO redundant "2:00 PM"
      expect(parts.map((p) => p.text)).toEqual(["Today", "2:00 PM"]);
    });

    it("shows reminder when schedule and reminder are at different times", () => {
      // Schedule at 8:00 PM (20:00), Reminder at 7:30 PM (19:30)
      const task: Task = {
        ...baseTask,
        title: "Call Mom",
        schedule: { date: "2026-10-05", startTime: "20:00" },
        reminder: {
          enabled: true,
          triggerAt: new Date(2026, 9, 5, 19, 30).getTime(),
        },
      };

      const parts = getTaskMetadataParts(task, { referenceDate, colors });
      expect(parts.map((p) => p.text)).toEqual(["Today", "8:00 PM", "7:30 PM"]);
    });

    it("shows reminder time when task has no schedule start time", () => {
      const task: Task = {
        ...baseTask,
        schedule: { date: "2026-10-05" },
        reminder: {
          enabled: true,
          triggerAt: new Date(2026, 9, 5, 10, 0).getTime(),
        },
      };

      const parts = getTaskMetadataParts(task, { referenceDate, colors });
      expect(parts.map((p) => p.text)).toEqual(["Today", "10:00 AM"]);
    });

    it("suppresses reminders for completed tasks", () => {
      const task: Task = {
        ...baseTask,
        status: "completed",
        schedule: { date: "2026-10-05", startTime: "20:00" },
        reminder: {
          enabled: true,
          triggerAt: new Date(2026, 9, 5, 19, 30).getTime(),
        },
      };

      const parts = getTaskMetadataParts(task, {
        referenceDate,
        isCompleted: true,
        colors,
      });

      expect(parts.map((p) => p.text)).toEqual(["Today", "8:00 PM"]);
    });

    it("suppresses reminder when date and full time range are present to prevent overflow", () => {
      const task: Task = {
        ...baseTask,
        title: "Team meeting",
        schedule: { date: "2026-09-12", startTime: "16:21", endTime: "17:21" },
        reminder: {
          enabled: true,
          triggerAt: new Date(2026, 8, 12, 15, 30).getTime(),
        },
      };

      const parts = getTaskMetadataParts(task, {
        referenceDate,
        colors,
        sectionContext: "earlier",
      });
      expect(parts.map((p) => p.text)).toEqual(["Sep 12", "4:21–5:21 PM"]);
    });
  });

  describe("6. Recurring Tasks", () => {
    it("never presents the base schedule date for recurring tasks", () => {
      const task: Task = {
        ...baseTask,
        title: "Weekly review",
        recurrence: {
          frequency: "weekly",
          daysOfWeek: [1], // Monday
        } as any,
        schedule: { date: "2026-09-11", startTime: "18:00" },
      };

      const parts = getTaskMetadataParts(task, { referenceDate, colors });
      // Must be "Every Monday · 6:00 PM", NOT containing "Sep 11"
      expect(parts.map((p) => p.text)).toEqual(["Every Monday", "6:00 PM"]);
      expect(parts.map((p) => p.text)).not.toContain("Sep 11");
    });

    it("shows reminder on recurring task when distinct from schedule time", () => {
      const task: Task = {
        ...baseTask,
        recurrence: {
          frequency: "weekly",
          daysOfWeek: [1],
        } as any,
        schedule: { startTime: "14:00" },
        reminder: {
          enabled: true,
          triggerAt: new Date(2026, 9, 5, 13, 30).getTime(),
        },
      };

      const parts = getTaskMetadataParts(task, { referenceDate, colors });
      expect(parts.map((p) => p.text)).toEqual(["Every Monday", "2:00 PM", "1:30 PM"]);
    });

    it("suppresses reminder on recurring task when matching schedule time", () => {
      const task: Task = {
        ...baseTask,
        recurrence: {
          frequency: "weekly",
          daysOfWeek: [1],
        } as any,
        schedule: { startTime: "14:00" },
        reminder: {
          enabled: true,
          triggerAt: new Date(2026, 9, 5, 14, 0).getTime(),
        },
      };

      const parts = getTaskMetadataParts(task, { referenceDate, colors });
      expect(parts.map((p) => p.text)).toEqual(["Every Monday", "2:00 PM"]);
    });

    it("shows standalone duration for recurring task when no startTime exists", () => {
      const task: Task = {
        ...baseTask,
        recurrence: {
          frequency: "daily",
        } as any,
        schedule: { durationMinutes: 45 } as any,
      };

      const parts = getTaskMetadataParts(task, { referenceDate, colors });
      expect(parts.map((p) => p.text)).toEqual(["Daily", "45m"]);
    });
  });

  describe("7. Standalone Duration", () => {
    it("formats minutes < 60 as Xm", () => {
      expect(formatDurationMinutes(45)).toBe("45m");
      expect(formatDurationMinutes(15)).toBe("15m");
    });

    it("formats full hours as Xh", () => {
      expect(formatDurationMinutes(60)).toBe("1h");
      expect(formatDurationMinutes(120)).toBe("2h");
    });

    it("formats hours and remainder as Xh Ym", () => {
      expect(formatDurationMinutes(90)).toBe("1h 30m");
      expect(formatDurationMinutes(135)).toBe("2h 15m");
    });

    it("shows standalone duration on a scheduled task without startTime", () => {
      const task: Task = {
        ...baseTask,
        schedule: { date: "2026-10-05", durationMinutes: 45 } as any,
      };

      const parts = getTaskMetadataParts(task, { referenceDate, colors });
      expect(parts.map((p) => p.text)).toEqual(["Today", "45m"]);
    });
  });

  describe("8. Workspace Context", () => {
    it("includes workspace name when workspaceName option is supplied", () => {
      const task: Task = {
        ...baseTask,
        schedule: { date: "2026-10-05", startTime: "14:00" },
      };

      const parts = getTaskMetadataParts(task, {
        referenceDate,
        workspaceName: "Work",
        colors,
      });

      expect(parts.map((p) => p.text)).toEqual(["Work", "Today", "2:00 PM"]);
    });

    it("omits workspace name when workspaceName option is null or omitted", () => {
      const task: Task = {
        ...baseTask,
        schedule: { date: "2026-10-05", startTime: "14:00" },
      };

      const parts = getTaskMetadataParts(task, {
        referenceDate,
        workspaceName: null,
        colors,
      });

      expect(parts.map((p) => p.text)).toEqual(["Today", "2:00 PM"]);
    });
  });

  describe("9. Context-Aware Metadata & 15 UX Validation Scenarios", () => {
    // 1. Today + no time -> no metadata
    it("Scenario 1: Today + no time produces no metadata inside Today section", () => {
      const task: Task = {
        ...baseTask,
        title: "Study Kubernetes",
        schedule: { date: "2026-10-05" },
      };

      const parts = getTaskMetadataParts(task, {
        referenceDate,
        sectionContext: "today",
        colors,
      });

      expect(parts).toEqual([]);
    });

    // 2. Today + time -> 8:00 PM
    it("Scenario 2: Today + time produces only the time inside Today section", () => {
      const task: Task = {
        ...baseTask,
        title: "Study Kubernetes",
        schedule: { date: "2026-10-05", startTime: "20:00" },
      };

      const parts = getTaskMetadataParts(task, {
        referenceDate,
        sectionContext: "today",
        colors,
      });

      expect(parts.map((p) => p.text)).toEqual(["8:00 PM"]);
    });

    // 3. Today + time range -> 8:00–10:00 PM
    it("Scenario 3: Today + time range produces only the time range inside Today section", () => {
      const task: Task = {
        ...baseTask,
        title: "Study Kubernetes",
        schedule: {
          date: "2026-10-05",
          startTime: "20:00",
          endTime: "22:00",
        },
      };

      const parts = getTaskMetadataParts(task, {
        referenceDate,
        sectionContext: "today",
        colors,
      });

      expect(parts.map((p) => p.text)).toEqual(["8:00–10:00 PM"]);
    });

    // 4. Yesterday -> Yesterday · 8:00 PM
    it("Scenario 4: Yesterday with time displays Yesterday and time", () => {
      const task: Task = {
        ...baseTask,
        title: "Study Kubernetes",
        schedule: { date: "2026-10-04", startTime: "20:00" },
      };

      const parts = getTaskMetadataParts(task, {
        referenceDate,
        omitOverdueLabel: true,
        sectionContext: "earlier",
        colors,
      });

      expect(parts.map((p) => p.text)).toEqual(["Yesterday", "8:00 PM"]);
    });

    // 5. Older date -> Oct 1, or Oct 1 · 8:00 PM
    it("Scenario 5: Older date without time displays month/day, and with time displays month/day and time", () => {
      const taskNoTime: Task = {
        ...baseTask,
        title: "Testing",
        schedule: { date: "2026-10-01" },
      };

      const partsNoTime = getTaskMetadataParts(taskNoTime, {
        referenceDate,
        omitOverdueLabel: true,
        sectionContext: "earlier",
        colors,
      });
      expect(partsNoTime.map((p) => p.text)).toEqual(["Oct 1"]);

      const taskWithTime: Task = {
        ...baseTask,
        title: "Testing",
        schedule: { date: "2026-10-01", startTime: "20:00" },
      };

      const partsWithTime = getTaskMetadataParts(taskWithTime, {
        referenceDate,
        omitOverdueLabel: true,
        sectionContext: "earlier",
        colors,
      });
      expect(partsWithTime.map((p) => p.text)).toEqual(["Oct 1", "8:00 PM"]);
    });

    // 6. Overdue task -> Overdue · Oct 1 · 8:00 PM
    it("Scenario 6: Overdue task in Earlier section displays explicit Overdue in error color", () => {
      const task: Task = {
        ...baseTask,
        title: "Testing",
        schedule: { date: "2026-10-01", startTime: "20:00" },
      };

      const parts = getTaskMetadataParts(task, {
        referenceDate,
        omitOverdueLabel: false,
        sectionContext: "earlier",
        colors,
      });

      expect(parts.map((p) => p.text)).toEqual(["Overdue", "Oct 1", "8:00 PM"]);
      expect(parts[0].color).toBe(colors.error);
      expect(parts[1].color).toBe(colors.textMuted);
      expect(parts[2].color).toBe(colors.textMuted);
    });

    // 7. Recurring task -> Every Monday · 8:00 PM (no base schedule date)
    it("Scenario 7: Recurring task shows pattern and time without base series date", () => {
      const task: Task = {
        ...baseTask,
        title: "Weekly Planning",
        recurrence: {
          frequency: "weekly",
          daysOfWeek: [1],
        } as any,
        schedule: { date: "2026-09-11", startTime: "20:00" },
      };

      const parts = getTaskMetadataParts(task, {
        referenceDate,
        sectionContext: "today",
        colors,
      });

      expect(parts.map((p) => p.text)).toEqual(["Every Monday", "8:00 PM"]);
      expect(parts.map((p) => p.text)).not.toContain("Sep 11");
    });

    // 8. Recurring + reminder -> Every Monday · 8:00 PM · 7:30 PM
    it("Scenario 8: Recurring task with meaningful reminder shows both time and reminder", () => {
      const task: Task = {
        ...baseTask,
        title: "Weekly Planning",
        recurrence: {
          frequency: "weekly",
          daysOfWeek: [1],
        } as any,
        schedule: { startTime: "20:00" },
        reminder: {
          enabled: true,
          triggerAt: new Date(2026, 9, 5, 19, 30).getTime(),
        },
      };

      const parts = getTaskMetadataParts(task, {
        referenceDate,
        colors,
      });

      expect(parts.map((p) => p.text)).toEqual(["Every Monday", "2:00 PM", "1:30 PM"].length ? ["Every Monday", "8:00 PM", "7:30 PM"] : []);
    });

    // 9. Schedule + reminder -> 8:00 PM · 7:30 PM
    it("Scenario 9: Scheduled task with non-colliding reminder shows schedule and reminder times", () => {
      const task: Task = {
        ...baseTask,
        title: "Study Kubernetes",
        schedule: { date: "2026-10-05", startTime: "20:00" },
        reminder: {
          enabled: true,
          triggerAt: new Date(2026, 9, 5, 19, 30).getTime(),
        },
      };

      const parts = getTaskMetadataParts(task, {
        referenceDate,
        sectionContext: "today",
        colors,
      });

      expect(parts.map((p) => p.text)).toEqual(["8:00 PM", "7:30 PM"]);
    });

    // 10. Same schedule/reminder time -> 8:00 PM (reminder suppressed)
    it("Scenario 10: Suppresses reminder when reminder time matches schedule start time", () => {
      const task: Task = {
        ...baseTask,
        title: "Study Kubernetes",
        schedule: { date: "2026-10-05", startTime: "20:00" },
        reminder: {
          enabled: true,
          triggerAt: new Date(2026, 9, 5, 20, 0).getTime(),
        },
      };

      const parts = getTaskMetadataParts(task, {
        referenceDate,
        sectionContext: "today",
        colors,
      });

      expect(parts.map((p) => p.text)).toEqual(["8:00 PM"]);
    });

    // 11. Unscheduled task -> []
    it("Scenario 11: Unscheduled task produces no metadata (no 'No schedule' or 'No date')", () => {
      const task: Task = {
        ...baseTask,
        title: "Read book",
        schedule: undefined,
      };

      const parts = getTaskMetadataParts(task, {
        referenceDate,
        colors,
      });

      expect(parts).toEqual([]);
    });

    // 12. Completed task -> no overdue, no reminder
    it("Scenario 12: Completed task suppresses overdue and reminders", () => {
      const task: Task = {
        ...baseTask,
        status: "completed",
        completedAt: Date.now(),
        schedule: { date: "2026-10-01", startTime: "20:00" },
        reminder: {
          enabled: true,
          triggerAt: new Date(2026, 9, 1, 19, 30).getTime(),
        },
      };

      const parts = getTaskMetadataParts(task, {
        referenceDate,
        isCompleted: true,
        colors,
      });

      expect(parts.map((p) => p.text)).toEqual(["Oct 1", "8:00 PM"]);
      expect(parts.find((p) => p.key === "overdue")).toBeUndefined();
      expect(parts.find((p) => p.key === "reminder")).toBeUndefined();
    });

    // 13. Task inside workspace -> no workspace name
    it("Scenario 13: Task inside workspace omits workspace name", () => {
      const task: Task = {
        ...baseTask,
        workspaceId: "ws-work",
        schedule: { date: "2026-10-05", startTime: "20:00" },
      };

      const parts = getTaskMetadataParts(task, {
        referenceDate,
        sectionContext: "today",
        workspaceName: null,
        colors,
      });

      expect(parts.map((p) => p.text)).toEqual(["8:00 PM"]);
      expect(parts.find((p) => p.key === "category")).toBeUndefined();
    });

    // 14. Cross-workspace task -> includes workspace name
    it("Scenario 14: Cross-workspace task includes workspace name", () => {
      const task: Task = {
        ...baseTask,
        workspaceId: "ws-work",
        schedule: { date: "2026-10-05", startTime: "20:00" },
      };

      const parts = getTaskMetadataParts(task, {
        referenceDate,
        sectionContext: "today",
        workspaceName: "Work Projects",
        colors,
      });

      expect(parts.map((p) => p.text)).toEqual(["Work Projects", "8:00 PM"]);
      expect(parts[0].key).toBe("category");
    });

    // 15. Different selected dates -> suppresses matching date in primary section
    it("Scenario 15: Different selected date suppresses matching date in primary section and tomorrow section", () => {
      const customSelectedDate = "2026-10-15";
      const taskOnSelectedDate: Task = {
        ...baseTask,
        schedule: { date: "2026-10-15", startTime: "20:00" },
      };

      const partsSelected = getTaskMetadataParts(taskOnSelectedDate, {
        referenceDate: customSelectedDate,
        sectionContext: "today", // Primary section for the selected date
        colors,
      });

      expect(partsSelected.map((p) => p.text)).toEqual(["8:00 PM"]);

      // In Tomorrow section: task scheduled for tomorrow suppresses "Tomorrow"
      const tomorrowDate = "2026-10-06";
      const taskTomorrow: Task = {
        ...baseTask,
        schedule: { date: tomorrowDate, startTime: "09:00" },
      };

      const partsTomorrow = getTaskMetadataParts(taskTomorrow, {
        referenceDate,
        sectionContext: "tomorrow",
        colors,
      });

      expect(partsTomorrow.map((p) => p.text)).toEqual(["9:00 AM"]);
    });
  });

  describe("10. Task Metadata Visual Icons & Range Normalization", () => {
    describe("Time Range Normalization", () => {
      it("normalizes identical start and end times to a single time", () => {
        expect(formatTimeRange("14:00", "14:00")).toBe("2:00 PM");
        expect(formatTimeRange("09:30", "09:30")).toBe("9:30 AM");
      });

      it("formats distinct start and end times as compact range", () => {
        expect(formatTimeRange("14:00", "17:00")).toBe("2:00–5:00 PM");
        expect(formatTimeRange("09:00", "11:30")).toBe("9:00–11:30 AM");
        expect(formatTimeRange("11:00", "13:00")).toBe("11:00 AM–1:00 PM");
      });
    });

    describe("Semantic Category Icons", () => {
      it("assigns 'clock' icon to time and time-range metadata", () => {
        const task: Task = {
          ...baseTask,
          schedule: { date: "2026-10-05", startTime: "14:00", endTime: "15:00" },
        };
        const parts = getTaskMetadataParts(task, {
          referenceDate,
          sectionContext: "today",
          colors,
        });

        expect(parts).toHaveLength(1);
        expect(parts[0]).toMatchObject({
          key: "time",
          text: "2:00–3:00 PM",
          icon: "clock",
        });
      });

      it("assigns 'calendar' icon to date metadata", () => {
        const task: Task = {
          ...baseTask,
          schedule: { date: "2026-09-27" },
        };
        const parts = getTaskMetadataParts(task, {
          referenceDate,
          omitOverdueLabel: true,
          sectionContext: "earlier",
          colors,
        });

        expect(parts[0]).toMatchObject({
          key: "date",
          text: "Sep 27",
          icon: "calendar",
        });
      });

      it("assigns 'repeat' icon to recurrence metadata", () => {
        const task: Task = {
          ...baseTask,
          recurrence: { frequency: "weekly", daysOfWeek: [1] } as any,
          schedule: { startTime: "20:00" },
        };
        const parts = getTaskMetadataParts(task, {
          referenceDate,
          sectionContext: "today",
          colors,
        });

        expect(parts[0]).toMatchObject({
          key: "recurrence",
          text: "Every Monday",
          icon: "repeat",
        });
      });

      it("assigns 'bell' icon to reminder metadata", () => {
        const task: Task = {
          ...baseTask,
          schedule: { date: "2026-10-05", startTime: "20:00" },
          reminder: {
            enabled: true,
            triggerAt: new Date(2026, 9, 5, 19, 30).getTime(),
          },
        };
        const parts = getTaskMetadataParts(task, {
          referenceDate,
          sectionContext: "today",
          colors,
        });

        expect(parts).toHaveLength(2);
        expect(parts[0]).toMatchObject({
          key: "time",
          text: "8:00 PM",
          icon: "clock",
        });
        expect(parts[1]).toMatchObject({
          key: "reminder",
          text: "7:30 PM",
          icon: "bell",
        });
      });

      it("does not assign icons to 'overdue' or workspace 'category'", () => {
        const task: Task = {
          ...baseTask,
          schedule: { date: "2026-10-01", startTime: "20:00" },
        };
        const parts = getTaskMetadataParts(task, {
          referenceDate,
          workspaceName: "Work Projects",
          omitOverdueLabel: false,
          sectionContext: "earlier",
          colors,
        });

        const overduePart = parts.find((p) => p.key === "overdue");
        const categoryPart = parts.find((p) => p.key === "category");
        expect(overduePart?.icon).toBeUndefined();
        expect(categoryPart?.icon).toBeUndefined();
      });

      it("renders Earlier task with calendar date and clock time range without redundant icon", () => {
        const task: Task = {
          ...baseTask,
          title: "Team meeting",
          schedule: { date: "2026-09-12", startTime: "16:21", endTime: "17:21" },
        };
        const parts = getTaskMetadataParts(task, {
          referenceDate,
          omitOverdueLabel: true,
          sectionContext: "earlier",
          colors,
        });

        expect(parts).toHaveLength(2);
        expect(parts[0]).toMatchObject({
          key: "date",
          text: "Sep 12",
          icon: "calendar",
        });
        expect(parts[1]).toMatchObject({
          key: "time",
          text: "4:21–5:21 PM",
        });
        expect(parts[1].icon).toBeUndefined();
      });

      it("automatically omits Overdue label when sectionContext is earlier by default", () => {
        const task: Task = {
          ...baseTask,
          title: "Past task",
          schedule: { date: "2026-09-20", startTime: "10:00" },
        };
        // Omit omitOverdueLabel prop completely to verify sectionContext: "earlier" default
        const parts = getTaskMetadataParts(task, {
          referenceDate,
          sectionContext: "earlier",
          colors,
        });

        expect(parts.find((p) => p.key === "overdue")).toBeUndefined();
        expect(parts[0]).toMatchObject({
          key: "date",
          text: "Sep 20",
          icon: "calendar",
        });
        expect(parts[1]).toMatchObject({
          key: "time",
          text: "10:00 AM",
        });
        expect(parts[1].icon).toBeUndefined();
      });

      it("suppresses reminder when both date and time are present to protect primary schedule", () => {
        const task: Task = {
          ...baseTask,
          title: "Team meeting",
          schedule: { date: "2026-09-12", startTime: "16:21", endTime: "17:21" },
          reminder: {
            enabled: true,
            triggerAt: new Date(2026, 8, 12, 15, 30).getTime(),
          },
        };
        const parts = getTaskMetadataParts(task, {
          referenceDate,
          sectionContext: "earlier",
          colors,
        });

        expect(parts).toHaveLength(2);
        expect(parts[0]).toMatchObject({
          key: "date",
          text: "Sep 12",
          icon: "calendar",
        });
        expect(parts[1]).toMatchObject({
          key: "time",
          text: "4:21–5:21 PM",
        });
        expect(parts.find((p) => p.key === "reminder")).toBeUndefined();
      });
    });
  });
});

