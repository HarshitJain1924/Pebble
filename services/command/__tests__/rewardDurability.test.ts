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
 *
 * The fail-closed half of the contract is covered at the bottom: if the INTENT
 * cannot be persisted, the completion aborts before any state change (no entity
 * write, no event, no plugin dispatch), because a completed entity without a
 * recoverable intent is exactly the state the ledger exists to prevent.
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
import {
  RewardIntentPersistenceError,
  resolveAllRewardIntents,
} from "@/features/profile/services/reward-intent.service";
import { getTodayDateKey } from "@/shared/utils/date-key";
import { emitStateChange } from "@/services/events/state-events";
import { pluginManager } from "@/plugin";
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
  (emitStateChange as jest.Mock).mockClear();
  jest.spyOn(
    require("@/services/analytics/productivity-history.service"),
    "recordDailyHistorySnapshot",
  ).mockResolvedValue(undefined);
  jest.spyOn(pluginManager, "dispatchTaskCompleted").mockResolvedValue(undefined as any);
  jest.spyOn(pluginManager, "dispatchHabitCompleted").mockResolvedValue(undefined as any);

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

/**
 * Fail-closed intent persistence.
 *
 * Before this pass `ensureRewardIntent` swallowed its error and the completion
 * continued, so when BOTH the ledger write and the Pebble write failed the
 * entity was completed with no record that a reward was owed — unrecoverable.
 * The completion now aborts before persisting anything.
 */
