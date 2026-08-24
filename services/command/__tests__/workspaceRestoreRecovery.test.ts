import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { RecycleBinRepository } from "@/repositories/RecycleBinRepository";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

describe("Workspace Restore - Recycle Bin RMW Data Loss Vulnerability", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("proves that restoreWorkspace overwrites concurrent recycle bin additions", async () => {
    // 1. Setup a workspace in the recycle bin
    const wsId = "ws-vuln-1";
    await RecycleBinRepository.addToRecycleBin(
      "workspace",
      {
        list: { id: wsId, name: "Vuln WS", createdAt: 1, updatedAt: 1 },
        todos: [],
        habits: [],
        checklists: [],
        resources: [],
      },
      "Workspaces",
      { throwOnError: true }
    );

    const initialBin = await RecycleBinRepository.getRecycleBinItems();
    expect(initialBin.length).toBe(1);
    const binId = initialBin[0].id;

    // 2. We will intercept the moment AFTER restoreWorkspace reads the bin items,
    // but BEFORE it writes them back. We do this by mocking `withLocks`, since 
    // `restoreWorkspace` calls `withLocks` right after fetching the bin items.
    const mutex = require("@/shared/utils/mutex");
    const originalWithLocks = mutex.withLocks;

    let resolvePause: () => void;
    const pausePromise = new Promise<void>((r) => { resolvePause = r; });

    let hasIntercepted = false;
    jest.spyOn(mutex, 'withLocks').mockImplementationOnce(async (locks: any, fn: any) => {
      hasIntercepted = true;
      // Wait for the concurrent operation to finish
      await pausePromise;
      return originalWithLocks(locks, fn);
    });

    // 3. Start the restore operation. It will read the bin, then block at withLocks.
    const restorePromise = EntityCommandService.restoreWorkspace(binId, { skipEvents: true });

    // Wait for it to reach the interception point
    await new Promise(r => setTimeout(r, 50));
    expect(hasIntercepted).toBe(true);

    // 4. Concurrently, something else adds to the recycle bin (e.g. deleting a task)
    await RecycleBinRepository.addToRecycleBin(
      "task",
      { id: "t-deleted", title: "Deleted Task" },
      wsId,
      { throwOnError: true }
    );

    // Verify the task is actually in the bin now
    const intermediateBin = await RecycleBinRepository.getRecycleBinItems();
    expect(intermediateBin.length).toBe(2); // The workspace AND the new task

    // 5. Unpause the restore operation and let it finish
    resolvePause!();
    await restorePromise;

    // 6. Check the recycle bin again
    const finalBin = await RecycleBinRepository.getRecycleBinItems();
    
    // VERIFIED: finalBin is length 1 because the restored workspace was safely 
    // removed via removeRecycleBinItems(), leaving the concurrently deleted task intact.
    expect(finalBin.length).toBe(1);
    expect(finalBin[0].entityId).toBe("t-deleted");
  });
});
