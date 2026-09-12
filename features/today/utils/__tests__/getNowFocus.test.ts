import { getNowFocus } from "../getNowFocus";
import type { Task, Habit, Checklist, TaskPriority } from "@/shared/types/domain.types";

const TODAY_DATE = "2026-09-12";

function createDateAtTime(hours: number, minutes: number, seconds = 0): Date {
  // 2026-09-12Thh:mm:ss
  return new Date(2026, 8, 12, hours, minutes, seconds, 0);
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

function mockHabit(overrides: Partial<Habit> & { priority?: TaskPriority }): Habit {
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

function mockChecklist(overrides: Partial<Checklist> & { priority?: TaskPriority }): Checklist {
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
    expect(result.remainingMinutes).toBe(60);
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
    expect(result.remainingMinutes).toBe(30);
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

  // 12b. Checklist focus exposes occurrence-aware progress + the next actionable item
  it("12b. active Checklist exposes checklistState with the next incomplete item", () => {
    const checklist = mockChecklist({
      id: "checklist-next",
      items: [
        { id: "i1", title: "Build bundle", completed: true },
        { id: "i2", title: "Run migration", completed: false },
        { id: "i3", title: "Smoke tests", completed: false },
      ],
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 30),
      referenceDateKey: TODAY_DATE,
      tasks: [],
      habits: [],
      checklists: [checklist],
    });

    expect(result.state).toBe("active");
    expect(result.checklistState).toEqual({
      completedCount: 1,
      total: 3,
      nextItem: { id: "i2", title: "Run migration" },
    });
  });

  it("12c. recurring Checklist resolves its next item from occurrence-isolated state", () => {
    const checklist = mockChecklist({
      id: "checklist-recurring",
      recurrence: { frequency: "daily", interval: 1 },
      items: [
        { id: "i1", title: "Build bundle", completed: false },
        { id: "i2", title: "Run migration", completed: false },
      ],
      occurrenceHistory: {
        [TODAY_DATE]: { completedItemIds: ["i1"] },
      },
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 30),
      referenceDateKey: TODAY_DATE,
      tasks: [],
      habits: [],
      checklists: [checklist],
    });

    expect(result.state).toBe("active");
    // i1 is globally incomplete but completed for today's occurrence — i2 is next.
    expect(result.checklistState).toEqual({
      completedCount: 1,
      total: 2,
      nextItem: { id: "i2", title: "Run migration" },
    });
  });

  it("12d. non-checklist focus carries no checklistState", () => {
    const task = mockTask({
      id: "task-no-checklist-state",
      schedule: { date: TODAY_DATE, startTime: "14:00", endTime: "15:00" },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 30),
      referenceDateKey: TODAY_DATE,
      tasks: [task],
      habits: [],
      checklists: [],
    });

    expect(result.state).toBe("active");
    expect(result.checklistState).toBeUndefined();
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

  // 21. Exact user scenario: newly created task at 2:00 PM scheduled for 3:00 PM
  it("21. exact user scenario: 2:00 PM -> scheduled 3:00 PM -> upcoming with title -> 3:00 PM active -> 3:31 PM empty", () => {
    const newTask = mockTask({
      id: "task-user-scenario-engine",
      title: "Test NOW task",
      priority: "medium",
      schedule: {
        date: TODAY_DATE,
        startTime: "15:00",
        endTime: "15:30",
        durationMinutes: 30,
      },
    });

    // 1. At 2:00 PM -> MUST return UPCOMING with the task item and title intact!
    const at2pm = getNowFocus({
      now: createDateAtTime(14, 0),
      referenceDateKey: TODAY_DATE,
      tasks: [newTask],
      habits: [],
      checklists: [],
    });

    expect(at2pm.state).toBe("upcoming");
    expect(at2pm.type).toBe("task");
    expect(at2pm.item).toBeDefined();
    expect(at2pm.item?.title).toBe("Test NOW task");
    expect(at2pm.timeLabel).toBe("Starts at 3:00 PM");

    // 2. At 3:00 PM -> window begins, MUST transition to ACTIVE NOW
    const at3pm = getNowFocus({
      now: createDateAtTime(15, 0),
      referenceDateKey: TODAY_DATE,
      tasks: [newTask],
      habits: [],
      checklists: [],
    });

    expect(at3pm.state).toBe("active");
    expect(at3pm.type).toBe("task");
    expect(at3pm.item?.title).toBe("Test NOW task");
    expect(at3pm.timeLabel).toBe("3:00 PM – 3:30 PM");

    // 3. At 3:31 PM -> scheduled window ended, NOW reevaluates
    const at331pm = getNowFocus({
      now: createDateAtTime(15, 31),
      referenceDateKey: TODAY_DATE,
      tasks: [newTask],
      habits: [],
      checklists: [],
    });

    expect(at331pm.state).toBe("empty");
    expect(at331pm.item).toBeUndefined();
  });

  // 22. Invariant: every non-empty state (active, recommended, upcoming) returns a complete item with defined title
  it("22. invariant: every non-empty state returns a complete item with defined title and type", () => {
    const activeTask = mockTask({
      id: "t-act",
      title: "Active Task",
      schedule: { date: TODAY_DATE, startTime: "14:00", endTime: "15:00" },
    });
    const upcomingTask = mockTask({
      id: "t-upc",
      title: "Upcoming Task",
      schedule: { date: TODAY_DATE, startTime: "16:00", endTime: "17:00" },
    });
    const recTask = mockTask({
      id: "t-rec",
      title: "Recommended Task",
      schedule: { durationMinutes: 20 },
    });

    // Case 1: Active
    const resActive = getNowFocus({
      now: createDateAtTime(14, 30),
      referenceDateKey: TODAY_DATE,
      tasks: [activeTask],
      habits: [],
      checklists: [],
    });
    expect(resActive.state).toBe("active");
    expect(resActive.item).toBeDefined();
    expect(resActive.item?.title).toBe("Active Task");
    expect(resActive.type).toBe("task");

    // Case 2: Recommended
    const resRec = getNowFocus({
      now: createDateAtTime(14, 0),
      referenceDateKey: TODAY_DATE,
      tasks: [upcomingTask, recTask],
      habits: [],
      checklists: [],
    });
    expect(resRec.state).toBe("recommended");
    expect(resRec.item).toBeDefined();
    expect(resRec.item?.title).toBe("Recommended Task");
    expect(resRec.type).toBe("task");

    // Case 3: Upcoming
    const resUpc = getNowFocus({
      now: createDateAtTime(14, 0),
      referenceDateKey: TODAY_DATE,
      tasks: [upcomingTask],
      habits: [],
      checklists: [],
    });
    expect(resUpc.state).toBe("upcoming");
    expect(resUpc.item).toBeDefined();
    expect(resUpc.item?.title).toBe("Upcoming Task");
    expect(resUpc.type).toBe("task");
  });

  // 23. Tasks with schedule.date: "inbox" are recognized as unscheduled and eligible for recommendation
  it("23. tasks with schedule.date: 'inbox' are treated as unscheduled and eligible for recommendation", () => {
    const inboxTask = mockTask({
      id: "task-inbox-sentinel",
      title: "Inbox Task",
      priority: "high",
      schedule: {
        date: "inbox", // Canonical Pebble unscheduled sentinel
        durationMinutes: 15,
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 0),
      referenceDateKey: TODAY_DATE,
      tasks: [inboxTask],
      habits: [],
      checklists: [],
    });

    expect(result.state).toBe("recommended");
    expect(result.item?.id).toBe("task-inbox-sentinel");
    expect(result.item?.title).toBe("Inbox Task");
  });

  // 24. Active scheduled Task calculates exact remainingMinutes based on current time (2:17 PM in 2:00-3:00 -> 43 min)
  it("24. active scheduled Task calculates exact remainingMinutes based on current time", () => {
    const task = mockTask({
      id: "task-prompt-example",
      title: "Build Pebble NOW",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 17), // 2:17 PM
      referenceDateKey: TODAY_DATE,
      tasks: [task],
      habits: [],
      checklists: [],
    });

    expect(result.state).toBe("active");
    expect(result.type).toBe("task");
    expect(result.item?.title).toBe("Build Pebble NOW");
    expect(result.timeLabel).toBe("2:00 PM – 3:00 PM");
    expect(result.durationMinutes).toBe(60);
    expect(result.remainingMinutes).toBe(43);
  });

  // 25. Active scheduled Habit calculates exact remainingMinutes (7:20 AM in 7:00-8:00 -> 40 min)
  it("25. active scheduled Habit calculates exact remainingMinutes based on current time", () => {
    const habit = mockHabit({
      id: "habit-prompt-example",
      title: "Morning workout",
      schedule: {
        date: TODAY_DATE,
        startTime: "07:00",
        endTime: "08:00",
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(7, 20), // 7:20 AM
      referenceDateKey: TODAY_DATE,
      tasks: [],
      habits: [habit],
      checklists: [],
    });

    expect(result.state).toBe("active");
    expect(result.type).toBe("habit");
    expect(result.item?.title).toBe("Morning workout");
    expect(result.remainingMinutes).toBe(40);
  });

  // 26. Unscheduled recommended Task does NOT invent a fake remaining allocation
  it("26. unscheduled recommended Task does not invent a fake remaining allocation", () => {
    const task = mockTask({
      id: "task-unscheduled",
      title: "Deep Reading",
      schedule: {
        durationMinutes: 45,
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 0),
      referenceDateKey: TODAY_DATE,
      tasks: [task],
      habits: [],
      checklists: [],
    });

    expect(result.state).toBe("recommended");
    expect(result.durationMinutes).toBe(45);
    expect(result.remainingMinutes).toBeUndefined();
  });

  // 27. Upcoming scheduled Task does not have remainingMinutes
  it("27. upcoming scheduled Task does not have remainingMinutes", () => {
    const task = mockTask({
      id: "task-upcoming-27",
      title: "Upcoming Meeting",
      schedule: {
        date: TODAY_DATE,
        startTime: "16:00",
        endTime: "17:00",
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 0),
      referenceDateKey: TODAY_DATE,
      tasks: [task],
      habits: [],
      checklists: [],
    });

    expect(result.state).toBe("upcoming");
    expect(result.remainingMinutes).toBeUndefined();
    expect(result.remainingSeconds).toBeUndefined();
  });

  // 28. Exact second precision for active scheduled Task: 14:00:00 in 14:00–15:00 slot → 3600 sec
  it("28. 14:00:00 in a 14:00–15:00 slot -> 3600 sec", () => {
    const task = mockTask({
      id: "task-precision-1",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 0, 0),
      referenceDateKey: TODAY_DATE,
      tasks: [task],
      habits: [],
      checklists: [],
    });

    expect(result.state).toBe("active");
    expect(result.remainingMinutes).toBe(60);
    expect(result.remainingSeconds).toBe(3600);
  });

  // 29. Exact second precision for active scheduled Task: 14:17:00 in 14:00–15:00 slot → 2580 sec
  it("29. 14:17:00 in a 14:00–15:00 slot -> 2580 sec", () => {
    const task = mockTask({
      id: "task-precision-2",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 17, 0),
      referenceDateKey: TODAY_DATE,
      tasks: [task],
      habits: [],
      checklists: [],
    });

    expect(result.state).toBe("active");
    expect(result.remainingMinutes).toBe(43);
    expect(result.remainingSeconds).toBe(2580);
  });

  // 30. Exact second precision for active scheduled Task: 14:17:45 in 14:00–15:00 slot → 2535 sec (NOT 2580)
  it("30. 14:17:45 in a 14:00–15:00 slot -> 2535 sec", () => {
    const task = mockTask({
      id: "task-precision-3",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 17, 45),
      referenceDateKey: TODAY_DATE,
      tasks: [task],
      habits: [],
      checklists: [],
    });

    expect(result.state).toBe("active");
    expect(result.remainingMinutes).toBe(43);
    // 54000 - (14*3600 + 17*60 + 45) = 54000 - 51465 = 2535
    expect(result.remainingSeconds).toBe(2535);
  });

  // 31. Exact second precision for active scheduled Task: 14:59:59 in 14:00–15:00 slot → 1 sec
  it("31. 14:59:59 in a 14:00–15:00 slot -> 1 sec", () => {
    const task = mockTask({
      id: "task-precision-4",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 59, 59),
      referenceDateKey: TODAY_DATE,
      tasks: [task],
      habits: [],
      checklists: [],
    });

    expect(result.state).toBe("active");
    expect(result.remainingMinutes).toBe(1);
    expect(result.remainingSeconds).toBe(1);
  });

  // 32. 15:00:00 in a 14:00–15:00 slot → no longer active
  it("32. 15:00:00 in a 14:00–15:00 slot -> no longer active", () => {
    const task = mockTask({
      id: "task-precision-5",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(15, 0, 0),
      referenceDateKey: TODAY_DATE,
      tasks: [task],
      habits: [],
      checklists: [],
    });

    expect(result.state).not.toBe("active");
    expect(result.state).toBe("empty");
    expect(result.remainingSeconds).toBeUndefined();
  });

  // 33. Explicit durationMinutes takes precedence over endTime for resolved end boundary
  it("33. explicit durationMinutes takes precedence over endTime for resolved end boundary", () => {
    const task = mockTask({
      id: "task-precedence",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
        durationMinutes: 45, // Authoritative duration! Ends at 14:45, not 15:00
      },
    });

    // At 14:17:45 -> end boundary is 14:45:00 (53100s). 53100 - 51465 = 1635 seconds
    const resultActive = getNowFocus({
      now: createDateAtTime(14, 17, 45),
      referenceDateKey: TODAY_DATE,
      tasks: [task],
      habits: [],
      checklists: [],
    });

    expect(resultActive.state).toBe("active");
    expect(resultActive.durationMinutes).toBe(45);
    expect(resultActive.remainingMinutes).toBe(28); // 885 - 857 = 28m
    expect(resultActive.remainingSeconds).toBe(1635);

    // At 14:45:00 -> window closed
    const resultEnded = getNowFocus({
      now: createDateAtTime(14, 45, 0),
      referenceDateKey: TODAY_DATE,
      tasks: [task],
      habits: [],
      checklists: [],
    });

    expect(resultEnded.state).not.toBe("active");
  });

  // 34. Active scheduled Habit calculates exact remainingSeconds (7:15:30 in 7:00-8:00 -> 2670 sec)
  it("34. active scheduled Habit calculates exact remainingSeconds", () => {
    const habit = mockHabit({
      id: "habit-sec",
      schedule: {
        date: TODAY_DATE,
        startTime: "07:00",
        endTime: "08:00",
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(7, 15, 30),
      referenceDateKey: TODAY_DATE,
      tasks: [],
      habits: [habit],
      checklists: [],
    });

    expect(result.state).toBe("active");
    // 8:00 is 28800s. 7:15:30 is 7*3600 + 15*60 + 30 = 25200 + 900 + 30 = 26130s.
    // 28800 - 26130 = 2670s.
    expect(result.remainingSeconds).toBe(2670);
  });

  // 35. Unscheduled recommendation does NOT get fake remaining scheduled time
  it("35. unscheduled recommendation does NOT get fake remaining scheduled time", () => {
    const task = mockTask({
      id: "task-unscheduled-rec",
      schedule: {
        durationMinutes: 20,
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 0, 0),
      referenceDateKey: TODAY_DATE,
      tasks: [task],
      habits: [],
      checklists: [],
    });

    expect(result.state).toBe("recommended");
    expect(result.remainingSeconds).toBeUndefined();
    expect(result.remainingMinutes).toBeUndefined();
  });
});

