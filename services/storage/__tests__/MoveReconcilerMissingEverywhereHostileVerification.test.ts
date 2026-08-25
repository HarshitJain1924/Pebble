import AsyncStorage from "@react-native-async-storage/async-storage";
import { MoveReconcilerService } from "../MoveReconcilerService";
import { MoveJournalRepository } from "@/repositories/MoveJournalRepository";
import { Task } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
  removeItem: jest.fn(),
  getAllKeys: jest.fn(),
}));

jest.mock("@/repositories/MoveJournalRepository", () => ({
  MoveJournalRepository: {
    getOperations: jest.fn(),
    removeOperationsUnlocked: jest.fn(),
    removeOperation: jest.fn(),
  },
}));

jest.mock("@/repositories/WorkspaceRepository", () => ({
  WorkspaceRepository: {
    getWorkspaces: jest.fn().mockResolvedValue([{ id: "ws-1" }, { id: "ws-2" }]),
  },
}));

const mockTask = (id: string, workspaceId: string): Task => ({
  id,
  workspaceId,
  title: "Test Task",
  status: "todo",
  priority: "medium",
  categoryId: "work",
  createdAt: 1000,
  updatedAt: 1000,
  schedule: {}
});

describe("MoveReconciler Missing Everywhere Hostile Verification", () => {
  let mockStore: Map<string, string>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStore = new Map();

    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      return mockStore.get(key) || null;
    });

    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
      mockStore.set(key, value);
    });

    (AsyncStorage.multiGet as jest.Mock).mockImplementation(async (keys: string[]) => {
      return keys.map((key) => [key, mockStore.get(key) || null]);
    });
    
    (AsyncStorage.multiSet as jest.Mock).mockImplementation(async (keyValuePairs: string[][]) => {
      for (const [key, val] of keyValuePairs) {
        mockStore.set(key, val);
      }
    });
  });

  // 1. Move: source missing + target missing -> journal remains
  test("Move: source missing + target missing -> journal remains", async () => {
    (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([
      {
        operationId: "op-move-missing",
        entityId: "task-missing",
        entityType: "task",
        sourceWorkspaceId: "ws-1",
        targetWorkspaceId: "ws-2",
        timestamp: 2000,
        operationType: "move",
      },
    ]);

    mockStore.set(`pebble:v1:tasks:ws-1`, JSON.stringify({}));
    mockStore.set(`pebble:v1:tasks:ws-2`, JSON.stringify({}));

    // Expecting the reconciler to catch the error from "Uncertain outcome" and log it,
    // which prevents journal removal in the caller loop.
    await MoveReconcilerService.reconcileAll();

    expect(MoveJournalRepository.removeOperationsUnlocked).not.toHaveBeenCalled();
    expect(mockStore.get(`pebble:v1:tasks:ws-1`)).toEqual(JSON.stringify({}));
    expect(mockStore.get(`pebble:v1:tasks:ws-2`)).toEqual(JSON.stringify({}));
  });

  // 2. Move: source missing + target exists -> journal is removed
  test("Move: source missing + target exists -> journal is removed", async () => {
    (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([
      {
        operationId: "op-move-success",
        entityId: "task-exists",
        entityType: "task",
        sourceWorkspaceId: "ws-1",
        targetWorkspaceId: "ws-2",
        timestamp: 2000,
        operationType: "move",
      },
    ]);

    mockStore.set(`pebble:v1:tasks:ws-1`, JSON.stringify({}));
    mockStore.set(`pebble:v1:tasks:ws-2`, JSON.stringify({ "task-exists": mockTask("task-exists", "ws-2") }));

    await MoveReconcilerService.reconcileAll();

    expect(MoveJournalRepository.removeOperationsUnlocked).toHaveBeenCalledWith(["op-move-success"]);
    // Ensure no duplication or mutation
    expect(mockStore.get(`pebble:v1:tasks:ws-2`)).toContain("task-exists");
  });

  // 3. Recycle: source missing + bin missing -> journal remains
  test("Recycle: source missing + bin missing -> journal remains", async () => {
    (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([
      {
        operationId: "op-recycle-missing",
        entityId: "task-missing",
        entityType: "task",
        sourceWorkspaceId: "ws-1",
        targetWorkspaceId: "recycle-bin",
        timestamp: 2000,
        operationType: "recycle",
      },
    ]);

    mockStore.set(`pebble:v1:tasks:ws-1`, JSON.stringify({}));
    mockStore.set(`pebble:v1:recycle_bin`, JSON.stringify([]));

    await MoveReconcilerService.reconcileAll();

    expect(MoveJournalRepository.removeOperationsUnlocked).not.toHaveBeenCalled();
  });

  // 4. Recycle: source missing + bin exists -> journal is removed
  test("Recycle: source missing + bin exists -> journal is removed", async () => {
    (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([
      {
        operationId: "op-recycle-success",
        entityId: "task-exists",
        entityType: "task",
        sourceWorkspaceId: "ws-1",
        targetWorkspaceId: "recycle-bin",
        timestamp: 2000,
        operationType: "recycle",
      },
    ]);

    const binnedTask = mockTask("task-exists", "ws-1");
    mockStore.set(`pebble:v1:tasks:ws-1`, JSON.stringify({}));
    mockStore.set(`pebble:v1:recycle_bin`, JSON.stringify([{ 
      id: "bin-item-1",
      entityId: "task-exists",
      entityType: "task",
      data: binnedTask, 
      deletedAt: 2000, 
      originalWorkspaceId: "ws-1" 
    }]));

    await MoveReconcilerService.reconcileAll();

    expect(MoveJournalRepository.removeOperationsUnlocked).toHaveBeenCalledWith(["op-recycle-success"]);
  });

  // 5. Restore: bin missing + target missing -> journal remains
  test("Restore: bin missing + target missing -> journal remains", async () => {
    (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([
      {
        operationId: "op-restore-missing",
        entityId: "task-missing",
        entityType: "task",
        sourceWorkspaceId: "recycle-bin",
        targetWorkspaceId: "ws-1",
        timestamp: 2000,
        operationType: "restore",
      },
    ]);

    mockStore.set(`pebble:v1:tasks:ws-1`, JSON.stringify({}));
    mockStore.set(`pebble:v1:recycle_bin`, JSON.stringify([]));

    await MoveReconcilerService.reconcileAll();

    expect(MoveJournalRepository.removeOperationsUnlocked).not.toHaveBeenCalled();
  });

  // 6. Restore: bin missing + target exists -> journal is removed
  test("Restore: bin missing + target exists -> journal is removed", async () => {
    (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([
      {
        operationId: "op-restore-success",
        entityId: "task-exists",
        entityType: "task",
        sourceWorkspaceId: "recycle-bin",
        targetWorkspaceId: "ws-1",
        timestamp: 2000,
        operationType: "restore",
      },
    ]);

    mockStore.set(`pebble:v1:tasks:ws-1`, JSON.stringify({ "task-exists": mockTask("task-exists", "ws-1") }));
    mockStore.set(`pebble:v1:recycle_bin`, JSON.stringify([]));

    await MoveReconcilerService.reconcileAll();

    expect(MoveJournalRepository.removeOperationsUnlocked).toHaveBeenCalledWith(["op-restore-success"]);
  });

  // 7. Repeat reconciliation after an unresolved operation -> journal remains and no duplicate entity is created
  test("Repeat reconciliation after an unresolved operation -> journal remains and no duplicate", async () => {
    (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([
      {
        operationId: "op-move-missing-repeat",
        entityId: "task-missing",
        entityType: "task",
        sourceWorkspaceId: "ws-1",
        targetWorkspaceId: "ws-2",
        timestamp: 2000,
        operationType: "move",
      },
    ]);

    mockStore.set(`pebble:v1:tasks:ws-1`, JSON.stringify({}));
    mockStore.set(`pebble:v1:tasks:ws-2`, JSON.stringify({}));

    // Reconcile pass 1
    await MoveReconcilerService.reconcileAll();
    
    // Reconcile pass 2
    await MoveReconcilerService.reconcileAll();

    expect(MoveJournalRepository.removeOperationsUnlocked).not.toHaveBeenCalled();
    expect(mockStore.get(`pebble:v1:tasks:ws-1`)).toEqual(JSON.stringify({}));
    expect(mockStore.get(`pebble:v1:tasks:ws-2`)).toEqual(JSON.stringify({}));
  });

  // 8. After missing-everywhere state is repaired, subsequent reconciliation successfully completes and removes journal
  test("After missing-everywhere state is repaired, subsequent reconciliation removes journal", async () => {
    (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([
      {
        operationId: "op-move-repair",
        entityId: "task-repair",
        entityType: "task",
        sourceWorkspaceId: "ws-1",
        targetWorkspaceId: "ws-2",
        timestamp: 2000,
        operationType: "move",
      },
    ]);

    // Initial state: missing everywhere
    mockStore.set(`pebble:v1:tasks:ws-1`, JSON.stringify({}));
    mockStore.set(`pebble:v1:tasks:ws-2`, JSON.stringify({}));

    await MoveReconcilerService.reconcileAll();
    expect(MoveJournalRepository.removeOperationsUnlocked).not.toHaveBeenCalled();

    // Repair state: entity appears in source (e.g. from a delayed sync/restore)
    mockStore.set(`pebble:v1:tasks:ws-1`, JSON.stringify({ "task-repair": mockTask("task-repair", "ws-1") }));

    // Subsequent reconciliation
    await MoveReconcilerService.reconcileAll();

    expect(MoveJournalRepository.removeOperationsUnlocked).toHaveBeenCalledWith(["op-move-repair"]);
    expect(mockStore.get(`pebble:v1:tasks:ws-1`)).toEqual(JSON.stringify({}));
    expect(mockStore.get(`pebble:v1:tasks:ws-2`)).toContain("task-repair");
  });
});
