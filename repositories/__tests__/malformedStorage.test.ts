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
  createdAt: 1,
  updatedAt: 1,
});

const habit = (id: string): Habit => ({
  id,
  workspaceId: "ws-1",
  title: `Habit ${id}`,
  recurrence: { frequency: "daily", interval: 1 },
  completionHistory: [],
  createdAt: 1,
  updatedAt: 1,
});

const checklist = (id: string): Checklist => ({
  id,
  workspaceId: "ws-1",
  title: `Checklist ${id}`,
  items: [],
  createdAt: 1,
  updatedAt: 1,
});

const resource = (id: string): Resource => ({
  id,
  workspaceId: "ws-1",
  type: "note",
  title: `Resource ${id}`,
  createdAt: 1,
  updatedAt: 1,
});

beforeEach(async () => {
  await storage.clear();
  jest.restoreAllMocks();
  GraphRepository.resetCache();
});

describe("Malformed stored JSON does not crash repositories", () => {
  test("TaskRepository.getTasks returns an empty map for malformed JSON and logs a warning", async () => {
    await storage.setItem("pebble:v1:tasks:ws-1", "{not valid json");
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const tasks = await TaskRepository.getTasks("ws-1");

    expect(tasks).toEqual({});
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("TaskRepository.getTask returns null for malformed JSON", async () => {
    await storage.setItem("pebble:v1:tasks:ws-1", "{not valid json");
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const found = await TaskRepository.getTask("task-1", "ws-1");

    expect(found).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("TaskRepository treats a non-object stored value as an empty map", async () => {
    await storage.setItem("pebble:v1:tasks:ws-1", JSON.stringify([1, 2, 3]));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const tasks = await TaskRepository.getTasks("ws-1");

    expect(tasks).toEqual({});
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("HabitRepository.getHabits returns an empty map for malformed JSON", async () => {
    await storage.setItem("pebble:v1:habits:ws-1", "{not valid json");
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const habits = await HabitRepository.getHabits("ws-1");

    expect(habits).toEqual({});
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("ChecklistRepository.getChecklists returns an empty map for malformed JSON", async () => {
    await storage.setItem("pebble:v1:checklists:ws-1", "{not valid json");
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const checklists = await ChecklistRepository.getChecklists("ws-1");

    expect(checklists).toEqual({});
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("ResourceRepository.getResources returns an empty map for malformed JSON", async () => {
    await storage.setItem("pebble:v1:resources:ws-1", "{not valid json");
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const resources = await ResourceRepository.getResources("ws-1");

    expect(resources).toEqual({});
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
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

  test("a malformed map does not break subsequent valid writes (tolerant recovery)", async () => {
    await storage.setItem("pebble:v1:tasks:ws-1", "{not valid json");
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    await TaskRepository.saveTask(task("task-1"));
    const tasks = await TaskRepository.getTasks("ws-1");

    expect(tasks["task-1"]).toBeDefined();
    warnSpy.mockRestore();
  });
});
