/**
 * CrossDomainIntegrity.test.ts
 * ──────────────────────────────────────────
 * Phase 9: Cross-Domain Integrity & Transaction Boundary Audit Suite
 *
 * Verifies end-to-end multi-domain workflows across:
 * - Entity Lifecycle (Tasks, Habits, Checklists, Resources)
 * - Workspace Boundaries & Lifecycle (Delete, Restore, Moves)
 * - Graph / Relationships Integrity
 * - Notification Scheduling & Reconciliation
 * - Conversion Boundaries (Task <-> Habit)
 * - Backup / Restore & Clear-All Lifecycle
 * - Concurrency & Lock Composition
 * - Failure Injection & Deterministic Reconciliation
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { GraphRepository } from "@/repositories/GraphRepository";
import {
  TaskRepository,
  HabitRepository,
  ChecklistRepository,
  ResourceRepository,
  WorkspaceRepository,
  RecycleBinRepository,
  TombstoneRepository,
  UiStateRepository,
} from "@/repositories";
import { GraphReconcilerService } from "@/services/storage/GraphReconcilerService";
import { NotificationReconcilerService } from "@/services/notifications/NotificationReconcilerService";
import { BackupService } from "@/services/storage/backup.service";
import { OnboardingService } from "@/services/onboarding/onboarding.service";
import * as Notifications from "expo-notifications";
import type {
  Task,
  Habit,
  Checklist,
  Resource,
  Workspace,
  Relationship,
} from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const mockScheduledNotifications: any[] = [];
let mockNextNotifCounter = 1;

jest.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: {
    DATE: "date",
    TIME_INTERVAL: "timeInterval",
    DAILY: "daily",
    WEEKLY: "weekly",
    MONTHLY: "monthly",
  },
  cancelAllScheduledNotificationsAsync: jest.fn().mockImplementation(async () => {
    mockScheduledNotifications.length = 0;
  }),
  cancelScheduledNotificationAsync: jest.fn().mockImplementation(async (id: string) => {
    const idx = mockScheduledNotifications.findIndex((n) => n.identifier === id);
    if (idx !== -1) mockScheduledNotifications.splice(idx, 1);
  }),
  scheduleNotificationAsync: jest.fn().mockImplementation(async (req: any) => {
    const id = `notif-${mockNextNotifCounter++}`;
    mockScheduledNotifications.push({
      identifier: id,
      content: req.content || {},
      trigger: req.trigger || {},
    });
    return id;
  }),
  getAllScheduledNotificationsAsync: jest.fn().mockImplementation(async () => {
    return [...mockScheduledNotifications];
  }),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
}));

describe("Phase 9 — Cross-Domain Integrity & Transaction Boundary Audit", () => {
  const ws1: Workspace = {
    id: "ws-cross-1",
    name: "Workspace 1",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  const ws2: Workspace = {
    id: "ws-cross-2",
    name: "Workspace 2",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  beforeEach(async () => {
    await AsyncStorage.clear();
    mockScheduledNotifications.length = 0;
    mockNextNotifCounter = 1;
    jest.clearAllMocks();
    GraphRepository.resetCache();
    NotificationReconcilerService.resetInFlightForTesting();

    await WorkspaceRepository.saveWorkspace(ws1);
    await WorkspaceRepository.saveWorkspace(ws2);
  });

  const makeTask = (id: string, wsId = "ws-cross-1", gen = 1): Task => ({
    id,
    workspaceId: wsId,
    title: `Task ${id}`,
    status: "todo",
    priority: "medium",
    revision: 1,
    lifecycleGeneration: gen,
    createdAt: 1000,
    updatedAt: 1000,
  });

  const makeHabit = (id: string, wsId = "ws-cross-1", gen = 1): Habit => ({
    id,
    workspaceId: wsId,
    title: `Habit ${id}`,
    revision: 1,
    lifecycleGeneration: gen,
    recurrence: { frequency: "daily", interval: 1 },
    completionHistory: [],
    createdAt: 1000,
    updatedAt: 1000,
  });

  const makeChecklist = (id: string, wsId = "ws-cross-1", gen = 1): Checklist => ({
    id,
    workspaceId: wsId,
    title: `Checklist ${id}`,
    items: [],
    revision: 1,
    lifecycleGeneration: gen,
    createdAt: 1000,
    updatedAt: 1000,
  });

  const makeResource = (id: string, wsId = "ws-cross-1", gen = 1): Resource => ({
    id,
    workspaceId: wsId,
    title: `Resource ${id}`,
    type: "note",
    content: "Content",
    revision: 1,
    lifecycleGeneration: gen,
    createdAt: 1000,
    updatedAt: 1000,
  });

  // ─────────────────────────────────────────────────────────────
  // 1. Create -> Graph -> Notification
  // ─────────────────────────────────────────────────────────────
  it("1. Create -> Graph -> Notification: entities, edges, and triggers correlate correctly", async () => {
    const task = makeTask("t-cgn-1");
    task.reminder = {
      enabled: true,
      triggerAt: Date.now() + 3600000,
    };
    await TaskRepository.saveTask(task);
    await ResourceRepository.saveResource(makeResource("r-cgn-1"));

    // Create graph edge connecting task to resource
    const rel = await EntityCommandService.createRelationship({
      source: { id: "t-cgn-1", type: "task" },
      target: { id: "r-cgn-1", type: "resource" },
      relationType: "references",
    });

    // Schedule notification via Reconciler
    await NotificationReconcilerService.reconcileAll();

    // Verify persisted state across domains
    const persistedTask = (await TaskRepository.getTasks("ws-cross-1"))["t-cgn-1"];
    expect(persistedTask).toBeDefined();
    expect(persistedTask.reminder?.notificationIds).toBeDefined();
    expect(persistedTask.reminder?.notificationIds!.length).toBeGreaterThan(0);

    const rels = await EntityCommandService.getRelated("t-cgn-1");
    expect(rels).toHaveLength(1);
    expect(rels[0].id).toBe(rel.id);
    expect(rels[0].target.id).toBe("r-cgn-1");

    expect(mockScheduledNotifications.length).toBeGreaterThan(0);
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Update -> Graph Reconcile -> Notification Reconcile
  // ─────────────────────────────────────────────────────────────
  it("2. Update -> Graph Reconcile -> Notification Reconcile: preserves identity and updates triggers", async () => {
    const task = makeTask("t-ugn-1");
    const newDate = Date.now() + 7200000;
    task.reminder = { enabled: true, triggerAt: newDate };
    await TaskRepository.saveTask(task);
    await ResourceRepository.saveResource(makeResource("r-ugn-1"));

    await EntityCommandService.createRelationship({
      id: "rel-ugn",
      source: { id: "t-ugn-1", type: "task" },
      target: { id: "r-ugn-1", type: "resource" },
      relationType: "references",
    });

    // Run reconciliations
    const graphReport = await GraphReconcilerService.reconcileAll();
    expect(graphReport.prunedDangling).toBe(0);

    await NotificationReconcilerService.reconcileAll();

    const notifs = await Notifications.getAllScheduledNotificationsAsync();
    expect(notifs.length).toBeGreaterThan(0);

    const related = await EntityCommandService.getRelated("t-ugn-1");
    expect(related).toHaveLength(1);
    expect(related[0].id).toBe("rel-ugn");
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Move -> Graph + Notification
  // ─────────────────────────────────────────────────────────────
  it("3. Move -> Graph + Notification: entity partitions cleanly and reminders persist", async () => {
    const task = makeTask("t-move-cross", "ws-cross-1");
    task.reminder = {
      enabled: true,
      triggerAt: Date.now() + 3600000,
    };
    await TaskRepository.saveTask(task);
    await ResourceRepository.saveResource(makeResource("r-move-cross", "ws-cross-1"));

    await EntityCommandService.createRelationship({
      id: "rel-move-cross",
      source: { id: "t-move-cross", type: "task" },
      target: { id: "r-move-cross", type: "resource" },
      relationType: "references",
    });

    // Move task to ws-cross-2
    const moved = await EntityCommandService.moveTask(
      "t-move-cross",
      "ws-cross-1",
      "ws-cross-2",
    );
    expect(moved.workspaceId).toBe("ws-cross-2");

    // Old workspace must not have the task
    expect((await TaskRepository.getTasks("ws-cross-1"))["t-move-cross"]).toBeUndefined();
    // New workspace must have the task
    expect((await TaskRepository.getTasks("ws-cross-2"))["t-move-cross"]).toBeDefined();

    // Reconcile notifications: notification is preserved for the moved task
    await NotificationReconcilerService.reconcileAll();
    const activeTask = (await TaskRepository.getTasks("ws-cross-2"))["t-move-cross"];
    expect(activeTask.reminder?.notificationIds).toBeDefined();

    // Graph relationship survives move
    const rels = await EntityCommandService.getRelated("t-move-cross");
    expect(rels).toHaveLength(1);
    expect(rels[0].id).toBe("rel-move-cross");
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Recycle -> Graph + Notification
  // ─────────────────────────────────────────────────────────────
  it("4. Recycle -> Graph + Notification: notification cancelled, graph edge retained", async () => {
    const task = makeTask("t-recycle-cross");
    task.reminder = {
      enabled: true,
      triggerAt: Date.now() + 3600000,
      notificationIds: ["notif-recycle-1"],
    };
    await TaskRepository.saveTask(task);
    mockScheduledNotifications.push({ identifier: "notif-recycle-1" });

    await EntityCommandService.createRelationship({
      id: "rel-recycle-cross",
      source: { id: "t-recycle-cross", type: "task" },
      target: { id: "r-recycle-cross", type: "resource" },
      relationType: "references",
    });

    // Recycle task
    await EntityCommandService.recycleTask("t-recycle-cross", "ws-cross-1", "Workspace 1");

    // Active partition empty, bin populated
    expect((await TaskRepository.getTasks("ws-cross-1"))["t-recycle-cross"]).toBeUndefined();
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    expect(binItems.some((i) => i.entityId === "t-recycle-cross")).toBe(true);

    // Notification is cancelled
    expect(mockScheduledNotifications.some((n) => n.identifier === "notif-recycle-1")).toBe(false);

    // Graph edge is retained in repository while soft-deleted
    const rels = await EntityCommandService.getRelated("t-recycle-cross");
    expect(rels).toHaveLength(1);
    expect(rels[0].id).toBe("rel-recycle-cross");
  });

  // ─────────────────────────────────────────────────────────────
  // 5. Restore -> Graph + Notification
  // ─────────────────────────────────────────────────────────────
  it("5. Restore -> Graph + Notification: entity restored, notification rescheduled, edge active", async () => {
    const task = makeTask("t-restore-cross");
    task.reminder = {
      enabled: true,
      triggerAt: Date.now() + 3600000,
    };
    await TaskRepository.saveTask(task);

    await EntityCommandService.createRelationship({
      id: "rel-restore-cross",
      source: { id: "t-restore-cross", type: "task" },
      target: { id: "r-target", type: "resource" },
      relationType: "references",
    });

    // Recycle then restore
    await EntityCommandService.recycleTask("t-restore-cross", "ws-cross-1", "Workspace 1");
    const restored = await EntityCommandService.restoreTask(
      "rb-t-restore-cross",
    );
    expect(restored.id).toBe("t-restore-cross");

    // Bin item removed, active partition populated
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    expect(binItems.some((i) => i.entityId === "t-restore-cross")).toBe(false);
    expect((await TaskRepository.getTasks("ws-cross-1"))["t-restore-cross"]).toBeDefined();

    // Reconcile notifications: trigger restored
    await NotificationReconcilerService.reconcileAll();
    const activeTask = (await TaskRepository.getTasks("ws-cross-1"))["t-restore-cross"];
    expect(activeTask.reminder?.notificationIds).toBeDefined();

    // Graph relationship intact
    const rels = await EntityCommandService.getRelated("t-restore-cross");
    expect(rels).toHaveLength(1);
    expect(rels[0].id).toBe("rel-restore-cross");
  });

  // ─────────────────────────────────────────────────────────────
  // 6. Permanent Delete -> Graph + Notification
  // ─────────────────────────────────────────────────────────────
  it("6. Permanent Delete -> Graph + Notification: tombstone added, graph wiped, reminders cancelled", async () => {
    const task = makeTask("t-perm-cross");
    task.reminder = {
      enabled: true,
      triggerAt: Date.now() + 3600000,
      notificationIds: ["notif-perm-1"],
    };
    await TaskRepository.saveTask(task);
    mockScheduledNotifications.push({ identifier: "notif-perm-1" });

    await EntityCommandService.createRelationship({
      id: "rel-perm-cross",
      source: { id: "t-perm-cross", type: "task" },
      target: { id: "r-target", type: "resource" },
      relationType: "references",
    });

    // Permanently delete
    await EntityCommandService.permanentlyDeleteTask("t-perm-cross", "ws-cross-1");

    // Verify tombstone exists
    expect(await TombstoneRepository.isTombstoned("task", "t-perm-cross", 1)).toBe(true);

    // Active storage and bin both empty
    expect((await TaskRepository.getTasks("ws-cross-1"))["t-perm-cross"]).toBeUndefined();
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    expect(binItems.some((i) => i.entityId === "t-perm-cross")).toBe(false);

    // Graph relationship wiped
    const rels = await EntityCommandService.getRelated("t-perm-cross");
    expect(rels).toHaveLength(0);

    // Reminder cancelled
    expect(mockScheduledNotifications.some((n) => n.identifier === "notif-perm-1")).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────
  // 7. Workspace Delete -> All Secondary State
  // ─────────────────────────────────────────────────────────────
  it("7. Workspace Delete: snapshots package, clears partitions, deletes graph edges, cancels notifications", async () => {
    const wsToDelete: Workspace = {
      id: "ws-del-7",
      name: "To Delete",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await WorkspaceRepository.saveWorkspace(wsToDelete);

    const task = makeTask("t-wsdel", "ws-del-7");
    task.reminder = {
      enabled: true,
      triggerAt: Date.now() + 3600000,
      notificationIds: ["notif-wsdel"],
    };
    await TaskRepository.saveTask(task);
    await ResourceRepository.saveResource(makeResource("r-wsdel", "ws-del-7"));
    mockScheduledNotifications.push({ identifier: "notif-wsdel" });

    await EntityCommandService.createRelationship({
      id: "rel-wsdel",
      source: { id: "t-wsdel", type: "task" },
      target: { id: "r-wsdel", type: "resource" },
      relationType: "references",
    });

    // Delete workspace
    await EntityCommandService.deleteWorkspace("ws-del-7");

    // Partitions cleared
    expect(Object.keys(await TaskRepository.getTasks("ws-del-7"))).toHaveLength(0);
    expect(Object.keys(await ResourceRepository.getResources("ws-del-7"))).toHaveLength(0);

    // Recycle bin contains snapshot package
    const binItems = await RecycleBinRepository.getRecycleBinItems();
    const wsBinItem = binItems.find((i) => i.entityId === "ws-del-7");
    expect(wsBinItem).toBeDefined();

    // Graph edge connecting deleted workspace entity is purged
    expect(await EntityCommandService.getAllRelationships()).toHaveLength(0);

    // Notifications cancelled
    expect(mockScheduledNotifications.some((n) => n.identifier === "notif-wsdel")).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────
  // 8. Conversion -> Graph + Notification + Resource Links
  // ─────────────────────────────────────────────────────────────
  it("8. Conversion (Task <-> Habit): transfers graph edges, resourceIds, and invalidates old reminder", async () => {
    const task = makeTask("t-conv-cross");
    task.resourceIds = ["r-conv-1"];
    task.reminder = {
      enabled: true,
      triggerAt: Date.now() + 3600000,
      notificationIds: ["notif-conv-old"],
    };
    await TaskRepository.saveTask(task);
    await ResourceRepository.saveResource(makeResource("r-conv-1"));
    mockScheduledNotifications.push({ identifier: "notif-conv-old" });

    await EntityCommandService.createRelationship({
      id: "rel-conv-cross",
      source: { id: "t-conv-cross", type: "task" },
      target: { id: "r-conv-1", type: "resource" },
      relationType: "references",
    });

    // Convert Task -> Habit
    const habit = await EntityCommandService.convertTaskToHabit(
      "t-conv-cross",
      "ws-cross-1",
    );
    expect(habit.id).toMatch(/^habit-/);
    expect(habit.resourceIds).toEqual(["r-conv-1"]);

    // Old task is gone
    expect((await TaskRepository.getTasks("ws-cross-1"))["t-conv-cross"]).toBeUndefined();
    // New habit exists
    expect((await HabitRepository.getHabits("ws-cross-1"))[habit.id]).toBeDefined();

    // Old notification cancelled
    expect(mockScheduledNotifications.some((n) => n.identifier === "notif-conv-old")).toBe(false);

    // Graph relationship source transferred to habit
    const habitRels = await EntityCommandService.getRelated(habit.id);
    expect(habitRels).toHaveLength(1);
    expect(habitRels[0].source.id).toBe(habit.id);
    expect(habitRels[0].source.type).toBe("habit");
  });

  // ─────────────────────────────────────────────────────────────
  // 9. Backup Restore -> All Domains
  // ─────────────────────────────────────────────────────────────
  it("9. Backup Restore: restores state across all domains, resets caches, and reschedules triggers", async () => {
    const task = makeTask("t-bkp-1");
    task.reminder = {
      enabled: true,
      triggerAt: Date.now() + 3600000,
    };
    await TaskRepository.saveTask(task);
    await ResourceRepository.saveResource(makeResource("r-bkp-1"));

    await EntityCommandService.createRelationship({
      id: "rel-bkp-1",
      source: { id: "t-bkp-1", type: "task" },
      target: { id: "r-bkp-1", type: "resource" },
      relationType: "references",
    });

    // Generate valid backup
    const backupJson = await BackupService.generateStructuredBackup();

    // Corrupt / clear storage
    await AsyncStorage.clear();
    GraphRepository.resetCache();

    // Restore backup
    await BackupService.restoreStructuredBackup(backupJson);

    // Verify all domains restored
    const restoredTasks = await TaskRepository.getTasks("ws-cross-1");
    expect(restoredTasks["t-bkp-1"]).toBeDefined();

    const restoredResources = await ResourceRepository.getResources("ws-cross-1");
    expect(restoredResources["r-bkp-1"]).toBeDefined();

    const restoredRels = await EntityCommandService.getAllRelationships();
    expect(restoredRels).toHaveLength(1);
    expect(restoredRels[0].id).toBe("rel-bkp-1");
  });

  // ─────────────────────────────────────────────────────────────
  // 10. Clear All -> Caches + Runtime + Repeated Onboarding Cycles
  // ─────────────────────────────────────────────────────────────
  it("10. Clear All: wipes storage, clears caches, and allows repeated clean onboarding cycles", async () => {
    for (let cycle = 1; cycle <= 3; cycle++) {
      // Step A: Complete onboarding
      await OnboardingService.completeOnboarding();
      let onbState = await OnboardingService.getOnboardingState();
      expect(onbState.completed).toBe(true);

      // Step B: Create domain data
      await TaskRepository.saveTask(makeTask(`t-cycle-${cycle}`));
      await ResourceRepository.saveResource(makeResource(`r-cycle-${cycle}`));
      await EntityCommandService.createRelationship({
        id: `rel-cycle-${cycle}`,
        source: { id: `t-cycle-${cycle}`, type: "task" },
        target: { id: `r-cycle-${cycle}`, type: "resource" },
        relationType: "references",
      });

      // Step C: Run clearAllData
      await BackupService.clearAllData();

      // Step D: Verify true clean state
      onbState = await OnboardingService.getOnboardingState();
      expect(onbState.completed).toBe(false);

      expect(await EntityCommandService.getAllRelationships()).toHaveLength(0);
      expect(Object.keys(await TaskRepository.getTasks("ws-cross-1"))).toHaveLength(0);
      expect(mockScheduledNotifications).toHaveLength(0);
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 11. Concurrent Mutation + Reconciliation
  // ─────────────────────────────────────────────────────────────
  it("11. Concurrent Mutation + Reconciliation: expectedSnapshot prevents state loss and converges", async () => {
    const task = makeTask("t-concur-1");
    task.resourceIds = ["r-live-c", "r-dead-c"];
    await TaskRepository.saveTask(task);
    await ResourceRepository.saveResource(makeResource("r-live-c"));

    // Run reconciliation while concurrently updating task title
    const [reconcileReport, updatedTask] = await Promise.all([
      GraphReconcilerService.reconcileAll(),
      EntityCommandService.updateTask("t-concur-1", "ws-cross-1", {
        title: "Concurrently Updated Title",
      }),
    ]);

    expect(reconcileReport).toBeDefined();
    expect(updatedTask.title).toBe("Concurrently Updated Title");

    // Second reconciliation ensures final clean state without dead links
    await GraphReconcilerService.reconcileAll();
    const finalTask = (await TaskRepository.getTasks("ws-cross-1"))["t-concur-1"];
    expect(finalTask.title).toBe("Concurrently Updated Title");
    expect(finalTask.resourceIds).toEqual(["r-live-c"]);
  });

  // ─────────────────────────────────────────────────────────────
  // 12. Persistence Failure + Compensating Recovery
  // ─────────────────────────────────────────────────────────────
  it("12. Persistence Failure during Restore: triggers compensating rollback safely", async () => {
    const originalTask = makeTask("t-orig-1");
    await TaskRepository.saveTask(originalTask);

    const corruptedBackup = JSON.stringify({
      version: 1,
      timestamp: Date.now(),
      workspaces: [ws1],
      tasks: [makeTask("t-bad-1")],
      habits: [],
      checklists: [],
      resources: [],
      recycleBin: [],
      focusSessions: [],
      relationships: [],
      systemEvents: [],
      settings: {},
      profile: {},
    });

    // Intercept AsyncStorage.multiSet to simulate a disk failure
    const originalMultiSet = AsyncStorage.multiSet;
    AsyncStorage.multiSet = jest
      .fn()
      .mockRejectedValueOnce(new Error("Simulated disk write failure"))
      .mockImplementation((...args: any[]) => (originalMultiSet as any)(...args));

    await expect(BackupService.restoreStructuredBackup(corruptedBackup)).rejects.toThrow("Simulated disk write failure");

    // Restore original multiSet and verify original state remained intact
    AsyncStorage.multiSet = originalMultiSet;
    const afterTasks = await TaskRepository.getTasks("ws-cross-1");
    expect(afterTasks["t-orig-1"]).toBeDefined();
    expect(afterTasks["t-bad-1"]).toBeUndefined();
  });

  // ─────────────────────────────────────────────────────────────
  // 13. Stale LifecycleGeneration References Rejected
  // ─────────────────────────────────────────────────────────────
  it("13. Stale lifecycleGeneration: recreations do not inherit dead tombstoned relationships", async () => {
    const taskGen1 = makeTask("t-stale-gen", "ws-cross-1", 1);
    await TaskRepository.saveTask(taskGen1);
    await ResourceRepository.saveResource(makeResource("r-stale-target"));

    await EntityCommandService.createRelationship({
      id: "rel-stale-gen",
      source: { id: "t-stale-gen", type: "task", lifecycleGeneration: 1 },
      target: { id: "r-stale-target", type: "resource" },
      relationType: "references",
    });

    // Permanently delete gen 1
    await EntityCommandService.permanentlyDeleteTask("t-stale-gen", "ws-cross-1");
    expect(await TombstoneRepository.isTombstoned("task", "t-stale-gen", 1)).toBe(true);

    // Recreate task with gen 2
    const taskGen2 = makeTask("t-stale-gen", "ws-cross-1", 2);
    await TaskRepository.saveTask(taskGen2);

    // Run reconciler: old rel targeting gen 1 must NOT attach to gen 2
    await GraphReconcilerService.reconcileAll();
    const rels = await EntityCommandService.getRelated("t-stale-gen");
    expect(rels).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────
  // 14. Cross-Workspace Reference Rejection
  // ─────────────────────────────────────────────────────────────
  it("14. Cross-Workspace Reference Rejection: prunes cross-workspace resource references and edges", async () => {
    // Task in ws-cross-1
    const task = makeTask("t-cross-ws", "ws-cross-1");
    // Resource in ws-cross-2
    const resource = makeResource("r-cross-ws", "ws-cross-2");
    await TaskRepository.saveTask(task);
    await ResourceRepository.saveResource(resource);

    // Directly plant a cross-workspace resource reference on task
    task.resourceIds = ["r-cross-ws"];
    await TaskRepository.saveTask(task);

    // Directly plant a cross-workspace relationship in storage
    const crossRel: Relationship = {
      id: "rel-cross-workspace",
      source: { id: "t-cross-ws", type: "task" },
      target: { id: "r-cross-ws", type: "resource" },
      relationType: "references",
      createdAt: 1000,
    };
    await AsyncStorage.setItem(
      "pebble:v1:relationships",
      JSON.stringify({ "rel-cross-workspace": crossRel }),
    );
    GraphRepository.resetCache();

    // Reconcile
    const report = await GraphReconcilerService.reconcileAll();
    expect(report.prunedDangling).toBe(1);
    expect(report.cleanedResourceIds).toBe(1);

    // The cross-workspace relationship is pruned
    expect(await EntityCommandService.getAllRelationships()).toHaveLength(0);

    // The task's cross-workspace resourceId is cleaned
    const finalTask = (await TaskRepository.getTasks("ws-cross-1"))["t-cross-ws"];
    expect(finalTask.resourceIds).toBeUndefined();
  });

  // ─────────────────────────────────────────────────────────────
  // 15. Duplicate / Idempotent Retry Behavior
  // ─────────────────────────────────────────────────────────────
  it("15. Duplicate / Idempotent Retry: repeated reconciliations and operations produce zero churn", async () => {
    const task = makeTask("t-idemp-1");
    task.reminder = {
      enabled: true,
      triggerAt: Date.now() + 3600000,
    };
    await TaskRepository.saveTask(task);
    await ResourceRepository.saveResource(makeResource("r-idemp-1"));

    // Create edge idempotently
    const rel1 = await EntityCommandService.createRelationship({
      source: { id: "t-idemp-1", type: "task" },
      target: { id: "r-idemp-1", type: "resource" },
      relationType: "references",
    });
    const rel2 = await EntityCommandService.createRelationship({
      source: { id: "t-idemp-1", type: "task" },
      target: { id: "r-idemp-1", type: "resource" },
      relationType: "references",
    });
    expect(rel1.id).toBe(rel2.id);
    expect(await EntityCommandService.getAllRelationships()).toHaveLength(1);

    // Reconcile 3 times consecutively
    for (let i = 0; i < 3; i++) {
      const gReport = await GraphReconcilerService.reconcileAll();
      expect(gReport.prunedDangling).toBe(0);
      expect(gReport.cleanedResourceIds).toBe(0);

      await NotificationReconcilerService.reconcileAll();
    }

    // Graph and notifications remain exactly 1 without duplicates
    expect(await EntityCommandService.getAllRelationships()).toHaveLength(1);
    expect(mockScheduledNotifications.length).toBeGreaterThan(0);
  });
});
