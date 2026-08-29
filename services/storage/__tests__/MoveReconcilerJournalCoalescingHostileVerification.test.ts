import { MoveReconcilerService } from "../MoveReconcilerService";
import { MoveJournalRepository } from "@/repositories/MoveJournalRepository";
import type { MoveJournalEntry, Task } from "@/shared/types/domain.types";
import { generateId } from "@/shared/utils/id";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { withLock, withLocks } from "@/shared/utils/mutex";

const mockStore = new Map<string, string>();

jest.mock("@react-native-async-storage/async-storage", () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
  removeItem: jest.fn(),
  multiRemove: jest.fn(),
  getAllKeys: jest.fn(),
  clear: jest.fn(),
}));

(AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
  return mockStore.get(key) || null;
});
(AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
  mockStore.set(key, value);
});
(AsyncStorage.multiGet as jest.Mock).mockImplementation(async (keys: string[]) => {
  return keys.map((key) => [key, mockStore.get(key) || null]);
});
(AsyncStorage.multiSet as jest.Mock).mockImplementation(async (keyValuePairs: string[][]) => {
  for (const [key, val] of keyValuePairs) {
    mockStore.set(key, val);
  }
});
(AsyncStorage.clear as jest.Mock).mockImplementation(async () => {
  mockStore.clear();
});

jest.mock("@/repositories/MoveJournalRepository", () => {
  const actual = jest.requireActual("@/repositories/MoveJournalRepository");
  return {
    MoveJournalRepository: {
      ...actual.MoveJournalRepository,
      getOperations: jest.fn(),
      removeOperations: jest.fn(),
      removeOperationsUnlocked: jest.fn(),
    }
  };
});

jest.mock("@/repositories/WorkspaceRepository", () => ({
  WorkspaceRepository: {
    getWorkspaces: jest.fn().mockResolvedValue([
      { id: "ws-1", name: "Workspace 1", type: "list" },
      { id: "ws-2", name: "Workspace 2", type: "list" },
      { id: "ws-3", name: "Workspace 3", type: "list" },
      { id: "ws-4", name: "Workspace 4", type: "list" }
    ])
  }
}));

jest.mock("@/services/scheduling/reminders.service", () => ({
  cancelReminderIds: jest.fn().mockResolvedValue(undefined),
}));

// Do NOT mock mutex locks as no-ops! Use actual implementations.
jest.mock("@/shared/utils/mutex", () => {
  const original = jest.requireActual("@/shared/utils/mutex");
  return {
    withLock: original.withLock,
    withLocks: original.withLocks,
  };
});

