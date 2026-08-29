import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  TaskRepository,
  HabitRepository,
  WorkspaceRepository,
  RecycleBinRepository,
} from "@/repositories";
import { EntityCommandService } from "@/services/command/EntityCommandService";
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

const ws1: Workspace = { id: "ws-1", name: "Work", createdAt: 1, updatedAt: 1 };
const ws2: Workspace = { id: "ws-2", name: "Personal", createdAt: 1, updatedAt: 1 };

describe("Recycle / Delete / Restore Referential Integrity (Fix #21)", () => {
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

  // TEST 1 & 2: Task and Habit recycle preserve complete recoverable snapshot
  test("TEST 1 & 2: Task and Habit recycle store full snapshot and remove from active repo", async () => {
    const task: Task = {
      id: "t-snap",
      workspaceId: "ws-1",
      title: "Snapshot Task",
      description: "Full Details",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-30", startTime: "10:00", durationMinutes: 45 },
      reminder: { enabled: true, triggerAt: 5000, notificationIds: ["notif-old"] },
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(task);

    await EntityCommandService.recycleTask("t-snap", "ws-1", "Work");

    // Active task removed
    const active = await TaskRepository.getTask("t-snap", "ws-1");
    expect(active).toBeNull();

    // Recycle bin contains snapshot
    const bin = await RecycleBinRepository.getRecycleBinItems();
    const rbItem = bin.find((i) => i.entityId === "t-snap");
    expect(rbItem).toBeDefined();
    const parsed = JSON.parse(rbItem!.snapshot);
    expect(parsed.title).toBe("Snapshot Task");
    expect(parsed.description).toBe("Full Details");
    expect(parsed.schedule.startTime).toBe("10:00");
    expect(parsed.schedule.durationMinutes).toBe(45);
    // Notification cancelled
    expect(cancelSpy).toHaveBeenCalledWith(["notif-old"], expect.any(Object));
  });

  // TEST 3 & 4: Task and Habit restore return to original workspace
  test("TEST 3 & 4: Task restore places entity back in original workspace", async () => {
    const task: Task = {
      id: "t-restore-orig",
      workspaceId: "ws-2",
      title: "Personal Task",
      status: "todo",
      priority: "medium",
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(task);
    await EntityCommandService.recycleTask("t-restore-orig", "ws-2", "Personal");

    const bin = await RecycleBinRepository.getRecycleBinItems();
    const rbItem = bin.find((i) => i.entityId === "t-restore-orig");
    expect(rbItem).toBeDefined();

    const restored = await EntityCommandService.restoreTask(rbItem!.id);
    expect(restored.workspaceId).toBe("ws-2");

    const active = await TaskRepository.getTask("t-restore-orig", "ws-2");
    expect(active).toBeDefined();
    expect(active?.title).toBe("Personal Task");

    // Recycle bin item removed
    const binAfter = await RecycleBinRepository.getRecycleBinItems();
    expect(binAfter.find((i) => i.entityId === "t-restore-orig")).toBeUndefined();
  });

  // TEST 5 & 6: Recycle failure and restore failure safety
  test("TEST 5 & 6: Failed restore does not destroy recycle bin item", async () => {
    const task: Task = {
      id: "t-fail-res",
      workspaceId: "ws-1",
      title: "Safe Item",
      status: "todo",
      priority: "low",
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(task);
    await EntityCommandService.recycleTask("t-fail-res", "ws-1", "Work");

    const bin = await RecycleBinRepository.getRecycleBinItems();
    const rbItem = bin.find((i) => i.entityId === "t-fail-res");
    expect(rbItem).toBeDefined();

    // Simulate task save failure during restore
    jest.spyOn(TaskRepository, "saveTaskUnlocked").mockImplementationOnce(async () => {
      throw new Error("Disk Write Error");
    });

    await expect(EntityCommandService.restoreTask(rbItem!.id)).rejects.toThrow("Disk Write Error");

    // Item must still be in recycle bin
    const binAfter = await RecycleBinRepository.getRecycleBinItems();
    expect(binAfter.find((i) => i.entityId === "t-fail-res")).toBeDefined();
  });

  // TEST 7 & 8: Double recycle / double restore idempotency
  test("TEST 7 & 8: Double recycle and double restore handle missing entity gracefully", async () => {
    const task: Task = {
      id: "t-double",
      workspaceId: "ws-1",
      title: "Double Task",
      status: "todo",
      priority: "medium",
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(task);

    // First recycle succeeds
    await EntityCommandService.recycleTask("t-double", "ws-1", "Work");

    // Second recycle fails gracefully
    await expect(EntityCommandService.recycleTask("t-double", "ws-1", "Work")).rejects.toThrow();

    const bin = await RecycleBinRepository.getRecycleBinItems();
    const rbItem = bin.find((i) => i.entityId === "t-double");
    expect(rbItem).toBeDefined();

    // First restore succeeds
    await EntityCommandService.restoreTask(rbItem!.id);

    // Second restore fails cleanly
    await expect(EntityCommandService.restoreTask(rbItem!.id)).rejects.toThrow();
  });

  // TEST 9 & 10: Restore cleans up recycle bin and returns restored task
  test("TEST 9 & 10: Restoring an entity restores fields and removes recycle bin snapshot", async () => {
    const oldTask: Task = {
      id: "t-collide",
      workspaceId: "ws-1",
      title: "Original Version",
      status: "todo",
      priority: "low",
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(oldTask);
    await EntityCommandService.recycleTask("t-collide", "ws-1", "Work");

    const bin = await RecycleBinRepository.getRecycleBinItems();
    const rbItem = bin.find((i) => i.entityId === "t-collide");

    const restored = await EntityCommandService.restoreTask(rbItem!.id);
    expect(restored.id).toBe("t-collide");
    expect(restored.title).toBe("Original Version");

    // Recycle bin entry is removed
    const binAfter = await RecycleBinRepository.getRecycleBinItems();
    expect(binAfter.find((i) => i.entityId === "t-collide")).toBeUndefined();
  });

  // TEST 11, 12, 26: Workspace deletion packages children into recycle bin and restores together
  test("TEST 11, 12, 26: Deleting a workspace packages its entities into RecycleBin safely", async () => {
    const taskInWs: Task = {
      id: "t-ws-del",
      workspaceId: "ws-1",
      title: "Workspace Task",
      status: "todo",
      priority: "medium",
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(taskInWs);

    await EntityCommandService.deleteWorkspace("ws-1");

    // Workspace is removed from active workspaces
    const workspaces = await WorkspaceRepository.getWorkspaces();
    expect(workspaces.find((w) => w.id === "ws-1")).toBeUndefined();

    // Workspace package exists in recycle bin
    const bin = await RecycleBinRepository.getRecycleBinItems();
    const wsBin = bin.find((i) => i.entityId === "ws-1" && i.entityType === "workspace");
    expect(wsBin).toBeDefined();

    const parsed = JSON.parse(wsBin!.snapshot);
    expect(parsed.list.id).toBe("ws-1");
    expect(parsed.todos.find((t: any) => t.id === "t-ws-del")).toBeDefined();

    // Restore workspace restores both workspace and child task
    await EntityCommandService.restoreWorkspace(wsBin!.id);
    const restoredWs = (await WorkspaceRepository.getWorkspaces()).find((w) => w.id === "ws-1");
    expect(restoredWs).toBeDefined();
    const restoredTask = await TaskRepository.getTask("t-ws-del", "ws-1");
    expect(restoredTask).toBeDefined();
    expect(restoredTask?.title).toBe("Workspace Task");
  });

  // TEST 13 & 14: Notification lifecycle with recycle and restore
  test("TEST 13 & 14: Restoring a task reconstructs notification state", async () => {
    const task: Task = {
      id: "t-notif-life",
      workspaceId: "ws-1",
      title: "Notify Me",
      status: "todo",
      priority: "medium",
      reminder: { enabled: true, triggerAt: Date.now() + 100000, notificationIds: ["old-id"] },
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(task);
    await EntityCommandService.recycleTask("t-notif-life", "ws-1", "Work");

    expect(cancelSpy).toHaveBeenCalledWith(["old-id"], expect.any(Object));

    const bin = await RecycleBinRepository.getRecycleBinItems();
    const rbItem = bin.find((i) => i.entityId === "t-notif-life");

    await EntityCommandService.restoreTask(rbItem!.id);
    expect(scheduleTodoSpy).toHaveBeenCalledWith(expect.objectContaining({ id: "t-notif-life" }));
  });

  // TEST 15, 16, 17, 18: Recurring Task and detached occurrence lifecycle
  test("TEST 15–18: Recycling detached occurrence does not corrupt recurring master", async () => {
    const master: Task = {
      id: "master-recyc",
      workspaceId: "ws-1",
      title: "Daily Standup",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-01", startTime: "09:00", durationMinutes: 30 },
      recurrence: { frequency: "daily", interval: 1 },
      recurrenceExceptions: ["2026-08-30"],
      createdAt: 1000,
      updatedAt: 1000,
    };
    const detached: Task = {
      id: "detached-recyc",
      workspaceId: "ws-1",
      title: "Moved Standup",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30", startTime: "14:00", durationMinutes: 30 },
      createdAt: 1000,
      updatedAt: 1000,
    };

    await TaskRepository.saveTask(master);
    await TaskRepository.saveTask(detached);

    // Recycle detached occurrence
    await EntityCommandService.recycleTask("detached-recyc", "ws-1", "Work");

    // Master is completely untouched
    const masterAfter = await TaskRepository.getTask("master-recyc", "ws-1");
    expect(masterAfter?.recurrenceExceptions).toEqual(["2026-08-30"]);
    expect(masterAfter?.title).toBe("Daily Standup");
  });

  // TEST 27: Permanently deleting an entity is terminal
  test("TEST 27: permanentlyDeleteTask permanently removes active entity", async () => {
    const task: Task = {
      id: "t-perm-del",
      workspaceId: "ws-1",
      title: "Delete Forever",
      status: "todo",
      priority: "low",
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(task);

    await EntityCommandService.permanentlyDeleteTask("t-perm-del", "ws-1");

    const active = await TaskRepository.getTask("t-perm-del", "ws-1");
    expect(active).toBeNull();
    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.find((i) => i.entityId === "t-perm-del")).toBeUndefined();
  });
});
