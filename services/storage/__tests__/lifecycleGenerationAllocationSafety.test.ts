const store: Record<string, string> = {};

jest.mock("@react-native-async-storage/async-storage", () => {
  return {
    __store: store,
    getItem: jest.fn().mockImplementation(async (key: string) => store[key] || null),
    setItem: jest.fn().mockImplementation(async (key: string, value: any) => {
      store[key] = String(value);
      return null;
    }),
    removeItem: jest.fn().mockImplementation(async (key: string) => {
      delete store[key];
      return null;
    }),
    getAllKeys: jest.fn().mockImplementation(async () => Object.keys(store)),
    multiGet: jest.fn().mockImplementation(async (keys: string[]) => {
      return keys.map((k) => [k, store[k] || null]);
    }),
    multiSet: jest.fn().mockImplementation(async (pairs: [string, string][]) => {
      for (const [k, v] of pairs) store[k] = String(v);
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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { TaskRepository } from "@/repositories/TaskRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { ChecklistRepository } from "@/repositories/ChecklistRepository";
import { ResourceRepository } from "@/repositories/ResourceRepository";
import { RecycleBinRepository } from "@/repositories/RecycleBinRepository";
import { TombstoneRepository } from "@/repositories/TombstoneRepository";
import { MoveJournalRepository } from "@/repositories/MoveJournalRepository";
import { ConversionJournalRepository } from "@/repositories/ConversionJournalRepository";
import { MoveReconcilerService } from "@/services/storage/MoveReconcilerService";
import { ConversionReconcilerService } from "@/services/storage/ConversionReconcilerService";
import { Task, Habit, Checklist, Resource } from "@/shared/types/domain.types";

describe("FIX #22 — Lifecycle Generation Allocation & Explicit-ID Resurrection Safety", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: any) => {
      store[key] = String(value);
      return null;
    });
    (AsyncStorage.multiSet as jest.Mock).mockImplementation(async (pairs: [string, string][]) => {
      for (const [k, v] of pairs) store[k] = String(v);
      return null;
    });
    await AsyncStorage.clear();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 1: Normal create starts at the expected generation (1)
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 1: Normal create starts at initial generation (1)", async () => {
    const task = await EntityCommandService.createTask(
      { title: "Initial Task" } as any,
      "ws-1"
    );
    expect(task.lifecycleGeneration).toBe(1);
    expect(task.revision).toBe(1);

    const habit = await EntityCommandService.createHabit(
      { title: "Initial Habit", recurrence: { frequency: "daily", interval: 1 } } as any,
      "ws-1"
    );
    expect(habit.lifecycleGeneration).toBe(1);

    const checklist = await EntityCommandService.createChecklist(
      { title: "Initial Checklist", items: [] } as any,
      "ws-1"
    );
    expect(checklist.lifecycleGeneration).toBe(1);

    const resource = await EntityCommandService.createResource(
      { title: "Initial Resource", type: "note", content: "Note" } as any,
      "ws-1"
    );
    expect(resource.lifecycleGeneration).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 2: After G1 is tombstoned, recreation becomes G2
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 2: After G1 is tombstoned, recreation of same ID becomes G2", async () => {
    const task = await EntityCommandService.createTask(
      { title: "Task 1" } as any,
      "ws-1",
      { explicitId: "task-reuse-1" }
    );
    expect(task.lifecycleGeneration).toBe(1);

    // Permanently delete G1
    await EntityCommandService.permanentlyDeleteTask("task-reuse-1", "ws-1");
    expect(await TombstoneRepository.isTombstoned("task", "task-reuse-1", 1)).toBe(true);

    // Recreate with same ID
    const taskG2 = await EntityCommandService.createTask(
      { title: "Task 1 Reborn" } as any,
      "ws-1",
      { explicitId: "task-reuse-1" }
    );
    expect(taskG2.id).toBe("task-reuse-1");
    expect(taskG2.lifecycleGeneration).toBe(2);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 3: Explicit-ID creation cannot resurrect G1
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 3: Hostile caller providing { explicitId, lifecycleGeneration: 1 } cannot bypass tombstone", async () => {
    // Record tombstone for G1 and G2
    await TombstoneRepository.addTombstone({
      id: "ts-task-g1",
      entityType: "task",
      entityId: "task-hostile",
      lifecycleGeneration: 1,
      deletionRevision: 1,
      deletedAt: Date.now(),
    });
    await TombstoneRepository.addTombstone({
      id: "ts-task-g2",
      entityType: "task",
      entityId: "task-hostile",
      lifecycleGeneration: 2,
      deletionRevision: 1,
      deletedAt: Date.now(),
    });

    // Caller explicitly attempts to force G1
    const created = await EntityCommandService.createTask(
      {
        id: "task-hostile",
        title: "Hostile G1 task",
        lifecycleGeneration: 1,
        revision: 1,
      } as any,
      "ws-1",
      { explicitId: "task-hostile" }
    );

    // System must override caller and allocate highestTombstone + 1 = 3
    expect(created.id).toBe("task-hostile");
    expect(created.lifecycleGeneration).toBe(3);
    expect(await TombstoneRepository.isTombstoned("task", "task-hostile", 3)).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 4: Stale recycle-bin restore of G1 is rejected after permanent deletion
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 4: Stale recycle-bin restore of G1 is rejected after permanent deletion", async () => {
    await TombstoneRepository.addTombstone({
      id: "ts-task-g1",
      entityType: "task",
      entityId: "task-stale-rb",
      lifecycleGeneration: 1,
      deletionRevision: 1,
      deletedAt: Date.now(),
    });

    await RecycleBinRepository.addToRecycleBin(
      "task",
      {
        id: "task-stale-rb",
        title: "Stale Task in Bin",
        status: "todo",
        priority: "none",
        workspaceId: "ws-1",
        lifecycleGeneration: 1,
        revision: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      "ws-1"
    );

    await expect(
      EntityCommandService.restoreTask("rb-task-stale-rb")
    ).rejects.toThrow("permanently deleted");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 5: Stale conversion/copy/duplicate of G1 cannot resurrect G1
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 5: Stale conversion of a tombstoned generation is rejected", async () => {
    // Put a dead ghost habit in active store
    const deadHabit: Habit = {
      id: "habit-dead",
      title: "Dead Habit",
      workspaceId: "ws-1",
      lifecycleGeneration: 1,
      revision: 1,
      recurrence: { frequency: "daily", interval: 1 },
      completionHistory: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await HabitRepository.saveHabit(deadHabit);

    await TombstoneRepository.addTombstone({
      id: "ts-h-dead",
      entityType: "habit",
      entityId: "habit-dead",
      lifecycleGeneration: 1,
      deletionRevision: 1,
      deletedAt: Date.now(),
    });

    await expect(
      EntityCommandService.convertHabitToTask("habit-dead", "ws-1")
    ).rejects.toThrow("permanently deleted");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 6: Legitimate G2 creation with the same entity ID succeeds
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 6: Legitimate G2 creation with the same entity ID succeeds completely", async () => {
    await TombstoneRepository.addTombstone({
      id: "ts-task-legit",
      entityType: "task",
      entityId: "task-legit",
      lifecycleGeneration: 1,
      deletionRevision: 1,
      deletedAt: Date.now(),
    });

    const g2 = await EntityCommandService.createTask(
      { title: "Legit G2 Task" } as any,
      "ws-1",
      { explicitId: "task-legit" }
    );
    expect(g2.id).toBe("task-legit");
    expect(g2.lifecycleGeneration).toBe(2);

    const fetched = await TaskRepository.getTask("task-legit", "ws-1");
    expect(fetched?.lifecycleGeneration).toBe(2);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 7: G2 is not considered tombstoned because G1 is tombstoned
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 7: G2 is not considered tombstoned because G1 is tombstoned", async () => {
    await TombstoneRepository.addTombstone({
      id: "ts-task-g1",
      entityType: "task",
      entityId: "task-iso",
      lifecycleGeneration: 1,
      deletionRevision: 1,
      deletedAt: Date.now(),
    });

    expect(await TombstoneRepository.isTombstoned("task", "task-iso", 1)).toBe(true);
    expect(await TombstoneRepository.isTombstoned("task", "task-iso", 2)).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 8: Concurrent same-ID creation cannot produce conflicting generations
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 8: Concurrent same-ID creations serialize and allocate distinct generations", async () => {
    // Starting with Gen 1 tombstoned
    await TombstoneRepository.addTombstone({
      id: "ts-task-g1",
      entityType: "task",
      entityId: "task-concurrent",
      lifecycleGeneration: 1,
      deletionRevision: 1,
      deletedAt: Date.now(),
    });

    // Run 2 creates concurrently for the same explicit ID
    const [c1, c2] = await Promise.all([
      EntityCommandService.createTask({ title: "Concurrent 1" } as any, "ws-1", { explicitId: "task-concurrent" }),
      EntityCommandService.createTask({ title: "Concurrent 2" } as any, "ws-1", { explicitId: "task-concurrent" }),
    ]);

    // One must be Gen 2, the other Gen 3
    const gens = [c1.lifecycleGeneration, c2.lifecycleGeneration].sort((a, b) => a - b);
    expect(gens).toEqual([2, 3]);

    const active = await TaskRepository.getTask("task-concurrent", "ws-1");
    expect(active?.lifecycleGeneration).toBe(3);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 9: A stale G1 update cannot mutate G2
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 9: A stale G1 update cannot mutate G2", async () => {
    // Create G2
    await TombstoneRepository.addTombstone({
      id: "ts-task-g1",
      entityType: "task",
      entityId: "task-stale-update",
      lifecycleGeneration: 1,
      deletionRevision: 1,
      deletedAt: Date.now(),
    });

    const g2 = await EntityCommandService.createTask(
      { title: "Task G2" } as any,
      "ws-1",
      { explicitId: "task-stale-update" }
    );
    expect(g2.lifecycleGeneration).toBe(2);

    // Stale update specifying G1 is rejected
    await expect(
      EntityCommandService.updateTask(
        "task-stale-update",
        "ws-1",
        { title: "Stale Mutate" },
        { expectedGeneration: 1 }
      )
    ).rejects.toThrow();

    // Verify G2 was untouched
    const active = await TaskRepository.getTask("task-stale-update", "ws-1");
    expect(active?.title).toBe("Task G2");
    expect(active?.lifecycleGeneration).toBe(2);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 10: A stale G1 delete cannot delete G2
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 10: A stale G1 recycle/delete cannot delete G2", async () => {
    await TombstoneRepository.addTombstone({
      id: "ts-task-g1",
      entityType: "task",
      entityId: "task-stale-delete",
      lifecycleGeneration: 1,
      deletionRevision: 1,
      deletedAt: Date.now(),
    });

    const g2 = await EntityCommandService.createTask(
      { title: "Task G2 Live" } as any,
      "ws-1",
      { explicitId: "task-stale-delete" }
    );
    expect(g2.lifecycleGeneration).toBe(2);

    // Stale recycle specifying G1 is rejected
    await expect(
      EntityCommandService.recycleTask("task-stale-delete", "ws-1", "Inbox", { expectedGeneration: 1 })
    ).rejects.toThrow();

    const active = await TaskRepository.getTask("task-stale-delete", "ws-1");
    expect(active).not.toBeNull();
    expect(active?.lifecycleGeneration).toBe(2);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 11: Multi-entity parity audit
  // ─────────────────────────────────────────────────────────────────────────────
  describe("TEST 11: Multi-entity parity audit", () => {
    it("11a: Habit generation allocation and tombstone barrier", async () => {
      await TombstoneRepository.addTombstone({
        id: "ts-h-1",
        entityType: "habit",
        entityId: "h-multi",
        lifecycleGeneration: 1,
        deletionRevision: 1,
        deletedAt: Date.now(),
      });

      const h2 = await EntityCommandService.createHabit(
        { title: "Habit G2", recurrence: { frequency: "daily", interval: 1 } } as any,
        "ws-1",
        { explicitId: "h-multi" }
      );
      expect(h2.lifecycleGeneration).toBe(2);
    });

    it("11b: Checklist generation allocation and tombstone barrier", async () => {
      await TombstoneRepository.addTombstone({
        id: "ts-c-1",
        entityType: "checklist",
        entityId: "c-multi",
        lifecycleGeneration: 1,
        deletionRevision: 1,
        deletedAt: Date.now(),
      });

      const c2 = await EntityCommandService.createChecklist(
        { title: "Checklist G2", items: [] } as any,
        "ws-1",
        { explicitId: "c-multi" }
      );
      expect(c2.lifecycleGeneration).toBe(2);
    });

    it("11c: Resource generation allocation and tombstone barrier", async () => {
      await TombstoneRepository.addTombstone({
        id: "ts-r-1",
        entityType: "resource",
        entityId: "r-multi",
        lifecycleGeneration: 1,
        deletionRevision: 1,
        deletedAt: Date.now(),
      });

      const r2 = await EntityCommandService.createResource(
        { title: "Resource G2", type: "note", content: "Note" } as any,
        "ws-1",
        { explicitId: "r-multi" }
      );
      expect(r2.lifecycleGeneration).toBe(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 12: Backup/restore preserves tombstone barrier
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 12: Backup restore cannot bypass generation allocation", async () => {
    const { BackupService } = await import("@/services/storage/backup.service");
    const { WorkspaceRepository } = await import("@/repositories/WorkspaceRepository");
    await WorkspaceRepository.saveWorkspace({
      id: "ws-1",
      name: "Workspace 1",
      order: 1,
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const task = await EntityCommandService.createTask({ title: "Backup Task" } as any, "ws-1", { explicitId: "t-bk" });
    expect(task.lifecycleGeneration).toBe(1);

    const backupJson = await BackupService.generateStructuredBackup();
    await BackupService.restoreStructuredBackup(backupJson);

    const restored = await TaskRepository.getTask("t-bk", "ws-1");
    expect(restored?.lifecycleGeneration).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 13: Move/Reconciler & Conversion/Reconciler paths reject tombstoned generation
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 13: MoveReconciler and ConversionReconciler drop tombstoned operations as OBSOLETE", async () => {
    // 1. Staged Move operation for a tombstoned task
    await TombstoneRepository.addTombstone({
      id: "ts-m-dead",
      entityType: "task",
      entityId: "t-move-dead",
      lifecycleGeneration: 1,
      deletionRevision: 1,
      deletedAt: Date.now(),
    });

    await MoveJournalRepository.addOperation({
      operationId: "op-move-dead",
      operationType: "move",
      entityId: "t-move-dead",
      entityType: "task",
      sourceWorkspaceId: "ws-1",
      targetWorkspaceId: "ws-2",
      timestamp: Date.now(),
      lifecycleGeneration: 1,
      expectedRevision: 1,
    });

    await MoveReconcilerService.reconcileAll();
    const pendingMoves = await MoveJournalRepository.getOperations();
    expect(pendingMoves.find((op) => op.operationId === "op-move-dead")).toBeUndefined();

    // 2. Staged Conversion operation for a tombstoned habit
    await TombstoneRepository.addTombstone({
      id: "ts-c-dead",
      entityType: "habit",
      entityId: "h-conv-dead",
      lifecycleGeneration: 1,
      deletionRevision: 1,
      deletedAt: Date.now(),
    });

    await ConversionJournalRepository.addOperationUnlocked({
      operationId: "op-conv-dead",
      operationType: "habit_to_task",
      sourceId: "h-conv-dead",
      sourceWorkspaceId: "ws-1",
      targetId: "t-conv-new",
      targetWorkspaceId: "ws-1",
      phase: "PREPARED",
      timestamp: Date.now(),
      sourceGeneration: 1,
      targetGeneration: 1,
      sourceRevision: 1,
    });

    await ConversionReconcilerService.reconcileAll();
    const pendingConvs = await ConversionJournalRepository.getOperations();
    expect(pendingConvs.find((op) => op.operationId === "op-conv-dead")).toBeUndefined();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 14: Detached recurring occurrences start at initial generation (1)
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 14: Detached recurring occurrence creation initializes at Gen 1, Rev 1", async () => {
    // Create recurring master task with lifecycleGeneration: 3
    const master: Task = {
      id: "master-task-rec",
      title: "Recurring Master",
      status: "todo",
      priority: "none",
      workspaceId: "ws-1",
      lifecycleGeneration: 3,
      revision: 4,
      recurrence: { frequency: "daily", interval: 1 },
      recurrenceExceptions: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await TaskRepository.saveTask(master);

    const { occurrenceTask } = await EntityCommandService.rescheduleRecurringOccurrence(
      "master-task-rec",
      "ws-1",
      "2026-08-30",
      { date: "2026-08-31" }
    );

    expect(occurrenceTask.id).not.toBe("master-task-rec");
    expect(occurrenceTask.lifecycleGeneration).toBe(1);
    expect(occurrenceTask.revision).toBe(1);
    expect(occurrenceTask.recurrence).toBeUndefined();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 15: Failure during persistence leaves no ghost generation
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 15: Failure during creation persistence does not create alive entity without storage", async () => {
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: any) => {
      if (key === "pebble:v1:tasks:ws-1") {
        throw new Error("Disk write error during task creation");
      }
      store[key] = String(value);
      return null;
    });

    await expect(
      EntityCommandService.createTask({ title: "Failed Task" } as any, "ws-1", { explicitId: "t-fail" })
    ).rejects.toThrow("Disk write error during task creation");

    const fetched = await TaskRepository.getTask("t-fail", "ws-1");
    expect(fetched).toBeNull();
  });
});
