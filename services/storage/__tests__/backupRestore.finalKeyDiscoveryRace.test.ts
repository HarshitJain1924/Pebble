import AsyncStorage from "@react-native-async-storage/async-storage";
import { BackupService, AppBackup } from "@/services/storage/backup.service";
import { WorkspaceCommandHandler } from "@/services/command/handlers/WorkspaceCommandHandler";
import { TaskRepository } from "@/repositories/TaskRepository";
import { GraphRepository } from "@/repositories/GraphRepository";
import { MoveJournalRepository } from "@/repositories/MoveJournalRepository";
import { RecycleBinRepository } from "@/repositories/RecycleBinRepository";
import { withLock } from "@/shared/utils/mutex";

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

describe("BackupService - Final Key Discovery Race Verification", () => {
  it("PROVES: real production mutations (workspaces, tasks, graphs, journals, recycle bin) are strictly BLOCKED by restore locks between step 2 and step 7", async () => {
    // 1. Initial State
    store["pebble:v1:workspaces"] = JSON.stringify([{ id: "ws-A", name: "Workspace A" }]);
    store["pebble:v1:tasks:ws-A"] = JSON.stringify({
      "task-A1": { id: "task-A1", title: "Task A1", workspaceId: "ws-A", status: "todo", priority: "medium" }
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
    let resolvePauseAtStep4: () => void;
    const pauseAtStep4Promise = new Promise<void>((r) => { resolvePauseAtStep4 = r; });
    let resolveReachedStep4: () => void;
    const reachedStep4Promise = new Promise<void>((r) => { resolveReachedStep4 = r; });

    (AsyncStorage.getAllKeys as jest.Mock).mockImplementation(async () => {
      getAllKeysCallCount++;
      const keys = Object.keys(store);
      if (getAllKeysCallCount === 2) {
        // Step 2 & 4: Inside _acquireRestoreLocks, lockedKeys read completed and validated
        resolveReachedStep4();
        // Pause execution before step 5-7 (multiGet, intent write, multiRemove)
        await pauseAtStep4Promise;
      }
      return keys;
    });

    // Start restore
    const restorePromise = BackupService.restoreStructuredBackup(backupJson);

    // Wait until restore is inside _acquireRestoreLocks at the step 2/4 checkpoint
    await reachedStep4Promise;

    // Track which operations are blocked vs unblocked
    let workspaceCreationFinished = false;
    let taskMutationFinished = false;
    let relationshipMutationFinished = false;
    let focusSessionFinished = false;
    let systemEventFinished = false;
    let moveJournalFinished = false;
    let recycleBinFinished = false;

    // D. Attempt real production mutations while restore is paused at step 2/4:

    // 1. Workspace creation (requires withLock("pebble:v1:workspaces"))
    const p1 = WorkspaceCommandHandler.createWorkspace({
      id: "ws-new",
      name: "Workspace New",
      createdAt: 2000,
      updatedAt: 2000,
    } as any).then(() => { workspaceCreationFinished = true; });

    // 2. Task mutation on ws-A (requires withLock("pebble:v1:tasks:ws-A"))
    const p2 = TaskRepository.saveTask({
      id: "task-A2",
      title: "Task A2",
      workspaceId: "ws-A",
      status: "todo",
      priority: "high",
      createdAt: 2000,
      updatedAt: 2000,
    }).then(() => { taskMutationFinished = true; });

    // 3. Relationship mutation (requires withLock("pebble:v1:relationships"))
    const p3 = GraphRepository.saveRelationship({
      id: "rel-1",
      source: { id: "task-A1", type: "task" },
      target: { id: "task-A2", type: "task" },
      createdAt: 2000,
    } as any).then(() => { relationshipMutationFinished = true; });

    // 4. Focus session mutation (requires withLock("pebble:v1:focus_sessions"))
    const p4 = GraphRepository.saveFocusSession({
      id: "fs-1",
      taskId: "task-A1",
      startedAt: 2000,
      duration: 300,
    }).then(() => { focusSessionFinished = true; });

    // 5. System event log mutation (requires withLock("pebble:v1:system_event_log"))
    const p5 = GraphRepository.logSystemEvent({
      id: "evt-1",
      workspaceId: "ws-A",
      itemId: "task-A1",
      itemType: "task",
      action: "create",
      timestamp: 2000,
    }).then(() => { systemEventFinished = true; });

    // 6. Move journal mutation (requires withLock("pebble:v1:move_journal"))
    const p6 = MoveJournalRepository.addOperation({
      operationId: "op-1",
      operationType: "move",
      entityId: "task-A1",
      entityType: "task",
      sourceWorkspaceId: "ws-A",
      targetWorkspaceId: "inbox",
      timestamp: 2000,
      lifecycleGeneration: 1,
      expectedRevision: 1,
    }).then(() => { moveJournalFinished = true; });

    // 7. Recycle bin mutation (requires withLock("pebble:v1:recycle_bin"))
    const p7 = RecycleBinRepository.addToRecycleBin(
      "task",
      { id: "task-A1" },
      "Task A1"
    ).then(() => { recycleBinFinished = true; });

    // Yield to event loop to give any unblocked writer time to execute
    await new Promise((r) => setTimeout(r, 60));

    // VERIFICATION: All 7 real production writers MUST BE BLOCKED by restore's active locks!
    expect(workspaceCreationFinished).toBe(false);
    expect(taskMutationFinished).toBe(false);
    expect(relationshipMutationFinished).toBe(false);
    expect(focusSessionFinished).toBe(false);
    expect(systemEventFinished).toBe(false);
    expect(moveJournalFinished).toBe(false);
    expect(recycleBinFinished).toBe(false);

    // E. Resume restore
    resolvePauseAtStep4!();

    // Restore must complete cleanly
    await restorePromise;

    // After restore releases locks, all blocked operations can finish
    await Promise.all([p1, p2, p3, p4, p5, p6, p7]);

    expect(workspaceCreationFinished).toBe(true);
    expect(taskMutationFinished).toBe(true);
    expect(relationshipMutationFinished).toBe(true);
    expect(focusSessionFinished).toBe(true);
    expect(systemEventFinished).toBe(true);
    expect(moveJournalFinished).toBe(true);
    expect(recycleBinFinished).toBe(true);
  });
});
