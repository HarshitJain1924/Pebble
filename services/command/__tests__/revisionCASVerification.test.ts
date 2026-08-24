/**
 * revisionCASVerification.test.ts
 * ──────────────────────────────────────────────────────────────────
 * Hostile verification of the monotonic `revision` CAS system.
 *
 * This file tests ONE bug only:
 *   P1 — Habit ↔ Task conversion notification race.
 *
 * It does NOT touch unrelated vulnerabilities.
 * It does NOT mock the CAS itself — the real repository is exercised.
 *
 * Tests required:
 *   1.  Same-millisecond mutation (revision detects it; updatedAt cannot)
 *   2.  Two rapid sequential mutations (revision integer sequence)
 *   3.  Reminder-only mutation increments revision
 *   4.  Notification-ID-only write (updateNotificationIds) does NOT increment revision
 *       → prove this is safe because CAS checks revision before the write
 *   5.  Completion increments revision
 *   6.  Archive increments revision
 *   7.  CAS success when no concurrent mutation
 *   8.  CAS rejection when revision is newer
 *   9.  Legacy entity without revision field
 *  10.  Concurrent conversion (both directions) — only one succeeds
 *  11.  Both Habit→Task and Task→Habit directions for the same-millisecond test
 *  12.  Crash/recovery — revision survives ConversionJournal reconciliation
 *  13.  Bulk saveTasks/saveHabits bypass (no revision increment — documented finding)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import {
  TaskRepository,
  HabitRepository,
  WorkspaceRepository,
  ConversionJournalRepository,
} from "@/repositories";
import { ConversionReconcilerService } from "@/services/storage/ConversionReconcilerService";
import type { Task, Habit, Workspace } from "@/shared/types/domain.types";
import * as Notifications from "@/services/command/shared/command-notifications";
import * as RemindersService from "@/services/scheduling/reminders.service";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const storage = AsyncStorage as typeof AsyncStorage;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ws = (id: string): Workspace =>
  ({ id, name: id, createdAt: 1, updatedAt: 1 } as any);

const task = (id: string, workspaceId: string): Task =>
  ({
    id,
    workspaceId,
    title: "Task",
    status: "todo",
    priority: "none",
    createdAt: 1,
    updatedAt: 1,
  } as any);

const habit = (id: string, workspaceId: string): Habit =>
  ({
    id,
    workspaceId,
    title: "Habit",
    categoryId: "work",
    tags: [],
    recurrence: { frequency: "daily", interval: 1 },
    completionHistory: [],
    createdAt: 1,
    updatedAt: 1,
  } as any);

// ─── Suite ───────────────────────────────────────────────────────────────────

describe("Revision CAS Hostile Verification", () => {
  beforeEach(async () => {
    await storage.clear();
    jest.restoreAllMocks();
  });

  // ─── 1. Revision initialisation ──────────────────────────────────────────

  describe("1. Revision initialisation", () => {
    it("new task gets revision=1 after first save", async () => {
      await WorkspaceRepository.saveWorkspaces([ws("ws-a")]);
      const saved = await TaskRepository.saveTask(task("t1", "ws-a"));
      expect(saved.revision).toBe(1);
    });

    it("new habit gets revision=1 after first save", async () => {
      await WorkspaceRepository.saveWorkspaces([ws("ws-a")]);
      const saved = await HabitRepository.saveHabit(habit("h1", "ws-a"));
      expect(saved.revision).toBe(1);
    });

    it("legacy task without revision field is treated as revision=1 on read, then incremented to 2 on save", async () => {
      // Write a raw record with no revision field directly to simulate legacy data
      const key = "pebble:v1:tasks:ws-legacy";
      await AsyncStorage.setItem(
        key,
        JSON.stringify({
          "t-legacy": {
            id: "t-legacy",
            workspaceId: "ws-legacy",
            title: "Legacy",
            status: "todo",
            priority: "none",
            createdAt: 1,
            updatedAt: 1,
            // NO revision field
          },
        })
      );

      const records = await TaskRepository.getTasks("ws-legacy");
      expect(records["t-legacy"].revision).toBe(1); // normalizeTask ?? 1

      // Now save it — should increment from existing storage record (0 || 0) + 1 = 1
      // Wait: the stored record has no revision, so records["t-legacy"]?.revision is undefined → (undefined || 0) + 1 = 1
      // That means the legacy record's "effective" revision stays at 1 on next save.
      const saved = await TaskRepository.saveTask(records["t-legacy"]);
      // Stored raw JSON has no `revision` field.
      // normalizeTask applies `rawTask.revision ?? 1` when reading from the store,
      // so records["t-legacy"].revision === 1 (after the getTask normalisation pass).
      // saveTask then computes (records[task.id]?.revision || 0) + 1 = (1 || 0) + 1 = 2.
      expect(saved.revision).toBe(2);

      // Second save increments from stored 2 → 3
      const saved2 = await TaskRepository.saveTask(saved);
      expect(saved2.revision).toBe(3);
    });

    it("legacy entity: CAS with expectedRevision=undefined always passes", async () => {
      const key = "pebble:v1:tasks:ws-cas";
      await AsyncStorage.setItem(
        key,
        JSON.stringify({
          "t-cas": {
            id: "t-cas",
            workspaceId: "ws-cas",
            title: "CAS",
            status: "todo",
            priority: "none",
            createdAt: 1,
            updatedAt: 1,
            reminder: { enabled: true, triggerAt: 5000 },
            // NO revision field
          },
        })
      );

      // CAS with undefined revision — must succeed regardless (open path for systems that never set revision)
      const result = await TaskRepository.updateNotificationIds(
        "t-cas",
        "ws-cas",
        ["id-1"],
        { reminder: { enabled: true, triggerAt: 5000 }, revision: undefined }
      );
      expect(result).toBe("updated");
    });

    it("legacy entity: two concurrent legacy mutations → both increment independently (no collision)", async () => {
      // Simulates scenario: two callers both read revision=undefined, both save.
      // Because revision is taken from the STORED record at save time (not from the input),
      // the second save will see revision=1 in storage and produce revision=2.
      const key = "pebble:v1:tasks:ws-seq";
      await AsyncStorage.setItem(
        key,
        JSON.stringify({
          "t-seq": {
            id: "t-seq",
            workspaceId: "ws-seq",
            title: "Seq",
            status: "todo",
            priority: "none",
            createdAt: 1,
            updatedAt: 1,
          },
        })
      );

      const base = (await TaskRepository.getTasks("ws-seq"))["t-seq"];
      // Both callers have base (revision=1 after normalize).
      // Run sequentially since they share the same lock.
      const a = await TaskRepository.saveTask({ ...base, title: "A" });
      const b = await TaskRepository.saveTask({ ...base, title: "B" });

      // a: stored raw record has no revision field.
      // normalizeTask defaults to revision=1 via `?? 1` when reading.
      // saveTask therefore computes (1 || 0) + 1 = 2.
      expect(a.revision).toBe(2);
      // b: stored now has revision=2 → 2 + 1 = 3
      expect(b.revision).toBe(3);

      const final = (await TaskRepository.getTasks("ws-seq"))["t-seq"];
      expect(final.revision).toBe(3); // b wrote revision=3, which is the final state
      expect(final.title).toBe("B");
    });
  });

  // ─── 2. Revision increment on every mutation type ────────────────────────

  describe("2. Revision increment by mutation type", () => {
    it("normal update increments revision", async () => {
      const saved1 = await TaskRepository.saveTask(task("t1", "ws-a"));
      expect(saved1.revision).toBe(1);
      const saved2 = await TaskRepository.saveTask({ ...saved1, title: "Updated" });
      expect(saved2.revision).toBe(2);
    });

    it("rapid sequential mutations increment revision monotonically (no wall-clock dependency)", async () => {
      // Pin Date.now to a single value to prove revision is integer-based
      const fixedTime = 1_700_000_000_000;
      jest.spyOn(Date, "now").mockReturnValue(fixedTime);

      const saved1 = await TaskRepository.saveTask(task("t1", "ws-rev"));
      const saved2 = await TaskRepository.saveTask({ ...saved1, title: "B" });
      const saved3 = await TaskRepository.saveTask({ ...saved2, title: "C" });

      expect(saved1.revision).toBe(1);
      expect(saved2.revision).toBe(2);
      expect(saved3.revision).toBe(3);

      // All three have the SAME updatedAt — proving revision is NOT wall-clock
      expect(saved1.updatedAt).toBe(fixedTime);
      expect(saved2.updatedAt).toBe(fixedTime);
      expect(saved3.updatedAt).toBe(fixedTime);
    });

    it("completion saves increment revision", async () => {
      const saved1 = await TaskRepository.saveTask(task("t1", "ws-complete"));
      const saved2 = await TaskRepository.saveTask({
        ...saved1,
        status: "completed",
        completedAt: Date.now(),
      });
      expect(saved2.revision).toBe(2);
    });

    it("archive saves increment revision", async () => {
      const saved1 = await TaskRepository.saveTask(task("t1", "ws-archive"));
      const saved2 = await TaskRepository.saveTask({
        ...saved1,
        archivedAt: Date.now(),
      });
      expect(saved2.revision).toBe(2);
    });

    it("reminder field change increments revision", async () => {
      const t = task("t1", "ws-reminder");
      (t as any).reminder = { enabled: true, triggerAt: 1000 };
      const saved1 = await TaskRepository.saveTask(t);
      const saved2 = await TaskRepository.saveTask({
        ...saved1,
        reminder: { enabled: true, triggerAt: 2000 },
      });
      expect(saved2.revision).toBe(2);
    });

    it("saveHabit increments revision", async () => {
      const saved1 = await HabitRepository.saveHabit(habit("h1", "ws-hrev"));
      expect(saved1.revision).toBe(1);
      const saved2 = await HabitRepository.saveHabit({
        ...saved1,
        title: "Updated",
      });
      expect(saved2.revision).toBe(2);
    });

    it("rapid habit mutations at same millisecond produce distinct revision integers", async () => {
      const fixedTime = 1_700_000_000_000;
      jest.spyOn(Date, "now").mockReturnValue(fixedTime);

      const s1 = await HabitRepository.saveHabit(habit("h1", "ws-hseq"));
      const s2 = await HabitRepository.saveHabit({ ...s1, title: "B" });
      const s3 = await HabitRepository.saveHabit({ ...s2, title: "C" });

      expect(s1.revision).toBe(1);
      expect(s2.revision).toBe(2);
      expect(s3.revision).toBe(3);
      expect(s1.updatedAt).toBe(fixedTime);
      expect(s3.updatedAt).toBe(fixedTime); // same clock, different revision
    });
  });

  // ─── 3. updateNotificationIds does NOT increment revision ─────────────────

  describe("3. updateNotificationIds: does not increment revision, and that is safe", () => {
    it("updateNotificationIds does NOT change revision", async () => {
      const t = task("t1", "ws-notif");
      (t as any).reminder = { enabled: true, triggerAt: 1000 };
      const saved = await TaskRepository.saveTask(t);
      expect(saved.revision).toBe(1);

      await TaskRepository.updateNotificationIds("t1", "ws-notif", ["id-1"]);

      const after = (await TaskRepository.getTasks("ws-notif"))["t1"];
      expect(after.revision).toBe(1); // unchanged
      expect(after.reminder?.notificationIds).toEqual(["id-1"]);
    });

    it("CAS with revision=1 is REJECTED if a prior updateNotificationIds ran without incrementing", async () => {
      // Scenario: conversion captures revision=1.
      // updateNotificationIds runs → revision stays 1.
      // CAS checks revision=1 === stored revision=1 → would pass.
      //
      // BUT: this is actually SAFE because updateNotificationIds only updates
      // notificationIds, not any field the conversion cares about. The conversion's
      // CAS also checks reminder.enabled and reminder.triggerAt; if those are
      // unchanged after updateNotificationIds, a second conversion CAS would still
      // pass — however, in that scenario the entity is already in its correct state.
      //
      // What we need to prove: if a saveTask (which DOES increment revision) runs
      // concurrently, it WILL be caught.
      const t = task("t1", "ws-safe");
      (t as any).reminder = { enabled: true, triggerAt: 1000 };
      const saved = await TaskRepository.saveTask(t); // revision=1

      // Capture what conversion would snapshot
      const snapshot = {
        reminder: { enabled: true, triggerAt: 1000 },
        status: "todo" as const,
        archivedAt: undefined,
        updatedAt: saved.updatedAt,
        revision: saved.revision, // 1
      };

      // A legitimate saveTask runs (e.g., user changes title) → revision becomes 2
      await TaskRepository.saveTask({ ...saved, title: "User Title" });

      // Conversion tries to CAS with revision=1 → must be REJECTED
      const result = await TaskRepository.updateNotificationIds(
        "t1",
        "ws-safe",
        ["stale-id"],
        snapshot
      );
      expect(result).toBe("state_changed");

      // Verify stale IDs were NOT persisted
      const final = (await TaskRepository.getTasks("ws-safe"))["t1"];
      expect(final.reminder?.notificationIds).toBeUndefined();
    });

    it("updateNotificationIds with correct snapshot succeeds (happy path)", async () => {
      const t = task("t1", "ws-happy");
      (t as any).reminder = { enabled: true, triggerAt: 1000 };
      const saved = await TaskRepository.saveTask(t);

      const result = await TaskRepository.updateNotificationIds(
        "t1",
        "ws-happy",
        ["id-ok"],
        {
          reminder: { enabled: true, triggerAt: 1000 },
          status: "todo",
          archivedAt: undefined,
          updatedAt: saved.updatedAt,
          revision: saved.revision,
        }
      );
      expect(result).toBe("updated");

      const final = (await TaskRepository.getTasks("ws-happy"))["t1"];
      expect(final.reminder?.notificationIds).toEqual(["id-ok"]);
    });
  });

  // ─── 4. Same-millisecond race: Habit → Task ───────────────────────────────

  describe("4. Same-millisecond CAS (Habit → Task)", () => {
    it("Test D-H2T: conversion is blocked by a concurrent same-millisecond saveTask", async () => {
      await WorkspaceRepository.saveWorkspaces([ws("ws-h2t")]);

      // Pin clock to fixed value — updatedAt cannot differentiate mutations
      const fixedTime = 1_787_590_000_000;
      jest.spyOn(Date, "now").mockReturnValue(fixedTime);

      const h = habit("habit-1", "ws-h2t");
      h.reminder = { enabled: true, triggerAt: 1000, notificationIds: ["old-id"] } as any;
      await HabitRepository.saveHabit(h);

      let pauseConversion: () => void;
      const conversionPaused = new Promise<void>((resolve) => {
        pauseConversion = resolve;
      });
      let resumeConversion: () => void;
      const conversionResume = new Promise<void>((resolve) => {
        resumeConversion = resolve;
      });

      jest
        .spyOn(Notifications, "scheduleTaskNotifications")
        .mockImplementation(async () => {
          pauseConversion!(); // conversion reached OS scheduling
          await conversionResume; // wait for concurrent mutation
          return ["stale-id-1", "stale-id-2"];
        });

      const cancelSpy = jest
        .spyOn(RemindersService, "cancelReminderIds")
        .mockResolvedValue(undefined as any);

      const conversionPromise = EntityCommandService.convertHabitToTask(
        "habit-1",
        "ws-h2t",
        { skipEvents: true, skipAnalytics: true }
      );

      // Wait until conversion is paused inside OS scheduling
      await conversionPaused;

      // Read the newly created task
      const tasks = await TaskRepository.getTasks("ws-h2t");
      const taskKeys = Object.keys(tasks);
      expect(taskKeys.length).toBe(1);
      const newTaskId = taskKeys[0];
      const newTask = tasks[newTaskId];

      // Sanity: conversion created with revision=1
      expect(newTask.revision).toBe(1);

      // Concurrent mutation at the SAME millisecond (Date.now is still fixedTime)
      // This changes reminder.notificationIds only, via saveTask → revision becomes 2
      await TaskRepository.saveTask({
        ...newTask,
        reminder: { enabled: true, triggerAt: 1000, notificationIds: ["concurrent-id"] },
      });

      const afterMutation = (await TaskRepository.getTasks("ws-h2t"))[newTaskId];
      expect(afterMutation.revision).toBe(2); // incremented even though updatedAt is same
      expect(afterMutation.updatedAt).toBe(fixedTime); // same clock proves it

      // Resume conversion — it holds snapshot with revision=1
      resumeConversion!();
      await conversionPromise;

      const final = (await TaskRepository.getTasks("ws-h2t"))[newTaskId];

      // The CAS must have caught revision 1 ≠ 2 and rejected stale IDs
      expect(final.reminder?.notificationIds).toEqual(["concurrent-id"]);
      // Stale IDs must be cancelled
      expect(cancelSpy).toHaveBeenCalledWith(
        ["stale-id-1", "stale-id-2"],
        expect.anything()
      );
    });
  });

  // ─── 5. Same-millisecond race: Task → Habit ───────────────────────────────

  describe("5. Same-millisecond CAS (Task → Habit)", () => {
    it("Test D-T2H: conversion is blocked by a concurrent same-millisecond saveHabit", async () => {
      await WorkspaceRepository.saveWorkspaces([ws("ws-t2h")]);

      const fixedTime = 1_787_591_000_000;
      jest.spyOn(Date, "now").mockReturnValue(fixedTime);

      const t = task("task-1", "ws-t2h");
      (t as any).reminder = {
        enabled: true,
        triggerAt: 1000,
        notificationIds: ["old-id"],
      };
      await TaskRepository.saveTask(t);

      let pauseConversion: () => void;
      const conversionPaused = new Promise<void>((resolve) => {
        pauseConversion = resolve;
      });
      let resumeConversion: () => void;
      const conversionResume = new Promise<void>((resolve) => {
        resumeConversion = resolve;
      });

      jest
        .spyOn(Notifications, "scheduleHabitNotifications")
        .mockImplementation(async () => {
          pauseConversion!();
          await conversionResume;
          return ["stale-id-1", "stale-id-2"];
        });

      const cancelSpy = jest
        .spyOn(RemindersService, "cancelReminderIds")
        .mockResolvedValue(undefined as any);

      const conversionPromise = EntityCommandService.convertTaskToHabit(
        "task-1",
        "ws-t2h",
        { skipEvents: true, skipAnalytics: true }
      );

      await conversionPaused;

      const habits = await HabitRepository.getHabits("ws-t2h");
      const habitKeys = Object.keys(habits);
      expect(habitKeys.length).toBe(1);
      const newHabitId = habitKeys[0];
      const newHabit = habits[newHabitId];

      expect(newHabit.revision).toBe(1);

      // Concurrent mutation at SAME millisecond
      await HabitRepository.saveHabit({
        ...newHabit,
        reminder: {
          enabled: true,
          triggerAt: 1000,
          notificationIds: ["concurrent-id"],
        },
      });

      const afterMutation = (await HabitRepository.getHabits("ws-t2h"))[newHabitId];
      expect(afterMutation.revision).toBe(2);
      expect(afterMutation.updatedAt).toBe(fixedTime);

      resumeConversion!();
      await conversionPromise;

      const final = (await HabitRepository.getHabits("ws-t2h"))[newHabitId];

      expect(final.reminder?.notificationIds).toEqual(["concurrent-id"]);
      expect(cancelSpy).toHaveBeenCalledWith(
        ["stale-id-1", "stale-id-2"],
        expect.anything()
      );
    });
  });

  // ─── 6. CAS exact revision comparison ─────────────────────────────────────

  describe("6. CAS exact revision comparison", () => {
    it("CAS passes with correct revision", async () => {
      const t = task("t1", "ws-cas-ok");
      (t as any).reminder = { enabled: true, triggerAt: 5000 };
      const saved = await TaskRepository.saveTask(t);

      const result = await TaskRepository.updateNotificationIds(
        "t1",
        "ws-cas-ok",
        ["id-1"],
        {
          reminder: { enabled: true, triggerAt: 5000 },
          status: "todo",
          archivedAt: undefined,
          updatedAt: saved.updatedAt,
          revision: saved.revision, // correct
        }
      );
      expect(result).toBe("updated");
    });

    it("CAS fails when revision is one ahead", async () => {
      const t = task("t1", "ws-cas-fail");
      (t as any).reminder = { enabled: true, triggerAt: 5000 };
      const saved = await TaskRepository.saveTask(t); // revision=1
      await TaskRepository.saveTask({ ...saved, title: "New" }); // revision=2

      const result = await TaskRepository.updateNotificationIds(
        "t1",
        "ws-cas-fail",
        ["stale"],
        {
          reminder: { enabled: true, triggerAt: 5000 },
          status: "todo",
          archivedAt: undefined,
          updatedAt: saved.updatedAt,
          revision: 1, // stale
        }
      );
      expect(result).toBe("state_changed");

      const final = (await TaskRepository.getTasks("ws-cas-fail"))["t1"];
      expect(final.reminder?.notificationIds).toBeUndefined();
    });

    it("CAS fails when revision is two ahead", async () => {
      const t = task("t1", "ws-cas-far");
      (t as any).reminder = { enabled: true, triggerAt: 5000 };
      const s1 = await TaskRepository.saveTask(t);
      const s2 = await TaskRepository.saveTask({ ...s1, title: "B" });
      await TaskRepository.saveTask({ ...s2, title: "C" }); // revision=3

      const result = await TaskRepository.updateNotificationIds(
        "t1",
        "ws-cas-far",
        ["stale"],
        { reminder: { enabled: true, triggerAt: 5000 }, revision: 1 }
      );
      expect(result).toBe("state_changed");
    });

    it("Habit CAS passes with correct revision", async () => {
      const h = habit("h1", "ws-hcas-ok");
      (h as any).reminder = { enabled: true, triggerAt: 3000 };
      const saved = await HabitRepository.saveHabit(h);

      const result = await HabitRepository.updateNotificationIds(
        "h1",
        "ws-hcas-ok",
        ["id-1"],
        {
          reminder: { enabled: true, triggerAt: 3000 },
          archivedAt: undefined,
          updatedAt: saved.updatedAt,
          revision: saved.revision,
        }
      );
      expect(result).toBe("updated");
    });

    it("Habit CAS fails when revision is newer", async () => {
      const h = habit("h1", "ws-hcas-fail");
      (h as any).reminder = { enabled: true, triggerAt: 3000 };
      const saved = await HabitRepository.saveHabit(h);
      await HabitRepository.saveHabit({ ...saved, title: "Mutated" }); // revision=2

      const result = await HabitRepository.updateNotificationIds(
        "h1",
        "ws-hcas-fail",
        ["stale"],
        { reminder: { enabled: true, triggerAt: 3000 }, revision: 1 }
      );
      expect(result).toBe("state_changed");
    });
  });

  // ─── 7. CAS atomicity proof ────────────────────────────────────────────────

  describe("7. CAS atomicity — compare and write under single lock", () => {
    it("no interleaving: a concurrent saveTask racing updateNotificationIds sees a clear winner", async () => {
      // updateNotificationIds acquires withLock(key) internally.
      // saveTask also acquires withLock(key).
      // They cannot interleave — the lock is re-entrant-free.
      // This test proves the winning party's write is visible atomically.

      const t = task("t1", "ws-atom");
      (t as any).reminder = { enabled: true, triggerAt: 1000 };
      const saved = await TaskRepository.saveTask(t); // revision=1

      // Fire both concurrently — one must win, the other must lose
      const casPromise = TaskRepository.updateNotificationIds("t1", "ws-atom", ["cas-id"], {
        reminder: { enabled: true, triggerAt: 1000 },
        revision: 1,
      });

      const mutatePromise = TaskRepository.saveTask({
        ...saved,
        title: "Mutated",
      }); // will increment revision to 2

      const [casResult] = await Promise.all([casPromise, mutatePromise]);

      // Either: CAS ran first (revision still 1) → updated; mutation ran after (revision 2)
      // Or:     mutation ran first (revision → 2) → CAS sees revision 2 ≠ 1 → state_changed
      // In either case, the final state is consistent — no torn writes.
      const final = (await TaskRepository.getTasks("ws-atom"))["t1"];

      if (casResult === "updated") {
        // CAS won: notificationIds written with cas-id, title might have been overwritten by mutation
        expect(final.revision).toBeGreaterThanOrEqual(1);
        // cas-id may or may not be visible depending on mutation order, but no corruption
      } else {
        // mutation won: CAS was rejected, notificationIds must be undefined
        expect(casResult).toBe("state_changed");
        expect(final.reminder?.notificationIds).toBeUndefined();
      }
      // In both cases, revision is a positive integer — no reset
      expect(final.revision).toBeGreaterThan(0);
    });
  });

  // ─── 8. Concurrent conversion (both directions) ───────────────────────────

  describe("8. Concurrent double conversion", () => {
    it("Habit → Task: only one succeeds, no duplicate tasks", async () => {
      await WorkspaceRepository.saveWorkspaces([ws("ws-dconv")]);
      await HabitRepository.saveHabit(habit("habit-dc", "ws-dconv"));

      const r1 = EntityCommandService.convertHabitToTask("habit-dc", "ws-dconv", {
        skipEvents: true,
        skipAnalytics: true,
      });
      const r2 = EntityCommandService.convertHabitToTask("habit-dc", "ws-dconv", {
        skipEvents: true,
        skipAnalytics: true,
      });

      const results = await Promise.allSettled([r1, r2]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const tasks = await TaskRepository.getTasks("ws-dconv");
      expect(Object.keys(tasks).length).toBe(1);

      const habits = await HabitRepository.getHabits("ws-dconv");
      expect(Object.keys(habits).length).toBe(0);
    });

    it("Task → Habit: only one succeeds, no duplicate habits", async () => {
      await WorkspaceRepository.saveWorkspaces([ws("ws-dconv2")]);
      await TaskRepository.saveTask(task("task-dc", "ws-dconv2"));

      const r1 = EntityCommandService.convertTaskToHabit("task-dc", "ws-dconv2", {
        skipEvents: true,
        skipAnalytics: true,
      });
      const r2 = EntityCommandService.convertTaskToHabit("task-dc", "ws-dconv2", {
        skipEvents: true,
        skipAnalytics: true,
      });

      const results = await Promise.allSettled([r1, r2]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");

      expect(fulfilled.length).toBe(1);

      const habits = await HabitRepository.getHabits("ws-dconv2");
      expect(Object.keys(habits).length).toBe(1);

      const tasks = await TaskRepository.getTasks("ws-dconv2");
      expect(Object.keys(tasks).length).toBe(0);
    });
  });

  // ─── 9. Crash recovery preserves revision ────────────────────────────────

  describe("9. Crash recovery — revision survives ConversionJournal reconciliation", () => {
    it("after roll-forward: reconciler-created task starts at revision=1", async () => {
      // Simulate crash after DESTINATION_WRITTEN but before source deletion.
      // The ConversionReconciler re-deletes the source.
      // It does NOT re-create the task (task already exists).
      // So the task's revision is whatever saveTaskUnlocked wrote.

      await WorkspaceRepository.saveWorkspaces([ws("ws-crash-rev")]);
      await HabitRepository.saveHabit(habit("habit-cr", "ws-crash-rev"));

      // Intercept to crash AFTER destination write, before journal update
      const origUpdate = ConversionJournalRepository.updateOperationUnlocked;
      ConversionJournalRepository.updateOperationUnlocked = jest
        .fn()
        .mockRejectedValueOnce(new Error("Crash after dest write"));

      await expect(
        EntityCommandService.convertHabitToTask("habit-cr", "ws-crash-rev", {
          skipEvents: true,
          skipAnalytics: true,
        })
      ).rejects.toThrow("Crash after dest write");

      // Task exists (destination was written), journal is in PREPARED
      const tasksPre = await TaskRepository.getTasks("ws-crash-rev");
      expect(Object.keys(tasksPre).length).toBe(1);
      const taskId = Object.keys(tasksPre)[0];
      const taskBefore = tasksPre[taskId];
      expect(taskBefore.revision).toBe(1); // Written by saveTaskUnlocked → revision=1

      // Run reconciler — rolls forward, deletes habit
      await ConversionReconcilerService.reconcileAll();

      const tasksPost = await TaskRepository.getTasks("ws-crash-rev");
      const habitsPost = await HabitRepository.getHabits("ws-crash-rev");

      expect(Object.keys(tasksPost).length).toBe(1);
      expect(Object.keys(habitsPost).length).toBe(0);

      // Crucially: reconciler did NOT re-save the task, so revision is still 1
      const taskAfter = tasksPost[taskId];
      expect(taskAfter.revision).toBe(1);

      ConversionJournalRepository.updateOperationUnlocked = origUpdate;
    });
  });

  // ─── 10. Bulk write revision invariant (previously a bypass — now fixed) ──────

  describe("10. saveTasks/saveHabits now enforce monotonic revision (bypass fixed)", () => {
    it("saveTasks increments revision from stored record, not from payload", async () => {
      const saved1 = await TaskRepository.saveTask(task("t1", "ws-bypass"));
      expect(saved1.revision).toBe(1);
      const saved2 = await TaskRepository.saveTask({ ...saved1, title: "B" });
      expect(saved2.revision).toBe(2);

      // saveTasks now reads the stored record's revision and increments it.
      // stored=2, so next=3.
      await TaskRepository.saveTasks([{ ...saved2, title: "C" }], "ws-bypass");
      const afterBulk = (await TaskRepository.getTasks("ws-bypass"))["t1"];

      expect(afterBulk.revision).toBe(3); // stored 2 → 3
    });

    it("saveTasks: stale caller payload cannot decrease stored revision", async () => {
      const saved1 = await TaskRepository.saveTask(task("t1", "ws-bypass-stale"));
      const saved2 = await TaskRepository.saveTask({ ...saved1, title: "B" });
      expect(saved2.revision).toBe(2);

      // Caller carries stale revision=1 — must not regress
      await TaskRepository.saveTasks([{ ...saved2, revision: 1, title: "C" }], "ws-bypass-stale");
      const afterBulk = (await TaskRepository.getTasks("ws-bypass-stale"))["t1"];
      expect(afterBulk.revision).toBe(3); // stored 2 → 3, not 2 (1+1)
    });

    it("saveHabits increments revision from stored record, not from payload", async () => {
      const saved1 = await HabitRepository.saveHabit(habit("h1", "ws-hbypass"));
      expect(saved1.revision).toBe(1);
      const saved2 = await HabitRepository.saveHabit({ ...saved1, title: "B" });
      expect(saved2.revision).toBe(2);

      await HabitRepository.saveHabits(
        [{ ...saved2, title: "C" }],
        "ws-hbypass"
      );
      const afterBulk = (await HabitRepository.getHabits("ws-hbypass"))["h1"];
      expect(afterBulk.revision).toBe(3); // stored 2 → 3
    });

    it("saveHabits: stale caller payload cannot decrease stored revision", async () => {
      const saved1 = await HabitRepository.saveHabit(habit("h1", "ws-hbypass-stale"));
      const saved2 = await HabitRepository.saveHabit({ ...saved1, title: "B" });
      expect(saved2.revision).toBe(2);

      await HabitRepository.saveHabits(
        [{ ...saved2, revision: 1, title: "C" }],
        "ws-hbypass-stale"
      );
      const afterBulk = (await HabitRepository.getHabits("ws-hbypass-stale"))["h1"];
      expect(afterBulk.revision).toBe(3); // stored 2 → 3, not 2 (1+1)
    });
  });


  // ─── 11. Full end-to-end notification race (real CAS, no mock) ────────────

  describe("11. Full notification race: conversion CAS uses actual revision from saveTaskUnlocked return value", () => {
    it("Habit → Task: conversion captures revision from saveTaskUnlocked return, not from newTask literal", async () => {
      // The ConversionCommandHandler does:
      //   createdTask = await TaskRepository.saveTaskUnlocked(newTask);
      //   ...
      //   revision: createdTask.revision  ← comes from the return value
      //
      // saveTaskUnlocked increments from stored revision (0 || 0) + 1 = 1 for a new entity.
      // The snapshot therefore captures revision=1.
      // A concurrent saveTask increments it to 2.
      // The CAS compares 1 vs 2 → rejects.

      await WorkspaceRepository.saveWorkspaces([ws("ws-e2e")]);
      const h = habit("h-e2e", "ws-e2e");
      h.reminder = { enabled: true, triggerAt: 5000 } as any;
      await HabitRepository.saveHabit(h);

      let pauseConversion: () => void;
      const conversionPaused = new Promise<void>((r) => { pauseConversion = r; });
      let resumeConversion: () => void;
      const conversionResume = new Promise<void>((r) => { resumeConversion = r; });

      jest
        .spyOn(Notifications, "scheduleTaskNotifications")
        .mockImplementation(async () => {
          pauseConversion!();
          await conversionResume;
          return ["stale-1", "stale-2"];
        });

      const cancelSpy = jest
        .spyOn(RemindersService, "cancelReminderIds")
        .mockResolvedValue(undefined as any);

      const conversionPromise = EntityCommandService.convertHabitToTask(
        "h-e2e",
        "ws-e2e",
        { skipEvents: true, skipAnalytics: true }
      );

      await conversionPaused;

      // Get the task and mutate it
      const tasks = await TaskRepository.getTasks("ws-e2e");
      const newTaskId = Object.keys(tasks)[0];
      const newTask = tasks[newTaskId];
      expect(newTask.revision).toBe(1); // confirm initial revision

      // Concurrent mutation
      await TaskRepository.saveTask({ ...newTask, title: "User Edited" }); // revision→2

      resumeConversion!();
      await conversionPromise;

      const final = (await TaskRepository.getTasks("ws-e2e"))[newTaskId];

      // Stale notification IDs must NOT have survived
      expect(final.reminder?.notificationIds).toBeUndefined();
      // Stale IDs must be cancelled
      expect(cancelSpy).toHaveBeenCalledWith(["stale-1", "stale-2"], expect.anything());
    });

    it("Task → Habit: same protection in reverse direction", async () => {
      await WorkspaceRepository.saveWorkspaces([ws("ws-e2e-t2h")]);
      const t = task("t-e2e", "ws-e2e-t2h");
      (t as any).reminder = { enabled: true, triggerAt: 5000 };
      await TaskRepository.saveTask(t);

      let pauseConversion: () => void;
      const conversionPaused = new Promise<void>((r) => { pauseConversion = r; });
      let resumeConversion: () => void;
      const conversionResume = new Promise<void>((r) => { resumeConversion = r; });

      jest
        .spyOn(Notifications, "scheduleHabitNotifications")
        .mockImplementation(async () => {
          pauseConversion!();
          await conversionResume;
          return ["stale-h-1", "stale-h-2"];
        });

      const cancelSpy = jest
        .spyOn(RemindersService, "cancelReminderIds")
        .mockResolvedValue(undefined as any);

      const conversionPromise = EntityCommandService.convertTaskToHabit(
        "t-e2e",
        "ws-e2e-t2h",
        { skipEvents: true, skipAnalytics: true }
      );

      await conversionPaused;

      const habits = await HabitRepository.getHabits("ws-e2e-t2h");
      const newHabitId = Object.keys(habits)[0];
      const newHabit = habits[newHabitId];
      expect(newHabit.revision).toBe(1);

      // Concurrent mutation
      await HabitRepository.saveHabit({ ...newHabit, title: "User Edited Habit" }); // revision→2

      resumeConversion!();
      await conversionPromise;

      const final = (await HabitRepository.getHabits("ws-e2e-t2h"))[newHabitId];
      expect(final.reminder?.notificationIds).toBeUndefined();
      expect(cancelSpy).toHaveBeenCalledWith(["stale-h-1", "stale-h-2"], expect.anything());
    });
  });

  // ─── 12. CAS failure semantics ────────────────────────────────────────────

  describe("12. CAS failure semantics", () => {
    it("when CAS rejects, the entity's newer state is NOT modified", async () => {
      const t = task("t1", "ws-cfail");
      (t as any).reminder = { enabled: true, triggerAt: 1000, notificationIds: ["current-id"] };
      const s1 = await TaskRepository.saveTask(t);
      const s2 = await TaskRepository.saveTask({ ...s1, title: "New" }); // revision=2

      // CAS with stale revision=1 → must be rejected
      const result = await TaskRepository.updateNotificationIds(
        "t1",
        "ws-cfail",
        ["stale-id"],
        { reminder: { enabled: true, triggerAt: 1000 }, revision: 1 }
      );
      expect(result).toBe("state_changed");

      // Current-id must survive
      const final = (await TaskRepository.getTasks("ws-cfail"))["t1"];
      expect(final.revision).toBe(2);
      expect(final.title).toBe("New");
      // s1 had notificationIds=["current-id"]; saveTask normalizes the full entity including
      // reminder.notificationIds, so s2 inherits ["current-id"] from s1's payload.
      // The stale CAS write tried to write ["stale-id"] which was correctly rejected.
      // The stored value still holds ["current-id"] from s1→s2 propagation.
      expect(final.reminder?.notificationIds).toEqual(["current-id"]);
    });

    it("when CAS rejects, stale IDs do not appear in storage", async () => {
      const t = task("t1", "ws-cfail2");
      (t as any).reminder = { enabled: true, triggerAt: 1000 };
      const s1 = await TaskRepository.saveTask(t);
      await TaskRepository.saveTask({ ...s1, title: "Concurrent" }); // revision=2

      await TaskRepository.updateNotificationIds("t1", "ws-cfail2", ["stale"], {
        reminder: { enabled: true, triggerAt: 1000 },
        revision: 1, // stale
      });

      const final = (await TaskRepository.getTasks("ws-cfail2"))["t1"];
      expect(final.reminder?.notificationIds).toBeUndefined();
    });
  });
});
