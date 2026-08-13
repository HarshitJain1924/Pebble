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
});

describe("Phase 0 multi-key operation boundaries", () => {
  test.failing("does not leave a moved task in both workspaces when source deletion is interrupted", async () => {
    await TaskRepository.saveTask(task("ws-source"));
    jest.spyOn(TaskRepository, "deleteTask").mockRejectedValue(new Error("source delete failed"));
    await expect(EntityCommandService.moveTask("task-1", "ws-source", "ws-target", { skipEvents: true, skipAnalytics: true })).rejects.toThrow("source delete failed");
    const target = await TaskRepository.getTasks("ws-target");
    const source = await TaskRepository.getTasks("ws-source");
    expect(target["task-1"]).toBeUndefined();
    expect(source["task-1"]).toBeDefined();
  });

  test.failing("does not leave workspace entities or relationships dangling after deletion", async () => {
    await WorkspaceRepository.saveWorkspace(workspace);
    await TaskRepository.saveTask(task("ws-delete"));
    await GraphRepository.saveRelationship(relationship);
    await EntityCommandService.deleteWorkspace("ws-delete");
    expect((await WorkspaceRepository.getWorkspaces()).some((w) => w.id === "ws-delete")).toBe(false);
    expect((await TaskRepository.getTasks("ws-delete"))["task-1"]).toBeUndefined();
    expect(await GraphRepository.getRelated("task-1")).toHaveLength(0);
  });

  test.failing("does not leave both active and recycled copies after recycle is interrupted after bin write", async () => {
    await TaskRepository.saveTask(task("ws-source"));
    jest.spyOn(TaskRepository, "deleteTask").mockRejectedValue(new Error("active delete failed"));
    await expect(EntityCommandService.recycleTask("task-1", "ws-source", "Source", { skipEvents: true, skipAnalytics: true })).rejects.toThrow("active delete failed");
    const active = (await TaskRepository.getTasks("ws-source"))["task-1"];
    const recycled = (await RecycleBinRepository.getRecycleBinItems()).find((item) => item.entityId === "task-1");
    expect(Boolean(active) && Boolean(recycled)).toBe(false);
  });

  test.failing("does not leave active and recycle-bin copies after restore fails removing the bin entry", async () => {
    const item: RecycleBinItem = { id: "bin-1", entityType: "task", entityId: "task-1", snapshot: JSON.stringify(task("ws-source")), deletedAt: 1 };
    await RecycleBinRepository.saveRecycleBinItems([item]);
    jest.spyOn(RecycleBinRepository, "saveRecycleBinItems").mockRejectedValueOnce(new Error("bin removal failed"));
    await expect(EntityCommandService.restoreTask("bin-1", { skipEvents: true, skipAnalytics: true })).rejects.toThrow("bin removal failed");
    const active = (await TaskRepository.getTasks("ws-source"))["task-1"];
    const recycled = (await RecycleBinRepository.getRecycleBinItems()).find((entry) => entry.id === "bin-1");
    expect(Boolean(active) && Boolean(recycled)).toBe(false);
  });

  test.failing("does not schedule duplicate reminders when an interrupted restore is retried", async () => {
    const item: RecycleBinItem = { id: "bin-2", entityType: "task", entityId: "task-1", snapshot: JSON.stringify(task("ws-source")), deletedAt: 1 };
    await RecycleBinRepository.saveRecycleBinItems([item]);
    const saveBin = jest.spyOn(RecycleBinRepository, "saveRecycleBinItems").mockRejectedValueOnce(new Error("first bin removal failed"));
    await expect(EntityCommandService.restoreTask("bin-2", { skipEvents: true, skipAnalytics: true })).rejects.toThrow("first bin removal failed");
    saveBin.mockImplementation(async (items) => { await AsyncStorage.setItem("pebble:v1:recycle_bin", JSON.stringify(items)); });
    await EntityCommandService.restoreTask("bin-2", { skipEvents: true, skipAnalytics: true });
    const reminder = (await TaskRepository.getTasks("ws-source"))["task-1"].reminder;
    expect(reminder?.notificationIds).toEqual(["scheduled-once"]);
  });
});
