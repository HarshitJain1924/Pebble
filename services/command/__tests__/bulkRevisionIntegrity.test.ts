/**
 * bulkRevisionIntegrity.test.ts
 * ──────────────────────────────────────────────────────────────────
 * Hostile verification of the bulk-write revision monotonic invariant.
 *
 * Target: ONE bug only —
 *   saveTasks / saveHabits / saveTasksUnlocked / saveHabitsUnlocked
 *   must derive revision from the persisted record, not from the caller payload.
 *
 * Invariant under test:
 *   newRevision = persistedRevision + 1
 *   for every entity passed to a bulk write, regardless of what revision
 *   the caller carries in their payload.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { TaskRepository, HabitRepository } from "@/repositories";
import type { Task, Habit } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const storage = AsyncStorage as typeof AsyncStorage;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const baseTask = (id: string, wsId: string): Task =>
  ({
    id,
    workspaceId: wsId,
    title: "T",
    status: "todo",
    priority: "none",
    createdAt: 1,
    updatedAt: 1,
  } as any);

const baseHabit = (id: string, wsId: string): Habit =>
  ({
    id,
    workspaceId: wsId,
    title: "H",
    categoryId: "work",
    tags: [],
    recurrence: { frequency: "daily", interval: 1 },
    completionHistory: [],
    createdAt: 1,
    updatedAt: 1,
  } as any);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Seed a task partition directly via saveTask to reach a target revision. */
async function seedTask(id: string, wsId: string, targetRevision: number): Promise<Task> {
  let latest = await TaskRepository.saveTask(baseTask(id, wsId)); // revision=1
  for (let i = 1; i < targetRevision; i++) {
    latest = await TaskRepository.saveTask({ ...latest, title: `rev-${i + 1}` });
  }
  expect(latest.revision).toBe(targetRevision);
  return latest;
}

