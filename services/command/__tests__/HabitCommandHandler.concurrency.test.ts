import { HabitCommandHandler } from "../handlers/HabitCommandHandler";
import { HabitRepository, WorkspaceRepository, RecycleBinRepository } from "@/repositories";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { EntityCommandService } from "../EntityCommandService";
import AsyncStorage from "@react-native-async-storage/async-storage";

function defer() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// Mock getHabitCurrentStreak to prevent completion errors during test
jest.mock("@/shared/utils/domain-selectors", () => {
  const original = jest.requireActual("@/shared/utils/domain-selectors");
  return {
    ...original,
    getHabitCurrentStreak: jest.fn(() => 1),
    getHabitBestStreak: jest.fn(() => 1),
    isHabitCompletedToday: jest.fn(() => false),
    getTodayDateKey: jest.fn(() => "2026-08-23"),
    getHabitLastCompletedDate: jest.fn(() => "2026-08-23"),
  };
});

describe("HabitCommandHandler Concurrency", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

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

      // Pause the FIRST read (Operation A's initial read inside the lock)
      if (getHabitsCallCount === 1) {
        await opAPaused;
      }

      return originalGetHabits(wsId);
    });

    // Start Operation A: updateHabit (reads and blocks)
    const opA = HabitCommandHandler.updateHabit(habitId, workspaceId, { title: "Title A" }, { skipAnalytics: true, skipEvents: true })
      .then((res) => {
        opACompleted = true;
        return res;
      });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Start Operation B: updateHabit (updating a different field to simulate a concurrent mutation)
    const opB = HabitCommandHandler.updateHabit(habitId, workspaceId, { categoryId: "cat-1" }, { skipAnalytics: true, skipEvents: true });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Prove Operation B is blocked
    expect(getHabitsCallCount).toBe(1);
    expect(opACompleted).toBe(false);

    releaseOpA!();

    await Promise.all([opA, opB]);

    expect(opACompleted).toBe(true);
    expect(getHabitsCallCount).toBeGreaterThanOrEqual(3);

    // Verify data invariant (no lost updates)
    const finalHabits = await HabitRepository.getHabits(workspaceId);
    const finalHabit = finalHabits[habitId];

    expect(finalHabit.title).toBe("Title A");
    expect(finalHabit.categoryId).toBe("cat-1");
  });

  it("Test 2: deleteWorkspace vs updateHabit cannot produce a ghost Habit", async () => {
    const wsId = "ws-concurrent-habit";
    
    await WorkspaceRepository.saveWorkspaces([{ id: wsId, name: "Concurrent WS", emoji: "🧪", createdAt: Date.now(), updatedAt: Date.now() }]);
    await HabitRepository.saveHabitUnlocked({ id: "h-ghost-1", title: "Original Habit", workspaceId: wsId });

    const originalGetHabits = HabitRepository.getHabits.bind(HabitRepository);
    
    let releaseOpA: () => void;
    const opAPaused = new Promise<void>((resolve) => {
      releaseOpA = resolve;
    });
    
    let getHabitsCallCount = 0;
    let opAHasRead = false;
    let opACompleted = false;

    // Operation A: updateHabit
    jest.spyOn(HabitRepository, "getHabits").mockImplementation(async (wId) => {
      if (wId === wsId) {
        getHabitsCallCount++;
        if (getHabitsCallCount === 1) {
          opAHasRead = true;
          await opAPaused;
        }
      }
      return originalGetHabits(wId);
    });

    const opA = EntityCommandService.updateHabit("h-ghost-1", wsId, { title: "New Habit Title" }).then(() => {
      opACompleted = true;
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(opAHasRead).toBe(true);
    expect(opACompleted).toBe(false);

    // Operation B: deleteWorkspace
    // deleteWorkspace should queue behind updateHabit's lock
    const opB = EntityCommandService.deleteWorkspace(wsId);

    await new Promise((r) => setTimeout(r, 50));
    
    // Release updateHabit
    releaseOpA!();
    
    // Both should now complete
    await opA;
    await opB;

    // Verify workspace was deleted
    const workspaces = await WorkspaceRepository.getWorkspaces();
    expect(workspaces.some(w => w.id === wsId)).toBe(false);

    // Verify active habits partition is EMPTY (no ghost resurrected by updateHabit!)
    const activeHabits = await HabitRepository.getHabits(wsId);
    expect(activeHabits["h-ghost-1"]).toBeUndefined();

    // Verify recycle bin contains the snapshot
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    const wsBin = binItems.find(i => i.entityId === wsId);
    expect(wsBin).toBeDefined();
    
    const snapshot = JSON.parse(wsBin!.snapshot);
    expect(snapshot.habits[0].id).toBe("h-ghost-1");
  });

  it("Test 3: should serialize completeHabit and updateHabit via workspace partition lock", async () => {
    const workspaceId = INBOX_WORKSPACE_ID;
    const habitId = "habit-rmw-3";

    await HabitRepository.saveHabitUnlocked({ id: habitId, title: "Initial Title", workspaceId, completionHistory: [] });

    const originalGetHabits = HabitRepository.getHabits.bind(HabitRepository);

    let releaseOpA: () => void;
    const opAPaused = new Promise<void>((resolve) => {
      releaseOpA = resolve;
    });

    let getHabitsCallCount = 0;
    let opACompleted = false;

    jest.spyOn(HabitRepository, "getHabits").mockImplementation(async (wsId) => {
      getHabitsCallCount++;

      // Pause the FIRST read (Operation A's initial read inside the lock)
      if (getHabitsCallCount === 1) {
        await opAPaused;
      }

      return originalGetHabits(wsId);
    });

    // Start Operation A: completeHabit (reads and blocks)
    const opA = HabitCommandHandler.completeHabit(habitId, workspaceId, { skipAnalytics: true, skipEvents: true })
      .then((res) => {
        opACompleted = true;
        return res;
      });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Start Operation B: updateHabit (updating a field to simulate a concurrent mutation)
    const opB = HabitCommandHandler.updateHabit(habitId, workspaceId, { title: "Title B" }, { skipAnalytics: true, skipEvents: true });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Prove Operation B is blocked
    expect(getHabitsCallCount).toBe(1);
    expect(opACompleted).toBe(false);

    releaseOpA!();

    await Promise.all([opA, opB]);

    expect(opACompleted).toBe(true);
    expect(getHabitsCallCount).toBeGreaterThanOrEqual(3);

    // Verify data invariant (no lost updates)
    const finalHabits = await HabitRepository.getHabits(workspaceId);
    const finalHabit = finalHabits[habitId];

    expect(finalHabit.title).toBe("Title B");
    
    const today = (await import("@/shared/utils/domain-selectors")).getTodayDateKey();
    expect(finalHabit.completionHistory.some((e: any) => e.date === today)).toBe(true);
  });

  it("Test 4: should serialize uncompleteHabit and updateHabit via workspace partition lock", async () => {
    const workspaceId = INBOX_WORKSPACE_ID;
    const habitId = "habit-rmw-4";
    const domainSelectors = await import("@/shared/utils/domain-selectors");
    const today = domainSelectors.getTodayDateKey();
    
    // Override the global mock so uncompleteHabit doesn't bail out early
    (domainSelectors.isHabitCompletedToday as jest.Mock).mockReturnValueOnce(true);

    await HabitRepository.saveHabitUnlocked({ 
      id: habitId, 
      title: "Initial Title", 
      workspaceId, 
      completionHistory: [{ date: today, completedAt: Date.now() }] 
    });

    const originalGetHabits = HabitRepository.getHabits.bind(HabitRepository);

    let releaseOpA: () => void;
    const opAPaused = new Promise<void>((resolve) => {
      releaseOpA = resolve;
    });

    let getHabitsCallCount = 0;
    let opACompleted = false;

    jest.spyOn(HabitRepository, "getHabits").mockImplementation(async (wsId) => {
      getHabitsCallCount++;

      // Pause the FIRST read (Operation A's initial read inside the lock)
      if (getHabitsCallCount === 1) {
        await opAPaused;
      }

      return originalGetHabits(wsId);
    });

    // Start Operation A: uncompleteHabit (reads and blocks)
    const opA = HabitCommandHandler.uncompleteHabit(habitId, workspaceId, { skipAnalytics: true, skipEvents: true })
      .then((res) => {
        opACompleted = true;
        return res;
      });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Start Operation B: updateHabit (updating a field to simulate a concurrent mutation)
    const opB = HabitCommandHandler.updateHabit(habitId, workspaceId, { title: "Title B" }, { skipAnalytics: true, skipEvents: true });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Prove Operation B is blocked
    expect(getHabitsCallCount).toBe(1);
    expect(opACompleted).toBe(false);

    releaseOpA!();

    await Promise.all([opA, opB]);

    expect(opACompleted).toBe(true);
    expect(getHabitsCallCount).toBeGreaterThanOrEqual(3);

    // Verify data invariant (no lost updates)
    const finalHabits = await HabitRepository.getHabits(workspaceId);
    const finalHabit = finalHabits[habitId];

    expect(finalHabit.title).toBe("Title B");
    
    // Ensure it was actually uncompleted
    expect(finalHabit.completionHistory.some((e: any) => e.date === today)).toBe(false);
  });

  it("Test 5: should serialize recoverHabitStreak and updateHabit via workspace partition lock", async () => {
    const workspaceId = INBOX_WORKSPACE_ID;
    const habitId = "habit-rmw-5";

    await HabitRepository.saveHabitUnlocked({ 
      id: habitId, 
      title: "Initial Title", 
      workspaceId, 
      completionHistory: [] 
    });

    const originalGetHabits = HabitRepository.getHabits.bind(HabitRepository);

    let releaseOpA: () => void;
    const opAPaused = new Promise<void>((resolve) => {
      releaseOpA = resolve;
    });

    let getHabitsCallCount = 0;
    let opACompleted = false;

    jest.spyOn(HabitRepository, "getHabits").mockImplementation(async (wsId) => {
      getHabitsCallCount++;

      // Pause the FIRST read (Operation A's initial read inside the lock)
      if (getHabitsCallCount === 1) {
        await opAPaused;
      }

      return originalGetHabits(wsId);
    });

    // Start Operation A: recoverHabitStreak (reads and blocks)
    const opA = HabitCommandHandler.recoverHabitStreak(habitId, workspaceId, { skipAnalytics: true, skipEvents: true })
      .then((res) => {
        opACompleted = true;
        return res;
      });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Start Operation B: updateHabit (updating a field to simulate a concurrent mutation)
    const opB = HabitCommandHandler.updateHabit(habitId, workspaceId, { title: "Title B" }, { skipAnalytics: true, skipEvents: true });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Prove Operation B is blocked
    expect(getHabitsCallCount).toBe(1);
    expect(opACompleted).toBe(false);

    releaseOpA!();

    await Promise.all([opA, opB]);

    expect(opACompleted).toBe(true);
    expect(getHabitsCallCount).toBeGreaterThanOrEqual(3);

    // Verify data invariant (no lost updates)
    const finalHabits = await HabitRepository.getHabits(workspaceId);
    const finalHabit = finalHabits[habitId];

    expect(finalHabit.title).toBe("Title B");
    
    // Ensure it was actually recovered
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    expect(finalHabit.completionHistory.some((e: any) => e.date === yesterdayKey)).toBe(true);
  });

  it("Test 6: should serialize moveHabit and updateHabit to prevent stale-read data loss", async () => {
    const sourceWsId = "ws-source-1";
    const targetWsId = "ws-target-1";
    const habitId = "habit-rmw-6";

    await HabitRepository.saveHabitUnlocked({ id: habitId, title: "Original Title", workspaceId: sourceWsId });
    await WorkspaceRepository.saveWorkspaces([
      { id: sourceWsId, name: "Source", emoji: "🧪", createdAt: Date.now(), updatedAt: Date.now() },
      { id: targetWsId, name: "Target", emoji: "🎯", createdAt: Date.now(), updatedAt: Date.now() }
    ]);

    const originalGetHabits = HabitRepository.getHabits.bind(HabitRepository);

    let releaseOpA: () => void;
    const opAPaused = new Promise<void>((resolve) => {
      releaseOpA = resolve;
    });

    let getHabitsCallCount = 0;
    let opACompleted = false;

    jest.spyOn(HabitRepository, "getHabits").mockImplementation(async (wsId) => {
      if (wsId === sourceWsId) {
        getHabitsCallCount++;
        // Pause the FIRST read (Operation A's initial read inside the lock)
        if (getHabitsCallCount === 1) {
          await opAPaused;
        }
      }
      return originalGetHabits(wsId);
    });

    // Start Operation A: moveHabit (reads and blocks)
    const opA = HabitCommandHandler.moveHabit(habitId, sourceWsId, targetWsId, { skipAnalytics: true, skipEvents: true })
      .then((res) => {
        opACompleted = true;
        return res;
      });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Start Operation B: updateHabit (updating a field to simulate a concurrent mutation)
    const opB = HabitCommandHandler.updateHabit(habitId, sourceWsId, { title: "Updated Title" }, { skipAnalytics: true, skipEvents: true }).catch(e => e);

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Prove Operation B is blocked from reading source
    expect(getHabitsCallCount).toBe(1);
    expect(opACompleted).toBe(false);

    releaseOpA!();

    await Promise.all([opA, opB]);

    expect(opACompleted).toBe(true);
    expect(getHabitsCallCount).toBeGreaterThanOrEqual(3);

    // Verify data invariant (no ghost, no lost updates)
    const finalSourceHabits = await HabitRepository.getHabits(sourceWsId);
    expect(finalSourceHabits[habitId]).toBeUndefined();

    const finalTargetHabits = await HabitRepository.getHabits(targetWsId);
    const finalHabit = finalTargetHabits[habitId];
    expect(finalHabit).toBeDefined();
    // B failed to update because it ran after A moved it. The title should be original.
    expect(finalHabit.title).toBe("Original Title");
  });

  it("Test 7: should safely serialize cross-workspace moveHabit operations without deadlocks", async () => {
    const wsA = "ws-A";
    const wsB = "ws-B";
    const habit1Id = "habit-A-to-B";
    const habit2Id = "habit-B-to-A";

    await HabitRepository.saveHabitUnlocked({ id: habit1Id, title: "Habit 1", workspaceId: wsA });
    await HabitRepository.saveHabitUnlocked({ id: habit2Id, title: "Habit 2", workspaceId: wsB });
    await WorkspaceRepository.saveWorkspaces([
      { id: wsA, name: "Workspace A", emoji: "🧪", createdAt: Date.now(), updatedAt: Date.now() },
      { id: wsB, name: "Workspace B", emoji: "🎯", createdAt: Date.now(), updatedAt: Date.now() }
    ]);

    // Fire them concurrently in opposite directions
    const op1 = HabitCommandHandler.moveHabit(habit1Id, wsA, wsB, { skipAnalytics: true, skipEvents: true });
    const op2 = HabitCommandHandler.moveHabit(habit2Id, wsB, wsA, { skipAnalytics: true, skipEvents: true });

    // Ensure neither deadlocks
    await Promise.all([op1, op2]);

    const finalA = await HabitRepository.getHabits(wsA);
    const finalB = await HabitRepository.getHabits(wsB);

    expect(finalA[habit1Id]).toBeUndefined();
    expect(finalA[habit2Id]).toBeDefined();

    expect(finalB[habit2Id]).toBeUndefined();
    expect(finalB[habit1Id]).toBeDefined();
  });

  it("Test 8: should serialize recycleHabit and updateHabit to prevent lost updates or ghost resurrects", async () => {
    const workspaceId = INBOX_WORKSPACE_ID;
    const habitId = "habit-rmw-8";

    await HabitRepository.saveHabitUnlocked({ id: habitId, title: "Initial", workspaceId });

    const originalGetHabits = HabitRepository.getHabits.bind(HabitRepository);
    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    
    let releaseOpA: () => void;
    const opAPaused = new Promise<void>((resolve) => {
      releaseOpA = resolve;
    });

    let getHabitsCallCount = 0;
    let opACompleted = false;

    jest.spyOn(HabitRepository, "getHabits").mockImplementation(async (wsId) => {
      if (wsId === workspaceId) {
        getHabitsCallCount++;
        // Pause the FIRST read (Operation A's initial read inside the lock)
        if (getHabitsCallCount === 1) {
          await opAPaused;
        }
      }
      return originalGetHabits(wsId);
    });

    // Start Operation A: recycleHabit
    const opA = HabitCommandHandler.recycleHabit(habitId, workspaceId, { skipAnalytics: true, skipEvents: true })
      .then(() => {
        opACompleted = true;
      });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Start Operation B: updateHabit
    const opB = HabitCommandHandler.updateHabit(habitId, workspaceId, { title: "Concurrent Update" }, { skipAnalytics: true, skipEvents: true }).catch(e => e);

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Prove Operation B is blocked from reading
    expect(getHabitsCallCount).toBe(1);
    expect(opACompleted).toBe(false);

    releaseOpA!();

    await Promise.all([opA, opB]);

    expect(opACompleted).toBe(true);
    expect(getHabitsCallCount).toBeGreaterThanOrEqual(2);

    // Verify post-recycle state (no ghost resurrection)
    const finalHabits = await HabitRepository.getHabits(workspaceId);
    expect(finalHabits[habitId]).toBeUndefined();

    // Verify exactly one recycle bin entry exists
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    const itemsForHabit = binItems.filter(i => i.entityId === habitId);
    expect(itemsForHabit.length).toBe(1);

    // Verify the snapshot contains the original state
    const snapshot = JSON.parse(itemsForHabit[0].snapshot);
    expect(snapshot.title).toBe("Initial");
  });

  it("Test 9: restoreHabit vs recycleHabit prevents stale bin array overwrite", async () => {
    const workspaceId = INBOX_WORKSPACE_ID;
    const habitAId = "habit-a";
    const habitCId = "habit-c";

    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");

    // 1. Seed Recycle Bin with Habit A
    const habitA = { id: habitAId, title: "Habit A", workspaceId };
    await RecycleBinRepository.addToRecycleBin("habit", habitA as any, workspaceId);

    // Seed habit C in active storage
    await HabitRepository.saveHabitUnlocked({ id: habitCId, title: "Habit C", workspaceId });

    const binItemsBefore = await RecycleBinRepository.getRecycleBinItems();
    const itemA = binItemsBefore.find(i => i.entityId === habitAId);
    expect(itemA).toBeDefined();

    const originalRemove = RecycleBinRepository.removeRecycleBinItems.bind(RecycleBinRepository);
    
    let releaseOpA: () => void;
    const opAPaused = new Promise<void>((resolve) => {
      releaseOpA = resolve;
    });

    let opACompleted = false;

    // 3. Pause restoreHabit immediately BEFORE its final RecycleBinRepository.removeRecycleBinItems() call
    jest.spyOn(RecycleBinRepository, "removeRecycleBinItems").mockImplementation(async (ids, options) => {
      if (ids.includes(itemA!.id)) {
        await opAPaused;
      }
      return originalRemove(ids, options);
    });

    // 2. Start restoreHabit(A)
    const opA = HabitCommandHandler.restoreHabit(itemA!.id, { skipAnalytics: true, skipEvents: true }).then(() => {
      opACompleted = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // 4. While restoreHabit is paused, start recycleHabit(C)
    // NOTE: This will block because restoreHabit holds the workspace partition lock.
    const opC = HabitCommandHandler.recycleHabit(habitCId, workspaceId, { skipAnalytics: true, skipEvents: true });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // 6. Resume restoreHabit(A)
    releaseOpA!();
    
    await opC;
    await opA;

    expect(opACompleted).toBe(true);

    // 8. Verify
    const finalHabits = await HabitRepository.getHabits(workspaceId);
    // A exists in active Habit storage.
    expect(finalHabits[habitAId]).toBeDefined();
    // C does not exist in active storage
    expect(finalHabits[habitCId]).toBeUndefined();

    const finalBin = await RecycleBinRepository.getRecycleBinItems();
    const finalItemA = finalBin.find(i => i.entityId === habitAId);
    const finalItemC = finalBin.find(i => i.entityId === habitCId);

    // A is absent from the Recycle Bin
    expect(finalItemA).toBeUndefined();
    // C is STILL present in the Recycle Bin
    expect(finalItemC).toBeDefined();
    // C's snapshot is unchanged
    expect(JSON.parse(finalItemC!.snapshot).title).toBe("Habit C");
  });

  it("Test 10: should serialize restoreHabit vs updateHabit via partition lock", async () => {
    const workspaceId = INBOX_WORKSPACE_ID;
    const habitId = "habit-restore-1";
    const rbId = `rb-${habitId}`;

    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    await RecycleBinRepository.addToRecycleBin("habit", {
      id: habitId,
      workspaceId,
      title: "Restored Title",
    } as any, workspaceId);

    // Seed active partition with dummy habit to test overwrite vs update race
    await HabitRepository.saveHabitUnlocked({
      id: habitId,
      workspaceId,
      title: "Active Title",
    });

    const originalGetRecycleBinItems = RecycleBinRepository.getRecycleBinItems.bind(RecycleBinRepository);
    const restoreReadStarted = defer();
    const resumeRestoreRead = defer();

    let getRecycleBinItemsCallCount = 0;
    jest
      .spyOn(RecycleBinRepository, "getRecycleBinItems")
      .mockImplementation(async () => {
        getRecycleBinItemsCallCount++;
        // Pause inside the partition lock
        if (getRecycleBinItemsCallCount === 2) {
          restoreReadStarted.resolve();
          await resumeRestoreRead.promise;
        }
        return originalGetRecycleBinItems();
      });

    // 2. Start restoreHabit
    const restorePromise = HabitCommandHandler.restoreHabit(rbId, { skipEvents: true, skipAnalytics: true });

    // 3. Pause restore operation inside the partition lock
    await restoreReadStarted.promise;

    // 4. Start updateHabit
    const originalGetHabits = HabitRepository.getHabits.bind(HabitRepository);
    let updateStartedRead = false;
    jest.spyOn(HabitRepository, "getHabits").mockImplementationOnce(async (wsId) => {
      if (wsId === workspaceId) updateStartedRead = true;
      return originalGetHabits(wsId);
    });

    const updatePromise = HabitCommandHandler.updateHabit(
      habitId,
      workspaceId,
      { title: "Updated Active Title" },
      { skipEvents: true, skipAnalytics: true }
    );

    // 5. Prove updateHabit cannot enter its read phase
    await new Promise((r) => setTimeout(r, 50));
    expect(updateStartedRead).toBe(false);

    // 6. Resume restore
    resumeRestoreRead.resolve();

    await restorePromise;
    await updatePromise;

    // 7. Verify the active partition has the update applied on top of the restore
    const finalHabits = await HabitRepository.getHabits(workspaceId);
    expect(finalHabits[habitId].title).toBe("Updated Active Title");

    jest.spyOn(RecycleBinRepository, "getRecycleBinItems").mockRestore();
    jest.spyOn(HabitRepository, "getHabits").mockRestore();
  });

  it("Test 11: should prevent restoreHabit from destroying concurrent Recycle Bin additions", async () => {
    const workspaceId = "ws-restore-test-2";
    const habitId1 = "habit-restore-1";
    const habitId2 = "habit-restore-2";
    const rbId1 = `rb-${habitId1}`;

    const { RecycleBinRepository } = await import("@/repositories/RecycleBinRepository");
    
    // Clear first to isolate this test
    await RecycleBinRepository.removeRecycleBinItems((await RecycleBinRepository.getRecycleBinItems()).map(i => i.id));

    await RecycleBinRepository.addToRecycleBin("habit", {
      id: habitId1,
      workspaceId,
      title: "H1",
    } as any, workspaceId);

    const originalGetRecycleBinItems = RecycleBinRepository.getRecycleBinItems.bind(RecycleBinRepository);
    const restoreReadStarted = defer();
    const resumeRestoreRead = defer();

    let getRecycleBinItemsCallCount = 0;
    jest
      .spyOn(RecycleBinRepository, "getRecycleBinItems")
      .mockImplementation(async () => {
        getRecycleBinItemsCallCount++;
        // We pause the SECOND call (inside the partition lock)
        if (getRecycleBinItemsCallCount === 2) {
          restoreReadStarted.resolve();
          await resumeRestoreRead.promise;
        }
        return originalGetRecycleBinItems();
      });

    // 2. Start restoreHabit(H1)
    const restorePromise = HabitCommandHandler.restoreHabit(rbId1, { skipEvents: true, skipAnalytics: true });

    // 3. Pause restore operation
    await restoreReadStarted.promise;

    // 4. Concurrently add H2 to the Recycle Bin
    await RecycleBinRepository.addToRecycleBin("habit", {
      id: habitId2,
      workspaceId,
      title: "H2",
    } as any, workspaceId);

    // 5. Resume restore
    resumeRestoreRead.resolve();
    await restorePromise;

    // 6. Verify that H2 is STILL in the Recycle Bin
    const finalBin = await RecycleBinRepository.getRecycleBinItems();
    expect(finalBin.find(i => i.entityId === habitId2)).toBeDefined();
    // And H1 is gone
    expect(finalBin.find(i => i.entityId === habitId1)).toBeUndefined();
    
    jest.spyOn(RecycleBinRepository, "getRecycleBinItems").mockRestore();
  });

  it("Test 12: should serialize permanentlyDeleteHabit and moveHabit to prevent stale-read side effects", async () => {
    const sourceWorkspaceId = "ws-perm-source";
    const targetWorkspaceId = "ws-perm-target";
    const habitId = "habit-perm-1";

    await HabitRepository.saveHabitUnlocked({ 
      id: habitId, 
      title: "Perm Habit", 
      workspaceId: sourceWorkspaceId,
      reminder: { enabled: true, triggerAt: 1234, notificationIds: ["notif-1"] }
    });

    const originalGetHabits = HabitRepository.getHabits.bind(HabitRepository);
    const getHabitsStarted = defer();
    const resumeGetHabits = defer();

    let getHabitsCallCount = 0;
    jest.spyOn(HabitRepository, "getHabits").mockImplementation(async (wsId) => {
      if (wsId === sourceWorkspaceId) {
        getHabitsCallCount++;
        if (getHabitsCallCount === 1) {
          getHabitsStarted.resolve();
          await resumeGetHabits.promise;
        }
      }
      return originalGetHabits(wsId);
    });

    const mockCancelReminderIds = jest.fn().mockResolvedValue(undefined);
    jest.mock("@/services/scheduling/reminders.service", () => ({
      cancelReminderIds: mockCancelReminderIds,
      scheduleReminderBatch: jest.fn(),
      rescheduleHabitReminders: jest.fn(h => h),
    }));

    const delPromise = HabitCommandHandler.permanentlyDeleteHabit(habitId, sourceWorkspaceId, { skipEvents: true, skipAnalytics: true })
      .catch(e => e.message);

    await getHabitsStarted.promise;

    const movePromise = HabitCommandHandler.moveHabit(habitId, sourceWorkspaceId, targetWorkspaceId, { skipEvents: true, skipAnalytics: true }).catch(e => e.message);

    // wait briefly to ensure moveHabit blocks
    await new Promise(r => setTimeout(r, 50));
    
    resumeGetHabits.resolve();
    
    const delResult = await delPromise;
    expect(delResult).toBeUndefined(); // It succeeds because it got the lock first

    const moveResult = await movePromise;
    expect(moveResult).toBe(`Habit ${habitId} not found`); // moveHabit fails because it was deleted

    // Reminders SHOULD be cancelled because it was legitimately deleted
    const { cancelReminderIds } = require("@/services/scheduling/reminders.service");
    expect(cancelReminderIds).toHaveBeenCalledWith(["notif-1"], expect.any(Object));

    jest.spyOn(HabitRepository, "getHabits").mockRestore();
  });
});
