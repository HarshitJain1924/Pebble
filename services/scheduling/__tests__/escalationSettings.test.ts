import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  SettingsRepository,
  DEFAULT_SETTINGS,
} from "@/repositories/SettingsRepository";
import { scheduleReminderBatch } from "@/services/scheduling/reminders.service";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

let mockNotifSeq = 0;
let mockScheduledOsNotifications: any[] = [];

jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: jest.fn().mockImplementation(async (req) => {
    const id = `os-notif-${++mockNotifSeq}`;
    mockScheduledOsNotifications.push({ identifier: id, content: req.content });
    return id;
  }),
  cancelScheduledNotificationAsync: jest.fn().mockImplementation(async (id: string) => {
    mockScheduledOsNotifications = mockScheduledOsNotifications.filter((n) => n.identifier !== id);
  }),
  getAllScheduledNotificationsAsync: jest.fn().mockImplementation(async () => [...mockScheduledOsNotifications]),
  setNotificationChannelAsync: jest.fn(),
  SchedulableTriggerInputTypes: {
    DATE: "date",
    DAILY: "daily",
    WEEKLY: "weekly",
  },
}));

function futureAtLocalHour(hour: number, minute = 0): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockScheduledOsNotifications = [];
  mockNotifSeq = 0;
});

describe("escalationEnabled gate in scheduleReminderBatch", () => {
  it("schedules primary + escalations when escalationEnabled is true (default)", async () => {
    // No persisted settings -> normalized defaults (escalationEnabled: true).
    const batch = await scheduleReminderBatch({
      kind: "todo",
      itemId: "task-1",
      title: "Escalation task",
      oneTimeAt: new Date(Date.now() + 60_000),
    });

    expect(batch.ids).toHaveLength(3);
    const levels = mockScheduledOsNotifications.map((n) => n.content.data.escalationLevel).sort();
    expect(levels).toEqual([0, 1, 2]);
  });

  it("schedules primary only when escalationEnabled is false", async () => {
    await SettingsRepository.saveSettings({
      ...DEFAULT_SETTINGS,
      escalationEnabled: false,
    });

    const batch = await scheduleReminderBatch({
      kind: "todo",
      itemId: "task-2",
      title: "No escalations",
      oneTimeAt: new Date(Date.now() + 60_000),
    });

    expect(batch.ids).toHaveLength(1);
    expect(mockScheduledOsNotifications).toHaveLength(1);
    expect(mockScheduledOsNotifications[0].content.data.escalationLevel).toBe(0);
  });

  it("respects caller-supplied custom escalation offsets when escalation is enabled", async () => {
    const triggerAt = new Date(Date.now() + 60_000);
    const batch = await scheduleReminderBatch({
      kind: "todo",
      itemId: "task-3",
      title: "Custom offsets",
      oneTimeAt: triggerAt,
      escalationMinutes: [60],
    });

    expect(batch.ids).toHaveLength(2);
    const esc = mockScheduledOsNotifications.find(
      (n) => n.content.data.escalationLevel === 1,
    );
    expect(esc).toBeDefined();
    // The physical schedule key must reflect the custom +60 minute offset.
    expect(esc.content.data.notificationScheduleKey).toBe(
      `once:${triggerAt.getTime()}:+60`,
    );
  });

  it("treats an empty caller escalation array as primary-only", async () => {
    const batch = await scheduleReminderBatch({
      kind: "todo",
      itemId: "task-4",
      title: "Primary only",
      oneTimeAt: new Date(Date.now() + 60_000),
      escalationMinutes: [],
    });

    expect(batch.ids).toHaveLength(1);
    expect(mockScheduledOsNotifications).toHaveLength(1);
  });
});

describe("schedule-time quiet-hours blocking", () => {
  it("blocks the whole batch when the primary oneTimeAt falls inside quiet hours", async () => {
    await SettingsRepository.saveSettings({
      ...DEFAULT_SETTINGS,
      quietHours: { enabled: true, startHour: 22, endHour: 7 },
    });

    const batch = await scheduleReminderBatch({
      kind: "todo",
      itemId: "task-qh",
      title: "Quiet hours task",
      oneTimeAt: futureAtLocalHour(23),
    });

    expect(batch.ids).toHaveLength(0);
    expect(mockScheduledOsNotifications).toHaveLength(0);
  });

  it("keeps scheduling when the primary falls outside quiet hours", async () => {
    await SettingsRepository.saveSettings({
      ...DEFAULT_SETTINGS,
      quietHours: { enabled: true, startHour: 22, endHour: 7 },
    });

    const batch = await scheduleReminderBatch({
      kind: "todo",
      itemId: "task-qh2",
      title: "Daytime task",
      oneTimeAt: futureAtLocalHour(12),
    });

    expect(batch.ids).toHaveLength(3);
  });
});

describe("schedule-time category subscription blocking", () => {
  it("prevents new scheduling for a disabled category", async () => {
    await SettingsRepository.saveSettings({
      ...DEFAULT_SETTINGS,
      categories: { ...DEFAULT_SETTINGS.categories, work: false },
    });

    const batch = await scheduleReminderBatch({
      kind: "todo",
      itemId: "task-cat-off",
      title: "Work task",
      category: "work",
      oneTimeAt: new Date(Date.now() + 60_000),
    });

    expect(batch.ids).toHaveLength(0);
    expect(mockScheduledOsNotifications).toHaveLength(0);
  });

  it("leaves unrelated categories unaffected", async () => {
    await SettingsRepository.saveSettings({
      ...DEFAULT_SETTINGS,
      categories: { ...DEFAULT_SETTINGS.categories, work: false },
    });

    const batch = await scheduleReminderBatch({
      kind: "todo",
      itemId: "task-cat-on",
      title: "Personal task",
      category: "personal",
      oneTimeAt: new Date(Date.now() + 60_000),
    });

    expect(batch.ids).toHaveLength(3);
  });
});