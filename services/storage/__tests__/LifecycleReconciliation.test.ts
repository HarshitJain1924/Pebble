import { MoveReconcilerService } from "../MoveReconcilerService";
import { MoveJournalRepository } from "@/repositories/MoveJournalRepository";
import type { MoveJournalEntry, Task } from "@/shared/types/domain.types";
import { generateId } from "@/shared/utils/id";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { withLock } from "@/shared/utils/mutex";

const mockStore = new Map<string, string>();

jest.mock("@react-native-async-storage/async-storage", () => ({
  setItem: jest.fn().mockImplementation(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  getItem: jest.fn().mockImplementation(async (key: string) => {
    return mockStore.get(key) || null;
  }),
  multiGet: jest.fn(),
  multiSet: jest.fn().mockImplementation(async (pairs: [string, string][]) => {
    for (const [key, value] of pairs) {
      mockStore.set(key, value);
    }
  }),
  removeItem: jest.fn(),
  multiRemove: jest.fn(),
  getAllKeys: jest.fn(),
  clear: jest.fn().mockImplementation(async () => {
    mockStore.clear();
  }),
}));

jest.mock("@/repositories/MoveJournalRepository");

jest.mock("@/services/scheduling/reminders.service", () => ({
  cancelReminderIds: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/shared/utils/mutex", () => {
  const original = jest.requireActual("@/shared/utils/mutex");
  return {
    withLock: original.withLock,
  };
});

describe("LifecycleReconciliation (Recycle/Restore)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.clear();
    mockStore.set("pebble:v1:workspaces", JSON.stringify([{ id: "ws-1" }, { id: "ws-2" }]));
  });

  const mockJournalEntry = (
    operationType: "recycle" | "restore",
    entityId: string,
    workspaceId: string,
  ): MoveJournalEntry => ({
    operationId: `${operationType}-${generateId()}`,
    operationType,
    entityId,
    entityType: "task",
    sourceWorkspaceId: workspaceId,
    targetWorkspaceId: workspaceId,
    timestamp: 5000,
    lifecycleGeneration: 1,
    expectedRevision: 1,
  });

  const mockTask = (id: string, workspaceId: string): Task => ({
    id,
    workspaceId,
    title: "Test Task",
    status: "todo",
    priority: "medium",
    categoryId: "work",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
    schedule: {},
  });

  describe("Recycle", () => {
    test("reconciles successfully when active delete failed (exists in both bin and active)", async () => {
      const entry = mockJournalEntry("recycle", "task-1", "ws-1");
      
      (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([entry]);
      
      const sourceMap = { "task-1": mockTask("task-1", "ws-1") };
      const binArray = [{
        id: "rb-task-1",
        entityType: "task",
        entityId: "task-1",
        snapshot: JSON.stringify(sourceMap["task-1"]),
        deletedAt: Date.now()
      }];

      const sourceJson = JSON.stringify(sourceMap);
      const binJson = JSON.stringify(binArray);
      
      mockStore.set(`pebble:v1:tasks:ws-1`, sourceJson);
      mockStore.set(`pebble:v1:recycle_bin`, binJson);

      (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
        [`pebble:v1:tasks:ws-1`, sourceJson],
        [`pebble:v1:recycle_bin`, binJson],
      ]);

      await MoveReconcilerService.reconcileAll();

      // Should delete from active and keep in bin
      expect(mockStore.get(`pebble:v1:tasks:ws-1`)).toEqual(JSON.stringify({}));
      // Bin is unchanged, but we should verify it wasn't destroyed
      expect(mockStore.get(`pebble:v1:recycle_bin`)).toEqual(binJson);
      expect(MoveJournalRepository.removeOperationsUnlocked).toHaveBeenCalledWith([entry.operationId]);
    });

    test("reconciles successfully when bin insert failed (exists in active, missing in bin)", async () => {
      const entry = mockJournalEntry("recycle", "task-2", "ws-1");
      
      (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([entry]);
      
      const sourceMap = { "task-2": mockTask("task-2", "ws-1") };
      
      const sourceJson = JSON.stringify(sourceMap);
      mockStore.set(`pebble:v1:tasks:ws-1`, sourceJson);
      mockStore.delete(`pebble:v1:recycle_bin`);

      (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
        [`pebble:v1:tasks:ws-1`, sourceJson],
        [`pebble:v1:recycle_bin`, null],
      ]);

      await MoveReconcilerService.reconcileAll();

      // Should add to bin, remove from active
      expect(mockStore.get(`pebble:v1:tasks:ws-1`)).toEqual(JSON.stringify({}));
      expect(mockStore.get(`pebble:v1:recycle_bin`)).toContain(`"entityId":"task-2"`);
      expect(MoveJournalRepository.removeOperationsUnlocked).toHaveBeenCalledWith([entry.operationId]);
    });
  });

  describe("Restore", () => {
    test("reconciles successfully when active insert failed (exists in bin, missing in active)", async () => {
      const entry = mockJournalEntry("restore", "task-3", "ws-2");
      
      (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([entry]);
      
      const binArray = [{
        id: "rb-task-3",
        entityType: "task",
        entityId: "task-3",
        lifecycleGeneration: 1,
        snapshot: JSON.stringify(mockTask("task-3", "ws-2")),
        deletedAt: Date.now()
      }];

      const binJson = JSON.stringify(binArray);
      mockStore.delete(`pebble:v1:tasks:ws-2`);
      mockStore.set(`pebble:v1:recycle_bin`, binJson);

      (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
        [`pebble:v1:tasks:ws-2`, null], // missing in active
        [`pebble:v1:recycle_bin`, binJson],
      ]);

      await MoveReconcilerService.reconcileAll();

      // Should add to active, remove from bin
      expect(mockStore.get(`pebble:v1:tasks:ws-2`)).toContain(`"id":"task-3"`);
      expect(mockStore.get(`pebble:v1:recycle_bin`)).toEqual(JSON.stringify([]));
      expect(MoveJournalRepository.removeOperationsUnlocked).toHaveBeenCalledWith([entry.operationId]);
    });

    test("reconciles successfully when bin delete failed (exists in both bin and active)", async () => {
      const entry = mockJournalEntry("restore", "task-4", "ws-2");
      
      (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([entry]);
      
      const targetMap = { "task-4": mockTask("task-4", "ws-2") };
      const binArray = [{
        id: "rb-task-4",
        entityType: "task",
        entityId: "task-4",
        lifecycleGeneration: 1,
        snapshot: JSON.stringify(targetMap["task-4"]),
        deletedAt: Date.now()
      }];

      const targetJson = JSON.stringify(targetMap);
      const binJson = JSON.stringify(binArray);
      mockStore.set(`pebble:v1:tasks:ws-2`, targetJson);
      mockStore.set(`pebble:v1:recycle_bin`, binJson);

      (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
        [`pebble:v1:tasks:ws-2`, targetJson],
        [`pebble:v1:recycle_bin`, binJson],
      ]);

      await MoveReconcilerService.reconcileAll();

      // Should delete from bin
      expect(mockStore.get(`pebble:v1:recycle_bin`)).toEqual(JSON.stringify([]));
      expect(MoveJournalRepository.removeOperationsUnlocked).toHaveBeenCalledWith([entry.operationId]);
    });
  });
});
