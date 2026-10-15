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

  it("Test G — Target deleted AND source workspace deleted", async () => {
    await WorkspaceRepository.saveWorkspaces([
      { id: "ws-source-g", name: "Source", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
      { id: "ws-dest-g", name: "Dest", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ]);
    const task = { id: "task-g", title: "Task", createdAt: 1, updatedAt: 1, completed: false, listId: "ws-source-g", kind: "todo", revision: 1, lifecycleGeneration: 1 };
    await TaskRepository.saveTasksUnlocked([task], "ws-source-g");
    await MoveJournalRepository.addOperation({
      operationId: "op-g", operationType: "move", entityType: "task", entityId: "task-g", sourceWorkspaceId: "ws-source-g", targetWorkspaceId: "ws-dest-g", timestamp: Date.now(), lifecycleGeneration: 1, expectedRevision: 1,
    });

    // Delete both workspaces
    await EntityCommandService.deleteWorkspace("ws-source-g");
    await EntityCommandService.deleteWorkspace("ws-dest-g");
    await MoveReconcilerService.reconcileAll();

    const journal = await MoveJournalRepository.getOperations();
    expect(journal.length).toBe(0);

    // Entity must be recoverable from the recycle bin of the source workspace
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    const sourceRecycle = binItems.find(i => i.entityId === "ws-source-g");
    expect(sourceRecycle).toBeDefined();

    const snapshot = JSON.parse(sourceRecycle!.snapshot);
    expect(snapshot.todos.length).toBe(1);
    expect(snapshot.todos[0].id).toBe("task-g");
  });

  it("Test H — Target deleted, source entity missing", async () => {
    await WorkspaceRepository.saveWorkspaces([
      { id: "ws-source-h", name: "Source", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
      { id: "ws-dest-h", name: "Dest", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ]);

    // Create journal but NO entity in source and NO entity in dest
    await MoveJournalRepository.addOperation({
      operationId: "op-h", operationType: "move", entityType: "task", entityId: "task-h", sourceWorkspaceId: "ws-source-h", targetWorkspaceId: "ws-dest-h", timestamp: Date.now(), lifecycleGeneration: 1, expectedRevision: 1,
    });

    await EntityCommandService.deleteWorkspace("ws-dest-h");
    await MoveReconcilerService.reconcileAll();

    const journal = await MoveJournalRepository.getOperations();
    // Draining happens through the target-workspace-deleted branch: reconcileMove checks
    // target existence first and removes the operation as OBSOLETE. That check short-circuits,
    // so the absent source entity is not what resolves this operation. The separate
    // "missing from both partitions -> PRESERVED" contract is covered by
    // MoveReconcilerMissingEverywhereHostileVerification.test.ts.
    expect(journal.length).toBe(0);
  });

  it("Test I — Destination entity already exists (split-brain write) followed by destination deletion", async () => {
    await WorkspaceRepository.saveWorkspaces([
      { id: "ws-source-i", name: "Source", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
      { id: "ws-dest-i", name: "Dest", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ]);
    const task = { id: "task-i", title: "Task", createdAt: 1, updatedAt: 1, completed: false, listId: "ws-source-i", kind: "todo", revision: 1, lifecycleGeneration: 1 };

    // Write to both to simulate a native write success but JS crash
    await TaskRepository.saveTasksUnlocked([task], "ws-source-i");
    await TaskRepository.saveTasksUnlocked([{...task, workspaceId: "ws-dest-i"}], "ws-dest-i");

    await MoveJournalRepository.addOperation({
      operationId: "op-i", operationType: "move", entityType: "task", entityId: "task-i", sourceWorkspaceId: "ws-source-i", targetWorkspaceId: "ws-dest-i", timestamp: Date.now(), lifecycleGeneration: 1, expectedRevision: 1,
    });

    // Delete target workspace
    await EntityCommandService.deleteWorkspace("ws-dest-i");

    await MoveReconcilerService.reconcileAll();

    const sourceTasks = await TaskRepository.getTasks("ws-source-i");
    expect(sourceTasks["task-i"]).toBeDefined(); // Since target was deleted, abort leaves source copy

    // The target copy was safely placed into the recycle bin by the deletion
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    const destRecycle = binItems.find(i => i.entityId === "ws-dest-i");
    const snapshot = JSON.parse(destRecycle!.snapshot);
    expect(snapshot.todos.length).toBe(1);
    expect(snapshot.todos[0].id).toBe("task-i");
  });
});
