import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { listScheduledNotifications, rescheduleTodoReminders, scheduleReminderBatch } from "@/services/scheduling/reminders.service";
import { TaskRepository } from "@/repositories/TaskRepository";
import type { Task } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: { DATE: "date", TIME_INTERVAL: "timeInterval", DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly" },
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
}));

const storage = AsyncStorage as typeof AsyncStorage;
const task: Task = { id: "task-reminder", workspaceId: "inbox", title: "Reminder task", status: "todo", priority: "none", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1, reminder: { enabled: true, triggerAt: Date.now() + 3_600_000, notificationIds: [] } };

beforeEach(async () => {
  await storage.clear();
  jest.restoreAllMocks();
  jest.useFakeTimers().setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
});

afterEach(() => { jest.useRealTimers(); });

describe("Phase 0 reminder side-effect invariants", () => {
  test.failing("cancels already-created native notifications when a later batch item fails", async () => {
    const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
    schedule.mockResolvedValueOnce("native-1").mockRejectedValueOnce(new Error("native scheduling failed"));
    await expect(scheduleReminderBatch({ kind: "todo", itemId: "task-reminder", title: "Reminder task", oneTimeAt: new Date("2030-01-01T01:00:00.000Z"), escalationMinutes: [60] })).rejects.toThrow("native scheduling failed");
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("native-1");
  });

  test.failing("records a reconciliation signal when scheduling fails after entity persistence", async () => {
    await TaskRepository.saveTask(task);
    (Notifications.scheduleNotificationAsync as jest.Mock).mockRejectedValue(new Error("native scheduling failed"));
    const result = await rescheduleTodoReminders(task);
    expect(result.reminder?.notificationIds).toEqual(expect.any(Array));
    expect(result.reminder?.notificationIds).not.toEqual([]);
  });

  test.failing("reconciles an orphan native notification whose entity no longer exists", async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([{ identifier: "orphan-1", content: { data: { itemId: "missing-task", kind: "todo" } }, trigger: null }]);
    const scheduled = await listScheduledNotifications();
    expect(scheduled.some((entry: any) => entry.identifier === "orphan-1")).toBe(false);
  });
});
