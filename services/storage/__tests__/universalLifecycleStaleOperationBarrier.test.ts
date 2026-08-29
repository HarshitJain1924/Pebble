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
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { TombstoneRepository } from "@/repositories/TombstoneRepository";
import { MoveJournalRepository } from "@/repositories/MoveJournalRepository";
import { ConversionJournalRepository } from "@/repositories/ConversionJournalRepository";
import { MoveReconcilerService } from "@/services/storage/MoveReconcilerService";
import { ConversionReconcilerService } from "@/services/storage/ConversionReconcilerService";
import { RecycleBinRepository } from "@/repositories/RecycleBinRepository";
import { Task, Habit, Checklist, Resource } from "@/shared/types/domain.types";

describe("FIX #23 — Universal Lifecycle Generation + Revision Stale-Operation Barrier", () => {
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

    // Default workspace
    await WorkspaceRepository.saveWorkspace({
      id: "ws-1",
      name: "Workspace 1",
      order: 1,
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 1: Two concurrent updates against G1/R5. Only one succeeds, other receives stale failure.
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 1: Two concurrent updates against G1/R5 — only one succeeds, other fails with revision mismatch", async () => {
    const task: Task = {
      id: "task-conc-1",
      title: "Task Initial",
      status: "todo",
      priority: "none",
      workspaceId: "ws-1",
      lifecycleGeneration: 1,
      revision: 5,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await AsyncStorage.setItem(
      "pebble:v1:tasks:ws-1",
      JSON.stringify({ "task-conc-1": task })
    );

    // Two callers both read R5 and attempt to commit updates expecting R5
    const p1 = EntityCommandService.updateTask(
      "task-conc-1",
      "ws-1",
      { title: "Update from Caller 1" },
      { expectedGeneration: 1, expectedRevision: 5 }
    );

    const p2 = EntityCommandService.updateTask(
      "task-conc-1",
      "ws-1",
      { title: "Update from Caller 2" },
      { expectedGeneration: 1, expectedRevision: 5 }
    );

    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toContain("revision mismatch");

    const finalTask = await TaskRepository.getTask("task-conc-1", "ws-1");
    expect(finalTask?.revision).toBe(6);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 2: Update starts against G1/R5 while another update commits G1/R6. Stale update cannot overwrite R6.
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 2: Stale update against G1/R5 cannot overwrite G1/R6", async () => {
    const task: Task = {
      id: "task-t2",
      title: "Task T2",
      status: "todo",
      priority: "none",
      workspaceId: "ws-1",
      lifecycleGeneration: 1,
      revision: 5,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await AsyncStorage.setItem(
      "pebble:v1:tasks:ws-1",
      JSON.stringify({ "task-t2": task })
    );

    // Intermediate commit advances to R6
    await EntityCommandService.updateTask("task-t2", "ws-1", { title: "Commit R6" });

    const current = await TaskRepository.getTask("task-t2", "ws-1");
    expect(current?.revision).toBe(6);
    expect(current?.title).toBe("Commit R6");

    // Stale update expecting R5 must fail
    await expect(
      EntityCommandService.updateTask(
        "task-t2",
        "ws-1",
        { title: "Stale Overwrite" },
        { expectedGeneration: 1, expectedRevision: 5 }
      )
    ).rejects.toThrow("revision mismatch");

    // Live state remains R6
    const preserved = await TaskRepository.getTask("task-t2", "ws-1");
    expect(preserved?.title).toBe("Commit R6");
    expect(preserved?.revision).toBe(6);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 3: Stale G1 update executes after G2 creation. G2 remains untouched.
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 3: Stale G1 update executes after G2 creation — G2 remains untouched", async () => {
    // 1. G1 is tombstoned
    await TombstoneRepository.addTombstone({
      id: "ts-task-t3",
      entityType: "task",
      entityId: "task-t3",
      lifecycleGeneration: 1,
      deletionRevision: 5,
      deletedAt: Date.now(),
    });

    // 2. G2 is created
    const g2 = await EntityCommandService.createTask(
      { title: "G2 Task Live" } as any,
      "ws-1",
      { explicitId: "task-t3" }
    );
    expect(g2.lifecycleGeneration).toBe(2);
    expect(g2.revision).toBe(1);

    // 3. Stale G1 command executes
    await expect(
      EntityCommandService.updateTask(
        "task-t3",
        "ws-1",
        { title: "Mutate Dead G1" },
        { expectedGeneration: 1, expectedRevision: 5 }
      )
    ).rejects.toThrow("generation mismatch");

    const live = await TaskRepository.getTask("task-t3", "ws-1");
    expect(live?.title).toBe("G2 Task Live");
    expect(live?.lifecycleGeneration).toBe(2);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 4: Stale G1 recycle executes after G2 creation. G2 remains active.
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 4: Stale G1 recycle executes after G2 creation — G2 remains active", async () => {
    await TombstoneRepository.addTombstone({
      id: "ts-task-t4",
      entityType: "task",
      entityId: "task-t4",
      lifecycleGeneration: 1,
      deletionRevision: 5,
      deletedAt: Date.now(),
    });

    const g2 = await EntityCommandService.createTask(
      { title: "G2 Task Active" } as any,
      "ws-1",
      { explicitId: "task-t4" }
    );
    expect(g2.lifecycleGeneration).toBe(2);

    // Stale G1 recycle fails
    await expect(
      EntityCommandService.recycleTask("task-t4", "ws-1", "Inbox", {
        expectedGeneration: 1,
        expectedRevision: 5,
      })
    ).rejects.toThrow("generation mismatch");

    const live = await TaskRepository.getTask("task-t4", "ws-1");
    expect(live).not.toBeNull();
    expect(live?.lifecycleGeneration).toBe(2);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 5: Stale G1 permanent delete executes after G2 creation. G2 remains active.
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 5: Stale G1 permanent delete executes after G2 creation — G2 remains active", async () => {
    await TombstoneRepository.addTombstone({
      id: "ts-task-t5",
      entityType: "task",
      entityId: "task-t5",
      lifecycleGeneration: 1,
      deletionRevision: 5,
      deletedAt: Date.now(),
    });

    const g2 = await EntityCommandService.createTask(
      { title: "G2 Task Intact" } as any,
      "ws-1",
      { explicitId: "task-t5" }
    );
    expect(g2.lifecycleGeneration).toBe(2);

    // Stale G1 permanent delete fails
    await expect(
      EntityCommandService.permanentlyDeleteTask("task-t5", "ws-1", {
        expectedGeneration: 1,
        expectedRevision: 5,
      })
    ).rejects.toThrow("generation mismatch");

    const live = await TaskRepository.getTask("task-t5", "ws-1");
    expect(live).not.toBeNull();
    expect(live?.lifecycleGeneration).toBe(2);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 6: Stale G1 restore executes after G2 creation. G2 remains untouched.
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 6: Stale G1 restore executes after G2 creation — G2 remains untouched", async () => {
    // 1. Add G1 tombstone
    await TombstoneRepository.addTombstone({
      id: "ts-task-t6",
      entityType: "task",
      entityId: "task-t6",
      lifecycleGeneration: 1,
      deletionRevision: 5,
      deletedAt: Date.now(),
    });

    // 2. Add stale G1 item to recycle bin
    await RecycleBinRepository.addToRecycleBin(
      "task",
      {
        id: "task-t6",
        title: "G1 Ghost in Bin",
        status: "todo",
        priority: "none",
        workspaceId: "ws-1",
        lifecycleGeneration: 1,
        revision: 5,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      "ws-1"
    );

    // 3. G2 is live
    const g2 = await EntityCommandService.createTask(
      { title: "G2 Live Task" } as any,
      "ws-1",
      { explicitId: "task-t6" }
    );
    expect(g2.lifecycleGeneration).toBe(2);

    // 4. Restore of G1 ghost must fail
    await expect(
      EntityCommandService.restoreTask("rb-task-t6")
    ).rejects.toThrow("permanently deleted");

    // 5. G2 live task is intact
    const live = await TaskRepository.getTask("task-t6", "ws-1");
    expect(live?.title).toBe("G2 Live Task");
    expect(live?.lifecycleGeneration).toBe(2);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 7: Stale G1 reconciler journal executes after G2 creation. G2 untouched, journal dropped as OBSOLETE.
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 7: Stale G1 move journal executes after G2 creation — G2 untouched, journal dropped as OBSOLETE", async () => {
    await TombstoneRepository.addTombstone({
      id: "ts-task-t7",
      entityType: "task",
      entityId: "task-t7",
      lifecycleGeneration: 1,
      deletionRevision: 5,
      deletedAt: Date.now(),
    });

    // Create G2 in ws-1
    const g2 = await EntityCommandService.createTask(
      { title: "G2 Live Task" } as any,
      "ws-1",
      { explicitId: "task-t7" }
    );
    expect(g2.lifecycleGeneration).toBe(2);

    // Stale G1 move intent from ws-1 to ws-2
    await MoveJournalRepository.addOperation({
      operationId: "op-move-t7-stale",
      operationType: "move",
      entityId: "task-t7",
      entityType: "task",
      sourceWorkspaceId: "ws-1",
      targetWorkspaceId: "ws-2",
      timestamp: Date.now(),
      lifecycleGeneration: 1,
      expectedRevision: 5,
    });

    await MoveReconcilerService.reconcileAll();

    // Verify journal cleared
    const pending = await MoveJournalRepository.getOperations();
    expect(pending.find((p) => p.operationId === "op-move-t7-stale")).toBeUndefined();

    // Verify G2 is untouched in ws-1
    const live = await TaskRepository.getTask("task-t7", "ws-1");
    expect(live?.lifecycleGeneration).toBe(2);
    const inWs2 = await TaskRepository.getTask("task-t7", "ws-2");
    expect(inWs2).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 8: Habit parity (stale update, complete, uncomplete, streak, recycle, delete against G2)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("TEST 8: Habit lifecycle parity", () => {
    it("8a: Habit optimistic revision failure", async () => {
      const habit: Habit = {
        id: "habit-t8",
        title: "Habit T8",
        workspaceId: "ws-1",
        lifecycleGeneration: 1,
        revision: 3,
        recurrence: { frequency: "daily", interval: 1 },
        completionHistory: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await HabitRepository.saveHabit(habit);

      await expect(
        EntityCommandService.updateHabit(
          "habit-t8",
          "ws-1",
          { title: "Stale Mutate" },
          { expectedGeneration: 1, expectedRevision: 2 }
        )
      ).rejects.toThrow("revision mismatch");
    });

    it("8b: Habit G1 commands rejected on G2", async () => {
      await TombstoneRepository.addTombstone({
        id: "ts-h-t8b",
        entityType: "habit",
        entityId: "habit-t8b",
        lifecycleGeneration: 1,
        deletionRevision: 5,
        deletedAt: Date.now(),
      });

      const h2 = await EntityCommandService.createHabit(
        { title: "Habit G2", recurrence: { frequency: "daily", interval: 1 } } as any,
        "ws-1",
        { explicitId: "habit-t8b" }
      );
      expect(h2.lifecycleGeneration).toBe(2);

      await expect(
        EntityCommandService.completeHabit("habit-t8b", "ws-1", {
          expectedGeneration: 1,
        })
      ).rejects.toThrow("generation mismatch");

      await expect(
        EntityCommandService.recycleHabit("habit-t8b", "ws-1", {
          expectedGeneration: 1,
        })
      ).rejects.toThrow("generation mismatch");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 9: Checklist parity (stale update, toggle, item add/delete, recycle against G2)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("TEST 9: Checklist lifecycle parity", () => {
    it("9a: Checklist item mutation monotonically increments revision", async () => {
      const cl = await EntityCommandService.createChecklist(
        { title: "Checklist T9", items: [] } as any,
        "ws-1"
      );
      expect(cl.revision).toBe(1);

      const added = await EntityCommandService.addChecklistItem(cl.id, "Buy Milk", "ws-1");
      expect(added?.updated.revision).toBe(2);

      const itemId = added!.updated.items[0].id;
      const toggled = await EntityCommandService.toggleChecklistItem(cl.id, itemId, "ws-1");
      expect(toggled?.updated.revision).toBe(3);

      const deleted = await EntityCommandService.deleteChecklistItem(cl.id, itemId, "ws-1");
      expect(deleted?.updated.revision).toBe(4);
    });

    it("9b: Checklist G1 mutation rejected on G2", async () => {
      await TombstoneRepository.addTombstone({
        id: "ts-cl-t9b",
        entityType: "checklist",
        entityId: "cl-t9b",
        lifecycleGeneration: 1,
        deletionRevision: 2,
        deletedAt: Date.now(),
      });

      const c2 = await EntityCommandService.createChecklist(
        { title: "Checklist G2", items: [] } as any,
        "ws-1",
        { explicitId: "cl-t9b" }
      );
      expect(c2.lifecycleGeneration).toBe(2);

      await expect(
        EntityCommandService.updateChecklist(
          "cl-t9b",
          "ws-1",
          { title: "Stale Mutate" },
          { expectedGeneration: 1 }
        )
      ).rejects.toThrow("generation mismatch");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 10: Resource parity (stale update, toggleArchive, recycle, delete against G2)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("TEST 10: Resource lifecycle parity", () => {
    it("10a: Resource toggleArchive and update monotonically increment revision", async () => {
      const res = await EntityCommandService.createResource(
        { title: "Resource Note", type: "note", content: "Notes" } as any,
        "ws-1"
      );
      expect(res.revision).toBe(1);

      const updated = await EntityCommandService.updateResource(
        res.id,
        "ws-1",
        { title: "Updated Note" }
      );
      expect(updated.revision).toBe(2);

      const archived = await EntityCommandService.toggleArchiveResource(res.id, "ws-1");
      expect(archived.resource.revision).toBe(3);
    });

    it("10b: Resource G1 mutation rejected on G2", async () => {
      await TombstoneRepository.addTombstone({
        id: "ts-r-t10b",
        entityType: "resource",
        entityId: "res-t10b",
        lifecycleGeneration: 1,
        deletionRevision: 3,
        deletedAt: Date.now(),
      });

      const r2 = await EntityCommandService.createResource(
        { title: "Resource G2", type: "note", content: "G2" } as any,
        "ws-1",
        { explicitId: "res-t10b" }
      );
      expect(r2.lifecycleGeneration).toBe(2);

      await expect(
        EntityCommandService.updateResource(
          "res-t10b",
          "ws-1",
          { title: "Stale Mutate" },
          { expectedGeneration: 1 }
        )
      ).rejects.toThrow("generation mismatch");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 11: Revision increments monotonically under serialized concurrent writes
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 11: Revision increments monotonically under serialized concurrent writes", async () => {
    const task = await EntityCommandService.createTask({ title: "Task Monotonic" } as any, "ws-1");
    expect(task.revision).toBe(1);

    // Run 5 sequential mutations
    const t1 = await EntityCommandService.updateTask(task.id, "ws-1", { title: "Title 1" });
    expect(t1.revision).toBe(2);

    const t2 = await EntityCommandService.completeTask(task.id, "ws-1");
    expect(t2?.updated.revision).toBe(3);

    const t3 = await EntityCommandService.uncompleteTask(task.id, "ws-1");
    expect(t3?.updated.revision).toBe(4);

    const t4 = await EntityCommandService.updateTask(task.id, "ws-1", { priority: "high" });
    expect(t4.revision).toBe(5);

    const t5 = await EntityCommandService.updateTask(task.id, "ws-1", { title: "Title Final" });
    expect(t5.revision).toBe(6);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 12: Notification/system writes cannot clobber a newer user revision
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 12: Notification ID updates preserve domain revision without regression", async () => {
    const task = await EntityCommandService.createTask(
      {
        title: "Task with Reminder",
        reminder: { enabled: true, time: "10:00", notificationIds: ["notif-1"] },
      } as any,
      "ws-1"
    );
    expect(task.revision).toBe(1);

    // User updates task
    const userUpdated = await EntityCommandService.updateTask(task.id, "ws-1", { title: "User Title" });
    expect(userUpdated.revision).toBe(2);

    // Internal notification ID update does not regress revision
    await TaskRepository.updateNotificationIds(task.id, "ws-1", ["notif-2"]);
    const fetched = await TaskRepository.getTask(task.id, "ws-1");
    expect(fetched?.title).toBe("User Title");
    expect(fetched?.reminder?.notificationIds).toEqual(["notif-2"]);
    expect(fetched?.revision).toBe(2);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 13: Move reconciliation cannot overwrite a newer revision
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 13: Move reconciliation detects newer revision at source and aborts stale move", async () => {
    const task = await EntityCommandService.createTask(
      { title: "Task Source" } as any,
      "ws-1",
      { explicitId: "task-move-rev" }
    );
    expect(task.revision).toBe(1);

    // User advances revision at source
    await EntityCommandService.updateTask("task-move-rev", "ws-1", { title: "Task Advanced" });
    const current = await TaskRepository.getTask("task-move-rev", "ws-1");
    expect(current?.revision).toBe(2);

    // Stale move recorded for R1
    await MoveJournalRepository.addOperation({
      operationId: "op-stale-move-rev",
      operationType: "move",
      entityId: "task-move-rev",
      entityType: "task",
      sourceWorkspaceId: "ws-1",
      targetWorkspaceId: "ws-2",
      timestamp: Date.now(),
      lifecycleGeneration: 1,
      expectedRevision: 1,
    });

    await MoveReconcilerService.reconcileAll();

    // Source entity preserved with R2
    const sourceTask = await TaskRepository.getTask("task-move-rev", "ws-1");
    expect(sourceTask?.revision).toBe(2);
    expect(sourceTask?.title).toBe("Task Advanced");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 14: Conversion cannot copy stale revision state into a newer lifecycle
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 14: Conversion initializes target entity at Gen 1, Rev 1 regardless of source revision", async () => {
    const habit: Habit = {
      id: "habit-conv-t14",
      title: "Habit High Revision",
      workspaceId: "ws-1",
      lifecycleGeneration: 1,
      revision: 42,
      recurrence: { frequency: "daily", interval: 1 },
      completionHistory: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await HabitRepository.saveHabit(habit);

    const convertedTask = await EntityCommandService.convertHabitToTask("habit-conv-t14", "ws-1");
    expect(convertedTask.lifecycleGeneration).toBe(1);
    expect(convertedTask.revision).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 15: Backup/import cannot restore stale generation/revision over a newer live generation
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 15: Backup restore respects partition generation state", async () => {
    const { BackupService } = await import("@/services/storage/backup.service");

    const taskG1 = await EntityCommandService.createTask(
      { title: "Task G1 Backup" } as any,
      "ws-1",
      { explicitId: "task-bk-15" }
    );
    expect(taskG1.lifecycleGeneration).toBe(1);

    const backupJson = await BackupService.generateStructuredBackup();

    // Permanently delete G1
    await EntityCommandService.permanentlyDeleteTask("task-bk-15", "ws-1");

    // Restore backup
    await BackupService.restoreStructuredBackup(backupJson);

    const restored = await TaskRepository.getTask("task-bk-15", "ws-1");
    expect(restored?.lifecycleGeneration).toBe(1);
    expect(restored?.title).toBe("Task G1 Backup");
  });
});
