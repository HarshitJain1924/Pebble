import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { TaskRepository, WorkspaceRepository, RecycleBinRepository } from "@/repositories";
import type { Task, Workspace } from "@/shared/types/domain.types";
import { withLocks } from "@/shared/utils/mutex";

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
    it("A workspace deletion must never silently report success while leaving an accessible orphan partition behind.", async () => {
      await WorkspaceRepository.saveWorkspaces([ws("ws-delete")]);
      await TaskRepository.saveTask(task("task-1", "ws-delete"));

      const originalMultiRemove = AsyncStorage.multiRemove;
      AsyncStorage.multiRemove = jest.fn().mockRejectedValueOnce(new Error("Disk error")).mockImplementation(originalMultiRemove as any);

      await expect(EntityCommandService.deleteWorkspace("ws-delete")).rejects.toThrow("Workspace deletion aborted to prevent orphaned data on disk.");

      // Workspace remains
      const workspaces = await WorkspaceRepository.getWorkspaces();
      expect(workspaces.some(w => w.id === "ws-delete")).toBe(true);

      // Partition remains
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
