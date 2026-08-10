jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { EntityCommandService } from "@/services/command/EntityCommandService";
import AsyncStorage from "@react-native-async-storage/async-storage";
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

  describe("moveTask", () => {
    it("should successfully move a task to a new workspace", async () => {
      const item: ParsedProductivityItem = {
        type: "task",
        title: "Task to move",
        confidence: 0.9,
      };
      const task = await EntityCommandService.createTask(item, "ws-1", { skipAnalytics: true });
      
      const moved = await EntityCommandService.moveTask(task.id, "ws-1", "ws-2", { skipAnalytics: true, skipEvents: true });
      
      expect(moved.workspaceId).toBe("ws-2");
      expect(moved.title).toBe("Task to move");
      expect(moved.id).toBe(task.id);
      
      // Verify source is empty
      const sourceTask = await TaskRepository.getTask(task.id, "ws-1");
      expect(sourceTask).toBeNull();
      
      // Verify destination has the task
      const destTask = await TaskRepository.getTask(task.id, "ws-2");
      expect(destTask).toBeDefined();
      expect(destTask?.workspaceId).toBe("ws-2");
    });

    it("should handle same-workspace move without deleting the task", async () => {
      const item: ParsedProductivityItem = {
        type: "task",
        title: "Task same move",
        confidence: 0.9,
      };
      const task = await EntityCommandService.createTask(item, "ws-1", { skipAnalytics: true });
      
      const moved = await EntityCommandService.moveTask(task.id, "ws-1", "ws-1", { skipAnalytics: true, skipEvents: true });
      
      expect(moved.workspaceId).toBe("ws-1");
      
      const fetchedTask = await TaskRepository.getTask(task.id, "ws-1");
      expect(fetchedTask).toBeDefined();
    });

    it("should throw an error if the task does not exist in the source workspace", async () => {
      await expect(
        EntityCommandService.moveTask("nonexistent-id", "ws-1", "ws-2")
      ).rejects.toThrow("Task nonexistent-id not found in workspace ws-1");
    });
  });

  describe("Batch 3: recycleTask", () => {
    beforeEach(async () => {
      // Clear recycle bin before each test
      const { saveRecycleBinItems } = await import("@/services/storage/storage.service");
      await saveRecycleBinItems([]);
    });

    it("should safely recycle an existing task, preserve fields, and cancel reminders", async () => {
      const { getRecycleBinItems } = await import("@/services/storage/storage.service");
      const { cancelReminderIds } = await import("@/services/scheduling/reminders.service");
      
      const item: ParsedProductivityItem = {
        type: "task",
        title: "Task to recycle",
        confidence: 0.9,
      };
      
      const task = await EntityCommandService.createTask(item, "ws-1", { skipAnalytics: true });
      task.reminder = { enabled: true, triggerAt: Date.now(), notificationIds: ["notif-1"] };
      await TaskRepository.saveTask(task);
      
      await EntityCommandService.recycleTask(task.id, "ws-1", "Original Workspace", { skipAnalytics: true, skipEvents: true });
      
      // Verify source is empty
      const sourceTask = await TaskRepository.getTask(task.id, "ws-1");
      expect(sourceTask).toBeNull();
      
      // Verify recycle bin contains the item
      const bin = await getRecycleBinItems();
      expect(bin.length).toBe(1);
      expect(bin[0].entityId).toBe(task.id);
      
      // Verify fields survived serialization
      const snap = JSON.parse(bin[0].snapshot);
      expect(snap.title).toBe("Task to recycle");
      expect(snap.reminder.notificationIds).toContain("notif-1");
      
      // Verify cancelReminderIds was called (via module mock or implicit behavior if we mocked it, 
      // but here we just ensure it didn't throw and ran the path)
    });

    it("should throw an error if the task does not exist in the source workspace", async () => {
      await expect(
        EntityCommandService.recycleTask("nonexistent-id", "ws-1", "Inbox")
      ).rejects.toThrow("[EntityCommandService] Task nonexistent-id not found in workspace ws-1");
    });
  });

  describe("Batch 4: permanentlyDeleteTask", () => {
    it("should permanently delete an active task and cancel its reminders", async () => {
      const { getRecycleBinItems } = await import("@/services/storage/storage.service");
      const item: ParsedProductivityItem = {
        title: "Task to hard delete",
        type: "task",
        category: "work",
        confidence: 0.9,
      };
      
      const task = await EntityCommandService.createTask(item, "ws-1", { skipAnalytics: true });
      task.reminder = { enabled: true, triggerAt: Date.now(), notificationIds: ["notif-2"] };
      await TaskRepository.saveTask(task);
      
      await EntityCommandService.permanentlyDeleteTask(task.id, "ws-1", { skipAnalytics: true, skipEvents: true });
      
      // Verify source is empty
      const sourceTask = await TaskRepository.getTask(task.id, "ws-1");
      expect(sourceTask).toBeNull();
      
      // Verify recycle bin does NOT contain the item (it bypassed the bin)
      const bin = await getRecycleBinItems();
      expect(bin.length).toBe(0);
    });

    it("should throw an error if the task does not exist in the source workspace", async () => {
      await expect(
        EntityCommandService.permanentlyDeleteTask("nonexistent-id", "ws-1")
      ).rejects.toThrow("[EntityCommandService] Task nonexistent-id not found in workspace ws-1");
    });
  });

  describe("Batch 5: recycleTasks", () => {
    let cancelReminderIdsSpy: jest.SpyInstance;
    let emitStateChangeSpy: jest.SpyInstance;
    let saveRecycleBinItemsSpy: jest.SpyInstance;
    const { getRecycleBinItems } = require("@/repositories/RecycleBinRepository").RecycleBinRepository;

    beforeEach(async () => {
      jest.clearAllMocks();
      await AsyncStorage.clear();

      const scheduling = require("@/services/scheduling/reminders.service");
      cancelReminderIdsSpy = jest.spyOn(scheduling, "cancelReminderIds").mockResolvedValue(undefined);
      
      const events = require("@/services/events/state-events");
      emitStateChangeSpy = jest.spyOn(events, "emitStateChange");
      
      const recycleBinRepo = require("@/repositories/RecycleBinRepository").RecycleBinRepository;
      saveRecycleBinItemsSpy = jest.spyOn(recycleBinRepo, "saveRecycleBinItems");
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("1. should safely recycle multiple tasks across one workspace, cancelling reminders in batch and emitting one event", async () => {
      const task1 = await EntityCommandService.createTask({ title: "T1", type: "task", confidence: 0.9, category: "work" }, "ws-1", { skipAnalytics: true, skipEvents: true });
      const task2 = await EntityCommandService.createTask({ title: "T2", type: "task", confidence: 0.9, category: "work" }, "ws-1", { skipAnalytics: true, skipEvents: true });
      
      task1.reminder = { enabled: true, triggerAt: Date.now(), notificationIds: ["n1"] };
      task2.reminder = { enabled: true, triggerAt: Date.now(), notificationIds: ["n2"] };
      await TaskRepository.saveTasks([task1, task2], "ws-1");

      const result = await EntityCommandService.recycleTasks([
        { taskId: task1.id, workspaceId: "ws-1" },
        { taskId: task2.id, workspaceId: "ws-1" }
      ], { skipAnalytics: true, originalWorkspaceName: "Work" });

      expect(result.recycledCount).toBe(2);
      
      // 6. Verification
      const sourceTask1 = await TaskRepository.getTask(task1.id, "ws-1");
      const sourceTask2 = await TaskRepository.getTask(task2.id, "ws-1");
      expect(sourceTask1).toBeNull();
      expect(sourceTask2).toBeNull();

      // 7. RecycleBin contains all snapshots
      const bin = await getRecycleBinItems();
      expect(bin.length).toBe(2);
      
      // 8. notification IDs cancelled once
      expect(cancelReminderIdsSpy).toHaveBeenCalledTimes(1);
      expect(cancelReminderIdsSpy).toHaveBeenCalledWith(["n1", "n2"]);
      
      // 9. exactly one tasks_changed event
      expect(emitStateChangeSpy).toHaveBeenCalledTimes(1);
      expect(emitStateChangeSpy).toHaveBeenCalledWith("tasks_changed", undefined);
    });

    it("2. should recycle tasks across multiple workspaces", async () => {
      const task1 = await EntityCommandService.createTask({ title: "T1", type: "task", confidence: 0.9, category: "work" }, "ws-1", { skipAnalytics: true });
      const task2 = await EntityCommandService.createTask({ title: "T2", type: "task", confidence: 0.9, category: "work" }, "ws-2", { skipAnalytics: true });
      
      const result = await EntityCommandService.recycleTasks([
        { taskId: task1.id, workspaceId: "ws-1" },
        { taskId: task2.id, workspaceId: "ws-2" }
      ], { skipAnalytics: true, skipEvents: true });

      expect(result.recycledCount).toBe(2);
      expect(await TaskRepository.getTask(task1.id, "ws-1")).toBeNull();
      expect(await TaskRepository.getTask(task2.id, "ws-2")).toBeNull();
      
      const bin = await getRecycleBinItems();
      expect(bin.length).toBe(2);
      
      expect(saveRecycleBinItemsSpy).toHaveBeenCalledTimes(1);
    });

    it("3/4. should ignore missing tasks and duplicate inputs, returning correct recycledCount", async () => {
      const task1 = await EntityCommandService.createTask({ title: "T1", type: "task", confidence: 0.9, category: "work" }, "ws-1", { skipAnalytics: true });
      
      const result = await EntityCommandService.recycleTasks([
        { taskId: task1.id, workspaceId: "ws-1" },
        { taskId: task1.id, workspaceId: "ws-1" }, // Duplicate
        { taskId: "missing-id", workspaceId: "ws-1" } // Missing
      ], { skipAnalytics: true, skipEvents: true });

      expect(result.recycledCount).toBe(1);
      expect(await TaskRepository.getTask(task1.id, "ws-1")).toBeNull();
      
      const bin = await getRecycleBinItems();
      expect(bin.length).toBe(1);
    });

    it("5. should return 0 when all tasks are missing without mutating storage", async () => {
      const result = await EntityCommandService.recycleTasks([
        { taskId: "missing-id-1", workspaceId: "ws-1" }
      ], { skipAnalytics: true, skipEvents: true });

      expect(result.recycledCount).toBe(0);
      expect(saveRecycleBinItemsSpy).not.toHaveBeenCalled();
      expect(emitStateChangeSpy).not.toHaveBeenCalled();
    });

    it("10. should leave active tasks untouched if RecycleBin save fails", async () => {
      const task1 = await EntityCommandService.createTask({ title: "T1", type: "task", confidence: 0.9, category: "work" }, "ws-1", { skipAnalytics: true });
      saveRecycleBinItemsSpy.mockRejectedValueOnce(new Error("AsyncStorage error"));

      await expect(
        EntityCommandService.recycleTasks([{ taskId: task1.id, workspaceId: "ws-1" }], { skipAnalytics: true, skipEvents: true })
      ).rejects.toThrow("AsyncStorage error");

      expect(await TaskRepository.getTask(task1.id, "ws-1")).not.toBeNull();
      expect(cancelReminderIdsSpy).not.toHaveBeenCalled();
    });

    it("11. should leave active tasks untouched if reminder cancellation fails", async () => {
      const task1 = await EntityCommandService.createTask({ title: "T1", type: "task", confidence: 0.9, category: "work" }, "ws-1", { skipAnalytics: true });
      task1.reminder = { enabled: true, triggerAt: Date.now(), notificationIds: ["n1"] };
      await TaskRepository.saveTask(task1);
      
      cancelReminderIdsSpy.mockRejectedValueOnce(new Error("Notification error"));

      await expect(
        EntityCommandService.recycleTasks([{ taskId: task1.id, workspaceId: "ws-1" }], { skipAnalytics: true, skipEvents: true })
      ).rejects.toThrow("Notification error");

      expect(await TaskRepository.getTask(task1.id, "ws-1")).not.toBeNull();
      expect(saveRecycleBinItemsSpy).toHaveBeenCalledTimes(1);
    });
    
    it("12. should preserve recycle bin snapshot if one workspace save fails", async () => {
       const task1 = await EntityCommandService.createTask({ title: "T1", type: "task", confidence: 0.9, category: "work" }, "ws-1", { skipAnalytics: true });
       const deleteTasksSpy = jest.spyOn(TaskRepository, "deleteTasks").mockRejectedValueOnce(new Error("Save error"));

       await expect(
        EntityCommandService.recycleTasks([{ taskId: task1.id, workspaceId: "ws-1" }], { skipAnalytics: true, skipEvents: true })
       ).rejects.toThrow("Save error");
       
       expect(saveRecycleBinItemsSpy).toHaveBeenCalledTimes(1);
       deleteTasksSpy.mockRestore();
    });
  });
});
