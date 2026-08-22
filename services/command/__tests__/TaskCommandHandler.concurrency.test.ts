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

    const originalRemove = RecycleBinRepository.removeRecycleBinItems.bind(RecycleBinRepository);

    let releaseOpA: () => void;
    const opAPaused = new Promise<void>((resolve) => {
      releaseOpA = resolve;
    });

    let removeCallCount = 0;
    let opACompleted = false;

    // 1. Intercept the Recycle Bin removal in restoreTask
    jest.spyOn(RecycleBinRepository, "removeRecycleBinItems").mockImplementation(async (ids, opts) => {
      removeCallCount++;
      // Pause Operation A right before it removes Task A from the bin
      if (removeCallCount === 1) {
        await opAPaused;
      }
      return originalRemove(ids, opts);
    });

    // 2. Start Operation A: restoreTask(task-A)
    const opA = TaskCommandHandler.restoreTask("rb-task-A", { skipAnalytics: true, skipEvents: true })
      .then((res) => {
        opACompleted = true;
        return res;
      });

    // Let the event loop run so Operation A reaches the removal phase and pauses
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 3. Start Operation B: recycleTask(task-C)
    // This will run completely because it does not conflict with the locks Op A is currently holding.
    // Op A has ALREADY released the tasks lock and is just waiting to acquire the recycle_bin lock.
    const opB = TaskCommandHandler.recycleTask("task-C", workspaceId, "Inbox", { skipAnalytics: true, skipEvents: true });
    await opB; // Wait for Op B to finish completely

    // Verify Op B succeeded and added Task C to the bin
    const intermediateBin = await RecycleBinRepository.getRecycleBinItems();
    expect(intermediateBin.find(i => i.entityId === "task-C")).toBeDefined();

    expect(opACompleted).toBe(false);

    // 4. Release Operation A
    releaseOpA!();
    await opA;

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
});
