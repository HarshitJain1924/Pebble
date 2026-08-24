/**
 * restoreJournalIntegrity.test.ts
 * ──────────────────────────────────────────────────────────────────
 * Hostile verification of the restoreTasks MoveJournal integrity bug.
 *
 * A failed restore must retain its durable recovery intent (MoveJournal entry).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { TaskCommandHandler } from "@/services/command/handlers/TaskCommandHandler";
import { TaskRepository, RecycleBinRepository } from "@/repositories";
import { MoveJournalRepository } from "@/repositories/MoveJournalRepository";
import { MoveReconcilerService } from "@/services/storage/MoveReconcilerService";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const storage = AsyncStorage as typeof AsyncStorage;

describe("restoreTasks MoveJournal integrity", () => {
  beforeEach(async () => {
    await storage.clear();
    jest.restoreAllMocks();
    const { WorkspaceRepository } = require("@/repositories/WorkspaceRepository");
    jest.spyOn(WorkspaceRepository, "getWorkspaces").mockResolvedValue([
      { id: "ws-success", name: "S1" },
      { id: "ws-fail", name: "F1" },
      { id: "ws-success2", name: "S2" },
      { id: "inbox", name: "Inbox" }
    ] as any);
  });

  const setupBinItems = async () => {
    const taskA = { id: "tA", workspaceId: "ws-success", title: "Task A", createdAt: 1, updatedAt: 1, status: "todo", priority: "none" };
    const taskB = { id: "tB", workspaceId: "ws-fail", title: "Task B", createdAt: 1, updatedAt: 1, status: "todo", priority: "none" };
    const taskC = { id: "tC", workspaceId: "ws-success2", title: "Task C", createdAt: 1, updatedAt: 1, status: "todo", priority: "none" };

    await RecycleBinRepository.addMultipleToRecycleBin([
      { entityType: "task", item: taskA as any },
      { entityType: "task", item: taskB as any },
      { entityType: "task", item: taskC as any },
    ], { throwOnError: true });
    
    // Read the generated bin item IDs
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    return { 
      binA: binItems.find(i => i.entityId === "tA")!.id, 
      binB: binItems.find(i => i.entityId === "tB")!.id,
      binC: binItems.find(i => i.entityId === "tC")!.id,
    };
  };

  it("Test 1 & 4 — partial batch failure retains journal for failed items and removes for successful ones", async () => {
    const { binA, binB, binC } = await setupBinItems();

    // Mock saveTasksUnlocked to fail ONLY for ws-fail (Task B)
    const origSaveTasksUnlocked = TaskRepository.saveTasksUnlocked;
    jest.spyOn(TaskRepository, "saveTasksUnlocked").mockImplementation(async (tasks, ws) => {
      if (ws === "ws-fail") {
        throw new Error("Simulated storage failure");
      }
      return origSaveTasksUnlocked.call(TaskRepository, tasks, ws);
    });

    const result = await TaskCommandHandler.restoreTasks([binA, binB, binC], { skipEvents: true, skipAnalytics: true });

    expect(result.restoredCount).toBe(2);
    expect(result.successfulItemIds).toEqual(expect.arrayContaining([binA, binC]));
    expect(result.failedItemIds).toEqual([binB]);

    const activeOps = await MoveJournalRepository.getOperations();
    
    // Expect only B's operation to remain
    expect(activeOps.length).toBe(1);
    expect(activeOps[0].entityId).toBe("tB");
    expect(activeOps[0].operationType).toBe("restore");
  });

  it("Test 2 — storage failure after partial persistence can be reconciled", async () => {
    const { binA, binB } = await setupBinItems();

    // Simulate failure where destination WAS written but then Native Storage crashed before completion.
    // We achieve this by throwing *after* the original save completes.
    const origSaveTasksUnlocked = TaskRepository.saveTasksUnlocked;
    jest.spyOn(TaskRepository, "saveTasksUnlocked").mockImplementation(async (tasks, ws) => {
      await origSaveTasksUnlocked.call(TaskRepository, tasks, ws);
      if (ws === "ws-fail") {
        throw new Error("Simulated post-write storage crash");
      }
    });

    await TaskCommandHandler.restoreTasks([binA, binB], { skipEvents: true, skipAnalytics: true });

    // The operation for B should still exist
    let activeOps = await MoveJournalRepository.getOperations();
    expect(activeOps.length).toBe(1);
    expect(activeOps[0].entityId).toBe("tB");

    // The destination task actually exists in storage (because our mock threw *after* writing)
    const taskBInStorage = (await TaskRepository.getTasks("ws-fail"))["tB"];
    expect(taskBInStorage).toBeDefined();

    // Run reconciliation
    await MoveReconcilerService.reconcileAll();

    // Reconciler should see that destination exists, safely remove from recycle bin, and clear journal
    activeOps = await MoveJournalRepository.getOperations();
    expect(activeOps.length).toBe(0);

    const binItems = await RecycleBinRepository.getRecycleBinItems();
    expect(binItems.find(i => i.entityId === "tB")).toBeUndefined(); // removed from bin!
  });

  it("Test 3 — successful batch clears all journals", async () => {
    const { binA, binB } = await setupBinItems();

    const result = await TaskCommandHandler.restoreTasks([binA, binB], { skipEvents: true, skipAnalytics: true });
    expect(result.restoredCount).toBe(2);

    const activeOps = await MoveJournalRepository.getOperations();
    expect(activeOps.length).toBe(0);
  });

  it("Test 5 — idempotent reconciliation", async () => {
    const { binB } = await setupBinItems();

    // Force failure for B
    jest.spyOn(TaskRepository, "saveTasksUnlocked").mockRejectedValueOnce(new Error("Network fail"));

    await TaskCommandHandler.restoreTasks([binB], { skipEvents: true, skipAnalytics: true });
    
    // Run reconciler twice
    await MoveReconcilerService.reconcileAll();
    await MoveReconcilerService.reconcileAll();

    // Reconciler should have successfully re-attempted the restore and finished it
    const activeOps = await MoveJournalRepository.getOperations();
    expect(activeOps.length).toBe(0);

    const tasks = await TaskRepository.getTasks("ws-fail");
    expect(tasks["tB"]).toBeDefined(); // Restored

    const binItems = await RecycleBinRepository.getRecycleBinItems();
    expect(binItems.find(i => i.entityId === "tB")).toBeUndefined(); // Removed from bin
  });
});
