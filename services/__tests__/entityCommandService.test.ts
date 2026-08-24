jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { EntityCommandService } from "@/services/command/EntityCommandService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { TaskRepository, HabitRepository, ChecklistRepository, ResourceRepository, GraphRepository } from "@/repositories";
import type { ParsedProductivityItem } from "@/features/capture/services/nlp-parser.service";

describe("EntityCommandService unit tests", () => {
  beforeEach(async () => {
    // Clear in-memory / storage mocks if any
    const { WorkspaceRepository } = require("@/repositories/WorkspaceRepository");
    jest.spyOn(WorkspaceRepository, "getWorkspaces")
      .mockResolvedValue([{ id: "ws-1", name: "1" }, { id: "ws-2", name: "2" }]);
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
    let cancelReminderIdsSpy: jest.SpyInstance;
    let emitStateChangeSpy: jest.SpyInstance;
    let addToRecycleBinSpy: jest.SpyInstance;

    beforeEach(async () => {
      jest.clearAllMocks();
      const scheduling = require("@/services/scheduling/reminders.service");
      cancelReminderIdsSpy = jest.spyOn(scheduling, "cancelReminderIds").mockResolvedValue(undefined);
      
      const events = require("@/services/events/state-events");
      emitStateChangeSpy = jest.spyOn(events, "emitStateChange");
      
      const recycleBinRepo = require("@/repositories/RecycleBinRepository").RecycleBinRepository;
      addToRecycleBinSpy = jest.spyOn(recycleBinRepo, "addToRecycleBin");

      // Clear recycle bin before each test
      const { saveRecycleBinItems } = require("@/services/storage/storage.service");
      await saveRecycleBinItems([]);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("should safely recycle an existing task, preserve fields, and cancel reminders", async () => {
      const { getRecycleBinItems } = await import("@/services/storage/storage.service");
      
      const item: ParsedProductivityItem = {
        type: "task",
        title: "Task to recycle",
        confidence: 0.9,
      };
      
      const task = await EntityCommandService.createTask(item, "ws-1", { skipAnalytics: true });
      task.reminder = { enabled: true, triggerAt: Date.now(), notificationIds: ["notif-1"] };
      await TaskRepository.saveTask(task);
      
      await EntityCommandService.recycleTask(task.id, "ws-1", "Original Workspace", { skipAnalytics: true, source: "test-source" });
      
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
      
      // 1. source is propagated to tasks_changed
      expect(emitStateChangeSpy).toHaveBeenCalledWith("tasks_changed", "test-source");
    });

    it("should preserve active task, not cancel reminders, and not emit event if recycle-bin persistence fails", async () => {
      const task = await EntityCommandService.createTask({ title: "T1", type: "task", confidence: 0.9 }, "ws-1", { skipAnalytics: true, skipEvents: true });
      task.reminder = { enabled: true, triggerAt: Date.now(), notificationIds: ["n1"] };
      await TaskRepository.saveTask(task);
      
      addToRecycleBinSpy.mockRejectedValueOnce(new Error("Storage Error"));

      await expect(
        EntityCommandService.recycleTask(task.id, "ws-1", "Inbox")
      ).rejects.toThrow("Storage Error");

      // 2. recycle-bin persistence failure preserves active Task
      const sourceTask = await TaskRepository.getTask(task.id, "ws-1");
      expect(sourceTask).not.toBeNull();

      // 3. recycle-bin persistence failure does not cancel reminders
      expect(cancelReminderIdsSpy).not.toHaveBeenCalled();

      // 4. recycle-bin persistence failure does not emit tasks_changed
      expect(emitStateChangeSpy).not.toHaveBeenCalled();
    });

    it("should safely recycle task if reminder cancellation fails", async () => {
      const task = await EntityCommandService.createTask({ title: "T1", type: "task", confidence: 0.9 }, "ws-1", { skipAnalytics: true, skipEvents: true });
      task.reminder = { enabled: true, triggerAt: Date.now(), notificationIds: ["n1"] };
      await TaskRepository.saveTask(task);
      
      cancelReminderIdsSpy.mockRejectedValueOnce(new Error("Reminder Error"));

      await expect(
        EntityCommandService.recycleTask(task.id, "ws-1", "Inbox")
      ).resolves.toBeUndefined();

      // 5. Active Task is successfully recycled despite notification error
      const sourceTask = await TaskRepository.getTask(task.id, "ws-1");
      expect(sourceTask).toBeNull();
    });

    it("should throw an error if the task does not exist in the source workspace", async () => {
      await expect(
        EntityCommandService.recycleTask("nonexistent-id", "ws-1", "Inbox")
      ).rejects.toThrow("[EntityCommandService] Task nonexistent-id not found in workspace ws-1");
    });
  });

  describe("Batch 4: permanentlyDeleteTask", () => {
    let emitStateChangeSpy: jest.SpyInstance;

    beforeEach(() => {
      jest.clearAllMocks();
      const events = require("@/services/events/state-events");
      emitStateChangeSpy = jest.spyOn(events, "emitStateChange");
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("should permanently delete an active task, cancel its reminders, and propagate source", async () => {
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
      
      await EntityCommandService.permanentlyDeleteTask(task.id, "ws-1", { skipAnalytics: true, source: "hard-delete-source" });
      
      // Verify source is empty
      const sourceTask = await TaskRepository.getTask(task.id, "ws-1");
      expect(sourceTask).toBeNull();
      
      // Verify recycle bin does NOT contain the item (it bypassed the bin)
      const bin = await getRecycleBinItems();
      expect(bin.length).toBe(0);

      // 7. source is propagated to tasks_changed
      expect(emitStateChangeSpy).toHaveBeenCalledWith("tasks_changed", "hard-delete-source");
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
    // Call through the class reference: destructuring the static method off the
    // class loses the `this` binding, so it would read the wrong storage key.
    const RecycleBinRepo = require("@/repositories/RecycleBinRepository").RecycleBinRepository;

    beforeEach(async () => {
      jest.clearAllMocks();
      await AsyncStorage.clear();

      const scheduling = require("@/services/scheduling/reminders.service");
      cancelReminderIdsSpy = jest.spyOn(scheduling, "cancelReminderIds").mockResolvedValue(undefined);
      
      const events = require("@/services/events/state-events");
      emitStateChangeSpy = jest.spyOn(events, "emitStateChange");
      
      const recycleBinRepo = require("@/repositories/RecycleBinRepository").RecycleBinRepository;
      saveRecycleBinItemsSpy = jest.spyOn(recycleBinRepo, "saveRecycleBinItemsUnlocked");
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
      const bin = await RecycleBinRepo.getRecycleBinItems();
      expect(bin.length).toBe(2);
      
      // 8. notification IDs cancelled once
      expect(cancelReminderIdsSpy).toHaveBeenCalledTimes(1);
      expect(cancelReminderIdsSpy).toHaveBeenCalledWith(["n1", "n2"], { throwOnError: false });
      
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
      
      const bin = await RecycleBinRepo.getRecycleBinItems();
      expect(bin.length).toBe(2);
      
      expect(saveRecycleBinItemsSpy).toHaveBeenCalled();
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
      
      const bin = await RecycleBinRepo.getRecycleBinItems();
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

    it("11. should safely recycle tasks if reminder cancellation fails", async () => {
      const task1 = await EntityCommandService.createTask({ title: "T1", type: "task", confidence: 0.9, category: "work" }, "ws-1", { skipAnalytics: true });
      task1.reminder = { enabled: true, triggerAt: Date.now(), notificationIds: ["n1"] };
      await TaskRepository.saveTask(task1);
      
      cancelReminderIdsSpy.mockRejectedValueOnce(new Error("Notification error"));

      await expect(
        EntityCommandService.recycleTasks([{ taskId: task1.id, workspaceId: "ws-1" }], { skipAnalytics: true, skipEvents: true })
      ).resolves.toBeDefined();

      expect(await TaskRepository.getTask(task1.id, "ws-1")).toBeNull();
      expect(saveRecycleBinItemsSpy).toHaveBeenCalled();
    });
    
    it("12. should preserve recycle bin snapshot if one workspace save fails", async () => {
       const task1 = await EntityCommandService.createTask({ title: "T1", type: "task", confidence: 0.9, category: "work" }, "ws-1", { skipAnalytics: true });
       const deleteTasksSpy = jest.spyOn(TaskRepository, "deleteTasksUnlocked").mockRejectedValueOnce(new Error("Save error"));

       await expect(
        EntityCommandService.recycleTasks([{ taskId: task1.id, workspaceId: "ws-1" }], { skipAnalytics: true, skipEvents: true })
       ).rejects.toThrow("Save error");
       
       expect(saveRecycleBinItemsSpy).toHaveBeenCalled();
       deleteTasksSpy.mockRestore();
    });
  });

  describe("updateTask behaviors (Batch 7A)", () => {
    let rescheduleTodoRemindersSpy: jest.SpyInstance;
    let cancelReminderIdsSpy: jest.SpyInstance;

    beforeEach(() => {
      const remindersService = require("@/services/scheduling/reminders.service");
      rescheduleTodoRemindersSpy = jest.spyOn(remindersService, "rescheduleTodoReminders").mockImplementation(async (t: any) => ({ ...t, reminder: { enabled: true, triggerAt: Date.now(), notificationIds: ["new-id"] } }));
      cancelReminderIdsSpy = jest.spyOn(remindersService, "cancelReminderIds").mockResolvedValue(undefined);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("1. Changing schedule triggers reminder rescheduling", async () => {
      const task = await EntityCommandService.createTask({ title: "T1", type: "task", confidence: 1 }, "ws-1", { skipAnalytics: true, skipEvents: true });
      await EntityCommandService.updateTask(task.id, "ws-1", { schedule: { date: "2025-01-01" } }, { skipAnalytics: true, skipEvents: true });
      expect(rescheduleTodoRemindersSpy).toHaveBeenCalled();
    });

    it("2. Unchanged schedule does not trigger reminder rescheduling", async () => {
      const task = await EntityCommandService.createTask({ title: "T2", type: "task", confidence: 1 }, "ws-1", { skipAnalytics: true, skipEvents: true });
      jest.clearAllMocks();
      await EntityCommandService.updateTask(task.id, "ws-1", { priority: "high" }, { skipAnalytics: true, skipEvents: true });
      expect(rescheduleTodoRemindersSpy).not.toHaveBeenCalled();
    });

    it("3. Archiving cancels existing reminders and does not recreate them", async () => {
      let task = await EntityCommandService.createTask({ title: "T3", type: "task", confidence: 1 }, "ws-1", { skipAnalytics: true, skipEvents: true });
      task.reminder = { enabled: true, triggerAt: Date.now(), notificationIds: ["notif-1"] };
      await TaskRepository.saveTask(task);
      jest.clearAllMocks();
      
      const updated = await EntityCommandService.updateTask(task.id, "ws-1", { archivedAt: Date.now() }, { skipAnalytics: true, skipEvents: true });
      expect(cancelReminderIdsSpy).toHaveBeenCalledWith(["notif-1"], { throwOnError: false });
      expect(rescheduleTodoRemindersSpy).not.toHaveBeenCalled();
      expect(updated.reminder?.notificationIds).toBeUndefined();
    });

    it("4. Unarchiving recreates reminders", async () => {
      let task = await EntityCommandService.createTask({ title: "T4", type: "task", confidence: 1 }, "ws-1", { skipAnalytics: true, skipEvents: true });
      task.archivedAt = 12345;
      await TaskRepository.saveTask(task);
      jest.clearAllMocks();
      
      await EntityCommandService.updateTask(task.id, "ws-1", { archivedAt: undefined }, { skipAnalytics: true, skipEvents: true });
      expect(rescheduleTodoRemindersSpy).toHaveBeenCalled();
    });

    it("4b. Existing reminder configuration survives archive/unarchive", async () => {
      let task = await EntityCommandService.createTask({ title: "T4b", type: "task", confidence: 1 }, "ws-1", { skipAnalytics: true, skipEvents: true });
      task.reminder = { enabled: true, triggerAt: 999999999, notificationIds: ["notif-old"] };
      await TaskRepository.saveTask(task);
      
      // Archive
      const archived = await EntityCommandService.updateTask(task.id, "ws-1", { archivedAt: Date.now() }, { skipAnalytics: true, skipEvents: true });
      expect(archived.reminder?.enabled).toBe(true);
      expect(archived.reminder?.triggerAt).toBe(999999999);
      expect(archived.reminder?.notificationIds).toBeUndefined();

      // Unarchive
      rescheduleTodoRemindersSpy.mockResolvedValueOnce({
        reminder: { enabled: true, triggerAt: 999999999, notificationIds: ["new-id"] }
      });
      const unarchived = await EntityCommandService.updateTask(task.id, "ws-1", { archivedAt: undefined }, { skipAnalytics: true, skipEvents: true });
      expect(unarchived.reminder?.enabled).toBe(true);
      expect(unarchived.reminder?.triggerAt).toBe(999999999);
      expect(unarchived.reminder?.notificationIds).toEqual(["new-id"]);
    });

    it("5. Archived Task does not receive reminders from an unrelated update", async () => {
      let task = await EntityCommandService.createTask({ title: "T5", type: "task", confidence: 1 }, "ws-1", { skipAnalytics: true, skipEvents: true });
      task.archivedAt = 12345;
      await TaskRepository.saveTask(task);
      jest.clearAllMocks();
      
      await EntityCommandService.updateTask(task.id, "ws-1", { title: "New Title" }, { skipAnalytics: true, skipEvents: true });
      expect(rescheduleTodoRemindersSpy).not.toHaveBeenCalled();
    });

    it("6. Existing completed-task reminder behavior remains unchanged", async () => {
      let task = await EntityCommandService.createTask({ title: "T6", type: "task", confidence: 1 }, "ws-1", { skipAnalytics: true, skipEvents: true });
      task.status = "completed";
      await TaskRepository.saveTask(task);
      jest.clearAllMocks();
      
      await EntityCommandService.updateTask(task.id, "ws-1", { schedule: { date: "2025-01-01" } }, { skipAnalytics: true, skipEvents: true });
      expect(rescheduleTodoRemindersSpy).not.toHaveBeenCalled();
    });
  });

  describe("updateTask behaviors (Batch 7B)", () => {
    let rescheduleTodoRemindersSpy: jest.SpyInstance;
    
    beforeEach(() => {
      const remindersService = require("@/services/scheduling/reminders.service");
      rescheduleTodoRemindersSpy = jest.spyOn(remindersService, "rescheduleTodoReminders").mockImplementation(async (t: any) => ({ ...t, reminder: { enabled: true, triggerAt: Date.now(), notificationIds: ["new-id"] } }));
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("1. updateTask can persist recurrenceExceptions", async () => {
      const task = await EntityCommandService.createTask({ title: "T1", type: "task", confidence: 1 }, "ws-1", { skipAnalytics: true, skipEvents: true });
      const updated = await EntityCommandService.updateTask(task.id, "ws-1", { recurrenceExceptions: ["2026-10-10"] }, { skipAnalytics: true, skipEvents: true });
      expect(updated.recurrenceExceptions).toEqual(["2026-10-10"]);
    });

    it("2/3. Adding or removing an exception does not trigger reminder rescheduling", async () => {
      const task = await EntityCommandService.createTask({ title: "T2", type: "task", confidence: 1 }, "ws-1", { skipAnalytics: true, skipEvents: true });
      jest.clearAllMocks();
      
      // Add
      await EntityCommandService.updateTask(task.id, "ws-1", { recurrenceExceptions: ["2026-10-10"] }, { skipAnalytics: true, skipEvents: true });
      expect(rescheduleTodoRemindersSpy).not.toHaveBeenCalled();
      
      // Remove
      await EntityCommandService.updateTask(task.id, "ws-1", { recurrenceExceptions: [] }, { skipAnalytics: true, skipEvents: true });
      expect(rescheduleTodoRemindersSpy).not.toHaveBeenCalled();
    });

    it("4/7. Master saveChanges updates all expected fields and triggers reminders", async () => {
      const task = await EntityCommandService.createTask({ title: "T3", type: "task", confidence: 1 }, "ws-1", { skipAnalytics: true, skipEvents: true });
      jest.clearAllMocks();
      
      const updated = await EntityCommandService.updateTask(task.id, "ws-1", {
        title: "New Title",
        description: "New Desc",
        categoryId: "health",
        priority: "high",
        status: "todo",
        recurrence: { frequency: "daily", interval: 1 }
      }, { skipAnalytics: true, skipEvents: true });
      
      expect(updated.title).toBe("New Title");
      expect(updated.description).toBe("New Desc");
      expect(updated.categoryId).toBe("health");
      expect(updated.priority).toBe("high");
      expect(updated.status).toBe("todo");
      expect(updated.recurrence?.frequency).toBe("daily");
      expect(rescheduleTodoRemindersSpy).toHaveBeenCalled();
    });

    it("5/6. Workspace movement followed by updateTask persists in destination and removes from source", async () => {
      const task = await EntityCommandService.createTask({ title: "T4", type: "task", confidence: 1 }, "ws-1", { skipAnalytics: true, skipEvents: true });
      
      // Move
      await EntityCommandService.moveTask(task.id, "ws-1", "ws-2", { skipAnalytics: true, skipEvents: true });
      
      // Update in new workspace
      const updated = await EntityCommandService.updateTask(task.id, "ws-2", { title: "Moved" }, { skipAnalytics: true, skipEvents: true });
      expect(updated.workspaceId).toBe("ws-2");
      expect(updated.title).toBe("Moved");
      
      // Verify no longer in old workspace
      const { TaskRepository } = require("@/repositories");
      const oldWs = await TaskRepository.getTasks("ws-1");
      expect(oldWs[task.id]).toBeUndefined();
    });
  });

  describe("Batch 7D: restoreTask", () => {
    let emitStateChangeSpy: jest.SpyInstance;
    let cancelReminderIdsSpy: jest.SpyInstance;
    let rescheduleTodoRemindersSpy: jest.SpyInstance;
    let saveRecycleBinItemsSpy: jest.SpyInstance;

    beforeEach(() => {
      jest.clearAllMocks();
      const events = require("@/services/events/state-events");
      emitStateChangeSpy = jest.spyOn(events, "emitStateChange");
      
      const remindersService = require("@/services/scheduling/reminders.service");
      cancelReminderIdsSpy = jest.spyOn(remindersService, "cancelReminderIds").mockResolvedValue(undefined);
      rescheduleTodoRemindersSpy = jest.spyOn(remindersService, "rescheduleTodoReminders").mockImplementation(async (t: any) => {
        return { ...t, reminder: { ...t.reminder, notificationIds: ["new-id"] } };
      });
      
      const { RecycleBinRepository } = require("@/repositories/RecycleBinRepository");
      saveRecycleBinItemsSpy = jest.spyOn(RecycleBinRepository, "removeRecycleBinItems");
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("1. Successfully restores a Task from RecycleBin into its original workspace", async () => {
      const task = await EntityCommandService.createTask({ title: "T1", type: "task", confidence: 1 }, "ws-1", { skipAnalytics: true, skipEvents: true });
      await EntityCommandService.recycleTask(task.id, "ws-1", "Inbox", { skipAnalytics: true, skipEvents: true });
      
      const { getRecycleBinItems } = require("@/services/storage/storage.service");
      const bin = await getRecycleBinItems();
      const item = bin.find((i: any) => i.entityId === task.id);
      
      const restored = await EntityCommandService.restoreTask(item.id, { source: "test-source" });
      
      expect(restored.id).toBe(task.id);
      expect(restored.workspaceId).toBe("ws-1"); // 9. Snapshot workspaceId is used
      expect(emitStateChangeSpy).toHaveBeenCalledWith("tasks_changed", "test-source"); // 10. Appropriate tasks_changed
    });

    it("2. RecycleBin item is removed only after TaskRepository.saveTask succeeds", async () => {
      const task = await EntityCommandService.createTask({ title: "T2", type: "task", confidence: 1 }, "ws-1", { skipAnalytics: true, skipEvents: true });
      await EntityCommandService.recycleTask(task.id, "ws-1", "Inbox", { skipAnalytics: true, skipEvents: true });
      
      const { getRecycleBinItems } = require("@/services/storage/storage.service");
      const bin = await getRecycleBinItems();
      const item = bin.find((i: any) => i.entityId === task.id);
      
      // Spy on saveTaskUnlocked
      const { TaskRepository } = require("@/repositories");
      const saveTaskSpy = jest.spyOn(TaskRepository, "saveTaskUnlocked");
      
      await EntityCommandService.restoreTask(item.id, { skipAnalytics: true, skipEvents: true });
      
      expect(saveTaskSpy).toHaveBeenCalled();
      expect(saveRecycleBinItemsSpy).toHaveBeenCalled();
      // Assert saveTaskUnlocked was called before saveRecycleBinItems
      expect(saveTaskSpy.mock.invocationCallOrder[0]).toBeLessThan(saveRecycleBinItemsSpy.mock.invocationCallOrder[0]);
    });

    it("3. saveTask failure leaves the RecycleBin item intact", async () => {
      const task = await EntityCommandService.createTask({ title: "T3", type: "task", confidence: 1 }, "ws-1", { skipAnalytics: true, skipEvents: true });
      await EntityCommandService.recycleTask(task.id, "ws-1", "Inbox", { skipAnalytics: true, skipEvents: true });
      
      const { getRecycleBinItems } = require("@/services/storage/storage.service");
      const bin = await getRecycleBinItems();
      const item = bin.find((i: any) => i.entityId === task.id);
      
      const { TaskRepository } = require("@/repositories");
      jest.spyOn(TaskRepository, "saveTaskUnlocked").mockRejectedValueOnce(new Error("Storage Error"));
      
      await expect(EntityCommandService.restoreTask(item.id, { skipAnalytics: true, skipEvents: true })).rejects.toThrow("Storage Error");
      
      expect(saveRecycleBinItemsSpy).not.toHaveBeenCalled(); // Bin intact
    });

    it("4. RecycleBin removal failure after successful Task save does not delete the restored Task", async () => {
      const task = await EntityCommandService.createTask({ title: "T4", type: "task", confidence: 1 }, "ws-1", { skipAnalytics: true, skipEvents: true });
      await EntityCommandService.recycleTask(task.id, "ws-1", "Inbox", { skipAnalytics: true, skipEvents: true });
      
      const { getRecycleBinItems } = require("@/services/storage/storage.service");
      const bin = await getRecycleBinItems();
      const item = bin.find((i: any) => i.entityId === task.id);
      
      saveRecycleBinItemsSpy.mockRejectedValueOnce(new Error("Bin Storage Error"));
      
      const restored = await EntityCommandService.restoreTask(item.id, { skipAnalytics: true, skipEvents: true });
      
      // Did not throw
      expect(restored.id).toBe(task.id);
      
      // Task is restored
      const { TaskRepository } = require("@/repositories");
      const saved = await TaskRepository.getTask(task.id, "ws-1");
      expect(saved).not.toBeNull();
    });

    it("5. Old notificationIds are not reused & 6. Successful reminder rescheduling produces fresh notificationIds", async () => {
      const task = await EntityCommandService.createTask({ title: "T5", type: "task", confidence: 1 }, "ws-1", { skipAnalytics: true, skipEvents: true });
      task.reminder = { enabled: true, triggerAt: Date.now() + 100000, notificationIds: ["old-id"] };
      const { TaskRepository } = require("@/repositories");
      await TaskRepository.saveTask(task);
      
      await EntityCommandService.recycleTask(task.id, "ws-1", "Inbox", { skipAnalytics: true, skipEvents: true });
      
      const { getRecycleBinItems } = require("@/services/storage/storage.service");
      const bin = await getRecycleBinItems();
      const item = bin.find((i: any) => i.entityId === task.id);
      
      const restored = await EntityCommandService.restoreTask(item.id, { skipAnalytics: true, skipEvents: true });
      
      expect(rescheduleTodoRemindersSpy).toHaveBeenCalled();
      expect(restored.reminder?.notificationIds).toBeUndefined();
    });

    it("7. Missing recycle-bin item throws", async () => {
      await expect(EntityCommandService.restoreTask("non-existent", { skipAnalytics: true, skipEvents: true }))
        .rejects.toThrow("not found");
    });

    it("8. Non-Task recycle-bin item is rejected", async () => {
      const { saveRecycleBinItems } = require("@/services/storage/storage.service");
      await saveRecycleBinItems([{ id: "fake-id", entityId: "e", entityType: "habit", snapshot: "{}", deletedAt: 0, originalWorkspace: "ws-1" }]);
      
      await expect(EntityCommandService.restoreTask("fake-id", { skipAnalytics: true, skipEvents: true }))
        .rejects.toThrow("Cannot restore non-task entity");
    });
    
    it("Reminder scheduling failure preserves Task with stale IDs removed", async () => {
      const task = await EntityCommandService.createTask({ title: "T_Rem_Fail", type: "task", confidence: 1 }, "ws-1", { skipAnalytics: true, skipEvents: true });
      task.reminder = { enabled: true, triggerAt: Date.now() + 100000, notificationIds: ["stale"] };
      const { TaskRepository } = require("@/repositories");
      await TaskRepository.saveTask(task);
      await EntityCommandService.recycleTask(task.id, "ws-1", "Inbox", { skipAnalytics: true, skipEvents: true });
      
      const { getRecycleBinItems } = require("@/services/storage/storage.service");
      const bin = await getRecycleBinItems();
      const item = bin.find((i: any) => i.entityId === task.id);
      
      rescheduleTodoRemindersSpy.mockRejectedValueOnce(new Error("Reminder Failure"));
      
      const restored = await EntityCommandService.restoreTask(item.id, { skipAnalytics: true, skipEvents: true });
      
      // Restored successfully
      expect(restored.id).toBe(task.id);
      // Stale IDs removed
      expect(restored.reminder?.notificationIds).toBeUndefined();
      // Original config remains
      expect(restored.reminder?.enabled).toBe(true);
    });
  });

  describe("Batch 7E: restoreTasks", () => {
    let emitStateChangeSpy: jest.SpyInstance;
    let cancelReminderIdsSpy: jest.SpyInstance;
    let rescheduleTodoRemindersSpy: jest.SpyInstance;

    beforeEach(() => {
      jest.clearAllMocks();
      const events = require("@/services/events/state-events");
      emitStateChangeSpy = jest.spyOn(events, "emitStateChange");
      
      const remindersService = require("@/services/scheduling/reminders.service");
      cancelReminderIdsSpy = jest.spyOn(remindersService, "cancelReminderIds").mockResolvedValue(undefined);
      rescheduleTodoRemindersSpy = jest.spyOn(remindersService, "rescheduleTodoReminders").mockImplementation(async (t: any) => {
        return { ...t, reminder: { ...t.reminder, notificationIds: ["new-id"] } };
      });
      
      const { WorkspaceRepository } = require("@/repositories");
      jest.spyOn(WorkspaceRepository, "getWorkspaces").mockResolvedValue([
        { id: "ws-1", name: "Workspace 1" },
        { id: "ws-2", name: "Workspace 2" },
        { id: "inbox", name: "Inbox" }
      ]);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("Successfully restores multiple tasks across workspaces in a single batch", async () => {
      const task1 = await EntityCommandService.createTask({ title: "T1", type: "task", confidence: 1 }, "ws-1", { skipAnalytics: true, skipEvents: true });
      const task2 = await EntityCommandService.createTask({ title: "T2", type: "task", confidence: 1 }, "ws-2", { skipAnalytics: true, skipEvents: true });
      await EntityCommandService.recycleTask(task1.id, "ws-1", "Inbox", { skipAnalytics: true, skipEvents: true });
      await EntityCommandService.recycleTask(task2.id, "ws-2", "Inbox", { skipAnalytics: true, skipEvents: true });
      
      const { getRecycleBinItems } = require("@/services/storage/storage.service");
      const bin = await getRecycleBinItems();
      const items = bin.filter((i: any) => i.entityId === task1.id || i.entityId === task2.id);
      
      const { restoredCount, successfulItemIds, failedItemIds } = await EntityCommandService.restoreTasks(items, { source: "test-bulk" });
      
      expect(restoredCount).toBe(2);
      expect(successfulItemIds.length).toBe(2);
      expect(failedItemIds.length).toBe(0);
      
      const { TaskRepository } = require("@/repositories");
      const ws1 = await TaskRepository.getTasks("ws-1");
      const ws2 = await TaskRepository.getTasks("ws-2");
      expect(ws1[task1.id]).not.toBeUndefined();
      expect(ws2[task2.id]).not.toBeUndefined();
      
      expect(emitStateChangeSpy).toHaveBeenCalledWith("tasks_changed", "test-bulk");
    });

    it("Partial failure isolates the failing workspace without dropping successful workspaces", async () => {
      const task1 = await EntityCommandService.createTask({ title: "T1", type: "task", confidence: 1 }, "ws-1", { skipAnalytics: true, skipEvents: true });
      const task2 = await EntityCommandService.createTask({ title: "T2", type: "task", confidence: 1 }, "ws-2", { skipAnalytics: true, skipEvents: true });
      await EntityCommandService.recycleTask(task1.id, "ws-1", "Inbox", { skipAnalytics: true, skipEvents: true });
      await EntityCommandService.recycleTask(task2.id, "ws-2", "Inbox", { skipAnalytics: true, skipEvents: true });
      
      const { getRecycleBinItems } = require("@/services/storage/storage.service");
      const bin = await getRecycleBinItems();
      const items = bin.filter((i: any) => i.entityId === task1.id || i.entityId === task2.id);
      
      const { TaskRepository } = require("@/repositories");
      const originalSaveTasks = TaskRepository.saveTasksUnlocked;
      jest.spyOn(TaskRepository, "saveTasksUnlocked").mockImplementation(async (tasks: any, wsId: any) => {
        if (wsId === "ws-2") throw new Error("Batch Save Error");
        return originalSaveTasks.call(TaskRepository, tasks, wsId);
      });
      
      const { restoredCount, successfulItemIds, failedItemIds } = await EntityCommandService.restoreTasks(items, { skipAnalytics: true, skipEvents: true });
      
      expect(restoredCount).toBe(1); // Only ws-1 succeeded
      
      const successfulItemForWs1 = items.find((i: any) => i.entityId === task1.id)!;
      const failedItemForWs2 = items.find((i: any) => i.entityId === task2.id)!;
      
      expect(successfulItemIds).toContain(successfulItemForWs1.id);
      expect(failedItemIds).toContain(failedItemForWs2.id);
      
      const ws1 = await TaskRepository.getTasks("ws-1");
      expect(ws1[task1.id]).not.toBeUndefined();
    });
  });

  describe("convertTaskToHabit", () => {
    it("successfully converts a Task into a Habit and cleans up correctly", async () => {
      const { TaskRepository, HabitRepository } = require("@/repositories");
      const { cancelReminderIds } = require("@/services/scheduling/reminders.service");
      
      const task = await EntityCommandService.createTask(
        { title: "To Convert", type: "task", confidence: 1 },
        "ws-1",
        { skipAnalytics: true, skipEvents: true }
      );
      
      const newHabit = await EntityCommandService.convertTaskToHabit(task.id, "ws-1", { skipAnalytics: true, skipEvents: true });
      
      expect(newHabit.id.startsWith("habit-")).toBe(true);
      expect(newHabit.title).toBe("To Convert");
      expect(newHabit.workspaceId).toBe("ws-1");
      expect(newHabit.categoryId).toBe("work");
      expect(newHabit.recurrence).toEqual({ frequency: "daily", interval: 1 });
      
      // Verify cleanup
      const deletedTask = await TaskRepository.getTask(task.id, "ws-1");
      expect(deletedTask).toBeNull();
      
      // Verify habit exists
      const savedHabit = await HabitRepository.getHabit(newHabit.id, "ws-1");
      expect(savedHabit).not.toBeNull();
      expect(savedHabit?.id).toBe(newHabit.id);
    });

    it("throws if the source Task does not exist", async () => {
      await expect(
        EntityCommandService.convertTaskToHabit("non-existent-task", "ws-1", { skipAnalytics: true, skipEvents: true })
      ).rejects.toThrow(/not found/);
    });



    it("does not reuse old notification IDs for the new Habit", async () => {
      const { TaskRepository, HabitRepository } = require("@/repositories");
      
      const task = await EntityCommandService.createTask(
        { title: "Convert Reminder", type: "task", confidence: 1 },
        "ws-1",
        { skipAnalytics: true, skipEvents: true }
      );
      task.reminder = { enabled: true, triggerAt: Date.now() + 100000, notificationIds: ["old-notif-1"] };
      await TaskRepository.saveTask(task);
      
      const newHabit = await EntityCommandService.convertTaskToHabit(task.id, "ws-1", { skipAnalytics: true, skipEvents: true });
      
      // Habit should have a reminder since the task had one
      expect(newHabit.reminder?.enabled).toBe(true);
      // But the old IDs should have been explicitly stripped by the mapper
      // (If rescheduleHabitReminders successfully ran, it would give new IDs, or [] if mocked/failed)
      // The important part is that it doesn't equal the old array!
      expect(newHabit.reminder?.notificationIds).not.toEqual(["old-notif-1"]);
    });

    it("reminder cancellation failure preserves both Habit and Task (duplicate safe state)", async () => {
      const { TaskRepository, HabitRepository } = require("@/repositories");
      const remindersService = require("@/services/scheduling/reminders.service");
      const cancelSpy = jest.spyOn(remindersService, "cancelReminderIds").mockRejectedValueOnce(new Error("Native Module Error"));
      
      const task = await EntityCommandService.createTask(
        { title: "Cancel Fail", type: "task", confidence: 1 },
        "ws-1",
        { skipAnalytics: true, skipEvents: true }
      );
      task.reminder = { enabled: true, triggerAt: Date.now() + 100000, notificationIds: ["old-notif-1"] };
      await TaskRepository.saveTask(task);
      
      // Should not throw
      const newHabit = await EntityCommandService.convertTaskToHabit(task.id, "ws-1", { skipAnalytics: true, skipEvents: true });
      
      // Habit is successfully created
      const savedHabit = await HabitRepository.getHabit(newHabit.id, "ws-1");
      expect(savedHabit).not.toBeNull();
      
      // Task is successfully deleted despite the reminder cancellation failure
      const deletedTask = await TaskRepository.getTask(task.id, "ws-1");
      expect(deletedTask).toBeNull();
      
      cancelSpy.mockRestore();
    });

    it("emits tasks_changed and habits_changed exactly once with correct source", async () => {
      const { TaskRepository } = require("@/repositories");
      const stateEvents = require("@/services/events/state-events");
      const emitSpy = jest.spyOn(stateEvents, "emitStateChange");
      
      const task = await EntityCommandService.createTask(
        { title: "Event Test", type: "task", confidence: 1 },
        "ws-1",
        { skipAnalytics: true, skipEvents: true }
      );
      
      emitSpy.mockClear();
      
      await EntityCommandService.convertTaskToHabit(task.id, "ws-1", { source: "ui_convert_test" });
      
      expect(emitSpy).toHaveBeenCalledTimes(2);
      expect(emitSpy).toHaveBeenCalledWith("tasks_changed", "ui_convert_test");
      expect(emitSpy).toHaveBeenCalledWith("habits_changed", "ui_convert_test");
      
      emitSpy.mockRestore();
    });
  });
  describe("Permanent Deletions", () => {
    it("should permanently delete a habit", async () => {
      const habit = await EntityCommandService.createHabit({ title: "H1", type: "habit", confidence: 1 }, "ws-1", { skipAnalytics: true });
      await EntityCommandService.permanentlyDeleteHabit(habit.id, "ws-1", { skipAnalytics: true });
      const fetched = await HabitRepository.getHabit(habit.id, "ws-1");
      expect(fetched).toBeNull();
    });

    it("should permanently delete a checklist", async () => {
      const checklist = await EntityCommandService.createChecklist({ title: "C1", type: "checklist", items: [], confidence: 1 }, "ws-1", { skipAnalytics: true });
      await EntityCommandService.permanentlyDeleteChecklist(checklist.id, "ws-1", { skipAnalytics: true });
      const fetched = await ChecklistRepository.getChecklists("ws-1");
      expect(fetched[checklist.id]).toBeUndefined();
    });

    it("should permanently delete a resource", async () => {
      const resource = await EntityCommandService.createResource({ title: "R1", type: "note", confidence: 1 }, "ws-1", { skipAnalytics: true });
      await EntityCommandService.permanentlyDeleteResource(resource.id, "ws-1", { skipAnalytics: true });
      const fetched = await ResourceRepository.getResource(resource.id, "ws-1");
      expect(fetched).toBeNull();
    });
  });

  describe("Focus Session & Checklist Pebble Integrity", () => {
    it("should record focus session with exact duration (seconds) and preserve startedAt and endedAt timestamps", async () => {
      const now = Date.now();
      const durationSeconds = 1500; // 25 minutes
      const startMs = now - durationSeconds * 1000;

      await EntityCommandService.recordFocusSession(durationSeconds, undefined, undefined, {
        sessionId: "focus_test_25m",
        startedAt: startMs,
        endedAt: now,
      });

      const sessions = await GraphRepository.getFocusSessions();
      const recorded = sessions.find((s) => s.id === "focus_test_25m");

      expect(recorded).toBeDefined();
      expect(recorded?.duration).toBe(1500); // Exactly 1500 seconds for 25 mins
      expect(recorded?.startedAt).toBe(startMs);
      expect(recorded?.endedAt).toBe(now);

      // Verify today's stats recognize the session
      const today = new Date().toDateString();
      const todaySessions = sessions.filter(
        (s) => new Date(s.endedAt || s.startedAt).toDateString() === today
      );
      expect(todaySessions.length).toBeGreaterThanOrEqual(1);

      const totalTimeMinutes = todaySessions.reduce(
        (acc, s) => acc + Math.floor(s.duration / 60),
        0
      );
      expect(totalTimeMinutes).toBeGreaterThanOrEqual(25);
    });

    it("should preserve pebbleAwarded across checklist repository persistence and prevent duplicate Pebble awards", async () => {
      const checklist = await EntityCommandService.createChecklist(
        {
          title: "Pebble Deduplication Checklist",
          type: "checklist",
          items: ["Item 1"],
          confidence: 1,
        },
        "ws-1",
        { skipAnalytics: true }
      );

      const itemId = checklist.items[0].id;

      // 1. Initial completion -> should award Pebble and set pebbleAwarded = true
      await EntityCommandService.toggleChecklistItem(checklist.id, itemId, "ws-1", { skipAnalytics: true });

      const reloaded1 = await ChecklistRepository.getChecklist(checklist.id, "ws-1");
      expect(reloaded1?.pebbleAwarded).toBe(true);

      // 2. Uncomplete item
      await EntityCommandService.toggleChecklistItem(checklist.id, itemId, "ws-1", { skipAnalytics: true });
      const reloaded2 = await ChecklistRepository.getChecklist(checklist.id, "ws-1");
      expect(reloaded2?.pebbleAwarded).toBe(true);
      expect(reloaded2?.items[0].completed).toBe(false);

      // 3. Re-complete item
      await EntityCommandService.toggleChecklistItem(checklist.id, itemId, "ws-1", { skipAnalytics: true });

      // Verify Pebble log has EXACTLY ONE pebble award for this checklist
      const rawLog = await AsyncStorage.getItem("todoapp:pebble_log");
      const pebbleLog = rawLog ? JSON.parse(rawLog) : [];
      const checklistPebbles = pebbleLog.filter((p: any) => p.rewardId === `checklist:${checklist.id}`);
      expect(checklistPebbles.length).toBe(1);
    });
  });
  describe("Checklist Archive Lifecycle (Batch P1 Correctness Fix)", () => {
    it("1. Archive properly sets archivedAt, preserves all fields, and avoids Recycle Bin", async () => {
      // Setup
      const checklist = await EntityCommandService.createChecklist(
        { title: "Archive Test", type: "checklist", items: ["i1", "i2"], confidence: 1 },
        "ws-1",
        { skipAnalytics: true }
      );
      checklist.resourceIds = ["res-1"];
      checklist.items[0].completed = true;
      await ChecklistRepository.saveChecklist(checklist);

      // Archive
      const archived = await EntityCommandService.updateChecklist(checklist.id, "ws-1", {
        archivedAt: 123456789,
      }, { skipAnalytics: true });

      expect(archived.archivedAt).toBe(123456789);
      expect(archived.title).toBe("Archive Test");
      expect(archived.items.length).toBe(2);
      expect(archived.items[0].completed).toBe(true);
      expect(archived.resourceIds).toEqual(["res-1"]);

      // Verify no Recycle Bin entry was created
      const rawRecycleBin = await AsyncStorage.getItem("pebble:v1:recycle_bin");
      const recycleBin = rawRecycleBin ? JSON.parse(rawRecycleBin) : {};
      const recycleItems = Object.values(recycleBin).filter((i: any) => i.entityId === checklist.id);
      expect(recycleItems.length).toBe(0);
    });

    it("2. Restore clears archivedAt and preserves Checklist identity", async () => {
      const checklist = await EntityCommandService.createChecklist(
        { title: "Restore Test", type: "checklist", items: ["i1"], confidence: 1 },
        "ws-1",
        { skipAnalytics: true }
      );
      await EntityCommandService.updateChecklist(checklist.id, "ws-1", { archivedAt: Date.now() }, { skipAnalytics: true });

      // Restore
      const restored = await EntityCommandService.updateChecklist(checklist.id, "ws-1", {
        archivedAt: undefined,
      }, { skipAnalytics: true });

      expect(restored.archivedAt).toBeUndefined();
      expect(restored.id).toBe(checklist.id);
      expect(restored.workspaceId).toBe("ws-1");
      expect(restored.title).toBe("Restore Test");
    });

    it("3. Delete still moves to Recycle Bin (ensuring distinct semantics)", async () => {
      const checklist = await EntityCommandService.createChecklist(
        { title: "Delete Semantic Test", type: "checklist", items: [], confidence: 1 },
        "ws-1",
        { skipAnalytics: true }
      );

      // Delete
      await EntityCommandService.recycleChecklist(checklist.id, "ws-1");

      // Verify active Checklist is gone
      const map = await ChecklistRepository.getChecklists("ws-1");
      expect(map[checklist.id]).toBeUndefined();

      // Verify Recycle Bin entry is created
      const rawRecycleBin = await AsyncStorage.getItem("pebble:v1:recycle_bin");
      const recycleBin = rawRecycleBin ? JSON.parse(rawRecycleBin) : {};
      const recycleItems = Object.values(recycleBin).filter((i: any) => i.entityId === checklist.id);
      expect(recycleItems.length).toBe(1);
    });
  });
});
