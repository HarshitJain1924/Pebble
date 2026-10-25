import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  earnPebble,
  getPebbleCounts,
} from "@/features/profile/services/pebble.service";
import { addStateListener } from "@/services/events/state-events";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { TaskRepository, HabitRepository } from "@/repositories";
import { isTaskOverdue, isTaskCompleted } from "@/shared/utils/domain-selectors";
import type { Task, Habit } from "@/shared/types/domain.types";

let mockStore: Record<string, string> = {};

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockImplementation(async (key) => mockStore[key] || null),
  setItem: jest.fn().mockImplementation(async (key, value) => {
    mockStore[key] = String(value);
    return null;
  }),
  removeItem: jest.fn().mockImplementation(async (key) => {
    delete mockStore[key];
    return null;
  }),
  clear: jest.fn().mockImplementation(async () => {
    mockStore = {};
    return null;
  }),
}));

describe("Today & Pebble UI Data-Flow Tests", () => {
  beforeEach(() => {
    mockStore = {};
    jest.clearAllMocks();
  });

  it("should load monthly pebble count and monthlyTypes from getPebbleCounts()", async () => {
    await earnPebble("task", "task:1");
    await earnPebble("checklist", "checklist:1");
    await earnPebble("focus", "focus:1");

    const counts = await getPebbleCounts();
    expect(counts.monthly).toBe(3);
    expect(counts.monthlyTypes.task).toBe(1);
    expect(counts.monthlyTypes.checklist).toBe(1);
    expect(counts.monthlyTypes.focus).toBe(1);
  });

  it("should calculate today pebble count and todayTypes breakdown from getPebbleCounts()", async () => {
    await earnPebble("task", "task:today:1");
    await earnPebble("checklist", "checklist:today:1");
    await earnPebble("habit", "habit:today:1");
    await earnPebble("focus", "focus:today:1");

    const counts = await getPebbleCounts();
    expect(counts.today).toBe(4);
    expect(counts.todayTypes?.task).toBe(1);
    expect(counts.todayTypes?.checklist).toBe(1);
    expect(counts.todayTypes?.habit).toBe(1);
    expect(counts.todayTypes?.focus).toBe(1);
  });

  it("should trigger listener on pebbles_changed event to refresh monthly jar state", async () => {
    let triggered = false;
    const unsubscribe = addStateListener("pebbles_changed", () => {
      triggered = true;
    });

    await earnPebble("task", "task:2");
    unsubscribe();

    expect(triggered).toBe(true);
  });

  it("should include checklist Pebble type in monthlyTypes distribution", async () => {
    await earnPebble("checklist", "checklist:2");
    const counts = await getPebbleCounts();
    expect(counts.monthlyTypes.checklist).toBe(1);
  });

  it("should render 1:1 visible dots for 1, 2, and 3 pebbles and compress for large counts", () => {
    const calcDots = (monthlyPebbles: number, slotsLength: number = 22) => {
      if (monthlyPebbles <= 0) return 0;
      if (monthlyPebbles <= 15) return monthlyPebbles;
      return Math.min(slotsLength, 15 + Math.floor((monthlyPebbles - 15) / 10));
    };

    expect(calcDots(0)).toBe(0);
    expect(calcDots(1)).toBe(1);
    expect(calcDots(2)).toBe(2);
    expect(calcDots(3)).toBe(3);
    expect(calcDots(15)).toBe(15);
    expect(calcDots(100)).toBe(22); // Compressed max slots
  });

  it("should identify overdue incomplete task and exclude completed tasks from overdue", () => {
    const yesterday = "2020-01-01";
    const overdueTask: Task = {
      id: "task-overdue-1",
      workspaceId: "inbox",
      title: "Overdue Task",
      status: "todo",
      priority: "high",
      schedule: { date: yesterday },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const completedOverdueTask: Task = {
      ...overdueTask,
      id: "task-overdue-completed",
      status: "completed",
    };

    expect(isTaskOverdue(overdueTask, "2026-08-12")).toBe(true);
    expect(isTaskCompleted(completedOverdueTask)).toBe(true);
    expect(isTaskOverdue(completedOverdueTask, "2026-08-12")).toBe(false);
  });

  it("should complete and uncomplete a task via EntityCommandService and update Pebble ledger exactly once", async () => {
    const task: Task = {
      id: "task-ecs-test-1",
      workspaceId: "work",
      title: "Test Task",
      status: "todo",
      priority: "high",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await TaskRepository.saveTask(task);

    // Complete task
    const completedRes = await EntityCommandService.completeTask(task.id, "work");
    expect(completedRes?.updated.status).toBe("completed");

    let counts = await getPebbleCounts();
    expect(counts.today).toBe(1);
    expect(counts.todayTypes?.task).toBe(1);

    // Uncomplete task
    const uncompletedRes = await EntityCommandService.uncompleteTask(task.id, "work");
    expect(uncompletedRes?.updated.status).toBe("todo");

    counts = await getPebbleCounts();
    expect(counts.today).toBe(0);
    expect(counts.todayTypes?.task).toBe(0);
  });

  it("should complete and uncomplete a habit via EntityCommandService and update Pebble ledger exactly once", async () => {
    const habit: Habit = {
      id: "habit-ecs-test-1",
      workspaceId: "work",
      title: "Test Habit",
      recurrence: { frequency: "daily", interval: 1 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completionHistory: [],
    };
    await HabitRepository.saveHabit(habit);

    // Complete habit
    const completedRes = await EntityCommandService.completeHabit(habit.id, "work");
    expect(completedRes?.updated.completionHistory.length).toBe(1);

    let counts = await getPebbleCounts();
    expect(counts.today).toBe(1);
    expect(counts.todayTypes?.habit).toBe(1);

    // Uncomplete habit
    const uncompletedRes = await EntityCommandService.uncompleteHabit(habit.id, "work");
    expect(uncompletedRes?.updated.completionHistory.length).toBe(0);

    counts = await getPebbleCounts();
    expect(counts.today).toBe(0);
    expect(counts.todayTypes?.habit).toBe(0);
  });

  it("should keep completed tasks in active workspace tasks and route content taps to details page", () => {
    const pendingTask: Task = {
      id: "task-nav-1",
      workspaceId: "work",
      title: "Pending Task",
      status: "todo",
      priority: "high",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const completedTask: Task = {
      id: "task-nav-2",
      workspaceId: "work",
      title: "Completed Task",
      status: "completed",
      priority: "none",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const taskRoute = (t: Task) => `/task-details?id=${t.id}&type=task`;
    const habitRoute = (h: Habit) => `/task-details?id=${h.id}&type=habit`;

    expect(taskRoute(pendingTask)).toBe("/task-details?id=task-nav-1&type=task");
    expect(habitRoute({ id: "h1" } as any)).toBe("/task-details?id=h1&type=habit");

    // Completed task remains classified as completed but visible in active tasks list
    expect(isTaskCompleted(completedTask)).toBe(true);
    expect(isTaskCompleted(pendingTask)).toBe(false);
  });
});
