/**
 * pebbleRewardLifecycle.test.ts
 * ─────────────────────────────
 * Phase 3 lifecycle + reward-path hardening. Exercises the REAL production
 * command path (EntityCommandService → handlers → repositories → pebble
 * service) to pin:
 *
 *   - tombstoned entities can never newly generate a Pebble
 *   - archived task completion behavior (documented current contract)
 *   - checklist one-time, non-reversing reward semantics (recurring included)
 *   - habit reward identity is scoped to the local calendar day
 *   - focus session reward identity is stable per session
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import {
  ChecklistRepository,
  HabitRepository,
  TaskRepository,
  TombstoneRepository,
  WorkspaceRepository,
} from "@/repositories";
import { PEBBLE_LOG_KEY } from "@/features/profile/services/pebble.service";
import type { Checklist, Habit, Task, Workspace } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("@/services/events/state-events", () => ({
  emitStateChange: jest.fn(),
  addStateListener: jest.fn(() => () => {}),
}));

const WS = "ws-econ";

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

const makeChecklist = (
  id: string,
  overrides: Partial<Checklist> = {},
): Checklist => ({
  id,
  workspaceId: WS,
  title: `Checklist ${id}`,
  items: [{ id: "item-1", title: "Item 1", completed: false }],
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

async function pebbleRewards(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(PEBBLE_LOG_KEY);
  if (!raw) return [];
  return JSON.parse(raw).map((e: any) => String(e.rewardId ?? ""));
}

async function pebbleCount(prefix?: string): Promise<number> {
  const rewards = await pebbleRewards();
  return prefix ? rewards.filter((id) => id.startsWith(prefix)).length : rewards.length;
}

async function bonusGems(): Promise<number> {
  const raw = await AsyncStorage.getItem("todoapp:gems_bonus");
  return raw ? parseInt(raw, 10) : 0;
}

beforeEach(async () => {
  jest.restoreAllMocks();
  jest.spyOn(
    require("@/services/analytics/productivity-history.service"),
    "recordDailyHistorySnapshot",
  ).mockResolvedValue(undefined);

  await AsyncStorage.clear();
  await WorkspaceRepository.saveWorkspace({
    id: WS,
    name: "Economy WS",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
  } as Workspace);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("Pebble reward lifecycle", () => {
  // ────────────────────────────────────────────────────────────────────────
  // Tombstone safety
  // ────────────────────────────────────────────────────────────────────────
  describe("tombstoned entities", () => {
    it("a permanently deleted Task cannot newly award a Pebble, and deletion does not reverse an earned one", async () => {
      await TaskRepository.saveTask(makeTask("task-tomb-1"));

      // 1. Earn one Pebble legitimately.
      await EntityCommandService.completeTask("task-tomb-1", WS, {
        skipEvents: true,
        skipAnalytics: true,
      });
      expect(await pebbleCount("task:task-tomb-1")).toBe(1);

      // 2. Permanently delete it. The earned Pebble persists (delete != undo).
      await EntityCommandService.permanentlyDeleteTask("task-tomb-1", WS, {
        skipEvents: true,
        skipAnalytics: true,
      });
      expect(
        await TombstoneRepository.isTombstoned("task", "task-tomb-1", 1),
      ).toBe(true);
      expect(await pebbleCount("task:task-tomb-1")).toBe(1);

      // 3. No new reward can be generated from the deleted entity.
      const result = await EntityCommandService.completeTask(
        "task-tomb-1",
        WS,
        { skipEvents: true, skipAnalytics: true },
      );
      expect(result).toBeNull();
      expect(await pebbleCount("task:task-tomb-1")).toBe(1);
    });

    it("a tombstoned Task id cannot award even if it reappears in the partition", async () => {
      await TaskRepository.saveTask(makeTask("task-tomb-2"));
      await EntityCommandService.permanentlyDeleteTask("task-tomb-2", WS, {
        skipEvents: true,
        skipAnalytics: true,
      });

      // Adversarial: force the id back into the active partition.
      await TaskRepository.saveTaskUnlocked(makeTask("task-tomb-2"));

      await expect(
        EntityCommandService.completeTask("task-tomb-2", WS, {
          skipEvents: true,
          skipAnalytics: true,
        }),
      ).rejects.toThrow(/permanently deleted/i);

      expect(await pebbleCount("task:")).toBe(0);
    });

    it("a permanently deleted Habit cannot newly award a Pebble", async () => {
      await HabitRepository.saveHabitUnlocked(makeHabit("habit-tomb-1"));

      await EntityCommandService.permanentlyDeleteHabit(
        "habit-tomb-1",
        WS,
        { skipEvents: true, skipAnalytics: true },
      );

      const result = await EntityCommandService.completeHabit(
        "habit-tomb-1",
        WS,
        { skipEvents: true, skipAnalytics: true },
      );
      expect(result).toBeNull();
      expect(await pebbleCount("habit:")).toBe(0);
    });

    it("a permanently deleted Checklist cannot newly award a Pebble", async () => {
      await ChecklistRepository.saveChecklistUnlocked(
        makeChecklist("checklist-tomb-1"),
      );

      await EntityCommandService.permanentlyDeleteChecklist(
        "checklist-tomb-1",
        WS,
        { skipEvents: true, skipAnalytics: true },
      );

      const result = await EntityCommandService.toggleChecklistItem(
        "checklist-tomb-1",
        "item-1",
        WS,
        { skipEvents: true, skipAnalytics: true },
      );
      expect(result).toBeNull();
      expect(await pebbleCount("checklist:")).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Archived entities (documented current contract)
  // ────────────────────────────────────────────────────────────────────────
  describe("archived entities", () => {
    /**
     * DOCUMENTED BEHAVIOR (Phase 3 decision): archiving is not a completion
     * barrier — the shared lifecycle guard only rejects tombstoned entities.
     * No UI surface exposes archived items for completion, so this is only
     * reachable via direct command calls or an archive/complete race. It is
     * preserved as-is, not "fixed", because blocking it would change
     * mutation semantics across all four command surfaces.
     */
    it("an archived Task can complete once and never double-awards", async () => {
      await TaskRepository.saveTask(
        makeTask("task-archived-1", { archivedAt: 12345 }),
      );

      await EntityCommandService.completeTask("task-archived-1", WS, {
        skipEvents: true,
        skipAnalytics: true,
      });
      expect(await pebbleCount("task:task-archived-1")).toBe(1);

      // Replay is skipped by the handler and must not award again.
      await EntityCommandService.completeTask("task-archived-1", WS, {
        skipEvents: true,
        skipAnalytics: true,
      });
      expect(await pebbleCount("task:task-archived-1")).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Checklist one-time semantics
  // ────────────────────────────────────────────────────────────────────────
  describe("checklist reward semantics", () => {
    it("a non-recurring checklist awards once and is never re-awarded after uncheck/recheck", async () => {
      await ChecklistRepository.saveChecklistUnlocked(
        makeChecklist("chk-once-1", {
          items: [
            { id: "item-1", title: "Item 1", completed: false },
            { id: "item-2", title: "Item 2", completed: false },
          ],
        }),
      );

      await EntityCommandService.toggleChecklistItem(
        "chk-once-1",
        "item-1",
        WS,
        { skipEvents: true, skipAnalytics: true },
      );
      expect(await pebbleCount("checklist:chk-once-1")).toBe(0);

      await EntityCommandService.toggleChecklistItem(
        "chk-once-1",
        "item-2",
        WS,
        { skipEvents: true, skipAnalytics: true },
      );
      expect(await pebbleCount("checklist:chk-once-1")).toBe(1);

      // Uncheck everything, then re-complete: still exactly one reward.
      await EntityCommandService.toggleChecklistItem(
        "chk-once-1",
        "item-1",
        WS,
        { skipEvents: true, skipAnalytics: true },
      );
      await EntityCommandService.toggleChecklistItem(
        "chk-once-1",
        "item-2",
        WS,
        { skipEvents: true, skipAnalytics: true },
      );
      await EntityCommandService.toggleChecklistItem(
        "chk-once-1",
        "item-1",
        WS,
        { skipEvents: true, skipAnalytics: true },
      );
      await EntityCommandService.toggleChecklistItem(
        "chk-once-1",
        "item-2",
        WS,
        { skipEvents: true, skipAnalytics: true },
      );

      expect(await pebbleCount("checklist:chk-once-1")).toBe(1);
    });

    it("a recurring checklist awards at most one Pebble across occurrences (documented one-time latch)", async () => {
      const day1 = "2026-09-10";
      const day2 = "2026-09-11";

      await ChecklistRepository.saveChecklistUnlocked(
        makeChecklist("chk-recurring-1", {
          recurrence: { frequency: "daily", interval: 1 },
          schedule: { date: day1 },
        }),
      );

      await EntityCommandService.toggleChecklistItem(
        "chk-recurring-1",
        "item-1",
        WS,
        day1,
        { skipEvents: true, skipAnalytics: true },
      );
      expect(await pebbleCount("checklist:chk-recurring-1")).toBe(1);

      await EntityCommandService.toggleChecklistItem(
        "chk-recurring-1",
        "item-1",
        WS,
        day2,
        { skipEvents: true, skipAnalytics: true },
      );

      // Both occurrences genuinely completed...
      const stored = await ChecklistRepository.getChecklist(
        "chk-recurring-1",
        WS,
      );
      expect(stored!.occurrenceHistory?.[day1]?.completedAt).toBeDefined();
      expect(stored!.occurrenceHistory?.[day2]?.completedAt).toBeDefined();

      // ...but the checklist-wide latch allows exactly one reward in total.
      expect(await pebbleCount("checklist:chk-recurring-1")).toBe(1);
      expect(stored!.pebbleAwarded).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Habit local-day reward identity
  // ────────────────────────────────────────────────────────────────────────
  describe("habit reward identity", () => {
    it("awards one Pebble per local calendar day across a 23:59 → 00:01 boundary", async () => {
      jest.useFakeTimers({ now: new Date(2026, 8, 10, 23, 59, 0) });

      await HabitRepository.saveHabitUnlocked(makeHabit("habit-day-1"));

      await EntityCommandService.completeHabit("habit-day-1", WS, {
        skipEvents: true,
        skipAnalytics: true,
      });

      jest.setSystemTime(new Date(2026, 8, 11, 0, 1, 0));

      await EntityCommandService.completeHabit("habit-day-1", WS, {
        skipEvents: true,
        skipAnalytics: true,
      });

      const rewards = await pebbleRewards();
      expect(rewards.filter((r) => r.startsWith("habit:habit-day-1:")).sort()).toEqual([
        "habit:habit-day-1:2026-09-10",
        "habit:habit-day-1:2026-09-11",
      ]);
      expect(await bonusGems()).toBe(2);
    });

    it("a second completion on the same local day is idempotent", async () => {
      await HabitRepository.saveHabitUnlocked(makeHabit("habit-day-2"));

      await EntityCommandService.completeHabit("habit-day-2", WS, {
        skipEvents: true,
        skipAnalytics: true,
      });
      await EntityCommandService.completeHabit("habit-day-2", WS, {
        skipEvents: true,
        skipAnalytics: true,
      });

      expect(await pebbleCount("habit:habit-day-2")).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Focus session reward identity
  // ────────────────────────────────────────────────────────────────────────
  describe("focus session reward identity", () => {
    it("awards one Pebble per stable session identity and is idempotent on replay", async () => {
      // Both the timer-expiration and the background/restore path derive the id
      // from the session start epoch, so a replay collapses into one reward.
      await EntityCommandService.recordFocusSession(1500, undefined, undefined, {
        sessionId: "focus_timer_1000",
      });
      await EntityCommandService.recordFocusSession(1500, undefined, undefined, {
        sessionId: "focus_timer_1000",
      });
      expect(await pebbleCount("focus:focus_timer_1000")).toBe(1);

      // A genuinely different session earns its own Pebble.
      await EntityCommandService.recordFocusSession(1500, undefined, undefined, {
        sessionId: "focus_timer_2000",
      });
      expect(await pebbleCount("focus:")).toBe(2);
    });

    it("documents that the Date.now sessionId fallback is not idempotent", async () => {
      // No production caller omits sessionId; this pins the defensive fallback
      // behavior so the risk is explicit rather than assumed.
      jest.useFakeTimers({ now: new Date(2000) });
      await EntityCommandService.recordFocusSession(1500);

      jest.setSystemTime(new Date(3000));
      await EntityCommandService.recordFocusSession(1500);

      expect(await pebbleCount("focus:")).toBe(2);
    });
  });
});
