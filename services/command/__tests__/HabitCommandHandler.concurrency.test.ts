import { HabitCommandHandler } from "../handlers/HabitCommandHandler";
import { HabitRepository, WorkspaceRepository, RecycleBinRepository } from "@/repositories";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { EntityCommandService } from "../EntityCommandService";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
});
