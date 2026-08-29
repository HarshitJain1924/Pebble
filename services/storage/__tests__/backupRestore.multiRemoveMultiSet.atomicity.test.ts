/**
 * backupRestore.multiRemoveMultiSet.atomicity.test.ts
 * ───────────────────────────────────────────────────────────────────────────
 * REGRESSION TEST: Backup restore atomicity vulnerability
 *
 * BUG: BackupService.restoreStructuredBackup() executes:
 *   await AsyncStorage.multiRemove(finalKeysToRemove);  // 1. DELETE old data
 *   await AsyncStorage.multiSet(kvPairsToSet);           // 2. WRITE new data
 *
 * These are TWO separate AsyncStorage operations with NO atomicity guarantee.
 * If the process dies between (1) and (2), all data is lost permanently.
 *
 * CRASH WINDOW: Process termination after multiRemove completes but before
 * multiSet starts.
 *
 * PERSISTENT STATE AFTER CRASH: Empty storage. The rollback snapshot
 * (validRollbackData) exists only in memory and is lost with the process.
 *
 * IMPACT: Total, permanent, unrecoverable data loss.
 *
 * FIX: Write a durable recovery intent to `pebble:v1:backup_restore_intent`
 * before the destructive multiRemove. If a crash occurs, the next app boot
 * or restore retry will detect the intent and roll forward to the new backup state.
 *
 * This test MUST FAIL on the current implementation and PASS after the fix.
 *
 * This test MUST FAIL on the current (delete-first) implementation and PASS
 * after the fix (write-first).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { BackupService, type AppBackup } from "@/services/storage/backup.service";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { TaskRepository } from "@/repositories/TaskRepository";

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

jest.mock("expo-notifications", () => ({
  cancelAllScheduledNotificationsAsync: jest.fn(),
}));

const store: Record<string, string> = {};

(AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
  store[key] ?? null,
);
(AsyncStorage.setItem as jest.Mock).mockImplementation(
  async (key: string, val: string) => {
    store[key] = val;
  },
);
(AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => {
  delete store[key];
});
(AsyncStorage.getAllKeys as jest.Mock).mockImplementation(async () =>
  Object.keys(store),
);
(AsyncStorage.multiGet as jest.Mock).mockImplementation(async (keys: string[]) =>
  keys.map((k) => [k, store[k] ?? null]),
);
(AsyncStorage.multiSet as jest.Mock).mockImplementation(
  async (pairs: readonly (readonly [string, string])[]) => {
    for (const [k, v] of pairs) store[k] = v;
  },
);
(AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => {
  for (const k of keys) delete store[k];
});

function seedLiveData(): void {
  store["pebble:v1:workspaces"] = JSON.stringify([
    { id: "ws-live", name: "Live Workspace", createdAt: 100, updatedAt: 100 },
  ]);
  store["pebble:v1:tasks:ws-live"] = JSON.stringify({
    "task-live": {
      id: "task-live",
      title: "Live Task",
      workspaceId: "ws-live",
      status: "todo",
      priority: "none",
      createdAt: 100,
      updatedAt: 100,
    },
  });
  store["pebble:v1:habits:ws-live"] = JSON.stringify({});
  store["pebble:v1:checklists:ws-live"] = JSON.stringify({});
  store["pebble:v1:resources:ws-live"] = JSON.stringify({});
}

function makeBackup(): AppBackup {
  return {
    version: 1,
    timestamp: 200,
    workspaces: [
      { id: "ws-backup", name: "Backup Workspace", revision: 1, lifecycleGeneration: 1, createdAt: 200, updatedAt: 200 },
    ],
    tasks: [
      {
        id: "task-backup",
        title: "Backup Task",
        workspaceId: "ws-backup",
        status: "todo",
        priority: "none",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 200,
        updatedAt: 200,
      },
    ],
    habits: [],
    checklists: [],
    resources: [],
    recycleBin: [],
    focusSessions: [],
    relationships: [],
    systemEvents: [],
    settings: {},
    profile: {},
  };
}

describe("BackupService.restoreStructuredBackup — multiRemove/multiSet atomicity", () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    jest.clearAllMocks();
  });

  it("REGRESSION: process death between multiRemove and multiSet MUST NOT lose all data", async () => {
    seedLiveData();

    // Verify baseline: live data exists before restore
    const liveWorkspaces = await WorkspaceRepository.getWorkspaces();
    expect(liveWorkspaces).toHaveLength(1);
    expect(liveWorkspaces[0].id).toBe("ws-live");

    // Simulate process death EXACTLY between multiRemove and multiSet
    let removeHasExecuted = false;
    (AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => {
      for (const k of keys) delete store[k];
      removeHasExecuted = true;
    });

    (AsyncStorage.multiSet as jest.Mock).mockImplementation(
      async (pairs: readonly (readonly [string, string])[]) => {
        if (removeHasExecuted) {
          // Process dies before multiSet executes. The rollback snapshot
          // (validRollbackData) is in-memory and lost.
          throw new Error("PROCESS TERMINATED BETWEEN REMOVE AND SET");
        }
        for (const [k, v] of pairs) store[k] = v;
      },
    );

    // Attempt restore — it will crash in the critical window
    await expect(
      BackupService.restoreStructuredBackup(JSON.stringify(makeBackup())),
    ).rejects.toThrow("PROCESS TERMINATED");

    console.log("Storage keys after crash:", Object.keys(store));
    console.log("Storage contents:", store);

    // CRITICAL REGRESSION ASSERTION:
    // After a crash, the durable intent MUST exist.
    const keysAfterCrash = await AsyncStorage.getAllKeys();
    expect(keysAfterCrash).toContain("pebble:v1:backup_restore_intent");

    // We simulate an app reboot by calling the recovery function explicitly.
    // First, restore the normal behavior of multiSet so recovery can succeed.
    (AsyncStorage.multiSet as jest.Mock).mockImplementation(
      async (pairs: readonly (readonly [string, string])[]) => {
        for (const [k, v] of pairs) store[k] = v;
      },
    );
    
    await BackupService.recoverInterruptedRestore();

    // Strong assertion: the backup workspace MUST exist now that recovery has run
    const workspacesAfterCrash = await WorkspaceRepository.getWorkspaces();
    expect(workspacesAfterCrash.length).toBeGreaterThan(0);
    expect(workspacesAfterCrash.map((w) => w.id)).toContain("ws-backup");
  });

  it("RECOVERY: retry after crash must converge to exact backup state", async () => {
    seedLiveData();

    // First attempt: crash in the critical window
    let removeHasExecuted = false;
    (AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => {
      for (const k of keys) delete store[k];
      removeHasExecuted = true;
    });

    (AsyncStorage.multiSet as jest.Mock).mockImplementation(
      async (pairs: readonly (readonly [string, string])[]) => {
        if (removeHasExecuted) {
          throw new Error("PROCESS TERMINATED");
        }
        for (const [k, v] of pairs) store[k] = v;
      },
    );

    await expect(
      BackupService.restoreStructuredBackup(JSON.stringify(makeBackup())),
    ).rejects.toThrow();

    // After the fix, the backup data exists even though the operation crashed.
    // Restore the normal (crash-free) mocks for retry.
    (AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => {
      for (const k of keys) delete store[k];
    });
    (AsyncStorage.multiSet as jest.Mock).mockImplementation(
      async (pairs: readonly (readonly [string, string])[]) => {
        for (const [k, v] of pairs) store[k] = v;
      },
    );

    // Retry the restore — must succeed and produce exact backup state
    await expect(
      BackupService.restoreStructuredBackup(JSON.stringify(makeBackup())),
    ).resolves.not.toThrow();

    const workspaces = await WorkspaceRepository.getWorkspaces();
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].id).toBe("ws-backup");

    const tasks = await TaskRepository.getTasks("ws-backup");
    expect(Object.keys(tasks)).toEqual(["task-backup"]);

    // Old "ws-live" partition must be gone
    const oldTasks = await TaskRepository.getTasks("ws-live");
    expect(Object.keys(oldTasks)).toHaveLength(0);
  });
});
