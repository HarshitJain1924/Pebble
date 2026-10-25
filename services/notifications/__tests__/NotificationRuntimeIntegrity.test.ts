import { NotificationReconcilerService } from "../NotificationReconcilerService";
import { TaskRepository } from "@/repositories/TaskRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { ChecklistRepository } from "@/repositories/ChecklistRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { RecycleBinRepository } from "@/repositories/RecycleBinRepository";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { BackupService } from "@/services/storage/backup.service";
import * as Notifications from "expo-notifications";
import {
  rescheduleTodoReminders,
  rescheduleHabitReminders,
  rescheduleChecklistReminders,
  cancelReminderIds,
  clearWebReminderLoops,
} from "@/services/scheduling/reminders.service";
import {
  buildNotificationLogicalSignature,
  buildNotificationScheduleKey,
  isMatchingPhysicalNotification,
} from "../notification-identity";
import { Task, Habit, Checklist, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import * as SettingsService from "@/features/settings/services/settings.service";

jest.mock("@/repositories/WorkspaceRepository");
jest.mock("@/repositories/TaskRepository");
jest.mock("@/repositories/HabitRepository");
jest.mock("@/repositories/ChecklistRepository");
jest.mock("@/repositories/RecycleBinRepository");
jest.mock("@/services/scheduling/reminders.service");
jest.mock("expo-notifications");
jest.mock("@/features/settings/services/settings.service");
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
  multiRemove: jest.fn(),
  getAllKeys: jest.fn(),
  removeItem: jest.fn(),
}));

