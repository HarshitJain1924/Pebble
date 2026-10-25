/**
 * checklistFocusRewardDurability.test.ts
 * ──────────────────────────────────────
 * Priority 2 (Checklist / Focus reward durability).
 *
 * Both domains used to call `earnPebble`, which swallows a failed reward write,
 * and both persisted their "reward already handled" state anyway:
 *
 *   - Checklist persisted `pebbleAwarded: true`, so a failed credit was lost
 *     forever (the one-time latch blocks every later attempt).
 *   - Focus resolved successfully, so `useFocusState` released its active-session
 *     recovery marker and there was nothing left to retry.
 *
 * Both now use the durable reward-intent ledger with domain-specific validation,
 * in the order intent → durable state → award. These tests inject failures at
 * each of those persistence boundaries through the real command/repository paths.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import {
  ChecklistRepository,
  WorkspaceRepository,
} from "@/repositories";
import { GraphRepository } from "@/repositories/GraphRepository";
import { FocusStatsRepository } from "@/repositories/FocusStatsRepository";
import {
  RewardIntentRepository,
  REWARD_INTENTS_KEY,
} from "@/repositories/RewardIntentRepository";
import {
  PEBBLE_LOG_KEY,
  earnPebbleWithOutcome,
} from "@/features/profile/services/pebble.service";
import {
  RewardIntentPersistenceError,
  resolveAllRewardIntents,
} from "@/features/profile/services/reward-intent.service";
import { emitStateChange } from "@/services/events/state-events";
import type { Checklist, Workspace } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("@/services/events/state-events", () => ({
  emitStateChange: jest.fn(),
  addStateListener: jest.fn(() => () => {}),
}));

const WS = "ws-reward-durability-2";
const FOCUS_SESSIONS_KEY = "pebble:v1:focus_sessions";

const makeChecklist = (
  id: string,
  overrides: Partial<Checklist> = {},
): Checklist =>
  ({
    id,
    workspaceId: WS,
    title: `Checklist ${id}`,
    priority: "none",
    items: [
      { id: "item-1", title: "Item 1", completed: false },
      { id: "item-2", title: "Item 2", completed: false },
    ],
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }) as Checklist;

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
const toggle = (checklistId: string, itemId: string, options = silently) =>
  EntityCommandService.toggleChecklistItem(checklistId, itemId, WS, options);

beforeEach(async () => {
  jest.restoreAllMocks();
  (emitStateChange as jest.Mock).mockClear();
  jest
    .spyOn(
      require("@/services/analytics/productivity-history.service"),
      "recordDailyHistorySnapshot",
    )
    .mockResolvedValue(undefined);

  await AsyncStorage.clear();
  GraphRepository.resetCache();
  await WorkspaceRepository.saveWorkspace({
    id: WS,
    name: "Reward durability WS 2",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
  } as Workspace);
});

/**
 * Checklist: at most one Pebble ever (`pebbleAwarded` latch), credited only for a
 * completion transition, never reversed, and never lost to a failed write.
 */
