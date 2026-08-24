import { RecycleBinRepository } from "@/repositories/RecycleBinRepository";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { withLocks } from "@/shared/utils/mutex";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

describe("Recycle Bin RMW Concurrency Vulnerability", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(async () => {
    await AsyncStorage.clear();
  });

  it("should safely handle concurrent reads and writes to the recycle bin", async () => {
    // 1. Initial State: Bin has item A
    await RecycleBinRepository.saveRecycleBinItems([
      {
        id: "rb-A",
        entityId: "A",
        entityType: "task",
        snapshot: "{}",
        deletedAt: Date.now(),
      },
    ]);

    // 2. We want to test two concurrent operations:
    // Op 1: remove item A
    // Op 2: add item B
    // They both read and write the recycle bin.
    
    // Simulate concurrency by firing them without awaiting immediately
    const op1 = RecycleBinRepository.removeRecycleBinItems(["rb-A"]);
    const op2 = RecycleBinRepository.addToRecycleBin("task", { id: "B" }, "Inbox");

    await Promise.all([op1, op2]);

    // 3. Verify
    const finalBin = await RecycleBinRepository.getRecycleBinItems();
    
    // B must be added, A must be removed.
    expect(finalBin.find(i => i.entityId === "A")).toBeUndefined();
    expect(finalBin.find(i => i.entityId === "B")).toBeDefined();
    expect(finalBin.length).toBe(1);
  });

  it("should safely handle concurrent additions", async () => {
    const op1 = RecycleBinRepository.addToRecycleBin("task", { id: "X" }, "Inbox");
    const op2 = RecycleBinRepository.addToRecycleBin("task", { id: "Y" }, "Inbox");
    const op3 = RecycleBinRepository.addToRecycleBin("task", { id: "Z" }, "Inbox");

    await Promise.all([op1, op2, op3]);

    const finalBin = await RecycleBinRepository.getRecycleBinItems();
    expect(finalBin.length).toBe(3);
  });

  it("should enforce fail-closed storage semantics", async () => {
    // We mock the unlocked primitive to fail. The locked wrapper should throw.
    const spy = jest.spyOn(RecycleBinRepository, "saveRecycleBinItemsUnlocked").mockRejectedValueOnce(new Error("Disk full"));

    await expect(
      RecycleBinRepository.addToRecycleBin("task", { id: "F" }, "Inbox", { throwOnError: true })
    ).rejects.toThrow("Disk full");

    spy.mockRestore();
  });
});
