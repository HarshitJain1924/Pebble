import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { HabitRepository } from "@/repositories/HabitRepository";
import { GraphRepository } from "@/repositories/GraphRepository";
import { INBOX_WORKSPACE_ID, type Habit } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const storage = AsyncStorage as typeof AsyncStorage;

let emitStateChangeSpy: jest.SpyInstance;
let syncWidgetDataSpy: jest.SpyInstance;
let recordDailyHistorySnapshotSpy: jest.SpyInstance;

const habit = (
  id: string,
  workspaceId: string,
  overrides: Partial<Habit> = {},
): Habit => ({
  id,
  workspaceId,
  title: `Habit ${id}`,
  recurrence: { frequency: "daily", interval: 1 },
  completionHistory: [],
  createdAt: 1000,
  updatedAt: 1000,
  ...overrides,
});

/**
 * Mirrors the persistence sequence the Tasks screen bulk-move now performs
 * (useTasksState.handleBulkMove): one canonical moveHabit per selected habit,
 * events/analytics skipped per item, then a single consolidated emission.
 */
async function bulkMoveHabits(
  moves: { id: string; sourceWorkspaceId: string; targetWorkspaceId: string }[],
) {
  await Promise.all(
    moves.map((move) =>
      EntityCommandService.moveHabit(
        move.id,
        move.sourceWorkspaceId,
        move.targetWorkspaceId,
        { skipEvents: true, skipAnalytics: true },
      ),
    ),
  );
}

beforeEach(async () => {
  await storage.clear();
  jest.restoreAllMocks();
  GraphRepository.resetCache?.();
  emitStateChangeSpy = jest
    .spyOn(require("@/services/events/state-events"), "emitStateChange")
    .mockImplementation(() => {});
  syncWidgetDataSpy = jest
    .spyOn(require("@/services/analytics/widget-data.service"), "syncWidgetData")
    .mockResolvedValue(undefined);
  recordDailyHistorySnapshotSpy = jest
    .spyOn(
      require("@/services/analytics/productivity-history.service"),
      "recordDailyHistorySnapshot",
    )
    .mockResolvedValue(undefined);
});

