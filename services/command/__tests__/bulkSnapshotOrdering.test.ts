/**
 * bulkSnapshotOrdering.test.ts
 * ────────────────────────────
 * Priority 3 (stale bulk snapshot writes).
 *
 * `reorderWorkspaces`/`reorderTasks` receive a list captured by the UI. Before
 * this pass they performed a blind bulk write:
 *
 *   - `WorkspaceRepository.saveWorkspaces` REPLACED the whole collection, so a
 *     workspace created after the snapshot was deleted outright, and a stale
 *     record reverted a concurrent rename.
 *   - `TaskRepository.saveTasks` rewrote every supplied record from the
 *     snapshot (bumping `revision`/`updatedAt`), so a stale list reverted a
 *     rename or re-opened a completed task.
 *
 * These tests reproduce both failures deterministically against the real
 * command path and pin the order-only merge that replaces them.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { TaskRepository } from "@/repositories/TaskRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { GraphRepository } from "@/repositories/GraphRepository";
import {
  INBOX_WORKSPACE_ID,
  MY_PEBBLES_WORKSPACE_ID,
  type Task,
  type Workspace,
} from "@/shared/types/domain.types";
import { PEBBLE_LOG_KEY } from "@/features/profile/services/pebble.service";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("@/services/events/state-events", () => ({
  emitStateChange: jest.fn(),
  addStateListener: jest.fn(() => () => {}),
}));

const WS = "ws-order";

const workspace = (id: string, name: string): Workspace => ({
  id,
  name,
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
});

const task = (id: string, overrides: Partial<Task> = {}): Task =>
  ({
    id,
    workspaceId: WS,
    title: `Task ${id}`,
    status: "todo",
    priority: "none",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }) as Task;

const persistedWorkspaceIds = async (): Promise<string[]> =>
  (await WorkspaceRepository.getWorkspaces()).map((w) => w.id);

const persistedTaskIds = async (): Promise<string[]> => {
  const raw = await AsyncStorage.getItem(`pebble:v1:tasks:${WS}`);
  return raw ? Object.keys(JSON.parse(raw)) : [];
};

const silently = { skipEvents: true, skipAnalytics: true } as const;

beforeEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();
  GraphRepository.resetCache();
  jest
    .spyOn(
      require("@/services/analytics/productivity-history.service"),
      "recordDailyHistorySnapshot",
    )
    .mockResolvedValue(undefined);
  jest
    .spyOn(require("@/services/analytics/widget-data.service"), "syncWidgetData")
    .mockResolvedValue(undefined);

  await WorkspaceRepository.saveWorkspace(workspace(WS, "Order WS"));
});

describe("workspace reorder snapshots", () => {
  it("does not delete a workspace created after the snapshot was captured", async () => {
    await WorkspaceRepository.saveWorkspace(workspace("ws-a", "A"));
    await WorkspaceRepository.saveWorkspace(workspace("ws-b", "B"));

    // The UI captures this list for a drag-reorder...
    const staleSnapshot = await WorkspaceRepository.getWorkspaces();

    // ...while a workspace is created concurrently.
    await EntityCommandService.createWorkspace(workspace("ws-c", "C"));

    await EntityCommandService.reorderWorkspaces(staleSnapshot, silently);

    const ids = await persistedWorkspaceIds();
    expect(ids).toContain("ws-c");
    expect(ids.filter((id) => id === "ws-c")).toHaveLength(1);
  });

  it("does not revert a rename that happened after the snapshot", async () => {
    await WorkspaceRepository.saveWorkspace(workspace("ws-rename", "Before"));
    await WorkspaceRepository.saveWorkspace(workspace("ws-keep", "Keep"));

    const staleSnapshot = await WorkspaceRepository.getWorkspaces();

    await EntityCommandService.updateWorkspace({
      ...staleSnapshot.find((w) => w.id === "ws-rename")!,
      name: "Renamed",
    });

    // The reorder snapshot still carries the old name.
    await EntityCommandService.reorderWorkspaces(staleSnapshot, silently);

    const stored = (await WorkspaceRepository.getWorkspaces()).find(
      (w) => w.id === "ws-rename",
    );
    expect(stored?.name).toBe("Renamed");
  });

  it("applies the requested order without duplicating or dropping entries", async () => {
    await WorkspaceRepository.saveWorkspace(workspace("ws-1", "One"));
    await WorkspaceRepository.saveWorkspace(workspace("ws-2", "Two"));
    await WorkspaceRepository.saveWorkspace(workspace("ws-3", "Three"));

    const snapshot = await WorkspaceRepository.getWorkspaces();
    const byId = (id: string) => snapshot.find((w) => w.id === id)!;

    await EntityCommandService.reorderWorkspaces(
      [byId("ws-3"), byId("ws-1"), byId("ws-2"), byId(WS)],
      silently,
    );

    const stored = await WorkspaceRepository.getWorkspaces();
    expect(stored.map((w) => w.id)).toEqual(["ws-3", "ws-1", "ws-2", WS]);
    expect(new Set(stored.map((w) => w.id)).size).toBe(stored.length);
  });

  it("does not resurrect a workspace deleted after the snapshot", async () => {
    await WorkspaceRepository.saveWorkspace(workspace("ws-gone", "Gone"));
    await WorkspaceRepository.saveWorkspace(workspace("ws-stays", "Stays"));

    const staleSnapshot = await WorkspaceRepository.getWorkspaces();
    await WorkspaceRepository.deleteWorkspace("ws-gone", { throwOnError: true });

    await EntityCommandService.reorderWorkspaces(staleSnapshot, silently);

    expect(await persistedWorkspaceIds()).not.toContain("ws-gone");
  });

  it("still seeds the initial workspaces when nothing is persisted", async () => {
    await AsyncStorage.clear();

    await EntityCommandService.reorderWorkspaces(
      [
        workspace(INBOX_WORKSPACE_ID, "Inbox"),
        workspace(MY_PEBBLES_WORKSPACE_ID, "My Pebbles"),
      ],
      silently,
    );

    expect(await persistedWorkspaceIds()).toEqual([
      INBOX_WORKSPACE_ID,
      MY_PEBBLES_WORKSPACE_ID,
    ]);
  });
});

describe("task reorder snapshots", () => {
  it("does not revert a concurrent rename or completion", async () => {
    await TaskRepository.saveTask(task("t-stale"));

    // The UI captures this list before the concurrent edits.
    const staleSnapshot = await TaskRepository.getTasks(WS);
    const staleTask = staleSnapshot["t-stale"];

    await EntityCommandService.updateTask(
      "t-stale",
      WS,
      { title: "Renamed concurrently" },
      silently,
    );
    await EntityCommandService.completeTask("t-stale", WS, silently);

    const beforeReorder = (await TaskRepository.getTask("t-stale", WS))!;
    expect(beforeReorder.status).toBe("completed");

    await EntityCommandService.reorderTasks([staleTask], WS, silently);

    const afterReorder = (await TaskRepository.getTask("t-stale", WS))!;
    expect(afterReorder.title).toBe("Renamed concurrently");
    expect(afterReorder.status).toBe("completed");
    expect(afterReorder.completedAt).toBe(beforeReorder.completedAt);
    // Order is not an edit: no revision bump, no fake `updatedAt`.
    expect(afterReorder.revision).toBe(beforeReorder.revision);
    expect(afterReorder.updatedAt).toBe(beforeReorder.updatedAt);

    // The earned reward is untouched as well.
    const rewards = JSON.parse(
      (await AsyncStorage.getItem(PEBBLE_LOG_KEY)) ?? "[]",
    ).map((entry: any) => entry.rewardId);
    expect(rewards).toEqual(["task:t-stale"]);
  });

  it("applies the requested order and keeps tasks the snapshot did not know about", async () => {
    await TaskRepository.saveTask(task("t-1"));
    await TaskRepository.saveTask(task("t-2"));
    const snapshot = await TaskRepository.getTasks(WS);

    // A task created after the snapshot must not be dropped or reordered away.
    await TaskRepository.saveTask(task("t-3"));

    await EntityCommandService.reorderTasks([snapshot["t-2"]], WS, silently);

    expect(await persistedTaskIds()).toEqual(["t-2", "t-1", "t-3"]);
  });

  it("never resurrects a task that is no longer persisted", async () => {
    await TaskRepository.saveTask(task("t-deleted"));
    await TaskRepository.saveTask(task("t-live"));
    const snapshot = await TaskRepository.getTasks(WS);

    await EntityCommandService.deleteTask("t-deleted", WS, silently);

    await EntityCommandService.reorderTasks(
      [snapshot["t-deleted"], snapshot["t-live"]],
      WS,
      silently,
    );

    expect(await persistedTaskIds()).toEqual(["t-live"]);
  });
});
