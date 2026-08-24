import { TaskRepository } from "@/repositories/TaskRepository";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { NotificationReconcilerService } from "@/services/notifications/NotificationReconcilerService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { MoveReconcilerService } from "@/services/storage/MoveReconcilerService";
import { MoveJournalRepository } from "@/repositories/MoveJournalRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";

jest.mock("@react-native-async-storage/async-storage", () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
  getAllKeys: jest.fn(),
}));

jest.mock("expo-notifications", () => ({
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
}));

jest.mock("@/repositories/WorkspaceRepository", () => ({
  WorkspaceRepository: {
    getWorkspaces: jest.fn().mockResolvedValue([
      { id: "ws-1", name: "Workspace 1", type: "list" },
      { id: "ws-source", name: "Source", type: "list" },
      { id: "ws-target", name: "Target", type: "list" }
    ])
  }
}));

// Mock scheduling so we don't try to invoke native OS modules
jest.mock("@/services/scheduling/reminders.service", () => ({
  scheduleTaskNotifications: jest.fn().mockResolvedValue(["mock-os-id-1"]),
  rescheduleTodoReminders: jest.fn(async (task) => task),
  cancelReminderIds: jest.fn().mockResolvedValue(undefined),
}));

describe("System Write Semantics", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage = {};
    
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => mockStorage[key] || null);
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string) => {
      mockStorage[key] = val;
    });
    (AsyncStorage.multiGet as jest.Mock).mockImplementation(async (keys: string[]) => {
      return keys.map(k => [k, mockStorage[k] || null]);
    });
    (AsyncStorage.multiSet as jest.Mock).mockImplementation(async (pairs: [string, string][]) => {
      pairs.forEach(([k, v]) => { mockStorage[k] = v; });
    });
    (AsyncStorage.getAllKeys as jest.Mock).mockImplementation(async () => Object.keys(mockStorage));

    // By default, no scheduled notifications
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
  });

  it("1. User writes advance timestamps, System writes preserve them", async () => {
    const originalTime = 1000000;
    
    // 1. Manually inject a task at originalTime
    const task = {
      id: "test-task",
      workspaceId: "ws-1",
      title: "Initial",
      status: "todo",
      priority: "none",
      createdAt: originalTime,
      updatedAt: originalTime, // Strictly pinned
    };
    mockStorage[`pebble:v1:tasks:ws-1`] = JSON.stringify({ "test-task": task });

    // 2. Perform a SYSTEM write via the new Repository API
    await TaskRepository.updateNotificationIds("test-task", "ws-1", ["new-id"]);
    
    let raw = mockStorage[`pebble:v1:tasks:ws-1`];
    let parsed = JSON.parse(raw)["test-task"];
    expect(parsed.updatedAt).toBe(originalTime); // Timestamp MUST be preserved!

    // 3. Perform a USER write via the normal Repository API
    const userWriteTime = Date.now();
    await TaskRepository.saveTask({ ...task, title: "User Title" });

    raw = mockStorage[`pebble:v1:tasks:ws-1`];
    parsed = JSON.parse(raw)["test-task"];
    expect(parsed.updatedAt).toBeGreaterThanOrEqual(userWriteTime); // Timestamp MUST advance!
  });

  it("2. Notification Reconciler preserves timestamps", async () => {
    const originalTime = 1000000;
    
    // Workspaces are required by NotificationReconcilerService
    mockStorage["pebble:v1:workspaces"] = JSON.stringify([
      { id: "ws-1", name: "Main", createdAt: originalTime, updatedAt: originalTime }
    ]);

    // Inject task with an enabled reminder but NO notificationIds (needs healing)
    const task = {
      id: "task-heal",
      workspaceId: "ws-1",
      title: "Need Healing",
      status: "todo",
      priority: "none",
      createdAt: originalTime,
      updatedAt: originalTime,
      reminder: {
        enabled: true,
        triggerAt: Date.now() + 86400000,
        notificationIds: undefined, // Simulates a lost/missing ID that the OS still has
      }
    };
    mockStorage[`pebble:v1:tasks:ws-1`] = JSON.stringify({ "task-heal": task });

    // Mock the OS having the notification correctly
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      {
        identifier: "os-heal-id-1",
        content: { data: { type: "todo", itemId: "task-heal", logicalSignature: task.reminder.triggerAt.toString() } }
      }
    ]);

    // Run reconciliation - it should detect the domain state is missing the ID and repair it
    await NotificationReconcilerService.reconcileAll();

    const raw = mockStorage[`pebble:v1:tasks:ws-1`];
    const parsed = JSON.parse(raw)["task-heal"];
    
    // The domain state should be repaired
    expect(parsed.reminder.notificationIds).toEqual(["os-heal-id-1"]);
    
    // BUT the updatedAt MUST remain unchanged because it was a system operation!
    expect(parsed.updatedAt).toBe(originalTime);
  });

  it("3. Move conflict detection correctly distinguishes stale entities from user edits", async () => {
    const originalTime = 1000000;
    const opTime = 2000000; // Journal created at 2000000

    // Source contains a task edited BEFORE the move operation (stale)
    mockStorage[`pebble:v1:tasks:ws-source`] = JSON.stringify({
      "task-move": {
        id: "task-move",
        workspaceId: "ws-source", // Still has source
        title: "Old",
        status: "todo",
        priority: "none",
        createdAt: originalTime,
        updatedAt: originalTime, // < opTime (stale)
      }
    });

    // Target contains the successfully moved task (stale)
    mockStorage[`pebble:v1:tasks:ws-target`] = JSON.stringify({
      "task-move": {
        id: "task-move",
        workspaceId: "ws-target",
        title: "Old",
        status: "todo",
        priority: "none",
        createdAt: originalTime,
        updatedAt: originalTime, // < opTime (stale)
      }
    });

    // Add stranded MoveJournal operation
    mockStorage[`pebble:v1:move_journal`] = JSON.stringify([
      {
        operationId: "op-1",
        entityId: "task-move",
        entityType: "task",
        sourceWorkspaceId: "ws-source",
        targetWorkspaceId: "ws-target",
        timestamp: opTime,
      }
    ]);

    // Now, let's simulate that a BACKGROUND task runs and persists the source workspace.
    // Because of our changes, `isSystemWrite: true` preserves `updatedAt: 1000000`.
    // It is STILL < opTime!

    await MoveReconcilerService.reconcileAll();

    // 1. Conflict detection should see both are stale (< opTime).
    // 2. It will deduplicate and delete the source ghost.
    
    const sourceData = JSON.parse(mockStorage[`pebble:v1:tasks:ws-source`] || "{}");
    const targetData = JSON.parse(mockStorage[`pebble:v1:tasks:ws-target`] || "{}");
    
    expect(sourceData["task-move"]).toBeUndefined(); // Ghost deleted
    expect(targetData["task-move"]).toBeDefined(); // Target kept
    
    // If the background task had advanced updatedAt (the old bug), the reconciler would have
    // falsely flagged it as a "Source Edited" conflict and potentially deleted the target!
  });
});
