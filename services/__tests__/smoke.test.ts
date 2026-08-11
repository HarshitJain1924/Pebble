import { EntityCommandService } from "../../services/command/EntityCommandService";
import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);


describe("Phase 11: Fresh-Install Production Smoke Test", () => {
  beforeAll(async () => {
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should start from genuinely empty storage", async () => {
    const keys = await AsyncStorage.getAllKeys();
    expect(keys).toHaveLength(0);
  });

  it("should complete the fresh-user flow", async () => {
    const wsId = "ws-smoke";
    await EntityCommandService.createWorkspace({ id: wsId, name: "Personal", createdAt: Date.now(), updatedAt: Date.now() });

    // 5. Create task
    const task = await EntityCommandService.createTask({
      id: "task-smoke",
      title: "Buy groceries",
      notes: "Milk, eggs, bread",
      type: "task"
    } as any, wsId);
    expect(task.id).toBeDefined();

    // 6. Edit task
    const updatedTask = await EntityCommandService.updateTask(task.id, wsId, {
      title: "Buy groceries and snacks",
    });
    expect(updatedTask.title).toBe("Buy groceries and snacks");

    const completedTaskRes = await EntityCommandService.completeTask(task.id, wsId);
    expect(completedTaskRes?.updated.status).toBe("completed");

    const archivedTask = await EntityCommandService.updateTask(task.id, wsId, { archivedAt: Date.now() });
    expect(archivedTask.archivedAt).toBeDefined();

    const restoredTask = await EntityCommandService.updateTask(task.id, wsId, { archivedAt: undefined });
    expect(restoredTask.archivedAt).toBeUndefined();

    await EntityCommandService.recycleTask(task.id, wsId, "Smoke");

    const recycleBinRaw = await AsyncStorage.getItem("pebble:v1:recycle_bin");
    const binItems = JSON.parse(recycleBinRaw || "[]");
    const recycledItem = binItems.find((i: any) => i.entityId === task.id);
    expect(recycledItem).toBeDefined();

    await EntityCommandService.restoreTask(recycledItem.id);
    const recycleBinRawAfter = await AsyncStorage.getItem("pebble:v1:recycle_bin");
    expect(recycleBinRawAfter).not.toContain(recycledItem.id);

    const habit = await EntityCommandService.createHabit({
      id: "habit-smoke",
      title: "Drink water",
      frequency: "daily",
      type: "habit"
    } as any, wsId);
    expect(habit.id).toBeDefined();

    const completedHabitRes = await EntityCommandService.completeHabit(habit.id, wsId, { source: new Date().toISOString().split("T")[0] });
    expect(completedHabitRes?.updated.completionHistory).toHaveLength(1);

    const checklist = await EntityCommandService.createChecklist({
      id: "checklist-smoke",
      title: "Morning Routine",
      type: "checklist"
    } as any, wsId);
    expect(checklist.id).toBeDefined();

    const resource = await EntityCommandService.createResource({
      id: "resource-smoke",
      title: "Docs",
      url: "https://docs.pebble.com",
      type: "resource"
    } as any, wsId);
    expect(resource.id).toBeDefined();

    // Verify state persists in V1 storage keys
    const keys = await AsyncStorage.getAllKeys();
    const v1Keys = keys.filter(k => k.startsWith("pebble:v1:"));
    expect(v1Keys.length).toBeGreaterThan(0);
    
    keys.forEach(k => {
      expect(k).not.toContain("pebble:core:");
      expect(k).not.toContain("migrations:v1");
    });
  });
});
