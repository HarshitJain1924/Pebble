import AsyncStorage from "@react-native-async-storage/async-storage";
import { TaskRepository } from "@/repositories/TaskRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { ChecklistRepository } from "@/repositories/ChecklistRepository";
import { ResourceRepository } from "@/repositories/ResourceRepository";
import { GraphRepository } from "@/repositories/GraphRepository";
import type {
  Checklist,
  Habit,
  Resource,
  Task,
} from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const storage = AsyncStorage as typeof AsyncStorage;

const task = (id: string): Task => ({
  id,
  workspaceId: "ws-1",
  title: `Task ${id}`,
  status: "todo",
  priority: "none",
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
});

const habit = (id: string): Habit => ({
  id,
  workspaceId: "ws-1",
  title: `Habit ${id}`,
  recurrence: { frequency: "daily", interval: 1 },
  completionHistory: [],
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
});

const checklist = (id: string): Checklist => ({
  id,
  workspaceId: "ws-1",
  title: `Checklist ${id}`,
  items: [],
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
});

const resource = (id: string): Resource => ({
  id,
  workspaceId: "ws-1",
  type: "note",
  title: `Resource ${id}`,
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
});

beforeEach(async () => {
  await storage.clear();
  jest.restoreAllMocks();
  GraphRepository.resetCache();
});

describe("Malformed stored JSON crashes repositories (Fail-Closed protection)", () => {
  test("TaskRepository.getTasks throws on malformed JSON", async () => {
    await storage.setItem("pebble:v1:tasks:ws-1", "{not valid json");
    await expect(TaskRepository.getTasks("ws-1")).rejects.toThrow();
  });

  test("TaskRepository.getTask throws on malformed JSON", async () => {
    await storage.setItem("pebble:v1:tasks:ws-1", "{not valid json");
    await expect(TaskRepository.getTask("task-1", "ws-1")).rejects.toThrow();
  });

  test("TaskRepository throws if a non-object is stored", async () => {
    await storage.setItem("pebble:v1:tasks:ws-1", JSON.stringify([1, 2, 3]));
    await expect(TaskRepository.getTasks("ws-1")).rejects.toThrow("not a JSON object");
  });

  test("HabitRepository.getHabits throws on malformed JSON", async () => {
    await storage.setItem("pebble:v1:habits:ws-1", "{not valid json");
    await expect(HabitRepository.getHabits("ws-1")).rejects.toThrow();
  });

  test("ChecklistRepository.getChecklists throws on malformed JSON", async () => {
    await storage.setItem("pebble:v1:checklists:ws-1", "{not valid json");
    await expect(ChecklistRepository.getChecklists("ws-1")).rejects.toThrow();
  });

  test("ResourceRepository.getResources throws on malformed JSON", async () => {
    await storage.setItem("pebble:v1:resources:ws-1", "{not valid json");
    await expect(ResourceRepository.getResources("ws-1")).rejects.toThrow();
  });

  test("valid stored JSON behaves exactly as before", async () => {
    await TaskRepository.saveTask(task("task-1"));
    await HabitRepository.saveHabit(habit("habit-1"));
    await ChecklistRepository.saveChecklist(checklist("checklist-1"));
    await ResourceRepository.saveResource(resource("resource-1"));

    const tasks = await TaskRepository.getTasks("ws-1");
    const habits = await HabitRepository.getHabits("ws-1");
    const checklists = await ChecklistRepository.getChecklists("ws-1");
    const resources = await ResourceRepository.getResources("ws-1");

    expect(tasks["task-1"].title).toBe("Task task-1");
    expect(habits["habit-1"].title).toBe("Habit habit-1");
    expect(checklists["checklist-1"].title).toBe("Checklist checklist-1");
    expect(resources["resource-1"].title).toBe("Resource resource-1");
  });

  test("a malformed map now explicitly rejects subsequent valid writes to prevent overwriting", async () => {
    await storage.setItem("pebble:v1:tasks:ws-1", "{not valid json");
    const warnSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(TaskRepository.saveTask(task("task-1"))).rejects.toThrow();
    
    warnSpy.mockRestore();
  });
});
