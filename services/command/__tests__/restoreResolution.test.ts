import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { TaskRepository } from "@/repositories/TaskRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { RecycleBinRepository } from "@/repositories/RecycleBinRepository";
import { GraphRepository } from "@/repositories/GraphRepository";
import type {
  Habit,
  RecycleBinItem,
  Task,
  Workspace,
} from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("@/services/scheduling/reminders.service", () => ({
  cancelReminderIds: jest.fn(async () => undefined),
  rescheduleTodoReminders: jest.fn(async (task: Task) => task),
  rescheduleHabitReminders: jest.fn(async (habit: Habit) => habit),
}));

const storage = AsyncStorage as typeof AsyncStorage;

const workspace: Workspace = {
  id: "ws-1",
  name: "Workspace 1",
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
};

const task = (id: string, workspaceId: string = "ws-1"): Task => ({
  id,
  workspaceId,
  title: `Task ${id}`,
  status: "todo",
  priority: "none",
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
});

const habit = (id: string, workspaceId: string = "ws-1"): Habit => ({
  id,
  workspaceId,
  title: `Habit ${id}`,
  recurrence: { frequency: "daily", interval: 1 },
  completionHistory: [],
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
});

beforeEach(async () => {
  await storage.clear();
  jest.restoreAllMocks();
  GraphRepository.resetCache();
  await WorkspaceRepository.saveWorkspace(workspace);
});

describe("restore resolution by entity ID (delete-Undo paths)", () => {
  test("delete task → recycle bin → Undo passes the task entity ID → task restored and bin entry removed", async () => {
    await TaskRepository.saveTask(task("task-1"));

    await EntityCommandService.recycleTask("task-1", "ws-1", "Workspace 1", {
      skipEvents: true,
      skipAnalytics: true,
    });

    // Task is gone from active storage and present in the bin.
    expect((await TaskRepository.getTasks("ws-1"))["task-1"]).toBeUndefined();
    const binItem = (await RecycleBinRepository.getRecycleBinItems()).find(
      (i) => i.entityId === "task-1",
    );
    expect(binItem).toBeDefined();

    // Undo passes the raw task entity ID (as useTaskCrud.deleteTodo does).
    const restored = await EntityCommandService.restoreTask("task-1", {
      skipEvents: true,
      skipAnalytics: true,
    });

    expect(restored.id).toBe("task-1");
    expect((await TaskRepository.getTasks("ws-1"))["task-1"]).toBeDefined();
    expect(
      (await RecycleBinRepository.getRecycleBinItems()).some(
        (i) => i.entityId === "task-1",
      ),
    ).toBe(false);
  });

  test("restoreTask still accepts the recycle-bin item ID (rb-{entityId})", async () => {
    await TaskRepository.saveTask(task("task-1"));
    await EntityCommandService.recycleTask("task-1", "ws-1", "Workspace 1", {
      skipEvents: true,
      skipAnalytics: true,
    });

    const restored = await EntityCommandService.restoreTask("rb-task-1", {
      skipEvents: true,
      skipAnalytics: true,
    });

    expect(restored.id).toBe("task-1");
    expect((await TaskRepository.getTasks("ws-1"))["task-1"]).toBeDefined();
    expect(
      (await RecycleBinRepository.getRecycleBinItems()).some(
        (i) => i.entityId === "task-1",
      ),
    ).toBe(false);
  });

  test("bulk delete tasks → Undo passes task entity IDs → all restored and bin entries removed", async () => {
    await TaskRepository.saveTask(task("task-1"));
    await TaskRepository.saveTask(task("task-2"));

    await EntityCommandService.recycleTasks(
      [
        { taskId: "task-1", workspaceId: "ws-1" },
        { taskId: "task-2", workspaceId: "ws-1" },
      ],
      { skipEvents: true, skipAnalytics: true },
    );

    expect((await TaskRepository.getTasks("ws-1"))["task-1"]).toBeUndefined();
    expect((await TaskRepository.getTasks("ws-1"))["task-2"]).toBeUndefined();

    // Undo passes raw task entity IDs (as useTasksState.handleBulkDelete does).
    const result = await EntityCommandService.restoreTasks(
      ["task-1", "task-2"],
      { skipEvents: true, skipAnalytics: true },
    );

    expect(result.restoredCount).toBe(2);
    expect(result.successfulItemIds.sort()).toEqual(["rb-task-1", "rb-task-2"]);
    const active = await TaskRepository.getTasks("ws-1");
    expect(active["task-1"]).toBeDefined();
    expect(active["task-2"]).toBeDefined();
    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.some((i) => i.entityId === "task-1")).toBe(false);
    expect(bin.some((i) => i.entityId === "task-2")).toBe(false);
  });

  test("restoreTasks still accepts RecycleBinItem objects (Recycle Bin screen path)", async () => {
    const item1: RecycleBinItem = {
      id: "rb-task-1",
      entityType: "task",
      entityId: "task-1",
      snapshot: JSON.stringify(task("task-1")),
      deletedAt: 1,
      lifecycleGeneration: 1,
    };
    const item2: RecycleBinItem = {
      id: "rb-task-2",
      entityType: "task",
      entityId: "task-2",
      snapshot: JSON.stringify(task("task-2")),
      deletedAt: 1,
      lifecycleGeneration: 1,
    };
    await RecycleBinRepository.saveRecycleBinItems([item1, item2]);

    const result = await EntityCommandService.restoreTasks([item1, item2], {
      skipEvents: true,
      skipAnalytics: true,
    });

    expect(result.restoredCount).toBe(2);
    const active = await TaskRepository.getTasks("ws-1");
    expect(active["task-1"]).toBeDefined();
    expect(active["task-2"]).toBeDefined();
    expect(await RecycleBinRepository.getRecycleBinItems()).toEqual([]);
  });

  test("bulk delete habits → Undo passes habit entity IDs → all habits restored", async () => {
    await HabitRepository.saveHabit(habit("habit-1"));
    await HabitRepository.saveHabit(habit("habit-2"));

    await EntityCommandService.recycleHabit("habit-1", "ws-1", {
      skipEvents: true,
      skipAnalytics: true,
    });
    await EntityCommandService.recycleHabit("habit-2", "ws-1", {
      skipEvents: true,
      skipAnalytics: true,
    });

    expect((await HabitRepository.getHabits("ws-1"))["habit-1"]).toBeUndefined();
    expect((await HabitRepository.getHabits("ws-1"))["habit-2"]).toBeUndefined();

    // Undo passes raw habit entity IDs (as useTasksState.handleBulkDelete does).
    for (const id of ["habit-1", "habit-2"]) {
      await EntityCommandService.restoreHabit(id, {
        skipEvents: true,
        skipAnalytics: true,
      });
    }

    const active = await HabitRepository.getHabits("ws-1");
    expect(active["habit-1"]).toBeDefined();
    expect(active["habit-2"]).toBeDefined();
    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.some((i) => i.entityId === "habit-1")).toBe(false);
    expect(bin.some((i) => i.entityId === "habit-2")).toBe(false);
  });
});
