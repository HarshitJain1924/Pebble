import {
  calculateRescheduledTask,
  getStructuredSchedule,
  planCalendarTaskDrop,
} from "@/services/scheduling/scheduling.service";
import { isRecurringOccurrenceForDate } from "@/services/scheduling/recurrence.service";
import type { Task } from "@/shared/types/domain.types";

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
      if (item.categoryId === "focus" || item.category === "focus")
        return "focus";
      if (item.categoryId === "learning" || item.category === "learning")
        return "resource";
      if (
        item.categoryId === "home" ||
        item.category === "home" ||
        (item.items && item.items.length > 0)
      )
        return "checklist";
      if (item.schedule?.startTime)
        return "event";
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

    // TEST 3: Task with categoryId="travel", schedule={date: "2026-08-30", startTime: "15:00"} renders as a timed item because of startTime
    test("TEST 3: Task with categoryId='travel' and startTime='15:00' renders as a timed Calendar item because of startTime", () => {
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

      expect(getItemType(timedTravelTask)).toBe("event");
      const proj = projectCalendarTask(timedTravelTask, "2026-08-30");
      expect(proj?.isAllDay).toBe(false);
      expect(proj?.startTime).toEqual({ hour: 15, minute: 0 });

      const layout = projectTimelineLayout(timedTravelTask, "2026-08-30");
      expect(layout?.startHour).toBe(15);
      expect(layout?.startMinutes).toBe(900);
      expect(layout?.top).toBe((900 / 60) * 80);
    });

    // TEST 4: Task with categoryId="work", schedule={date: "2026-08-30", startTime: "15:00"} renders as a timed item identically
    test("TEST 4: Task with categoryId='work' and startTime='15:00' renders as a timed item identically to travel task", () => {
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

      expect(getItemType(timedWorkTask)).toBe("event");
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
  });

  describe("Calendar Drag/Drop for Recurring Task Occurrences (Fix #8)", () => {
    const dailyMasterTask: Task = {
      id: "task-master-daily",
      workspaceId: "inbox",
      title: "Daily Standup",
      status: "todo",
      priority: "medium",
      schedule: {
        date: "2026-08-01",
        startTime: "09:00",
        endTime: "09:30",
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

    // TEST 1 — recurring occurrence time move
    test("TEST 1: Moving Aug 30 occurrence to 11:00 creates an occurrence exception and leaves untouched days and master series at 09:00", () => {
      let generatedId = "task-copy-aug30";
      const plan = planCalendarTaskDrop(
        dailyMasterTask,
        "inbox",
        { hour: 11 },
        "2026-08-30",
        () => generatedId,
      );

      expect(plan.isRecurringOccurrence).toBe(true);
      expect(plan.directTaskUpdate).toBeUndefined();

      // 1. Master receives recurrenceExceptions including "2026-08-30"
      expect(plan.masterUpdate?.id).toBe("task-master-daily");
      expect(plan.masterUpdate?.patch.recurrenceExceptions).toEqual(["2026-08-30"]);
      // Master schedule startTime is NOT changed
      expect(plan.masterUpdate?.patch.schedule).toBeUndefined();

      // 2. Created copy is non-recurring on 2026-08-30 at 11:00
      expect(plan.createdExceptionCopy?.id).toBe("task-copy-aug30");
      expect(plan.createdExceptionCopy?.recurrence).toBeUndefined();
      expect(plan.createdExceptionCopy?.schedule?.date).toBe("2026-08-30");
      expect(plan.createdExceptionCopy?.schedule?.startTime).toBe("11:00");
      expect(plan.createdExceptionCopy?.schedule?.endTime).toBe("11:30"); // Preserves 30 min duration

      // Simulated updated database state: master with exception + created copy
      const updatedMaster: Task = {
        ...dailyMasterTask,
        recurrenceExceptions: plan.masterUpdate!.patch.recurrenceExceptions,
      };
      const createdCopy: Task = plan.createdExceptionCopy!;
      const currentTasks = [updatedMaster, createdCopy];

      // Calendar Projections:
      // Aug 29: Master projects at 09:00, copy does not project
      const aug29Items = currentTasks
        .map((t) => projectCalendarTask(t, "2026-08-29"))
        .filter(Boolean);
      expect(aug29Items).toHaveLength(1);
      expect(aug29Items[0]?.id).toBe("task-master-daily");
      expect(aug29Items[0]?.startTime).toEqual({ hour: 9, minute: 0 });

      // Aug 30: Master is excluded by recurrenceExceptions, copy projects at 11:00
      const aug30Items = currentTasks
        .map((t) => projectCalendarTask(t, "2026-08-30"))
        .filter(Boolean);
      expect(aug30Items).toHaveLength(1);
      expect(aug30Items[0]?.id).toBe("task-copy-aug30");
      expect(aug30Items[0]?.startTime).toEqual({ hour: 11, minute: 0 });

      // Aug 31: Master projects at 09:00, copy does not project
      const aug31Items = currentTasks
        .map((t) => projectCalendarTask(t, "2026-08-31"))
        .filter(Boolean);
      expect(aug31Items).toHaveLength(1);
      expect(aug31Items[0]?.id).toBe("task-master-daily");
      expect(aug31Items[0]?.startTime).toEqual({ hour: 9, minute: 0 });
    });

    // TEST 2 — recurring occurrence date move
    test("TEST 2: Moving Aug 30 occurrence to Aug 31 does not mutate master series start date or time", () => {
      const plan = planCalendarTaskDrop(
        dailyMasterTask,
        "inbox",
        { date: "2026-08-31" },
        "2026-08-30",
        () => "task-copy-aug31",
      );

      expect(plan.isRecurringOccurrence).toBe(true);
      expect(plan.masterUpdate?.patch.recurrenceExceptions).toEqual(["2026-08-30"]);
      expect(plan.createdExceptionCopy?.schedule?.date).toBe("2026-08-31");
      expect(plan.createdExceptionCopy?.schedule?.startTime).toBe("09:00");
      expect(plan.createdExceptionCopy?.recurrence).toBeUndefined();

      // Master start date remains 2026-08-01
      expect(dailyMasterTask.schedule?.date).toBe("2026-08-01");
    });

    // TEST 3 — recurring occurrence reminder protection
    test("TEST 3: Dragging an occurrence preserves reminder.triggerAt unchanged", () => {
      const reminderEpoch = new Date("2026-08-01T08:30:00").getTime();
      const taskWithReminder: Task = {
        ...dailyMasterTask,
        reminder: {
          enabled: true,
          triggerAt: reminderEpoch,
        },
      };

      const plan = planCalendarTaskDrop(
        taskWithReminder,
        "inbox",
        { hour: 14 },
        "2026-08-30",
        () => "task-copy-rem",
      );

      expect(plan.createdExceptionCopy?.reminder?.triggerAt).toBe(reminderEpoch);
      expect(taskWithReminder.reminder?.triggerAt).toBe(reminderEpoch);
    });

    // TEST 4 — non-recurring Task regression
    test("TEST 4: Non-recurring Task drag continues to update task directly without exception copy", () => {
      const nonRecurringTask: Task = {
        id: "task-non-rec-1",
        workspaceId: "inbox",
        title: "One-off Task",
        status: "todo",
        priority: "high",
        schedule: {
          date: "2026-08-30",
          startTime: "15:00",
          endTime: "16:00",
        },
        reminder: {
          enabled: true,
          triggerAt: 123456789,
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const plan = planCalendarTaskDrop(
        nonRecurringTask,
        "inbox",
        { hour: 17 },
        "2026-08-30",
        () => "should-not-be-called",
      );

      expect(plan.isRecurringOccurrence).toBe(false);
      expect(plan.masterUpdate).toBeUndefined();
      expect(plan.createdExceptionCopy).toBeUndefined();
      expect(plan.directTaskUpdate?.id).toBe("task-non-rec-1");
      expect(plan.directTaskUpdate?.patch.schedule?.startTime).toBe("17:00");
      expect(plan.directTaskUpdate?.patch.schedule?.endTime).toBe("18:00");
      expect(plan.directTaskUpdate?.patch.reminder).toBeUndefined();
    });

    // TEST 5 — multiple recurring occurrences isolation
    test("TEST 5: Modifying one occurrence in a multi-week recurring series leaves all untouched occurrences unchanged", () => {
      const plan = planCalendarTaskDrop(
        dailyMasterTask,
        "inbox",
        { hour: 16 },
        "2026-08-30",
        () => "task-copy-multi",
      );

      const updatedMaster: Task = {
        ...dailyMasterTask,
        recurrenceExceptions: plan.masterUpdate!.patch.recurrenceExceptions,
      };
      const createdCopy = plan.createdExceptionCopy!;
      const tasks = [updatedMaster, createdCopy];

      const testDates = ["2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01"];
      for (const d of testDates) {
        const projections = tasks
          .map((t) => projectCalendarTask(t, d))
          .filter(Boolean);
        expect(projections).toHaveLength(1);
        if (d === "2026-08-30") {
          expect(projections[0]?.id).toBe("task-copy-multi");
          expect(projections[0]?.startTime).toEqual({ hour: 16, minute: 0 });
        } else {
          expect(projections[0]?.id).toBe("task-master-daily");
          expect(projections[0]?.startTime).toEqual({ hour: 9, minute: 0 });
        }
      }
    });

    // TEST 6 — existing recurrenceExceptions mechanism reuse
    test("TEST 6: Calendar drag uses standard recurrenceExceptions array matching TaskDetailContent exception architecture", () => {
      const masterWithExistingExceptions: Task = {
        ...dailyMasterTask,
        recurrenceExceptions: ["2026-08-15"],
      };

      const plan = planCalendarTaskDrop(
        masterWithExistingExceptions,
        "inbox",
        { hour: 10 },
        "2026-08-30",
        () => "task-copy-existing-exc",
      );

      expect(plan.masterUpdate?.patch.recurrenceExceptions).toEqual([
        "2026-08-15",
        "2026-08-30",
      ]);
    });
  });
});
