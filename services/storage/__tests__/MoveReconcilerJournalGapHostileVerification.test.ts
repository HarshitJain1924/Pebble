import AsyncStorage from "@react-native-async-storage/async-storage";
import { MoveReconcilerService } from "../MoveReconcilerService";
import { MoveJournalRepository } from "@/repositories/MoveJournalRepository";
import type { Task, MoveJournalEntry } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () => {
  const store = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => store.get(key) || null),
    setItem: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    multiGet: jest.fn(async (keys: string[]) => {
      return keys.map((key) => [key, store.get(key) || null]);
    }),
    multiSet: jest.fn(async (keyValuePairs: [string, string][]) => {
      for (const [key, value] of keyValuePairs) {
        store.set(key, value);
      }
    }),
    multiRemove: jest.fn(async (keys: string[]) => {
      for (const key of keys) {
        store.delete(key);
      }
    }),
    __store: store, // Expose for testing
  };
});

describe("MoveReconciler Journal Gap Hostile Verification", () => {
  let store: Map<string, string>;

  beforeEach(async () => {
    jest.clearAllMocks();
    store = (AsyncStorage as any).__store;
    store.clear();
  });

  it("should securely retain journal and data on partial storage write failure", async () => {
    // 1. Initial State Setup
    const taskId = "task-1";
    const sourceWs = "ws-1";
    const targetWs = "ws-2";
    
    const task: Task = {
      id: taskId,
      workspaceId: sourceWs,
      title: "Test Task",
      status: "todo",
      priority: "none",
      createdAt: Date.now(),
      updatedAt: 1000,
      revision: 1,
      lifecycleGeneration: 1,
    };

    const op: MoveJournalEntry = {
      operationId: "op-1",
      operationType: "move",
      entityId: taskId,
      entityType: "task",
      sourceWorkspaceId: sourceWs,
      targetWorkspaceId: targetWs,
      timestamp: 2000,
      lifecycleGeneration: 1,
      expectedRevision: 1,
    };

    store.set(`pebble:v1:tasks:${sourceWs}`, JSON.stringify({ [taskId]: task }));
    store.set(`pebble:v1:move_journal`, JSON.stringify([op]));
    // Workspaces must exist to pass the abort-on-delete verification
    store.set(`pebble:v1:workspaces`, JSON.stringify([{ id: sourceWs }, { id: targetWs }]));

    // 2. Simulate Partial Write Failure
    // We override multiSet (current impl) or setItem (future impl) to fail AFTER deleting from source.
    const originalMultiSet = AsyncStorage.multiSet;
    const originalSetItem = AsyncStorage.setItem;
    
    let crashTriggered = false;

    (AsyncStorage.multiSet as jest.Mock).mockImplementationOnce(async (keyValuePairs: [string, string][]) => {
      for (const [key, value] of keyValuePairs) {
        if (key === `pebble:v1:tasks:${sourceWs}`) {
          store.set(key, value); // Delete from source succeeds
        }
        if (key === `pebble:v1:tasks:${targetWs}`) {
          crashTriggered = true;
          throw new Error("Simulated Native Storage Crash: Target write failed!");
        }
      }
    });

    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
      if (key === `pebble:v1:tasks:${targetWs}`) {
        crashTriggered = true;
        throw new Error("Simulated Native Storage Crash: Target write failed!");
      }
      store.set(key, value);
    });

    // 3. Run Reconciler (Boot 1)
    await expect(MoveReconcilerService.reconcileAll()).rejects.toThrow("Simulated Native Storage Crash");
    expect(crashTriggered).toBe(true);

    // 4. Verify State After Crash
    // In the old implementation (multiSet), data was missing from both and permanently lost.
    // In the fixed implementation, target throws, and source is safely preserved!
    const sourceMapStr = store.get(`pebble:v1:tasks:${sourceWs}`);
    const targetMapStr = store.get(`pebble:v1:tasks:${targetWs}`);
    
    expect(sourceMapStr ? JSON.parse(sourceMapStr)[taskId] : undefined).toBeDefined(); // Source preserved!
    expect(targetMapStr ? JSON.parse(targetMapStr)[taskId] : undefined).toBeUndefined(); // Target failed
    
    // Journal must be retained!
    const journalStr = store.get(`pebble:v1:move_journal`);
    expect(journalStr).toBeDefined();
    expect(JSON.parse(journalStr!).length).toBe(1);

    // 5. Next Boot Recovery
    // Remove the hostile mock
    (AsyncStorage.multiSet as jest.Mock).mockImplementation(async (keyValuePairs: [string, string][]) => {
      for (const [key, value] of keyValuePairs) {
        store.set(key, value);
      }
    });
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
      store.set(key, value);
    });

    // Reconciler runs again.
    // Because the source was safely preserved by the fix, the next boot
    // successfully completes the move and cleans up!
    await MoveReconcilerService.reconcileAll();

    // Verify recovery succeeded
    const finalSourceStr = store.get(`pebble:v1:tasks:${sourceWs}`);
    const finalTargetStr = store.get(`pebble:v1:tasks:${targetWs}`);
    
    expect(JSON.parse(finalSourceStr!)[taskId]).toBeUndefined(); // Finally moved
    expect(JSON.parse(finalTargetStr!)[taskId]).toBeDefined(); // Target received it

    // Journal safely removed after TRUE success
    const finalJournal = store.get(`pebble:v1:move_journal`);
    const finalParsed = finalJournal ? JSON.parse(finalJournal) : [];
    expect(finalParsed.length).toBe(0);
  });
});
