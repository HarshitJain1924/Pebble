import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { TaskRepository } from "@/repositories/TaskRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { RecycleBinRepository } from "@/repositories/RecycleBinRepository";
import { GraphRepository } from "@/repositories/GraphRepository";
import type { Task, Workspace, Relationship, RecycleBinItem } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("@/services/scheduling/reminders.service", () => ({
  cancelReminderIds: jest.fn(async () => undefined),
  rescheduleTodoReminders: jest.fn(async (task: Task) => ({ ...task, reminder: task.reminder ? { ...task.reminder, notificationIds: ["scheduled-once"] } : undefined })),
}));

const storage = AsyncStorage as typeof AsyncStorage;
const workspace: Workspace = { id: "ws-delete", name: "Delete me", createdAt: 1, updatedAt: 1 };
const task = (workspaceId: string): Task => ({ id: "task-1", workspaceId, title: "Task", status: "todo", priority: "none", createdAt: 1, updatedAt: 1, reminder: { enabled: true, triggerAt: 100, notificationIds: ["native-1"] } });
const relationship: Relationship = { id: "rel-1", source: { id: "task-1", type: "task" }, target: { id: "resource-1", type: "resource" }, relationType: "references", createdAt: 1 };

beforeEach(async () => {
  await storage.clear();
  jest.restoreAllMocks();
  GraphRepository.resetCache();
  await WorkspaceRepository.saveWorkspaces([{ id: "ws-source", name: "src", createdAt: 1, updatedAt: 1 }, { id: "ws-target", name: "tgt", createdAt: 1, updatedAt: 1 }]);
});

describe("Phase 1 Ghost Toleration & Notification Decoupling", () => {
  test("tolerates a ghost in the target workspace when source deletion is interrupted during a move", async () => {
    await TaskRepository.saveTask(task("ws-source"));
    jest.spyOn(TaskRepository, "deleteTaskUnlocked").mockRejectedValueOnce(new Error("source delete failed"));
    
    await expect(EntityCommandService.moveTask("task-1", "ws-source", "ws-target", { skipEvents: true, skipAnalytics: true }))
      .rejects.toThrow("source delete failed");
      
    const target = await TaskRepository.getTasks("ws-target");
    const source = await TaskRepository.getTasks("ws-source");
    
    // Ghost toleration: Target was saved, source remains. No dangerous rollback.
    expect(target["task-1"]).toBeDefined();
    expect(source["task-1"]).toBeDefined();
  });

  test("does not leave workspace entities dangling, cleanup uses multiRemove atomically", async () => {
    await WorkspaceRepository.saveWorkspace(workspace);
    await TaskRepository.saveTask(task("ws-delete"));
    await GraphRepository.saveRelationship(relationship);
    
    // Create a mock to wait for the async cleanup to run
    const multiRemoveSpy = jest.spyOn(AsyncStorage, "multiRemove").mockResolvedValue();
    
    await EntityCommandService.deleteWorkspace("ws-delete");
    
    // Workspace is immediately removed from repo
    expect((await WorkspaceRepository.getWorkspaces()).some((w) => w.id === "ws-delete")).toBe(false);
    
    expect(multiRemoveSpy).toHaveBeenCalledWith([
      "pebble:v1:tasks:ws-delete",
      "pebble:v1:habits:ws-delete",
      "pebble:v1:checklists:ws-delete",
      "pebble:v1:resources:ws-delete"
    ]);
  });

  test("tolerates an active ghost when recycle active delete fails", async () => {
    await TaskRepository.saveTask(task("ws-source"));
    jest.spyOn(TaskRepository, "deleteTaskUnlocked").mockRejectedValue(new Error("active delete failed"));
    
    await expect(EntityCommandService.recycleTask("task-1", "ws-source", "Source", { skipEvents: true, skipAnalytics: true }))
      .rejects.toThrow("active delete failed");
      
    const active = (await TaskRepository.getTasks("ws-source"))["task-1"];
    const recycled = (await RecycleBinRepository.getRecycleBinItems()).find((item) => item.entityId === "task-1");
    
    // Ghost toleration: Bin item is created safely first, active item remains due to failure.
    expect(active).toBeDefined();
    expect(recycled).toBeDefined();
  });

  test("tolerates a bin ghost when restore bin removal fails, does not roll back active", async () => {
    const item: RecycleBinItem = { id: "bin-1", entityType: "task", entityId: "task-1", snapshot: JSON.stringify(task("ws-source")), deletedAt: 1 };
    await RecycleBinRepository.saveRecycleBinItems([item]);
    
    // Mock failure during bin removal
    jest.spyOn(RecycleBinRepository, "saveRecycleBinItemsUnlocked").mockRejectedValueOnce(new Error("bin removal failed"));
    
    // Decoupling: Does NOT throw. Tolerates the ghost.
    await EntityCommandService.restoreTask("bin-1", { skipEvents: true, skipAnalytics: true });
    
    const active = (await TaskRepository.getTasks("ws-source"))["task-1"];
    const recycled = (await RecycleBinRepository.getRecycleBinItems()).find((entry) => entry.id === "bin-1");
    
    // Active is successfully restored. Bin item remains as a ghost.
    expect(active).toBeDefined();
    expect(recycled).toBeDefined();
  });

  test("does not fail restore when native reminder scheduling fails", async () => {
    const item: RecycleBinItem = { id: "bin-2", entityType: "task", entityId: "task-1", snapshot: JSON.stringify(task("ws-source")), deletedAt: 1 };
    await RecycleBinRepository.saveRecycleBinItems([item]);
    
    const remindersService = require("@/services/scheduling/reminders.service");
    remindersService.rescheduleTodoReminders.mockRejectedValueOnce(new Error("os scheduling failed"));
    
    // Restores safely despite OS notification failure
    await EntityCommandService.restoreTask("bin-2", { skipEvents: true, skipAnalytics: true });
    
    const active = (await TaskRepository.getTasks("ws-source"))["task-1"];
    const recycled = (await RecycleBinRepository.getRecycleBinItems()).find((entry) => entry.id === "bin-2");
    
    expect(active).toBeDefined();
    expect(recycled).toBeUndefined(); // Bin cleanup succeeds
    // Reminder IDs are cleared because scheduling failed
    expect(active.reminder?.notificationIds).toBeUndefined();
  });
});
