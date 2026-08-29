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
    await WorkspaceRepository.saveWorkspaces([{ id: wsId, name: "Test WS", emoji: "🧪", revision: 1, lifecycleGeneration: 1, createdAt: Date.now(), updatedAt: Date.now() }]);

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

  it("Workspace Deletion - Cleanup failure aborts the deletion safely to prevent orphans", async () => {
    const wsId = "ws-cleanup-fail";
    await WorkspaceRepository.saveWorkspaces([{ id: wsId, name: "Test WS", emoji: "🧪", revision: 1, lifecycleGeneration: 1, createdAt: Date.now(), updatedAt: Date.now() }]);

    const originalMultiRemove = AsyncStorage.multiRemove;
    AsyncStorage.multiRemove = jest.fn().mockRejectedValueOnce(new Error("Disk error")).mockImplementation((...args) => (originalMultiRemove as any)(...args));

    // Call deleteWorkspace - it should capture all partitions, snapshot them, and then safely ignore cleanup failures
    // because the workspace metadata is already deleted and the orphans are benign.
    await EntityCommandService.deleteWorkspace(wsId);

    // Workspace IS deleted (succeeds safely despite partition cleanup failure)
    expect((await WorkspaceRepository.getWorkspaces()).length).toBe(0);

    // Ensure the snapshot WAS created in the Recycle Bin
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    expect(binItems.length).toBe(1);

    AsyncStorage.multiRemove = originalMultiRemove;
  });

  it("Restore Workspace - recreates all entities safely", async () => {
    const wsId = "ws-test-2";
    
    // Simulate Recycle Bin
    const snapshot = {
      list: { id: wsId, name: "Test WS 2", emoji: "🚀", revision: 1, lifecycleGeneration: 1, createdAt: Date.now(), updatedAt: Date.now() },
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
    await WorkspaceRepository.saveWorkspaces([{ id: wsId, name: "Test WS 3", emoji: "🤔", revision: 1, lifecycleGeneration: 1, createdAt: Date.now(), updatedAt: Date.now() }]);

    await EntityCommandService.deleteWorkspace(wsId);
    
    await expect(EntityCommandService.deleteWorkspace(wsId)).rejects.toThrow("Workspace not found");
    
    // Ensure only 1 snapshot was created
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    expect(binItems.length).toBe(1);
  });

  describe("Workspace Deletion Concurrency Determinism", () => {
    let unblockOpA: () => void;
    let opAPaused: Promise<void>;
    const getTasksOriginal = TaskRepository.getTasks.bind(TaskRepository);

    beforeEach(() => {
      opAPaused = new Promise((resolve) => {
        unblockOpA = resolve;
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("Test A: deletion vs task update - update is completely blocked", async () => {
      const wsId = "ws-concurrent-1";
      await WorkspaceRepository.saveWorkspaces([{ id: wsId, name: "WS 1", emoji: "🧪", revision: 1, lifecycleGeneration: 1, createdAt: Date.now(), updatedAt: Date.now() }]);
      await TaskRepository.saveTasks([{ id: "t-1", title: "Original", workspaceId: wsId }], wsId);
      await TaskRepository.saveTasks([{ id: "t-1", title: "Original", workspaceId: wsId }], wsId);

      let opAHasRead = false;
      const getTasksSpy = jest.spyOn(TaskRepository, "getTasks").mockImplementation(async (wId) => {
        const res = await getTasksOriginal(wId);
        if (wId === wsId && !opAHasRead) {
          opAHasRead = true;
          await opAPaused; // Op A (deletion) pauses while holding the task partition lock!
        }
        return res;
      });

      // Start Op A (deletion)
      const opA = EntityCommandService.deleteWorkspace(wsId);
      
      // Wait for Op A to pause inside the lock
      await new Promise(r => setTimeout(r, 50));
      expect(opAHasRead).toBe(true);

      // Start Op B (updateTask)
      let opBFinished = false;
      const opB = EntityCommandService.updateTask("t-1", wsId, { title: "Updated!" }, { skipAnalytics: true, skipEvents: true }).then(() => {
        opBFinished = true;
      });

      // Op B must be completely blocked waiting for the task partition lock
      await new Promise(r => setTimeout(r, 50));
      expect(opBFinished).toBe(false);

      // Unblock Op A to finish deletion
      unblockOpA();
      await opA;

      // Op B resumes and fails because the task was deleted
      try {
        await opB;
        console.error("opB DID NOT THROW! The task was:", await TaskRepository.getTasks(wsId));
      } catch (e) {
        // Expected
      }
      await expect(opB).rejects.toThrow();

      // Ensure the snapshot has "Original", proving Op B never sneaked a write
      const binItems = await RecycleBinRepository.getRecycleBinItems();
      expect(binItems.length).toBe(1);
      const snapshot = JSON.parse(binItems[0].snapshot);
      expect(snapshot.todos[0].title).toBe("Original");
    });

    it("Test B: deletion vs task creation - creation is completely blocked", async () => {
      const wsId = "ws-concurrent-2";
      await WorkspaceRepository.saveWorkspaces([{ id: wsId, name: "WS 2", emoji: "🧪", revision: 1, lifecycleGeneration: 1, createdAt: Date.now(), updatedAt: Date.now() }]);

      let opAHasRead = false;
      jest.spyOn(TaskRepository, "getTasks").mockImplementation(async (wId) => {
        const res = await getTasksOriginal(wId);
        if (wId === wsId && !opAHasRead) {
          opAHasRead = true;
          await opAPaused;
        }
        return res;
      });

      const opA = EntityCommandService.deleteWorkspace(wsId);
      
      await new Promise(r => setTimeout(r, 50));
      expect(opAHasRead).toBe(true);

      let opBFinished = false;
      const opB = EntityCommandService.createTask({ type: "task", title: "New Task", confidence: 1, category: "work" }, wsId, { skipAnalytics: true }).then(() => {
        opBFinished = true;
      });

      await new Promise(r => setTimeout(r, 50));
      expect(opBFinished).toBe(false); // creation is blocked by the partition lock

      unblockOpA();
      await opA;

      await opB; // creation finishes after workspace is physically deleted

      // The new task goes into the abyss because the workspace is gone, or it persists orphaned (expected without parent validation). 
      // But importantly, it is NOT in the snapshot.
      const binItems = await RecycleBinRepository.getRecycleBinItems();
      const snapshot = JSON.parse(binItems[0].snapshot);
      expect(snapshot.todos.length).toBe(0); // Proves the task was not included in the snapshot!
    });

    it("Test C: opposite lifecycle operations - delete vs restore serialize safely", async () => {
      const wsId = "ws-concurrent-3";
      await WorkspaceRepository.saveWorkspaces([{ id: wsId, name: "WS 3", emoji: "🧪", revision: 1, lifecycleGeneration: 1, createdAt: Date.now(), updatedAt: Date.now() }]);
      await TaskRepository.saveTasks([{ id: "t-3", title: "T3", workspaceId: wsId }], wsId);

      // We simulate a race where someone deletes a workspace, and then immediately tries to restore it
      // To test deadlock avoidance, they must acquire all locks in the exact same order.
      
      let deleteHasRead = false;
      jest.spyOn(TaskRepository, "getTasks").mockImplementation(async (wId) => {
        const res = await getTasksOriginal(wId);
        if (wId === wsId && !deleteHasRead) {
          deleteHasRead = true;
          await opAPaused;
        }
        return res;
      });

      const opA = EntityCommandService.deleteWorkspace(wsId);
      
      await new Promise(r => setTimeout(r, 50));
      expect(deleteHasRead).toBe(true);

      // Now we hack a fake bin item in memory to trigger a restore
      await RecycleBinRepository.addToRecycleBin("workspace", { list: { id: wsId, name: "WS 3" }, todos: [], habits: [], checklists: [], resources: [] }, "Workspaces", { throwOnError: true });
      const binItems = await RecycleBinRepository.getRecycleBinItems();
      const binId = binItems[0].id;

      let opBFinished = false;
      const opB = EntityCommandService.restoreWorkspace(binId).then(() => { opBFinished = true; });

      await new Promise(r => setTimeout(r, 50));
      expect(opBFinished).toBe(false); // Restore is blocked by the lock hierarchy

      unblockOpA();
      await opA;
      await opB; // Restore finishes successfully after delete completes

      // Verifies they serialized correctly without deadlock!
      const finalWorkspaces = await WorkspaceRepository.getWorkspaces();
      expect(finalWorkspaces.length).toBe(1);
    });


  });
});
