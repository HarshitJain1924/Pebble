import { NotificationReconcilerService } from "../NotificationReconcilerService";
import { TaskRepository } from "@/repositories/TaskRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import * as Notifications from "expo-notifications";
import { rescheduleTodoReminders, rescheduleHabitReminders, cancelReminderIds, scheduleReminderBatch } from "@/services/scheduling/reminders.service";
import { Task, Habit } from "@/shared/types/domain.types";
import { buildNotificationLogicalSignature, isMatchingNotificationSignature } from "../notification-identity";

jest.mock("@/repositories/WorkspaceRepository");
jest.mock("@/repositories/TaskRepository");
jest.mock("@/repositories/HabitRepository");
jest.mock("@/services/scheduling/reminders.service", () => {
  const actual = jest.requireActual("@/services/scheduling/reminders.service");
  return {
    ...actual,
    cancelReminderIds: jest.fn().mockResolvedValue(undefined),
    rescheduleTodoReminders: jest.fn(),
    rescheduleHabitReminders: jest.fn(),
  };
});
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

describe("Fix #28: Audit Notification Slot Identity & Deduplication", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (WorkspaceRepository.getWorkspaces as jest.Mock).mockResolvedValue([
      { id: "ws-1", name: "Inbox", isDefault: true, revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ]);
    (HabitRepository.getHabits as jest.Mock).mockResolvedValue({});
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({});
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
    (cancelReminderIds as jest.Mock).mockResolvedValue(undefined);
    (rescheduleTodoReminders as jest.Mock).mockImplementation(async (task: Task) => ({
      ...task,
      reminder: {
        ...task.reminder!,
        notificationIds: [`rescheduled-task-${task.id}`],
      },
    }));
    (rescheduleHabitReminders as jest.Mock).mockImplementation(async (habit: Habit) => ({
      ...habit,
      reminder: {
        ...habit.reminder!,
        notificationIds: [`rescheduled-habit-${habit.id}`],
      },
    }));
    (TaskRepository.updateNotificationIds as jest.Mock).mockResolvedValue("saved");
    (HabitRepository.updateNotificationIds as jest.Mock).mockResolvedValue("saved");
  });

  const createMockTask = (id: string, triggerAt: number, notificationIds: string[] = []): Task => ({
    id,
    workspaceId: "ws-1",
    title: `Task ${id}`,
    status: "todo",
    priority: "none",
    categoryId: "work",
    reminder: {
      enabled: true,
      triggerAt,
      notificationIds,
    },
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
  });

  const createMockHabit = (id: string, triggerAt: number, notificationIds: string[] = []): Habit => ({
    id,
    workspaceId: "ws-1",
    title: `Habit ${id}`,
    categoryId: "health",
    recurrence: { frequency: "daily", interval: 1 },
    completionHistory: [],
    reminder: {
      enabled: true,
      triggerAt,
      notificationIds,
    },
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
  });

  it("1. Deterministic signature generation: entity-owned, type-safe, immutable across title & triggerAt changes", () => {
    const sig1 = buildNotificationLogicalSignature("todo", "task-100", "reminder");
    const sig2 = buildNotificationLogicalSignature("habit", "habit-200", "reminder");
    const sig3 = buildNotificationLogicalSignature("todo", "task-100", "escalation");
    
    expect(sig1).toBe("todo:task-100:reminder");
    expect(sig2).toBe("habit:habit-200:reminder");
    expect(sig3).toBe("todo:task-100:escalation");
    expect(sig1).not.toContain("1000"); // Never includes timestamps
  });

  it("2. Newly-created notifications strictly enforce canonical identity and ignore callers attempting to inject custom signatures", async () => {
    const batch = await scheduleReminderBatch({
      kind: "todo",
      itemId: "task-auth-test",
      title: "Authoritative Test",
      oneTimeAt: new Date(Date.now() + 60000),
      escalationMinutes: [120],
      // @ts-expect-error test rogue caller attempting to inject legacy string
      logicalSignature: "rogue-timestamp-12345",
    });

    expect(batch.ids.length).toBeGreaterThan(0);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();

    const calls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls;
    expect(calls.length).toBe(2);

    const primaryData = calls[0][0].content.data;
    expect(primaryData.type).toBe("todo");
    expect(primaryData.itemId).toBe("task-auth-test");
    expect(primaryData.purpose).toBe("reminder");
    expect(primaryData.logicalSignature).toBe("todo:task-auth-test:reminder");
    expect(primaryData.logicalSignature).not.toBe("rogue-timestamp-12345");

    const escalationData = calls[1][0].content.data;
    expect(escalationData.type).toBe("todo");
    expect(escalationData.itemId).toBe("task-auth-test");
    expect(escalationData.purpose).toBe("escalation");
    expect(escalationData.logicalSignature).toBe("todo:task-auth-test:escalation");
    expect(escalationData.logicalSignature).not.toBe("rogue-timestamp-12345");
  });

  it("3. Escalation/reminder identities do not collide for the same entity", () => {
    const primarySig = buildNotificationLogicalSignature("todo", "task-1", "reminder");
    const escalationSig = buildNotificationLogicalSignature("todo", "task-1", "escalation");

    expect(primarySig).not.toEqual(escalationSig);
    expect(primarySig).toBe("todo:task-1:reminder");
    expect(escalationSig).toBe("todo:task-1:escalation");
  });

  it("4. Two tasks with identical triggerAt values produce distinct signatures and never collide", async () => {
    const identicalTime = 1788100000000;
    const taskA = createMockTask("task-A", identicalTime, ["os-task-A"]);
    const taskB = createMockTask("task-B", identicalTime, ["os-task-B"]);

    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({
      "task-A": taskA,
      "task-B": taskB,
    });

    const osNotifs = [
      {
        identifier: "os-task-A",
        content: {
          data: {
            type: "todo",
            itemId: "task-A",
            escalationLevel: 0,
            purpose: "reminder",
            logicalSignature: buildNotificationLogicalSignature("todo", "task-A", "reminder"),
          },
        },
      },
      {
        identifier: "os-task-B",
        content: {
          data: {
            type: "todo",
            itemId: "task-B",
            escalationLevel: 0,
            purpose: "reminder",
            logicalSignature: buildNotificationLogicalSignature("todo", "task-B", "reminder"),
          },
        },
      },
    ];

    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(osNotifs);

    await NotificationReconcilerService.reconcileAll();

    expect(cancelReminderIds).not.toHaveBeenCalled();
    expect(rescheduleTodoReminders).not.toHaveBeenCalled();
  });

  it("5. Task vs Habit with identical triggerAt and identical ID are distinguished and never collide", async () => {
    const identicalTime = 1788100000000;
    const sharedId = "shared-entity-id";
    const task = createMockTask(sharedId, identicalTime, ["os-task-shared"]);
    const habit = createMockHabit(sharedId, identicalTime, ["os-habit-shared"]);

    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ [sharedId]: task });
    (HabitRepository.getHabits as jest.Mock).mockResolvedValue({ [sharedId]: habit });

    const osNotifs = [
      {
        identifier: "os-task-shared",
        content: {
          data: {
            type: "todo",
            itemId: sharedId,
            escalationLevel: 0,
            purpose: "reminder",
            logicalSignature: buildNotificationLogicalSignature("todo", sharedId, "reminder"),
          },
        },
      },
      {
        identifier: "os-habit-shared",
        content: {
          data: {
            type: "habit",
            itemId: sharedId,
            escalationLevel: 0,
            purpose: "reminder",
            logicalSignature: buildNotificationLogicalSignature("habit", sharedId, "reminder"),
          },
        },
      },
    ];

    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(osNotifs);

    await NotificationReconcilerService.reconcileAll();

    expect(cancelReminderIds).not.toHaveBeenCalled();
    expect(rescheduleTodoReminders).not.toHaveBeenCalled();
    expect(rescheduleHabitReminders).not.toHaveBeenCalled();
  });

  it("6. Reminder rescheduling preserves the same canonical entity owner", async () => {
    const task = createMockTask("task-1", 2000, ["os-old"]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-1": task });

    const osNotifStale = {
      identifier: "os-old",
      content: {
        data: {
          type: "todo",
          itemId: "task-unknown",
          escalationLevel: 0,
          purpose: "reminder",
          logicalSignature: buildNotificationLogicalSignature("todo", "task-unknown", "reminder"),
        },
      },
    };

    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osNotifStale]);

    await NotificationReconcilerService.reconcileAll();

    expect(cancelReminderIds).toHaveBeenCalledWith(["os-old"], { throwOnError: false });
    expect(rescheduleTodoReminders).toHaveBeenCalledWith(task);
    expect(TaskRepository.updateNotificationIds).toHaveBeenCalledWith("task-1", "ws-1", ["rescheduled-task-task-1"]);
  });

  it("7. Repeated reconciliation without duplicates: multi-pass idempotence", async () => {
    const task = createMockTask("task-1", 1000, ["os-1"]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-1": task });

    const osNotifs = [
      {
        identifier: "os-1",
        content: {
          data: {
            type: "todo",
            itemId: "task-1",
            escalationLevel: 0,
            purpose: "reminder",
            logicalSignature: buildNotificationLogicalSignature("todo", "task-1", "reminder"),
          },
        },
      },
    ];

    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(osNotifs);

    // Run 3 consecutive reconciliation passes
    await NotificationReconcilerService.reconcileAll();
    await NotificationReconcilerService.reconcileAll();
    await NotificationReconcilerService.reconcileAll();

    expect(cancelReminderIds).not.toHaveBeenCalled();
    expect(rescheduleTodoReminders).not.toHaveBeenCalled();
    expect(TaskRepository.updateNotificationIds).not.toHaveBeenCalled();
  });

  it("8. Tombstoned / recycled / permanently deleted entity: notifications are removed and never recreated", async () => {
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({});

    const osNotifs = [
      {
        identifier: "os-deleted",
        content: {
          data: {
            type: "todo",
            itemId: "task-deleted",
            escalationLevel: 0,
            purpose: "reminder",
            logicalSignature: buildNotificationLogicalSignature("todo", "task-deleted", "reminder"),
          },
        },
      },
    ];

    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(osNotifs);

    await NotificationReconcilerService.reconcileAll();

    expect(cancelReminderIds).toHaveBeenCalledWith(["os-deleted"], { throwOnError: false });
    expect(rescheduleTodoReminders).not.toHaveBeenCalled();
  });

  it("9. Restored entity: missing notification is recreated and persisted to domain state", async () => {
    const restoredTask = createMockTask("task-restored", 1000, []);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-restored": restoredTask });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);

    await NotificationReconcilerService.reconcileAll();

    expect(rescheduleTodoReminders).toHaveBeenCalledWith(restoredTask);
    expect(TaskRepository.updateNotificationIds).toHaveBeenCalledWith("task-restored", "ws-1", ["rescheduled-task-task-restored"]);
  });

  it("10. Legacy notification compatibility: legacy triggerAt-only notifications are safely matched and preserved", async () => {
    const triggerAt = 1788100000000;
    const task = createMockTask("task-legacy", triggerAt, ["os-legacy-1"]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-legacy": task });

    const legacyNotif = {
      identifier: "os-legacy-1",
      content: {
        data: {
          type: "todo",
          itemId: "task-legacy",
          escalationLevel: 0,
          logicalSignature: triggerAt.toString(),
        },
      },
    };

    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([legacyNotif]);

    await NotificationReconcilerService.reconcileAll();

    expect(cancelReminderIds).not.toHaveBeenCalled();
    expect(rescheduleTodoReminders).not.toHaveBeenCalled();
  });

  it("11. Legacy notification compatibility: outdated legacy notifications (trigger changed) are cancelled and upgraded", async () => {
    const currentTriggerAt = 2000000000000;
    const task = createMockTask("task-upgrade", currentTriggerAt, []);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-upgrade": task });

    const outdatedLegacyNotif = {
      identifier: "os-legacy-outdated",
      content: {
        data: {
          type: "todo",
          itemId: "task-upgrade",
          escalationLevel: 0,
          logicalSignature: "1000000000000",
        },
      },
    };

    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([outdatedLegacyNotif]);

    await NotificationReconcilerService.reconcileAll();

    expect(cancelReminderIds).toHaveBeenCalledWith(["os-legacy-outdated"], { throwOnError: false });
    expect(rescheduleTodoReminders).toHaveBeenCalledWith(task);
  });

  it("12. Missing / null / undefined weekday metadata fails safely without crashing and forms valid slot", async () => {
    const task = createMockTask("t-safe", 1000, ["os-safe-1"]);
    const notifNoWeekday = {
      identifier: "os-safe-1",
      content: {
        data: {
          type: "todo",
          itemId: "t-safe",
          escalationLevel: 0,
          purpose: "reminder",
          logicalSignature: "todo:t-safe:reminder",
          weekday: undefined,
        },
      },
    };

    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "t-safe": task });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([notifNoWeekday]);

    await expect(NotificationReconcilerService.reconcileAll()).resolves.not.toThrow();
    expect(cancelReminderIds).not.toHaveBeenCalled();
  });

  it("13. Domain notificationIds exactly match surviving OS notifications after duplicate pruning", async () => {
    const task = createMockTask("t-domain-sync", 1000, ["stale-1", "stale-2"]);
    const validNotif = {
      identifier: "os-surviving-1",
      content: {
        data: {
          type: "todo",
          itemId: "t-domain-sync",
          escalationLevel: 0,
          purpose: "reminder",
          logicalSignature: "todo:t-domain-sync:reminder",
        },
      },
    };

    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "t-domain-sync": task });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([validNotif]);

    await NotificationReconcilerService.reconcileAll();

    // Domain state should be updated to exact surviving OS notification
    expect(TaskRepository.updateNotificationIds).toHaveBeenCalledWith("t-domain-sync", "ws-1", ["os-surviving-1"]);
  });

  describe("14. Purpose matching enforcement in isMatchingNotificationSignature", () => {
    const task = createMockTask("task-purpose-test", 1788100000000);
    const reminderPayload = {
      type: "todo",
      itemId: "task-purpose-test",
      logicalSignature: "todo:task-purpose-test:reminder",
      purpose: "reminder",
      escalationLevel: 0,
    };
    const escalationPayload = {
      type: "todo",
      itemId: "task-purpose-test",
      logicalSignature: "todo:task-purpose-test:escalation",
      purpose: "escalation",
      escalationLevel: 1,
    };
    const legacyPayload = {
      type: "todo",
      itemId: "task-purpose-test",
      logicalSignature: "1788100000000",
    };

    it("reminder does not match escalation when 'reminder' is requested", () => {
      expect(isMatchingNotificationSignature(escalationPayload, task, "todo", "reminder")).toBe(false);
    });

    it("escalation does not match reminder when 'escalation' is requested", () => {
      expect(isMatchingNotificationSignature(reminderPayload, task, "todo", "escalation")).toBe(false);
    });

    it("correct-purpose notifications match expected purpose", () => {
      expect(isMatchingNotificationSignature(reminderPayload, task, "todo", "reminder")).toBe(true);
      expect(isMatchingNotificationSignature(escalationPayload, task, "todo", "escalation")).toBe(true);
    });

    it("kind and item identity still enforce boundaries when purpose matches", () => {
      // Mismatched kind
      expect(isMatchingNotificationSignature(reminderPayload, task, "habit", "reminder")).toBe(false);
      expect(isMatchingNotificationSignature(escalationPayload, task, "checklist", "escalation")).toBe(false);

      // Mismatched item ID
      const otherTask = createMockTask("task-other", 1788100000000);
      expect(isMatchingNotificationSignature(reminderPayload, otherTask, "todo", "reminder")).toBe(false);
    });

    it("legacy-compatible notifications match 'reminder' but not 'escalation'", () => {
      // Legacy notification represents primary reminder
      expect(isMatchingNotificationSignature(legacyPayload, task, "todo", "reminder")).toBe(true);
      // Legacy notification must NOT match escalation
      expect(isMatchingNotificationSignature(legacyPayload, task, "todo", "escalation")).toBe(false);
    });

    it("callers that omit purpose retain broad lookup behavior (reminder, escalation, and legacy all match)", () => {
      expect(isMatchingNotificationSignature(reminderPayload, task, "todo")).toBe(true);
      expect(isMatchingNotificationSignature(escalationPayload, task, "todo")).toBe(true);
      expect(isMatchingNotificationSignature(legacyPayload, task, "todo")).toBe(true);
    });
  });
});
