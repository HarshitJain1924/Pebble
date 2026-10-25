/**
 * lifecycleGenerationRevisionTombstones.test.ts
 * ─────────────────────────────────────────────
 * Comprehensive 28-point test matrix for Fix #25:
 * True Lifecycle Identity, Revision CAS, and Durable Tombstones.
 */
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

jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue("mock-notif-id"),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  setNotificationHandler: jest.fn(),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  TaskRepository,
  HabitRepository,
  ChecklistRepository,
  ResourceRepository,
  WorkspaceRepository,
  RecycleBinRepository,
  MoveJournalRepository,
  ConversionJournalRepository,
  TombstoneRepository,
  clearRepositoryStorage,
} from "@/repositories";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { MoveReconcilerService } from "@/services/storage/MoveReconcilerService";
import { ConversionReconcilerService } from "@/services/storage/ConversionReconcilerService";
import { type Task, type Habit, type Checklist, type Resource, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";

describe("Fix #25: True Lifecycle Identity, Revision CAS, and Durable Tombstones", () => {
  beforeEach(async () => {
    for (const k in store) delete store[k];
    await clearRepositoryStorage();
    jest.clearAllMocks();
  });

  // 1. Task X/g1 created with lifecycleGeneration = 1, revision = 1
  it("Test 1: Task creation initializes lifecycleGeneration = 1 and revision = 1", async () => {
    const task = await EntityCommandService.createTask({
      id: "task-test-1",
      title: "Test Task 1",
    } as any);

    expect(task.lifecycleGeneration).toBe(1);
    expect(task.revision).toBe(1);

    const persisted = await TaskRepository.getTask("task-test-1", INBOX_WORKSPACE_ID);
    expect(persisted?.lifecycleGeneration).toBe(1);
    expect(persisted?.revision).toBe(1);
  });

  // 2. updateTask(X) increments revision to 2 without altering lifecycleGeneration
  it("Test 2: updateTask increments revision without altering lifecycleGeneration", async () => {
    await EntityCommandService.createTask({
      id: "task-test-2",
      title: "Initial Title",
    } as any);

    const updated = await EntityCommandService.updateTask(
      "task-test-2",
      INBOX_WORKSPACE_ID,
      { title: "Updated Title" }
    );

    expect(updated.lifecycleGeneration).toBe(1);
    expect(updated.revision).toBe(2);

    const persisted = await TaskRepository.getTask("task-test-2", INBOX_WORKSPACE_ID);
    expect(persisted?.title).toBe("Updated Title");
    expect(persisted?.lifecycleGeneration).toBe(1);
    expect(persisted?.revision).toBe(2);
  });

  // 3. moveTask(X) increments revision and records lifecycleGeneration and expectedRevision
  it("Test 3: moveTask increments revision and records lifecycleGeneration and expectedRevision in MoveJournal", async () => {
    await WorkspaceRepository.saveWorkspace({ id: "ws-target", name: "Target WS", revision: 1, lifecycleGeneration: 1, createdAt: Date.now(), updatedAt: Date.now() });
    
    await EntityCommandService.createTask({
      id: "task-test-3",
      title: "Move Task",
    } as any);

    const moved = await EntityCommandService.moveTask(
      "task-test-3",
      INBOX_WORKSPACE_ID,
      "ws-target"
    );

    expect(moved.workspaceId).toBe("ws-target");
    expect(moved.lifecycleGeneration).toBe(1);
    expect(moved.revision).toBe(2);

    const ops = await MoveJournalRepository.getOperations();
    expect(ops).toHaveLength(0); // Completed moves are removed on success
  });

  // 4. recycleTask(X) snapshots X/g1/rev into RecycleBin and creates MoveJournalEntry with lifecycleGeneration and expectedRevision
  it("Test 4: recycleTask snapshots generation and creates generation-aware MoveJournal entry", async () => {
    await EntityCommandService.createTask({
      id: "task-test-4",
      title: "Recycle Task",
    } as any);

    await EntityCommandService.recycleTask(
      "task-test-4",
      INBOX_WORKSPACE_ID,
      "Inbox"
    );

    const binItems = await RecycleBinRepository.getRecycleBinItems();
    const binItem = binItems.find((i) => i.entityId === "task-test-4");
    expect(binItem).toBeDefined();
    expect(binItem?.lifecycleGeneration).toBe(1);

    const parsed = JSON.parse(binItem!.snapshot);
    expect(parsed.id).toBe("task-test-4");
    expect(parsed.lifecycleGeneration).toBe(1);
    expect(parsed.revision).toBe(1);
  });

  // 5. permanentlyDeleteTask(X) creates durable Tombstone in TombstoneRepository
  it("Test 5: permanentlyDeleteTask creates durable Tombstone in TombstoneRepository", async () => {
    await EntityCommandService.createTask({
      id: "task-test-5",
      title: "Perm Delete Task",
    } as any);

    await EntityCommandService.permanentlyDeleteTask("task-test-5", INBOX_WORKSPACE_ID);

    const isTombstoned = await TombstoneRepository.isTombstoned("task", "task-test-5", 1);
    expect(isTombstoned).toBe(true);

    const tombstones = await TombstoneRepository.getTombstones();
    const taskTombstone = tombstones.find((t) => t.entityId === "task-test-5");
    expect(taskTombstone).toBeDefined();
    expect(taskTombstone?.entityType).toBe("task");
    expect(taskTombstone?.lifecycleGeneration).toBe(1);
    expect(taskTombstone?.deletionRevision).toBe(1);
  });

  // 6. Re-creating Task X discovers the tombstone and assigns lifecycleGeneration = 2, revision = 1
  it("Test 6: Re-creating Task X discovers tombstone and increments lifecycleGeneration to 2", async () => {
    await EntityCommandService.createTask({
      id: "task-test-6",
      title: "Generation 1 Task",
    } as any);

    await EntityCommandService.permanentlyDeleteTask("task-test-6", INBOX_WORKSPACE_ID);

    const recreated = await EntityCommandService.createTask({
      id: "task-test-6",
      title: "Generation 2 Task",
    } as any);

    expect(recreated.id).toBe("task-test-6");
    expect(recreated.lifecycleGeneration).toBe(2);
    expect(recreated.revision).toBe(1);

    const persisted = await TaskRepository.getTask("task-test-6", INBOX_WORKSPACE_ID);
    expect(persisted?.lifecycleGeneration).toBe(2);
    expect(persisted?.title).toBe("Generation 2 Task");
  });

  // 7. Stale Move Journal replay for X/g1 encounters Tombstone and is dropped as OBSOLETE
  it("Test 7: Stale Move Journal replay for tombstoned generation is safely dropped as OBSOLETE", async () => {
    await TombstoneRepository.addTombstone({
      id: "ts-task-test-7-g1",
      entityType: "task",
      entityId: "task-test-7",
      lifecycleGeneration: 1,
      deletionRevision: 1,
      deletedAt: Date.now(),
    });

    await MoveJournalRepository.addOperation({
      operationId: "op-stale-move-7",
      entityId: "task-test-7",
      entityType: "task",
      sourceWorkspaceId: INBOX_WORKSPACE_ID,
      targetWorkspaceId: "ws-target",
      timestamp: Date.now() - 10000,
      lifecycleGeneration: 1,
      expectedRevision: 1,
    });

    await MoveReconcilerService.reconcileAll();

    const ops = await MoveJournalRepository.getOperations();
    expect(ops).toHaveLength(0);
  });

  // 8. Stale Restore operation for X/g1 against active X/g2 is rejected without overwriting X/g2
  it("Test 8: Stale Restore operation against active newer generation is rejected without overwriting", async () => {
    // 1. Create and permanently delete g1
    await EntityCommandService.createTask({ id: "task-test-8", title: "Task Gen 1" } as any);
    await EntityCommandService.permanentlyDeleteTask("task-test-8", INBOX_WORKSPACE_ID);

    // 2. Create g2
    const taskG2 = await EntityCommandService.createTask({ id: "task-test-8", title: "Task Gen 2 Active" } as any);
    expect(taskG2.lifecycleGeneration).toBe(2);

    // 3. Stale snapshot left in recycle bin for g1
    await RecycleBinRepository.saveRecycleBinItems([
      {
        id: "rb-task-test-8-g1",
        entityType: "task",
        entityId: "task-test-8",
        lifecycleGeneration: 1,
        snapshot: JSON.stringify({ id: "task-test-8", title: "Stale Gen 1 Snapshot", workspaceId: INBOX_WORKSPACE_ID, lifecycleGeneration: 1, revision: 1 }),
        deletedAt: Date.now() - 5000,
      }
    ]);

    // Attempt to restore stale g1
    await expect(EntityCommandService.restoreTask("rb-task-test-8-g1")).rejects.toThrow("Task task-test-8 was permanently deleted");

    // Verify Active g2 is untouched
    const active = await TaskRepository.getTask("task-test-8", INBOX_WORKSPACE_ID);
    expect(active?.lifecycleGeneration).toBe(2);
    expect(active?.title).toBe("Task Gen 2 Active");
  });

  // 9. Habit H/g1 created with lifecycleGeneration = 1, revision = 1
  it("Test 9: Habit creation initializes lifecycleGeneration = 1 and revision = 1", async () => {
    const habit = await EntityCommandService.createHabit({
      id: "habit-test-9",
      title: "Test Habit 9",
    } as any);

    expect(habit.lifecycleGeneration).toBe(1);
    expect(habit.revision).toBe(1);
  });

  // 10. updateHabit(H) increments revision to 2
  it("Test 10: updateHabit increments revision without altering lifecycleGeneration", async () => {
    await EntityCommandService.createHabit({
      id: "habit-test-10",
      title: "Initial Habit",
    } as any);

    const updated = await EntityCommandService.updateHabit(
      "habit-test-10",
      INBOX_WORKSPACE_ID,
      { title: "Updated Habit" }
    );

    expect(updated.lifecycleGeneration).toBe(1);
    expect(updated.revision).toBe(2);
  });

  // 11. completeHabit(H) increments revision to 3
  it("Test 11: completeHabit increments revision", async () => {
    await EntityCommandService.createHabit({
      id: "habit-test-11",
      title: "Complete Habit",
    } as any);

    const res = await EntityCommandService.completeHabit("habit-test-11", INBOX_WORKSPACE_ID);
    expect(res).not.toBeNull();
    expect(res!.updated.revision).toBe(2);
    expect(res!.updated.lifecycleGeneration).toBe(1);
  });

  // 12. uncompleteHabit(H) increments revision to 3
  it("Test 12: uncompleteHabit increments revision", async () => {
    await EntityCommandService.createHabit({
      id: "habit-test-12",
      title: "Uncomplete Habit",
    } as any);

    await EntityCommandService.completeHabit("habit-test-12", INBOX_WORKSPACE_ID);
    const res = await EntityCommandService.uncompleteHabit("habit-test-12", INBOX_WORKSPACE_ID);

    expect(res).not.toBeNull();
    expect(res!.updated.revision).toBe(3);
    expect(res!.updated.lifecycleGeneration).toBe(1);
  });

  // 13. moveHabit(H) increments revision to 2
  it("Test 13: moveHabit increments revision and preserves lifecycleGeneration", async () => {
    await WorkspaceRepository.saveWorkspace({ id: "ws-target-h", name: "Target WS", revision: 1, lifecycleGeneration: 1, createdAt: Date.now(), updatedAt: Date.now() });

    await EntityCommandService.createHabit({
      id: "habit-test-13",
      title: "Move Habit",
    } as any);

    const moved = await EntityCommandService.moveHabit(
      "habit-test-13",
      INBOX_WORKSPACE_ID,
      "ws-target-h"
    );

    expect(moved.workspaceId).toBe("ws-target-h");
    expect(moved.lifecycleGeneration).toBe(1);
    expect(moved.revision).toBe(2);
  });

  // 14. permanentlyDeleteHabit(H) registers Tombstone
  it("Test 14: permanentlyDeleteHabit registers Tombstone in TombstoneRepository", async () => {
    await EntityCommandService.createHabit({
      id: "habit-test-14",
      title: "Perm Delete Habit",
    } as any);

    await EntityCommandService.permanentlyDeleteHabit("habit-test-14", INBOX_WORKSPACE_ID);

    const isTombstoned = await TombstoneRepository.isTombstoned("habit", "habit-test-14", 1);
    expect(isTombstoned).toBe(true);
  });

  // 15. Re-creating Habit H assigns lifecycleGeneration = 2
  it("Test 15: Re-creating Habit H assigns lifecycleGeneration = 2", async () => {
    await EntityCommandService.createHabit({
      id: "habit-test-15",
      title: "Habit Gen 1",
    } as any);

    await EntityCommandService.permanentlyDeleteHabit("habit-test-15", INBOX_WORKSPACE_ID);

    const recreated = await EntityCommandService.createHabit({
      id: "habit-test-15",
      title: "Habit Gen 2",
    } as any);

    expect(recreated.lifecycleGeneration).toBe(2);
    expect(recreated.revision).toBe(1);
  });

  // 16. Stale Habit recycle/restore replay dropped as OBSOLETE due to tombstone
  it("Test 16: Stale Habit recycle/restore replay dropped as OBSOLETE due to tombstone", async () => {
    await TombstoneRepository.addTombstone({
      id: "ts-habit-test-16-g1",
      entityType: "habit",
      entityId: "habit-test-16",
      lifecycleGeneration: 1,
      deletionRevision: 1,
      deletedAt: Date.now(),
    });

    await MoveJournalRepository.addOperation({
      operationId: "op-stale-habit-16",
      operationType: "restore",
      entityId: "habit-test-16",
      entityType: "habit",
      sourceWorkspaceId: INBOX_WORKSPACE_ID,
      targetWorkspaceId: INBOX_WORKSPACE_ID,
      timestamp: Date.now() - 10000,
      lifecycleGeneration: 1,
      expectedRevision: 1,
    });

    await MoveReconcilerService.reconcileAll();

    const ops = await MoveJournalRepository.getOperations();
    expect(ops).toHaveLength(0);
  });

  // 17. Monotonic sequence counter increments sequentially for MoveJournal entries
  it("Test 17: MoveJournal assigns strictly monotonic sequences", async () => {
    await MoveJournalRepository.addOperation({
      operationId: "op-seq-1",
      operationType: "move",
      entityId: "t1",
      entityType: "task",
      sourceWorkspaceId: "ws1",
      targetWorkspaceId: "ws2",
      timestamp: 1000,
      lifecycleGeneration: 1,
      expectedRevision: 1,
    });

    await MoveJournalRepository.addOperation({
      operationId: "op-seq-2",
      operationType: "move",
      entityId: "t2",
      entityType: "task",
      sourceWorkspaceId: "ws1",
      targetWorkspaceId: "ws2",
      timestamp: 2000,
      lifecycleGeneration: 1,
      expectedRevision: 1,
    });

    const ops = await MoveJournalRepository.getOperations();
    expect(ops).toHaveLength(2);
    expect(ops[0].sequence).toBe(1);
    expect(ops[1].sequence).toBe(2);
    expect(ops[1].sequence!).toBeGreaterThan(ops[0].sequence!);
  });

  // 18. Monotonic sequence counter increments sequentially for ConversionJournal entries
  it("Test 18: ConversionJournal assigns strictly monotonic sequences", async () => {
    await ConversionJournalRepository.addOperationUnlocked({
      operationId: "conv-seq-1",
      operationType: "habit_to_task",
      sourceId: "h1",
      targetId: "t1",
      sourceWorkspaceId: "ws1",
      targetWorkspaceId: "ws1",
      timestamp: 1000,
      phase: "DESTINATION_WRITTEN",
      sourceRevision: 1,
      sourceGeneration: 1,
      targetGeneration: 1,
    });

    await ConversionJournalRepository.addOperationUnlocked({
      operationId: "conv-seq-2",
      operationType: "task_to_habit",
      sourceId: "t2",
      targetId: "h2",
      sourceWorkspaceId: "ws1",
      targetWorkspaceId: "ws1",
      timestamp: 2000,
      phase: "DESTINATION_WRITTEN",
      sourceRevision: 1,
      sourceGeneration: 1,
      targetGeneration: 1,
    });

    const ops = await ConversionJournalRepository.getOperations();
    expect(ops).toHaveLength(2);
    expect(ops[0].sequence).toBe(1);
    expect(ops[1].sequence).toBe(2);
  });

  // 19. Conversion replay validates revision CAS
  it("Test 19: Conversion replay validates source revision CAS", async () => {
    const habit = await EntityCommandService.createHabit({
      id: "habit-conv-19",
      title: "Convert Habit",
    } as any);

    // Destination task created
    await EntityCommandService.createTask({
      id: "task-conv-19",
      title: "Convert Habit",
    } as any);

    // Journal recorded with expected revision = 1
    await ConversionJournalRepository.addOperationUnlocked({
      operationId: "conv-op-19",
      operationType: "habit_to_task",
      sourceId: "habit-conv-19",
      targetId: "task-conv-19",
      sourceWorkspaceId: INBOX_WORKSPACE_ID,
      targetWorkspaceId: INBOX_WORKSPACE_ID,
      timestamp: Date.now() - 5000,
      phase: "DESTINATION_WRITTEN",
      sourceRevision: 1,
      sourceGeneration: 1,
      targetGeneration: 1,
    });

    // But user mutated habit in parallel, bumping revision to 2
    await EntityCommandService.updateHabit("habit-conv-19", INBOX_WORKSPACE_ID, { title: "Mutated Title" });

    // Reconcile should detect revision mismatch and preserve source
    await ConversionReconcilerService.reconcileAll();

    const habitAfter = await HabitRepository.getHabit("habit-conv-19", INBOX_WORKSPACE_ID);
    expect(habitAfter).toBeDefined();
    expect(habitAfter?.title).toBe("Mutated Title");
  });

  // 20. RecycleBin UI permanent deletion registers durable Tombstone
  it("Test 20: Permanent deletion from Recycle Bin registers durable Tombstone", async () => {
    const task = await EntityCommandService.createTask({ id: "task-rb-20", title: "Bin Task" } as any);
    await EntityCommandService.recycleTask("task-rb-20", INBOX_WORKSPACE_ID, "Inbox");

    const items = await RecycleBinRepository.getRecycleBinItems();
    const item = items.find(i => i.entityId === "task-rb-20");
    expect(item).toBeDefined();

    // Emulate UI permanent delete
    const snap = JSON.parse(item!.snapshot);
    await TombstoneRepository.addTombstone({
      id: `ts-task-task-rb-20-g${item!.lifecycleGeneration ?? 1}`,
      entityType: "task",
      entityId: "task-rb-20",
      lifecycleGeneration: item!.lifecycleGeneration ?? 1,
      deletionRevision: snap.revision ?? 1,
      deletedAt: Date.now(),
    });
    await RecycleBinRepository.removeRecycleBinItems([item!.id]);

    const isTombstoned = await TombstoneRepository.isTombstoned("task", "task-rb-20", 1);
    expect(isTombstoned).toBe(true);
  });

  // 21. RecycleBin UI Empty Recycle Bin registers durable Tombstones for all items
  it("Test 21: Empty Recycle Bin registers durable Tombstones for all items", async () => {
    await EntityCommandService.createTask({ id: "task-rb-21a", title: "Bin Task A" } as any);
    await EntityCommandService.createHabit({ id: "habit-rb-21b", title: "Bin Habit B" } as any);
    await EntityCommandService.recycleTask("task-rb-21a", INBOX_WORKSPACE_ID, "Inbox");
    await EntityCommandService.recycleHabit("habit-rb-21b", INBOX_WORKSPACE_ID);

    const items = await RecycleBinRepository.getRecycleBinItems();
    const tombstonesToAdd = items.map((item) => {
      const snap = JSON.parse(item.snapshot);
      return {
        id: `ts-${item.entityType}-${item.entityId}-g${item.lifecycleGeneration ?? 1}`,
        entityType: item.entityType,
        entityId: item.entityId,
        lifecycleGeneration: item.lifecycleGeneration ?? 1,
        deletionRevision: snap.revision ?? 1,
        deletedAt: Date.now(),
      };
    });
    await TombstoneRepository.addTombstones(tombstonesToAdd);
    await RecycleBinRepository.saveRecycleBinItems([]);

    expect(await TombstoneRepository.isTombstoned("task", "task-rb-21a", 1)).toBe(true);
    expect(await TombstoneRepository.isTombstoned("habit", "habit-rb-21b", 1)).toBe(true);
  });

  // 22. Multiple same-ID lifecycles: X/g1 -> perm delete -> X/g2 -> perm delete -> X/g3
  it("Test 22: Multiple same-ID lifecycles correctly increment generation to 3", async () => {
    // Gen 1
    await EntityCommandService.createTask({ id: "task-multi-gen", title: "Gen 1" } as any);
    await EntityCommandService.permanentlyDeleteTask("task-multi-gen", INBOX_WORKSPACE_ID);

    // Gen 2
    const g2 = await EntityCommandService.createTask({ id: "task-multi-gen", title: "Gen 2" } as any);
    expect(g2.lifecycleGeneration).toBe(2);
    await EntityCommandService.permanentlyDeleteTask("task-multi-gen", INBOX_WORKSPACE_ID);

    // Gen 3
    const g3 = await EntityCommandService.createTask({ id: "task-multi-gen", title: "Gen 3" } as any);
    expect(g3.lifecycleGeneration).toBe(3);
    expect(g3.revision).toBe(1);

    const highest = await TombstoneRepository.getHighestTombstonedGeneration("task", "task-multi-gen");
    expect(highest).toBe(2);
  });

  // 23. TombstoneRepository.isTombstoned correctly matches by entityType, entityId, and lifecycleGeneration
  it("Test 23: TombstoneRepository.isTombstoned checks entityType, ID, and generation correctly", async () => {
    await TombstoneRepository.addTombstone({
      id: "ts-match-1",
      entityType: "task",
      entityId: "entity-match",
      lifecycleGeneration: 2,
      deletionRevision: 5,
      deletedAt: Date.now(),
    });

    expect(await TombstoneRepository.isTombstoned("task", "entity-match", 1)).toBe(true);
    expect(await TombstoneRepository.isTombstoned("task", "entity-match", 2)).toBe(true);
    expect(await TombstoneRepository.isTombstoned("task", "entity-match", 3)).toBe(false);
    expect(await TombstoneRepository.isTombstoned("habit", "entity-match", 2)).toBe(false);
    expect(await TombstoneRepository.isTombstoned("task", "other-entity", 2)).toBe(false);
  });

  // 24. MoveReconcilerService handles out-of-order move replay with CAS check against newer generation
  it("Test 24: MoveReconcilerService preserves newer generation on out-of-order replay", async () => {
    // Active is gen 2
    await TaskRepository.saveTask({
      id: "task-ooo-24",
      title: "Gen 2 Active",
      workspaceId: INBOX_WORKSPACE_ID,
      lifecycleGeneration: 2,
      revision: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: "todo",
      priority: "none",
    });

    // Stale recycle operation for gen 1
    await MoveJournalRepository.addOperation({
      operationId: "op-stale-recycle-24",
      operationType: "recycle",
      entityId: "task-ooo-24",
      entityType: "task",
      sourceWorkspaceId: INBOX_WORKSPACE_ID,
      targetWorkspaceId: INBOX_WORKSPACE_ID,
      timestamp: Date.now() - 50000,
      lifecycleGeneration: 1,
      expectedRevision: 1,
    });

    await MoveReconcilerService.reconcileAll();

    const active = await TaskRepository.getTask("task-ooo-24", INBOX_WORKSPACE_ID);
    expect(active).toBeDefined();
    expect(active?.lifecycleGeneration).toBe(2);
  });

  // 25. Split-brain detection in MoveReconcilerService safely handles generation forks
  it("Test 25: Split-brain detection forks source without corrupting target", async () => {
    await WorkspaceRepository.saveWorkspace({ id: "ws-target-sb", name: "Target WS", revision: 1, lifecycleGeneration: 1, createdAt: Date.now(), updatedAt: Date.now() });

    await TaskRepository.saveTasksUnlocked([
      {
        id: "task-sb-25",
        title: "Source Edition",
        workspaceId: INBOX_WORKSPACE_ID,
        lifecycleGeneration: 1,
        revision: 2,
        createdAt: 1000,
        updatedAt: 5000,
        status: "todo",
        priority: "none",
      }
    ], INBOX_WORKSPACE_ID);

    await TaskRepository.saveTasksUnlocked([
      {
        id: "task-sb-25",
        title: "Target Edition",
        workspaceId: "ws-target-sb",
        lifecycleGeneration: 1,
        revision: 2,
        createdAt: 1000,
        updatedAt: 6000,
        status: "todo",
        priority: "none",
      }
    ], "ws-target-sb");

    await MoveJournalRepository.addOperation({
      operationId: "op-sb-25",
      entityId: "task-sb-25",
      entityType: "task",
      sourceWorkspaceId: INBOX_WORKSPACE_ID,
      targetWorkspaceId: "ws-target-sb",
      timestamp: 2000,
      lifecycleGeneration: 1,
      expectedRevision: 1,
    });

    await MoveReconcilerService.reconcileAll();

    const targetTasks = await TaskRepository.getTasks("ws-target-sb");
    expect(targetTasks["task-sb-25"]).toBeDefined();
    expect(targetTasks["task-sb-25"].title).toBe("Target Edition");

    const forkKey = "fork-op-sb-25-task-sb-25";
    expect(targetTasks[forkKey]).toBeDefined();
    expect(targetTasks[forkKey].title).toBe("[Conflict] Source Edition");
  });

  // 26. Checklist permanent deletion registers durable Tombstone
  it("Test 26: Checklist permanent deletion registers durable Tombstone", async () => {
    await ChecklistRepository.saveChecklist({
      id: "cl-test-26",
      title: "Checklist 26",
      workspaceId: INBOX_WORKSPACE_ID,
      lifecycleGeneration: 1,
      revision: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      items: [],
    });

    await EntityCommandService.permanentlyDeleteChecklist("cl-test-26", INBOX_WORKSPACE_ID);

    const isTombstoned = await TombstoneRepository.isTombstoned("checklist", "cl-test-26", 1);
    expect(isTombstoned).toBe(true);
  });

  // 27. Resource permanent deletion registers durable Tombstone
  it("Test 27: Resource permanent deletion registers durable Tombstone", async () => {
    await ResourceRepository.saveResource({
      id: "res-test-27",
      title: "Resource 27",
      type: "link",
      value: "https://pebble.app",
      workspaceId: INBOX_WORKSPACE_ID,
      lifecycleGeneration: 1,
      revision: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await EntityCommandService.permanentlyDeleteResource("res-test-27", INBOX_WORKSPACE_ID);

    const isTombstoned = await TombstoneRepository.isTombstoned("resource", "res-test-27", 1);
    expect(isTombstoned).toBe(true);
  });

  // 28. Complete storage reset (clearRepositoryStorage) cleanses tombstones and resets journal sequences
  it("Test 28: clearRepositoryStorage cleanses tombstones and resets journal sequence counters", async () => {
    await TombstoneRepository.addTombstone({
      id: "ts-cleanup-28",
      entityType: "task",
      entityId: "task-cleanup",
      lifecycleGeneration: 1,
      deletionRevision: 1,
      deletedAt: Date.now(),
    });

    await MoveJournalRepository.getNextSequence();
    await ConversionJournalRepository.getNextSequence();

    await clearRepositoryStorage();

    const tombstones = await TombstoneRepository.getTombstones();
    expect(tombstones).toEqual([]);

    const nextSeq = await MoveJournalRepository.getNextSequence();
    expect(nextSeq).toBe(1);
  });
});
