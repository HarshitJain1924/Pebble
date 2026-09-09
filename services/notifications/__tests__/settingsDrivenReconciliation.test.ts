import AsyncStorage from "@react-native-async-storage/async-storage";
import { NotificationReconcilerService } from "@/services/notifications/NotificationReconcilerService";
import { TaskRepository } from "@/repositories/TaskRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import {
  SettingsRepository,
  DEFAULT_SETTINGS,
} from "@/repositories/SettingsRepository";
import * as remindersService from "@/services/scheduling/reminders.service";
import type { Habit, Task, Workspace } from "@/shared/types/domain.types";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { emitStateChange } from "@/services/events/state-events";

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

const workspace: Workspace = {
  id: INBOX_WORKSPACE_ID,
  name: "Inbox",
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1000,
  updatedAt: 1000,
};

function futureAtLocalHour(hour: number, minute = 0): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

function osNotifsFor(itemId: string): any[] {
  return mockScheduledOsNotifications.filter(
    (n) => n.content.data?.itemId === itemId && n.content.data?.type === "todo",
  );
}

function habitOsNotifsFor(itemId: string): any[] {
  return mockScheduledOsNotifications.filter(
    (n) => n.content.data?.itemId === itemId && n.content.data?.type === "habit",
  );
}

async function scheduleTaskWithEscalations(
  id: string,
  categoryId: string | undefined,
  triggerAt: number,
): Promise<void> {
  const batch = await remindersService.scheduleReminderBatch({
    kind: "todo",
    itemId: id,
    title: `Task ${id}`,
    category: categoryId,
    oneTimeAt: new Date(triggerAt),
    escalationMinutes: [120, 240],
    workspaceId: INBOX_WORKSPACE_ID,
  });
  const task: Task = {
    id,
    workspaceId: INBOX_WORKSPACE_ID,
    title: `Task ${id}`,
    status: "todo",
    priority: "none",
    ...(categoryId ? { categoryId } : {}),
    reminder: { enabled: true, triggerAt, notificationIds: batch.ids },
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };
  await TaskRepository.saveTask(task);
}

async function scheduleHabitWithEscalations(
  id: string,
  triggerDate: Date,
): Promise<void> {
  // Habit without a categoryId maps to the kind key "habit" in settings.categories.
  const anchor = triggerDate.getTime();
  const batch = await remindersService.scheduleReminderBatch({
    kind: "habit",
    itemId: id,
    title: `Habit ${id}`,
    dailyTime: { hour: triggerDate.getHours(), minute: triggerDate.getMinutes() },
    recurrence: { type: "daily" },
    escalationMinutes: [120, 240],
    workspaceId: INBOX_WORKSPACE_ID,
    anchorTimestamp: anchor,
  });
  const habit: Habit = {
    id,
    workspaceId: INBOX_WORKSPACE_ID,
    title: `Habit ${id}`,
    recurrence: { frequency: "daily", interval: 1 },
    completionHistory: [],
    reminder: { enabled: true, triggerAt: anchor, notificationIds: batch.ids },
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };
  await HabitRepository.saveHabit(habit);
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockScheduledOsNotifications = [];
  mockNotifSeq = 0;
  NotificationReconcilerService.resetInFlightForTesting();
  await WorkspaceRepository.saveWorkspace(workspace);
});

afterEach(() => {
  NotificationReconcilerService.resetInFlightForTesting();
});

describe("quiet-hours reconciliation", () => {
  it("enabling quiet hours cancels already-scheduled notifications that fall inside the window", async () => {
    const triggerAt = futureAtLocalHour(23).getTime();
    await scheduleTaskWithEscalations("task-qh", "work", triggerAt);
    expect(osNotifsFor("task-qh")).toHaveLength(3);

    // 23:00 primary, +120 -> 01:00, +240 -> 03:00 — all inside 22:00-07:00.
    await SettingsRepository.saveSettings({
      ...DEFAULT_SETTINGS,
      quietHours: { enabled: true, startHour: 22, endHour: 7 },
    });

    await NotificationReconcilerService.reconcileScheduledNotificationsForSettings();

    expect(osNotifsFor("task-qh")).toHaveLength(0);
    const task = await TaskRepository.getTask("task-qh", INBOX_WORKSPACE_ID);
    expect(task?.reminder?.notificationIds).toEqual([]);
  });

  it("disabling quiet hours makes eligible future reminders return (rescheduled, not duplicated)", async () => {
    const triggerAt = futureAtLocalHour(23).getTime();
    await scheduleTaskWithEscalations("task-qh2", "work", triggerAt);
    await SettingsRepository.saveSettings({
      ...DEFAULT_SETTINGS,
      quietHours: { enabled: true, startHour: 22, endHour: 7 },
    });
    await NotificationReconcilerService.reconcileScheduledNotificationsForSettings();
    expect(osNotifsFor("task-qh2")).toHaveLength(0);

    await SettingsRepository.saveSettings(DEFAULT_SETTINGS);
    await NotificationReconcilerService.reconcileScheduledNotificationsForSettings();

    const notifs = osNotifsFor("task-qh2");
    expect(notifs).toHaveLength(3);
    const levels = notifs.map((n) => n.content.data.escalationLevel).sort();
    expect(levels).toEqual([0, 1, 2]);

    const task = await TaskRepository.getTask("task-qh2", INBOX_WORKSPACE_ID);
    expect(task?.reminder?.notificationIds?.length).toBe(3);
  });

  it("blocks an escalation that falls inside quiet hours while retaining the primary", async () => {
    // Window 23:00-01:00: primary 22:00 allowed, +120 -> 00:00 blocked,
    // +240 -> 02:00 allowed.
    const triggerAt = futureAtLocalHour(22).getTime();
    await scheduleTaskWithEscalations("task-qh3", "work", triggerAt);
    await SettingsRepository.saveSettings({
      ...DEFAULT_SETTINGS,
      quietHours: { enabled: true, startHour: 23, endHour: 1 },
    });

    await NotificationReconcilerService.reconcileScheduledNotificationsForSettings();

    const notifs = osNotifsFor("task-qh3");
    const levels = notifs.map((n) => n.content.data.escalationLevel).sort();
    expect(levels).toEqual([0, 2]);

    const task = await TaskRepository.getTask("task-qh3", INBOX_WORKSPACE_ID);
    expect(task?.reminder?.notificationIds?.length).toBe(2);
  });
});

