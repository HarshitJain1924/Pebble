import { NotificationReconcilerService } from "../NotificationReconcilerService";
import {
  scheduleReminderBatch,
  cancelReminderIds,
  rescheduleTodoReminders,
  clearWebReminderLoops,
} from "@/services/scheduling/reminders.service";
import {
  buildNotificationLogicalSignature,
  buildNotificationScheduleKey,
  isMatchingPhysicalNotification,
} from "../notification-identity";
import { Task } from "@/shared/types/domain.types";
import { TaskRepository } from "@/repositories/TaskRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import * as Notifications from "expo-notifications";

jest.mock("@/repositories/WorkspaceRepository");
jest.mock("@/repositories/TaskRepository");
jest.mock("@/repositories/HabitRepository", () => ({
  HabitRepository: {
    getHabits: jest.fn().mockResolvedValue({}),
    updateNotificationIds: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock("@/repositories/ChecklistRepository", () => ({
  ChecklistRepository: {
    getChecklists: jest.fn().mockResolvedValue({}),
    updateNotificationIds: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock("expo-notifications", () => ({
  getAllScheduledNotificationsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: {
    DATE: "date",
    DAILY: "daily",
    WEEKLY: "weekly",
    TIME_INTERVAL: "timeInterval",
  },
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
  multiRemove: jest.fn(),
  getAllKeys: jest.fn(),
}));

describe("Notification Lifecycle State Machine & Reconciliation Semantics", () => {
  // Anchors for predictable time travel
  const anchor0900 = new Date("2026-09-06T09:00:00.000Z").getTime();
  const anchor1100 = new Date("2026-09-06T11:00:00.000Z").getTime();
  const anchor1300 = new Date("2026-09-06T13:00:00.000Z").getTime();
  const anchor1400 = new Date("2026-09-06T14:00:00.000Z").getTime();
  const anchor1500 = new Date("2026-09-06T15:00:00.000Z").getTime();

  let osScheduledStore: Array<{ identifier: string; content: { data: any }; trigger: any }> = [];
  let nextNotifId = 1;
  let taskStore: Record<string, Task> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    clearWebReminderLoops();
    NotificationReconcilerService.resetInFlightForTesting();
    osScheduledStore = [];
    nextNotifId = 1;
    taskStore = {};

    (Notifications.scheduleNotificationAsync as jest.Mock).mockImplementation(async (request) => {
      const id = `os-notif-${nextNotifId++}`;
      osScheduledStore.push({
        identifier: id,
        content: request.content,
        trigger: request.trigger,
      });
      return id;
    });

    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockImplementation(async (id) => {
      osScheduledStore = osScheduledStore.filter((n) => n.identifier !== id);
    });

    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockImplementation(async () => {
      return [...osScheduledStore];
    });

    (WorkspaceRepository.getWorkspaces as jest.Mock).mockResolvedValue([
      { id: "default", name: "Default", archivedAt: null },
    ]);

    (TaskRepository.getTasks as jest.Mock).mockImplementation(async () => {
      return { ...taskStore };
    });

    (TaskRepository.updateNotificationIds as jest.Mock).mockImplementation(
      async (id: string, _wsId: string, notifIds: string[]) => {
        if (taskStore[id]) {
          taskStore[id] = {
            ...taskStore[id],
            reminder: taskStore[id].reminder
              ? { ...taskStore[id].reminder!, notificationIds: notifIds }
              : undefined,
          };
        }
        return "applied";
      }
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    NotificationReconcilerService.resetInFlightForTesting();
  });

  function createIntervalTask(
    id: string,
    anchor: number,
    interval: number = 2,
    unit: "hours" | "days" = "hours",
    notificationIds: string[] = []
  ): Task {
    return {
      id,
      workspaceId: "default",
      title: `Interval Task ${id}`,
      status: "todo",
      priority: "medium",
      reminder: {
        enabled: true,
        triggerAt: anchor,
        notificationIds,
      },
      recurrence: {
        frequency: "custom",
        interval,
        unit,
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: anchor - 86400000,
      updatedAt: anchor,
    };
  }

  function getPrimaryNotifications() {
    return osScheduledStore.filter(
      (n) => !n.content.data?.escalationLevel || n.content.data.escalationLevel === 0
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Race A: Delivery + Reconciliation Race
  // ───────────────────────────────────────────────────────────────────────────
  it("1. delivery + reconciliation race: exactly one next occurrence scheduled", async () => {
    const task = createIntervalTask("task-race-a", anchor0900, 2, "hours");
    taskStore[task.id] = task;

    // Initially at 08:30
    jest.spyOn(Date, "now").mockReturnValue(anchor0900 - 30 * 60 * 1000);
    const initialBatch = await scheduleReminderBatch({
      kind: "todo",
      itemId: task.id,
      title: task.title,
      anchorTimestamp: anchor0900,
      recurrence: { type: "interval", interval: 2, unit: "hours" },
    });
    task.reminder!.notificationIds = initialBatch.ids;

    // Time advances to 09:00:05. The OS delivers the 09:00 notification and removes it.
    jest.spyOn(Date, "now").mockReturnValue(anchor0900 + 5000);
    osScheduledStore = []; // OS notification fired

    // Simultaneous delivery handler and background reconciliation pass
    const run1 = NotificationReconcilerService.reconcileAll();
    const run2 = NotificationReconcilerService.reconcileAll();

    await Promise.all([run1, run2]);

    const primaries = getPrimaryNotifications();
    expect(primaries).toHaveLength(1);
    expect(primaries[0].trigger.date.getTime()).toBe(anchor1100);
    expect(taskStore[task.id].reminder?.notificationIds).toContain(primaries[0].identifier);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Race B: Delivery + AppState Race
  // ───────────────────────────────────────────────────────────────────────────
  it("2. delivery + AppState race: foreground received listener + AppState active listener schedule exactly one occurrence", async () => {
    const task = createIntervalTask("task-race-b", anchor0900, 2, "hours");
    taskStore[task.id] = task;

    // Initially at 08:30
    jest.spyOn(Date, "now").mockReturnValue(anchor0900 - 30 * 60 * 1000);
    const initialBatch = await scheduleReminderBatch({
      kind: "todo",
      itemId: task.id,
      title: task.title,
      anchorTimestamp: anchor0900,
      recurrence: { type: "interval", interval: 2, unit: "hours" },
    });
    task.reminder!.notificationIds = initialBatch.ids;

    // Notification fires at 09:00:02. Both received listener and AppState "active" trigger reconcile.
    jest.spyOn(Date, "now").mockReturnValue(anchor0900 + 2000);
    osScheduledStore = [];

    const receivedHandlerReconcile = NotificationReconcilerService.reconcileAll();
    const appStateActiveReconcile = NotificationReconcilerService.reconcileAll();

    await Promise.all([receivedHandlerReconcile, appStateActiveReconcile]);

    const primaries = getPrimaryNotifications();
    expect(primaries).toHaveLength(1);
    expect(primaries[0].trigger.date.getTime()).toBe(anchor1100);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Race C: Delivery + Tap Race
  // ───────────────────────────────────────────────────────────────────────────
  it("3. delivery + tap race: notification response received + startup reconciliation schedule exactly one occurrence", async () => {
    const task = createIntervalTask("task-race-c", anchor0900, 2, "hours");
    taskStore[task.id] = task;

    jest.spyOn(Date, "now").mockReturnValue(anchor0900 - 15 * 60 * 1000);
    const initialBatch = await scheduleReminderBatch({
      kind: "todo",
      itemId: task.id,
      title: task.title,
      anchorTimestamp: anchor0900,
      recurrence: { type: "interval", interval: 2, unit: "hours" },
    });
    task.reminder!.notificationIds = initialBatch.ids;

    // User taps notification at 09:01:00
    jest.spyOn(Date, "now").mockReturnValue(anchor0900 + 60000);
    osScheduledStore = [];

    const tapHandlerReconcile = NotificationReconcilerService.reconcileAll();
    const startupReconcile = NotificationReconcilerService.reconcileAll();

    await Promise.all([tapHandlerReconcile, startupReconcile]);

    const primaries = getPrimaryNotifications();
    expect(primaries).toHaveLength(1);
    expect(primaries[0].trigger.date.getTime()).toBe(anchor1100);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Duplicate Event Handling
  // ───────────────────────────────────────────────────────────────────────────
  it("4. duplicate event handling: identical runtime events do not schedule duplicate notifications", async () => {
    const task = createIntervalTask("task-dup-event", anchor0900, 2, "hours");
    taskStore[task.id] = task;

    jest.spyOn(Date, "now").mockReturnValue(anchor0900 + 3000); // 09:00:03
    osScheduledStore = [];

    // First event triggers reconciliation
    await NotificationReconcilerService.reconcileAll();
    const primariesPass1 = getPrimaryNotifications();
    expect(primariesPass1).toHaveLength(1);
    const firstAssignedId = primariesPass1[0].identifier;

    // Second event fires immediately after
    await NotificationReconcilerService.reconcileAll();
    const primariesPass2 = getPrimaryNotifications();
    expect(primariesPass2).toHaveLength(1);
    expect(primariesPass2[0].identifier).toBe(firstAssignedId);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Stale Notification ID Persistence
  // ───────────────────────────────────────────────────────────────────────────
  it("5. stale notification ID: stale OS ID does not remain authoritative and is replaced cleanly", async () => {
    // Task has an old ID in reminder.notificationIds that no longer exists in OS
    const task = createIntervalTask("task-stale-id", anchor0900, 2, "hours", ["stale-ghost-id-999"]);
    taskStore[task.id] = task;

    jest.spyOn(Date, "now").mockReturnValue(anchor0900 + 10000); // 09:00:10
    osScheduledStore = []; // OS has no alarms

    await NotificationReconcilerService.reconcileAll();

    const primaries = getPrimaryNotifications();
    expect(primaries).toHaveLength(1);
    expect(primaries[0].identifier).not.toBe("stale-ghost-id-999");
    expect(taskStore[task.id].reminder?.notificationIds).toContain(primaries[0].identifier);
    expect(taskStore[task.id].reminder?.notificationIds).not.toContain("stale-ghost-id-999");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Old ID vs New Schedule Identity
  // ───────────────────────────────────────────────────────────────────────────
  it("6. old ID vs new schedule identity: reconciler cancels old notification and schedules new one", async () => {
    // OS has an old notification from a previous one-time schedule at 09:00
    const oldKey = buildNotificationScheduleKey({ type: "once", triggerAt: anchor0900, offsetMinutes: 0 });
    osScheduledStore.push({
      identifier: "os-old-notif",
      content: {
        data: {
          type: "todo",
          itemId: "task-schedule-id",
          escalationLevel: 0,
          logicalSignature: buildNotificationLogicalSignature("todo", "task-schedule-id", "reminder"),
          notificationScheduleKey: oldKey,
        },
      },
      trigger: { date: new Date(anchor0900) },
    });

    // Domain task has been updated by user to a new trigger at 14:00
    const updatedTask: Task = {
      id: "task-schedule-id",
      workspaceId: "default",
      title: "Rescheduled Task",
      status: "todo",
      priority: "medium",
      reminder: {
        enabled: true,
        triggerAt: anchor1400,
        notificationIds: ["os-old-notif"],
      },
      revision: 2,
      lifecycleGeneration: 1,
      createdAt: anchor0900 - 86400000,
      updatedAt: anchor0900 + 3000,
    };
    taskStore[updatedTask.id] = updatedTask;

    jest.spyOn(Date, "now").mockReturnValue(anchor0900 + 5000);

    await NotificationReconcilerService.reconcileAll();

    // The old notification must be cancelled from OS
    expect(osScheduledStore.some((n) => n.identifier === "os-old-notif")).toBe(false);

    // The new notification for 14:00 must be scheduled
    const primaries = getPrimaryNotifications();
    expect(primaries).toHaveLength(1);
    expect(primaries[0].identifier).not.toBe("os-old-notif");
    expect(primaries[0].trigger.date.getTime()).toBe(anchor1400);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Cancellation Immediately Before Trigger
  // ───────────────────────────────────────────────────────────────────────────
  it("7. cancellation immediately before trigger: 09:00 disabled at 08:59 is cancelled and never re-armed", async () => {
    const task = createIntervalTask("task-cancel-before", anchor0900, 2, "hours");
    taskStore[task.id] = task;

    // Scheduled at 08:30
    jest.spyOn(Date, "now").mockReturnValue(anchor0900 - 30 * 60 * 1000);
    const initialBatch = await scheduleReminderBatch({
      kind: "todo",
      itemId: task.id,
      title: task.title,
      anchorTimestamp: anchor0900,
      recurrence: { type: "interval", interval: 2, unit: "hours" },
    });
    task.reminder!.notificationIds = initialBatch.ids;
    expect(osScheduledStore.length).toBeGreaterThan(0);

    // At 08:59, user disables reminder
    jest.spyOn(Date, "now").mockReturnValue(anchor0900 - 60 * 1000);
    task.reminder!.enabled = false;

    await NotificationReconcilerService.reconcileAll();

    // OS notifications must be cleared, and no new notification scheduled
    expect(osScheduledStore).toHaveLength(0);

    // Even if reconciliation runs again past 09:00, it must never re-arm
    jest.spyOn(Date, "now").mockReturnValue(anchor0900 + 10 * 60 * 1000);
    await NotificationReconcilerService.reconcileAll();
    expect(osScheduledStore).toHaveLength(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. Cancellation Immediately After Trigger
  // ───────────────────────────────────────────────────────────────────────────
  it("8. cancellation immediately after trigger: 09:00 fires, user disables recurrence, 11:00 is NOT created", async () => {
    const task = createIntervalTask("task-cancel-after", anchor0900, 2, "hours");
    taskStore[task.id] = task;

    // 09:00 fires (dropped from OS queue)
    osScheduledStore = [];
    jest.spyOn(Date, "now").mockReturnValue(anchor0900 + 5000); // 09:00:05

    // User disables recurrence (task becomes a one-time reminder that has already elapsed)
    task.recurrence = undefined;

    await NotificationReconcilerService.reconcileAll();

    // No new notification for 11:00 may be scheduled
    expect(osScheduledStore).toHaveLength(0);
    expect(taskStore[task.id].reminder?.notificationIds).toHaveLength(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. Interval Edit After Delivery
  // ───────────────────────────────────────────────────────────────────────────
  it("9. interval edit after delivery: 09:00 fires, interval changed 2h -> 4h from same anchor, 13:00 scheduled", async () => {
    const task = createIntervalTask("task-edit-interval", anchor0900, 2, "hours");
    taskStore[task.id] = task;

    // 09:00 fires
    osScheduledStore = [];
    jest.spyOn(Date, "now").mockReturnValue(anchor0900 + 5000); // 09:00:05

    // User changes interval from 2h to 4h, retaining anchor0900
    task.recurrence = {
      frequency: "custom",
      interval: 4,
      unit: "hours",
    };

    await NotificationReconcilerService.reconcileAll();

    const primaries = getPrimaryNotifications();
    expect(primaries).toHaveLength(1);
    // 09:00 + 4h = 13:00 (anchor1300), NOT 11:00
    expect(primaries[0].trigger.date.getTime()).toBe(anchor1300);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 10. Multiple Missed Occurrences
  // ───────────────────────────────────────────────────────────────────────────
  it("10. multiple missed occurrences: 09:00, 11:00, 13:00 missed, waking at 14:35 schedules 15:00 next", async () => {
    // Device was off / app unopened between 08:00 and 14:35
    const task = createIntervalTask("task-missed", anchor0900, 2, "hours");
    taskStore[task.id] = task;

    // At 14:35:00
    const timeAt1435 = anchor0900 + 5 * 3600 * 1000 + 35 * 60 * 1000;
    jest.spyOn(Date, "now").mockReturnValue(timeAt1435);
    osScheduledStore = [];

    await NotificationReconcilerService.reconcileAll();

    const primaries = getPrimaryNotifications();
    expect(primaries).toHaveLength(1);
    // Next occurrence must be 15:00:00 (anchor1500)
    expect(primaries[0].trigger.date.getTime()).toBe(anchor1500);

    // Task status remains "todo" - missed occurrences are NOT marked completed
    expect(taskStore[task.id].status).toBe("todo");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 11. Repeated Reconciliation After a Fired Occurrence
  // ───────────────────────────────────────────────────────────────────────────
  it("11. repeated reconciliation after a fired occurrence: converges to exactly 1 primary notification", async () => {
    const task = createIntervalTask("task-repeated", anchor0900, 2, "hours");
    taskStore[task.id] = task;

    // 09:00 fired
    osScheduledStore = [];
    jest.spyOn(Date, "now").mockReturnValue(anchor0900 + 10000);

    // Pass 1
    await NotificationReconcilerService.reconcileAll();
    const primariesAfterPass1 = getPrimaryNotifications();
    expect(primariesAfterPass1).toHaveLength(1);
    const targetId = primariesAfterPass1[0].identifier;

    // Pass 2
    await NotificationReconcilerService.reconcileAll();
    const primariesAfterPass2 = getPrimaryNotifications();
    expect(primariesAfterPass2).toHaveLength(1);
    expect(primariesAfterPass2[0].identifier).toBe(targetId);

    // Pass 3
    await NotificationReconcilerService.reconcileAll();
    const primariesAfterPass3 = getPrimaryNotifications();
    expect(primariesAfterPass3).toHaveLength(1);
    expect(primariesAfterPass3[0].identifier).toBe(targetId);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 12. Startup Reconciliation After a Fired Occurrence
  // ───────────────────────────────────────────────────────────────────────────
  it("12. startup reconciliation after a fired occurrence: cold boot detects missing OS request and re-arms 11:00", async () => {
    const task = createIntervalTask("task-startup", anchor0900, 2, "hours", ["old-os-1"]);
    taskStore[task.id] = task;

    // Cold boot at 09:10: OS alarm fired while app was terminated
    jest.spyOn(Date, "now").mockReturnValue(anchor0900 + 10 * 60 * 1000);
    osScheduledStore = [];

    await NotificationReconcilerService.reconcileAll();

    const primaries = getPrimaryNotifications();
    expect(primaries).toHaveLength(1);
    expect(primaries[0].trigger.date.getTime()).toBe(anchor1100);
    expect(taskStore[task.id].reminder?.notificationIds).toContain(primaries[0].identifier);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 13. Permission-Disabled Recovery Behavior
  // ───────────────────────────────────────────────────────────────────────────
  it("13. permission-disabled recovery behavior: tolerates OS scheduling failure without corrupting domain state, recovers when permitted", async () => {
    const task = createIntervalTask("task-perm", anchor0900, 2, "hours");
    taskStore[task.id] = task;

    osScheduledStore = [];
    jest.spyOn(Date, "now").mockReturnValue(anchor0900 + 5000);

    // OS rejects scheduling due to permissions denied or alarm quota
    (Notifications.scheduleNotificationAsync as jest.Mock).mockRejectedValueOnce(
      new Error("Permissions denied by user")
    );

    // Pass 1: should not throw or crash
    await expect(NotificationReconcilerService.reconcileAll()).resolves.not.toThrow();

    // Domain state preserved
    expect(taskStore[task.id].reminder?.enabled).toBe(true);

    // Pass 2: permissions restored
    await NotificationReconcilerService.reconcileAll();

    const primaries = getPrimaryNotifications();
    expect(primaries).toHaveLength(1);
    expect(primaries[0].trigger.date.getTime()).toBe(anchor1100);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 14. No-Reminder State Never Re-Armed
  // ───────────────────────────────────────────────────────────────────────────
  it("14. no-reminder state never re-armed: task without reminder or disabled reminder is never scheduled", async () => {
    const taskNoReminder: Task = {
      id: "task-no-reminder",
      workspaceId: "default",
      title: "No Reminder Task",
      status: "todo",
      priority: "none",
      reminder: undefined,
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: anchor0900,
      updatedAt: anchor0900,
    };

    const taskDisabledReminder: Task = {
      id: "task-disabled-reminder",
      workspaceId: "default",
      title: "Disabled Reminder Task",
      status: "todo",
      priority: "none",
      reminder: {
        enabled: false,
        triggerAt: anchor0900,
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: anchor0900,
      updatedAt: anchor0900,
    };

    taskStore[taskNoReminder.id] = taskNoReminder;
    taskStore[taskDisabledReminder.id] = taskDisabledReminder;

    osScheduledStore = [];
    jest.spyOn(Date, "now").mockReturnValue(anchor0900 + 5000);

    await NotificationReconcilerService.reconcileAll();

    expect(osScheduledStore).toHaveLength(0);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
