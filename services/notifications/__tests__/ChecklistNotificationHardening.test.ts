import {
  buildNotificationLogicalSignature,
  isMatchingNotificationSignature,
} from "../notification-identity";
import { getNotificationPayload, getRouteForPayload } from "@/services/scheduling/notification-routes";
import { NotificationReconcilerService } from "../NotificationReconcilerService";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { TaskRepository } from "@/repositories/TaskRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { ChecklistRepository } from "@/repositories/ChecklistRepository";
import * as Notifications from "expo-notifications";
import {
  rescheduleChecklistReminders,
  cancelReminderIds,
} from "@/services/scheduling/reminders.service";
import { Checklist } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
  multiRemove: jest.fn(),
  getAllKeys: jest.fn(),
}));
jest.mock("@/repositories/WorkspaceRepository");
jest.mock("@/repositories/TaskRepository");
jest.mock("@/repositories/HabitRepository");
jest.mock("@/repositories/ChecklistRepository");
jest.mock("@/services/scheduling/reminders.service", () => {
  const actual = jest.requireActual("@/services/scheduling/reminders.service");
  return {
    ...actual,
    cancelReminderIds: jest.fn().mockResolvedValue(undefined),
    rescheduleChecklistReminders: jest.fn(),
  };
});
jest.mock("expo-notifications", () => ({
  getAllScheduledNotificationsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn().mockResolvedValue("mock-chk-notif-id"),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: {
    DATE: "date",
    DAILY: "daily",
    WEEKLY: "weekly",
    TIME_INTERVAL: "timeInterval",
  },
}));

