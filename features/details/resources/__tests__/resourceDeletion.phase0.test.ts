import { ResourceRepository, RecycleBinRepository } from "@/repositories";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

describe("Batch 7: Resource Deletion Safety Fix", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("Resource Detail Deletion - recycleResource correctly moves to Recycle Bin", async () => {
    const resource = { id: "res-1", title: "Test", type: "note", workspaceId: "ws-1" };
    await ResourceRepository.saveResource(resource);

    let active = await ResourceRepository.getResources("ws-1");
    expect(active["res-1"]).toBeDefined();

    // 1. Delete (Simulating the call from ResourceDetailContent)
    await EntityCommandService.recycleResource("res-1", "ws-1", { skipEvents: true });

    // 2. Verify removed from active
    active = await ResourceRepository.getResources("ws-1");
    expect(active["res-1"]).toBeUndefined();

    // 3. Verify in Recycle Bin
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    expect(binItems.length).toBe(1);
    expect(binItems[0].entityType).toBe("resource");
    expect(binItems[0].entityId).toBe("res-1");
  });

  it("Recycle Bin Restore - can restore deleted resource", async () => {
    // 1. Setup in bin
    const resource = { id: "res-1", title: "Test", type: "note", workspaceId: "ws-1" };
    await RecycleBinRepository.addToRecycleBin("resource", resource, "ws-1");
    
    // 2. Restore
    const items = await RecycleBinRepository.getRecycleBinItems();
    const itemToRestore = items[0];
    
    await EntityCommandService.restoreResource(itemToRestore.id, { skipEvents: true });
    
    // 3. Verify bin empty
    const restoredItems = await RecycleBinRepository.getRecycleBinItems();
    expect(restoredItems.length).toBe(0);
    
    // 4. Verify in active
    const active = await ResourceRepository.getResources("ws-1");
    expect(active["res-1"]).toBeDefined();
    expect(active["res-1"].title).toBe("Test");
    expect(active["res-1"].type).toBe("note");
    expect(active["res-1"].workspaceId).toBe("ws-1");
  });

  it("Permanent Delete - remains explicit Recycle Bin action", async () => {
    const resource = { id: "res-1", title: "Test", type: "note", workspaceId: "ws-1" };
    await RecycleBinRepository.addToRecycleBin("resource", resource, "ws-1");
    
    let items = await RecycleBinRepository.getRecycleBinItems();
    expect(items.length).toBe(1);
    
    // Simulate Recycle Bin Permanent Delete
    const remaining = items.filter((i) => i.id !== items[0].id);
    await RecycleBinRepository.saveRecycleBinItems(remaining);
    
    items = await RecycleBinRepository.getRecycleBinItems();
    expect(items.length).toBe(0);
    
    // Ensure still not in active
    const active = await ResourceRepository.getResources("ws-1");
    expect(active["res-1"]).toBeUndefined();
  });
});
