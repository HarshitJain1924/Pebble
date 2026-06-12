import {
  getRecycleBinItems,
  saveRecycleBinItems,
  addToRecycleBin,
  getRecycledIds,
  cleanupRecycleBin,
  restoreRecycleBinItems,
  TODOS_STORAGE_KEY,
  DAILY_STORAGE_KEY,
  RECYCLE_BIN_STORAGE_KEY,
} from "../storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as reminders from "../reminders";

// In-memory store simulation
let mockStore: Record<string, string> = {};

jest.mock("@react-native-async-storage/async-storage", () => {
  return {
    getItem: jest.fn().mockImplementation(async (key) => mockStore[key] || null),
    setItem: jest.fn().mockImplementation(async (key, value) => {
      mockStore[key] = value;
      return null;
    }),
    removeItem: jest.fn().mockImplementation(async (key) => {
      delete mockStore[key];
      return null;
    }),
    multiSet: jest.fn().mockImplementation(async (pairs) => {
      pairs.forEach(([key, value]: [string, string]) => {
        mockStore[key] = value;
      });
      return null;
    }),
    multiGet: jest.fn().mockImplementation(async (keys) => {
      return keys.map((key: string) => [key, mockStore[key] || null]);
    }),
    clear: jest.fn().mockImplementation(async () => {
      mockStore = {};
      return null;
    }),
  };
});

jest.mock("../reminders", () => {
  return {
    cancelReminderIds: jest.fn().mockResolvedValue(undefined),
    rescheduleTodoReminders: jest.fn().mockImplementation(async (todo) => ({
      ...todo,
      notificationIds: ["mock-rescheduled-todo"],
    })),
    rescheduleHabitReminders: jest.fn().mockImplementation(async (habit) => ({
      ...habit,
      notificationIds: ["mock-rescheduled-habit"],
    })),
  };
});

describe("storage layer integration tests", () => {
  beforeEach(async () => {
    mockStore = {};
    jest.clearAllMocks();
  });

  it("should initialize empty recycle bin when storage is empty", async () => {
    const items = await getRecycleBinItems();
    expect(items).toEqual([]);
  });

  it("should save and retrieve recycle bin items", async () => {
    const mockItems = [
      {
        id: "task-1",
        title: "Test Task",
        deletedAt: Date.now(),
        itemType: "task" as const,
        originalLocation: "Default list",
        data: {},
      },
    ];

    await saveRecycleBinItems(mockItems);
    const retrieved = await getRecycleBinItems();
    expect(retrieved).toEqual(mockItems);
  });

  it("should support adding task/habit items to recycle bin", async () => {
    const mockTask = { id: "todo-abc", title: "Task ABC", completed: false };

    await addToRecycleBin("task", mockTask, "Inbox");
    const retrieved = await getRecycleBinItems();

    expect(retrieved.length).toBe(1);
    expect(retrieved[0].id).toBe("todo-abc");
    expect(retrieved[0].title).toBe("Task ABC");
    expect(retrieved[0].itemType).toBe("task");
    expect(retrieved[0].originalLocation).toBe("Inbox");
    expect(retrieved[0].data).toEqual(mockTask);
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

    // Verify nested objects inside workspace are also marked as recycled
    expect(recycled.taskIds.has("todo-nested-1")).toBe(true);
    expect(recycled.habitIds.has("habit-nested-2")).toBe(true);

    // Verify titles set
    expect(recycled.titles.has("study rust")).toBe(true);
    expect(recycled.titles.has("go running")).toBe(true);
    expect(recycled.titles.has("work projects")).toBe(true);
    expect(recycled.titles.has("write code")).toBe(true);
    expect(recycled.titles.has("check logs")).toBe(true);
  });

  it("should permanently clean up items older than 30 days", async () => {
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const mockItems = [
      {
        id: "task-old",
        title: "Very Old Task",
        deletedAt: now - 35 * DAY_MS, // 35 days ago
        itemType: "task" as const,
        originalLocation: "Inbox",
        data: { notificationIds: ["notif-old-123"] },
      },
      {
        id: "task-recent",
        title: "Recent Task",
        deletedAt: now - 5 * DAY_MS, // 5 days ago
        itemType: "task" as const,
        originalLocation: "Inbox",
        data: {},
      },
    ];

    await saveRecycleBinItems(mockItems);
    await cleanupRecycleBin();

    const remaining = await getRecycleBinItems();
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe("task-recent");

    // Old notifications should be canceled
    expect(reminders.cancelReminderIds).toHaveBeenCalledWith(["notif-old-123"]);
  });

  it("should execute full restoration logic with memory merges", async () => {
    // 1. Setup existing todos database state
    const initialTodos = {
      lists: [{ id: "default", name: "Inbox" }],
      selectedList: "default",
      todos: {
        default: [{ id: "todo-existing", title: "Existing task", completed: false }],
      },
    };
    mockStore[TODOS_STORAGE_KEY] = JSON.stringify(initialTodos);

    // 2. Setup existing habits database state
    const initialHabits = {
      dailyHabits: [{ id: "habit-existing", title: "Existing Habit", streak: 3 }],
    };
    mockStore[DAILY_STORAGE_KEY] = JSON.stringify(initialHabits);

    // 3. Add items to Recycle Bin
    const deletedTask = { id: "todo-deleted", title: "Deleted task", folderId: "default" };
    const deletedHabit = { id: "habit-deleted", title: "Deleted Habit", streak: 5 };

    await addToRecycleBin("task", deletedTask, "Inbox");
    await addToRecycleBin("habit", deletedHabit, "Streaks");

    const binItemsBefore = await getRecycleBinItems();
    expect(binItemsBefore.length).toBe(2);

    // 4. Restore the items!
    await restoreRecycleBinItems(binItemsBefore);

    // 5. Verify items were removed from recycle bin
    const binItemsAfter = await getRecycleBinItems();
    expect(binItemsAfter.length).toBe(0);

    // 6. Verify items were correctly merged back into their databases
    const updatedTodosRaw = mockStore[TODOS_STORAGE_KEY];
    expect(updatedTodosRaw).toBeDefined();
    const updatedTodos = JSON.parse(updatedTodosRaw);
    expect(updatedTodos.todos.default.length).toBe(2);
    expect(updatedTodos.todos.default.some((t: any) => t.id === "todo-deleted")).toBe(true);

    const updatedHabitsRaw = mockStore[DAILY_STORAGE_KEY];
    expect(updatedHabitsRaw).toBeDefined();
    const updatedHabits = JSON.parse(updatedHabitsRaw);
    expect(updatedHabits.dailyHabits.length).toBe(2);
    expect(updatedHabits.dailyHabits.some((h: any) => h.id === "habit-deleted")).toBe(true);

    // Verify reminders rescheduling was triggered
    expect(reminders.rescheduleTodoReminders).toHaveBeenCalled();
    expect(reminders.rescheduleHabitReminders).toHaveBeenCalled();
  });
});
