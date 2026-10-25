import { AlertCenterService } from "../AlertCenterService";
import { NotificationReconcilerService } from "../NotificationReconcilerService";
import { getNextIntervalOccurrenceEpoch } from "@/services/scheduling/recurrence.service";
import {
  scheduleReminderBatch,
  cancelReminderIds,
  rescheduleTodoReminders,
  getWebReminderLoops,
  clearWebReminderLoops,
} from "@/services/scheduling/reminders.service";
import {
  buildNotificationLogicalSignature,
  buildNotificationScheduleKey,
  getExpectedScheduleKeyForSlot,
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
  scheduleNotificationAsync: jest.fn().mockResolvedValue("mock-notif-id"),
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

describe("Interval Scheduling Architecture & Parity Audit", () => {
  // Fixed reference base timestamps
  // 2026-09-06 09:00:00 UTC
  const anchor9am = new Date("2026-09-06T09:00:00.000Z").getTime();
  const anchor10am = new Date("2026-09-06T10:00:00.000Z").getTime();
  const time837 = new Date("2026-09-06T08:37:00.000Z").getTime();
  const time1015 = new Date("2026-09-06T10:15:00.000Z").getTime();
  const time1130 = new Date("2026-09-06T11:30:00.000Z").getTime();

  let nextNotifSeq = 1;

  beforeEach(() => {
    jest.clearAllMocks();
    clearWebReminderLoops();
    nextNotifSeq = 1;

    (Notifications.scheduleNotificationAsync as jest.Mock).mockImplementation(async () => {
      return `os-int-${nextNotifSeq++}`;
    });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
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

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Interval anchored at an exact future time
  // ───────────────────────────────────────────────────────────────────────────
  it("1. Interval anchored at an exact future time (08:37 -> 09:00)", async () => {
    const nextEpoch = getNextIntervalOccurrenceEpoch(anchor9am, 2, "hours", 0, time837);
    expect(nextEpoch).toBe(anchor9am);

    const date = new Date(nextEpoch);
    expect(date.toISOString()).toBe("2026-09-06T09:00:00.000Z");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Interval scheduled before its anchor
  // ───────────────────────────────────────────────────────────────────────────
  it("2. Interval scheduled before its anchor executes at anchor time on Native", async () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(time837);

    try {
      const batch = await scheduleReminderBatch({
        kind: "todo",
        itemId: "task-test-2",
        title: "Test 2h before anchor",
        anchorTimestamp: anchor9am,
        recurrence: {
          type: "interval",
          interval: 2,
          unit: "hours",
        },
        escalationMinutes: [120, 240],
      });

      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(3);

      const calls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls;
      const primaryCall = calls[0][0];

      // Native trigger MUST be DATE trigger at 09:00:00.000Z, NOT TIME_INTERVAL from 08:37
      expect(primaryCall.trigger.type).toBe("date");
      expect(primaryCall.trigger.date.getTime()).toBe(anchor9am);
      expect(primaryCall.trigger.date.toISOString()).toBe("2026-09-06T09:00:00.000Z");

      // Verify schedule key matches
      expect(primaryCall.content.data.notificationScheduleKey).toBe(
        buildNotificationScheduleKey({
          type: "interval",
          interval: 2,
          unit: "hours",
          anchor: anchor9am,
          offsetMinutes: 0,
        })
      );
    } finally {
      nowSpy.mockRestore();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Interval scheduled after its anchor
  // ───────────────────────────────────────────────────────────────────────────
  it("3. Interval scheduled after its anchor (anchor 09:00, scheduled at 10:15 -> fires at 11:00)", async () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(time1015);

    try {
      const nextEpoch = getNextIntervalOccurrenceEpoch(anchor9am, 2, "hours", 0, time1015);
      const anchor11am = new Date("2026-09-06T11:00:00.000Z").getTime();
      expect(nextEpoch).toBe(anchor11am);

      const batch = await scheduleReminderBatch({
        kind: "todo",
        itemId: "task-test-3",
        title: "Test 2h after anchor",
        anchorTimestamp: anchor9am,
        recurrence: {
          type: "interval",
          interval: 2,
          unit: "hours",
        },
        escalationMinutes: [],
      });

      const calls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls;
      const primaryCall = calls[0][0];

      expect(primaryCall.trigger.type).toBe("date");
      expect(primaryCall.trigger.date.getTime()).toBe(anchor11am);
      expect(primaryCall.trigger.date.toISOString()).toBe("2026-09-06T11:00:00.000Z");
    } finally {
      nowSpy.mockRestore();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Interval rescheduling with a new anchor
  // ───────────────────────────────────────────────────────────────────────────
  it("4. Interval rescheduling with a new anchor (09:00 -> 10:00 shifts timeline and cancels old)", async () => {
    const task = createIntervalTask("task-resched", anchor10am, 2, "hours", ["os-old-9am"]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-resched": task });

    const key9am = buildNotificationScheduleKey({
      type: "interval",
      interval: 2,
      unit: "hours",
      anchor: anchor9am,
      offsetMinutes: 0,
    });

    const osNotifOld = {
      identifier: "os-old-9am",
      content: {
        data: {
          type: "todo",
          itemId: "task-resched",
          escalationLevel: 0,
          purpose: "reminder",
          logicalSignature: buildNotificationLogicalSignature("todo", "task-resched", "reminder"),
          notificationScheduleKey: key9am,
        },
      },
    };

    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osNotifOld]);

    // Old notification with 09:00 anchor does NOT match task with 10:00 anchor
    expect(isMatchingPhysicalNotification(osNotifOld.content.data, task, "todo", "reminder")).toBe(false);

    await NotificationReconcilerService.reconcileAll();

    // Reconciler cancels the outdated 09:00 notification
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("os-old-9am");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Interval 2h -> 4h
  // ───────────────────────────────────────────────────────────────────────────
  it("5. Interval configuration change (2h -> 4h): old 2h notification rejected and cancelled", async () => {
    const task = createIntervalTask("task-config-change", anchor9am, 4, "hours", ["os-2h"]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-config-change": task });

    const key2h = buildNotificationScheduleKey({
      type: "interval",
      interval: 2,
      unit: "hours",
      anchor: anchor9am,
      offsetMinutes: 0,
    });

    const osNotif2h = {
      identifier: "os-2h",
      content: {
        data: {
          type: "todo",
          itemId: "task-config-change",
          escalationLevel: 0,
          purpose: "reminder",
          logicalSignature: buildNotificationLogicalSignature("todo", "task-config-change", "reminder"),
          notificationScheduleKey: key2h,
        },
      },
    };

    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osNotif2h]);

    expect(isMatchingPhysicalNotification(osNotif2h.content.data, task, "todo", "reminder")).toBe(false);

    await NotificationReconcilerService.reconcileAll();

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("os-2h");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Interval escalation timing
  // ───────────────────────────────────────────────────────────────────────────
  it("6. Interval escalation timing (+120 minutes) maintains exact anchor offset and recurrence cadence", async () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(time837);

    try {
      const batch = await scheduleReminderBatch({
        kind: "todo",
        itemId: "task-esc-timing",
        title: "Test Escalation Timing",
        anchorTimestamp: anchor9am,
        recurrence: {
          type: "interval",
          interval: 2,
          unit: "hours",
        },
        escalationMinutes: [120, 240],
      });

      const calls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls;
      expect(calls.length).toBe(3);

      const primary = calls[0][0];
      const esc1 = calls[1][0];
      const esc2 = calls[2][0];

      // Primary: 09:00:00.000Z
      expect(primary.trigger.date.toISOString()).toBe("2026-09-06T09:00:00.000Z");
      // Escalation 1: 09:00 + 120m = 11:00:00.000Z
      expect(esc1.trigger.date.toISOString()).toBe("2026-09-06T11:00:00.000Z");
      // Escalation 2: 09:00 + 240m = 13:00:00.000Z
      expect(esc2.trigger.date.toISOString()).toBe("2026-09-06T13:00:00.000Z");

      // Verify schedule keys encode exact offset
      expect(esc1.content.data.notificationScheduleKey).toBe(
        buildNotificationScheduleKey({
          type: "interval",
          interval: 2,
          unit: "hours",
          anchor: anchor9am,
          offsetMinutes: 120,
        })
      );
      expect(esc2.content.data.notificationScheduleKey).toBe(
        buildNotificationScheduleKey({
          type: "interval",
          interval: 2,
          unit: "hours",
          anchor: anchor9am,
          offsetMinutes: 240,
        })
      );
    } finally {
      nowSpy.mockRestore();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Native vs Web equivalent timing
  // ───────────────────────────────────────────────────────────────────────────
  it("7. Native vs Web equivalent timing: both execute at identical anchored timestamps", async () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(time837);

    try {
      // 1. Native scheduling
      const nativeBatch = await scheduleReminderBatch({
        kind: "todo",
        itemId: "task-parity",
        title: "Parity Task",
        anchorTimestamp: anchor9am,
        recurrence: {
          type: "interval",
          interval: 2,
          unit: "hours",
        },
        escalationMinutes: [],
      });

      const nativeCall = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
      const nativeFireTime = nativeCall.trigger.date.getTime();
      expect(nativeFireTime).toBe(anchor9am);

      // 2. Web scheduling
      const originalPlatform = Platform.OS;
      Object.defineProperty(Platform, "OS", { value: "web", configurable: true });

      try {
        const webBatch = await scheduleReminderBatch({
          kind: "todo",
          itemId: "task-parity",
          title: "Parity Task",
          anchorTimestamp: anchor9am,
          recurrence: {
            type: "interval",
            interval: 2,
            unit: "hours",
          },
          escalationMinutes: [],
        });

        const loops = getWebReminderLoops();
        expect(loops.size).toBe(1);

        // The web delay must equal (anchor9am - time837) = 23 minutes = 1,380,000 ms
        const expectedDelay = anchor9am - time837;
        expect(expectedDelay).toBe(23 * 60 * 1000);

        // Effective web first fire timestamp = time837 + initialDelay = anchor9am!
        const webFirstFireTime = time837 + expectedDelay;
        expect(webFirstFireTime).toBe(nativeFireTime);
      } finally {
        Object.defineProperty(Platform, "OS", { value: originalPlatform, configurable: true });
      }
    } finally {
      nowSpy.mockRestore();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. Alert Center next occurrence
  // ───────────────────────────────────────────────────────────────────────────
  it("8. Alert Center next occurrence matches actual scheduler and domain grid", () => {
    const task = createIntervalTask("task-ac", anchor9am, 2, "hours");

    // Before anchor (at 08:37) -> projects 09:00
    const nowSpy1 = jest.spyOn(Date, "now").mockReturnValue(time837);
    const nextAt837 = AlertCenterService.getNextRecurringOccurrenceEpoch(task, anchor9am);
    expect(nextAt837).toBe(anchor9am);
    nowSpy1.mockRestore();

    // After anchor (at 10:15) -> projects 11:00 (NOT tomorrow at 09:00!)
    const nowSpy2 = jest.spyOn(Date, "now").mockReturnValue(time1015);
    const nextAt1015 = AlertCenterService.getNextRecurringOccurrenceEpoch(task, anchor9am);
    const anchor11am = new Date("2026-09-06T11:00:00.000Z").getTime();
    expect(nextAt1015).toBe(anchor11am);
    nowSpy2.mockRestore();

    // Later (at 11:30) -> projects 13:00
    const nowSpy3 = jest.spyOn(Date, "now").mockReturnValue(time1130);
    const nextAt1130 = AlertCenterService.getNextRecurringOccurrenceEpoch(task, anchor9am);
    const anchor1pm = new Date("2026-09-06T13:00:00.000Z").getTime();
    expect(nextAt1130).toBe(anchor1pm);
    nowSpy3.mockRestore();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. Reconciliation expected occurrence
  // ───────────────────────────────────────────────────────────────────────────
  it("9. Reconciliation expected occurrence matches domain grid", () => {
    const task = createIntervalTask("task-reconcile-exp", anchor9am, 2, "hours");

    const expectedKey = getExpectedScheduleKeyForSlot(task, 0);
    expect(expectedKey).toBe(
      buildNotificationScheduleKey({
        type: "interval",
        interval: 2,
        unit: "hours",
        anchor: anchor9am,
        offsetMinutes: 0,
      })
    );

    // Matching OS notification
    const validData = {
      type: "todo",
      itemId: "task-reconcile-exp",
      escalationLevel: 0,
      purpose: "reminder",
      logicalSignature: buildNotificationLogicalSignature("todo", "task-reconcile-exp", "reminder"),
      notificationScheduleKey: expectedKey!,
    };
    expect(isMatchingPhysicalNotification(validData, task, "todo", "reminder")).toBe(true);

    // Mismatched anchor OS notification
    const staleData = {
      ...validData,
      notificationScheduleKey: buildNotificationScheduleKey({
        type: "interval",
        interval: 2,
        unit: "hours",
        anchor: anchor10am,
        offsetMinutes: 0,
      }),
    };
    expect(isMatchingPhysicalNotification(staleData, task, "todo", "reminder")).toBe(false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 10. Repeated reconciliation does not shift the interval anchor
  // ───────────────────────────────────────────────────────────────────────────
  it("10. Repeated reconciliation (5 passes) does not shift the interval anchor", async () => {
    const key9am = buildNotificationScheduleKey({
      type: "interval",
      interval: 2,
      unit: "hours",
      anchor: anchor9am,
      offsetMinutes: 0,
    });

    const task = createIntervalTask("task-repeated", anchor9am, 2, "hours", ["os-int-stable"]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-repeated": task });

    const osNotif = {
      identifier: "os-int-stable",
      content: {
        data: {
          type: "todo",
          itemId: "task-repeated",
          escalationLevel: 0,
          purpose: "reminder",
          logicalSignature: buildNotificationLogicalSignature("todo", "task-repeated", "reminder"),
          notificationScheduleKey: key9am,
        },
      },
    };

    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osNotif]);

    // Run 5 consecutive reconciliation passes
    for (let pass = 1; pass <= 5; pass++) {
      await NotificationReconcilerService.reconcileAll();
    }

    // The valid notification was NEVER cancelled
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();

    // Domain notificationIds and anchor are untouched
    expect(task.reminder?.triggerAt).toBe(anchor9am);
    expect(task.reminder?.notificationIds).toEqual(["os-int-stable"]);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 11. App reload/startup does not shift the interval anchor
  // ───────────────────────────────────────────────────────────────────────────
  it("11. App reload/startup preserves the active anchor and does not reschedule", async () => {
    const key9am = buildNotificationScheduleKey({
      type: "interval",
      interval: 2,
      unit: "hours",
      anchor: anchor9am,
      offsetMinutes: 0,
    });

    // Simulated app boot with persisted task
    const task = createIntervalTask("task-boot", anchor9am, 2, "hours", ["os-boot-1"]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-boot": task });

    const osNotif = {
      identifier: "os-boot-1",
      content: {
        data: {
          type: "todo",
          itemId: "task-boot",
          escalationLevel: 0,
          purpose: "reminder",
          logicalSignature: buildNotificationLogicalSignature("todo", "task-boot", "reminder"),
          notificationScheduleKey: key9am,
        },
      },
    };

    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osNotif]);

    // App layout startup reconciliation
    await NotificationReconcilerService.reconcileAll();

    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(task.reminder?.triggerAt).toBe(anchor9am);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 12. Cancellation and recreation preserve the intended anchor
  // ───────────────────────────────────────────────────────────────────────────
  it("12. Cancellation and recreation preserve the intended anchor", async () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(time837);

    try {
      // 1. Schedule initial batch
      const batch1 = await scheduleReminderBatch({
        kind: "todo",
        itemId: "task-cancel-recreate",
        title: "Cancel and Recreate",
        anchorTimestamp: anchor9am,
        recurrence: {
          type: "interval",
          interval: 2,
          unit: "hours",
        },
        escalationMinutes: [],
      });

      expect(batch1.ids.length).toBe(1);
      const initialId = batch1.ids[0];

      // 2. Explicitly cancel
      await cancelReminderIds([initialId]);
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(initialId);

      // 3. Recreate with the intended anchor
      const batch2 = await scheduleReminderBatch({
        kind: "todo",
        itemId: "task-cancel-recreate",
        title: "Cancel and Recreate",
        anchorTimestamp: anchor9am,
        recurrence: {
          type: "interval",
          interval: 2,
          unit: "hours",
        },
        escalationMinutes: [],
      });

      const calls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls;
      const recreationCall = calls[calls.length - 1][0];

      // Recreated trigger is still anchored to 09:00:00.000Z
      expect(recreationCall.trigger.date.getTime()).toBe(anchor9am);
      expect(recreationCall.trigger.date.toISOString()).toBe("2026-09-06T09:00:00.000Z");
    } finally {
      nowSpy.mockRestore();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 13. Three-Way Invariant: Domain == Scheduler == Alert Center
  // ───────────────────────────────────────────────────────────────────────────
  it("13. 3-Way Invariant Test: domain expected occurrence == scheduler-generated occurrence == Alert Center projected occurrence", async () => {
    const task = createIntervalTask("task-invariant", anchor9am, 2, "hours");

    // Test across 5 distinct points in time
    const testPoints = [
      { now: time837, expectedIso: "2026-09-06T09:00:00.000Z" },
      { now: anchor9am, expectedIso: "2026-09-06T11:00:00.000Z" },
      { now: time1015, expectedIso: "2026-09-06T11:00:00.000Z" },
      { now: new Date("2026-09-06T11:00:00.000Z").getTime(), expectedIso: "2026-09-06T13:00:00.000Z" },
      { now: time1130, expectedIso: "2026-09-06T13:00:00.000Z" },
    ];

    for (const point of testPoints) {
      const expectedTime = new Date(point.expectedIso).getTime();

      // 1. Domain calculation
      const domainOccurrence = getNextIntervalOccurrenceEpoch(anchor9am, 2, "hours", 0, point.now);
      expect(domainOccurrence).toBe(expectedTime);

      // 2. Alert Center projection
      const nowSpy = jest.spyOn(Date, "now").mockReturnValue(point.now);
      const alertCenterOccurrence = AlertCenterService.getNextRecurringOccurrenceEpoch(task, anchor9am);
      expect(alertCenterOccurrence).toBe(expectedTime);

      // 3. Scheduler-generated occurrence
      const batch = await scheduleReminderBatch({
        kind: "todo",
        itemId: "task-invariant",
        title: "Invariant Task",
        anchorTimestamp: anchor9am,
        recurrence: {
          type: "interval",
          interval: 2,
          unit: "hours",
        },
        escalationMinutes: [],
      });

      const calls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls;
      const lastCall = calls[calls.length - 1][0];
      const schedulerOccurrence = lastCall.trigger.date.getTime();
      expect(schedulerOccurrence).toBe(expectedTime);

      // Absolute equality across all three
      expect(domainOccurrence).toBe(schedulerOccurrence);
      expect(schedulerOccurrence).toBe(alertCenterOccurrence);

      nowSpy.mockRestore();
    }
  });
});
