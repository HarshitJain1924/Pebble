import { WorkspaceCommandHandler } from "@/services/command/handlers/WorkspaceCommandHandler";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { TaskRepository } from "@/repositories/TaskRepository";
import { RecycleBinRepository } from "@/repositories/RecycleBinRepository";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { INBOX_WORKSPACE_ID, MY_PEBBLES_WORKSPACE_ID } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

describe("Workspace Deletion Hostile Verification", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();

    // Setup initial state
    await WorkspaceRepository.saveWorkspace({ id: INBOX_WORKSPACE_ID, name: "Inbox", createdAt: 1, updatedAt: 1, type: "list" });
    await WorkspaceRepository.saveWorkspace({ id: MY_PEBBLES_WORKSPACE_ID, name: "My Pebbles", createdAt: 1, updatedAt: 1, type: "list" });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.clear();
  });

  describe("Test D - metadata deletion failure (The Silently Destructive Bug)", () => {
    it("should prove that a metadata save failure causes subsequent retry to destroy the recycle bin backup", async () => {
      // 1. Setup a workspace with one task
      await WorkspaceRepository.saveWorkspace({
        id: "ws-target",
        name: "Target",
        createdAt: 1,
        updatedAt: 1,
        type: "list",
      });
      await TaskRepository.saveTasksUnlocked([
        { id: "task-1", title: "Crucial Data", createdAt: 1, updatedAt: 1, completed: false, listId: "ws-target", kind: "todo", revision: 1 }
      ], "ws-target");

      // 2. Inject failure into Workspace metadata deletion (Step 5)
      jest.spyOn(WorkspaceRepository, "deleteWorkspace").mockRejectedValueOnce(new Error("Simulated Metadata Deletion Failure"));

      // 3. Execute deleteWorkspace - it will fail after deleting partitions
      await expect(WorkspaceCommandHandler.deleteWorkspace("ws-target"))
        .rejects.toThrow("Simulated Metadata Deletion Failure");

      // Verify intermediate state: Workspace exists, AND partitions remain intact!
      const workspaces = await WorkspaceRepository.getWorkspaces();
      expect(workspaces.some(w => w.id === "ws-target")).toBe(true);
      
      const tasksMap = await TaskRepository.getTasks("ws-target");
      expect(Object.keys(tasksMap).length).toBe(1); // Partition is protected!

      // Verify the recycle bin currently holds the safe backup
      let binItems = await RecycleBinRepository.getRecycleBinItems();
      expect(binItems.length).toBe(1);
      const firstSnapshot = JSON.parse(binItems[0].snapshot);
      expect(firstSnapshot.todos.length).toBe(1);
      expect(firstSnapshot.todos[0].id).toBe("task-1"); // Crucial Data is safe!

      // 4. User sees the workspace still exists and clicks "Delete" again.
      // This time, it succeeds.
      await WorkspaceCommandHandler.deleteWorkspace("ws-target");

      // 5. User realizes they made a mistake and goes to restore from Recycle Bin
      binItems = await RecycleBinRepository.getRecycleBinItems();
      expect(binItems.length).toBe(1); // Still 1 item because it overwrites by entityId
      
      const secondSnapshot = JSON.parse(binItems[0].snapshot);
      
      // THE FIX PROVEN: The retry overwrote the safe backup with ANOTHER FULL backup.
      // We assert the bug is fixed by checking if todos length is 1.
      expect(secondSnapshot.todos.length).toBe(1); 
      // DATA IS PRESERVED!
    });
  });
});
