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
  type Relationship,
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
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 123,
  updatedAt: 456,
});

const task = (id: string, workspaceId: string): Task => ({
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

const habit = (id: string, workspaceId: string): Habit => ({
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
  await WorkspaceRepository.saveWorkspace({ id: INBOX_WORKSPACE_ID, name: "Inbox", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 });

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

    jest.spyOn(TaskRepository, "saveTasksUnlocked").mockRejectedValueOnce(new Error("Disk Full"));

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

    jest.spyOn(HabitRepository, "saveHabitsUnlocked").mockRejectedValueOnce(new Error("Disk Full"));

    await expect(
      EntityCommandService.restoreWorkspace("rb-ws-habit-fail", { skipEvents: true, skipAnalytics: true })
    ).rejects.toThrow("Workspace ws-habit-fail restored partially. Recovery snapshot retained.");

    const bin = await getRecycleBinItems();
    expect(bin.some((b) => b.entityId === "ws-habit-fail")).toBe(true);
  });

  it("Checklist restoration failure preserves the snapshot", async () => {
    const ws = fullWorkspace("ws-checklist-fail", "Checklist Fail");
    await WorkspaceRepository.saveWorkspace(ws);
    await ChecklistRepository.saveChecklist({
      id: "c-f",
      workspaceId: "ws-checklist-fail",
      title: "C",
      items: [],
      createdAt: 1,
      updatedAt: 1,
    });
    await deleteWorkspaceLikeModal(ws);

    jest.spyOn(ChecklistRepository, "saveChecklistsUnlocked").mockRejectedValueOnce(new Error("Disk Full"));

    await expect(
      EntityCommandService.restoreWorkspace("rb-ws-checklist-fail", { skipEvents: true, skipAnalytics: true })
    ).rejects.toThrow("Workspace ws-checklist-fail restored partially. Recovery snapshot retained.");

    const bin = await getRecycleBinItems();
    expect(bin.some((b) => b.entityId === "ws-checklist-fail")).toBe(true);
  });

  it("Resource restoration failure preserves the snapshot", async () => {
    const ws = fullWorkspace("ws-resource-fail", "Resource Fail");
    await WorkspaceRepository.saveWorkspace(ws);
    await ResourceRepository.saveResource({
      id: "r-f",
      workspaceId: "ws-resource-fail",
      title: "R",
      type: "note",
      createdAt: 1,
      updatedAt: 1,
    });
    await deleteWorkspaceLikeModal(ws);

    jest.spyOn(ResourceRepository, "saveResourcesUnlocked").mockRejectedValueOnce(new Error("Disk Full"));

    await expect(
      EntityCommandService.restoreWorkspace("rb-ws-resource-fail", { skipEvents: true, skipAnalytics: true })
    ).rejects.toThrow("Workspace ws-resource-fail restored partially. Recovery snapshot retained.");

    const bin = await getRecycleBinItems();
    expect(bin.some((b) => b.entityId === "ws-resource-fail")).toBe(true);
  });

  it("retry after a partial failure preserves intervening edits and completes the restore", async () => {
    const ws = fullWorkspace("ws-retry", "Retry");
    await WorkspaceRepository.saveWorkspace(ws);
    await TaskRepository.saveTask(task("t-retry", "ws-retry"));
    await HabitRepository.saveHabit(habit("h-retry", "ws-retry"));
    await deleteWorkspaceLikeModal(ws);

    const habitSave = jest
      .spyOn(HabitRepository, "saveHabitsUnlocked")
      .mockRejectedValueOnce(new Error("Disk Full"));

    await expect(
      EntityCommandService.restoreWorkspace("rb-ws-retry", { skipEvents: true, skipAnalytics: true }),
    ).rejects.toThrow("restored partially");
    habitSave.mockRestore();

    // The metadata commit and the task partition landed; the habit did not.
    expect((await WorkspaceRepository.getWorkspaces()).some((w) => w.id === "ws-retry")).toBe(true);
    expect((await TaskRepository.getTasks("ws-retry"))["t-retry"]).toBeDefined();
    expect((await HabitRepository.getHabits("ws-retry"))["h-retry"]).toBeUndefined();

    // User edits the restored task before retrying.
    await EntityCommandService.updateTask(
      "t-retry",
      "ws-retry",
      { title: "Edited after partial restore" },
      { skipEvents: true, skipAnalytics: true },
    );
    const beforeRetry = (await TaskRepository.getTasks("ws-retry"))["t-retry"];
    expect(beforeRetry.title).toBe("Edited after partial restore");

    await EntityCommandService.restoreWorkspace("rb-ws-retry", {
      skipEvents: true,
      skipAnalytics: true,
    });

    const afterRetry = (await TaskRepository.getTasks("ws-retry"))["t-retry"];
    expect(afterRetry.title).toBe("Edited after partial restore");
    // The retry must not rewrite live rows: no revision bump, no fake `updatedAt`.
    expect(afterRetry.revision).toBe(beforeRetry.revision);

    expect((await HabitRepository.getHabits("ws-retry"))["h-retry"]).toBeDefined();
    expect((await getRecycleBinItems()).some((b) => b.entityId === "ws-retry")).toBe(false);
  });

  it("does not rewrite a live child that shares the archived id", async () => {
    const ws = fullWorkspace("ws-live", "Live");
    const liveTask: Task = {
      ...task("t-live", "ws-live"),
      title: "Live edit",
      revision: 7,
      updatedAt: 999,
    };
    await storage.setItem(
      "pebble:v1:tasks:ws-live",
      JSON.stringify({ "t-live": liveTask }),
    );
    await addToRecycleBin(
      "workspace",
      {
        list: ws,
        todos: [{ ...liveTask, title: "Archived copy", revision: 1, updatedAt: 1 }],
        habits: [],
        checklists: [],
        resources: [],
      },
      "Workspaces",
      { throwOnError: true },
    );

    await EntityCommandService.restoreWorkspace("rb-ws-live", {
      skipEvents: true,
      skipAnalytics: true,
    });

    const stored = (await TaskRepository.getTasks("ws-live"))["t-live"];
    expect(stored.title).toBe("Live edit");
    expect(stored.revision).toBe(7);
    expect(stored.updatedAt).toBe(999);
  });
});

