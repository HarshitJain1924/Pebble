import AsyncStorage from "@react-native-async-storage/async-storage";
import { BackupService } from "@/services/storage/backup.service";
import { withLock } from "@/shared/utils/mutex";

// We want to use real mutexes and partial real backup service logic.
// But we'll mock AsyncStorage completely.

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
  jest.clearAllMocks();

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

describe("BackupService - Stale Intent Race", () => {
  it("MUST NOT overwrite a newer backup if recovery was delayed after reading a stale intent", async () => {
    // 1. Simulate an interrupted restore intent A already persisted.
    store["pebble:v1:backup_restore_intent"] = JSON.stringify({
      keysToRemove: ["pebble:v1:tasks:ws1", "pebble:v1:conversion_journal", "pebble:v1:move_journal", "pebble:v1:recycle_bin"],
      kvPairsToSet: [
        ["pebble:v1:tasks:ws1", "OLD-BACKUP"]
      ]
    });
    
    // We'll hook into AsyncStorage.getItem to detect when Recovery A reads the intent.
    let resolveRecoveryRead: () => void;
    const recoveryReadPromise = new Promise<void>((r) => { resolveRecoveryRead = r; });

    let resolveMainThreadProceed: () => void;
    const mainThreadProceedPromise = new Promise<void>((r) => { resolveMainThreadProceed = r; });

    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key) => {
      const val = store[key] ?? null;
      if (key === "pebble:v1:backup_restore_intent" && val?.includes("OLD-BACKUP")) {
        resolveRecoveryRead!();
        await mainThreadProceedPromise;
      }
      return val;
    });

    // 2. Recovery A begins
    const recoveryPromise = BackupService.recoverInterruptedRestore();

    // Wait until Recovery A reads the old intent A.
    await recoveryReadPromise!;

    // 3. Now Recovery A is paused BEFORE acquiring locks, but WITH intent A in memory.
    
    // 4. A newer Restore B commits.
    // For simplicity, we just simulate Restore B doing what it does:
    // It acquires the locks, writes the newer backup, and removes the intent.
    await withLock("pebble:v1:tasks:ws1", async () => {
       await AsyncStorage.multiRemove(["pebble:v1:tasks:ws1"]);
       await AsyncStorage.multiSet([["pebble:v1:tasks:ws1", "NEWER-BACKUP"]]);
       await AsyncStorage.removeItem("pebble:v1:backup_restore_intent");
    });
    
    expect(store["pebble:v1:tasks:ws1"]).toBe("NEWER-BACKUP");

    // 5. Recovery A resumes. It will acquire the locks and try to replay intent A!
    resolveMainThreadProceed!();
    await recoveryPromise;

    // 6. Verify that Recovery A did NOT overwrite NEWER-BACKUP with OLD-BACKUP.
    expect(store["pebble:v1:tasks:ws1"]).toBe("NEWER-BACKUP");
  });
});
