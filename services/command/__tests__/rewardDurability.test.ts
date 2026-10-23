/**
 * rewardDurability.test.ts
 * ────────────────────────
 * Priority 1 (completion reward durability): a completed Task/Habit must never
 * silently lose its Pebble because the two persistence writes (entity, economy
 * ledger) are not atomic.
 *
 * These tests inject failures at the exact boundary the previous design could
 * not cross — "entity persisted, award not written" — and pin the recovery
 * contract implemented by `features/profile/services/reward-intent.service.ts`:
 *
 *   - the owed reward is recorded BEFORE the completed state is persisted, so
 *     the completed state can never exist without a recoverable reward;
 *   - a replay of an already-completed entity settles the intent instead of
 *     returning early;
 *   - startup resolution credits exactly once (idempotent by rewardId);
 *   - an intent whose entity is no longer in the rewarded state is discarded,
 *     never paid late (uncomplete / delete / different habit day).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import {
  HabitRepository,
  TaskRepository,
  TombstoneRepository,
  WorkspaceRepository,
} from "@/repositories";
import {
  PEBBLE_LOG_KEY,
  earnPebbleWithOutcome,
} from "@/features/profile/services/pebble.service";
import {
  RewardIntentRepository,
  REWARD_INTENTS_KEY,
} from "@/repositories/RewardIntentRepository";
import { resolveAllRewardIntents } from "@/features/profile/services/reward-intent.service";
import { getTodayDateKey } from "@/shared/utils/date-key";
import type { Habit, Task, Workspace } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("@/services/events/state-events", () => ({
  emitStateChange: jest.fn(),
  addStateListener: jest.fn(() => () => {}),
}));

const WS = "ws-reward-durability";

const makeTask = (id: string, overrides: Partial<Task> = {}): Task =>
  ({
    id,
    workspaceId: WS,
    title: `Task ${id}`,
    status: "todo",
    priority: "medium",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }) as Task;

const makeHabit = (id: string, overrides: Partial<Habit> = {}): Habit =>
  ({
    id,
    workspaceId: WS,
    title: `Habit ${id}`,
    recurrence: { frequency: "daily", interval: 1 },
    completionHistory: [],
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }) as Habit;

async function pebbleRewards(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(PEBBLE_LOG_KEY);
  if (!raw) return [];
  return JSON.parse(raw).map((entry: any) => String(entry.rewardId ?? ""));
}

async function pendingIntentIds(): Promise<string[]> {
  return (await RewardIntentRepository.getIntents()).map((entry) => entry.rewardId);
}

/**
 * Fail every write to `failingKeys` (simulating a crash/interruption at that
 * write) while leaving all other storage writes intact.
 */
function failWritesTo(failingKeys: string[]): () => void {
  const setItem = AsyncStorage.setItem as unknown as jest.Mock;
  // The AsyncStorage jest mock is already a jest.fn, so `jest.spyOn` would
  // return that same function; grab its inner implementation instead of
  // recursing into the spy.
  const original = setItem.getMockImplementation();
  const failing = new Set(failingKeys);
  setItem.mockImplementation(async (key: string, value: string) => {
    if (failing.has(key)) {
      throw new Error(`simulated storage failure writing ${key}`);
    }
    return original ? original(key, value) : undefined;
  });
  return () => {
    // Restore the mock's ORIGINAL implementation: `mockRestore()` would strip it
    // and silently turn every later storage write into a no-op.
    setItem.mockImplementation(original as any);
  };
}

const silently = { skipEvents: true, skipAnalytics: true } as const;

