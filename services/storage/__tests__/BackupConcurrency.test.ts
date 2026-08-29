import AsyncStorage from "@react-native-async-storage/async-storage";
import { BackupService, AppBackup } from "@/services/storage/backup.service";
import { TaskRepository } from "@/repositories/TaskRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { MoveJournalRepository } from "@/repositories/MoveJournalRepository";
import { GraphRepository } from "@/repositories/GraphRepository";
import { MoveReconcilerService } from "@/services/storage/MoveReconcilerService";

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

describe("BackupService - Hostile Concurrency & Locking", () => {
  beforeEach(async () => {
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
    jest.clearAllMocks();
    GraphRepository.resetCache();
  });

  const generateValidBackup = (): AppBackup => ({
    version: 1,
    timestamp: Date.now(),
    workspaces: [{ id: "ws-1", name: "Backup WS", revision: 1, lifecycleGeneration: 1, createdAt: 100, updatedAt: 100 }],
    tasks: [{ id: "task-1", title: "Backup Task", workspaceId: "ws-1", status: "todo", priority: "none", revision: 1, lifecycleGeneration: 1, createdAt: 100, updatedAt: 100 }],
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

  it("prevents concurrent task creation during restore", async () => {
    const backupJson = JSON.stringify(generateValidBackup());
    const restorePromise = BackupService.restoreStructuredBackup(backupJson);

    // Let the restore start and acquire the lock first
    await new Promise(resolve => setTimeout(resolve, 10));

    const writePromise = TaskRepository.saveTask({
      id: "task-concurrent",
      title: "Concurrent Task",
      workspaceId: "ws-1",
      status: "todo",
      priority: "none",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 200,
      updatedAt: 200
    });

    await Promise.all([restorePromise, writePromise]);
    const tasks = await TaskRepository.getTasks("ws-1");
    expect(tasks["task-1"]).toBeDefined();
    expect(tasks["task-concurrent"]).toBeDefined();
  });

  it("handles duplicate keys gracefully (no duplicate lock deadlock)", async () => {
    const backup = generateValidBackup();
    backup.workspaces.push({ id: "ws-1", name: "Duplicate WS", revision: 1, lifecycleGeneration: 1, createdAt: 100, updatedAt: 100 });
    const promise = BackupService.restoreStructuredBackup(JSON.stringify(backup));
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Deadlock timeout")), 1000));
    await expect(Promise.race([promise, timeout])).resolves.not.toThrow();
  });

  it("ensures GraphRepository cache is invalidated", async () => {
    await GraphRepository.saveRelationship({
      id: "rel-1",
      source: { id: "task-1", type: "task" },
      target: { id: "task-2", type: "task" },
      relationType: "blocked_by",
      createdAt: 100
    });
    
    const preRestoreRel = await GraphRepository.getRelated("task-1");
    expect(preRestoreRel.length).toBe(1);

    const backupJson = JSON.stringify(generateValidBackup());
    await BackupService.restoreStructuredBackup(backupJson);

    const postRestoreRel = await GraphRepository.getRelated("task-1");
    expect(postRestoreRel.length).toBe(0);
  });

  it("prevents concurrent move journaling from corrupting restore", async () => {
    await TaskRepository.saveTask({
      id: "task-move",
      title: "Move Task",
      workspaceId: "inbox",
      status: "todo",
      priority: "none",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 100,
      updatedAt: 100
    });

    const backupJson = JSON.stringify(generateValidBackup());
    const restorePromise = BackupService.restoreStructuredBackup(backupJson);
    // Simulate a move operation getting injected while restore is initializing
    const movePromise = MoveJournalRepository.addOperation({
      operationId: "op-1",
      operationType: "move",
      entityId: "task-move",
      entityType: "task",
      sourceWorkspaceId: "inbox",
      targetWorkspaceId: "ws-1",
      timestamp: Date.now(),
      lifecycleGeneration: 1,
      expectedRevision: 1,
    });

    await Promise.all([
      expect(restorePromise).rejects.toThrow("Concurrent move detected"),
      movePromise
    ]);
  });
  
  it("rolls back safely on write failure without deadlocking", async () => {
    await TaskRepository.saveTask({
      id: "task-existing",
      title: "Existing Task",
      workspaceId: "inbox",
      status: "todo",
      priority: "none",
      createdAt: 100,
      updatedAt: 100
    });

    const backupJson = JSON.stringify(generateValidBackup());
    const originalMultiSet = (AsyncStorage.multiSet as jest.Mock).getMockImplementation();
    let failNext = true;
    (AsyncStorage.multiSet as jest.Mock).mockImplementation(async (pairs: readonly (readonly [string, string])[]) => {
      if (failNext) {
        failNext = false;
        throw new Error("Simulated Write Failure");
      }
      if (originalMultiSet) {
        return originalMultiSet(pairs);
      }
    });

    await expect(BackupService.restoreStructuredBackup(backupJson)).rejects.toThrow("Simulated Write Failure");

    const inboxTasks = await TaskRepository.getTasks("inbox");
    expect(inboxTasks["task-existing"]).toBeDefined();

    jest.restoreAllMocks();
  });
});
