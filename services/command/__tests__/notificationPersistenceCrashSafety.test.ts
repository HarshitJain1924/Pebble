import { EntityCommandService } from "../EntityCommandService";
import { TaskRepository } from "@/repositories/TaskRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { NotificationReconcilerService } from "@/services/notifications/NotificationReconcilerService";
import * as Notifications from "expo-notifications";
import { Task, Habit, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";

const mockStore = new Map<string, string>();

let mockScheduledOsNotifications: Array<{
  identifier: string;
  content: { data: any; title?: string; body?: string };
  trigger?: any;
}> = [];

jest.mock("@react-native-async-storage/async-storage", () => ({
  setItem: jest.fn().mockImplementation(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  getItem: jest.fn().mockImplementation(async (key: string) => {
    return mockStore.get(key) || null;
  }),
  removeItem: jest.fn().mockImplementation(async (key: string) => {
    mockStore.delete(key);
  }),
  multiGet: jest.fn().mockImplementation(async (keys: string[]) => {
    return keys.map((k) => [k, mockStore.get(k) || null]);
  }),
  multiSet: jest.fn().mockImplementation(async (pairs: [string, string][]) => {
    for (const [key, value] of pairs) {
      mockStore.set(key, value);
    }
  }),
  multiRemove: jest.fn().mockImplementation(async (keys: string[]) => {
    for (const k of keys) mockStore.delete(k);
  }),
  getAllKeys: jest.fn().mockImplementation(async () => {
    return Array.from(mockStore.keys());
  }),
  clear: jest.fn().mockImplementation(async () => {
    mockStore.clear();
  }),
}));

jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: jest.fn().mockImplementation(async (req: any) => {
    const id = `os-notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    mockScheduledOsNotifications.push({
      identifier: id,
      content: req.content,
      trigger: req.trigger,
    });
    return id;
  }),
  cancelScheduledNotificationAsync: jest.fn().mockImplementation(async (id: string) => {
    mockScheduledOsNotifications = mockScheduledOsNotifications.filter(
      (n) => n.identifier !== id
    );
  }),
  getAllScheduledNotificationsAsync: jest.fn().mockImplementation(async () => {
    return [...mockScheduledOsNotifications];
  }),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: {
    DATE: "date",
    DAILY: "daily",
    WEEKLY: "weekly",
    MONTHLY: "monthly",
    TIME_INTERVAL: "timeInterval",
  },
}));

describe("Fix #24: Crash-Safe Entity Creation/Update + Notification Scheduling", () => {
  const createMockTaskInput = (title: string, triggerAt?: number): any => ({
    title,
    status: "todo",
    priority: "medium",
    categoryId: "work",
    schedule: { date: "inbox" },
    reminder: triggerAt ? { enabled: true, triggerAt } : undefined,
  });

  const createMockHabitInput = (title: string, triggerAt?: number): any => ({
    title,
    categoryId: "health",
    recurrence: { frequency: "daily", interval: 1 },
    reminder: triggerAt ? { enabled: true, triggerAt } : undefined,
  });

  beforeEach(async () => {
    mockStore.clear();
    mockScheduledOsNotifications = [];
    jest.clearAllMocks();

    (Notifications.scheduleNotificationAsync as jest.Mock).mockImplementation(async (req: any) => {
      const id = `os-notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      mockScheduledOsNotifications.push({
        identifier: id,
        content: req.content,
        trigger: req.trigger,
      });
      return id;
    });

    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockImplementation(async (id: string) => {
      mockScheduledOsNotifications = mockScheduledOsNotifications.filter(
        (n) => n.identifier !== id
      );
    });

    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockImplementation(async () => {
      return [...mockScheduledOsNotifications];
    });

    // Seed default inbox workspace
    await WorkspaceRepository.saveWorkspace({
      id: INBOX_WORKSPACE_ID,
      name: "Inbox",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. TASK CREATION WITH REMINDER: NOTIFICATION SCHEDULING FAILS
  // ───────────────────────────────────────────────────────────────────────────
  it("1. Task creation with reminder: domain entity persists even if notification scheduling fails", async () => {
    // Force OS notification scheduling to throw
    (Notifications.scheduleNotificationAsync as jest.Mock).mockRejectedValueOnce(
      new Error("Expo native bridge unavailable")
    );

    const futureTime = Date.now() + 3600000;
    const taskInput = createMockTaskInput("Pay Bills", futureTime);

    // Command should succeed and not throw
    const created = await EntityCommandService.createTask(taskInput, INBOX_WORKSPACE_ID);

    expect(created).toBeDefined();
    expect(created.title).toBe("Pay Bills");
    expect(created.reminder?.enabled).toBe(true);
    expect(created.reminder?.triggerAt).toBe(futureTime);
    // Notification IDs must NOT contain fake/bogus values
    expect(created.reminder?.notificationIds).toBeUndefined();

    // Verify it is durably persisted in storage
    const persisted = await TaskRepository.getTask(created.id, INBOX_WORKSPACE_ID);
    expect(persisted).toBeDefined();
    expect(persisted?.id).toBe(created.id);
    expect(persisted?.title).toBe("Pay Bills");
    expect(persisted?.reminder?.notificationIds).toBeUndefined();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. HABIT CREATION WITH REMINDER: NOTIFICATION SCHEDULING FAILS
  // ───────────────────────────────────────────────────────────────────────────
  it("2. Habit creation with reminder: domain entity persists even if notification scheduling fails", async () => {
    (Notifications.scheduleNotificationAsync as jest.Mock).mockRejectedValueOnce(
      new Error("OS permission denied")
    );

    const futureTime = Date.now() + 3600000;
    const habitInput = createMockHabitInput("Morning Run", futureTime);

    const created = await EntityCommandService.createHabit(habitInput, INBOX_WORKSPACE_ID);

    expect(created).toBeDefined();
    expect(created.title).toBe("Morning Run");
    expect(created.reminder?.enabled).toBe(true);
    expect(created.reminder?.notificationIds).toBeUndefined();

    const persisted = await HabitRepository.getHabit(created.id, INBOX_WORKSPACE_ID);
    expect(persisted).toBeDefined();
    expect(persisted?.id).toBe(created.id);
    expect(persisted?.title).toBe("Morning Run");
    expect(persisted?.reminder?.notificationIds).toBeUndefined();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. NOTIFICATION SCHEDULING SUCCEEDS: NOTIFICATION ID PERSISTED CORRECTLY
  // ───────────────────────────────────────────────────────────────────────────
  it("3. Notification scheduling succeeds: notification ID is persisted correctly on Task and Habit", async () => {
    const futureTime = Date.now() + 7200000;

    // Task
    const task = await EntityCommandService.createTask(
      createMockTaskInput("Submit Tax", futureTime),
      INBOX_WORKSPACE_ID
    );

    expect(task.reminder?.notificationIds).toBeDefined();
    expect(task.reminder?.notificationIds?.length).toBeGreaterThan(0);

    const persistedTask = await TaskRepository.getTask(task.id, INBOX_WORKSPACE_ID);
    expect(persistedTask?.reminder?.notificationIds).toEqual(
      task.reminder?.notificationIds
    );

    // Habit
    const habit = await EntityCommandService.createHabit(
      createMockHabitInput("Evening Reading", futureTime),
      INBOX_WORKSPACE_ID
    );

    expect(habit.reminder?.notificationIds).toBeDefined();
    expect(habit.reminder?.notificationIds?.length).toBeGreaterThan(0);

    const persistedHabit = await HabitRepository.getHabit(habit.id, INBOX_WORKSPACE_ID);
    expect(persistedHabit?.reminder?.notificationIds).toEqual(
      habit.reminder?.notificationIds
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. NOTIFICATION SCHEDULING FAILS: NO BOGUS NOTIFICATION ID PERSISTED
  // ───────────────────────────────────────────────────────────────────────────
  it("4. Notification scheduling fails: no bogus notification ID is persisted", async () => {
    (Notifications.scheduleNotificationAsync as jest.Mock).mockImplementation(() => {
      throw new Error("Disk quota exceeded for notification service");
    });

    const task = await EntityCommandService.createTask(
      createMockTaskInput("Safe Task", Date.now() + 100000),
      INBOX_WORKSPACE_ID
    );

    const storedTask = await TaskRepository.getTask(task.id, INBOX_WORKSPACE_ID);
    expect(storedTask?.reminder?.notificationIds).toBeUndefined();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. EXISTING REMINDER UPDATE: OLD NOTIFICATION CANCELLED & REPLACED
  // ───────────────────────────────────────────────────────────────────────────
  it("5. Existing reminder update: old notification is cancelled and replaced correctly", async () => {
    const time1 = Date.now() + 3600000;
    const task = await EntityCommandService.createTask(
      createMockTaskInput("Call Doctor", time1),
      INBOX_WORKSPACE_ID
    );

    const initialNotifIds = task.reminder?.notificationIds || [];
    expect(initialNotifIds.length).toBeGreaterThan(0);
    expect(mockScheduledOsNotifications.some((n) => initialNotifIds.includes(n.identifier))).toBe(true);

    // Update reminder to a new time
    const time2 = Date.now() + 7200000;
    const updated = await EntityCommandService.updateTask(
      task.id,
      INBOX_WORKSPACE_ID,
      {
        reminder: { enabled: true, triggerAt: time2 },
      }
    );

    expect(updated.reminder?.triggerAt).toBe(time2);
    const newNotifIds = updated.reminder?.notificationIds || [];
    expect(newNotifIds.length).toBeGreaterThan(0);
    expect(newNotifIds).not.toEqual(initialNotifIds);

    // Verify old OS notifications were cancelled
    for (const oldId of initialNotifIds) {
      expect(mockScheduledOsNotifications.some((n) => n.identifier === oldId)).toBe(false);
    }
    // Verify new OS notifications exist
    for (const newId of newNotifIds) {
      expect(mockScheduledOsNotifications.some((n) => n.identifier === newId)).toBe(true);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. PERSISTENCE FAILURE AFTER NOTIFICATION SCHEDULING: RECOVERABLE VIA RECONCILER
  // ───────────────────────────────────────────────────────────────────────────
  it("6. Persistence failure after notification scheduling: deterministic recovery by NotificationReconcilerService", async () => {
    // Model the exact failure scenario:
    // 1. Task domain persistence succeeds.
    // 2. Notification scheduling in OS succeeds.
    // 3. updateNotificationIds (or AsyncStorage persistence of IDs) fails.

    const updateNotifIdsSpy = jest
      .spyOn(TaskRepository, "updateNotificationIds")
      .mockRejectedValueOnce(new Error("AsyncStorage write error for notificationIds"));

    const triggerAt = Date.now() + 5000000;
    const task = await EntityCommandService.createTask(
      createMockTaskInput("Resilient Task", triggerAt),
      INBOX_WORKSPACE_ID
    );

    // The task itself was saved before updateNotificationIds failed
    const storedTask = await TaskRepository.getTask(task.id, INBOX_WORKSPACE_ID);
    expect(storedTask).toBeDefined();
    expect(storedTask?.title).toBe("Resilient Task");
    expect(storedTask?.reminder?.triggerAt).toBe(triggerAt);

    updateNotifIdsSpy.mockRestore();

    // At this point, the task in domain state has no notificationIds (or missing).
    // Now run the periodic / on-launch NotificationReconcilerService:
    await NotificationReconcilerService.reconcileAll();

    // After reconciliation, the task's notificationIds are repaired safely
    const healedTask = await TaskRepository.getTask(task.id, INBOX_WORKSPACE_ID);
    expect(healedTask?.reminder?.notificationIds).toBeDefined();
    expect(healedTask?.reminder?.notificationIds?.length).toBeGreaterThan(0);
    // And exactly matching OS scheduled notification exists
    const osNotifs = await Notifications.getAllScheduledNotificationsAsync();
    expect(
      osNotifs.some((n) => healedTask?.reminder?.notificationIds?.includes(n.identifier))
    ).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. RETRY AFTER NOTIFICATION FAILURE: RECONCILIATION SUCCEEDS WITHOUT DUPLICATING
  // ───────────────────────────────────────────────────────────────────────────
  it("7. Retry after notification failure: reconciliation succeeds without duplicating notifications", async () => {
    // Task created with scheduling completely failing:
    (Notifications.scheduleNotificationAsync as jest.Mock).mockRejectedValueOnce(
      new Error("OS offline")
    );

    const triggerAt = Date.now() + 10000000;
    const task = await EntityCommandService.createTask(
      createMockTaskInput("Retry Task", triggerAt),
      INBOX_WORKSPACE_ID
    );

    expect(mockScheduledOsNotifications.length).toBe(0);

    // Now OS is online, run reconciliation pass 1:
    await NotificationReconcilerService.reconcileAll();

    const reconciledTask1 = await TaskRepository.getTask(task.id, INBOX_WORKSPACE_ID);
    expect(reconciledTask1?.reminder?.notificationIds?.length).toBeGreaterThan(0);
    const osCountAfterPass1 = mockScheduledOsNotifications.length;
    expect(osCountAfterPass1).toBeGreaterThan(0);

    // Run reconciliation pass 2 (idempotency check):
    await NotificationReconcilerService.reconcileAll();

    // Should NOT duplicate notifications in OS or change domain IDs
    expect(mockScheduledOsNotifications.length).toBe(osCountAfterPass1);
    const reconciledTask2 = await TaskRepository.getTask(task.id, INBOX_WORKSPACE_ID);
    expect(reconciledTask2?.reminder?.notificationIds).toEqual(
      reconciledTask1?.reminder?.notificationIds
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. CONCURRENT / STALE ENTITY UPDATE: RECONCILIATION CANNOT OVERWRITE NEWER FIELDS
  // ───────────────────────────────────────────────────────────────────────────
  it("8. Concurrent/stale entity update: targeted notification write preserves newer user fields & revisions", async () => {
    const task = await EntityCommandService.createTask(
      createMockTaskInput("Original Title", Date.now() + 5000000),
      INBOX_WORKSPACE_ID
    );

    // User updates task title concurrently
    const updated = await EntityCommandService.updateTask(
      task.id,
      INBOX_WORKSPACE_ID,
      {
        title: "User Modified Title",
        priority: "high",
      }
    );

    expect(updated.title).toBe("User Modified Title");
    expect(updated.priority).toBe("high");
    const revAfterUpdate = updated.revision;

    // Targeted notification update runs with expected snapshot matching updated task
    const result = await TaskRepository.updateNotificationIds(
      task.id,
      INBOX_WORKSPACE_ID,
      ["targeted-notif-id-42"],
      {
        reminder: updated.reminder,
        status: updated.status,
        archivedAt: updated.archivedAt,
        revision: revAfterUpdate,
        updatedAt: updated.updatedAt,
      }
    );

    expect(result).toBe("updated");

    const finalTask = await TaskRepository.getTask(task.id, INBOX_WORKSPACE_ID);
    expect(finalTask?.title).toBe("User Modified Title");
    expect(finalTask?.priority).toBe("high");
    expect(finalTask?.revision).toBe(revAfterUpdate); // Targeted update did NOT increment revision
    expect(finalTask?.reminder?.notificationIds).toEqual(["targeted-notif-id-42"]);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. TOMBSTONED / DELETED ENTITY: RECONCILIATION CANNOT RECREATE NOTIFICATIONS
  // ───────────────────────────────────────────────────────────────────────────
  it("9. Tombstoned / permanently deleted entity: reconciliation cannot recreate its notification", async () => {
    const task = await EntityCommandService.createTask(
      createMockTaskInput("To Be Deleted", Date.now() + 5000000),
      INBOX_WORKSPACE_ID
    );

    expect(mockScheduledOsNotifications.length).toBeGreaterThan(0);

    // Permanently delete task
    await EntityCommandService.permanentlyDeleteTask(task.id, INBOX_WORKSPACE_ID);

    // Verify OS notifications were cancelled upon deletion
    expect(mockScheduledOsNotifications.length).toBe(0);

    // Run reconciliation pass
    await NotificationReconcilerService.reconcileAll();

    // Reconciler must NOT recreate notification for deleted entity
    expect(mockScheduledOsNotifications.length).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 10. RESTORE: RESTORED ENTITY GETS NOTIFICATION STATE RECONCILED SAFELY
  // ───────────────────────────────────────────────────────────────────────────
  it("10. Restore: restored entity gets notification state reconciled from canonical domain state", async () => {
    const triggerAt = Date.now() + 6000000;
    const task = await EntityCommandService.createTask(
      createMockTaskInput("Recycle Me", triggerAt),
      INBOX_WORKSPACE_ID
    );

    // Recycle task
    await EntityCommandService.recycleTask(task.id, INBOX_WORKSPACE_ID, "Inbox");
    expect(mockScheduledOsNotifications.length).toBe(0);

    // Restore task
    const restored = await EntityCommandService.restoreTask(task.id);
    expect(restored).toBeDefined();
    expect(restored.title).toBe("Recycle Me");
    expect(restored.reminder?.enabled).toBe(true);
    expect(restored.reminder?.triggerAt).toBe(triggerAt);

    // Fresh notification scheduled after restore
    expect(mockScheduledOsNotifications.length).toBeGreaterThan(0);
    const persisted = await TaskRepository.getTask(task.id, INBOX_WORKSPACE_ID);
    expect(persisted?.reminder?.notificationIds).toEqual(
      restored.reminder?.notificationIds
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 11. HABIT AND TASK PARITY
  // ───────────────────────────────────────────────────────────────────────────
  it("11. Habit and Task parity: both follow identical ordering, persistence guarantees, and recovery", async () => {
    const triggerAt = Date.now() + 8000000;

    // Task with reminder
    const task = await EntityCommandService.createTask(
      createMockTaskInput("Parity Task", triggerAt),
      INBOX_WORKSPACE_ID
    );

    // Habit with reminder
    const habit = await EntityCommandService.createHabit(
      createMockHabitInput("Parity Habit", triggerAt),
      INBOX_WORKSPACE_ID
    );

    expect(task.reminder?.notificationIds?.length).toBeGreaterThan(0);
    expect(habit.reminder?.notificationIds?.length).toBeGreaterThan(0);

    // Update both
    const newTrigger = Date.now() + 9000000;
    const updatedTask = await EntityCommandService.updateTask(
      task.id,
      INBOX_WORKSPACE_ID,
      { reminder: { enabled: true, triggerAt: newTrigger } }
    );
    const updatedHabit = await EntityCommandService.updateHabit(
      habit.id,
      INBOX_WORKSPACE_ID,
      { reminder: { enabled: true, triggerAt: newTrigger } }
    );

    expect(updatedTask.reminder?.triggerAt).toBe(newTrigger);
    expect(updatedHabit.reminder?.triggerAt).toBe(newTrigger);
    expect(updatedTask.reminder?.notificationIds).toBeDefined();
    expect(updatedHabit.reminder?.notificationIds).toBeDefined();

    // Verify reconciliation maintains both without errors
    await expect(NotificationReconcilerService.reconcileAll()).resolves.not.toThrow();
  });
});
