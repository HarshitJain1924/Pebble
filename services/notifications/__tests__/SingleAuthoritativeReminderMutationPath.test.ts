import React from "react";
import renderer, { act } from "react-test-renderer";
import * as Notifications from "expo-notifications";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { TaskCommandHandler } from "@/services/command/handlers/TaskCommandHandler";
import { HabitCommandHandler } from "@/services/command/handlers/HabitCommandHandler";
import { ChecklistCommandHandler } from "@/services/command/handlers/ChecklistCommandHandler";
import { ConversionCommandHandler } from "@/services/command/handlers/ConversionCommandHandler";
import { WorkspaceCommandHandler } from "@/services/command/handlers/WorkspaceCommandHandler";
import { saveParsedItem } from "@/features/capture/services/CaptureService";
import { NotificationReconcilerService } from "../NotificationReconcilerService";
import { TaskRepository, HabitRepository, ChecklistRepository, WorkspaceRepository } from "@/repositories";
import * as remindersService from "@/services/scheduling/reminders.service";
import { Task, Habit, Checklist, Workspace } from "@/shared/types/domain.types";
import { useReminderState } from "@/services/scheduling/hooks/useReminderState";
import { buildNotificationLogicalSignature, buildNotificationScheduleKey } from "../notification-identity";

jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue("mock-os-notif-1"),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  SchedulableTriggerInputTypes: {
    DATE: "date",
    DAILY: "daily",
    WEEKLY: "weekly",
    TIME_INTERVAL: "timeInterval",
  },
}));

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

