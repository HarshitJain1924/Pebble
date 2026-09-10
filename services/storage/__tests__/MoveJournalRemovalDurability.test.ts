import AsyncStorage from "@react-native-async-storage/async-storage";
import { TaskCommandHandler } from "@/services/command/handlers/TaskCommandHandler";
import { MoveReconcilerService } from "@/services/storage/MoveReconcilerService";
import { MoveJournalRepository } from "@/repositories/MoveJournalRepository";
import {
  TaskRepository,
  WorkspaceRepository,
} from "@/repositories";
import { TombstoneRepository } from "@/repositories/TombstoneRepository";
import { type Task, type Workspace } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const WS_A = "ws-source-a";
const WS_B = "ws-target-b";
const WS_C = "ws-target-c";

beforeEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();

  // Establish active workspaces
  for (const wsId of [WS_A, WS_B, WS_C]) {
    await WorkspaceRepository.saveWorkspace({
      id: wsId,
      name: `Workspace ${wsId}`,
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 100,
      updatedAt: 100,
    } as Workspace);
  }
});

describe("MoveJournal Removal Durability & Hostile Crash Recovery", () => {
  it("Domain mutation commits -> Journal removal crashes -> Reconciler safely cleans journal, preserves user edits, and prevents resurrection", async () => {
    // 1. Initial State: Task exists in WS_A
    const initialTask: Task = {
      id: "task-move-1",
      workspaceId: WS_A,
      title: "Initial Task in WS_A",
      status: "todo",
      priority: "medium",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTaskUnlocked(initialTask);

    // 2. Deterministic Crash Injection:
    // Intercept MoveJournalRepository.removeOperation during TaskCommandHandler.moveTask
    // so the domain write commits (target written, source deleted), but the journal removal
    // fails with an unhandled storage crash.
    const originalRemoveOperation = MoveJournalRepository.removeOperation;
    let crashInjected = false;

    jest.spyOn(MoveJournalRepository, "removeOperation").mockImplementationOnce(async (opId) => {
      crashInjected = true;
      throw new Error("Simulated Power Crash: Unhandled failure during MoveJournal removal!");
    });

    // Execute moveTask expecting the simulated crash
    await expect(
      TaskCommandHandler.moveTask("task-move-1", WS_A, WS_B)
    ).rejects.toThrow("Simulated Power Crash");

    expect(crashInjected).toBe(true);

    // 3. Verify State Immediately Post-Crash (Before Reconciler Runs):
    // - Source partition: entity was deleted!
    const sourceTaskBeforeReconcile = await TaskRepository.getTask("task-move-1", WS_A);
    expect(sourceTaskBeforeReconcile).toBeNull();

    // - Target partition: entity was committed!
    const targetTaskBeforeReconcile = await TaskRepository.getTask("task-move-1", WS_B);
    expect(targetTaskBeforeReconcile).not.toBeNull();
    expect(targetTaskBeforeReconcile!.workspaceId).toBe(WS_B);

    // - MoveJournal: lingering operation still exists!
    const lingeringOps = await MoveJournalRepository.getOperations();
    expect(lingeringOps.length).toBe(1);
    expect(lingeringOps[0].entityId).toBe("task-move-1");
    expect(lingeringOps[0].sourceWorkspaceId).toBe(WS_A);
    expect(lingeringOps[0].targetWorkspaceId).toBe(WS_B);

    // 4. User Interaction in Target Workspace:
    // The user modifies the task in WS_B before startup recovery runs
    const userUpdatedTask = await TaskCommandHandler.updateTask(
      "task-move-1",
      WS_B,
      { title: "User Edited Title After Crash" },
      { source: "user_gesture" },
    );
    expect(userUpdatedTask.title).toBe("User Edited Title After Crash");
    expect(userUpdatedTask.revision).toBe(2); // Initial in target workspace was 1, update bumped to 2

    // 5. Startup Recovery / Reconciler Execution:
    // Reconciler discovers the lingering journal entry and must reconcile it
    await MoveReconcilerService.reconcileAll();

    // 6. Verify Final State:
    // - Journal must be cleaned up!
    const finalOps = await MoveJournalRepository.getOperations();
    expect(finalOps.length).toBe(0);

    // - Source must NOT resurrect!
    const finalSourceTask = await TaskRepository.getTask("task-move-1", WS_A);
    expect(finalSourceTask).toBeNull();

    // - Target must preserve the user's edits and not roll back to old state!
    const finalTargetTask = await TaskRepository.getTask("task-move-1", WS_B);
    expect(finalTargetTask).not.toBeNull();
    expect(finalTargetTask!.title).toBe("User Edited Title After Crash");
    expect(finalTargetTask!.revision).toBe(2);
    expect(finalTargetTask!.workspaceId).toBe(WS_B);
  });

  it("Partial write crash: Target written -> Source delete crashes -> Reconciler finishes move cleanly without duplication", async () => {
    const taskId = "task-partial-1";
    const initialTask: Task = {
      id: taskId,
      workspaceId: WS_A,
      title: "Task Partial Crash",
      status: "todo",
      priority: "low",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTaskUnlocked(initialTask);

    // Simulate crash where target write succeeded, but source deletion failed
    const originalDeleteTaskUnlocked = TaskRepository.deleteTaskUnlocked;
    jest.spyOn(TaskRepository, "deleteTaskUnlocked").mockImplementationOnce(async () => {
      throw new Error("Simulated Crash: Source delete partition write failed!");
    });

    await expect(
      TaskCommandHandler.moveTask(taskId, WS_A, WS_B)
    ).rejects.toThrow("Simulated Crash");

    // Both source and target exist now (ghost duplicate state)
    expect(await TaskRepository.getTask(taskId, WS_A)).not.toBeNull();
    expect(await TaskRepository.getTask(taskId, WS_B)).not.toBeNull();

    // Journal remains
    const ops = await MoveJournalRepository.getOperations();
    expect(ops.length).toBe(1);

    // Reconciler runs on boot
    await MoveReconcilerService.reconcileAll();

    // Reconciler must converge to moved state: delete source, keep target, remove journal
    expect(await TaskRepository.getTask(taskId, WS_A)).toBeNull();
    const resolvedTarget = await TaskRepository.getTask(taskId, WS_B);
    expect(resolvedTarget).not.toBeNull();
    expect(resolvedTarget!.workspaceId).toBe(WS_B);

    expect(await MoveJournalRepository.getOperations()).toEqual([]);
  });

  it("Subsequent move before recovery: Reconciler does not corrupt state when entity moved to 3rd workspace", async () => {
    const taskId = "task-chain-1";
    const initialTask: Task = {
      id: taskId,
      workspaceId: WS_A,
      title: "Chained Move Task",
      status: "todo",
      priority: "high",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTaskUnlocked(initialTask);

    // Move A -> B commits domain but crashes before journal removal
    jest.spyOn(MoveJournalRepository, "removeOperation").mockImplementationOnce(async () => {
      throw new Error("Crash during A->B journal removal");
    });

    await expect(
      TaskCommandHandler.moveTask(taskId, WS_A, WS_B)
    ).rejects.toThrow("Crash during A->B journal removal");

    // User subsequently moves B -> C (which succeeds completely)
    await TaskCommandHandler.moveTask(taskId, WS_B, WS_C);

    // State on disk:
    // WS_A: empty
    // WS_B: empty
    // WS_C: has task
    expect(await TaskRepository.getTask(taskId, WS_A)).toBeNull();
    expect(await TaskRepository.getTask(taskId, WS_B)).toBeNull();
    expect(await TaskRepository.getTask(taskId, WS_C)).not.toBeNull();

    // Reconciler runs with lingering A->B operation
    await MoveReconcilerService.reconcileAll();

    // Entity must remain safely in WS_C; no phantom recreated in WS_A or WS_B
    expect(await TaskRepository.getTask(taskId, WS_A)).toBeNull();
    expect(await TaskRepository.getTask(taskId, WS_B)).toBeNull();
    const finalTaskInC = await TaskRepository.getTask(taskId, WS_C);
    expect(finalTaskInC).not.toBeNull();
    expect(finalTaskInC!.workspaceId).toBe(WS_C);
  });

  it("Tombstone protection: Reconciler aborts obsolete move if entity was permanently deleted after crash", async () => {
    const taskId = "task-tombstone-1";
    const initialTask: Task = {
      id: taskId,
      workspaceId: WS_A,
      title: "Tombstone Task",
      status: "todo",
      priority: "none",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTaskUnlocked(initialTask);

    // Move A -> B commits domain but crashes before journal removal
    jest.spyOn(MoveJournalRepository, "removeOperation").mockImplementationOnce(async () => {
      throw new Error("Crash during journal removal");
    });

    await expect(
      TaskCommandHandler.moveTask(taskId, WS_A, WS_B)
    ).rejects.toThrow("Crash during journal removal");

    // User permanently deletes task in WS_B, creating durable tombstone
    await TaskRepository.deleteTask(taskId, WS_B);
    await TombstoneRepository.addTombstone({
      id: `ts-${taskId}-g1`,
      entityType: "task",
      entityId: taskId,
      lifecycleGeneration: 1,
      deletedAt: Date.now(),
    });

    expect(await TaskRepository.getTask(taskId, WS_B)).toBeNull();

    // Reconciler runs
    await MoveReconcilerService.reconcileAll();

    // Obsolete operation must be purged from journal without resurrecting task
    expect(await MoveJournalRepository.getOperations()).toEqual([]);
    expect(await TaskRepository.getTask(taskId, WS_A)).toBeNull();
    expect(await TaskRepository.getTask(taskId, WS_B)).toBeNull();
  });

  it("Idempotent double recovery: Running reconciler multiple times produces identical clean state", async () => {
    const taskId = "task-idem-1";
    await TaskRepository.saveTaskUnlocked({
      id: taskId,
      workspaceId: WS_A,
      title: "Idempotent Task",
      status: "todo",
      priority: "low",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    } as Task);

    // Crash after domain commit
    jest.spyOn(MoveJournalRepository, "removeOperation").mockImplementationOnce(async () => {
      throw new Error("Crash");
    });
    await expect(TaskCommandHandler.moveTask(taskId, WS_A, WS_B)).rejects.toThrow("Crash");

    // Recovery Run 1
    await MoveReconcilerService.reconcileAll();
    expect(await MoveJournalRepository.getOperations()).toEqual([]);

    const run1Task = await TaskRepository.getTask(taskId, WS_B);
    expect(run1Task).not.toBeNull();

    // Recovery Run 2 (no-op)
    await MoveReconcilerService.reconcileAll();
    expect(await MoveJournalRepository.getOperations()).toEqual([]);

    const run2Task = await TaskRepository.getTask(taskId, WS_B);
    expect(run2Task).toEqual(run1Task);
  });
});
