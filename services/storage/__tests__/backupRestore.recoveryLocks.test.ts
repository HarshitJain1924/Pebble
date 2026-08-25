import AsyncStorage from "@react-native-async-storage/async-storage";
import { BackupService } from "@/services/storage/backup.service";
import { MoveReconcilerService } from "@/services/storage/MoveReconcilerService";
import { withLock } from "@/shared/utils/mutex";
import { MoveJournalRepository } from "@/services/storage/MoveJournalRepository";

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

describe("recoverInterruptedRestore — concurrency locks", () => {
  it("MUST acquire locks during recovery so concurrent writers cannot safely interleave", async () => {
    // 1. Simulate an interrupted restore intent already persisted.
    // The intent wants to restore a workspace and some tasks.
    store["pebble:v1:backup_restore_intent"] = JSON.stringify({
      keysToRemove: ["pebble:v1:tasks:ws1", "pebble:v1:tasks:ws2", "pebble:v1:conversion_journal", "pebble:v1:move_journal", "pebble:v1:recycle_bin"],
      kvPairsToSet: [
        ["pebble:v1:tasks:ws1", JSON.stringify({ "task-1": { id: "task-1", title: "Old Restored Task" } })]
      ]
    });

    // We will track the order of operations
    const executionOrder: string[] = [];

    // We'll hook into AsyncStorage.multiSet to pause the recovery halfway
    // to give the concurrent writer a chance to run.
    let resolveRecoveryPause: () => void;
    const recoveryPausePromise = new Promise<void>((r) => { resolveRecoveryPause = r; });

    let resolveWriterProceed: () => void;
    const writerProceedPromise = new Promise<void>((r) => { resolveWriterProceed = r; });

    (AsyncStorage.multiSet as jest.Mock).mockImplementation(async (pairs) => {
      // If this is the recovery's multiSet...
      if (pairs.some((p: [string, string]) => p[0] === "pebble:v1:tasks:ws1")) {
        executionOrder.push("RECOVERY_MULTISET_START");
        // Tell writer it can proceed
        resolveWriterProceed!();
        // Wait until writer is done (or blocked)
        await recoveryPausePromise;
        executionOrder.push("RECOVERY_MULTISET_END");
      }
      // Actually do the set
      for (const [k, v] of pairs) store[k] = v;
    });

    // 2. Recovery begins
    const recoveryPromise = BackupService.recoverInterruptedRestore();

    // 3. A legitimate concurrent writer (e.g. MoveReconciler) attempts to modify an affected partition.
    // Wait until recovery has definitely started and reached its lock/multiSet phase
    await writerProceedPromise!;

    executionOrder.push("WRITER_ATTEMPTS_LOCK");

    // The writer attempts to acquire a lock that recovery *should* be holding.
    // In this case, "pebble:v1:tasks:ws1" or "pebble:v1:move_journal".
    const writerPromise = withLock("pebble:v1:move_journal", async () => {
      executionOrder.push("WRITER_ACQUIRED_LOCK");
      // Simulate writing a newer mutation
      store["pebble:v1:move_journal"] = JSON.stringify([{ id: "new-move" }]);
    });

    // Let the event loop cycle to see if the writer gets the lock
    await new Promise(r => setTimeout(r, 50));

    // If the writer got the lock BEFORE recovery finished, the bug exists!
    // But since the fix, the writer should be BLOCKED here because recovery holds the lock.
    
    // Resume recovery
    resolveRecoveryPause!();

    await recoveryPromise;
    await writerPromise;

    // 4. Verify the writer cannot interleave unsafely.
    // The strict expected order:
    // 1. RECOVERY_MULTISET_START
    // 2. WRITER_ATTEMPTS_LOCK
    // 3. RECOVERY_MULTISET_END (Recovery finishes because writer is blocked!)
    // 4. WRITER_ACQUIRED_LOCK (Writer finally gets the lock after recovery releases it)

    expect(executionOrder).toEqual([
      "RECOVERY_MULTISET_START",
      "WRITER_ATTEMPTS_LOCK",
      "RECOVERY_MULTISET_END",
      "WRITER_ACQUIRED_LOCK"
    ]);

    // 5. Verify final state is deterministic and no newer mutation is silently lost.
    // The recovery's data should be written first, THEN the writer's data.
    expect(store["pebble:v1:move_journal"]).toContain("new-move");
  });
});
