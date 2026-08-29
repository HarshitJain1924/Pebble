import { ResourceCommandHandler } from "../handlers/ResourceCommandHandler";
import { ResourceRepository } from "@/repositories/ResourceRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { INBOX_WORKSPACE_ID, type Resource } from "@/shared/types/domain.types";
import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const defer = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

describe("Hostile Regression: ResourceCommandHandler.permanentlyDeleteResource Concurrency & Atomicity", () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.clear();
  });

  it("1: Concurrent duplicate permanentlyDeleteResource calls must serialize under partition lock and reject if already deleted", async () => {
    const workspaceId = "ws-perm-del-test-1";
    const resourceId = "res-perm-del-1";

    await WorkspaceRepository.saveWorkspace({
      id: workspaceId,
      name: "Test Workspace 1",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ResourceRepository.saveResource({
      id: resourceId,
      workspaceId,
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

    // Launch Call 1
    const delete1Promise = ResourceCommandHandler.permanentlyDeleteResource(
      resourceId,
      workspaceId,
      { skipEvents: true, skipAnalytics: true }
    );

    await call1Started.promise;

    // Launch Call 2 while Call 1 holds lock
    const delete2Promise = ResourceCommandHandler.permanentlyDeleteResource(
      resourceId,
      workspaceId,
      { skipEvents: true, skipAnalytics: true }
    );

    // Call 2 must NOT enter its read phase while Call 1 holds the partition lock
    await new Promise((r) => setTimeout(r, 30));
    expect(call2StartedRead).toBe(false);

    // Resume Call 1
    resumeCall1.resolve();

    const results = await Promise.allSettled([delete1Promise, delete2Promise]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly one call succeeds; the other rejects with not found
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toContain(`Resource ${resourceId} not found`);

    const finalResources = await ResourceRepository.getResources(workspaceId);
    expect(finalResources[resourceId]).toBeUndefined();
  });

  it("2: permanentlyDeleteResource and moveResource must serialize to prevent ghost survivals", async () => {
    const workspace1 = "ws-perm-del-src";
    const workspace2 = "ws-perm-del-dst";
    const resourceId = "res-perm-del-move";

    await WorkspaceRepository.saveWorkspace({
      id: workspace1,
      name: "Source WS",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await WorkspaceRepository.saveWorkspace({
      id: workspace2,
      name: "Destination WS",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ResourceRepository.saveResource({
      id: resourceId,
      workspaceId: workspace1,
      title: "Resource racing move vs delete",
      type: "note",
    });

    const originalGetResources = ResourceRepository.getResources.bind(ResourceRepository);

    const deleteStarted = defer();
    const resumeDelete = defer();

    let getResourcesCount = 0;
    jest.spyOn(ResourceRepository, "getResources").mockImplementation(async (wsId) => {
      if (wsId === workspace1) {
        getResourcesCount++;
        if (getResourcesCount === 1) {
          deleteStarted.resolve();
          await resumeDelete.promise;
        }
      }
      return originalGetResources(wsId);
    });

    // 1. Start permanentlyDeleteResource in workspace1
    const deletePromise = ResourceCommandHandler.permanentlyDeleteResource(
      resourceId,
      workspace1,
      { skipEvents: true, skipAnalytics: true }
    );

    await deleteStarted.promise;

    // 2. Concurrently attempt to move the resource to workspace2
    let moveStartedRead = false;
    jest.spyOn(ResourceRepository, "getResources").mockImplementationOnce(async (wsId) => {
      if (wsId === workspace1) moveStartedRead = true;
      return originalGetResources(wsId);
    });

    const movePromise = ResourceCommandHandler.moveResource(
      resourceId,
      workspace1,
      workspace2,
      { skipEvents: true, skipAnalytics: true }
    );

    // moveResource must NOT enter read phase while delete holds the lock
    await new Promise((r) => setTimeout(r, 30));
    expect(moveStartedRead).toBe(false);

    // 3. Resume delete
    resumeDelete.resolve();

    await deletePromise;
    await expect(movePromise).rejects.toThrow(/not found/i);

    // 4. Verify entity is deleted everywhere and not present in workspace2
    const ws1Resources = await ResourceRepository.getResources(workspace1);
    const ws2Resources = await ResourceRepository.getResources(workspace2);
    expect(ws1Resources[resourceId]).toBeUndefined();
    expect(ws2Resources[resourceId]).toBeUndefined();
  });
});
