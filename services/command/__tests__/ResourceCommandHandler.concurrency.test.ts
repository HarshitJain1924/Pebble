import { ResourceCommandHandler } from "../handlers/ResourceCommandHandler";
import { ResourceRepository } from "@/repositories/ResourceRepository";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { withLock } from "@/shared/utils/mutex";
import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// Helper to wait
const defer = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

describe("ResourceCommandHandler Concurrency", () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.clear();
  });

  it("Test 1: should serialize updateResource vs updateResource via workspace partition lock", async () => {
    // 1. Seed Resource R in workspace A
    const workspaceId = "ws-resource-test";
    const resourceId = "res-rmw-1";

    await ResourceRepository.saveResource({
      id: resourceId,
      workspaceId,
      title: "Initial Title",
      type: "note",
      tags: ["old-tag"],
    });

    // We will intercept ResourceRepository.getResources to introduce a deterministic pause
    // right after the partition lock is acquired, but before the read finishes.
    const originalGetResources = ResourceRepository.getResources.bind(ResourceRepository);
    
    const firstReadStarted = defer();
    const resumeFirstRead = defer();

    let getResourcesCallCount = 0;
    jest
      .spyOn(ResourceRepository, "getResources")
      .mockImplementation(async (wsId) => {
        getResourcesCallCount++;
        if (getResourcesCallCount === 1) {
          // This is the first update operation (inside the lock)
          firstReadStarted.resolve();
          await resumeFirstRead.promise;
        }
        return originalGetResources(wsId);
      });

    // 2. Start updateResource(R) changing property X (title)
    const update1Promise = ResourceCommandHandler.updateResource(
      resourceId,
      workspaceId,
      { title: "Updated Title 1" },
      { skipEvents: true, skipAnalytics: true }
    );

    // 3. Pause it deterministically (wait until it hits our mock)
    await firstReadStarted.promise;

    // At this point, update1 holds the pebble:v1:resources:${workspaceId} lock.
    // 4. Start another updateResource(R) changing property Y (tags)
    let update2StartedRead = false;
    jest.spyOn(ResourceRepository, "getResources").mockImplementationOnce(async (wsId) => {
      // If it reaches here, it has acquired the lock!
      update2StartedRead = true;
      return originalGetResources(wsId);
    });

    const update2Promise = ResourceCommandHandler.updateResource(
      resourceId,
      workspaceId,
      { tags: ["new-tag"] },
      { skipEvents: true, skipAnalytics: true }
    );

    // 5. Prove the second operation cannot enter its read phase while the first holds the lock
    // Wait a brief moment to ensure update2 had a chance to try to run
    await new Promise((r) => setTimeout(r, 50));
    expect(update2StartedRead).toBe(false);

    // 6. Resume the first operation
    resumeFirstRead.resolve();

    // 7. Allow both operations to complete serially
    await Promise.all([update1Promise, update2Promise]);

    // 8. Verify the final Resource preserves both compatible changes
    const finalResources = await ResourceRepository.getResources(workspaceId);
    const finalResource = finalResources[resourceId];

    // Due to the lock, update2 must read the state AFTER update1 writes it.
    // Therefore, both title and tags should be updated.
    expect(finalResource.title).toBe("Updated Title 1");
    expect(finalResource.tags).toEqual(["new-tag"]);
  });

  it("Test 2: should serialize moveResource vs updateResource via source workspace partition lock (stale source read protection)", async () => {
    // 1. Seed Resource R in workspace A
    const sourceWorkspaceId = "ws-A";
    const targetWorkspaceId = "ws-B";
    const resourceId = "res-move-1";

    await ResourceRepository.saveResource({
      id: resourceId,
      workspaceId: sourceWorkspaceId,
      title: "Original Title",
      type: "note",
    });

    const originalGetResources = ResourceRepository.getResources.bind(ResourceRepository);
    const moveReadStarted = defer();
    const resumeMoveRead = defer();

    let getResourcesCallCount = 0;
    jest
      .spyOn(ResourceRepository, "getResources")
      .mockImplementation(async (wsId) => {
        // We only want to pause the source read of the move operation
        if (wsId === sourceWorkspaceId) {
          getResourcesCallCount++;
          if (getResourcesCallCount === 1) {
            moveReadStarted.resolve();
            await resumeMoveRead.promise;
          }
        }
        return originalGetResources(wsId);
      });

    // 2. Start moveResource(A → B)
    const movePromise = ResourceCommandHandler.moveResource(
      resourceId,
      sourceWorkspaceId,
      targetWorkspaceId,
      { skipEvents: true, skipAnalytics: true }
    );

    // 3. Pause the move after it has acquired the source partition lock but before read completes
    await moveReadStarted.promise;

    // 4. Start updateResource(R in A)
    let updateStartedRead = false;
    jest.spyOn(ResourceRepository, "getResources").mockImplementationOnce(async (wsId) => {
      if (wsId === sourceWorkspaceId) updateStartedRead = true;
      return originalGetResources(wsId);
    });

    const updatePromise = ResourceCommandHandler.updateResource(
      resourceId,
      sourceWorkspaceId,
      { title: "Updated Title" },
      { skipEvents: true, skipAnalytics: true }
    ).catch(e => e.message); // Should throw "not found" eventually because the move succeeds first

    // 5. Prove updateResource cannot enter its read phase while the move holds the source lock
    await new Promise((r) => setTimeout(r, 50));
    expect(updateStartedRead).toBe(false);

    // 6. Resume the move
    resumeMoveRead.resolve();

    await movePromise;
    const updateResult = await updatePromise;

    // The update should fail because the move finished first and deleted it from A
    expect(updateResult).toContain(`Resource ${resourceId} not found`);

    // 7. Verify R exists in B with the correct state
    const targetResources = await ResourceRepository.getResources(targetWorkspaceId);
    expect(targetResources[resourceId]).toBeDefined();
    expect(targetResources[resourceId].title).toBe("Original Title");
    expect(targetResources[resourceId].workspaceId).toBe(targetWorkspaceId);

    // 8. Verify R no longer exists in A
    const sourceResources = await ResourceRepository.getResources(sourceWorkspaceId);
    expect(sourceResources[resourceId]).toBeUndefined();
  });

  it("Test 3: should prevent opposite-direction deadlock in moveResource", async () => {
    // 1. Seed Resource R1 in A
    // 2. Seed Resource R2 in B
    const workspaceA = "ws-deadlock-A";
    const workspaceB = "ws-deadlock-B";
    const resource1 = "res-R1";
    const resource2 = "res-R2";

    await ResourceRepository.saveResource({ id: resource1, workspaceId: workspaceA, title: "R1", type: "note" });
    await ResourceRepository.saveResource({ id: resource2, workspaceId: workspaceB, title: "R2", type: "note" });

    // 3. Start moveResource(R1, A → B)
    // 4. Concurrently start moveResource(R2, B → A)
    const move1 = ResourceCommandHandler.moveResource(resource1, workspaceA, workspaceB, { skipEvents: true, skipAnalytics: true });
    const move2 = ResourceCommandHandler.moveResource(resource2, workspaceB, workspaceA, { skipEvents: true, skipAnalytics: true });

    // 5. Prove both operations resolve
    await Promise.all([move1, move2]);

    // 6. Verify R1 ends in B and R2 ends in A
    const finalA = await ResourceRepository.getResources(workspaceA);
    const finalB = await ResourceRepository.getResources(workspaceB);

    expect(finalA[resource2]).toBeDefined();
    expect(finalB[resource1]).toBeDefined();

    expect(finalA[resource1]).toBeUndefined();
    expect(finalB[resource2]).toBeUndefined();
  });

  it("Test 4: should serialize recycleResource vs updateResource via partition lock (stale snapshot protection)", async () => {
    // 1. Seed Resource R in workspace A
    const workspaceId = "ws-recycle-test";
    const resourceId = "res-recycle-1";

    await ResourceRepository.saveResource({
      id: resourceId,
      workspaceId,
      title: "Original Title",
      type: "note",
    });

    const originalGetResources = ResourceRepository.getResources.bind(ResourceRepository);
    const recycleReadStarted = defer();
    const resumeRecycleRead = defer();

    let getResourcesCallCount = 0;
    jest
      .spyOn(ResourceRepository, "getResources")
      .mockImplementation(async (wsId) => {
        if (wsId === workspaceId) {
          getResourcesCallCount++;
          if (getResourcesCallCount === 1) {
            recycleReadStarted.resolve();
            await resumeRecycleRead.promise;
          }
        }
        return originalGetResources(wsId);
      });

    // 2. Start recycleResource(R)
    const recyclePromise = ResourceCommandHandler.recycleResource(
      resourceId,
      workspaceId,
      { skipEvents: true }
    );

    // 3. Pause the recycle operation after it has acquired the partition lock but before read completes
    await recycleReadStarted.promise;

    // 4. Start updateResource(R)
    let updateStartedRead = false;
    jest.spyOn(ResourceRepository, "getResources").mockImplementationOnce(async (wsId) => {
      if (wsId === workspaceId) updateStartedRead = true;
      return originalGetResources(wsId);
    });

    const updatePromise = ResourceCommandHandler.updateResource(
      resourceId,
      workspaceId,
      { title: "Updated Title" },
      { skipEvents: true, skipAnalytics: true }
    ).catch(e => e.message);

    // 5. Prove updateResource cannot enter its read phase while recycle holds the lock
    await new Promise((r) => setTimeout(r, 50));
    expect(updateStartedRead).toBe(false);

    // 6. Resume the recycle operation
    resumeRecycleRead.resolve();

    await recyclePromise;
    const updateResult = await updatePromise;

    // The update should fail because the recycle finished first and deleted it
    expect(updateResult).toContain(`Resource ${resourceId} not found`);

    // 7. Verify R no longer exists in the active partition
    const finalResources = await ResourceRepository.getResources(workspaceId);
    expect(finalResources[resourceId]).toBeUndefined();

    // 8. Verify the Recycle Bin contains the precise state of R at the time of recycle
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    const recycledItem = binItems.find(i => i.entityId === resourceId);
    
    expect(recycledItem).toBeDefined();
    expect(recycledItem?.entityType).toBe("resource");
    
    const snapshot = JSON.parse(recycledItem!.snapshot);
    expect(snapshot.title).toBe("Original Title");
  });

  it("Test 5: should serialize restoreResource vs updateResource via partition lock", async () => {
    // 1. Seed Resource in Recycle Bin
    const workspaceId = "ws-restore-test";
    const resourceId = "res-restore-1";
    const rbId = `rb-${resourceId}`;

    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    await RecycleBinRepository.addToRecycleBin("resource", {
      id: resourceId,
      workspaceId,
      title: "Restored Title",
      type: "note",
    }, workspaceId);

    // Provide a dummy resource in active partition to test overwrite vs update race
    await ResourceRepository.saveResource({
      id: resourceId,
      workspaceId,
      title: "Active Title",
      type: "note",
    });

    const originalGetRecycleBinItems = RecycleBinRepository.getRecycleBinItems.bind(RecycleBinRepository);
    const restoreReadStarted = defer();
    const resumeRestoreRead = defer();

    let getRecycleBinItemsCallCount = 0;
    jest
      .spyOn(RecycleBinRepository, "getRecycleBinItems")
      .mockImplementation(async () => {
        getRecycleBinItemsCallCount++;
        // The first call is unlocked, the second call is inside the partition lock
        if (getRecycleBinItemsCallCount === 2) {
          restoreReadStarted.resolve();
          await resumeRestoreRead.promise;
        }
        return originalGetRecycleBinItems();
      });

    // 2. Start restoreResource(R)
    const restorePromise = ResourceCommandHandler.restoreResource(rbId, { skipEvents: true });

    // 3. Pause restore operation inside the partition lock
    await restoreReadStarted.promise;

    // 4. Start updateResource(R)
    const originalGetResources = ResourceRepository.getResources.bind(ResourceRepository);
    let updateStartedRead = false;
    jest.spyOn(ResourceRepository, "getResources").mockImplementationOnce(async (wsId) => {
      if (wsId === workspaceId) updateStartedRead = true;
      return originalGetResources(wsId);
    });

    const updatePromise = ResourceCommandHandler.updateResource(
      resourceId,
      workspaceId,
      { title: "Updated Active Title" },
      { skipEvents: true, skipAnalytics: true }
    );

    // 5. Prove updateResource cannot enter its read phase
    await new Promise((r) => setTimeout(r, 50));
    expect(updateStartedRead).toBe(false);

    // 6. Resume restore
    resumeRestoreRead.resolve();

    await restorePromise;
    await updatePromise;

    // 7. Verify the active partition has the update applied on top of the restore (since they serialize)
    // Actually, update reads AFTER restore writes. So update will see "Restored Title" and update it.
    const finalResources = await ResourceRepository.getResources(workspaceId);
    expect(finalResources[resourceId].title).toBe("Updated Active Title");
  });

  it("Test 6: should prevent restoreResource from destroying concurrent Recycle Bin additions", async () => {
    // 1. Seed Resource in Recycle Bin
    const workspaceId = "ws-restore-test-2";
    const resourceId1 = "res-restore-1";
    const resourceId2 = "res-restore-2";
    const rbId1 = `rb-${resourceId1}`;

    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    
    // Clear first to isolate this test
    await RecycleBinRepository.removeRecycleBinItems((await RecycleBinRepository.getRecycleBinItems()).map(i => i.id));

    await RecycleBinRepository.addToRecycleBin("resource", {
      id: resourceId1,
      workspaceId,
      title: "R1",
    }, workspaceId);

    const originalGetRecycleBinItems = RecycleBinRepository.getRecycleBinItems.bind(RecycleBinRepository);
    const restoreReadStarted = defer();
    const resumeRestoreRead = defer();

    let getRecycleBinItemsCallCount = 0;
    jest
      .spyOn(RecycleBinRepository, "getRecycleBinItems")
      .mockImplementation(async () => {
        getRecycleBinItemsCallCount++;
        // We pause the SECOND call (inside the partition lock)
        if (getRecycleBinItemsCallCount === 2) {
          restoreReadStarted.resolve();
          await resumeRestoreRead.promise;
        }
        return originalGetRecycleBinItems();
      });

    // 2. Start restoreResource(R1)
    const restorePromise = ResourceCommandHandler.restoreResource(rbId1, { skipEvents: true });

    // 3. Pause restore operation
    await restoreReadStarted.promise;

    // 4. Concurrently add R2 to the Recycle Bin
    await RecycleBinRepository.addToRecycleBin("resource", {
      id: resourceId2,
      workspaceId,
      title: "R2",
    }, workspaceId);

    // 5. Resume restore
    resumeRestoreRead.resolve();
    await restorePromise;

    // 6. Verify that R2 is STILL in the Recycle Bin (the old bug would have deleted it)
    const finalBin = await RecycleBinRepository.getRecycleBinItems();
    expect(finalBin.find(i => i.entityId === resourceId2)).toBeDefined();
    // And R1 is gone
    expect(finalBin.find(i => i.entityId === resourceId1)).toBeUndefined();
  });
});
