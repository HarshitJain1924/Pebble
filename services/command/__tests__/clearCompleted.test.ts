import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { TaskRepository } from "@/repositories/TaskRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { GraphRepository } from "@/repositories/GraphRepository";
import { RecycleBinRepository } from "@/repositories/RecycleBinRepository";
import type { Task, Workspace } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const storage = AsyncStorage as typeof AsyncStorage;

const workspace: Workspace = { id: "ws-1", name: "WS", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 };

const makeTask = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  workspaceId: "ws-1",
  title: `Task ${id}`,
  status: "todo",
  priority: "none",
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const completedTask = (id: string, overrides: Partial<Task> = {}) =>
  makeTask(id, { status: "completed", completedAt: 100, ...overrides });

let cancelReminderIdsSpy: jest.SpyInstance;

beforeEach(async () => {
  jest.restoreAllMocks();
  await storage.clear();
  GraphRepository.resetCache();
  await WorkspaceRepository.saveWorkspace(workspace);

  cancelReminderIdsSpy = jest
    .spyOn(require("@/services/scheduling/reminders.service"), "cancelReminderIds")
    .mockResolvedValue(undefined);
  // Silence side effects exercised by the ECS recycle path; the snapshot and
  // deletion ordering is what these tests assert, not events/analytics.
  jest.spyOn(require("@/services/events/state-events"), "emitStateChange").mockImplementation(() => {});
  jest
    .spyOn(
      require("@/services/analytics/productivity-history.service"),
      "recordDailyHistorySnapshot",
    )
    .mockResolvedValue(undefined);
  jest.spyOn(require("@/services/analytics/widget-data.service"), "syncWidgetData").mockResolvedValue(undefined);
});

