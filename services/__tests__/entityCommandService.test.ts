jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { EntityCommandService } from "@/services/command/EntityCommandService";
import { TaskRepository, HabitRepository, ChecklistRepository, ResourceRepository } from "@/repositories";
import type { ParsedProductivityItem } from "@/features/capture/services/nlp-parser.service";

describe("EntityCommandService unit tests", () => {
  beforeEach(async () => {
    // Clear in-memory / storage mocks if any
  });

  it("should create and persist a Task from a ParsedProductivityItem", async () => {
    const item: ParsedProductivityItem = {
      type: "task",
      title: "Test Task Creation",
      category: "work",
      priority: "high",
      confidence: 0.9,
    };

    const task = await EntityCommandService.createTask(item, "ws-1", { skipAnalytics: true });
    expect(task.id).toBeDefined();
    expect(task.title).toBe("Test Task Creation");
    expect(task.workspaceId).toBe("ws-1");
    expect(task.priority).toBe("high");

    const fetched = await TaskRepository.getTask(task.id, "ws-1");
    expect(fetched).toBeDefined();
    expect(fetched?.title).toBe("Test Task Creation");
  });

  it("should create and persist a Habit from a ParsedProductivityItem", async () => {
    const item: ParsedProductivityItem = {
      type: "habit",
      title: "Daily Meditation",
      category: "health",
      recurrence: { type: "daily" },
      confidence: 0.9,
    };

    const habit = await EntityCommandService.createHabit(item, "ws-1", { skipAnalytics: true });
    expect(habit.id).toBeDefined();
    expect(habit.title).toBe("Daily Meditation");
    expect(habit.workspaceId).toBe("ws-1");

    const fetched = await HabitRepository.getHabit(habit.id, "ws-1");
    expect(fetched).toBeDefined();
    expect(fetched?.title).toBe("Daily Meditation");
  });

  it("should create and persist a Checklist from a ParsedProductivityItem", async () => {
    const item: ParsedProductivityItem = {
      type: "checklist",
      title: "Packing List",
      items: ["Passport", "Tickets", "Camera"],
      confidence: 0.95,
    };

    const checklist = await EntityCommandService.createChecklist(item, "ws-1", { skipAnalytics: true });
    expect(checklist.id).toBeDefined();
    expect(checklist.title).toBe("Packing List");
    expect(checklist.items).toHaveLength(3);

    const fetchedMap = await ChecklistRepository.getChecklists("ws-1");
    expect(fetchedMap[checklist.id]).toBeDefined();
  });

  it("should create and persist a Resource from a ParsedProductivityItem", async () => {
    const item: ParsedProductivityItem = {
      type: "note",
      title: "Architecture Refactoring Note",
      category: "work",
      confidence: 0.85,
    };

    const resource = await EntityCommandService.createResource(item, "ws-1", { skipAnalytics: true });
    expect(resource.id).toBeDefined();
    expect(resource.title).toBe("Architecture Refactoring Note");

    const fetched = await ResourceRepository.getResource(resource.id, "ws-1");
    expect(fetched).toBeDefined();
    expect(fetched?.title).toBe("Architecture Refactoring Note");
  });
});
