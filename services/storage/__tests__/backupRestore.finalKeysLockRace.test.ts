import AsyncStorage from "@react-native-async-storage/async-storage";
import { BackupService, AppBackup } from "@/services/storage/backup.service";
import { withLock } from "@/shared/utils/mutex";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";

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

let store: Record<string, string> = {};

beforeEach(() => {
  store = {};
  jest.restoreAllMocks();

  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => store[key] ?? null);
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string) => { store[key] = val; });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => { delete store[key]; });
  (AsyncStorage.getAllKeys as jest.Mock).mockImplementation(async () => Object.keys(store));
  (AsyncStorage.multiGet as jest.Mock).mockImplementation(async (keys: string[]) => keys.map(k => [k, store[k] ?? null]));
  (AsyncStorage.multiSet as jest.Mock).mockImplementation(async (pairs: readonly (readonly [string, string])[]) => {
    for (const [k, v] of pairs) store[k] = v;
  });
  (AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => {
    for (const k of keys) delete store[k];
  });
});

describe("BackupService - restoreStructuredBackup FinalKeys Lock Race", () => {
  it("PROVES BUG: new partition created after initial getAllKeys is deleted in multiRemove without holding its partition lock", async () => {
    // 1. Initial State: Only workspaces and ws-A exist
    store["pebble:v1:workspaces"] = JSON.stringify([{ id: "ws-A", name: "Workspace A" }]);
    store["pebble:v1:tasks:ws-A"] = JSON.stringify({
      "task-A1": { id: "task-A1", title: "Task A1", workspaceId: "ws-A" }
    });

    const validBackup: AppBackup = {
      version: 1,
      timestamp: Date.now(),
      workspaces: [{ id: "ws-A", name: "Workspace A", revision: 1, lifecycleGeneration: 1, createdAt: 1000, updatedAt: 1000 }],
      tasks: [{ id: "task-A1", title: "Task A1", workspaceId: "ws-A", status: "todo", priority: "medium", revision: 1, lifecycleGeneration: 1, createdAt: 1000, updatedAt: 1000 }],
      habits: [],
      checklists: [],
      resources: [],
      recycleBin: [],
      focusSessions: [],
      relationships: [],
      systemEvents: [],
      settings: {} as any,
      profile: {} as any,
    };
    const backupJson = JSON.stringify(validBackup);

    let getAllKeysCallCount = 0;
    let resolvePause: () => void;
    const pausePromise = new Promise<void>((r) => { resolvePause = r; });
    let resolveInitialGetAllKeysDone: () => void;
    const initialGetAllKeysDonePromise = new Promise<void>((r) => { resolveInitialGetAllKeysDone = r; });

    (AsyncStorage.getAllKeys as jest.Mock).mockImplementation(async () => {
      getAllKeysCallCount++;
      const keys = Object.keys(store);
      if (getAllKeysCallCount === 1) {
        // Step 1: Initial getAllKeys outside locks completed
        resolveInitialGetAllKeysDone();
        // Pause restore before acquiring locks
        await pausePromise;
      }
      return keys;
    });

    let unlockedPartitionMutatedDuringMultiRemove = false;

    let testLockPromise: Promise<void> | undefined;

    (AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => {
      if (keys.includes("pebble:v1:tasks:ws-B")) {
        // At the exact moment restore attempts to destructively multiRemove ws-B,
        // test whether pebble:v1:tasks:ws-B lock is actively held by attempting a concurrent withLock.
        let concurrentLockAcquired = false;
        testLockPromise = withLock("pebble:v1:tasks:ws-B", async () => {
          concurrentLockAcquired = true;
        });

        // Yield to see if withLock on tasks:ws-B acquires immediately (unlocked)
        await new Promise((r) => setTimeout(r, 40));

        if (concurrentLockAcquired) {
          unlockedPartitionMutatedDuringMultiRemove = true;
        }
      }

      for (const k of keys) delete store[k];
    });

    // Start restore
    const restorePromise = BackupService.restoreStructuredBackup(backupJson);

    // Wait for pre-lock getAllKeys to finish
    await initialGetAllKeysDonePromise;

    // Step 2: While restore is paused before lock acquisition, create new partition ws-B
    store["pebble:v1:tasks:ws-B"] = JSON.stringify({
      "task-B1": { id: "task-B1", title: "Task B1", workspaceId: "ws-B" }
    });

    // Step 3: Resume restore
    resolvePause!();

    await restorePromise;
    if (testLockPromise) {
      await testLockPromise;
    }

    // IN THE VULNERABLE CODE:
    // unlockedPartitionMutatedDuringMultiRemove is TRUE because pebble:v1:tasks:ws-B was never in rawLockKeys,
    // so multiRemove deleted it while concurrent withLock("pebble:v1:tasks:ws-B") was NOT blocked!
    // IN THE FIXED CODE:
    // Restore detects that finalKeysToRemove contains keys not in rawLockKeys, releases locks and retries,
    // thereby acquiring pebble:v1:tasks:ws-B lock before multiRemove!
    expect(unlockedPartitionMutatedDuringMultiRemove).toBe(false);
  });
});
