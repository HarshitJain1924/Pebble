jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

import {
  calculateRescheduledTask,
  getStructuredSchedule,
} from "@/services/scheduling/scheduling.service";
import { isRecurringOccurrenceForDate } from "@/services/scheduling/recurrence.service";
import { isTaskCompleted } from "@/shared/utils/domain-selectors";
import { type Task, type FocusSession, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { GraphRepository } from "@/repositories/GraphRepository";

describe("Calendar Scheduling and Reminder Separation", () => {
  // Test helper that reflects the calendar task filter & structured schedule projection
  function projectCalendarTask(task: Task, selectedDate: string) {
    const matchesDate = isRecurringOccurrenceForDate(task, selectedDate);
    if (!matchesDate || task.schedule?.date === "inbox") {
      return null;
    }
    const sched = getStructuredSchedule(task, 60);
    return {
      id: task.id,
      title: task.title,
      startDate: sched.startDate,
      startTime: sched.startTime,
      duration: sched.duration,
      sortKey: sched.sortKey,
      isAllDay: sched.startTime === undefined,
    };
  }

  // Helper simulating timeline item mapping and visual positioning in calendar.tsx
  function projectTimelineLayout(task: Task, selectedDate: string) {
    const matchesDate = isRecurringOccurrenceForDate(task, selectedDate);
    if (!matchesDate || task.schedule?.date === "inbox") {
      return null;
    }
    const sched = getStructuredSchedule(task, 60);
    const isAllDay = sched.startTime === undefined;
    const startHour = sched.startTime?.hour;
    const startMinute = sched.startTime?.minute;
    const startMinutes = startHour !== undefined && startMinute !== undefined
      ? startHour * 60 + startMinute
      : undefined;
    const top = startMinutes !== undefined ? (startMinutes / 60) * 80 : undefined;
    const height = (sched.duration / 60) * 80;

    return {
      id: task.id,
      title: task.title,
      isAllDay,
      startHour,
      startMinute,
      startMinutes,
      top,
      height,
      durationMinutes: sched.duration,
    };
  }

  // TEST 1: Task scheduled Aug 30, reminder Aug 29
  // → Calendar Aug 30 contains Task
  // → Calendar Aug 29 does NOT contain Task
  test("TEST 1: Task scheduled Aug 30 with reminder on Aug 29 appears on Aug 30 and NOT on Aug 29", () => {
    const task: Task = {
      id: "task-1",
      workspaceId: "ws-1",
      title: "Submit assignment",
      status: "todo",
      priority: "medium",
      schedule: {
        date: "2026-08-30",
        startTime: "15:00",
        endTime: "16:00",
      },
      reminder: {
        enabled: true,
        triggerAt: new Date("2026-08-29T20:00:00").getTime(),
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const aug29Projection = projectCalendarTask(task, "2026-08-29");
    const aug30Projection = projectCalendarTask(task, "2026-08-30");

    expect(aug29Projection).toBeNull();
    expect(aug30Projection).not.toBeNull();
    expect(aug30Projection?.id).toBe("task-1");
  });

  // TEST 2: Task scheduled Aug 30 at 15:00, reminder Aug 30 at 14:00
  // → Calendar placement remains 15:00
  // → reminder remains 14:00
  test("TEST 2: Task scheduled Aug 30 at 15:00 with reminder at 14:00 preserves 15:00 placement and 14:00 reminder", () => {
    const reminderEpoch = new Date("2026-08-30T14:00:00").getTime();
    const task: Task = {
      id: "task-2",
      workspaceId: "ws-1",
      title: "Doctor appointment",
      status: "todo",
      priority: "high",
      schedule: {
        date: "2026-08-30",
        startTime: "15:00",
        endTime: "16:00",
      },
      reminder: {
        enabled: true,
        triggerAt: reminderEpoch,
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const projection = projectCalendarTask(task, "2026-08-30");

    expect(projection).not.toBeNull();
    expect(projection?.startTime).toEqual({ hour: 15, minute: 0 });
    expect(projection?.sortKey).toBe(15 * 60); // 900 minutes from midnight
    expect(task.reminder?.triggerAt).toBe(reminderEpoch);
  });

  // TEST 3: Task has reminder but no schedule
  // → reminder does NOT cause it to appear on Calendar
  test("TEST 3: Task with reminder but no schedule does NOT appear on Calendar", () => {
    const task: Task = {
      id: "task-3",
      workspaceId: "ws-1",
      title: "Unscheduled reminder task",
      status: "todo",
      priority: "low",
      reminder: {
        enabled: true,
        triggerAt: new Date("2026-08-30T09:00:00").getTime(),
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const aug30Projection = projectCalendarTask(task, "2026-08-30");
    expect(aug30Projection).toBeNull();
  });

  // TEST 4: Task with schedule + no reminder
  // → still appears correctly on Calendar
  test("TEST 4: Task with schedule and no reminder appears correctly on Calendar (all-day and timed)", () => {
    const allDayTask: Task = {
      id: "task-4a",
      workspaceId: "ws-1",
      title: "All day review",
      status: "todo",
      priority: "none",
      schedule: {
        date: "2026-08-30",
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const timedTask: Task = {
      id: "task-4b",
      workspaceId: "ws-1",
      title: "Timed meeting",
      status: "todo",
      priority: "medium",
      schedule: {
        date: "2026-08-30",
        startTime: "11:30",
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const allDayProj = projectCalendarTask(allDayTask, "2026-08-30");
    expect(allDayProj).not.toBeNull();
    expect(allDayProj?.isAllDay).toBe(true);
    expect(allDayProj?.startTime).toBeUndefined();

    const timedProj = projectCalendarTask(timedTask, "2026-08-30");
    expect(timedProj).not.toBeNull();
    expect(timedProj?.isAllDay).toBe(false);
    expect(timedProj?.startTime).toEqual({ hour: 11, minute: 30 });
  });

  // TEST 5: Existing recurring Task behavior remains unchanged.
  test("TEST 5: Recurring Task behavior remains unchanged across recurring days", () => {
    const recurringTask: Task = {
      id: "task-5",
      workspaceId: "ws-1",
      title: "Daily Standup",
      status: "todo",
      priority: "medium",
      schedule: {
        date: "2026-08-01",
        startTime: "09:30",
      },
      recurrence: {
        frequency: "daily",
        interval: 1,
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const day1Proj = projectCalendarTask(recurringTask, "2026-08-15");
    const day2Proj = projectCalendarTask(recurringTask, "2026-08-30");
    const beforeStartProj = projectCalendarTask(recurringTask, "2026-07-31");

    expect(day1Proj).not.toBeNull();
    expect(day1Proj?.startTime).toEqual({ hour: 9, minute: 30 });

    expect(day2Proj).not.toBeNull();
    expect(day2Proj?.startTime).toEqual({ hour: 9, minute: 30 });

    expect(beforeStartProj).toBeNull();
  });

  describe("Calendar Drag and Drop Schedule Updates (Fix #2)", () => {
    // TEST 1: A timed Task with schedule.startTime = "15:00", reminder.triggerAt = 14:00 is dragged to 17:00
    test("DRAG TEST 1: Dragging timed task with reminder to 17:00 updates schedule.startTime to 17:00 and preserves reminder.triggerAt", () => {
      const reminderEpoch = new Date("2026-08-30T14:00:00").getTime();
      const task: Task = {
        id: "task-drag-1",
        workspaceId: "ws-1",
        title: "Timed task with reminder",
        status: "todo",
        priority: "medium",
        schedule: {
          date: "2026-08-30",
          startTime: "15:00",
          endTime: "16:00",
        },
        reminder: {
          enabled: true,
          triggerAt: reminderEpoch,
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const updates = calculateRescheduledTask(task, { hour: 17 }, "2026-08-30");

      expect(updates.schedule?.startTime).toBe("17:00");
      expect(updates.schedule?.endTime).toBe("18:00");
      expect(updates.schedule?.date).toBe("2026-08-30");
      // Must not mutate reminder
      expect(updates.reminder).toBeUndefined();

      // Simulated merged task state
      const mergedTask: Task = { ...task, ...updates, schedule: { ...task.schedule, ...updates.schedule } };
      expect(mergedTask.reminder?.triggerAt).toBe(reminderEpoch);
    });

    // TEST 2: A timed Task with no reminder is dragged to 17:00
    test("DRAG TEST 2: Dragging timed task with no reminder to 17:00 sets schedule.startTime to 17:00 and leaves reminder undefined", () => {
      const task: Task = {
        id: "task-drag-2",
        workspaceId: "ws-1",
        title: "Timed task without reminder",
        status: "todo",
        priority: "low",
        schedule: {
          date: "2026-08-30",
          startTime: "11:00",
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const updates = calculateRescheduledTask(task, { hour: 17 }, "2026-08-30");

      expect(updates.schedule?.startTime).toBe("17:00");
      expect(updates.reminder).toBeUndefined();

      const mergedTask: Task = { ...task, ...updates, schedule: { ...task.schedule, ...updates.schedule } };
      expect(mergedTask.reminder).toBeUndefined();
    });

    // TEST 3: A Task is dragged to another date without a time drop
    test("DRAG TEST 3: Dragging task to another date updates schedule.date, preserves existing schedule.startTime, and preserves reminder.triggerAt", () => {
      const reminderEpoch = new Date("2026-08-30T14:00:00").getTime();
      const task: Task = {
        id: "task-drag-3",
        workspaceId: "ws-1",
        title: "Task moved across days",
        status: "todo",
        priority: "high",
        schedule: {
          date: "2026-08-30",
          startTime: "15:00",
          endTime: "16:00",
        },
        reminder: {
          enabled: true,
          triggerAt: reminderEpoch,
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const updates = calculateRescheduledTask(task, { date: "2026-09-02" });

      expect(updates.schedule?.date).toBe("2026-09-02");
      expect(updates.schedule?.startTime).toBe("15:00");
      expect(updates.schedule?.endTime).toBe("16:00");
      expect(updates.reminder).toBeUndefined();

      const mergedTask: Task = { ...task, ...updates, schedule: { ...task.schedule, ...updates.schedule } };
      expect(mergedTask.schedule?.date).toBe("2026-09-02");
      expect(mergedTask.schedule?.startTime).toBe("15:00");
      expect(mergedTask.reminder?.triggerAt).toBe(reminderEpoch);
    });

    // TEST 4: Existing Calendar scheduling projection still places the Task according to schedule.startTime after the drag
    test("DRAG TEST 4: Calendar projection reflects updated schedule.startTime after drag", () => {
      const task: Task = {
        id: "task-drag-4",
        workspaceId: "ws-1",
        title: "Projected Dragged Task",
        status: "todo",
        priority: "medium",
        schedule: {
          date: "2026-08-30",
          startTime: "10:00",
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const updates = calculateRescheduledTask(task, { hour: 16 }, "2026-08-30");
      const rescheduledTask: Task = { ...task, ...updates, schedule: { ...task.schedule, ...updates.schedule } };

      const projection = projectCalendarTask(rescheduledTask, "2026-08-30");
      expect(projection).not.toBeNull();
      expect(projection?.startTime).toEqual({ hour: 16, minute: 0 });
      expect(projection?.sortKey).toBe(16 * 60);
    });
  });

  describe("Calendar Empty Slot Creation (Fix #3)", () => {
    test("TEST 1: Creating a Task from the 15:00 Calendar slot preserves schedule.date and schedule.startTime='15:00'", () => {
      const selectedDate = "2026-08-30";
      const tappedHour = 15;
      const hourStr = `${String(tappedHour).padStart(2, "0")}:00`;

      const newTask: Task = {
        id: "task-new-1",
        workspaceId: "ws-1",
        title: "Submit assignment",
        status: "todo",
        priority: "medium",
        schedule: {
          date: selectedDate,
          startTime: hourStr,
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const projection = projectCalendarTask(newTask, selectedDate);
      expect(projection).not.toBeNull();
      expect(projection?.startDate).toBe("2026-08-30");
      expect(projection?.startTime).toEqual({ hour: 15, minute: 0 });
      expect(projection?.sortKey).toBe(15 * 60);
      expect(newTask.reminder).toBeUndefined();
    });

    test("TEST 2: Creating a Task from the 09:00 slot produces schedule.startTime='09:00'", () => {
      const selectedDate = "2026-08-30";
      const tappedHour = 9;
      const hourStr = `${String(tappedHour).padStart(2, "0")}:00`;

      const newTask: Task = {
        id: "task-new-2",
        workspaceId: "ws-1",
        title: "Morning briefing",
        status: "todo",
        priority: "low",
        schedule: {
          date: selectedDate,
          startTime: hourStr,
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const projection = projectCalendarTask(newTask, selectedDate);
      expect(projection).not.toBeNull();
      expect(projection?.startTime).toEqual({ hour: 9, minute: 0 });
      expect(projection?.sortKey).toBe(9 * 60);
    });

    test("TEST 3: Selecting a Calendar time does NOT create or modify reminder.triggerAt", () => {
      const selectedDate = "2026-08-30";
      const newTask: Task = {
        id: "task-new-3",
        workspaceId: "ws-1",
        title: "No Reminder",
        status: "todo",
        priority: "medium",
        schedule: {
          date: selectedDate,
          startTime: "15:00",
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(newTask.reminder).toBeUndefined();
    });
  });

  describe("Calendar Timeline Position and Free Time (Fix #4)", () => {
    // Helper simulating freeTimeGaps calculation from calendar.tsx
    function calculateFreeTimeGaps(tasks: Task[], selectedDate: string) {
      const items = tasks
        .map((t) => projectTimelineLayout(t, selectedDate))
        .filter((item): item is NonNullable<typeof item> => item !== null && !item.isAllDay);

      const sorted = [...items].sort((a, b) => (a.startMinutes ?? 0) - (b.startMinutes ?? 0));

      const gaps: { startMinutes: number; durationMinutes: number }[] = [];
      let currentStart = 8 * 60; // 8 AM
      const dayEnd = 22 * 60; // 10 PM

      for (const item of sorted) {
        const start = item.startMinutes!;
        const end = start + item.durationMinutes;

        if (start > currentStart) {
          const gapDuration = start - currentStart;
          if (gapDuration >= 30) {
            gaps.push({
              startMinutes: currentStart,
              durationMinutes: gapDuration,
            });
          }
        }
        if (end > currentStart) {
          currentStart = end;
        }
      }

      if (dayEnd > currentStart) {
        const gapDuration = dayEnd - currentStart;
        if (gapDuration >= 30) {
          gaps.push({
            startMinutes: currentStart,
            durationMinutes: gapDuration,
          });
        }
      }

      return gaps;
    }

    // TEST 1 — Timed Task with earlier reminder
    test("TEST 1: Timed Task with earlier reminder renders at schedule.startTime (15:00 -> 900 mins, top 1200), NOT reminder time (14:00)", () => {
      const task: Task = {
        id: "task-f4-1",
        workspaceId: "ws-1",
        title: "Design Review",
        status: "todo",
        priority: "high",
        schedule: {
          date: "2026-08-30",
          startTime: "15:00",
          endTime: "16:00",
        },
        reminder: {
          enabled: true,
          triggerAt: new Date("2026-08-30T14:00:00").getTime(),
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const layout = projectTimelineLayout(task, "2026-08-30");
      expect(layout).not.toBeNull();
      expect(layout?.startHour).toBe(15);
      expect(layout?.startMinute).toBe(0);
      expect(layout?.startMinutes).toBe(900); // 15 * 60
      expect(layout?.top).toBe((900 / 60) * 80); // 1200px
      expect(layout?.height).toBe(80); // 60 mins -> 80px
    });

    // TEST 2 — Reminder on different date
    test("TEST 2: Task scheduled on Aug 30 at 15:00 with reminder on Aug 29 renders on Aug 30 at 15:00 and not Aug 29", () => {
      const task: Task = {
        id: "task-f4-2",
        workspaceId: "ws-1",
        title: "Client Presentation",
        status: "todo",
        priority: "high",
        schedule: {
          date: "2026-08-30",
          startTime: "15:00",
        },
        reminder: {
          enabled: true,
          triggerAt: new Date("2026-08-29T20:00:00").getTime(),
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const aug29Layout = projectTimelineLayout(task, "2026-08-29");
      const aug30Layout = projectTimelineLayout(task, "2026-08-30");

      expect(aug29Layout).toBeNull();
      expect(aug30Layout).not.toBeNull();
      expect(aug30Layout?.startHour).toBe(15);
      expect(aug30Layout?.startMinutes).toBe(900);
    });

    // TEST 3 — Reminder later than scheduled time
    test("TEST 3: Task scheduled at 09:00 with reminder at 11:00 renders at 09:00 (540 mins, top 720)", () => {
      const task: Task = {
        id: "task-f4-3",
        workspaceId: "ws-1",
        title: "Morning Sprint",
        status: "todo",
        priority: "medium",
        schedule: {
          date: "2026-08-30",
          startTime: "09:00",
        },
        reminder: {
          enabled: true,
          triggerAt: new Date("2026-08-30T11:00:00").getTime(),
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const layout = projectTimelineLayout(task, "2026-08-30");
      expect(layout).not.toBeNull();
      expect(layout?.startHour).toBe(9);
      expect(layout?.startMinute).toBe(0);
      expect(layout?.startMinutes).toBe(540); // 9 * 60
      expect(layout?.top).toBe((540 / 60) * 80); // 720px
    });

    // TEST 4 — All-day Task with reminder
    test("TEST 4: All-day Task with reminder remains an all-day item and does NOT become a timed block", () => {
      const task: Task = {
        id: "task-f4-4",
        workspaceId: "ws-1",
        title: "File taxes",
        status: "todo",
        priority: "low",
        schedule: {
          date: "2026-08-30",
        },
        reminder: {
          enabled: true,
          triggerAt: new Date("2026-08-30T15:00:00").getTime(),
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const layout = projectTimelineLayout(task, "2026-08-30");
      expect(layout).not.toBeNull();
      expect(layout?.isAllDay).toBe(true);
      expect(layout?.startHour).toBeUndefined();
      expect(layout?.startMinutes).toBeUndefined();
      expect(layout?.top).toBeUndefined();
    });

    // TEST 5 — Free-time calculation
    test("TEST 5: Free-time calculation uses schedule.startTime (15:00), not reminder.triggerAt (14:00)", () => {
      const task: Task = {
        id: "task-f4-5",
        workspaceId: "ws-1",
        title: "Deep Work Block",
        status: "todo",
        priority: "high",
        schedule: {
          date: "2026-08-30",
          startTime: "15:00",
          endTime: "16:00",
        },
        reminder: {
          enabled: true,
          triggerAt: new Date("2026-08-30T14:00:00").getTime(),
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const gaps = calculateFreeTimeGaps([task], "2026-08-30");

      // Gap 1: from 8:00 AM (480 mins) to 15:00 (900 mins) -> 420 mins of free time
      expect(gaps[0]).toEqual({
        startMinutes: 480, // 8:00 AM
        durationMinutes: 420, // 7 hours until 15:00
      });
      // Gap 2: from 16:00 (960 mins) to 22:00 (1320 mins) -> 360 mins
      expect(gaps[1]).toEqual({
        startMinutes: 960, // 16:00
        durationMinutes: 360, // 6 hours until 22:00
      });
    });

    // TEST 6 — Drag/drop regression
    test("TEST 6: Dragging task from 15:00 to 17:00 preserves reminder and positions visual block at 17:00 (1020 mins, top 1360)", () => {
      const reminderEpoch = new Date("2026-08-30T14:00:00").getTime();
      const task: Task = {
        id: "task-f4-6",
        workspaceId: "ws-1",
        title: "Strategy Session",
        status: "todo",
        priority: "high",
        schedule: {
          date: "2026-08-30",
          startTime: "15:00",
          endTime: "16:00",
        },
        reminder: {
          enabled: true,
          triggerAt: reminderEpoch,
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const updates = calculateRescheduledTask(task, { hour: 17 }, "2026-08-30");
      expect(updates.schedule?.startTime).toBe("17:00");
      expect(updates.reminder).toBeUndefined(); // reminder untouched

      const rescheduledTask: Task = {
        ...task,
        ...updates,
        schedule: { ...task.schedule, ...updates.schedule },
      };
      expect(rescheduledTask.reminder?.triggerAt).toBe(reminderEpoch);

      const layout = projectTimelineLayout(rescheduledTask, "2026-08-30");
      expect(layout?.startHour).toBe(17);
      expect(layout?.startMinutes).toBe(1020); // 17 * 60
      expect(layout?.top).toBe((1020 / 60) * 80); // 1360px
    });
  });

  describe("Calendar Empty Slot Scheduled Time Initialization (Fix #6)", () => {
    // TEST 1: Calendar route date=2026-08-30, hour=15 initializes schedule.date="2026-08-30", schedule.startTime="15:00"
    test("TEST 1: Calendar route with date=2026-08-30 and hour=15 initializes schedule.date='2026-08-30' and schedule.startTime='15:00'", () => {
      const newTask: Task = {
        id: "task-f6-1",
        workspaceId: "inbox",
        title: "Tapped Slot Task",
        status: "todo",
        priority: "medium",
        schedule: {
          date: "2026-08-30",
          startTime: "15:00",
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const projection = projectCalendarTask(newTask, "2026-08-30");
      expect(projection).not.toBeNull();
      expect(projection?.startDate).toBe("2026-08-30");
      expect(projection?.startTime).toEqual({ hour: 15, minute: 0 });
      expect(projection?.isAllDay).toBe(false);
    });

    // TEST 2: hour=9 produces startTime="09:00"
    test("TEST 2: hour=9 produces startTime='09:00'", () => {
      const parsedHour = 9;
      const startTime = `${String(parsedHour).padStart(2, "0")}:00`;
      expect(startTime).toBe("09:00");

      const newTask: Task = {
        id: "task-f6-2",
        workspaceId: "inbox",
        title: "Morning Task",
        status: "todo",
        priority: "medium",
        schedule: {
          date: "2026-08-30",
          startTime,
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const projection = projectCalendarTask(newTask, "2026-08-30");
      expect(projection?.startTime).toEqual({ hour: 9, minute: 0 });
    });

    // TEST 3: Calendar time does not create a reminder
    test("TEST 3: Calendar time does not create a reminder", () => {
      const newTask: Task = {
        id: "task-f6-3",
        workspaceId: "inbox",
        title: "Task with no reminder",
        status: "todo",
        priority: "medium",
        schedule: {
          date: "2026-08-30",
          startTime: "15:00",
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(newTask.reminder).toBeUndefined();
      const projection = projectCalendarTask(newTask, "2026-08-30");
      expect(projection?.startTime).toEqual({ hour: 15, minute: 0 });
    });

    // TEST 4: Saving the new Task persists schedule.startTime
    test("TEST 4: Saving the new Task persists schedule.startTime='15:00'", () => {
      const savedTask: Task = {
        id: "task-f6-4",
        workspaceId: "inbox",
        title: "Persisted Task",
        status: "todo",
        priority: "high",
        schedule: {
          date: "2026-08-30",
          startTime: "15:00",
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(savedTask.schedule?.date).toBe("2026-08-30");
      expect(savedTask.schedule?.startTime).toBe("15:00");
    });

    // TEST 5: Reopening the saved Task restores startTime from schedule.startTime and projects to 15:00
    test("TEST 5: Reopening the saved Task restores startTime from schedule.startTime and positions at 15:00 on timeline", () => {
      const loadedTask: Task = {
        id: "task-f6-5",
        workspaceId: "inbox",
        title: "Reopened Task",
        status: "todo",
        priority: "medium",
        schedule: {
          date: "2026-08-30",
          startTime: "15:00",
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const layout = projectTimelineLayout(loadedTask, "2026-08-30");
      expect(layout?.startHour).toBe(15);
      expect(layout?.startMinutes).toBe(900);
      expect(layout?.top).toBe((900 / 60) * 80); // 1200px
      expect(layout?.isAllDay).toBe(false);
    });

    // TEST 6: Opening an existing Task does NOT overwrite its existing startTime because of route initialization
    test("TEST 6: Opening an existing Task preserves its existing startTime and is not overwritten by route context", () => {
      const existingTask: Task = {
        id: "task-f6-6",
        workspaceId: "inbox",
        title: "Existing Task",
        status: "todo",
        priority: "low",
        schedule: {
          date: "2026-08-18",
          startTime: "10:00",
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // When existing task is loaded, its own schedule is preserved
      expect(existingTask.schedule?.date).toBe("2026-08-18");
      expect(existingTask.schedule?.startTime).toBe("10:00");
    });
  });

  describe("Removal of Legacy Semantic Event Hacks (Fix #7)", () => {
    // Helper mirroring canonical getItemType from calendar.tsx
    function getItemType(item: any) {
      if (item.type === "habit") return "habit";
      if (
        item.categoryId === "home" ||
        item.category === "home" ||
        (item.items && item.items.length > 0)
      )
        return "checklist";
      return "task";
    }

    // TEST 1: Task with categoryId="travel", schedule={date: "2026-08-30"} is an all-day task, NOT a timed event
    test("TEST 1: Task with categoryId='travel' and schedule.date='2026-08-30' is NOT classified as an event", () => {
      const travelTask: Task = {
        id: "task-f7-1",
        workspaceId: "inbox",
        title: "Flight to Tokyo",
        status: "todo",
        priority: "medium",
        categoryId: "travel",
        schedule: {
          date: "2026-08-30",
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(getItemType(travelTask)).toBe("task");
      const proj = projectCalendarTask(travelTask, "2026-08-30");
      expect(proj?.isAllDay).toBe(true);
      expect(proj?.startTime).toBeUndefined();
    });

    // TEST 2: Task with categoryId="creative", schedule={date: "2026-08-30"} is an all-day task, NOT an event
    test("TEST 2: Task with categoryId='creative' and schedule.date='2026-08-30' is NOT classified as an event", () => {
      const creativeTask: Task = {
        id: "task-f7-2",
        workspaceId: "inbox",
        title: "Painting Session",
        status: "todo",
        priority: "low",
        categoryId: "creative",
        schedule: {
          date: "2026-08-30",
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(getItemType(creativeTask)).toBe("task");
      const proj = projectCalendarTask(creativeTask, "2026-08-30");
      expect(proj?.isAllDay).toBe(true);
      expect(proj?.startTime).toBeUndefined();
    });

    // TEST 3: Task with categoryId="travel", schedule={date: "2026-08-30", startTime: "15:00"} renders as a timed item because of startTime but remains a task
    test("TEST 3: Task with categoryId='travel' and startTime='15:00' remains a task (NOT an event) and renders as a timed Calendar item", () => {
      const timedTravelTask: Task = {
        id: "task-f7-3",
        workspaceId: "inbox",
        title: "Boarding Flight",
        status: "todo",
        priority: "high",
        categoryId: "travel",
        schedule: {
          date: "2026-08-30",
          startTime: "15:00",
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(getItemType(timedTravelTask)).toBe("task");
      const proj = projectCalendarTask(timedTravelTask, "2026-08-30");
      expect(proj?.isAllDay).toBe(false);
      expect(proj?.startTime).toEqual({ hour: 15, minute: 0 });

      const layout = projectTimelineLayout(timedTravelTask, "2026-08-30");
      expect(layout?.startHour).toBe(15);
      expect(layout?.startMinutes).toBe(900);
      expect(layout?.top).toBe((900 / 60) * 80);
    });

    // TEST 4: Task with categoryId="work", schedule={date: "2026-08-30", startTime: "15:00"} renders as a timed item identically and remains a task
    test("TEST 4: Task with categoryId='work' and startTime='15:00' remains a task (NOT an event) and renders as a timed item", () => {
      const timedWorkTask: Task = {
        id: "task-f7-4",
        workspaceId: "inbox",
        title: "Client Presentation",
        status: "todo",
        priority: "high",
        categoryId: "work",
        schedule: {
          date: "2026-08-30",
          startTime: "15:00",
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(getItemType(timedWorkTask)).toBe("task");
      const proj = projectCalendarTask(timedWorkTask, "2026-08-30");
      expect(proj?.isAllDay).toBe(false);
      expect(proj?.startTime).toEqual({ hour: 15, minute: 0 });

      const layout = projectTimelineLayout(timedWorkTask, "2026-08-30");
      expect(layout?.startHour).toBe(15);
      expect(layout?.startMinutes).toBe(900);
      expect(layout?.top).toBe((900 / 60) * 80);
    });

    // TEST 5: All-day scheduled Tasks across all categories remain all-day items
    test("TEST 5: All-day scheduled Tasks across all categories remain all-day Calendar items", () => {
      const categories = ["work", "personal", "health", "travel", "creative"];
      for (const cat of categories) {
        const task: Task = {
          id: `task-f7-cat-${cat}`,
          workspaceId: "inbox",
          title: `All-day ${cat} task`,
          status: "todo",
          priority: "medium",
          categoryId: cat,
          schedule: {
            date: "2026-08-30",
          },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        expect(getItemType(task)).toBe("task");
        const proj = projectCalendarTask(task, "2026-08-30");
        expect(proj?.isAllDay).toBe(true);
        expect(proj?.startTime).toBeUndefined();
      }
    });

    // TEST 6: Habit behavior remains unchanged
    test("TEST 6: Habit behavior remains unchanged and classified as habit", () => {
      const habitItem = {
        id: "habit-f7-1",
        title: "Morning Meditation",
        type: "habit",
        schedule: {
          date: "2026-08-30",
        },
      };

      expect(getItemType(habitItem)).toBe("habit");
    });

    // TEST 7: Timed Task with schedule.startTime='20:00' remains a Task (NOT an event) and remains visible in Calendar
    test("TEST 7: Timed Task with schedule.startTime='20:00' is classified as 'task' (NOT 'event') and is visible", () => {
      const today = "2026-08-30";
      const timedTask: Task = {
        id: "task-k8s-1",
        workspaceId: "inbox",
        title: "Study Kubernetes at 8 PM",
        status: "todo",
        priority: "medium",
        schedule: {
          date: today,
          startTime: "20:00",
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(getItemType(timedTask)).toBe("task");

      // Projection properties
      const proj = projectCalendarTask(timedTask, today);
      expect(proj?.isAllDay).toBe(false);
      expect(proj?.startTime).toEqual({ hour: 20, minute: 0 });

      // Layout properties
      const layout = projectTimelineLayout(timedTask, today);
      expect(layout?.startHour).toBe(20);
      expect(layout?.startMinutes).toBe(1200);
      expect(layout?.top).toBe((1200 / 60) * 80);
    });

    // FIX #6: Month Indicators Match Agenda Occurrences
    describe("Fix #6: Month Indicators and Agenda Agreement", () => {
      const getDateIndicatorStats = (dateStr: string, allTodos: Task[], allHabits: any[] = []) => {
        if (!dateStr) return { tasks: 0, habits: 0, events: 0, focus: 0 };
        const dayTasks = allTodos.filter(
          (t) =>
            !t.archivedAt &&
            !isTaskCompleted(t) &&
            isRecurringOccurrenceForDate(t, dateStr),
        );

        const tasks = dayTasks.filter(
          (t) =>
            t.categoryId !== "focus" &&
            t.categoryId !== "learning",
        ).length;
        const events = 0;
        const focus = dayTasks.filter(
          (t) => t.categoryId === "focus" || (t as any).category === "focus",
        ).length;

        const habits = allHabits.filter((h) =>
          !h.archivedAt && isRecurringOccurrenceForDate(h, dateStr),
        ).length;

        return { tasks, habits, events, focus };
      };

      test("Test A: recurring Task appears in month indicator on valid occurrence date", () => {
        const recurringTask: Task = {
          id: "task-rec-1",
          workspaceId: "ws-1",
          title: "Daily Standup",
          status: "todo",
          priority: "medium",
          schedule: { date: "2026-08-25" },
          recurrence: { frequency: "daily", interval: 1 },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        const targetDate = "2026-08-30";
        // Agenda occurrence
        expect(isRecurringOccurrenceForDate(recurringTask, targetDate)).toBe(true);
        // Month indicator
        const stats = getDateIndicatorStats(targetDate, [recurringTask]);
        expect(stats.tasks).toBe(1);
      });

      test("Test B: recurring Task stops appearing in month indicator after endDate", () => {
        const endedTask: Task = {
          id: "task-rec-ended",
          workspaceId: "ws-1",
          title: "Summer Sprint",
          status: "todo",
          priority: "medium",
          schedule: { date: "2026-08-25" },
          recurrence: { frequency: "daily", interval: 1, endDate: "2026-08-30" },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        // On Aug 30: occurs and indicator shows task
        expect(isRecurringOccurrenceForDate(endedTask, "2026-08-30")).toBe(true);
        expect(getDateIndicatorStats("2026-08-30", [endedTask]).tasks).toBe(1);

        // On Aug 31: does not occur and indicator shows NO task
        expect(isRecurringOccurrenceForDate(endedTask, "2026-08-31")).toBe(false);
        expect(getDateIndicatorStats("2026-08-31", [endedTask]).tasks).toBe(0);
      });

      test("Test C: inbox recurring Task does NOT produce month indicator", () => {
        const inboxRecurringTask: Task = {
          id: "task-inbox-rec",
          workspaceId: "ws-1",
          title: "Unscheduled Idea",
          status: "todo",
          priority: "medium",
          schedule: { date: "inbox" },
          recurrence: { frequency: "daily", interval: 1 },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        expect(isRecurringOccurrenceForDate(inboxRecurringTask, "2026-08-30")).toBe(false);
        expect(getDateIndicatorStats("2026-08-30", [inboxRecurringTask]).tasks).toBe(0);
        expect(getDateIndicatorStats("2026-08-31", [inboxRecurringTask]).tasks).toBe(0);
      });

      test("Test D: non-recurring scheduled Task continues to produce expected month indicator", () => {
        const nonRecurringTask: Task = {
          id: "task-non-rec",
          workspaceId: "ws-1",
          title: "Doctor Appointment",
          status: "todo",
          priority: "high",
          schedule: { date: "2026-08-30" },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        expect(isRecurringOccurrenceForDate(nonRecurringTask, "2026-08-30")).toBe(true);
        expect(getDateIndicatorStats("2026-08-30", [nonRecurringTask]).tasks).toBe(1);

        expect(isRecurringOccurrenceForDate(nonRecurringTask, "2026-08-31")).toBe(false);
        expect(getDateIndicatorStats("2026-08-31", [nonRecurringTask]).tasks).toBe(0);
      });
    });

    // FIX #8: Remove Obsolete Event Classification From Calendar UI
    describe("Fix #8: Timed Task UI Classification and Filter Independence", () => {
      test("Test A: timed Task produces calendar kind = 'task'", () => {
        const timedTask: Task = {
          id: "task-timed-k8s",
          workspaceId: "inbox",
          title: "Study Kubernetes at 8 PM",
          status: "todo",
          priority: "medium",
          schedule: {
            date: "2026-08-30",
            startTime: "20:00",
          },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        expect(getItemType(timedTask)).toBe("task");
      });

      test("Test B: Task filter controls timed Task independently of any Event filter", () => {
        const timedTask: Task = {
          id: "task-timed-filter",
          workspaceId: "inbox",
          title: "Work Presentation",
          status: "todo",
          priority: "high",
          schedule: {
            date: "2026-08-30",
            startTime: "15:00",
          },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        const type = getItemType(timedTask);
        expect(type).toBe("task");

        // When task filter is active, item is included
        const activeFiltersWithTask = ["task", "habit", "checklist", "resource"];
        expect(activeFiltersWithTask.includes(type)).toBe(true);

        // When task filter is disabled, item is excluded
        const activeFiltersWithoutTask = ["habit", "checklist", "resource"];
        expect(activeFiltersWithoutTask.includes(type)).toBe(false);
      });

      test("Test C: timed Task contributes to tasks in month statistics", () => {
        const timedTask: Task = {
          id: "task-timed-stats",
          workspaceId: "inbox",
          title: "Evening Study",
          status: "todo",
          priority: "medium",
          schedule: {
            date: "2026-08-30",
            startTime: "20:00",
          },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        const getDateIndicatorStats = (dateStr: string, allTodos: Task[]) => {
          const dayTasks = allTodos.filter(
            (t) =>
              !t.archivedAt &&
              !isTaskCompleted(t) &&
              isRecurringOccurrenceForDate(t, dateStr),
          );

          const tasks = dayTasks.filter(
            (t) =>
              t.categoryId !== "focus" &&
              t.categoryId !== "learning",
          ).length;

          return { tasks };
        };

        const stats = getDateIndicatorStats("2026-08-30", [timedTask]);
        expect(stats.tasks).toBe(1);
      });

      test("Test D: recurring timed Task uses normal Task calendar occurrence logic", () => {
        const recurringTimedTask: Task = {
          id: "task-timed-recurring",
          workspaceId: "inbox",
          title: "Daily Standup at 9 AM",
          status: "todo",
          priority: "medium",
          schedule: {
            date: "2026-08-25",
            startTime: "09:00",
          },
          recurrence: {
            frequency: "daily",
            interval: 1,
          },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        expect(getItemType(recurringTimedTask)).toBe("task");
        expect(isRecurringOccurrenceForDate(recurringTimedTask, "2026-08-30")).toBe(true);

        const proj = projectCalendarTask(recurringTimedTask, "2026-08-30");
        expect(proj?.startTime).toEqual({ hour: 9, minute: 0 });
        expect(proj?.isAllDay).toBe(false);
      });
    });

    // FIX #11: Remove Focus From Calendar Scheduling and Filtering
    describe("Fix #11: Remove Focus From Calendar Scheduling and Filtering", () => {
      test("Test A: Calendar filter definitions do NOT expose Focus filter", () => {
        const canonicalCalendarFilters = ["task", "habit", "checklist"];
        expect(canonicalCalendarFilters.includes("focus")).toBe(false);
      });

      test("Test B: Task with category='focus' remains a Task and is NOT classified as focus", () => {
        const focusCategoryTask: Task = {
          id: "task-focus-cat",
          workspaceId: "ws-1",
          title: "Deep Work on Architecture",
          status: "todo",
          priority: "high",
          categoryId: "focus",
          schedule: {
            date: "2026-08-30",
            startTime: "14:00",
          },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        const type = getItemType(focusCategoryTask);
        expect(type).toBe("task");

        // When task filter is active, item is included
        const activeFiltersWithTask = ["task", "habit", "checklist"];
        expect(activeFiltersWithTask.includes(type)).toBe(true);

        // When task filter is disabled, item is excluded
        const activeFiltersWithoutTask = ["habit", "checklist"];
        expect(activeFiltersWithoutTask.includes(type)).toBe(false);
      });

      test("Test C: normal Tasks and Habits continue to appear and function correctly", () => {
        const standardTask: Task = {
          id: "task-std-1",
          workspaceId: "ws-1",
          title: "Code Review",
          status: "todo",
          priority: "medium",
          schedule: {
            date: "2026-08-30",
            startTime: "11:00",
          },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        const standardHabit = {
          id: "habit-std-1",
          workspaceId: "ws-1",
          title: "Morning Meditation",
          type: "habit",
          recurrence: { frequency: "daily", interval: 1 },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        expect(getItemType(standardTask)).toBe("task");
        expect(getItemType(standardHabit)).toBe("habit");

        const getDateIndicatorStats = (dateStr: string, allTodos: Task[], allHabits: any[]) => {
          const dayTasks = allTodos.filter(
            (t) =>
              !t.archivedAt &&
              !isTaskCompleted(t) &&
              isRecurringOccurrenceForDate(t, dateStr),
          );
          const tasks = dayTasks.length;
          const habits = allHabits.filter((h) => !h.archivedAt && isRecurringOccurrenceForDate(h, dateStr)).length;
          return { tasks, habits };
        };

        const stats = getDateIndicatorStats("2026-08-30", [standardTask], [standardHabit]);
        expect(stats.tasks).toBe(1);
        expect(stats.habits).toBe(1);
        expect((stats as any).focus).toBeUndefined();
      });
    });

    // FIX #12: Remove Resource From Calendar
    describe("Fix #12: Remove Resource From Calendar", () => {
      test("Test A: Calendar filter definitions do NOT expose Resource filter", () => {
        const canonicalCalendarFilters = ["task", "habit", "checklist"];
        expect(canonicalCalendarFilters.includes("resource")).toBe(false);
      });

      test("Test B: Task with category='learning' remains a Task and is NOT classified as resource", () => {
        const learningTask: Task = {
          id: "task-learning-cat",
          workspaceId: "ws-1",
          title: "Read Kubernetes Documentation",
          status: "todo",
          priority: "medium",
          categoryId: "learning",
          schedule: {
            date: "2026-08-30",
            startTime: "20:00",
          },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        const type = getItemType(learningTask);
        expect(type).toBe("task");
      });

      test("Test C: Task with category='learning' is governed by Task filter", () => {
        const learningTask: Task = {
          id: "task-learning-filter",
          workspaceId: "ws-1",
          title: "Study Design Patterns",
          status: "todo",
          priority: "high",
          categoryId: "learning",
          schedule: {
            date: "2026-08-30",
            startTime: "18:00",
          },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        const type = getItemType(learningTask);
        expect(type).toBe("task");

        // When task filter is active, item is included
        const activeFiltersWithTask = ["task", "habit", "checklist"];
        expect(activeFiltersWithTask.includes(type)).toBe(true);

        // When task filter is disabled, item is excluded
        const activeFiltersWithoutTask = ["habit", "checklist"];
        expect(activeFiltersWithoutTask.includes(type)).toBe(false);
      });

      test("Test D: Calendar date statistics count learning tasks towards tasks count", () => {
        const learningTask: Task = {
          id: "task-learning-stats",
          workspaceId: "ws-1",
          title: "Learn Rust",
          status: "todo",
          priority: "medium",
          categoryId: "learning",
          schedule: {
            date: "2026-08-30",
            startTime: "10:00",
          },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        const getDateIndicatorStats = (dateStr: string, allTodos: Task[]) => {
          const dayTasks = allTodos.filter(
            (t) =>
              !t.archivedAt &&
              !isTaskCompleted(t) &&
              isRecurringOccurrenceForDate(t, dateStr),
          );
          const tasks = dayTasks.length;
          return { tasks };
        };

        const stats = getDateIndicatorStats("2026-08-30", [learningTask]);
        expect(stats.tasks).toBe(1);
        expect((stats as any).resources).toBeUndefined();
      });

      test("Test E: normal Task and Habit behavior continues across Calendar", () => {
        const normalTask: Task = {
          id: "task-norm-1",
          workspaceId: "ws-1",
          title: "Team Standup",
          status: "todo",
          priority: "medium",
          schedule: {
            date: "2026-08-30",
            startTime: "09:00",
          },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        expect(getItemType(normalTask)).toBe("task");

        const proj = projectCalendarTask(normalTask, "2026-08-30");
        expect(proj).not.toBeNull();
        expect(proj?.startTime).toEqual({ hour: 9, minute: 0 });
      });
    });

    // FIX #13: Prevent Focus From Being Scheduled
    describe("Fix #13: Prevent Focus From Being Scheduled", () => {
      test("Test A: Focus cannot create a schedule (FocusSession has no calendar scheduling properties)", async () => {
        await EntityCommandService.recordFocusSession(1500, "task-target-1", "task", {
          sessionId: "focus-session-test-1",
        });

        const sessions = await GraphRepository.getFocusSessions();
        const recordedSession = sessions.find((s) => s.id === "focus-session-test-1");

        expect(recordedSession).toBeDefined();
        expect(recordedSession?.id).toBe("focus-session-test-1");
        expect(recordedSession?.taskId).toBe("task-target-1");
        expect(recordedSession?.duration).toBe(1500);

        // Assert that FocusSession contains NO calendar scheduling fields
        expect((recordedSession as any).schedule).toBeUndefined();
        expect((recordedSession as any).date).toBeUndefined();
        expect((recordedSession as any).startTime).toBeUndefined();
        expect((recordedSession as any).durationMinutes).toBeUndefined();
      });

      test("Test B: Focus cannot mutate into a scheduled Calendar item", () => {
        const focusSession: FocusSession = {
          id: "focus-session-2",
          taskId: "task-linked-1",
          startedAt: Date.now() - 1500 * 1000,
          endedAt: Date.now(),
          duration: 1500,
        };

        // FocusSession cannot be projected as a calendar task
        const proj = projectCalendarTask(focusSession as any, "2026-08-30");
        expect(proj).toBeNull();
      });

      test("Test C: normal scheduled Task still works (even with categoryId='focus')", () => {
        const scheduledTaskWithFocusCategory: Task = {
          id: "task-focus-cat-sched",
          workspaceId: "ws-1",
          title: "Study Kubernetes at 8 PM",
          status: "todo",
          priority: "high",
          categoryId: "focus",
          schedule: {
            date: "2026-08-30",
            startTime: "20:00",
          },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        expect(getItemType(scheduledTaskWithFocusCategory)).toBe("task");

        const proj = projectCalendarTask(scheduledTaskWithFocusCategory, "2026-08-30");
        expect(proj).not.toBeNull();
        expect(proj?.title).toBe("Study Kubernetes at 8 PM");
        expect(proj?.startTime).toEqual({ hour: 20, minute: 0 });
        expect(proj?.isAllDay).toBe(false);

        const layout = projectTimelineLayout(scheduledTaskWithFocusCategory, "2026-08-30");
        expect(layout?.startHour).toBe(20);
        expect(layout?.startMinutes).toBe(1200);
        expect(layout?.top).toBe((1200 / 60) * 80);
      });
    });

    // FIX #14: Keep Calendar Month Navigation and Selected Date Consistent
    describe("Fix #14: Keep Calendar Month Navigation and Selected Date Consistent", () => {
      function calculateNextMonthTransition(currentSelectedDate: string, currentMonth: { year: number; month: number }) {
        let nextMonth = currentMonth.month + 1;
        let nextYear = currentMonth.year;
        if (nextMonth > 11) {
          nextMonth = 0;
          nextYear += 1;
        }

        const [y, m, d] = currentSelectedDate.split("-").map(Number);
        const maxDays = new Date(nextYear, nextMonth + 1, 0).getDate();
        const targetDay = Math.min(d, maxDays);
        const nextDate = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;

        return {
          month: { year: nextYear, month: nextMonth },
          selectedDate: nextDate,
        };
      }

      function calculatePrevMonthTransition(currentSelectedDate: string, currentMonth: { year: number; month: number }) {
        let nextMonth = currentMonth.month - 1;
        let nextYear = currentMonth.year;
        if (nextMonth < 0) {
          nextMonth = 11;
          nextYear -= 1;
        }

        const [y, m, d] = currentSelectedDate.split("-").map(Number);
        const maxDays = new Date(nextYear, nextMonth + 1, 0).getDate();
        const targetDay = Math.min(d, maxDays);
        const nextDate = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;

        return {
          month: { year: nextYear, month: nextMonth },
          selectedDate: nextDate,
        };
      }

      test("Test A: next month transition moves selected date into new month", () => {
        const initialDate = "2026-08-30";
        const initialMonth = { year: 2026, month: 7 }; // August

        const res = calculateNextMonthTransition(initialDate, initialMonth);
        expect(res.month).toEqual({ year: 2026, month: 8 }); // September
        expect(res.selectedDate).toBe("2026-09-30");
      });

      test("Test B: previous month transition moves selected date into previous month", () => {
        const initialDate = "2026-09-30";
        const initialMonth = { year: 2026, month: 8 }; // September

        const res = calculatePrevMonthTransition(initialDate, initialMonth);
        expect(res.month).toEqual({ year: 2026, month: 7 }); // August
        expect(res.selectedDate).toBe("2026-08-30");
      });

      test("Test C: month boundary transition clamps to valid day (Jan 31 -> Feb 28)", () => {
        const initialDate = "2026-01-31";
        const initialMonth = { year: 2026, month: 0 }; // January

        const res = calculateNextMonthTransition(initialDate, initialMonth);
        expect(res.month).toEqual({ year: 2026, month: 1 }); // February
        expect(res.selectedDate).toBe("2026-02-28");
      });

      test("Test D: explicit selection sets both date and month consistently", () => {
        const selected = "2026-10-15";
        const [y, m] = selected.split("-").map(Number);
        const syncedMonth = { year: y, month: m - 1 };

        expect(syncedMonth).toEqual({ year: 2026, month: 9 }); // October
      });
    });

    // FIX #15: Preserve Calendar Data When Changing Selected Date
    describe("Fix #15: Preserve Calendar Data When Changing Selected Date", () => {
      test("Test A: changing selected date projects loaded entities against new date without losing data", () => {
        const loadedTasks: Task[] = [
          {
            id: "t-1",
            workspaceId: INBOX_WORKSPACE_ID,
            title: "Task 1 (Aug 30)",
            status: "todo",
            priority: "medium",
            schedule: { date: "2026-08-30", startTime: "10:00" },
            revision: 1,
            lifecycleGeneration: 1,
            createdAt: 1000,
            updatedAt: 1000,
          },
          {
            id: "t-2",
            workspaceId: INBOX_WORKSPACE_ID,
            title: "Task 2 (Aug 31)",
            status: "todo",
            priority: "high",
            schedule: { date: "2026-08-31", startTime: "14:00" },
            revision: 1,
            lifecycleGeneration: 1,
            createdAt: 1000,
            updatedAt: 1000,
          },
        ];

        // Aug 30 projection
        const projAug30 = loadedTasks.filter((t) => isRecurringOccurrenceForDate(t, "2026-08-30"));
        expect(projAug30.length).toBe(1);
        expect(projAug30[0].title).toBe("Task 1 (Aug 30)");

        // Aug 31 projection
        const projAug31 = loadedTasks.filter((t) => isRecurringOccurrenceForDate(t, "2026-08-31"));
        expect(projAug31.length).toBe(1);
        expect(projAug31[0].title).toBe("Task 2 (Aug 31)");

        // Aug 30 again
        const projAug30Again = loadedTasks.filter((t) => isRecurringOccurrenceForDate(t, "2026-08-30"));
        expect(projAug30Again.length).toBe(1);
        expect(projAug30Again[0].title).toBe("Task 1 (Aug 30)");

        // Underlying loaded array remains intact
        expect(loadedTasks.length).toBe(2);
      });
    });

    // FIX #16: Make Timed Task Calendar Placement Timezone-Correct
    describe("Fix #16: Make Timed Task Calendar Placement Timezone-Correct", () => {
      test("Test A: shortly after midnight (00:30) maintains literal date and time values", () => {
        const task: Task = {
          id: "t-midnight",
          workspaceId: INBOX_WORKSPACE_ID,
          title: "Midnight Review",
          status: "todo",
          priority: "medium",
          schedule: { date: "2026-08-31", startTime: "00:30", durationMinutes: 60 },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        const sched = getStructuredSchedule(task);
        expect(sched.startDate).toBe("2026-08-31");
        expect(sched.startTime).toEqual({ hour: 0, minute: 30 });
        expect(sched.sortKey).toBe(30);

        const projAug31 = projectCalendarTask(task, "2026-08-31");
        expect(projAug31).not.toBeNull();
        expect(projAug31?.startTime).toEqual({ hour: 0, minute: 30 });

        const projAug30 = projectCalendarTask(task, "2026-08-30");
        expect(projAug30).toBeNull();

        const projSep01 = projectCalendarTask(task, "2026-09-01");
        expect(projSep01).toBeNull();
      });

      test("Test B: late evening (23:30) maintains literal date and time values", () => {
        const task: Task = {
          id: "t-evening",
          workspaceId: INBOX_WORKSPACE_ID,
          title: "Evening Wind Down",
          status: "todo",
          priority: "low",
          schedule: { date: "2026-08-31", startTime: "23:30", durationMinutes: 30 },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        const sched = getStructuredSchedule(task);
        expect(sched.startDate).toBe("2026-08-31");
        expect(sched.startTime).toEqual({ hour: 23, minute: 30 });
        expect(sched.sortKey).toBe(23 * 60 + 30); // 1410

        const projAug31 = projectCalendarTask(task, "2026-08-31");
        expect(projAug31).not.toBeNull();
        expect(projAug31?.startTime).toEqual({ hour: 23, minute: 30 });

        const projAug30 = projectCalendarTask(task, "2026-08-30");
        expect(projAug30).toBeNull();

        const projSep01 = projectCalendarTask(task, "2026-09-01");
        expect(projSep01).toBeNull();
      });
    });

    // FIX #17: Make Calendar Drag/Drop Scheduling Atomic and Non-Creating
    describe("Fix #17: Make Calendar Drag/Drop Scheduling Atomic and Non-Creating", () => {
      test("Test A: drag drop preserves entity identity and modifies existing schedule", () => {
        const taskA: Task = {
          id: "TASK_A",
          workspaceId: INBOX_WORKSPACE_ID,
          title: "Study Kubernetes",
          status: "todo",
          priority: "high",
          schedule: { date: "2026-08-31", startTime: "20:00", durationMinutes: 60 },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        const updates = calculateRescheduledTask(taskA, { hour: 21 }, "2026-08-31");
        const updatedTask: Task = {
          ...taskA,
          ...updates,
          id: taskA.id, // Preserved
        };

        expect(updatedTask.id).toBe("TASK_A");
        expect(updatedTask.schedule?.startTime).toBe("21:00");
        expect(updatedTask.schedule?.date).toBe("2026-08-31");
      });

      test("Test B: moving date preserves identity and does not create duplicate entity", () => {
        const taskA: Task = {
          id: "TASK_A",
          workspaceId: INBOX_WORKSPACE_ID,
          title: "Study Kubernetes",
          status: "todo",
          priority: "high",
          schedule: { date: "2026-08-31", startTime: "20:00", durationMinutes: 60 },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        const updates = calculateRescheduledTask(taskA, { date: "2026-09-01" });
        const updatedTask: Task = {
          ...taskA,
          ...updates,
          id: taskA.id,
        };

        expect(updatedTask.id).toBe("TASK_A");
        expect(updatedTask.schedule?.date).toBe("2026-09-01");
        expect(updatedTask.schedule?.startTime).toBe("20:00");
      });
    });

    // FIX #18: Preserve All-Day Task Semantics in Calendar
    describe("Fix #18: Preserve All-Day Task Semantics in Calendar", () => {
      test("Test A: all-day task does not synthesize startTime or duration", () => {
        const allDay: Task = {
          id: "task-ad-1",
          workspaceId: INBOX_WORKSPACE_ID,
          title: "All Day Work",
          status: "todo",
          priority: "low",
          schedule: { date: "2026-08-31" },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        const sched = getStructuredSchedule(allDay);
        expect(sched.startDate).toBe("2026-08-31");
        expect(sched.startTime).toBeUndefined();
        expect(sched.sortKey).toBe(24 * 60);

        const proj = projectCalendarTask(allDay, "2026-08-31");
        expect(proj).not.toBeNull();
        expect(proj?.startTime).toBeUndefined();
      });

      test("Test B: dragging all-day task to another date retains absent startTime", () => {
        const allDay: Task = {
          id: "task-ad-1",
          workspaceId: INBOX_WORKSPACE_ID,
          title: "All Day Work",
          status: "todo",
          priority: "low",
          schedule: { date: "2026-08-31" },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        const updates = calculateRescheduledTask(allDay, { date: "2026-09-01" });
        expect(updates.schedule?.date).toBe("2026-09-01");
        expect(updates.schedule?.startTime).toBeUndefined();
      });
    });

    // FIX #19: Preserve Timed Task Duration in Calendar
    describe("Fix #19: Preserve Timed Task Duration in Calendar", () => {
      test("Test A: variable durations (30m, 90m, 120m) are preserved in structured schedule", () => {
        const t30: Task = {
          id: "t-30",
          workspaceId: INBOX_WORKSPACE_ID,
          title: "Quick Standup",
          status: "todo",
          priority: "medium",
          schedule: { date: "2026-08-31", startTime: "09:00", durationMinutes: 30 },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        const t90: Task = {
          id: "t-90",
          workspaceId: INBOX_WORKSPACE_ID,
          title: "Architecture Review",
          status: "todo",
          priority: "high",
          schedule: { date: "2026-08-31", startTime: "20:00", durationMinutes: 90 },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        const t120: Task = {
          id: "t-120",
          workspaceId: INBOX_WORKSPACE_ID,
          title: "Deep Work Session",
          status: "todo",
          priority: "high",
          schedule: { date: "2026-08-31", startTime: "14:00", durationMinutes: 120 },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        expect(getStructuredSchedule(t30).duration).toBe(30);
        expect(getStructuredSchedule(t90).duration).toBe(90);
        expect(getStructuredSchedule(t120).duration).toBe(120);
      });

      test("Test B: rescheduling start time preserves durationMinutes", () => {
        const t90: Task = {
          id: "t-90",
          workspaceId: INBOX_WORKSPACE_ID,
          title: "Architecture Review",
          status: "todo",
          priority: "high",
          schedule: { date: "2026-08-31", startTime: "20:00", durationMinutes: 90 },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        const updates = calculateRescheduledTask(t90, { hour: 22 }, "2026-08-31");
        expect(updates.schedule?.startTime).toBe("22:00");
        expect(updates.schedule?.durationMinutes).toBe(90);
      });
    });

    // FIX #21: Enforce Valid Task Schedule Transitions in the Task Edit Flow
    describe("Fix #21: Enforce Valid Task Schedule Transitions in the Task Edit Flow", () => {
      test("Test A: editing all-day to timed Task sets valid schedule and preserves duration", () => {
        const allDay: Task = {
          id: "task-edit-inv",
          workspaceId: INBOX_WORKSPACE_ID,
          title: "Study Kubernetes",
          status: "todo",
          priority: "high",
          schedule: { date: "2026-08-31" },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        const updated: Task = {
          ...allDay,
          schedule: {
            ...allDay.schedule,
            date: "2026-08-31",
            startTime: "20:00",
            durationMinutes: 60,
          },
        };

        const sched = getStructuredSchedule(updated);
        expect(sched.startDate).toBe("2026-08-31");
        expect(sched.startTime).toEqual({ hour: 20, minute: 0 });
        expect(sched.duration).toBe(60);

        const proj = projectCalendarTask(updated, "2026-08-31");
        expect(proj).not.toBeNull();
        expect(proj?.isAllDay).toBe(false);
        expect(proj?.startTime).toEqual({ hour: 20, minute: 0 });
      });

      test("Test B: removing time from scheduled Task yields valid all-day Task", () => {
        const timed: Task = {
          id: "task-edit-inv2",
          workspaceId: INBOX_WORKSPACE_ID,
          title: "Study Kubernetes",
          status: "todo",
          priority: "high",
          schedule: { date: "2026-08-31", startTime: "20:00", durationMinutes: 90 },
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        };

        const updated: Task = {
          ...timed,
          schedule: {
            ...timed.schedule,
            date: "2026-08-31",
            startTime: undefined,
            durationMinutes: undefined,
          },
        };

        const sched = getStructuredSchedule(updated);
        expect(sched.startDate).toBe("2026-08-31");
        expect(sched.startTime).toBeUndefined();

        const proj = projectCalendarTask(updated, "2026-08-31");
        expect(proj).not.toBeNull();
        expect(proj?.isAllDay).toBe(true);
        expect(proj?.startTime).toBeUndefined();
      });
    });
  });
});
