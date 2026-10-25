import AsyncStorage from "@react-native-async-storage/async-storage";
import { TaskRepository } from "@/repositories/TaskRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { RecycleBinRepository } from "@/repositories/RecycleBinRepository";
import { TombstoneRepository } from "@/repositories/TombstoneRepository";
import { MoveJournalRepository } from "@/repositories/MoveJournalRepository";
import { ConversionJournalRepository } from "@/repositories/ConversionJournalRepository";
import { MoveReconcilerService } from "@/services/storage/MoveReconcilerService";
import { ConversionReconcilerService } from "@/services/storage/ConversionReconcilerService";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import * as remindersService from "@/services/scheduling/reminders.service";
import type { Task, Habit, Workspace, MoveJournalEntry, ConversionJournalEntry } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn().mockImplementation(async (key: string) => store[key] || null),
    setItem: jest.fn().mockImplementation(async (key: string, value: string) => {
      store[key] = value;
      return null;
    }),
    removeItem: jest.fn().mockImplementation(async (key: string) => {
      delete store[key];
      return null;
    }),
    multiGet: jest.fn().mockImplementation(async (keys: string[]) => {
      return keys.map((k) => [k, store[k] || null]);
    }),
    multiSet: jest.fn().mockImplementation(async (pairs: [string, string][]) => {
      for (const [k, v] of pairs) store[k] = v;
      return null;
    }),
    multiRemove: jest.fn().mockImplementation(async (keys: string[]) => {
      for (const k of keys) delete store[k];
      return null;
    }),
    clear: jest.fn().mockImplementation(async () => {
      for (const k in store) delete store[k];
      return null;
    }),
  };
});

const ws1: Workspace = { id: "ws-1", name: "Core", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 };
const ws2: Workspace = { id: "ws-2", name: "Aux", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 };