describe("category subscription reconciliation", () => {
  it("disabling a category cancels existing reminders for that category only", async () => {
    const triggerAt = futureAtLocalHour(10).getTime();
    await scheduleTaskWithEscalations("task-work", "work", triggerAt);
    await scheduleTaskWithEscalations("task-personal", "personal", triggerAt);
    expect(osNotifsFor("task-work")).toHaveLength(3);
    expect(osNotifsFor("task-personal")).toHaveLength(3);

    await SettingsRepository.saveSettings({
      ...DEFAULT_SETTINGS,
      categories: { ...DEFAULT_SETTINGS.categories, work: false },
    });
    await NotificationReconcilerService.reconcileScheduledNotificationsForSettings();

    // Work reminders cancelled...
    expect(osNotifsFor("task-work")).toHaveLength(0);
    const workTask = await TaskRepository.getTask("task-work", INBOX_WORKSPACE_ID);
    expect(workTask?.reminder?.notificationIds).toEqual([]);
    // ...personal reminders untouched.
    expect(osNotifsFor("task-personal")).toHaveLength(3);
    const personalTask = await TaskRepository.getTask("task-personal", INBOX_WORKSPACE_ID);
    expect(personalTask?.reminder?.notificationIds?.length).toBe(3);
  });

  it("re-enabling a category reschedules reminders without duplicating them", async () => {
    const triggerAt = futureAtLocalHour(10).getTime();
    await scheduleTaskWithEscalations("task-work2", "work", triggerAt);
    await SettingsRepository.saveSettings({
      ...DEFAULT_SETTINGS,
      categories: { ...DEFAULT_SETTINGS.categories, work: false },
    });
    await NotificationReconcilerService.reconcileScheduledNotificationsForSettings();
    expect(osNotifsFor("task-work2")).toHaveLength(0);

    await SettingsRepository.saveSettings(DEFAULT_SETTINGS);
    await NotificationReconcilerService.reconcileScheduledNotificationsForSettings();
    expect(osNotifsFor("task-work2")).toHaveLength(3);

    // A follow-up reconciliation must not add a fourth.
    await NotificationReconcilerService.reconcileScheduledNotificationsForSettings();
    expect(osNotifsFor("task-work2")).toHaveLength(3);

    const task = await TaskRepository.getTask("task-work2", INBOX_WORKSPACE_ID);
    expect(task?.reminder?.notificationIds?.length).toBe(3);
  });

  it("applies the habit kind key for habits without a categoryId", async () => {
    const triggerDate = futureAtLocalHour(11);
    await scheduleHabitWithEscalations("habit-1", triggerDate);
    expect(habitOsNotifsFor("habit-1")).toHaveLength(3);

    await SettingsRepository.saveSettings({
      ...DEFAULT_SETTINGS,
      categories: { ...DEFAULT_SETTINGS.categories, habit: false },
    });
    await NotificationReconcilerService.reconcileScheduledNotificationsForSettings();

    expect(habitOsNotifsFor("habit-1")).toHaveLength(0);
    const habit = await HabitRepository.getHabit("habit-1", INBOX_WORKSPACE_ID);
    expect(habit?.reminder?.notificationIds).toEqual([]);
  });
});