beforeEach(async () => {
  jest.restoreAllMocks();
  jest.spyOn(
    require("@/services/analytics/productivity-history.service"),
    "recordDailyHistorySnapshot",
  ).mockResolvedValue(undefined);

  await AsyncStorage.clear();
  await WorkspaceRepository.saveWorkspace({
    id: WS,
    name: "Reward durability WS",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
  } as Workspace);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("Task completion reward durability", () => {
  it("survives a failure between the entity write and the award, and recovery credits exactly once", async () => {
    await TaskRepository.saveTask(makeTask("task-fail-1"));

    const restore = failWritesTo([PEBBLE_LOG_KEY]);
    const result = await EntityCommandService.completeTask(
      "task-fail-1",
      WS,
      silently,
    );
    restore();

    // The completion itself still commits: a reward write must never fail it.
    expect(result?.updated.status).toBe("completed");
    expect(await pebbleRewards()).toEqual([]);
    // ... but the owed reward is durable, not lost.
    expect(await pendingIntentIds()).toEqual(["task:task-fail-1"]);

    const report = await resolveAllRewardIntents();
    expect(report.credited).toBe(1);
    expect(await pebbleRewards()).toEqual(["task:task-fail-1"]);
    expect(await pendingIntentIds()).toEqual([]);

    // Recovery is idempotent: a second pass cannot duplicate the Pebble.
    await resolveAllRewardIntents();
    await resolveAllRewardIntents();
    expect(await pebbleRewards()).toEqual(["task:task-fail-1"]);
  });

  it("settles the owed reward on an already-completed replay instead of returning early", async () => {
    await TaskRepository.saveTask(makeTask("task-fail-2"));

    const restore = failWritesTo([PEBBLE_LOG_KEY]);
    await EntityCommandService.completeTask("task-fail-2", WS, silently);
    restore();

    expect(await pendingIntentIds()).toEqual(["task:task-fail-2"]);
    expect(await pebbleRewards()).toEqual([]);

    // The replay is the "already completed" path — previously it returned
    // before `earnPebble`, permanently losing the reward.
    const replay = await EntityCommandService.completeTask(
      "task-fail-2",
      WS,
      silently,
    );
    expect(replay?.updated.status).toBe("completed");
    expect(await pebbleRewards()).toEqual(["task:task-fail-2"]);
    expect(await pendingIntentIds()).toEqual([]);

    // A third replay stays at exactly one reward and creates no new intent.
    await EntityCommandService.completeTask("task-fail-2", WS, silently);
    expect(await pebbleRewards()).toEqual(["task:task-fail-2"]);
    expect(await pendingIntentIds()).toEqual([]);
  });

  it("never pays an intent whose Task was uncompleted before recovery", async () => {
    await TaskRepository.saveTask(makeTask("task-fail-3"));

    const restore = failWritesTo([PEBBLE_LOG_KEY]);
    await EntityCommandService.completeTask("task-fail-3", WS, silently);
    restore();
    expect(await pendingIntentIds()).toEqual(["task:task-fail-3"]);

    await EntityCommandService.uncompleteTask("task-fail-3", WS, silently);

    const report = await resolveAllRewardIntents();
    expect(report.credited).toBe(0);
    expect(await pebbleRewards()).toEqual([]);
    expect(await pendingIntentIds()).toEqual([]);

    // Re-completing is a genuine new completion and legitimately earns one.
    await EntityCommandService.completeTask("task-fail-3", WS, silently);
    expect(await pebbleRewards()).toEqual(["task:task-fail-3"]);
    expect(await pendingIntentIds()).toEqual([]);
  });

  it("never pays an intent whose Task was permanently deleted before recovery", async () => {
    await TaskRepository.saveTask(makeTask("task-fail-4"));

    const restore = failWritesTo([PEBBLE_LOG_KEY]);
    await EntityCommandService.completeTask("task-fail-4", WS, silently);
    restore();

    await EntityCommandService.permanentlyDeleteTask("task-fail-4", WS, silently);
    expect(
      await TombstoneRepository.isTombstoned("task", "task-fail-4", 1),
    ).toBe(true);

    const report = await resolveAllRewardIntents();
    expect(report.credited).toBe(0);
    expect(await pebbleRewards()).toEqual([]);
    expect(await pendingIntentIds()).toEqual([]);
  });

  it("does not duplicate a Pebble when the ledger already holds the reward", async () => {
    await TaskRepository.saveTask(makeTask("task-fail-5"));

    const restore = failWritesTo([PEBBLE_LOG_KEY]);
    await EntityCommandService.completeTask("task-fail-5", WS, silently);
    restore();

    // Out-of-band settlement: the ledger gains the reward while the intent is
    // still pending (e.g. a concurrent writer got there first).
    expect(await earnPebbleWithOutcome("task", "task:task-fail-5")).toBe("awarded");
    expect(await pebbleRewards()).toEqual(["task:task-fail-5"]);

    // Settling an intent whose reward is already in the ledger reports success
    // ("already_earned") but must never append a second entry.
    await resolveAllRewardIntents();
    expect(await pebbleRewards()).toEqual(["task:task-fail-5"]);
    expect(await pendingIntentIds()).toEqual([]);
  });
});

describe("Habit completion reward durability", () => {
  it("survives a failure between the entity write and the award, scoped to the completion day", async () => {
    await HabitRepository.saveHabitUnlocked(makeHabit("habit-fail-1"));

    const restore = failWritesTo([PEBBLE_LOG_KEY]);
    const result = await EntityCommandService.completeHabit(
      "habit-fail-1",
      WS,
      silently,
    );
    restore();

    const today = getTodayDateKey();
    expect(result?.updated.lastCompletedDate).toBe(today);
    expect(await pebbleRewards()).toEqual([]);
    expect(await pendingIntentIds()).toEqual([`habit:habit-fail-1:${today}`]);

    const report = await resolveAllRewardIntents();
    expect(report.credited).toBe(1);
    expect(await pebbleRewards()).toEqual([`habit:habit-fail-1:${today}`]);
    expect(await pendingIntentIds()).toEqual([]);
  });

  it("settles the owed reward on an already-completed replay", async () => {
    await HabitRepository.saveHabitUnlocked(makeHabit("habit-fail-2"));

    const restore = failWritesTo([PEBBLE_LOG_KEY]);
    await EntityCommandService.completeHabit("habit-fail-2", WS, silently);
    restore();

    const today = getTodayDateKey();
    expect(await pendingIntentIds()).toEqual([`habit:habit-fail-2:${today}`]);

    await EntityCommandService.completeHabit("habit-fail-2", WS, silently);
    expect(await pebbleRewards()).toEqual([`habit:habit-fail-2:${today}`]);
    expect(await pendingIntentIds()).toEqual([]);
  });

  it("discards an intent whose completion day is no longer in the habit history", async () => {
    await HabitRepository.saveHabitUnlocked(makeHabit("habit-fail-3"));

    const restore = failWritesTo([PEBBLE_LOG_KEY]);
    await EntityCommandService.completeHabit("habit-fail-3", WS, silently);
    restore();
    expect(await pendingIntentIds()).toHaveLength(1);

    // Intervening uncompletion of the same day.
    await EntityCommandService.uncompleteHabit("habit-fail-3", WS, silently);

    const report = await resolveAllRewardIntents();
    expect(report.credited).toBe(0);
    expect(await pebbleRewards()).toEqual([]);
    expect(await pendingIntentIds()).toEqual([]);
  });

  it("does not pay a stale intent for a different completion day", async () => {
    const today = getTodayDateKey();
    await HabitRepository.saveHabitUnlocked(
      makeHabit("habit-fail-4", {
        completionHistory: [{ date: today, completedAt: Date.now() }],
        lastCompletedDate: today,
      }),
    );

    // An intent left over from an earlier day must not be paid now that the
    // habit's current completion belongs to a later day.
    await RewardIntentRepository.addIntent({
      rewardId: "habit:habit-fail-4:1999-01-01",
      type: "habit",
      entityType: "habit",
      entityId: "habit-fail-4",
      workspaceId: WS,
      dateKey: "1999-01-01",
      createdAt: 1,
    });

    const report = await resolveAllRewardIntents();
    expect(report.credited).toBe(0);
    expect(await pebbleRewards()).toEqual([]);
    expect(await pendingIntentIds()).toEqual([]);
  });
});

describe("Concurrent completion and recovery", () => {
  it("converges to one intent and one Pebble under concurrent completion attempts", async () => {
    await TaskRepository.saveTask(makeTask("task-fail-6"));

    const restore = failWritesTo([PEBBLE_LOG_KEY]);
    await Promise.all([
      EntityCommandService.completeTask("task-fail-6", WS, silently),
      EntityCommandService.completeTask("task-fail-6", WS, silently),
      EntityCommandService.completeTask("task-fail-6", WS, silently),
    ]);
    restore();

    const raw = await AsyncStorage.getItem(REWARD_INTENTS_KEY);
    const stored = raw ? JSON.parse(raw) : [];
    expect(stored).toHaveLength(1);
    expect(stored[0].rewardId).toBe("task:task-fail-6");

    await Promise.all([resolveAllRewardIntents(), resolveAllRewardIntents()]);
    expect(await pebbleRewards()).toEqual(["task:task-fail-6"]);
    expect(await pendingIntentIds()).toEqual([]);

    const task = await TaskRepository.getTask("task-fail-6", WS);
    expect(task?.status).toBe("completed");
  });
});