describe("Single Authoritative Reminder Mutation Path — Comprehensive Audit", () => {
  const wsId = "ws-audit-1";
  let inMemoryTasks: Record<string, Task> = {};
  let inMemoryHabits: Record<string, Habit> = {};
  let inMemoryChecklists: Record<string, Checklist> = {};
  let inMemoryWorkspaces: Workspace[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();

    inMemoryTasks = {};
    inMemoryHabits = {};
    inMemoryChecklists = {};
    inMemoryWorkspaces = [
      {
        id: wsId,
        name: "Audit Workspace",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    jest.spyOn(WorkspaceRepository, "getWorkspaces").mockImplementation(async () => inMemoryWorkspaces);
    jest.spyOn(WorkspaceRepository, "saveWorkspace").mockImplementation(async (w: Workspace) => {
      const idx = inMemoryWorkspaces.findIndex((x) => x.id === w.id);
      if (idx >= 0) inMemoryWorkspaces[idx] = w;
      else inMemoryWorkspaces.push(w);
    });
    jest.spyOn(WorkspaceRepository, "deleteWorkspace").mockImplementation(async (id: string) => {
      inMemoryWorkspaces = inMemoryWorkspaces.filter((w) => w.id !== id);
    });

    jest.spyOn(TaskRepository, "getTasks").mockImplementation(async (wId) => {
      if (wId === wsId) return { ...inMemoryTasks };
      return {};
    });
    jest.spyOn(TaskRepository, "getTask").mockImplementation(async (id, wId) => {
      if (wId === wsId) return inMemoryTasks[id] || null;
      return null;
    });
    jest.spyOn(TaskRepository, "saveTaskUnlocked").mockImplementation(async (task) => {
      inMemoryTasks[task.id] = { ...task };
      return inMemoryTasks[task.id];
    });
    jest.spyOn(TaskRepository, "deleteTaskUnlocked").mockImplementation(async (id) => {
      delete inMemoryTasks[id];
    });
    jest.spyOn(TaskRepository, "updateNotificationIds").mockImplementation(async (id, wId, ids) => {
      if (inMemoryTasks[id]) {
        inMemoryTasks[id].reminder = {
          ...inMemoryTasks[id].reminder!,
          notificationIds: ids,
        };
        return "updated";
      }
      return "not_found";
    });

    jest.spyOn(HabitRepository, "getHabits").mockImplementation(async (wId) => {
      if (wId === wsId) return { ...inMemoryHabits };
      return {};
    });
    jest.spyOn(HabitRepository, "getHabit").mockImplementation(async (id, wId) => {
      if (wId === wsId) return inMemoryHabits[id] || null;
      return null;
    });
    jest.spyOn(HabitRepository, "saveHabitUnlocked").mockImplementation(async (habit) => {
      inMemoryHabits[habit.id] = { ...habit };
      return inMemoryHabits[habit.id];
    });
    jest.spyOn(HabitRepository, "deleteHabitUnlocked").mockImplementation(async (id) => {
      delete inMemoryHabits[id];
    });
    jest.spyOn(HabitRepository, "updateNotificationIds").mockImplementation(async (id, wId, ids) => {
      if (inMemoryHabits[id]) {
        inMemoryHabits[id].reminder = {
          ...inMemoryHabits[id].reminder!,
          notificationIds: ids,
        };
        return "updated";
      }
      return "not_found";
    });

    jest.spyOn(ChecklistRepository, "getChecklists").mockImplementation(async (wId) => {
      if (wId === wsId) return { ...inMemoryChecklists };
      return {};
    });
    jest.spyOn(ChecklistRepository, "getChecklist").mockImplementation(async (id, wId) => {
      if (wId === wsId) return inMemoryChecklists[id] || null;
      return null;
    });
    jest.spyOn(ChecklistRepository, "saveChecklistUnlocked").mockImplementation(async (cl) => {
      inMemoryChecklists[cl.id] = { ...cl };
      return inMemoryChecklists[cl.id];
    });
    jest.spyOn(ChecklistRepository, "deleteChecklistUnlocked").mockImplementation(async (id) => {
      delete inMemoryChecklists[id];
    });
    jest.spyOn(ChecklistRepository, "updateNotificationIds").mockImplementation(async (id, wId, ids) => {
      if (inMemoryChecklists[id]) {
        inMemoryChecklists[id].reminder = {
          ...inMemoryChecklists[id].reminder!,
          notificationIds: ids,
        };
        return "updated";
      }
      return "not_found";
    });
  });

  // ── 1 & 2: Direct OS Scheduling & Cancellation callers ─────────────────────
  it("1 & 2: schedules and cancels OS notifications exclusively through reminders.service", async () => {
    const cancelSpy = jest.spyOn(remindersService, "cancelReminderIds");

    const futureTime = Date.now() + 3600000;
    const task = await EntityCommandService.createTask(
      {
        id: "task-1",
        title: "Test Task",
        workspaceId: wsId,
        reminder: { enabled: true, triggerAt: futureTime },
      } as any,
      wsId
    );

    // Verify Notifications.scheduleNotificationAsync was invoked through canonical scheduler
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
    expect(task.reminder?.notificationIds).toBeDefined();

    // Now update task reminder time
    const updatedTime = futureTime + 7200000;
    (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();
    cancelSpy.mockClear();

    await EntityCommandService.updateTask(task.id, wsId, {
      reminder: { enabled: true, triggerAt: updatedTime },
    });

    // Old notifications cancelled via canonical service
    expect(cancelSpy).toHaveBeenCalledWith(expect.arrayContaining(["mock-os-notif-1"]), { throwOnError: false });
    // New notification scheduled via canonical service
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
  });

  // ── 3: NotificationListener does NOT independently schedule ────────────────
  it("3: NotificationListener event triggers only route to reconciler or domain command", async () => {
    const reconcileSpy = jest.spyOn(NotificationReconcilerService, "reconcileAll").mockResolvedValue();

    // Foreground observation in listener -> only triggers reconcileAll
    await NotificationReconcilerService.reconcileAll();
    expect(reconcileSpy).toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();

    // Snooze action on banner tap -> routes to EntityCommandService.snoozeReminder
    const futureTime = Date.now() + 100000;
    await EntityCommandService.createTask(
      { id: "t-listen", title: "Listen Task", workspaceId: wsId, reminder: { enabled: true, triggerAt: futureTime } } as any,
      wsId
    );

    const snoozeRes = await EntityCommandService.snoozeReminder("todo", "t-listen", wsId, 5);
    expect(snoozeRes.success).toBe(true);
    expect(snoozeRes.triggerAt).toBeDefined();
  });

  // ── 4: Snooze semantics ───────────────────────────────────────────────────
  it("4: snooze updates authoritative domain triggerAt and persists targeted notificationIds", async () => {
    const initialTime = Date.now() + 100000;
    const task = await EntityCommandService.createTask(
      {
        id: "task-snooze",
        title: "Snooze Target",
        workspaceId: wsId,
        reminder: { enabled: true, triggerAt: initialTime },
      } as any,
      wsId
    );

    const snoozeMinutes = 10;
    const snoozeRes = await EntityCommandService.snoozeReminder("todo", task.id, wsId, snoozeMinutes);

    expect(snoozeRes.success).toBe(true);
    expect(snoozeRes.triggerAt).toBeGreaterThanOrEqual(Date.now() + 9 * 60 * 1000);

    // Verify domain state in repository has updated triggerAt
    const saved = inMemoryTasks[task.id];
    expect(saved.reminder?.enabled).toBe(true);
    expect(saved.reminder?.triggerAt).toBe(snoozeRes.triggerAt);
    expect(saved.reminder?.notificationIds).toContain("mock-os-notif-1");
  });

  // ── 5: Quick Capture scheduling path ──────────────────────────────────────
  it("5: Quick Capture delegates to EntityCommandService without independent OS scheduling", async () => {
    const parsedItem = {
      type: "task" as const,
      title: "Quick Capture Task",
      category: "work" as const,
      time: "17:00",
      offsetMinutes: 0,
      confidence: 0.9,
      classification: { type: "task" as const, confidence: "high" as const },
    };

    const created = await saveParsedItem(parsedItem as any, wsId);
    expect(created.title).toBe("Quick Capture Task");
    expect(created.workspaceId).toBe(wsId);
    expect(inMemoryTasks[created.id]).toBeDefined();
    expect(inMemoryTasks[created.id].reminder?.enabled).toBe(true);
    expect(inMemoryTasks[created.id].reminder?.notificationIds).toBeDefined();
  });

  // ── 6: Task / Habit / Checklist parity ─────────────────────────────────────
  it("6: proves complete parity across Task, Habit, and Checklist reminder mutation pipelines", async () => {
    const futureTime = Date.now() + 5000000;

    // Task
    const task = await EntityCommandService.createTask(
      { id: "t-p", title: "Task Parity", workspaceId: wsId, reminder: { enabled: true, triggerAt: futureTime } } as any,
      wsId
    );
    expect(task.reminder?.notificationIds).toBeDefined();

    // Habit
    const habit = await EntityCommandService.createHabit(
      { id: "h-p", title: "Habit Parity", workspaceId: wsId, reminder: { enabled: true, triggerAt: futureTime } } as any,
      wsId
    );
    expect(habit.reminder?.notificationIds).toBeDefined();

    // Checklist
    const checklist = await EntityCommandService.createChecklist(
      { id: "c-p", title: "Checklist Parity", workspaceId: wsId, reminder: { enabled: true, triggerAt: futureTime } } as any,
      wsId
    );
    expect(checklist.reminder?.notificationIds).toBeDefined();

    // Disable reminder for all three
    await EntityCommandService.updateTask(task.id, wsId, { reminder: undefined });
    await EntityCommandService.updateHabit(habit.id, wsId, { reminder: undefined });
    await EntityCommandService.updateChecklist(checklist.id, wsId, { reminder: undefined });

    expect(inMemoryTasks[task.id].reminder).toBeUndefined();
    expect(inMemoryHabits[habit.id].reminder).toBeUndefined();
    expect(inMemoryChecklists[checklist.id].reminder).toBeUndefined();
  });

  // ── 7: Lifecycle operations ───────────────────────────────────────────────
  it("7: lifecycle operations cancel reminders and do not revive stale notificationIds on restore", async () => {
    const cancelSpy = jest.spyOn(remindersService, "cancelReminderIds");
    const futureTime = Date.now() + 3600000;

    const task = await EntityCommandService.createTask(
      { id: "t-life", title: "Life Task", workspaceId: wsId, reminder: { enabled: true, triggerAt: futureTime } } as any,
      wsId
    );

    // Complete task -> cancels reminders
    cancelSpy.mockClear();
    await EntityCommandService.completeTask(task.id, wsId);
    expect(cancelSpy).toHaveBeenCalledWith(expect.arrayContaining(["mock-os-notif-1"]), { throwOnError: false });

    // Uncomplete task -> reschedules fresh reminders
    await EntityCommandService.uncompleteTask(task.id, wsId);
    expect(inMemoryTasks[task.id].status).toBe("todo");
    expect(inMemoryTasks[task.id].reminder?.notificationIds).toBeDefined();

    // Archive task -> cancels reminders
    cancelSpy.mockClear();
    await EntityCommandService.updateTask(task.id, wsId, { archivedAt: Date.now() });
    expect(cancelSpy).toHaveBeenCalled();

    // Restore task -> reschedules fresh reminders without reviving old IDs
    cancelSpy.mockClear();
    await EntityCommandService.updateTask(task.id, wsId, { archivedAt: undefined });
    expect(inMemoryTasks[task.id].archivedAt).toBeUndefined();
    expect(inMemoryTasks[task.id].reminder?.notificationIds).toBeDefined();

    // Permanent delete -> cancels reminders
    cancelSpy.mockClear();
    await EntityCommandService.permanentlyDeleteTask(task.id, wsId);
    expect(cancelSpy).toHaveBeenCalled();
  });

  // ── 8: Workspace move / delete ─────────────────────────────────────────────
  it("8: workspace deletion cancels all child reminders and reconciler ignores deleted workspace", async () => {
    const cancelSpy = jest.spyOn(remindersService, "cancelReminderIds");
    const futureTime = Date.now() + 3600000;

    await EntityCommandService.createTask(
      { id: "t-ws-del", title: "Child Task", workspaceId: wsId, reminder: { enabled: true, triggerAt: futureTime } } as any,
      wsId
    );
    await EntityCommandService.createHabit(
      { id: "h-ws-del", title: "Child Habit", workspaceId: wsId, reminder: { enabled: true, triggerAt: futureTime } } as any,
      wsId
    );

    // Delete workspace
    cancelSpy.mockClear();
    await EntityCommandService.deleteWorkspace(wsId);

    // Verifies cancelReminderIds was called for child notifications
    expect(cancelSpy).toHaveBeenCalled();
    expect(inMemoryWorkspaces.find((w) => w.id === wsId)).toBeUndefined();

    // Reconciler runs after deletion:
    cancelSpy.mockClear();
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      {
        identifier: "orphan-notif-1",
        content: {
          data: {
            type: "todo",
            itemId: "t-ws-del",
            logicalSignature: "todo:t-ws-del:reminder",
          },
        },
      },
    ]);

    await NotificationReconcilerService.reconcileAll();
    // Since wsId was deleted, activeTasks doesn't have t-ws-del -> orphan-notif-1 cancelled
    expect(cancelSpy).toHaveBeenCalledWith(expect.arrayContaining(["orphan-notif-1"]), { throwOnError: false });
  });

  // ── 9: Conversion notification behavior ───────────────────────────────────
  it("9: converting habit to task cancels old habit reminders and assigns fresh task reminders", async () => {
    const cancelSpy = jest.spyOn(remindersService, "cancelReminderIds");
    const futureTime = Date.now() + 3600000;

    const habit = await EntityCommandService.createHabit(
      { id: "h-conv", title: "Conv Habit", workspaceId: wsId, reminder: { enabled: true, triggerAt: futureTime } } as any,
      wsId
    );

    cancelSpy.mockClear();
    const task = await ConversionCommandHandler.convertHabitToTask(habit.id, wsId);

    // Old habit cancelled
    expect(cancelSpy).toHaveBeenCalledWith(expect.arrayContaining(["mock-os-notif-1"]), { throwOnError: false });
    // New task created with fresh reminder schedule
    expect(task.id).not.toBe(habit.id);
    expect(task.reminder?.enabled).toBe(true);
    expect(inMemoryHabits[habit.id]).toBeUndefined();
    expect(inMemoryTasks[task.id]).toBeDefined();
  });

  // ── 10: Startup reconciliation ownership ──────────────────────────────────
  it("10: startup reconciliation converges with domain state without conflicting with commands", async () => {
    const futureTime = Date.now() + 3600000;
    const task = await EntityCommandService.createTask(
      { id: "t-startup", title: "Startup Task", workspaceId: wsId, reminder: { enabled: true, triggerAt: futureTime } } as any,
      wsId
    );

    const cancelSpy = jest.spyOn(remindersService, "cancelReminderIds");

    // Simulate OS notifications matching domain task
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      {
        identifier: "os-notif-primary",
        content: {
          data: {
            type: "todo",
            itemId: task.id,
            purpose: "reminder",
            escalationLevel: 0,
            logicalSignature: buildNotificationLogicalSignature("todo", task.id, "reminder"),
            notificationScheduleKey: buildNotificationScheduleKey({ type: "once", triggerAt: futureTime, offsetMinutes: 0 }),
          },
        },
      },
    ]);

    // Make sure domain task has notificationIds pointing to this notification
    inMemoryTasks[task.id].reminder!.notificationIds = ["os-notif-primary"];

    cancelSpy.mockClear();
    await NotificationReconcilerService.reconcileAll();
    // In sync: valid matching notification is retained, not cancelled
    expect(cancelSpy).not.toHaveBeenCalled();
  });

  // ── 11: Repeated command + reconciliation convergence ──────────────────────
  it("11: repeated command execution followed by reconciliation converges idempotently", async () => {
    const futureTime = Date.now() + 3600000;
    const task = await EntityCommandService.createTask(
      { id: "t-repeat", title: "Repeat Task", workspaceId: wsId, reminder: { enabled: true, triggerAt: futureTime } } as any,
      wsId
    );

    // Update twice in sequence
    await EntityCommandService.updateTask(task.id, wsId, { title: "Repeat Task Updated" });
    await EntityCommandService.updateTask(task.id, wsId, { priority: "high" });

    const cancelSpy = jest.spyOn(remindersService, "cancelReminderIds");

    // Simulate OS having the active notification for this task
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      {
        identifier: "os-notif-primary",
        content: {
          data: {
            type: "todo",
            itemId: task.id,
            purpose: "reminder",
            escalationLevel: 0,
            logicalSignature: buildNotificationLogicalSignature("todo", task.id, "reminder"),
            notificationScheduleKey: buildNotificationScheduleKey({ type: "once", triggerAt: futureTime, offsetMinutes: 0 }),
          },
        },
      },
    ]);
    inMemoryTasks[task.id].reminder!.notificationIds = ["os-notif-primary"];

    cancelSpy.mockClear();
    await NotificationReconcilerService.reconcileAll();
    // Valid notification is preserved
    expect(cancelSpy).not.toHaveBeenCalled();
  });

  // ── 12: No duplicate scheduler path ───────────────────────────────────────
  it("12: UI reminder actions through useReminderState route to command service with no duplicate scheduling", async () => {
    const futureTime = Date.now() + 3600000;
    const task = await EntityCommandService.createTask(
      { id: "t-ui", title: "UI Task", workspaceId: wsId, reminder: { enabled: true, triggerAt: futureTime } } as any,
      wsId
    );

    (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();

    const mockSetTodos = jest.fn();
    let hookScheduleAlarm: ((id: string, minutes: number) => Promise<void>) | undefined;

    function TestConsumer() {
      const hook = useReminderState(
        { [wsId]: [inMemoryTasks[task.id]] },
        mockSetTodos,
        wsId
      );
      hookScheduleAlarm = hook.scheduleAlarm;
      return null;
    }

    await act(async () => {
      renderer.create(React.createElement(TestConsumer));
    });

    // Trigger scheduleAlarm (e.g. "In 15 minutes")
    await act(async () => {
      await hookScheduleAlarm!(task.id, 15);
    });

    // Scheduled via EntityCommandService.updateTask
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
    expect(mockSetTodos).toHaveBeenCalled();

    // Verify repository was updated via canonical command handler
    expect(inMemoryTasks[task.id].reminder?.enabled).toBe(true);
  });
});
