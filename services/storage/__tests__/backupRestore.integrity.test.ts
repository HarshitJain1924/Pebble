import AsyncStorage from "@react-native-async-storage/async-storage";
import { BackupService, AppBackup } from "@/services/storage/backup.service";
import { TaskRepository } from "@/repositories/TaskRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { MoveJournalRepository } from "@/repositories/MoveJournalRepository";
import { GraphRepository } from "@/repositories/GraphRepository";
import { MoveReconcilerService } from "@/services/storage/MoveReconcilerService";
import * as mutex from "@/shared/utils/mutex";

jest.mock("@react-native-async-storage/async-storage", () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
  removeItem: jest.fn(),
  multiRemove: jest.fn(),
  getAllKeys: jest.fn().mockResolvedValue([]),
  clear: jest.fn(),
}));

const mockStorage: Record<string, string> = {};
(AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => mockStorage[key] || null);
(AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string) => { mockStorage[key] = val; });
(AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => { delete mockStorage[key]; });
(AsyncStorage.getAllKeys as jest.Mock).mockImplementation(async () => Object.keys(mockStorage));
(AsyncStorage.multiGet as jest.Mock).mockImplementation(async (keys: string[]) => keys.map(k => [k, mockStorage[k] || null]));
(AsyncStorage.multiSet as jest.Mock).mockImplementation(async (pairs: readonly (readonly [string, string])[]) => {
  pairs.forEach(([k, v]) => { mockStorage[k] = v; });
});
(AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => {
  keys.forEach(k => { delete mockStorage[k]; });
});

