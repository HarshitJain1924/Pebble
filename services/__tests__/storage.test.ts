import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  addToRecycleBin,
  cleanupRecycleBin,
  getRecycleBinItems,
  getRecycledIds,
  saveRecycleBinItems,
} from "@/services/storage/storage.service";
import { type RecycleBinItem } from "@/shared/types/domain.types";
import * as reminders from "@/services/scheduling/reminders.service";

jest.mock("@/services/scheduling/reminders.service", () => ({
  cancelReminderIds: jest.fn().mockResolvedValue(undefined),
}));

describe("storage.service", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it("should save and retrieve recycle bin items", async () => {
    const mockItems: RecycleBinItem[] = [
      {
        id: "rb-1",
        entityType: "task",
        entityId: "task-1",
        snapshot: JSON.stringify({ title: "Test Task" }),
        deletedAt: Date.now(),
      },
    ];

    await saveRecycleBinItems(mockItems);
    const retrieved = await getRecycleBinItems();
    expect(retrieved).toEqual(mockItems);
  });

  it("should support adding task/habit items to recycle bin", async () => {
    const mockTask = { id: "todo-abc", title: "Task ABC", status: "todo" };

    await addToRecycleBin("task", mockTask, "Inbox");
    const retrieved = await getRecycleBinItems();

    expect(retrieved.length).toBe(1);
    expect(retrieved[0].entityId).toBe("todo-abc");
    expect(retrieved[0].entityType).toBe("task");
  });

  it("should parse workspace/task/habit recycled ids correctly", async () => {
    const mockTask = { id: "todo-123", title: "Study Rust" };
    const mockHabit = { id: "habit-456", title: "Go running" };
    const mockWorkspace = {
      list: { id: "list-789", name: "Work Projects" },
      todos: [{ id: "todo-nested-1", title: "Write code" }],
      habits: [{ id: "habit-nested-2", title: "Check logs" }],
    };

    await addToRecycleBin("task", mockTask, "Inbox");
    await addToRecycleBin("habit", mockHabit, "Streaks");
    await addToRecycleBin("workspace", mockWorkspace, "Sidebar");

    const recycled = await getRecycledIds();

    expect(recycled.taskIds.has("todo-123")).toBe(true);
    expect(recycled.habitIds.has("habit-456")).toBe(true);
    expect(recycled.workspaceIds.has("list-789")).toBe(true);
  });

  it("should permanently clean up items older than 30 days", async () => {
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const mockItems: RecycleBinItem[] = [
      {
        id: "rb-old",
        entityType: "task",
        entityId: "task-old",
        snapshot: JSON.stringify({ title: "Very Old Task", reminder: { notificationIds: ["notif-old-123"] } }),
        deletedAt: now - 35 * DAY_MS,
      },
      {
        id: "rb-recent",
        entityType: "task",
        entityId: "task-recent",
        snapshot: JSON.stringify({ title: "Recent Task" }),
        deletedAt: now - 5 * DAY_MS,
      },
    ];

    await saveRecycleBinItems(mockItems);
    await cleanupRecycleBin();

    const remaining = await getRecycleBinItems();
    expect(remaining.length).toBe(1);
    expect(remaining[0].entityId).toBe("task-recent");
  });
});
