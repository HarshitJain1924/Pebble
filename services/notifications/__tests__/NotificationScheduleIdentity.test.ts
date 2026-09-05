import { NotificationReconcilerService } from "../NotificationReconcilerService";
import { TaskRepository } from "@/repositories/TaskRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { ChecklistRepository } from "@/repositories/ChecklistRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import * as Notifications from "expo-notifications";
import {
  rescheduleTodoReminders,
  rescheduleHabitReminders,
  rescheduleChecklistReminders,
  cancelReminderIds,
  scheduleReminderBatch,
  getWebReminderLoops,
  clearWebReminderLoops,
} from "@/services/scheduling/reminders.service";
import { Task, Habit, Checklist } from "@/shared/types/domain.types";
import {
  buildNotificationLogicalSignature,
  buildNotificationScheduleKey,
  isMatchingNotificationOwnership,
  isMatchingNotificationSchedule,
  isMatchingPhysicalNotification,
  getExpectedNotificationScheduleKeys,
} from "../notification-identity";
import { Platform } from "react-native";

jest.mock("@/repositories/WorkspaceRepository");
jest.mock("@/repositories/TaskRepository");
jest.mock("@/repositories/HabitRepository");
jest.mock("@/repositories/ChecklistRepository");
jest.mock("@/services/scheduling/reminders.service", () => {
  const actual = jest.requireActual("@/services/scheduling/reminders.service");
  return {
    ...actual,
    cancelReminderIds: jest.fn().mockImplementation((ids?: string[], options?: { throwOnError?: boolean }) => {
      return actual.cancelReminderIds(ids, options);
    }),
    rescheduleTodoReminders: jest.fn(),
    rescheduleHabitReminders: jest.fn(),
    rescheduleChecklistReminders: jest.fn(),
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

describe("Notification Schedule Identity & Reconciliation Model", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearWebReminderLoops();
    (WorkspaceRepository.getWorkspaces as jest.Mock).mockResolvedValue([
      { id: "ws-1", name: "Inbox", isDefault: true, revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({});
    (HabitRepository.getHabits as jest.Mock).mockResolvedValue({});
    (ChecklistRepository.getChecklists as jest.Mock).mockResolvedValue({});
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);

    (rescheduleTodoReminders as jest.Mock).mockImplementation(async (task: Task) => ({
      ...task,
      reminder: {
        ...task.reminder!,
        notificationIds: [`new-task-notif-${task.id}`],
      },
    }));
    (rescheduleHabitReminders as jest.Mock).mockImplementation(async (habit: Habit) => ({
      ...habit,
      reminder: {
        ...habit.reminder!,
        notificationIds: [`new-habit-notif-${habit.id}`],
      },
    }));
    (rescheduleChecklistReminders as jest.Mock).mockImplementation(async (checklist: Checklist) => ({
      ...checklist,
      reminder: {
        ...checklist.reminder!,
        notificationIds: [`new-checklist-notif-${checklist.id}`],
      },
    }));

    (TaskRepository.updateNotificationIds as jest.Mock).mockResolvedValue("updated");
    (HabitRepository.updateNotificationIds as jest.Mock).mockResolvedValue("updated");
    (ChecklistRepository.updateNotificationIds as jest.Mock).mockResolvedValue("updated");
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
    createdAt: 1000,
    updatedAt: 1000,
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
    createdAt: 1000,
    updatedAt: 1000,
  });

  const createMockChecklist = (id: string, triggerAt: number, notificationIds: string[] = []): Checklist => ({
    id,
    workspaceId: "ws-1",
    title: `Checklist ${id}`,
    items: [],
    reminder: {
      enabled: true,
      triggerAt,
      notificationIds,
    },
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Same entity + same purpose + changed trigger → old notification rejected
  // ───────────────────────────────────────────────────────────────────────────
  it("1. Same entity + same purpose + changed trigger → old notification rejected and cancelled", async () => {
    // Task moved from 08:00 (1788100000000) to 10:00 (1788107200000)
    const task = createMockTask("task-1", 1788107200000, ["os-old-8am"]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-1": task });

    const osNotifStale = {
      identifier: "os-old-8am",
      content: {
        data: {
          type: "todo",
          itemId: "task-1",
          escalationLevel: 0,
          purpose: "reminder",
          logicalSignature: buildNotificationLogicalSignature("todo", "task-1", "reminder"),
          notificationScheduleKey: "once:1788100000000:+0", // Old 8am trigger
        },
      },
    };
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osNotifStale]);

    // Test unit identity helper directly
    expect(isMatchingNotificationOwnership(osNotifStale.content.data, task, "todo", "reminder")).toBe(true);
    expect(isMatchingNotificationSchedule(osNotifStale.content.data, task)).toBe(false);
    expect(isMatchingPhysicalNotification(osNotifStale.content.data, task, "todo", "reminder")).toBe(false);

    // Test full reconciliation
    await NotificationReconcilerService.reconcileAll();

    // Stale notification must be cancelled
    expect(cancelReminderIds).toHaveBeenCalledWith(["os-old-8am"], { throwOnError: false });
    // Current notification must be scheduled for 10:00
    expect(rescheduleTodoReminders).toHaveBeenCalledWith(task);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Same entity + same purpose + unchanged trigger → notification retained
  // ───────────────────────────────────────────────────────────────────────────
  it("2. Same entity + same purpose + unchanged trigger → notification retained", async () => {
    const triggerAt = 1788107200000;
    const task = createMockTask("task-1", triggerAt, ["os-current-10am"]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-1": task });

    const osNotifValid = {
      identifier: "os-current-10am",
      content: {
        data: {
          type: "todo",
          itemId: "task-1",
          escalationLevel: 0,
          purpose: "reminder",
          logicalSignature: buildNotificationLogicalSignature("todo", "task-1", "reminder"),
          notificationScheduleKey: `once:${triggerAt}:+0`,
        },
      },
    };
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osNotifValid]);

    expect(isMatchingPhysicalNotification(osNotifValid.content.data, task, "todo", "reminder")).toBe(true);

    await NotificationReconcilerService.reconcileAll();

    expect(cancelReminderIds).not.toHaveBeenCalled();
    expect(rescheduleTodoReminders).not.toHaveBeenCalled();
    expect(TaskRepository.updateNotificationIds).not.toHaveBeenCalled();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Changed recurring schedule → old notification rejected
  // ───────────────────────────────────────────────────────────────────────────
  it("3. Changed recurring schedule → old notification rejected", async () => {
    // Habit changed daily time from 08:30 to 09:30
    const triggerDate = new Date();
    triggerDate.setHours(9, 30, 0, 0);
    const habit = createMockHabit("habit-1", triggerDate.getTime(), ["os-old-habit"]);
    (HabitRepository.getHabits as jest.Mock).mockResolvedValue({ "habit-1": habit });

    const osNotifStale = {
      identifier: "os-old-habit",
      content: {
        data: {
          type: "habit",
          itemId: "habit-1",
          escalationLevel: 0,
          purpose: "reminder",
          logicalSignature: buildNotificationLogicalSignature("habit", "habit-1", "reminder"),
          notificationScheduleKey: "daily:08:30:+0", // Old schedule
        },
      },
    };
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osNotifStale]);

    expect(isMatchingPhysicalNotification(osNotifStale.content.data, habit, "habit", "reminder")).toBe(false);

    await NotificationReconcilerService.reconcileAll();

    expect(cancelReminderIds).toHaveBeenCalledWith(["os-old-habit"], { throwOnError: false });
    expect(rescheduleHabitReminders).toHaveBeenCalledWith(habit);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Stale primary notification → cancelled and recreated
  // ───────────────────────────────────────────────────────────────────────────
  it("4. Stale primary notification → cancelled and recreated with escalations", async () => {
    const triggerAt = 1788107200000;
    const task = createMockTask("task-1", triggerAt, ["os-primary-old", "os-escalation-old"]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-1": task });

    const osPrimaryStale = {
      identifier: "os-primary-old",
      content: {
        data: {
          type: "todo",
          itemId: "task-1",
          escalationLevel: 0,
          purpose: "reminder",
          logicalSignature: buildNotificationLogicalSignature("todo", "task-1", "reminder"),
          notificationScheduleKey: "once:1788000000000:+0", // Stale
        },
      },
    };
    const osEscalationStale = {
      identifier: "os-escalation-old",
      content: {
        data: {
          type: "todo",
          itemId: "task-1",
          escalationLevel: 1,
          purpose: "escalation",
          logicalSignature: buildNotificationLogicalSignature("todo", "task-1", "escalation"),
          notificationScheduleKey: "once:1788000000000:+120", // Stale
        },
      },
    };

    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      osPrimaryStale,
      osEscalationStale,
    ]);

    await NotificationReconcilerService.reconcileAll();

    expect(cancelReminderIds).toHaveBeenCalledWith(["os-primary-old", "os-escalation-old"], { throwOnError: false });
    expect(rescheduleTodoReminders).toHaveBeenCalledWith(task);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Stale escalation notification → cancelled and recreated
  // ───────────────────────────────────────────────────────────────────────────
  it("5. Stale escalation notification → cancelled and recreated", async () => {
    const triggerAt = 1788107200000;
    const task = createMockTask("task-1", triggerAt, ["os-primary-valid", "os-escalation-stale"]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-1": task });

    const osPrimaryValid = {
      identifier: "os-primary-valid",
      content: {
        data: {
          type: "todo",
          itemId: "task-1",
          escalationLevel: 0,
          purpose: "reminder",
          logicalSignature: buildNotificationLogicalSignature("todo", "task-1", "reminder"),
          notificationScheduleKey: `once:${triggerAt}:+0`,
        },
      },
    };
    const osEscalationStale = {
      identifier: "os-escalation-stale",
      content: {
        data: {
          type: "todo",
          itemId: "task-1",
          escalationLevel: 1,
          purpose: "escalation",
          logicalSignature: buildNotificationLogicalSignature("todo", "task-1", "escalation"),
          notificationScheduleKey: "once:1788000000000:+120", // Wrong timestamp
        },
      },
    };

    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      osPrimaryValid,
      osEscalationStale,
    ]);

    await NotificationReconcilerService.reconcileAll();

    // The stale escalation must be cancelled
    expect(cancelReminderIds).toHaveBeenCalledWith(["os-escalation-stale"], { throwOnError: false });
    // And since escalation is missing, reconciler reschedules missing notifications
    expect(rescheduleTodoReminders).toHaveBeenCalledWith(task);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Domain notification IDs contain only current physical IDs
  // ───────────────────────────────────────────────────────────────────────────
  it("6. Domain notification IDs contain only current physical IDs", async () => {
    const triggerAt = 1788107200000;
    // Task currently holds a stale ID "os-dead" in its domain state alongside the valid one
    const task = createMockTask("task-1", triggerAt, ["os-valid", "os-dead"]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-1": task });

    const osValid = {
      identifier: "os-valid",
      content: {
        data: {
          type: "todo",
          itemId: "task-1",
          escalationLevel: 0,
          purpose: "reminder",
          logicalSignature: buildNotificationLogicalSignature("todo", "task-1", "reminder"),
          notificationScheduleKey: `once:${triggerAt}:+0`,
        },
      },
    };
    // Only osValid exists in OS
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osValid]);

    await NotificationReconcilerService.reconcileAll();

    // Domain IDs must be repaired to strictly ["os-valid"]
    expect(TaskRepository.updateNotificationIds).toHaveBeenCalledWith(
      "task-1",
      "ws-1",
      ["os-valid"],
      expect.anything()
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Reminder cancellation leaves no persisted notification IDs
  // ───────────────────────────────────────────────────────────────────────────
  it("7. Reminder cancellation leaves no persisted notification IDs and cleans OS", async () => {
    // Entity has disabled reminder with empty notificationIds
    const task: Task = {
      ...createMockTask("task-disabled", 1788107200000, []),
      reminder: {
        enabled: false,
        triggerAt: 0,
        notificationIds: [],
      },
    };
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-disabled": task });

    // An orphan OS notification exists
    const osOrphan = {
      identifier: "os-orphan",
      content: {
        data: {
          type: "todo",
          itemId: "task-disabled",
          escalationLevel: 0,
          purpose: "reminder",
          logicalSignature: buildNotificationLogicalSignature("todo", "task-disabled", "reminder"),
          notificationScheduleKey: "once:1788107200000:+0",
        },
      },
    };
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osOrphan]);

    await NotificationReconcilerService.reconcileAll();

    expect(cancelReminderIds).toHaveBeenCalledWith(["os-orphan"], { throwOnError: false });
    expect(rescheduleTodoReminders).not.toHaveBeenCalled();
    expect(TaskRepository.updateNotificationIds).not.toHaveBeenCalled();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. Reminder replacement cannot resurrect previous notification generation
  // ───────────────────────────────────────────────────────────────────────────
  it("8. Reminder replacement (08:00 → 10:00 → 12:00) cannot resurrect earlier generations", async () => {
    const time12pm = 1788114400000;
    const task = createMockTask("task-1", time12pm, ["os-12pm"]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-1": task });

    // OS contains lingering notifications from 08:00 and 10:00 alongside 12:00
    const os8am = {
      identifier: "os-8am",
      content: {
        data: {
          type: "todo",
          itemId: "task-1",
          escalationLevel: 0,
          purpose: "reminder",
          logicalSignature: buildNotificationLogicalSignature("todo", "task-1", "reminder"),
          notificationScheduleKey: "once:1788100000000:+0",
        },
      },
    };
    const os10am = {
      identifier: "os-10am",
      content: {
        data: {
          type: "todo",
          itemId: "task-1",
          escalationLevel: 0,
          purpose: "reminder",
          logicalSignature: buildNotificationLogicalSignature("todo", "task-1", "reminder"),
          notificationScheduleKey: "once:1788107200000:+0",
        },
      },
    };
    const os12pm = {
      identifier: "os-12pm",
      content: {
        data: {
          type: "todo",
          itemId: "task-1",
          escalationLevel: 0,
          purpose: "reminder",
          logicalSignature: buildNotificationLogicalSignature("todo", "task-1", "reminder"),
          notificationScheduleKey: `once:${time12pm}:+0`,
        },
      },
    };

    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      os8am,
      os10am,
      os12pm,
    ]);

    await NotificationReconcilerService.reconcileAll();

    // Earlier generations 08:00 and 10:00 are cancelled
    expect(cancelReminderIds).toHaveBeenCalledWith(["os-8am", "os-10am"], { throwOnError: false });
    // 12pm is retained and no rescheduling is needed
    expect(rescheduleTodoReminders).not.toHaveBeenCalled();
    // Domain IDs remain strictly the 12pm generation
    expect(TaskRepository.updateNotificationIds).not.toHaveBeenCalled();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. Reconciliation during reminder mutation cannot overwrite newer notification IDs
  // ───────────────────────────────────────────────────────────────────────────
  it("9. Reconciliation during reminder mutation aborts and cancels speculative notifications when state_changed", async () => {
    const initialTrigger = 1788107200000;
    const task = createMockTask("task-concurrent", initialTrigger, []);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-concurrent": task });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);

    // Simulating concurrent mutation: TaskRepository.updateNotificationIds returns 'state_changed'
    (TaskRepository.updateNotificationIds as jest.Mock).mockResolvedValue("state_changed");

    await NotificationReconcilerService.reconcileAll();

    // Reconciler attempted to reschedule
    expect(rescheduleTodoReminders).toHaveBeenCalledWith(task);
    // When updateNotificationIds detected concurrent mutation ('state_changed'),
    // it immediately cancelled the speculative notifications it just scheduled!
    expect(cancelReminderIds).toHaveBeenCalledWith(["new-task-notif-task-concurrent"], { throwOnError: false });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 10. Legacy notification payload behavior is explicitly tested
  // ───────────────────────────────────────────────────────────────────────────
  describe("10. Legacy notification compatibility and rejection", () => {
    it("10a. Legacy notification with matching trigger timestamp is retained", async () => {
      const triggerAt = 1788107200000;
      const task = createMockTask("task-legacy-valid", triggerAt, ["os-legacy-valid"]);
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-legacy-valid": task });

      const osLegacy = {
        identifier: "os-legacy-valid",
        content: {
          data: {
            type: "todo",
            itemId: "task-legacy-valid",
            escalationLevel: 0,
            logicalSignature: triggerAt.toString(), // Legacy timestamp-as-signature
          },
        },
      };
      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osLegacy]);

      expect(isMatchingPhysicalNotification(osLegacy.content.data, task, "todo", "reminder")).toBe(true);

      await NotificationReconcilerService.reconcileAll();

      expect(cancelReminderIds).not.toHaveBeenCalled();
      expect(rescheduleTodoReminders).not.toHaveBeenCalled();
    });

    it("10b. Legacy notification with stale trigger timestamp is rejected and upgraded", async () => {
      const currentTrigger = 1788107200000;
      const oldTrigger = 1788100000000;
      const task = createMockTask("task-legacy-stale", currentTrigger, ["os-legacy-stale"]);
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-legacy-stale": task });

      const osLegacyStale = {
        identifier: "os-legacy-stale",
        content: {
          data: {
            type: "todo",
            itemId: "task-legacy-stale",
            escalationLevel: 0,
            logicalSignature: oldTrigger.toString(), // Stale legacy timestamp
          },
        },
      };
      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osLegacyStale]);

      expect(isMatchingPhysicalNotification(osLegacyStale.content.data, task, "todo", "reminder")).toBe(false);

      await NotificationReconcilerService.reconcileAll();

      expect(cancelReminderIds).toHaveBeenCalledWith(["os-legacy-stale"], { throwOnError: false });
      expect(rescheduleTodoReminders).toHaveBeenCalledWith(task);
    });

    it("10c. Legacy notification lacking both scheduleKey and timestamp is cancelled and upgraded", async () => {
      const task = createMockTask("task-legacy-bare", 1788107200000, ["os-legacy-bare"]);
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-legacy-bare": task });

      const osLegacyBare = {
        identifier: "os-legacy-bare",
        content: {
          data: {
            type: "todo",
            itemId: "task-legacy-bare",
            escalationLevel: 0,
            purpose: "reminder",
            logicalSignature: buildNotificationLogicalSignature("todo", "task-legacy-bare", "reminder"),
            // No notificationScheduleKey and no timestamp in logicalSignature
          },
        },
      };
      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osLegacyBare]);

      // Cannot safely prove it matches the current schedule
      expect(isMatchingPhysicalNotification(osLegacyBare.content.data, task, "todo", "reminder")).toBe(false);

      await NotificationReconcilerService.reconcileAll();

      expect(cancelReminderIds).toHaveBeenCalledWith(["os-legacy-bare"], { throwOnError: false });
      expect(rescheduleTodoReminders).toHaveBeenCalledWith(task);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 11. Task, Habit, and Checklist all follow the same invariant
  // ───────────────────────────────────────────────────────────────────────────
  it("11. Task, Habit, and Checklist all enforce physical schedule identity invariant", async () => {
    const triggerAt = 1788107200000;
    const task = createMockTask("t-all", triggerAt, ["os-task-stale"]);
    const habit = createMockHabit("h-all", triggerAt, ["os-habit-stale"]);
    const checklist = createMockChecklist("c-all", triggerAt, ["os-checklist-stale"]);

    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "t-all": task });
    (HabitRepository.getHabits as jest.Mock).mockResolvedValue({ "h-all": habit });
    (ChecklistRepository.getChecklists as jest.Mock).mockResolvedValue({ "c-all": checklist });

    const osNotifs = [
      {
        identifier: "os-task-stale",
        content: {
          data: {
            type: "todo",
            itemId: "t-all",
            escalationLevel: 0,
            purpose: "reminder",
            logicalSignature: buildNotificationLogicalSignature("todo", "t-all", "reminder"),
            notificationScheduleKey: "once:1000000000000:+0", // Wrong schedule
          },
        },
      },
      {
        identifier: "os-habit-stale",
        content: {
          data: {
            type: "habit",
            itemId: "h-all",
            escalationLevel: 0,
            purpose: "reminder",
            logicalSignature: buildNotificationLogicalSignature("habit", "h-all", "reminder"),
            notificationScheduleKey: "daily:01:00:+0", // Wrong schedule
          },
        },
      },
      {
        identifier: "os-checklist-stale",
        content: {
          data: {
            type: "checklist",
            itemId: "c-all",
            escalationLevel: 0,
            purpose: "reminder",
            logicalSignature: buildNotificationLogicalSignature("checklist", "c-all", "reminder"),
            notificationScheduleKey: "once:1000000000000:+0", // Wrong schedule
          },
        },
      },
    ];

    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(osNotifs);

    await NotificationReconcilerService.reconcileAll();

    // All three stale notifications are cancelled
    expect(cancelReminderIds).toHaveBeenCalledWith(
      ["os-task-stale", "os-habit-stale", "os-checklist-stale"],
      { throwOnError: false }
    );
    // All three are rescheduled
    expect(rescheduleTodoReminders).toHaveBeenCalledWith(task);
    expect(rescheduleHabitReminders).toHaveBeenCalledWith(habit);
    expect(rescheduleChecklistReminders).toHaveBeenCalledWith(checklist);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 12. Web scheduling runtime and registry identity
  // ───────────────────────────────────────────────────────────────────────────
  describe("12. Web scheduling runtime and registry identity", () => {
    it("12a. Web recurring reminders record deterministic logicalSignature and scheduleKey in registry", async () => {
      const originalPlatform = Platform.OS;
      Object.defineProperty(Platform, "OS", { value: "web", configurable: true });

      try {
        const result = await scheduleReminderBatch({
          kind: "habit",
          itemId: "habit-web-1",
          workspaceId: "ws-1",
          title: "Web Habit",
          recurrence: { type: "daily" },
          dailyTime: { hour: 8, minute: 30 },
          escalationMinutes: [120],
        });

        expect(result.ids.length).toBeGreaterThan(0);
        const webLoops = getWebReminderLoops();
        expect(webLoops.size).toBeGreaterThan(0);

        // Check the registered loops in memory
        const loopEntries = Array.from(webLoops.values());
        const primaryLoop = loopEntries.find(l => l.logicalSignature?.includes("habit-web-1:reminder"));
        expect(primaryLoop).toBeDefined();
        expect(primaryLoop?.notificationScheduleKey).toBe("daily:08:30:+0");
        expect(primaryLoop?.itemId).toBe("habit-web-1");
        expect(primaryLoop?.kind).toBe("habit");

        // Cancel web reminder cleans up registry
        await cancelReminderIds(result.ids);
        expect(getWebReminderLoops().size).toBe(0);
      } finally {
        Object.defineProperty(Platform, "OS", { value: originalPlatform, configurable: true });
      }
    });

    it("12b. Web cancellation of non-existent or stale loop keys is resilient and does not throw", async () => {
      const originalPlatform = Platform.OS;
      Object.defineProperty(Platform, "OS", { value: "web", configurable: true });

      try {
        // Calling cancel on a loop ID that does not exist in webReminderLoops (e.g. after reload)
        await expect(
          cancelReminderIds(["web-interval-loop-9999", "web-timeout-8888"], { throwOnError: true })
        ).resolves.not.toThrow();
      } finally {
        Object.defineProperty(Platform, "OS", { value: originalPlatform, configurable: true });
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 13. Comprehensive Interval Recurrence Identity Invariants
  // ───────────────────────────────────────────────────────────────────────────
  describe("13. Comprehensive Interval Recurrence Identity Invariants", () => {
    const anchor9am = 1788100000000;
    const anchor11am = 1788107200000;
    const anchor1pm = 1788114400000;

    const createIntervalTask = (id: string, triggerAt: number, interval: number, notifIds: string[] = []): Task => ({
      ...createMockTask(id, triggerAt, notifIds),
      recurrence: {
        frequency: "custom",
        interval,
        unit: "hours",
      },
    });

    // 1. 2 hours @ 09:00 → 2 hours @ 11:00 (old notification rejected)
    it("13a. 2 hours @ 09:00 -> 2 hours @ 11:00: old notification rejected and cancelled", async () => {
      const task = createIntervalTask("task-int-1", anchor11am, 2, ["os-int-9am"]);
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-int-1": task });

      const oldKey = buildNotificationScheduleKey({
        type: "interval",
        interval: 2,
        unit: "hours",
        anchor: anchor9am,
        offsetMinutes: 0,
      });

      const currentKey = buildNotificationScheduleKey({
        type: "interval",
        interval: 2,
        unit: "hours",
        anchor: anchor11am,
        offsetMinutes: 0,
      });

      // Keys must be completely distinct
      expect(oldKey).not.toBe(currentKey);
      expect(oldKey).toContain("2:hours");
      expect(oldKey).toContain(new Date(anchor9am).toISOString());
      expect(currentKey).toContain(new Date(anchor11am).toISOString());

      const osNotifStale = {
        identifier: "os-int-9am",
        content: {
          data: {
            type: "todo",
            itemId: "task-int-1",
            escalationLevel: 0,
            purpose: "reminder",
            logicalSignature: buildNotificationLogicalSignature("todo", "task-int-1", "reminder"),
            notificationScheduleKey: oldKey,
          },
        },
      };

      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osNotifStale]);

      expect(isMatchingPhysicalNotification(osNotifStale.content.data, task, "todo", "reminder")).toBe(false);

      await NotificationReconcilerService.reconcileAll();

      expect(cancelReminderIds).toHaveBeenCalledWith(["os-int-9am"], { throwOnError: false });
      expect(rescheduleTodoReminders).toHaveBeenCalledWith(task);
    });

    // 2. 2 hours @ 09:00 → 2 hours @ 09:00 (notification retained)
    it("13b. 2 hours @ 09:00 -> 2 hours @ 09:00: notification retained without rescheduling", async () => {
      const task = createIntervalTask("task-int-1", anchor9am, 2, ["os-int-9am"]);
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-int-1": task });

      const currentKey = buildNotificationScheduleKey({
        type: "interval",
        interval: 2,
        unit: "hours",
        anchor: anchor9am,
        offsetMinutes: 0,
      });

      const osNotifValid = {
        identifier: "os-int-9am",
        content: {
          data: {
            type: "todo",
            itemId: "task-int-1",
            escalationLevel: 0,
            purpose: "reminder",
            logicalSignature: buildNotificationLogicalSignature("todo", "task-int-1", "reminder"),
            notificationScheduleKey: currentKey,
          },
        },
      };

      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osNotifValid]);

      expect(isMatchingPhysicalNotification(osNotifValid.content.data, task, "todo", "reminder")).toBe(true);

      await NotificationReconcilerService.reconcileAll();

      expect(cancelReminderIds).not.toHaveBeenCalled();
      expect(rescheduleTodoReminders).not.toHaveBeenCalled();
    });

    // 3. Interval unchanged but escalation offset changes (old escalation rejected)
    it("13c. Interval unchanged but escalation offset changes: old escalation rejected and cancelled", async () => {
      const task = createIntervalTask("task-int-1", anchor9am, 2, ["os-int-prim", "os-int-esc-old"]);
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-int-1": task });

      const primaryKey = buildNotificationScheduleKey({
        type: "interval",
        interval: 2,
        unit: "hours",
        anchor: anchor9am,
        offsetMinutes: 0,
      });

      // Suppose old escalation was for +60 minutes, but system expects +120 minutes
      const staleEscKey = buildNotificationScheduleKey({
        type: "interval",
        interval: 2,
        unit: "hours",
        anchor: anchor9am,
        offsetMinutes: 60,
      });

      const osPrimaryValid = {
        identifier: "os-int-prim",
        content: {
          data: {
            type: "todo",
            itemId: "task-int-1",
            escalationLevel: 0,
            purpose: "reminder",
            logicalSignature: buildNotificationLogicalSignature("todo", "task-int-1", "reminder"),
            notificationScheduleKey: primaryKey,
          },
        },
      };

      const osEscStale = {
        identifier: "os-int-esc-old",
        content: {
          data: {
            type: "todo",
            itemId: "task-int-1",
            escalationLevel: 1,
            purpose: "escalation",
            logicalSignature: buildNotificationLogicalSignature("todo", "task-int-1", "escalation"),
            notificationScheduleKey: staleEscKey,
          },
        },
      };

      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osPrimaryValid, osEscStale]);

      expect(isMatchingPhysicalNotification(osPrimaryValid.content.data, task, "todo", "reminder")).toBe(true);
      expect(isMatchingPhysicalNotification(osEscStale.content.data, task, "todo", "escalation")).toBe(false);

      await NotificationReconcilerService.reconcileAll();

      expect(cancelReminderIds).toHaveBeenCalledWith(["os-int-esc-old"], { throwOnError: false });
      expect(rescheduleTodoReminders).toHaveBeenCalledWith(task);
    });

    // 4. Interval configuration changes (e.g. 2h -> 4h): old notification rejected
    it("13d. Interval configuration changes (2h -> 4h): old notification rejected", async () => {
      // Task is now 4 hours
      const task = createIntervalTask("task-int-1", anchor9am, 4, ["os-int-2h"]);
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-int-1": task });

      // OS has old 2h notification
      const key2h = buildNotificationScheduleKey({
        type: "interval",
        interval: 2,
        unit: "hours",
        anchor: anchor9am,
        offsetMinutes: 0,
      });

      const osNotif2h = {
        identifier: "os-int-2h",
        content: {
          data: {
            type: "todo",
            itemId: "task-int-1",
            escalationLevel: 0,
            purpose: "reminder",
            logicalSignature: buildNotificationLogicalSignature("todo", "task-int-1", "reminder"),
            notificationScheduleKey: key2h,
          },
        },
      };

      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osNotif2h]);

      expect(isMatchingPhysicalNotification(osNotif2h.content.data, task, "todo", "reminder")).toBe(false);

      await NotificationReconcilerService.reconcileAll();

      expect(cancelReminderIds).toHaveBeenCalledWith(["os-int-2h"], { throwOnError: false });
      expect(rescheduleTodoReminders).toHaveBeenCalledWith(task);
    });

    // 5. Rapid interval changes: 09:00 -> 11:00 -> 13:00 (no earlier generation survives)
    it("13e. Rapid interval changes (09:00 -> 11:00 -> 13:00): no earlier generation survives", async () => {
      const task = createIntervalTask("task-int-1", anchor1pm, 2, ["os-1pm"]);
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-int-1": task });

      const key9am = buildNotificationScheduleKey({ type: "interval", interval: 2, unit: "hours", anchor: anchor9am, offsetMinutes: 0 });
      const key11am = buildNotificationScheduleKey({ type: "interval", interval: 2, unit: "hours", anchor: anchor11am, offsetMinutes: 0 });
      const key1pm = buildNotificationScheduleKey({ type: "interval", interval: 2, unit: "hours", anchor: anchor1pm, offsetMinutes: 0 });

      const os9am = {
        identifier: "os-9am",
        content: {
          data: {
            type: "todo",
            itemId: "task-int-1",
            escalationLevel: 0,
            purpose: "reminder",
            logicalSignature: buildNotificationLogicalSignature("todo", "task-int-1", "reminder"),
            notificationScheduleKey: key9am,
          },
        },
      };

      const os11am = {
        identifier: "os-11am",
        content: {
          data: {
            type: "todo",
            itemId: "task-int-1",
            escalationLevel: 0,
            purpose: "reminder",
            logicalSignature: buildNotificationLogicalSignature("todo", "task-int-1", "reminder"),
            notificationScheduleKey: key11am,
          },
        },
      };

      const os1pm = {
        identifier: "os-1pm",
        content: {
          data: {
            type: "todo",
            itemId: "task-int-1",
            escalationLevel: 0,
            purpose: "reminder",
            logicalSignature: buildNotificationLogicalSignature("todo", "task-int-1", "reminder"),
            notificationScheduleKey: key1pm,
          },
        },
      };

      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([os9am, os11am, os1pm]);

      await NotificationReconcilerService.reconcileAll();

      // Earlier generations 09:00 and 11:00 are cancelled
      expect(cancelReminderIds).toHaveBeenCalledWith(["os-9am", "os-11am"], { throwOnError: false });
      // 13:00 generation survives and no reschedule is triggered
      expect(rescheduleTodoReminders).not.toHaveBeenCalled();
    });

    // 6. Reconciliation during interval reschedule: stale notification cannot overwrite domain notificationIds
    it("13f. Reconciliation during interval reschedule: state_changed cancels speculative notifications", async () => {
      const task = createIntervalTask("task-int-mut", anchor11am, 2, []);
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-int-mut": task });
      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);

      (TaskRepository.updateNotificationIds as jest.Mock).mockResolvedValue("state_changed");

      await NotificationReconcilerService.reconcileAll();

      expect(rescheduleTodoReminders).toHaveBeenCalledWith(task);
      expect(cancelReminderIds).toHaveBeenCalledWith(["new-task-notif-task-int-mut"], { throwOnError: false });
    });

    // 9. Task, Habit, and Checklist interval reminders all follow the same invariant
    it("13g. Task, Habit, and Checklist interval reminders all follow physical schedule identity invariant", async () => {
      const task = createIntervalTask("t-int", anchor11am, 2, ["os-t-stale"]);
      const habit: Habit = {
        ...createMockHabit("h-int", anchor11am, ["os-h-stale"]),
        recurrence: { frequency: "custom", interval: 3, unit: "hours" },
      };
      const checklist: Checklist = {
        ...createMockChecklist("c-int", anchor11am, ["os-c-stale"]),
        recurrence: { frequency: "custom", interval: 4, unit: "hours" },
      };

      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "t-int": task });
      (HabitRepository.getHabits as jest.Mock).mockResolvedValue({ "h-int": habit });
      (ChecklistRepository.getChecklists as jest.Mock).mockResolvedValue({ "c-int": checklist });

      const staleTaskKey = buildNotificationScheduleKey({ type: "interval", interval: 2, unit: "hours", anchor: anchor9am, offsetMinutes: 0 });
      const staleHabitKey = buildNotificationScheduleKey({ type: "interval", interval: 3, unit: "hours", anchor: anchor9am, offsetMinutes: 0 });
      const staleChecklistKey = buildNotificationScheduleKey({ type: "interval", interval: 4, unit: "hours", anchor: anchor9am, offsetMinutes: 0 });

      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
        { identifier: "os-t-stale", content: { data: { type: "todo", itemId: "t-int", escalationLevel: 0, purpose: "reminder", logicalSignature: buildNotificationLogicalSignature("todo", "t-int", "reminder"), notificationScheduleKey: staleTaskKey } } },
        { identifier: "os-h-stale", content: { data: { type: "habit", itemId: "h-int", escalationLevel: 0, purpose: "reminder", logicalSignature: buildNotificationLogicalSignature("habit", "h-int", "reminder"), notificationScheduleKey: staleHabitKey } } },
        { identifier: "os-c-stale", content: { data: { type: "checklist", itemId: "c-int", escalationLevel: 0, purpose: "reminder", logicalSignature: buildNotificationLogicalSignature("checklist", "c-int", "reminder"), notificationScheduleKey: staleChecklistKey } } },
      ]);

      await NotificationReconcilerService.reconcileAll();

      expect(cancelReminderIds).toHaveBeenCalledWith(["os-t-stale", "os-h-stale", "os-c-stale"], { throwOnError: false });
      expect(rescheduleTodoReminders).toHaveBeenCalledWith(task);
      expect(rescheduleHabitReminders).toHaveBeenCalledWith(habit);
      expect(rescheduleChecklistReminders).toHaveBeenCalledWith(checklist);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 14. Web Runtime Parity: Reload Reconstruction and Cancellation
  // ───────────────────────────────────────────────────────────────────────────
  describe("14. Web Runtime Parity: Reload Reconstruction and Cancellation", () => {
    it("14a. Web reload: persisted active reminder reconstructs runtime scheduling, repeated pass creates no duplicates", async () => {
      const originalPlatform = Platform.OS;
      Object.defineProperty(Platform, "OS", { value: "web", configurable: true });

      try {
        clearWebReminderLoops();

        // 1. Domain state has an active task that had notifications before browser reload
        const task = createMockTask("task-reload", Date.now() + 3600000, ["web-interval-loop-old"]);
        (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-reload": task });

        // On reload, in-memory webReminderLoops is completely empty
        expect(getWebReminderLoops().size).toBe(0);

        // Configure rescheduleTodoReminders implementation to create a web reminder
        (rescheduleTodoReminders as jest.Mock).mockImplementationOnce(async (t: Task) => {
          const result = await scheduleReminderBatch({
            kind: "todo",
            itemId: t.id,
            workspaceId: t.workspaceId,
            title: t.title,
            oneTimeAt: new Date(t.reminder!.triggerAt),
            escalationMinutes: [120],
          });
          return {
            ...t,
            reminder: {
              ...t.reminder!,
              notificationIds: result.ids,
            },
          };
        });

        // First reconciliation pass: startup after reload
        await NotificationReconcilerService.reconcileAll();

        // Reconciler must detect missing timer and reschedule it
        expect(rescheduleTodoReminders).toHaveBeenCalledWith(task);
        // Runtime loop must now exist in memory
        const loopCountAfterFirstPass = getWebReminderLoops().size;
        expect(loopCountAfterFirstPass).toBeGreaterThan(0);

        // Update mock domain state with the newly persisted notification IDs
        const newNotifIds = (TaskRepository.updateNotificationIds as jest.Mock).mock.calls[0][2];
        task.reminder!.notificationIds = newNotifIds;
        (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-reload": task });

        // Second reconciliation pass: immediately following the first
        jest.clearAllMocks();
        await NotificationReconcilerService.reconcileAll();

        // No additional rescheduling must occur!
        expect(rescheduleTodoReminders).not.toHaveBeenCalled();
        expect(cancelReminderIds).not.toHaveBeenCalled();
        // No duplicate loops must be created!
        expect(getWebReminderLoops().size).toBe(loopCountAfterFirstPass);
      } finally {
        Object.defineProperty(Platform, "OS", { value: originalPlatform, configurable: true });
      }
    });

    it("14b. Web cancellation after reconstruction: reconstructed loop is cleanly cancellable", async () => {
      const originalPlatform = Platform.OS;
      Object.defineProperty(Platform, "OS", { value: "web", configurable: true });

      try {
        clearWebReminderLoops();

        // Schedule a web loop
        const result = await scheduleReminderBatch({
          kind: "todo",
          itemId: "task-cancel-test",
          workspaceId: "ws-1",
          title: "Web Cancellable Task",
          oneTimeAt: new Date(Date.now() + 3600000),
          escalationMinutes: [],
        });

        expect(getWebReminderLoops().size).toBeGreaterThan(0);

        // Cancel the loop
        await cancelReminderIds(result.ids);

        // All web timers are cleared and deleted from registry
        expect(getWebReminderLoops().size).toBe(0);
      } finally {
        Object.defineProperty(Platform, "OS", { value: originalPlatform, configurable: true });
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 15. Physical Notification Identity Distinction for Escalation Slots
  // ───────────────────────────────────────────────────────────────────────────
  describe("15. Physical Notification Identity Distinction for Escalation Slots", () => {
    it("15a. Primary (+0), escalation 1 (+120), escalation 2 (+240) produce distinct physical identities across all recurrence types", () => {
      const triggerAt = 1788107200000;

      // 1. One-time
      const keyOnce0 = buildNotificationScheduleKey({ type: "once", triggerAt, offsetMinutes: 0 });
      const keyOnce120 = buildNotificationScheduleKey({ type: "once", triggerAt, offsetMinutes: 120 });
      const keyOnce240 = buildNotificationScheduleKey({ type: "once", triggerAt, offsetMinutes: 240 });

      expect(new Set([keyOnce0, keyOnce120, keyOnce240]).size).toBe(3);

      // 2. Daily
      const keyDaily0 = buildNotificationScheduleKey({ type: "daily", hour: 9, minute: 0, offsetMinutes: 0 });
      const keyDaily120 = buildNotificationScheduleKey({ type: "daily", hour: 9, minute: 0, offsetMinutes: 120 });
      const keyDaily240 = buildNotificationScheduleKey({ type: "daily", hour: 9, minute: 0, offsetMinutes: 240 });

      expect(new Set([keyDaily0, keyDaily120, keyDaily240]).size).toBe(3);

      // 3. Weekly
      const keyWeekly0 = buildNotificationScheduleKey({ type: "weekly", weekday: 2, hour: 9, minute: 0, offsetMinutes: 0 });
      const keyWeekly120 = buildNotificationScheduleKey({ type: "weekly", weekday: 2, hour: 9, minute: 0, offsetMinutes: 120 });
      const keyWeekly240 = buildNotificationScheduleKey({ type: "weekly", weekday: 2, hour: 9, minute: 0, offsetMinutes: 240 });

      expect(new Set([keyWeekly0, keyWeekly120, keyWeekly240]).size).toBe(3);

      // 4. Monthly
      const keyMonthly0 = buildNotificationScheduleKey({ type: "monthly", dayOfMonth: 15, hour: 9, minute: 0, offsetMinutes: 0 });
      const keyMonthly120 = buildNotificationScheduleKey({ type: "monthly", dayOfMonth: 15, hour: 9, minute: 0, offsetMinutes: 120 });
      const keyMonthly240 = buildNotificationScheduleKey({ type: "monthly", dayOfMonth: 15, hour: 9, minute: 0, offsetMinutes: 240 });

      expect(new Set([keyMonthly0, keyMonthly120, keyMonthly240]).size).toBe(3);

      // 5. Interval
      const keyInt0 = buildNotificationScheduleKey({ type: "interval", interval: 2, unit: "hours", anchor: triggerAt, offsetMinutes: 0 });
      const keyInt120 = buildNotificationScheduleKey({ type: "interval", interval: 2, unit: "hours", anchor: triggerAt, offsetMinutes: 120 });
      const keyInt240 = buildNotificationScheduleKey({ type: "interval", interval: 2, unit: "hours", anchor: triggerAt, offsetMinutes: 240 });

      expect(new Set([keyInt0, keyInt120, keyInt240]).size).toBe(3);

      // And verify that getExpectedNotificationScheduleKeys produces distinct keys for all slots
      const task: Task = {
        ...createMockTask("t-slots", triggerAt),
        recurrence: { frequency: "custom", interval: 2, unit: "hours" },
      };
      const expectedKeys = getExpectedNotificationScheduleKeys(task, [120, 240]);
      expect(Array.from(expectedKeys)).toEqual([keyInt0, keyInt120, keyInt240]);
    });
  });
});