describe("clearCompletedTasks data integrity", () => {
  it("moves every completed task into the Recycle Bin", async () => {
    await TaskRepository.saveTask(completedTask("done-1"));
    await TaskRepository.saveTask(makeTask("open-1"));

    await EntityCommandService.clearCompletedTasks("ws-1");

    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.map((b) => b.entityId)).toContain("done-1");
    expect(bin.find((b) => b.entityId === "done-1")?.entityType).toBe("task");
    expect(bin.some((b) => b.entityId === "open-1")).toBe(false);
  });

  it("removes completed tasks from active storage and keeps the rest", async () => {
    await TaskRepository.saveTask(completedTask("done-1"));
    await TaskRepository.saveTask(completedTask("done-2"));
    await TaskRepository.saveTask(makeTask("open-1"));

    await EntityCommandService.clearCompletedTasks("ws-1");

    const active = await TaskRepository.getTasks("ws-1");
    expect(active["done-1"]).toBeUndefined();
    expect(active["done-2"]).toBeUndefined();
    expect(active["open-1"]).toBeDefined();
  });

  it("persists the Recycle Bin snapshot before deleting active tasks", async () => {
    await TaskRepository.saveTask(completedTask("done-1"));

    const saveSpy = jest.spyOn(RecycleBinRepository, "addMultipleToRecycleBin");
    const deleteSpy = jest.spyOn(TaskRepository, "deleteTasksUnlocked");

    await EntityCommandService.clearCompletedTasks("ws-1");

    expect(saveSpy).toHaveBeenCalled();
    expect(deleteSpy).toHaveBeenCalled();
    // Snapshot write must complete before any active deletion begins.
    expect(saveSpy.mock.invocationCallOrder[0]).toBeLessThan(
      deleteSpy.mock.invocationCallOrder[0],
    );
  });

  it("keeps the task active when the Recycle Bin snapshot write fails", async () => {
    await TaskRepository.saveTask(completedTask("done-1"));

    const saveSpy = jest
      .spyOn(RecycleBinRepository, "addMultipleToRecycleBin")
      .mockRejectedValueOnce(new Error("injected snapshot failure"));

    await expect(
      EntityCommandService.clearCompletedTasks("ws-1"),
    ).rejects.toThrow("injected snapshot failure");

    // The task must remain in active storage (no snapshot-missing + deleted).
    const active = await TaskRepository.getTasks("ws-1");
    expect(active["done-1"]).toBeDefined();

    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.some((b) => b.entityId === "done-1")).toBe(false);
    expect(saveSpy).toHaveBeenCalled();
  });

  it("cancels the reminders of every cleared task", async () => {
    await TaskRepository.saveTask(
      completedTask("done-1", {
        reminder: {
          enabled: true,
          triggerAt: Date.now() + 60_000,
          notificationIds: ["n1", "n2"],
        },
      }),
    );

    await EntityCommandService.clearCompletedTasks("ws-1");

    expect(cancelReminderIdsSpy).toHaveBeenCalledWith(["n1", "n2"], {
      throwOnError: false,
    });
  });

  it("restores a cleared task from the Recycle Bin (undo path)", async () => {
    await TaskRepository.saveTask(
      completedTask("done-1", { title: "Original title" }),
    );

    await EntityCommandService.clearCompletedTasks("ws-1");

    const restored = await EntityCommandService.restoreTask("done-1", {
      skipEvents: true,
      skipAnalytics: true,
    });
    expect(restored.id).toBe("done-1");
    expect(restored.title).toBe("Original title");

    const active = await TaskRepository.getTasks("ws-1");
    expect(active["done-1"]).toBeDefined();

    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.some((b) => b.entityId === "done-1")).toBe(false);
  });

  it("handles multiple completed tasks atomically", async () => {
    await TaskRepository.saveTask(completedTask("done-1"));
    await TaskRepository.saveTask(completedTask("done-2"));
    await TaskRepository.saveTask(completedTask("done-3"));
    await TaskRepository.saveTask(makeTask("open-1"));
    await TaskRepository.saveTask(makeTask("open-2"));

    await EntityCommandService.clearCompletedTasks("ws-1");

    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.map((b) => b.entityId).sort()).toEqual([
      "done-1",
      "done-2",
      "done-3",
    ]);

    const active = await TaskRepository.getTasks("ws-1");
    expect(Object.keys(active).sort()).toEqual(["open-1", "open-2"]);
  });

  /**
   * Runs `interleave` immediately after the FIRST TaskRepository.getTasks
   * call resolves — modeling a concurrent user mutation committing between
   * clear's unlocked selection read and its locked re-read.
   */
  function interleaveAfterSelection(interleave: () => Promise<void>): void {
    const originalGetTasks = TaskRepository.getTasks.bind(TaskRepository);
    let armed = true;
    jest
      .spyOn(TaskRepository, "getTasks")
      .mockImplementation(async (wsId: string) => {
        const result = await originalGetTasks(wsId);
        if (armed) {
          armed = false;
          await interleave();
        }
        return result;
      });
  }

  it("A: does not recycle a task un-completed after selection (stale snapshot guard)", async () => {
    await TaskRepository.saveTask(completedTask("done-1"));

    // User un-completes the task between clear's selection read and its
    // locked re-read. A stale clear must NOT recycle the newer state.
    interleaveAfterSelection(async () => {
      await EntityCommandService.updateTask(
        "done-1",
        "ws-1",
        { status: "todo", completedAt: undefined },
        { skipEvents: true, skipAnalytics: true },
      );
    });

    await EntityCommandService.clearCompletedTasks("ws-1");

    const active = await TaskRepository.getTasks("ws-1");
    expect(active["done-1"]).toBeDefined();
    expect(active["done-1"].status).toBe("todo");

    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.some((b) => b.entityId === "done-1")).toBe(false);
  });

  it("B: does not delete a task moved to another workspace after selection", async () => {
    await WorkspaceRepository.saveWorkspace({
      id: "ws-2",
      name: "WS2",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    await TaskRepository.saveTask(completedTask("done-1"));

    // Task moves ws-1 -> ws-2 between clear's selection read and its locked
    // re-read; the clear must not delete it from either workspace.
    interleaveAfterSelection(async () => {
      await EntityCommandService.moveTask(
        "done-1",
        "ws-1",
        "ws-2",
        { skipEvents: true, skipAnalytics: true },
      );
    });

    await EntityCommandService.clearCompletedTasks("ws-1");

    const ws1 = await TaskRepository.getTasks("ws-1");
    expect(ws1["done-1"]).toBeUndefined();

    const ws2 = await TaskRepository.getTasks("ws-2");
    expect(ws2["done-1"]).toBeDefined();

    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.some((b) => b.entityId === "done-1")).toBe(false);
  });

  it("C: does not duplicate bin entries when the task is concurrently recycled", async () => {
    await TaskRepository.saveTask(completedTask("done-1"));

    // Another command recycles the task before clear's locked re-read.
    interleaveAfterSelection(async () => {
      await EntityCommandService.recycleTask(
        "done-1",
        "ws-1",
        "",
        { skipEvents: true, skipAnalytics: true },
      );
    });

    await EntityCommandService.clearCompletedTasks("ws-1");

    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.filter((b) => b.entityId === "done-1")).toHaveLength(1);

    const active = await TaskRepository.getTasks("ws-1");
    expect(active["done-1"]).toBeUndefined();
  });

  it("D: is idempotent — a repeated clear never duplicates bin entries", async () => {
    await TaskRepository.saveTask(completedTask("done-1"));

    await EntityCommandService.clearCompletedTasks("ws-1");
    await EntityCommandService.clearCompletedTasks("ws-1");

    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.filter((b) => b.entityId === "done-1")).toHaveLength(1);

    const active = await TaskRepository.getTasks("ws-1");
    expect(Object.keys(active)).toEqual([]);
  });

  it("E: recovers via MoveReconciler when active deletion fails after the bin snapshot", async () => {
    await TaskRepository.saveTask(completedTask("done-1"));
    jest
      .spyOn(TaskRepository, "deleteTasksUnlocked")
      .mockRejectedValueOnce(new Error("injected delete failure"));

    await expect(
      EntityCommandService.clearCompletedTasks("ws-1"),
    ).rejects.toThrow("injected delete failure");

    // The journal retains the recycle intent; the reconciler completes the
    // recycle idempotently (bin snapshot already exists -> ghost removed).
    const { MoveReconcilerService } = await import(
      "@/services/storage/MoveReconcilerService"
    );
    await MoveReconcilerService.reconcileAll();

    const active = await TaskRepository.getTasks("ws-1");
    expect(active["done-1"]).toBeUndefined();

    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.filter((b) => b.entityId === "done-1")).toHaveLength(1);
  });

  it("does not corrupt state when an entity is missing or already recycled", async () => {
    // done-1 exists and is completed; done-ghost is referenced in the request
    // but does not exist in the repository (e.g. stale UI). done-2 is already
    // in the Recycle Bin from an earlier delete.
    await TaskRepository.saveTask(completedTask("done-1"));
    await TaskRepository.saveTask(completedTask("done-2"));
    await RecycleBinRepository.saveRecycleBinItems([
      {
        id: "rb-done-2",
        entityType: "task",
        entityId: "done-2",
        snapshot: JSON.stringify(completedTask("done-2")),
        deletedAt: 1,
        lifecycleGeneration: 1,
      },
    ]);

    await EntityCommandService.recycleTasks(
      [
        { taskId: "done-1", workspaceId: "ws-1" },
        { taskId: "done-ghost", workspaceId: "ws-1" },
        { taskId: "done-2", workspaceId: "ws-1" },
      ],
      { source: "test" },
    );

    // done-1 recycled; missing task silently skipped; done-2's bin entry
    // replaced, not duplicated.
    const bin = await RecycleBinRepository.getRecycleBinItems();
    const done2Entries = bin.filter((b) => b.entityId === "done-2");
    expect(done2Entries).toHaveLength(1);
    expect(bin.map((b) => b.entityId)).toContain("done-1");

    const active = await TaskRepository.getTasks("ws-1");
    expect(active["done-1"]).toBeUndefined();
    expect(active["done-2"]).toBeUndefined();
  });
});
