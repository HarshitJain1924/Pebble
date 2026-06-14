import {
  scheduleReminderBatch,
  cancelReminderIds,
  rescheduleTodoReminders,
  rescheduleHabitReminders,
} from "../reminders";
import * as Notifications from "expo-notifications";
import * as settingsService from "../settingsService";
import { type Todo, type Habit } from "@/modules/types";

// Mock @react-native-async-storage/async-storage
jest.mock("@react-native-async-storage/async-storage", () => {
  return {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(null),
    removeItem: jest.fn().mockResolvedValue(null),
    multiSet: jest.fn().mockResolvedValue(null),
    multiGet: jest.fn().mockResolvedValue([]),
    clear: jest.fn().mockResolvedValue(null),
  };
});

// Mock expo-notifications
jest.mock("expo-notifications", () => {
  return {
    SchedulableTriggerInputTypes: {
      DATE: "date",
      TIME_INTERVAL: "timeInterval",
      DAILY: "daily",
      WEEKLY: "weekly",
      MONTHLY: "monthly",
    },
    scheduleNotificationAsync: jest.fn().mockResolvedValue("mock-notif-id"),
    cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
    cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
    getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  };
});

// Mock settingsService
jest.mock("../settingsService", () => {
  const actual = jest.requireActual("../settingsService");
  return {
    ...actual,
    getSettings: jest.fn().mockResolvedValue({
      quietHours: { enabled: false, startHour: 22, endHour: 7 },
      categories: { work: true, health: true, todo: true, habit: true },
      escalationEnabled: true,
    }),
  };
});

describe("reminders service unit tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("cancelReminderIds", () => {
    it("should clear web timeouts and intervals", async () => {
      const spyTimeout = jest.spyOn(global, "clearTimeout");
      const spyInterval = jest.spyOn(global, "clearInterval");

      await cancelReminderIds(["web-timeout-123", "web-interval-456"]);

      expect(spyTimeout).toHaveBeenCalledWith(123);
      expect(spyInterval).toHaveBeenCalledWith(456);

      spyTimeout.mockRestore();
      spyInterval.mockRestore();
    });

    it("should cancel native notifications", async () => {
      await cancelReminderIds(["native-id-1", "native-id-2"]);
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenNthCalledWith(1, "native-id-1");
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenNthCalledWith(2, "native-id-2");
    });
  });

  describe("scheduleReminderBatch", () => {
    const defaultOptions = {
      kind: "todo" as const,
      itemId: "task-1",
      title: "Test Task",
      channelId: "my-channel",
      category: "work",
    };

    it("should return empty list if category notifications are disabled in settings", async () => {
      (settingsService.getSettings as jest.Mock).mockResolvedValueOnce({
        quietHours: { enabled: false },
        categories: { work: false }, // work category disabled
      });

      const result = await scheduleReminderBatch({
        ...defaultOptions,
        oneTimeAt: new Date(Date.now() + 60000),
      });

      expect(result.ids).toEqual([]);
      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it("should schedule one-time date notifications with escalations", async () => {
      (settingsService.getSettings as jest.Mock).mockResolvedValueOnce({
        quietHours: { enabled: false },
        categories: { work: true },
      });

      const oneTimeAt = new Date("2026-06-09T10:00:00");
      const result = await scheduleReminderBatch({
        ...defaultOptions,
        oneTimeAt,
        escalationMinutes: [30, 60],
      });

      // Schedules 3 notifications: base + 30m escalation + 60m escalation
      expect(result.ids.length).toBe(3);
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(3);

      expect(result.alarmTime).toBe(oneTimeAt.getTime());
      expect(result.escalationMinutes).toEqual([30, 60]);
    });

    it("should skip scheduled alarms if they fall inside Quiet Hours", async () => {
      // Setup quiet hours between 22:00 and 07:00
      (settingsService.getSettings as jest.Mock).mockResolvedValueOnce({
        quietHours: { enabled: true, startHour: 22, endHour: 7 },
        categories: { work: true },
      });

      // 23:30 (inside quiet hours)
      const oneTimeAt = new Date("2026-06-09T23:30:00");
      const result = await scheduleReminderBatch({
        ...defaultOptions,
        oneTimeAt,
        escalationMinutes: [120], // +2 hours falls on 01:30 (also inside quiet hours)
      });

      // Should skip both the primary alarm and escalation
      expect(result.ids).toEqual([]);
      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it("should schedule recurrence interval alerts", async () => {
      (settingsService.getSettings as jest.Mock).mockResolvedValueOnce({
        quietHours: { enabled: false },
        categories: { work: true },
      });

      const result = await scheduleReminderBatch({
        ...defaultOptions,
        recurrence: {
          type: "interval",
          interval: 2,
          unit: "hours",
        },
      });

      // Interval does not have escalation hours, schedules only 1 trigger
      expect(result.ids.length).toBe(1);
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger: expect.objectContaining({
            type: "timeInterval",
            seconds: 7200, // 2 hours
            repeats: true,
          }),
        })
      );
    });

    it("should schedule recurrence daily alerts", async () => {
      (settingsService.getSettings as jest.Mock).mockResolvedValueOnce({
        quietHours: { enabled: false },
        categories: { work: true },
      });

      const result = await scheduleReminderBatch({
        ...defaultOptions,
        dailyTime: { hour: 8, minute: 30 },
        recurrence: {
          type: "daily",
        },
        escalationMinutes: [10],
      });

      // Schedules daily alarms: primary (8:30) + escalation (8:40)
      expect(result.ids.length).toBe(2);
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    });

    it("should schedule recurrence weekly/weekdays alerts", async () => {
      (settingsService.getSettings as jest.Mock).mockResolvedValueOnce({
        quietHours: { enabled: false },
        categories: { work: true },
      });

      const result = await scheduleReminderBatch({
        ...defaultOptions,
        dailyTime: { hour: 9, minute: 0 },
        recurrence: {
          type: "weekly",
          days: [1, 3], // Monday, Wednesday
        },
        escalationMinutes: [], // defaults to [120, 240]
      });

      // For weekly: targetDays=[1,3]
      // For each day, it schedules primary, +2h escalation, +4h escalation (3 per day)
      // Total = 2 days * 3 alarms = 6 alarms
      expect(result.ids.length).toBe(6);
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(6);
    });
  });

  describe("rescheduleTodoReminders and rescheduleHabitReminders", () => {
    const mockTodo: Todo = {
      id: "todo-123",
      title: "Test Reschedule",
      completed: false,
      archived: false,
      folderId: "default",
      category: "work",
      alarmTime: Date.now() + 300000, // 5 min future
    };

    const mockHabit: Habit = {
      id: "habit-123",
      title: "Test Habit",
      archived: false,
      category: "health",
      reminderHour: 7,
      reminderMinute: 15,
      reminderDays: [1, 2, 3, 4, 5],
      streak: 0,
      bestStreak: 0,
      completedToday: false,
    };

    it("should schedule alarm for todo items and return updated object", async () => {
      const updated = await rescheduleTodoReminders(mockTodo);
      expect(updated.alarmId).toBe("mock-notif-id");
      expect(updated.notificationIds).toEqual(["mock-notif-id", "mock-notif-id", "mock-notif-id"]); // base + 2 default escalations
    });

    it("should schedule recurrence alerts for habit items and return updated object", async () => {
      const updated = await rescheduleHabitReminders(mockHabit);
      expect(updated.notificationIds?.length).toBeGreaterThan(0);
    });
  });
});
