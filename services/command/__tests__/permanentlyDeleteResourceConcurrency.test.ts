import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import {
  ResourceRepository,
  RecycleBinRepository,
  WorkspaceRepository,
  TombstoneRepository,
  TaskRepository,
} from "@/repositories";
import { GraphRepository } from "@/repositories/GraphRepository";
import { GraphReconcilerService } from "@/services/storage/GraphReconcilerService";
import {
  type Resource,
  type Task,
  type Workspace,
  type Relationship,
} from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const WS = "ws-resources";
const WS_TARGET = "ws-resources-target";

const makeResource = (
  id: string,
  overrides: Partial<Resource> = {},
): Resource => ({
  id,
  workspaceId: WS,
  title: `Resource ${id}`,
  type: "note",
  content: `Content for ${id}`,
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

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
});

describe("permanentlyDeleteResource hostile concurrency (real production path)", () => {
  it("A: concurrent update vs permanentlyDeleteResource converges safely without resurrecting ghosts", async () => {
    await ResourceRepository.saveResourceUnlocked(makeResource("res-update-race"));

    // Concurrently update and permanently delete the resource
    const [updateResult, deleteResult] = await Promise.allSettled([
      EntityCommandService.updateResource(
        "res-update-race",
        WS,
        { title: "Updated Title" },
        { source: "test" },
      ),
      EntityCommandService.permanentlyDeleteResource("res-update-race", WS, {
        source: "test",
      }),
    ]);

    // One of two deterministic outcomes:
    // 1. Update won lock first -> updated, then delete saw updated and permanently deleted it.
    // 2. Delete won lock first -> deleted, then update failed with "Resource res-update-race not found".
    if (updateResult.status === "fulfilled") {
      expect(deleteResult.status).toBe("fulfilled");
    } else {
      expect(deleteResult.status).toBe("fulfilled");
      expect((updateResult as PromiseRejectedResult).reason.message).toMatch(
        /not found/,
      );
    }

    // Active storage must NOT contain the resource
    const stored = await ResourceRepository.getResource("res-update-race", WS);
    expect(stored).toBeNull();

    // Tombstone must exist
    const isTombstoned = await TombstoneRepository.isTombstoned(
      "resource",
      "res-update-race",
      1,
    );
    expect(isTombstoned).toBe(true);
  });

  it("B: concurrent move vs permanentlyDeleteResource prevents split-brain or ghost retention", async () => {
    await ResourceRepository.saveResourceUnlocked(makeResource("res-move-race"));

    const [moveResult, deleteResult] = await Promise.allSettled([
      EntityCommandService.moveResource(
        "res-move-race",
        WS,
        WS_TARGET,
        { source: "test" },
      ),
      EntityCommandService.permanentlyDeleteResource("res-move-race", WS, {
        source: "test",
      }),
    ]);

    // Either move won locks first, or delete won lock first
    if (moveResult.status === "fulfilled") {
      // Move completed before delete; delete on source workspace fails or deletes if found
      const inTarget = await ResourceRepository.getResource(
        "res-move-race",
        WS_TARGET,
      );
      const inSource = await ResourceRepository.getResource(
        "res-move-race",
        WS,
      );
      expect(inSource).toBeNull();
      // Target holds the moved resource
      expect(inTarget).toBeDefined();
    } else {
      // Delete won: resource was deleted and tombstoned in source workspace
      expect(deleteResult.status).toBe("fulfilled");
      const inSource = await ResourceRepository.getResource(
        "res-move-race",
        WS,
      );
      const inTarget = await ResourceRepository.getResource(
        "res-move-race",
        WS_TARGET,
      );
      expect(inSource).toBeNull();
      expect(inTarget).toBeNull();
      expect(
        await TombstoneRepository.isTombstoned("resource", "res-move-race", 1),
      ).toBe(true);
    }
  });

  it("C: concurrent recycle vs permanentlyDeleteResource removes from active and bin without zombie", async () => {
    await ResourceRepository.saveResourceUnlocked(makeResource("res-recycle-race"));

    const [recycleResult, deleteResult] = await Promise.allSettled([
      EntityCommandService.recycleResource("res-recycle-race", WS, {
        source: "test",
      }),
      EntityCommandService.permanentlyDeleteResource("res-recycle-race", WS, {
        source: "test",
      }),
    ]);

    expect(recycleResult.status).toBe("fulfilled");
    expect(deleteResult.status).toBe("fulfilled");

    // Must not be in active storage
    const stored = await ResourceRepository.getResource("res-recycle-race", WS);
    expect(stored).toBeNull();

    // Must not be in recycle bin
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    const inBin = binItems.some((b) => b.entityId === "res-recycle-race");
    expect(inBin).toBe(false);

    // Durable tombstone must exist
    expect(
      await TombstoneRepository.isTombstoned("resource", "res-recycle-race", 1),
    ).toBe(true);
  });

  it("D: concurrent restore vs permanentlyDeleteResource prevents zombie resurrection", async () => {
    const res = makeResource("res-restore-race");
    await ResourceRepository.saveResourceUnlocked(res);
    await EntityCommandService.recycleResource("res-restore-race", WS, {
      skipEvents: true,
    });

    const binItems = await RecycleBinRepository.getRecycleBinItems();
    const binItem = binItems.find((b) => b.entityId === "res-restore-race");
    expect(binItem).toBeDefined();

    // Race restore and permanentlyDeleteResource
    const [restoreResult, deleteResult] = await Promise.allSettled([
      EntityCommandService.restoreResource(binItem!.id, { source: "test" }),
      EntityCommandService.permanentlyDeleteResource("res-restore-race", WS, {
        source: "test",
      }),
    ]);

    // If permanent delete won, restore was rejected or detected tombstone
    // If restore won, permanent delete found active resource and deleted it
    const active = await ResourceRepository.getResource("res-restore-race", WS);
    const inBin = (await RecycleBinRepository.getRecycleBinItems()).some(
      (b) => b.entityId === "res-restore-race",
    );

    // Regardless of winner, final state must not be a zombie in recycle bin
    expect(inBin).toBe(false);

    // And durable tombstone must be registered
    expect(
      await TombstoneRepository.isTombstoned("resource", "res-restore-race", 1),
    ).toBe(true);
  });

  it("E: rapid concurrent double-invocation of permanentlyDeleteResource is safely serialized", async () => {
    await ResourceRepository.saveResourceUnlocked(makeResource("res-double-del"));

    const [del1, del2] = await Promise.allSettled([
      EntityCommandService.permanentlyDeleteResource("res-double-del", WS, {
        source: "test",
      }),
      EntityCommandService.permanentlyDeleteResource("res-double-del", WS, {
        source: "test",
      }),
    ]);

    // Exactly one succeeds, the other rejects with not found
    const fulfilledCount = [del1, del2].filter(
      (r) => r.status === "fulfilled",
    ).length;
    const rejectedCount = [del1, del2].filter(
      (r) => r.status === "rejected",
    ).length;

    expect(fulfilledCount).toBe(1);
    expect(rejectedCount).toBe(1);

    // Tombstone exists
    expect(
      await TombstoneRepository.isTombstoned("resource", "res-double-del", 1),
    ).toBe(true);

    // Active storage is clean
    expect(
      await ResourceRepository.getResource("res-double-del", WS),
    ).toBeNull();
  });

  it("F: permanentlyDeleteResource cleans graph relationship edges connected to the resource", async () => {
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

    // Create relationship edge between task and resource
    const rel: Relationship = {
      id: "rel-task-res-1",
      source: { id: "task-linked", type: "task" },
      target: { id: "res-with-edges", type: "resource" },
      relationType: "related",
      createdAt: Date.now(),
    };
    await GraphRepository.saveRelationship(rel);

    // Verify relationship exists
    const beforeRelated = await GraphRepository.getRelated("task-linked");
    expect(beforeRelated.some((r) => r.id === "rel-task-res-1")).toBe(true);

    // Permanently delete resource
    await EntityCommandService.permanentlyDeleteResource("res-with-edges", WS, {
      source: "test",
    });

    // Relationship edge must be pruned from GraphRepository
    const afterRelatedTask = await GraphRepository.getRelated("task-linked");
    expect(afterRelatedTask.some((r) => r.id === "rel-task-res-1")).toBe(false);

    const afterRelatedResource = await GraphRepository.getRelated(
      "res-with-edges",
    );
    expect(afterRelatedResource).toHaveLength(0);
  });

  it("G: permanentlyDeleteResource interacts safely with dangling resourceIds and GraphReconcilerService", async () => {
    await ResourceRepository.saveResourceUnlocked(makeResource("res-dangling-test"));

    // Task references this resource via resourceIds
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

    // Permanently delete the resource
    await EntityCommandService.permanentlyDeleteResource(
      "res-dangling-test",
      WS,
      { source: "test" },
    );

    // Run GraphReconcilerService (simulating startup or scheduled reconciliation)
    const report = await GraphReconcilerService.reconcileAll();
    expect(report.cleanedResourceIds).toBeGreaterThanOrEqual(1);

    // Task must have dangling resourceId pruned while strictly preserving revision, updatedAt, lifecycleGeneration
    const updatedTask = await TaskRepository.getTask("task-with-res-id", WS);
    expect(updatedTask).not.toBeNull();
    expect(updatedTask!.resourceIds).toBeUndefined();
    expect(updatedTask!.revision).toBe(saved.revision);
    expect(updatedTask!.updatedAt).toBe(saved.updatedAt);
    expect(updatedTask!.lifecycleGeneration).toBe(saved.lifecycleGeneration);
  });

  it("H: generation increment allows recreation after permanent deletion without tombstone collision", async () => {
    await ResourceRepository.saveResourceUnlocked(makeResource("res-gen-test"));

    // Permanently delete generation 1
    await EntityCommandService.permanentlyDeleteResource("res-gen-test", WS, {
      source: "test",
    });

    expect(
      await TombstoneRepository.isTombstoned("resource", "res-gen-test", 1),
    ).toBe(true);

    // Recreate entity with the same explicit ID
    const recreated = await EntityCommandService.createResource(
      {
        id: "res-gen-test",
        workspaceId: WS,
        title: "Reborn Resource",
        type: "note",
        content: "New content",
      } as any,
      WS,
      { explicitId: "res-gen-test" },
    );

    // Allocated generation must be highestTombstone + 1 = 2
    expect(recreated.lifecycleGeneration).toBe(2);

    // Generation 2 is NOT tombstoned
    expect(
      await TombstoneRepository.isTombstoned("resource", "res-gen-test", 2),
    ).toBe(false);

    // Active storage holds the generation 2 resource
    const stored = await ResourceRepository.getResource("res-gen-test", WS);
    expect(stored).not.toBeNull();
    expect(stored!.lifecycleGeneration).toBe(2);
    expect(stored!.title).toBe("Reborn Resource");
  });

  it("I: concurrent createRelationship vs permanentlyDeleteResource safely resolves without dangling active edges", async () => {
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

    // Concurrently create relationship and permanently delete resource
    await Promise.allSettled([
      EntityCommandService.createRelationship({
        source: { id: "task-rel-race", type: "task" },
        target: { id: "res-rel-race", type: "resource" },
        relationType: "related",
      }),
      EntityCommandService.permanentlyDeleteResource("res-rel-race", WS, {
        source: "test",
      }),
    ]);

    // Resource must be permanently deleted and tombstoned
    const active = await ResourceRepository.getResource("res-rel-race", WS);
    expect(active).toBeNull();
    expect(
      await TombstoneRepository.isTombstoned("resource", "res-rel-race", 1),
    ).toBe(true);

    // If an edge survived due to createRelationship completing after delete's graph prune,
    // GraphReconcilerService must self-heal and prune it definitively.
    await GraphReconcilerService.reconcileAll();

    const related = await GraphRepository.getRelated("res-rel-race");
    expect(related).toHaveLength(0);
    const relatedTask = await GraphRepository.getRelated("task-rel-race");
    expect(relatedTask.some((r) => r.target.id === "res-rel-race" || r.source.id === "res-rel-race")).toBe(false);
  });
});
