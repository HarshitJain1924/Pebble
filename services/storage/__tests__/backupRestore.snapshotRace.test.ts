import AsyncStorage from "@react-native-async-storage/async-storage";
import { BackupService } from "@/services/storage/backup.service";
import { TaskRepository } from "@/repositories/TaskRepository";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";

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

jest.mock("@/repositories/WorkspaceRepository", () => ({
  WorkspaceRepository: {
    getWorkspaces: jest.fn().mockResolvedValue([{ id: "ws-A" }, { id: "ws-B" }])
  }
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

describe("BackupService - Snapshot Race", () => {
  it("MUST NOT produce a backup with missing entities caused by concurrent mutations", async () => {
    // Original state: task-1 in ws-A, task-2 in ws-B
    store["pebble:v1:tasks:ws-A"] = JSON.stringify({
      "task-1": { id: "task-1", title: "Task 1", workspaceId: "ws-A" }
    });
    store["pebble:v1:tasks:ws-B"] = JSON.stringify({
      "task-2": { id: "task-2", title: "Task 2", workspaceId: "ws-B" }
    });

    let resolveBackupReachedLock: () => void;
    const backupReachedLockPromise = new Promise<void>((r) => { resolveBackupReachedLock = r; });

    let backupFinished = false;

    const originalGetItem = AsyncStorage.getItem;
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key) => {
      if (key === "pebble:v1:tasks:ws-A") {
        resolveBackupReachedLock!();
        
        // Add a slight delay to ensure the mutation has time to execute if it bypasses locks
        await new Promise(r => setTimeout(r, 100));
      }
      return store[key] ?? null;
    });

    const backupPromise = BackupService.generateStructuredBackup().then(res => {
      backupFinished = true;
      return res;
    });

    await backupReachedLockPromise!;

    const { withLock } = require("@/shared/utils/mutex");
    
    let mutationFinished = false;
    const mutationPromise = withLock("pebble:v1:move_journal", async () => {
      store["pebble:v1:tasks:ws-A"] = JSON.stringify({
        "task-2": { id: "task-2", title: "Task 2", workspaceId: "ws-A" }
      });
      store["pebble:v1:tasks:ws-B"] = JSON.stringify({
        "task-1": { id: "task-1", title: "Task 1", workspaceId: "ws-B" }
      });
      mutationFinished = true;
    });

    await new Promise((r) => setTimeout(r, 50));
    
    expect(mutationFinished).toBe(false);

    const backupJson = await backupPromise;
    const backup = JSON.parse(backupJson);

    await mutationPromise; 

    const taskIds = backup.tasks.map((t: any) => t.id);
    
    expect(taskIds).toContain("task-1");
    expect(taskIds).toContain("task-2");
  });
});
