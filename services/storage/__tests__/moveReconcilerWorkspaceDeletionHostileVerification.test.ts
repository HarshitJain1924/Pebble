import AsyncStorage from "@react-native-async-storage/async-storage";
import { MoveReconcilerService } from "@/services/storage/MoveReconcilerService";
import { MoveJournalRepository } from "@/repositories/MoveJournalRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { TaskRepository } from "@/repositories/TaskRepository";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { withLock } from "@/shared/utils/mutex";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

describe("MoveReconciler & Workspace Deletion Race", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.clear();
  });

  it("Test A — delete destination while recovery is pending (The Race)", async () => {
    // 1. Setup Source and Destination Workspaces
    await WorkspaceRepository.saveWorkspaces([
      { id: "ws-source", name: "Source WS", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
      { id: "ws-dest", name: "Dest WS", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ]);

    // 2. Setup a Task in Source
    const task = { id: "task-1", title: "Crucial Task", createdAt: 1, updatedAt: 1, completed: false, listId: "ws-source", kind: "todo", revision: 1, lifecycleGeneration: 1 };
    await TaskRepository.saveTasksUnlocked([task], "ws-source");

    // 3. Seed a pending MoveJournal operation
    await MoveJournalRepository.addOperation({
      operationId: "op-1",
      operationType: "move",
      entityType: "task",
      entityId: "task-1",
      sourceWorkspaceId: "ws-source",
      targetWorkspaceId: "ws-dest",
      timestamp: Date.now(),
      lifecycleGeneration: 1,
      expectedRevision: 1,
    });

    // Simulate deleteWorkspace completing first
    await EntityCommandService.deleteWorkspace("ws-dest");

    // Now Reconciler gets the lock and runs
    await MoveReconcilerService.reconcileAll();

    // 5. Verify the state
    const workspaces = await WorkspaceRepository.getWorkspaces();
    expect(workspaces.some(w => w.id === "ws-dest")).toBe(false); // Workspace is GONE

    const destTasks = await TaskRepository.getTasks("ws-dest");
    expect(Object.keys(destTasks).length).toBe(0); // Should safely abort write

    const sourceTasks = await TaskRepository.getTasks("ws-source");
    expect(Object.keys(sourceTasks).length).toBe(1); // Task remains safe in source!
  });

  it("Test C — reconciler wins first", async () => {
    await WorkspaceRepository.saveWorkspaces([
      { id: "ws-source-c", name: "Source WS", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
      { id: "ws-dest-c", name: "Dest WS", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ]);
    const task = { id: "task-c", title: "Crucial Task", createdAt: 1, updatedAt: 1, completed: false, listId: "ws-source-c", kind: "todo", revision: 1, lifecycleGeneration: 1 };
    await TaskRepository.saveTasksUnlocked([task], "ws-source-c");
    await MoveJournalRepository.addOperation({
      operationId: "op-c", operationType: "move", entityType: "task", entityId: "task-c", sourceWorkspaceId: "ws-source-c", targetWorkspaceId: "ws-dest-c", timestamp: Date.now(), lifecycleGeneration: 1, expectedRevision: 1,
    });

    // Reconciler wins and completes first
    await MoveReconcilerService.reconcileAll();
    
    // Then deleteWorkspace executes
    await EntityCommandService.deleteWorkspace("ws-dest-c");

    // The task should be safely in the recycle bin for ws-dest-c
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    const destRecycle = binItems.find(i => i.entityId === "ws-dest-c");
    expect(destRecycle).toBeDefined();
    const snapshot = JSON.parse(destRecycle!.snapshot);
    expect(snapshot.todos.length).toBe(1);
    expect(snapshot.todos[0].id).toBe("task-c");
  });

  it("Test D — workspace metadata disappears during recovery", async () => {
    await WorkspaceRepository.saveWorkspaces([
      { id: "ws-source-d", name: "Source WS", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
      { id: "ws-dest-d", name: "Dest WS", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ]);
    const task = { id: "task-d", title: "Crucial Task", createdAt: 1, updatedAt: 1, completed: false, listId: "ws-source-d", kind: "todo", revision: 1, lifecycleGeneration: 1 };
    await TaskRepository.saveTasksUnlocked([task], "ws-source-d");
    await MoveJournalRepository.addOperation({
      operationId: "op-d", operationType: "move", entityType: "task", entityId: "task-d", sourceWorkspaceId: "ws-source-d", targetWorkspaceId: "ws-dest-d", timestamp: Date.now(), lifecycleGeneration: 1, expectedRevision: 1,
    });

    // Directly delete the workspace metadata WITHOUT deleting the partition.
    // This perfectly models the race where MoveReconciler reads the partition (which still exists),
    // but the workspace is actually gone.
    const workspaces = await WorkspaceRepository.getWorkspaces();
    await WorkspaceRepository.saveWorkspaces(workspaces.filter(w => w.id !== "ws-dest-d"));

    await MoveReconcilerService.reconcileAll();

    // Verify it aborted safely
    const destTasks = await TaskRepository.getTasks("ws-dest-d");
    expect(Object.keys(destTasks).length).toBe(0); // Did not write to dest
    
    const sourceTasks = await TaskRepository.getTasks("ws-source-d");
    expect(Object.keys(sourceTasks).length).toBe(1); // Left in source!
    expect(sourceTasks["task-d"]).toBeDefined();
    
    const journal = await MoveJournalRepository.getOperations();
    expect(journal.length).toBe(0); // Cleaned up!
  });

  it("Test E — native write succeeds then JS throws (idempotency)", async () => {
    await WorkspaceRepository.saveWorkspaces([
      { id: "ws-source-e", name: "Source WS", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
      { id: "ws-dest-e", name: "Dest WS", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ]);
    const task = { id: "task-e", title: "Crucial Task", createdAt: 1, updatedAt: 1, completed: false, listId: "ws-source-e", kind: "todo", revision: 1, lifecycleGeneration: 1 };
    
    // Simulate Native Write Success: The task is in BOTH partitions because JS crashed before removing from source!
    await TaskRepository.saveTasksUnlocked([task], "ws-source-e");
    await TaskRepository.saveTasksUnlocked([{...task, workspaceId: "ws-dest-e"}], "ws-dest-e");
    
    await MoveJournalRepository.addOperation({
      operationId: "op-e", operationType: "move", entityType: "task", entityId: "task-e", sourceWorkspaceId: "ws-source-e", targetWorkspaceId: "ws-dest-e", timestamp: Date.now(), lifecycleGeneration: 1, expectedRevision: 1,
    });

    await MoveReconcilerService.reconcileAll();

    // Verify it resolved safely
    const destTasks = await TaskRepository.getTasks("ws-dest-e");
    expect(Object.keys(destTasks).length).toBe(1);
    
    const sourceTasks = await TaskRepository.getTasks("ws-source-e");
    expect(Object.keys(sourceTasks).length).toBe(0); // Cleaned up!
    
    const journal = await MoveJournalRepository.getOperations();
    expect(journal.length).toBe(0); // Cleaned up!
  });

  it("Test F — repeated reconciliation", async () => {
    await WorkspaceRepository.saveWorkspaces([
      { id: "ws-source-f", name: "Source WS", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
      { id: "ws-dest-f", name: "Dest WS", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ]);
    const task = { id: "task-f", title: "Crucial Task", createdAt: 1, updatedAt: 1, completed: false, listId: "ws-source-f", kind: "todo", revision: 1, lifecycleGeneration: 1 };
    await TaskRepository.saveTasksUnlocked([task], "ws-source-f");
    await MoveJournalRepository.addOperation({
      operationId: "op-f", operationType: "move", entityType: "task", entityId: "task-f", sourceWorkspaceId: "ws-source-f", targetWorkspaceId: "ws-dest-f", timestamp: Date.now(), lifecycleGeneration: 1, expectedRevision: 1,
    });

    await MoveReconcilerService.reconcileAll();
    await MoveReconcilerService.reconcileAll();
    await MoveReconcilerService.reconcileAll();

    const destTasks = await TaskRepository.getTasks("ws-dest-f");
    expect(Object.keys(destTasks).length).toBe(1);
    
    const sourceTasks = await TaskRepository.getTasks("ws-source-f");
    expect(Object.keys(sourceTasks).length).toBe(0);
  });
});
