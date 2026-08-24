import { MoveReconcilerService } from "../MoveReconcilerService";
import { MoveJournalRepository } from "@/repositories/MoveJournalRepository";
import type { MoveJournalEntry, Task } from "@/shared/types/domain.types";
import { generateId } from "@/shared/utils/id";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
    timestamp: Date.now(),
  });

  const mockTask = (id: string, workspaceId: string): Task => ({
    id,
    workspaceId,
    title: "Test Task",
    status: "todo",
    priority: "medium",
    categoryId: "work",
    createdAt: Date.now(),
    updatedAt: Date.now(),
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

      (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
        [`pebble:v1:tasks:ws-1`, JSON.stringify(sourceMap)],
        [`pebble:v1:recycle_bin`, JSON.stringify(binArray)],
      ]);

      await MoveReconcilerService.reconcileAll();

      // Should delete from active and keep in bin
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        `pebble:v1:tasks:ws-1`,
        JSON.stringify({})
      );
      expect(MoveJournalRepository.removeOperationsUnlocked).toHaveBeenCalledWith([entry.operationId]);
    });

    test("reconciles successfully when bin insert failed (exists in active, missing in bin)", async () => {
      const entry = mockJournalEntry("recycle", "task-2", "ws-1");
      
      (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([entry]);
      
      const sourceMap = { "task-2": mockTask("task-2", "ws-1") };
      
      (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
        [`pebble:v1:tasks:ws-1`, JSON.stringify(sourceMap)],
        [`pebble:v1:recycle_bin`, null],
      ]);

      await MoveReconcilerService.reconcileAll();

      // Should add to bin, remove from active
      expect(AsyncStorage.multiSet).toHaveBeenCalledWith([
        [`pebble:v1:tasks:ws-1`, JSON.stringify({})],
        [`pebble:v1:recycle_bin`, expect.stringContaining(`"entityId":"task-2"`)],
      ]);
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
        snapshot: JSON.stringify(mockTask("task-3", "ws-2")),
        deletedAt: Date.now()
      }];

      (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
        [`pebble:v1:tasks:ws-2`, null], // missing in active
        [`pebble:v1:recycle_bin`, JSON.stringify(binArray)],
      ]);

      await MoveReconcilerService.reconcileAll();

      // Should add to active, remove from bin
      expect(AsyncStorage.multiSet).toHaveBeenCalledWith([
        [`pebble:v1:tasks:ws-2`, expect.stringContaining(`"id":"task-3"`)],
        [`pebble:v1:recycle_bin`, JSON.stringify([])],
      ]);
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
        snapshot: JSON.stringify(targetMap["task-4"]),
        deletedAt: Date.now()
      }];

      (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
        [`pebble:v1:tasks:ws-2`, JSON.stringify(targetMap)],
        [`pebble:v1:recycle_bin`, JSON.stringify(binArray)],
      ]);

      await MoveReconcilerService.reconcileAll();

      // Should delete from bin
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        `pebble:v1:recycle_bin`,
        JSON.stringify([])
      );
      expect(MoveJournalRepository.removeOperationsUnlocked).toHaveBeenCalledWith([entry.operationId]);
    });
  });
});
