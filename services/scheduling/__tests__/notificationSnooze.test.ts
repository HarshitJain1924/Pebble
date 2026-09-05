import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { TaskRepository } from "@/repositories/TaskRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { ChecklistRepository } from "@/repositories/ChecklistRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { NotificationReconcilerService } from "@/services/notifications/NotificationReconcilerService";
import {
  snoozeReminder,
  scheduleReminderBatch,
} from "@/services/scheduling/reminders.service";
import type { Task, Habit, Checklist } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: {
    DATE: "date",
    TIME_INTERVAL: "timeInterval",
    DAILY: "daily",
    WEEKLY: "weekly",
    MONTHLY: "monthly",
  },
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
}));

describe("Notification Snooze Canonical Architecture Regression Tests", () => {
  const wsId = "ws-snooze-test";
  let scheduledOsNotifs: Array<{
    identifier: string;
    content: {
      title?: string;
      body?: string;
      data?: any;
    };
    trigger?: any;
  }> = [];

  let nextNotifSeq = 1;

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    scheduledOsNotifs = [];
    nextNotifSeq = 1;

    // Default mock implementation of expo-notifications to track simulated OS state
    (Notifications.scheduleNotificationAsync as jest.Mock).mockImplementation(
      async (req: any) => {
        const id = `os-notif-${nextNotifSeq++}`;
        scheduledOsNotifs.push({
          identifier: id,
          content: req.content || {},
          trigger: req.trigger,
        });
        return id;
      },
    );

    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockImplementation(
      async (id: string) => {
        scheduledOsNotifs = scheduledOsNotifs.filter((n) => n.identifier !== id);
      },
    );

    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockImplementation(
      async () => [...scheduledOsNotifs],
    );

    // Setup default workspace
    await WorkspaceRepository.saveWorkspace({
      id: wsId,
      name: "Snooze Test WS",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("1. Snoozing a task reminder schedules exactly one snoozed notification and cancels original", async () => {
    const originalTrigger = Date.now() + 60_000;
    const initialBatch = await scheduleReminderBatch({
      kind: "todo",
      itemId: "task-1",
      title: "Task One",
      oneTimeAt: new Date(originalTrigger),
      escalationMinutes: [],
      workspaceId: wsId,
    });

    const initialTask: Task = {
      id: "task-1",
      workspaceId: wsId,
      title: "Task One",
      status: "todo",
      priority: "medium",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
      reminder: {
        enabled: true,
        triggerAt: originalTrigger,
        notificationIds: initialBatch.ids,
      },
    };
    await TaskRepository.saveTask(initialTask);

    expect(initialBatch.ids.length).toBe(1);
    const originalOsId = initialBatch.ids[0];
    expect(scheduledOsNotifs.some((n) => n.identifier === originalOsId)).toBe(true);

    // Act: Snooze for 5 minutes
    const snoozeMinutes = 5;
    const beforeSnoozeTime = Date.now();
    const result = await snoozeReminder("todo", "task-1", wsId, snoozeMinutes);

    expect(result.success).toBe(true);
    expect(result.triggerAt).toBeGreaterThanOrEqual(beforeSnoozeTime + 5 * 60 * 1000);

    // 2. Verify original notification is no longer active in OS
    expect(scheduledOsNotifs.some((n) => n.identifier === originalOsId)).toBe(false);

    // Verify exactly one primary notification exists for task-1
    const taskNotifs = scheduledOsNotifs.filter(
      (n) => n.content?.data?.itemId === "task-1" && n.content?.data?.purpose === "reminder",
    );
    expect(taskNotifs.length).toBe(1);

    const snoozedNotif = taskNotifs[0];
    expect(snoozedNotif.content?.data?.logicalSignature).toBe("todo:task-1:reminder");
    expect(snoozedNotif.trigger?.date?.getTime()).toBe(result.triggerAt);
  });

  it("2. Domain persistence: snooze state survives reload / re-fetch from repository", async () => {
    const task: Task = {
      id: "task-persist",
      workspaceId: wsId,
      title: "Persistent Task",
      status: "todo",
      priority: "none",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
      reminder: {
        enabled: true,
        triggerAt: Date.now() + 10_000,
        notificationIds: ["old-id"],
      },
    };
    await TaskRepository.saveTask(task);

    const res = await EntityCommandService.snoozeReminder("task", "task-persist", wsId, 10);
    expect(res.success).toBe(true);

    // Simulate reload: fetch fresh from TaskRepository
    const loadedTask = await TaskRepository.getTask("task-persist", wsId);
    expect(loadedTask).not.toBeNull();
    expect(loadedTask?.reminder?.enabled).toBe(true);
    expect(loadedTask?.reminder?.triggerAt).toBe(res.triggerAt);
    expect(loadedTask?.reminder?.notificationIds).toBeDefined();
    expect(loadedTask?.reminder?.notificationIds?.length).toBeGreaterThan(0);
    expect(loadedTask?.reminder?.notificationIds).not.toContain("old-id");
  });

  it("3. Reconciliation does not recreate the original notification during an active snooze", async () => {
    const now = Date.now();
    const task: Task = {
      id: "task-recon",
      workspaceId: wsId,
      title: "Recon Task",
      status: "todo",
      priority: "none",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: now,
      updatedAt: now,
      reminder: {
        enabled: true,
        triggerAt: now + 30_000,
        notificationIds: ["initial-recon-id"],
      },
    };
    await TaskRepository.saveTask(task);

    // Execute canonical snooze
    const snoozeRes = await snoozeReminder("todo", "task-recon", wsId, 5);
    expect(snoozeRes.success).toBe(true);

    // Verify OS has the snoozed notification
    const osNotifsBeforeRecon = await Notifications.getAllScheduledNotificationsAsync();
    expect(osNotifsBeforeRecon.length).toBeGreaterThan(0);

    // Spy on scheduleReminderBatch to verify no extra scheduling is triggered
    const remindersModule = require("@/services/scheduling/reminders.service");
    const rescheduleSpy = jest.spyOn(remindersModule, "rescheduleTodoReminders");

    // Run reconciliation pass
    await NotificationReconcilerService.reconcileAll();

    // Reconciler should NOT reschedule because the active snooze notification perfectly matches
    expect(rescheduleSpy).not.toHaveBeenCalled();

    // Verify still exactly matching OS count (no duplicates created)
    const osNotifsAfterRecon = await Notifications.getAllScheduledNotificationsAsync();
    expect(osNotifsAfterRecon.length).toBe(osNotifsBeforeRecon.length);
  });

  it("4. Repeated reconciliation passes do not create duplicate notifications", async () => {
    const task: Task = {
      id: "task-repeat",
      workspaceId: wsId,
      title: "Repeat Recon Task",
      status: "todo",
      priority: "none",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
      reminder: {
        enabled: true,
        triggerAt: Date.now() + 50_000,
        notificationIds: [],
      },
    };
    await TaskRepository.saveTask(task);

    await EntityCommandService.snoozeReminder("todo", "task-repeat", wsId, 5);

    const countAfterSnooze = scheduledOsNotifs.length;

    // Run 3 consecutive reconciliation passes
    await NotificationReconcilerService.reconcileAll();
    await NotificationReconcilerService.reconcileAll();
    await NotificationReconcilerService.reconcileAll();

    // Notification count must remain strictly stable
    expect(scheduledOsNotifs.length).toBe(countAfterSnooze);
  });

  it("5. Escalation notifications are properly anchored to the snoozed trigger time and old escalations canceled", async () => {
    const originalTime = Date.now() + 10_000;

    // Schedule task with default escalations [120m, 240m]
    const initialBatch = await scheduleReminderBatch({
      kind: "todo",
      itemId: "task-esc",
      title: "Escalation Task",
      oneTimeAt: new Date(originalTime),
      escalationMinutes: [120, 240],
      workspaceId: wsId,
    });

    // We should have 1 primary + 2 escalations = 3 notifications
    expect(initialBatch.ids.length).toBe(3);
    const oldEscalationId = initialBatch.ids[1];

    const task: Task = {
      id: "task-esc",
      workspaceId: wsId,
      title: "Escalation Task",
      status: "todo",
      priority: "high",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
      reminder: {
        enabled: true,
        triggerAt: originalTime,
        notificationIds: initialBatch.ids,
      },
    };
    await TaskRepository.saveTask(task);

    // Act: Snooze for 5 minutes
    const snoozeRes = await snoozeReminder("todo", "task-esc", wsId, 5);
    expect(snoozeRes.success).toBe(true);

    // Old escalation must be cancelled
    expect(scheduledOsNotifs.some((n) => n.identifier === oldEscalationId)).toBe(false);

    // New notifications for task-esc
    const currentTaskNotifs = scheduledOsNotifs.filter(
      (n) => n.content?.data?.itemId === "task-esc",
    );
    expect(currentTaskNotifs.length).toBe(3);

    // Verify escalations are anchored to snoozeRes.triggerAt
    const esc1 = currentTaskNotifs.find((n) => n.content?.data?.escalationLevel === 1);
    const esc2 = currentTaskNotifs.find((n) => n.content?.data?.escalationLevel === 2);

    expect(esc1).toBeDefined();
    expect(esc2).toBeDefined();
    expect(esc1?.trigger?.date?.getTime()).toBe(snoozeRes.triggerAt! + 120 * 60 * 1000);
    expect(esc2?.trigger?.date?.getTime()).toBe(snoozeRes.triggerAt! + 240 * 60 * 1000);
  });

  it("6. Multi-entity support: snooze works for Habit", async () => {
    const habit: Habit = {
      id: "habit-snooze",
      workspaceId: wsId,
      title: "Morning Meditation",
      recurrence: { frequency: "daily", interval: 1 },
      completionHistory: [],
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
      reminder: {
        enabled: true,
        triggerAt: Date.now() + 10_000,
        notificationIds: ["old-habit-notif"],
      },
    };
    await HabitRepository.saveHabit(habit);

    const res = await EntityCommandService.snoozeReminder("habit", "habit-snooze", wsId, 15);
    expect(res.success).toBe(true);

    const loaded = await HabitRepository.getHabit("habit-snooze", wsId);
    expect(loaded?.reminder?.enabled).toBe(true);
    expect(loaded?.reminder?.triggerAt).toBe(res.triggerAt);
    expect(loaded?.reminder?.notificationIds).not.toContain("old-habit-notif");
  });

  it("7. Multi-entity support: snooze works for Checklist", async () => {
    const checklist: Checklist = {
      id: "cl-snooze",
      workspaceId: wsId,
      title: "Grocery Run",
      items: [{ id: "i1", title: "Apples", completed: false }],
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
      reminder: {
        enabled: true,
        triggerAt: Date.now() + 10_000,
        notificationIds: ["old-cl-notif"],
      },
    };
    await ChecklistRepository.saveChecklist(checklist);

    const res = await EntityCommandService.snoozeReminder("checklist", "cl-snooze", wsId, 10);
    expect(res.success).toBe(true);

    const loaded = await ChecklistRepository.getChecklist("cl-snooze", wsId);
    expect(loaded?.reminder?.enabled).toBe(true);
    expect(loaded?.reminder?.triggerAt).toBe(res.triggerAt);
    expect(loaded?.reminder?.notificationIds).not.toContain("old-cl-notif");
  });

  it("8. Automatic workspace resolution when workspaceId is not provided", async () => {
    const task: Task = {
      id: "task-no-ws",
      workspaceId: wsId,
      title: "Resolvable Task",
      status: "todo",
      priority: "none",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
      reminder: {
        enabled: true,
        triggerAt: Date.now() + 10_000,
        notificationIds: [],
      },
    };
    await TaskRepository.saveTask(task);

    // Call snooze without passing workspaceId (e.g., from an incoming OS notification payload)
    const res = await EntityCommandService.snoozeReminder("todo", "task-no-ws");
    expect(res.success).toBe(true);

    const loaded = await TaskRepository.getTask("task-no-ws", wsId);
    expect(loaded?.reminder?.triggerAt).toBe(res.triggerAt);
  });

  it("9. Existing non-snoozed reminder behavior remains unchanged", async () => {
    const task: Task = {
      id: "task-normal",
      workspaceId: wsId,
      title: "Normal Task",
      status: "todo",
      priority: "low",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
      reminder: {
        enabled: true,
        triggerAt: Date.now() + 60_000,
        notificationIds: ["keep-me"],
      },
    };
    await TaskRepository.saveTask(task);

    // Normal non-reminder edit (e.g. updating description) does NOT change triggerAt
    const updated = await EntityCommandService.updateTask(
      "task-normal",
      wsId,
      { description: "Added description" },
      { skipAnalytics: true, skipEvents: true },
    );

    expect(updated.description).toBe("Added description");
    expect(updated.reminder?.triggerAt).toBe(task.reminder?.triggerAt);
  });
});