describe("Phase 7 — Notification Runtime Integrity", () => {
  const triggerAt = 1788107200000;
  let mockSettings: any;

  beforeEach(() => {
    jest.clearAllMocks();
    NotificationReconcilerService.resetInFlightForTesting();

    mockSettings = {
      escalationEnabled: true,
      quietHours: { enabled: false, start: "22:00", end: "08:00" },
      categories: { work: true, personal: true, health: true },
    };

    const AsyncStorage = require("@react-native-async-storage/async-storage");
    (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([]);
    (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([]);
    (AsyncStorage.multiSet as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.multiRemove as jest.Mock).mockResolvedValue(undefined);

    (SettingsService.getSettings as jest.Mock).mockImplementation(async () => mockSettings);
    (SettingsService.isCurrentlyInQuietHours as jest.Mock).mockImplementation(
      (settings: any, hour: number, _minute: number) => {
        if (!settings?.quietHours?.enabled) return false;
        return hour >= 22 || hour < 8;
      }
    );

    (WorkspaceRepository.getWorkspaces as jest.Mock).mockResolvedValue([
      { id: "ws-1", name: "Inbox", isDefault: true, revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({});
    (HabitRepository.getHabits as jest.Mock).mockResolvedValue({});
    (ChecklistRepository.getChecklists as jest.Mock).mockResolvedValue({});
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
    (cancelReminderIds as jest.Mock).mockResolvedValue(undefined);

    (rescheduleTodoReminders as jest.Mock).mockImplementation(async (task: Task, options?: any) => {
      const retained = options?.retainedNotificationIds || [];
      const newIds = options?.targetScheduleKeys
        ? options.targetScheduleKeys.map((k: string) => `os-task-${k}`)
        : [`os-task-${task.id}`];
      return {
        ...task,
        reminder: {
          ...task.reminder!,
          notificationIds: [...retained, ...newIds],
        },
      };
    });

    (rescheduleHabitReminders as jest.Mock).mockImplementation(async (habit: Habit, options?: any) => {
      const retained = options?.retainedNotificationIds || [];
      const newIds = options?.targetScheduleKeys
        ? options.targetScheduleKeys.map((k: string) => `os-habit-${k}`)
        : [`os-habit-${habit.id}`];
      return {
        ...habit,
        reminder: {
          ...habit.reminder!,
          notificationIds: [...retained, ...newIds],
        },
      };
    });

    (rescheduleChecklistReminders as jest.Mock).mockImplementation(async (checklist: Checklist, options?: any) => {
      const retained = options?.retainedNotificationIds || [];
      const newIds = options?.targetScheduleKeys
        ? options.targetScheduleKeys.map((k: string) => `os-chk-${k}`)
        : [`os-chk-${checklist.id}`];
      return {
        ...checklist,
        reminder: {
          ...checklist.reminder!,
          notificationIds: [...retained, ...newIds],
        },
      };
    });

    (TaskRepository.updateNotificationIds as jest.Mock).mockResolvedValue("updated");
    (HabitRepository.updateNotificationIds as jest.Mock).mockResolvedValue("updated");
    (ChecklistRepository.updateNotificationIds as jest.Mock).mockResolvedValue("updated");
  });

  const createMockTask = (overrides?: Partial<Task>): Task => ({
    id: "task-1",
    workspaceId: "ws-1",
    title: "Task 1",
    status: "todo",
    priority: "none",
    categoryId: "work",
    reminder: {
      enabled: true,
      triggerAt,
      notificationIds: ["os-prim", "os-esc120", "os-esc240"],
    },
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  });

  const createPhysicalNotif = (
    id: string,
    itemId: string,
    time: number,
    escalationLevel: number,
    type: "todo" | "habit" | "checklist" = "todo",
    lifecycleGeneration = 1
  ) => {
    const offset = escalationLevel === 0 ? 0 : escalationLevel === 1 ? 120 : 240;
    return {
      identifier: id,
      content: {
        data: {
          type,
          itemId,
          escalationLevel,
          lifecycleGeneration,
          purpose: escalationLevel === 0 ? "reminder" : "escalation",
          logicalSignature: buildNotificationLogicalSignature(type, itemId, escalationLevel === 0 ? "reminder" : "escalation"),
          notificationScheduleKey: `once:${time}:+${offset}`,
        },
      },
      trigger: {
        type: "date",
        value: time + offset * 60000,
      },
    };
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 1. SCHEDULE IDEMPOTENCY & CONVERGENCE
  // ───────────────────────────────────────────────────────────────────────────
  describe("1. Schedule Idempotency & Convergence", () => {
    it("repeated reconciliation of a valid schedule causes 0 cancel calls, 0 schedule calls, and 0 domain writes", async () => {
      const task = createMockTask();
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ [task.id]: task });
      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
        createPhysicalNotif("os-prim", task.id, triggerAt, 0),
        createPhysicalNotif("os-esc120", task.id, triggerAt, 1),
        createPhysicalNotif("os-esc240", task.id, triggerAt, 2),
      ]);

      // Run 3 consecutive reconciliation passes
      await NotificationReconcilerService.reconcileAll();
      await NotificationReconcilerService.reconcileAll();
      await NotificationReconcilerService.reconcileAll();

      expect(cancelReminderIds).not.toHaveBeenCalled();
      expect(rescheduleTodoReminders).not.toHaveBeenCalled();
      expect(TaskRepository.updateNotificationIds).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. CONCURRENT RECONCILIATION
  // ───────────────────────────────────────────────────────────────────────────
  describe("2. Concurrent Reconciliation", () => {
    it("coalesces concurrent reconcileAll promises and converges without duplicate scheduling", async () => {
      const task = createMockTask({
        reminder: { enabled: true, triggerAt, notificationIds: [] },
      });
      let currentTask = task;
      (TaskRepository.getTasks as jest.Mock).mockImplementation(async () => ({ [currentTask.id]: currentTask }));
      (TaskRepository.updateNotificationIds as jest.Mock).mockImplementation(async (_id, _ws, ids) => {
        currentTask = {
          ...currentTask,
          reminder: { ...currentTask.reminder!, notificationIds: ids },
        };
        return "updated";
      });
      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockImplementation(async () => {
        return (currentTask.reminder?.notificationIds || []).map((id, idx) =>
          createPhysicalNotif(id, currentTask.id, triggerAt, idx)
        );
      });

      const p1 = NotificationReconcilerService.reconcileAll();
      const p2 = NotificationReconcilerService.reconcileAll();
      const p3 = NotificationReconcilerService.reconcileAll();

      await Promise.all([p1, p2, p3]);

      // Coalesced into a single scheduling run without duplicate scheduling
      expect(rescheduleTodoReminders).toHaveBeenCalledTimes(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. STALE NOTIFICATION ID & ORPHAN OS NOTIFICATIONS
  // ───────────────────────────────────────────────────────────────────────────
  describe("3. Stale Notification IDs & Orphan OS Notifications", () => {
    it("cancels orphan OS notification for a deleted or completed entity", async () => {
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({});
      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
        createPhysicalNotif("orphan-os-1", "task-deleted", triggerAt, 0),
      ]);

      await NotificationReconcilerService.reconcileAll();

      expect(cancelReminderIds).toHaveBeenCalledWith(["orphan-os-1"], { throwOnError: false });
    });

    it("repairs domain when OS lost notifications, without touching updatedAt or revision", async () => {
      const task = createMockTask({
        reminder: { enabled: true, triggerAt, notificationIds: ["os-prim", "os-lost-120", "os-lost-240"] },
      });
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ [task.id]: task });
      // Only os-prim survived in OS
      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
        createPhysicalNotif("os-prim", task.id, triggerAt, 0),
      ]);

      await NotificationReconcilerService.reconcileAll();

      expect(rescheduleTodoReminders).toHaveBeenCalledWith(
        task,
        expect.objectContaining({
          cancelExisting: false,
          retainedNotificationIds: ["os-prim"],
          targetScheduleKeys: [`once:${triggerAt}:+120`, `once:${triggerAt}:+240`],
        })
      );
      expect(TaskRepository.updateNotificationIds).toHaveBeenCalledWith(
        task.id,
        task.workspaceId,
        expect.arrayContaining(["os-prim"]),
        expect.objectContaining({
          updatedAt: task.updatedAt,
          revision: task.revision,
          lifecycleGeneration: task.lifecycleGeneration,
        })
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. ENTITY REVISION & LIFECYCLE MISMATCH SAFETY
  // ───────────────────────────────────────────────────────────────────────────
  describe("4. Lifecycle Generation & Revision Safety", () => {
    it("cancels lingering OS notification belonging to an older lifecycle generation when entity is recreated", async () => {
      // Entity recreated with lifecycleGeneration: 2
      const taskGen2 = createMockTask({
        lifecycleGeneration: 2,
        reminder: { enabled: true, triggerAt, notificationIds: [] },
      });
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ [taskGen2.id]: taskGen2 });

      // OS notification lingering from lifecycleGeneration: 1
      const lingeringNotif = createPhysicalNotif("os-gen1", taskGen2.id, triggerAt, 0, "todo", 1);
      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([lingeringNotif]);

      await NotificationReconcilerService.reconcileAll();

      // Lingering gen 1 notification was cancelled
      expect(cancelReminderIds).toHaveBeenCalledWith(["os-gen1"], { throwOnError: false });
      // New notification was scheduled with lifecycleGeneration: 2
      expect(rescheduleTodoReminders).toHaveBeenCalledWith(
        taskGen2,
        expect.objectContaining({ cancelExisting: true })
      );
    });

    it("verifies isMatchingPhysicalNotification rejects notification if lifecycleGeneration mismatches", () => {
      const task = createMockTask({ lifecycleGeneration: 2 });
      const scheduleKey = buildNotificationScheduleKey({ type: "once", triggerAt, offsetMinutes: 0 });
      const dataGen1 = {
        type: "todo",
        itemId: task.id,
        logicalSignature: buildNotificationLogicalSignature("todo", task.id, "reminder"),
        notificationScheduleKey: scheduleKey,
        purpose: "reminder",
        triggerTimestamp: triggerAt,
        lifecycleGeneration: 1,
      };
      const dataGen2 = {
        type: "todo",
        itemId: task.id,
        logicalSignature: buildNotificationLogicalSignature("todo", task.id, "reminder"),
        notificationScheduleKey: scheduleKey,
        purpose: "reminder",
        triggerTimestamp: triggerAt,
        lifecycleGeneration: 2,
      };

      expect(isMatchingPhysicalNotification(dataGen1, task, "todo")).toBe(false);
      expect(isMatchingPhysicalNotification(dataGen2, task, "todo")).toBe(true);
    });

    it("aborts targeted write with state_changed when expected lifecycleGeneration does not match repository entity", async () => {
      (TaskRepository.updateNotificationIds as jest.Mock).mockResolvedValue("state_changed");

      const task = createMockTask({
        reminder: { enabled: true, triggerAt, notificationIds: [] },
      });
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ [task.id]: task });
      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);

      await NotificationReconcilerService.reconcileAll();

      // On state_changed, newly scheduled notifications are immediately cancelled to prevent zombies
      expect(cancelReminderIds).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. SETTINGS: CATEGORY DISABLE & ENABLE
  // ───────────────────────────────────────────────────────────────────────────
  describe("5. Category Disable & Enable", () => {
    it("cancels OS notifications and clears domain IDs when category is disabled", async () => {
      mockSettings.categories.work = false; // Disable 'work' category
      const task = createMockTask({ categoryId: "work" });
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ [task.id]: task });
      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
        createPhysicalNotif("os-prim", task.id, triggerAt, 0),
        createPhysicalNotif("os-esc120", task.id, triggerAt, 1),
        createPhysicalNotif("os-esc240", task.id, triggerAt, 2),
      ]);

      await NotificationReconcilerService.reconcileAll();

      expect(cancelReminderIds).toHaveBeenCalledWith(
        ["os-prim", "os-esc120", "os-esc240"],
        { throwOnError: false }
      );
      expect(TaskRepository.updateNotificationIds).toHaveBeenCalledWith(
        task.id,
        task.workspaceId,
        [],
        expect.anything()
      );
    });

    it("recreates notifications without duplicates when category is re-enabled", async () => {
      mockSettings.categories.work = true; // Enabled
      const task = createMockTask({
        categoryId: "work",
        reminder: { enabled: true, triggerAt, notificationIds: [] },
      });
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ [task.id]: task });
      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);

      await NotificationReconcilerService.reconcileAll();

      expect(rescheduleTodoReminders).toHaveBeenCalledWith(
        task,
        expect.objectContaining({ cancelExisting: true })
      );
      expect(TaskRepository.updateNotificationIds).toHaveBeenCalledWith(
        task.id,
        task.workspaceId,
        expect.any(Array),
        expect.anything()
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. SETTINGS: QUIET HOURS INTEGRATION
  // ───────────────────────────────────────────────────────────────────────────
  describe("6. Quiet Hours Integration", () => {
    it("cancels slots falling inside quiet hours window and keeps slots outside", async () => {
      mockSettings.quietHours.enabled = true;
      // triggerAt is at 21:00 (outside). +120m offset is at 23:00 (inside quiet hours). +240m is at 01:00 (inside quiet hours).
      const task = createMockTask();
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ [task.id]: task });
      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
        createPhysicalNotif("os-prim", task.id, triggerAt, 0),
        createPhysicalNotif("os-esc120", task.id, triggerAt, 1),
        createPhysicalNotif("os-esc240", task.id, triggerAt, 2),
      ]);

      // Mock isCurrentlyInQuietHours to block +120 and +240
      (SettingsService.isCurrentlyInQuietHours as jest.Mock).mockImplementation((_settings, hour) => {
        return hour >= 22 || hour < 8;
      });

      await NotificationReconcilerService.reconcileAll();

      // Escalation slots were cancelled because they fall into quiet hours
      expect(cancelReminderIds).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. SETTINGS: ESCALATION ENABLE & DISABLE
  // ───────────────────────────────────────────────────────────────────────────
  describe("7. Escalation Enable & Disable", () => {
    it("cancels escalation slots while preserving primary slot when escalation is disabled", async () => {
      mockSettings.escalationEnabled = false;
      const task = createMockTask();
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ [task.id]: task });
      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
        createPhysicalNotif("os-prim", task.id, triggerAt, 0),
        createPhysicalNotif("os-esc120", task.id, triggerAt, 1),
        createPhysicalNotif("os-esc240", task.id, triggerAt, 2),
      ]);

      await NotificationReconcilerService.reconcileAll();

      // Escalation notifications were cancelled
      expect(cancelReminderIds).toHaveBeenCalledWith(
        expect.arrayContaining(["os-esc120", "os-esc240"]),
        { throwOnError: false }
      );
      // Primary was retained and domain IDs updated to ["os-prim"]
      expect(TaskRepository.updateNotificationIds).toHaveBeenCalledWith(
        task.id,
        task.workspaceId,
        ["os-prim"],
        expect.anything()
      );
    });

    it("schedules escalation slots when escalation is enabled without recreating primary", async () => {
      mockSettings.escalationEnabled = true;
      const task = createMockTask({
        reminder: { enabled: true, triggerAt, notificationIds: ["os-prim"] },
      });
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ [task.id]: task });
      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
        createPhysicalNotif("os-prim", task.id, triggerAt, 0),
      ]);

      await NotificationReconcilerService.reconcileAll();

      expect(rescheduleTodoReminders).toHaveBeenCalledWith(
        task,
        expect.objectContaining({
          cancelExisting: false,
          retainedNotificationIds: ["os-prim"],
          targetScheduleKeys: [`once:${triggerAt}:+120`, `once:${triggerAt}:+240`],
        })
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. WORKSPACE DELETION & RESTORATION
  // ───────────────────────────────────────────────────────────────────────────
  describe("8. Workspace Deletion & Restoration", () => {
    it("WorkspaceCommandHandler.deleteWorkspace cancels notifications for tasks, habits, and checklists", async () => {
      const { WorkspaceCommandHandler } = await import("@/services/command/handlers/WorkspaceCommandHandler");
      (WorkspaceRepository.getWorkspaces as jest.Mock).mockResolvedValue([
        { id: "ws-custom", name: "Custom", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
      ]);
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({
        "t1": createMockTask({ id: "t1", reminder: { enabled: true, triggerAt, notificationIds: ["notif-t1"] } }),
      });
      (HabitRepository.getHabits as jest.Mock).mockResolvedValue({
        "h1": { id: "h1", reminder: { enabled: true, triggerAt, notificationIds: ["notif-h1"] } },
      });
      (ChecklistRepository.getChecklists as jest.Mock).mockResolvedValue({
        "c1": { id: "c1", reminder: { enabled: true, triggerAt, notificationIds: ["notif-c1"] } },
      });

      await WorkspaceCommandHandler.deleteWorkspace("ws-custom");

      expect(cancelReminderIds).toHaveBeenCalledWith(
        expect.arrayContaining(["notif-t1", "notif-h1", "notif-c1"]),
        { throwOnError: false }
      );
    });

    it("WorkspaceCommandHandler.restoreWorkspace triggers NotificationReconcilerService.reconcileAll", async () => {
      const reconcileSpy = jest.spyOn(NotificationReconcilerService, "reconcileAll").mockResolvedValue(undefined);
      const { WorkspaceCommandHandler } = await import("@/services/command/handlers/WorkspaceCommandHandler");

      (RecycleBinRepository.getRecycleBinItems as jest.Mock).mockResolvedValue([
        {
          id: "rb-ws-custom",
          entityId: "ws-custom",
          entityType: "workspace",
          lifecycleGeneration: 1,
          snapshot: JSON.stringify({
            list: { id: "ws-custom", name: "Custom", revision: 1, lifecycleGeneration: 1 },
            todos: [],
            habits: [],
            checklists: [],
          }),
        },
      ]);
      (WorkspaceRepository.getWorkspaces as jest.Mock).mockResolvedValue([
        { id: "ws-custom", name: "Custom", revision: 2, lifecycleGeneration: 1 },
      ]);

      await WorkspaceCommandHandler.restoreWorkspace("rb-ws-custom");

      expect(reconcileSpy).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. CLEAR ALL & BACKUP RESTORE
  // ───────────────────────────────────────────────────────────────────────────
  describe("9. Clear All & Backup Restore", () => {
    it("BackupService.clearAllData flushes all OS notifications and web loops", async () => {
      await BackupService.clearAllData();

      expect(clearWebReminderLoops).toHaveBeenCalled();
      expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
    });

    it("BackupService.restoreStructuredBackup flushes OS notifications, web loops, and runs reconcileAll", async () => {
      const reconcileSpy = jest.spyOn(NotificationReconcilerService, "reconcileAll").mockResolvedValue(undefined);

      await BackupService.restoreStructuredBackup(JSON.stringify({
        version: 1,
        timestamp: 1000,
        createdAt: 1000,
        workspaces: [{ id: "ws-1", name: "Inbox", isDefault: true, revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 }],
        tasks: [],
        habits: [],
        checklists: [],
        resources: [],
        recycleBin: [],
        focusSessions: [],
        systemEvents: [],
        relationships: [],
        settings: mockSettings,
        profile: { id: "p1", name: "User", pebbleCount: 100, gemsBalance: 10, totalPebblesEarned: 100, streakFreezeCount: 0, streak: 0, bestStreak: 0, createdAt: 1, updatedAt: 1, revision: 1, lifecycleGeneration: 1 },
      }));

      expect(clearWebReminderLoops).toHaveBeenCalled();
      expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
      expect(reconcileSpy).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 10. FAILURE INJECTION & RESILIENCE
  // ───────────────────────────────────────────────────────────────────────────
  describe("10. Failure Injection & Resilience", () => {
    it("reconciler handles cancellation error gracefully and does not throw", async () => {
      (cancelReminderIds as jest.Mock).mockRejectedValueOnce(new Error("OS cancellation failed"));
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({});
      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
        createPhysicalNotif("orphan-os-1", "task-deleted", triggerAt, 0),
      ]);

      await expect(NotificationReconcilerService.reconcileAll()).resolves.toBeUndefined();
    });

    it("reconciler handles reschedule error gracefully and does not throw", async () => {
      (rescheduleTodoReminders as jest.Mock).mockRejectedValueOnce(new Error("Scheduler unavailable"));
      const task = createMockTask({
        reminder: { enabled: true, triggerAt, notificationIds: [] },
      });
      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ [task.id]: task });
      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);

      await expect(NotificationReconcilerService.reconcileAll()).resolves.toBeUndefined();
    });
  });
});
