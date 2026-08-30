import { NotificationReconcilerService } from "../NotificationReconcilerService";
import { TaskRepository } from "@/repositories/TaskRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import * as Notifications from "expo-notifications";
import { rescheduleTodoReminders, rescheduleHabitReminders, cancelReminderIds } from "@/services/scheduling/reminders.service";
import { Task } from "@/shared/types/domain.types";

jest.mock("@/repositories/WorkspaceRepository");
jest.mock("@/repositories/TaskRepository");
jest.mock("@/repositories/HabitRepository");
jest.mock("@/services/scheduling/reminders.service");
jest.mock("expo-notifications");
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
  multiRemove: jest.fn(),
  getAllKeys: jest.fn(),
}));

describe("NotificationReconcilerService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (WorkspaceRepository.getWorkspaces as jest.Mock).mockResolvedValue([
      { id: "ws-1", name: "Inbox", isDefault: true, revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ]);
    (HabitRepository.getHabits as jest.Mock).mockResolvedValue({});
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({});
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
    (cancelReminderIds as jest.Mock).mockResolvedValue(undefined);
    (rescheduleTodoReminders as jest.Mock).mockImplementation(async (task) => ({ ...task }));
    (rescheduleHabitReminders as jest.Mock).mockImplementation(async (habit) => ({ ...habit }));
    (TaskRepository.saveTask as jest.Mock).mockResolvedValue(undefined);
    (TaskRepository.updateNotificationIds as jest.Mock).mockResolvedValue(undefined);
  });

  const createMockTask = (id: string, triggerAt: number, notificationIds: string[] = []): Task => ({
    id,
    workspaceId: "ws-1",
    title: "Test Task",
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

  const createMockOsNotif = (id: string, itemId: string, triggerTimestamp: number, escalationLevel = 0) => ({
    identifier: id,
    content: {
      data: {
        type: "todo",
        itemId,
        escalationLevel,
        logicalSignature: triggerTimestamp.toString(),
      },
    },
  });

  it("1. Missing notification recreated", async () => {
    const task = createMockTask("t1", 1000, []);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ t1: task });
    
    await NotificationReconcilerService.reconcileAll();
    
    expect(rescheduleTodoReminders).toHaveBeenCalledWith(task);
    expect(TaskRepository.updateNotificationIds).toHaveBeenCalled();
  });

  it("2. Existing matching notification preserved", async () => {
    const task = createMockTask("t1", 1000, ["os-1"]);
    const osNotif = createMockOsNotif("os-1", "t1", 1000);
    
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ t1: task });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osNotif]);
    
    await NotificationReconcilerService.reconcileAll();
    
    expect(cancelReminderIds).not.toHaveBeenCalled();
    expect(rescheduleTodoReminders).not.toHaveBeenCalled();
    expect(TaskRepository.saveTask).not.toHaveBeenCalled();
  });

  it("3. Duplicate identical notifications reduced to one", async () => {
    const task = createMockTask("t1", 1000, ["os-1"]);
    const osNotif1 = createMockOsNotif("os-1", "t1", 1000);
    const osNotif2 = createMockOsNotif("os-2", "t1", 1000);
    
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ t1: task });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osNotif1, osNotif2]);
    
    await NotificationReconcilerService.reconcileAll();
    
    expect(cancelReminderIds).toHaveBeenCalledWith(["os-2"], { throwOnError: false });
    expect(rescheduleTodoReminders).not.toHaveBeenCalled();
  });

  it("4. Stale trigger notification removed", async () => {
    const task = createMockTask("t1", 2000, ["os-1"]); // domain wants 2000
    const osNotifStale = createMockOsNotif("os-1", "t1", 1000); // os has 1000
    
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ t1: task });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osNotifStale]);
    
    await NotificationReconcilerService.reconcileAll();
    
    expect(cancelReminderIds).toHaveBeenCalledWith(["os-1"], { throwOnError: false });
    expect(rescheduleTodoReminders).toHaveBeenCalledWith(task); // Reschedules missing 2000
  });

  it("5. Deleted entity notification removed", async () => {
    const osNotif = createMockOsNotif("os-1", "t1", 1000);
    
    // t1 does not exist in activeTasks
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osNotif]);
    
    await NotificationReconcilerService.reconcileAll();
    
    expect(cancelReminderIds).toHaveBeenCalledWith(["os-1"], { throwOnError: false });
  });

  it("6. Archived entity notification removed", async () => {
    const task = createMockTask("t1", 1000, ["os-1"]);
    task.archivedAt = 500; // Archived
    const osNotif = createMockOsNotif("os-1", "t1", 1000);
    
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ t1: task });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osNotif]);
    
    await NotificationReconcilerService.reconcileAll();
    
    expect(cancelReminderIds).toHaveBeenCalledWith(["os-1"], { throwOnError: false });
  });

  it("7. Malformed payload ignored safely", async () => {
    const malformed = { identifier: "bad-1", content: { data: { type: "todo" } } };
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([malformed]);
    
    await NotificationReconcilerService.reconcileAll();
    
    expect(cancelReminderIds).toHaveBeenCalledWith(["bad-1"], { throwOnError: false });
  });

  it("8. notificationIds missing but OS notification valid repairs domain", async () => {
    const task = createMockTask("t1", 1000, []); // Empty array
    const osNotif = createMockOsNotif("os-valid", "t1", 1000);
    
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ t1: task });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osNotif]);
    
    await NotificationReconcilerService.reconcileAll();
    
    // Should NOT reschedule
    expect(rescheduleTodoReminders).not.toHaveBeenCalled();
    // Should REPAIR domain
    expect(TaskRepository.updateNotificationIds).toHaveBeenCalledWith(task.id, task.workspaceId, ["os-valid"]);
  });

  it("9. notificationIds stale but OS notification valid repairs domain", async () => {
    const task = createMockTask("t1", 1000, ["os-stale"]); // Wrong ID
    const osNotif = createMockOsNotif("os-actual", "t1", 1000);
    
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ t1: task });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osNotif]);
    
    await NotificationReconcilerService.reconcileAll();
    
    // Should NOT reschedule
    expect(rescheduleTodoReminders).not.toHaveBeenCalled();
    // Should REPAIR domain
    expect(TaskRepository.updateNotificationIds).toHaveBeenCalledWith(task.id, task.workspaceId, ["os-actual"]);
  });

  it("10. Schedule failure does not crash reconciliation", async () => {
    const task = createMockTask("t1", 1000, []);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ t1: task });
    (rescheduleTodoReminders as jest.Mock).mockRejectedValueOnce(new Error("Expo fail"));
    
    await expect(NotificationReconcilerService.reconcileAll()).resolves.not.toThrow();
  });

  it("11. Cancellation failure does not crash reconciliation", async () => {
    const osNotif = createMockOsNotif("os-1", "t1", 1000);
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osNotif]);
    (cancelReminderIds as jest.Mock).mockRejectedValueOnce(new Error("Cancel fail"));
    
    await expect(NotificationReconcilerService.reconcileAll()).resolves.not.toThrow();
  });

  it("12. Duplicate resolution prefers canonical entity-owned signature over legacy timestamp signature", async () => {
    const task = createMockTask("t1", 1000, ["os-legacy", "os-canonical"]);
    const legacyNotif = {
      identifier: "os-legacy",
      content: {
        data: {
          type: "todo",
          itemId: "t1",
          escalationLevel: 0,
          logicalSignature: "1000",
        },
      },
    };
    const canonicalNotif = {
      identifier: "os-canonical",
      content: {
        data: {
          type: "todo",
          itemId: "t1",
          escalationLevel: 0,
          purpose: "reminder",
          logicalSignature: "todo:t1:reminder",
        },
      },
    };

    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ t1: task });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([legacyNotif, canonicalNotif]);

    await NotificationReconcilerService.reconcileAll();

    // Legacy duplicate should be cancelled
    expect(cancelReminderIds).toHaveBeenCalledWith(["os-legacy"], { throwOnError: false });
    // Domain should be repaired to retain only the winning canonical notification ID
    expect(TaskRepository.updateNotificationIds).toHaveBeenCalledWith("t1", "ws-1", ["os-canonical"]);
  });

  it("13. Multi-day weekly recurring notifications are preserved as distinct slots and not cancelled as duplicates", async () => {
    const task = createMockTask("t-weekly", 1000, ["os-mon", "os-wed"]);
    const monNotif = {
      identifier: "os-mon",
      content: {
        data: {
          type: "todo",
          itemId: "t-weekly",
          escalationLevel: 0,
          purpose: "reminder",
          logicalSignature: "todo:t-weekly:reminder",
          weekday: 2, // Monday
        },
      },
    };
    const wedNotif = {
      identifier: "os-wed",
      content: {
        data: {
          type: "todo",
          itemId: "t-weekly",
          escalationLevel: 0,
          purpose: "reminder",
          logicalSignature: "todo:t-weekly:reminder",
          weekday: 4, // Wednesday
        },
      },
    };

    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "t-weekly": task });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([monNotif, wedNotif]);

    await NotificationReconcilerService.reconcileAll();

    // Neither day should be cancelled as a duplicate
    expect(cancelReminderIds).not.toHaveBeenCalled();
    // Neither day needs rescheduling
    expect(rescheduleTodoReminders).not.toHaveBeenCalled();
  });

  it("14. Two entities reconcile concurrently with no cross-entity interference", async () => {
    const taskA = createMockTask("t-A", 1000, ["os-A"]);
    const taskB = createMockTask("t-B", 2000, []); // Missing in OS
    const habitC = {
      id: "h-C",
      workspaceId: "ws-1",
      title: "Habit C",
      categoryId: "health",
      reminder: { enabled: true, triggerAt: 3000, notificationIds: ["os-C"] },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1,
      updatedAt: 1,
    };

    const osNotifA = createMockOsNotif("os-A", "t-A", 1000);
    const osNotifC = {
      identifier: "os-C",
      content: {
        data: {
          type: "habit",
          itemId: "h-C",
          escalationLevel: 0,
          purpose: "reminder",
          logicalSignature: "habit:h-C:reminder",
        },
      },
    };

    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "t-A": taskA, "t-B": taskB });
    (HabitRepository.getHabits as jest.Mock).mockResolvedValue({ "h-C": habitC });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osNotifA, osNotifC]);

    await NotificationReconcilerService.reconcileAll();

    // t-A is valid -> no reschedule, no cancel
    // h-C is valid -> no reschedule, no cancel
    // t-B is missing in OS -> rescheduled independently
    expect(cancelReminderIds).not.toHaveBeenCalled();
    expect(rescheduleTodoReminders).toHaveBeenCalledWith(taskB);
    expect(rescheduleHabitReminders).not.toHaveBeenCalled();
    expect(TaskRepository.updateNotificationIds).toHaveBeenCalledWith("t-B", "ws-1", []);
  });

  it("15. Repeated reconciliation passes converge to a stable fixed-point with zero redundant writes", async () => {
    const task = createMockTask("t-converge", 1000, ["os-1"]);
    const osNotif = createMockOsNotif("os-1", "t-converge", 1000);

    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "t-converge": task });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osNotif]);

    // Pass 1
    await NotificationReconcilerService.reconcileAll();
    expect(cancelReminderIds).not.toHaveBeenCalled();
    expect(rescheduleTodoReminders).not.toHaveBeenCalled();
    expect(TaskRepository.updateNotificationIds).not.toHaveBeenCalled();

    // Pass 2
    await NotificationReconcilerService.reconcileAll();
    expect(cancelReminderIds).not.toHaveBeenCalled();
    expect(rescheduleTodoReminders).not.toHaveBeenCalled();
    expect(TaskRepository.updateNotificationIds).not.toHaveBeenCalled();

    // Pass 3
    await NotificationReconcilerService.reconcileAll();
    expect(cancelReminderIds).not.toHaveBeenCalled();
    expect(rescheduleTodoReminders).not.toHaveBeenCalled();
    expect(TaskRepository.updateNotificationIds).not.toHaveBeenCalled();
  });
});
