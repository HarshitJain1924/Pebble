import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  earnPebble,
  reversePebbleReward,
  spendGems,
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

describe("Pebble Accounting Integrity — Phase 5", () => {
  beforeEach(() => {
    mockStore = {};
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Idempotency Tests
  // ──────────────────────────────────────────────────────────────────────────
  describe("Idempotency", () => {
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

      // pebbles_changed not emitted on the redundant second call
      const emitCountAfterSecond = (emitStateChange as jest.Mock).mock.calls.length;
      expect(emitCountAfterSecond).toBe(emitCountAfterFirst);
    });

    it("reversing the same rewardId twice rolls back once and safely no-ops on second call", async () => {
      const rewardId = "habit:read:2026-09-10";

      // Earn
      await earnPebble("habit", rewardId);
      expect(parseInt(mockStore[GEMS_BONUS_KEY] || "0", 10)).toBe(1);

      // First reversal
      (emitStateChange as jest.Mock).mockClear();
      const firstReverse = await reversePebbleReward(rewardId);
      expect(firstReverse).toBe(true);

      // Log empty, bonus rolled back to 0
      const logAfterFirst: PebbleLogEntry[] = JSON.parse(mockStore[PEBBLE_LOG_KEY] || "[]");
      expect(logAfterFirst.length).toBe(0);
      expect(parseInt(mockStore[GEMS_BONUS_KEY] || "0", 10)).toBe(0);
      expect(emitStateChange).toHaveBeenCalledWith("pebbles_changed", "pebble_service");

      // Second reversal of same rewardId
      (emitStateChange as jest.Mock).mockClear();
      const secondReverse = await reversePebbleReward(rewardId);
      expect(secondReverse).toBe(false);

      // Bonus does not drop below 0
      expect(parseInt(mockStore[GEMS_BONUS_KEY] || "0", 10)).toBe(0);
      expect(emitStateChange).not.toHaveBeenCalled();
    });

    it("spendGems with a spendId is idempotent across replays", async () => {
      // Seed 5 bonus gems
      await earnBonusGem(5);
      expect(await getGemsBalance()).toBe(5);

      (emitStateChange as jest.Mock).mockClear();

      // First spend
      const res1 = await spendGems(2, { spendId: "tx-purchase-soundpack" });
      expect(res1).toBe(true);
      expect(await getGemsBalance()).toBe(3);
      expect(emitStateChange).toHaveBeenCalledTimes(1);

      // Second identical spend with same spendId
      (emitStateChange as jest.Mock).mockClear();
      const res2 = await spendGems(2, { spendId: "tx-purchase-soundpack" });
      expect(res2).toBe(true); // returns true idempotently
      expect(await getGemsBalance()).toBe(3); // Balance does not decrease further!
      expect(emitStateChange).not.toHaveBeenCalled(); // No false event
    });

    it("recoverMainStreak is idempotent: cannot double-recover or double-spend", async () => {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;

      // Create broken streak (active streak ending 2 days ago, yesterday missing)
      const initialLog: PebbleLogEntry[] = [
        { type: "task", timestamp: now - 2 * dayMs, rewardId: "t-day2" },
        { type: "task", timestamp: now - 3 * dayMs, rewardId: "t-day3" },
      ];
      mockStore[PEBBLE_LOG_KEY] = JSON.stringify(initialLog);
      mockStore[GEMS_BONUS_KEY] = "3"; // 3 gems available

      const info = await getMainStreakRecoveryInfo();
      expect(info.eligible).toBe(true);

      // First recovery
      const res1 = await recoverMainStreak();
      expect(res1).toBe(true);
      expect(mockStore[GEMS_SPENT_KEY]).toBe("1");
      expect(await getGemsBalance()).toBe(2);

      // Second recovery immediate retry
      (emitStateChange as jest.Mock).mockClear();
      const res2 = await recoverMainStreak();
      expect(res2).toBe(false); // Ineligible because yesterday is healed
      expect(mockStore[GEMS_SPENT_KEY]).toBe("1"); // No second gem spent!
      expect(await getGemsBalance()).toBe(2);
      expect(emitStateChange).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Concurrency Tests
  // ──────────────────────────────────────────────────────────────────────────
  describe("Concurrency & Mutex Protection", () => {
    it("simultaneous earn operations serialize without losing updates", async () => {
      // Earn 5 distinct pebbles concurrently
      const promises = [
        earnPebble("task", "task:concurrent-1"),
        earnPebble("task", "task:concurrent-2"),
        earnPebble("task", "task:concurrent-3"),
        earnPebble("habit", "habit:concurrent-4"),
        earnPebble("focus", "focus:concurrent-5"),
      ];

      const results = await Promise.all(promises);
      expect(results.every((r) => r === true)).toBe(true);

      // Canonical storage must contain all 5 entries
      const counts = await getPebbleCounts();
      expect(counts.lifetime).toBe(5);
      expect(counts.today).toBe(5);

      const log: PebbleLogEntry[] = JSON.parse(mockStore[PEBBLE_LOG_KEY]);
      expect(log.length).toBe(5);

      const rewardIds = log.map((e) => e.rewardId);
      expect(rewardIds).toContain("task:concurrent-1");
      expect(rewardIds).toContain("task:concurrent-2");
      expect(rewardIds).toContain("task:concurrent-3");
      expect(rewardIds).toContain("habit:concurrent-4");
      expect(rewardIds).toContain("focus:concurrent-5");
    });

    it("simultaneous spend operations serialize without lost updates", async () => {
      // Seed 10 bonus gems
      await earnBonusGem(10);
      expect(await getGemsBalance()).toBe(10);

      // Spend 2 gems three times concurrently
      const results = await Promise.all([
        spendGems(2),
        spendGems(2),
        spendGems(2),
      ]);

      expect(results).toEqual([true, true, true]);
      expect(parseInt(mockStore[GEMS_SPENT_KEY], 10)).toBe(6);
      expect(await getGemsBalance()).toBe(4);
    });

    it("simultaneous earn and spend operations maintain consistency", async () => {
      await earnBonusGem(2);

      // Concurrently earn a pebble and spend a gem
      const [earnRes, spendRes] = await Promise.all([
        earnPebble("task", "task:mixed-1"),
        spendGems(1),
      ]);

      expect(earnRes).toBe(true);
      expect(spendRes).toBe(true);

      const counts = await getPebbleCounts();
      expect(counts.lifetime).toBe(1);

      // 2 initial bonus + 1 first pebble bonus - 1 spent = 2
      expect(await getGemsBalance()).toBe(2);
    });

    it("concurrent recoverMainStreak requests execute safely with only one success", async () => {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;

      const initialLog: PebbleLogEntry[] = [
        { type: "task", timestamp: now - 2 * dayMs, rewardId: "t-1" },
      ];
      mockStore[PEBBLE_LOG_KEY] = JSON.stringify(initialLog);
      mockStore[GEMS_BONUS_KEY] = "5"; // 5 gems available

      // Launch 2 recovery requests concurrently
      const [resA, resB] = await Promise.all([
        recoverMainStreak(),
        recoverMainStreak(),
      ]);

      // Exactly one succeeds, the other fails
      const successCount = [resA, resB].filter((r) => r === true).length;
      const failCount = [resA, resB].filter((r) => r === false).length;

      expect(successCount).toBe(1);
      expect(failCount).toBe(1);

      // Exactly 1 gem spent
      expect(mockStore[GEMS_SPENT_KEY]).toBe("1");
      expect(await getGemsBalance()).toBe(4);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Failure & Event Emission
  // ──────────────────────────────────────────────────────────────────────────
  describe("Failure & Event Emission", () => {
    it("spendGems fails when balance is insufficient and does not emit pebbles_changed", async () => {
      mockStore[GEMS_BONUS_KEY] = "1";
      mockStore[GEMS_SPENT_KEY] = "1"; // Balance is 0

      (emitStateChange as jest.Mock).mockClear();

      const success = await spendGems(1);
      expect(success).toBe(false);
      expect(emitStateChange).not.toHaveBeenCalled();
    });

    it("recoverMainStreak fails when ineligible and does not emit pebbles_changed", async () => {
      // Empty log -> not eligible
      (emitStateChange as jest.Mock).mockClear();

      const success = await recoverMainStreak();
      expect(success).toBe(false);
      expect(emitStateChange).not.toHaveBeenCalled();
    });

    it("storage write exception does not emit pebbles_changed and returns false", async () => {
      (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error("Disk Full"));

      (emitStateChange as jest.Mock).mockClear();
      const success = await earnPebble("task", "task:fail-write");
      expect(success).toBe(false);
      expect(emitStateChange).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Projections & Reconciliation
  // ──────────────────────────────────────────────────────────────────────────
  describe("Projections & Reconciliation", () => {
    it("getPebbleCounts and getGemsBalance correctly derive from canonical storage", async () => {
      // 90 pebbles = 2 gems from conversion rate (1 per 45)
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      const log: PebbleLogEntry[] = [];
      for (let i = 0; i < 90; i++) {
        log.push({ type: "task", timestamp: now - 3 * dayMs, rewardId: `t-${i}` });
      }
      mockStore[PEBBLE_LOG_KEY] = JSON.stringify(log);
      mockStore[GEMS_BONUS_KEY] = "3"; // +3 bonus
      mockStore[GEMS_SPENT_KEY] = "1"; // -1 spent

      const counts = await getPebbleCounts();
      expect(counts.lifetime).toBe(90);

      // 90 / 45 = 2 + 3 bonus - 1 spent = 4
      const balance = await getGemsBalance();
      expect(balance).toBe(4);
    });

    it("reconcilePebbleAccounting deduplicates duplicate reward IDs and preserves anonymous pebbles", async () => {
      const now = Date.now();
      const corruptedLog: PebbleLogEntry[] = [
        { type: "task", timestamp: now - 1000, rewardId: "task:dup-1" },
        { type: "task", timestamp: now - 500, rewardId: "task:dup-1" }, // Duplicate!
        { type: "habit", timestamp: now - 800, rewardId: "habit:dup-2" },
        { type: "habit", timestamp: now - 400, rewardId: "habit:dup-2" }, // Duplicate!
        { type: "focus", timestamp: now - 300, rewardId: "focus:unique" },
        { type: "task", timestamp: now - 200 }, // Anonymous pebble without rewardId (must be preserved!)
      ];
      mockStore[PEBBLE_LOG_KEY] = JSON.stringify(corruptedLog);
      mockStore[GEMS_BONUS_KEY] = "-5"; // Corrupted negative bonus
      mockStore[GEMS_SPENT_KEY] = "invalid"; // Corrupted NaN spent

      (emitStateChange as jest.Mock).mockClear();

      const report = await reconcilePebbleAccounting();
      expect(report.deduplicatedPebbles).toBe(2);
      expect(report.repairedBonus).toBe(true);
      expect(report.repairedSpent).toBe(true);
      expect(report.logCount).toBe(4); // 3 unique rewardIds + 1 anonymous

      // Cleaned log verified
      const cleanLog: PebbleLogEntry[] = JSON.parse(mockStore[PEBBLE_LOG_KEY]);
      expect(cleanLog.length).toBe(4);
      expect(cleanLog.filter((e) => e.rewardId === "task:dup-1").length).toBe(1);
      expect(cleanLog.filter((e) => e.rewardId === "habit:dup-2").length).toBe(1);
      expect(cleanLog.some((e) => !e.rewardId)).toBe(true); // anonymous entry preserved

      // Counters reset to 0
      expect(mockStore[GEMS_BONUS_KEY]).toBe("0");
      expect(mockStore[GEMS_SPENT_KEY]).toBe("0");

      // Event emitted because state changed
      expect(emitStateChange).toHaveBeenCalledWith("pebbles_changed", "pebble_service");

      // Running reconciliation a second time is a clean idempotent no-op
      (emitStateChange as jest.Mock).mockClear();
      const secondReport = await reconcilePebbleAccounting();
      expect(secondReport.deduplicatedPebbles).toBe(0);
      expect(secondReport.repairedBonus).toBe(false);
      expect(secondReport.repairedSpent).toBe(false);
      expect(emitStateChange).not.toHaveBeenCalled();
    });
  });
});
