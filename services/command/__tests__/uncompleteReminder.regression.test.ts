import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { TaskRepository } from "@/repositories/TaskRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import type { Task, Workspace } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
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

const storage = AsyncStorage as typeof AsyncStorage;

const workspace: Workspace = {
  id: "ws-1",
  name: "Workspace 1",
  createdAt: 1,
  updatedAt: 1,
};

describe("Hostile Regression: Task Uncomplete Reminder Lifecycle", () => {
  let notificationCounter = 1;

  beforeEach(async () => {
    await storage.clear();
    jest.clearAllMocks();
    notificationCounter = 1;
    await WorkspaceRepository.saveWorkspace(workspace);

    (Notifications.scheduleNotificationAsync as jest.Mock).mockImplementation(
      async () => `native-notif-${notificationCounter++}`
    );
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockResolvedValue(
      undefined
    );
  });

  // 1-6. Active Task with valid one-time reminder -> complete -> uncomplete -> verify fresh IDs in OS and AsyncStorage
  it("1-6: should cancel on complete, reschedule on uncomplete, update AsyncStorage with new IDs, and discard old IDs", async () => {
    const triggerAt = Date.now() + 3_600_000;
    const task: Task = {
      id: "task-one-time",
      workspaceId: "ws-1",
      title: "One-time task",
      status: "todo",
      priority: "none",
      createdAt: 100,
      updatedAt: 100,
      reminder: {
        enabled: true,
        triggerAt,
        notificationIds: ["initial-id-123"],
      },
    };

    await TaskRepository.saveTask(task);

    // 2. Complete the Task and verify the native notification is cancelled.
    const completeResult = await EntityCommandService.completeTask("task-one-time", "ws-1", {
      skipAnalytics: true,
      skipEvents: true,
    });
    expect(completeResult).not.toBeNull();
    expect(completeResult?.updated.status).toBe("completed");

    // Native cancel called for initial notification
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("initial-id-123");

    // 3. Uncomplete the Task
    const uncompleteResult = await EntityCommandService.uncompleteTask("task-one-time", "ws-1", {
      skipAnalytics: true,
      skipEvents: true,
    });

    expect(uncompleteResult).not.toBeNull();
    expect(uncompleteResult?.updated.status).toBe("todo");

    // 4. Verify a fresh notification is scheduled
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
    const newIds = uncompleteResult?.updated.reminder?.notificationIds;
    expect(newIds).toBeDefined();
    expect(newIds?.length).toBeGreaterThan(0);

    // 6. Verify old notification IDs are never left attached to the Task
    expect(newIds).not.toContain("initial-id-123");

    // 5. Verify the Task persisted in AsyncStorage contains the NEW notification IDs, not the cancelled old IDs
    const persisted = await TaskRepository.getTask("task-one-time", "ws-1");
    expect(persisted).not.toBeNull();
    expect(persisted?.status).toBe("todo");
    expect(persisted?.reminder?.notificationIds).toEqual(newIds);
    expect(persisted?.reminder?.notificationIds).not.toContain("initial-id-123");
  });

  // 7. Test a recurring Task (whose initial triggerAt timestamp is in the past)
  it("7: should reschedule a recurring Task even if triggerAt was in the past", async () => {
    // For a recurring task, triggerAt might be 9:00 AM yesterday, but recurrence is daily
    const pastTriggerAt = Date.now() - 86_400_000;
    const task: Task = {
      id: "task-recurring",
      workspaceId: "ws-1",
      title: "Daily morning workout",
      status: "todo",
      priority: "none",
      createdAt: 100,
      updatedAt: 100,
      recurrence: {
        frequency: "daily",
        interval: 1,
      },
      reminder: {
        enabled: true,
        triggerAt: pastTriggerAt,
        notificationIds: ["old-recurring-notif-1"],
      },
    };

    await TaskRepository.saveTask(task);

    // Complete the recurring task
    await EntityCommandService.completeTask("task-recurring", "ws-1", {
      skipAnalytics: true,
      skipEvents: true,
    });
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("old-recurring-notif-1");

    // Uncomplete the recurring task
    const uncompleteResult = await EntityCommandService.uncompleteTask("task-recurring", "ws-1", {
      skipAnalytics: true,
      skipEvents: true,
    });

    expect(uncompleteResult).not.toBeNull();
    expect(uncompleteResult?.updated.status).toBe("todo");

    // Fresh notification should be scheduled for the recurring rule
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
    const newIds = uncompleteResult?.updated.reminder?.notificationIds;
    expect(newIds).toBeDefined();
    expect(newIds?.length).toBeGreaterThan(0);
    expect(newIds).not.toContain("old-recurring-notif-1");

    const persisted = await TaskRepository.getTask("task-recurring", "ws-1");
    expect(persisted?.reminder?.notificationIds).toEqual(newIds);
  });

  // 8. Test a Task with no reminder
  it("8: should uncomplete a task with no reminder cleanly without scheduling or crashing", async () => {
    const task: Task = {
      id: "task-no-reminder",
      workspaceId: "ws-1",
      title: "No reminder task",
      status: "completed",
      completedAt: Date.now() - 10_000,
      priority: "none",
      createdAt: 100,
      updatedAt: 100,
    };

    await TaskRepository.saveTask(task);

    const uncompleteResult = await EntityCommandService.uncompleteTask("task-no-reminder", "ws-1", {
      skipAnalytics: true,
      skipEvents: true,
    });

    expect(uncompleteResult).not.toBeNull();
    expect(uncompleteResult?.updated.status).toBe("todo");
    expect(uncompleteResult?.updated.reminder).toBeUndefined();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();

    const persisted = await TaskRepository.getTask("task-no-reminder", "ws-1");
    expect(persisted?.status).toBe("todo");
    expect(persisted?.reminder).toBeUndefined();
  });

  // 9. Simulate notification scheduling failure during uncomplete:
  //    - Task must not claim notification IDs that do not exist in the OS.
  //    - Preserve existing failure policy (domain uncomplete succeeds, reminder notificationIds is undefined).
  it("9: should not claim notification IDs if OS scheduling fails during uncomplete", async () => {
    const triggerAt = Date.now() + 3_600_000;
    const task: Task = {
      id: "task-fail-os",
      workspaceId: "ws-1",
      title: "Fail OS Task",
      status: "completed",
      completedAt: Date.now() - 1000,
      priority: "none",
      createdAt: 100,
      updatedAt: 100,
      reminder: {
        enabled: true,
        triggerAt,
        notificationIds: ["old-id-fail"],
      },
    };

    await TaskRepository.saveTask(task);

    // Simulate OS scheduling error
    (Notifications.scheduleNotificationAsync as jest.Mock).mockRejectedValueOnce(
      new Error("OS Notification Service Unavailable")
    );

    const uncompleteResult = await EntityCommandService.uncompleteTask("task-fail-os", "ws-1", {
      skipAnalytics: true,
      skipEvents: true,
    });

    expect(uncompleteResult).not.toBeNull();
    expect(uncompleteResult?.updated.status).toBe("todo");

    // The Task must not claim notification IDs that failed to schedule
    expect(uncompleteResult?.updated.reminder?.notificationIds).toBeUndefined();

    // Persisted state must also have undefined/empty notificationIds, never ghost/stale IDs
    const persisted = await TaskRepository.getTask("task-fail-os", "ws-1");
    expect(persisted?.status).toBe("todo");
    expect(persisted?.reminder?.notificationIds).toBeUndefined();
  });

  // 10. Concurrent mutation of the same Task while reminder rescheduling is happening
  it("10: should cancel newly scheduled notifications if task is concurrently completed/deleted/archived during OS scheduling", async () => {
    const triggerAt = Date.now() + 3_600_000;
    const task: Task = {
      id: "task-concurrent",
      workspaceId: "ws-1",
      title: "Concurrent Task",
      status: "completed",
      completedAt: Date.now() - 1000,
      priority: "none",
      createdAt: 100,
      updatedAt: 100,
      reminder: {
        enabled: true,
        triggerAt,
        notificationIds: ["old-concurrent-id"],
      },
    };

    await TaskRepository.saveTask(task);

    // Intercept scheduleNotificationAsync to simulate a concurrent completeTask before OS scheduling finishes
    (Notifications.scheduleNotificationAsync as jest.Mock).mockImplementation(async () => {
      // Simulate concurrent mutation while OS call is pending
      await TaskRepository.saveTask({
        ...task,
        status: "completed",
        completedAt: Date.now(),
        updatedAt: Date.now() + 10,
      });
      return "scheduled-during-race";
    });

    await EntityCommandService.uncompleteTask("task-concurrent", "ws-1", {
      skipAnalytics: true,
      skipEvents: true,
    });

    // Drain microtasks for async cancellation
    for (let i = 0; i < 10; i++) await Promise.resolve();

    // The newly scheduled notification should be cancelled because the task was concurrently completed
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("scheduled-during-race");

    // The persisted task should remain completed
    const persisted = await TaskRepository.getTask("task-concurrent", "ws-1");
    expect(persisted?.status).toBe("completed");
  });
});