describe("workspace recycle → graph edges", () => {
  const rel = (
    id: string,
    relationType: Relationship["relationType"],
    source: { id: string; type: string },
    target: { id: string; type: string },
  ): Relationship => ({ id, source, target, relationType, createdAt: 1 });

  const seedWorkspaceChildren = async (wsId: string) => {
    await TaskRepository.saveTask(task("t-g", wsId));
    await HabitRepository.saveHabit(habit("h-g", wsId));
  };

  it("restores edges owned by the workspace and drops cross-workspace edges", async () => {
    const ws = fullWorkspace("ws-graph", "Graph");
    await WorkspaceRepository.saveWorkspace(ws);
    await seedWorkspaceChildren("ws-graph");

    // Internal edge: both endpoints are archived with the workspace.
    const internal = rel(
      "rel-internal",
      "supports",
      { id: "t-g", type: "task" },
      { id: "h-g", type: "habit" },
    );
    // Boundary edge: the target lives outside the recycled dataset.
    const external = rel(
      "rel-external",
      "related",
      { id: "t-g", type: "task" },
      { id: "t-inbox", type: "task" },
    );
    await GraphRepository.saveRelationship(internal);
    await GraphRepository.saveRelationship(external);

    await deleteWorkspaceLikeModal(ws);

    // Recycling removes every edge touching the archived children.
    expect((await GraphRepository.getAllRelationships()).map((r) => r.id)).toEqual([]);

    await EntityCommandService.restoreWorkspace("rb-ws-graph", {
      skipEvents: true,
      skipAnalytics: true,
    });

    const restored = await GraphRepository.getAllRelationships();
    expect(restored.map((r) => r.relationType)).toEqual(["supports"]);
    expect(restored[0].source.id).toBe("t-g");
    expect(restored[0].target.id).toBe("h-g");
    expect(restored.some((r) => r.id === "rel-external")).toBe(false);
  });

  it("restores focus provenance edges only while the session still exists", async () => {
    const ws = fullWorkspace("ws-focus", "Focus");
    await WorkspaceRepository.saveWorkspace(ws);
    await TaskRepository.saveTask(task("t-focus", "ws-focus"));
    await GraphRepository.saveFocusSession({
      id: "focus_session_1",
      startedAt: 1,
      endedAt: 2,
      duration: 60,
    });
    await GraphRepository.saveRelationship(
      rel(
        "rel-focus",
        "focuses_on",
        { id: "focus_session_1", type: "focus" },
        { id: "t-focus", type: "task" },
      ),
    );

    await deleteWorkspaceLikeModal(ws);
    expect((await GraphRepository.getAllRelationships()).length).toBe(0);

    await EntityCommandService.restoreWorkspace("rb-ws-focus", {
      skipEvents: true,
      skipAnalytics: true,
    });

    const restored = await GraphRepository.getAllRelationships();
    expect(restored).toHaveLength(1);
    expect(restored[0].relationType).toBe("focuses_on");
    expect(restored[0].source.id).toBe("focus_session_1");
  });

  it("never resurrects an edge whose endpoint is not live again", async () => {
    const ws = fullWorkspace("ws-dangling", "Dangling");
    await WorkspaceRepository.saveWorkspace(ws);
    await TaskRepository.saveTask(task("t-here", "ws-dangling"));

    // A package whose recorded edge references an entity that is not part of
    // the restored partitions (nor a live focus session).
    await addToRecycleBin(
      "workspace",
      {
        list: ws,
        todos: [task("t-here", "ws-dangling")],
        habits: [],
        checklists: [],
        resources: [],
        relationships: [
          rel(
            "rel-dangling",
            "supports",
            { id: "t-here", type: "task" },
            { id: "h-missing", type: "habit" },
          ),
          rel(
            "rel-dead-session",
            "focuses_on",
            { id: "focus_deleted", type: "focus" },
            { id: "t-here", type: "task" },
          ),
        ],
      },
      "Workspaces",
      { throwOnError: true },
    );

    await EntityCommandService.restoreWorkspace("rb-ws-dangling", {
      skipEvents: true,
      skipAnalytics: true,
    });

    expect(await GraphRepository.getAllRelationships()).toEqual([]);
  });

  it("retries edge restoration after failure without duplicating edges", async () => {
    const ws = fullWorkspace("ws-retry-edge", "Retry Edge");
    await WorkspaceRepository.saveWorkspace(ws);
    await seedWorkspaceChildren("ws-retry-edge");
    await GraphRepository.saveRelationship(
      rel(
        "rel-retry",
        "supports",
        { id: "t-g", type: "task" },
        { id: "h-g", type: "habit" },
      ),
    );

    await deleteWorkspaceLikeModal(ws);

    const saveRel = jest
      .spyOn(GraphRepository, "saveRelationship")
      .mockRejectedValueOnce(new Error("Disk Full"));

    await expect(
      EntityCommandService.restoreWorkspace("rb-ws-retry-edge", {
        skipEvents: true,
        skipAnalytics: true,
      }),
    ).rejects.toThrow("restored partially");
    saveRel.mockRestore();

    // The entities and workspace committed; the snapshot was retained.
    expect((await WorkspaceRepository.getWorkspaces()).some((w) => w.id === "ws-retry-edge")).toBe(true);
    expect((await getRecycleBinItems()).some((b) => b.entityId === "ws-retry-edge")).toBe(true);

    await EntityCommandService.restoreWorkspace("rb-ws-retry-edge", {
      skipEvents: true,
      skipAnalytics: true,
    });

    const edges = await GraphRepository.getAllRelationships();
    expect(edges).toHaveLength(1);
    expect(edges[0].relationType).toBe("supports");
    expect((await getRecycleBinItems()).some((b) => b.entityId === "ws-retry-edge")).toBe(false);
  });

  it("is idempotent when the same package is replayed", async () => {
    const ws = fullWorkspace("ws-replay", "Replay");
    await WorkspaceRepository.saveWorkspace(ws);
    await seedWorkspaceChildren("ws-replay");
    await GraphRepository.saveRelationship(
      rel(
        "rel-replay",
        "related",
        { id: "t-g", type: "task" },
        { id: "h-g", type: "habit" },
      ),
    );

    await deleteWorkspaceLikeModal(ws);
    const snapshot = (await getRecycleBinItems()).find((b) => b.entityId === "ws-replay")!;

    await EntityCommandService.restoreWorkspace("rb-ws-replay", {
      skipEvents: true,
      skipAnalytics: true,
    });

    // Simulate a crash that restored the data but never removed the bin entry,
    // then replay the same package.
    await storage.setItem("pebble:v1:recycle_bin", JSON.stringify([snapshot]));
    await EntityCommandService.restoreWorkspace("rb-ws-replay", {
      skipEvents: true,
      skipAnalytics: true,
    });

    expect(await GraphRepository.getAllRelationships()).toHaveLength(1);
  });
});