/** Seed a habit partition to reach a target revision. */
async function seedHabit(id: string, wsId: string, targetRevision: number): Promise<Habit> {
  let latest = await HabitRepository.saveHabit(baseHabit(id, wsId)); // revision=1
  for (let i = 1; i < targetRevision; i++) {
    latest = await HabitRepository.saveHabit({ ...latest, title: `rev-${i + 1}` });
  }
  expect(latest.revision).toBe(targetRevision);
  return latest;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe("Bulk write revision monotonic invariant", () => {
  beforeEach(async () => {
    await storage.clear();
    jest.restoreAllMocks();
  });

  // ─── Test 1 — stale bulk Task ─────────────────────────────────────────────

  describe("Test 1 — stale bulk Task write cannot decrease revision", () => {
    it("persisted revision=10: saveTasks with stale revision=3 yields 11", async () => {
      // Build entity up to revision=10 via saveTask
      const seeded = await seedTask("t1", "ws-stale-task", 10);
      expect(seeded.revision).toBe(10);

      // Caller holds a stale snapshot with revision=3
      const stalePayload = { ...seeded, revision: 3, title: "Stale" };

      await TaskRepository.saveTasks([stalePayload], "ws-stale-task");

      const after = (await TaskRepository.getTasks("ws-stale-task"))["t1"];
      // Must be 11 — advances from stored 10, regardless of payload's 3
      expect(after.revision).toBe(11);
    });

    it("persisted revision=10: saveTasks with payload revision=999999 yields 11", async () => {
      // Test 7 spec: caller cannot force a very high revision either —
      // the invariant is newRevision = persistedRevision + 1, always.
      const seeded = await seedTask("t1", "ws-high-task", 10);

      const inflatedPayload = { ...seeded, revision: 999999, title: "Inflated" };
      await TaskRepository.saveTasks([inflatedPayload], "ws-high-task");

      const after = (await TaskRepository.getTasks("ws-high-task"))["t1"];
      expect(after.revision).toBe(11); // not 999999+1, not 999999
    });
  });

  // ─── Test 2 — stale bulk Habit ────────────────────────────────────────────

  describe("Test 2 — stale bulk Habit write cannot decrease revision", () => {
    it("persisted revision=10: saveHabits with stale revision=3 yields 11", async () => {
      const seeded = await seedHabit("h1", "ws-stale-habit", 10);
      expect(seeded.revision).toBe(10);

      const stalePayload = { ...seeded, revision: 3, title: "Stale" };
      await HabitRepository.saveHabits([stalePayload], "ws-stale-habit");

      const after = (await HabitRepository.getHabits("ws-stale-habit"))["h1"];
      expect(after.revision).toBe(11);
    });

    it("persisted revision=10: saveHabits with payload revision=999999 yields 11", async () => {
      const seeded = await seedHabit("h1", "ws-high-habit", 10);

      const inflatedPayload = { ...seeded, revision: 999999, title: "Inflated" };
      await HabitRepository.saveHabits([inflatedPayload], "ws-high-habit");

      const after = (await HabitRepository.getHabits("ws-high-habit"))["h1"];
      expect(after.revision).toBe(11);
    });
  });

  // ─── Test 3 — same-millisecond writes ─────────────────────────────────────

  describe("Test 3 — same-millisecond bulk writes produce monotonic revisions", () => {
    it("Task: revisions 1→2→3→4 with Date.now() pinned", async () => {
      const fixedTime = 1_700_000_000_000;
      jest.spyOn(Date, "now").mockReturnValue(fixedTime);

      const t = baseTask("t1", "ws-ms-task");

      await TaskRepository.saveTasks([t], "ws-ms-task");
      const r1 = (await TaskRepository.getTasks("ws-ms-task"))["t1"];
      expect(r1.revision).toBe(1);
      expect(r1.updatedAt).toBe(fixedTime);

      await TaskRepository.saveTasks([{ ...r1, title: "B" }], "ws-ms-task");
      const r2 = (await TaskRepository.getTasks("ws-ms-task"))["t1"];
      expect(r2.revision).toBe(2);
      expect(r2.updatedAt).toBe(fixedTime); // same clock

      await TaskRepository.saveTasks([{ ...r2, title: "C" }], "ws-ms-task");
      const r3 = (await TaskRepository.getTasks("ws-ms-task"))["t1"];
      expect(r3.revision).toBe(3);

      await TaskRepository.saveTasks([{ ...r3, title: "D" }], "ws-ms-task");
      const r4 = (await TaskRepository.getTasks("ws-ms-task"))["t1"];
      expect(r4.revision).toBe(4);
    });

    it("Habit: revisions 1→2→3→4 with Date.now() pinned", async () => {
      const fixedTime = 1_700_000_001_000;
      jest.spyOn(Date, "now").mockReturnValue(fixedTime);

      const h = baseHabit("h1", "ws-ms-habit");

      await HabitRepository.saveHabits([h], "ws-ms-habit");
      const r1 = (await HabitRepository.getHabits("ws-ms-habit"))["h1"];
      expect(r1.revision).toBe(1);
      expect(r1.updatedAt).toBe(fixedTime);

      await HabitRepository.saveHabits([{ ...r1, title: "B" }], "ws-ms-habit");
      const r2 = (await HabitRepository.getHabits("ws-ms-habit"))["h1"];
      expect(r2.revision).toBe(2);
      expect(r2.updatedAt).toBe(fixedTime);

      await HabitRepository.saveHabits([{ ...r2, title: "C" }], "ws-ms-habit");
      const r3 = (await HabitRepository.getHabits("ws-ms-habit"))["h1"];
      expect(r3.revision).toBe(3);

      await HabitRepository.saveHabits([{ ...r3, title: "D" }], "ws-ms-habit");
      const r4 = (await HabitRepository.getHabits("ws-ms-habit"))["h1"];
      expect(r4.revision).toBe(4);
    });
  });

  // ─── Test 4 — concurrent bulk writes ──────────────────────────────────────

  describe("Test 4 — concurrent bulk Task and Habit writes", () => {
    it("Task: two concurrent saveTasks yield consecutive revisions (no regression)", async () => {
      const seeded = await TaskRepository.saveTask(baseTask("t1", "ws-conc-task")); // rev=1

      // Fire both concurrently — the lock serialises them
      const r1 = TaskRepository.saveTasks(
        [{ ...seeded, title: "A" }],
        "ws-conc-task"
      );
      const r2 = TaskRepository.saveTasks(
        [{ ...seeded, title: "B" }],
        "ws-conc-task"
      );

      await Promise.all([r1, r2]);

      const final = (await TaskRepository.getTasks("ws-conc-task"))["t1"];

      // One write produced revision=2, the other produced revision=3.
      // The lock guarantees sequential execution; both increments are applied.
      expect(final.revision).toBe(3);
      // No revision regression — always > initial 1
      expect(final.revision).toBeGreaterThan(1);
    });

    it("Habit: two concurrent saveHabits yield consecutive revisions (no regression)", async () => {
      const seeded = await HabitRepository.saveHabit(baseHabit("h1", "ws-conc-habit")); // rev=1

      const r1 = HabitRepository.saveHabits(
        [{ ...seeded, title: "A" }],
        "ws-conc-habit"
      );
      const r2 = HabitRepository.saveHabits(
        [{ ...seeded, title: "B" }],
        "ws-conc-habit"
      );

      await Promise.all([r1, r2]);

      const final = (await HabitRepository.getHabits("ws-conc-habit"))["h1"];
      expect(final.revision).toBe(3);
      expect(final.revision).toBeGreaterThan(1);
    });

    it("Task: concurrent saveTasks carrying a stale revision cannot suppress the other's increment", async () => {
      const seeded = await seedTask("t1", "ws-conc-stale-task", 5); // rev=5

      // Both callers hold stale rev=2 — neither should be able to reset revision
      const stale = { ...seeded, revision: 2 };

      const r1 = TaskRepository.saveTasks([{ ...stale, title: "A" }], "ws-conc-stale-task");
      const r2 = TaskRepository.saveTasks([{ ...stale, title: "B" }], "ws-conc-stale-task");

      await Promise.all([r1, r2]);

      const final = (await TaskRepository.getTasks("ws-conc-stale-task"))["t1"];
      // First write: (5||0)+1=6; second write: (6||0)+1=7
      expect(final.revision).toBe(7);
    });

    it("Habit: concurrent saveHabits carrying stale revision cannot suppress the other's increment", async () => {
      const seeded = await seedHabit("h1", "ws-conc-stale-habit", 5);

      const stale = { ...seeded, revision: 2 };

      const r1 = HabitRepository.saveHabits([{ ...stale, title: "A" }], "ws-conc-stale-habit");
      const r2 = HabitRepository.saveHabits([{ ...stale, title: "B" }], "ws-conc-stale-habit");

      await Promise.all([r1, r2]);

      const final = (await HabitRepository.getHabits("ws-conc-stale-habit"))["h1"];
      expect(final.revision).toBe(7);
    });
  });

  // ─── Test 5 — legacy entity ───────────────────────────────────────────────

  describe("Test 5 — legacy entity (no revision in storage) handled correctly", () => {
    it("Task: legacy entity in storage gets revision=1 on first bulk write, then monotonically increments", async () => {
      // Write a raw record directly to storage without a revision field
      const key = "pebble:v1:tasks:ws-legacy-bulk";
      await AsyncStorage.setItem(
        key,
        JSON.stringify({
          "t-legacy": {
            id: "t-legacy",
            workspaceId: "ws-legacy-bulk",
            title: "Legacy",
            status: "todo",
            priority: "none",
            createdAt: 1,
            updatedAt: 1,
            // NO revision field
          },
        })
      );

      const records = await TaskRepository.getTasks("ws-legacy-bulk");
      // normalizeTask defaults to revision=1 via ?? 1
      expect(records["t-legacy"].revision).toBe(1);

      // Bulk write: stored record has revision=1 after normalisation,
      // so (1||0)+1 = 2
      await TaskRepository.saveTasks(
        [{ ...records["t-legacy"], title: "Bulk Updated" }],
        "ws-legacy-bulk"
      );

      const after1 = (await TaskRepository.getTasks("ws-legacy-bulk"))["t-legacy"];
      expect(after1.revision).toBe(2);

      // Subsequent bulk write: 2+1=3
      await TaskRepository.saveTasks(
        [{ ...after1, title: "Bulk Updated 2" }],
        "ws-legacy-bulk"
      );

      const after2 = (await TaskRepository.getTasks("ws-legacy-bulk"))["t-legacy"];
      expect(after2.revision).toBe(3);
    });

    it("Habit: legacy entity in storage gets monotonic revision on bulk writes", async () => {
      const key = "pebble:v1:habits:ws-legacy-bulk-habit";
      await AsyncStorage.setItem(
        key,
        JSON.stringify({
          "h-legacy": {
            id: "h-legacy",
            workspaceId: "ws-legacy-bulk-habit",
            title: "LegacyHabit",
            categoryId: "work",
            tags: [],
            recurrence: { frequency: "daily", interval: 1 },
            completionHistory: [],
            createdAt: 1,
            updatedAt: 1,
            // NO revision field
          },
        })
      );

      const records = await HabitRepository.getHabits("ws-legacy-bulk-habit");
      expect(records["h-legacy"].revision).toBe(1);

      await HabitRepository.saveHabits(
        [{ ...records["h-legacy"], title: "Bulk Updated" }],
        "ws-legacy-bulk-habit"
      );

      const after1 = (await HabitRepository.getHabits("ws-legacy-bulk-habit"))["h-legacy"];
      expect(after1.revision).toBe(2);

      await HabitRepository.saveHabits(
        [{ ...after1, title: "Bulk Updated 2" }],
        "ws-legacy-bulk-habit"
      );

      const after2 = (await HabitRepository.getHabits("ws-legacy-bulk-habit"))["h-legacy"];
      expect(after2.revision).toBe(3);
    });
  });

  // ─── Test 6 — mixed bulk operation ───────────────────────────────────────

  describe("Test 6 — mixed bulk operation: each entity gets independently correct revision", () => {
    it("Task: new, revision=2 (fresh), revision=20 (fresh), stale revision=1 (persisted=8)", async () => {
      // Seed t-existing-high to revision=20
      await seedTask("t-existing-high", "ws-mixed-task", 20);
      // Seed t-existing-stale to revision=8
      await seedTask("t-stale", "ws-mixed-task", 8);
      // t-existing-low is fresh with revision=2 (only 2 saves done)
      await seedTask("t-existing-low", "ws-mixed-task", 2);

      // Read current state for payload construction
      const records = await TaskRepository.getTasks("ws-mixed-task");

      // Build the mixed bulk payload:
      const payloads = [
        // NEW entity — not in storage
        { ...baseTask("t-new", "ws-mixed-task") },
        // t-existing-low: fresh caller with revision=2 (correct)
        { ...records["t-existing-low"], revision: 2, title: "Low Updated" },
        // t-existing-high: fresh caller with revision=20 (correct)
        { ...records["t-existing-high"], revision: 20, title: "High Updated" },
        // t-stale: stale caller with revision=1 (persisted is 8)
        { ...records["t-stale"], revision: 1, title: "Stale Updated" },
      ];

      await TaskRepository.saveTasks(payloads, "ws-mixed-task");

      const result = await TaskRepository.getTasks("ws-mixed-task");

      // t-new: new entity → (0||0)+1 = 1
      expect(result["t-new"].revision).toBe(1);
      // t-existing-low: stored=2 → 3
      expect(result["t-existing-low"].revision).toBe(3);
      // t-existing-high: stored=20 → 21
      expect(result["t-existing-high"].revision).toBe(21);
      // t-stale: stored=8, caller had revision=1 → must be 9 (not 2)
      expect(result["t-stale"].revision).toBe(9);
    });

    it("Habit: same mixed scenario", async () => {
      await seedHabit("h-high", "ws-mixed-habit", 20);
      await seedHabit("h-stale", "ws-mixed-habit", 8);
      await seedHabit("h-low", "ws-mixed-habit", 2);

      const records = await HabitRepository.getHabits("ws-mixed-habit");

      const payloads = [
        { ...baseHabit("h-new", "ws-mixed-habit") },
        { ...records["h-low"], revision: 2, title: "Low Updated" },
        { ...records["h-high"], revision: 20, title: "High Updated" },
        { ...records["h-stale"], revision: 1, title: "Stale Updated" },
      ];

      await HabitRepository.saveHabits(payloads, "ws-mixed-habit");

      const result = await HabitRepository.getHabits("ws-mixed-habit");

      expect(result["h-new"].revision).toBe(1);
      expect(result["h-low"].revision).toBe(3);
      expect(result["h-high"].revision).toBe(21);
      expect(result["h-stale"].revision).toBe(9);
    });
  });

  // ─── Test 7 — caller cannot force revision ────────────────────────────────

  describe("Test 7 — caller cannot manipulate revision via payload", () => {
    it("Task: payload revision=999999 with persisted=5 yields 6", async () => {
      const seeded = await seedTask("t1", "ws-force-task", 5);

      const inflatedPayload = { ...seeded, revision: 999999, title: "Inflated" };
      await TaskRepository.saveTasks([inflatedPayload], "ws-force-task");

      const after = (await TaskRepository.getTasks("ws-force-task"))["t1"];
      expect(after.revision).toBe(6); // stored 5 → 6, never 999999+1
    });

    it("Task: payload revision=0 with persisted=5 yields 6", async () => {
      const seeded = await seedTask("t1", "ws-zero-task", 5);

      const zeroPayload = { ...seeded, revision: 0, title: "Zero" };
      await TaskRepository.saveTasks([zeroPayload], "ws-zero-task");

      const after = (await TaskRepository.getTasks("ws-zero-task"))["t1"];
      expect(after.revision).toBe(6);
    });

    it("Task: payload with no revision field at all (undefined) with persisted=5 yields 6", async () => {
      const seeded = await seedTask("t1", "ws-undef-task", 5);

      const { revision: _drop, ...noRevisionPayload } = seeded as any;
      await TaskRepository.saveTasks([noRevisionPayload], "ws-undef-task");

      const after = (await TaskRepository.getTasks("ws-undef-task"))["t1"];
      expect(after.revision).toBe(6);
    });

    it("Habit: payload revision=999999 with persisted=5 yields 6", async () => {
      const seeded = await seedHabit("h1", "ws-force-habit", 5);

      const inflatedPayload = { ...seeded, revision: 999999, title: "Inflated" };
      await HabitRepository.saveHabits([inflatedPayload], "ws-force-habit");

      const after = (await HabitRepository.getHabits("ws-force-habit"))["h1"];
      expect(after.revision).toBe(6);
    });

    it("Habit: payload revision=0 with persisted=5 yields 6", async () => {
      const seeded = await seedHabit("h1", "ws-zero-habit", 5);

      const zeroPayload = { ...seeded, revision: 0, title: "Zero" };
      await HabitRepository.saveHabits([zeroPayload], "ws-zero-habit");

      const after = (await HabitRepository.getHabits("ws-zero-habit"))["h1"];
      expect(after.revision).toBe(6);
    });
  });

  // ─── Test 8 — unlocked variants obey same invariant ───────────────────────

  describe("Test 8 — unlocked variants (saveTasksUnlocked, saveHabitsUnlocked) enforce same invariant", () => {
    it("saveTasksUnlocked: stale revision=3 with persisted=10 yields 11", async () => {
      const seeded = await seedTask("t1", "ws-unlocked-task", 10);

      const stalePayload = { ...seeded, revision: 3, title: "Stale Unlocked" };
      await TaskRepository.saveTasksUnlocked([stalePayload], "ws-unlocked-task");

      const after = (await TaskRepository.getTasks("ws-unlocked-task"))["t1"];
      expect(after.revision).toBe(11);
    });

    it("saveTasksUnlocked: new entity in an empty partition gets revision=1", async () => {
      const newTask = baseTask("t-new-unlocked", "ws-new-unlocked-task");
      await TaskRepository.saveTasksUnlocked([newTask], "ws-new-unlocked-task");

      const after = (await TaskRepository.getTasks("ws-new-unlocked-task"))["t-new-unlocked"];
      expect(after.revision).toBe(1);
    });

    it("saveHabitsUnlocked: stale revision=3 with persisted=10 yields 11", async () => {
      const seeded = await seedHabit("h1", "ws-unlocked-habit", 10);

      const stalePayload = { ...seeded, revision: 3, title: "Stale Unlocked" };
      await HabitRepository.saveHabitsUnlocked([stalePayload], "ws-unlocked-habit");

      const after = (await HabitRepository.getHabits("ws-unlocked-habit"))["h1"];
      expect(after.revision).toBe(11);
    });

    it("saveHabitsUnlocked: new entity gets revision=1", async () => {
      const newHabit = baseHabit("h-new-unlocked", "ws-new-unlocked-habit");
      await HabitRepository.saveHabitsUnlocked([newHabit], "ws-new-unlocked-habit");

      const after = (await HabitRepository.getHabits("ws-new-unlocked-habit"))["h-new-unlocked"];
      expect(after.revision).toBe(1);
    });
  });

  // ─── Regression: existing single-entity paths unchanged ──────────────────

  describe("Regression: saveTask / saveHabit single-entity paths unchanged", () => {
    it("saveTask with stale payload revision still advances monotonically", async () => {
      const seeded = await seedTask("t1", "ws-reg-task", 5);

      const stale = { ...seeded, revision: 1, title: "Stale" };
      const saved = await TaskRepository.saveTask(stale);

      // saveTask reads from records[task.id].revision = 5 → 6
      expect(saved.revision).toBe(6);
    });

    it("saveHabit with stale payload revision still advances monotonically", async () => {
      const seeded = await seedHabit("h1", "ws-reg-habit", 5);

      const stale = { ...seeded, revision: 1, title: "Stale" };
      const saved = await HabitRepository.saveHabit(stale);
      expect(saved.revision).toBe(6);
    });
  });
});