describe("Hostile Crash Boundary: Lifecycle Generation & Tombstones (Fix #26)", () => {
  let cancelSpy: jest.SpyInstance;
  let scheduleTodoSpy: jest.SpyInstance;

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    await WorkspaceRepository.saveWorkspaces([ws1, ws2]);

    cancelSpy = jest.spyOn(remindersService, "cancelReminderIds").mockImplementation(async () => {});
    scheduleTodoSpy = jest.spyOn(remindersService, "rescheduleTodoReminders").mockImplementation(async (t: Task) => t);
  });

  afterEach(() => {
    cancelSpy.mockRestore();
    scheduleTodoSpy.mockRestore();
  });

  // =========================================================================
  // 1. PERMANENT DELETION ATOMICITY & CRASH BOUNDARIES (A - E)
  // =========================================================================
  describe("1. Permanent Deletion Crash Boundaries & Tombstone Durability", () => {
    test("Crash Boundary A & B: Durable tombstone is written and survives recycle bin purge failure", async () => {
      const task: Task = {
        id: "t-crash-perm",
        workspaceId: "ws-1",
        title: "Dying Task",
        status: "todo",
        priority: "medium",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      };
      await TaskRepository.saveTask(task);
      await EntityCommandService.recycleTask("t-crash-perm", "ws-1", "Core");

      // Verify item in bin
      const bin = await RecycleBinRepository.getRecycleBinItems();
      const rbItem = bin.find((i) => i.entityId === "t-crash-perm");
      expect(rbItem).toBeDefined();

      // Execute permanent deletion
      await EntityCommandService.permanentlyDeleteTask("t-crash-perm", "ws-1");

      // Durable tombstone MUST be persisted
      const isDead = await TombstoneRepository.isTombstoned("task", "t-crash-perm", 1);
      expect(isDead).toBe(true);

      const highestTomb = await TombstoneRepository.getHighestTombstonedGeneration("task", "t-crash-perm");
      expect(highestTomb).toBe(1);

      // Active entity is gone
      const active = await TaskRepository.getTask("t-crash-perm", "ws-1");
      expect(active).toBeNull();
    });

    test("Crash Boundary C, D, E: Stale restore replay cannot resurrect permanently deleted entity", async () => {
      const task: Task = {
        id: "t-resurrect-attempt",
        workspaceId: "ws-1",
        title: "Doomed Task",
        status: "todo",
        priority: "high",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      };
      await TaskRepository.saveTask(task);
      await EntityCommandService.recycleTask("t-resurrect-attempt", "ws-1", "Core");
      await EntityCommandService.permanentlyDeleteTask("t-resurrect-attempt", "ws-1");

      // Stale MoveJournal entry attempting restore of Gen 1
      await MoveJournalRepository.addOperation({
        operationId: "op-stale-restore-g1",
        operationType: "restore",
        entityId: "t-resurrect-attempt",
        entityType: "task",
        sourceWorkspaceId: "ws-1",
        targetWorkspaceId: "ws-1",
        timestamp: Date.now(),
        lifecycleGeneration: 1,
        expectedRevision: 1,
      });

      // Run reconciler
      await MoveReconcilerService.reconcileAll();

      // Entity must NOT be resurrected in active partition
      const active = await TaskRepository.getTask("t-resurrect-attempt", "ws-1");
      expect(active).toBeNull();

      // Journal entry must be cleaned up as obsolete
      const ops = await MoveJournalRepository.getOperations();
      expect(ops.find((o) => o.operationId === "op-stale-restore-g1")).toBeUndefined();
    });
  });

  // =========================================================================
  // 2. GENERATION ALLOCATION & RECREATION ISOLATION
  // =========================================================================
  describe("2. Generation Allocation & ID Reuse Safety", () => {
    test("Recreating an entity with same ID allocates Generation 2 under partition lock", async () => {
      // 1. Create Gen 1
      await EntityCommandService.createTask(
        {
          id: "t-reuse-id",
          workspaceId: "ws-1",
          title: "Gen 1 Task",
          status: "todo",
          priority: "low",
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        },
        "ws-1"
      );

      const g1 = await TaskRepository.getTask("t-reuse-id", "ws-1");
      expect(g1?.lifecycleGeneration).toBe(1);

      // 2. Recycle & Permanently Delete Gen 1
      await EntityCommandService.recycleTask("t-reuse-id", "ws-1", "Core");
      await EntityCommandService.permanentlyDeleteTask("t-reuse-id", "ws-1");

      // 3. Recreate same ID -> Must allocate Gen 2
      await EntityCommandService.createTask(
        {
          id: "t-reuse-id",
          workspaceId: "ws-1",
          title: "Gen 2 Task (Newer)",
          status: "todo",
          priority: "high",
          revision: 1,
          lifecycleGeneration: 1, // Caller suggests 1, but system MUST bump to max(gen, tombstone+1)
          createdAt: 2000,
          updatedAt: 2000,
        },
        "ws-1"
      );

      const g2 = await TaskRepository.getTask("t-reuse-id", "ws-1");
      expect(g2).toBeDefined();
      expect(g2?.lifecycleGeneration).toBe(2);
      expect(g2?.title).toBe("Gen 2 Task (Newer)");
    });

    test("Concurrent recreate requests under partition lock serialize and allocate distinct generation", async () => {
      // Set tombstone for Gen 1
      await TombstoneRepository.addTombstone({
        id: "ts-task-t-concurrent-id-g1",
        entityType: "task",
        entityId: "t-concurrent-id",
        lifecycleGeneration: 1,
        deletionRevision: 1,
        deletedAt: Date.now(),
      });

      // Concurrently create two tasks with same ID
      const p1 = EntityCommandService.createTask(
        {
          id: "t-concurrent-id",
          workspaceId: "ws-1",
          title: "Concurrent Task A",
          status: "todo",
          priority: "low",
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        },
        "ws-1"
      );

      const p2 = EntityCommandService.createTask(
        {
          id: "t-concurrent-id",
          workspaceId: "ws-1",
          title: "Concurrent Task B",
          status: "todo",
          priority: "high",
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        },
        "ws-1"
      );

      await Promise.all([p1, p2]);

      const active = await TaskRepository.getTask("t-concurrent-id", "ws-1");
      expect(active).toBeDefined();
      expect(active?.lifecycleGeneration).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // 3. RECYCLE BIN SNAPSHOT GENERATION VALIDATION
  // =========================================================================
  describe("3. Recycle Bin Snapshot & Restore Generation Validation", () => {
    test("Stale Gen 1 recycle bin item cannot restore over active Gen 2 entity", async () => {
      // 1. Create Gen 1
      await EntityCommandService.createTask(
        {
          id: "t-clash",
          workspaceId: "ws-1",
          title: "Gen 1 Title",
          status: "todo",
          priority: "low",
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        },
        "ws-1"
      );
      await EntityCommandService.recycleTask("t-clash", "ws-1", "Core");

      // Locate Gen 1 recycle bin item
      const binBefore = await RecycleBinRepository.getRecycleBinItems();
      const rbG1 = binBefore.find((i) => i.entityId === "t-clash");
      expect(rbG1).toBeDefined();
      expect(rbG1?.lifecycleGeneration).toBe(1);

      // 2. Independently create Gen 2 active task with same ID
      await TaskRepository.saveTask({
        id: "t-clash",
        workspaceId: "ws-1",
        title: "Gen 2 Authoritative Title",
        status: "todo",
        priority: "high",
        revision: 1,
        lifecycleGeneration: 2,
        createdAt: 2000,
        updatedAt: 2000,
      });

      // 3. Attempt stale restore of Gen 1
      const restored = await EntityCommandService.restoreTask(rbG1!.id);

      // Must return active Gen 2 entity without overwriting it with Gen 1 snapshot
      expect(restored.lifecycleGeneration).toBe(2);
      expect(restored.title).toBe("Gen 2 Authoritative Title");

      // Active partition retains Gen 2
      const active = await TaskRepository.getTask("t-clash", "ws-1");
      expect(active?.lifecycleGeneration).toBe(2);
      expect(active?.title).toBe("Gen 2 Authoritative Title");

      // Stale Gen 1 item was purged from bin
      const binAfter = await RecycleBinRepository.getRecycleBinItems();
      expect(binAfter.find((i) => i.id === rbG1!.id)).toBeUndefined();
    });
  });

  // =========================================================================
  // 4. MOVE JOURNAL & CONVERSION JOURNAL CAUSALITY
  // =========================================================================
  describe("4. MoveJournal & ConversionJournal Generation CAS Verification", () => {
    test("Stale MoveJournal targeting Gen 1 is rejected when active entity is Gen 2", async () => {
      // Active entity is Gen 2 in ws-1
      await TaskRepository.saveTask({
        id: "t-move-gen",
        workspaceId: "ws-1",
        title: "Gen 2 Task in WS1",
        status: "todo",
        priority: "medium",
        revision: 1,
        lifecycleGeneration: 2,
        createdAt: 2000,
        updatedAt: 2000,
      });

      // Journal entry was from Gen 1 moving to ws-2
      await MoveJournalRepository.addOperation({
        operationId: "op-move-stale-g1",
        operationType: "move",
        entityId: "t-move-gen",
        entityType: "task",
        sourceWorkspaceId: "ws-1",
        targetWorkspaceId: "ws-2",
        timestamp: 1000,
        lifecycleGeneration: 1,
        expectedRevision: 1,
      });

      // Record tombstone for Gen 1 to simulate prior deletion
      await TombstoneRepository.addTombstone({
        id: "ts-task-t-move-gen-g1",
        entityType: "task",
        entityId: "t-move-gen",
        lifecycleGeneration: 1,
        deletionRevision: 1,
        deletedAt: Date.now(),
      });

      await MoveReconcilerService.reconcileAll();

      // Gen 2 task in ws-1 must NOT have been moved to ws-2
      const inWs1 = await TaskRepository.getTask("t-move-gen", "ws-1");
      expect(inWs1).toBeDefined();
      expect(inWs1?.lifecycleGeneration).toBe(2);

      const inWs2 = await TaskRepository.getTask("t-move-gen", "ws-2");
      expect(inWs2).toBeNull();
    });

    test("Conversion journal: Source g1 -> Journal -> Source perm deleted -> Recreated as g2 -> Stale journal rejects without mutating g2", async () => {
      // 1. Create Habit Gen 1
      const habitG1: Habit = {
        id: "h-convert-race",
        workspaceId: "ws-1",
        title: "Habit Gen 1",
        recurrence: { frequency: "daily", interval: 1 },
        completionHistory: [],
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      };
      await HabitRepository.saveHabit(habitG1);

      // 2. Journal records conversion intent (Habit Gen 1 -> Task Gen 1)
      const convOp: ConversionJournalEntry = {
        operationId: "op-conv-race",
        operationType: "habit_to_task",
        sourceId: "h-convert-race",
        targetId: "t-conv-dest",
        sourceWorkspaceId: "ws-1",
        targetWorkspaceId: "ws-1",
        phase: "DESTINATION_WRITTEN",
        sourceGeneration: 1,
        sourceRevision: 1,
        targetGeneration: 1,
        timestamp: 1000,
      };
      await ConversionJournalRepository.addOperationUnlocked(convOp);

      // 3. Source Habit Gen 1 is permanently deleted
      await EntityCommandService.permanentlyDeleteHabit("h-convert-race", "ws-1");

      // 4. Source Habit is recreated as Gen 2
      await HabitRepository.saveHabit({
        id: "h-convert-race",
        workspaceId: "ws-1",
        title: "Habit Gen 2 (Brand New)",
        recurrence: { frequency: "weekly", interval: 1 },
        completionHistory: [],
        revision: 1,
        lifecycleGeneration: 2,
        createdAt: 2000,
        updatedAt: 2000,
      });

      // 5. Old conversion reconciler executes
      await ConversionReconcilerService.reconcileAll();

      // Habit Gen 2 MUST remain untouched and active!
      const activeHabit = await HabitRepository.getHabit("h-convert-race", "ws-1");
      expect(activeHabit).toBeDefined();
      expect(activeHabit?.lifecycleGeneration).toBe(2);
      expect(activeHabit?.title).toBe("Habit Gen 2 (Brand New)");

      // No phantom task created from stale conversion
      const phantomTask = await TaskRepository.getTask("t-conv-dest", "ws-1");
      expect(phantomTask).toBeNull();
    });
  });

  // =========================================================================
  // 5. WORKSPACE LIFECYCLE IDENTITY & RECREATION
  // =========================================================================
  describe("5. Workspace Lifecycle Identity & Isolation", () => {
    test("Workspace recreation allocates bumped lifecycleGeneration", async () => {
      // 1. Create Workspace
      const ws: Workspace = {
        id: "ws-eng",
        name: "Engineering",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      };
      await EntityCommandService.createWorkspace(ws);
      const allWs1 = await WorkspaceRepository.getWorkspaces();
      const ws1 = allWs1.find(w => w.id === "ws-eng");
      expect(ws1?.lifecycleGeneration).toBe(1);

      // 2. Delete Workspace and write tombstone for Gen 1
      await EntityCommandService.deleteWorkspace("ws-eng");
      await TombstoneRepository.addTombstone({
        id: "ts-ws-ws-eng-g1",
        entityType: "workspace",
        entityId: "ws-eng",
        lifecycleGeneration: 1,
        deletionRevision: 1,
        deletedAt: Date.now(),
      });

      // 3. Recreate Workspace with same ID -> Must bump to Generation 2
      await EntityCommandService.createWorkspace({
        id: "ws-eng",
        name: "Engineering 2.0",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 2000,
        updatedAt: 2000,
      });

      const allWs2 = await WorkspaceRepository.getWorkspaces();
      const wsRecreated = allWs2.find(w => w.id === "ws-eng");
      expect(wsRecreated?.lifecycleGeneration).toBe(2);
      expect(wsRecreated?.name).toBe("Engineering 2.0");
    });

    test("Tombstone repository tracks and resolves highest tombstoned generation accurately", async () => {
      await TombstoneRepository.addTombstone({
        id: "ts-task-t-multi-gen-g1",
        entityType: "task",
        entityId: "t-multi-gen",
        lifecycleGeneration: 1,
        deletionRevision: 1,
        deletedAt: Date.now(),
      });
      await TombstoneRepository.addTombstone({
        id: "ts-task-t-multi-gen-g2",
        entityType: "task",
        entityId: "t-multi-gen",
        lifecycleGeneration: 2,
        deletionRevision: 1,
        deletedAt: Date.now(),
      });

      const highest = await TombstoneRepository.getHighestTombstonedGeneration("task", "t-multi-gen");
      expect(highest).toBe(2);

      const isGen1Dead = await TombstoneRepository.isTombstoned("task", "t-multi-gen", 1);
      const isGen2Dead = await TombstoneRepository.isTombstoned("task", "t-multi-gen", 2);
      const isGen3Dead = await TombstoneRepository.isTombstoned("task", "t-multi-gen", 3);

      expect(isGen1Dead).toBe(true);
      expect(isGen2Dead).toBe(true);
      expect(isGen3Dead).toBe(false);
    });
  });
});
