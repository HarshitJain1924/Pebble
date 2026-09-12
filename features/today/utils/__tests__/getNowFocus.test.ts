import { getNowFocus } from "../getNowFocus";
import type { Task, Habit, Checklist } from "@/shared/types/domain.types";

const TODAY_DATE = "2026-09-12";

function createDateAtTime(hours: number, minutes: number): Date {
  // 2026-09-12Thh:mm:00
  return new Date(2026, 8, 12, hours, minutes, 0, 0);
}

function mockTask(overrides: Partial<Task> & { dueTime?: string }): Task {
  return {
    id: `task-${Math.random().toString(36).substring(2, 7)}`,
    workspaceId: "inbox",
    title: "Mock Task",
    revision: 1,
    lifecycleGeneration: 1,
    status: "todo",
    priority: "none",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function mockHabit(overrides: Partial<Habit>): Habit {
  return {
    id: `habit-${Math.random().toString(36).substring(2, 7)}`,
    workspaceId: "inbox",
    title: "Mock Habit",
    revision: 1,
    lifecycleGeneration: 1,
    recurrence: { frequency: "daily", interval: 1 },
    completionHistory: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function mockChecklist(overrides: Partial<Checklist>): Checklist {
  return {
    id: `checklist-${Math.random().toString(36).substring(2, 7)}`,
    workspaceId: "inbox",
    title: "Mock Checklist",
    revision: 1,
    lifecycleGeneration: 1,
    items: [
      { id: "item-1", title: "Item 1", completed: false },
      { id: "item-2", title: "Item 2", completed: false },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("getNowFocus decision engine", () => {
  // 1. 2:00 PM + active 2:00–3:00 Task → active
  it("1. 2:00 PM + active 2:00–3:00 Task -> active", () => {
    const task = mockTask({
      id: "task-2-3",
      title: "Deep Work Session",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 0), // Exactly 2:00 PM
      referenceDateKey: TODAY_DATE,
      tasks: [task],
      habits: [],
      checklists: [],
    });

    expect(result.state).toBe("active");
    expect(result.type).toBe("task");
    expect(result.item?.id).toBe("task-2-3");
    expect(result.timeLabel).toBe("2:00 PM – 3:00 PM");
  });

  // 2. 2:30 PM + same Task → active
  it("2. 2:30 PM + same Task -> active", () => {
    const task = mockTask({
      id: "task-2-3",
      title: "Deep Work Session",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 30), // 2:30 PM mid-window
      referenceDateKey: TODAY_DATE,
      tasks: [task],
      habits: [],
      checklists: [],
    });

    expect(result.state).toBe("active");
    expect(result.type).toBe("task");
    expect(result.item?.id).toBe("task-2-3");
  });

  // 3. 3:00 PM + Task ended → it no longer counts as active
  it("3. 3:00 PM + Task ended -> it no longer counts as active", () => {
    const task = mockTask({
      id: "task-2-3",
      title: "Deep Work Session",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(15, 0), // 3:00 PM window ended
      referenceDateKey: TODAY_DATE,
      tasks: [task],
      habits: [],
      checklists: [],
    });

    expect(result.state).not.toBe("active");
    expect(result.state).toBe("empty");
  });

  // 4. 2:00 PM + upcoming 2:30 activity + later 4 PM high-priority activity → do NOT skip 2:30
  it("4. 2:00 PM + upcoming 2:30 activity + later 4 PM high-priority activity -> do NOT skip 2:30", () => {
    const task230 = mockTask({
      id: "task-230",
      title: "Check Emails",
      priority: "low",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:30",
        endTime: "15:00",
      },
    });

    const task4pm = mockTask({
      id: "task-4pm",
      title: "Critical Client Demo",
      priority: "high",
      schedule: {
        date: TODAY_DATE,
        startTime: "16:00",
        endTime: "17:00",
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 0), // 2:00 PM
      referenceDateKey: TODAY_DATE,
      tasks: [task4pm, task230],
      habits: [],
      checklists: [],
    });

    // 2:30 PM is the nearest upcoming scheduled activity; it must NOT be skipped for the 4 PM task
    expect(result.state).toBe("upcoming");
    expect(result.item?.id).toBe("task-230");
    expect(result.timeLabel).toBe("Starts at 2:30 PM");
  });

  // 5. 2:00 PM + free 30-minute window + 15-minute unscheduled Task → recommended
  it("5. 2:00 PM + free 30-minute window + 15-minute unscheduled Task -> recommended", () => {
    const upcomingTask = mockTask({
      id: "task-upcoming",
      title: "Dentist",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:30", // 30 min window from 2:00 PM
        endTime: "15:00",
      },
    });

    const shortTask = mockTask({
      id: "task-short",
      title: "Pay Utility Bill",
      priority: "medium",
      schedule: {
        durationMinutes: 15, // 15 <= 30 mins window
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 0),
      referenceDateKey: TODAY_DATE,
      tasks: [upcomingTask, shortTask],
      habits: [],
      checklists: [],
    });

    expect(result.state).toBe("recommended");
    expect(result.type).toBe("task");
    expect(result.item?.id).toBe("task-short");
    expect(result.durationMinutes).toBe(15);
    expect(result.windowMinutes).toBe(30);
  });

  // 6. 2:00 PM + free 30-minute window + 60-minute unscheduled Task → not recommended
  it("6. 2:00 PM + free 30-minute window + 60-minute unscheduled Task -> not recommended", () => {
    const upcomingTask = mockTask({
      id: "task-upcoming",
      title: "Team Meeting",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:30", // 30 min window from 2:00 PM
        endTime: "15:30",
      },
    });

    const longTask = mockTask({
      id: "task-long",
      title: "Write Strategy Document",
      priority: "high",
      schedule: {
        durationMinutes: 60, // 60 > 30 mins window!
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 0),
      referenceDateKey: TODAY_DATE,
      tasks: [upcomingTask, longTask],
      habits: [],
      checklists: [],
    });

    // longTask does not fit into 30m window, falls back to upcoming 2:30 activity
    expect(result.state).toBe("upcoming");
    expect(result.item?.id).toBe("task-upcoming");
  });

  // 7. High-priority item due at 4 PM vs low-priority item due at 8 PM → high-priority/nearer-due candidate wins when both fit
  it("7. high-priority item due at 4 PM vs low-priority item due at 8 PM -> high-priority/nearer-due candidate wins when both fit", () => {
    const highPriorityDue4pm = mockTask({
      id: "task-high-4pm",
      title: "Complete Tax Filing",
      priority: "high",
      dueTime: "16:00",
      schedule: {
        durationMinutes: 45,
      },
    });

    const lowPriorityDue8pm = mockTask({
      id: "task-low-8pm",
      title: "Organize Bookshelf",
      priority: "low",
      dueTime: "20:00",
      schedule: {
        durationMinutes: 30,
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 0),
      referenceDateKey: TODAY_DATE,
      tasks: [lowPriorityDue8pm, highPriorityDue4pm],
      habits: [],
      checklists: [],
    });

    expect(result.state).toBe("recommended");
    expect(result.item?.id).toBe("task-high-4pm");
  });

  // 8. Reminder at 2 PM but actual due time at 4 PM → ranking uses actual due time, NOT reminder time
  it("8. reminder at 2 PM but actual due time at 4 PM -> ranking uses actual due time, NOT reminder time", () => {
    // Task A: reminder early at 1:00 PM, but real due time later at 4:00 PM (16:00)
    const taskA = mockTask({
      id: "task-A",
      title: "Task with early reminder but late due time",
      priority: "high",
      dueTime: "16:00", // Due 4:00 PM
      reminder: {
        enabled: true,
        triggerAt: createDateAtTime(13, 0).getTime(), // Reminder was at 1:00 PM
      },
      schedule: {
        durationMinutes: 30,
      },
    });

    // Task B: reminder later at 1:45 PM, but real due time sooner at 2:30 PM (14:30)
    const taskB = mockTask({
      id: "task-B",
      title: "Task with later reminder but earlier due time",
      priority: "high",
      dueTime: "14:30", // Due 2:30 PM (sooner!)
      reminder: {
        enabled: true,
        triggerAt: createDateAtTime(13, 45).getTime(), // Reminder was at 1:45 PM
      },
      schedule: {
        durationMinutes: 30,
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 0), // 2:00 PM
      referenceDateKey: TODAY_DATE,
      tasks: [taskA, taskB],
      habits: [],
      checklists: [],
    });

    // Task B has the earlier real due time (14:30 vs 16:00) and MUST win despite Task A's earlier reminder trigger!
    expect(result.state).toBe("recommended");
    expect(result.item?.id).toBe("task-B");
  });

  // 9. Scheduled Habit can become active
  it("9. scheduled Habit can become active", () => {
    const habit = mockHabit({
      id: "habit-active",
      title: "Afternoon Walk",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "14:30",
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 10),
      referenceDateKey: TODAY_DATE,
      tasks: [],
      habits: [habit],
      checklists: [],
    });

    expect(result.state).toBe("active");
    expect(result.type).toBe("habit");
    expect(result.item?.id).toBe("habit-active");
  });

  // 10. Scheduled Checklist can become active
  it("10. scheduled Checklist can become active", () => {
    const checklist = mockChecklist({
      id: "checklist-active",
      title: "Daily Standup Routine",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "14:30",
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 15),
      referenceDateKey: TODAY_DATE,
      tasks: [],
      habits: [],
      checklists: [checklist],
    });

    expect(result.state).toBe("active");
    expect(result.type).toBe("checklist");
    expect(result.item?.id).toBe("checklist-active");
  });

  // 11. Unscheduled Habit can be recommended
  it("11. unscheduled Habit can be recommended", () => {
    const unscheduledHabit = mockHabit({
      id: "habit-meditate",
      title: "5-Minute Breathwork",
      schedule: {
        durationMinutes: 5,
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 0),
      referenceDateKey: TODAY_DATE,
      tasks: [],
      habits: [unscheduledHabit],
      checklists: [],
    });

    expect(result.state).toBe("recommended");
    expect(result.type).toBe("habit");
    expect(result.item?.id).toBe("habit-meditate");
  });

  // 12. Unscheduled Checklist can be recommended
  it("12. unscheduled Checklist can be recommended", () => {
    const unscheduledChecklist = mockChecklist({
      id: "checklist-eod",
      title: "Shutdown Routine",
      schedule: {
        durationMinutes: 20,
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 0),
      referenceDateKey: TODAY_DATE,
      tasks: [],
      habits: [],
      checklists: [unscheduledChecklist],
    });

    expect(result.state).toBe("recommended");
    expect(result.type).toBe("checklist");
    expect(result.item?.id).toBe("checklist-eod");
  });

  // 13. Completed Task/Habit/Checklist cannot become NOW
  it("13. completed Task/Habit/Checklist cannot become NOW", () => {
    const completedTask = mockTask({
      id: "task-completed",
      status: "completed",
      completedAt: Date.now(),
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
      },
    });

    const completedHabit = mockHabit({
      id: "habit-completed",
      completionHistory: [{ date: TODAY_DATE, completedAt: Date.now() }],
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
      },
    });

    const completedChecklist = mockChecklist({
      id: "checklist-completed",
      items: [
        { id: "i1", title: "i1", completed: true },
        { id: "i2", title: "i2", completed: true },
      ],
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 15),
      referenceDateKey: TODAY_DATE,
      tasks: [completedTask],
      habits: [completedHabit],
      checklists: [completedChecklist],
    });

    expect(result.state).toBe("empty");
    expect(result.item).toBeUndefined();
  });

  // 14. Overdue Task does not automatically become NOW
  it("14. overdue Task does not automatically become NOW", () => {
    const overdueTask = mockTask({
      id: "task-overdue",
      title: "Task from Yesterday",
      priority: "high",
      schedule: {
        date: "2026-09-11", // yesterday
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 0),
      referenceDateKey: TODAY_DATE,
      tasks: [overdueTask],
      habits: [],
      checklists: [],
    });

    expect(result.state).toBe("empty");
    expect(result.item).toBeUndefined();
  });

  // 15. No valid candidate → empty
  it("15. no valid candidate -> empty", () => {
    const result = getNowFocus({
      now: createDateAtTime(14, 0),
      referenceDateKey: TODAY_DATE,
      tasks: [],
      habits: [],
      checklists: [],
    });

    expect(result.state).toBe("empty");
    expect(result.item).toBeUndefined();
  });

  // 16. Multiple active candidates remain deterministic
  it("16. multiple active candidates remain deterministic", () => {
    const highTask = mockTask({
      id: "task-active-high",
      title: "Urgent Outage Fix",
      priority: "high",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
      },
    });

    const medTask = mockTask({
      id: "task-active-med",
      title: "Code Review",
      priority: "medium",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
      },
    });

    // Invert input order to test deterministic resolution
    const res1 = getNowFocus({
      now: createDateAtTime(14, 15),
      referenceDateKey: TODAY_DATE,
      tasks: [medTask, highTask],
      habits: [],
      checklists: [],
    });

    const res2 = getNowFocus({
      now: createDateAtTime(14, 15),
      referenceDateKey: TODAY_DATE,
      tasks: [highTask, medTask],
      habits: [],
      checklists: [],
    });

    expect(res1.state).toBe("active");
    expect(res2.state).toBe("active");
    expect(res1.item?.id).toBe("task-active-high");
    expect(res2.item?.id).toBe("task-active-high");
  });

  // 17. Changing the `now` input changes the result correctly
  it("17. changing the now input changes the result correctly", () => {
    const scheduledTask = mockTask({
      id: "task-windowed",
      title: "Scheduled Work Block",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
      },
    });

    // At 1:30 PM: Upcoming
    const before = getNowFocus({
      now: createDateAtTime(13, 30),
      referenceDateKey: TODAY_DATE,
      tasks: [scheduledTask],
      habits: [],
      checklists: [],
    });
    expect(before.state).toBe("upcoming");
    expect(before.item?.id).toBe("task-windowed");

    // At 2:15 PM: Active
    const during = getNowFocus({
      now: createDateAtTime(14, 15),
      referenceDateKey: TODAY_DATE,
      tasks: [scheduledTask],
      habits: [],
      checklists: [],
    });
    expect(during.state).toBe("active");
    expect(during.item?.id).toBe("task-windowed");

    // At 3:05 PM: Ended -> Empty
    const after = getNowFocus({
      now: createDateAtTime(15, 5),
      referenceDateKey: TODAY_DATE,
      tasks: [scheduledTask],
      habits: [],
      checklists: [],
    });
    expect(after.state).toBe("empty");
  });

  // 18. Selector does not mutate input objects
  it("18. selector does not mutate input objects", () => {
    const task: Task = mockTask({
      id: "task-immutable",
      title: "Untouched Task",
      priority: "medium",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
        durationMinutes: 60,
      },
    });

    const frozenSnapshot = JSON.stringify(task);

    getNowFocus({
      now: createDateAtTime(14, 15),
      referenceDateKey: TODAY_DATE,
      tasks: [task],
      habits: [],
      checklists: [],
    });

    expect(JSON.stringify(task)).toBe(frozenSnapshot);
  });

  // 19. Selector does not modify schedules/calendar data
  it("19. selector does not modify schedules/calendar data", () => {
    const habit = mockHabit({
      id: "habit-unchanged",
      title: "Habit Unchanged",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "14:30",
        durationMinutes: 30,
      },
    });

    const origStartTime = habit.schedule?.startTime;
    const origEndTime = habit.schedule?.endTime;

    getNowFocus({
      now: createDateAtTime(14, 10),
      referenceDateKey: TODAY_DATE,
      tasks: [],
      habits: [habit],
      checklists: [],
    });

    expect(habit.schedule?.startTime).toBe(origStartTime);
    expect(habit.schedule?.endTime).toBe(origEndTime);
  });

  // 20. Open schedule without upcoming events does not impose an arbitrary 10 PM cutoff
  it("20. open schedule without upcoming events does not impose an arbitrary 10 PM cutoff", () => {
    const eveningTask = mockTask({
      id: "task-evening",
      title: "Late Night Coding",
      schedule: {
        durationMinutes: 90,
      },
    });

    // Calling at 9:30 PM (21:30) with no upcoming scheduled tasks
    const result = getNowFocus({
      now: createDateAtTime(21, 30),
      referenceDateKey: TODAY_DATE,
      tasks: [eveningTask],
      habits: [],
      checklists: [],
    });

    // In previous implementation with hardcoded 10 PM (22:00), window was 30 mins, so 90 min task was rejected.
    // In our unconstrained open schedule, it fits and is recommended!
    expect(result.state).toBe("recommended");
    expect(result.item?.id).toBe("task-evening");
    expect(result.contextLabel).toContain("Open schedule");
  });
});
