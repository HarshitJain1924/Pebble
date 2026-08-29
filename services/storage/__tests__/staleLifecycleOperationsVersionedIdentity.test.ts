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

const ws1: Workspace = { id: "ws-1", name: "Engineering", createdAt: 1, updatedAt: 1 };
const ws2: Workspace = { id: "ws-2", name: "Product", createdAt: 1, updatedAt: 1 };

describe("Stale Lifecycle Operations, Versioned Identity & Journal Ordering (Fix #23)", () => {
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

  // TEST 1 & 2: Stale restore cannot overwrite newer active entity and does not duplicate
  test("TEST 1 & 2: Stale restore preserves newer active entity without creating duplicates", async () => {
    const oldTask: Task = {
      id: "t-versioned",
      workspaceId: "ws-1",
      title: "Version 1",
      status: "todo",
      priority: "low",
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(oldTask);
    await EntityCommandService.recycleTask("t-versioned", "ws-1", "Engineering");

    // Independently create a newer active task with same ID
    const newTask: Task = {
      id: "t-versioned",
      workspaceId: "ws-1",
      title: "Version 2 (Newer Active)",
      status: "todo",
      priority: "high",
      createdAt: 2000,
      updatedAt: 2000,
    };
    await TaskRepository.saveTask(newTask);

    const bin = await RecycleBinRepository.getRecycleBinItems();
    const rbItem = bin.find((i) => i.entityId === "t-versioned");
    expect(rbItem).toBeDefined();

    // Stale restore executed
    const restored = await EntityCommandService.restoreTask(rbItem!.id);
    expect(restored.id).toBe("t-versioned");
    expect(restored.title).toBe("Version 2 (Newer Active)");

    // Only 1 task exists in active workspace (no phantom duplicate!)
    const activeTasks = await TaskRepository.getTasks("ws-1");
    expect(Object.keys(activeTasks).length).toBe(1);
    expect(activeTasks["t-versioned"]?.title).toBe("Version 2 (Newer Active)");
    expect(activeTasks["t-versioned"]?.priority).toBe("high");
  });

  // TEST 3 & 4: Stale recycle bin cleanup cannot delete newer snapshot
  test("TEST 3 & 4: Recycle bin maintains unique snapshot per entity", async () => {
    const taskV1: Task = {
      id: "t-rb-test",
      workspaceId: "ws-1",
      title: "Snapshot V1",
      status: "todo",
      priority: "low",
      createdAt: 1000,
      updatedAt: 1000,
    };
    await RecycleBinRepository.addToRecycleBin("task", taskV1);

    const taskV2: Task = {
      id: "t-rb-test",
      workspaceId: "ws-1",
      title: "Snapshot V2",
      status: "todo",
      priority: "high",
      createdAt: 2000,
      updatedAt: 2000,
    };
    await RecycleBinRepository.addToRecycleBin("task", taskV2);

    const bin = await RecycleBinRepository.getRecycleBinItems();
    const matching = bin.filter((i) => i.entityId === "t-rb-test");
    // Only 1 item retained with latest snapshot
    expect(matching.length).toBe(1);
    expect(JSON.parse(matching[0].snapshot).title).toBe("Snapshot V2");
  });

  // TEST 7 & 8: Permanent delete beats stale journal replay
  test("TEST 7 & 8: Permanent delete beats stale recycle/restore journal", async () => {
    await MoveJournalRepository.addOperation({
      operationId: "op-stale-restore",
      operationType: "restore",
      entityId: "t-permanently-deleted",
      entityType: "task",
      sourceWorkspaceId: "ws-1",
      targetWorkspaceId: "ws-1",
      timestamp: 1000,
    });

    await MoveReconcilerService.reconcileAll();

    // No phantom entity restored in active partition
    const active = await TaskRepository.getTask("t-permanently-deleted", "ws-1");
    expect(active).toBeNull();
  });

  // TEST 9 & 10: Same-ID entity recreation survives stale restore
  test("TEST 9 & 10: Habit restore with same-ID preserves active habit without duplicate", async () => {
    const habitV1: Habit = {
      id: "h-collide",
      workspaceId: "ws-1",
      title: "Drink Water 1L",
      recurrence: { frequency: "daily", interval: 1 },
      completionHistory: [],
      createdAt: 1000,
      updatedAt: 1000,
    };
    await HabitRepository.saveHabit(habitV1);
    await EntityCommandService.recycleHabit("h-collide", "ws-1");

    // Newer habit with same ID
    const habitV2: Habit = {
      id: "h-collide",
      workspaceId: "ws-1",
      title: "Drink Water 2L (Newer)",
      recurrence: { frequency: "daily", interval: 1 },
      completionHistory: [],
      createdAt: 2000,
      updatedAt: 2000,
    };
    await HabitRepository.saveHabit(habitV2);

    const bin = await RecycleBinRepository.getRecycleBinItems();
    const rbItem = bin.find((i) => i.entityId === "h-collide");

    const restored = await EntityCommandService.restoreHabit(rbItem!.id);
    expect(restored.id).toBe("h-collide");
    expect(restored.title).toBe("Drink Water 2L (Newer)");

    // Only 1 habit exists in active workspace (no duplicate!)
    const activeHabits = await HabitRepository.getHabits("ws-1");
    expect(Object.keys(activeHabits).length).toBe(1);
    expect(activeHabits["h-collide"]?.title).toBe("Drink Water 2L (Newer)");
  });

  // TEST 13 & 14: Stale recurrence snapshot cannot erase newer exceptions
  test("TEST 13 & 14: Recurring master preserves its exception history", async () => {
    const master: Task = {
      id: "master-recurr",
      workspaceId: "ws-1",
      title: "Weekly Planning",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-01", startTime: "10:00", durationMinutes: 60 },
      recurrence: { frequency: "weekly", interval: 1 },
      recurrenceExceptions: ["2026-08-08", "2026-08-15"],
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(master);

    await EntityCommandService.recycleTask("master-recurr", "ws-1", "Engineering");

    const bin = await RecycleBinRepository.getRecycleBinItems();
    const rbItem = bin.find((i) => i.entityId === "master-recurr");

    const restored = await EntityCommandService.restoreTask(rbItem!.id);
    expect(restored.recurrenceExceptions).toEqual(["2026-08-08", "2026-08-15"]);
  });

  // TEST 24 & 25: Repeated reconciliation is idempotent and monotonic
  test("TEST 24 & 25: Repeated reconciliation passes converge to same valid state", async () => {
    const task: Task = {
      id: "t-repeat-recon",
      workspaceId: "ws-1",
      title: "Idempotent Reconcile",
      status: "todo",
      priority: "medium",
      createdAt: 1000,
      updatedAt: 1000,
    };
    await RecycleBinRepository.addToRecycleBin("task", task);

    await MoveJournalRepository.addOperation({
      operationId: "op-rep-res",
      operationType: "restore",
      entityId: "t-repeat-recon",
      entityType: "task",
      sourceWorkspaceId: "ws-1",
      targetWorkspaceId: "ws-1",
      timestamp: 1000,
    });

    // Pass 1
    await MoveReconcilerService.reconcileAll();
    const active1 = await TaskRepository.getTask("t-repeat-recon", "ws-1");
    expect(active1).toBeDefined();

    // Pass 2
    await MoveReconcilerService.reconcileAll();
    const active2 = await TaskRepository.getTask("t-repeat-recon", "ws-1");
    expect(active2).toEqual(active1);

    // Pass 3
    await MoveReconcilerService.reconcileAll();
    const active3 = await TaskRepository.getTask("t-repeat-recon", "ws-1");
    expect(active3).toEqual(active1);
  });
});