describe("escalation toggle reconciliation", () => {
  it("disabling escalation cancels existing escalations but keeps the primary", async () => {
    const triggerAt = futureAtLocalHour(10).getTime();
    await scheduleTaskWithEscalations("task-esc", "work", triggerAt);
    expect(osNotifsFor("task-esc")).toHaveLength(3);

    await SettingsRepository.saveSettings({
      ...DEFAULT_SETTINGS,
      escalationEnabled: false,
    });
    await NotificationReconcilerService.reconcileScheduledNotificationsForSettings();

    const notifs = osNotifsFor("task-esc");
    expect(notifs).toHaveLength(1);
    expect(notifs[0].content.data.escalationLevel).toBe(0);

    const task = await TaskRepository.getTask("task-esc", INBOX_WORKSPACE_ID);
    expect(task?.reminder?.notificationIds).toHaveLength(1);
  });

  it("re-enabling escalation reschedules escalations without duplication", async () => {
    const triggerAt = futureAtLocalHour(10).getTime();
    await scheduleTaskWithEscalations("task-esc2", "work", triggerAt);
    await SettingsRepository.saveSettings({
      ...DEFAULT_SETTINGS,
      escalationEnabled: false,
    });
    await NotificationReconcilerService.reconcileScheduledNotificationsForSettings();
    expect(osNotifsFor("task-esc2")).toHaveLength(1);

    await SettingsRepository.saveSettings(DEFAULT_SETTINGS);
    await NotificationReconcilerService.reconcileScheduledNotificationsForSettings();
    const notifs = osNotifsFor("task-esc2");
    expect(notifs).toHaveLength(3);
    expect(notifs.map((n) => n.content.data.escalationLevel).sort()).toEqual([0, 1, 2]);
  });
});

async function flushAsync(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("settings_changed wiring & concurrency", () => {
  it("settings_changed reaches the notification reconciliation layer via the registered hook", async () => {
    const spy = jest
      .spyOn(
        NotificationReconcilerService,
        "reconcileScheduledNotificationsForSettings",
      )
      .mockResolvedValue(undefined);
    const unsubscribe =
      NotificationReconcilerService.registerSettingsChangeReconciliation();
    try {
      emitStateChange("settings_changed");
      await flushAsync();
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
      unsubscribe();
    }
  });

  it("emitting settings_changed reconciles already-scheduled notifications (end-to-end)", async () => {
    const triggerAt = futureAtLocalHour(10).getTime();
    await scheduleTaskWithEscalations("task-event", "work", triggerAt);
    expect(osNotifsFor("task-event")).toHaveLength(3);

    await SettingsRepository.saveSettings({
      ...DEFAULT_SETTINGS,
      escalationEnabled: false,
    });

    const unsubscribe =
      NotificationReconcilerService.registerSettingsChangeReconciliation();
    try {
      emitStateChange("settings_changed");
      await flushAsync();

      const notifs = osNotifsFor("task-event");
      expect(notifs).toHaveLength(1);
      expect(notifs[0].content.data.escalationLevel).toBe(0);
    } finally {
      unsubscribe();
    }
  });

  it("unsubscribing the settings hook stops future reconciliation", async () => {
    const spy = jest
      .spyOn(
        NotificationReconcilerService,
        "reconcileScheduledNotificationsForSettings",
      )
      .mockResolvedValue(undefined);
    const unsubscribe =
      NotificationReconcilerService.registerSettingsChangeReconciliation();
    unsubscribe();
    try {
      emitStateChange("settings_changed");
      await flushAsync();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("concurrent overlapping settings reconciliations do not duplicate notifications", async () => {
    const triggerAt = futureAtLocalHour(10).getTime();
    await scheduleTaskWithEscalations("task-conc", "work", triggerAt);

    await Promise.all([
      NotificationReconcilerService.reconcileScheduledNotificationsForSettings(),
      NotificationReconcilerService.reconcileScheduledNotificationsForSettings(),
    ]);

    expect(osNotifsFor("task-conc")).toHaveLength(3);
    const task = await TaskRepository.getTask("task-conc", INBOX_WORKSPACE_ID);
    expect(task?.reminder?.notificationIds?.length).toBe(3);
  });
});

describe("idempotency", () => {
  it("running reconciliation twice (and after a no-op settings change) produces the same scheduled set", async () => {
    const scheduleBatchSpy = jest.spyOn(remindersService, "scheduleReminderBatch");
    const triggerAt = futureAtLocalHour(10).getTime();
    await scheduleTaskWithEscalations("task-idem", "work", triggerAt);

    scheduleBatchSpy.mockClear();
    await NotificationReconcilerService.reconcileScheduledNotificationsForSettings();
    await NotificationReconcilerService.reconcileScheduledNotificationsForSettings();

    // Second pass had nothing to repair or reschedule.
    expect(scheduleBatchSpy).not.toHaveBeenCalled();
    expect(osNotifsFor("task-idem")).toHaveLength(3);

    // A no-op settings save followed by reconciliation must not add duplicates.
    await SettingsRepository.saveSettings(DEFAULT_SETTINGS);
    await NotificationReconcilerService.reconcileScheduledNotificationsForSettings();
    expect(osNotifsFor("task-idem")).toHaveLength(3);

    const task = await TaskRepository.getTask("task-idem", INBOX_WORKSPACE_ID);
    expect(task?.reminder?.notificationIds?.length).toBe(3);
  });
});