describe("Checklist reward durability", () => {
  it("credits exactly once when the Pebble write fails after the completion transition", async () => {
    await ChecklistRepository.saveChecklistUnlocked(makeChecklist("chk-1"));

    // First item: not a completion, so nothing is owed.
    await toggle("chk-1", "item-1");
    expect(await pebbleRewards()).toEqual([]);
    expect(await pendingIntentIds()).toEqual([]);

    const restore = failWritesTo([PEBBLE_LOG_KEY]);
    const result = await toggle("chk-1", "item-2");
    restore();

    // The completion itself commits: items and latch are durable.
    expect(result?.updated.pebbleAwarded).toBe(true);
    expect(result?.updated.items.every((item) => item.completed)).toBe(true);
    expect(await pebbleRewards()).toEqual([]);
    expect(await pendingIntentIds()).toEqual(["checklist:chk-1"]);

    const stored = await ChecklistRepository.getChecklist("chk-1", WS);
    expect(stored?.pebbleAwarded).toBe(true);

    const report = await resolveAllRewardIntents();
    expect(report.credited).toBe(1);
    expect(await pebbleRewards()).toEqual(["checklist:chk-1"]);
    expect(await pendingIntentIds()).toEqual([]);

    // Repeated recovery and further toggles stay at exactly one reward.
    await resolveAllRewardIntents();
    await resolveAllRewardIntents();
    await toggle("chk-1", "item-1"); // uncheck
    await toggle("chk-1", "item-1"); // re-complete
    expect(await pebbleRewards()).toEqual(["checklist:chk-1"]);
    expect(await pendingIntentIds()).toEqual([]);
  });

  it("repairs a lost credit on the next committed toggle (replay path)", async () => {
    await ChecklistRepository.saveChecklistUnlocked(makeChecklist("chk-2"));

    const restore = failWritesTo([PEBBLE_LOG_KEY]);
    await toggle("chk-2", "item-1");
    await toggle("chk-2", "item-2");
    restore();
    expect(await pendingIntentIds()).toEqual(["checklist:chk-2"]);

    // The user keeps working with the checklist: the next toggle settles the
    // owed reward without waiting for a restart.
    await toggle("chk-2", "item-1");
    expect(await pebbleRewards()).toEqual(["checklist:chk-2"]);
    expect(await pendingIntentIds()).toEqual([]);
  });

  it("retains and pays nothing when the checklist persistence fails", async () => {
    await ChecklistRepository.saveChecklistUnlocked(
      makeChecklist("chk-3", {
        items: [
          { id: "item-1", title: "Item 1", completed: true },
          { id: "item-2", title: "Item 2", completed: false },
        ],
      }),
    );

    const restore = failWritesTo([`pebble:v1:checklists:${WS}`]);
    await expect(toggle("chk-3", "item-2")).rejects.toThrow();
    restore();

    // The completion never committed: the stored checklist is still incomplete
    // and still carries no latch.
    const stored = await ChecklistRepository.getChecklist("chk-3", WS);
    expect(stored?.items.find((item) => item.id === "item-2")?.completed).toBe(false);
    expect(stored?.pebbleAwarded).toBeFalsy();

    // The orphaned intent is discarded, not paid.
    const report = await resolveAllRewardIntents();
    expect(report.credited).toBe(0);
    expect(report.retained).toBe(0);
    expect(report.discardedOrAlreadySettled).toBe(1);
    expect(await pebbleRewards()).toEqual([]);
    expect(await pendingIntentIds()).toEqual([]);
  });

  it("aborts without a state change when the reward intent cannot be persisted", async () => {
    await ChecklistRepository.saveChecklistUnlocked(
      makeChecklist("chk-4", {
        items: [
          { id: "item-1", title: "Item 1", completed: true },
          { id: "item-2", title: "Item 2", completed: false },
        ],
      }),
    );

    const restore = failWritesTo([REWARD_INTENTS_KEY]);
    await expect(
      EntityCommandService.toggleChecklistItem("chk-4", "item-2", WS),
    ).rejects.toThrow(RewardIntentPersistenceError);
    restore();

    const stored = await ChecklistRepository.getChecklist("chk-4", WS);
    expect(stored?.items.find((item) => item.id === "item-2")?.completed).toBe(false);
    expect(stored?.pebbleAwarded).toBeFalsy();
    expect(await pebbleRewards()).toEqual([]);
    expect(await pendingIntentIds()).toEqual([]);
    expect(emitStateChange).not.toHaveBeenCalled();

    // Storage recovery lets the completion (and its one reward) succeed.
    await toggle("chk-4", "item-2");
    expect(await pebbleRewards()).toEqual(["checklist:chk-4"]);
    expect(await pendingIntentIds()).toEqual([]);
  });

  it("never rewards an incomplete checklist", async () => {
    await ChecklistRepository.saveChecklistUnlocked(makeChecklist("chk-5"));

    await toggle("chk-5", "item-1");

    const stored = await ChecklistRepository.getChecklist("chk-5", WS);
    expect(stored?.pebbleAwarded).toBeFalsy();
    expect(await pebbleRewards()).toEqual([]);
    expect(await pendingIntentIds()).toEqual([]);
  });

  it("concurrent toggles and concurrent recovery credit the one-time reward once", async () => {
    await ChecklistRepository.saveChecklistUnlocked(makeChecklist("chk-6"));

    await Promise.all([
      toggle("chk-6", "item-1"),
      toggle("chk-6", "item-2"),
      toggle("chk-6", "item-1"),
    ]);

    expect(await pebbleRewards()).toEqual(["checklist:chk-6"]);
    expect(await pendingIntentIds()).toEqual([]);

    await Promise.all([resolveAllRewardIntents(), resolveAllRewardIntents()]);
    expect(await pebbleRewards()).toEqual(["checklist:chk-6"]);

    const stored = await ChecklistRepository.getChecklist("chk-6", WS);
    expect(stored?.pebbleAwarded).toBe(true);
    expect(stored?.revision).toBeGreaterThan(1);
  });

  it("keeps the recurring one-time latch across occurrences, even after a failed award", async () => {
    const day1 = "2026-10-20";
    const day2 = "2026-10-21";
    await ChecklistRepository.saveChecklistUnlocked(
      makeChecklist("chk-7", {
        recurrence: { frequency: "daily", interval: 1 },
        schedule: { date: day1 },
      }),
    );

    const restore = failWritesTo([PEBBLE_LOG_KEY]);
    await EntityCommandService.toggleChecklistItem("chk-7", "item-1", WS, day1, silently);
    await EntityCommandService.toggleChecklistItem("chk-7", "item-2", WS, day1, silently);
    restore();

    expect(await pendingIntentIds()).toEqual([`checklist:chk-7:${day1}`]);

    const report = await resolveAllRewardIntents();
    expect(report.credited).toBe(1);
    expect(await pebbleRewards()).toEqual([`checklist:chk-7:${day1}`]);

    // The next occurrence completes too, but the checklist-wide latch holds.
    await EntityCommandService.toggleChecklistItem("chk-7", "item-1", WS, day2, silently);
    await EntityCommandService.toggleChecklistItem("chk-7", "item-2", WS, day2, silently);

    expect(await pebbleRewards()).toEqual([`checklist:chk-7:${day1}`]);
    expect(await pendingIntentIds()).toEqual([]);

    const stored = await ChecklistRepository.getChecklist("chk-7", WS);
    expect(stored?.occurrenceHistory?.[day1]?.completedAt).toBeDefined();
    expect(stored?.occurrenceHistory?.[day2]?.completedAt).toBeDefined();
    expect(stored?.pebbleAwarded).toBe(true);
  });
});

