import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { ResourceCommandHandler } from "@/services/command/handlers/ResourceCommandHandler";
import {
  ResourceRepository,
  RecycleBinRepository,
  WorkspaceRepository,
  TombstoneRepository,
  TaskRepository,
} from "@/repositories";
import { GraphRepository } from "@/repositories/GraphRepository";
import { GraphReconcilerService } from "@/services/storage/GraphReconcilerService";
import { INBOX_WORKSPACE_ID, type Resource, type Task, type Workspace, type Relationship } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const defer = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

const makeResource = (
  id: string,
  overrides: Partial<Resource> = {}
): Resource => ({
  id,
  workspaceId: "ws-resources",
  title: `Resource ${id}`,
  type: "note",
  content: `Content for ${id}`,
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

describe("ResourceCommandHandler Suite", () => {
  const WS = "ws-resources";
  const WS_TARGET = "ws-resources-target";

  beforeEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.clear();
    GraphRepository.resetCache();

    await WorkspaceRepository.saveWorkspace({
      id: WS,
      name: "Resource WS",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1,
      updatedAt: 1,
    } as Workspace);

    await WorkspaceRepository.saveWorkspace({
      id: WS_TARGET,
      name: "Resource Target WS",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1,
      updatedAt: 1,
    } as Workspace);

    await WorkspaceRepository.saveWorkspace({
      id: INBOX_WORKSPACE_ID,
      name: "Inbox",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1,
      updatedAt: 1,
    } as Workspace);
  });

  // ===========================================================================
  // 1. Lifecycle: Recycle, Restore, and Permanent Deletion
  // ===========================================================================
  describe("lifecycle: recycle, restore, and permanent deletion", () => {
    it("recycleResource correctly moves resource to Recycle Bin", async () => {
      const resource = { id: "res-lc-1", title: "Test", type: "note" as const, workspaceId: WS };
      await ResourceRepository.saveResource(resource);

      let active = await ResourceRepository.getResources(WS);
      expect(active["res-lc-1"]).toBeDefined();

      await EntityCommandService.recycleResource("res-lc-1", WS, { skipEvents: true });

      active = await ResourceRepository.getResources(WS);
      expect(active["res-lc-1"]).toBeUndefined();

      const binItems = await RecycleBinRepository.getRecycleBinItems();
      expect(binItems.some((b) => b.entityType === "resource" && b.entityId === "res-lc-1")).toBe(true);
    });

    it("restoreResource can restore deleted resource back to active partition", async () => {
      const resource = { id: "res-lc-2", title: "Test", type: "note" as const, workspaceId: WS };
      await RecycleBinRepository.addToRecycleBin("resource", resource, WS);

      const items = await RecycleBinRepository.getRecycleBinItems();
      const itemToRestore = items.find((i) => i.entityId === "res-lc-2")!;

      await EntityCommandService.restoreResource(itemToRestore.id, { skipEvents: true });

      const restoredBin = await RecycleBinRepository.getRecycleBinItems();
      expect(restoredBin.some((i) => i.entityId === "res-lc-2")).toBe(false);

      const active = await ResourceRepository.getResources(WS);
      expect(active["res-lc-2"]).toBeDefined();
      expect(active["res-lc-2"].title).toBe("Test");
      expect(active["res-lc-2"].type).toBe("note");
      expect(active["res-lc-2"].workspaceId).toBe(WS);
    });

    it("permanentlyDeleteResource exercises command boundary to clear bin, active partition, and creates tombstone", async () => {
      const resource = { id: "res-lc-3", title: "Test", type: "note" as const, workspaceId: WS };
      await RecycleBinRepository.addToRecycleBin("resource", resource, WS);

      let items = await RecycleBinRepository.getRecycleBinItems();
      expect(items.some((i) => i.entityId === "res-lc-3")).toBe(true);

      await EntityCommandService.permanentlyDeleteResource("res-lc-3", WS, {
        skipEvents: true,
        skipAnalytics: true,
      });

      items = await RecycleBinRepository.getRecycleBinItems();
      expect(items.some((i) => i.entityId === "res-lc-3")).toBe(false);

      const active = await ResourceRepository.getResources(WS);
      expect(active["res-lc-3"]).toBeUndefined();

      const tombstones = await TombstoneRepository.getTombstones();
      expect(tombstones.some((ts) => ts.entityId === "res-lc-3" && ts.entityType === "resource")).toBe(true);
    });
  });

  // ===========================================================================
  // 2. Workspace Partition Lock & RMW Concurrency
  // ===========================================================================
  describe("workspace partition lock & RMW concurrency", () => {
    it("serializes updateResource vs updateResource via workspace partition lock", async () => {
      const resourceId = "res-rmw-1";

      await ResourceRepository.saveResource({
        id: resourceId,
        workspaceId: WS,
        title: "Initial Title",
        type: "note",
        tags: ["old-tag"],
      });

      const originalGetResources = ResourceRepository.getResources.bind(ResourceRepository);
      const firstReadStarted = defer();
      const resumeFirstRead = defer();

      let getResourcesCallCount = 0;
      jest.spyOn(ResourceRepository, "getResources").mockImplementation(async (wsId) => {
        getResourcesCallCount++;
        if (getResourcesCallCount === 1) {
          firstReadStarted.resolve();
          await resumeFirstRead.promise;
        }
        return originalGetResources(wsId);
      });

      const update1Promise = ResourceCommandHandler.updateResource(
        resourceId,
        WS,
        { title: "Updated Title 1" },
        { skipEvents: true, skipAnalytics: true }
      );

      await firstReadStarted.promise;

      let update2StartedRead = false;
      jest.spyOn(ResourceRepository, "getResources").mockImplementationOnce(async (wsId) => {
        update2StartedRead = true;
        return originalGetResources(wsId);
      });

      const update2Promise = ResourceCommandHandler.updateResource(
        resourceId,
        WS,
        { tags: ["new-tag"] },
        { skipEvents: true, skipAnalytics: true }
      );

      await new Promise((r) => setTimeout(r, 50));
      expect(update2StartedRead).toBe(false);

      resumeFirstRead.resolve();
      await Promise.all([update1Promise, update2Promise]);

      const finalResources = await ResourceRepository.getResources(WS);
      const finalResource = finalResources[resourceId];
      expect(finalResource.title).toBe("Updated Title 1");
      expect(finalResource.tags).toEqual(["new-tag"]);
    });

    it("serializes moveResource vs updateResource via source workspace partition lock (stale source read protection)", async () => {
      const resourceId = "res-move-1";

      await ResourceRepository.saveResource({
        id: resourceId,
        workspaceId: WS,
        title: "Original Title",
        type: "note",
      });

      const originalGetResources = ResourceRepository.getResources.bind(ResourceRepository);
      const moveReadStarted = defer();
      const resumeMoveRead = defer();

      let getResourcesCallCount = 0;
      jest.spyOn(ResourceRepository, "getResources").mockImplementation(async (wsId) => {
        if (wsId === WS) {
          getResourcesCallCount++;
          if (getResourcesCallCount === 1) {
            moveReadStarted.resolve();
            await resumeMoveRead.promise;
          }
        }
        return originalGetResources(wsId);
      });

      const movePromise = ResourceCommandHandler.moveResource(
        resourceId,
        WS,
        WS_TARGET,
        { skipEvents: true, skipAnalytics: true }
      );

      await moveReadStarted.promise;

      let updateStartedRead = false;
      jest.spyOn(ResourceRepository, "getResources").mockImplementationOnce(async (wsId) => {
        if (wsId === WS) updateStartedRead = true;
        return originalGetResources(wsId);
      });

      const updatePromise = ResourceCommandHandler.updateResource(
        resourceId,
        WS,
        { title: "Updated Title" },
        { skipEvents: true, skipAnalytics: true }
      ).catch((e) => e.message);

      await new Promise((r) => setTimeout(r, 50));
      expect(updateStartedRead).toBe(false);

      resumeMoveRead.resolve();
      await movePromise;
      const updateResult = await updatePromise;

      expect(updateResult).toContain(`Resource ${resourceId} not found`);

      const targetResources = await ResourceRepository.getResources(WS_TARGET);
      expect(targetResources[resourceId]).toBeDefined();
      expect(targetResources[resourceId].title).toBe("Original Title");
      expect(targetResources[resourceId].workspaceId).toBe(WS_TARGET);

      const sourceResources = await ResourceRepository.getResources(WS);
      expect(sourceResources[resourceId]).toBeUndefined();
    });

    it("prevents opposite-direction deadlock in moveResource", async () => {
      const resource1 = "res-R1";
      const resource2 = "res-R2";

      await ResourceRepository.saveResource({ id: resource1, workspaceId: WS, title: "R1", type: "note" });
      await ResourceRepository.saveResource({ id: resource2, workspaceId: WS_TARGET, title: "R2", type: "note" });

      const move1 = ResourceCommandHandler.moveResource(resource1, WS, WS_TARGET, { skipEvents: true, skipAnalytics: true });
      const move2 = ResourceCommandHandler.moveResource(resource2, WS_TARGET, WS, { skipEvents: true, skipAnalytics: true });

      await Promise.all([move1, move2]);

      const finalA = await ResourceRepository.getResources(WS);
      const finalB = await ResourceRepository.getResources(WS_TARGET);

      expect(finalA[resource2]).toBeDefined();
      expect(finalB[resource1]).toBeDefined();
      expect(finalA[resource1]).toBeUndefined();
      expect(finalB[resource2]).toBeUndefined();
    });

    it("serializes recycleResource vs updateResource via partition lock (stale snapshot protection)", async () => {
      const resourceId = "res-recycle-1";

      await ResourceRepository.saveResource({
        id: resourceId,
        workspaceId: WS,
        title: "Original Title",
        type: "note",
      });

      const originalGetResources = ResourceRepository.getResources.bind(ResourceRepository);
      const recycleReadStarted = defer();
      const resumeRecycleRead = defer();

      let getResourcesCallCount = 0;
      jest.spyOn(ResourceRepository, "getResources").mockImplementation(async (wsId) => {
        if (wsId === WS) {
          getResourcesCallCount++;
          if (getResourcesCallCount === 1) {
            recycleReadStarted.resolve();
            await resumeRecycleRead.promise;
          }
        }
        return originalGetResources(wsId);
      });

      const recyclePromise = ResourceCommandHandler.recycleResource(
        resourceId,
        WS,
        { skipEvents: true }
      );

      await recycleReadStarted.promise;

      let updateStartedRead = false;
      jest.spyOn(ResourceRepository, "getResources").mockImplementationOnce(async (wsId) => {
        if (wsId === WS) updateStartedRead = true;
        return originalGetResources(wsId);
      });

      const updatePromise = ResourceCommandHandler.updateResource(
        resourceId,
        WS,
        { title: "Updated Title" },
        { skipEvents: true, skipAnalytics: true }
      ).catch((e) => e.message);

      await new Promise((r) => setTimeout(r, 50));
      expect(updateStartedRead).toBe(false);

      resumeRecycleRead.resolve();
      await recyclePromise;
      const updateResult = await updatePromise;

      expect(updateResult).toContain(`Resource ${resourceId} not found`);

      const finalResources = await ResourceRepository.getResources(WS);
      expect(finalResources[resourceId]).toBeUndefined();

      const binItems = await RecycleBinRepository.getRecycleBinItems();
      const recycledItem = binItems.find((i) => i.entityId === resourceId);
      expect(recycledItem).toBeDefined();
      expect(recycledItem?.entityType).toBe("resource");

      const snapshot = JSON.parse(recycledItem!.snapshot);
      expect(snapshot.title).toBe("Original Title");
    });

    it("serializes restoreResource vs updateResource via partition lock", async () => {
      const resourceId = "res-restore-1";
      const rbId = `rb-${resourceId}`;

      await RecycleBinRepository.addToRecycleBin("resource", {
        id: resourceId,
        workspaceId: WS,
        title: "Restored Title",
        type: "note",
      }, WS);

      await ResourceRepository.saveResource({
        id: resourceId,
        workspaceId: WS,
        title: "Active Title",
        type: "note",
      });

      const originalGetRecycleBinItems = RecycleBinRepository.getRecycleBinItems.bind(RecycleBinRepository);
      const restoreReadStarted = defer();
      const resumeRestoreRead = defer();

      let getRecycleBinItemsCallCount = 0;
      jest.spyOn(RecycleBinRepository, "getRecycleBinItems").mockImplementation(async () => {
        getRecycleBinItemsCallCount++;
        if (getRecycleBinItemsCallCount === 2) {
          restoreReadStarted.resolve();
          await resumeRestoreRead.promise;
        }
        return originalGetRecycleBinItems();
      });

      const restorePromise = ResourceCommandHandler.restoreResource(rbId, { skipEvents: true });

      await restoreReadStarted.promise;

      const originalGetResources = ResourceRepository.getResources.bind(ResourceRepository);
      let updateStartedRead = false;
      jest.spyOn(ResourceRepository, "getResources").mockImplementationOnce(async (wsId) => {
        if (wsId === WS) updateStartedRead = true;
        return originalGetResources(wsId);
      });

      const updatePromise = ResourceCommandHandler.updateResource(
        resourceId,
        WS,
        { title: "Updated Active Title" },
        { skipEvents: true, skipAnalytics: true }
      );

      await new Promise((r) => setTimeout(r, 50));
      expect(updateStartedRead).toBe(false);

      resumeRestoreRead.resolve();
      await restorePromise;
      await updatePromise;

      const finalResources = await ResourceRepository.getResources(WS);
      expect(finalResources[resourceId].title).toBe("Updated Active Title");
    });

    it("prevents restoreResource from destroying concurrent Recycle Bin additions", async () => {
      const resourceId1 = "res-restore-bin-1";
      const resourceId2 = "res-restore-bin-2";
      const rbId1 = `rb-${resourceId1}`;

      await RecycleBinRepository.removeRecycleBinItems((await RecycleBinRepository.getRecycleBinItems()).map((i) => i.id));

      await RecycleBinRepository.addToRecycleBin("resource", {
        id: resourceId1,
        workspaceId: WS,
        title: "R1",
        type: "note",
      }, WS);

      const originalGetRecycleBinItems = RecycleBinRepository.getRecycleBinItems.bind(RecycleBinRepository);
      const restoreReadStarted = defer();
      const resumeRestoreRead = defer();

      let getRecycleBinItemsCallCount = 0;
      jest.spyOn(RecycleBinRepository, "getRecycleBinItems").mockImplementation(async () => {
        getRecycleBinItemsCallCount++;
        if (getRecycleBinItemsCallCount === 2) {
          restoreReadStarted.resolve();
          await resumeRestoreRead.promise;
        }
        return originalGetRecycleBinItems();
      });

      const restorePromise = ResourceCommandHandler.restoreResource(rbId1, { skipEvents: true });

      await restoreReadStarted.promise;

      await RecycleBinRepository.addToRecycleBin("resource", {
        id: resourceId2,
        workspaceId: WS,
        title: "R2",
        type: "note",
      }, WS);

      resumeRestoreRead.resolve();
      await restorePromise;

      const finalBin = await RecycleBinRepository.getRecycleBinItems();
      expect(finalBin.find((i) => i.entityId === resourceId2)).toBeDefined();
      expect(finalBin.find((i) => i.entityId === resourceId1)).toBeUndefined();
    });
  });

  // ===========================================================================
  // 3. Archive Toggle Concurrency and Atomicity
  // ===========================================================================
  describe("archive toggle concurrency and atomicity", () => {
    it("concurrent toggleArchiveResource calls properly serialize via partition lock and flip state back-and-forth", async () => {
      const resourceId = "res-toggle-race-1";

      await ResourceRepository.saveResource({
        id: resourceId,
        workspaceId: INBOX_WORKSPACE_ID,
        title: "Note to toggle",
        type: "note",
        archivedAt: undefined,
      });

      const originalGetResources = ResourceRepository.getResources.bind(ResourceRepository);
      const call1Started = defer();
      const resumeCall1 = defer();

      let getResourcesCount = 0;
      let call2StartedRead = false;

      jest.spyOn(ResourceRepository, "getResources").mockImplementation(async (wsId) => {
        getResourcesCount++;
        if (getResourcesCount === 1) {
          call1Started.resolve();
          await resumeCall1.promise;
        } else if (getResourcesCount === 2) {
          call2StartedRead = true;
        }
        return originalGetResources(wsId);
      });

      const toggle1Promise = ResourceCommandHandler.toggleArchiveResource(
        resourceId,
        INBOX_WORKSPACE_ID,
        { skipEvents: true, skipAnalytics: true }
      );

      await call1Started.promise;

      const toggle2Promise = ResourceCommandHandler.toggleArchiveResource(
        resourceId,
        INBOX_WORKSPACE_ID,
        { skipEvents: true, skipAnalytics: true }
      );

      await new Promise((r) => setTimeout(r, 30));
      expect(call2StartedRead).toBe(false);

      resumeCall1.resolve();
      const [res1, res2] = await Promise.all([toggle1Promise, toggle2Promise]);

      expect(res1.isArchived).toBe(true);
      expect(res1.resource.archivedAt).toBeDefined();

      expect(res2.isArchived).toBe(false);
      expect(res2.resource.archivedAt).toBeUndefined();

      const finalResources = await ResourceRepository.getResources(INBOX_WORKSPACE_ID);
      expect(finalResources[resourceId].archivedAt).toBeUndefined();
    });

    it("sequential toggleArchiveResource calls on an already archived resource flip to active and back to archived", async () => {
      const resourceId = "res-toggle-race-2";

      await ResourceRepository.saveResource({
        id: resourceId,
        workspaceId: WS,
        title: "Archived note to toggle",
        type: "note",
        archivedAt: Date.now() - 5000,
      });

      const res1 = await ResourceCommandHandler.toggleArchiveResource(resourceId, WS, { skipEvents: true });
      expect(res1.isArchived).toBe(false);
      expect(res1.resource.archivedAt).toBeUndefined();

      const res2 = await ResourceCommandHandler.toggleArchiveResource(resourceId, WS, { skipEvents: true });
      expect(res2.isArchived).toBe(true);
      expect(res2.resource.archivedAt).toBeDefined();

      const final = await ResourceRepository.getResource(resourceId, WS);
      expect(final?.archivedAt).toBeDefined();
    });

    it("toggleArchiveResource vs updateResource serializes via partition lock", async () => {
      const resourceId = "res-toggle-race-3";

      await ResourceRepository.saveResource({
        id: resourceId,
        workspaceId: WS,
        title: "Initial Title",
        type: "note",
        archivedAt: undefined,
      });

      const originalGetResources = ResourceRepository.getResources.bind(ResourceRepository);
      const toggleStarted = defer();
      const resumeToggle = defer();

      let getCount = 0;
      jest.spyOn(ResourceRepository, "getResources").mockImplementation(async (wsId) => {
        getCount++;
        if (getCount === 1) {
          toggleStarted.resolve();
          await resumeToggle.promise;
        }
        return originalGetResources(wsId);
      });

      const togglePromise = ResourceCommandHandler.toggleArchiveResource(resourceId, WS, { skipEvents: true });
      await toggleStarted.promise;

      let updateStarted = false;
      jest.spyOn(ResourceRepository, "getResources").mockImplementationOnce(async (wsId) => {
        updateStarted = true;
        return originalGetResources(wsId);
      });

      const updatePromise = ResourceCommandHandler.updateResource(
        resourceId,
        WS,
        { title: "Updated Title" },
        { skipEvents: true }
      );

      await new Promise((r) => setTimeout(r, 30));
      expect(updateStarted).toBe(false);

      resumeToggle.resolve();
      await Promise.all([togglePromise, updatePromise]);

      const final = await ResourceRepository.getResource(resourceId, WS);
      expect(final?.title).toBe("Updated Title");
      expect(final?.archivedAt).toBeDefined();
    });
  });

  // ===========================================================================
  // 4. Permanent Deletion Concurrency & Tombstone Guarantees
  // ===========================================================================
  describe("permanent deletion concurrency & tombstone guarantees", () => {
    it("concurrent duplicate permanentlyDeleteResource calls serialize under partition lock and reject if already deleted", async () => {
      const resourceId = "res-perm-del-1";

      await ResourceRepository.saveResource({
        id: resourceId,
        workspaceId: WS,
        title: "Resource to delete",
        type: "note",
      });

      const originalGetResources = ResourceRepository.getResources.bind(ResourceRepository);
      const call1Started = defer();
      const resumeCall1 = defer();

      let getResourcesCount = 0;
      let call2StartedRead = false;

      jest.spyOn(ResourceRepository, "getResources").mockImplementation(async (wsId) => {
        getResourcesCount++;
        if (getResourcesCount === 1) {
          call1Started.resolve();
          await resumeCall1.promise;
        } else if (getResourcesCount === 2) {
          call2StartedRead = true;
        }
        return originalGetResources(wsId);
      });

      const delete1Promise = ResourceCommandHandler.permanentlyDeleteResource(
        resourceId,
        WS,
        { skipEvents: true, skipAnalytics: true }
      );

      await call1Started.promise;

      const delete2Promise = ResourceCommandHandler.permanentlyDeleteResource(
        resourceId,
        WS,
        { skipEvents: true, skipAnalytics: true }
      );

      await new Promise((r) => setTimeout(r, 30));
      expect(call2StartedRead).toBe(false);

      resumeCall1.resolve();

      const results = await Promise.allSettled([delete1Promise, delete2Promise]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect((rejected[0] as PromiseRejectedResult).reason.message).toContain(`Resource ${resourceId} not found`);

      const finalResources = await ResourceRepository.getResources(WS);
      expect(finalResources[resourceId]).toBeUndefined();
    });

    it("concurrent update vs permanentlyDeleteResource converges safely without resurrecting ghosts", async () => {
      await ResourceRepository.saveResourceUnlocked(makeResource("res-update-race"));

      const [updateResult, deleteResult] = await Promise.allSettled([
        EntityCommandService.updateResource(
          "res-update-race",
          WS,
          { title: "Updated Title" },
          { source: "test" }
        ),
        EntityCommandService.permanentlyDeleteResource("res-update-race", WS, {
          source: "test",
        }),
      ]);

      if (updateResult.status === "fulfilled") {
        expect(deleteResult.status).toBe("fulfilled");
      } else {
        expect(deleteResult.status).toBe("fulfilled");
        expect((updateResult as PromiseRejectedResult).reason.message).toMatch(/not found/);
      }

      const stored = await ResourceRepository.getResource("res-update-race", WS);
      expect(stored).toBeNull();

      const isTombstoned = await TombstoneRepository.isTombstoned("resource", "res-update-race", 1);
      expect(isTombstoned).toBe(true);
    });

    it("concurrent move vs permanentlyDeleteResource prevents split-brain or ghost retention", async () => {
      await ResourceRepository.saveResourceUnlocked(makeResource("res-move-race"));

      const [moveResult, deleteResult] = await Promise.allSettled([
        EntityCommandService.moveResource("res-move-race", WS, WS_TARGET, { source: "test" }),
        EntityCommandService.permanentlyDeleteResource("res-move-race", WS, { source: "test" }),
      ]);

      if (moveResult.status === "fulfilled") {
        const inTarget = await ResourceRepository.getResource("res-move-race", WS_TARGET);
        const inSource = await ResourceRepository.getResource("res-move-race", WS);
        expect(inSource).toBeNull();
        expect(inTarget).toBeDefined();
      } else {
        expect(deleteResult.status).toBe("fulfilled");
        const inSource = await ResourceRepository.getResource("res-move-race", WS);
        const inTarget = await ResourceRepository.getResource("res-move-race", WS_TARGET);
        expect(inSource).toBeNull();
        expect(inTarget).toBeNull();
        expect(await TombstoneRepository.isTombstoned("resource", "res-move-race", 1)).toBe(true);
      }
    });

    it("concurrent recycle vs permanentlyDeleteResource removes from active and bin without zombie", async () => {
      await ResourceRepository.saveResourceUnlocked(makeResource("res-recycle-race"));

      const [recycleResult, deleteResult] = await Promise.allSettled([
        EntityCommandService.recycleResource("res-recycle-race", WS, { source: "test" }),
        EntityCommandService.permanentlyDeleteResource("res-recycle-race", WS, { source: "test" }),
      ]);

      expect(recycleResult.status).toBe("fulfilled");
      expect(deleteResult.status).toBe("fulfilled");

      const stored = await ResourceRepository.getResource("res-recycle-race", WS);
      expect(stored).toBeNull();

      const binItems = await RecycleBinRepository.getRecycleBinItems();
      expect(binItems.some((b) => b.entityId === "res-recycle-race")).toBe(false);

      expect(await TombstoneRepository.isTombstoned("resource", "res-recycle-race", 1)).toBe(true);
    });

    it("concurrent restore vs permanentlyDeleteResource prevents zombie resurrection", async () => {
      const res = makeResource("res-restore-race");
      await ResourceRepository.saveResourceUnlocked(res);
      await EntityCommandService.recycleResource("res-restore-race", WS, { skipEvents: true });

      const binItems = await RecycleBinRepository.getRecycleBinItems();
      const binItem = binItems.find((b) => b.entityId === "res-restore-race");
      expect(binItem).toBeDefined();

      await Promise.allSettled([
        EntityCommandService.restoreResource(binItem!.id, { source: "test" }),
        EntityCommandService.permanentlyDeleteResource("res-restore-race", WS, { source: "test" }),
      ]);

      const inBin = (await RecycleBinRepository.getRecycleBinItems()).some(
        (b) => b.entityId === "res-restore-race"
      );
      expect(inBin).toBe(false);

      expect(await TombstoneRepository.isTombstoned("resource", "res-restore-race", 1)).toBe(true);
    });

    it("rapid concurrent double-invocation of permanentlyDeleteResource is safely serialized", async () => {
      await ResourceRepository.saveResourceUnlocked(makeResource("res-double-del"));

      const [del1, del2] = await Promise.allSettled([
        EntityCommandService.permanentlyDeleteResource("res-double-del", WS, { source: "test" }),
        EntityCommandService.permanentlyDeleteResource("res-double-del", WS, { source: "test" }),
      ]);

      const fulfilledCount = [del1, del2].filter((r) => r.status === "fulfilled").length;
      const rejectedCount = [del1, del2].filter((r) => r.status === "rejected").length;

      expect(fulfilledCount).toBe(1);
      expect(rejectedCount).toBe(1);

      expect(await TombstoneRepository.isTombstoned("resource", "res-double-del", 1)).toBe(true);
      expect(await ResourceRepository.getResource("res-double-del", WS)).toBeNull();
    });

    it("generation increment allows recreation after permanent deletion without tombstone collision", async () => {
      await ResourceRepository.saveResourceUnlocked(makeResource("res-gen-test"));

      await EntityCommandService.permanentlyDeleteResource("res-gen-test", WS, { source: "test" });

      expect(await TombstoneRepository.isTombstoned("resource", "res-gen-test", 1)).toBe(true);

      const recreated = await EntityCommandService.createResource(
        {
          id: "res-gen-test",
          workspaceId: WS,
          title: "Reborn Resource",
          type: "note",
          content: "New content",
        } as any,
        WS,
        { explicitId: "res-gen-test" }
      );

      expect(recreated.lifecycleGeneration).toBe(2);
      expect(await TombstoneRepository.isTombstoned("resource", "res-gen-test", 2)).toBe(false);

      const stored = await ResourceRepository.getResource("res-gen-test", WS);
      expect(stored).not.toBeNull();
      expect(stored!.lifecycleGeneration).toBe(2);
      expect(stored!.title).toBe("Reborn Resource");
    });
  });

  // ===========================================================================
  // 5. Graph Relationships & Reconciler Interactions
  // ===========================================================================
  describe("graph relationships and reconciler interactions", () => {
    it("permanentlyDeleteResource cleans graph relationship edges connected to the resource", async () => {
      await ResourceRepository.saveResourceUnlocked(makeResource("res-with-edges"));

      await TaskRepository.saveTaskUnlocked({
        id: "task-linked",
        workspaceId: WS,
        title: "Linked Task",
        status: "todo",
        priority: "medium",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1,
        updatedAt: 1,
      } as Task);

      const rel: Relationship = {
        id: "rel-task-res-1",
        source: { id: "task-linked", type: "task" },
        target: { id: "res-with-edges", type: "resource" },
        relationType: "related",
        createdAt: Date.now(),
      };
      await GraphRepository.saveRelationship(rel);

      const beforeRelated = await GraphRepository.getRelated("task-linked");
      expect(beforeRelated.some((r) => r.id === "rel-task-res-1")).toBe(true);

      await EntityCommandService.permanentlyDeleteResource("res-with-edges", WS, { source: "test" });

      const afterRelatedTask = await GraphRepository.getRelated("task-linked");
      expect(afterRelatedTask.some((r) => r.id === "rel-task-res-1")).toBe(false);

      const afterRelatedResource = await GraphRepository.getRelated("res-with-edges");
      expect(afterRelatedResource).toHaveLength(0);
    });

    it("permanentlyDeleteResource interacts safely with dangling resourceIds and GraphReconcilerService", async () => {
      await ResourceRepository.saveResourceUnlocked(makeResource("res-dangling-test"));

      const initialTask: Task = {
        id: "task-with-res-id",
        workspaceId: WS,
        title: "Task with Resource ID",
        status: "todo",
        priority: "medium",
        resourceIds: ["res-dangling-test"],
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 100,
        updatedAt: 200,
      };
      const saved = await TaskRepository.saveTaskUnlocked(initialTask);

      await EntityCommandService.permanentlyDeleteResource("res-dangling-test", WS, { source: "test" });

      const report = await GraphReconcilerService.reconcileAll();
      expect(report.cleanedResourceIds).toBeGreaterThanOrEqual(1);

      const updatedTask = await TaskRepository.getTask("task-with-res-id", WS);
      expect(updatedTask).not.toBeNull();
      expect(updatedTask!.resourceIds).toBeUndefined();
      expect(updatedTask!.revision).toBe(saved.revision);
      expect(updatedTask!.updatedAt).toBe(saved.updatedAt);
      expect(updatedTask!.lifecycleGeneration).toBe(saved.lifecycleGeneration);
    });

    it("concurrent createRelationship vs permanentlyDeleteResource safely resolves without dangling active edges", async () => {
      await ResourceRepository.saveResourceUnlocked(makeResource("res-rel-race"));
      await TaskRepository.saveTaskUnlocked({
        id: "task-rel-race",
        workspaceId: WS,
        title: "Task for Rel Race",
        status: "todo",
        priority: "medium",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1,
        updatedAt: 1,
      } as Task);

      await Promise.allSettled([
        EntityCommandService.createRelationship({
          source: { id: "task-rel-race", type: "task" },
          target: { id: "res-rel-race", type: "resource" },
          relationType: "related",
        }),
        EntityCommandService.permanentlyDeleteResource("res-rel-race", WS, { source: "test" }),
      ]);

      const active = await ResourceRepository.getResource("res-rel-race", WS);
      expect(active).toBeNull();
      expect(await TombstoneRepository.isTombstoned("resource", "res-rel-race", 1)).toBe(true);

      await GraphReconcilerService.reconcileAll();

      const related = await GraphRepository.getRelated("res-rel-race");
      expect(related).toHaveLength(0);
      const relatedTask = await GraphRepository.getRelated("task-rel-race");
      expect(relatedTask.some((r) => r.target.id === "res-rel-race" || r.source.id === "res-rel-race")).toBe(false);
    });
  });

  // ===========================================================================
  // 6. Hostile Verification & Stale Restore Protection
  // ===========================================================================
  describe("hostile verification & stale restore protection", () => {
    test("restoreResource uses correct snapshot data when recycle bin item changes concurrently", async () => {
      const oldSnapshot = {
        id: "res-hostile-1",
        workspaceId: WS,
        title: "Old Title",
        content: "",
        tags: [],
        createdAt: 1000,
        updatedAt: 1000,
      };

      await AsyncStorage.setItem(
        "pebble:v1:recycle_bin",
        JSON.stringify([
          {
            id: "rb-res-hostile-1",
            entityType: "resource",
            entityId: "res-hostile-1",
            snapshot: JSON.stringify(oldSnapshot),
            deletedAt: 1000,
          },
        ])
      );

      let concurrentMutationDone = false;
      jest.spyOn(require("@/shared/utils/mutex"), "withLock").mockImplementation(async (key: any, fn: any) => {
        if (key === `pebble:v1:resources:${WS}` && !concurrentMutationDone) {
          concurrentMutationDone = true;
          const newSnapshot = {
            ...oldSnapshot,
            title: "New Title",
            updatedAt: 2000,
          };
          await AsyncStorage.setItem(
            "pebble:v1:recycle_bin",
            JSON.stringify([
              {
                id: "rb-res-hostile-1",
                entityType: "resource",
                entityId: "res-hostile-1",
                snapshot: JSON.stringify(newSnapshot),
                deletedAt: 2000,
              },
            ])
          );
        }
        return fn();
      });

      const result = await ResourceCommandHandler.restoreResource("rb-res-hostile-1", {
        skipEvents: true,
        skipAnalytics: true,
      });

      expect(result.title).toBe("New Title");

      const resources = await ResourceRepository.getResources(WS);
      expect(resources["res-hostile-1"].title).toBe("New Title");

      jest.spyOn(require("@/shared/utils/mutex"), "withLock").mockRestore();
    });

    test("restoreResource throws if concurrent recycle bin update changed workspace", async () => {
      const oldSnapshot = {
        id: "res-hostile-2",
        workspaceId: WS,
        title: "Title",
        content: "",
        tags: [],
        createdAt: 1000,
        updatedAt: 1000,
      };

      await AsyncStorage.setItem(
        "pebble:v1:recycle_bin",
        JSON.stringify([
          {
            id: "rb-res-hostile-2",
            entityType: "resource",
            entityId: "res-hostile-2",
            snapshot: JSON.stringify(oldSnapshot),
            deletedAt: 1000,
          },
        ])
      );

      let concurrentMutationDone = false;
      jest.spyOn(require("@/shared/utils/mutex"), "withLock").mockImplementation(async (key: any, fn: any) => {
        if (key === `pebble:v1:resources:${WS}` && !concurrentMutationDone) {
          concurrentMutationDone = true;
          const newSnapshot = {
            ...oldSnapshot,
            workspaceId: WS_TARGET,
            updatedAt: 2000,
          };
          await AsyncStorage.setItem(
            "pebble:v1:recycle_bin",
            JSON.stringify([
              {
                id: "rb-res-hostile-2",
                entityType: "resource",
                entityId: "res-hostile-2",
                snapshot: JSON.stringify(newSnapshot),
                deletedAt: 2000,
              },
            ])
          );
        }
        return fn();
      });

      await expect(
        ResourceCommandHandler.restoreResource("rb-res-hostile-2", {
          skipEvents: true,
          skipAnalytics: true,
        })
      ).rejects.toThrow(/Concurrent modification/);

      jest.spyOn(require("@/shared/utils/mutex"), "withLock").mockRestore();
    });
  });
});