describe("BackupService & Reconciler - MoveJournal Integrity", () => {
  beforeEach(async () => {
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
    jest.clearAllMocks();
    GraphRepository.resetCache();
  });

  const generateValidBackup = (): AppBackup => ({
    version: 1,
    timestamp: Date.now(),
    workspaces: [{ id: "ws-1", name: "Backup WS", createdAt: 100, updatedAt: 100 }],
    tasks: [{ id: "task-1", title: "Backup Task", workspaceId: "ws-1", status: "todo", priority: "none", createdAt: 100, updatedAt: 100 }],
    habits: [],
    checklists: [],
    resources: [],
    recycleBin: [],
    focusSessions: [],
    relationships: [],
    systemEvents: [],
    settings: {},
    profile: {}
  });

  it("TEST 1 - Journal lock survives empty journal (Concurrent Move Race)", async () => {
    // Setup: Ensure MoveJournal storage key does NOT exist
    delete mockStorage["pebble:v1:move_journal"];

    // We hook getAllKeys so that we can insert a concurrent move EXACTLY after 
    // BackupService has determined its lock set but BEFORE it acquires locks.
    const originalGetAllKeys = AsyncStorage.getAllKeys as jest.Mock;
    let didInjectMove = false;
    
    originalGetAllKeys.mockImplementation(async () => {
      // Capture keys BEFORE injecting the move. 
      // move_journal is NOT in this array.
      const keys = Object.keys(mockStorage);
      
      if (!didInjectMove) {
        didInjectMove = true;
        // Await the concurrent move so it is physically in storage 
        // before BackupService proceeds to compute lockKeys.
        await MoveJournalRepository.addOperation({
          operationId: "op-sneaky",
          entityId: "task-sneaky",
          entityType: "task",
          sourceWorkspaceId: "inbox",
          targetWorkspaceId: "ws-1",
          timestamp: Date.now()
        });
      }
      
      // Return the stale keys array to simulate the exact race 
      // where getAllKeys missed the new journal entry.
      return keys;
    });

    const backupJson = JSON.stringify(generateValidBackup());
    
    // With the race condition fixed, BackupService manually requires the lock.
    // It should discover the sneaky move inside the lock block and safely abort.
    await expect(BackupService.restoreStructuredBackup(backupJson))
      .rejects.toThrow("Concurrent move detected");

    // The journal entry MUST survive the backup attempt
    const journalAfter = await MoveJournalRepository.getOperations();
    expect(journalAfter.length).toBe(1);
    expect(journalAfter[0].operationId).toBe("op-sneaky");
  });

  it("TEST 2 - Reconciler vs Backup deadlock does not occur on disjoint partitions", async () => {
    // We intentionally delay the MoveJournal lock acquisition inside BackupService
    // to force Reconciler and Backup to overlap.
    const originalWithLock = mutex.withLock;
    
    let backupReachedJournal = false;
    let reconcilerReachedRecycle = false;
    
    jest.spyOn(mutex, "withLock").mockImplementation(async (key, task) => {
      if (key === "pebble:v1:move_journal") {
        backupReachedJournal = true;
      }
      if (key === "pebble:v1:recycle_bin") {
        reconcilerReachedRecycle = true;
      }
      return originalWithLock(key, task);
    });

    // Seed an operation for a workspace that BackupService does NOT lock (because it's deleted)
    // Wait, BackupService locks ALL keys in the backup. So we use a disjoint key not in backup and not in storage.
    mockStorage["pebble:v1:move_journal"] = JSON.stringify([{
      operationId: "op-deadlock",
      entityId: "task-deadlock",
      entityType: "task",
      sourceWorkspaceId: "deleted-ws",
      targetWorkspaceId: "deleted-ws",
      timestamp: Date.now()
    }]);

    // Override reconcileAll for this test so it DOES NOT run before backup.
    jest.spyOn(MoveReconcilerService, "reconcileAll").mockResolvedValue(undefined);

    const backupJson = JSON.stringify(generateValidBackup());

    // We run both concurrently. They should not deadlock.
    // To ensure they actually overlap, they are both launched.
    const backupPromise = BackupService.restoreStructuredBackup(backupJson).catch(() => {}); // catch the concurrent abort
    const reconcilerPromise = (MoveReconcilerService as any).reconcileRecycle({
      operationId: "op-deadlock",
      entityId: "task-deadlock",
      entityType: "task",
      sourceWorkspaceId: "deleted-ws",
      targetWorkspaceId: "deleted-ws",
      timestamp: Date.now()
    });

    const timeout = new Promise((_, r) => setTimeout(() => r(new Error("DEADLOCK DETECTED")), 2000));
    
    await expect(Promise.race([
      Promise.all([backupPromise, reconcilerPromise]),
      timeout
    ])).resolves.toBeTruthy();

    jest.restoreAllMocks();
  });

  it("TEST 3 - Reconciler lock hierarchy is strictly Partition -> MoveJournal -> RecycleBin", async () => {
    const lockAcquisitions: string[] = [];
    jest.spyOn(mutex, "withLock").mockImplementation(async (key, task) => {
      lockAcquisitions.push(key);
      return task();
    });

    await (MoveReconcilerService as any).reconcileRecycle({
      operationId: "op-hierarchy",
      entityId: "task-1",
      entityType: "task",
      sourceWorkspaceId: "ws-1",
      targetWorkspaceId: "ws-1",
      timestamp: Date.now()
    });

    expect(lockAcquisitions).toEqual([
      "pebble:v1:tasks:ws-1",
      "pebble:v1:move_journal",
      "pebble:v1:recycle_bin"
    ]);

    jest.restoreAllMocks();
  });

  it("TEST 4 - Empty journal recovery succeeds without backup interference", async () => {
    delete mockStorage["pebble:v1:move_journal"];
    
    // Simulate normal backup
    const backupJson = JSON.stringify(generateValidBackup());
    await BackupService.restoreStructuredBackup(backupJson);

    // Simulate move happening after restore
    await MoveJournalRepository.addOperation({
      operationId: "op-post",
      entityId: "task-1",
      entityType: "task",
      sourceWorkspaceId: "ws-1",
      targetWorkspaceId: "ws-2",
      timestamp: Date.now()
    });

    // Journal should be safely intact
    let journal = await MoveJournalRepository.getOperations();
    expect(journal.length).toBe(1);

    // Normal reconcile
    await MoveReconcilerService.reconcileAll();
    
    // Journal should be clean
    journal = await MoveJournalRepository.getOperations();
    expect(journal.length).toBe(0);
  });

  it("TEST 5 - Deleted workspace safe execution", async () => {
    // Operation where source workspace no longer exists in storage
    await MoveJournalRepository.addOperation({
      operationId: "op-deleted-ws",
      entityId: "task-ghost",
      entityType: "task",
      sourceWorkspaceId: "ghost-ws",
      targetWorkspaceId: "ws-1",
      timestamp: Date.now()
    });

    // Run reconciliation 
    await MoveReconcilerService.reconcileAll();

    // The operation should process cleanly without throwing or deadlocking
    const journal = await MoveJournalRepository.getOperations();
    expect(journal.length).toBe(0);
  });
});
