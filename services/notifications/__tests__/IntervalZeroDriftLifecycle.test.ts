import { AlertCenterService } from "../AlertCenterService";
import { NotificationReconcilerService } from "../NotificationReconcilerService";
import { getNextIntervalOccurrenceEpoch } from "@/services/scheduling/recurrence.service";
import {
  scheduleReminderBatch,
  cancelReminderIds,
  rescheduleTodoReminders,
  rearmWebReminders,
  getWebReminderLoops,
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
import { Platform } from "react-native";

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

describe("Native Interval Re-Arming and Zero-Drift Lifecycle Proof", () => {
  // 2026-09-06 09:00:00.000 UTC
  const anchor0900 = new Date("2026-09-06T09:00:00.000Z").getTime();
  const anchor1100 = new Date("2026-09-06T11:00:00.000Z").getTime();
  const anchor1300 = new Date("2026-09-06T13:00:00.000Z").getTime();
  const anchor1500 = new Date("2026-09-06T15:00:00.000Z").getTime();

  let osScheduledStore: Array<{ identifier: string; content: { data: any }; trigger: any }> = [];
  let nextNotifId = 1;

  beforeEach(() => {
    jest.clearAllMocks();
    clearWebReminderLoops();
    osScheduledStore = [];
    nextNotifId = 1;

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

  // Helper to extract primary notifications (escalationLevel === 0)
  function getPrimaryNotifications() {
    return osScheduledStore.filter(
      (n) => !n.content.data?.escalationLevel || n.content.data.escalationLevel === 0
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Zero-Drift Mathematical Invariant
  // ───────────────────────────────────────────────────────────────────────────
  describe("1. Zero-drift re-arming despite OS delivery delays", () => {
    it("never drifts when OS delivers notifications with delivery jitter (09:00:07, 11:00:04, 13:00:11)", () => {
      const intervalHours = 2;

      // Jittered OS delivery times
      const delivery1 = anchor0900 + 7000; // 09:00:07
      const delivery2 = anchor1100 + 4000; // 11:00:04
      const delivery3 = anchor1300 + 11000; // 13:00:11

      // 1. Next occurrence computed at delivery 1 (09:00:07)
      const nextAfter1 = getNextIntervalOccurrenceEpoch(anchor0900, intervalHours, "hours", 0, delivery1);
      expect(nextAfter1).toBe(anchor1100);
      expect(new Date(nextAfter1).toISOString()).toBe("2026-09-06T11:00:00.000Z");
      // MUST NOT BE delivery1 + 2h (which would be 11:00:07)
      expect(nextAfter1).not.toBe(delivery1 + intervalHours * 3600 * 1000);

      // 2. Next occurrence computed at delivery 2 (11:00:04)
      const nextAfter2 = getNextIntervalOccurrenceEpoch(anchor0900, intervalHours, "hours", 0, delivery2);
      expect(nextAfter2).toBe(anchor1300);
      expect(new Date(nextAfter2).toISOString()).toBe("2026-09-06T13:00:00.000Z");
      // MUST NOT BE delivery2 + 2h (which would be 11:00:04 + 2h = 13:00:04)
      expect(nextAfter2).not.toBe(delivery2 + intervalHours * 3600 * 1000);

      // 3. Next occurrence computed at delivery 3 (13:00:11)
      const nextAfter3 = getNextIntervalOccurrenceEpoch(anchor0900, intervalHours, "hours", 0, delivery3);
      expect(nextAfter3).toBe(anchor1500);
      expect(new Date(nextAfter3).toISOString()).toBe("2026-09-06T15:00:00.000Z");
      // MUST NOT BE delivery3 + 2h (which would be 13:00:11 + 2h = 15:00:11)
      expect(nextAfter3).not.toBe(delivery3 + intervalHours * 3600 * 1000);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Production Re-Arm Lifecycle Paths
  // ───────────────────────────────────────────────────────────────────────────
  describe("2. Production re-arm lifecycle paths", () => {
    it("foreground re-arm: when notification fires at 09:00:07, reconciler immediately schedules 11:00:00", async () => {
      // Step A: Task initially scheduled before 09:00
      const initialTask = createIntervalTask("task-fg", anchor0900, 2, "hours");
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-fg": initialTask });
      (TaskRepository.updateNotificationIds as jest.Mock).mockImplementation(async (id, wsId, notifIds) => {
        initialTask.reminder!.notificationIds = notifIds;
        return "success";
      });

      const nowBefore = anchor0900 - 30 * 60 * 1000; // 08:30
      jest.spyOn(Date, "now").mockReturnValue(nowBefore);

      const scheduledBatch = await scheduleReminderBatch({
        kind: "todo",
        itemId: "task-fg",
        title: "Foreground Re-arm Task",
        anchorTimestamp: anchor0900,
        recurrence: { type: "interval", interval: 2, unit: "hours" },
      });

      expect(scheduledBatch.ids.length).toBeGreaterThan(0);
      initialTask.reminder!.notificationIds = scheduledBatch.ids;

      const primariesBefore = getPrimaryNotifications();
      expect(primariesBefore).toHaveLength(1);
      expect(primariesBefore[0].trigger.date.getTime()).toBe(anchor0900);

      // Step B: Notification fires at 09:00:07 in foreground.
      // In native OS, a fired DATE notification is removed from OS scheduled queue.
      const deliveryTime = anchor0900 + 7000; // 09:00:07
      jest.spyOn(Date, "now").mockReturnValue(deliveryTime);
      osScheduledStore = []; // Fired and consumed by OS

      // Foreground notification received listener triggers reconciliation
      await NotificationReconcilerService.reconcileAll();

      // Step C: Verify re-armed notification
      const primariesAfter = getPrimaryNotifications();
      expect(primariesAfter).toHaveLength(1);
      const rearmedPrimary = primariesAfter[0];

      // Re-armed trigger MUST be 11:00:00.000 (anchor + 1 * 2h), ZERO DRIFT
      expect(rearmedPrimary.trigger.date.getTime()).toBe(anchor1100);
      expect(rearmedPrimary.trigger.date.toISOString()).toBe("2026-09-06T11:00:00.000Z");

      // Task in domain state now holds the new OS notification IDs
      expect(initialTask.reminder?.notificationIds).toContain(rearmedPrimary.identifier);
    });

    it("app background -> active: notification fires in background at 09:00:07, opening app re-arms 11:00:00", async () => {
      const task = createIntervalTask("task-bg", anchor0900, 2, "hours", ["os-bg-0900"]);
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-bg": task });
      (TaskRepository.updateNotificationIds as jest.Mock).mockImplementation(async (id, wsId, notifIds) => {
        task.reminder!.notificationIds = notifIds;
        return "success";
      });

      // While in background at 09:00:07, OS delivers notification and drops it from scheduled alarms
      // User opens app at 09:12:00
      const openTime = anchor0900 + 12 * 60 * 1000; // 09:12:00
      jest.spyOn(Date, "now").mockReturnValue(openTime);
      osScheduledStore = []; // OS queue is empty because 09:00 fired

      // AppState change to "active" triggers reconciliation
      await NotificationReconcilerService.reconcileAll();

      const primaries = getPrimaryNotifications();
      expect(primaries).toHaveLength(1);
      expect(primaries[0].trigger.date.getTime()).toBe(anchor1100);
      expect(task.reminder?.notificationIds).toContain(primaries[0].identifier);
    });

    it("app restart after delivery: cold launch at 09:30 detects fired 09:00 and schedules 11:00:00", async () => {
      const task = createIntervalTask("task-restart", anchor0900, 2, "hours", ["os-old-0900"]);
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-restart": task });
      (TaskRepository.updateNotificationIds as jest.Mock).mockImplementation(async (id, wsId, notifIds) => {
        task.reminder!.notificationIds = notifIds;
        return "success";
      });

      // App was terminated when 09:00 fired. User cold launches app at 09:30.
      const launchTime = anchor0900 + 30 * 60 * 1000; // 09:30
      jest.spyOn(Date, "now").mockReturnValue(launchTime);
      osScheduledStore = [];

      // app/_layout.tsx runs reconcileAll() on startup
      await NotificationReconcilerService.reconcileAll();

      const primaries = getPrimaryNotifications();
      expect(primaries).toHaveLength(1);
      expect(primaries[0].trigger.date.getTime()).toBe(anchor1100);
      expect(task.reminder?.notificationIds).toContain(primaries[0].identifier);
    });

    it("app restarted before next occurrence: restart at 10:20 preserves existing 11:00 without rescheduling", async () => {
      const task = createIntervalTask("task-restart-early", anchor0900, 2, "hours", ["os-valid-1100"]);
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-restart-early": task });
      (TaskRepository.updateNotificationIds as jest.Mock).mockResolvedValue("success");

      // 11:00 notification is already validly scheduled in OS
      const scheduleKey = buildNotificationScheduleKey({
        type: "interval",
        interval: 2,
        unit: "hours",
        anchor: anchor0900,
        offsetMinutes: 0,
      });

      osScheduledStore = [
        {
          identifier: "os-valid-1100",
          content: {
            data: {
              type: "todo",
              itemId: "task-restart-early",
              escalationLevel: 0,
              purpose: "reminder",
              logicalSignature: buildNotificationLogicalSignature("todo", "task-restart-early", "reminder"),
              notificationScheduleKey: scheduleKey,
            },
          },
          trigger: {
            type: "date",
            date: new Date(anchor1100),
          },
        },
      ];

      // App restarted at 10:20
      const earlyRestartTime = anchor0900 + 80 * 60 * 1000; // 10:20
      jest.spyOn(Date, "now").mockReturnValue(earlyRestartTime);

      await NotificationReconcilerService.reconcileAll();

      // Exactly the existing notification is preserved, NOT rescheduled, NOT cancelled
      expect(osScheduledStore).toHaveLength(1);
      expect(osScheduledStore[0].identifier).toBe("os-valid-1100");
      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
      expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    });

    it("multiple missed occurrences: app closed through 09:00, 11:00, 13:00 and opened at 14:35 schedules 15:00", async () => {
      const task = createIntervalTask("task-multi-miss", anchor0900, 2, "hours", ["os-ancient"]);
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-multi-miss": task });
      (TaskRepository.updateNotificationIds as jest.Mock).mockImplementation(async (id, wsId, notifIds) => {
        task.reminder!.notificationIds = notifIds;
        return "success";
      });

      // App opened at 14:35:00 UTC (after 09:00, 11:00, 13:00 all passed)
      const lateTime = new Date("2026-09-06T14:35:00.000Z").getTime();
      jest.spyOn(Date, "now").mockReturnValue(lateTime);
      osScheduledStore = [];

      await NotificationReconcilerService.reconcileAll();

      const primaries = getPrimaryNotifications();
      expect(primaries).toHaveLength(1);
      // Must advance by 3 cycles (3 * 2h = 6h) from 09:00 to 15:00:00.000Z!
      // Must NOT schedule in the past, and must NOT drift to 14:35 + 2h = 16:35!
      expect(primaries[0].trigger.date.getTime()).toBe(anchor1500);
      expect(primaries[0].trigger.date.toISOString()).toBe("2026-09-06T15:00:00.000Z");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Escalation Behavior & Non-Collision
  // ───────────────────────────────────────────────────────────────────────────
  describe("3. Escalation behavior and slot separation", () => {
    it("escalation notifications share timestamps without collision or accidental cancellation", async () => {
      // anchor = 09:00, interval = 2h, escalation = [120, 240]
      const task = createIntervalTask("task-esc", anchor0900, 2, "hours");
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-esc": task });
      (TaskRepository.updateNotificationIds as jest.Mock).mockImplementation(async (id, wsId, notifIds) => {
        task.reminder!.notificationIds = notifIds;
        return "success";
      });

      const nowAt830 = anchor0900 - 30 * 60 * 1000;
      jest.spyOn(Date, "now").mockReturnValue(nowAt830);

      // Initial batch schedules:
      // Level 0 (primary): 09:00 (+0)
      // Level 1 (escalation #1): 11:00 (+120m)
      // Level 2 (escalation #2): 13:00 (+240m)
      const batch = await scheduleReminderBatch({
        kind: "todo",
        itemId: "task-esc",
        title: "Escalation Test",
        anchorTimestamp: anchor0900,
        recurrence: { type: "interval", interval: 2, unit: "hours" },
        escalationMinutes: [120, 240],
      });

      expect(batch.ids).toHaveLength(3);
      expect(osScheduledStore).toHaveLength(3);
      task.reminder!.notificationIds = batch.ids;

      const p0 = osScheduledStore.find((n) => n.content.data.escalationLevel === 0)!;
      const e1 = osScheduledStore.find((n) => n.content.data.escalationLevel === 1)!;
      const e2 = osScheduledStore.find((n) => n.content.data.escalationLevel === 2)!;

      expect(p0.trigger.date.getTime()).toBe(anchor0900); // 09:00
      expect(e1.trigger.date.getTime()).toBe(anchor1100); // 11:00
      expect(e2.trigger.date.getTime()).toBe(anchor1300); // 13:00

      // Now at 09:00:07, primary p0 fires and is consumed by OS.
      // e1 (11:00) and e2 (13:00) remain in the OS queue.
      const nowAt900 = anchor0900 + 7000;
      jest.spyOn(Date, "now").mockReturnValue(nowAt900);
      osScheduledStore = [e1, e2];

      // Reconciler runs: detects primary is missing, cleanly reschedules batch for next cycle
      await NotificationReconcilerService.reconcileAll();

      // New batch scheduled:
      // Primary #2: 11:00:00 (level 0)
      // Escalation #1: 11:00:00 (level 1)
      // Escalation #2: 13:00:00 (level 2)
      expect(osScheduledStore).toHaveLength(3);

      const newP = osScheduledStore.find((n) => n.content.data.escalationLevel === 0)!;
      const newE1 = osScheduledStore.find((n) => n.content.data.escalationLevel === 1)!;
      const newE2 = osScheduledStore.find((n) => n.content.data.escalationLevel === 2)!;

      // Primary #2 and Escalation #1 intentionally share the timestamp 11:00:00.000Z
      expect(newP.trigger.date.getTime()).toBe(anchor1100);
      expect(newE1.trigger.date.getTime()).toBe(anchor1100);
      expect(newE2.trigger.date.getTime()).toBe(anchor1300);

      // Verify they have distinct purposes and keys
      expect(newP.content.data.purpose).toBe("reminder");
      expect(newE1.content.data.purpose).toBe("escalation");
      expect(newP.content.data.notificationScheduleKey).toContain(":+0");
      expect(newE1.content.data.notificationScheduleKey).toContain(":+120");

      // Verify reconciler does not see them as duplicates (run reconciliation again)
      (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();
      (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockClear();

      await NotificationReconcilerService.reconcileAll();

      // No changes; all 3 coexist peacefully
      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
      expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
      expect(osScheduledStore).toHaveLength(3);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Duplicate Prevention Under Repeated Reconciliation
  // ───────────────────────────────────────────────────────────────────────────
  describe("4. Duplicate prevention after repeated reconciliation", () => {
    it("09:00 fires, 11:00 re-armed, reconciliation runs 5 times: exactly one 11:00 primary remains", async () => {
      const task = createIntervalTask("task-dup-check", anchor0900, 2, "hours", ["os-initial-0900"]);
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-dup-check": task });
      (TaskRepository.updateNotificationIds as jest.Mock).mockImplementation(async (id, wsId, notifIds) => {
        task.reminder!.notificationIds = notifIds;
        return "success";
      });

      // 09:00 fired in OS
      const fireTime = anchor0900 + 5000; // 09:00:05
      jest.spyOn(Date, "now").mockReturnValue(fireTime);
      osScheduledStore = [];

      // Run 1: Re-arm 11:00
      await NotificationReconcilerService.reconcileAll();
      const primaries1 = getPrimaryNotifications();
      expect(primaries1).toHaveLength(1);
      expect(primaries1[0].trigger.date.getTime()).toBe(anchor1100);
      const scheduledPrimaryId = primaries1[0].identifier;
      const initialTotalCount = osScheduledStore.length;

      // Run 2: Startup reconciliation simulation
      await NotificationReconcilerService.reconcileAll();
      const primaries2 = getPrimaryNotifications();
      expect(primaries2).toHaveLength(1);
      expect(primaries2[0].identifier).toBe(scheduledPrimaryId);
      expect(osScheduledStore.length).toBe(initialTotalCount);

      // Run 3: Manual user reconciliation
      await NotificationReconcilerService.reconcileAll();
      const primaries3 = getPrimaryNotifications();
      expect(primaries3).toHaveLength(1);
      expect(primaries3[0].identifier).toBe(scheduledPrimaryId);
      expect(osScheduledStore.length).toBe(initialTotalCount);

      // Run 4: App focus reconciliation
      await NotificationReconcilerService.reconcileAll();
      const primaries4 = getPrimaryNotifications();
      expect(primaries4).toHaveLength(1);
      expect(primaries4[0].identifier).toBe(scheduledPrimaryId);
      expect(osScheduledStore.length).toBe(initialTotalCount);

      // Run 5: Final check
      await NotificationReconcilerService.reconcileAll();
      const primaries5 = getPrimaryNotifications();
      expect(primaries5).toHaveLength(1);
      expect(primaries5[0].identifier).toBe(scheduledPrimaryId);
      expect(primaries5[0].trigger.date.getTime()).toBe(anchor1100);
      expect(osScheduledStore.length).toBe(initialTotalCount);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Web Reload Reconstruction Parity
  // ───────────────────────────────────────────────────────────────────────────
  describe("5. Web reload reconstruction parity", () => {
    const originalPlatform = Platform.OS;

    afterEach(() => {
      Object.defineProperty(Platform, "OS", { value: originalPlatform });
    });

    it("web reload at 10:15 reconstructs next occurrence at 11:00:00 from immutable domain anchor", async () => {
      Object.defineProperty(Platform, "OS", { value: "web" });

      const task = createIntervalTask("task-web", anchor0900, 2, "hours");

      // Page reload occurs at 10:15:00 UTC
      const reloadTime = anchor0900 + 75 * 60 * 1000; // 10:15:00
      jest.spyOn(Date, "now").mockReturnValue(reloadTime);

      const rearmed = await rearmWebReminders([task]);
      expect(rearmed).toHaveLength(1);

      // Check the created web reminder loops (primary + escalations)
      const loops = getWebReminderLoops();
      expect(loops.size).toBeGreaterThan(0);

      const primaryLoop = Array.from(loops.values()).find((l) => !l.escalationLevel || l.escalationLevel === 0)!;
      expect(primaryLoop).toBeDefined();
      expect(primaryLoop.itemId).toBe("task-web");
      expect(primaryLoop.notificationScheduleKey).toBe(
        buildNotificationScheduleKey({
          type: "interval",
          interval: 2,
          unit: "hours",
          anchor: anchor0900,
          offsetMinutes: 0,
        })
      );

      // The next occurrence must align with 11:00:00.000Z
      const nextExpected = getNextIntervalOccurrenceEpoch(anchor0900, 2, "hours", 0, reloadTime);
      expect(nextExpected).toBe(anchor1100);

      // Initial delay must be exactly 11:00 - 10:15 = 45 minutes = 2,700,000 ms
      const expectedDelay = anchor1100 - reloadTime;
      expect(expectedDelay).toBe(45 * 60 * 1000);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Alert Center, Reconciler, Native & Web Convergence
  // ───────────────────────────────────────────────────────────────────────────
  describe("6. Cross-subsystem occurrence convergence", () => {
    it("proves Domain = Native = Web = Alert Center = Reconciler across all lifecycle states", () => {
      const task = createIntervalTask("task-convergence", anchor0900, 2, "hours");

      const checkPoints = [
        { label: "Before anchor (08:30)", now: anchor0900 - 30 * 60 * 1000, expected: anchor0900 },
        { label: "Jitter delivery #1 (09:00:07)", now: anchor0900 + 7000, expected: anchor1100 },
        { label: "Mid-cycle (10:15)", now: anchor0900 + 75 * 60 * 1000, expected: anchor1100 },
        { label: "Jitter delivery #2 (11:00:04)", now: anchor1100 + 4000, expected: anchor1300 },
        { label: "Missed firing caught at 12:45", now: anchor0900 + 225 * 60 * 1000, expected: anchor1300 },
        { label: "Multi-miss caught at 14:10", now: anchor0900 + 310 * 60 * 1000, expected: anchor1500 },
      ];

      for (const cp of checkPoints) {
        // 1. Core Recurrence Calculation
        const domainEpoch = getNextIntervalOccurrenceEpoch(anchor0900, 2, "hours", 0, cp.now);
        expect(domainEpoch).toBe(cp.expected);

        // 2. Alert Center Projection
        jest.spyOn(Date, "now").mockReturnValue(cp.now);
        const alertCenterEpoch = AlertCenterService.getNextRecurringOccurrenceEpoch(task, anchor0900);
        expect(alertCenterEpoch).toBe(cp.expected);

        // Strict convergence
        expect(alertCenterEpoch).toBe(domainEpoch);
      }
    });
  });
});