describe("Checklist Notification Hardening & First-Class Identity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (WorkspaceRepository.getWorkspaces as jest.Mock).mockResolvedValue([
      { id: "ws-1", name: "Inbox", isDefault: true, revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({});
    (HabitRepository.getHabits as jest.Mock).mockResolvedValue({});
    (ChecklistRepository.getChecklists as jest.Mock).mockResolvedValue({});
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
    (cancelReminderIds as jest.Mock).mockResolvedValue(undefined);
    (ChecklistRepository.updateNotificationIds as jest.Mock).mockResolvedValue("saved");
  });

  describe("1. Logical Signature & Collision Prevention", () => {
    it("generates distinct signatures for task, habit, and checklist with identical entity IDs", () => {
      const sameId = "item-999";
      const taskSig = buildNotificationLogicalSignature("todo", sameId, "reminder");
      const habitSig = buildNotificationLogicalSignature("habit", sameId, "reminder");
      const checklistSig = buildNotificationLogicalSignature("checklist", sameId, "reminder");

      expect(taskSig).toBe("todo:item-999:reminder");
      expect(habitSig).toBe("habit:item-999:reminder");
      expect(checklistSig).toBe("checklist:item-999:reminder");

      expect(checklistSig).not.toBe(taskSig);
      expect(checklistSig).not.toBe(habitSig);
    });

    it("generates distinct escalation signature for checklist", () => {
      const chkId = "chk-123";
      const reminderSig = buildNotificationLogicalSignature("checklist", chkId, "reminder");
      const escalationSig = buildNotificationLogicalSignature("checklist", chkId, "escalation");

      expect(reminderSig).toBe("checklist:chk-123:reminder");
      expect(escalationSig).toBe("checklist:chk-123:escalation");
      expect(reminderSig).not.toBe(escalationSig);
    });

    it("matches active checklist notification signature correctly", () => {
      const checklist: Checklist = {
        id: "chk-10",
        workspaceId: "ws-1",
        title: "Grocery Shopping",
        items: [],
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1,
        updatedAt: 1,
        reminder: {
          enabled: true,
          triggerAt: 1788200000000,
          notificationIds: ["notif-1"],
        },
      };

      const payload = {
        type: "checklist",
        itemId: "chk-10",
        logicalSignature: "checklist:chk-10:reminder",
      };

      expect(isMatchingNotificationSignature(payload, checklist, "checklist")).toBe(true);
      // Fails if kind is mismatched
      expect(isMatchingNotificationSignature(payload, checklist, "todo")).toBe(false);
    });
  });

  describe("2. Notification Tap Route Resolution", () => {
    it("routes checklist notifications to /checklist-details?id=...", () => {
      const payload = getNotificationPayload({
        type: "checklist",
        itemId: "chk-555",
      });

      expect(payload).not.toBeNull();
      expect(payload?.type).toBe("checklist");
      expect(payload?.itemId).toBe("chk-555");

      const route = getRouteForPayload(payload!);
      expect(route).toBe("/checklist-details?id=chk-555");
    });

    it("does not route checklist notifications to task-details", () => {
      const payload = getNotificationPayload({
        type: "checklist",
        itemId: "chk-555",
      });
      const route = getRouteForPayload(payload!);
      expect(route).not.toContain("task-details");
    });
  });

  describe("3. NotificationReconcilerService Checklist Handling", () => {
    it("reconciles active checklist with valid OS notification without cancelling it", () => {
      const activeChecklist: Checklist = {
        id: "chk-active",
        workspaceId: "ws-1",
        title: "Packing List",
        items: [{ id: "i1", title: "Passport", completed: false }],
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1,
        updatedAt: 1,
        reminder: {
          enabled: true,
          triggerAt: 1788200000000,
          notificationIds: ["os-chk-1"],
        },
      };

      (ChecklistRepository.getChecklists as jest.Mock).mockResolvedValue({
        "chk-active": activeChecklist,
      });

      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
        {
          identifier: "os-chk-1",
          content: {
            data: {
              type: "checklist",
              itemId: "chk-active",
              logicalSignature: "checklist:chk-active:reminder",
              escalationLevel: 0,
              notificationScheduleKey: "once:1788200000000:+0",
            },
          },
        },
      ]);

      return NotificationReconcilerService.reconcileAll().then(() => {
        expect(cancelReminderIds).not.toHaveBeenCalled();
        expect(rescheduleChecklistReminders).not.toHaveBeenCalled();
      });
    });

    it("cancels stale OS notification for deleted or disabled checklist", async () => {
      (ChecklistRepository.getChecklists as jest.Mock).mockResolvedValue({});

      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
        {
          identifier: "os-stale-chk",
          content: {
            data: {
              type: "checklist",
              itemId: "chk-deleted",
              logicalSignature: "checklist:chk-deleted:reminder",
            },
          },
        },
      ]);

      await NotificationReconcilerService.reconcileAll();

      expect(cancelReminderIds).toHaveBeenCalledWith(
        ["os-stale-chk"],
        expect.objectContaining({ throwOnError: false }),
      );
    });

    it("reschedules missing OS notification for active checklist with enabled reminder", async () => {
      const activeChecklist: Checklist = {
        id: "chk-needs-schedule",
        workspaceId: "ws-1",
        title: "Weekly Prep",
        items: [{ id: "i1", title: "Meal prep", completed: false }],
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1,
        updatedAt: 1,
        reminder: {
          enabled: true,
          triggerAt: 1788250000000,
          notificationIds: ["missing-id"],
        },
      };

      (ChecklistRepository.getChecklists as jest.Mock).mockResolvedValue({
        "chk-needs-schedule": activeChecklist,
      });
      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);

      (rescheduleChecklistReminders as jest.Mock).mockResolvedValue({
        ...activeChecklist,
        reminder: {
          ...activeChecklist.reminder!,
          notificationIds: ["new-scheduled-id"],
        },
      });

      await NotificationReconcilerService.reconcileAll();

      expect(rescheduleChecklistReminders).toHaveBeenCalledWith(activeChecklist);
      expect(ChecklistRepository.updateNotificationIds).toHaveBeenCalledWith(
        "chk-needs-schedule",
        "ws-1",
        ["new-scheduled-id"],
        expect.anything(),
      );
    });
  });
});
