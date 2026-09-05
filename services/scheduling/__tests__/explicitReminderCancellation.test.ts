import { EntityCommandService } from "@/services/command/EntityCommandService";
import { AlertCenterService } from "@/services/notifications/AlertCenterService";
import { NotificationReconcilerService } from "@/services/notifications/NotificationReconcilerService";
import { TaskRepository } from "@/repositories/TaskRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { ChecklistRepository } from "@/repositories/ChecklistRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import * as remindersService from "@/services/scheduling/reminders.service";
import * as Notifications from "expo-notifications";
import { Task, Habit, Checklist, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
  multiRemove: jest.fn(),
  getAllKeys: jest.fn(),
}));

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
  getAllScheduledNotificationsAsync: jest.fn().mockImplementation(async () => {
    return [...mockScheduledOsNotifications];
  }),
  setNotificationChannelAsync: jest.fn(),
  SchedulableTriggerInputTypes: {
    DATE: "date",
    DAILY: "daily",
    WEEKLY: "weekly",
  },
}));

describe("Explicit Reminder Cancellation Semantics", () => {
  let taskStore: Record<string, Task> = {};
  let habitStore: Record<string, Habit> = {};
  let checklistStore: Record<string, Checklist> = {};
  let cancelReminderIdsSpy: jest.SpyInstance;
  let scheduleReminderBatchSpy: jest.SpyInstance;

  const FUTURE_TRIGGER_1 = Date.now() + 3600 * 1000; // 1 hour ahead
  const FUTURE_TRIGGER_2 = Date.now() + 7200 * 1000; // 2 hours ahead

  beforeEach(() => {
    jest.clearAllMocks();
    taskStore = {};
    habitStore = {};
    checklistStore = {};
    mockScheduledOsNotifications = [];
    mockNotifSeq = 0;

    // Mock WorkspaceRepository
    jest.spyOn(WorkspaceRepository, "getWorkspaces").mockResolvedValue([
      {
        id: INBOX_WORKSPACE_ID,
        name: "Inbox",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ]);

    // Mock TaskRepository
    jest.spyOn(TaskRepository, "getTasks").mockImplementation(async () => ({ ...taskStore }));
    jest.spyOn(TaskRepository, "getTask").mockImplementation(async (id: string) => taskStore[id] || null);
    jest.spyOn(TaskRepository, "saveTaskUnlocked").mockImplementation(async (t: Task) => {
      taskStore[t.id] = { ...t };
      return taskStore[t.id];
    });
    jest.spyOn(TaskRepository, "saveTask").mockImplementation(async (t: Task) => {
      taskStore[t.id] = { ...t };
      return taskStore[t.id];
    });
    jest.spyOn(TaskRepository, "updateNotificationIds").mockImplementation(async (id: string, _ws: string, ids?: string[]) => {
      if (taskStore[id]) {
        if (taskStore[id].reminder) {
          taskStore[id].reminder = {
            ...taskStore[id].reminder!,
            notificationIds: ids,
          };
        }
        return "updated";
      }
      return "not_found";
    });

    // Mock HabitRepository
    jest.spyOn(HabitRepository, "getHabits").mockImplementation(async () => ({ ...habitStore }));
    jest.spyOn(HabitRepository, "getHabit").mockImplementation(async (id: string) => habitStore[id] || null);
    jest.spyOn(HabitRepository, "saveHabitUnlocked").mockImplementation(async (h: Habit) => {
      habitStore[h.id] = { ...h };
      return habitStore[h.id];
    });
    jest.spyOn(HabitRepository, "saveHabit").mockImplementation(async (h: Habit) => {
      habitStore[h.id] = { ...h };
      return habitStore[h.id];
    });
    jest.spyOn(HabitRepository, "updateNotificationIds").mockImplementation(async (id: string, _ws: string, ids?: string[]) => {
      if (habitStore[id]) {
        if (habitStore[id].reminder) {
          habitStore[id].reminder = {
            ...habitStore[id].reminder!,
            notificationIds: ids,
          };
        }
        return "updated";
      }
      return "not_found";
    });

    // Mock ChecklistRepository
    jest.spyOn(ChecklistRepository, "getChecklists").mockImplementation(async () => ({ ...checklistStore }));
    jest.spyOn(ChecklistRepository, "getChecklist").mockImplementation(async (id: string) => checklistStore[id] || null);
    jest.spyOn(ChecklistRepository, "saveChecklistUnlocked").mockImplementation(async (c: Checklist) => {
      checklistStore[c.id] = { ...c };
      return checklistStore[c.id];
    });
    jest.spyOn(ChecklistRepository, "saveChecklist").mockImplementation(async (c: Checklist) => {
      checklistStore[c.id] = { ...c };
    });
    jest.spyOn(ChecklistRepository, "updateNotificationIds").mockImplementation(async (id: string, _ws: string, ids?: string[]) => {
      if (checklistStore[id]) {
        if (checklistStore[id].reminder) {
          checklistStore[id].reminder = {
            ...checklistStore[id].reminder!,
            notificationIds: ids,
          };
        }
        return "updated";
      }
      return "not_found";
    });

    // Spies
    cancelReminderIdsSpy = jest.spyOn(remindersService, "cancelReminderIds");
    scheduleReminderBatchSpy = jest.spyOn(remindersService, "scheduleReminderBatch");
  });

  describe("Task reminder cancellation semantics", () => {
    it("proves requirements 1 through 7: explicit cancellation disables domain reminder, cancels primary + escalation OS notifications, clears persisted IDs, removes from Alert Center, and reconciler does not resurrect", async () => {
      // Setup active task with reminder (primary + escalation IDs)
      const task: Task = {
        id: "task-1",
        workspaceId: INBOX_WORKSPACE_ID,
        title: "Deep Work Session",
        status: "todo",
        priority: "high",
        categoryId: "work",
        schedule: { date: "2026-09-06", startTime: "10:00" },
        reminder: {
          enabled: true,
          triggerAt: FUTURE_TRIGGER_1,
          notificationIds: ["notif-todo-task-1-primary", "notif-todo-task-1-esc1", "notif-todo-task-1-esc2"],
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      };
      taskStore["task-1"] = { ...task };
      mockScheduledOsNotifications.push(
        {
          identifier: "notif-todo-task-1-primary",
          content: {
            data: {
              type: "todo",
              itemId: "task-1",
              escalationLevel: 0,
              purpose: "reminder",
              logicalSignature: "todo:task-1:reminder",
            },
          },
        },
        {
          identifier: "notif-todo-task-1-esc1",
          content: {
            data: {
              type: "todo",
              itemId: "task-1",
              escalationLevel: 1,
              purpose: "escalation",
              logicalSignature: "todo:task-1:escalation",
            },
          },
        },
        {
          identifier: "notif-todo-task-1-esc2",
          content: {
            data: {
              type: "todo",
              itemId: "task-1",
              escalationLevel: 2,
              purpose: "escalation",
              logicalSignature: "todo:task-1:escalation",
            },
          },
        },
      );

      // Verify initial Alert Center projection includes task
      const initialAlerts = await AlertCenterService.getAlertCenterData();
      expect(initialAlerts.all.some((item) => item.entityId === "task-1")).toBe(true);

      // 1. Explicit reminder cancellation via AlertCenterService / EntityCommandService
      await AlertCenterService.cancelReminder("task", "task-1", INBOX_WORKSPACE_ID);

      // Requirement 1: Domain state represents reminder as disabled/cleared
      const updatedTask = taskStore["task-1"];
      expect(updatedTask.reminder).toBeUndefined();

      // Requirement 2 & 3: Both primary and escalation notification IDs were canceled
      expect(cancelReminderIdsSpy).toHaveBeenCalledWith(
        ["notif-todo-task-1-primary", "notif-todo-task-1-esc1", "notif-todo-task-1-esc2"],
        expect.anything(),
      );
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("notif-todo-task-1-primary");
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("notif-todo-task-1-esc1");
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("notif-todo-task-1-esc2");

      // Requirement 4: Persisted notification IDs are cleared
      expect(updatedTask.reminder?.notificationIds).toBeUndefined();

      // Requirement 5: Alert Center no longer projects the canceled reminder
      const postCancelAlerts = await AlertCenterService.getAlertCenterData();
      expect(postCancelAlerts.all.some((item) => item.entityId === "task-1")).toBe(false);

      // Requirement 6: NotificationReconcilerService does not recreate the canceled notification
      scheduleReminderBatchSpy.mockClear();
      await NotificationReconcilerService.reconcileAll();
      expect(scheduleReminderBatchSpy).not.toHaveBeenCalled();

      // Requirement 7: Later reconciliation passes still leave it canceled
      await NotificationReconcilerService.reconcileAll();
      expect(scheduleReminderBatchSpy).not.toHaveBeenCalled();
      expect(taskStore["task-1"].reminder).toBeUndefined();
    });

    it("proves requirement 8: updating unrelated entity fields without specifying reminder does NOT cancel or resurrect reminder", async () => {
      // Case 8A: Task WITH active reminder - updating title preserves reminder
      const taskWithReminder: Task = {
        id: "task-active",
        workspaceId: INBOX_WORKSPACE_ID,
        title: "Original Title",
        status: "todo",
        priority: "medium",
        categoryId: "work",
        schedule: { date: "2026-09-06", startTime: "14:00" },
        reminder: {
          enabled: true,
          triggerAt: FUTURE_TRIGGER_1,
          notificationIds: ["notif-active-1"],
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      };
      taskStore["task-active"] = { ...taskWithReminder };

      await EntityCommandService.updateTask("task-active", INBOX_WORKSPACE_ID, {
        title: "Renamed Active Task",
      });

      // Reminder must be preserved, not cleared
      expect(taskStore["task-active"].title).toBe("Renamed Active Task");
      expect(taskStore["task-active"].reminder).toBeDefined();
      expect(taskStore["task-active"].reminder?.enabled).toBe(true);
      expect(taskStore["task-active"].reminder?.triggerAt).toBe(FUTURE_TRIGGER_1);

      // Case 8B: Task WITHOUT reminder (previously cancelled) - updating title does NOT resurrect reminder
      const taskWithoutReminder: Task = {
        id: "task-no-reminder",
        workspaceId: INBOX_WORKSPACE_ID,
        title: "Original Title No Reminder",
        status: "todo",
        priority: "medium",
        categoryId: "work",
        schedule: { date: "2026-09-06", startTime: "15:00" },
        reminder: undefined,
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      };
      taskStore["task-no-reminder"] = { ...taskWithoutReminder };

      await EntityCommandService.updateTask("task-no-reminder", INBOX_WORKSPACE_ID, {
        title: "Renamed No Reminder Task",
      });

      // Reminder must stay undefined
      expect(taskStore["task-no-reminder"].title).toBe("Renamed No Reminder Task");
      expect(taskStore["task-no-reminder"].reminder).toBeUndefined();

      // Case 8C: Rescheduling an entity that had its reminder cancelled does NOT resurrect reminder
      await EntityCommandService.updateTask("task-no-reminder", INBOX_WORKSPACE_ID, {
        schedule: { date: "2026-09-07", startTime: "16:00" },
      });
      expect(taskStore["task-no-reminder"].schedule?.startTime).toBe("16:00");
      expect(taskStore["task-no-reminder"].reminder).toBeUndefined();
    });

    it("proves requirement 9: explicitly replacing a reminder still works", async () => {
      const task: Task = {
        id: "task-replace",
        workspaceId: INBOX_WORKSPACE_ID,
        title: "Task to Replace Reminder",
        status: "todo",
        priority: "none",
        categoryId: "work",
        reminder: {
          enabled: true,
          triggerAt: FUTURE_TRIGGER_1,
          notificationIds: ["old-notif-p", "old-notif-e1"],
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      };
      taskStore["task-replace"] = { ...task };

      // Explicitly replace reminder with new time
      await EntityCommandService.updateTask("task-replace", INBOX_WORKSPACE_ID, {
        reminder: {
          enabled: true,
          triggerAt: FUTURE_TRIGGER_2,
        },
      });

      // Old IDs cancelled
      expect(cancelReminderIdsSpy).toHaveBeenCalledWith(["old-notif-p", "old-notif-e1"], expect.anything());

      // New reminder set and new batch scheduled
      const updated = taskStore["task-replace"];
      expect(updated.reminder?.triggerAt).toBe(FUTURE_TRIGGER_2);
      expect(updated.reminder?.notificationIds?.length).toBe(3);
      expect(typeof updated.reminder?.notificationIds?.[0]).toBe("string");
    });

    it("proves requirement 10: re-enabling/configuring reminder after cancellation creates expected new reminder", async () => {
      // 1. Start with cancelled reminder
      const task: Task = {
        id: "task-reenable",
        workspaceId: INBOX_WORKSPACE_ID,
        title: "Task Re-enable",
        status: "todo",
        priority: "none",
        categoryId: "work",
        reminder: undefined,
        revision: 2,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 2000,
      };
      taskStore["task-reenable"] = { ...task };

      // 2. Explicitly re-enable reminder
      await EntityCommandService.updateTask("task-reenable", INBOX_WORKSPACE_ID, {
        reminder: {
          enabled: true,
          triggerAt: FUTURE_TRIGGER_1,
        },
      });

      const updated = taskStore["task-reenable"];
      expect(updated.reminder).toBeDefined();
      expect(updated.reminder?.enabled).toBe(true);
      expect(updated.reminder?.triggerAt).toBe(FUTURE_TRIGGER_1);
      expect(updated.reminder?.notificationIds?.length).toBe(3);

      // Verify Alert Center projects re-enabled reminder
      const alerts = await AlertCenterService.getAlertCenterData();
      expect(alerts.all.some((item) => item.entityId === "task-reenable")).toBe(true);
    });

    it("handles explicit reminder: null and reminder: { enabled: false } canonical representations", async () => {
      const task: Task = {
        id: "task-null-disable",
        workspaceId: INBOX_WORKSPACE_ID,
        title: "Task Null Disable",
        status: "todo",
        priority: "none",
        categoryId: "work",
        reminder: {
          enabled: true,
          triggerAt: FUTURE_TRIGGER_1,
          notificationIds: ["null-test-id"],
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      };
      taskStore["task-null-disable"] = { ...task };

      // Pass reminder: null (as may come from external serialization or callers)
      await EntityCommandService.updateTask("task-null-disable", INBOX_WORKSPACE_ID, {
        reminder: null as any,
      });

      expect(taskStore["task-null-disable"].reminder).toBeUndefined();
      expect(cancelReminderIdsSpy).toHaveBeenCalledWith(["null-test-id"], expect.anything());

      // Pass reminder: { enabled: false, triggerAt: 0 }
      taskStore["task-null-disable"].reminder = {
        enabled: true,
        triggerAt: FUTURE_TRIGGER_1,
        notificationIds: ["disable-test-id"],
      };

      await EntityCommandService.updateTask("task-null-disable", INBOX_WORKSPACE_ID, {
        reminder: { enabled: false, triggerAt: 0 },
      });

      expect(taskStore["task-null-disable"].reminder?.enabled).toBe(false);
      expect(taskStore["task-null-disable"].reminder?.notificationIds).toBeUndefined();
      expect(cancelReminderIdsSpy).toHaveBeenCalledWith(["disable-test-id"], expect.anything());
    });
  });

  describe("Habit reminder cancellation semantics", () => {
    it("proves explicit cancellation disables habit reminder, cancels OS notifications, and reconciler does not resurrect", async () => {
      const habit: Habit = {
        id: "habit-1",
        workspaceId: INBOX_WORKSPACE_ID,
        title: "Morning Meditation",
        recurrence: { frequency: "daily", interval: 1 },
        streak: 5,
        bestStreak: 10,
        completionHistory: [],
        categoryId: "wellness",
        reminder: {
          enabled: true,
          triggerAt: FUTURE_TRIGGER_1,
          notificationIds: ["notif-habit-habit-1-primary", "notif-habit-habit-1-esc1", "notif-habit-habit-1-esc2"],
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      };
      habitStore["habit-1"] = { ...habit };
      mockScheduledOsNotifications.push(
        {
          identifier: "notif-habit-habit-1-primary",
          content: {
            data: {
              type: "habit",
              itemId: "habit-1",
              escalationLevel: 0,
              purpose: "reminder",
              logicalSignature: "habit:habit-1:reminder",
            },
          },
        },
        {
          identifier: "notif-habit-habit-1-esc1",
          content: {
            data: {
              type: "habit",
              itemId: "habit-1",
              escalationLevel: 1,
              purpose: "escalation",
              logicalSignature: "habit:habit-1:escalation",
            },
          },
        },
      );

      // Verify Alert Center projects habit initially
      const initialAlerts = await AlertCenterService.getAlertCenterData();
      expect(initialAlerts.all.some((item) => item.entityId === "habit-1")).toBe(true);

      // Cancel reminder
      await AlertCenterService.cancelReminder("habit", "habit-1", INBOX_WORKSPACE_ID);

      // Domain state cleared
      const updatedHabit = habitStore["habit-1"];
      expect(updatedHabit.reminder).toBeUndefined();

      // OS notifications canceled
      expect(cancelReminderIdsSpy).toHaveBeenCalledWith(
        ["notif-habit-habit-1-primary", "notif-habit-habit-1-esc1", "notif-habit-habit-1-esc2"],
        expect.anything(),
      );

      // Alert Center no longer projects canceled reminder
      const postCancelAlerts = await AlertCenterService.getAlertCenterData();
      expect(postCancelAlerts.all.some((item) => item.entityId === "habit-1")).toBe(false);

      // Reconciler does not recreate
      scheduleReminderBatchSpy.mockClear();
      await NotificationReconcilerService.reconcileAll();
      expect(scheduleReminderBatchSpy).not.toHaveBeenCalled();

      // Unrelated field edit does not resurrect reminder
      await EntityCommandService.updateHabit("habit-1", INBOX_WORKSPACE_ID, {
        title: "Updated Meditation Title",
      });
      expect(habitStore["habit-1"].reminder).toBeUndefined();

      // Re-enabling reminder works
      await EntityCommandService.updateHabit("habit-1", INBOX_WORKSPACE_ID, {
        reminder: {
          enabled: true,
          triggerAt: FUTURE_TRIGGER_2,
        },
      });
      expect(habitStore["habit-1"].reminder?.enabled).toBe(true);
      expect(habitStore["habit-1"].reminder?.triggerAt).toBe(FUTURE_TRIGGER_2);
    });
  });

  describe("Checklist reminder cancellation semantics", () => {
    it("proves explicit cancellation disables checklist reminder, cancels OS notifications, and reconciler does not resurrect", async () => {
      const checklist: Checklist = {
        id: "checklist-1",
        workspaceId: INBOX_WORKSPACE_ID,
        title: "Weekly Review Checklist",
        items: [
          { id: "item-1", title: "Review inbox", completed: false },
          { id: "item-2", title: "Plan week", completed: false },
        ],
        categoryId: "work",
        reminder: {
          enabled: true,
          triggerAt: FUTURE_TRIGGER_1,
          notificationIds: ["notif-checklist-checklist-1-primary", "notif-checklist-checklist-1-esc1"],
        },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      };
      checklistStore["checklist-1"] = { ...checklist };
      mockScheduledOsNotifications.push({
        identifier: "notif-checklist-checklist-1-primary",
        content: {
          data: {
            type: "checklist",
            itemId: "checklist-1",
            escalationLevel: 0,
            purpose: "reminder",
            logicalSignature: "checklist:checklist-1:reminder",
          },
        },
      });

      // Verify Alert Center projects checklist initially
      const initialAlerts = await AlertCenterService.getAlertCenterData();
      expect(initialAlerts.all.some((item) => item.entityId === "checklist-1")).toBe(true);

      // Cancel reminder
      await AlertCenterService.cancelReminder("checklist", "checklist-1", INBOX_WORKSPACE_ID);

      // Domain state cleared
      const updatedChecklist = checklistStore["checklist-1"];
      expect(updatedChecklist.reminder).toBeUndefined();

      // OS notifications canceled
      expect(cancelReminderIdsSpy).toHaveBeenCalledWith(
        ["notif-checklist-checklist-1-primary", "notif-checklist-checklist-1-esc1"],
        expect.anything(),
      );

      // Alert Center no longer projects canceled reminder
      const postCancelAlerts = await AlertCenterService.getAlertCenterData();
      expect(postCancelAlerts.all.some((item) => item.entityId === "checklist-1")).toBe(false);

      // Reconciler does not recreate
      scheduleReminderBatchSpy.mockClear();
      await NotificationReconcilerService.reconcileAll();
      expect(scheduleReminderBatchSpy).not.toHaveBeenCalled();

      // Unrelated field edit does not resurrect reminder
      await EntityCommandService.updateChecklist("checklist-1", INBOX_WORKSPACE_ID, {
        title: "Updated Checklist Title",
      });
      expect(checklistStore["checklist-1"].reminder).toBeUndefined();

      // Re-enabling reminder works
      await EntityCommandService.updateChecklist("checklist-1", INBOX_WORKSPACE_ID, {
        reminder: {
          enabled: true,
          triggerAt: FUTURE_TRIGGER_2,
        },
      });
      expect(checklistStore["checklist-1"].reminder?.enabled).toBe(true);
      expect(checklistStore["checklist-1"].reminder?.triggerAt).toBe(FUTURE_TRIGGER_2);
    });
  });
});
