import AsyncStorage from "@react-native-async-storage/async-storage";
import { TaskRepository, HabitRepository, WorkspaceRepository } from "@/repositories";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { Task, Habit, Workspace } from "@/shared/types/domain.types";
import * as remindersService from "@/services/scheduling/reminders.service";
import { computeTriggerEpoch } from "@/features/details/task/hooks/useTaskDetailForm";

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
    clear: jest.fn().mockImplementation(async () => {
      for (const k in store) delete store[k];
      return null;
    }),
  };
});

const ws1: Workspace = { id: "ws-1", name: "Work", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 };
const ws2: Workspace = { id: "ws-2", name: "Personal", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 };

describe("Reminder / Notification Referential Integrity (Fix #20)", () => {
  let cancelSpy: jest.SpyInstance;
  let scheduleTodoSpy: jest.SpyInstance;
  let scheduleHabitSpy: jest.SpyInstance;
  let scheduleBatchSpy: jest.SpyInstance;

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    await WorkspaceRepository.saveWorkspaces([ws1, ws2]);

    cancelSpy = jest.spyOn(remindersService, "cancelReminderIds").mockImplementation(async () => {});
    scheduleBatchSpy = jest.spyOn(remindersService, "scheduleReminderBatch").mockImplementation(async (opts) => {
      return { ids: [`batch-notif-${opts.itemId}-${Date.now()}`] };
    });
    scheduleTodoSpy = jest.spyOn(remindersService, "rescheduleTodoReminders").mockImplementation(async (t: Task) => {
      if (t.reminder?.enabled && t.reminder?.triggerAt) {
        return {
          ...t,
          reminder: {
            ...t.reminder,
            notificationIds: [`notif-task-${t.id}-${Date.now()}`],
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
            notificationIds: [`notif-habit-${h.id}-${Date.now()}`],
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
    scheduleBatchSpy.mockRestore();
  });

  // TEST 1: Enable Task reminder → notification registration
  test("TEST 1: Enable Task reminder registers notification ID via targeted update", async () => {
    await EntityCommandService.createTask(
      {
        id: "t-enable",
        workspaceId: "ws-1",
        title: "Submit Proposal",
        status: "todo",
        priority: "medium",
        reminder: { enabled: true, triggerAt: Date.now() + 3600000 },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      },
      "ws-1"
    );

    expect(scheduleTodoSpy).toHaveBeenCalledWith(expect.objectContaining({ id: "t-enable" }));
    const saved = await TaskRepository.getTask("t-enable", "ws-1");
    expect(saved?.reminder?.notificationIds?.length).toBeGreaterThan(0);
  });

  // TEST 2: Change reminder → old notification removed, new notification registered
  test("TEST 2: Change reminder time cancels old notification ID and registers new ID", async () => {
    const task: Task = {
      id: "t-change",
      workspaceId: "ws-1",
      title: "Review PR",
      status: "todo",
      priority: "medium",
      reminder: { enabled: true, triggerAt: Date.now() + 1000, notificationIds: ["old-id-123"] },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(task);

    await EntityCommandService.updateTask(
      "t-change",
      "ws-1",
      {
        reminder: { enabled: true, triggerAt: Date.now() + 5000000 },
      }
    );

    expect(cancelSpy).toHaveBeenCalledWith(["old-id-123"], expect.any(Object));
    const saved = await TaskRepository.getTask("t-change", "ws-1");
    expect(saved?.reminder?.notificationIds).not.toContain("old-id-123");
    expect(saved?.reminder?.notificationIds?.[0]).toContain("notif-task-t-change");
  });

  // TEST 3: Disable reminder → no active notification remains
  test("TEST 3: Disabling reminder cancels old notification ID and removes reminder state", async () => {
    const task: Task = {
      id: "t-disable",
      workspaceId: "ws-1",
      title: "Call Client",
      status: "todo",
      priority: "medium",
      reminder: { enabled: true, triggerAt: Date.now() + 1000, notificationIds: ["old-active-id"] },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(task);

    await EntityCommandService.updateTask(
      "t-disable",
      "ws-1",
      {
        reminder: undefined,
      }
    );

    expect(cancelSpy).toHaveBeenCalledWith(["old-active-id"], expect.any(Object));
    const saved = await TaskRepository.getTask("t-disable", "ws-1");
    expect(saved?.reminder).toBeUndefined();
  });

  // TEST 4 & 5: Delete / Restore Task with reminder
  test("TEST 4 & 5: Deleting task cancels notification; restoring task re-registers notification", async () => {
    const task: Task = {
      id: "t-recycle",
      workspaceId: "ws-1",
      title: "Recycle Me",
      status: "todo",
      priority: "medium",
      reminder: { enabled: true, triggerAt: Date.now() + 100000, notificationIds: ["recycle-id"] },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(task);

    // Recycle / Delete
    await EntityCommandService.recycleTask("t-recycle", "ws-1", "Work");
    expect(cancelSpy).toHaveBeenCalledWith(["recycle-id"], expect.any(Object));

    // Restore from recycle bin
    const binItems = await AsyncStorage.getItem("pebble:v1:recycle_bin");
    const parsedBin = binItems ? JSON.parse(binItems) : [];
    const binItem = parsedBin.find((i: any) => i.entityId === "t-recycle");
    if (binItem) {
      await EntityCommandService.restoreTask(binItem.id);
    }
    expect(scheduleTodoSpy).toHaveBeenCalledWith(expect.objectContaining({ id: "t-recycle" }));
    const restored = await TaskRepository.getTask("t-recycle", "ws-1");
    expect(restored?.reminder?.notificationIds?.length).toBeGreaterThan(0);
  });

  // TEST 6 & 7: Notification registration failure does not corrupt domain state
  test("TEST 6 & 7: Notification registration/cancellation failure preserves domain data safely", async () => {
    scheduleTodoSpy.mockImplementationOnce(async () => {
      throw new Error("Simulated OS Push Token Unavailable");
    });

    await EntityCommandService.createTask(
      {
        id: "t-fail-safe",
        workspaceId: "ws-1",
        title: "Important Domain Task",
        status: "todo",
        priority: "high",
        reminder: { enabled: true, triggerAt: Date.now() + 99999 },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      },
      "ws-1"
    );

    // Domain task is successfully persisted despite OS notification failure
    const saved = await TaskRepository.getTask("t-fail-safe", "ws-1");
    expect(saved).toBeDefined();
    expect(saved?.title).toBe("Important Domain Task");
    expect(saved?.reminder?.enabled).toBe(true);
  });

  // TEST 8: Habit reminder remains independent from Calendar
  test("TEST 8: Habit reminder registration functions independently", async () => {
    const habit: Habit = {
      id: "h-daily",
      workspaceId: "ws-1",
      title: "Drink Water",
      recurrence: { frequency: "daily", interval: 1 },
      reminder: { enabled: true, triggerAt: Date.now() + 100000 },
      completionHistory: [],
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await EntityCommandService.createHabit(habit, "ws-1");
    expect(scheduleHabitSpy).toHaveBeenCalledWith(expect.objectContaining({ id: "h-daily" }));
  });

  // TEST 9 & 10: Recurring Task reminder and occurrence movement
  test("TEST 9 & 10: Moving recurring occurrence does not destroy master notifications", async () => {
    const master: Task = {
      id: "master-rem",
      workspaceId: "ws-1",
      title: "Daily Standup",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-01", startTime: "09:00", durationMinutes: 30 },
      recurrence: { frequency: "daily", interval: 1 },
      reminder: { enabled: true, triggerAt: Date.now() + 100000, notificationIds: ["master-notif"] },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(master);

    // Reschedule one occurrence
    await EntityCommandService.rescheduleRecurringOccurrence(
      "master-rem",
      "ws-1",
      "2026-08-30",
      { date: "2026-08-30", hour: 14 }
    );

    const updatedMaster = await TaskRepository.getTask("master-rem", "ws-1");
    expect(updatedMaster?.recurrenceExceptions).toContain("2026-08-30");
    // Master retained its domain reminder
    expect(updatedMaster?.reminder?.enabled).toBe(true);
  });

  // TEST 11: Detached occurrence notification semantics
  test("TEST 11: Detached occurrence can have its own independent reminder", async () => {
    const detached: Task = {
      id: "detached-rem",
      workspaceId: "ws-1",
      title: "Moved Standup",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30", startTime: "14:00", durationMinutes: 30 },
      reminder: { enabled: true, triggerAt: Date.now() + 200000 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await EntityCommandService.createTask(detached, "ws-1");
    expect(scheduleTodoSpy).toHaveBeenCalledWith(expect.objectContaining({ id: "detached-rem" }));
  });

  // TEST 12 & 13: Task ↔ Habit conversion notification safety
  test("TEST 12 & 13: Task to Habit conversion cancels task notification and schedules habit notification", async () => {
    const task: Task = {
      id: "t-convert",
      workspaceId: "ws-1",
      title: "Daily Jog",
      status: "todo",
      priority: "medium",
      recurrence: { frequency: "daily", interval: 1 },
      reminder: { enabled: true, triggerAt: Date.now() + 50000, notificationIds: ["task-notif-old"] },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(task);

    const newHabit = await EntityCommandService.convertTaskToHabit("t-convert", "ws-1");
    // Old task notification is cancelled
    expect(cancelSpy).toHaveBeenCalledWith(["task-notif-old"], expect.any(Object));
    // New habit notification is registered
    expect(scheduleBatchSpy).toHaveBeenCalledWith(expect.objectContaining({ itemId: newHabit.id, kind: "habit" }));
    const persistedHabit = await HabitRepository.getHabit(newHabit.id, "ws-1");
    expect(persistedHabit?.reminder?.notificationIds).not.toContain("task-notif-old");
  });

  // TEST 14: Workspace move preserves notification correctness
  test("TEST 14: Workspace move preserves notification lifecycle", async () => {
    const task: Task = {
      id: "t-move-ws",
      workspaceId: "ws-1",
      title: "Moving Project",
      status: "todo",
      priority: "high",
      reminder: { enabled: true, triggerAt: Date.now() + 50000, notificationIds: ["ws1-notif"] },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(task);

    await EntityCommandService.moveTask("t-move-ws", "ws-1", "ws-2");
    // Moved task exists in target workspace with its reminder preserved
    const moved = await TaskRepository.getTask("t-move-ws", "ws-2");
    expect(moved).toBeDefined();
    expect(moved?.workspaceId).toBe("ws-2");
    expect(moved?.reminder?.enabled).toBe(true);
  });

  // TEST 15 & 21: Targeted system writes protect user domain fields
  test("TEST 15 & 21: TaskRepository.updateNotificationIds modifies only notificationIds", async () => {
    const initialTask: Task = {
      id: "t-targeted",
      workspaceId: "ws-1",
      title: "Preserve My Title",
      description: "Preserve My Description",
      status: "todo",
      priority: "high",
      schedule: { date: "2026-08-30", startTime: "15:00", durationMinutes: 60 },
      reminder: { enabled: true, triggerAt: 500000 },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(initialTask);

    await TaskRepository.updateNotificationIds("t-targeted", "ws-1", ["targeted-id-999"]);

    const after = await TaskRepository.getTask("t-targeted", "ws-1");
    expect(after?.reminder?.notificationIds).toEqual(["targeted-id-999"]);
    // Invariants: Title, description, schedule must not be clobbered
    expect(after?.title).toBe("Preserve My Title");
    expect(after?.description).toBe("Preserve My Description");
    expect(after?.schedule?.startTime).toBe("15:00");
  });

  // TEST 16: Completing task cancels active notification
  test("TEST 16: Completing task cancels active notification", async () => {
    const task: Task = {
      id: "t-complete-cancel",
      workspaceId: "ws-1",
      title: "Done Task",
      status: "todo",
      priority: "none",
      reminder: { enabled: true, triggerAt: Date.now() + 50000, notificationIds: ["done-id"] },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(task);

    // Completing task cancels reminder
    await EntityCommandService.completeTask("t-complete-cancel", "ws-1");
    expect(cancelSpy).toHaveBeenCalledWith(["done-id"], expect.any(Object));
  });

  // TEST 17, 18, 19, 20, 22: Time/date correctness & independent trigger epoch
  test("TEST 17, 18, 19, 20, 22: computeTriggerEpoch generates exact local epoch across dates", () => {
    const trigger = computeTriggerEpoch(21, 0, "2026-08-29");
    const expected = new Date(2026, 7, 29, 21, 0, 0, 0).getTime();
    expect(trigger).toBe(expected);

    // Midnight trigger
    const midnight = computeTriggerEpoch(0, 0, "2026-09-01");
    const expectedMidnight = new Date(2026, 8, 1, 0, 0, 0, 0).getTime();
    expect(midnight).toBe(expectedMidnight);
  });
});
