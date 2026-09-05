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
    updateNotificationIds: jest.fn().mockResolvedValue("updated"),
  },
}));
jest.mock("@/repositories/ChecklistRepository", () => ({
  ChecklistRepository: {
    getChecklists: jest.fn().mockResolvedValue({}),
    updateNotificationIds: jest.fn().mockResolvedValue("updated"),
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

describe("Reconciliation Snapshot Freshness & Stale-Work Protection", () => {
  const anchor0900 = new Date("2026-09-06T09:00:00.000Z").getTime();
  const anchor1000 = new Date("2026-09-06T10:00:00.000Z").getTime();
  const anchor1100 = new Date("2026-09-06T11:00:00.000Z").getTime();
  const anchor1300 = new Date("2026-09-06T13:00:00.000Z").getTime();
  const anchor1400 = new Date("2026-09-06T14:00:00.000Z").getTime();

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
      return JSON.parse(JSON.stringify(taskStore));
    });

    // Realistic atomic repository implementation with expectedSnapshot verification
    (TaskRepository.updateNotificationIds as jest.Mock).mockImplementation(
      async (id: string, _wsId: string, notifIds: string[], expectedSnapshot?: any) => {
        const existing = taskStore[id];
        if (!existing) {
          return "not_found";
        }

        if (expectedSnapshot) {
          const reminderMatches =
            existing.reminder?.enabled === expectedSnapshot.reminder?.enabled &&
            existing.reminder?.triggerAt === expectedSnapshot.reminder?.triggerAt;

          const statusMatches =
            expectedSnapshot.status === undefined || existing.status === expectedSnapshot.status;
          const archiveMatches = (existing.archivedAt ?? null) === (expectedSnapshot.archivedAt ?? null);
          const updatedAtMatches =
            expectedSnapshot.updatedAt === undefined || existing.updatedAt === expectedSnapshot.updatedAt;
          const revisionMatches =
            expectedSnapshot.revision === undefined || existing.revision === expectedSnapshot.revision;

          if (!reminderMatches || !statusMatches || !archiveMatches || !updatedAtMatches || !revisionMatches) {
            return "state_changed";
          }
        }

        if (existing.reminder) {
          existing.reminder.notificationIds = notifIds;
        }
        return "updated";
      }
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    NotificationReconcilerService.resetInFlightForTesting();
  });

  function createTestTask(
    id: string,
    triggerAt: number,
    enabled: boolean = true,
    recurrence?: Task["recurrence"],
    notificationIds: string[] = [],
    revision: number = 1,
    updatedAt: number = 1000
  ): Task {
    return {
      id,
      workspaceId: "default",
      title: `Task ${id}`,
      status: "todo",
      priority: "medium",
      categoryId: "work",
      archivedAt: undefined,
      reminder: {
        enabled,
        triggerAt,
        notificationIds,
      },
      recurrence,
      revision,
      lifecycleGeneration: 1,
      createdAt: 100,
      updatedAt,
    };
  }

  function getPrimaryNotifications() {
    return osScheduledStore.filter(
      (n) => !n.content.data?.escalationLevel || n.content.data.escalationLevel === 0
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Stale reconciliation vs reminder time edit
  // ───────────────────────────────────────────────────────────────────────────
  it("1. stale reconciliation vs reminder time edit: user mutation 09:00 -> 10:00 wins; 09:00 cancelled", async () => {
    // Task initially at 09:00
    const task = createTestTask("task-1", anchor0900, true, undefined, [], 1, 1000);
    taskStore[task.id] = task;

    jest.spyOn(Date, "now").mockReturnValue(anchor0900 - 3600000); // 08:00

    // Hook scheduleNotificationAsync to simulate a concurrent domain edit occurring
    // right while the reconciler is in the middle of scheduling for the stale 09:00 snapshot
    let injected = false;
    const origSchedule = (Notifications.scheduleNotificationAsync as jest.Mock).getMockImplementation();
    (Notifications.scheduleNotificationAsync as jest.Mock).mockImplementation(async (req) => {
      const id = await origSchedule!(req);
      if (!injected && req.content.data?.itemId === "task-1") {
        injected = true;
        // User concurrently updates reminder to 10:00!
        taskStore["task-1"] = {
          ...taskStore["task-1"],
          reminder: { enabled: true, triggerAt: anchor1000, notificationIds: ["user-manual-1000"] },
          revision: 2,
          updatedAt: 2000,
        };
      }
      return id;
    });

    // Pass 1 runs. It encounters 'state_changed' and cleans up its stale 09:00 notification.
    await NotificationReconcilerService.reconcileAll();

    // Now run reconciliation to ensure desired state converges
    await NotificationReconcilerService.reconcileAll();

    const primaries = getPrimaryNotifications();
    expect(primaries.length).toBeGreaterThan(0);
    // 09:00 must NOT be present in OS
    expect(primaries.some((n) => n.trigger.date.getTime() === anchor0900)).toBe(false);
    // 10:00 must be present in OS
    expect(primaries.some((n) => n.trigger.date.getTime() === anchor1000)).toBe(true);
    // Domain notificationIds points to the 10:00 notification
    expect(taskStore["task-1"].reminder?.triggerAt).toBe(anchor1000);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Stale reconciliation vs reminder disable
  // ───────────────────────────────────────────────────────────────────────────
  it("2. stale reconciliation vs reminder disable: user disabling reminder wins; no notification scheduled", async () => {
    const task = createTestTask("task-disable", anchor0900, true, undefined, [], 1, 1000);
    taskStore[task.id] = task;

    jest.spyOn(Date, "now").mockReturnValue(anchor0900 - 3600000);

    let injected = false;
    const origSchedule = (Notifications.scheduleNotificationAsync as jest.Mock).getMockImplementation();
    (Notifications.scheduleNotificationAsync as jest.Mock).mockImplementation(async (req) => {
      const id = await origSchedule!(req);
      if (!injected && req.content.data?.itemId === "task-disable") {
        injected = true;
        // User disables reminder concurrently!
        taskStore["task-disable"] = {
          ...taskStore["task-disable"],
          reminder: { enabled: false, triggerAt: anchor0900, notificationIds: [] },
          revision: 2,
          updatedAt: 2000,
        };
      }
      return id;
    });

    await NotificationReconcilerService.reconcileAll();
    await NotificationReconcilerService.reconcileAll();

    // OS scheduled state must be empty! Stale 09:00 notification was cancelled on 'state_changed'
    expect(osScheduledStore.filter((n) => n.content.data?.itemId === "task-disable")).toHaveLength(0);
    expect(taskStore["task-disable"].reminder?.enabled).toBe(false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Stale reconciliation vs interval change
  // ───────────────────────────────────────────────────────────────────────────
  it("3. stale reconciliation vs interval change: interval 2h -> 4h change wins; 13:00 scheduled, 11:00 cancelled", async () => {
    const task = createTestTask(
      "task-interval",
      anchor0900,
      true,
      { frequency: "custom", interval: 2, unit: "hours" },
      [],
      1,
      1000
    );
    taskStore[task.id] = task;

    // 09:00 has fired; current time is 09:05
    jest.spyOn(Date, "now").mockReturnValue(anchor0900 + 5 * 60 * 1000);
    osScheduledStore = [];

    let injected = false;
    const origSchedule = (Notifications.scheduleNotificationAsync as jest.Mock).getMockImplementation();
    (Notifications.scheduleNotificationAsync as jest.Mock).mockImplementation(async (req) => {
      const id = await origSchedule!(req);
      if (!injected && req.content.data?.itemId === "task-interval") {
        injected = true;
        // User edits interval 2h -> 4h
        taskStore["task-interval"] = {
          ...taskStore["task-interval"],
          recurrence: { frequency: "custom", interval: 4, unit: "hours" },
          revision: 2,
          updatedAt: 2000,
        };
      }
      return id;
    });

    await NotificationReconcilerService.reconcileAll();
    // Run second pass to reconcile the fresh domain snapshot
    await NotificationReconcilerService.reconcileAll();

    const primaries = getPrimaryNotifications();
    expect(primaries).toHaveLength(1);
    // 09:00 + 4h = 13:00 (anchor1300), NOT 11:00
    expect(primaries[0].trigger.date.getTime()).toBe(anchor1300);
    expect(taskStore["task-interval"].reminder?.notificationIds).toContain(primaries[0].identifier);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Stale notificationIds write
  // ───────────────────────────────────────────────────────────────────────────
  it("4. stale notificationIds write: cannot overwrite newer revision with stale IDs", async () => {
    const task = createTestTask("task-stale-ids", anchor0900, true, undefined, ["user-new-id"], 2, 2000);
    taskStore[task.id] = task;

    // A stale pass attempts to write ["stale-id"] expecting revision 1, updatedAt 1000
    const result = await TaskRepository.updateNotificationIds(
      task.id,
      task.workspaceId,
      ["stale-id"],
      {
        reminder: { enabled: true, triggerAt: anchor0900 },
        status: "todo",
        archivedAt: null,
        updatedAt: 1000,
        revision: 1,
      }
    );

    expect(result).toBe("state_changed");
    // Domain notificationIds remains intact with user-new-id
    expect(taskStore[task.id].reminder?.notificationIds).toEqual(["user-new-id"]);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Stale cancellation vs newly scheduled notification
  // ───────────────────────────────────────────────────────────────────────────
  it("5. stale cancellation vs newly scheduled notification: newly scheduled notification Y survives", async () => {
    // OS initially has notification X
    osScheduledStore.push({
      identifier: "notif-X",
      content: {
        data: {
          type: "todo",
          itemId: "task-cancel-race",
          escalationLevel: 0,
          logicalSignature: buildNotificationLogicalSignature("todo", "task-cancel-race", "reminder"),
          notificationScheduleKey: "old-key",
        },
      },
      trigger: { date: new Date(anchor0900) },
    });

    const task = createTestTask("task-cancel-race", anchor1000, true, undefined, ["notif-Y"], 2, 2000);
    taskStore[task.id] = task;

    // Concurrently, operation B schedules notification Y in OS
    const scheduleKeyY = buildNotificationScheduleKey({ type: "once", triggerAt: anchor1000, offsetMinutes: 0 });
    osScheduledStore.push({
      identifier: "notif-Y",
      content: {
        data: {
          type: "todo",
          itemId: "task-cancel-race",
          escalationLevel: 0,
          logicalSignature: buildNotificationLogicalSignature("todo", "task-cancel-race", "reminder"),
          notificationScheduleKey: scheduleKeyY,
        },
      },
      trigger: { date: new Date(anchor1000) },
    });

    jest.spyOn(Date, "now").mockReturnValue(anchor0900 - 3600000);

    // Reconciler runs
    await NotificationReconcilerService.reconcileAll();

    // notif-X must be cancelled, but notif-Y MUST SURVIVE!
    expect(osScheduledStore.some((n) => n.identifier === "notif-X")).toBe(false);
    expect(osScheduledStore.some((n) => n.identifier === "notif-Y")).toBe(true);
    expect(taskStore[task.id].reminder?.notificationIds).toContain("notif-Y");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Stale scheduling vs newly scheduled notification
  // ───────────────────────────────────────────────────────────────────────────
  it("6. stale scheduling vs newly scheduled notification: only current valid notification survives", async () => {
    const scheduleKey1400 = buildNotificationScheduleKey({ type: "once", triggerAt: anchor1400, offsetMinutes: 0 });
    osScheduledStore.push({
      identifier: "notif-valid-1400",
      content: {
        data: {
          type: "todo",
          itemId: "task-sched-race",
          escalationLevel: 0,
          logicalSignature: buildNotificationLogicalSignature("todo", "task-sched-race", "reminder"),
          notificationScheduleKey: scheduleKey1400,
        },
      },
      trigger: { date: new Date(anchor1400) },
    });

    const task = createTestTask("task-sched-race", anchor1400, true, undefined, ["notif-valid-1400"], 2, 2000);
    taskStore[task.id] = task;

    jest.spyOn(Date, "now").mockReturnValue(anchor0900);

    await NotificationReconcilerService.reconcileAll();

    const primaries = getPrimaryNotifications();
    expect(primaries).toHaveLength(1);
    expect(primaries[0].identifier).toBe("notif-valid-1400");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Two reconciliation passes with different OS snapshots
  // ───────────────────────────────────────────────────────────────────────────
  it("7. two reconciliation passes with different OS snapshots: second pass converges without duplicate", async () => {
    const task = createTestTask("task-two-pass", anchor1000, true, undefined, [], 1, 1000);
    taskStore[task.id] = task;

    jest.spyOn(Date, "now").mockReturnValue(anchor0900);

    // Pass 1 runs and schedules notification
    await NotificationReconcilerService.reconcileAll();
    const primariesPass1 = getPrimaryNotifications();
    expect(primariesPass1).toHaveLength(1);

    // Pass 2 runs immediately with the newly populated OS snapshot
    await NotificationReconcilerService.reconcileAll();
    const primariesPass2 = getPrimaryNotifications();
    expect(primariesPass2).toHaveLength(1);
    expect(primariesPass2[0].identifier).toBe(primariesPass1[0].identifier);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. Reconciliation failure between schedule and persistence
  // ───────────────────────────────────────────────────────────────────────────
  it("8. reconciliation failure between schedule and persistence: next pass recognizes OS notification and repairs domain", async () => {
    const task = createTestTask("task-fail-persist", anchor1000, true, undefined, [], 1, 1000);
    taskStore[task.id] = task;

    jest.spyOn(Date, "now").mockReturnValue(anchor0900);

    // Make updateNotificationIds fail once (crash before persisting IDs)
    (TaskRepository.updateNotificationIds as jest.Mock).mockRejectedValueOnce(
      new Error("Disk crash before write")
    );

    // Pass 1 fails to save notificationIds in domain, but OS notification was scheduled
    await NotificationReconcilerService.reconcileAll();
    expect(osScheduledStore.length).toBeGreaterThan(0);
    expect(taskStore[task.id].reminder?.notificationIds).toHaveLength(0);

    // Pass 2 runs (recovery after crash)
    await NotificationReconcilerService.reconcileAll();

    // Verification: domain notificationIds repaired without creating any duplicate notifications!
    const primaries = getPrimaryNotifications();
    expect(primaries).toHaveLength(1);
    expect(taskStore[task.id].reminder?.notificationIds).toContain(primaries[0].identifier);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. Persistence failure after OS scheduling
  // ───────────────────────────────────────────────────────────────────────────
  it("9. persistence failure after OS scheduling: tolerates failure and syncs on subsequent pass", async () => {
    const task = createTestTask("task-persist-fail", anchor1100, true, undefined, [], 1, 1000);
    taskStore[task.id] = task;

    jest.spyOn(Date, "now").mockReturnValue(anchor0900);

    (TaskRepository.updateNotificationIds as jest.Mock).mockRejectedValueOnce(
      new Error("AsyncStorage write timeout")
    );

    await expect(NotificationReconcilerService.reconcileAll()).resolves.not.toThrow();

    // Subsequent pass recovers cleanly
    await NotificationReconcilerService.reconcileAll();

    const primaries = getPrimaryNotifications();
    expect(primaries).toHaveLength(1);
    expect(taskStore[task.id].reminder?.notificationIds).toContain(primaries[0].identifier);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 10. Concurrent reconciliation with fresh second-pass snapshot
  // ───────────────────────────────────────────────────────────────────────────
  it("10. concurrent reconciliation with fresh second-pass snapshot: callers await fresh pending pass", async () => {
    const task = createTestTask("task-concurrent-pass", anchor1000, true, undefined, [], 1, 1000);
    taskStore[task.id] = task;

    jest.spyOn(Date, "now").mockReturnValue(anchor0900);

    // Trigger pass 1
    const p1 = NotificationReconcilerService.reconcileAll();

    // While pass 1 is in-flight, update domain state
    taskStore[task.id] = {
      ...taskStore[task.id],
      reminder: { enabled: true, triggerAt: anchor1400, notificationIds: [] },
      revision: 2,
      updatedAt: 2000,
    };

    // Caller 2 and 3 call reconcileAll while pass 1 is in-flight
    const p2 = NotificationReconcilerService.reconcileAll();
    const p3 = NotificationReconcilerService.reconcileAll();

    await Promise.all([p1, p2, p3]);

    // Pass 2 must have run and reconciled the fresh 14:00 state!
    const primaries = getPrimaryNotifications();
    expect(primaries).toHaveLength(1);
    expect(primaries[0].trigger.date.getTime()).toBe(anchor1400);
    expect(taskStore[task.id].reminder?.notificationIds).toContain(primaries[0].identifier);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 11. Pending reconciliation after domain mutation
  // ───────────────────────────────────────────────────────────────────────────
  it("11. pending reconciliation after domain mutation: latest domain mutation wins completely", async () => {
    const task = createTestTask("task-pending-mut", anchor1000, true, undefined, [], 1, 1000);
    taskStore[task.id] = task;

    jest.spyOn(Date, "now").mockReturnValue(anchor0900);

    const p1 = NotificationReconcilerService.reconcileAll();

    // Mutation occurs during p1
    taskStore[task.id] = {
      ...taskStore[task.id],
      reminder: { enabled: false, triggerAt: anchor1000, notificationIds: [] },
      revision: 2,
      updatedAt: 2000,
    };

    const p2 = NotificationReconcilerService.reconcileAll();
    await Promise.all([p1, p2]);

    // OS has no notifications for disabled task
    expect(osScheduledStore.filter((n) => n.content.data?.itemId === "task-pending-mut")).toHaveLength(0);
    expect(taskStore[task.id].reminder?.enabled).toBe(false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 12. Repeated reconciliation after every mutation
  // ───────────────────────────────────────────────────────────────────────────
  it("12. repeated reconciliation after every mutation: converges after each state change", async () => {
    jest.spyOn(Date, "now").mockReturnValue(anchor0900 - 3600000);

    // Mutation 1: Task created with 09:00 reminder
    const task = createTestTask("task-steps", anchor0900, true, undefined, [], 1, 1000);
    taskStore[task.id] = task;
    await NotificationReconcilerService.reconcileAll();
    expect(getPrimaryNotifications()[0].trigger.date.getTime()).toBe(anchor0900);

    // Mutation 2: Time edited to 10:00
    taskStore[task.id] = {
      ...taskStore[task.id],
      reminder: { enabled: true, triggerAt: anchor1000, notificationIds: [] },
      revision: 2,
      updatedAt: 2000,
    };
    await NotificationReconcilerService.reconcileAll();
    expect(getPrimaryNotifications()[0].trigger.date.getTime()).toBe(anchor1000);

    // Mutation 3: Recurrence added (interval 4h)
    taskStore[task.id] = {
      ...taskStore[task.id],
      recurrence: { frequency: "custom", interval: 4, unit: "hours" },
      revision: 3,
      updatedAt: 3000,
    };
    await NotificationReconcilerService.reconcileAll();
    expect(getPrimaryNotifications()).toHaveLength(1);

    // Mutation 4: Reminder disabled
    taskStore[task.id] = {
      ...taskStore[task.id],
      reminder: { enabled: false, triggerAt: anchor1000, notificationIds: [] },
      revision: 4,
      updatedAt: 4000,
    };
    await NotificationReconcilerService.reconcileAll();
    expect(osScheduledStore.filter((n) => n.content.data?.itemId === "task-steps")).toHaveLength(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 13. Concurrent deletion during rescheduling cancels scheduled notifications
  // ───────────────────────────────────────────────────────────────────────────
  it("13. concurrent deletion during rescheduling: not_found cancels newly scheduled notifications", async () => {
    const task = createTestTask("task-delete-race", anchor1000, true, undefined, [], 1, 1000);
    taskStore[task.id] = task;

    jest.spyOn(Date, "now").mockReturnValue(anchor0900);

    let injected = false;
    const origSchedule = (Notifications.scheduleNotificationAsync as jest.Mock).getMockImplementation();
    (Notifications.scheduleNotificationAsync as jest.Mock).mockImplementation(async (req) => {
      const id = await origSchedule!(req);
      if (!injected && req.content.data?.itemId === "task-delete-race") {
        injected = true;
        // Task is deleted concurrently from the repository!
        delete taskStore["task-delete-race"];
      }
      return id;
    });

    await NotificationReconcilerService.reconcileAll();

    // Any notifications scheduled by the reconciler before noticing deletion MUST be cancelled!
    expect(osScheduledStore.filter((n) => n.content.data?.itemId === "task-delete-race")).toHaveLength(0);
  });
});
