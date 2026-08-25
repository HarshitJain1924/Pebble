import { ResourceCommandHandler } from "../ResourceCommandHandler";
import { ResourceRepository, WorkspaceRepository } from "@/repositories";
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

describe("ResourceCommandHandler Hostile Verification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.clear();
  });

  test("VULNERABILITY FIX: restoreResource uses the correct snapshot data when recycle bin item changes concurrently", async () => {
    // 1. Initial State: The item is in the recycle bin with "Old Title"
    const oldSnapshot = {
      id: "res-1",
      workspaceId: "ws-1",
      title: "Old Title",
      content: "",
      tags: [],
      createdAt: 1000,
      updatedAt: 1000
    };
    
    mockStore.set("pebble:v1:recycle_bin", JSON.stringify([{
      id: "rb-res-1",
      entityType: "resource",
      entityId: "res-1",
      snapshot: JSON.stringify(oldSnapshot),
      deletedAt: 1000
    }]));
    
    const originalWithLock = jest.requireActual("@/shared/utils/mutex").withLock;
    let concurrentMutationDone = false;
    
    jest.spyOn(require("@/shared/utils/mutex"), "withLock").mockImplementation(async (key: any, fn: any) => {
      if (key === "pebble:v1:resources:ws-1" && !concurrentMutationDone) {
        concurrentMutationDone = true;
        // Simulating: Another thread restores it, modifies it to "New Title", and recycles it again!
        const newSnapshot = {
          ...oldSnapshot,
          title: "New Title",
          updatedAt: 2000
        };
        mockStore.set("pebble:v1:recycle_bin", JSON.stringify([{
          id: "rb-res-1",
          entityType: "resource",
          entityId: "res-1",
          snapshot: JSON.stringify(newSnapshot),
          deletedAt: 2000
        }]));
      }
      return fn();
    });

    // 2. Perform the restore
    const result = await ResourceCommandHandler.restoreResource("rb-res-1", { skipEvents: true, skipAnalytics: true });

    // 3. The result of the restore should be the new data, not the old data!
    expect(result.title).toBe("New Title");
    
    // And in the store, the resource should have the new title
    const resources = JSON.parse(mockStore.get("pebble:v1:resources:ws-1") || "{}");
    expect(resources["res-1"].title).toBe("New Title");
  });

  test("VULNERABILITY FIX: restoreResource throws if the concurrent recycle bin update changed the workspace", async () => {
    // 1. Initial State: The item is in the recycle bin with workspace "ws-1"
    const oldSnapshot = {
      id: "res-1",
      workspaceId: "ws-1",
      title: "Title",
      content: "",
      tags: [],
      createdAt: 1000,
      updatedAt: 1000
    };
    
    mockStore.set("pebble:v1:recycle_bin", JSON.stringify([{
      id: "rb-res-1",
      entityType: "resource",
      entityId: "res-1",
      snapshot: JSON.stringify(oldSnapshot),
      deletedAt: 1000
    }]));
    
    const originalWithLock = jest.requireActual("@/shared/utils/mutex").withLock;
    let concurrentMutationDone = false;
    
    jest.spyOn(require("@/shared/utils/mutex"), "withLock").mockImplementation(async (key: any, fn: any) => {
      if (key === "pebble:v1:resources:ws-1" && !concurrentMutationDone) {
        concurrentMutationDone = true;
        // Simulating: Another thread restores it, MOVES it to "ws-2", and recycles it again!
        const newSnapshot = {
          ...oldSnapshot,
          workspaceId: "ws-2",
          updatedAt: 2000
        };
        mockStore.set("pebble:v1:recycle_bin", JSON.stringify([{
          id: "rb-res-1",
          entityType: "resource",
          entityId: "res-1",
          snapshot: JSON.stringify(newSnapshot),
          deletedAt: 2000
        }]));
      }
      return fn();
    });

    // 2. Perform the restore, it should throw because we only locked ws-1 but the item now belongs to ws-2
    await expect(ResourceCommandHandler.restoreResource("rb-res-1", { skipEvents: true, skipAnalytics: true }))
      .rejects.toThrow(/Concurrent modification/);
  });
});
