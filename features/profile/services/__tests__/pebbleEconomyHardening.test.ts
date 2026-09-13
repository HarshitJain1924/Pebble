/**
 * pebbleEconomyHardening.test.ts
 * ──────────────────────────────
 * Phase 3 hardening. Pins the runtime guarantees around restart persistence,
 * reversal/bonus interaction, concurrency (including reversal races), and the
 * retirement of the legacy Gem-balance alias.
 *
 * Complements pebbleEconomyInvariants.test.ts (reward identity, cap, Gem
 * boundaries, dates) — no coverage is duplicated intentionally.
 */
import {
  earnPebble,
  reversePebbleReward,
  earnBonusGem,
  spendGems,
  getPebbleCounts,
  getGemsBalance,
  PEBBLE_LOG_KEY,
  GEMS_BONUS_KEY,
  GEMS_SPENT_KEY,
  type PebbleLogEntry,
} from "../pebble.service";
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

function log(): PebbleLogEntry[] {
  return JSON.parse(mockStore[PEBBLE_LOG_KEY] ?? "[]");
}

function bonusGems(): number {
  return parseInt(mockStore[GEMS_BONUS_KEY] ?? "0", 10);
}

beforeEach(() => {
  mockStore = {};
  jest.clearAllMocks();
  (WorkspaceRepository.getWorkspaces as jest.Mock).mockResolvedValue([]);
  (TaskRepository.getTasks as jest.Mock).mockResolvedValue({});
});

describe("Pebble economy hardening", () => {
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
