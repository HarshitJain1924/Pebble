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

  const createMockOsNotifBatch = (itemId: string, triggerTimestamp: number, prefix: string = "os") => [
    {
      identifier: `${prefix}-0`,
      content: {
        data: {
          type: "todo",
          itemId,
          escalationLevel: 0,
          purpose: "reminder",
          logicalSignature: `todo:${itemId}:reminder`,
          notificationScheduleKey: `once:${triggerTimestamp}:+0`,
        },
      },
    },
    {
      identifier: `${prefix}-1`,
      content: {
        data: {
          type: "todo",
          itemId,
          escalationLevel: 1,
          purpose: "escalation",
          logicalSignature: `todo:${itemId}:escalation`,
          notificationScheduleKey: `once:${triggerTimestamp}:+120`,
        },
      },
    },
    {
      identifier: `${prefix}-2`,
      content: {
        data: {
          type: "todo",
          itemId,
          escalationLevel: 2,
          purpose: "escalation",
          logicalSignature: `todo:${itemId}:escalation`,
          notificationScheduleKey: `once:${triggerTimestamp}:+240`,
        },
      },
    },
  ];

  it("1. Missing notification recreated", async () => {
    const task = createMockTask("t1", 1000, []);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ t1: task });
    
    await NotificationReconcilerService.reconcileAll();
    
    expect(rescheduleTodoReminders).toHaveBeenCalledWith(
      task,
      expect.objectContaining({ cancelExisting: true }),
    );
    expect(TaskRepository.updateNotificationIds).toHaveBeenCalled();
  });

  it("2. Existing matching notification preserved", async () => {
    const task = createMockTask("t1", 1000, ["os-0", "os-1", "os-2"]);
    const osBatch = createMockOsNotifBatch("t1", 1000, "os");
    
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ t1: task });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(osBatch);
    
    await NotificationReconcilerService.reconcileAll();
    
    expect(cancelReminderIds).not.toHaveBeenCalled();
    expect(rescheduleTodoReminders).not.toHaveBeenCalled();
    expect(TaskRepository.saveTask).not.toHaveBeenCalled();
  });

  it("3. Duplicate identical notifications reduced to one", async () => {
    const task = createMockTask("t1", 1000, ["os-0", "os-1", "os-2"]);
    const osBatch = createMockOsNotifBatch("t1", 1000, "os");
    const duplicatePrimary = {
      ...osBatch[0],
      identifier: "os-dup",
    };
    
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ t1: task });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osBatch[0], duplicatePrimary, osBatch[1], osBatch[2]]);
    
    await NotificationReconcilerService.reconcileAll();
    
    expect(cancelReminderIds).toHaveBeenCalledWith(["os-dup"], { throwOnError: false });
    expect(rescheduleTodoReminders).not.toHaveBeenCalled();
  });

  it("4. Stale trigger notification removed", async () => {
    const task = createMockTask("t1", 2000, ["os-1"]); // domain wants 2000
    const osNotifStale = createMockOsNotif("os-1", "t1", 1000); // os has 1000
    
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ t1: task });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([osNotifStale]);
    
    await NotificationReconcilerService.reconcileAll();
    
    expect(cancelReminderIds).toHaveBeenCalledWith(["os-1"], { throwOnError: false });
    expect(rescheduleTodoReminders).toHaveBeenCalledWith(
      task,
      expect.objectContaining({ cancelExisting: true }),
    ); // Reschedules missing 2000
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
    const osBatch = createMockOsNotifBatch("t1", 1000, "os-valid");
    
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ t1: task });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(osBatch);
    
    await NotificationReconcilerService.reconcileAll();
    
    // Should NOT reschedule
    expect(rescheduleTodoReminders).not.toHaveBeenCalled();
    // Should REPAIR domain
    expect(TaskRepository.updateNotificationIds).toHaveBeenCalledWith(
      task.id,
      task.workspaceId,
      osBatch.map(n => n.identifier),
      expect.anything()
    );
  });

  it("9. notificationIds stale but OS notification valid repairs domain", async () => {
    const task = createMockTask("t1", 1000, ["os-stale"]); // Wrong ID
    const osBatch = createMockOsNotifBatch("t1", 1000, "os-actual");
    
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ t1: task });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(osBatch);
    
    await NotificationReconcilerService.reconcileAll();
    
    // Should NOT reschedule
    expect(rescheduleTodoReminders).not.toHaveBeenCalled();
    // Should REPAIR domain
    expect(TaskRepository.updateNotificationIds).toHaveBeenCalledWith(
      task.id,
      task.workspaceId,
      osBatch.map(n => n.identifier),
      expect.anything()
    );
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
    const task = createMockTask("t1", 1000, ["os-legacy", "os-canonical", "os-esc-1", "os-esc-2"]);
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
          notificationScheduleKey: "once:1000:+0",
        },
      },
    };
    const esc1Notif = {
      identifier: "os-esc-1",
      content: {
        data: {
          type: "todo",
          itemId: "t1",
          escalationLevel: 1,
          purpose: "escalation",
          logicalSignature: "todo:t1:escalation",
          notificationScheduleKey: "once:1000:+120",
        },
      },
    };
    const esc2Notif = {
      identifier: "os-esc-2",
      content: {
        data: {
          type: "todo",
          itemId: "t1",
          escalationLevel: 2,
          purpose: "escalation",
          logicalSignature: "todo:t1:escalation",
          notificationScheduleKey: "once:1000:+240",
        },
      },
    };

    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ t1: task });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      legacyNotif,
      canonicalNotif,
      esc1Notif,
      esc2Notif,
    ]);

    await NotificationReconcilerService.reconcileAll();

    // Legacy duplicate should be cancelled
    expect(cancelReminderIds).toHaveBeenCalledWith(["os-legacy"], { throwOnError: false });
    // Domain should be repaired to retain only the winning canonical notification ID + escalations
    expect(TaskRepository.updateNotificationIds).toHaveBeenCalledWith(
      "t1",
      "ws-1",
      ["os-canonical", "os-esc-1", "os-esc-2"],
      expect.anything()
    );
  });

  it("13. Multi-day weekly recurring notifications are preserved as distinct slots and not cancelled as duplicates", async () => {
    const task = createMockTask("t-weekly", 1000);
    task.recurrence = { frequency: "weekly", interval: 1, daysOfWeek: [1, 3] };
    const date = new Date(1000);
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    const days = [
      { weekday: 2, prefix: "os-mon" },
      { weekday: 4, prefix: "os-wed" },
    ];
    const weeklyNotifs = days.flatMap(d =>
      [0, 120, 240].map((offset, idx) => ({
        identifier: `${d.prefix}-${idx}`,
        content: {
          data: {
            type: "todo",
            itemId: "t-weekly",
            escalationLevel: idx,
            purpose: idx === 0 ? "reminder" : "escalation",
            logicalSignature: `todo:t-weekly:${idx === 0 ? "reminder" : "escalation"}`,
            weekday: d.weekday,
            notificationScheduleKey: `weekly:w${d.weekday}:${timeStr}:+${offset}`,
          },
        },
      }))
    );
    task.reminder!.notificationIds = weeklyNotifs.map(n => n.identifier);

    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "t-weekly": task });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(weeklyNotifs);

    await NotificationReconcilerService.reconcileAll();

    // Neither day should be cancelled as a duplicate
    expect(cancelReminderIds).not.toHaveBeenCalled();
    // Neither day needs rescheduling
    expect(rescheduleTodoReminders).not.toHaveBeenCalled();
  });

  it("14. Two entities reconcile concurrently with no cross-entity interference", async () => {
    const taskA = createMockTask("t-A", 1000);
    const osNotifsA = createMockOsNotifBatch("t-A", 1000, "os-A");
    taskA.reminder!.notificationIds = osNotifsA.map(n => n.identifier);

    const taskB = createMockTask("t-B", 2000, []); // Missing in OS

    const habitC = {
      id: "h-C",
      workspaceId: "ws-1",
      title: "Habit C",
      categoryId: "health",
      reminder: { enabled: true, triggerAt: 3000, notificationIds: ["os-C-0", "os-C-1", "os-C-2"] },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1,
      updatedAt: 1,
    };

    const osNotifsC = [0, 120, 240].map((offset, idx) => ({
      identifier: `os-C-${idx}`,
      content: {
        data: {
          type: "habit",
          itemId: "h-C",
          escalationLevel: idx,
          purpose: idx === 0 ? "reminder" : "escalation",
          logicalSignature: `habit:h-C:${idx === 0 ? "reminder" : "escalation"}`,
          notificationScheduleKey: `once:3000:+${offset}`,
        },
      },
    }));

    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "t-A": taskA, "t-B": taskB });
    (HabitRepository.getHabits as jest.Mock).mockResolvedValue({ "h-C": habitC });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([...osNotifsA, ...osNotifsC]);

    await NotificationReconcilerService.reconcileAll();

    // t-A is valid -> no reschedule, no cancel
    // h-C is valid -> no reschedule, no cancel
    // t-B is missing in OS -> rescheduled independently
    expect(cancelReminderIds).not.toHaveBeenCalled();
    expect(rescheduleTodoReminders).toHaveBeenCalledWith(
      taskB,
      expect.objectContaining({ cancelExisting: true }),
    );
    expect(rescheduleHabitReminders).not.toHaveBeenCalled();
    expect(TaskRepository.updateNotificationIds).toHaveBeenCalledWith("t-B", "ws-1", [], expect.anything());
  });

  it("15. Repeated reconciliation passes converge to a stable fixed-point with zero redundant writes", async () => {
    const task = createMockTask("t-converge", 1000);
    const osNotifs = createMockOsNotifBatch("t-converge", 1000, "os-1");
    task.reminder!.notificationIds = osNotifs.map(n => n.identifier);

    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "t-converge": task });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(osNotifs);

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
