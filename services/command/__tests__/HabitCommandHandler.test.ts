import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { HabitCommandHandler } from "@/services/command/handlers/HabitCommandHandler";
import {
  HabitRepository,
  WorkspaceRepository,
  RecycleBinRepository,
} from "@/repositories";
import { GraphRepository } from "@/repositories/GraphRepository";
import { INBOX_WORKSPACE_ID, type Habit, type Workspace } from "@/shared/types/domain.types";
import { getTodayDateKey } from "@/shared/utils/domain-selectors";
import { PEBBLE_LOG_KEY } from "@/features/profile/services/pebble.service";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

function defer() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const habitFixture = (
  id: string,
  workspaceId: string,
  overrides: Partial<Habit> = {}
): Habit => ({
  id,
  workspaceId,
  title: `Habit ${id}`,
  recurrence: { frequency: "daily", interval: 1 },
  completionHistory: [],
  streak: 0,
  bestStreak: 0,
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1000,
  updatedAt: 1000,
  ...overrides,
});

async function bulkMoveHabits(
  moves: { id: string; sourceWorkspaceId: string; targetWorkspaceId: string }[]
) {
  await Promise.all(
    moves.map((move) =>
      EntityCommandService.moveHabit(
        move.id,
        move.sourceWorkspaceId,
        move.targetWorkspaceId,
        { skipEvents: true, skipAnalytics: true }
      )
    )
  );
}

async function pebbleRewardCount(rewardIdPrefix: string): Promise<number> {
  const raw = await AsyncStorage.getItem(PEBBLE_LOG_KEY);
  if (!raw) return 0;
  const log = JSON.parse(raw);
  return log.filter((e: any) =>
    String(e.rewardId || "").startsWith(rewardIdPrefix)
  ).length;
}

