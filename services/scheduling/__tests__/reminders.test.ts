import {
  cancelReminderIds,
  rescheduleChecklistReminders,
  rescheduleHabitReminders,
  rescheduleTodoReminders,
  scheduleReminderBatch,
} from "@/services/scheduling/reminders.service";
import { getExpectedNotificationScheduleKeys } from "@/services/notifications/notification-identity";
import { getUpcomingOccurrenceEpochs } from "@/services/scheduling/recurrence.service";
import { dateKeyFromDate } from "@/shared/utils/date-key";
import { type Checklist, type Habit, type Task } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue("mock-notif-id"),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: {
    DATE: "date",
    DAILY: "daily"
  }
}));

describe("reminders.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("scheduleReminderBatch", () => {
    it("should schedule a one-time reminder", async () => {
      const futureDate = new Date(Date.now() + 60000);
      const res = await scheduleReminderBatch({
        kind: "todo",
        itemId: "task-1",
        title: "Test Task",
        oneTimeAt: futureDate,
        escalationMinutes: [],
      });

      expect(res.primaryId).toBe("mock-notif-id");
      expect(res.ids.length).toBe(1);
    });

    it("should not schedule a one-time reminder in the past", async () => {
      const pastDate = new Date(Date.now() - 60000);
      const res = await scheduleReminderBatch({
        kind: "todo",
        itemId: "task-2",
        title: "Past Task",
        oneTimeAt: pastDate,
        escalationMinutes: [],
      });

      expect(res.primaryId).toBeUndefined();
      expect(res.ids).toEqual([]);
    });

    it("should schedule escalation reminders for one-time alerts", async () => {
      const futureDate = new Date(Date.now() + 60000);
      const res = await scheduleReminderBatch({
        kind: "todo",
        itemId: "task-3",
        title: "Escalating Task",
        oneTimeAt: futureDate,
        escalationMinutes: [10, 20],
      });

      expect(res.ids.length).toBe(3);
    });
  });

  describe("cancelReminderIds", () => {
    it("should call cancelScheduledNotificationAsync for every id provided", async () => {
      const Notifications = await import("expo-notifications");
      await cancelReminderIds(["id-1", "id-2", "id-3"]);

      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(3);
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("id-1");
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("id-2");
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("id-3");
    });

    it("should swallow errors by default", async () => {
      const Notifications = await import("expo-notifications");
      (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockRejectedValueOnce(new Error("Notification error"));
      
      await expect(cancelReminderIds(["err-id-1"])).resolves.toBeUndefined();
    });

    it("should throw errors when throwOnError is true", async () => {
      const Notifications = await import("expo-notifications");
      (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockRejectedValueOnce(new Error("Notification error"));
      
      await expect(cancelReminderIds(["err-id-2"], { throwOnError: true })).rejects.toThrow("Notification error");
    });
  });

  describe("rescheduleTodoReminders and rescheduleHabitReminders", () => {
    const mockTodo: Task = {
      id: "todo-123",
      workspaceId: "default",
      title: "Test Reschedule",
      status: "todo",
      priority: "none",
      reminder: {
        enabled: true,
        triggerAt: Date.now() + 300000,
        notificationIds: [],
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const mockHabit: Habit = {
      id: "habit-123",
      workspaceId: "default",
      title: "Test Habit",
      recurrence: {
        frequency: "daily",
        interval: 1,
      },
      completionHistory: [],
      revision: 1,
      lifecycleGeneration: 1,
      reminder: {
        enabled: true,
        triggerAt: Date.now() + 300000,
        notificationIds: [],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    it("should schedule alarm for todo items and return updated object", async () => {
      const updated = await rescheduleTodoReminders(mockTodo);
      expect(updated.reminder?.notificationIds?.length).toBeGreaterThan(0);
    });

    it("should schedule recurrence alerts for habit items and return updated object", async () => {
      const updated = await rescheduleHabitReminders(mockHabit);
      expect(updated.reminder?.notificationIds?.length).toBeGreaterThan(0);
    });
  });

  describe("rescheduleChecklistReminders — recurrence exceptions", () => {
    const makeDailyChecklist = (
      options: { exceptions?: string[] } = {},
    ): Checklist => {
      const now = new Date();
      const tomorrow = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        9,
        0,
        0,
        0,
      );
      return {
        id: "chk-exception-mode",
        workspaceId: "ws-1",
        title: "Daily Check",
        priority: "none",
        items: [{ id: "i1", title: "Step", completed: false }],
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: now.getTime(),
        updatedAt: now.getTime(),
        schedule: { date: dateKeyFromDate(tomorrow), startTime: "09:00" },
        recurrence: { frequency: "daily", interval: 1 },
        recurrenceExceptions: options.exceptions,
        reminder: { enabled: true, triggerAt: tomorrow.getTime() },
      };
    };

    const scheduledCalls = async () => {
      const Notifications = await import("expo-notifications");
      return (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.map(
        (call) => call[0],
      );
    };

    it("materialises non-excepted occurrences as one-time notifications", async () => {
      const checklist = makeDailyChecklist();
      const now = new Date();
      const tomorrow = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        9,
        0,
        0,
        0,
      );
      const dayAfter = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 2,
        9,
        0,
        0,
        0,
      );
      checklist.recurrenceExceptions = [dateKeyFromDate(tomorrow)];

      const scheduled = await rescheduleChecklistReminders(checklist);
      expect(scheduled.reminder?.notificationIds).toBeDefined();

      const calls = await scheduledCalls();
      expect(calls.length).toBeGreaterThan(0);
      // Repeating DAILY triggers cannot exclude a single date.
      expect(calls.every((call) => call.trigger.type === "date")).toBe(true);
      expect(
        calls.some((call) => call.trigger.type === "daily"),
      ).toBe(false);

      const firesOn = (call: any, target: Date) => {
        const fire = new Date(call.trigger.date);
        return (
          fire.getFullYear() === target.getFullYear() &&
          fire.getMonth() === target.getMonth() &&
          fire.getDate() === target.getDate() &&
          fire.getHours() === target.getHours()
        );
      };

      // The excepted occurrence has no reminder...
      expect(calls.some((call) => firesOn(call, tomorrow))).toBe(false);
      // ...while the next unaffected occurrence still does.
      expect(calls.some((call) => firesOn(call, dayAfter))).toBe(true);

      // Reconciler parity: the physical schedule keys are exactly the keys the
      // reconciler will consider valid, so its next pass retains these slots.
      const expectedKeys = getExpectedNotificationScheduleKeys(
        checklist,
        [120, 240],
      );
      const scheduledKeys = new Set(
        calls
          .map((call) => call.content?.data?.notificationScheduleKey)
          .filter(Boolean),
      );
      expect(scheduledKeys).toEqual(expectedKeys);

      const occurrences = getUpcomingOccurrenceEpochs(
        checklist,
        checklist.reminder!.triggerAt,
      );
      expect(calls.length).toBe(occurrences.length * 3);
    });

    it("keeps the repeating schedule when no exceptions exist", async () => {
      const checklist = makeDailyChecklist();

      await rescheduleChecklistReminders(checklist);
      const calls = await scheduledCalls();

      expect(calls.some((call) => call.trigger.type === "daily")).toBe(true);
    });
  });
});