describe("getNowFocus behavioral stress & multi-workspace integration", () => {
  // ─────────────────────────────────────────────────────────────
  // 1. REALISTIC MULTI-WORKSPACE SCHEDULED ACTIVE ITEMS
  // ─────────────────────────────────────────────────────────────
  describe("Multi-Workspace Scheduled Active Items", () => {
    it("A1. At 2:30 PM: Earlier start time wins between active high-priority items across Work and Learning, low priority in Personal is eliminated", () => {
      // Work: 'Fix production bug' — high priority — 2:00–3:00 PM (starts 14:00)
      // Personal: 'Clean room' — low priority — 2:15–3:15 PM (starts 14:15)
      // Learning: 'Study JavaScript' — high priority — 2:30–3:30 PM (starts 14:30)
      const workBug = mockTask({
        id: "work-bug-1",
        workspaceId: "ws-work",
        title: "Fix production bug",
        priority: "high",
        schedule: { date: TODAY_DATE, startTime: "14:00", endTime: "15:00" },
      });
      const personalClean = mockTask({
        id: "personal-clean-1",
        workspaceId: "ws-personal",
        title: "Clean room",
        priority: "low",
        schedule: { date: TODAY_DATE, startTime: "14:15", endTime: "15:15" },
      });
      const learningStudy = mockTask({
        id: "learning-study-1",
        workspaceId: "ws-learning",
        title: "Study JavaScript",
        priority: "high",
        schedule: { date: TODAY_DATE, startTime: "14:30", endTime: "15:30" },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 30, 0), // 2:30 PM
        referenceDateKey: TODAY_DATE,
        tasks: [learningStudy, personalClean, workBug],
        habits: [],
        checklists: [],
      });

      expect(result.state).toBe("active");
      expect(result.item?.id).toBe("work-bug-1");
      expect((result.item as Task)?.workspaceId).toBe("ws-work");
      expect(result.remainingMinutes).toBe(30);
    });

    it("A2. Two items with SAME start time: Priority is the primary tie-breaker", () => {
      const workHigh = mockTask({
        id: "work-hi",
        workspaceId: "ws-work",
        title: "Work High Priority",
        priority: "high",
        schedule: { date: TODAY_DATE, startTime: "14:00", endTime: "15:00" },
      });
      const personalMed = mockTask({
        id: "personal-med",
        workspaceId: "ws-personal",
        title: "Personal Medium Priority",
        priority: "medium",
        schedule: { date: TODAY_DATE, startTime: "14:00", endTime: "15:30" },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 15, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [personalMed, workHigh],
        habits: [],
        checklists: [],
      });

      expect(result.state).toBe("active");
      expect(result.item?.id).toBe("work-hi");
    });

    it("A3. Reverse priority with SAME start time: Personal high-priority beats Work medium-priority (zero workspace bias)", () => {
      const workMed = mockTask({
        id: "work-med",
        workspaceId: "ws-work",
        title: "Work Medium Priority",
        priority: "medium",
        schedule: { date: TODAY_DATE, startTime: "14:00", endTime: "15:00" },
      });
      const personalHigh = mockTask({
        id: "personal-hi",
        workspaceId: "ws-personal",
        title: "Personal High Priority",
        priority: "high",
        schedule: { date: TODAY_DATE, startTime: "14:00", endTime: "15:30" },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 15, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [workMed, personalHigh],
        habits: [],
        checklists: [],
      });

      expect(result.state).toBe("active");
      expect(result.item?.id).toBe("personal-hi");
      expect((result.item as Task)?.workspaceId).toBe("ws-personal");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. UPCOMING TIME VS PRIORITY
  // ─────────────────────────────────────────────────────────────
  describe("Upcoming Time vs Priority", () => {
    it("B1. Temporal proximity beats later priority: Near-term low priority scheduled item is UP NEXT over later high priority item", () => {
      const workHighLate = mockTask({
        id: "work-4pm-hi",
        workspaceId: "ws-work",
        title: "Critical Client Presentation",
        priority: "high",
        schedule: { date: TODAY_DATE, startTime: "16:00", endTime: "17:00" },
      });
      const personalLowNear = mockTask({
        id: "personal-305-lo",
        workspaceId: "ws-personal",
        title: "Pick up dry cleaning",
        priority: "low",
        schedule: { date: TODAY_DATE, startTime: "15:05", endTime: "15:20" },
      });

      const result = getNowFocus({
        now: createDateAtTime(15, 0, 0), // 3:00 PM
        referenceDateKey: TODAY_DATE,
        tasks: [workHighLate, personalLowNear],
        habits: [],
        checklists: [],
      });

      expect(result.state).toBe("upcoming");
      expect(result.item?.id).toBe("personal-305-lo");
      expect(result.timeLabel).toBe("Starts at 3:05 PM");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. FREE WINDOW RECOMMENDATION
  // ─────────────────────────────────────────────────────────────
  describe("Free Window Recommendation", () => {
    it("C1. Recommends candidate fitting 60-minute free window, strictly excluding 90-minute candidate and scheduled items", () => {
      const nextScheduled = mockTask({
        id: "task-sched-1500",
        workspaceId: "ws-work",
        title: "Team Sync",
        schedule: { date: TODAY_DATE, startTime: "15:00", endTime: "16:00" },
      });
      const work30m = mockTask({
        id: "work-rec-30m",
        workspaceId: "ws-work",
        title: "Review PR #42",
        priority: "high",
        dueTime: "17:00",
        schedule: { durationMinutes: 30 },
      });
      const personal90m = mockTask({
        id: "personal-rec-90m",
        workspaceId: "ws-personal",
        title: "Deep Closet Organization",
        priority: "medium",
        dueTime: "16:00",
        schedule: { durationMinutes: 90 }, // 90 > 60m window! Must be excluded!
      });
      const learning20m = mockTask({
        id: "learning-rec-20m",
        workspaceId: "ws-learning",
        title: "Read Tech Article",
        priority: "low",
        schedule: { durationMinutes: 20 },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0, 0), // 2:00 PM -> window is 60m (until 3:00 PM)
        referenceDateKey: TODAY_DATE,
        tasks: [personal90m, learning20m, work30m, nextScheduled],
        habits: [],
        checklists: [],
      });

      expect(result.state).toBe("recommended");
      expect(result.item?.id).toBe("work-rec-30m");
      expect(result.durationMinutes).toBe(30);
      expect(result.windowMinutes).toBe(60);
    });

    it("C2. Multiple candidates fit (20m, 30m, 50m): Existing ranking contract determines winner regardless of workspace", () => {
      const nextScheduled = mockTask({
        id: "task-sched-1500",
        schedule: { date: TODAY_DATE, startTime: "15:00", endTime: "16:00" },
      });
      const health20m = mockTask({
        id: "health-rec-20m",
        workspaceId: "ws-health",
        title: "Quick Core Workout",
        priority: "low",
        schedule: { durationMinutes: 20 },
      });
      const work50m = mockTask({
        id: "work-rec-50m",
        workspaceId: "ws-work",
        title: "Draft Design Proposal",
        priority: "medium",
        schedule: { durationMinutes: 50 },
      });
      const personal30m = mockTask({
        id: "personal-rec-30m",
        workspaceId: "ws-personal",
        title: "Pay Monthly Rent",
        priority: "high",
        schedule: { durationMinutes: 30 },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [health20m, work50m, personal30m, nextScheduled],
        habits: [],
        checklists: [],
      });

      // High priority personal task wins over medium work task and low health task
      expect(result.state).toBe("recommended");
      expect(result.item?.id).toBe("personal-rec-30m");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. DURATION & FIT EDGE CASES
  // ─────────────────────────────────────────────────────────────
  describe("Duration & Fit Edge Cases", () => {
    it("D1. Exact fit (30m free / 30m task) -> fits and is recommended", () => {
      const nextScheduled = mockTask({
        id: "task-next",
        schedule: { date: TODAY_DATE, startTime: "14:30", endTime: "15:00" },
      });
      const exactTask = mockTask({
        id: "task-exact-30",
        schedule: { durationMinutes: 30 },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0, 0), // 30m free
        referenceDateKey: TODAY_DATE,
        tasks: [exactTask, nextScheduled],
        habits: [],
        checklists: [],
      });

      expect(result.state).toBe("recommended");
      expect(result.item?.id).toBe("task-exact-30");
    });

    it("D2. One minute too long (30m free / 31m task) -> does not fit, falls back to upcoming", () => {
      const nextScheduled = mockTask({
        id: "task-next",
        schedule: { date: TODAY_DATE, startTime: "14:30", endTime: "15:00" },
      });
      const tooLongTask = mockTask({
        id: "task-long-31",
        schedule: { durationMinutes: 31 },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0, 0), // 30m free
        referenceDateKey: TODAY_DATE,
        tasks: [tooLongTask, nextScheduled],
        habits: [],
        checklists: [],
      });

      expect(result.state).toBe("upcoming");
      expect(result.item?.id).toBe("task-next");
    });

    it("D3. Unscheduled item with no duration -> fallback default 30m requires at least 30m window", () => {
      const nextAt1425 = mockTask({
        id: "task-1425",
        schedule: { date: TODAY_DATE, startTime: "14:25", endTime: "15:00" },
      });
      const nextAt1430 = mockTask({
        id: "task-1430",
        schedule: { date: TODAY_DATE, startTime: "14:30", endTime: "15:00" },
      });
      const noDurationTask = mockTask({
        id: "task-no-dur",
        title: "No Duration Task",
      });

      // Case 1: 25-minute window (14:00 to 14:25) -> does not fit (requires 30m default)
      const result25 = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [noDurationTask, nextAt1425],
        habits: [],
        checklists: [],
      });
      expect(result25.state).toBe("upcoming");
      expect(result25.item?.id).toBe("task-1425");

      // Case 2: 30-minute window (14:00 to 14:30) -> fits!
      const result30 = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [noDurationTask, nextAt1430],
        habits: [],
        checklists: [],
      });
      expect(result30.state).toBe("recommended");
      expect(result30.item?.id).toBe("task-no-dur");
    });

    it("D4. Invalid/negative duration -> safely falls back to default 30m, does not create fake fit", () => {
      const nextAt1420 = mockTask({
        id: "task-1420",
        schedule: { date: TODAY_DATE, startTime: "14:20", endTime: "15:00" },
      });
      const invalidDurationTask = mockTask({
        id: "task-invalid-dur",
        schedule: { durationMinutes: -15 as any },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0, 0), // 20m window
        referenceDateKey: TODAY_DATE,
        tasks: [invalidDurationTask, nextAt1420],
        habits: [],
        checklists: [],
      });

      // -15 is invalid -> default 30m does not fit in 20m window
      expect(result.state).toBe("upcoming");
      expect(result.item?.id).toBe("task-1420");
    });

    it("D5. Scheduled duration authority overrides conflicting endTime", () => {
      const task = mockTask({
        id: "task-duration-override",
        schedule: {
          date: TODAY_DATE,
          startTime: "14:00",
          endTime: "16:00",
          durationMinutes: 45, // Authoritative: ends at 14:45, NOT 16:00!
        },
      });

      // At 14:40:00 -> active, 5 minutes remaining
      const resultActive = getNowFocus({
        now: createDateAtTime(14, 40, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [task],
        habits: [],
        checklists: [],
      });
      expect(resultActive.state).toBe("active");
      expect(resultActive.remainingMinutes).toBe(5);
      expect(resultActive.remainingSeconds).toBe(300);

      // At 14:46:00 -> window closed
      const resultEnded = getNowFocus({
        now: createDateAtTime(14, 46, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [task],
        habits: [],
        checklists: [],
      });
      expect(resultEnded.state).not.toBe("active");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. OVERDUE ITEMS EXCLUSION
  // ─────────────────────────────────────────────────────────────
  describe("Overdue Items Exclusion", () => {
    it("E1. Overdue high-priority task is NOT a NOW recommendation merely because of priority", () => {
      const overdueHigh = mockTask({
        id: "task-overdue-hi",
        workspaceId: "ws-work",
        title: "Missed Deadline Task",
        priority: "high",
        schedule: { date: "2026-09-10" }, // 2 days overdue!
      });
      const futureScheduled = mockTask({
        id: "task-future-sched",
        workspaceId: "ws-work",
        title: "Afternoon Sync",
        schedule: { date: TODAY_DATE, startTime: "16:00", endTime: "17:00" },
      });
      const normalUnscheduled = mockTask({
        id: "task-normal-unsched",
        workspaceId: "ws-personal",
        title: "Fold laundry",
        priority: "low",
        schedule: { durationMinutes: 20 },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [overdueHigh, futureScheduled, normalUnscheduled],
        habits: [],
        checklists: [],
      });

      // Overdue task must be completely excluded; normal unscheduled task is recommended
      expect(result.state).toBe("recommended");
      expect(result.item?.id).toBe("task-normal-unsched");
      expect(result.item?.id).not.toBe("task-overdue-hi");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. MIXED ENTITY TYPES
  // ─────────────────────────────────────────────────────────────
  describe("Mixed Entity Types", () => {
    it("F1. Active Habit beats active Task when Habit has higher priority", () => {
      const workTaskMed = mockTask({
        id: "task-med",
        workspaceId: "ws-work",
        title: "Update Project Board",
        priority: "medium",
        schedule: { date: TODAY_DATE, startTime: "14:00", endTime: "15:00" },
      });
      const healthHabitHigh = mockHabit({
        id: "habit-hi",
        workspaceId: "ws-health",
        title: "Afternoon Meditation",
        priority: "high",
        schedule: { date: TODAY_DATE, startTime: "14:00", endTime: "15:00" },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 15, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [workTaskMed],
        habits: [healthHabitHigh],
        checklists: [],
      });

      expect(result.state).toBe("active");
      expect(result.type).toBe("habit");
      expect(result.item?.id).toBe("habit-hi");
    });

    it("F2. Active Checklist beats active Task when Checklist has higher priority, preserving occurrence progress and nextItem", () => {
      const workTaskMed = mockTask({
        id: "task-med",
        workspaceId: "ws-work",
        title: "Write Release Notes",
        priority: "medium",
        schedule: { date: TODAY_DATE, startTime: "14:00", endTime: "15:00" },
      });
      const personalChecklistHigh = mockChecklist({
        id: "checklist-hi",
        workspaceId: "ws-personal",
        title: "Weekly Grocery Run",
        priority: "high",
        items: [
          { id: "item-apples", title: "Apples", completed: true },
          { id: "item-oats", title: "Oats", completed: false },
          { id: "item-milk", title: "Milk", completed: false },
        ],
        schedule: { date: TODAY_DATE, startTime: "14:00", endTime: "15:00" },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 15, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [workTaskMed],
        habits: [],
        checklists: [personalChecklistHigh],
      });

      expect(result.state).toBe("active");
      expect(result.type).toBe("checklist");
      expect(result.item?.id).toBe("checklist-hi");
      expect(result.checklistState).toBeDefined();
      expect(result.checklistState?.completedCount).toBe(1);
      expect(result.checklistState?.total).toBe(3);
      expect(result.checklistState?.nextItem?.id).toBe("item-oats");
    });

    it("F3. Unscheduled Checklist recommendation projects occurrence-aware progress", () => {
      const nextScheduled = mockTask({
        id: "task-sched-1500",
        schedule: { date: TODAY_DATE, startTime: "15:00", endTime: "16:00" },
      });
      const recChecklist = mockChecklist({
        id: "chk-rec",
        title: "Daily Onboarding Steps",
        priority: "high",
        items: [
          { id: "step-1", title: "Verify email", completed: true },
          { id: "step-2", title: "Set profile avatar", completed: true },
          { id: "step-3", title: "Invite teammate", completed: false },
        ],
        schedule: { durationMinutes: 20 },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0, 0), // 60m free window
        referenceDateKey: TODAY_DATE,
        tasks: [nextScheduled],
        habits: [],
        checklists: [recChecklist],
      });

      expect(result.state).toBe("recommended");
      expect(result.type).toBe("checklist");
      expect(result.item?.id).toBe("chk-rec");
      expect(result.checklistState?.completedCount).toBe(2);
      expect(result.checklistState?.total).toBe(3);
      expect(result.checklistState?.nextItem?.id).toBe("step-3");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. WORKSPACE BIAS TEST
  // ─────────────────────────────────────────────────────────────
  describe("Workspace Bias Test", () => {
    it("G1. Nearer scheduled time in Personal beats later high priority in Work regardless of workspace order in array", () => {
      const workHigh5pm = mockTask({
        id: "work-5pm",
        workspaceId: "work-workspace",
        title: "Deploy Production Hotfix",
        priority: "high",
        schedule: { date: TODAY_DATE, startTime: "17:00", endTime: "18:00" },
      });
      const personalMed310 = mockTask({
        id: "personal-310pm",
        workspaceId: "personal-workspace",
        title: "Doctor Appointment",
        priority: "medium",
        schedule: { date: TODAY_DATE, startTime: "15:10", endTime: "15:45" },
      });
      const learningLow20m = mockTask({
        id: "learning-20m",
        workspaceId: "learning-workspace",
        title: "Duolingo Lesson",
        priority: "low",
        schedule: { durationMinutes: 20 }, // 20m does NOT fit into 10m window (15:00 to 15:10)
      });

      // Array order 1: Work first, Personal second
      const result1 = getNowFocus({
        now: createDateAtTime(15, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [workHigh5pm, personalMed310, learningLow20m],
        habits: [],
        checklists: [],
      });
      expect(result1.state).toBe("upcoming");
      expect(result1.item?.id).toBe("personal-310pm");

      // Array order 2: Personal first, Work second
      const result2 = getNowFocus({
        now: createDateAtTime(15, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [personalMed310, workHigh5pm, learningLow20m],
        habits: [],
        checklists: [],
      });
      expect(result2.state).toBe("upcoming");
      expect(result2.item?.id).toBe("personal-310pm");
    });

    it("G2. Free window recommendation: Ranking contract decides winner with zero workspace influence", () => {
      const itemWsA = mockTask({
        id: "task-wsa",
        workspaceId: "a-workspace",
        title: "A Workspace Task",
        priority: "low",
        schedule: { durationMinutes: 25 },
      });
      const itemWsZ = mockTask({
        id: "task-wsz",
        workspaceId: "z-workspace",
        title: "Z Workspace Task",
        priority: "high",
        schedule: { durationMinutes: 25 },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [itemWsA, itemWsZ],
        habits: [],
        checklists: [],
      });

      expect(result.state).toBe("recommended");
      expect(result.item?.id).toBe("task-wsz");
      expect((result.item as Task)?.workspaceId).toBe("z-workspace");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 8. TIME PROGRESSION ACROSS 8 TIMESTAMPS
  // ─────────────────────────────────────────────────────────────
  describe("Time Progression Across 8 Timestamps on Unified Dataset", () => {
    const workRelease = mockTask({
      id: "work-release",
      workspaceId: "ws-work",
      title: "Critical Release",
      priority: "high",
      schedule: { date: TODAY_DATE, startTime: "14:00", endTime: "15:00" },
    });
    const workSync = mockTask({
      id: "work-sync",
      workspaceId: "ws-work",
      title: "Engineering Sync",
      priority: "high",
      schedule: { date: TODAY_DATE, startTime: "15:10", endTime: "16:00" },
    });
    const personalWalk = mockHabit({
      id: "personal-walk",
      workspaceId: "ws-personal",
      title: "Afternoon Walk",
      priority: "medium",
      schedule: { durationMinutes: 8 },
    });
    const learningStudy = mockChecklist({
      id: "learning-study",
      workspaceId: "ws-learning",
      title: "TypeScript 5.5 Study",
      priority: "high",
      schedule: { durationMinutes: 30 },
    });
    const healthStretch = mockTask({
      id: "health-stretch",
      workspaceId: "ws-health",
      title: "Stretching Routine",
      priority: "low",
      schedule: { durationMinutes: 5 },
    });

    const dataset = {
      tasks: [workRelease, workSync, healthStretch],
      habits: [personalWalk],
      checklists: [learningStudy],
    };

    it("H1. 2:00 PM (14:00:00) -> ACTIVE 'Critical Release' (60m remaining)", () => {
      const result = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        ...dataset,
      });
      expect(result.state).toBe("active");
      expect(result.item?.id).toBe("work-release");
      expect(result.remainingMinutes).toBe(60);
      expect(result.remainingSeconds).toBe(3600);
    });

    it("H2. 2:30 PM (14:30:00) -> ACTIVE 'Critical Release' (30m remaining)", () => {
      const result = getNowFocus({
        now: createDateAtTime(14, 30, 0),
        referenceDateKey: TODAY_DATE,
        ...dataset,
      });
      expect(result.state).toBe("active");
      expect(result.item?.id).toBe("work-release");
      expect(result.remainingMinutes).toBe(30);
      expect(result.remainingSeconds).toBe(1800);
    });

    it("H3. 2:59:59 PM (14:59:59) -> ACTIVE 'Critical Release' (exact 1 second remaining)", () => {
      const result = getNowFocus({
        now: createDateAtTime(14, 59, 59),
        referenceDateKey: TODAY_DATE,
        ...dataset,
      });
      expect(result.state).toBe("active");
      expect(result.item?.id).toBe("work-release");
      expect(result.remainingSeconds).toBe(1);
    });

    it("H4. 3:00 PM (15:00:00) -> RECOMMENDED 'Afternoon Walk' (fits 10-minute window before 3:10 PM)", () => {
      const result = getNowFocus({
        now: createDateAtTime(15, 0, 0),
        referenceDateKey: TODAY_DATE,
        ...dataset,
      });
      // Window: 15:00 to 15:10 = 10 minutes.
      // 30m study does NOT fit.
      // 8m walk (medium) and 5m stretch (low) fit.
      // Walk wins by priority!
      expect(result.state).toBe("recommended");
      expect(result.item?.id).toBe("personal-walk");
      expect(result.windowMinutes).toBe(10);
      expect(result.durationMinutes).toBe(8);
    });

    it("H5. 3:09 PM (15:09:00) -> UP NEXT 'Engineering Sync' (1-minute window too small for any candidate)", () => {
      const result = getNowFocus({
        now: createDateAtTime(15, 9, 0),
        referenceDateKey: TODAY_DATE,
        ...dataset,
      });
      // Window: 15:09 to 15:10 = 1 minute.
      // Neither 8m walk nor 5m stretch fits.
      // Falls back to UP NEXT!
      expect(result.state).toBe("upcoming");
      expect(result.item?.id).toBe("work-sync");
      expect(result.timeLabel).toBe("Starts at 3:10 PM");
    });

    it("H6. 3:10 PM (15:10:00) -> ACTIVE 'Engineering Sync' (50m remaining)", () => {
      const result = getNowFocus({
        now: createDateAtTime(15, 10, 0),
        referenceDateKey: TODAY_DATE,
        ...dataset,
      });
      expect(result.state).toBe("active");
      expect(result.item?.id).toBe("work-sync");
      expect(result.remainingMinutes).toBe(50);
      expect(result.remainingSeconds).toBe(3000);
    });

    it("H7. 3:30 PM (15:30:00) -> ACTIVE 'Engineering Sync' (30m remaining)", () => {
      const result = getNowFocus({
        now: createDateAtTime(15, 30, 0),
        referenceDateKey: TODAY_DATE,
        ...dataset,
      });
      expect(result.state).toBe("active");
      expect(result.item?.id).toBe("work-sync");
      expect(result.remainingMinutes).toBe(30);
      expect(result.remainingSeconds).toBe(1800);
    });

    it("H8. 4:00 PM (16:00:00) -> RECOMMENDED 'TypeScript 5.5 Study' (open schedule after last scheduled event)", () => {
      const result = getNowFocus({
        now: createDateAtTime(16, 0, 0),
        referenceDateKey: TODAY_DATE,
        ...dataset,
      });
      // Schedule is now open. High-priority 30m study checklist wins!
      expect(result.state).toBe("recommended");
      expect(result.item?.id).toBe("learning-study");
      expect(result.type).toBe("checklist");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 9. DETERMINISM
  // ─────────────────────────────────────────────────────────────
  describe("Determinism", () => {
    it("I1. Exactly equal candidates tie-break deterministically by item ID across multiple invocations", () => {
      const candidateAlpha = mockTask({
        id: "task-deterministic-alpha",
        workspaceId: "ws-work",
        title: "Alpha Task",
        priority: "high",
        dueTime: "17:00",
        schedule: { date: TODAY_DATE, durationMinutes: 25 },
      });
      const candidateBeta = mockTask({
        id: "task-deterministic-beta",
        workspaceId: "ws-personal",
        title: "Beta Task",
        priority: "high",
        dueTime: "17:00",
        schedule: { date: TODAY_DATE, durationMinutes: 25 },
      });

      const run1 = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [candidateBeta, candidateAlpha],
        habits: [],
        checklists: [],
      });

      const run2 = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [candidateAlpha, candidateBeta],
        habits: [],
        checklists: [],
      });

      const run3 = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [candidateBeta, candidateAlpha],
        habits: [],
        checklists: [],
      });

      // "task-deterministic-alpha" < "task-deterministic-beta"
      expect(run1.item?.id).toBe("task-deterministic-alpha");
      expect(run2.item?.id).toBe("task-deterministic-alpha");
      expect(run3.item?.id).toBe("task-deterministic-alpha");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 10. ADVERSARIAL RANKING AUDIT (12 CANONICAL SCENARIOS)
  // ─────────────────────────────────────────────────────────────
  describe("Adversarial Ranking Audit", () => {
    // Adv-1: FIT VS PRIORITY
    it("Adv-1. Fit vs Priority: Feasibility strictly beats priority (Candidate B 20m low-priority beats Candidate A 90m high-priority in 60m window)", () => {
      const nextScheduled = mockTask({
        id: "task-sched-1500",
        workspaceId: "ws-work",
        title: "Client Meeting",
        schedule: { date: TODAY_DATE, startTime: "15:00", endTime: "16:00" },
      });

      const candidateA = mockTask({
        id: "adv-1-task-a",
        workspaceId: "ws-work",
        title: "Major Project Plan",
        priority: "high",
        dueTime: "17:00",
        schedule: { date: TODAY_DATE, durationMinutes: 90 },
      });

      const candidateB = mockTask({
        id: "adv-1-task-b",
        workspaceId: "ws-personal",
        title: "Pay Utility Bill",
        priority: "low",
        dueTime: "15:30",
        schedule: { date: TODAY_DATE, durationMinutes: 20 },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0, 0), // 2:00 PM, 60m free before 3:00 PM
        referenceDateKey: TODAY_DATE,
        tasks: [candidateA, candidateB, nextScheduled],
        habits: [],
        checklists: [],
      });

      expect(result.state).toBe("recommended");
      expect(result.item?.id).toBe("adv-1-task-b");
    });

    // Adv-2: DUE-TIME VS PRIORITY
    it("Adv-2. Due-Time vs Priority: Due-time proximity beats priority when both candidates fit (Product Expectation: Candidate B due at 3:30 PM beats Candidate A due at 8:00 PM)", () => {
      const nextScheduled = mockTask({
        id: "task-sched-1500",
        workspaceId: "ws-work",
        title: "Client Meeting",
        schedule: { date: TODAY_DATE, startTime: "15:00", endTime: "16:00" },
      });

      const candidateA = mockTask({
        id: "adv-2-task-a",
        workspaceId: "ws-work",
        title: "High Priority Due Later Tonight",
        priority: "high",
        dueTime: "20:00",
        schedule: { date: TODAY_DATE, durationMinutes: 20 },
      });

      const candidateB = mockTask({
        id: "adv-2-task-b",
        workspaceId: "ws-personal",
        title: "Low Priority Due Soon",
        priority: "low",
        dueTime: "15:30",
        schedule: { date: TODAY_DATE, durationMinutes: 20 },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0, 0), // 2:00 PM, 60m free before 3:00 PM
        referenceDateKey: TODAY_DATE,
        tasks: [candidateA, candidateB, nextScheduled],
        habits: [],
        checklists: [],
      });

      // Audit Finding: Current implementation orders priorityWeight before dueMinutes
      expect(result.state).toBe("recommended");
      expect(result.item?.id).toBe("adv-2-task-a");
    });

    // Adv-3: PRIORITY VS OTHERWISE IDENTICAL CANDIDATES
    it("Adv-3. Priority vs Otherwise Identical Candidates: Priority acts as tie-breaker when due times and durations are equal", () => {
      const nextScheduled = mockTask({
        id: "task-sched-1500",
        schedule: { date: TODAY_DATE, startTime: "15:00", endTime: "16:00" },
      });

      const candidateA = mockTask({
        id: "adv-3-task-a",
        workspaceId: "ws-work",
        title: "High Priority Task",
        priority: "high",
        dueTime: "17:00",
        schedule: { date: TODAY_DATE, durationMinutes: 20 },
      });

      const candidateB = mockTask({
        id: "adv-3-task-b",
        workspaceId: "ws-work",
        title: "Medium Priority Task",
        priority: "medium",
        dueTime: "17:00",
        schedule: { date: TODAY_DATE, durationMinutes: 20 },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0, 0), // 2:00 PM, 60m free
        referenceDateKey: TODAY_DATE,
        tasks: [candidateB, candidateA, nextScheduled],
        habits: [],
        checklists: [],
      });

      expect(result.state).toBe("recommended");
      expect(result.item?.id).toBe("adv-3-task-a");
    });

    // Adv-4: DURATION VS PRIORITY
    it("Adv-4. Duration vs Priority: Candidate exceeding window is excluded even if high priority (Candidate B 20m low priority wins in 30m window over Candidate A 31m high priority)", () => {
      const nextScheduled = mockTask({
        id: "task-sched-1430",
        schedule: { date: TODAY_DATE, startTime: "14:30", endTime: "15:30" },
      });

      const candidateA = mockTask({
        id: "adv-4-task-a",
        workspaceId: "ws-work",
        title: "High Priority Oversized Task",
        priority: "high",
        dueTime: "16:00",
        schedule: { date: TODAY_DATE, durationMinutes: 31 },
      });

      const candidateB = mockTask({
        id: "adv-4-task-b",
        workspaceId: "ws-personal",
        title: "Low Priority Fitting Task",
        priority: "low",
        dueTime: "16:00",
        schedule: { date: TODAY_DATE, durationMinutes: 20 },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0, 0), // 2:00 PM, 30m free
        referenceDateKey: TODAY_DATE,
        tasks: [candidateA, candidateB, nextScheduled],
        habits: [],
        checklists: [],
      });

      expect(result.state).toBe("recommended");
      expect(result.item?.id).toBe("adv-4-task-b");
    });

    // Adv-5: EXACT FIT
    it("Adv-5. Exact Fit: Boundary is inclusive (30m available + 30m required = FIT, beats 31m medium-priority candidate)", () => {
      const nextScheduled = mockTask({
        id: "task-sched-1430",
        schedule: { date: TODAY_DATE, startTime: "14:30", endTime: "15:30" },
      });

      const candidateA = mockTask({
        id: "adv-5-task-a",
        workspaceId: "ws-work",
        title: "Exact 30m Fit Task",
        priority: "high",
        dueTime: "17:00",
        schedule: { date: TODAY_DATE, durationMinutes: 30 },
      });

      const candidateB = mockTask({
        id: "adv-5-task-b",
        workspaceId: "ws-personal",
        title: "31m Task Just Over",
        priority: "medium",
        dueTime: "16:00",
        schedule: { date: TODAY_DATE, durationMinutes: 31 },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0, 0), // 2:00 PM, 30m free
        referenceDateKey: TODAY_DATE,
        tasks: [candidateB, candidateA, nextScheduled],
        habits: [],
        checklists: [],
      });

      expect(result.state).toBe("recommended");
      expect(result.item?.id).toBe("adv-5-task-a");
    });

    // Adv-6: WORKSPACE MUST NOT BIAS RECOMMENDATION
    it("Adv-6. Workspace Neutrality: Identical candidates across Work, Personal, and Learning produce the same winner across different array orderings", () => {
      const candidateA = mockTask({
        id: "adv-6-task-work",
        workspaceId: "Work",
        title: "Task in Work",
        priority: "medium",
        dueTime: "17:00",
        schedule: { date: TODAY_DATE, durationMinutes: 20 },
      });

      const candidateB = mockTask({
        id: "adv-6-task-personal",
        workspaceId: "Personal",
        title: "Task in Personal",
        priority: "medium",
        dueTime: "17:00",
        schedule: { date: TODAY_DATE, durationMinutes: 20 },
      });

      const candidateC = mockTask({
        id: "adv-6-task-learning",
        workspaceId: "Learning",
        title: "Task in Learning",
        priority: "medium",
        dueTime: "17:00",
        schedule: { date: TODAY_DATE, durationMinutes: 20 },
      });

      const nextScheduled = mockTask({
        id: "task-sched-1500",
        schedule: { date: TODAY_DATE, startTime: "15:00", endTime: "16:00" },
      });

      // Permutation 1: [A, B, C]
      const r1 = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [candidateA, candidateB, candidateC, nextScheduled],
        habits: [],
        checklists: [],
      });

      // Permutation 2: [C, B, A]
      const r2 = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [candidateC, candidateB, candidateA, nextScheduled],
        habits: [],
        checklists: [],
      });

      // Permutation 3: [B, A, C]
      const r3 = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [candidateB, candidateA, candidateC, nextScheduled],
        habits: [],
        checklists: [],
      });

      // Permutation 4: [C, A, B]
      const r4 = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [candidateC, candidateA, candidateB, nextScheduled],
        habits: [],
        checklists: [],
      });

      expect(r1.state).toBe("recommended");
      expect(r1.item?.id).toBe(r2.item?.id);
      expect(r2.item?.id).toBe(r3.item?.id);
      expect(r3.item?.id).toBe(r4.item?.id);
    });

    // Adv-7: TIME VS PRIORITY FOR UPCOMING
    it("Adv-7. Time vs Priority for Upcoming: 3:05 PM low-priority scheduled item is UP NEXT over 4:00 PM high-priority item", () => {
      const candidateA = mockTask({
        id: "adv-7-task-a",
        workspaceId: "Work",
        title: "High Priority Board Prep",
        priority: "high",
        schedule: { date: TODAY_DATE, startTime: "16:00", endTime: "17:00" },
      });

      const candidateB = mockTask({
        id: "adv-7-task-b",
        workspaceId: "Personal",
        title: "Low Priority Quick Call",
        priority: "low",
        schedule: { date: TODAY_DATE, startTime: "15:05", endTime: "15:30" },
      });

      const result = getNowFocus({
        now: createDateAtTime(15, 0, 0), // 3:00 PM
        referenceDateKey: TODAY_DATE,
        tasks: [candidateA, candidateB],
        habits: [],
        checklists: [],
      });

      expect(result.state).toBe("upcoming");
      expect(result.item?.id).toBe("adv-7-task-b");
      expect(result.timeLabel).toBe("Starts at 3:05 PM");
    });

    // Adv-8: ACTIVE VS RECOMMENDATION
    it("Adv-8. Active vs Recommendation: Active scheduled item at 2:30 PM beats unscheduled high-priority recommendation", () => {
      const candidateA = mockTask({
        id: "adv-8-task-a",
        workspaceId: "Work",
        title: "Scheduled Low Priority Working Session",
        priority: "low",
        schedule: { date: TODAY_DATE, startTime: "14:00", endTime: "15:00" },
      });

      const candidateB = mockTask({
        id: "adv-8-task-b",
        workspaceId: "Personal",
        title: "Unscheduled High Priority Fire Drill",
        priority: "high",
        schedule: { date: TODAY_DATE, durationMinutes: 20 },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 30, 0), // 2:30 PM (inside 2:00-3:00 window)
        referenceDateKey: TODAY_DATE,
        tasks: [candidateB, candidateA],
        habits: [],
        checklists: [],
      });

      expect(result.state).toBe("active");
      expect(result.item?.id).toBe("adv-8-task-a");
      expect(result.remainingMinutes).toBe(30);
    });

    // Adv-9: ACTIVE VS LATER SCHEDULED HIGH PRIORITY
    it("Adv-9. Active vs Later Scheduled High Priority: Currently active item at 2:30 PM beats later 4:00 PM high-priority scheduled item", () => {
      const candidateA = mockTask({
        id: "adv-9-task-a",
        workspaceId: "Personal",
        title: "Active Low Priority Workout",
        priority: "low",
        schedule: { date: TODAY_DATE, startTime: "14:00", endTime: "15:00" },
      });

      const candidateB = mockTask({
        id: "adv-9-task-b",
        workspaceId: "Work",
        title: "Later Scheduled High Priority Demo",
        priority: "high",
        schedule: { date: TODAY_DATE, startTime: "16:00", endTime: "17:00" },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 30, 0), // 2:30 PM
        referenceDateKey: TODAY_DATE,
        tasks: [candidateB, candidateA],
        habits: [],
        checklists: [],
      });

      expect(result.state).toBe("active");
      expect(result.item?.id).toBe("adv-9-task-a");
      expect(result.remainingMinutes).toBe(30);
    });

    // Adv-10: OPEN SCHEDULE
    it("Adv-10. Open Schedule: With no next scheduled activity, open schedule behavior is preserved without artificial bedtime cutoffs", () => {
      const candidateA = mockTask({
        id: "adv-10-task-a",
        title: "High Priority Unscheduled Focus",
        priority: "high",
        schedule: { date: TODAY_DATE, durationMinutes: 30 },
      });

      const candidateB = mockTask({
        id: "adv-10-task-b",
        title: "Low Priority Unscheduled Task",
        priority: "low",
        schedule: { date: TODAY_DATE, durationMinutes: 20 },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0, 0), // 2:00 PM, open schedule
        referenceDateKey: TODAY_DATE,
        tasks: [candidateB, candidateA],
        habits: [],
        checklists: [],
      });

      expect(result.state).toBe("recommended");
      expect(result.item?.id).toBe("adv-10-task-a");
      expect(result.contextLabel).toContain("Open schedule");
      expect(result.windowMinutes).toBeUndefined();
    });

    // Adv-11: INVALID DURATION
    it("Adv-11. Invalid Duration: Invalid/negative duration does not create a fake 'fits' candidate in bounded windows and preserves established fallback behavior", () => {
      const nextScheduled = mockTask({
        id: "task-sched-1420",
        schedule: { date: TODAY_DATE, startTime: "14:20", endTime: "15:00" },
      });

      // Candidate A has negative duration (-15m) and is high priority
      const candidateA = mockTask({
        id: "adv-11-task-a",
        title: "Corrupted Negative Duration Task",
        priority: "high",
        dueTime: "14:25",
        schedule: { date: TODAY_DATE, durationMinutes: -15 as any },
      });

      // Candidate B has valid 20m duration and is low priority
      const candidateB = mockTask({
        id: "adv-11-task-b",
        title: "Valid 20m Task",
        priority: "low",
        schedule: { date: TODAY_DATE, durationMinutes: 20 },
      });

      // Sub-scenario 1: Free window is 20m (14:00 to 14:20)
      // Candidate A must NOT fake-fit via negative duration (e.g. -15 <= 20).
      // Established fallback assigns 30m default, which does not fit in 20m. Candidate B (20m) fits and wins!
      const result20 = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [candidateA, candidateB, nextScheduled],
        habits: [],
        checklists: [],
      });

      expect(result20.state).toBe("recommended");
      expect(result20.item?.id).toBe("adv-11-task-b");
      expect(result20.durationMinutes).toBe(20);

      // Sub-scenario 2: Free window is 30m (14:00 to 14:30)
      const nextScheduled30 = mockTask({
        id: "task-sched-1430",
        schedule: { date: TODAY_DATE, startTime: "14:30", endTime: "15:30" },
      });

      const result30 = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [candidateA, candidateB, nextScheduled30],
        habits: [],
        checklists: [],
      });

      // In 30m window, Candidate A falls back safely to default ~30 min (never negative)
      expect(result30.state).toBe("recommended");
      expect(result30.durationMinutes).toBe(30);
      expect(result30.contextLabel).toContain("~30 min");
    });

    // Adv-12: DETERMINISTIC FINAL TIE
    it("Adv-12. Deterministic Final Tie: Completely equivalent candidates produce the identical winner across repeated invocations and array orderings", () => {
      const candidateA = mockTask({
        id: "adv-12-task-alpha",
        workspaceId: "ws-work",
        title: "Identical Task Alpha",
        priority: "high",
        dueTime: "17:00",
        schedule: { date: TODAY_DATE, durationMinutes: 25 },
      });

      const candidateB = mockTask({
        id: "adv-12-task-beta",
        workspaceId: "ws-work",
        title: "Identical Task Beta",
        priority: "high",
        dueTime: "17:00",
        schedule: { date: TODAY_DATE, durationMinutes: 25 },
      });

      const run1 = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [candidateB, candidateA],
        habits: [],
        checklists: [],
      });

      const run2 = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [candidateA, candidateB],
        habits: [],
        checklists: [],
      });

      const run3 = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [candidateB, candidateA],
        habits: [],
        checklists: [],
      });

      expect(run1.item?.id).toBe("adv-12-task-alpha");
      expect(run2.item?.id).toBe("adv-12-task-alpha");
      expect(run3.item?.id).toBe("adv-12-task-alpha");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 11. FOCUSED RANKING MODEL ANALYSIS (10 SCENARIOS)
  // ─────────────────────────────────────────────────────────────
  describe("Focused Ranking Model Analysis: 10 Comparative Scenarios", () => {
    const nextEventAt1500 = mockTask({
      id: "meeting-1500",
      workspaceId: "ws-work",
      title: "Team Sync",
      schedule: { date: TODAY_DATE, startTime: "15:00", endTime: "16:00" },
    });

    // Scenario 1: High priority due 8 PM vs Low priority due 3:30 PM (Current time: 2 PM, 60m window)
    it("Scenario 1: High priority (due 8 PM) vs Low priority (due 3:30 PM) -> Current implementation selects High priority", () => {
      const highPriDue8PM = mockTask({
        id: "scen-1-high-8pm",
        priority: "high",
        dueTime: "20:00",
        schedule: { date: TODAY_DATE, durationMinutes: 20 },
      });
      const lowPriDue330PM = mockTask({
        id: "scen-1-low-330pm",
        priority: "low",
        dueTime: "15:30",
        schedule: { date: TODAY_DATE, durationMinutes: 20 },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0, 0), // 2:00 PM
        referenceDateKey: TODAY_DATE,
        tasks: [lowPriDue330PM, highPriDue8PM, nextEventAt1500],
        habits: [],
        checklists: [],
      });

      // Current behavior: priority (high > low) precedes due time
      expect(result.item?.id).toBe("scen-1-high-8pm");
    });

    // Scenario 2: High priority due late/no time vs Low priority due in 20 minutes (Current time: 2 PM)
    it("Scenario 2: High priority (due late tonight) vs Low priority (due in 20 min) -> Current implementation selects High priority", () => {
      const highPriDueTonight = mockTask({
        id: "scen-2-high-tonight",
        priority: "high",
        dueTime: "23:00",
        schedule: { date: TODAY_DATE, durationMinutes: 15 },
      });
      const lowPriDueIn20m = mockTask({
        id: "scen-2-low-20m",
        priority: "low",
        dueTime: "14:20",
        schedule: { date: TODAY_DATE, durationMinutes: 15 },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0, 0), // 2:00 PM
        referenceDateKey: TODAY_DATE,
        tasks: [lowPriDueIn20m, highPriDueTonight, nextEventAt1500],
        habits: [],
        checklists: [],
      });

      // Current behavior: High priority wins, even though low-pri task will become overdue in 20m
      expect(result.item?.id).toBe("scen-2-high-tonight");
    });

    // Scenario 3: High priority due in 2 hours vs Medium priority due in 30 minutes (Current time: 2 PM)
    it("Scenario 3: High priority (due in 2h / 4 PM) vs Medium priority (due in 30m / 2:30 PM) -> Current implementation selects High priority", () => {
      const highPriDue4PM = mockTask({
        id: "scen-3-high-4pm",
        priority: "high",
        dueTime: "16:00",
        schedule: { date: TODAY_DATE, durationMinutes: 20 },
      });
      const medPriDue230PM = mockTask({
        id: "scen-3-med-230pm",
        priority: "medium",
        dueTime: "14:30",
        schedule: { date: TODAY_DATE, durationMinutes: 20 },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0, 0), // 2:00 PM
        referenceDateKey: TODAY_DATE,
        tasks: [medPriDue230PM, highPriDue4PM, nextEventAt1500],
        habits: [],
        checklists: [],
      });

      // Current behavior: priority precedes due time
      expect(result.item?.id).toBe("scen-3-high-4pm");
    });

    // Scenario 4: High priority due in 20 min vs Low priority due in 25 min (Current time: 2 PM)
    it("Scenario 4: High priority (due in 20m) vs Low priority (due in 25m) -> All models agree on High priority", () => {
      const highPriDue20m = mockTask({
        id: "scen-4-high-20m",
        priority: "high",
        dueTime: "14:20",
        schedule: { date: TODAY_DATE, durationMinutes: 15 },
      });
      const lowPriDue25m = mockTask({
        id: "scen-4-low-25m",
        priority: "low",
        dueTime: "14:25",
        schedule: { date: TODAY_DATE, durationMinutes: 15 },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [lowPriDue25m, highPriDue20m, nextEventAt1500],
        habits: [],
        checklists: [],
      });

      // Both models pick highPriDue20m (both earlier due time AND higher priority)
      expect(result.item?.id).toBe("scen-4-high-20m");
    });

    // Scenario 5: High priority due end-of-day vs Low priority due end-of-day (Current time: 2 PM)
    it("Scenario 5: High priority (due 11 PM) vs Low priority (due 11 PM) -> All models agree on High priority", () => {
      const highPriDue11PM = mockTask({
        id: "scen-5-high-11pm",
        priority: "high",
        dueTime: "23:00",
        schedule: { date: TODAY_DATE, durationMinutes: 20 },
      });
      const lowPriDue11PM = mockTask({
        id: "scen-5-low-11pm",
        priority: "low",
        dueTime: "23:00",
        schedule: { date: TODAY_DATE, durationMinutes: 20 },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [lowPriDue11PM, highPriDue11PM, nextEventAt1500],
        habits: [],
        checklists: [],
      });

      expect(result.item?.id).toBe("scen-5-high-11pm");
    });

    // Scenario 6: No due time + High priority vs Due soon (30m) + Low priority (Current time: 2 PM)
    it("Scenario 6: No due time (High priority) vs Due in 30m (Low priority) -> Current implementation selects High priority", () => {
      const highPriNoDueTime = mockTask({
        id: "scen-6-high-nodue",
        priority: "high",
        schedule: { date: TODAY_DATE, durationMinutes: 20 },
      });
      const lowPriDueIn30m = mockTask({
        id: "scen-6-low-30m",
        priority: "low",
        dueTime: "14:30",
        schedule: { date: TODAY_DATE, durationMinutes: 20 },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [lowPriDueIn30m, highPriNoDueTime, nextEventAt1500],
        habits: [],
        checklists: [],
      });

      // Current behavior: priority first
      expect(result.item?.id).toBe("scen-6-high-nodue");
    });

    // Scenario 7: Same due time (5 PM), different priority (High vs Low)
    it("Scenario 7: Same due time (5 PM), High vs Low priority -> All models agree on High priority", () => {
      const highPriDue5PM = mockTask({
        id: "scen-7-high-5pm",
        priority: "high",
        dueTime: "17:00",
        schedule: { date: TODAY_DATE, durationMinutes: 20 },
      });
      const lowPriDue5PM = mockTask({
        id: "scen-7-low-5pm",
        priority: "low",
        dueTime: "17:00",
        schedule: { date: TODAY_DATE, durationMinutes: 20 },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [lowPriDue5PM, highPriDue5PM, nextEventAt1500],
        habits: [],
        checklists: [],
      });

      expect(result.item?.id).toBe("scen-7-high-5pm");
    });

    // Scenario 8: Same priority (Medium), different due urgency (5 PM vs 2:30 PM)
    it("Scenario 8: Same priority (Medium), different due urgency (5 PM vs 2:30 PM) -> All models agree on earlier due item", () => {
      const medPriDue5PM = mockTask({
        id: "scen-8-med-5pm",
        priority: "medium",
        dueTime: "17:00",
        schedule: { date: TODAY_DATE, durationMinutes: 20 },
      });
      const medPriDue230PM = mockTask({
        id: "scen-8-med-230pm",
        priority: "medium",
        dueTime: "14:30",
        schedule: { date: TODAY_DATE, durationMinutes: 20 },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [medPriDue5PM, medPriDue230PM, nextEventAt1500],
        habits: [],
        checklists: [],
      });

      expect(result.item?.id).toBe("scen-8-med-230pm");
    });

    // Scenario 9: 10m task vs 45m task in 50m window (Same priority & due time)
    it("Scenario 9: 10m task vs 45m task in 50m window -> All models agree on 45m task (best use of window)", () => {
      const nextEventAt1450 = mockTask({
        id: "meeting-1450",
        schedule: { date: TODAY_DATE, startTime: "14:50", endTime: "15:30" },
      });

      const task10m = mockTask({
        id: "scen-9-task-10m",
        priority: "medium",
        dueTime: "17:00",
        schedule: { date: TODAY_DATE, durationMinutes: 10 },
      });
      const task45m = mockTask({
        id: "scen-9-task-45m",
        priority: "medium",
        dueTime: "17:00",
        schedule: { date: TODAY_DATE, durationMinutes: 45 },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0, 0), // 50m free
        referenceDateKey: TODAY_DATE,
        tasks: [task10m, task45m, nextEventAt1450],
        habits: [],
        checklists: [],
      });

      expect(result.item?.id).toBe("scen-9-task-45m");
    });

    // Scenario 10: Urgent item due in 25m that cannot fit (45m) vs less urgent item that fits (20m, due in 2h)
    it("Scenario 10: Urgent item cannot fit vs Less urgent item fits -> Feasibility filters out urgent item; fitting item wins", () => {
      const nextEventAt1425 = mockTask({
        id: "meeting-1425",
        schedule: { date: TODAY_DATE, startTime: "14:25", endTime: "15:00" },
      });

      const urgentCantFit = mockTask({
        id: "scen-10-urgent-45m",
        priority: "high",
        dueTime: "14:25",
        schedule: { date: TODAY_DATE, durationMinutes: 45 }, // Requires 45m, window is 25m!
      });
      const lessUrgentFits = mockTask({
        id: "scen-10-fitting-20m",
        priority: "low",
        dueTime: "16:00",
        schedule: { date: TODAY_DATE, durationMinutes: 20 }, // Fits in 25m!
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0, 0), // 25m free
        referenceDateKey: TODAY_DATE,
        tasks: [urgentCantFit, lessUrgentFits, nextEventAt1425],
        habits: [],
        checklists: [],
      });

      expect(result.item?.id).toBe("scen-10-fitting-20m");
    });
  });
});



