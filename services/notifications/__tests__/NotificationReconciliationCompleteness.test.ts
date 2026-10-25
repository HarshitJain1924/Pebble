import { NotificationReconcilerService } from "../NotificationReconcilerService";
import { TaskRepository } from "@/repositories/TaskRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { ChecklistRepository } from "@/repositories/ChecklistRepository";
import * as Notifications from "expo-notifications";
import {
  rescheduleTodoReminders,
  rescheduleHabitReminders,
  rescheduleChecklistReminders,
  cancelReminderIds,
} from "@/services/scheduling/reminders.service";
import { Task, Habit, Checklist } from "@/shared/types/domain.types";
import {
  buildNotificationLogicalSignature,
  buildNotificationScheduleKey,
} from "../notification-identity";

jest.mock("@/repositories/WorkspaceRepository");
jest.mock("@/repositories/TaskRepository");
jest.mock("@/repositories/HabitRepository");
jest.mock("@/repositories/ChecklistRepository");
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

describe("Notification Reconciliation Completeness & Slot Invariant", () => {
  const triggerAt = 1788107200000;

  beforeEach(() => {
    jest.clearAllMocks();
    (WorkspaceRepository.getWorkspaces as jest.Mock).mockResolvedValue([
      { id: "ws-1", name: "Inbox", isDefault: true, revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ]);
    (HabitRepository.getHabits as jest.Mock).mockResolvedValue({});
    (ChecklistRepository.getChecklists as jest.Mock).mockResolvedValue({});
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({});
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
    (cancelReminderIds as jest.Mock).mockResolvedValue(undefined);

    (rescheduleTodoReminders as jest.Mock).mockImplementation(async (task: Task, options?: any) => {
      const retained = options?.retainedNotificationIds || [];
      const newIds = options?.targetScheduleKeys
        ? options.targetScheduleKeys.map((k: string) => `new-slot-${k}`)
        : [`new-todo-${task.id}`];
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
        ? options.targetScheduleKeys.map((k: string) => `new-slot-${k}`)
        : [`new-habit-${habit.id}`];
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
        ? options.targetScheduleKeys.map((k: string) => `new-slot-${k}`)
        : [`new-checklist-${checklist.id}`];
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

  const createMockTask = (id: string, time: number = triggerAt, notificationIds: string[] = []): Task => ({
    id,
    workspaceId: "ws-1",
    title: `Task ${id}`,
    status: "todo",
    priority: "none",
    categoryId: "work",
    reminder: {
      enabled: true,
      triggerAt: time,
      notificationIds,
    },
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  });

  const createPhysicalNotif = (
    id: string,
    itemId: string,
    time: number,
    escalationLevel: number,
    type: "todo" | "habit" | "checklist" = "todo"
  ) => {
    const offset = escalationLevel === 0 ? 0 : escalationLevel === 1 ? 120 : 240;
    return {
      identifier: id,
      content: {
        data: {
          type,
          itemId,
          escalationLevel,
          purpose: escalationLevel === 0 ? "reminder" : "escalation",
          logicalSignature: buildNotificationLogicalSignature(type, itemId, escalationLevel === 0 ? "reminder" : "escalation"),
          notificationScheduleKey: `once:${time}:+${offset}`,
        },
      },
    };
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Primary present, one escalation missing
  // ───────────────────────────────────────────────────────────────────────────
  it("1. primary present, one escalation missing (+240 missing) → schedules only +240 without recreating existing", async () => {
    const task = createMockTask("task-1", triggerAt, ["os-prim", "os-esc120"]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-1": task });

    const primaryNotif = createPhysicalNotif("os-prim", "task-1", triggerAt, 0);
    const esc120Notif = createPhysicalNotif("os-esc120", "task-1", triggerAt, 1);

    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([primaryNotif, esc120Notif]);

    await NotificationReconcilerService.reconcileAll();

    // Already valid notifications must not be cancelled
    expect(cancelReminderIds).not.toHaveBeenCalled();

    // Targeted reschedule must only target the missing +240 slot
    expect(rescheduleTodoReminders).toHaveBeenCalledWith(task, {
      targetScheduleKeys: [`once:${triggerAt}:+240`],
      cancelExisting: false,
      retainedNotificationIds: ["os-prim", "os-esc120"],
    });

    // Domain notificationIds must be updated to the complete merged set
    expect(TaskRepository.updateNotificationIds).toHaveBeenCalledWith(
      "task-1",
      "ws-1",
      ["os-prim", "os-esc120", `new-slot-once:${triggerAt}:+240`],
      expect.objectContaining({ revision: 1 })
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Primary present, both escalations missing
  // ───────────────────────────────────────────────────────────────────────────
  it("2. primary present, both escalations missing → schedules both +120 and +240 while preserving primary", async () => {
    const task = createMockTask("task-1", triggerAt, ["os-prim"]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-1": task });

    const primaryNotif = createPhysicalNotif("os-prim", "task-1", triggerAt, 0);
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([primaryNotif]);

    await NotificationReconcilerService.reconcileAll();

    expect(cancelReminderIds).not.toHaveBeenCalled();

    expect(rescheduleTodoReminders).toHaveBeenCalledWith(task, {
      targetScheduleKeys: [`once:${triggerAt}:+120`, `once:${triggerAt}:+240`],
      cancelExisting: false,
      retainedNotificationIds: ["os-prim"],
    });

    expect(TaskRepository.updateNotificationIds).toHaveBeenCalledWith(
      "task-1",
      "ws-1",
      ["os-prim", `new-slot-once:${triggerAt}:+120`, `new-slot-once:${triggerAt}:+240`],
      expect.anything()
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. One escalation stale after reminder schedule mutation
  // ───────────────────────────────────────────────────────────────────────────
  it("3. one escalation stale after reminder schedule mutation → cancels stale slot, schedules missing slot, preserves valid slots", async () => {
    const oldTime = triggerAt - 3600000;
    const task = createMockTask("task-1", triggerAt, ["os-prim-new", "os-esc120-old", "os-esc240-new"]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-1": task });

    const primaryNew = createPhysicalNotif("os-prim-new", "task-1", triggerAt, 0);
    const esc120Old = createPhysicalNotif("os-esc120-old", "task-1", oldTime, 1); // Stale schedule key!
    const esc240New = createPhysicalNotif("os-esc240-new", "task-1", triggerAt, 2);

    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      primaryNew,
      esc120Old,
      esc240New,
    ]);

    await NotificationReconcilerService.reconcileAll();

    // Stale escalation cancelled
    expect(cancelReminderIds).toHaveBeenCalledWith(["os-esc120-old"], { throwOnError: false });

    // Missing escalation +120 scheduled
    expect(rescheduleTodoReminders).toHaveBeenCalledWith(task, {
      targetScheduleKeys: [`once:${triggerAt}:+120`],
      cancelExisting: false,
      retainedNotificationIds: ["os-prim-new", "os-esc240-new"],
    });

    // Domain updated with complete valid batch
    expect(TaskRepository.updateNotificationIds).toHaveBeenCalledWith(
      "task-1",
      "ws-1",
      ["os-prim-new", "os-esc240-new", `new-slot-once:${triggerAt}:+120`],
      expect.anything()
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Duplicate escalation
  // ───────────────────────────────────────────────────────────────────────────
  it("4. duplicate escalation → cancels duplicate escalation, retains single slot, no unnecessary rescheduling", async () => {
    const task = createMockTask("task-1", triggerAt, ["os-prim", "os-esc120-a", "os-esc120-b", "os-esc240"]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-1": task });

    const primary = createPhysicalNotif("os-prim", "task-1", triggerAt, 0);
    const esc120a = createPhysicalNotif("os-esc120-a", "task-1", triggerAt, 1);
    const esc120b = createPhysicalNotif("os-esc120-b", "task-1", triggerAt, 1); // Duplicate for slot 1
    const esc240 = createPhysicalNotif("os-esc240", "task-1", triggerAt, 2);

    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      primary,
      esc120a,
      esc120b,
      esc240,
    ]);

    await NotificationReconcilerService.reconcileAll();

    // Duplicate cancelled
    expect(cancelReminderIds).toHaveBeenCalledWith(["os-esc120-b"], { throwOnError: false });

    // No rescheduling since all 3 expected slots are satisfied!
    expect(rescheduleTodoReminders).not.toHaveBeenCalled();

    // Domain repaired to pruned set
    expect(TaskRepository.updateNotificationIds).toHaveBeenCalledWith(
      "task-1",
      "ws-1",
      ["os-prim", "os-esc120-a", "os-esc240"],
      expect.anything()
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Unexpected escalation level
  // ───────────────────────────────────────────────────────────────────────────
  it("5. unexpected escalation level (e.g. escalationLevel: 3) → cancelled as invalid physical slot", async () => {
    const task = createMockTask("task-1", triggerAt, ["os-prim", "os-esc120", "os-esc240", "os-esc360-bogus"]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-1": task });

    const primary = createPhysicalNotif("os-prim", "task-1", triggerAt, 0);
    const esc120 = createPhysicalNotif("os-esc120", "task-1", triggerAt, 1);
    const esc240 = createPhysicalNotif("os-esc240", "task-1", triggerAt, 2);
    const bogusEsc3 = {
      identifier: "os-esc360-bogus",
      content: {
        data: {
          type: "todo",
          itemId: "task-1",
          escalationLevel: 3, // Unexpected escalation level outside [120, 240]
          purpose: "escalation",
          logicalSignature: "todo:task-1:escalation",
          notificationScheduleKey: `once:${triggerAt}:+360`,
        },
      },
    };

    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      primary,
      esc120,
      esc240,
      bogusEsc3,
    ]);

    await NotificationReconcilerService.reconcileAll();

    // Bogus escalation must be cancelled
    expect(cancelReminderIds).toHaveBeenCalledWith(["os-esc360-bogus"], { throwOnError: false });

    // No rescheduling because primary, esc1, esc2 are all present and valid
    expect(rescheduleTodoReminders).not.toHaveBeenCalled();

    // Domain repaired to pruned valid set
    expect(TaskRepository.updateNotificationIds).toHaveBeenCalledWith(
      "task-1",
      "ws-1",
      ["os-prim", "os-esc120", "os-esc240"],
      expect.anything()
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Complete batch already present → no duplicate scheduling
  // ───────────────────────────────────────────────────────────────────────────
  it("6. complete batch already present → zero cancellation, zero scheduling calls, zero repository writes", async () => {
    const task = createMockTask("task-1", triggerAt, ["os-prim", "os-esc120", "os-esc240"]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-1": task });

    const primary = createPhysicalNotif("os-prim", "task-1", triggerAt, 0);
    const esc120 = createPhysicalNotif("os-esc120", "task-1", triggerAt, 1);
    const esc240 = createPhysicalNotif("os-esc240", "task-1", triggerAt, 2);

    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([primary, esc120, esc240]);

    await NotificationReconcilerService.reconcileAll();

    expect(cancelReminderIds).not.toHaveBeenCalled();
    expect(rescheduleTodoReminders).not.toHaveBeenCalled();
    expect(TaskRepository.updateNotificationIds).not.toHaveBeenCalled();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Concurrent reconciliation while schedule changes (stale-work rollback)
  // ───────────────────────────────────────────────────────────────────────────
  it("7. concurrent reconciliation while schedule changes → rolls back newly scheduled IDs on state_changed, leaves no zombie notifications", async () => {
    const task = createMockTask("task-concur", triggerAt, ["os-prim"]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-concur": task });

    const primary = createPhysicalNotif("os-prim", "task-concur", triggerAt, 0);
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([primary]);

    // Simulate concurrent mutation: repository rejects update because reminder/revision changed
    (TaskRepository.updateNotificationIds as jest.Mock).mockResolvedValue("state_changed");

    await NotificationReconcilerService.reconcileAll();

    // Reconciler attempted targeted scheduling for missing escalations
    expect(rescheduleTodoReminders).toHaveBeenCalledWith(task, {
      targetScheduleKeys: [`once:${triggerAt}:+120`, `once:${triggerAt}:+240`],
      cancelExisting: false,
      retainedNotificationIds: ["os-prim"],
    });

    // Stale-work rollback: newly scheduled notifications MUST be immediately cancelled!
    const expectedNewIds = [
      `new-slot-once:${triggerAt}:+120`,
      `new-slot-once:${triggerAt}:+240`,
    ];
    expect(cancelReminderIds).toHaveBeenCalledWith(expectedNewIds, { throwOnError: false });

    // Existing valid OS notification os-prim MUST NOT be cancelled
    expect(cancelReminderIds).not.toHaveBeenCalledWith(
      expect.arrayContaining(["os-prim"]),
      expect.anything()
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. Domain notificationIds repair after partial OS loss
  // ───────────────────────────────────────────────────────────────────────────
  it("8. domain notificationIds repair after partial OS loss → discovers missing escalations, schedules missing, updates domain to full valid set", async () => {
    // Domain believes it has all 3 notifications, but OS silently lost +120 and +240
    const task = createMockTask("task-repaired", triggerAt, ["os-prim", "os-lost-120", "os-lost-240"]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-repaired": task });

    // In reality, only the primary notification survived in OS
    const primary = createPhysicalNotif("os-prim", "task-repaired", triggerAt, 0);
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([primary]);

    await NotificationReconcilerService.reconcileAll();

    // Reconciler discovers +120 and +240 are missing in OS
    expect(rescheduleTodoReminders).toHaveBeenCalledWith(task, {
      targetScheduleKeys: [`once:${triggerAt}:+120`, `once:${triggerAt}:+240`],
      cancelExisting: false,
      retainedNotificationIds: ["os-prim"],
    });

    // Domain state is updated to contain the surviving OS primary + the new escalation IDs
    expect(TaskRepository.updateNotificationIds).toHaveBeenCalledWith(
      "task-repaired",
      "ws-1",
      ["os-prim", `new-slot-once:${triggerAt}:+120`, `new-slot-once:${triggerAt}:+240`],
      expect.anything()
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. Concurrent reconciliation calls coalesce & converge without duplicate scheduling
  // ───────────────────────────────────────────────────────────────────────────
  it("9. concurrent reconciliation calls coalesce and converge to exactly the current domain schedule with zero duplicate scheduling", async () => {
    let osStore = [createPhysicalNotif("os-prim", "task-concurrent-calls", triggerAt, 0)];
    let task = createMockTask("task-concurrent-calls", triggerAt, ["os-prim"]);

    (TaskRepository.getTasks as jest.Mock).mockImplementation(async () => ({
      "task-concurrent-calls": task,
    }));
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockImplementation(async () => [...osStore]);

    (rescheduleTodoReminders as jest.Mock).mockImplementation(async (t: Task, options?: any) => {
      const retained = options?.retainedNotificationIds || [];
      const newNotifs = (options?.targetScheduleKeys || []).map((k: string, idx: number) => {
        const id = `new-slot-${idx}-${k}`;
        const offset = k.endsWith("+120") ? 120 : 240;
        return {
          id,
          notif: createPhysicalNotif(id, t.id, triggerAt, offset === 120 ? 1 : 2),
        };
      });
      newNotifs.forEach((item: any) => osStore.push(item.notif));
      const newIds = newNotifs.map((item: any) => item.id);
      task = {
        ...t,
        reminder: {
          ...t.reminder!,
          notificationIds: [...retained, ...newIds],
        },
      };
      return task;
    });

    (TaskRepository.updateNotificationIds as jest.Mock).mockImplementation(async (_id, _wsId, notifIds) => {
      task.reminder!.notificationIds = notifIds;
      return "updated";
    });

    // Launch two reconciliation passes simultaneously
    const pass1 = NotificationReconcilerService.reconcileAll();
    const pass2 = NotificationReconcilerService.reconcileAll();

    await Promise.all([pass1, pass2]);

    // Exactly one targeted reschedule occurred across the concurrent passes
    expect(rescheduleTodoReminders).toHaveBeenCalledTimes(1);
    expect(rescheduleTodoReminders).toHaveBeenCalledWith(expect.anything(), {
      targetScheduleKeys: [`once:${triggerAt}:+120`, `once:${triggerAt}:+240`],
      cancelExisting: false,
      retainedNotificationIds: ["os-prim"],
    });

    // Both passes finish with exactly the 3 expected valid notifications in OS
    expect(osStore).toHaveLength(3);
    const osKeys = osStore.map((n) => n.content.data.notificationScheduleKey).sort();
    expect(osKeys).toEqual([
      `once:${triggerAt}:+0`,
      `once:${triggerAt}:+120`,
      `once:${triggerAt}:+240`,
    ]);

    // Domain notificationIds matches the exact OS set
    expect(task.reminder?.notificationIds).toEqual(osStore.map((n) => n.identifier));
  });
});


