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
  PebbleLogEntry,
  SpendLogEntry,
} from "../pebble.service";
import { emitStateChange } from "@/services/events/state-events";

let mockStore: Record<string, string> = {};

jest.mock("@react-native-async-storage/async-storage", () => {
  return {
    getItem: jest.fn().mockImplementation(async (key: string) => mockStore[key] || null),
    setItem: jest.fn().mockImplementation(async (key: string, value: string) => {
      mockStore[key] = String(value);
      return null;
    }),
    removeItem: jest.fn().mockImplementation(async (key: string) => {
      delete mockStore[key];
      return null;
    }),
    clear: jest.fn().mockImplementation(async () => {
      mockStore = {};
      return null;
    }),
  };
});

jest.mock("@/services/events/state-events", () => ({
  emitStateChange: jest.fn(),
}));

describe("Pebble Accounting Integrity — Phase 5 Hardening", () => {
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
});