describe("HabitCommandHandler Suite", () => {
  const WS = "ws-habits";
  const WS_TARGET = "ws-habits-target";

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
    GraphRepository.resetCache?.();

    await WorkspaceRepository.saveWorkspace({
      id: WS,
      name: "Habits WS",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1,
      updatedAt: 1,
    } as Workspace);

    await WorkspaceRepository.saveWorkspace({
      id: WS_TARGET,
      name: "Habits Target WS",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1,
      updatedAt: 1,
    } as Workspace);

    await WorkspaceRepository.saveWorkspace({
      id: "ws-1",
      name: "Workspace 1",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1,
      updatedAt: 1,
    } as Workspace);

    await WorkspaceRepository.saveWorkspace({
      id: "ws-2",
      name: "Workspace 2",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1,
      updatedAt: 1,
    } as Workspace);

    await WorkspaceRepository.saveWorkspace({
      id: "ws-3",
      name: "Workspace 3",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1,
      updatedAt: 1,
    } as Workspace);

    await WorkspaceRepository.saveWorkspace({
      id: INBOX_WORKSPACE_ID,
      name: "Inbox",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1,
      updatedAt: 1,
    } as Workspace);

    jest.spyOn(require("@/services/events/state-events"), "emitStateChange").mockImplementation(() => {});
    jest.spyOn(require("@/services/analytics/productivity-history.service"), "recordDailyHistorySnapshot").mockResolvedValue(undefined);
    jest.spyOn(require("@/services/analytics/widget-data.service"), "syncWidgetData").mockResolvedValue(undefined);
  });

  // ===========================================================================
  // 1. Workspace Partition Lock & RMW Concurrency
  // ===========================================================================
  describe("workspace partition lock & RMW concurrency", () => {
    it("Test 1: should serialize updateHabit and completeHabit via workspace partition lock", async () => {
      const workspaceId = INBOX_WORKSPACE_ID;
      const habitId = "habit-rmw-1";

      await HabitRepository.saveHabitUnlocked({ id: habitId, title: "Initial Title", workspaceId });

      const originalGetHabits = HabitRepository.getHabits.bind(HabitRepository);

      let releaseOpA: () => void;
      const opAPaused = new Promise<void>((resolve) => {
        releaseOpA = resolve;
      });

      let getHabitsCallCount = 0;
      let opACompleted = false;

      jest.spyOn(HabitRepository, "getHabits").mockImplementation(async (wsId) => {
        getHabitsCallCount++;
        if (getHabitsCallCount === 1) {
          await opAPaused;
        }
        return originalGetHabits(wsId);
      });

      const opA = HabitCommandHandler.updateHabit(habitId, workspaceId, { title: "Title A" }, { skipAnalytics: true, skipEvents: true })
        .then((res) => {
          opACompleted = true;
          return res;
        });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const opB = HabitCommandHandler.updateHabit(habitId, workspaceId, { categoryId: "cat-1" }, { skipAnalytics: true, skipEvents: true });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(getHabitsCallCount).toBe(1);
      expect(opACompleted).toBe(false);

      releaseOpA!();
      await Promise.all([opA, opB]);

      expect(opACompleted).toBe(true);
      expect(getHabitsCallCount).toBeGreaterThanOrEqual(3);

      const finalHabits = await HabitRepository.getHabits(workspaceId);
      const finalHabit = finalHabits[habitId];

      expect(finalHabit.title).toBe("Title A");
      expect(finalHabit.categoryId).toBe("cat-1");
    });

    it("Test 2: deleteWorkspace vs updateHabit cannot produce a ghost Habit", async () => {
      const wsId = "ws-concurrent-habit";
      
      await WorkspaceRepository.saveWorkspaces([{ id: wsId, name: "Concurrent WS", emoji: "🧪", revision: 1, lifecycleGeneration: 1, createdAt: Date.now(), updatedAt: Date.now() }]);
      await HabitRepository.saveHabitUnlocked({ id: "h-ghost-1", title: "Original Habit", workspaceId: wsId });

      const originalGetHabits = HabitRepository.getHabits.bind(HabitRepository);
      
      let releaseOpA: () => void;
      const opAPaused = new Promise<void>((resolve) => {
        releaseOpA = resolve;
      });
      
      let getHabitsCallCount = 0;

      jest.spyOn(HabitRepository, "getHabits").mockImplementation(async (wId) => {
        if (wId === wsId) {
          getHabitsCallCount++;
          if (getHabitsCallCount === 1) {
            await opAPaused;
          }
        }
        return originalGetHabits(wId);
      });

      const opA = HabitCommandHandler.updateHabit("h-ghost-1", wsId, { title: "Mutated Title" }, { skipAnalytics: true, skipEvents: true });

      await new Promise((resolve) => setTimeout(resolve, 50));

      let opBHasRead = false;
      jest.spyOn(HabitRepository, "getHabits").mockImplementationOnce(async (wId) => {
        opBHasRead = true;
        return originalGetHabits(wId);
      });

      const opB = (EntityCommandService.deleteWorkspace as any)(wsId, { skipAnalytics: true });

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(opBHasRead).toBe(false);

      releaseOpA!();
      await opA;
      await opB;

      const finalHabits = await HabitRepository.getHabits(wsId);
      expect(Object.keys(finalHabits)).toHaveLength(0);
    });

    it("Test 3: should serialize completeHabit and updateHabit via workspace partition lock", async () => {
      const workspaceId = INBOX_WORKSPACE_ID;
      const habitId = "habit-rmw-2";

      await HabitRepository.saveHabitUnlocked({ id: habitId, title: "Workout", workspaceId, completionHistory: [] });

      const originalGetHabits = HabitRepository.getHabits.bind(HabitRepository);

      let releaseOpA: () => void;
      const opAPaused = new Promise<void>((resolve) => {
        releaseOpA = resolve;
      });

      let getHabitsCallCount = 0;
      jest.spyOn(HabitRepository, "getHabits").mockImplementation(async (wsId) => {
        getHabitsCallCount++;
        if (getHabitsCallCount === 1) {
          await opAPaused;
        }
        return originalGetHabits(wsId);
      });

      const opA = HabitCommandHandler.completeHabit(habitId, workspaceId, { skipAnalytics: true, skipEvents: true });

      await new Promise((resolve) => setTimeout(resolve, 50));

      let opBStartedRead = false;
      jest.spyOn(HabitRepository, "getHabits").mockImplementationOnce(async (wsId) => {
        opBStartedRead = true;
        return originalGetHabits(wsId);
      });

      const opB = HabitCommandHandler.updateHabit(habitId, workspaceId, { title: "Updated Workout Title" }, { skipAnalytics: true, skipEvents: true });

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(opBStartedRead).toBe(false);

      releaseOpA!();
      await Promise.all([opA, opB]);

      const finalHabits = await HabitRepository.getHabits(workspaceId);
      const finalHabit = finalHabits[habitId];

      expect(finalHabit.title).toBe("Updated Workout Title");
      expect(finalHabit.completionHistory?.length).toBe(1);
    });

    it("Test 4: should serialize uncompleteHabit and updateHabit via workspace partition lock", async () => {
      const workspaceId = INBOX_WORKSPACE_ID;
      const habitId = "habit-rmw-3";
      const today = getTodayDateKey();

      await HabitRepository.saveHabitUnlocked({
        id: habitId,
        title: "Meditation",
        workspaceId,
        completionHistory: [{ date: today, completedAt: Date.now() }],
      });

      const originalGetHabits = HabitRepository.getHabits.bind(HabitRepository);

      let releaseOpA: () => void;
      const opAPaused = new Promise<void>((resolve) => {
        releaseOpA = resolve;
      });

      let getHabitsCallCount = 0;
      jest.spyOn(HabitRepository, "getHabits").mockImplementation(async (wsId) => {
        getHabitsCallCount++;
        if (getHabitsCallCount === 1) {
          await opAPaused;
        }
        return originalGetHabits(wsId);
      });

      const opA = HabitCommandHandler.uncompleteHabit(habitId, workspaceId, { skipAnalytics: true, skipEvents: true });

      await new Promise((resolve) => setTimeout(resolve, 50));

      let opBStartedRead = false;
      jest.spyOn(HabitRepository, "getHabits").mockImplementationOnce(async (wsId) => {
        opBStartedRead = true;
        return originalGetHabits(wsId);
      });

      const opB = HabitCommandHandler.updateHabit(habitId, workspaceId, { title: "Updated Meditation" }, { skipAnalytics: true, skipEvents: true });

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(opBStartedRead).toBe(false);

      releaseOpA!();
      await Promise.all([opA, opB]);

      const finalHabits = await HabitRepository.getHabits(workspaceId);
      const finalHabit = finalHabits[habitId];

      expect(finalHabit.title).toBe("Updated Meditation");
      expect(finalHabit.completionHistory?.length).toBe(0);
    });

    it("Test 5: should serialize recoverHabitStreak and updateHabit via workspace partition lock", async () => {
      const workspaceId = INBOX_WORKSPACE_ID;
      const habitId = "habit-rmw-4";

      await HabitRepository.saveHabitUnlocked({
        id: habitId,
        title: "Read Book",
        workspaceId,
        streak: 5,
        streakBrokenAt: Date.now() - 86400000,
        completionHistory: [],
      });

      const originalGetHabits = HabitRepository.getHabits.bind(HabitRepository);

      let releaseOpA: () => void;
      const opAPaused = new Promise<void>((resolve) => {
        releaseOpA = resolve;
      });

      let getHabitsCallCount = 0;
      jest.spyOn(HabitRepository, "getHabits").mockImplementation(async (wsId) => {
        getHabitsCallCount++;
        if (getHabitsCallCount === 1) {
          await opAPaused;
        }
        return originalGetHabits(wsId);
      });

      const opA = HabitCommandHandler.recoverHabitStreak(habitId, workspaceId, { skipAnalytics: true, skipEvents: true });

      await new Promise((resolve) => setTimeout(resolve, 50));

      let opBStartedRead = false;
      jest.spyOn(HabitRepository, "getHabits").mockImplementationOnce(async (wsId) => {
        opBStartedRead = true;
        return originalGetHabits(wsId);
      });

      const opB = HabitCommandHandler.updateHabit(habitId, workspaceId, { title: "Updated Read Book" }, { skipAnalytics: true, skipEvents: true });

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(opBStartedRead).toBe(false);

      releaseOpA!();
      await Promise.all([opA, opB]);

      const finalHabits = await HabitRepository.getHabits(workspaceId);
      const finalHabit = finalHabits[habitId];

      expect(finalHabit.title).toBe("Updated Read Book");
      expect((finalHabit as any).streakBrokenAt).toBeUndefined();
    });

    it("Test 6: should serialize moveHabit and updateHabit to prevent stale-read data loss", async () => {
      const habitId = "habit-rmw-5";
      const sourceWs = "ws-source";
      const targetWs = "ws-target";

      await WorkspaceRepository.saveWorkspaces([
        { id: sourceWs, name: "Source", revision: 1, lifecycleGeneration: 1, createdAt: Date.now(), updatedAt: Date.now() },
        { id: targetWs, name: "Target", revision: 1, lifecycleGeneration: 1, createdAt: Date.now(), updatedAt: Date.now() },
      ]);
      await HabitRepository.saveHabitUnlocked({ id: habitId, title: "Original Title", workspaceId: sourceWs });

      const originalGetHabits = HabitRepository.getHabits.bind(HabitRepository);

      let releaseMove: () => void;
      const movePaused = new Promise<void>((resolve) => {
        releaseMove = resolve;
      });

      let getHabitsCallCount = 0;
      jest.spyOn(HabitRepository, "getHabits").mockImplementation(async (wsId) => {
        if (wsId === sourceWs) {
          getHabitsCallCount++;
          if (getHabitsCallCount === 1) {
            await movePaused;
          }
        }
        return originalGetHabits(wsId);
      });

      const moveOp = HabitCommandHandler.moveHabit(habitId, sourceWs, targetWs, { skipAnalytics: true, skipEvents: true });

      await new Promise((resolve) => setTimeout(resolve, 50));

      let updateStarted = false;
      jest.spyOn(HabitRepository, "getHabits").mockImplementationOnce(async (wsId) => {
        updateStarted = true;
        return originalGetHabits(wsId);
      });

      const updateOp = HabitCommandHandler.updateHabit(habitId, sourceWs, { title: "Stale Update" }, { skipAnalytics: true, skipEvents: true })
        .catch((e) => e);

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(updateStarted).toBe(false);

      releaseMove!();
      await moveOp;
      await updateOp;

      const sourceHabits = await HabitRepository.getHabits(sourceWs);
      const targetHabits = await HabitRepository.getHabits(targetWs);

      expect(sourceHabits[habitId]).toBeUndefined();
      expect(targetHabits[habitId]).toBeDefined();
      expect(targetHabits[habitId].title).toBe("Original Title");
    });

    it("Test 7: should safely serialize cross-workspace moveHabit operations without deadlocks", async () => {
      const h1 = "habit-dl-1";
      const h2 = "habit-dl-2";
      const wsA = "ws-deadlock-a";
      const wsB = "ws-deadlock-b";

      await WorkspaceRepository.saveWorkspaces([
        { id: wsA, name: "WS A", revision: 1, lifecycleGeneration: 1, createdAt: Date.now(), updatedAt: Date.now() },
        { id: wsB, name: "WS B", revision: 1, lifecycleGeneration: 1, createdAt: Date.now(), updatedAt: Date.now() },
      ]);
      await HabitRepository.saveHabitUnlocked({ id: h1, title: "H1", workspaceId: wsA });
      await HabitRepository.saveHabitUnlocked({ id: h2, title: "H2", workspaceId: wsB });

      const op1 = HabitCommandHandler.moveHabit(h1, wsA, wsB, { skipAnalytics: true, skipEvents: true });
      const op2 = HabitCommandHandler.moveHabit(h2, wsB, wsA, { skipAnalytics: true, skipEvents: true });

      await Promise.all([op1, op2]);

      const habitsA = await HabitRepository.getHabits(wsA);
      const habitsB = await HabitRepository.getHabits(wsB);

      expect(habitsA[h2]).toBeDefined();
      expect(habitsB[h1]).toBeDefined();
      expect(habitsA[h1]).toBeUndefined();
      expect(habitsB[h2]).toBeUndefined();
    });

    it("Test 8: should serialize recycleHabit and updateHabit to prevent lost updates or ghost resurrects", async () => {
      const habitId = "habit-rmw-6";
      const workspaceId = INBOX_WORKSPACE_ID;

      await HabitRepository.saveHabitUnlocked({ id: habitId, title: "Recycle Habit", workspaceId });

      const originalGetHabits = HabitRepository.getHabits.bind(HabitRepository);

      let releaseRecycle: () => void;
      const recyclePaused = new Promise<void>((resolve) => {
        releaseRecycle = resolve;
      });

      let getHabitsCallCount = 0;
      jest.spyOn(HabitRepository, "getHabits").mockImplementation(async (wsId) => {
        getHabitsCallCount++;
        if (getHabitsCallCount === 1) {
          await recyclePaused;
        }
        return originalGetHabits(wsId);
      });

      const recycleOp = HabitCommandHandler.recycleHabit(habitId, workspaceId, { skipEvents: true });

      await new Promise((resolve) => setTimeout(resolve, 50));

      let updateStarted = false;
      jest.spyOn(HabitRepository, "getHabits").mockImplementationOnce(async (wsId) => {
        updateStarted = true;
        return originalGetHabits(wsId);
      });

      const updateOp = HabitCommandHandler.updateHabit(habitId, workspaceId, { title: "Zombie Update" }, { skipAnalytics: true, skipEvents: true })
        .catch((e) => e);

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(updateStarted).toBe(false);

      releaseRecycle!();
      await recycleOp;
      await updateOp;

      const activeHabits = await HabitRepository.getHabits(workspaceId);
      expect(activeHabits[habitId]).toBeUndefined();

      const binItems = await RecycleBinRepository.getRecycleBinItems();
      expect(binItems.some((b) => b.entityId === habitId)).toBe(true);
    });

    it("Test 9: restoreHabit vs recycleHabit prevents stale bin array overwrite", async () => {
      const h1 = "habit-restore-1";
      const h2 = "habit-restore-2";
      const workspaceId = INBOX_WORKSPACE_ID;

      await HabitRepository.saveHabitUnlocked({ id: h2, title: "H2 Active", workspaceId });

      await RecycleBinRepository.addToRecycleBin("habit", { id: h1, title: "H1 Snapshot", workspaceId }, workspaceId);

      const binItems = await RecycleBinRepository.getRecycleBinItems();
      const h1BinItem = binItems.find((i) => i.entityId === h1)!;

      const originalGetRecycleBinItems = RecycleBinRepository.getRecycleBinItems.bind(RecycleBinRepository);

      let releaseRestore: () => void;
      const restorePaused = new Promise<void>((resolve) => {
        releaseRestore = resolve;
      });

      let getBinCallCount = 0;
      jest.spyOn(RecycleBinRepository, "getRecycleBinItems").mockImplementation(async () => {
        getBinCallCount++;
        if (getBinCallCount === 2) {
          await restorePaused;
        }
        return originalGetRecycleBinItems();
      });

      const restoreOp = HabitCommandHandler.restoreHabit(h1BinItem.id, { skipEvents: true });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const recycleOp = HabitCommandHandler.recycleHabit(h2, workspaceId, { skipEvents: true });

      await new Promise((resolve) => setTimeout(resolve, 50));

      releaseRestore!();
      await restoreOp;
      await recycleOp;

      const finalBin = await RecycleBinRepository.getRecycleBinItems();
      expect(finalBin.some((b) => b.entityId === h2)).toBe(true);
      expect(finalBin.some((b) => b.entityId === h1)).toBe(false);

      const active = await HabitRepository.getHabits(workspaceId);
      expect(active[h1]).toBeDefined();
      expect(active[h2]).toBeUndefined();
    });

    it("Test 10: should serialize restoreHabit vs updateHabit via partition lock", async () => {
      const workspaceId = INBOX_WORKSPACE_ID;
      const habitId = "habit-restore-lock-1";
      const rbId = `rb-${habitId}`;

      await RecycleBinRepository.addToRecycleBin("habit", {
        id: habitId,
        workspaceId,
        title: "Restored Title",
      }, workspaceId);

      await HabitRepository.saveHabitUnlocked({
        id: habitId,
        workspaceId,
        title: "Active Title",
      });

      const originalGetRecycleBinItems = RecycleBinRepository.getRecycleBinItems.bind(RecycleBinRepository);
      const restoreReadStarted = defer();
      const resumeRestoreRead = defer();

      let getRecycleBinItemsCallCount = 0;
      const rbSpy = jest.spyOn(RecycleBinRepository, "getRecycleBinItems").mockImplementation(async () => {
        getRecycleBinItemsCallCount++;
        if (getRecycleBinItemsCallCount === 2) {
          restoreReadStarted.resolve();
          await resumeRestoreRead.promise;
        }
        return originalGetRecycleBinItems();
      });

      const restorePromise = HabitCommandHandler.restoreHabit(rbId, { skipEvents: true, skipAnalytics: true });
      await restoreReadStarted.promise;

      const originalGetHabits = HabitRepository.getHabits.bind(HabitRepository);
      let updateStartedRead = false;
      const habitsSpy = jest.spyOn(HabitRepository, "getHabits").mockImplementationOnce(async (wsId) => {
        if (wsId === workspaceId) updateStartedRead = true;
        return originalGetHabits(wsId);
      });

      const updatePromise = HabitCommandHandler.updateHabit(
        habitId,
        workspaceId,
        { title: "Updated Active Title" },
        { skipEvents: true, skipAnalytics: true }
      );

      try {
        await new Promise((r) => setTimeout(r, 50));
        expect(updateStartedRead).toBe(false);
      } finally {
        resumeRestoreRead.resolve();
        await restorePromise;
        await updatePromise;
        rbSpy.mockRestore();
        habitsSpy.mockRestore();
      }

      const finalHabits = await HabitRepository.getHabits(workspaceId);
      expect(finalHabits[habitId].title).toBe("Updated Active Title");
    });

    it("Test 11: should prevent restoreHabit from destroying concurrent Recycle Bin additions", async () => {
      const workspaceId = INBOX_WORKSPACE_ID;
      const habitId1 = "habit-restore-1";
      const habitId2 = "habit-restore-2";
      const rbId1 = `rb-${habitId1}`;

      await RecycleBinRepository.removeRecycleBinItems((await RecycleBinRepository.getRecycleBinItems()).map((i) => i.id));

      await RecycleBinRepository.addToRecycleBin("habit", {
        id: habitId1,
        workspaceId,
        title: "H1",
      }, workspaceId);

      const originalGetRecycleBinItems = RecycleBinRepository.getRecycleBinItems.bind(RecycleBinRepository);
      const restoreReadStarted = defer();
      const resumeRestoreRead = defer();

      let getRecycleBinItemsCallCount = 0;
      const rbSpy = jest.spyOn(RecycleBinRepository, "getRecycleBinItems").mockImplementation(async () => {
        getRecycleBinItemsCallCount++;
        if (getRecycleBinItemsCallCount === 2) {
          restoreReadStarted.resolve();
          await resumeRestoreRead.promise;
        }
        return originalGetRecycleBinItems();
      });

      const restorePromise = HabitCommandHandler.restoreHabit(rbId1, { skipEvents: true, skipAnalytics: true });
      await restoreReadStarted.promise;

      await RecycleBinRepository.addToRecycleBin("habit", {
        id: habitId2,
        workspaceId,
        title: "H2",
      }, workspaceId);

      try {
        resumeRestoreRead.resolve();
        await restorePromise;
      } finally {
        rbSpy.mockRestore();
      }

      const finalBin = await RecycleBinRepository.getRecycleBinItems();
      expect(finalBin.find((i) => i.entityId === habitId2)).toBeDefined();
      expect(finalBin.find((i) => i.entityId === habitId1)).toBeUndefined();
    });

    it("Test 12: should serialize permanentlyDeleteHabit and moveHabit to prevent stale-read side effects", async () => {
      const workspace1 = "ws-perm-del-test-1";
      const workspace2 = "ws-perm-del-test-2";
      const habitId = "habit-perm-del-1";

      await WorkspaceRepository.saveWorkspace({
        id: workspace1,
        name: "WS 1",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await WorkspaceRepository.saveWorkspace({
        id: workspace2,
        name: "WS 2",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await HabitRepository.saveHabitUnlocked({
        id: habitId,
        workspaceId: workspace1,
        title: "Habit to delete",
      });

      const originalGetHabits = HabitRepository.getHabits.bind(HabitRepository);

      let resolveDeleteRead: () => void;
      const deleteReadStarted = new Promise<void>((r) => { resolveDeleteRead = r; });

      let resolveResumeDelete: () => void;
      const resumeDelete = new Promise<void>((r) => { resolveResumeDelete = r; });

      let getHabitsCallCount = 0;
      let moveStartedRead = false;
      const getHabitsSpy = jest.spyOn(HabitRepository, "getHabits").mockImplementation(async (wsId) => {
        if (wsId === workspace1) {
          getHabitsCallCount++;
          if (getHabitsCallCount === 1) {
            resolveDeleteRead();
            await resumeDelete;
          } else {
            moveStartedRead = true;
          }
        }
        return originalGetHabits(wsId);
      });

      const deletePromise = HabitCommandHandler.permanentlyDeleteHabit(habitId, workspace1, { skipEvents: true });
      await deleteReadStarted;

      const movePromise = HabitCommandHandler.moveHabit(habitId, workspace2, workspace1, { skipEvents: true });

      try {
        await new Promise((r) => setTimeout(r, 50));
        expect(moveStartedRead).toBe(false);

        resolveResumeDelete!();
        await deletePromise;

        await expect(movePromise).rejects.toThrow(/not found/i);

        const ws2Habits = await HabitRepository.getHabits(workspace2);
        expect(ws2Habits[habitId]).toBeUndefined();

        const ws1Habits = await HabitRepository.getHabits(workspace1);
        expect(ws1Habits[habitId]).toBeUndefined();
      } finally {
        resolveResumeDelete!();
        getHabitsSpy.mockRestore();
      }
    });
  });

  // ===========================================================================
  // 2. CompleteHabits Concurrency and Reward Atomicity
  // ===========================================================================
  describe("completeHabits concurrency and reward atomicity", () => {
    it("concurrent double completion of the same habit rewards exactly once", async () => {
      await HabitRepository.saveHabit(habitFixture("h-double", WS));
      const today = getTodayDateKey();

      await Promise.all([
        EntityCommandService.completeHabits(
          [{ habitId: "h-double", workspaceId: WS }],
          { source: "test" }
        ),
        EntityCommandService.completeHabits(
          [{ habitId: "h-double", workspaceId: WS }],
          { source: "test" }
        ),
      ]);

      const habit = (await HabitRepository.getHabits(WS))["h-double"];
      const todayEntries = (habit.completionHistory || []).filter(
        (c) => c.date === today
      );
      expect(todayEntries).toHaveLength(1);
      expect(await pebbleRewardCount(`habit:h-double:${today}`)).toBe(1);
    });

    it("a habit moved out of the selected workspace is left untouched (no reward, no corruption)", async () => {
      await HabitRepository.saveHabit(habitFixture("h-move", WS));

      await EntityCommandService.moveHabit("h-move", WS, WS_TARGET, {
        skipEvents: true,
        skipAnalytics: true,
      });

      const result = await EntityCommandService.completeHabits(
        [{ habitId: "h-move", workspaceId: WS }],
        { source: "test" }
      );

      const sourceWs = await HabitRepository.getHabits(WS);
      expect(sourceWs["h-move"]).toBeUndefined();

      const targetWs = await HabitRepository.getHabits(WS_TARGET);
      expect(targetWs["h-move"]).toBeDefined();
      expect(targetWs["h-move"].completionHistory || []).toHaveLength(0);

      expect(await pebbleRewardCount("habit:h-move:")).toBe(0);
      expect(result).toEqual([]);
    });

    it("a concurrently recycled habit is never resurrected or rewarded", async () => {
      await HabitRepository.saveHabit(habitFixture("h-recycle", WS));

      await EntityCommandService.recycleHabit("h-recycle", WS, {
        skipEvents: true,
        skipAnalytics: true,
      });

      const result = await EntityCommandService.completeHabits(
        [{ habitId: "h-recycle", workspaceId: WS }],
        { source: "test" }
      );

      const active = await HabitRepository.getHabits(WS);
      expect(active["h-recycle"]).toBeUndefined();

      const bin = await RecycleBinRepository.getRecycleBinItems();
      expect(bin.filter((b) => b.entityId === "h-recycle")).toHaveLength(1);

      expect(await pebbleRewardCount("habit:h-recycle:")).toBe(0);
      expect(result).toEqual([]);
    });

    it("a mid-batch failure does not abort the remaining habits nor suppress events for committed ones", async () => {
      await HabitRepository.saveHabit(habitFixture("h-a", WS));
      await HabitRepository.saveHabit(habitFixture("h-b", WS));
      await HabitRepository.saveHabit(habitFixture("h-c", WS));
      const today = getTodayDateKey();

      const originalCompleteHabit = HabitCommandHandler.completeHabit;
      let call = 0;
      jest
        .spyOn(HabitCommandHandler, "completeHabit")
        .mockImplementation(async (habitId: string, workspaceId: string, opts?: any) => {
          call++;
          if (call === 2) {
            throw new Error("injected lifecycle conflict on h-b");
          }
          return originalCompleteHabit.call(
            HabitCommandHandler,
            habitId,
            workspaceId,
            opts
          );
        });

      const emitSpy = jest.spyOn(require("@/services/events/state-events"), "emitStateChange");

      const result = await EntityCommandService.completeHabits(
        [
          { habitId: "h-a", workspaceId: WS },
          { habitId: "h-b", workspaceId: WS },
          { habitId: "h-c", workspaceId: WS },
        ],
        { source: "test" }
      );

      const active = await HabitRepository.getHabits(WS);
      expect(
        (active["h-a"].completionHistory || []).filter((c) => c.date === today)
      ).toHaveLength(1);
      expect(
        (active["h-c"].completionHistory || []).filter((c) => c.date === today)
      ).toHaveLength(1);
      expect(active["h-b"].completionHistory || []).toHaveLength(0);

      expect(await pebbleRewardCount(`habit:h-a:${today}`)).toBe(1);
      expect(await pebbleRewardCount(`habit:h-c:${today}`)).toBe(1);
      expect(await pebbleRewardCount(`habit:h-b:${today}`)).toBe(0);

      expect(emitSpy).toHaveBeenCalledWith("habits_changed", "test");
      expect(result.map((h) => h.id).sort()).toEqual(["h-a", "h-c"]);
    });

    it("repeated invocation is idempotent — no duplicate completions or rewards", async () => {
      await HabitRepository.saveHabit(habitFixture("h-idem", WS));
      const today = getTodayDateKey();

      await EntityCommandService.completeHabits(
        [{ habitId: "h-idem", workspaceId: WS }],
        { source: "test" }
      );
      await EntityCommandService.completeHabits(
        [{ habitId: "h-idem", workspaceId: WS }],
        { source: "test" }
      );

      const habit = (await HabitRepository.getHabits(WS))["h-idem"];
      const todayEntries = (habit.completionHistory || []).filter(
        (c) => c.date === today
      );
      expect(todayEntries).toHaveLength(1);
      expect(await pebbleRewardCount(`habit:h-idem:${today}`)).toBe(1);
    });
  });

  // ===========================================================================
  // 3. Habit Movement & Bulk-Move Persistence
  // ===========================================================================
  describe("habit movement & bulk-move persistence", () => {
    test("single habit move persists the destination workspaceId and survives reload", async () => {
      await HabitRepository.saveHabit(habitFixture("habit-a", "ws-1"));

      await bulkMoveHabits([{ id: "habit-a", sourceWorkspaceId: "ws-1", targetWorkspaceId: "ws-2" }]);

      const dest = await HabitRepository.getHabits("ws-2");
      expect(dest["habit-a"]).toBeDefined();
      expect(dest["habit-a"].workspaceId).toBe("ws-2");

      const source = await HabitRepository.getHabits("ws-1");
      expect(source["habit-a"]).toBeUndefined();

      const reloaded = await HabitRepository.getHabits("ws-2");
      expect(reloaded["habit-a"].workspaceId).toBe("ws-2");
    });

    test("bulk move persists every selected habit to the destination workspace", async () => {
      await HabitRepository.saveHabit(habitFixture("habit-a", "ws-1"));
      await HabitRepository.saveHabit(habitFixture("habit-c", "ws-1"));
      await HabitRepository.saveHabit(habitFixture("habit-d", "ws-1"));

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
      expect(Object.keys(dest).length).toBe(new Set(Object.keys(dest)).size);
      const source = await HabitRepository.getHabits("ws-1");
      expect(Object.keys(source)).toEqual([]);
    });

    test("unselected habits remain unchanged", async () => {
      await HabitRepository.saveHabit(habitFixture("habit-a", "ws-1"));
      await HabitRepository.saveHabit(habitFixture("habit-b", "ws-1"));

      await bulkMoveHabits([{ id: "habit-a", sourceWorkspaceId: "ws-1", targetWorkspaceId: "ws-2" }]);

      const source = await HabitRepository.getHabits("ws-1");
      expect(source["habit-b"]).toBeDefined();
      expect(source["habit-b"].workspaceId).toBe("ws-1");
      expect(source["habit-b"].title).toBe("Habit habit-b");
      expect(source["habit-a"]).toBeUndefined();
    });

    test("bulkMoveHabits command: habits from multiple source workspaces can be moved together", async () => {
      await HabitRepository.saveHabit(habitFixture("habit-a", "ws-1"));
      await HabitRepository.saveHabit(habitFixture("habit-b", "ws-3"));

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

    test("bulkMoveHabits command: moving to the Inbox workspace persists correctly", async () => {
      await HabitRepository.saveHabit(habitFixture("habit-a", "ws-1"));

      await bulkMoveHabits([
        { id: "habit-a", sourceWorkspaceId: "ws-1", targetWorkspaceId: INBOX_WORKSPACE_ID },
      ]);

      const inbox = await HabitRepository.getHabits(INBOX_WORKSPACE_ID);
      expect(inbox["habit-a"]).toBeDefined();
      expect(inbox["habit-a"].workspaceId).toBe(INBOX_WORKSPACE_ID);
      expect(await HabitRepository.getHabits("ws-1")).toEqual({});
    });

    test("moving to the current workspace does not duplicate anything", async () => {
      await HabitRepository.saveHabit(habitFixture("habit-a", "ws-2"));

      await bulkMoveHabits([
        { id: "habit-a", sourceWorkspaceId: "ws-2", targetWorkspaceId: "ws-2" },
      ]);

      const dest = await HabitRepository.getHabits("ws-2");
      expect(Object.keys(dest)).toEqual(["habit-a"]);
      expect(dest["habit-a"].workspaceId).toBe("ws-2");
    });

    test("IDs and all domain fields besides workspaceId/updatedAt are preserved", async () => {
      const original = habitFixture("habit-a", "ws-1", {
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
      const { workspaceId: _ws, updatedAt: _ua, revision: _rev, ...restOfMoved } = moved as any;
      const { workspaceId: _ws2, updatedAt: _ua2, revision: _rev2, ...restOfOriginal } = original as any;
      expect(restOfMoved).toEqual(restOfOriginal);
    });

    test("the result survives a reload (fresh repository reads produce the same state)", async () => {
      await HabitRepository.saveHabit(habitFixture("habit-a", "ws-1"));
      await HabitRepository.saveHabit(habitFixture("habit-b", "ws-1"));

      await bulkMoveHabits([
        { id: "habit-a", sourceWorkspaceId: "ws-1", targetWorkspaceId: "ws-2" },
        { id: "habit-b", sourceWorkspaceId: "ws-1", targetWorkspaceId: "ws-2" },
      ]);

      const reloadedWs1 = await HabitRepository.getHabits("ws-1");
      const reloadedWs2 = await HabitRepository.getHabits("ws-2");
      expect(Object.keys(reloadedWs1)).toEqual([]);
      expect(Object.keys(reloadedWs2).sort()).toEqual(["habit-a", "habit-b"]);
      expect(reloadedWs2["habit-a"].workspaceId).toBe("ws-2");
      expect(reloadedWs2["habit-b"].workspaceId).toBe("ws-2");
    });

    test("bulk loop with skipEvents emits no events; moveHabit without skipEvents emits once", async () => {
      const emitStateChangeSpy = jest.spyOn(require("@/services/events/state-events"), "emitStateChange");
      const syncWidgetDataSpy = jest.spyOn(require("@/services/analytics/widget-data.service"), "syncWidgetData");
      const recordDailyHistorySnapshotSpy = jest.spyOn(require("@/services/analytics/productivity-history.service"), "recordDailyHistorySnapshot");

      await HabitRepository.saveHabit(habitFixture("habit-a", "ws-1"));
      await HabitRepository.saveHabit(habitFixture("habit-b", "ws-1"));

      await bulkMoveHabits([
        { id: "habit-a", sourceWorkspaceId: "ws-1", targetWorkspaceId: "ws-2" },
        { id: "habit-b", sourceWorkspaceId: "ws-1", targetWorkspaceId: "ws-2" },
      ]);

      expect(
        emitStateChangeSpy.mock.calls.filter((c) => c[0] === "habits_changed")
      ).toHaveLength(0);
      expect(syncWidgetDataSpy).toHaveBeenCalled();
      expect(recordDailyHistorySnapshotSpy).not.toHaveBeenCalled();

      await HabitRepository.saveHabit(habitFixture("habit-single", "ws-1"));
      await EntityCommandService.moveHabit(
        "habit-single",
        "ws-1",
        "ws-2",
        { skipAnalytics: true }
      );
      expect(emitStateChangeSpy).toHaveBeenCalledWith("habits_changed", undefined);
    });

    test("moveHabit throws when the habit does not exist in the source workspace", async () => {
      await expect(
        EntityCommandService.moveHabit("missing-habit", "ws-1", "ws-2")
      ).rejects.toThrow("Habit missing-habit not found");
    });

    test("partial persistence failure: failed habit stays in source and is not duplicated in destination", async () => {
      await HabitRepository.saveHabit(habitFixture("habit-ok", "ws-1"));
      await HabitRepository.saveHabit(habitFixture("habit-fail", "ws-1"));

      const realSave = HabitRepository.saveHabitUnlocked.bind(HabitRepository);
      jest.spyOn(HabitRepository, "saveHabitUnlocked").mockImplementation(async (h: any) => {
        if (h.id === "habit-fail") throw new Error("persist failed");
        return realSave(h);
      });

      const moves = [
        { id: "habit-ok", sourceWorkspaceId: "ws-1", targetWorkspaceId: "ws-2" },
        { id: "habit-fail", sourceWorkspaceId: "ws-1", targetWorkspaceId: "ws-2" },
      ];
      const results = await Promise.allSettled(
        moves.map((m) =>
          EntityCommandService.moveHabit(
            m.id,
            m.sourceWorkspaceId,
            m.targetWorkspaceId,
            { skipEvents: true, skipAnalytics: true }
          )
        )
      );
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);

      const dest = await HabitRepository.getHabits("ws-2");
      expect(dest["habit-ok"]).toBeDefined();
      expect(dest["habit-ok"].workspaceId).toBe("ws-2");
      expect(dest["habit-fail"]).toBeUndefined();

      const source = await HabitRepository.getHabits("ws-1");
      expect(source["habit-ok"]).toBeUndefined();
      expect(source["habit-fail"]).toBeDefined();
      expect(source["habit-fail"].workspaceId).toBe("ws-1");
    });

    test("updateHabit (the former bulk-move persistence route) rejects workspace movement", async () => {
      await HabitRepository.saveHabit(habitFixture("habit-a", "ws-1"));
      await expect(
        EntityCommandService.updateHabit("habit-a", "ws-1", { workspaceId: "ws-2" })
      ).rejects.toThrow("Workspace movement is not supported in updateHabit");
    });
  });
});
