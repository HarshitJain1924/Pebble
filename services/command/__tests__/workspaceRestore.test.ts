import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { TaskRepository } from "@/repositories/TaskRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { ChecklistRepository } from "@/repositories/ChecklistRepository";
import { ResourceRepository } from "@/repositories/ResourceRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { GraphRepository } from "@/repositories/GraphRepository";
import {
  addToRecycleBin,
  getRecycleBinItems,
} from "@/services/storage/storage.service";
import {
  INBOX_WORKSPACE_ID,
  type Habit,
  type Task,
  type Workspace,
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

const fullWorkspace = (id: string, name: string): Workspace => ({
  id,
  name,
  emoji: "🚀",
  color: "#FF5733",
  description: `Description of ${name}`,
  createdAt: 123,
  updatedAt: 456,
});

const task = (id: string, workspaceId: string): Task => ({
  id,
  workspaceId,
  title: `Task ${id}`,
  status: "todo",
  priority: "none",
  createdAt: 1,
  updatedAt: 1,
});

const habit = (id: string, workspaceId: string): Habit => ({
  id,
  workspaceId,
  title: `Habit ${id}`,
  recurrence: { frequency: "daily", interval: 1 },
  completionHistory: [],
  createdAt: 1,
  updatedAt: 1,
});

// Mirrors the WorkspaceModal delete flow: snapshot the workspace package into
// the Recycle Bin, then remove the workspace through ECS.
const deleteWorkspaceLikeModal = async (ws: Workspace) => {
  await addToRecycleBin("workspace", { list: ws, todos: [], habits: [] }, "Workspaces");
  await EntityCommandService.deleteWorkspace(ws.id);
};

let emitStateChangeSpy: jest.SpyInstance;

beforeEach(async () => {
  jest.restoreAllMocks();
  await storage.clear();
  GraphRepository.resetCache();
  await WorkspaceRepository.saveWorkspace({ id: INBOX_WORKSPACE_ID, name: "Inbox", createdAt: 1, updatedAt: 1 });

  emitStateChangeSpy = jest
    .spyOn(require("@/services/events/state-events"), "emitStateChange")
    .mockImplementation(() => {});
  // Silence side effects exercised by ECS flows; the workspace persistence and
  // bin-item lifecycle is what these tests assert, not events/analytics.
  jest
    .spyOn(
      require("@/services/analytics/productivity-history.service"),
      "recordDailyHistorySnapshot",
    )
    .mockResolvedValue(undefined);
  jest.spyOn(require("@/services/analytics/widget-data.service"), "syncWidgetData").mockResolvedValue(undefined);
});

describe("workspace restore integrity", () => {
  it("delete → restore → workspace exists again", async () => {
    const ws = fullWorkspace("ws-a", "Workspace A");
    await WorkspaceRepository.saveWorkspace(ws);
    await deleteWorkspaceLikeModal(ws);

    expect((await WorkspaceRepository.getWorkspaces()).some((w) => w.id === "ws-a")).toBe(false);

    const restored = await EntityCommandService.restoreWorkspace("rb-ws-a", {
      skipEvents: true,
      skipAnalytics: true,
    });
    expect(restored.id).toBe("ws-a");
    expect((await WorkspaceRepository.getWorkspaces()).some((w) => w.id === "ws-a")).toBe(true);
  });

  it("preserves the original workspace ID", async () => {
    const ws = fullWorkspace("ws-id", "ID Keeper");
    await WorkspaceRepository.saveWorkspace(ws);
    await deleteWorkspaceLikeModal(ws);

    const restored = await EntityCommandService.restoreWorkspace("ws-id", {
      skipEvents: true,
      skipAnalytics: true,
    });
    expect(restored.id).toBe("ws-id");
  });

  it("preserves all current workspace metadata", async () => {
    const ws = fullWorkspace("ws-meta", "Meta Keeper");
    await WorkspaceRepository.saveWorkspace(ws);
    await deleteWorkspaceLikeModal(ws);

    await EntityCommandService.restoreWorkspace("rb-ws-meta", {
      skipEvents: true,
      skipAnalytics: true,
    });

    const restored = (await WorkspaceRepository.getWorkspaces()).find(
      (w) => w.id === "ws-meta",
    );
    expect(restored).toBeDefined();
    expect(restored!.name).toBe("Meta Keeper");
    expect(restored!.emoji).toBe("🚀");
    expect(restored!.color).toBe("#FF5733");
    expect(restored!.description).toBe("Description of Meta Keeper");
    expect(restored!.createdAt).toBe(123);
  });

  it("survives reload (persisted through the repository)", async () => {
    const ws = fullWorkspace("ws-persist", "Persistent");
    await WorkspaceRepository.saveWorkspace(ws);
    await deleteWorkspaceLikeModal(ws);

    await EntityCommandService.restoreWorkspace("rb-ws-persist", {
      skipEvents: true,
      skipAnalytics: true,
    });

    // A fresh repository read (simulating app reload) must see the workspace.
    const raw = await AsyncStorage.getItem("pebble:v1:workspaces");
    expect(raw).toContain("ws-persist");
    expect((await WorkspaceRepository.getWorkspaces()).some((w) => w.id === "ws-persist")).toBe(true);
  });

  it("does not create a duplicate workspace on restore", async () => {
    const ws = fullWorkspace("ws-unique", "Unique");
    await WorkspaceRepository.saveWorkspace(ws);
    await deleteWorkspaceLikeModal(ws);

    await EntityCommandService.restoreWorkspace("rb-ws-unique", {
      skipEvents: true,
      skipAnalytics: true,
    });
    await EntityCommandService.restoreWorkspace("rb-ws-unique", {
      skipEvents: true,
      skipAnalytics: true,
    }).catch(() => {});

    const matches = (await WorkspaceRepository.getWorkspaces()).filter(
      (w) => w.id === "ws-unique",
    );
    expect(matches).toHaveLength(1);
  });

  it("restores multiple deleted workspaces independently", async () => {
    const wsA = fullWorkspace("ws-a", "A");
    const wsB = fullWorkspace("ws-b", "B");
    await WorkspaceRepository.saveWorkspace(wsA);
    await WorkspaceRepository.saveWorkspace(wsB);
    await deleteWorkspaceLikeModal(wsA);
    await deleteWorkspaceLikeModal(wsB);

    await EntityCommandService.restoreWorkspace("rb-ws-a", {
      skipEvents: true,
      skipAnalytics: true,
    });
    await EntityCommandService.restoreWorkspace("rb-ws-b", {
      skipEvents: true,
      skipAnalytics: true,
    });

    const all = await WorkspaceRepository.getWorkspaces();
    expect(all.filter((w) => w.id === "ws-a")).toHaveLength(1);
    expect(all.filter((w) => w.id === "ws-b")).toHaveLength(1);
    expect(all.find((w) => w.id === "ws-a")?.name).toBe("A");
    expect(all.find((w) => w.id === "ws-b")?.name).toBe("B");
  });

  it("upserts (no duplicate) when a workspace with the same ID already exists", async () => {
    // Simulate a collision: the workspace still exists in the repository when a
    // restore of the same ID is attempted. The existing convention is upsert.
    const existing = fullWorkspace("ws-collide", "Existing Name");
    await WorkspaceRepository.saveWorkspace(existing);

    await addToRecycleBin(
      "workspace",
      { list: { ...existing, name: "Snapshot Name" }, todos: [], habits: [] },
      "Workspaces",
    );
    await EntityCommandService.restoreWorkspace("rb-ws-collide", {
      skipEvents: true,
      skipAnalytics: true,
    });

    const matches = (await WorkspaceRepository.getWorkspaces()).filter(
      (w) => w.id === "ws-collide",
    );
    expect(matches).toHaveLength(1);
  });

  it("keeps the bin item and reports failure when persistence does not take effect", async () => {
    const ws = fullWorkspace("ws-fail", "Fail");
    await WorkspaceRepository.saveWorkspace(ws);
    await deleteWorkspaceLikeModal(ws);

    // saveWorkspace swallows errors, so simulate the write silently failing by
    // no-opping the save: the read-back verification must then fail the restore.
    jest.spyOn(WorkspaceRepository, "saveWorkspace").mockImplementation(async () => {});

    await expect(
      EntityCommandService.restoreWorkspace("rb-ws-fail", {
        skipEvents: true,
        skipAnalytics: true,
      }),
    ).rejects.toThrow("failed to persist");

    // The bin entry must remain (no snapshot-missing + workspace-restored).
    const bin = await getRecycleBinItems();
    expect(bin.some((b) => b.entityId === "ws-fail")).toBe(true);
    expect((await WorkspaceRepository.getWorkspaces()).some((w) => w.id === "ws-fail")).toBe(false);
  });

  it("throws for missing or non-workspace bin items without touching storage", async () => {
    await expect(
      EntityCommandService.restoreWorkspace("rb-does-not-exist", { skipEvents: true }),
    ).rejects.toThrow("RecycleBin item not found or not workspace");

    await addToRecycleBin("task", task("t-1", "ws-1"), "Inbox");
    await expect(
      EntityCommandService.restoreWorkspace("rb-t-1", { skipEvents: true }),
    ).rejects.toThrow("RecycleBin item not found or not workspace");
  });

  it("emits the workspace state event on restore", async () => {
    const ws = fullWorkspace("ws-event", "Eventful");
    await WorkspaceRepository.saveWorkspace(ws);
    await deleteWorkspaceLikeModal(ws);

    await EntityCommandService.restoreWorkspace("rb-ws-event");

    expect(emitStateChangeSpy).toHaveBeenCalledWith("workspace_mode_changed", undefined);
  });

  it("leaves Inbox intact after a workspace restore", async () => {
    const ws = fullWorkspace("ws-x", "X");
    await WorkspaceRepository.saveWorkspace(ws);
    await deleteWorkspaceLikeModal(ws);
    await EntityCommandService.restoreWorkspace("rb-ws-x", {
      skipEvents: true,
      skipAnalytics: true,
    });

    const inboxes = (await WorkspaceRepository.getWorkspaces()).filter(
      (w) => w.id === INBOX_WORKSPACE_ID,
    );
    expect(inboxes).toHaveLength(1);
    expect(inboxes[0].name).toBe("Inbox");
  });

  it("keeps associated task/habit/checklist/resource workspaceIds correct", async () => {
    const ws = fullWorkspace("ws-owned", "Owned");
    await WorkspaceRepository.saveWorkspace(ws);
    await TaskRepository.saveTask(task("t-owned", "ws-owned"));
    await HabitRepository.saveHabit(habit("h-owned", "ws-owned"));
    await ChecklistRepository.saveChecklist({
      id: "c-owned",
      workspaceId: "ws-owned",
      title: "C",
      items: [],
      createdAt: 1,
      updatedAt: 1,
    });
    await ResourceRepository.saveResource({
      id: "r-owned",
      workspaceId: "ws-owned",
      title: "R",
      type: "note",
      createdAt: 1,
      updatedAt: 1,
    });

    await deleteWorkspaceLikeModal(ws);
    await EntityCommandService.restoreWorkspace("rb-ws-owned", {
      skipEvents: true,
      skipAnalytics: true,
    });

    expect((await TaskRepository.getTasks("ws-owned"))["t-owned"].workspaceId).toBe("ws-owned");
    expect((await HabitRepository.getHabits("ws-owned"))["h-owned"].workspaceId).toBe("ws-owned");
    expect((await ChecklistRepository.getChecklists("ws-owned"))["c-owned"].workspaceId).toBe("ws-owned");
    expect((await ResourceRepository.getResources("ws-owned"))["r-owned"].workspaceId).toBe("ws-owned");
  });

  it("Task restoration failure preserves the snapshot", async () => {
    const ws = fullWorkspace("ws-task-fail", "Task Fail");
    await WorkspaceRepository.saveWorkspace(ws);
    await TaskRepository.saveTask(task("t-f", "ws-task-fail"));
    await deleteWorkspaceLikeModal(ws);

    jest.spyOn(TaskRepository, "saveTasks").mockRejectedValueOnce(new Error("Disk Full"));

    await expect(
      EntityCommandService.restoreWorkspace("rb-ws-task-fail", { skipEvents: true, skipAnalytics: true })
    ).rejects.toThrow("Workspace ws-task-fail restored partially. Recovery snapshot retained.");

    const bin = await getRecycleBinItems();
    expect(bin.some((b) => b.entityId === "ws-task-fail")).toBe(true);
  });

  it("Habit restoration failure preserves the snapshot", async () => {
    const ws = fullWorkspace("ws-habit-fail", "Habit Fail");
    await WorkspaceRepository.saveWorkspace(ws);
    await HabitRepository.saveHabit(habit("h-f", "ws-habit-fail"));
    await deleteWorkspaceLikeModal(ws);

    jest.spyOn(HabitRepository, "saveHabit").mockRejectedValueOnce(new Error("Disk Full"));

    await expect(
      EntityCommandService.restoreWorkspace("rb-ws-habit-fail", { skipEvents: true, skipAnalytics: true })
    ).rejects.toThrow("Workspace ws-habit-fail restored partially. Recovery snapshot retained.");

    const bin = await getRecycleBinItems();
    expect(bin.some((b) => b.entityId === "ws-habit-fail")).toBe(true);
  });
});
