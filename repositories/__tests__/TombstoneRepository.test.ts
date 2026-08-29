import AsyncStorage from "@react-native-async-storage/async-storage";
import { TombstoneRepository } from "../TombstoneRepository";
import { TaskRepository } from "../TaskRepository";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import type { Tombstone, Task } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn().mockImplementation(async (key: string) => store[key] ?? null),
    setItem: jest.fn().mockImplementation(async (key: string, value: string) => {
      store[key] = value;
      return null;
    }),
    removeItem: jest.fn().mockImplementation(async (key: string) => {
      delete store[key];
      return null;
    }),
    multiGet: jest.fn().mockImplementation(async (keys: string[]) => {
      return keys.map((k) => [k, store[k] ?? null]);
    }),
    multiSet: jest.fn().mockImplementation(async (pairs: [string, string][]) => {
      for (const [k, v] of pairs) store[k] = v;
      return null;
    }),
    multiRemove: jest.fn().mockImplementation(async (keys: string[]) => {
      for (const k of keys) delete store[k];
      return null;
    }),
    clear: jest.fn().mockImplementation(async () => {
      store = {};
      return null;
    }),
  };
});

describe("TombstoneRepository Fail-Closed Contract (Fix #20)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  // TEST 1: Successful addTombstone persists the tombstone
  test("TEST 1: Successful addTombstone persists the tombstone", async () => {
    const tombstone: Tombstone = {
      id: "ts-task-1-g1",
      entityType: "task",
      entityId: "task-1",
      lifecycleGeneration: 1,
      deletionRevision: 2,
      deletedAt: 123456789,
    };

    await TombstoneRepository.addTombstone(tombstone);

    const all = await TombstoneRepository.getTombstones();
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(tombstone);

    const isDead = await TombstoneRepository.isTombstoned("task", "task-1", 1);
    expect(isDead).toBe(true);

    const maxGen = await TombstoneRepository.getHighestTombstonedGeneration("task", "task-1");
    expect(maxGen).toBe(1);
  });

  // TEST 2: Adding the exact same tombstone twice remains idempotent and produces one logical tombstone
  test("TEST 2: Adding the exact same tombstone twice remains idempotent and produces one logical tombstone", async () => {
    const tombstone: Tombstone = {
      id: "ts-task-dup-g1",
      entityType: "task",
      entityId: "task-dup",
      lifecycleGeneration: 1,
      deletionRevision: 1,
      deletedAt: 1000,
    };

    await TombstoneRepository.addTombstone(tombstone);
    await TombstoneRepository.addTombstone(tombstone);

    const all = await TombstoneRepository.getTombstones();
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(tombstone);
  });

  // TEST 3: AsyncStorage.setItem failure during addTombstone rejects/throws to the caller
  test("TEST 3: AsyncStorage.setItem failure during addTombstone rejects/throws to the caller", async () => {
    const tombstone: Tombstone = {
      id: "ts-fail-write",
      entityType: "task",
      entityId: "task-fail",
      lifecycleGeneration: 1,
      deletionRevision: 1,
      deletedAt: 1000,
    };

    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error("AsyncStorage write error"));

    await expect(TombstoneRepository.addTombstone(tombstone)).rejects.toThrow(
      "AsyncStorage write error"
    );
  });

  // TEST 4: Existing tombstones are not lost when adding another tombstone
  test("TEST 4: Existing tombstones are not lost when adding another tombstone", async () => {
    const ts1: Tombstone = {
      id: "ts-task-1-g1",
      entityType: "task",
      entityId: "task-1",
      lifecycleGeneration: 1,
      deletionRevision: 1,
      deletedAt: 1000,
    };
    const ts2: Tombstone = {
      id: "ts-habit-2-g1",
      entityType: "habit",
      entityId: "habit-2",
      lifecycleGeneration: 1,
      deletionRevision: 1,
      deletedAt: 2000,
    };

    await TombstoneRepository.addTombstone(ts1);
    await TombstoneRepository.addTombstone(ts2);

    const all = await TombstoneRepository.getTombstones();
    expect(all).toHaveLength(2);
    expect(all.map((t) => t.id)).toEqual(expect.arrayContaining(["ts-task-1-g1", "ts-habit-2-g1"]));
  });

  // TEST 5: AsyncStorage.getItem failure during getTombstones rejects/throws
  test("TEST 5: AsyncStorage.getItem failure during getTombstones rejects/throws", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("AsyncStorage read disk failure"));

    await expect(TombstoneRepository.getTombstones()).rejects.toThrow(
      "AsyncStorage read disk failure"
    );
  });

  // TEST 6: Malformed persisted tombstone JSON rejects/throws rather than returning []
  test("TEST 6: Malformed persisted tombstone JSON rejects/throws rather than returning []", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce("{ malformed: json not valid [");

    await expect(TombstoneRepository.getTombstones()).rejects.toThrow();
  });

  // TEST 7: A missing tombstone storage key still returns an empty tombstone collection normally
  test("TEST 7: A missing tombstone storage key still returns an empty tombstone collection normally", async () => {
    // Key has never been set -> null
    const all = await TombstoneRepository.getTombstones();
    expect(all).toEqual([]);

    const isDead = await TombstoneRepository.isTombstoned("task", "nonexistent-task");
    expect(isDead).toBe(false);

    const maxGen = await TombstoneRepository.getHighestTombstonedGeneration("task", "nonexistent-task");
    expect(maxGen).toBe(0);
  });

  // TEST 8: A caller performing a lifecycle safety decision cannot proceed as though there are no tombstones when the tombstone store read fails
  test("TEST 8: A caller performing a lifecycle safety decision cannot proceed as though there are no tombstones when the tombstone store read fails", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("Storage partition unreachable"));

    // isTombstoned must throw rather than returning false
    await expect(TombstoneRepository.isTombstoned("task", "task-1", 1)).rejects.toThrow(
      "Storage partition unreachable"
    );

    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("Storage partition unreachable"));

    // getHighestTombstonedGeneration must throw rather than returning 0
    await expect(
      TombstoneRepository.getHighestTombstonedGeneration("task", "task-1")
    ).rejects.toThrow("Storage partition unreachable");
  });

  // Destructive Caller Safety: If tombstone persistence fails during permanentlyDeleteTask, entity is NOT deleted
  test("Destructive Caller Safety: If tombstone persistence fails, permanent delete operation aborts before active storage deletion", async () => {
    const task: Task = {
      id: "t-safe-abort",
      workspaceId: "ws-1",
      title: "Must Survive Failed Tombstone",
      status: "todo",
      priority: "high",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    await TaskRepository.saveTask(task);

    // Force addTombstone to fail on setItem when targeting pebble:v1:tombstones
    const originalSetItem = (AsyncStorage.setItem as jest.Mock).getMockImplementation();
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
      if (key === "pebble:v1:tombstones") {
        throw new Error("Disk full: Failed to persist tombstone");
      }
      if (originalSetItem) {
        return originalSetItem(key, value);
      }
      return null;
    });

    // Permanent delete must fail
    await expect(
      EntityCommandService.permanentlyDeleteTask("t-safe-abort", "ws-1")
    ).rejects.toThrow("Disk full: Failed to persist tombstone");

    // The task MUST still exist in active storage because tombstone persistence failed
    const activeTask = await TaskRepository.getTask("t-safe-abort", "ws-1");
    expect(activeTask).not.toBeNull();
    expect(activeTask?.id).toBe("t-safe-abort");
  });
});
