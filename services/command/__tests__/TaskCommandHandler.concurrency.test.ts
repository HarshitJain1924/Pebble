import { TaskCommandHandler } from "../handlers/TaskCommandHandler";
import { TaskRepository } from "@/repositories";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

describe("TaskCommandHandler Concurrency", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
    const { WorkspaceRepository } = require("@/repositories/WorkspaceRepository");
    jest.spyOn(WorkspaceRepository, "getWorkspaces")
      .mockResolvedValue([{ id: "source-ws", name: "src" }, { id: "target-ws", name: "tgt" }, { id: "workspace-A", name: "wa" }, { id: "workspace-B", name: "wb" }]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should serialize read-modify-write via workspace partition lock to prevent stale updates", async () => {
    const workspaceId = INBOX_WORKSPACE_ID;
    const taskId = "task-rmw-1";

    // 1. Setup initial state
    await TaskRepository.saveTasks([{ id: taskId, title: "Initial Title", status: "todo", workspaceId }], workspaceId);

    const originalGetTasks = TaskRepository.getTasks.bind(TaskRepository);

    let releaseOpA: () => void;
    const opAPaused = new Promise<void>((resolve) => {
      releaseOpA = resolve;
    });

    let getTasksCallCount = 0;
    let opACompleted = false;

    // 2. Intercept the reads
    jest.spyOn(TaskRepository, "getTasks").mockImplementation(async (wsId) => {
      getTasksCallCount++;

      // We only want to pause the FIRST read, which will be Operation A's initial read inside the lock
      if (getTasksCallCount === 1) {
        await opAPaused;
      }

      return originalGetTasks(wsId);
    });

    // 3. Start Operation A (reads and blocks)
    const opA = TaskCommandHandler.updateTask(taskId, workspaceId, { title: "Title A" })
      .then((res) => {
        opACompleted = true;
        return res;
      });

    // Let the event loop run so Operation A enters the lock and pauses
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 4. Start Operation B
    const opB = TaskCommandHandler.updateTask(taskId, workspaceId, { status: "completed" });

    // Let the event loop run again. Operation B should be blocked waiting for the lock.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Prove Operation B is blocked and has not entered the critical section
    // If there were no lock, getTasksCallCount would be 2 (Op B would have executed its initial read)
    expect(getTasksCallCount).toBe(1);
    expect(opACompleted).toBe(false);

    // 5. Release Operation A
    releaseOpA!();

    // Wait for both operations to finish
    await Promise.all([opA, opB]);

    // 6. Verify they both fully executed
    expect(opACompleted).toBe(true);
    expect(getTasksCallCount).toBeGreaterThanOrEqual(4);

    // 7. Verify the data invariant (no lost updates)
    const finalTasks = await TaskRepository.getTasks(workspaceId);
    const finalTask = finalTasks[taskId];

    // If Operation B did a stale read-modify-write, it would have reverted the title to "Initial Title"
    expect(finalTask.title).toBe("Title A");
    expect(finalTask.status).toBe("completed");
  });

  it("should serialize completeTask and updateTask via workspace partition lock", async () => {
    const workspaceId = INBOX_WORKSPACE_ID;
    const taskId = "task-complete-1";

    // 1. Setup initial state
    await TaskRepository.saveTasks([{ id: taskId, title: "Initial Title", status: "todo", workspaceId }], workspaceId);

    const originalGetTasks = TaskRepository.getTasks.bind(TaskRepository);

    let releaseOpA: () => void;
    const opAPaused = new Promise<void>((resolve) => {
      releaseOpA = resolve;
    });

    let getTasksCallCount = 0;
    let opACompleted = false;

    // 2. Intercept the reads
    jest.spyOn(TaskRepository, "getTasks").mockImplementation(async (wsId) => {
      getTasksCallCount++;

      // Pause the FIRST read (Operation A's initial read inside the lock)
      if (getTasksCallCount === 1) {
        await opAPaused;
      }

      return originalGetTasks(wsId);
    });

    // 3. Start Operation A: completeTask (reads and blocks)
    // We disable analytics/events/plugin-dispatch where possible to minimize test noise,
    // though the lock behavior is what we're testing.
    const opA = TaskCommandHandler.completeTask(taskId, workspaceId, { skipAnalytics: true, skipEvents: true })
      .then((res) => {
        opACompleted = true;
        return res;
      });

    // Let the event loop run so Operation A enters the lock and pauses
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 4. Start Operation B: updateTask
    const opB = TaskCommandHandler.updateTask(taskId, workspaceId, { title: "Updated Title" }, { skipAnalytics: true, skipEvents: true });

    // Let the event loop run again. Operation B should be blocked waiting for the lock.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Prove Operation B is blocked
    expect(getTasksCallCount).toBe(1);
    expect(opACompleted).toBe(false);

    // 5. Release Operation A
    releaseOpA!();

    // Wait for both operations to finish
    await Promise.all([opA, opB]);

    // 6. Verify they both fully executed
    expect(opACompleted).toBe(true);
    expect(getTasksCallCount).toBeGreaterThanOrEqual(4);

    // 7. Verify the data invariant (no lost updates)
    const finalTasks = await TaskRepository.getTasks(workspaceId);
    const finalTask = finalTasks[taskId];

    // If Operation B did a stale read-modify-write (e.g. read before Op A persisted completion),
    // it would have reverted the status back to "todo" when it persisted its title update.
    expect(finalTask.title).toBe("Updated Title");
    expect(finalTask.status).toBe("completed");
    expect(finalTask.completedAt).toBeDefined();
  });

  it("should serialize uncompleteTask and updateTask via workspace partition lock", async () => {
    const workspaceId = INBOX_WORKSPACE_ID;
    const taskId = "task-uncomplete-1";

    // 1. Setup initial state (completed)
    await TaskRepository.saveTasks([{ id: taskId, title: "Initial Title", status: "completed", completedAt: 12345, workspaceId }], workspaceId);

    const originalGetTasks = TaskRepository.getTasks.bind(TaskRepository);

    let releaseOpA: () => void;
    const opAPaused = new Promise<void>((resolve) => {
      releaseOpA = resolve;
    });

    let getTasksCallCount = 0;
    let opACompleted = false;

    // 2. Intercept the reads
    jest.spyOn(TaskRepository, "getTasks").mockImplementation(async (wsId) => {
      getTasksCallCount++;

      // Pause the FIRST read (Operation A's initial read inside the lock)
      if (getTasksCallCount === 1) {
        await opAPaused;
      }

      return originalGetTasks(wsId);
    });

    // 3. Start Operation A: uncompleteTask (reads and blocks)
    const opA = TaskCommandHandler.uncompleteTask(taskId, workspaceId, { skipAnalytics: true, skipEvents: true })
      .then((res) => {
        opACompleted = true;
        return res;
      });

    // Let the event loop run so Operation A enters the lock and pauses
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 4. Start Operation B: updateTask
    const opB = TaskCommandHandler.updateTask(taskId, workspaceId, { title: "Updated Title" }, { skipAnalytics: true, skipEvents: true });

    // Let the event loop run again. Operation B should be blocked waiting for the lock.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Prove Operation B is blocked
    expect(getTasksCallCount).toBe(1);
    expect(opACompleted).toBe(false);

    // 5. Release Operation A
    releaseOpA!();

    // Wait for both operations to finish
    await Promise.all([opA, opB]);

    // 6. Verify they both fully executed
    expect(opACompleted).toBe(true);
    expect(getTasksCallCount).toBeGreaterThanOrEqual(4);

    // 7. Verify the data invariant (no lost updates)
    const finalTasks = await TaskRepository.getTasks(workspaceId);
    const finalTask = finalTasks[taskId];

    // If Operation B did a stale read-modify-write,
    // it would have reverted the status back to "completed" when it persisted its title update.
    expect(finalTask.title).toBe("Updated Title");
    expect(finalTask.status).toBe("todo");
    expect(finalTask.completedAt).toBeUndefined();
  });

  it("should serialize moveTask and updateTask to prevent data loss on source", async () => {
    const sourceWorkspaceId = "source-ws";
    const targetWorkspaceId = "target-ws";
    const taskId = "task-move-1";

    await TaskRepository.saveTasks([{ id: taskId, title: "Initial Title", status: "todo", workspaceId: sourceWorkspaceId }], sourceWorkspaceId);

    const originalGetTasks = TaskRepository.getTasks.bind(TaskRepository);

    let releaseOpA: () => void;
    const opAPaused = new Promise<void>((resolve) => {
      releaseOpA = resolve;
    });

    let getTasksCallCount = 0;
    let opACompleted = false;

    jest.spyOn(TaskRepository, "getTasks").mockImplementation(async (wsId) => {
      if (wsId === sourceWorkspaceId) {
        getTasksCallCount++;
        // We only want to pause the FIRST read, which will be Operation A's initial read inside the lock
        if (getTasksCallCount === 1) {
          await opAPaused;
        }
      }
      return originalGetTasks(wsId);
    });

    // Start Operation A (reads and blocks)
    const opA = TaskCommandHandler.moveTask(taskId, sourceWorkspaceId, targetWorkspaceId, { skipAnalytics: true, skipEvents: true })
      .then((res) => {
        opACompleted = true;
        return res;
      });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Start Operation B
    const opB = TaskCommandHandler.updateTask(taskId, sourceWorkspaceId, { title: "Updated Title" }, { skipAnalytics: true, skipEvents: true });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Prove Operation B is blocked
    expect(getTasksCallCount).toBe(1);
    expect(opACompleted).toBe(false);

    // Release Operation A
    releaseOpA!();

    // Wait for both operations. OpB should throw because the task was moved.
    await expect(opB).rejects.toThrow(`Task ${taskId} not found in workspace ${sourceWorkspaceId}`);
    const movedTask = await opA;
    
    expect(movedTask.workspaceId).toBe(targetWorkspaceId);
    expect(movedTask.title).toBe("Initial Title");

    const sourceTasks = await TaskRepository.getTasks(sourceWorkspaceId);
    expect(sourceTasks[taskId]).toBeUndefined();

    const targetTasks = await TaskRepository.getTasks(targetWorkspaceId);
    expect(targetTasks[taskId]).toBeDefined();
    expect(targetTasks[taskId].title).toBe("Initial Title");
  });

  it("should not deadlock when moving tasks in opposite directions concurrently", async () => {
    const wsA = "workspace-A";
    const wsB = "workspace-B";
    const task1 = "task-1";
    const task2 = "task-2";

    await TaskRepository.saveTasks([{ id: task1, title: "Task 1", status: "todo", workspaceId: wsA }], wsA);
    await TaskRepository.saveTasks([{ id: task2, title: "Task 2", status: "todo", workspaceId: wsB }], wsB);

    const opA = TaskCommandHandler.moveTask(task1, wsA, wsB, { skipAnalytics: true, skipEvents: true });
    const opB = TaskCommandHandler.moveTask(task2, wsB, wsA, { skipAnalytics: true, skipEvents: true });

    const [resA, resB] = await Promise.all([opA, opB]);

    expect(resA.workspaceId).toBe(wsB);
    expect(resB.workspaceId).toBe(wsA);

    const finalA = await TaskRepository.getTasks(wsA);
    const finalB = await TaskRepository.getTasks(wsB);

    expect(finalA[task1]).toBeUndefined();
    expect(finalB[task1]).toBeDefined();
    
    expect(finalB[task2]).toBeUndefined();
    expect(finalA[task2]).toBeDefined();
  });

  it("should serialize recycleTask and updateTask via workspace partition lock", async () => {
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    
    const workspaceId = INBOX_WORKSPACE_ID;
    const taskId = "task-recycle-1";

    // 1. Setup initial state
    await TaskRepository.saveTasks([{ id: taskId, title: "Initial Title", status: "todo", workspaceId }], workspaceId);

    const originalGetTasks = TaskRepository.getTasks.bind(TaskRepository);

    let releaseOpA: () => void;
    const opAPaused = new Promise<void>((resolve) => {
      releaseOpA = resolve;
    });

    let getTasksCallCount = 0;
    let opACompleted = false;

    // 2. Intercept the reads
    jest.spyOn(TaskRepository, "getTasks").mockImplementation(async (wsId) => {
      getTasksCallCount++;

      // Pause Operation A's initial read inside the lock
      if (getTasksCallCount === 1) {
        await opAPaused;
      }

      return originalGetTasks(wsId);
    });

    // 3. Start Operation A (reads and blocks)
    const opA = TaskCommandHandler.recycleTask(taskId, workspaceId, "Inbox", { skipAnalytics: true, skipEvents: true })
      .then((res) => {
        opACompleted = true;
        return res;
      });

    // Let the event loop run so Operation A enters the lock and pauses
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 4. Start Operation B
    const opB = TaskCommandHandler.updateTask(taskId, workspaceId, { title: "Concurrent Title Update" });

    // Let the event loop run again. Operation B should be blocked waiting for the lock.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Prove Operation B is blocked and has not entered the critical section
    expect(getTasksCallCount).toBe(1);
    expect(opACompleted).toBe(false);

    // 5. Release Operation A
    releaseOpA!();

    // 6. Wait for both operations
    // OpB should throw because the task was removed by OpA before OpB could acquire the lock.
    await expect(opB).rejects.toThrow(`Task ${taskId} not found in workspace ${workspaceId}`);
    await opA;
    
    expect(opACompleted).toBe(true);

    // 7. Verify the data invariant (no lost updates and correct snapshot)
    const finalTasks = await TaskRepository.getTasks(workspaceId);
    expect(finalTasks[taskId]).toBeUndefined();

    // Verify Recycle Bin snapshot correctness
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    const taskBinItems = binItems.filter(i => i.entityId === taskId);
    expect(taskBinItems.length).toBe(1);
    
    // The snapshot must be exactly "Initial Title", proving OpB was completely blocked 
    // and didn't corrupt the snapshot or the repository.
    const snapshot = JSON.parse(taskBinItems[0].snapshot);
    expect(snapshot.title).toBe("Initial Title");
  });

  it("should securely remove from Recycle Bin without overwriting concurrent bin additions (restoreTask)", async () => {
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    const workspaceId = INBOX_WORKSPACE_ID;
    
    const taskA = { id: "task-A", title: "Task A", status: "todo", workspaceId };
    const taskC = { id: "task-C", title: "Task C", status: "todo", workspaceId };

    // Setup: Task A is in the Recycle Bin. Task C is in active storage.
    await RecycleBinRepository.saveRecycleBinItems([{
      id: "rb-task-A",
      entityType: "task",
      entityId: "task-A",
      snapshot: JSON.stringify(taskA),
      deletedAt: Date.now(),
    }]);
    await TaskRepository.saveTasks([taskC], workspaceId);

    // 1. Start Operation A: restoreTask(task-A)
    const opA = TaskCommandHandler.restoreTask("rb-task-A", { skipAnalytics: true, skipEvents: true });

    // 2. Start Operation B: recycleTask(task-C)
    const opB = TaskCommandHandler.recycleTask("task-C", workspaceId, "Inbox", { skipAnalytics: true, skipEvents: true });
    
    await Promise.all([opA, opB]);

    // 5. Verify the final invariant
    // The Recycle Bin MUST still contain Task C (it was not overwritten by a stale array from Op A)
    const finalBin = await RecycleBinRepository.getRecycleBinItems();
    
    // Task A should be removed
    expect(finalBin.find(i => i.entityId === "task-A")).toBeUndefined();
    // Task C MUST survive
    expect(finalBin.find(i => i.entityId === "task-C")).toBeDefined();
    
    // Task A should be in active storage
    const finalTasks = await TaskRepository.getTasks(workspaceId);
    expect(finalTasks["task-A"]).toBeDefined();
  });

  it("should serialize duplicate restoreTask calls to prevent ghost resurrection", async () => {
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    const workspaceId = INBOX_WORKSPACE_ID;
    const taskId = "task-dup-restore";

    const snapshotTask = { id: taskId, title: "Duplicate Restore Target", status: "todo", workspaceId };

    await RecycleBinRepository.saveRecycleBinItems([{
      id: `rb-${taskId}`,
      entityType: "task",
      entityId: taskId,
      snapshot: JSON.stringify(snapshotTask),
      deletedAt: Date.now(),
    }]);

    // Fire two restores concurrently
    const op1 = TaskCommandHandler.restoreTask(`rb-${taskId}`, { skipAnalytics: true, skipEvents: true });
    const op2 = TaskCommandHandler.restoreTask(`rb-${taskId}`, { skipAnalytics: true, skipEvents: true });

    const results = await Promise.allSettled([op1, op2]);

    // One must succeed, one must fail because the bin item was removed by the first
    const fulfilled = results.filter(r => r.status === "fulfilled");
    const rejected = results.filter(r => r.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(/already restored or permanently deleted/);

    // Verify exactly one active task exists
    const finalTasks = await TaskRepository.getTasks(workspaceId);
    expect(finalTasks[taskId]).toBeDefined();

    // Verify Recycle Bin is empty of this task
    const finalBin = await RecycleBinRepository.getRecycleBinItems();
    expect(finalBin.find(i => i.entityId === taskId)).toBeUndefined();
  });

  it("should serialize recycleTasks and updateTask via workspace partition locks", async () => {
    const workspaceId = INBOX_WORKSPACE_ID;
    const taskId1 = "task-bulk-1";
    const taskId2 = "task-bulk-2";

    // 1. Setup initial state
    await TaskRepository.saveTasks([
      { id: taskId1, title: "Initial Title 1", status: "todo", workspaceId },
      { id: taskId2, title: "Initial Title 2", status: "todo", workspaceId },
    ], workspaceId);

    const originalGetTasks = TaskRepository.getTasks.bind(TaskRepository);

    let releaseOpA: () => void;
    const opAPaused = new Promise<void>((resolve) => {
      releaseOpA = resolve;
    });

    let getTasksCallCount = 0;
    let opACompleted = false;

    // 2. Intercept the reads
    jest.spyOn(TaskRepository, "getTasks").mockImplementation(async (wsId) => {
      getTasksCallCount++;

      // Pause the FIRST read (Operation A's initial read inside the lock)
      if (getTasksCallCount === 1) {
        await opAPaused;
      }

      return originalGetTasks(wsId);
    });

    // 3. Start Operation A: recycleTasks (reads and blocks)
    const opA = TaskCommandHandler.recycleTasks(
      [{ taskId: taskId1, workspaceId }, { taskId: taskId2, workspaceId }],
      { skipAnalytics: true, skipEvents: true }
    ).then((res) => {
      opACompleted = true;
      return res;
    });

    // Let the event loop run so Operation A enters the lock and pauses
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 4. Start Operation B: updateTask
    const opB = TaskCommandHandler.updateTask(taskId1, workspaceId, { title: "Concurrent Update" });

    // Let the event loop run again. Operation B should be blocked waiting for the lock.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Prove Operation B is blocked
    expect(getTasksCallCount).toBe(1);
    expect(opACompleted).toBe(false);

    // 5. Release Operation A
    releaseOpA!();

    // Op B should throw because the task was removed by Op A before Op B could acquire the lock.
    await expect(opB).rejects.toThrow(`Task ${taskId1} not found in workspace ${workspaceId}`);
    await opA;

    expect(opACompleted).toBe(true);

    // 7. Verify the data invariant (no lost updates and correct snapshot)
    const finalTasks = await TaskRepository.getTasks(workspaceId);
    expect(finalTasks[taskId1]).toBeUndefined();
    expect(finalTasks[taskId2]).toBeUndefined();

    // Verify Recycle Bin snapshot correctness
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    const task1BinItems = binItems.filter(i => i.entityId === taskId1);
    expect(task1BinItems.length).toBe(1);
    
    // The snapshot must be exactly "Initial Title 1", proving OpB was completely blocked 
    // and didn't corrupt the snapshot or the repository.
    const snapshot = JSON.parse(task1BinItems[0].snapshot);
    expect(snapshot.title).toBe("Initial Title 1");
  });
  it("should serialize restoreTask vs updateTask via partition lock to prevent stale-read data loss", async () => {
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    const workspaceId = INBOX_WORKSPACE_ID;
    const taskId = "task-restore-race-1";

    const snapshotTask = { id: taskId, title: "Snapshot Title", status: "todo", workspaceId };

    // Setup: Task is in Recycle Bin
    await RecycleBinRepository.saveRecycleBinItems([{
      id: "rb-" + taskId,
      entityType: "task",
      entityId: taskId,
      snapshot: JSON.stringify(snapshotTask),
      deletedAt: Date.now(),
    }]);

    const originalGetItems = RecycleBinRepository.getRecycleBinItems.bind(RecycleBinRepository);
    
    let releaseOpA: () => void;
    const opAPaused = new Promise<void>((resolve) => {
      releaseOpA = resolve;
    });

    let getItemsCallCount = 0;
    let opACompleted = false;

    // Intercept the Recycle Bin read INSIDE the lock
    jest.spyOn(RecycleBinRepository, "getRecycleBinItems").mockImplementation(async () => {
      getItemsCallCount++;
      // Pause Operation A on its SECOND read (the fresh read inside the lock)
      if (getItemsCallCount === 2) {
        await opAPaused;
      }
      return originalGetItems();
    });

    // Start Operation A: restoreTask
    const opA = TaskCommandHandler.restoreTask("rb-" + taskId, { skipAnalytics: true, skipEvents: true })
      .then((res) => {
        opACompleted = true;
        return res;
      });

    // Let Op A enter the lock and pause
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Op A should be blocked inside the lock now (call count is 2)
    expect(getItemsCallCount).toBe(2);

    // Start Operation B: updateTask (This should block waiting for the partition lock!)
    // Wait, since Op A hasn't persisted the task yet, if Op B executes it will read active storage and not find the task, throwing an error.
    // We expect it to throw an error because it's blocked until Op A completes, but once Op A completes, Op B WILL find it!
    // So if it blocks, it will SUCCEED after Op A finishes.
    const opB = TaskCommandHandler.updateTask(taskId, workspaceId, { title: "Updated Title" }, { skipAnalytics: true, skipEvents: true });

    // Wait to prove Op B is blocked
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(opACompleted).toBe(false);

    releaseOpA!();

    await Promise.all([opA, opB]);

    expect(opACompleted).toBe(true);

    // Check final state
    // If Op A had a stale-read vulnerability, it would have persisted its snapshot AFTER Op B's update,
    // overwriting "Updated Title" with "Snapshot Title".
    // Since Op A is fixed, Op A persists first inside the lock, then releases the lock, then Op B acquires the lock,
    // reads the restored task, and updates its title to "Updated Title".
    const finalTasks = await TaskRepository.getTasks(workspaceId);
    expect(finalTasks[taskId].title).toBe("Updated Title");
  });

  it("should not deadlock MoveReconciler and recycleTask via inverted lock acquisition", async () => {
    const { MoveJournalRepository } = await import("@/repositories/MoveJournalRepository");
    const { MoveReconcilerService } = await import("@/services/storage/MoveReconcilerService");
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    
    const workspaceId = INBOX_WORKSPACE_ID;
    const taskId = "task-reconciler-deadlock";

    // 1. Setup a Task for Op A (recycleTask)
    await TaskRepository.saveTasks([{ id: taskId, title: "To Recycle", status: "todo", workspaceId }], workspaceId);

    // 2. Setup a MoveJournal operation for Op B (MoveReconcilerService)
    await MoveJournalRepository.addOperation({
      operationId: "op-restore-deadlock-test",
      operationType: "restore",
      entityId: "another-task",
      entityType: "task",
      sourceWorkspaceId: workspaceId,
      targetWorkspaceId: workspaceId,
      timestamp: Date.now(),
    });
    // Ensure the Recycle Bin item exists for the Reconciler to process
    await RecycleBinRepository.saveRecycleBinItems([{
      id: "rb-another-task",
      entityType: "task",
      entityId: "another-task",
      snapshot: JSON.stringify({ id: "another-task", workspaceId }),
      deletedAt: Date.now(),
    }]);

    const originalAddToRecycleBin = RecycleBinRepository.addToRecycleBin.bind(RecycleBinRepository);

    let releaseOpA: () => void;
    const opAPaused = new Promise<void>((resolve) => {
      releaseOpA = resolve;
    });

    let addCallCount = 0;

    // 3. Intercept Op A right when it needs the Recycle Bin lock
    jest.spyOn(RecycleBinRepository, "addToRecycleBin").mockImplementation(async (...args) => {
      addCallCount++;
      if (addCallCount === 1) {
        await opAPaused;
      }
      return originalAddToRecycleBin(...args);
    });

    // 4. Start Op A: recycleTask
    const opA = TaskCommandHandler.recycleTask(taskId, workspaceId, "Inbox", { skipAnalytics: true, skipEvents: true });

    // Wait for Op A to enter the Task lock and pause at the Recycle Bin boundary
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(addCallCount).toBe(1);

    // 5. Start Op B: Reconciler
    const opB = MoveReconcilerService.reconcileAll();

    // Wait for Op B to attempt lock acquisition
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 6. Release Op A
    releaseOpA!();

    // 7. Verify no deadlock occurs
    const race = Promise.race([
      Promise.all([opA, opB]),
      new Promise((_, reject) => setTimeout(() => reject(new Error("DEADLOCK DETECTED")), 1000))
    ]);

    await expect(race).resolves.not.toThrow();
  });

  it("should prevent zombie notifications if a task is concurrently completed during OS scheduling", async () => {
    const workspaceId = INBOX_WORKSPACE_ID;
    const taskId = "task-zombie-1";

    await TaskRepository.saveTasks([{ 
      id: taskId, 
      title: "Zombie Test", 
      status: "todo", 
      workspaceId,
      reminder: { enabled: true, triggerAt: Date.now() + 10000, notificationIds: ["old-id"] }
    }], workspaceId);

    const originalUpdateNotificationIds = TaskRepository.updateNotificationIds.bind(TaskRepository);
    let releaseOS: () => void;
    const osPaused = new Promise<void>((resolve) => { releaseOS = resolve; });
    let updateNotificationIdsCalled = false;

    // We intercept updateNotificationIds to simulate the OS scheduling delay
    jest.spyOn(TaskRepository, "updateNotificationIds").mockImplementation(async (id, ws, ids) => {
      updateNotificationIdsCalled = true;
      await osPaused;
      return originalUpdateNotificationIds(id, ws, ids);
    });

    const remindersService = require("@/services/scheduling/reminders.service");
    // Mock rescheduleTodoReminders so we don't actually hit the OS
    jest.spyOn(remindersService, "rescheduleTodoReminders").mockImplementation(async (task: any) => {
      if (task.reminder) {
        task.reminder.notificationIds = ["new-id-scheduled-by-os"];
      }
      return task;
    });

    // Mock cancelReminderIds to verify it fires
    const cancelSpy = jest.spyOn(remindersService, "cancelReminderIds").mockResolvedValue(undefined);

    // 1. Start updateTask (which will schedule new IDs and then call updateNotificationIds)
    const opA = TaskCommandHandler.updateTask(taskId, workspaceId, { title: "New Title" }, { skipAnalytics: true, skipEvents: true });

    // Let Op A acquire the lock, save, and enter the OS scheduling phase
    await new Promise(resolve => setTimeout(resolve, 50));

    // 2. Concurrently complete the task! (This will succeed because Op A released the partition lock)
    await TaskCommandHandler.completeTask(taskId, workspaceId, { skipAnalytics: true, skipEvents: true });

    expect(updateNotificationIdsCalled).toBe(true);

    // 3. Release Op A's OS scheduling phase
    releaseOS!();
    await opA;

    // 4. Verify that Op A recognized the concurrent completion and cancelled the NEW IDs!
    expect(cancelSpy).toHaveBeenCalledWith(["new-id-scheduled-by-os"], expect.any(Object));
    
    cancelSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it("should prevent zombie notifications if a task is concurrently completed during uncompleteTask OS scheduling", async () => {
    const workspaceId = INBOX_WORKSPACE_ID;
    const taskId = "task-zombie-uncomplete";

    await TaskRepository.saveTasks([{ 
      id: taskId, 
      title: "Zombie Test Uncomplete", 
      status: "completed", 
      completedAt: Date.now(),
      workspaceId,
      reminder: { enabled: true, triggerAt: Date.now() + 10000, notificationIds: undefined }
    }], workspaceId);

    const originalUpdateNotificationIds = TaskRepository.updateNotificationIds.bind(TaskRepository);
    let releaseOS: () => void;
    const osPaused = new Promise<void>((resolve) => { releaseOS = resolve; });
    let updateNotificationIdsCalled = false;

    jest.spyOn(TaskRepository, "updateNotificationIds").mockImplementation(async (id, ws, ids) => {
      updateNotificationIdsCalled = true;
      await osPaused;
      return originalUpdateNotificationIds(id, ws, ids);
    });

    const remindersService = require("@/services/scheduling/reminders.service");
    jest.spyOn(remindersService, "rescheduleTodoReminders").mockImplementation(async (task: any) => {
      if (task.reminder) {
        task.reminder.notificationIds = ["new-id-scheduled-by-uncomplete"];
      }
      return task;
    });

    const cancelSpy = jest.spyOn(remindersService, "cancelReminderIds").mockResolvedValue(undefined);

    // 1. Start uncompleteTask (which will schedule new IDs)
    const opA = TaskCommandHandler.uncompleteTask(taskId, workspaceId, { skipAnalytics: true, skipEvents: true });

    // Wait for lock release and enter scheduling
    await new Promise(resolve => setTimeout(resolve, 50));

    // 2. Concurrently delete the task! (or complete it, recycle it)
    await TaskCommandHandler.recycleTask(taskId, workspaceId, "Inbox", { skipAnalytics: true, skipEvents: true });

    expect(updateNotificationIdsCalled).toBe(true);

    // 3. Release OS
    releaseOS!();
    await opA;

    // 4. Verify zombie cancellation
    expect(cancelSpy).toHaveBeenCalledWith(["new-id-scheduled-by-uncomplete"], expect.any(Object));
    
    cancelSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it("should prevent zombie notifications if a task is concurrently completed during createTask OS scheduling", async () => {
    const workspaceId = INBOX_WORKSPACE_ID;
    
    // 0. Ensure clean state
    await TaskRepository.saveTasks([], workspaceId);

    const originalUpdateNotificationIds = TaskRepository.updateNotificationIds.bind(TaskRepository);
    let releaseOS: () => void;
    const osPaused = new Promise<void>((resolve) => { releaseOS = resolve; });
    let updateNotificationIdsCalled = false;

    jest.spyOn(TaskRepository, "updateNotificationIds").mockImplementation(async (id, ws, ids) => {
      updateNotificationIdsCalled = true;
      await osPaused;
      return originalUpdateNotificationIds(id, ws, ids);
    });

    const remindersService = require("@/services/scheduling/reminders.service");
    jest.spyOn(remindersService, "rescheduleTodoReminders").mockImplementation(async (task: any) => {
      if (task.reminder) {
        task.reminder.notificationIds = ["new-id-scheduled-by-create"];
      }
      return task;
    });

    const cancelSpy = jest.spyOn(remindersService, "cancelReminderIds").mockResolvedValue(undefined);

    // 1. Start createTask (which will schedule new IDs)
    const taskInput = {
      id: "task-zombie-create",
      title: "Zombie Test Create",
      status: "todo" as const,
      workspaceId,
      reminder: { enabled: true, triggerAt: Date.now() + 10000, notificationIds: undefined },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      priority: "none" as const,
    };
    
    const opA = TaskCommandHandler.createTask(taskInput, workspaceId, { skipAnalytics: true, skipEvents: true });

    // Wait for lock release and enter scheduling
    await new Promise(resolve => setTimeout(resolve, 50));

    // 2. Concurrently recycle the task!
    await TaskCommandHandler.recycleTask(taskInput.id, workspaceId, "Inbox", { skipAnalytics: true, skipEvents: true });

    expect(updateNotificationIdsCalled).toBe(true);

    // 3. Release OS
    releaseOS!();
    await opA;

    // 4. Verify zombie cancellation
    expect(cancelSpy).toHaveBeenCalledWith(["new-id-scheduled-by-create"], expect.any(Object));
    
    cancelSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it("should prevent zombie notifications if a task is concurrently completed during restoreTask OS scheduling", async () => {
    const workspaceId = INBOX_WORKSPACE_ID;
    
    // 0. Ensure clean state
    await TaskRepository.saveTasks([], workspaceId);

    const taskId = "task-zombie-restore";
    const { RecycleBinRepository } = require("@/repositories/RecycleBinRepository");
    
    // Put a task in the recycle bin
    const binItem = {
      entityType: "task" as const,
      item: {
        id: taskId,
        title: "Zombie Test Restore",
        status: "todo",
        workspaceId,
        reminder: { enabled: true, triggerAt: Date.now() + 10000, notificationIds: undefined },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        priority: "none" as const
      }
    };
    await RecycleBinRepository.addMultipleToRecycleBin([binItem]);

    const originalUpdateNotificationIds = TaskRepository.updateNotificationIds.bind(TaskRepository);
    let releaseOS: () => void;
    const osPaused = new Promise<void>((resolve) => { releaseOS = resolve; });
    let updateNotificationIdsCalled = false;

    jest.spyOn(TaskRepository, "updateNotificationIds").mockImplementation(async (id, ws, ids) => {
      updateNotificationIdsCalled = true;
      await osPaused;
      return originalUpdateNotificationIds(id, ws, ids);
    });

    const remindersService = require("@/services/scheduling/reminders.service");
    jest.spyOn(remindersService, "rescheduleTodoReminders").mockImplementation(async (task: any) => {
      if (task.reminder) {
        task.reminder.notificationIds = ["new-id-scheduled-by-restore"];
      }
      return task;
    });

    const cancelSpy = jest.spyOn(remindersService, "cancelReminderIds").mockResolvedValue(undefined);

    // 1. Start restoreTask (which will schedule new IDs)
    const opA = TaskCommandHandler.restoreTask("rb-" + taskId, { skipAnalytics: true, skipEvents: true });

    // Wait for lock release and enter scheduling
    await new Promise(resolve => setTimeout(resolve, 50));

    // 2. Concurrently recycle the task from active storage!
    await TaskCommandHandler.recycleTask(taskId, workspaceId, "Inbox", { skipAnalytics: true, skipEvents: true });

    expect(updateNotificationIdsCalled).toBe(true);

    // 3. Release OS
    releaseOS!();
    await opA;

    // 4. Verify zombie cancellation
    expect(cancelSpy).toHaveBeenCalledWith(["new-id-scheduled-by-restore"], expect.any(Object));
    
    cancelSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it("should prevent duplicate restoration and stale overwrites in restoreTasks", async () => {
    const workspaceId = INBOX_WORKSPACE_ID;
    await TaskRepository.saveTasks([], workspaceId);

    const taskId = "task-duplicate-batch";
    const { RecycleBinRepository } = require("@/repositories/RecycleBinRepository");
    
    // Put a task in the recycle bin
    const binItem = {
      entityType: "task" as const,
      item: {
        id: taskId,
        title: "Batch Zombie Restore",
        status: "todo",
        workspaceId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        priority: "none" as const
      }
    };
    await RecycleBinRepository.addMultipleToRecycleBin([binItem]);

    const items = await RecycleBinRepository.getRecycleBinItems();
    const rbId = items.find((i: any) => i.entityId === taskId)?.id;

    // We will pause during the first restoreTasks domain lock, and launch a second one.
    // If locks work, they serialize.
    let resolveLock: () => void;
    const lockPaused = new Promise<void>(res => resolveLock = res);
    
    const originalSaveTasksUnlocked = TaskRepository.saveTasksUnlocked.bind(TaskRepository);
    let saveCount = 0;
    
    jest.spyOn(TaskRepository, "saveTasksUnlocked").mockImplementation(async (tasks, wsId) => {
      saveCount++;
      if (saveCount === 1) {
        await lockPaused;
      }
      return originalSaveTasksUnlocked(tasks, wsId);
    });

    const opA = TaskCommandHandler.restoreTasks([rbId], { skipAnalytics: true, skipEvents: true });
    
    // Wait for opA to hit saveTasksUnlocked
    await new Promise(r => setTimeout(r, 50));

    // opB tries to restore the exact same ID concurrently
    const opB = TaskCommandHandler.restoreTasks([rbId], { skipAnalytics: true, skipEvents: true });

    // Let opA finish
    resolveLock!();
    
    const resA = await opA;
    const resB = await opB;

    // A should succeed
    expect(resA.restoredCount).toBe(1);
    expect(resA.successfulItemIds).toContain(rbId);

    // B should fail because A removed it from the recycle bin inside the lock
    expect(resB.restoredCount).toBe(0);
    expect(resB.failedItemIds).toContain(rbId);

    jest.restoreAllMocks();
  });

  it("should prevent zombie notifications during restoreTasks OS scheduling", async () => {
    const workspaceId = INBOX_WORKSPACE_ID;
    await TaskRepository.saveTasks([], workspaceId);

    const taskId = "task-batch-zombie";
    const { RecycleBinRepository } = require("@/repositories/RecycleBinRepository");
    
    // Put a task in the recycle bin
    const binItem = {
      entityType: "task" as const,
      item: {
        id: taskId,
        title: "Batch Zombie Notifs",
        status: "todo",
        workspaceId,
        reminder: { enabled: true, triggerAt: Date.now() + 10000, notificationIds: undefined },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        priority: "none" as const
      }
    };
    await RecycleBinRepository.addMultipleToRecycleBin([binItem]);

    const items = await RecycleBinRepository.getRecycleBinItems();
    const rbId = items.find((i: any) => i.entityId === taskId)?.id;

    const originalUpdateNotificationIds = TaskRepository.updateNotificationIds.bind(TaskRepository);
    let releaseOS: () => void;
    const osPaused = new Promise<void>((resolve) => { releaseOS = resolve; });
    let updateNotificationIdsCalled = false;

    jest.spyOn(TaskRepository, "updateNotificationIds").mockImplementation(async (id, ws, ids) => {
      updateNotificationIdsCalled = true;
      await osPaused;
      return originalUpdateNotificationIds(id, ws, ids);
    });

    const remindersService = require("@/services/scheduling/reminders.service");
    jest.spyOn(remindersService, "rescheduleTodoReminders").mockImplementation(async (task: any) => {
      if (task.reminder) {
        task.reminder.notificationIds = ["new-batch-id-scheduled"];
      }
      return task;
    });

    const cancelSpy = jest.spyOn(remindersService, "cancelReminderIds").mockResolvedValue(undefined);

    // 1. Start restoreTasks
    const opA = TaskCommandHandler.restoreTasks([rbId], { skipAnalytics: true, skipEvents: true });

    // Wait for lock release and enter scheduling
    await new Promise(resolve => setTimeout(resolve, 50));

    // 2. Concurrently recycle the task from active storage!
    await TaskCommandHandler.recycleTask(taskId, workspaceId, "Inbox", { skipAnalytics: true, skipEvents: true });

    expect(updateNotificationIdsCalled).toBe(true);

    // 3. Release OS
    releaseOS!();
    await opA;

    // 4. Verify zombie cancellation
    expect(cancelSpy).toHaveBeenCalledWith(["new-batch-id-scheduled"], expect.any(Object));
    
    cancelSpy.mockRestore();
    jest.restoreAllMocks();
  });
});

