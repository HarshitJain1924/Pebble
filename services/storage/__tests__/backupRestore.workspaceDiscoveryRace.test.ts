import AsyncStorage from "@react-native-async-storage/async-storage";
import { BackupService } from "@/services/storage/backup.service";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { WorkspaceCommandHandler } from "@/services/command/handlers/WorkspaceCommandHandler";
import { TaskRepository } from "@/repositories/TaskRepository";
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

describe("BackupService - Workspace Discovery Race", () => {
  it("PROVES BUG: new workspace created after initial read has unlocked partitions, allowing concurrent mutation during backup read", async () => {
    // 1. Initial State: Only ws-A exists
    const wsA = { id: "ws-A", name: "Workspace A", createdAt: 1000, updatedAt: 1000 };
    store["pebble:v1:workspaces"] = JSON.stringify([wsA]);
    store["pebble:v1:tasks:ws-A"] = JSON.stringify({
      "task-A1": { id: "task-A1", title: "Task A1", workspaceId: "ws-A" }
    });

    let getWorkspacesCallCount = 0;
    let resolvePause: () => void;
    const pausePromise = new Promise<void>((r) => { resolvePause = r; });
    let resolveInitialReadDone: () => void;
    const initialReadDonePromise = new Promise<void>((r) => { resolveInitialReadDone = r; });

    const originalGetWorkspaces = WorkspaceRepository.getWorkspaces.bind(WorkspaceRepository);
    jest.spyOn(WorkspaceRepository, "getWorkspaces").mockImplementation(async () => {
      getWorkspacesCallCount++;
      const result = await originalGetWorkspaces();
      if (getWorkspacesCallCount === 1) {
        // Step 1: Initial read outside the lock completed
        resolveInitialReadDone();
        // Pause backup before acquiring locks
        await pausePromise;
      }
      return result;
    });

    // Start backup
    const backupPromise = BackupService.generateStructuredBackup();

    // Wait for initial read to complete
    await initialReadDonePromise;

    // Step 2: While backup is paused before lock acquisition, create ws-B and a task in ws-B
    const wsB = { id: "ws-B", name: "Workspace B", createdAt: 2000, updatedAt: 2000 };
    await WorkspaceCommandHandler.createWorkspace(wsB as any);
    store["pebble:v1:tasks:ws-B"] = JSON.stringify({
      "task-B1": { id: "task-B1", title: "Task B1", workspaceId: "ws-B" }
    });

    // Intercept read of ws-B tasks to test if partition lock is held
    let resolveBackupReadingWsB: () => void;
    const backupReadingWsBPromise = new Promise<void>((r) => { resolveBackupReadingWsB = r; });

    const originalGetTasks = TaskRepository.getTasks.bind(TaskRepository);
    jest.spyOn(TaskRepository, "getTasks").mockImplementation(async (wsId: string) => {
      if (wsId === "ws-B") {
        resolveBackupReadingWsB();
        // Add a delay while backup is reading ws-B to allow concurrent mutation
        await new Promise((r) => setTimeout(r, 100));
      }
      return originalGetTasks(wsId);
    });

    // Step 3: Resume backup
    resolvePause!();

    // Wait until backup is actively reading ws-B
    await backupReadingWsBPromise;

    // Step 4: Try a concurrent mutation on ws-B's partition using standard withLock
    let concurrentMutationExecuted = false;
    const concurrentMutationPromise = withLock("pebble:v1:tasks:ws-B", async () => {
      concurrentMutationExecuted = true;
      store["pebble:v1:tasks:ws-B"] = JSON.stringify({
        "task-B1": { id: "task-B1", title: "Task B1", workspaceId: "ws-B" },
        "task-B2": { id: "task-B2", title: "Task B2", workspaceId: "ws-B" }
      });
    });

    // Yield to let concurrent mutation run if the lock was NOT acquired by backup
    await new Promise((r) => setTimeout(r, 40));

    // IN THE VULNERABLE CODE:
    // concurrentMutationExecuted will be TRUE because pebble:v1:tasks:ws-B was never locked!
    // IN THE SECURE CODE:
    // Backup either retry-locked all partitions (including ws-B) or locked ws-B, so concurrentMutationExecuted MUST be false!
    expect(concurrentMutationExecuted).toBe(false);

    await concurrentMutationPromise;
    const backupJson = await backupPromise;
    const backup = JSON.parse(backupJson);

    // Verify backup contains both workspaces and all tasks consistently
    const wsIds = backup.workspaces.map((w: any) => w.id);
    expect(wsIds).toContain("ws-A");
    expect(wsIds).toContain("ws-B");
  });

  it("handles workspace deleted after initial read by releasing stale locks and retrying safely", async () => {
    // 1. Initial State: Both ws-A and ws-B exist
    const wsA = { id: "ws-A", name: "Workspace A", createdAt: 1000, updatedAt: 1000 };
    const wsB = { id: "ws-B", name: "Workspace B", createdAt: 2000, updatedAt: 2000 };
    store["pebble:v1:workspaces"] = JSON.stringify([wsA, wsB]);
    store["pebble:v1:tasks:ws-A"] = JSON.stringify({
      "task-A1": { id: "task-A1", title: "Task A1", workspaceId: "ws-A" }
    });
    store["pebble:v1:tasks:ws-B"] = JSON.stringify({
      "task-B1": { id: "task-B1", title: "Task B1", workspaceId: "ws-B" }
    });

    let getWorkspacesCallCount = 0;
    let resolvePause: () => void;
    const pausePromise = new Promise<void>((r) => { resolvePause = r; });
    let resolveInitialReadDone: () => void;
    const initialReadDonePromise = new Promise<void>((r) => { resolveInitialReadDone = r; });

    const originalGetWorkspaces = WorkspaceRepository.getWorkspaces.bind(WorkspaceRepository);
    jest.spyOn(WorkspaceRepository, "getWorkspaces").mockImplementation(async () => {
      getWorkspacesCallCount++;
      const result = await originalGetWorkspaces();
      if (getWorkspacesCallCount === 1) {
        // Step 1: Initial read outside the lock completed
        resolveInitialReadDone();
        // Pause backup before acquiring locks
        await pausePromise;
      }
      return result;
    });

    // Start backup
    const backupPromise = BackupService.generateStructuredBackup();

    // Wait for initial read to complete
    await initialReadDonePromise;

    // Step 2: While backup is paused before lock acquisition, delete ws-B
    await WorkspaceCommandHandler.deleteWorkspace("ws-B");

    // Step 3: Resume backup
    resolvePause!();

    const backupJson = await backupPromise;
    const backup = JSON.parse(backupJson);

    // Verify backup only contains ws-A in active workspaces, and ws-B is in recycleBin
    const wsIds = backup.workspaces.map((w: any) => w.id);
    expect(wsIds).toContain("ws-A");
    expect(wsIds).not.toContain("ws-B");

    const binWs = backup.recycleBin.find((i: any) => i.entityType === "workspace");
    expect(binWs).toBeDefined();
  });
});
