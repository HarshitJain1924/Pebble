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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { TaskRepository } from "@/repositories/TaskRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { ChecklistRepository } from "@/repositories/ChecklistRepository";
import { ResourceRepository } from "@/repositories/ResourceRepository";
import { RecycleBinRepository } from "@/repositories/RecycleBinRepository";
import { TombstoneRepository } from "@/repositories/TombstoneRepository";
import { Task, Habit, Checklist, Resource } from "@/shared/types/domain.types";

describe("FIX #21 — Tombstone + Permanent Deletion Crash Consistency", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: any) => {
      store[key] = String(value);
      return null;
    });
    await AsyncStorage.clear();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 1: Normal permanent deletion
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 1: Normal permanent deletion creates tombstone and removes entity consistently", async () => {
    const task: Task = {
      id: "t-normal-1",
      title: "Normal Task",
      status: "todo",
      priority: "none",
      workspaceId: "ws-1",
      lifecycleGeneration: 1,
      revision: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await TaskRepository.saveTask(task);

    await EntityCommandService.permanentlyDeleteTask("t-normal-1", "ws-1");

    // Entity removed from active storage
    const active = await TaskRepository.getTask("t-normal-1", "ws-1");
    expect(active).toBeNull();

    // Durable tombstone persisted
    const isDead = await TombstoneRepository.isTombstoned("task", "t-normal-1", 1);
    expect(isDead).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 2: Tombstone write fails (Fix #20 behavior preserved)
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 2: Tombstone write failure leaves active entity intact and aborts permanent deletion", async () => {
    const task: Task = {
      id: "t-fail-ts",
      title: "Task TS Failure",
      status: "todo",
      priority: "none",
      workspaceId: "ws-1",
      lifecycleGeneration: 1,
      revision: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await TaskRepository.saveTask(task);

    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: any) => {
      if (key === "pebble:v1:tombstones") {
        throw new Error("Disk error: Tombstone write failed");
      }
      store[key] = String(value);
      return null;
    });

    await expect(
      EntityCommandService.permanentlyDeleteTask("t-fail-ts", "ws-1")
    ).rejects.toThrow("Disk error: Tombstone write failed");

    // Active task must still exist
    const active = await TaskRepository.getTask("t-fail-ts", "ws-1");
    expect(active).not.toBeNull();
    expect(active?.id).toBe("t-fail-ts");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 3 & TEST 4: Partial failure (Tombstone succeeds, active deletion fails / crashes)
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 3 & 4: Crash/failure after tombstone persistence leaves tombstone durable and prevents stale resurrection", async () => {
    const task: Task = {
      id: "t-partial-crash",
      title: "Partial Crash Task",
      status: "todo",
      priority: "none",
      workspaceId: "ws-1",
      lifecycleGeneration: 1,
      revision: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await TaskRepository.saveTask(task);

    // Fail when deleting from active partition
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: any) => {
      if (key === "pebble:v1:tasks:ws-1" && !String(value).includes("t-partial-crash")) {
        throw new Error("Disk full: Active partition delete failed");
      }
      store[key] = String(value);
      return null;
    });

    await expect(
      EntityCommandService.permanentlyDeleteTask("t-partial-crash", "ws-1")
    ).rejects.toThrow("Disk full: Active partition delete failed");

    // Tombstone is durable on disk
    const isDead = await TombstoneRepository.isTombstoned("task", "t-partial-crash", 1);
    expect(isDead).toBe(true);

    // Active entity still lingered on disk due to the simulated crash/failure
    const raw = await AsyncStorage.getItem("pebble:v1:tasks:ws-1");
    expect(raw).toContain("t-partial-crash");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 5: Retry permanent deletion after partial failure converges cleanly
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 5: Retry permanent deletion after partial failure converges to active absent + tombstone present", async () => {
    const task: Task = {
      id: "t-retry-conv",
      title: "Retry Convergence Task",
      status: "todo",
      priority: "none",
      workspaceId: "ws-1",
      lifecycleGeneration: 1,
      revision: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await TaskRepository.saveTask(task);

    // Stage partial failure: tombstone is written, active delete fails
    let failActiveDelete = true;
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: any) => {
      if (key === "pebble:v1:tasks:ws-1" && failActiveDelete && !String(value).includes("t-retry-conv")) {
        throw new Error("Temporary I/O failure");
      }
      store[key] = String(value);
      return null;
    });

    await expect(
      EntityCommandService.permanentlyDeleteTask("t-retry-conv", "ws-1")
    ).rejects.toThrow("Temporary I/O failure");

    // Fix the I/O failure and retry
    failActiveDelete = false;
    await EntityCommandService.permanentlyDeleteTask("t-retry-conv", "ws-1");

    // Verified: Active entity is gone, tombstone is durable
    const active = await TaskRepository.getTask("t-retry-conv", "ws-1");
    expect(active).toBeNull();
    const isDead = await TombstoneRepository.isTombstoned("task", "t-retry-conv", 1);
    expect(isDead).toBe(true);

    // Tombstones list contains exactly 1 entry for this entity (idempotent, no duplicates)
    const tombstones = await TombstoneRepository.getTombstones();
    const matches = tombstones.filter((t) => t.entityId === "t-retry-conv");
    expect(matches).toHaveLength(1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 6: Stale create/update/restore on tombstoned generation is rejected
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 6: Stale operations on a tombstoned generation are rejected", async () => {
    // Manually register a tombstone for Gen 1
    await TombstoneRepository.addTombstone({
      id: "ts-task-t-dead-g1",
      entityType: "task",
      entityId: "t-dead",
      lifecycleGeneration: 1,
      deletionRevision: 1,
      deletedAt: Date.now(),
    });

    // Attempting to restore a Gen 1 recycle bin item must be rejected
    await RecycleBinRepository.addToRecycleBin(
      "task",
      {
        id: "t-dead",
        title: "Dead Task",
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
      EntityCommandService.restoreTask("rb-t-dead")
    ).rejects.toThrow("permanently deleted");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 7: Newer lifecycle generation (Gen 2) is NOT blocked by old tombstone (Gen 1)
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 7: Newer lifecycle generation (Gen 2) of same ID is NOT blocked by Gen 1 tombstone", async () => {
    const taskGen1: Task = {
      id: "t-multigen",
      title: "Task Gen 1",
      status: "todo",
      priority: "none",
      workspaceId: "ws-1",
      lifecycleGeneration: 1,
      revision: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await TaskRepository.saveTask(taskGen1);

    // Permanently delete Gen 1
    await EntityCommandService.permanentlyDeleteTask("t-multigen", "ws-1");
    expect(await TombstoneRepository.isTombstoned("task", "t-multigen", 1)).toBe(true);

    // Create Gen 2 with same ID
    const taskGen2 = await EntityCommandService.createTask(
      {
        title: "Task Gen 2",
      } as any,
      "ws-1",
      { explicitId: "t-multigen" }
    );

    expect(taskGen2.id).toBe("t-multigen");
    expect(taskGen2.lifecycleGeneration).toBe(2);

    // Gen 2 is NOT tombstoned
    expect(await TombstoneRepository.isTombstoned("task", "t-multigen", 2)).toBe(false);

    // Gen 2 can be updated
    const updatedGen2 = await EntityCommandService.updateTask(
      "t-multigen",
      "ws-1",
      { title: "Task Gen 2 Updated" }
    );
    expect(updatedGen2.title).toBe("Task Gen 2 Updated");
    expect(updatedGen2.lifecycleGeneration).toBe(2);

    // Gen 2 can be completed
    const completedResult = await EntityCommandService.completeTask("t-multigen", "ws-1");
    expect(completedResult?.updated.status).toBe("completed");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 8: Recycle-bin interaction partial failure and convergence
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 8: Recycle-bin permanent deletion partial failure and retry convergence", async () => {
    const task: Task = {
      id: "t-bin-del",
      title: "Bin Delete Task",
      status: "todo",
      priority: "none",
      workspaceId: "ws-1",
      lifecycleGeneration: 1,
      revision: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await RecycleBinRepository.addToRecycleBin("task", task, "ws-1");

    // Fail during recycle bin removal
    let failBinRemove = true;
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: any) => {
      if (key === "pebble:v1:recycle_bin" && failBinRemove) {
        throw new Error("Disk error during bin cleanup");
      }
      store[key] = String(value);
      return null;
    });

    await expect(
      EntityCommandService.permanentlyDeleteTask("t-bin-del", "ws-1")
    ).rejects.toThrow("Disk error during bin cleanup");

    // Tombstone was persisted
    expect(await TombstoneRepository.isTombstoned("task", "t-bin-del", 1)).toBe(true);

    // Retrying restore is blocked because generation is tombstoned
    await expect(
      EntityCommandService.restoreTask("rb-t-bin-del")
    ).rejects.toThrow("permanently deleted");

    // Retry permanent deletion converges cleanly
    failBinRemove = false;
    await EntityCommandService.permanentlyDeleteTask("t-bin-del", "ws-1");

    const binItems = await RecycleBinRepository.getRecycleBinItems();
    expect(binItems.find((i) => i.entityId === "t-bin-del")).toBeUndefined();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 9: Notification cleanup failure does NOT invalidate lifecycle barrier
  // ─────────────────────────────────────────────────────────────────────────────
  it("TEST 9: Notification cleanup failure does NOT invalidate durable lifecycle deletion barrier", async () => {
    const task: Task = {
      id: "t-notif-fail",
      title: "Task with Notif",
      status: "todo",
      priority: "none",
      workspaceId: "ws-1",
      lifecycleGeneration: 1,
      revision: 1,
      reminder: {
        enabled: true,
        triggerAt: Date.now() + 60000,
        notificationIds: ["notif-1", "notif-2"],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await TaskRepository.saveTask(task);

    // Mock reminder service to throw on cancel
    const remindersService = await import("@/services/scheduling/reminders.service");
    const spy = jest.spyOn(remindersService, "cancelReminderIds").mockRejectedValue(new Error("Native notification system failure"));

    // Permanent deletion still succeeds for domain state
    await expect(
      EntityCommandService.permanentlyDeleteTask("t-notif-fail", "ws-1")
    ).resolves.toBeUndefined();

    // Domain state is completely deleted and tombstoned
    const active = await TaskRepository.getTask("t-notif-fail", "ws-1");
    expect(active).toBeNull();
    expect(await TombstoneRepository.isTombstoned("task", "t-notif-fail", 1)).toBe(true);

    spy.mockRestore();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 10: Multi-entity parity audit (Habit, Checklist, Resource)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("TEST 10: Multi-entity parity audit for Habit, Checklist, Resource", () => {
    it("10a: Habit permanent deletion failure-boundary parity", async () => {
      const habit: Habit = {
        id: "h-parity-1",
        title: "Habit Parity",
        recurrence: { frequency: "daily", interval: 1 },
        completionHistory: [],
        workspaceId: "ws-1",
        lifecycleGeneration: 1,
        revision: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await HabitRepository.saveHabit(habit);

      // 1. Partial failure: tombstone written, active delete fails
      let failHabitDelete = true;
      (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: any) => {
        if (key === "pebble:v1:habits:ws-1" && failHabitDelete && !String(value).includes("h-parity-1")) {
          throw new Error("Habit partition delete failure");
        }
        store[key] = String(value);
        return null;
      });

      await expect(
        EntityCommandService.permanentlyDeleteHabit("h-parity-1", "ws-1")
      ).rejects.toThrow("Habit partition delete failure");

      // Tombstone is durable
      expect(await TombstoneRepository.isTombstoned("habit", "h-parity-1", 1)).toBe(true);

      // 2. Retry converges
      failHabitDelete = false;
      await EntityCommandService.permanentlyDeleteHabit("h-parity-1", "ws-1");

      expect(await HabitRepository.getHabit("h-parity-1", "ws-1")).toBeNull();
      expect(await TombstoneRepository.isTombstoned("habit", "h-parity-1", 1)).toBe(true);

      // 3. Gen 2 creation works unblocked
      const habitGen2 = await EntityCommandService.createHabit(
        {
          title: "Habit Gen 2",
          recurrence: { frequency: "daily", interval: 1 },
        } as any,
        "ws-1",
        { explicitId: "h-parity-1" }
      );
      expect(habitGen2.lifecycleGeneration).toBe(2);
      expect(await TombstoneRepository.isTombstoned("habit", "h-parity-1", 2)).toBe(false);
    });

    it("10b: Checklist permanent deletion failure-boundary parity", async () => {
      const checklist: Checklist = {
        id: "c-parity-1",
        title: "Checklist Parity",
        items: [{ id: "item-1", title: "Item 1", completed: false }],
        workspaceId: "ws-1",
        lifecycleGeneration: 1,
        revision: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await ChecklistRepository.saveChecklist(checklist);

      // 1. Partial failure
      let failChecklistDelete = true;
      (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: any) => {
        if (key === "pebble:v1:checklists:ws-1" && failChecklistDelete && !String(value).includes("c-parity-1")) {
          throw new Error("Checklist partition delete failure");
        }
        store[key] = String(value);
        return null;
      });

      await expect(
        EntityCommandService.permanentlyDeleteChecklist("c-parity-1", "ws-1")
      ).rejects.toThrow("Checklist partition delete failure");

      expect(await TombstoneRepository.isTombstoned("checklist", "c-parity-1", 1)).toBe(true);

      // 2. Retry converges
      failChecklistDelete = false;
      await EntityCommandService.permanentlyDeleteChecklist("c-parity-1", "ws-1");

      expect(await ChecklistRepository.getChecklist("c-parity-1", "ws-1")).toBeNull();
      expect(await TombstoneRepository.isTombstoned("checklist", "c-parity-1", 1)).toBe(true);

      // 3. Gen 2 creation works unblocked
      const checklistGen2 = await EntityCommandService.createChecklist(
        {
          title: "Checklist Gen 2",
          items: [],
        } as any,
        "ws-1",
        { explicitId: "c-parity-1" }
      );
      expect(checklistGen2.lifecycleGeneration).toBe(2);
      expect(await TombstoneRepository.isTombstoned("checklist", "c-parity-1", 2)).toBe(false);
    });

    it("10c: Resource permanent deletion failure-boundary parity", async () => {
      const resource: Resource = {
        id: "r-parity-1",
        title: "Resource Parity",
        type: "link",
        content: "https://example.com",
        workspaceId: "ws-1",
        lifecycleGeneration: 1,
        revision: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await ResourceRepository.saveResource(resource);

      // 1. Partial failure
      let failResourceDelete = true;
      (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: any) => {
        if (key === "pebble:v1:resources:ws-1" && failResourceDelete && !String(value).includes("r-parity-1")) {
          throw new Error("Resource partition delete failure");
        }
        store[key] = String(value);
        return null;
      });

      await expect(
        EntityCommandService.permanentlyDeleteResource("r-parity-1", "ws-1")
      ).rejects.toThrow("Resource partition delete failure");

      expect(await TombstoneRepository.isTombstoned("resource", "r-parity-1", 1)).toBe(true);

      // 2. Retry converges
      failResourceDelete = false;
      await EntityCommandService.permanentlyDeleteResource("r-parity-1", "ws-1");

      expect(await ResourceRepository.getResource("r-parity-1", "ws-1")).toBeNull();
      expect(await TombstoneRepository.isTombstoned("resource", "r-parity-1", 1)).toBe(true);

      // 3. Gen 2 creation works unblocked
      const resourceGen2 = await EntityCommandService.createResource(
        {
          title: "Resource Gen 2",
          type: "link",
          content: "https://example.com/2",
        } as any,
        "ws-1",
        { explicitId: "r-parity-1" }
      );
      expect(resourceGen2.lifecycleGeneration).toBe(2);
      expect(await TombstoneRepository.isTombstoned("resource", "r-parity-1", 2)).toBe(false);
    });
  });
});