describe("Reward intent write failure aborts the completion", () => {
  it("Task: both ledger and Pebble writes failing leaves the Task untouched and emits nothing", async () => {
    await TaskRepository.saveTask(makeTask("task-intent-1"));

    const restore = failWritesTo([REWARD_INTENTS_KEY, PEBBLE_LOG_KEY]);
    await expect(
      EntityCommandService.completeTask("task-intent-1", WS),
    ).rejects.toThrow(RewardIntentPersistenceError);
    restore();

    // No completion state, no revision bump, no reward, no owed record.
    const task = await TaskRepository.getTask("task-intent-1", WS);
    expect(task?.status).toBe("todo");
    expect(task?.completedAt).toBeUndefined();
    expect(task?.revision).toBe(1);
    expect(await pebbleRewards()).toEqual([]);
    expect(await pendingIntentIds()).toEqual([]);

    // No success side effects of any kind.
    expect(emitStateChange).not.toHaveBeenCalled();
    expect(pluginManager.dispatchTaskCompleted).not.toHaveBeenCalled();
  });

  it("Task: the completion succeeds exactly once after storage recovers", async () => {
    await TaskRepository.saveTask(makeTask("task-intent-2"));

    const restore = failWritesTo([REWARD_INTENTS_KEY, PEBBLE_LOG_KEY]);
    await expect(
      EntityCommandService.completeTask("task-intent-2", WS),
    ).rejects.toThrow(RewardIntentPersistenceError);
    restore();

    const completed = await EntityCommandService.completeTask("task-intent-2", WS);
    expect(completed?.updated.status).toBe("completed");
    expect(await pebbleRewards()).toEqual(["task:task-intent-2"]);
    expect(await pendingIntentIds()).toEqual([]);
    expect(
      (emitStateChange as jest.Mock).mock.calls.filter((c) => c[0] === "tasks_changed"),
    ).toHaveLength(1);
    expect(pluginManager.dispatchTaskCompleted).toHaveBeenCalledTimes(1);

    // Replays stay at exactly one reward and never reopen a pending intent.
    await EntityCommandService.completeTask("task-intent-2", WS);
    expect(await pebbleRewards()).toEqual(["task:task-intent-2"]);
    expect(await pendingIntentIds()).toEqual([]);
  });

  it("Task: an intent failure alone aborts before the Pebble write is even attempted", async () => {
    await TaskRepository.saveTask(makeTask("task-intent-3"));

    // Only the ledger key fails: the reward write path stays healthy.
    const restore = failWritesTo([REWARD_INTENTS_KEY]);
    await expect(
      EntityCommandService.completeTask("task-intent-3", WS),
    ).rejects.toThrow(RewardIntentPersistenceError);
    restore();

    expect((await TaskRepository.getTask("task-intent-3", WS))?.status).toBe("todo");
    // Nothing was credited, so the failed attempt cannot have half-succeeded.
    expect(await pebbleRewards()).toEqual([]);
    expect(await pendingIntentIds()).toEqual([]);

    await EntityCommandService.completeTask("task-intent-3", WS);
    expect(await pebbleRewards()).toEqual(["task:task-intent-3"]);
  });

  it("Habit: both ledger and Pebble writes failing leaves the Habit untouched and emits nothing", async () => {
    await HabitRepository.saveHabitUnlocked(makeHabit("habit-intent-1"));

    const restore = failWritesTo([REWARD_INTENTS_KEY, PEBBLE_LOG_KEY]);
    await expect(
      EntityCommandService.completeHabit("habit-intent-1", WS),
    ).rejects.toThrow(RewardIntentPersistenceError);
    restore();

    const habit = await HabitRepository.getHabit("habit-intent-1", WS);
    expect(habit?.completionHistory).toEqual([]);
    expect(habit?.lastCompletedDate).toBeUndefined();
    expect(habit?.revision).toBe(1);
    expect(await pebbleRewards()).toEqual([]);
    expect(await pendingIntentIds()).toEqual([]);

    expect(emitStateChange).not.toHaveBeenCalled();
    expect(pluginManager.dispatchHabitCompleted).not.toHaveBeenCalled();
  });

  it("Habit: retry after recovery records exactly one day-scoped reward", async () => {
    await HabitRepository.saveHabitUnlocked(makeHabit("habit-intent-2"));
    const today = getTodayDateKey();

    const restore = failWritesTo([REWARD_INTENTS_KEY, PEBBLE_LOG_KEY]);
    await expect(
      EntityCommandService.completeHabit("habit-intent-2", WS),
    ).rejects.toThrow(RewardIntentPersistenceError);
    restore();

    const completed = await EntityCommandService.completeHabit("habit-intent-2", WS);
    expect(completed?.updated.lastCompletedDate).toBe(today);
    expect(await pebbleRewards()).toEqual([`habit:habit-intent-2:${today}`]);
    expect(await pendingIntentIds()).toEqual([]);

    // Same-day replay and the already-completed path stay at one reward.
    await EntityCommandService.completeHabit("habit-intent-2", WS);
    await EntityCommandService.completeHabit("habit-intent-2", WS);
    expect(await pebbleRewards()).toEqual([`habit:habit-intent-2:${today}`]);
    expect(await pendingIntentIds()).toEqual([]);
  });

  it("Habit: an intent failure alone aborts before the Pebble write is even attempted", async () => {
    await HabitRepository.saveHabitUnlocked(makeHabit("habit-intent-3"));

    const restore = failWritesTo([REWARD_INTENTS_KEY]);
    await expect(
      EntityCommandService.completeHabit("habit-intent-3", WS),
    ).rejects.toThrow(RewardIntentPersistenceError);
    restore();

    const habit = await HabitRepository.getHabit("habit-intent-3", WS);
    expect(habit?.completionHistory).toEqual([]);
    expect(await pebbleRewards()).toEqual([]);
    expect(await pendingIntentIds()).toEqual([]);

    await EntityCommandService.completeHabit("habit-intent-3", WS);
    expect(await pebbleRewards()).toEqual([
      `habit:habit-intent-3:${getTodayDateKey()}`,
    ]);
  });

  it("an entity-write failure after a durable intent leaves an orphan intent that is discarded, not paid", async () => {
    await TaskRepository.saveTask(makeTask("task-intent-4"));

    jest
      .spyOn(TaskRepository, "saveTaskUnlocked")
      .mockRejectedValueOnce(new Error("Disk Full"));

    await expect(
      EntityCommandService.completeTask("task-intent-4", WS),
    ).rejects.toThrow("Disk Full");

    expect((await TaskRepository.getTask("task-intent-4", WS))?.status).toBe("todo");
    expect(await pendingIntentIds()).toEqual(["task:task-intent-4"]);

    const report = await resolveAllRewardIntents();
    expect(report.credited).toBe(0);
    expect(await pebbleRewards()).toEqual([]);
    expect(await pendingIntentIds()).toEqual([]);

    // A genuine later completion is still rewarded exactly once.
    await EntityCommandService.completeTask("task-intent-4", WS);
    expect(await pebbleRewards()).toEqual(["task:task-intent-4"]);
  });

  it("the already-completed replay path never fails on an unreadable reward ledger", async () => {
    await TaskRepository.saveTask(makeTask("task-intent-5"));
    await EntityCommandService.completeTask("task-intent-5", WS);
    expect(await pebbleRewards()).toEqual(["task:task-intent-5"]);

    // Replaying a completed Task is a read-only settle of a possible intent; it
    // must not turn a healthy completion into an error when storage is unwell.
    const restore = failWritesTo([REWARD_INTENTS_KEY, PEBBLE_LOG_KEY]);
    const replay = await EntityCommandService.completeTask("task-intent-5", WS);
    restore();

    expect(replay?.updated.status).toBe("completed");
    expect(await pebbleRewards()).toEqual(["task:task-intent-5"]);
  });
});
