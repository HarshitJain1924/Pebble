/**
 * pebbleEconomy.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Primary authoritative test suite for Pebble Economy and Gems Accounting.
 * Consolidates:
 *   - Core invariants & identity rules (pebbleEconomy.test.ts, pebbleEconomyInvariants.test.ts)
 *   - Restart persistence, concurrency & cap recovery (pebbleEconomyHardening.test.ts)
 *   - Accounting integrity, idempotency, failure rollback & reconciliation (pebbleAccountingIntegrity.test.ts)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  earnPebble,
  reversePebbleReward,
  spendGems,
  spendPebbles,
  earnBonusGem,
  recoverMainStreak,
  getMainStreakRecoveryInfo,
  getPebbleCounts,
  getGemsBalance,
  reconcilePebbleAccounting,
  PEBBLE_LOG_KEY,
  GEMS_BONUS_KEY,
  GEMS_SPENT_KEY,
  STREAK_RECOVERIES_KEY,
  PEBBLE_SPENT_KEY,
  type PebbleLogEntry,
  type PebbleType,
  type SpendLogEntry,
} from "../pebble.service";
import { dateKeyFromDate } from "@/shared/utils/date-key";
import { WorkspaceRepository, TaskRepository } from "@/repositories";
import { emitStateChange } from "@/services/events/state-events";

let mockStore: Record<string, string> = {};

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async (key: string) => mockStore[key] ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockStore[key] = String(value);
    return null;
  }),
  removeItem: jest.fn(async (key: string) => {
    delete mockStore[key];
    return null;
  }),
  clear: jest.fn(async () => {
    mockStore = {};
    return null;
  }),
}));

jest.mock("@/services/events/state-events", () => ({
  emitStateChange: jest.fn(),
}));

jest.mock("@/repositories", () => ({
  WorkspaceRepository: { getWorkspaces: jest.fn() },
  TaskRepository: { getTasks: jest.fn() },
}));

const TYPES: PebbleType[] = ["task", "habit", "focus", "checklist"];

function emptyTypes() {
  return { task: 0, habit: 0, focus: 0, checklist: 0 };
}

function seedLog(entries: Partial<PebbleLogEntry>[]): void {
  const now = Date.now();
  mockStore[PEBBLE_LOG_KEY] = JSON.stringify(
    entries.map((entry) => ({
      type: "task" as PebbleType,
      timestamp: now,
      ...entry,
    }))
  );
}

function seedPebbles(count: number, type: PebbleType = "task"): void {
  seedLog(
    Array.from({ length: count }, (_, i) => ({
      type,
      timestamp: Date.now() - i * 1000,
      rewardId: `${type}:seed-${i}`,
    }))
  );
}

function logLength(): number {
  return JSON.parse(mockStore[PEBBLE_LOG_KEY] ?? "[]").length;
}

function log(): PebbleLogEntry[] {
  return JSON.parse(mockStore[PEBBLE_LOG_KEY] ?? "[]");
}

function bonusGems(): number {
  return parseInt(mockStore[GEMS_BONUS_KEY] ?? "0", 10);
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("Pebble Economy Suite", () => {
  beforeEach(() => {
    mockStore = {};
    jest.clearAllMocks();
    (WorkspaceRepository.getWorkspaces as jest.Mock).mockResolvedValue([]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({});
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
      mockStore[key] = String(value);
      return null;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // =========================================================================
  // 1. Core Invariants (Identity, Caps, Conversion, Date Boundaries)
  // =========================================================================
  describe("core economy invariants", () => {

  // ────────────────────────────────────────────────────────────────────────
  // 1. Eligible completion types
  // ────────────────────────────────────────────────────────────────────────
  describe("eligible completion types", () => {
    it.each(TYPES)(
      "records exactly one lifetime Pebble for a %s completion",
      async (type) => {
        expect(await earnPebble(type, `${type}:completion-1`)).toBe(true);

        const counts = await getPebbleCounts();
        const expected = emptyTypes();
        expected[type] = 1;

        expect(counts.lifetime).toBe(1);
        expect(counts.lifetimeTypes).toEqual(expected);
        expect(counts.todayTypes).toEqual(expected);
        expect(counts.today).toBe(1);
      },
    );
  });

  // ────────────────────────────────────────────────────────────────────────
  // 2. Idempotency
  // ────────────────────────────────────────────────────────────────────────
  describe("rewardId idempotency", () => {
    it("rewards the same completion identity exactly once", async () => {
      expect(await earnPebble("task", "task-completion-123")).toBe(true);
      expect(await earnPebble("task", "task-completion-123")).toBe(true);
      expect(await earnPebble("task", "task-completion-123")).toBe(true);

      expect(logLength()).toBe(1);
      expect(parseInt(mockStore[GEMS_BONUS_KEY] ?? "0", 10)).toBe(1);
    });

    it("rejects a rewardId replayed with a conflicting type", async () => {
      expect(await earnPebble("task", "shared-entity-1")).toBe(true);
      expect(await earnPebble("habit", "shared-entity-1")).toBe(false);

      const log: PebbleLogEntry[] = JSON.parse(mockStore[PEBBLE_LOG_KEY]);
      expect(log.length).toBe(1);
      expect(log[0].type).toBe("task");
    });

    it("keeps distinct rewardIds distinct", async () => {
      await earnPebble("task", "task:a");
      await earnPebble("task", "task:b");

      expect(logLength()).toBe(2);
      expect((await getPebbleCounts()).lifetime).toBe(2);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 3. Reversal
  // ────────────────────────────────────────────────────────────────────────
  describe("reversal", () => {
    it("removes only the targeted reward", async () => {
      await earnPebble("task", "task:keep");
      await earnPebble("habit", "habit:undo");

      expect(await reversePebbleReward("habit:undo")).toBe(true);

      const log: PebbleLogEntry[] = JSON.parse(mockStore[PEBBLE_LOG_KEY]);
      expect(log.length).toBe(1);
      expect(log[0].rewardId).toBe("task:keep");
    });

    it("is idempotent and safe for an unknown rewardId", async () => {
      await earnPebble("task", "task:single");

      expect(await reversePebbleReward("does-not-exist")).toBe(false);
      expect(logLength()).toBe(1);

      expect(await reversePebbleReward("task:single")).toBe(true);
      expect(logLength()).toBe(0);

      expect(await reversePebbleReward("task:single")).toBe(false);
      expect(logLength()).toBe(0);
    });

    it("rolls back the daily bonus Gem when the day's only Pebble is reversed", async () => {
      await earnPebble("task", "task:sole");
      expect(parseInt(mockStore[GEMS_BONUS_KEY] ?? "0", 10)).toBe(1);

      await reversePebbleReward("task:sole");
      expect(parseInt(mockStore[GEMS_BONUS_KEY] ?? "0", 10)).toBe(0);
      expect(await getGemsBalance()).toBe(0);
    });

    it("does not roll back the bonus Gem when other Pebbles remain that day", async () => {
      await earnPebble("task", "task:first");
      await earnPebble("habit", "habit:second");

      await reversePebbleReward("habit:second");
      expect(parseInt(mockStore[GEMS_BONUS_KEY] ?? "0", 10)).toBe(1);
      expect((await getPebbleCounts()).lifetime).toBe(1);
    });

    it("keeps Pebble-derived Gems consistent after a reversal", async () => {
      seedPebbles(45);
      expect(await getGemsBalance()).toBe(1);

      expect(await reversePebbleReward("task:seed-0")).toBe(true);
      expect(logLength()).toBe(44);
      expect(await getGemsBalance()).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 4. Daily cap
  // ────────────────────────────────────────────────────────────────────────
  describe("daily cap", () => {
    it("accepts exactly 15 reward events per local day", async () => {
      for (let i = 0; i < 15; i++) {
        expect(await earnPebble("task", `task:cap-${i}`)).toBe(true);
      }
      expect(await earnPebble("task", "task:cap-16")).toBe(false);

      const counts = await getPebbleCounts();
      expect(counts.lifetime).toBe(15);
      expect(counts.today).toBe(15);
    });

    it("counts the cap across all Pebble types, not per type", async () => {
      for (let i = 0; i < 15; i++) {
        expect(await earnPebble(TYPES[i % TYPES.length], `mixed-${i}`)).toBe(
          true,
        );
      }
      // A brand new type (checklist) is still rejected — the cap is global.
      expect(await earnPebble("checklist", "checklist:overflow")).toBe(false);
      expect(logLength()).toBe(15);
    });

    it("still reports success from idempotency when the cap is reached", async () => {
      await earnPebble("task", "task:already-earned");
      for (let i = 0; i < 14; i++) {
        await earnPebble("task", `task:filler-${i}`);
      }
      expect(logLength()).toBe(15);

      // Replay of an existing reward is a no-op success, not a cap rejection,
      // and must not write a duplicate entry.
      expect(await earnPebble("task", "task:already-earned")).toBe(true);
      expect(logLength()).toBe(15);
    });

    it("frees headroom when an earlier reward is reversed", async () => {
      for (let i = 0; i < 15; i++) {
        await earnPebble("task", `task:cap-${i}`);
      }
      expect(await earnPebble("task", "task:rejected-at-cap")).toBe(false);

      await reversePebbleReward("task:cap-0");
      expect(await earnPebble("task", "task:after-reversal")).toBe(true);
      expect((await getPebbleCounts()).lifetime).toBe(15);
    });

    it("resets the cap on the next local calendar day", async () => {
      jest.useFakeTimers({ now: new Date(2026, 8, 10, 23, 59, 0) });

      for (let i = 0; i < 15; i++) {
        expect(await earnPebble("task", `task:day1-${i}`)).toBe(true);
      }
      expect(await earnPebble("task", "task:day1-overflow")).toBe(false);

      jest.setSystemTime(new Date(2026, 8, 11, 0, 1, 0));

      expect(await earnPebble("task", "task:day2-1")).toBe(true);

      const counts = await getPebbleCounts();
      expect(counts.lifetime).toBe(16);
      expect(counts.today).toBe(1);
      // One bonus Gem for each active local day.
      expect(parseInt(mockStore[GEMS_BONUS_KEY] ?? "0", 10)).toBe(2);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 5. Gem conversion
  // ────────────────────────────────────────────────────────────────────────
  describe("Pebble -> Gem conversion (45:1)", () => {
    it.each([
      [0, 0],
      [1, 0],
      [44, 0],
      [45, 1],
      [46, 1],
      [89, 1],
      [90, 2],
      [135, 3],
    ])("%i lifetime Pebbles → %i Gems", async (pebbles, gems) => {
      if (pebbles > 0) seedPebbles(pebbles);
      expect(await getGemsBalance()).toBe(gems);
    });

    it("keeps bonus Gems separate from Pebble-derived Gems", async () => {
      seedPebbles(45);
      expect(await getGemsBalance()).toBe(1);

      await earnBonusGem(3);
      expect(await getGemsBalance()).toBe(4);
      expect(parseInt(mockStore[GEMS_BONUS_KEY] ?? "0", 10)).toBe(3);
      // The Pebble log itself is untouched by bonus Gems.
      expect(logLength()).toBe(45);
    });

    it("subtracts spent Gems from derived plus bonus", async () => {
      seedPebbles(135);
      await earnBonusGem(2);
      expect(await getGemsBalance()).toBe(5);

      expect(await spendGems(1)).toBe(true);
      expect(await getGemsBalance()).toBe(4);
      expect(mockStore[GEMS_SPENT_KEY]).toBe("1");
    });

    it("never lets the balance go negative", async () => {
      seedPebbles(45);
      expect(await spendGems(5)).toBe(false);
      expect(await getGemsBalance()).toBe(1);
      expect(mockStore[GEMS_SPENT_KEY]).toBeUndefined();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 6. Spending safety
  // ────────────────────────────────────────────────────────────────────────
  describe("spending", () => {
    it("rejects invalid amounts", async () => {
      await earnBonusGem(2);

      expect(await spendGems(0)).toBe(false);
      expect(await spendGems(-1)).toBe(false);
      expect(await spendGems(NaN)).toBe(false);
      expect(await getGemsBalance()).toBe(2);
    });

    it("rejects a conflicting spendId replay", async () => {
      await earnBonusGem(5);

      expect(await spendGems(2, { spendId: "tx-1" })).toBe(true);
      expect(await spendGems(5, { spendId: "tx-1" })).toBe(false);
      expect(await getGemsBalance()).toBe(3);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 7. Concurrency
  // ────────────────────────────────────────────────────────────────────────
  describe("concurrency", () => {
    it("does not lose rewards when unique completions land together", async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          earnPebble("task", `task:parallel-${i}`),
        ),
      );

      expect(results.every(Boolean)).toBe(true);
      const counts = await getPebbleCounts();
      expect(counts.lifetime).toBe(10);
      expect(parseInt(mockStore[GEMS_BONUS_KEY] ?? "0", 10)).toBe(1);
    });

    it("collapses concurrent duplicate completions into one reward", async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, () => earnPebble("task", "task:duplicate")),
      );

      expect(results.every(Boolean)).toBe(true);
      expect(logLength()).toBe(1);
      expect(parseInt(mockStore[GEMS_BONUS_KEY] ?? "0", 10)).toBe(1);
    });

    it("serializes concurrent Gem spends so the balance cannot double-spend", async () => {
      await earnBonusGem(1);

      const results = await Promise.all([
        spendGems(1, { spendId: "tx-a" }),
        spendGems(1, { spendId: "tx-b" }),
      ]);

      expect(results.filter(Boolean).length).toBe(1);
      expect(mockStore[GEMS_SPENT_KEY]).toBe("1");
      expect(await getGemsBalance()).toBe(0);
    });

    it("does not lose a reward earned while the first-run backfill is in flight", async () => {
      // Hold the lazy backfill open so it overlaps the reward write.
      let releaseBackfill!: () => void;
      const backfillGate = new Promise<void>((resolve) => {
        releaseBackfill = resolve;
      });
      (WorkspaceRepository.getWorkspaces as jest.Mock).mockImplementation(
        async () => {
          await backfillGate;
          return [];
        },
      );

      const countsPromise = getPebbleCounts();
      await tick();

      const earnPromise = earnPebble("task", "task:raced-with-backfill");
      await tick();

      releaseBackfill();

      expect(await earnPromise).toBe(true);
      await countsPromise;

      const counts = await getPebbleCounts();
      expect(counts.lifetime).toBe(1);
      expect(counts.lifetimeTypes.task).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 8. Date semantics
  // ────────────────────────────────────────────────────────────────────────
  describe("date semantics", () => {
    it("buckets 'today' by the canonical local date key", async () => {
      const lateEvening = new Date(2026, 8, 10, 23, 30, 0);
      seedLog([{ type: "task", timestamp: lateEvening.getTime() }]);

      jest.useFakeTimers({ now: new Date(2026, 8, 10, 23, 45, 0) });

      const counts = await getPebbleCounts();
      expect(counts.today).toBe(1);
      expect(dateKeyFromDate(lateEvening)).toBe("2026-09-10");
    });

    it("does not count the next local day as today", async () => {
      seedLog([{ type: "task", timestamp: new Date(2026, 8, 11, 0, 15, 0).getTime() }]);

      jest.useFakeTimers({ now: new Date(2026, 8, 10, 23, 45, 0) });

      const counts = await getPebbleCounts();
      expect(counts.today).toBe(0);
      expect(counts.lifetime).toBe(1);
    });

    it("awards exactly one bonus Gem per active local day", async () => {
      jest.useFakeTimers({ now: new Date(2026, 8, 10, 10, 0, 0) });

      await earnPebble("task", "task:day1-a");
      await earnPebble("task", "task:day1-b");
      expect(parseInt(mockStore[GEMS_BONUS_KEY] ?? "0", 10)).toBe(1);

      jest.setSystemTime(new Date(2026, 8, 11, 10, 0, 0));
      await earnPebble("task", "task:day2-a");
      expect(parseInt(mockStore[GEMS_BONUS_KEY] ?? "0", 10)).toBe(2);
    });
  });
  });

  // =========================================================================
  // 2. Restart Persistence & Hardening Guarantees
  // =========================================================================
  describe("persistence, daily cap re-derivation, and concurrency hardening", () => {

  // ────────────────────────────────────────────────────────────────────────
  // Restart persistence
  // ────────────────────────────────────────────────────────────────────────
  it("survives an app restart with no lost or duplicated rewards", async () => {
    await earnPebble("task", "task:restart-1");
    await earnPebble("habit", "habit:restart-1");

    // A restart only loses in-memory state; re-read everything from storage.
    const persisted = log();
    expect(persisted.length).toBe(2);
    expect(persisted.map((e) => e.rewardId).sort()).toEqual([
      "habit:restart-1",
      "task:restart-1",
    ]);

    const counts = await getPebbleCounts();
    expect(counts.lifetime).toBe(2);
    expect(counts.lifetimeTypes).toEqual({
      task: 1,
      habit: 1,
      focus: 0,
      checklist: 0,
    });
    expect(bonusGems()).toBe(1);

    // Replaying an already-persisted reward after restart stays idempotent.
    expect(await earnPebble("task", "task:restart-1")).toBe(true);
    expect(log().length).toBe(2);
  });

  it("enforces the daily cap from persisted storage after a restart, and a reversal reopens headroom", async () => {
    for (let i = 0; i < 15; i++) {
      expect(await earnPebble("task", `task:cap-restart-${i}`)).toBe(true);
    }

    // "Restart": the cap is re-derived purely from persisted entries.
    expect(log().length).toBe(15);
    expect(await earnPebble("task", "task:cap-restart-16")).toBe(false);
    expect(log().length).toBe(15);

    // A reversal reopens exactly one slot. The completion that was rejected at
    // the cap is never auto-retried (no backlog, by design).
    expect(await reversePebbleReward("task:cap-restart-0")).toBe(true);
    expect(await earnPebble("task", "task:cap-restart-retry")).toBe(true);
    expect(log().length).toBe(15);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Bonus Gem invariants
  // ────────────────────────────────────────────────────────────────────────
  it("grants exactly one bonus Gem per local day across reversal and re-earn", async () => {
    await earnPebble("task", "task:first");
    expect(bonusGems()).toBe(1);

    // Reversing the day's only Pebble rolls the bonus Gem back...
    await reversePebbleReward("task:first");
    expect(bonusGems()).toBe(0);

    // ...and re-earning it (a different completion) grants exactly one again.
    await earnPebble("habit", "habit:later");
    expect(bonusGems()).toBe(1);

    // A second reward the same day never grants another bonus Gem.
    await earnPebble("task", "task:second");
    expect(bonusGems()).toBe(1);
    expect(log().length).toBe(2);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Concurrency
  // ────────────────────────────────────────────────────────────────────────
  it("collapses concurrent reversals of the same reward into a single mutation", async () => {
    await earnPebble("task", "task:keep");
    await earnPebble("habit", "habit:undo");

    const results = await Promise.all(
      Array.from({ length: 5 }, () => reversePebbleReward("habit:undo")),
    );

    expect(results.filter(Boolean).length).toBe(1);
    expect(log().length).toBe(1);
    expect(log()[0].rewardId).toBe("task:keep");
  });

  it("never produces a duplicate when earning and reversing the same reward concurrently", async () => {
    const [earned, reversed] = await Promise.all([
      earnPebble("task", "task:earn-vs-reverse"),
      reversePebbleReward("task:earn-vs-reverse"),
    ]);

    expect(typeof earned).toBe("boolean");
    expect(typeof reversed).toBe("boolean");

    const entries = log();
    expect(entries.length).toBeLessThanOrEqual(1);
    if (entries.length === 1) {
      expect(entries[0].rewardId).toBe("task:earn-vs-reverse");
    }
    // The derived balance can never exceed the surviving reward.
    expect(await getGemsBalance()).toBe(0);
  });

  it("never deletes a different reward while reversing another concurrently", async () => {
    await earnPebble("focus", "focus:to-reverse");

    await Promise.all([
      reversePebbleReward("focus:to-reverse"),
      earnPebble("checklist", "checklist:keep"),
    ]);

    const rewardIds = log().map((e) => e.rewardId);
    expect(rewardIds).not.toContain("focus:to-reverse");
    expect(rewardIds).toEqual(["checklist:keep"]);
  });

  it("serializes concurrent bonus Gem awards so none are lost", async () => {
    await Promise.all(
      Array.from({ length: 5 }, () => earnBonusGem(2)),
    );

    expect(bonusGems()).toBe(10);
    expect(await getGemsBalance()).toBe(10);
  });

  it("records concurrent mixed-type rewards per type without loss", async () => {
    const types = ["task", "habit", "focus", "checklist"] as const;

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        earnPebble(types[i % 4], `${types[i % 4]}:mixed-${i}`),
      ),
    );

    expect(results.every(Boolean)).toBe(true);

    const counts = await getPebbleCounts();
    expect(counts.lifetime).toBe(12);
    expect(counts.lifetimeTypes).toEqual({
      task: 3,
      habit: 3,
      focus: 3,
      checklist: 3,
    });
  });

  it("keeps concurrent Gem spends from overdrawing the balance", async () => {
    await earnBonusGem(1);

    const results = await Promise.all([
      spendGems(1, { spendId: "tx-1" }),
      spendGems(1, { spendId: "tx-2" }),
      spendGems(1, { spendId: "tx-3" }),
    ]);

    expect(results.filter(Boolean).length).toBe(1);
    expect(mockStore[GEMS_SPENT_KEY]).toBe("1");
    expect(await getGemsBalance()).toBe(0);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Legacy API isolation
  // ────────────────────────────────────────────────────────────────────────
  describe("legacy spending traps", () => {
    it("no longer exports the misleading getPebbleBalance Gem alias", () => {
      const service = require("../pebble.service");

      expect(service.getPebbleBalance).toBeUndefined();
    });

    it("keeps spendPebbles as an explicitly legacy/test-only wrapper off the 45:1 model", async () => {
      const service = require("../pebble.service");
      expect(typeof service.spendPebbles).toBe("function");

      // Legacy units: 10 legacy pebbles -> 1 Gem (NOT the canonical 45:1).
      await earnBonusGem(5);
      expect(await service.spendPebbles(10)).toBe(true);
      expect(await getGemsBalance()).toBe(4);

      // The canonical spend path remains Gem-denominated.
      await spendGems(1);
      expect(await getGemsBalance()).toBe(3);
    });
  });
  });

  // =========================================================================
  // 3. Accounting Integrity, Idempotency & Transactional Recovery
  // =========================================================================
  describe("accounting integrity, ledger idempotency, and transactional recovery", () => {

  beforeEach(() => {
    mockStore = {};
    jest.clearAllMocks();
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
      mockStore[key] = String(value);
      return null;
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Legacy spendPebbles(amount) Semantics
  // ──────────────────────────────────────────────────────────────────────────
  describe("Legacy spendPebbles(amount) Semantics", () => {
    it("maps 10 legacy pebbles to 1 Gem", async () => {
      await earnBonusGem(3);
      expect(await getGemsBalance()).toBe(3);

      const success = await spendPebbles(10);
      expect(success).toBe(true);
      expect(await getGemsBalance()).toBe(2);
      expect(mockStore[GEMS_SPENT_KEY]).toBe("1");
    });

    it("maps 20 legacy pebbles to 2 Gems", async () => {
      await earnBonusGem(3);
      const success = await spendPebbles(20);
      expect(success).toBe(true);
      expect(await getGemsBalance()).toBe(1);
      expect(mockStore[GEMS_SPENT_KEY]).toBe("2");
    });

    it("maps small non-zero amounts (<10) to at least 1 Gem floor", async () => {
      await earnBonusGem(2);
      const success = await spendPebbles(5);
      expect(success).toBe(true);
      expect(await getGemsBalance()).toBe(1);
    });

    it("rejects non-positive amounts without spending gems", async () => {
      await earnBonusGem(2);
      (emitStateChange as jest.Mock).mockClear();

      expect(await spendPebbles(0)).toBe(false);
      expect(await spendPebbles(-10)).toBe(false);
      expect(await spendPebbles(NaN)).toBe(false);
      expect(await getGemsBalance()).toBe(2);
      expect(emitStateChange).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Base Idempotency Tests
  // ──────────────────────────────────────────────────────────────────────────
  describe("Base Idempotency", () => {
    it("earning the same rewardId twice records only one entry and one bonus gem", async () => {
      const rewardId = "task:test-101";

      const first = await earnPebble("task", rewardId);
      expect(first).toBe(true);

      const emitCountAfterFirst = (emitStateChange as jest.Mock).mock.calls.length;
      expect(emitCountAfterFirst).toBeGreaterThanOrEqual(1);

      // Second identical call
      const second = await earnPebble("task", rewardId);
      expect(second).toBe(true);

      // Verify only 1 log entry exists in canonical storage
      const rawLog = mockStore[PEBBLE_LOG_KEY];
      const log: PebbleLogEntry[] = JSON.parse(rawLog);
      expect(log.length).toBe(1);
      expect(log[0].rewardId).toBe(rewardId);

      // Bonus gem awarded exactly once (not twice)
      const bonusGems = parseInt(mockStore[GEMS_BONUS_KEY] || "0", 10);
      expect(bonusGems).toBe(1);

      // pebbles_changed not emitted on redundant second call
      const emitCountAfterSecond = (emitStateChange as jest.Mock).mock.calls.length;
      expect(emitCountAfterSecond).toBe(emitCountAfterFirst);
    });

    it("reversing the same rewardId twice rolls back once and safely no-ops on second call", async () => {
      const rewardId = "habit:read:2026-09-10";

      await earnPebble("habit", rewardId);
      expect(parseInt(mockStore[GEMS_BONUS_KEY] || "0", 10)).toBe(1);

      (emitStateChange as jest.Mock).mockClear();
      const firstReverse = await reversePebbleReward(rewardId);
      expect(firstReverse).toBe(true);

      const logAfterFirst: PebbleLogEntry[] = JSON.parse(mockStore[PEBBLE_LOG_KEY] || "[]");
      expect(logAfterFirst.length).toBe(0);
      expect(parseInt(mockStore[GEMS_BONUS_KEY] || "0", 10)).toBe(0);
      expect(emitStateChange).toHaveBeenCalledWith("pebbles_changed", "pebble_service");

      (emitStateChange as jest.Mock).mockClear();
      const secondReverse = await reversePebbleReward(rewardId);
      expect(secondReverse).toBe(false);

      expect(parseInt(mockStore[GEMS_BONUS_KEY] || "0", 10)).toBe(0);
      expect(emitStateChange).not.toHaveBeenCalled();
    });

    it("spendGems with a spendId is idempotent across replays", async () => {
      await earnBonusGem(5);
      expect(await getGemsBalance()).toBe(5);

      (emitStateChange as jest.Mock).mockClear();

      const res1 = await spendGems(2, { spendId: "tx-purchase-soundpack" });
      expect(res1).toBe(true);
      expect(await getGemsBalance()).toBe(3);
      expect(emitStateChange).toHaveBeenCalledTimes(1);

      (emitStateChange as jest.Mock).mockClear();
      const res2 = await spendGems(2, { spendId: "tx-purchase-soundpack" });
      expect(res2).toBe(true);
      expect(await getGemsBalance()).toBe(3);
      expect(emitStateChange).not.toHaveBeenCalled();
    });

    it("recoverMainStreak is idempotent: cannot double-recover or double-spend", async () => {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;

      const initialLog: PebbleLogEntry[] = [
        { type: "task", timestamp: now - 2 * dayMs, rewardId: "t-day2" },
        { type: "task", timestamp: now - 3 * dayMs, rewardId: "t-day3" },
      ];
      mockStore[PEBBLE_LOG_KEY] = JSON.stringify(initialLog);
      mockStore[GEMS_BONUS_KEY] = "3";

      const info = await getMainStreakRecoveryInfo();
      expect(info.eligible).toBe(true);

      const res1 = await recoverMainStreak();
      expect(res1).toBe(true);
      expect(mockStore[GEMS_SPENT_KEY]).toBe("1");
      expect(await getGemsBalance()).toBe(2);

      (emitStateChange as jest.Mock).mockClear();
      const res2 = await recoverMainStreak();
      expect(res2).toBe(false);
      expect(mockStore[GEMS_SPENT_KEY]).toBe("1");
      expect(await getGemsBalance()).toBe(2);
      expect(emitStateChange).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Multi-Key Mutation Second-Write Failures (Atomicity & Rollback)
  // ──────────────────────────────────────────────────────────────────────────
  describe("Multi-Key Mutation Second-Write Failures", () => {
    it("Earn: fails second write (gems_bonus) -> rolls back pebble_log and emits no event", async () => {
      (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string) => {
        if (key === GEMS_BONUS_KEY) {
          throw new Error("Disk Full on gems_bonus");
        }
        mockStore[key] = val;
        return null;
      });

      const success = await earnPebble("task", "task:second-fail-1");
      expect(success).toBe(false);

      // Verify pebble_log was rolled back and is empty
      const log = JSON.parse(mockStore[PEBBLE_LOG_KEY] || "[]");
      expect(log.length).toBe(0);
      expect(mockStore[GEMS_BONUS_KEY]).toBeUndefined();

      // Invariant: no success event emitted on partial failure
      expect(emitStateChange).not.toHaveBeenCalled();
    });

    it("Reverse: fails second write (gems_bonus rollback) -> restores pebble_log and emits no event", async () => {
      const initialLog: PebbleLogEntry[] = [
        { type: "task", timestamp: Date.now(), rewardId: "task:undo-fail-1" },
      ];
      mockStore[PEBBLE_LOG_KEY] = JSON.stringify(initialLog);
      mockStore[GEMS_BONUS_KEY] = "1";

      (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string) => {
        if (key === GEMS_BONUS_KEY) {
          throw new Error("Disk error on gems_bonus rollback");
        }
        mockStore[key] = val;
        return null;
      });

      const success = await reversePebbleReward("task:undo-fail-1");
      expect(success).toBe(false);

      // Invariant: log is restored, pebble is NOT lost, bonus is preserved
      const log = JSON.parse(mockStore[PEBBLE_LOG_KEY] || "[]");
      expect(log.length).toBe(1);
      expect(log[0].rewardId).toBe("task:undo-fail-1");
      expect(mockStore[GEMS_BONUS_KEY]).toBe("1");
      expect(emitStateChange).not.toHaveBeenCalled();
    });

    it("Spend Gems: fails second write (pebble_spent ledger) -> rolls back gems_spent and emits no event", async () => {
      mockStore[GEMS_BONUS_KEY] = "5";

      (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string) => {
        if (key === PEBBLE_SPENT_KEY) {
          throw new Error("Disk error on pebble_spent ledger");
        }
        mockStore[key] = val;
        return null;
      });

      const success = await spendGems(2, { spendId: "tx-fail-ledger" });
      expect(success).toBe(false);

      // Invariant: gems_spent was rolled back to 0, balance remains 5
      expect(mockStore[GEMS_SPENT_KEY]).toBe("0");
      expect(await getGemsBalance()).toBe(5);
      expect(emitStateChange).not.toHaveBeenCalled();
    });

    it("Streak Recovery: fails second write (streak_recoveries) -> refunds gems_spent and emits no event", async () => {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      const initialLog: PebbleLogEntry[] = [
        { type: "task", timestamp: now - 2 * dayMs, rewardId: "t-1" },
      ];
      mockStore[PEBBLE_LOG_KEY] = JSON.stringify(initialLog);
      mockStore[GEMS_BONUS_KEY] = "5";

      (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string) => {
        if (key === STREAK_RECOVERIES_KEY) {
          throw new Error("Disk error on streak_recoveries");
        }
        mockStore[key] = val;
        return null;
      });

      const success = await recoverMainStreak();
      expect(success).toBe(false);

      // Invariant: user was NOT charged 1 gem without receiving recovery
      expect(mockStore[GEMS_SPENT_KEY]).toBe("0");
      expect(await getGemsBalance()).toBe(5);
      expect(emitStateChange).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Failure + Subsequent Retry Sequences
  // ──────────────────────────────────────────────────────────────────────────
  describe("Idempotency Under Failure + Retry", () => {
    it("Earn: failure on first attempt followed by retry results in exactly 1 pebble and 1 bonus gem", async () => {
      let failNextBonusWrite = true;
      (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string) => {
        if (key === GEMS_BONUS_KEY && failNextBonusWrite) {
          failNextBonusWrite = false;
          throw new Error("Transient error");
        }
        mockStore[key] = val;
        return null;
      });

      const first = await earnPebble("task", "task:transient-1");
      expect(first).toBe(false);
      expect(emitStateChange).not.toHaveBeenCalled();

      const second = await earnPebble("task", "task:transient-1");
      expect(second).toBe(true);

      const log: PebbleLogEntry[] = JSON.parse(mockStore[PEBBLE_LOG_KEY]);
      expect(log.length).toBe(1);
      expect(log[0].rewardId).toBe("task:transient-1");
      expect(mockStore[GEMS_BONUS_KEY]).toBe("1");
      expect(emitStateChange).toHaveBeenCalledTimes(1);
    });

    it("Spend Gems: failure on first attempt followed by retry results in exactly one spend", async () => {
      mockStore[GEMS_BONUS_KEY] = "5";
      let failNextSpendLog = true;

      (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string) => {
        if (key === PEBBLE_SPENT_KEY && failNextSpendLog) {
          failNextSpendLog = false;
          throw new Error("Transient error on ledger");
        }
        mockStore[key] = val;
        return null;
      });

      const res1 = await spendGems(2, { spendId: "tx-retry-spend" });
      expect(res1).toBe(false);
      expect(await getGemsBalance()).toBe(5);
      expect(emitStateChange).not.toHaveBeenCalled();

      const res2 = await spendGems(2, { spendId: "tx-retry-spend" });
      expect(res2).toBe(true);
      expect(await getGemsBalance()).toBe(3);
      expect(mockStore[GEMS_SPENT_KEY]).toBe("2");
      expect(emitStateChange).toHaveBeenCalledTimes(1);
    });

    it("Streak Recovery: failure on first attempt followed by retry results in exactly 1 recovery", async () => {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      const initialLog: PebbleLogEntry[] = [
        { type: "task", timestamp: now - 2 * dayMs, rewardId: "t-1" },
      ];
      mockStore[PEBBLE_LOG_KEY] = JSON.stringify(initialLog);
      mockStore[GEMS_BONUS_KEY] = "5";

      let failNextStreakWrite = true;
      (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string) => {
        if (key === STREAK_RECOVERIES_KEY && failNextStreakWrite) {
          failNextStreakWrite = false;
          throw new Error("Transient streak write error");
        }
        mockStore[key] = val;
        return null;
      });

      const res1 = await recoverMainStreak();
      expect(res1).toBe(false);
      expect(await getGemsBalance()).toBe(5);

      const res2 = await recoverMainStreak();
      expect(res2).toBe(true);
      expect(await getGemsBalance()).toBe(4);
      expect(mockStore[GEMS_SPENT_KEY]).toBe("1");
      expect(emitStateChange).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Transaction Identity Conflict Audits
  // ──────────────────────────────────────────────────────────────────────────
  describe("Transaction Identity Conflict Audits", () => {
    it("spendId cannot be reused with a conflicting spend amount", async () => {
      mockStore[GEMS_BONUS_KEY] = "10";

      const res1 = await spendGems(2, { spendId: "tx-item-1" });
      expect(res1).toBe(true);
      expect(await getGemsBalance()).toBe(8);

      (emitStateChange as jest.Mock).mockClear();
      const res2 = await spendGems(5, { spendId: "tx-item-1" });
      expect(res2).toBe(false); // REJECTED!

      expect(await getGemsBalance()).toBe(8);
      expect(mockStore[GEMS_SPENT_KEY]).toBe("2");
      expect(emitStateChange).not.toHaveBeenCalled();

      const res3 = await spendGems(2, { spendId: "tx-item-1" });
      expect(res3).toBe(true);
      expect(await getGemsBalance()).toBe(8);
    });

    it("rewardId cannot be reused with a conflicting entity type", async () => {
      const res1 = await earnPebble("task", "shared-entity-10");
      expect(res1).toBe(true);

      (emitStateChange as jest.Mock).mockClear();
      const res2 = await earnPebble("habit", "shared-entity-10");
      expect(res2).toBe(false); // REJECTED!

      const log: PebbleLogEntry[] = JSON.parse(mockStore[PEBBLE_LOG_KEY]);
      expect(log.length).toBe(1);
      expect(log[0].type).toBe("task");
      expect(emitStateChange).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Conservative Non-Lossy Reconciliation
  // ──────────────────────────────────────────────────────────────────────────
  describe("Conservative Non-Lossy Reconciliation", () => {
    it("restores paid streak recoveries missing from STREAK_RECOVERIES_KEY", async () => {
      const spendLog: SpendLogEntry[] = [
        { spendId: "recovery:2026-09-08", amount: 1, timestamp: Date.now() },
      ];
      mockStore[PEBBLE_SPENT_KEY] = JSON.stringify(spendLog);
      mockStore[GEMS_SPENT_KEY] = "1";
      mockStore[STREAK_RECOVERIES_KEY] = "[]";

      const report = await reconcilePebbleAccounting();
      expect(report.recoveredStreaksRestored).toBe(1);

      const recoveries = JSON.parse(mockStore[STREAK_RECOVERIES_KEY]);
      expect(recoveries).toContain("2026-09-08");
      expect(emitStateChange).toHaveBeenCalledWith("pebbles_changed", "pebble_service");
    });

    it("preserves legitimate positive bonus gems and never wipes manual bonuses", async () => {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      const log: PebbleLogEntry[] = [
        { type: "task", timestamp: now, rewardId: "t-today" },
        { type: "task", timestamp: now - dayMs, rewardId: "t-yest" },
      ];
      mockStore[PEBBLE_LOG_KEY] = JSON.stringify(log);
      mockStore[GEMS_BONUS_KEY] = "10";

      const report = await reconcilePebbleAccounting();
      expect(report.repairedBonus).toBe(false);
      expect(mockStore[GEMS_BONUS_KEY]).toBe("10");
    });

    it("repairs corrupted negative/NaN counters up to verifiable floor and reports inconsistencies", async () => {
      const now = Date.now();
      const log: PebbleLogEntry[] = [
        { type: "task", timestamp: now, rewardId: "t-1" },
        { type: "task", timestamp: now - 86400000, rewardId: "t-2" },
      ];
      mockStore[PEBBLE_LOG_KEY] = JSON.stringify(log);
      mockStore[GEMS_BONUS_KEY] = "-10";
      mockStore[GEMS_SPENT_KEY] = "bad_number";

      const report = await reconcilePebbleAccounting();
      expect(report.repairedBonus).toBe(true);
      expect(report.repairedSpent).toBe(true);
      expect(report.inconsistencies.length).toBeGreaterThanOrEqual(2);

      expect(mockStore[GEMS_BONUS_KEY]).toBe("2");
      expect(mockStore[GEMS_SPENT_KEY]).toBe("0");
    });

    it("reconciliation is completely deterministic and idempotent on repeated execution", async () => {
      const report1 = await reconcilePebbleAccounting();
      (emitStateChange as jest.Mock).mockClear();

      const report2 = await reconcilePebbleAccounting();
      expect(report2.deduplicatedPebbles).toBe(0);
      expect(report2.repairedBonus).toBe(false);
      expect(report2.repairedSpent).toBe(false);
      expect(report2.recoveredStreaksRestored).toBe(0);
      expect(emitStateChange).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Eligible Completion Types Earn Pebbles
  // ──────────────────────────────────────────────────────────────────────────
  describe("Eligible Completion Types", () => {
    it("records one lifetime Pebble per task, habit, focus, and checklist completion", async () => {
      expect(await earnPebble("task", "task:type-1")).toBe(true);
      expect(await earnPebble("habit", "habit:type-1")).toBe(true);
      expect(await earnPebble("focus", "focus:type-1")).toBe(true);
      expect(await earnPebble("checklist", "checklist:type-1")).toBe(true);

      const counts = await getPebbleCounts();
      expect(counts.lifetime).toBe(4);
      expect(counts.lifetimeTypes).toEqual({
        task: 1,
        habit: 1,
        focus: 1,
        checklist: 1,
      });
    });
  });
  });
});