/**
 * Focus: the stable session id identifies the session, its stats credit and its
 * reward. The owed reward is recorded before the session, credited after it, and
 * recovery validates the session against the durable focus-session ledger.
 */
describe("Focus reward durability", () => {
  const record = (sessionId: string) =>
    EntityCommandService.recordFocusSession(1500, undefined, undefined, {
      sessionId,
      startedAt: 1_000,
      endedAt: 61_000,
    });

  async function focusSessionIds(): Promise<string[]> {
    const sessions = await GraphRepository.getFocusSessions();
    return sessions.map((session) => session.id);
  }

  it("credits exactly once when the Pebble write fails after the session is persisted", async () => {
    const restore = failWritesTo([PEBBLE_LOG_KEY]);
    await record("focus_1");
    restore();

    // The command resolved: session + stats are durable.
    expect(await focusSessionIds()).toEqual(["focus_1"]);
    const stats = await FocusStatsRepository.getFocusStats();
    expect(stats.completedToday).toBe(1);
    expect(stats.totalFocusTime).toBe(25);
    expect(await pebbleRewards()).toEqual([]);
    expect(await pendingIntentIds()).toEqual(["focus:focus_1"]);

    const report = await resolveAllRewardIntents();
    expect(report.credited).toBe(1);
    expect(await pebbleRewards()).toEqual(["focus:focus_1"]);
    expect(await pendingIntentIds()).toEqual([]);

    await resolveAllRewardIntents();
    await resolveAllRewardIntents();
    expect(await pebbleRewards()).toEqual(["focus:focus_1"]);
  });

  it("pays nothing for a session that never persisted", async () => {
    const restore = failWritesTo([FOCUS_SESSIONS_KEY]);
    await expect(record("focus_2")).rejects.toThrow();
    restore();

    // No durable session, no stats credit; the orphaned intent is discarded.
    expect(await focusSessionIds()).toEqual([]);
    expect((await FocusStatsRepository.getFocusStats()).completedToday).toBe(0);
    expect(await pendingIntentIds()).toEqual(["focus:focus_2"]);

    const report = await resolveAllRewardIntents();
    expect(report.credited).toBe(0);
    expect(report.retained).toBe(0);
    expect(await pebbleRewards()).toEqual([]);
    expect(await pendingIntentIds()).toEqual([]);
  });

  it("aborts before persisting the session when the reward intent cannot be written", async () => {
    const restore = failWritesTo([REWARD_INTENTS_KEY]);
    await expect(record("focus_3")).rejects.toThrow(RewardIntentPersistenceError);
    restore();

    // Nothing durable happened, so the timer's active-session recovery marker is
    // still valid: `useFocusState.completeTimerSession` releases it only after
    // this command resolves, and it rejected.
    expect(await focusSessionIds()).toEqual([]);
    expect((await FocusStatsRepository.getFocusStats()).completedToday).toBe(0);
    expect(await pebbleRewards()).toEqual([]);
    expect(await pendingIntentIds()).toEqual([]);

    // The retained marker lets the retry commit the same stable session id.
    await record("focus_3");
    expect(await focusSessionIds()).toEqual(["focus_3"]);
    expect((await FocusStatsRepository.getFocusStats()).completedToday).toBe(1);
    expect(await pebbleRewards()).toEqual(["focus:focus_3"]);
  });

  it("does not duplicate the session, stats, relationship or reward across a retry", async () => {
    const recordLinked = () =>
      EntityCommandService.recordFocusSession(1500, "task-linked", "task", {
        sessionId: "focus_4",
        startedAt: 1_000,
        endedAt: 61_000,
      });

    const restore = failWritesTo([PEBBLE_LOG_KEY]);
    await recordLinked();
    restore();
    expect(await pendingIntentIds()).toEqual(["focus:focus_4"]);

    // Retry of the same stable session id (timer recovery / replay).
    await recordLinked();
    await resolveAllRewardIntents();

    expect(await focusSessionIds()).toEqual(["focus_4"]);

    const stats = await FocusStatsRepository.getFocusStats();
    expect(stats.completedToday).toBe(1);
    expect(stats.totalFocusTime).toBe(25);
    expect(stats.creditedSessionIds).toEqual(["focus_4"]);

    const edges = await GraphRepository.getAllRelationships();
    expect(edges).toHaveLength(1);
    expect(edges[0].id).toBe("rel_focus_focus_4_task-linked");
    expect(edges[0].relationType).toBe("focuses_on");
    expect(edges[0].source.id).toBe("focus_4");
    expect(edges[0].target.id).toBe("task-linked");

    expect(await pebbleRewards()).toEqual(["focus:focus_4"]);
    expect(await pendingIntentIds()).toEqual([]);
  });

  it("keeps the daily cap intentional: a capped reward is dropped, not backlogged", async () => {
    for (let index = 0; index < 15; index++) {
      expect(await earnPebbleWithOutcome("task", `cap-seed-${index}`)).toBe("awarded");
    }

    await record("focus_5");

    // The completion still committed; the capped reward is dropped by design.
    expect(await focusSessionIds()).toEqual(["focus_5"]);
    expect((await FocusStatsRepository.getFocusStats()).completedToday).toBe(1);

    const report = await resolveAllRewardIntents();
    expect(report.credited).toBe(0);
    expect((await pebbleRewards()).filter((id) => id.startsWith("focus:"))).toEqual([]);
    // A cap drop is terminal by product design: no intent is kept for tomorrow.
    expect(await pendingIntentIds()).toEqual([]);
    expect((await pebbleRewards()).length).toBe(15);
  });

  it("applies the same cap policy to the one-time checklist reward", async () => {
    for (let index = 0; index < 15; index++) {
      expect(await earnPebbleWithOutcome("task", `cap-seed-${index}`)).toBe("awarded");
    }
    await ChecklistRepository.saveChecklistUnlocked(
      makeChecklist("chk-8", {
        items: [{ id: "item-1", title: "Item 1", completed: false }],
      }),
    );

    await toggle("chk-8", "item-1");

    const stored = await ChecklistRepository.getChecklist("chk-8", WS);
    expect(stored?.pebbleAwarded).toBe(true);
    expect(await pendingIntentIds()).toEqual([]);
    expect((await pebbleRewards()).length).toBe(15);
  });
});
