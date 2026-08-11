import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
import { TaskRepository } from "../../repositories/TaskRepository";
import { HabitRepository } from "../../repositories/HabitRepository";
import { ChecklistRepository } from "../../repositories/ChecklistRepository";
import { generateId } from "../../shared/utils/id";

describe("Concurrency Safety Tests", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("should safely handle concurrent task creations without losing updates", async () => {
    const wsId = "ws-concurrency-test";

    // Launch 50 creations concurrently
    const promises = Array.from({ length: 50 }).map(async (_, idx) => {
      const task = {
        id: generateId("task-"),
        workspaceId: wsId,
        title: `Task ${idx}`,
        status: "todo" as const,
        priority: "medium" as const,
        schedule: { date: "2026-08-11" },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await TaskRepository.saveTask(task);
    });

    await Promise.all(promises);

    const tasks = await TaskRepository.getTasks(wsId);
    expect(Object.keys(tasks).length).toBe(50);
  });

  it("should safely handle concurrent updates to the same workspace", async () => {
    const wsId = "ws-concurrency-update";

    const task1 = {
      id: "task-1",
      workspaceId: wsId,
      title: `Task 1`,
      status: "todo" as const,
      priority: "medium" as const,
      schedule: { date: "2026-08-11" },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await TaskRepository.saveTask(task1);

    const promises = Array.from({ length: 50 }).map(async (_, idx) => {
      const task = {
        id: `task-2-${idx}`,
        workspaceId: wsId,
        title: `Concurrent Add ${idx}`,
        status: "todo" as const,
        priority: "medium" as const,
        schedule: { date: "2026-08-11" },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await TaskRepository.saveTask(task);
    });

    await Promise.all(promises);

    const tasks = await TaskRepository.getTasks(wsId);
    expect(Object.keys(tasks).length).toBe(51);
  });

  it("should safely handle concurrent habit creations", async () => {
    const wsId = "ws-concurrency-habit";

    const promises = Array.from({ length: 50 }).map(async (_, idx) => {
      const habit = {
        id: generateId("habit-"),
        workspaceId: wsId,
        title: `Habit ${idx}`,
        categoryId: "health" as const,
        recurrence: { frequency: "daily" as const, interval: 1 },
        completionHistory: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await HabitRepository.saveHabit(habit);
    });

    await Promise.all(promises);

    const habits = await HabitRepository.getHabits(wsId);
    expect(Object.keys(habits).length).toBe(50);
  });

  it("should safely handle concurrent checklist creations", async () => {
    const wsId = "ws-concurrency-checklist";

    const promises = Array.from({ length: 50 }).map(async (_, idx) => {
      const checklist = {
        id: generateId("checklist-"),
        workspaceId: wsId,
        title: `Checklist ${idx}`,
        items: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await ChecklistRepository.saveChecklist(checklist);
    });

    await Promise.all(promises);

    const checklists = await ChecklistRepository.getChecklists(wsId);
    expect(Object.keys(checklists).length).toBe(50);
  });
});
