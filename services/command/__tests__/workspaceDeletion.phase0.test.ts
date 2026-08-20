import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { TaskRepository } from "@/repositories/TaskRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { ChecklistRepository } from "@/repositories/ChecklistRepository";
import { ResourceRepository } from "@/repositories/ResourceRepository";
import { RecycleBinRepository } from "@/repositories/RecycleBinRepository";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

describe("Batch 8: Workspace Deletion Safety Fix", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("Workspace Deletion - captures all entities and clears active partitions", async () => {
    const wsId = "ws-test";
    await WorkspaceRepository.saveWorkspaces([{ id: wsId, name: "Test WS", emoji: "🧪", createdAt: Date.now(), updatedAt: Date.now() }]);

    const task = { id: "t-1", title: "Task 1", workspaceId: wsId };
    await TaskRepository.saveTasks([task], wsId);

    const habit = { id: "h-1", title: "Habit 1", workspaceId: wsId };
    await HabitRepository.saveHabit(habit);

    const checklist = { id: "c-1", title: "Checklist 1", workspaceId: wsId };
    await ChecklistRepository.saveChecklist(checklist);

    const resource = { id: "r-1", title: "Resource 1", type: "note", workspaceId: wsId };
    await ResourceRepository.saveResource(resource);

    // Verify setup
    expect((await WorkspaceRepository.getWorkspaces()).length).toBe(1);
    expect(Object.keys(await TaskRepository.getTasks(wsId)).length).toBe(1);
    expect(Object.keys(await HabitRepository.getHabits(wsId)).length).toBe(1);
    expect(Object.keys(await ChecklistRepository.getChecklists(wsId)).length).toBe(1);
    expect(Object.keys(await ResourceRepository.getResources(wsId)).length).toBe(1);

    // Execute
    await EntityCommandService.deleteWorkspace(wsId);
    
    // Verify Active Storage is empty
    expect((await WorkspaceRepository.getWorkspaces()).length).toBe(0);
    expect(Object.keys(await TaskRepository.getTasks(wsId)).length).toBe(0);
    expect(Object.keys(await HabitRepository.getHabits(wsId)).length).toBe(0);
    expect(Object.keys(await ChecklistRepository.getChecklists(wsId)).length).toBe(0);
    expect(Object.keys(await ResourceRepository.getResources(wsId)).length).toBe(0);

    // Verify Recycle Bin
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    expect(binItems.length).toBe(1);
    const item = binItems[0];
    expect(item.entityType).toBe("workspace");
    
    const snapshot = JSON.parse(item.snapshot);
    expect(snapshot.list.id).toBe(wsId);
    expect(snapshot.todos.length).toBe(1);
    expect(snapshot.habits.length).toBe(1);
    expect(snapshot.checklists.length).toBe(1);
    expect(snapshot.resources.length).toBe(1);
  });

  it("Workspace Deletion - Cleanup failure does not silently destroy the restore snapshot", async () => {
    const wsId = "ws-cleanup-fail";
    await WorkspaceRepository.saveWorkspaces([{ id: wsId, name: "Test WS", emoji: "🧪", createdAt: Date.now(), updatedAt: Date.now() }]);

    // Mock AsyncStorage to fail multiRemove
    const multiRemoveSpy = jest.spyOn(AsyncStorage, "multiRemove").mockRejectedValueOnce(new Error("Disk error"));

    await expect(EntityCommandService.deleteWorkspace(wsId)).rejects.toThrow(
      "Workspace deleted, but some related data could not be fully cleaned up."
    );

    // Workspace is deleted
    expect((await WorkspaceRepository.getWorkspaces()).length).toBe(0);

    // Recycle bin has the snapshot
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    expect(binItems.length).toBe(1);
    
    multiRemoveSpy.mockRestore();
  });

  it("Restore Workspace - recreates all entities safely", async () => {
    const wsId = "ws-test-2";
    
    // Simulate Recycle Bin
    const snapshot = {
      list: { id: wsId, name: "Test WS 2", emoji: "🚀", createdAt: Date.now(), updatedAt: Date.now() },
      todos: [{ id: "t-1", title: "Task", workspaceId: wsId }],
      habits: [{ id: "h-1", title: "Habit", workspaceId: wsId }],
      checklists: [{ id: "c-1", title: "Checklist", workspaceId: wsId }],
      resources: [{ id: "r-1", title: "Resource", type: "note", workspaceId: wsId }],
    };
    await RecycleBinRepository.addToRecycleBin("workspace", snapshot, undefined, { throwOnError: true });

    const binItems = await RecycleBinRepository.getRecycleBinItems();
    const binId = binItems[0].id;

    // Execute
    await EntityCommandService.restoreWorkspace(binId);

    // Verify Active Storage is populated
    expect((await WorkspaceRepository.getWorkspaces()).length).toBe(1);
    expect(Object.keys(await TaskRepository.getTasks(wsId)).length).toBe(1);
    expect(Object.keys(await HabitRepository.getHabits(wsId)).length).toBe(1);
    expect(Object.keys(await ChecklistRepository.getChecklists(wsId)).length).toBe(1);
    expect(Object.keys(await ResourceRepository.getResources(wsId)).length).toBe(1);

    // Verify Recycle Bin is empty
    expect((await RecycleBinRepository.getRecycleBinItems()).length).toBe(0);
  });

  it("Duplicate delete - does not crash and handles safely", async () => {
    // Calling deleteWorkspace twice should throw the second time because it's not found
    const wsId = "ws-test-3";
    await WorkspaceRepository.saveWorkspaces([{ id: wsId, name: "Test WS 3", emoji: "🤔", createdAt: Date.now(), updatedAt: Date.now() }]);

    await EntityCommandService.deleteWorkspace(wsId);
    
    await expect(EntityCommandService.deleteWorkspace(wsId)).rejects.toThrow("Workspace not found");
    
    // Ensure only 1 snapshot was created
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    expect(binItems.length).toBe(1);
  });
});
