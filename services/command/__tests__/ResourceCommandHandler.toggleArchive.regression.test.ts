import { ResourceCommandHandler } from "../handlers/ResourceCommandHandler";
import { ResourceRepository } from "@/repositories/ResourceRepository";
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

describe("Hostile Regression: ResourceCommandHandler.toggleArchiveResource Concurrency & Atomicity", () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.clear();
  });

  it("1: Concurrent toggleArchiveResource calls must properly serialize via partition lock and flip state back-and-forth", async () => {
    const workspaceId = INBOX_WORKSPACE_ID;
    const resourceId = "res-toggle-race-1";

    // 1. Seed active resource (not archived)
    await ResourceRepository.saveResource({
      id: resourceId,
      workspaceId,
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
        // Call 1 inside partition lock
        call1Started.resolve();
        await resumeCall1.promise;
      } else if (getResourcesCount === 2) {
        call2StartedRead = true;
      }
      return originalGetResources(wsId);
    });

    // 2. Launch Call 1
    const toggle1Promise = ResourceCommandHandler.toggleArchiveResource(
      resourceId,
      workspaceId,
      { skipEvents: true, skipAnalytics: true }
    );

    await call1Started.promise;

    // 3. Launch Call 2 while Call 1 holds lock
    const toggle2Promise = ResourceCommandHandler.toggleArchiveResource(
      resourceId,
      workspaceId,
      { skipEvents: true, skipAnalytics: true }
    );

    // Call 2 must NOT be able to start reading while Call 1 holds the lock
    await new Promise((r) => setTimeout(r, 30));
    expect(call2StartedRead).toBe(false);

    // Resume Call 1
    resumeCall1.resolve();

    const [res1, res2] = await Promise.all([toggle1Promise, toggle2Promise]);

    // Call 1 toggled active -> archived
    expect(res1.isArchived).toBe(true);
    expect(res1.resource.archivedAt).toBeDefined();

    // Call 2 toggled archived -> active
    expect(res2.isArchived).toBe(false);
    expect(res2.resource.archivedAt).toBeUndefined();

    // End state: resource is NOT archived (archivedAt === undefined)
    const finalResources = await ResourceRepository.getResources(workspaceId);
    const finalResource = finalResources[resourceId];
    expect(finalResource.archivedAt).toBeUndefined();
  });

  it("2: Sequential toggleArchiveResource calls on an already archived resource flips to active and back to archived", async () => {
    const workspaceId = "ws-archive-test";
    const resourceId = "res-toggle-race-2";

    // 1. Seed archived resource
    await ResourceRepository.saveResource({
      id: resourceId,
      workspaceId,
      title: "Archived note to toggle",
      type: "note",
      archivedAt: Date.now() - 5000,
    });

    // Run two sequential toggles
    const res1 = await ResourceCommandHandler.toggleArchiveResource(resourceId, workspaceId, { skipEvents: true });
    expect(res1.isArchived).toBe(false);
    expect(res1.resource.archivedAt).toBeUndefined();

    const res2 = await ResourceCommandHandler.toggleArchiveResource(resourceId, workspaceId, { skipEvents: true });
    expect(res2.isArchived).toBe(true);
    expect(res2.resource.archivedAt).toBeDefined();

    const final = await ResourceRepository.getResource(resourceId, workspaceId);
    expect(final?.archivedAt).toBeDefined();
  });

  it("3: toggleArchiveResource vs updateResource serializes via partition lock", async () => {
    const workspaceId = "ws-archive-test-3";
    const resourceId = "res-toggle-race-3";

    await ResourceRepository.saveResource({
      id: resourceId,
      workspaceId,
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

    // Start toggle
    const togglePromise = ResourceCommandHandler.toggleArchiveResource(resourceId, workspaceId, { skipEvents: true });
    await toggleStarted.promise;

    // Concurrently update title
    let updateStarted = false;
    jest.spyOn(ResourceRepository, "getResources").mockImplementationOnce(async (wsId) => {
      updateStarted = true;
      return originalGetResources(wsId);
    });

    const updatePromise = ResourceCommandHandler.updateResource(
      resourceId,
      workspaceId,
      { title: "Updated Title" },
      { skipEvents: true }
    );

    // Update cannot enter read phase while toggle holds lock
    await new Promise((r) => setTimeout(r, 30));
    expect(updateStarted).toBe(false);

    resumeToggle.resolve();
    await Promise.all([togglePromise, updatePromise]);

    const final = await ResourceRepository.getResource(resourceId, workspaceId);
    expect(final?.title).toBe("Updated Title");
    expect(final?.archivedAt).toBeDefined();
  });
});
