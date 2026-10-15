/**
 * TaskCommandHandler.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Primary test suite for TaskCommandHandler and task command orchestration.
 * Consolidates:
 *   - Workspace partition lock & RMW concurrency (TaskCommandHandler.concurrency.test.ts)
 *   - Recurring occurrence rescheduling & failure safety (TaskCommandHandler.recurringOccurrence.test.ts)
 *   - Clear completed tasks bulk lifecycle & atomicity (clearCompleted.test.ts)
 *   - Uncomplete reminder lifecycle & OS scheduling (uncompleteReminder.regression.test.ts)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { TaskCommandHandler } from "@/services/command/handlers/TaskCommandHandler";
import {
  TaskRepository,
  WorkspaceRepository,
  RecycleBinRepository,
  GraphRepository,
  MoveJournalRepository,
} from "@/repositories";
import { MoveReconcilerService } from "@/services/storage/MoveReconcilerService";
import { isRecurringOccurrenceForDate } from "@/services/scheduling/recurrence.service";
import { getStructuredSchedule } from "@/services/scheduling/scheduling.service";
import {
  INBOX_WORKSPACE_ID,
  type Task,
  type Workspace,
} from "@/shared/types/domain.types";

const storage = AsyncStorage as typeof AsyncStorage;

const defaultWorkspace: Workspace = {
  id: "ws-1",
  name: "Workspace 1",
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
};

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

let mockNotifCounter = 1;
jest.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: {
    DATE: "date",
    TIME_INTERVAL: "timeInterval",
    DAILY: "daily",
    WEEKLY: "weekly",
    MONTHLY: "monthly",
    YEARLY: "yearly",
  },
  scheduleNotificationAsync: jest.fn(async () => `native-notif-${mockNotifCounter++}`),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  setNotificationCategoryAsync: jest.fn(async () => undefined),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Medium: "medium", Light: "light" },
  NotificationFeedbackType: { Success: "success", Warning: "warning" },
}));

describe("TaskCommandHandler Suite", () => {
  describe("workspace partition lock & RMW concurrency", () => {

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
    
    const taskA = { id: "task-A", title: "Task A", status: "todo", workspaceId, revision: 1, lifecycleGeneration: 1 };
    const taskC = { id: "task-C", title: "Task C", status: "todo", workspaceId, revision: 1, lifecycleGeneration: 1 };

    // Setup: Task A is in the Recycle Bin. Task C is in active storage.
    await RecycleBinRepository.saveRecycleBinItems([{
      id: "rb-task-A",
      entityType: "task",
      entityId: "task-A",
      snapshot: JSON.stringify(taskA),
      deletedAt: Date.now(),
      lifecycleGeneration: 1,
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

    const snapshotTask = { id: taskId, title: "Duplicate Restore Target", status: "todo", workspaceId, revision: 1, lifecycleGeneration: 1 };

    await RecycleBinRepository.saveRecycleBinItems([{
      id: `rb-${taskId}`,
      entityType: "task",
      entityId: taskId,
      snapshot: JSON.stringify(snapshotTask),
      deletedAt: Date.now(),
      lifecycleGeneration: 1,
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

    const snapshotTask = { id: taskId, title: "Snapshot Title", status: "todo", workspaceId, revision: 1, lifecycleGeneration: 1 };

    // Setup: Task is in Recycle Bin
    await RecycleBinRepository.saveRecycleBinItems([{
      id: "rb-" + taskId,
      entityType: "task",
      entityId: taskId,
      snapshot: JSON.stringify(snapshotTask),
      deletedAt: Date.now(),
      lifecycleGeneration: 1,
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
    await TaskRepository.saveTasks([{ id: taskId, title: "To Recycle", status: "todo", workspaceId, revision: 1, lifecycleGeneration: 1 }], workspaceId);

    // 2. Setup a MoveJournal operation for Op B (MoveReconcilerService)
    await MoveJournalRepository.addOperation({
      operationId: "op-restore-deadlock-test",
      operationType: "restore",
      entityId: "another-task",
      entityType: "task",
      sourceWorkspaceId: workspaceId,
      targetWorkspaceId: workspaceId,
      timestamp: Date.now(),
      lifecycleGeneration: 1,
      expectedRevision: 1,
    });
    // Ensure the Recycle Bin item exists for the Reconciler to process
    await RecycleBinRepository.saveRecycleBinItems([{
      id: "rb-another-task",
      entityType: "task",
      entityId: "another-task",
      snapshot: JSON.stringify({ id: "another-task", workspaceId, revision: 1, lifecycleGeneration: 1 }),
      deletedAt: Date.now(),
      lifecycleGeneration: 1,
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
      revision: 1,
      lifecycleGeneration: 1,
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

  describe("recurring occurrence rescheduling and failure safety", () => {

  const wsId = "ws-test-recurrence";

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  function projectCalendarTask(task: Task, selectedDate: string) {
    const matchesDate = isRecurringOccurrenceForDate(task, selectedDate);
    if (!matchesDate || task.schedule?.date === "inbox") {
      return null;
    }
    const sched = getStructuredSchedule(task, 60);
    return {
      id: task.id,
      isAllDay: !sched.startTime,
      startTime: sched.startTime,
      duration: sched.duration,
    };
  }

  async function createDailyMaster(): Promise<Task> {
    const master: Task = {
      id: "task-master-1",
      workspaceId: wsId,
      title: "Daily Standup",
      status: "todo",
      priority: "medium",
      schedule: {
        date: "2026-08-01",
        startTime: "09:00",
        endTime: "09:30",
      },
      recurrence: {
        frequency: "daily",
        interval: 1,
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(master);
    return master;
  }

  // TEST 1 & 2 & 3: Atomic Failure Safety
  test("TEST 1 & 2: Persistence failure during occurrence reschedule rolls back all-or-nothing without partial corruption", async () => {
    const master = await createDailyMaster();

    // Mock AsyncStorage.setItem to throw an error on save
    const originalSetItem = AsyncStorage.setItem;
    AsyncStorage.setItem = jest.fn().mockRejectedValueOnce(new Error("Native Disk IO Failure"));

    await expect(
      EntityCommandService.rescheduleRecurringOccurrence(
        master.id,
        wsId,
        "2026-08-30",
        { hour: 11 },
        { skipEvents: true, skipAnalytics: true }
      )
    ).rejects.toThrow("Native Disk IO Failure");

    AsyncStorage.setItem = originalSetItem;

    // Verify persisted state: master remains completely untouched, no detached copy created
    const tasksMap = await TaskRepository.getTasks(wsId);
    const storedMaster = tasksMap[master.id];
    expect(storedMaster).toBeDefined();
    expect(storedMaster.recurrenceExceptions).toBeUndefined();
    expect(Object.keys(tasksMap)).toHaveLength(1);

    // Verify calendar projection on Aug 30: master still projects normally at 09:00
    const projAug30 = projectCalendarTask(storedMaster, "2026-08-30");
    expect(projAug30).not.toBeNull();
    expect(projAug30?.startTime).toEqual({ hour: 9, minute: 0 });
  });

  // TEST 3: Successful occurrence reschedule converges to master exception + 1 detached occurrence
  test("TEST 3: Successful reschedule results in exactly 1 master exception and 1 detached occurrence", async () => {
    const master = await createDailyMaster();

    const result = await EntityCommandService.rescheduleRecurringOccurrence(
      master.id,
      wsId,
      "2026-08-30",
      { hour: 11 },
      { skipEvents: true, skipAnalytics: true }
    );

    expect(result.masterTask.recurrenceExceptions).toEqual(["2026-08-30"]);
    expect(result.occurrenceTask.schedule?.date).toBe("2026-08-30");
    expect(result.occurrenceTask.schedule?.startTime).toBe("11:00");
    expect(result.occurrenceTask.recurrence).toBeUndefined();

    const tasksMap = await TaskRepository.getTasks(wsId);
    expect(Object.keys(tasksMap)).toHaveLength(2);

    const allTasks = Object.values(tasksMap);
    // Aug 29: Only master projects (09:00)
    const aug29 = allTasks.map((t) => projectCalendarTask(t, "2026-08-29")).filter(Boolean);
    expect(aug29).toHaveLength(1);
    expect(aug29[0]?.id).toBe(master.id);
    expect(aug29[0]?.startTime).toEqual({ hour: 9, minute: 0 });

    // Aug 30: Only detached copy projects (11:00)
    const aug30 = allTasks.map((t) => projectCalendarTask(t, "2026-08-30")).filter(Boolean);
    expect(aug30).toHaveLength(1);
    expect(aug30[0]?.id).toBe(result.occurrenceTask.id);
    expect(aug30[0]?.startTime).toEqual({ hour: 11, minute: 0 });

    // Aug 31: Only master projects (09:00)
    const aug31 = allTasks.map((t) => projectCalendarTask(t, "2026-08-31")).filter(Boolean);
    expect(aug31).toHaveLength(1);
    expect(aug31[0]?.id).toBe(master.id);
    expect(aug31[0]?.startTime).toEqual({ hour: 9, minute: 0 });
  });

  // TEST 4: Retry the same occurrence reschedule operation is idempotent
  test("TEST 4: Re-running reschedule on an already excepted date does not duplicate exceptions", async () => {
    const master = await createDailyMaster();

    await EntityCommandService.rescheduleRecurringOccurrence(
      master.id,
      wsId,
      "2026-08-30",
      { hour: 11 },
      { skipEvents: true, skipAnalytics: true }
    );

    // Re-run
    const result2 = await EntityCommandService.rescheduleRecurringOccurrence(
      master.id,
      wsId,
      "2026-08-30",
      { hour: 14 },
      { skipEvents: true, skipAnalytics: true }
    );

    expect(result2.masterTask.recurrenceExceptions).toEqual(["2026-08-30"]);
  });

  // TEST 5: Same occurrence moved twice sequentially
  test("TEST 5: Moving the detached occurrence a second time updates the detached task without creating duplicates", async () => {
    const master = await createDailyMaster();

    // First drag: Aug 30 from 09:00 to 11:00
    const { occurrenceTask } = await EntityCommandService.rescheduleRecurringOccurrence(
      master.id,
      wsId,
      "2026-08-30",
      { hour: 11 },
      { skipEvents: true, skipAnalytics: true }
    );

    // Second drag: The user now drags the item at 11:00 on Aug 30 to 14:00.
    // In the calendar, the dragged item is occurrenceTask (which is non-recurring).
    // Calendar handleDrop calls updateTask directly on non-recurring tasks.
    const updated = await EntityCommandService.updateTask(
      occurrenceTask.id,
      wsId,
      { schedule: { ...occurrenceTask.schedule, startTime: "14:00" } },
      { skipEvents: true, skipAnalytics: true }
    );

    expect(updated.schedule?.startTime).toBe("14:00");

    const tasksMap = await TaskRepository.getTasks(wsId);
    // Exactly 2 tasks total in workspace: master + 1 detached occurrence
    expect(Object.keys(tasksMap)).toHaveLength(2);

    const allTasks = Object.values(tasksMap);
    const aug30 = allTasks.map((t) => projectCalendarTask(t, "2026-08-30")).filter(Boolean);
    expect(aug30).toHaveLength(1);
    expect(aug30[0]?.id).toBe(occurrenceTask.id);
    expect(aug30[0]?.startTime).toEqual({ hour: 14, minute: 0 });
  });

  // TEST 6: Normal non-recurring Task drag/drop remains untouched
  test("TEST 6: Non-recurring Task drag/drop uses updateTask and does not create exceptions or copies", async () => {
    const oneOffTask: Task = {
      id: "task-one-off",
      workspaceId: wsId,
      title: "One Off Task",
      status: "todo",
      priority: "high",
      schedule: {
        date: "2026-08-30",
        startTime: "10:00",
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(oneOffTask);

    await EntityCommandService.updateTask(
      oneOffTask.id,
      wsId,
      { schedule: { ...oneOffTask.schedule, startTime: "15:00" } },
      { skipEvents: true, skipAnalytics: true }
    );

    const tasksMap = await TaskRepository.getTasks(wsId);
    expect(Object.keys(tasksMap)).toHaveLength(1);
    expect(tasksMap["task-one-off"].schedule?.startTime).toBe("15:00");
    expect(tasksMap["task-one-off"].recurrenceExceptions).toBeUndefined();
  });

  // TEST 7: Untouched recurring occurrences across multiple weeks remain unchanged
  test("TEST 7: Rescheduling Aug 30 leaves multiple other projected dates completely untouched", async () => {
    const master = await createDailyMaster();

    await EntityCommandService.rescheduleRecurringOccurrence(
      master.id,
      wsId,
      "2026-08-30",
      { hour: 16 },
      { skipEvents: true, skipAnalytics: true }
    );

    const tasksMap = await TaskRepository.getTasks(wsId);
    const allTasks = Object.values(tasksMap);

    const testDates = ["2026-08-01", "2026-08-15", "2026-08-29", "2026-08-31", "2026-09-10"];
    for (const d of testDates) {
      const projs = allTasks.map((t) => projectCalendarTask(t, d)).filter(Boolean);
      expect(projs).toHaveLength(1);
      expect(projs[0]?.id).toBe(master.id);
      expect(projs[0]?.startTime).toEqual({ hour: 9, minute: 0 });
    }
  });

  // TEST 8: Existing recurrence exception array is preserved
  test("TEST 8: Existing recurrenceExceptions array on the master task is preserved", async () => {
    const masterWithExistingException: Task = {
      id: "task-master-with-exc",
      workspaceId: wsId,
      title: "Daily Standup",
      status: "todo",
      priority: "medium",
      schedule: {
        date: "2026-08-01",
        startTime: "09:00",
      },
      recurrence: {
        frequency: "daily",
        interval: 1,
      },
      recurrenceExceptions: ["2026-08-10", "2026-08-20"],
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(masterWithExistingException);

    const result = await EntityCommandService.rescheduleRecurringOccurrence(
      masterWithExistingException.id,
      wsId,
      "2026-08-30",
      { hour: 11 },
      { skipEvents: true, skipAnalytics: true }
    );

    expect(result.masterTask.recurrenceExceptions).toEqual([
      "2026-08-10",
      "2026-08-20",
      "2026-08-30",
    ]);
  });

  // =========================================================================
  // CONCURRENCY TESTS (PROVING MUTEX & PARTITION SERIALIZATION)
  // =========================================================================

  // TEST A: Recurring occurrence reschedule + unrelated Task update concurrently in same workspace
  test("CONCURRENCY TEST A: Recurring occurrence reschedule + unrelated Task update concurrently in same workspace both survive", async () => {
    const master = await createDailyMaster();
    const unrelatedTask: Task = {
      id: "task-unrelated-1",
      workspaceId: wsId,
      title: "Unrelated Task",
      status: "todo",
      priority: "low",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(unrelatedTask);

    // Launch both concurrently via Promise.all
    const [rescheduleResult, updateResult] = await Promise.all([
      EntityCommandService.rescheduleRecurringOccurrence(
        master.id,
        wsId,
        "2026-08-30",
        { hour: 11 },
        { skipEvents: true, skipAnalytics: true }
      ),
      EntityCommandService.updateTask(
        unrelatedTask.id,
        wsId,
        { title: "Updated Unrelated Task", priority: "high" },
        { skipEvents: true, skipAnalytics: true }
      ),
    ]);

    const tasksMap = await TaskRepository.getTasks(wsId);

    // 1. Master has the exception
    expect(tasksMap[master.id].recurrenceExceptions).toEqual(["2026-08-30"]);

    // 2. Detached copy exists
    expect(tasksMap[rescheduleResult.occurrenceTask.id]).toBeDefined();
    expect(tasksMap[rescheduleResult.occurrenceTask.id].schedule?.startTime).toBe("11:00");

    // 3. Unrelated task has its update preserved without being overwritten
    expect(tasksMap[unrelatedTask.id].title).toBe("Updated Unrelated Task");
    expect(tasksMap[unrelatedTask.id].priority).toBe("high");
  });

  // TEST B: Two different recurring occurrence reschedules concurrently in same workspace
  test("CONCURRENCY TEST B: Two different recurring occurrence reschedules concurrently in same workspace both survive", async () => {
    const master = await createDailyMaster();

    // Launch reschedules for Aug 28 and Aug 30 simultaneously
    const [res1, res2] = await Promise.all([
      EntityCommandService.rescheduleRecurringOccurrence(
        master.id,
        wsId,
        "2026-08-28",
        { hour: 10 },
        { skipEvents: true, skipAnalytics: true }
      ),
      EntityCommandService.rescheduleRecurringOccurrence(
        master.id,
        wsId,
        "2026-08-30",
        { hour: 14 },
        { skipEvents: true, skipAnalytics: true }
      ),
    ]);

    const tasksMap = await TaskRepository.getTasks(wsId);

    // 1. Master has BOTH exceptions
    expect(tasksMap[master.id].recurrenceExceptions).toContain("2026-08-28");
    expect(tasksMap[master.id].recurrenceExceptions).toContain("2026-08-30");
    expect(tasksMap[master.id].recurrenceExceptions).toHaveLength(2);

    // 2. Both detached tasks exist with their correct times
    expect(tasksMap[res1.occurrenceTask.id].schedule?.date).toBe("2026-08-28");
    expect(tasksMap[res1.occurrenceTask.id].schedule?.startTime).toBe("10:00");

    expect(tasksMap[res2.occurrenceTask.id].schedule?.date).toBe("2026-08-30");
    expect(tasksMap[res2.occurrenceTask.id].schedule?.startTime).toBe("14:00");
  });

  // TEST C: Recurring occurrence reschedule + another write to the same master concurrently
  test("CONCURRENCY TEST C: Recurring occurrence reschedule + another write to the same master concurrently preserves both updates", async () => {
    const master = await createDailyMaster();

    // Launch reschedule on Aug 30 + rename master title concurrently
    const [rescheduleResult, updateResult] = await Promise.all([
      EntityCommandService.rescheduleRecurringOccurrence(
        master.id,
        wsId,
        "2026-08-30",
        { hour: 11 },
        { skipEvents: true, skipAnalytics: true }
      ),
      EntityCommandService.updateTask(
        master.id,
        wsId,
        { title: "Daily Standup (Renamed)" },
        { skipEvents: true, skipAnalytics: true }
      ),
    ]);

    const tasksMap = await TaskRepository.getTasks(wsId);
    const finalMaster = tasksMap[master.id];

    // Master has both the updated title AND the recurrence exception
    expect(finalMaster.title).toBe("Daily Standup (Renamed)");
    expect(finalMaster.recurrenceExceptions).toEqual(["2026-08-30"]);

    // Detached task exists
    expect(tasksMap[rescheduleResult.occurrenceTask.id]).toBeDefined();
    expect(tasksMap[rescheduleResult.occurrenceTask.id].schedule?.startTime).toBe("11:00");
  });

  // TEST D: Simultaneous duplicate reschedule of the same occurrence
  test("CONCURRENCY TEST D: Simultaneous duplicate reschedule of the same occurrence does not duplicate exceptions", async () => {
    const master = await createDailyMaster();

    // Launch two identical reschedules for Aug 30 simultaneously
    const [res1, res2] = await Promise.all([
      EntityCommandService.rescheduleRecurringOccurrence(
        master.id,
        wsId,
        "2026-08-30",
        { hour: 11 },
        { skipEvents: true, skipAnalytics: true }
      ),
      EntityCommandService.rescheduleRecurringOccurrence(
        master.id,
        wsId,
        "2026-08-30",
        { hour: 11 },
        { skipEvents: true, skipAnalytics: true }
      ),
    ]);

    const tasksMap = await TaskRepository.getTasks(wsId);
    const finalMaster = tasksMap[master.id];

    // Recurrence exceptions does not contain duplicate "2026-08-30" entries
    expect(finalMaster.recurrenceExceptions).toEqual(["2026-08-30"]);
  });

  // =========================================================================
  // OCCURRENCE IDENTITY & MULTI-OCCURRENCE AUDIT TESTS (FIX #11)
  // =========================================================================

  // SCENARIO 1: Move occurrence onto a date with an existing master occurrence
  test("AUDIT SCENARIO 1: Moving Aug 30 occurrence to Aug 31 preserves normal Aug 31 master occurrence alongside moved Aug 30 detached task", async () => {
    const master = await createDailyMaster();

    // Move Aug 30 occurrence to Aug 31 at 15:00
    const result = await EntityCommandService.rescheduleRecurringOccurrence(
      master.id,
      wsId,
      "2026-08-30",
      { date: "2026-08-31", hour: 15 },
      { skipEvents: true, skipAnalytics: true }
    );

    const tasksMap = await TaskRepository.getTasks(wsId);
    const allTasks = Object.values(tasksMap);

    // On Aug 30: Master is excluded by recurrenceExceptions. Zero tasks.
    const aug30 = allTasks.map((t) => projectCalendarTask(t, "2026-08-30")).filter(Boolean);
    expect(aug30).toHaveLength(0);

    // On Aug 31: Both normal master occurrence (09:00) AND moved detached task (15:00) appear.
    // They represent two distinct logical occurrences: Aug 31 master + Aug 30 moved task.
    const aug31 = allTasks.map((t) => projectCalendarTask(t, "2026-08-31")).filter(Boolean);
    expect(aug31).toHaveLength(2);

    const masterAug31 = aug31.find((t) => t?.id === master.id);
    const detachedAug30 = aug31.find((t) => t?.id === result.occurrenceTask.id);

    expect(masterAug31).toBeDefined();
    expect(masterAug31?.startTime).toEqual({ hour: 9, minute: 0 });

    expect(detachedAug30).toBeDefined();
    expect(detachedAug30?.startTime).toEqual({ hour: 15, minute: 0 });
  });

  // SCENARIO 2 & 4: Two different source occurrences moved to the same target date
  test("AUDIT SCENARIO 2 & 4: Moving two different source occurrences (Aug 28 & Aug 29) to Aug 31 preserves all three distinct logical tasks on Aug 31", async () => {
    const master = await createDailyMaster();

    // Move Aug 28 to Aug 31 @ 10:00
    const res1 = await EntityCommandService.rescheduleRecurringOccurrence(
      master.id,
      wsId,
      "2026-08-28",
      { date: "2026-08-31", hour: 10 },
      { skipEvents: true, skipAnalytics: true }
    );

    // Move Aug 29 to Aug 31 @ 14:00
    const res2 = await EntityCommandService.rescheduleRecurringOccurrence(
      master.id,
      wsId,
      "2026-08-29",
      { date: "2026-08-31", hour: 14 },
      { skipEvents: true, skipAnalytics: true }
    );

    const tasksMap = await TaskRepository.getTasks(wsId);
    const allTasks = Object.values(tasksMap);

    // On Aug 31: Normal master occurrence (09:00) + detached Aug 28 (10:00) + detached Aug 29 (14:00)
    const aug31 = allTasks.map((t) => projectCalendarTask(t, "2026-08-31")).filter(Boolean);
    expect(aug31).toHaveLength(3);

    const ids = aug31.map((t) => t?.id);
    expect(ids).toContain(master.id);
    expect(ids).toContain(res1.occurrenceTask.id);
    expect(ids).toContain(res2.occurrenceTask.id);
  });
  });

  describe("clearCompletedTasks bulk lifecycle and atomicity", () => {
const workspace: Workspace = { id: "ws-1", name: "WS", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 };

const makeTask = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  workspaceId: "ws-1",
  title: `Task ${id}`,
  status: "todo",
  priority: "none",
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const completedTask = (id: string, overrides: Partial<Task> = {}) =>
  makeTask(id, { status: "completed", completedAt: 100, ...overrides });

let cancelReminderIdsSpy: jest.SpyInstance;

beforeEach(async () => {
  jest.restoreAllMocks();
  await storage.clear();
  GraphRepository.resetCache();
  await WorkspaceRepository.saveWorkspace(workspace);

  cancelReminderIdsSpy = jest
    .spyOn(require("@/services/scheduling/reminders.service"), "cancelReminderIds")
    .mockResolvedValue(undefined);
  // Silence side effects exercised by the ECS recycle path; the snapshot and
  // deletion ordering is what these tests assert, not events/analytics.
  jest.spyOn(require("@/services/events/state-events"), "emitStateChange").mockImplementation(() => {});
  jest
    .spyOn(
      require("@/services/analytics/productivity-history.service"),
      "recordDailyHistorySnapshot",
    )
    .mockResolvedValue(undefined);
  jest.spyOn(require("@/services/analytics/widget-data.service"), "syncWidgetData").mockResolvedValue(undefined);
});

describe("clearCompletedTasks data integrity", () => {
  it("moves every completed task into the Recycle Bin", async () => {
    await TaskRepository.saveTask(completedTask("done-1"));
    await TaskRepository.saveTask(makeTask("open-1"));

    await EntityCommandService.clearCompletedTasks("ws-1");

    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.map((b) => b.entityId)).toContain("done-1");
    expect(bin.find((b) => b.entityId === "done-1")?.entityType).toBe("task");
    expect(bin.some((b) => b.entityId === "open-1")).toBe(false);
  });

  it("removes completed tasks from active storage and keeps the rest", async () => {
    await TaskRepository.saveTask(completedTask("done-1"));
    await TaskRepository.saveTask(completedTask("done-2"));
    await TaskRepository.saveTask(makeTask("open-1"));

    await EntityCommandService.clearCompletedTasks("ws-1");

    const active = await TaskRepository.getTasks("ws-1");
    expect(active["done-1"]).toBeUndefined();
    expect(active["done-2"]).toBeUndefined();
    expect(active["open-1"]).toBeDefined();
  });

  it("persists the Recycle Bin snapshot before deleting active tasks", async () => {
    await TaskRepository.saveTask(completedTask("done-1"));

    const saveSpy = jest.spyOn(RecycleBinRepository, "addMultipleToRecycleBin");
    const deleteSpy = jest.spyOn(TaskRepository, "deleteTasksUnlocked");

    await EntityCommandService.clearCompletedTasks("ws-1");

    expect(saveSpy).toHaveBeenCalled();
    expect(deleteSpy).toHaveBeenCalled();
    // Snapshot write must complete before any active deletion begins.
    expect(saveSpy.mock.invocationCallOrder[0]).toBeLessThan(
      deleteSpy.mock.invocationCallOrder[0],
    );
  });

  it("keeps the task active when the Recycle Bin snapshot write fails", async () => {
    await TaskRepository.saveTask(completedTask("done-1"));

    const saveSpy = jest
      .spyOn(RecycleBinRepository, "addMultipleToRecycleBin")
      .mockRejectedValueOnce(new Error("injected snapshot failure"));

    await expect(
      EntityCommandService.clearCompletedTasks("ws-1"),
    ).rejects.toThrow("injected snapshot failure");

    // The task must remain in active storage (no snapshot-missing + deleted).
    const active = await TaskRepository.getTasks("ws-1");
    expect(active["done-1"]).toBeDefined();

    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.some((b) => b.entityId === "done-1")).toBe(false);
    expect(saveSpy).toHaveBeenCalled();
  });

  it("cancels the reminders of every cleared task", async () => {
    await TaskRepository.saveTask(
      completedTask("done-1", {
        reminder: {
          enabled: true,
          triggerAt: Date.now() + 60_000,
          notificationIds: ["n1", "n2"],
        },
      }),
    );

    await EntityCommandService.clearCompletedTasks("ws-1");

    expect(cancelReminderIdsSpy).toHaveBeenCalledWith(["n1", "n2"], {
      throwOnError: false,
    });
  });

  it("restores a cleared task from the Recycle Bin (undo path)", async () => {
    await TaskRepository.saveTask(
      completedTask("done-1", { title: "Original title" }),
    );

    await EntityCommandService.clearCompletedTasks("ws-1");

    const restored = await EntityCommandService.restoreTask("done-1", {
      skipEvents: true,
      skipAnalytics: true,
    });
    expect(restored.id).toBe("done-1");
    expect(restored.title).toBe("Original title");

    const active = await TaskRepository.getTasks("ws-1");
    expect(active["done-1"]).toBeDefined();

    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.some((b) => b.entityId === "done-1")).toBe(false);
  });

  it("handles multiple completed tasks atomically", async () => {
    await TaskRepository.saveTask(completedTask("done-1"));
    await TaskRepository.saveTask(completedTask("done-2"));
    await TaskRepository.saveTask(completedTask("done-3"));
    await TaskRepository.saveTask(makeTask("open-1"));
    await TaskRepository.saveTask(makeTask("open-2"));

    await EntityCommandService.clearCompletedTasks("ws-1");

    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.map((b) => b.entityId).sort()).toEqual([
      "done-1",
      "done-2",
      "done-3",
    ]);

    const active = await TaskRepository.getTasks("ws-1");
    expect(Object.keys(active).sort()).toEqual(["open-1", "open-2"]);
  });

  /**
   * Runs `interleave` immediately after the FIRST TaskRepository.getTasks
   * call resolves — modeling a concurrent user mutation committing between
   * clear's unlocked selection read and its locked re-read.
   */
  function interleaveAfterSelection(interleave: () => Promise<void>): void {
    const originalGetTasks = TaskRepository.getTasks.bind(TaskRepository);
    let armed = true;
    jest
      .spyOn(TaskRepository, "getTasks")
      .mockImplementation(async (wsId: string) => {
        const result = await originalGetTasks(wsId);
        if (armed) {
          armed = false;
          await interleave();
        }
        return result;
      });
  }

  it("A: does not recycle a task un-completed after selection (stale snapshot guard)", async () => {
    await TaskRepository.saveTask(completedTask("done-1"));

    // User un-completes the task between clear's selection read and its
    // locked re-read. A stale clear must NOT recycle the newer state.
    interleaveAfterSelection(async () => {
      await EntityCommandService.updateTask(
        "done-1",
        "ws-1",
        { status: "todo", completedAt: undefined },
        { skipEvents: true, skipAnalytics: true },
      );
    });

    await EntityCommandService.clearCompletedTasks("ws-1");

    const active = await TaskRepository.getTasks("ws-1");
    expect(active["done-1"]).toBeDefined();
    expect(active["done-1"].status).toBe("todo");

    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.some((b) => b.entityId === "done-1")).toBe(false);
  });

  it("B: does not delete a task moved to another workspace after selection", async () => {
    await WorkspaceRepository.saveWorkspace({
      id: "ws-2",
      name: "WS2",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    await TaskRepository.saveTask(completedTask("done-1"));

    // Task moves ws-1 -> ws-2 between clear's selection read and its locked
    // re-read; the clear must not delete it from either workspace.
    interleaveAfterSelection(async () => {
      await EntityCommandService.moveTask(
        "done-1",
        "ws-1",
        "ws-2",
        { skipEvents: true, skipAnalytics: true },
      );
    });

    await EntityCommandService.clearCompletedTasks("ws-1");

    const ws1 = await TaskRepository.getTasks("ws-1");
    expect(ws1["done-1"]).toBeUndefined();

    const ws2 = await TaskRepository.getTasks("ws-2");
    expect(ws2["done-1"]).toBeDefined();

    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.some((b) => b.entityId === "done-1")).toBe(false);
  });

  it("C: does not duplicate bin entries when the task is concurrently recycled", async () => {
    await TaskRepository.saveTask(completedTask("done-1"));

    // Another command recycles the task before clear's locked re-read.
    interleaveAfterSelection(async () => {
      await EntityCommandService.recycleTask(
        "done-1",
        "ws-1",
        "",
        { skipEvents: true, skipAnalytics: true },
      );
    });

    await EntityCommandService.clearCompletedTasks("ws-1");

    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.filter((b) => b.entityId === "done-1")).toHaveLength(1);

    const active = await TaskRepository.getTasks("ws-1");
    expect(active["done-1"]).toBeUndefined();
  });

  it("D: is idempotent — a repeated clear never duplicates bin entries", async () => {
    await TaskRepository.saveTask(completedTask("done-1"));

    await EntityCommandService.clearCompletedTasks("ws-1");
    await EntityCommandService.clearCompletedTasks("ws-1");

    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.filter((b) => b.entityId === "done-1")).toHaveLength(1);

    const active = await TaskRepository.getTasks("ws-1");
    expect(Object.keys(active)).toEqual([]);
  });

  it("E: recovers via MoveReconciler when active deletion fails after the bin snapshot", async () => {
    await TaskRepository.saveTask(completedTask("done-1"));
    jest
      .spyOn(TaskRepository, "deleteTasksUnlocked")
      .mockRejectedValueOnce(new Error("injected delete failure"));

    await expect(
      EntityCommandService.clearCompletedTasks("ws-1"),
    ).rejects.toThrow("injected delete failure");

    // The journal retains the recycle intent; the reconciler completes the
    // recycle idempotently (bin snapshot already exists -> ghost removed).
    const { MoveReconcilerService } = await import(
      "@/services/storage/MoveReconcilerService"
    );
    await MoveReconcilerService.reconcileAll();

    const active = await TaskRepository.getTasks("ws-1");
    expect(active["done-1"]).toBeUndefined();

    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.filter((b) => b.entityId === "done-1")).toHaveLength(1);
  });

  it("does not corrupt state when an entity is missing or already recycled", async () => {
    // done-1 exists and is completed; done-ghost is referenced in the request
    // but does not exist in the repository (e.g. stale UI). done-2 is already
    // in the Recycle Bin from an earlier delete.
    await TaskRepository.saveTask(completedTask("done-1"));
    await TaskRepository.saveTask(completedTask("done-2"));
    await RecycleBinRepository.saveRecycleBinItems([
      {
        id: "rb-done-2",
        entityType: "task",
        entityId: "done-2",
        snapshot: JSON.stringify(completedTask("done-2")),
        deletedAt: 1,
        lifecycleGeneration: 1,
      },
    ]);

    await EntityCommandService.recycleTasks(
      [
        { taskId: "done-1", workspaceId: "ws-1" },
        { taskId: "done-ghost", workspaceId: "ws-1" },
        { taskId: "done-2", workspaceId: "ws-1" },
      ],
      { source: "test" },
    );

    // done-1 recycled; missing task silently skipped; done-2's bin entry
    // replaced, not duplicated.
    const bin = await RecycleBinRepository.getRecycleBinItems();
    const done2Entries = bin.filter((b) => b.entityId === "done-2");
    expect(done2Entries).toHaveLength(1);
    expect(bin.map((b) => b.entityId)).toContain("done-1");

    const active = await TaskRepository.getTasks("ws-1");
    expect(active["done-1"]).toBeUndefined();
    expect(active["done-2"]).toBeUndefined();
  });
});

  });

  describe("uncomplete task reminder lifecycle and OS scheduling", () => {
    const workspace = defaultWorkspace;

  let notificationCounter = 1;

  beforeEach(async () => {
    jest.restoreAllMocks();
    await storage.clear();
    jest.clearAllMocks();
    notificationCounter = 1;
    await WorkspaceRepository.saveWorkspace(workspace);

    (Notifications.scheduleNotificationAsync as jest.Mock).mockImplementation(
      async () => `native-notif-${notificationCounter++}`
    );
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockResolvedValue(
      undefined
    );
  });

  // 1-6. Active Task with valid one-time reminder -> complete -> uncomplete -> verify fresh IDs in OS and AsyncStorage
  it("1-6: should cancel on complete, reschedule on uncomplete, update AsyncStorage with new IDs, and discard old IDs", async () => {
    const triggerAt = Date.now() + 3_600_000;
    const task: Task = {
      id: "task-one-time",
      workspaceId: "ws-1",
      title: "One-time task",
      status: "todo",
      priority: "none",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 100,
      updatedAt: 100,
      reminder: {
        enabled: true,
        triggerAt,
        notificationIds: ["initial-id-123"],
      },
    };

    await TaskRepository.saveTask(task);

    // Step 1: Complete the task
    const completeResult = await EntityCommandService.completeTask("task-one-time", "ws-1", {
      skipAnalytics: true,
      skipEvents: true,
    });

    expect(completeResult).not.toBeNull();
    expect(completeResult?.updated.status).toBe("completed");
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("initial-id-123");

    // Verify storage after completion
    const completedTask = await TaskRepository.getTask("task-one-time", "ws-1");
    expect(completedTask?.status).toBe("completed");
    expect(completedTask?.reminder?.notificationIds).toBeUndefined();

    // Step 2: Uncomplete the task
    const uncompleteResult = await EntityCommandService.uncompleteTask("task-one-time", "ws-1", {
      skipAnalytics: true,
      skipEvents: true,
    });

    expect(uncompleteResult).not.toBeNull();
    expect(uncompleteResult?.updated.status).toBe("todo");

    // Fresh notification should be scheduled in the OS
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
    const newIds = uncompleteResult?.updated.reminder?.notificationIds;
    expect(newIds).toBeDefined();
    expect(newIds?.length).toBeGreaterThan(0);
    expect(newIds).not.toContain("initial-id-123");

    // Verify storage has the NEW IDs, not undefined or old IDs
    const uncompletedTask = await TaskRepository.getTask("task-one-time", "ws-1");
    expect(uncompletedTask?.status).toBe("todo");
    expect(uncompletedTask?.reminder?.notificationIds).toEqual(newIds);
  });

  // 7. Active Task with recurring schedule + reminder -> complete -> uncomplete -> verify fresh IDs scheduled for upcoming occurrence
  it("7: should reschedule recurring task reminders on uncomplete with fresh notification IDs", async () => {
    // For a recurring task, triggerAt might be 9:00 AM yesterday, but recurrence is daily
    const pastTriggerAt = Date.now() - 86_400_000;
    const task: Task = {
      id: "task-recurring",
      workspaceId: "ws-1",
      title: "Daily morning workout",
      status: "todo",
      priority: "none",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 100,
      updatedAt: 100,
      recurrence: {
        frequency: "daily",
        interval: 1,
      },
      reminder: {
        enabled: true,
        triggerAt: pastTriggerAt,
        notificationIds: ["old-recurring-notif-1"],
      },
    };

    await TaskRepository.saveTask(task);

    // Complete the recurring task
    await EntityCommandService.completeTask("task-recurring", "ws-1", {
      skipAnalytics: true,
      skipEvents: true,
    });
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("old-recurring-notif-1");

    // Uncomplete the recurring task
    const uncompleteResult = await EntityCommandService.uncompleteTask("task-recurring", "ws-1", {
      skipAnalytics: true,
      skipEvents: true,
    });

    expect(uncompleteResult).not.toBeNull();
    expect(uncompleteResult?.updated.status).toBe("todo");

    // Fresh notification should be scheduled for the recurring rule
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
    const newIds = uncompleteResult?.updated.reminder?.notificationIds;
    expect(newIds).toBeDefined();
    expect(newIds?.length).toBeGreaterThan(0);
    expect(newIds).not.toContain("old-recurring-notif-1");

    const persisted = await TaskRepository.getTask("task-recurring", "ws-1");
    expect(persisted?.reminder?.notificationIds).toEqual(newIds);
  });

  // 8. Test a Task with no reminder
  it("8: should uncomplete a task with no reminder cleanly without scheduling or crashing", async () => {
    const task: Task = {
      id: "task-no-reminder",
      workspaceId: "ws-1",
      title: "No reminder task",
      status: "completed",
      completedAt: Date.now() - 10_000,
      priority: "none",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 100,
      updatedAt: 100,
    };

    await TaskRepository.saveTask(task);

    const uncompleteResult = await EntityCommandService.uncompleteTask("task-no-reminder", "ws-1", {
      skipAnalytics: true,
      skipEvents: true,
    });

    expect(uncompleteResult).not.toBeNull();
    expect(uncompleteResult?.updated.status).toBe("todo");
    expect(uncompleteResult?.updated.reminder).toBeUndefined();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();

    const persisted = await TaskRepository.getTask("task-no-reminder", "ws-1");
    expect(persisted?.status).toBe("todo");
    expect(persisted?.reminder).toBeUndefined();
  });

  // 9. Simulate notification scheduling failure during uncomplete:
  //    - Task must not claim notification IDs that do not exist in the OS.
  //    - Preserve existing failure policy (domain uncomplete succeeds, reminder notificationIds is undefined).
  it("9: should not claim notification IDs if OS scheduling fails during uncomplete", async () => {
    const triggerAt = Date.now() + 3_600_000;
    const task: Task = {
      id: "task-fail-os",
      workspaceId: "ws-1",
      title: "Fail OS Task",
      status: "completed",
      completedAt: Date.now() - 1000,
      priority: "none",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 100,
      updatedAt: 100,
      reminder: {
        enabled: true,
        triggerAt,
        notificationIds: ["old-id-fail"],
      },
    };

    await TaskRepository.saveTask(task);

    // Simulate OS scheduling error
    (Notifications.scheduleNotificationAsync as jest.Mock).mockRejectedValueOnce(
      new Error("OS Notification Service Unavailable")
    );

    const uncompleteResult = await EntityCommandService.uncompleteTask("task-fail-os", "ws-1", {
      skipAnalytics: true,
      skipEvents: true,
    });

    expect(uncompleteResult).not.toBeNull();
    expect(uncompleteResult?.updated.status).toBe("todo");

    // The Task must not claim notification IDs that failed to schedule
    expect(uncompleteResult?.updated.reminder?.notificationIds).toBeUndefined();

    // Persisted state must also have undefined/empty notificationIds, never ghost/stale IDs
    const persisted = await TaskRepository.getTask("task-fail-os", "ws-1");
    expect(persisted?.status).toBe("todo");
    expect(persisted?.reminder?.notificationIds).toBeUndefined();
  });

  // 10. Concurrent mutation of the same Task while reminder rescheduling is happening
  it("10: should cancel newly scheduled notifications if task is concurrently completed/deleted/archived during OS scheduling", async () => {
    const triggerAt = Date.now() + 3_600_000;
    const task: Task = {
      id: "task-concurrent",
      workspaceId: "ws-1",
      title: "Concurrent Task",
      status: "completed",
      completedAt: Date.now() - 1000,
      priority: "none",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 100,
      updatedAt: 100,
      reminder: {
        enabled: true,
        triggerAt,
        notificationIds: ["old-concurrent-id"],
      },
    };

    await TaskRepository.saveTask(task);

    // Intercept scheduleNotificationAsync to simulate a concurrent completeTask before OS scheduling finishes
    (Notifications.scheduleNotificationAsync as jest.Mock).mockImplementation(async () => {
      // Simulate concurrent mutation while OS call is pending
      await TaskRepository.saveTask({
        ...task,
        status: "completed",
        completedAt: Date.now(),
        updatedAt: Date.now() + 10,
      });
      return "scheduled-during-race";
    });

    await EntityCommandService.uncompleteTask("task-concurrent", "ws-1", {
      skipAnalytics: true,
      skipEvents: true,
    });

    // Drain microtasks for async cancellation
    for (let i = 0; i < 10; i++) await Promise.resolve();

    // The newly scheduled notification should be cancelled because the task was concurrently completed
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("scheduled-during-race");

    // The persisted task should remain completed
    const persisted = await TaskRepository.getTask("task-concurrent", "ws-1");
    expect(persisted?.status).toBe("completed");
  });
  });
});
