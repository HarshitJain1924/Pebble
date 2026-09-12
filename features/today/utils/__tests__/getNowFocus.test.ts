import { getNowFocus } from "../getNowFocus";
import type { Task, Habit, Checklist } from "@/shared/types/domain.types";

const TODAY_DATE = "2026-09-12";

function createDateAtTime(hours: number, minutes: number): Date {
  // 2026-09-12Thh:mm:00
  const d = new Date(2026, 8, 12, hours, minutes, 0, 0);
  return d;
}

function mockTask(overrides: Partial<Task>): Task {
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
  // 1. Active scheduled Task becomes ACTIVE NOW
  it("1. active scheduled Task becomes ACTIVE NOW", () => {
    const task = mockTask({
      id: "task-active",
      title: "Finish portfolio",
      priority: "high",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 15), // 2:15 PM
      referenceDateKey: TODAY_DATE,
      tasks: [task],
      habits: [],
      checklists: [],
    });

    expect(result.state).toBe("active");
    expect(result.type).toBe("task");
    expect(result.item?.id).toBe("task-active");
    expect(result.timeLabel).toBe("2:00 PM – 3:00 PM");
  });

  // 2. Active scheduled Habit becomes ACTIVE NOW
  it("2. active scheduled Habit becomes ACTIVE NOW", () => {
    const habit = mockHabit({
      id: "habit-active",
      title: "Workout",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "14:45",
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 20), // 2:20 PM
      referenceDateKey: TODAY_DATE,
      tasks: [],
      habits: [habit],
      checklists: [],
    });

    expect(result.state).toBe("active");
    expect(result.type).toBe("habit");
    expect(result.item?.id).toBe("habit-active");
    expect(result.timeLabel).toBe("2:00 PM – 2:45 PM");
  });

  // 3. Active scheduled Checklist becomes ACTIVE NOW
  it("3. active scheduled Checklist becomes ACTIVE NOW", () => {
    const checklist = mockChecklist({
      id: "checklist-active",
      title: "Prepare presentation",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 10), // 2:10 PM
      referenceDateKey: TODAY_DATE,
      tasks: [],
      habits: [],
      checklists: [checklist],
    });

    expect(result.state).toBe("active");
    expect(result.type).toBe("checklist");
    expect(result.item?.id).toBe("checklist-active");
  });

  // 4. At 2:00 PM, a 2:30 PM scheduled activity is respected and a later 4 PM high-priority task is NOT incorrectly selected as NOW
  it("4. at 2:00 PM, a 2:30 PM scheduled activity is respected and later 4 PM high-priority task is NOT selected as NOW", () => {
    const scheduledTask = mockTask({
      id: "task-230",
      title: "Study JavaScript",
      priority: "medium",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:30",
        endTime: "15:30",
      },
    });

    const laterTask = mockTask({
      id: "task-4pm",
      title: "Finish report",
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
      tasks: [scheduledTask, laterTask],
      habits: [],
      checklists: [],
    });

    // The available window before 2:30 PM is 30 mins.
    // 4 PM task is scheduled later and must NOT be shown as NOW.
    // Since there is no unscheduled task fitting the window, it shows the 2:30 PM task as upcoming ("UP NEXT")!
    expect(result.state).toBe("upcoming");
    expect(result.item?.id).toBe("task-230");
    expect(result.item?.id).not.toBe("task-4pm");
    expect(result.timeLabel).toBe("Starts at 2:30 PM");
  });

  // 5. A free window before the next scheduled activity allows an unscheduled Task to be recommended if it fits
  it("5. free window before next scheduled activity allows an unscheduled Task to be recommended if it fits", () => {
    const nextScheduled = mockTask({
      id: "task-scheduled",
      title: "Team Sync",
      schedule: {
        date: TODAY_DATE,
        startTime: "16:00", // 4:00 PM -> 2h free window from 2:00 PM
        endTime: "17:00",
      },
    });

    const unscheduledTask = mockTask({
      id: "task-unscheduled",
      title: "Study JavaScript",
      priority: "high",
      schedule: {
        durationMinutes: 45,
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 0), // 2:00 PM
      referenceDateKey: TODAY_DATE,
      tasks: [nextScheduled, unscheduledTask],
      habits: [],
      checklists: [],
    });

    expect(result.state).toBe("recommended");
    expect(result.type).toBe("task");
    expect(result.item?.id).toBe("task-unscheduled");
    expect(result.windowMinutes).toBe(120); // 2 hours
    expect(result.durationMinutes).toBe(45);
  });

  // 6. An unscheduled Habit can be recommended when appropriate
  it("6. an unscheduled Habit can be recommended when appropriate", () => {
    const unscheduledHabit = mockHabit({
      id: "habit-meditate",
      title: "Mindfulness Meditation",
      schedule: {
        durationMinutes: 15,
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

  // 7. An unscheduled Checklist can be recommended when appropriate
  it("7. an unscheduled Checklist can be recommended when appropriate", () => {
    const unscheduledChecklist = mockChecklist({
      id: "checklist-weekly",
      title: "Weekly Review",
      schedule: {
        durationMinutes: 30,
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
    expect(result.item?.id).toBe("checklist-weekly");
  });

  // 8. A candidate that does not fit the available window is not recommended when duration information is available
  it("8. candidate that does not fit the available window is not recommended when duration information is available", () => {
    const nextScheduled = mockTask({
      id: "task-upcoming",
      title: "Quick Meeting",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:30", // Available window is 30 mins from 2:00 PM
        endTime: "15:00",
      },
    });

    const longTask = mockTask({
      id: "task-long",
      title: "Deep Architecture Refactor",
      priority: "high",
      schedule: {
        durationMinutes: 60, // 60 mins > 30 mins window!
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 0), // 2:00 PM
      referenceDateKey: TODAY_DATE,
      tasks: [nextScheduled, longTask],
      habits: [],
      checklists: [],
    });

    // longTask does NOT fit into 30m window, so nextScheduled is shown as upcoming ("UP NEXT")
    expect(result.state).toBe("upcoming");
    expect(result.item?.id).toBe("task-upcoming");
  });

  // 9. A high-priority item due soon outranks a lower-priority item due later when both fit
  it("9. a high-priority item due soon outranks a lower-priority item due later when both fit", () => {
    const highPriorityTask = mockTask({
      id: "task-high-priority",
      title: "Finish quarterly report",
      priority: "high",
      schedule: {
        durationMinutes: 45,
      },
      reminder: {
        enabled: true,
        triggerAt: createDateAtTime(16, 0).getTime(), // Due 4:00 PM
      },
    });

    const lowPriorityTask = mockTask({
      id: "task-low-priority",
      title: "Read design book",
      priority: "low",
      schedule: {
        durationMinutes: 30,
      },
      reminder: {
        enabled: true,
        triggerAt: createDateAtTime(20, 0).getTime(), // Due 8:00 PM
      },
    });

    const result = getNowFocus({
      now: createDateAtTime(14, 0), // 2:00 PM, free until 10 PM
      referenceDateKey: TODAY_DATE,
      tasks: [lowPriorityTask, highPriorityTask],
      habits: [],
      checklists: [],
    });

    expect(result.state).toBe("recommended");
    expect(result.item?.id).toBe("task-high-priority");
  });

  // 10. Completed items cannot become NOW
  it("10. completed items cannot become NOW", () => {
    const completedTask = mockTask({
      id: "task-completed",
      title: "Already done task",
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
      title: "Already done habit",
      completionHistory: [{ date: TODAY_DATE, completedAt: Date.now() }],
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
      },
    });

    const completedChecklist = mockChecklist({
      id: "checklist-completed",
      title: "Already done checklist",
      items: [
        { id: "item-1", title: "Item 1", completed: true },
        { id: "item-2", title: "Item 2", completed: true },
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
  });

  // 11. Overdue items do NOT automatically become NOW
  it("11. overdue items do NOT automatically become NOW", () => {
    // Task scheduled yesterday is overdue
    const overdueTask = mockTask({
      id: "task-overdue",
      title: "Old task from yesterday",
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

    // OVERDUE != NOW
    expect(result.state).toBe("empty");
    expect(result.item).toBeUndefined();
  });

  // 12. No active/upcoming/suitable candidate produces the empty state
  it("12. no active/upcoming/suitable candidate produces the empty state", () => {
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

  // 13. Multiple active activities produce deterministic selection
  it("13. multiple active activities produce deterministic selection", () => {
    const taskHighPriority = mockTask({
      id: "task-active-high",
      title: "Critical Server Fix",
      priority: "high",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
      },
    });

    const taskMediumPriority = mockTask({
      id: "task-active-med",
      title: "Write documentation",
      priority: "medium",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
      },
    });

    const habitActive = mockHabit({
      id: "habit-active",
      title: "Drink Water",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
      },
    });

    // Run with different input orders to verify determinism
    const result1 = getNowFocus({
      now: createDateAtTime(14, 15),
      referenceDateKey: TODAY_DATE,
      tasks: [taskMediumPriority, taskHighPriority],
      habits: [habitActive],
      checklists: [],
    });

    const result2 = getNowFocus({
      now: createDateAtTime(14, 15),
      referenceDateKey: TODAY_DATE,
      tasks: [taskHighPriority, taskMediumPriority],
      habits: [habitActive],
      checklists: [],
    });

    expect(result1.state).toBe("active");
    expect(result2.state).toBe("active");
    expect(result1.item?.id).toBe("task-active-high");
    expect(result2.item?.id).toBe("task-active-high");
  });

  // 14. Starting/selection logic does not mutate underlying schedule data
  it("14. selection logic does not mutate underlying schedule data", () => {
    const originalTask: Task = mockTask({
      id: "task-immutable",
      title: "Immutable Task",
      priority: "high",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:00",
        endTime: "15:00",
        durationMinutes: 60,
      },
    });

    const taskSnapshot = JSON.stringify(originalTask);

    const result = getNowFocus({
      now: createDateAtTime(14, 15),
      referenceDateKey: TODAY_DATE,
      tasks: [originalTask],
      habits: [],
      checklists: [],
    });

    expect(result.state).toBe("active");
    // Verify object identity and deep value preservation
    expect(JSON.stringify(originalTask)).toBe(taskSnapshot);
  });

  // 15. Transition: at 2:15, upcoming is not active; at 2:31, it becomes active
  it("15. time progression: before window activity is not active; after window starts it becomes active", () => {
    const scheduledActivity = mockTask({
      id: "task-230-progression",
      title: "Sync with Team",
      priority: "high",
      schedule: {
        date: TODAY_DATE,
        startTime: "14:30",
        endTime: "15:00",
      },
    });

    // At 2:15 PM -> Not active yet, it's upcoming
    const beforeResult = getNowFocus({
      now: createDateAtTime(14, 15),
      referenceDateKey: TODAY_DATE,
      tasks: [scheduledActivity],
      habits: [],
      checklists: [],
    });
    expect(beforeResult.state).toBe("upcoming");
    expect(beforeResult.item?.id).toBe("task-230-progression");

    // At 2:31 PM -> Window has begun, it becomes ACTIVE NOW
    const afterResult = getNowFocus({
      now: createDateAtTime(14, 31),
      referenceDateKey: TODAY_DATE,
      tasks: [scheduledActivity],
      habits: [],
      checklists: [],
    });
    expect(afterResult.state).toBe("active");
    expect(afterResult.item?.id).toBe("task-230-progression");
  });
});
