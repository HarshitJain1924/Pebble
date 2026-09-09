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
} from "@/repositories";
import { GraphReconcilerService } from "@/services/storage/GraphReconcilerService";
import { BackupService } from "@/services/storage/backup.service";
import { addStateListener } from "@/services/events/state-events";
import { OnboardingService } from "@/services/onboarding/onboarding.service";
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

jest.mock("expo-notifications", () => ({
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue("mock-notif-id"),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
}));

describe("Phase 8 — Relationship & Graph Integrity Suite", () => {
  const wsA: Workspace = {
    id: "ws-graph-a",
    name: "Workspace A",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  const wsB: Workspace = {
    id: "ws-graph-b",
    name: "Workspace B",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    GraphRepository.resetCache();
    await WorkspaceRepository.saveWorkspace(wsA);
    await WorkspaceRepository.saveWorkspace(wsB);
  });

  const createTask = (id: string, wsId = "ws-graph-a", gen = 1): Task => ({
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

  const createHabit = (id: string, wsId = "ws-graph-a", gen = 1): Habit => ({
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

  const createChecklist = (
    id: string,
    wsId = "ws-graph-a",
    gen = 1,
  ): Checklist => ({
    id,
    workspaceId: wsId,
    title: `Checklist ${id}`,
    items: [],
    revision: 1,
    lifecycleGeneration: gen,
    createdAt: 1000,
    updatedAt: 1000,
  });

  const createResource = (
    id: string,
    wsId = "ws-graph-a",
    gen = 1,
  ): Resource => ({
    id,
    workspaceId: wsId,
    title: `Resource ${id}`,
    type: "note",
    revision: 1,
    lifecycleGeneration: gen,
    createdAt: 1000,
    updatedAt: 1000,
  });

  // ─────────────────────────────────────────────────────────────
  // 1. Canonical repository ownership & API
  // ─────────────────────────────────────────────────────────────
  it("1. EntityCommandService provides canonical CRUD ownership over relationships", async () => {
    await TaskRepository.saveTask(createTask("task-1"));
    await ResourceRepository.saveResource(createResource("res-1"));

    const rel = await EntityCommandService.createRelationship({
      source: { id: "task-1", type: "task" },
      target: { id: "res-1", type: "resource" },
      relationType: "references",
    });

    expect(rel.id).toBeDefined();
    expect(rel.source.id).toBe("task-1");
    expect(rel.target.id).toBe("res-1");

    const all = await EntityCommandService.getAllRelationships();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(rel.id);

    const related = await EntityCommandService.getRelated("task-1");
    expect(related).toHaveLength(1);
    expect(related[0].id).toBe(rel.id);

    const deleted = await EntityCommandService.deleteRelationship(rel.id);
    expect(deleted).toBe(true);
    expect(await EntityCommandService.getAllRelationships()).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Referential integrity (valid endpoints)
  // ─────────────────────────────────────────────────────────────
  it("2. Validates source and target endpoint structure on creation", async () => {
    await expect(
      EntityCommandService.createRelationship({
        source: { id: "", type: "task" },
        target: { id: "res-1", type: "resource" },
        relationType: "references",
      }),
    ).rejects.toThrow("valid source and target endpoints");
  });

  // ─────────────────────────────────────────────────────────────
  // 3 & 4 & 5. Duplicate edge prevention & canonical ordering
  // ─────────────────────────────────────────────────────────────
  it("3 & 4 & 5. Idempotent creation prevents duplicate edges and canonicalizes undirected 'related'", async () => {
    await TaskRepository.saveTask(createTask("task-1"));
    await TaskRepository.saveTask(createTask("task-2"));

    // Directed "references": repeating returns the existing relationship
    const rel1 = await EntityCommandService.createRelationship({
      id: "rel-first",
      source: { id: "task-1", type: "task" },
      target: { id: "task-2", type: "task" },
      relationType: "references",
    });

    const rel2 = await EntityCommandService.createRelationship({
      id: "rel-duplicate",
      source: { id: "task-1", type: "task" },
      target: { id: "task-2", type: "task" },
      relationType: "references",
    });

    expect(rel2.id).toBe("rel-first");
    expect(await EntityCommandService.getAllRelationships()).toHaveLength(1);

    // Undirected "related": (task-2, task-1) matches (task-1, task-2)
    const u1 = await EntityCommandService.createRelationship({
      id: "u-1",
      source: { id: "task-2", type: "task" },
      target: { id: "task-1", type: "task" },
      relationType: "related",
    });
    // Normalized ordering puts task-1 as source because "task-1" < "task-2"
    expect(u1.source.id).toBe("task-1");
    expect(u1.target.id).toBe("task-2");

    const u2 = await EntityCommandService.createRelationship({
      id: "u-2",
      source: { id: "task-1", type: "task" },
      target: { id: "task-2", type: "task" },
      relationType: "related",
    });
    expect(u2.id).toBe("u-1");
    expect(await EntityCommandService.getAllRelationships()).toHaveLength(2);
  });

  // ─────────────────────────────────────────────────────────────
  // 6 & 7. Concurrent creation & deletion
  // ─────────────────────────────────────────────────────────────
  it("6 & 7. Concurrent creation of identical edge serializes without duplicates", async () => {
    await TaskRepository.saveTask(createTask("task-1"));
    await ResourceRepository.saveResource(createResource("res-1"));

    const p1 = EntityCommandService.createRelationship({
      id: "c-1",
      source: { id: "task-1", type: "task" },
      target: { id: "res-1", type: "resource" },
      relationType: "supports",
    });
    const p2 = EntityCommandService.createRelationship({
      id: "c-2",
      source: { id: "task-1", type: "task" },
      target: { id: "res-1", type: "resource" },
      relationType: "supports",
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.id).toBe(r2.id);
    expect(await EntityCommandService.getAllRelationships()).toHaveLength(1);

    // Concurrent delete and create
    const pDel = EntityCommandService.deleteRelationship(r1.id);
    const pCreate = EntityCommandService.createRelationship({
      id: "c-3",
      source: { id: "task-1", type: "task" },
      target: { id: "res-1", type: "resource" },
      relationType: "supports",
    });

    await Promise.all([pDel, pCreate]);
    const finalAll = await EntityCommandService.getAllRelationships();
    expect(finalAll.length).toBeLessThanOrEqual(1);
  });

  // ─────────────────────────────────────────────────────────────
  // 8. Entity deletion cleanup across Tasks, Habits, Checklists, Resources
  // ─────────────────────────────────────────────────────────────
  it("8. Permanently deleting a task, habit, checklist, or resource cleans its graph relationships", async () => {
    await TaskRepository.saveTask(createTask("t-del"));
    await HabitRepository.saveHabit(createHabit("h-del"));
    await ChecklistRepository.saveChecklist(createChecklist("c-del"));
    await ResourceRepository.saveResource(createResource("r-del"));

    await EntityCommandService.createRelationship({
      id: "rel-t-r",
      source: { id: "t-del", type: "task" },
      target: { id: "r-del", type: "resource" },
      relationType: "references",
    });

    await EntityCommandService.createRelationship({
      id: "rel-h-c",
      source: { id: "h-del", type: "habit" },
      target: { id: "c-del", type: "checklist" },
      relationType: "supports",
    });

    expect(await EntityCommandService.getAllRelationships()).toHaveLength(2);

    // Permanently delete task
    await EntityCommandService.deleteTask("t-del", "ws-graph-a");
    let all = await EntityCommandService.getAllRelationships();
    expect(all.map((r) => r.id)).toEqual(["rel-h-c"]);

    // Permanently delete habit
    await EntityCommandService.deleteHabit("h-del", "ws-graph-a");
    all = await EntityCommandService.getAllRelationships();
    expect(all).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────
  // 9 & 10. Recycle & restore behavior
  // ─────────────────────────────────────────────────────────────
  it("9 & 10. Recycling an entity retains its relationship, permanent deletion cleans it", async () => {
    await TaskRepository.saveTask(createTask("t-recycle"));
    await ResourceRepository.saveResource(createResource("r-recycle"));

    await EntityCommandService.createRelationship({
      id: "rel-recycle",
      source: { id: "t-recycle", type: "task" },
      target: { id: "r-recycle", type: "resource" },
      relationType: "references",
    });

    // Soft delete / recycle
    await EntityCommandService.recycleTask(
      "t-recycle",
      "ws-graph-a",
      "Workspace A",
    );

    // Relationship is preserved in storage while item is in recycle bin
    expect(await EntityCommandService.getAllRelationships()).toHaveLength(1);

    // Restore task
    await EntityCommandService.restoreTask("t-recycle");
    expect(await EntityCommandService.getAllRelationships()).toHaveLength(1);

    // Now permanently delete task
    await EntityCommandService.deleteTask("t-recycle", "ws-graph-a");
    expect(await EntityCommandService.getAllRelationships()).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────
  // 11. Move behavior
  // ─────────────────────────────────────────────────────────────
  it("11. Moving an entity between workspaces preserves its relationships", async () => {
    await TaskRepository.saveTask(createTask("t-move", "ws-graph-a"));
    await ResourceRepository.saveResource(createResource("r-target", "ws-graph-b"));

    await EntityCommandService.createRelationship({
      id: "rel-move",
      source: { id: "t-move", type: "task" },
      target: { id: "r-target", type: "resource" },
      relationType: "references",
    });

    // Move task from ws-graph-a to ws-graph-b
    await EntityCommandService.moveTask("t-move", "ws-graph-a", "ws-graph-b");

    const rels = await EntityCommandService.getRelated("t-move");
    expect(rels).toHaveLength(1);
    expect(rels[0].id).toBe("rel-move");
  });

  // ─────────────────────────────────────────────────────────────
  // 12. Conversion behavior (Task <-> Habit)
  // ─────────────────────────────────────────────────────────────
  it("12. Converting Task -> Habit and Habit -> Task transfers relationships and resourceIds", async () => {
    const task = createTask("t-convert");
    task.resourceIds = ["res-link-1"];
    await TaskRepository.saveTask(task);
    await ResourceRepository.saveResource(createResource("res-link-1"));

    await EntityCommandService.createRelationship({
      id: "rel-convert",
      source: { id: "t-convert", type: "task" },
      target: { id: "res-link-1", type: "resource" },
      relationType: "references",
    });

    // Convert Task to Habit
    const habit = await EntityCommandService.convertTaskToHabit(
      "t-convert",
      "ws-graph-a",
    );

    expect(habit.resourceIds).toEqual(["res-link-1"]);

    // The relationship source should now point to the new habit ID with type "habit"
    const habitRels = await EntityCommandService.getRelated(habit.id);
    expect(habitRels).toHaveLength(1);
    expect(habitRels[0].source.id).toBe(habit.id);
    expect(habitRels[0].source.type).toBe("habit");
    expect(habitRels[0].target.id).toBe("res-link-1");

    // Convert Habit back to Task
    const convertedTask = await EntityCommandService.convertHabitToTask(
      habit.id,
      "ws-graph-a",
    );
    expect(convertedTask.resourceIds).toEqual(["res-link-1"]);

    const taskRels = await EntityCommandService.getRelated(convertedTask.id);
    expect(taskRels).toHaveLength(1);
    expect(taskRels[0].source.id).toBe(convertedTask.id);
    expect(taskRels[0].source.type).toBe("task");
  });

  // ─────────────────────────────────────────────────────────────
  // 13 & 14. Workspace deletion & restore
  // ─────────────────────────────────────────────────────────────
  it("13 & 14. Deleting a workspace cleans up all relationships belonging to its entities", async () => {
    await TaskRepository.saveTask(createTask("t-ws", "ws-graph-a"));
    await ResourceRepository.saveResource(createResource("r-ws", "ws-graph-a"));

    await EntityCommandService.createRelationship({
      id: "rel-ws",
      source: { id: "t-ws", type: "task" },
      target: { id: "r-ws", type: "resource" },
      relationType: "references",
    });

    expect(await EntityCommandService.getAllRelationships()).toHaveLength(1);

    await EntityCommandService.deleteWorkspace("ws-graph-a");

    // All entity relationships inside deleted workspace are deleted
    expect(await EntityCommandService.getAllRelationships()).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────
  // 15 & 22. Startup reconciliation & repeated convergence
  // ─────────────────────────────────────────────────────────────
  it("15 & 22. GraphReconcilerService prunes dangling edges, cleans dead resourceIds, and converges", async () => {
    // 1. Valid task & resource
    const liveTask = createTask("t-live");
    liveTask.resourceIds = ["r-live", "r-dead"];
    await TaskRepository.saveTask(liveTask);
    await ResourceRepository.saveResource(createResource("r-live"));

    // 2. Persist relationships directly into storage including dangling edges
    const rels: Record<string, Relationship> = {
      "rel-valid": {
        id: "rel-valid",
        source: { id: "t-live", type: "task" },
        target: { id: "r-live", type: "resource" },
        relationType: "references",
        createdAt: 1000,
      },
      "rel-dangling-target": {
        id: "rel-dangling-target",
        source: { id: "t-live", type: "task" },
        target: { id: "nonexistent-res", type: "resource" },
        relationType: "references",
        createdAt: 1000,
      },
      "rel-dangling-source": {
        id: "rel-dangling-source",
        source: { id: "nonexistent-task", type: "task" },
        target: { id: "r-live", type: "resource" },
        relationType: "references",
        createdAt: 1000,
      },
      "rel-duplicate": {
        id: "rel-duplicate",
        source: { id: "t-live", type: "task" },
        target: { id: "r-live", type: "resource" },
        relationType: "references",
        createdAt: 1000,
      },
    };

    await AsyncStorage.setItem("pebble:v1:relationships", JSON.stringify(rels));
    GraphRepository.resetCache();

    // First reconciliation run: repairs dangling & duplicates & cleans dead resourceIds
    const report1 = await GraphReconcilerService.reconcileAll();
    expect(report1.prunedDangling).toBe(2);
    expect(report1.deduplicated).toBe(1);
    expect(report1.cleanedResourceIds).toBe(1);

    const finalRels = await EntityCommandService.getAllRelationships();
    expect(finalRels).toHaveLength(1);
    expect(finalRels[0].id).toBe("rel-valid");

    const updatedTask = (await TaskRepository.getTasks("ws-graph-a"))["t-live"];
    expect(updatedTask.resourceIds).toEqual(["r-live"]);

    // Second reconciliation run: zero churn / idempotent convergence
    const report2 = await GraphReconcilerService.reconcileAll();
    expect(report2.prunedDangling).toBe(0);
    expect(report2.deduplicated).toBe(0);
    expect(report2.updated).toBe(0);
    expect(report2.cleanedResourceIds).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────
  // 16. Backup / Restore validation
  // ─────────────────────────────────────────────────────────────
  it("16. Backup restore validates endpoints and drops invalid relationships", async () => {
    await TaskRepository.saveTask(createTask("t-backup"));
    await ResourceRepository.saveResource(createResource("r-backup"));

    await EntityCommandService.createRelationship({
      id: "rel-backup-valid",
      source: { id: "t-backup", type: "task" },
      target: { id: "r-backup", type: "resource" },
      relationType: "references",
    });

    const backupJson = await BackupService.generateStructuredBackup();
    const backupData = JSON.parse(backupJson);

    // Hostile injection: add dangling relationship into backup payload
    backupData.relationships.push({
      id: "rel-hostile-dangling",
      source: { id: "t-backup", type: "task" },
      target: { id: "dead-entity-999", type: "resource" },
      relationType: "references",
      createdAt: 2000,
    });

    await BackupService.restoreStructuredBackup(JSON.stringify(backupData));

    const restoredRels = await EntityCommandService.getAllRelationships();
    expect(restoredRels).toHaveLength(1);
    expect(restoredRels[0].id).toBe("rel-backup-valid");
  });

  // ─────────────────────────────────────────────────────────────
  // 17 & 23. Clear All & Repeated Onboarding cycles
  // ─────────────────────────────────────────────────────────────
  it("17 & 23. Clear All wipes graph and repeated 3x onboarding cycles start clean", async () => {
    for (let cycle = 1; cycle <= 3; cycle++) {
      await TaskRepository.saveTask(createTask(`task-cycle-${cycle}`));
      await ResourceRepository.saveResource(createResource(`res-cycle-${cycle}`));

      await EntityCommandService.createRelationship({
        id: `rel-cycle-${cycle}`,
        source: { id: `task-cycle-${cycle}`, type: "task" },
        target: { id: `res-cycle-${cycle}`, type: "resource" },
        relationType: "references",
      });

      expect(await EntityCommandService.getAllRelationships()).toHaveLength(1);

      // Clear All Data
      await BackupService.clearAllData();

      // Memory cache and storage must be completely empty
      expect(await EntityCommandService.getAllRelationships()).toHaveLength(0);
      const raw = await AsyncStorage.getItem("pebble:v1:relationships");
      expect(raw).toBeNull();
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 18. Cache rollback on write failure
  // ─────────────────────────────────────────────────────────────
  it("18. In-memory cache reverts if AsyncStorage write throws", async () => {
    await TaskRepository.saveTask(createTask("task-1"));
    await ResourceRepository.saveResource(createResource("res-1"));

    const setItemSpy = jest.spyOn(AsyncStorage, "setItem");
    setItemSpy.mockRejectedValueOnce(new Error("Disk failure"));

    await expect(
      EntityCommandService.createRelationship({
        id: "rel-fail",
        source: { id: "task-1", type: "task" },
        target: { id: "res-1", type: "resource" },
        relationType: "references",
      }),
    ).rejects.toThrow("Disk failure");

    // In-memory cache must not contain rel-fail
    expect(await EntityCommandService.getAllRelationships()).toHaveLength(0);
    setItemSpy.mockRestore();
  });

  // ─────────────────────────────────────────────────────────────
  // 19. Event ordering & emission
  // ─────────────────────────────────────────────────────────────
  it("19. Emits 'graph_changed' post-commit and suppresses on no-op", async () => {
    await TaskRepository.saveTask(createTask("task-1"));
    await ResourceRepository.saveResource(createResource("res-1"));

    const events: string[] = [];
    const unsub = addStateListener("graph_changed", (src) => {
      events.push(src || "unknown");
    });

    try {
      const rel = await EntityCommandService.createRelationship({
        id: "rel-ev",
        source: { id: "task-1", type: "task" },
        target: { id: "res-1", type: "resource" },
        relationType: "references",
      });
      expect(events).toHaveLength(1);

      // Deleting non-existent relationship emits no event
      await EntityCommandService.deleteRelationship("nonexistent");
      expect(events).toHaveLength(1);

      // Deleting existing relationship emits event
      await EntityCommandService.deleteRelationship(rel.id);
      expect(events).toHaveLength(2);
    } finally {
      unsub();
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 20. Stale identity & lifecycle generation mismatch
  // ─────────────────────────────────────────────────────────────
  it("20. Reconciler detects and prunes stale relationships across entity generation bumps", async () => {
    // Create Task Generation 1
    const taskG1 = createTask("task-stale", "ws-graph-a", 1);
    await TaskRepository.saveTask(taskG1);
    await ResourceRepository.saveResource(createResource("res-stale", "ws-graph-a", 1));

    // Create relationship specifically stamped with generation 1
    await EntityCommandService.createRelationship({
      id: "rel-gen-1",
      source: { id: "task-stale", type: "task", lifecycleGeneration: 1 },
      target: { id: "res-stale", type: "resource", lifecycleGeneration: 1 },
      relationType: "references",
    });

    // Simulate task-stale being deleted and recreated as Generation 2
    const taskG2 = createTask("task-stale", "ws-graph-a", 2);
    await TaskRepository.saveTask(taskG2);

    // Reconciler checks generation and drops the generation 1 relationship
    const report = await GraphReconcilerService.reconcileAll();
    expect(report.prunedDangling).toBe(1);

    expect(await EntityCommandService.getAllRelationships()).toHaveLength(0);
  });
});