describe("Habit bulk move persistence (via EntityCommandService.moveHabit)", () => {
  test("single habit move persists the destination workspaceId and survives reload", async () => {
    await HabitRepository.saveHabit(habit("habit-a", "ws-1"));

    await bulkMoveHabits([{ id: "habit-a", sourceWorkspaceId: "ws-1", targetWorkspaceId: "ws-2" }]);

    // Persisted in destination.
    const dest = await HabitRepository.getHabits("ws-2");
    expect(dest["habit-a"]).toBeDefined();
    expect(dest["habit-a"].workspaceId).toBe("ws-2");
    // Removed from source.
    const source = await HabitRepository.getHabits("ws-1");
    expect(source["habit-a"]).toBeUndefined();
    // Reload (fresh repository read) — still in destination.
    const reloaded = await HabitRepository.getHabits("ws-2");
    expect(reloaded["habit-a"].workspaceId).toBe("ws-2");
  });

  test("bulk move persists every selected habit to the destination workspace", async () => {
    await HabitRepository.saveHabit(habit("habit-a", "ws-1"));
    await HabitRepository.saveHabit(habit("habit-c", "ws-1"));
    await HabitRepository.saveHabit(habit("habit-d", "ws-1"));

    await bulkMoveHabits([
      { id: "habit-a", sourceWorkspaceId: "ws-1", targetWorkspaceId: "ws-2" },
      { id: "habit-c", sourceWorkspaceId: "ws-1", targetWorkspaceId: "ws-2" },
      { id: "habit-d", sourceWorkspaceId: "ws-1", targetWorkspaceId: "ws-2" },
    ]);

    const dest = await HabitRepository.getHabits("ws-2");
    expect(Object.keys(dest).sort()).toEqual(["habit-a", "habit-c", "habit-d"]);
    for (const id of ["habit-a", "habit-c", "habit-d"]) {
      expect(dest[id].workspaceId).toBe("ws-2");
    }
    // No duplicates: one record per habit id.
    expect(Object.keys(dest).length).toBe(new Set(Object.keys(dest)).size);
    const source = await HabitRepository.getHabits("ws-1");
    expect(Object.keys(source)).toEqual([]);
  });

  test("unselected habits remain unchanged", async () => {
    await HabitRepository.saveHabit(habit("habit-a", "ws-1"));
    await HabitRepository.saveHabit(habit("habit-b", "ws-1"));

    await bulkMoveHabits([{ id: "habit-a", sourceWorkspaceId: "ws-1", targetWorkspaceId: "ws-2" }]);

    const source = await HabitRepository.getHabits("ws-1");
    expect(source["habit-b"]).toBeDefined();
    expect(source["habit-b"].workspaceId).toBe("ws-1");
    expect(source["habit-b"].title).toBe("Habit habit-b");
    expect(source["habit-a"]).toBeUndefined();
  });

  test("habits from multiple source workspaces can be moved together", async () => {
    await HabitRepository.saveHabit(habit("habit-a", "ws-1"));
    await HabitRepository.saveHabit(habit("habit-b", "ws-3"));

    await bulkMoveHabits([
      { id: "habit-a", sourceWorkspaceId: "ws-1", targetWorkspaceId: "ws-2" },
      { id: "habit-b", sourceWorkspaceId: "ws-3", targetWorkspaceId: "ws-2" },
    ]);

    const dest = await HabitRepository.getHabits("ws-2");
    expect(dest["habit-a"].workspaceId).toBe("ws-2");
    expect(dest["habit-b"].workspaceId).toBe("ws-2");
    expect(await HabitRepository.getHabits("ws-1")).toEqual({});
    expect(await HabitRepository.getHabits("ws-3")).toEqual({});
  });

  test("moving to the Inbox workspace persists correctly", async () => {
    await HabitRepository.saveHabit(habit("habit-a", "ws-1"));

    await bulkMoveHabits([
      { id: "habit-a", sourceWorkspaceId: "ws-1", targetWorkspaceId: INBOX_WORKSPACE_ID },
    ]);

    const inbox = await HabitRepository.getHabits(INBOX_WORKSPACE_ID);
    expect(inbox["habit-a"]).toBeDefined();
    expect(inbox["habit-a"].workspaceId).toBe(INBOX_WORKSPACE_ID);
    expect(await HabitRepository.getHabits("ws-1")).toEqual({});
  });

  test("moving to the current workspace does not duplicate anything", async () => {
    await HabitRepository.saveHabit(habit("habit-a", "ws-2"));

    await bulkMoveHabits([
      { id: "habit-a", sourceWorkspaceId: "ws-2", targetWorkspaceId: "ws-2" },
    ]);

    const dest = await HabitRepository.getHabits("ws-2");
    expect(Object.keys(dest)).toEqual(["habit-a"]);
    expect(dest["habit-a"].workspaceId).toBe("ws-2");
  });

  test("IDs and all domain fields besides workspaceId/updatedAt are preserved", async () => {
    const original = habit("habit-a", "ws-1", {
      title: "Morning Run",
      categoryId: "health",
      recurrence: { frequency: "weekly", interval: 2, daysOfWeek: [1, 3, 5] },
      completionHistory: [
        { date: "2026-08-01", completedAt: 100 },
        { date: "2026-08-02", completedAt: 200 },
      ],
      streak: 3,
      bestStreak: 5,
      lastCompletedDate: "2026-08-02",
      reminder: {
        enabled: true,
        triggerAt: 12345,
        notificationIds: ["native-1"],
      },
      resourceIds: ["res-1"],
      createdAt: 42,
    });
    await HabitRepository.saveHabit(original);

    await bulkMoveHabits([{ id: "habit-a", sourceWorkspaceId: "ws-1", targetWorkspaceId: "ws-2" }]);

    const moved = (await HabitRepository.getHabits("ws-2"))["habit-a"];
    expect(moved.id).toBe("habit-a");
    const { workspaceId: _ws, updatedAt: _ua, ...restOfMoved } = moved as any;
    const { workspaceId: _ws2, updatedAt: _ua2, ...restOfOriginal } = original as any;
    expect(restOfMoved).toEqual(restOfOriginal);
  });

  test("the result survives a reload (fresh repository reads produce the same state)", async () => {
    await HabitRepository.saveHabit(habit("habit-a", "ws-1"));
    await HabitRepository.saveHabit(habit("habit-b", "ws-1"));

    await bulkMoveHabits([
      { id: "habit-a", sourceWorkspaceId: "ws-1", targetWorkspaceId: "ws-2" },
      { id: "habit-b", sourceWorkspaceId: "ws-1", targetWorkspaceId: "ws-2" },
    ]);

    // Simulate app reload: repository state is the source of truth and is
    // re-read from storage.
    const reloadedWs1 = await HabitRepository.getHabits("ws-1");
    const reloadedWs2 = await HabitRepository.getHabits("ws-2");
    expect(Object.keys(reloadedWs1)).toEqual([]);
    expect(Object.keys(reloadedWs2).sort()).toEqual(["habit-a", "habit-b"]);
    expect(reloadedWs2["habit-a"].workspaceId).toBe("ws-2");
    expect(reloadedWs2["habit-b"].workspaceId).toBe("ws-2");
  });

  test("bulk loop with skipEvents emits no events; moveHabit without skipEvents emits once", async () => {
    await HabitRepository.saveHabit(habit("habit-a", "ws-1"));
    await HabitRepository.saveHabit(habit("habit-b", "ws-1"));

    await bulkMoveHabits([
      { id: "habit-a", sourceWorkspaceId: "ws-1", targetWorkspaceId: "ws-2" },
      { id: "habit-b", sourceWorkspaceId: "ws-1", targetWorkspaceId: "ws-2" },
    ]);

    // Per-item events/analytics are skipped during the batch loop; the screen
    // emits one consolidated habits_changed event afterwards.
    expect(
      emitStateChangeSpy.mock.calls.filter((c) => c[0] === "habits_changed"),
    ).toHaveLength(0);
    expect(syncWidgetDataSpy).toHaveBeenCalled();
    expect(recordDailyHistorySnapshotSpy).not.toHaveBeenCalled();

    // A bare single move (no skipEvents) emits exactly one habits_changed.
    await HabitRepository.saveHabit(habit("habit-single", "ws-1"));
    await EntityCommandService.moveHabit(
      "habit-single",
      "ws-1",
      "ws-2",
      { skipAnalytics: true },
    );
    expect(emitStateChangeSpy).toHaveBeenCalledTimes(1);
    expect(emitStateChangeSpy).toHaveBeenCalledWith("habits_changed", undefined);
  });

  test("moveHabit throws when the habit does not exist in the source workspace", async () => {
    await expect(
      EntityCommandService.moveHabit("missing-habit", "ws-1", "ws-2"),
    ).rejects.toThrow("Habit missing-habit not found");
  });

  test("partial persistence failure: failed habit stays in source and is not duplicated in destination", async () => {
    await HabitRepository.saveHabit(habit("habit-ok", "ws-1"));
    await HabitRepository.saveHabit(habit("habit-fail", "ws-1"));

    const realSave = HabitRepository.saveHabit.bind(HabitRepository);
    jest.spyOn(HabitRepository, "saveHabit").mockImplementation(async (h: any) => {
      if (h.id === "habit-fail") throw new Error("persist failed");
      return realSave(h);
    });

    const moves = [
      { id: "habit-ok", sourceWorkspaceId: "ws-1", targetWorkspaceId: "ws-2" },
      { id: "habit-fail", sourceWorkspaceId: "ws-1", targetWorkspaceId: "ws-2" },
    ];
    // allSettled mirrors the screen flow: every move settles before state is
    // reconciled, so the observed repository state is final (no in-flight race).
    const results = await Promise.allSettled(
      moves.map((m) =>
        EntityCommandService.moveHabit(
          m.id,
          m.sourceWorkspaceId,
          m.targetWorkspaceId,
          { skipEvents: true, skipAnalytics: true },
        ),
      ),
    );
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);

    // Successful move persisted.
    const dest = await HabitRepository.getHabits("ws-2");
    expect(dest["habit-ok"]).toBeDefined();
    expect(dest["habit-ok"].workspaceId).toBe("ws-2");
    // Failed habit was never saved to destination and never deleted from source.
    expect(dest["habit-fail"]).toBeUndefined();
    const source = await HabitRepository.getHabits("ws-1");
    expect(source["habit-ok"]).toBeUndefined();
    expect(source["habit-fail"]).toBeDefined();
    expect(source["habit-fail"].workspaceId).toBe("ws-1");
  });

  test("updateHabit (the former bulk-move persistence route) rejects workspace movement", async () => {
    await HabitRepository.saveHabit(habit("habit-a", "ws-1"));
    await expect(
      EntityCommandService.updateHabit("habit-a", "ws-1", { workspaceId: "ws-2" }),
    ).rejects.toThrow("Workspace movement is not supported in updateHabit");
  });
});
