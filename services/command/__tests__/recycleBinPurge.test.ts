/**
 * recycleBinPurge.test.ts
 * ─────────────────────────
 * Phase 2 regression suite: permanent deletion / Empty Recycle Bin must run
 * through the canonical domain handlers (tombstone → partition cleanup →
 * relationship cleanup → reminder cancellation → bin commit), report partial
 * failure explicitly, and stay retryable.
 */
const store: Record<string, string> = {};

jest.mock("@react-native-async-storage/async-storage", () => {
  return {
    __store: store,
    getItem: jest
      .fn()
      .mockImplementation(async (key: string) => store[key] || null),
    setItem: jest
      .fn()
      .mockImplementation(async (key: string, value: any) => {
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
    multiSet: jest
      .fn()
      .mockImplementation(async (pairs: Array<[string, string]>) => {
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

jest.mock("expo-notifications", () => ({
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  scheduleNotificationAsync: jest.fn().mockResolvedValue("scheduled-id"),
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: {
    DATE: "date",
    DAILY: "daily",
    TIME_INTERVAL: "timeInterval",
  },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { RecycleBinCommandHandler } from "@/services/command/handlers/RecycleBinCommandHandler";
import { TaskRepository } from "@/repositories/TaskRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { ChecklistRepository } from "@/repositories/ChecklistRepository";
import { ResourceRepository } from "@/repositories/ResourceRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { RecycleBinRepository } from "@/repositories/RecycleBinRepository";
import { TombstoneRepository } from "@/repositories/TombstoneRepository";
import { GraphRepository } from "@/repositories/GraphRepository";
import {
  type Task,
  type Habit,
  type Checklist,
  type Resource,
  type Workspace,
} from "@/shared/types/domain.types";

const now = Date.now();

const task: Task = {
  id: "t-purge",
  title: "Purge Task",
  status: "todo",
  priority: "none",
  workspaceId: "ws-1",
  lifecycleGeneration: 1,
  revision: 1,
  reminder: { enabled: true, triggerAt: now + 60000, notificationIds: ["n-task"] },
  createdAt: now,
  updatedAt: now,
};

const habit: Habit = {
  id: "h-purge",
  title: "Purge Habit",
  recurrence: { frequency: "daily", interval: 1 },
  completionHistory: [],
  workspaceId: "ws-1",
  lifecycleGeneration: 1,
  revision: 1,
  reminder: { enabled: true, triggerAt: now + 60000, notificationIds: ["n-habit"] },
  createdAt: now,
  updatedAt: now,
};

const checklist: Checklist = {
  id: "c-purge",
  title: "Purge Checklist",
  priority: "none",
  items: [{ id: "i-1", title: "Item", completed: false }],
  workspaceId: "ws-1",
  lifecycleGeneration: 1,
  revision: 1,
  reminder: { enabled: true, triggerAt: now + 60000, notificationIds: ["n-checklist"] },
  createdAt: now,
  updatedAt: now,
};

const resource: Resource = {
  id: "r-purge",
  title: "Purge Resource",
  type: "link",
  content: "https://example.com",
  workspaceId: "ws-1",
  lifecycleGeneration: 1,
  revision: 1,
  createdAt: now,
  updatedAt: now,
};

async function seedBin(entityType: any, entity: any, entityId?: string) {
  await RecycleBinRepository.addToRecycleBin(entityType, entity, entity.workspaceId);
  const id = entityId ?? entity.id;
  return (await RecycleBinRepository.getRecycleBinItems()).find(
    (i) => i.entityId === id && i.entityType === entityType,
  )!;
}

describe("Recycle Bin canonical permanent deletion", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    (AsyncStorage.setItem as jest.Mock).mockImplementation(
      async (key: string, value: any) => {
        store[key] = String(value);
        return null;
      },
    );
  });

  it.each([
    ["task", task, () => TaskRepository.getTask("t-purge", "ws-1")],
    ["habit", habit, () => HabitRepository.getHabit("h-purge", "ws-1")],
    [
      "checklist",
      checklist,
      () => ChecklistRepository.getChecklist("c-purge", "ws-1"),
    ],
    ["resource", resource, () => ResourceRepository.getResource("r-purge", "ws-1")],
  ])(
    "permanently deletes a %s from the bin through its domain handler",
    async (entityType, entity: any, readActive) => {
      const binItem = await seedBin(entityType, entity);

      const result = await EntityCommandService.permanentlyDeleteRecycleBinItems([
        binItem,
      ]);

      expect(result.failed).toEqual([]);
      expect(result.deletedIds).toEqual([binItem.id]);

      // Tombstone committed, active entity gone, bin entry removed.
      expect(
        await TombstoneRepository.isTombstoned(
          entityType as any,
          entity.id,
          entity.lifecycleGeneration,
        ),
      ).toBe(true);
      expect(await readActive()).toBeNull();
      expect(
        (await RecycleBinRepository.getRecycleBinItems()).find(
          (i) => i.entityId === entity.id,
        ),
      ).toBeUndefined();
    },
  );

  it("cancels checklist reminders from the archived snapshot", async () => {
    const reminders = await import("@/services/scheduling/reminders.service");
    const cancelSpy = jest
      .spyOn(reminders, "cancelReminderIds")
      .mockResolvedValue(undefined as any);

    const binItem = await seedBin("checklist", checklist);
    await EntityCommandService.permanentlyDeleteRecycleBinItems([binItem]);

    expect(cancelSpy).toHaveBeenCalledWith(
      ["n-checklist"],
      expect.objectContaining({ throwOnError: false }),
    );
    cancelSpy.mockRestore();
  });

  it("removes graph relationships for permanently deleted entities", async () => {
    await GraphRepository.saveRelationship({
      id: "rel-purge",
      source: { id: "t-purge", type: "task" },
      target: { id: "c-purge", type: "checklist" },
      relationType: "references",
      createdAt: now,
    });
    const binItem = await seedBin("task", task);

    await EntityCommandService.permanentlyDeleteRecycleBinItems([binItem]);

    const rels = await GraphRepository.getAllRelationships();
    expect(rels.some((r) => r.source.id === "t-purge" || r.target.id === "t-purge")).toBe(
      false,
    );
  });

  it("purges a recycled workspace with all archived children", async () => {
    const workspace: Workspace = {
      id: "ws-purge",
      name: "Purge WS",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: now,
      updatedAt: now,
    };
    await WorkspaceRepository.saveWorkspace(workspace);

    // Simulate the delete flow: workspace is gone from active storage but the
    // package snapshot holds the children.
    const childTask = { ...task, id: "t-child", workspaceId: workspace.id };
    const childHabit = { ...habit, id: "h-child", workspaceId: workspace.id };
    const binItem = await seedBin(
      "workspace",
      {
        list: workspace,
        todos: [childTask],
        habits: [childHabit],
        checklists: [],
        resources: [],
      },
      workspace.id,
    );

    await WorkspaceRepository.deleteWorkspace(workspace.id);

    await EntityCommandService.permanentlyDeleteRecycleBinItems([binItem]);

    expect(
      (await WorkspaceRepository.getWorkspaces()).some((w) => w.id === workspace.id),
    ).toBe(false);
    expect(await TombstoneRepository.isTombstoned("workspace", workspace.id, 1)).toBe(
      true,
    );
    expect(await TombstoneRepository.isTombstoned("task", "t-child", 1)).toBe(true);
    expect(await TombstoneRepository.isTombstoned("habit", "h-child", 1)).toBe(true);
    expect(await AsyncStorage.getItem(`pebble:v1:tasks:${workspace.id}`)).toBeNull();
    expect(await AsyncStorage.getItem(`pebble:v1:habits:${workspace.id}`)).toBeNull();
    expect(
      (await RecycleBinRepository.getRecycleBinItems()).some(
        (i) => i.entityType === "workspace",
      ),
    ).toBe(false);
  });

  it("empties a bin with mixed entity types", async () => {
    const items = [
      await seedBin("task", task),
      await seedBin("habit", habit),
      await seedBin("checklist", checklist),
      await seedBin("resource", resource),
    ];

    const result = await RecycleBinCommandHandler.permanentlyDeleteItems(items);

    expect(result.failed).toEqual([]);
    expect(result.deletedIds).toHaveLength(4);
    expect(await RecycleBinRepository.getRecycleBinItems()).toEqual([]);
  });

  it("reports partial failure and keeps failed items recoverable", async () => {
    const items = [
      await seedBin("task", task),
      await seedBin("habit", habit),
    ];

    // Fail only the bin write that happens while deleting the habit.
    (AsyncStorage.setItem as jest.Mock).mockImplementation(
      async (key: string, value: any) => {
        if (
          key === "pebble:v1:recycle_bin" &&
          !String(value).includes("h-purge")
        ) {
          throw new Error("Disk error during bin cleanup");
        }
        store[key] = String(value);
        return null;
      },
    );

    const result = await EntityCommandService.permanentlyDeleteRecycleBinItems(items);

    // The task delete committed; the habit fails and is NOT reported as deleted.
    expect(result.deletedIds).toHaveLength(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].entityId).toBe("h-purge");
    expect(result.failed[0].message).toContain("Disk error");

    const remaining = await RecycleBinRepository.getRecycleBinItems();
    expect(remaining.some((i) => i.entityId === "h-purge")).toBe(true);
    expect(remaining.some((i) => i.entityId === "t-purge")).toBe(false);
  });

  it("retries a partially failed batch without duplicating side effects", async () => {
    const binItem = await seedBin("habit", habit);

    (AsyncStorage.setItem as jest.Mock).mockImplementation(
      async (key: string, value: any) => {
        if (key === "pebble:v1:recycle_bin") {
          throw new Error("Disk error during bin cleanup");
        }
        store[key] = String(value);
        return null;
      },
    );

    const first = await EntityCommandService.permanentlyDeleteRecycleBinItems([
      binItem,
    ]);
    expect(first.failed).toHaveLength(1);
    expect(first.deletedIds).toEqual([]);

    (AsyncStorage.setItem as jest.Mock).mockImplementation(
      async (key: string, value: any) => {
        store[key] = String(value);
        return null;
      },
    );

    const pending = await RecycleBinRepository.getRecycleBinItems();
    const retry = await EntityCommandService.permanentlyDeleteRecycleBinItems(
      pending,
    );

    expect(retry.failed).toEqual([]);
    expect(retry.deletedIds).toEqual([binItem.id]);

    const tombstones = await TombstoneRepository.getTombstones();
    expect(tombstones.filter((t) => t.entityId === "h-purge")).toHaveLength(1);
  });

  it("treats an already purged item as deleted on retry", async () => {
    const binItem = await seedBin("task", task);

    // Simulate a concurrent purge that removed the bin entry first.
    await RecycleBinRepository.removeRecycleBinItems([binItem.id], {
      throwOnError: true,
    });

    const result = await EntityCommandService.permanentlyDeleteRecycleBinItems([
      binItem,
    ]);

    expect(result.deletedIds).toEqual([binItem.id]);
    expect(result.failed).toEqual([]);
  });
});
