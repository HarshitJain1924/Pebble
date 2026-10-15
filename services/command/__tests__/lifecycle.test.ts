import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
import { EntityCommandService } from "../command/EntityCommandService";
import { TaskRepository } from "../../repositories/TaskRepository";
import { HabitRepository } from "../../repositories/HabitRepository";
import { WorkspaceRepository } from "../../repositories/WorkspaceRepository";

jest.mock("@/shared/utils/id", () => ({
  generateId: () => "mock-id",
}));

jest.mock("../scheduling/reminders.service", () => ({
  scheduleCreationNotifications: jest.fn().mockResolvedValue(["mock-notif"]),
  cancelReminderIds: jest.fn().mockResolvedValue(undefined),
}));

describe("Lifecycle Consistency Tests (V3 Architecture)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it("should handle create -> complete -> clear completed flow", async () => {
    const wsId = "ws-lifecycle-1";
    await EntityCommandService.createWorkspace({
      id: wsId,
      name: "Test Workspace",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const task = await EntityCommandService.createTask({
      id: "mock-task-1",
      workspaceId: wsId,
      title: "Task 1",
      status: "todo",
      priority: "high",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }, wsId);

    // Complete task
    await EntityCommandService.updateTask(task.id, wsId, { status: "completed", completedAt: Date.now() });
    
    let tasks = await TaskRepository.getTasks(wsId);
    expect(tasks[task.id].status).toBe("completed");

    // Clear completed
    await EntityCommandService.clearCompletedTasks(wsId);

    tasks = await TaskRepository.getTasks(wsId);
    expect(tasks[task.id]).toBeUndefined();
  });

  it("should handle Task <-> Habit conversions safely", async () => {
    const wsId = "ws-lifecycle-2";
    await EntityCommandService.createWorkspace({
      id: wsId,
      name: "Test Workspace",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const task = await EntityCommandService.createTask({
      id: "mock-task-2",
      workspaceId: wsId,
      title: "Task to Convert",
      status: "todo",
      priority: "high",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }, wsId);

    const habit = await EntityCommandService.convertTaskToHabit(task.id, wsId);
    
    // Verify Task is gone, Habit is created
    const tasks = await TaskRepository.getTasks(wsId);
    expect(tasks[task.id]).toBeUndefined();

    const habits = await HabitRepository.getHabits(wsId);
    expect(habits[habit.id].title).toBe("Task to Convert");

    // Convert back to Task
    const restoredTask = await EntityCommandService.convertHabitToTask(habit.id, wsId);
    
    const habitsAfter = await HabitRepository.getHabits(wsId);
    expect(habitsAfter[habit.id]).toBeUndefined();

    const tasksAfter = await TaskRepository.getTasks(wsId);
    expect(tasksAfter[restoredTask.id].title).toBe("Task to Convert");
  });

  it("should reject workspace operations on protected workspaces", async () => {
    await expect(EntityCommandService.deleteWorkspace("inbox")).rejects.toThrow();
    await expect(EntityCommandService.deleteWorkspace("my-pebbles")).rejects.toThrow();
  });
});
