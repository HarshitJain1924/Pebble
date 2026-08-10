import {
  cancelReminderIds,
  rescheduleHabitReminders,
  rescheduleTodoReminders,
  scheduleReminderBatch,
} from "@/services/scheduling/reminders.service";
import { type Habit, type Task } from "@/shared/types/domain.types";

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
});
