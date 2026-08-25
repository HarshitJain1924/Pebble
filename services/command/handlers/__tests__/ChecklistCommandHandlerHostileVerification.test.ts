import { ChecklistCommandHandler } from "../ChecklistCommandHandler";
import { ChecklistRepository, WorkspaceRepository } from "@/repositories";
import { RecycleBinRepository } from "@/repositories/RecycleBinRepository";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MoveJournalRepository } from "@/repositories/MoveJournalRepository";
import { withLock } from "@/shared/utils/mutex";

const mockStore = new Map<string, string>();

jest.mock("@react-native-async-storage/async-storage", () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
  removeItem: jest.fn(),
  multiRemove: jest.fn(),
  getAllKeys: jest.fn(),
  clear: jest.fn(),
}));

(AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
  return mockStore.get(key) || null;
});
(AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
  mockStore.set(key, value);
});
(AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => {
  mockStore.delete(key);
});
(AsyncStorage.multiGet as jest.Mock).mockImplementation(async (keys: string[]) => {
  return keys.map((key) => [key, mockStore.get(key) || null]);
});

jest.mock("@/services/events/state-events", () => ({
  emitStateChange: jest.fn(),
}));

jest.mock("@/services/analytics/productivity-history.service", () => ({
  recordDailyHistorySnapshot: jest.fn().mockResolvedValue(undefined),
}));

describe("ChecklistCommandHandler Hostile Verification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.clear();
  });

  test("VULNERABILITY: restoreChecklist restores stale data if recycle bin item changed concurrently", async () => {
    // 1. Initial State: The item is in the recycle bin with "Old Title"
    const oldSnapshot = {
      id: "check-1",
      workspaceId: "ws-1",
      title: "Old Title",
      items: [],
      createdAt: 1000,
      updatedAt: 1000
    };
    
    mockStore.set("pebble:v1:recycle_bin", JSON.stringify([{
      id: "rb-check-1",
      entityType: "checklist",
      entityId: "check-1",
      snapshot: JSON.stringify(oldSnapshot),
      deletedAt: 1000
    }]));
    
    // We mock `withLock` to simulate a concurrent mutation of the recycle bin
    // exactly AFTER the unlocked read but BEFORE the locked read executes.
    const originalWithLock = jest.requireActual("@/shared/utils/mutex").withLock;
    let concurrentMutationDone = false;
    
    jest.spyOn(require("@/shared/utils/mutex"), "withLock").mockImplementation(async (key: any, fn: any) => {
      if (key === "pebble:v1:checklists:ws-1" && !concurrentMutationDone) {
        concurrentMutationDone = true;
        // Simulating: Another thread restores it, modifies it to "New Title", and recycles it again!
        const newSnapshot = {
          ...oldSnapshot,
          title: "New Title",
          updatedAt: 2000
        };
        mockStore.set("pebble:v1:recycle_bin", JSON.stringify([{
          id: "rb-check-1",
          entityType: "checklist",
          entityId: "check-1",
          snapshot: JSON.stringify(newSnapshot),
          deletedAt: 2000
        }]));
      }
      return fn();
    });

    // 2. Perform the restore
    const result = await ChecklistCommandHandler.restoreChecklist("rb-check-1", { skipEvents: true, skipAnalytics: true });

    // 3. The result of the restore should be the new data, not the old data!
    // Currently, it uses parsedData from the unlocked read, so it will return "Old Title".
    // This asserts the VULNERABILITY! We expect it to FAIL this assertion once the bug is fixed.
    // Wait, let's write the assertion as what SHOULD happen to make it a failing test if the bug is present.
    expect(result.title).toBe("New Title");
    
    // And in the store, the checklist should have the new title
    const checklists = JSON.parse(mockStore.get("pebble:v1:checklists:ws-1") || "{}");
    expect(checklists["check-1"].title).toBe("New Title");
  });
});
