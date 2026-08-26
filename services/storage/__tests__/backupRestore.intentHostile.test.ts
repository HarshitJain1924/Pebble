import AsyncStorage from "@react-native-async-storage/async-storage";
import { BackupService, type AppBackup } from "@/services/storage/backup.service";

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

// In-memory mock store
let store: Record<string, string> = {};
let processIsDead = false;

beforeEach(() => {
  store = {};
  processIsDead = false;
  jest.clearAllMocks();

  const checkDeath = () => { if (processIsDead) throw new Error("PROCESS_IS_DEAD"); };

  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => { checkDeath(); return store[key] ?? null; });
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string) => { checkDeath(); store[key] = val; });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => { checkDeath(); delete store[key]; });
  (AsyncStorage.getAllKeys as jest.Mock).mockImplementation(async () => { checkDeath(); return Object.keys(store); });
  (AsyncStorage.multiGet as jest.Mock).mockImplementation(async (keys: string[]) => { checkDeath(); return keys.map(k => [k, store[k] ?? null]); });
  (AsyncStorage.multiSet as jest.Mock).mockImplementation(async (pairs: readonly (readonly [string, string])[]) => {
    checkDeath();
    for (const [k, v] of pairs) store[k] = v;
  });
  (AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => {
    checkDeath();
    for (const k of keys) delete store[k];
  });
});

function reviveProcess() {
  processIsDead = false;
}

