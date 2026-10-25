import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  TaskRepository,
  HabitRepository,
  WorkspaceRepository,
  RecycleBinRepository,
  MoveJournalRepository,
} from "@/repositories";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { MoveReconcilerService } from "@/services/storage/MoveReconcilerService";
import { Task, Habit, Workspace, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import * as remindersService from "@/services/scheduling/reminders.service";

jest.mock("@react-native-async-storage/async-storage", () => {
  const store: Record<string, string> = {};
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

const ws1: Workspace = { id: "ws-1", name: "Engineering", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 };
const ws2: Workspace = { id: "ws-2", name: "Product", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 };

describe("Recycle / Restore Transaction Recovery & Stale Protection (Fix #22)", () => {
  let cancelSpy: jest.SpyInstance;
  let scheduleTodoSpy: jest.SpyInstance;
  let scheduleHabitSpy: jest.SpyInstance;

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    await WorkspaceRepository.saveWorkspaces([ws1, ws2]);

    cancelSpy = jest.spyOn(remindersService, "cancelReminderIds").mockImplementation(async () => {});
    scheduleTodoSpy = jest.spyOn(remindersService, "rescheduleTodoReminders").mockImplementation(async (t: Task) => {
      if (t.reminder?.enabled && t.reminder?.triggerAt) {
        return {
          ...t,
          reminder: {
            ...t.reminder,
            notificationIds: [`notif-task-${t.id}`],
          },
        };
      }
      return t;
    });
    scheduleHabitSpy = jest.spyOn(remindersService, "rescheduleHabitReminders").mockImplementation(async (h: Habit) => {
      if (h.reminder?.enabled && h.reminder?.triggerAt) {
        return {
          ...h,
          reminder: {
            ...h.reminder,
            notificationIds: [`notif-habit-${h.id}`],
          },
        };
      }
      return h;
    });
  });

  afterEach(() => {
    cancelSpy.mockRestore();
    scheduleTodoSpy.mockRestore();
    scheduleHabitSpy.mockRestore();
  });

  // TEST 1: Recycle crash before snapshot write (intent exists, active exists, bin empty)
  test("TEST 1: Reconciler executes recycle when intent exists and active exists", async () => {
    const task: Task = {
      id: "t-crash-1",
      workspaceId: "ws-1",
      title: "Active Task",
      status: "todo",
      priority: "medium",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(task);

    // Journal records intent but process died before writing to RecycleBin
    await MoveJournalRepository.addOperation({
      operationId: "op-rec-1",
      operationType: "recycle",
      entityId: "t-crash-1",
      entityType: "task",
      sourceWorkspaceId: "ws-1",
      targetWorkspaceId: "ws-1",
      timestamp: Date.now(),
      lifecycleGeneration: 1,
      expectedRevision: 1,
    });

    await MoveReconcilerService.reconcileAll();

    // Active task is deleted
    const active = await TaskRepository.getTask("t-crash-1", "ws-1");
    expect(active).toBeNull();

    // Snapshot is safely in RecycleBin
    const bin = await RecycleBinRepository.getRecycleBinItems();
    const rbItem = bin.find((i) => i.entityId === "t-crash-1");
    expect(rbItem).toBeDefined();
    expect(JSON.parse(rbItem!.snapshot).title).toBe("Active Task");

    // Journal is cleared
    const ops = await MoveJournalRepository.getOperations();
    expect(ops.find((o) => o.operationId === "op-rec-1")).toBeUndefined();
  });

  // TEST 2: Recycle crash after snapshot write but before active delete (ghost in both)
  test("TEST 2: Reconciler resolves ghost duplicate by removing from active partition", async () => {
    const task: Task = {
      id: "t-crash-2",
      workspaceId: "ws-1",
      title: "Ghost Task",
      status: "todo",
      priority: "medium",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(task);
    await RecycleBinRepository.addToRecycleBin("task", task);

    await MoveJournalRepository.addOperation({
      operationId: "op-rec-2",
      operationType: "recycle",
      entityId: "t-crash-2",
      entityType: "task",
      sourceWorkspaceId: "ws-1",
      targetWorkspaceId: "ws-1",
      timestamp: Date.now(),
      lifecycleGeneration: 1,
      expectedRevision: 1,
    });

    await MoveReconcilerService.reconcileAll();

    // Active task removed
    const active = await TaskRepository.getTask("t-crash-2", "ws-1");
    expect(active).toBeNull();

    // Bin retained
    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.find((i) => i.entityId === "t-crash-2")).toBeDefined();
  });

  // TEST 4: Restore crash before active write (intent exists, bin exists, active missing)
  test("TEST 4: Reconciler completes restore when intent exists and item is in bin", async () => {
    const task: Task = {
      id: "t-crash-4",
      workspaceId: "ws-1",
      title: "Restoring Task",
      status: "todo",
      priority: "high",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await RecycleBinRepository.addToRecycleBin("task", task);

    await MoveJournalRepository.addOperation({
      operationId: "op-res-4",
      operationType: "restore",
      entityId: "t-crash-4",
      entityType: "task",
      sourceWorkspaceId: "ws-1",
      targetWorkspaceId: "ws-1",
      timestamp: Date.now(),
      lifecycleGeneration: 1,
      expectedRevision: 1,
    });

    await MoveReconcilerService.reconcileAll();

    // Active task restored
    const active = await TaskRepository.getTask("t-crash-4", "ws-1");
    expect(active).toBeDefined();
    expect(active?.title).toBe("Restoring Task");

    // Bin item removed
    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.find((i) => i.entityId === "t-crash-4")).toBeUndefined();
  });

  // TEST 5: Restore crash after active write but before bin removal (ghost duplicate in both)
  test("TEST 5: Reconciler resolves restore ghost duplicate by removing from bin", async () => {
    const task: Task = {
      id: "t-crash-5",
      workspaceId: "ws-1",
      title: "Restored Duplicate",
      status: "todo",
      priority: "low",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(task);
    await RecycleBinRepository.addToRecycleBin("task", task);

    await MoveJournalRepository.addOperation({
      operationId: "op-res-5",
      operationType: "restore",
      entityId: "t-crash-5",
      entityType: "task",
      sourceWorkspaceId: "ws-1",
      targetWorkspaceId: "ws-1",
      timestamp: Date.now(),
      lifecycleGeneration: 1,
      expectedRevision: 1,
    });

    await MoveReconcilerService.reconcileAll();

    // Active task preserved
    const active = await TaskRepository.getTask("t-crash-5", "ws-1");
    expect(active).toBeDefined();

    // Bin item removed
    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.find((i) => i.entityId === "t-crash-5")).toBeUndefined();
  });

  // TEST 15 & 16: Restore entity whose original workspace was deleted redirects to INBOX
  test("TEST 15 & 16: Reconciler redirects restore to INBOX when original workspace was deleted", async () => {
    const task: Task = {
      id: "t-del-ws",
      workspaceId: "ws-deleted",
      title: "Deleted Workspace Task",
      status: "todo",
      priority: "medium",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await RecycleBinRepository.addToRecycleBin("task", task);

    await MoveJournalRepository.addOperation({
      operationId: "op-res-deleted-ws",
      operationType: "restore",
      entityId: "t-del-ws",
      entityType: "task",
      sourceWorkspaceId: "ws-deleted",
      targetWorkspaceId: "ws-deleted",
      timestamp: Date.now(),
      lifecycleGeneration: 1,
      expectedRevision: 1,
    });

    await MoveReconcilerService.reconcileAll();

    // Entity is restored into INBOX_WORKSPACE_ID
    const inInbox = await TaskRepository.getTask("t-del-ws", INBOX_WORKSPACE_ID);
    expect(inInbox).toBeDefined();
    expect(inInbox?.workspaceId).toBe(INBOX_WORKSPACE_ID);
    expect(inInbox?.title).toBe("Deleted Workspace Task");
  });

  // TEST 23 & 24: Permanent delete is terminal and cannot be resurrected by stale reconciliation
  test("TEST 23 & 24: Missing entity in both active and recycle bin preserves safe state", async () => {
    await MoveJournalRepository.addOperation({
      operationId: "op-stale-perm",
      operationType: "restore",
      entityId: "t-missing",
      entityType: "task",
      sourceWorkspaceId: "ws-1",
      targetWorkspaceId: "ws-1",
      timestamp: Date.now(),
      lifecycleGeneration: 1,
      expectedRevision: 1,
    });

    await MoveReconcilerService.reconcileAll();

    // No phantom entity created in active
    const active = await TaskRepository.getTask("t-missing", "ws-1");
    expect(active).toBeNull();
  });
});
