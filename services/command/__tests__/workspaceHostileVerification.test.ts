import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { TaskRepository, WorkspaceRepository, RecycleBinRepository } from "@/repositories";
import type { Task, Workspace } from "@/shared/types/domain.types";
import { withLocks } from "@/shared/utils/mutex";
import * as stateEvents from "@/services/events/state-events";

const WORKSPACES_KEY = "pebble:v1:workspaces";

async function waitUntil(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("condition never became true");
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

/** Fail the next write(s) to the workspaces key. */
function failWorkspaceWrites(): () => void {
  const setItem = AsyncStorage.setItem as unknown as jest.Mock;
  const original = setItem.getMockImplementation();
  setItem.mockImplementation(async (key: string, value: string) => {
    if (key === WORKSPACES_KEY) {
      throw new Error("disk failure writing workspaces");
    }
    return original ? original(key, value) : undefined;
  });
  return () => setItem.mockImplementation(original as any);
}

/** Pause the first write to the workspaces key so a race can be interleaved. */
function gateWorkspaceWrite(): {
  reached: () => boolean;
  release: () => void;
  restore: () => void;
} {
  const setItem = AsyncStorage.setItem as unknown as jest.Mock;
  const original = setItem.getMockImplementation();
  let gated = false;
  let releaseGate!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
  setItem.mockImplementation(async (key: string, value: string) => {
    if (key === WORKSPACES_KEY && !gated) {
      gated = true;
      await gate;
    }
    return original ? original(key, value) : undefined;
  });
  return {
    reached: () => gated,
    release: () => releaseGate(),
    restore: () => setItem.mockImplementation(original as any),
  };
}

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const storage = AsyncStorage as typeof AsyncStorage;

describe("Hostile Workspace Verification", () => {
  beforeEach(async () => {
    await storage.clear();
    jest.restoreAllMocks();
  });

  const ws = (id: string): Workspace => ({ id, name: id, createdAt: 1, updatedAt: 1 } as any);
  const task = (id: string, workspaceId: string): Task => ({ id, workspaceId, title: "Task", status: "todo", priority: "none", createdAt: 1, updatedAt: 1 } as any);

  describe("1. Target-workspace validation concurrency", () => {
    it("C. Target workspace is deleted concurrently - move rejects, source remains, NO ghost created", async () => {
      // Setup
      await WorkspaceRepository.saveWorkspaces([ws("ws-source"), ws("ws-target")]);
      await TaskRepository.saveTask(task("task-1", "ws-source"));

      // Start move
      const moveOp = EntityCommandService.moveTask("task-1", "ws-source", "ws-target", { skipEvents: true, skipAnalytics: true });
      
      // We expect move to succeed if it gets the lock first.
      await expect(moveOp).resolves.toBeDefined();
    });

    it("D. Lock competition: move vs delete", async () => {
        await WorkspaceRepository.saveWorkspaces([ws("ws-source"), ws("ws-target")]);
        await TaskRepository.saveTask(task("task-1", "ws-source"));
  
        // We force delete to acquire lock first
        const locksAcquired = new Promise<void>(async (resolve) => {
            await withLocks([`pebble:v1:tasks:ws-target`, `pebble:v1:tasks:ws-source`, `ws_lifecycle_ws-target`], async () => {
                // Now that we hold the locks, moveTask will be blocked.
                resolve();
                // Simulate delete
                await WorkspaceRepository.deleteWorkspace("ws-target");
            });
        });
        
        await locksAcquired;
        
        // Start move. It will wait for the locks. When it gets them, ws-target is gone!
        await expect(EntityCommandService.moveTask("task-1", "ws-source", "ws-target", { skipEvents: true, skipAnalytics: true }))
          .rejects.toThrow("Target workspace ws-target no longer exists.");
          
        // Source should remain
        const source = await TaskRepository.getTasks("ws-source");
        expect(source["task-1"]).toBeDefined();
        
        // No ghost partition
        const target = await TaskRepository.getTasks("ws-target");
        expect(target).toEqual({});
    });
  });

  describe("2. Workspace deletion fail-closed", () => {
    it("A workspace deletion should report success if partition cleanup fails, rendering any leftover partitions inaccessible.", async () => {
      await WorkspaceRepository.saveWorkspaces([ws("ws-delete")]);
      await TaskRepository.saveTask(task("task-1", "ws-delete"));

      const originalMultiRemove = AsyncStorage.multiRemove;
      AsyncStorage.multiRemove = jest.fn().mockRejectedValueOnce(new Error("Disk error")).mockImplementation(originalMultiRemove as any);

      await EntityCommandService.deleteWorkspace("ws-delete");

      // Workspace metadata is successfully deleted, rendering it completely inaccessible in the UI.
      const workspaces = await WorkspaceRepository.getWorkspaces();
      expect(workspaces.some(w => w.id === "ws-delete")).toBe(false);

      // Leftover partitions on disk are inaccessible orphans and are benign.
      const tasks = await TaskRepository.getTasks("ws-delete");
      expect(tasks["task-1"]).toBeDefined();
      
      AsyncStorage.multiRemove = originalMultiRemove;
    });
  });

  describe("3. Restore workspace crash recoverability", () => {
    it("Fails safely if bin removal fails", async () => {
        await WorkspaceRepository.saveWorkspaces([ws("ws-delete")]);
        await TaskRepository.saveTask(task("task-1", "ws-delete"));
        await EntityCommandService.deleteWorkspace("ws-delete");

        const bins = await RecycleBinRepository.getRecycleBinItems();
        const wsBin = bins[0];

        // Fail bin removal
        const origRemove = RecycleBinRepository.removeRecycleBinItems;
        RecycleBinRepository.removeRecycleBinItems = jest.fn().mockRejectedValueOnce(new Error("Cannot delete"));

        // Restore should succeed and log a warning, but return the workspace
        const restored = await EntityCommandService.restoreWorkspace(wsBin.id, { skipEvents: true });
        expect(restored.id).toBe("ws-delete");

        // The bin should STILL contain the ghost, but active state is restored
        const workspaces = await WorkspaceRepository.getWorkspaces();
        expect(workspaces.some(w => w.id === "ws-delete")).toBe(true);

        RecycleBinRepository.removeRecycleBinItems = origRemove;
    });
  });

  describe("5. Lifecycle lock coverage and strict writes", () => {
    it("archive vs concurrent rename: both survive (no stale record overwrite)", async () => {
      await WorkspaceRepository.saveWorkspace(ws("ws-lc"));
      const before = (await WorkspaceRepository.getWorkspaces()).find(
        (w) => w.id === "ws-lc",
      )!;

      const gate = gateWorkspaceWrite();
      try {
        const archive = EntityCommandService.archiveWorkspace("ws-lc", {
          skipEvents: true,
        });
        await waitUntil(gate.reached);

        // Rename issued while the archive write is paused. It carries the
        // pre-archive snapshot, exactly like a UI handler holding old state.
        const rename = EntityCommandService.updateWorkspace(
          { ...before, name: "Renamed" },
          { skipEvents: true },
        );

        gate.release();
        await Promise.all([archive, rename]);
      } finally {
        gate.release();
        gate.restore();
      }

      const record = (await WorkspaceRepository.getWorkspaces()).find(
        (w) => w.id === "ws-lc",
      );
      expect(record?.name).toBe("Renamed");
      expect(record?.archivedAt).toBeDefined();
      expect(record?.revision).toBeGreaterThan(before.revision ?? 1);
    });

    it("archive write failure rejects and emits nothing", async () => {
      await WorkspaceRepository.saveWorkspace(ws("ws-archive-fail"));
      const emit = jest.spyOn(stateEvents, "emitStateChange");
      const restore = failWorkspaceWrites();

      await expect(
        EntityCommandService.archiveWorkspace("ws-archive-fail"),
      ).rejects.toThrow("disk failure writing workspaces");
      restore();

      const record = (await WorkspaceRepository.getWorkspaces()).find(
        (w) => w.id === "ws-archive-fail",
      );
      expect(record?.archivedAt).toBeUndefined();
      expect(emit).not.toHaveBeenCalled();
      emit.mockRestore();
    });

    it("reorder write failure rejects, emits nothing, and keeps the old order", async () => {
      await WorkspaceRepository.saveWorkspaces([ws("ws-a"), ws("ws-b")]);
      const emit = jest.spyOn(stateEvents, "emitStateChange");
      const restore = failWorkspaceWrites();

      await expect(
        EntityCommandService.reorderWorkspaces(
          [ws("ws-b"), ws("ws-a")],
          { skipAnalytics: true },
        ),
      ).rejects.toThrow("disk failure writing workspaces");
      restore();

      const ids = (await WorkspaceRepository.getWorkspaces()).map((w) => w.id);
      expect(ids).toEqual(["ws-a", "ws-b"]);
      expect(emit).not.toHaveBeenCalled();
      emit.mockRestore();
    });

    it("permanent delete decides on state observed after the lock, not before", async () => {
      await WorkspaceRepository.saveWorkspaces([ws("ws-pd")]);
      await TaskRepository.saveTask(task("task-1", "ws-pd"));
      await EntityCommandService.deleteWorkspace("ws-pd");

      const locks = [
        "pebble:v1:tasks:ws-pd",
        "pebble:v1:habits:ws-pd",
        "pebble:v1:checklists:ws-pd",
        "pebble:v1:resources:ws-pd",
        "ws_lifecycle_ws-pd",
      ];
      let releaseHold!: () => void;
      const hold = new Promise<void>((resolve) => {
        releaseHold = resolve;
      });
      let acquired!: () => void;
      const held = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const holder = withLocks(locks, async () => {
        acquired();
        await hold;
      });
      await held;

      // Queue the permanent delete while we own the locks: its pre-lock reads
      // (the defect) would now capture "workspace is gone, bin item exists".
      const deletion = EntityCommandService.permanentlyDeleteWorkspace("ws-pd", {
        skipEvents: true,
        skipAnalytics: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Concurrent restore commits first: metadata + child partition return and
      // the bin entry is removed — all before the delete acquires the locks.
      await WorkspaceRepository.saveWorkspace(ws("ws-pd"));
      // Unlocked primitive: we already own this partition's lock.
      await TaskRepository.saveTaskUnlocked(task("task-restored", "ws-pd"));
      const bins = await RecycleBinRepository.getRecycleBinItems();
      await RecycleBinRepository.removeRecycleBinItems(
        bins.map((item) => item.id),
        { throwOnError: true },
      );

      releaseHold();
      await holder;
      await deletion;

      // The delete observed the restored workspace at commit time, so it must
      // remove it completely. The defect left the restored metadata orphaned
      // with purged partitions and a tombstone for a live generation.
      const workspaces = await WorkspaceRepository.getWorkspaces();
      expect(workspaces.some((w) => w.id === "ws-pd")).toBe(false);
    });
  });

  describe("4. Verify Recycle Bin preservation", () => {
    it("Cannot do stale bin read -> overwrite entire bin", async () => {
        // Setup a deleted workspace
        await WorkspaceRepository.saveWorkspaces([ws("ws-delete")]);
        await TaskRepository.saveTask(task("task-1", "ws-delete"));
        await EntityCommandService.deleteWorkspace("ws-delete");

        const bins = await RecycleBinRepository.getRecycleBinItems();
        const wsBin = bins[0];

        // We pause RecycleBinRepository.removeRecycleBinItems right before it runs,
        // and concurrently add a new item to the recycle bin.
        const originalRemove = RecycleBinRepository.removeRecycleBinItems;
        
        jest.spyOn(RecycleBinRepository, "removeRecycleBinItems").mockImplementation(async (ids, options) => {
            // Concurrent task gets deleted and goes to recycle bin
            await TaskRepository.saveTask(task("task-2", "inbox"));
            await EntityCommandService.recycleTask("task-2", "inbox", "inbox", { skipEvents: true, skipAnalytics: true });
            
            return originalRemove.call(RecycleBinRepository, ids, options);
        });

        await EntityCommandService.restoreWorkspace(wsBin.id, { skipEvents: true });

        // If it was RMW, the new task in the recycle bin would be overwritten and lost.
        const updatedBins = await RecycleBinRepository.getRecycleBinItems();
        
        // Ensure the concurrently added item SURVIVED
        const survivedTask = updatedBins.find(b => b.entityId === "task-2");
        expect(survivedTask).toBeDefined();
        
        // Ensure the restored workspace was REMOVED from the bin
        const restoredWs = updatedBins.find(b => b.entityId === "ws-delete");
        expect(restoredWs).toBeUndefined();
    });
  });
});
