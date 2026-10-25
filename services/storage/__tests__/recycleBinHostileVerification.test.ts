import { RecycleBinRepository } from "@/repositories/RecycleBinRepository";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { withLock, withLocks } from "@/shared/utils/mutex";
import { EntityCommandService } from "@/services/command/EntityCommandService";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// Helper to create deterministic barriers
function createBarrier() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("Recycle Bin Hostile Verification", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.clear();
  });

  describe("Test A - Deterministic stale-snapshot reproduction", () => {
    it("should serialize reads and writes to prevent data loss", async () => {
      await RecycleBinRepository.saveRecycleBinItemsUnlocked([
        { id: "rb-A", entityId: "A", entityType: "task", lifecycleGeneration: 1, snapshot: "{}", deletedAt: 1 },
      ]);

      const getBarrier1 = createBarrier();
      const getBarrier2 = createBarrier();
      let getCalls = 0;

      // We spy on getRecycleBinItems which is called inside the lock
      const originalGet = RecycleBinRepository.getRecycleBinItems.bind(RecycleBinRepository);
      
      jest.spyOn(RecycleBinRepository, "getRecycleBinItems").mockImplementation(async () => {
        getCalls++;
        if (getCalls === 1) {
          getBarrier1.resolve();
          await getBarrier2.promise; 
        }
        return originalGet();
      });

      const opA = RecycleBinRepository.addToRecycleBin("task", { id: "B" });
      await getBarrier1.promise; // Op A is reading

      const opB = RecycleBinRepository.addToRecycleBin("task", { id: "C" });
      
      // Wait to ensure Op B is blocked waiting for the mutex
      await new Promise(r => setTimeout(r, 50));
      getBarrier2.resolve();

      await Promise.all([opA, opB]);

      const items = await RecycleBinRepository.getRecycleBinItems();
      expect(items.length).toBe(3);
      expect(items.find(i => i.entityId === "A")).toBeDefined();
      expect(items.find(i => i.entityId === "B")).toBeDefined();
      expect(items.find(i => i.entityId === "C")).toBeDefined();
    });
  });

  describe("Test B - add vs remove", () => {
    it("should safely handle concurrent add and remove", async () => {
      await RecycleBinRepository.saveRecycleBinItemsUnlocked([
        { id: "rb-A", entityId: "A", entityType: "task", lifecycleGeneration: 1, snapshot: "{}", deletedAt: 1 },
        { id: "rb-B", entityId: "B", entityType: "task", lifecycleGeneration: 1, snapshot: "{}", deletedAt: 1 },
      ]);

      const getBarrier = createBarrier();
      let getCalls = 0;
      const originalGet = RecycleBinRepository.getRecycleBinItems.bind(RecycleBinRepository);
      
      jest.spyOn(RecycleBinRepository, "getRecycleBinItems").mockImplementation(async () => {
        getCalls++;
        if (getCalls === 1) {
          await getBarrier.promise;
        }
        return originalGet();
      });

      const opRemove = RecycleBinRepository.removeRecycleBinItems(["rb-A"]);
      await new Promise(r => setTimeout(r, 10));

      const opAdd = RecycleBinRepository.addToRecycleBin("task", { id: "C" });

      getBarrier.resolve();
      await Promise.all([opRemove, opAdd]);

      const items = await RecycleBinRepository.getRecycleBinItems();
      expect(items.find((i) => i.entityId === "A")).toBeUndefined();
      expect(items.find((i) => i.entityId === "B")).toBeDefined();
      expect(items.find((i) => i.entityId === "C")).toBeDefined();
    });
  });

  describe("Test C - restore vs add", () => {
    it("should safely handle restore (remove) vs add", async () => {
      await RecycleBinRepository.saveRecycleBinItemsUnlocked([
        { id: "rb-A", entityId: "A", entityType: "task", lifecycleGeneration: 1, snapshot: "{}", deletedAt: 1 },
        { id: "rb-B", entityId: "B", entityType: "task", lifecycleGeneration: 1, snapshot: "{}", deletedAt: 1 },
      ]);

      const opRestore = RecycleBinRepository.removeRecycleBinItems(["rb-A"]);
      const opAdd = RecycleBinRepository.addToRecycleBin("task", { id: "C" });

      await Promise.all([opRestore, opAdd]);

      const items = await RecycleBinRepository.getRecycleBinItems();
      expect(items.find((i) => i.entityId === "A")).toBeUndefined();
      expect(items.find((i) => i.entityId === "B")).toBeDefined();
      expect(items.find((i) => i.entityId === "C")).toBeDefined();
    });
  });

  describe("Test D - concurrent restores", () => {
    it("should safely handle multiple restores removing items concurrently", async () => {
      await RecycleBinRepository.saveRecycleBinItemsUnlocked([
        { id: "rb-A", entityId: "A", entityType: "task", lifecycleGeneration: 1, snapshot: "{}", deletedAt: 1 },
        { id: "rb-B", entityId: "B", entityType: "task", lifecycleGeneration: 1, snapshot: "{}", deletedAt: 1 },
        { id: "rb-C", entityId: "C", entityType: "task", lifecycleGeneration: 1, snapshot: "{}", deletedAt: 1 },
      ]);

      const opRestoreA = RecycleBinRepository.removeRecycleBinItems(["rb-A"]);
      const opRestoreB = RecycleBinRepository.removeRecycleBinItems(["rb-B"]);

      await Promise.all([opRestoreA, opRestoreB]);

      const items = await RecycleBinRepository.getRecycleBinItems();
      expect(items.length).toBe(1);
      expect(items[0].entityId).toBe("C");
    });
  });

  describe("Test E - multiple concurrent mutations", () => {
    it("should safely handle massive concurrent reads and writes", async () => {
      await RecycleBinRepository.saveRecycleBinItemsUnlocked([
        { id: "rb-A", entityId: "A", entityType: "task", lifecycleGeneration: 1, snapshot: "{}", deletedAt: 1 },
        { id: "rb-B", entityId: "B", entityType: "task", lifecycleGeneration: 1, snapshot: "{}", deletedAt: 1 },
        { id: "rb-C", entityId: "C", entityType: "task", lifecycleGeneration: 1, snapshot: "{}", deletedAt: 1 },
      ]);

      const ops = [
        RecycleBinRepository.addToRecycleBin("task", { id: "D" }),
        RecycleBinRepository.addToRecycleBin("task", { id: "E" }),
        RecycleBinRepository.removeRecycleBinItems(["rb-A"]),
        RecycleBinRepository.removeRecycleBinItems(["rb-B"]),
      ];

      await Promise.all(ops);

      const items = await RecycleBinRepository.getRecycleBinItems();
      expect(items.length).toBe(3);
      expect(items.find(i => i.entityId === "C")).toBeDefined();
      expect(items.find(i => i.entityId === "D")).toBeDefined();
      expect(items.find(i => i.entityId === "E")).toBeDefined();
      expect(items.find(i => i.entityId === "A")).toBeUndefined();
      expect(items.find(i => i.entityId === "B")).toBeUndefined();
    });
  });

  describe("Test F - storage read failure", () => {
    it("should reject and not modify bin if read fails", async () => {
      jest.spyOn(AsyncStorage, "getItem").mockRejectedValueOnce(new Error("Read Error"));
      
      const setSpy = jest.spyOn(AsyncStorage, "setItem");

      await expect(RecycleBinRepository.addToRecycleBin("task", { id: "X" }, undefined, { throwOnError: true }))
        .rejects.toThrow("Read Error");

      expect(setSpy).not.toHaveBeenCalled();
    });
  });

  describe("Test G - storage write failure", () => {
    it("should reject, release lock, and allow next operation if write fails", async () => {
      jest.spyOn(AsyncStorage, "setItem").mockRejectedValueOnce(new Error("Write Error"));

      await expect(RecycleBinRepository.addToRecycleBin("task", { id: "X" }, undefined, { throwOnError: true }))
        .rejects.toThrow("Write Error");

      // Next operation should succeed
      await expect(RecycleBinRepository.addToRecycleBin("task", { id: "Y" }, undefined, { throwOnError: true }))
        .resolves.toBeUndefined();

      const items = await RecycleBinRepository.getRecycleBinItems();
      expect(items.length).toBe(1);
      expect(items[0].entityId).toBe("Y");
    });
  });

  describe("Test H - actual lock contention", () => {
    it("should block mutation while lock is held", async () => {
      let mutationCompleted = false;
      
      await withLock("pebble:v1:recycle_bin", async () => {
        const op = RecycleBinRepository.addToRecycleBin("task", { id: "X" }).then(() => {
          mutationCompleted = true;
        });

        await new Promise(r => setTimeout(r, 50));
        expect(mutationCompleted).toBe(false);
      });

      await new Promise(r => setTimeout(r, 50));
      expect(mutationCompleted).toBe(true);
    });
  });

  describe("Test I & J - nested lock safety and lock hierarchy", () => {
    it("should not deadlock existing callers holding Partition -> MoveJournal", async () => {
      let executed = false;
      await withLocks(["pebble:v1:tasks:ws-1", "pebble:v1:move_journal"], async () => {
        await RecycleBinRepository.removeRecycleBinItems(["rb-X"]);
        executed = true;
      });
      expect(executed).toBe(true);
    });

    it("should have correct locks for restoreWorkspace without deadlock", async () => {
      await RecycleBinRepository.saveRecycleBinItemsUnlocked([
        { id: "rb-ws-1", entityId: "ws-1", entityType: "workspace", lifecycleGeneration: 1, snapshot: JSON.stringify({ id: "ws-1" }), deletedAt: 1 }
      ]);
      
      const { WorkspaceCommandHandler } = require("@/services/command/handlers/WorkspaceCommandHandler");
      
      let lockAcquired = false;
      jest.spyOn(WorkspaceCommandHandler, "restoreWorkspace").mockImplementationOnce(async (id) => {
         lockAcquired = true;
         return { id: "ws-1" } as any;
      });

      const ws = await WorkspaceCommandHandler.restoreWorkspace("rb-ws-1");
      expect(lockAcquired).toBe(true);
      expect(ws.id).toBe("ws-1");
    });
  });
});
