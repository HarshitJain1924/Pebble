/**
 * pebbleEconomyInvariants.test.ts
 * ───────────────────────────────
 * Phase 2 economy hardening. Proves the core product invariants:
 *
 *   ONE REAL COMPLETION → AT MOST ONE CORRESPONDING PEBBLE REWARD
 *   LIFETIME PEBBLES → floor(Pebbles / 45) → PEBBLE-DERIVED GEMS
 *   (+ bonus Gems − spent Gems, applied separately)
 *
 * These tests target the authoritative economy service. Handler-level wiring
 * (which rewardId each completion type constructs) is covered by
 * entityCommandService / toggleChecklistItemConcurrency / todayInteractions.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  earnPebble,
  reversePebbleReward,
  spendGems,
  earnBonusGem,
  getPebbleCounts,
  getGemsBalance,
  PEBBLE_LOG_KEY,
  GEMS_BONUS_KEY,
  GEMS_SPENT_KEY,
  type PebbleLogEntry,
  type PebbleType,
} from "../pebble.service";
import { dateKeyFromDate } from "@/shared/utils/date-key";
import { WorkspaceRepository, TaskRepository } from "@/repositories";

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
    })),
  );
}

function seedPebbles(count: number, type: PebbleType = "task"): void {
  seedLog(
    Array.from({ length: count }, (_, i) => ({
      type,
      timestamp: Date.now() - i * 1000,
      rewardId: `${type}:seed-${i}`,
    })),
  );
}

function logLength(): number {
  return JSON.parse(mockStore[PEBBLE_LOG_KEY] ?? "[]").length;
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  mockStore = {};
  jest.clearAllMocks();
  (WorkspaceRepository.getWorkspaces as jest.Mock).mockResolvedValue([]);
  (TaskRepository.getTasks as jest.Mock).mockResolvedValue({});
});

afterEach(() => {
  jest.useRealTimers();
});

describe("Pebble economy invariants", () => {
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