function makeBackup(): AppBackup {
  return {
    version: 1,
    timestamp: 200,
    workspaces: [{ id: "ws-backup", name: "Backup Workspace", createdAt: 200, updatedAt: 200 }],
    tasks: [{ id: "task-backup", title: "Backup Task", workspaceId: "ws-backup", status: "todo", priority: "none", createdAt: 200, updatedAt: 200 }],
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

describe("BackupService Intent Crash Boundaries", () => {
  it("covers all required crash boundaries A-H", async () => {
    // Seed initial live data
    store["pebble:v1:workspaces"] = JSON.stringify([{ id: "ws-live", name: "Live Workspace", createdAt: 100, updatedAt: 100 }]);
    store["pebble:v1:tasks:ws-live"] = JSON.stringify({ "task-live": { id: "task-live", title: "Live Task", workspaceId: "ws-live", status: "todo", priority: "none", createdAt: 100, updatedAt: 100 } });

    const backupJson = JSON.stringify(makeBackup());

    // A. Crash before backup_restore_intent is persisted
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(async (key: string, val: string) => {
      if (key === "pebble:v1:backup_restore_intent") {
        processIsDead = true;
        throw new Error("PROCESS_IS_DEAD");
      }
      store[key] = val;
    });

    await expect(BackupService.restoreStructuredBackup(backupJson)).rejects.toThrow("PROCESS_IS_DEAD");
    expect(store["pebble:v1:backup_restore_intent"]).toBeUndefined();
    expect(store["pebble:v1:workspaces"]).toContain("ws-live"); // Old data intact
    reviveProcess();

    // B. Intent persisted, crash before multiRemove
    (AsyncStorage.multiRemove as jest.Mock).mockImplementationOnce(async (keys: string[]) => {
      processIsDead = true;
      throw new Error("PROCESS_IS_DEAD");
    });

    await expect(BackupService.restoreStructuredBackup(backupJson)).rejects.toThrow("PROCESS_IS_DEAD");
    expect(store["pebble:v1:backup_restore_intent"]).toBeDefined(); // Intent exists
    expect(store["pebble:v1:workspaces"]).toContain("ws-live"); // Old data intact
    reviveProcess();

    // Recover from B
    await BackupService.recoverInterruptedRestore();
    expect(store["pebble:v1:backup_restore_intent"]).toBeUndefined();
    expect(store["pebble:v1:workspaces"]).toContain("ws-backup"); // Recovered!

    // Reset for C
    store = {};
    store["pebble:v1:workspaces"] = JSON.stringify([{ id: "ws-live", name: "Live Workspace", createdAt: 100, updatedAt: 100 }]);
    store["pebble:v1:tasks:ws-live"] = JSON.stringify({ "task-live": { id: "task-live", title: "Live Task" } });

    // C. multiRemove succeeds, crash before multiSet
    let removeSucceeded = false;
    (AsyncStorage.multiRemove as jest.Mock).mockImplementationOnce(async (keys: string[]) => {
      for (const k of keys) delete store[k];
      removeSucceeded = true;
    });
    (AsyncStorage.multiSet as jest.Mock).mockImplementationOnce(async (pairs: readonly (readonly [string, string])[]) => {
      if (removeSucceeded) {
        processIsDead = true;
        throw new Error("PROCESS_IS_DEAD");
      }
      for (const [k, v] of pairs) store[k] = v;
    });

    await expect(BackupService.restoreStructuredBackup(backupJson)).rejects.toThrow("PROCESS_IS_DEAD");
    expect(store["pebble:v1:backup_restore_intent"]).toBeDefined();
    // At this point, store has neither old nor new (except intent)
    expect(store["pebble:v1:workspaces"]).toBeUndefined(); 
    reviveProcess();

    // Recover from C
    await BackupService.recoverInterruptedRestore();
    expect(store["pebble:v1:backup_restore_intent"]).toBeUndefined();
    expect(store["pebble:v1:workspaces"]).toContain("ws-backup"); // Recovered!

    // Reset for D
    store = {};
    store["pebble:v1:workspaces"] = JSON.stringify([{ id: "ws-live", name: "Live Workspace" }]);

    // D. multiSet succeeds, crash before intent removal
    (AsyncStorage.removeItem as jest.Mock).mockImplementationOnce(async (key: string) => {
      if (key === "pebble:v1:backup_restore_intent") {
        processIsDead = true;
        throw new Error("PROCESS_IS_DEAD");
      }
      delete store[key];
    });

    await expect(BackupService.restoreStructuredBackup(backupJson)).rejects.toThrow("PROCESS_IS_DEAD");
    expect(store["pebble:v1:backup_restore_intent"]).toBeDefined();
    expect(store["pebble:v1:workspaces"]).toContain("ws-backup"); // Data is already new
    reviveProcess();

    // Recover from D
    await BackupService.recoverInterruptedRestore();
    expect(store["pebble:v1:backup_restore_intent"]).toBeUndefined();
    expect(store["pebble:v1:workspaces"]).toContain("ws-backup");

    // Reset for E
    store = {};
    store["pebble:v1:workspaces"] = JSON.stringify([{ id: "ws-live", name: "Live Workspace" }]);
    
    // Create intent manually for E
    store["pebble:v1:backup_restore_intent"] = JSON.stringify({
      keysToRemove: ["pebble:v1:workspaces"],
      kvPairsToSet: [["pebble:v1:workspaces", JSON.stringify([{ id: "ws-backup", name: "Backup Workspace" }])]]
    });

    // E. Crash during recoverInterruptedRestore()
    (AsyncStorage.multiRemove as jest.Mock).mockImplementationOnce(async () => {
      processIsDead = true;
      throw new Error("PROCESS_IS_DEAD");
    });
    await expect(BackupService.recoverInterruptedRestore()).rejects.toThrow("PROCESS_IS_DEAD");
    expect(store["pebble:v1:backup_restore_intent"]).toBeDefined(); // Intent still exists
    reviveProcess();

    // F. Recovery runs repeatedly
    await BackupService.recoverInterruptedRestore();
    expect(store["pebble:v1:backup_restore_intent"]).toBeUndefined();
    expect(store["pebble:v1:workspaces"]).toContain("ws-backup");

    // G. Recovery completes successfully and intent is removed
    // (Demonstrated by F succeeding)

    // H. Recovery sees an already-completed backup and must remain idempotent
    // Simulate intent left behind but data already correct
    store["pebble:v1:backup_restore_intent"] = JSON.stringify({
      keysToRemove: ["pebble:v1:workspaces"],
      kvPairsToSet: [["pebble:v1:workspaces", JSON.stringify([{ id: "ws-backup", name: "Backup Workspace" }])]]
    });
    await BackupService.recoverInterruptedRestore();
    expect(store["pebble:v1:backup_restore_intent"]).toBeUndefined();
    expect(store["pebble:v1:workspaces"]).toContain("ws-backup"); // Remained the same
  });
});