describe("MoveReconciler Journal Coalescing Hostile Verification", () => {
  let removeOpsSpy: jest.SpyInstance;
  let removeOpsUnlockedSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.clear();
    mockStore.set("pebble:v1:workspaces", JSON.stringify([
      { id: "ws-1" }, { id: "ws-2" }, { id: "ws-3" }, { id: "ws-4" }
    ]));
    
    removeOpsSpy = (MoveJournalRepository.removeOperations as jest.Mock).mockResolvedValue(undefined);
    removeOpsUnlockedSpy = (MoveJournalRepository.removeOperationsUnlocked as jest.Mock).mockResolvedValue(undefined);
  });

  const mockJournalEntry = (
    entityId: string,
    sourceWs: string,
    targetWs: string,
    timestamp: number
  ): MoveJournalEntry => ({
    operationId: `move-${generateId()}`,
    operationType: "move",
    entityId,
    entityType: "task",
    sourceWorkspaceId: sourceWs,
    targetWorkspaceId: targetWs,
    timestamp,
    lifecycleGeneration: 1,
    expectedRevision: 1,
  });

  const mockTask = (id: string, workspaceId: string): Task => ({
    id,
    workspaceId,
    title: "Test Task",
    status: "todo",
    priority: "medium",
    categoryId: "work",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
    schedule: {},
  });

  test("CASE A: Two operations exist; latest succeeds -> Superseded is removed", async () => {
    const op1 = mockJournalEntry("task-1", "ws-1", "ws-2", 1000);
    const op2 = mockJournalEntry("task-1", "ws-2", "ws-3", 2000);
    
    (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([op1, op2]);
    
    // Setup state: the item is in ws-2 (meaning op1 already succeeded, or we are just executing op2)
    mockStore.set(`pebble:v1:tasks:ws-2`, JSON.stringify({ "task-1": mockTask("task-1", "ws-2") }));
    mockStore.set(`pebble:v1:tasks:ws-3`, JSON.stringify({}));

    await MoveReconcilerService.reconcileAll();

    // Verify op2 was removed using unlocked
    expect(removeOpsUnlockedSpy).toHaveBeenCalledWith([op2.operationId]);
    
    // Verify op1 was removed using the locked bulk cleanup
    expect(removeOpsSpy).toHaveBeenCalledWith([op1.operationId]);
    
    // Verify task moved to ws-3
    const ws2 = JSON.parse(mockStore.get(`pebble:v1:tasks:ws-2`) || "{}");
    const ws3 = JSON.parse(mockStore.get(`pebble:v1:tasks:ws-3`) || "{}");
    expect(ws2["task-1"]).toBeUndefined();
    expect(ws3["task-1"].workspaceId).toBe("ws-3");
  });

  test("CASE B: Two operations exist; latest throws -> Superseded remains intact", async () => {
    const op1 = mockJournalEntry("task-2", "ws-1", "ws-2", 1000);
    const op2 = mockJournalEntry("task-2", "ws-2", "ws-3", 2000);
    
    (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([op1, op2]);
    
    // Setup state: the item is in ws-2
    mockStore.set(`pebble:v1:tasks:ws-2`, JSON.stringify({ "task-2": mockTask("task-2", "ws-2") }));
    mockStore.set(`pebble:v1:tasks:ws-3`, JSON.stringify({}));

    // Inject a failure into setItem so the latest op throws
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(async () => {
      throw new Error("Simulated Write Failure");
    });

    await expect(MoveReconcilerService.reconcileAll()).rejects.toThrow("Simulated Write Failure");

    // Neither should be removed!
    expect(removeOpsUnlockedSpy).not.toHaveBeenCalled();
    expect(removeOpsSpy).not.toHaveBeenCalled();
  });

  test("CASE C: Two operations exist; latest is UNCERTAIN (missing everywhere) -> Superseded remains intact", async () => {
    const op1 = mockJournalEntry("task-3", "ws-1", "ws-2", 1000);
    const op2 = mockJournalEntry("task-3", "ws-2", "ws-3", 2000);
    
    (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([op1, op2]);
    
    // Setup state: the item is missing everywhere (not in ws-2, not in ws-3)
    mockStore.set(`pebble:v1:tasks:ws-2`, JSON.stringify({}));
    mockStore.set(`pebble:v1:tasks:ws-3`, JSON.stringify({}));

    await MoveReconcilerService.reconcileAll();

    // The operation should abort and return PRESERVED, so no cleanups should happen
    expect(removeOpsUnlockedSpy).not.toHaveBeenCalled();
    expect(removeOpsSpy).not.toHaveBeenCalled();
  });

  test("CASE D: Multiple superseded operations -> Only cleaned up after the last proves resolved", async () => {
    const op1 = mockJournalEntry("task-4", "ws-1", "ws-2", 1000);
    const op2 = mockJournalEntry("task-4", "ws-2", "ws-3", 2000);
    const op3 = mockJournalEntry("task-4", "ws-3", "ws-4", 3000);
    const op4 = mockJournalEntry("task-4", "ws-4", "ws-1", 4000);
    
    (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([op1, op2, op3, op4]);
    
    // Setup state for op4 (moving from ws-4 to ws-1)
    mockStore.set(`pebble:v1:tasks:ws-4`, JSON.stringify({ "task-4": mockTask("task-4", "ws-4") }));
    mockStore.set(`pebble:v1:tasks:ws-1`, JSON.stringify({}));

    await MoveReconcilerService.reconcileAll();

    // Verify op4 was resolved
    expect(removeOpsUnlockedSpy).toHaveBeenCalledWith([op4.operationId]);
    
    // Verify op1, op2, op3 were bulk removed
    expect(removeOpsSpy).toHaveBeenCalledWith([op1.operationId, op2.operationId, op3.operationId]);
    
    // Verify task moved to ws-1
    const ws4 = JSON.parse(mockStore.get(`pebble:v1:tasks:ws-4`) || "{}");
    const ws1 = JSON.parse(mockStore.get(`pebble:v1:tasks:ws-1`) || "{}");
    expect(ws4["task-4"]).toBeUndefined();
    expect(ws1["task-4"].workspaceId).toBe("ws-1");
  });

  test("CASE E: Latest operation is safely obsolete (target deleted) -> Cleanup allowed", async () => {
    const op1 = mockJournalEntry("task-5", "ws-1", "ws-2", 1000);
    const op2 = mockJournalEntry("task-5", "ws-2", "ghost-ws", 2000);
    
    (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([op1, op2]);
    
    // "ghost-ws" is not in the workspaces array
    
    await MoveReconcilerService.reconcileAll();

    // Verify op2 was removed as obsolete
    expect(removeOpsUnlockedSpy).toHaveBeenCalledWith([op2.operationId]);
    
    // Verify op1 was also cleaned up since op2 reached a terminal state
    expect(removeOpsSpy).toHaveBeenCalledWith([op1.operationId]);
  });

  test("CASE F: Crash during superseded-journal cleanup -> Remaining journals preserved", async () => {
    const op1 = mockJournalEntry("task-6", "ws-1", "ws-2", 1000);
    const op2 = mockJournalEntry("task-6", "ws-2", "ws-3", 2000);
    
    (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([op1, op2]);
    
    // Setup state
    mockStore.set(`pebble:v1:tasks:ws-2`, JSON.stringify({ "task-6": mockTask("task-6", "ws-2") }));
    
    // Simulate failure during bulk cleanup
    (MoveJournalRepository.removeOperations as jest.Mock).mockRejectedValueOnce(new Error("Simulated Cleanup Failure"));

    // Should NOT throw out to reconcileAll caller (the catch block in reconcileAll swallows it)
    await expect(MoveReconcilerService.reconcileAll()).resolves.toBeUndefined();

    // op2 should have been removed
    expect(removeOpsUnlockedSpy).toHaveBeenCalledWith([op2.operationId]);
    
    // The bulk remove was called but failed
    expect(removeOpsSpy).toHaveBeenCalledWith([op1.operationId]);
    
    // Since it was swallowed, the crash didn't bubble, but op1 remains in storage for the next run to idempotently ignore.
  });
  
  test("CASE H: Lock verification -> Bulk cleanup does not deadlock with move_journal", async () => {
    const op1 = mockJournalEntry("task-7", "ws-1", "ws-2", 1000);
    const op2 = mockJournalEntry("task-7", "ws-2", "ws-3", 2000);
    
    (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([op1, op2]);
    mockStore.set(`pebble:v1:tasks:ws-2`, JSON.stringify({ "task-7": mockTask("task-7", "ws-2") }));
    
    // If there were a deadlock, `withLock` would hang or throw.
    // By providing a bounded timeout of 5000ms, Jest will fail if it hangs.
    await MoveReconcilerService.reconcileAll();
    
    expect(removeOpsUnlockedSpy).toHaveBeenCalled();
    expect(removeOpsSpy).toHaveBeenCalled();
  }, 5000);
});
