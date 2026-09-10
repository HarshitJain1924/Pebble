import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import {
  TaskRepository,
  HabitRepository,
  ChecklistRepository,
  ResourceRepository,
  WorkspaceRepository,
} from "@/repositories";
import { GraphRepository } from "@/repositories/GraphRepository";
import { GraphReconcilerService } from "@/services/storage/GraphReconcilerService";
import {
  type Task,
  type Habit,
  type Checklist,
  type Resource,
  type Workspace,
} from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const WS = "ws-race";

beforeEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();
  GraphRepository.resetCache();

  await WorkspaceRepository.saveWorkspace({
    id: WS,
    name: "Race WS",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
  } as Workspace);
});

describe("GraphReconcilerService resourceIds hostile concurrency audit", () => {
  it("T1 -> T2 -> T3: rejects stale update via expectedSnapshot and preserves newly added resource reference and metadata", async () => {
    // 1. Initial State:
    // - "res-initial" is a valid resource
    // - "res-dead" does not exist (dangling)
    // - task-1 links ["res-initial", "res-dead"]
    await ResourceRepository.saveResourceUnlocked({
      id: "res-initial",
      workspaceId: WS,
      title: "Initial Resource",
      type: "note",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 100,
      updatedAt: 100,
    } as Resource);

    const initialTask: Task = {
      id: "task-1",
      workspaceId: WS,
      title: "Task 1",
      status: "todo",
      priority: "medium",
      resourceIds: ["res-initial", "res-dead"],
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 100,
      updatedAt: 100,
    };
    await TaskRepository.saveTaskUnlocked(initialTask);

    // 2. Deterministic race orchestration:
    // T1: Reconciler reads initialTask (revision=1, updatedAt=100)
    // T2: Before updateResourceIds executes for the first time, user creates "res-new"
    //     and updates task-1 to link ["res-initial", "res-dead", "res-new"].
    //     This bumps revision to 2, updatedAt to 250.
    // T3: Reconciler attempts updateResourceIds with expectedSnapshot { revision: 1, updatedAt: 100 }.
    //     TaskRepository rejects it with 'state_changed'.
    //     Reconciler fetches fresh task & fresh resources, and retries with expectedSnapshot { revision: 2, updatedAt: 250 }.
    const originalUpdateResourceIds = TaskRepository.updateResourceIds;
    let callCount = 0;
    let intermediateUserTask: Task | null = null;

    jest.spyOn(TaskRepository, "updateResourceIds").mockImplementation(async function (
      id,
      workspaceId,
      resourceIds,
      expectedSnapshot,
    ) {
      callCount++;
      if (callCount === 1 && id === "task-1") {
        // Concurrent user action (T2):
        await ResourceRepository.saveResourceUnlocked({
          id: "res-new",
          workspaceId: WS,
          title: "Brand New Resource",
          type: "note",
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 200,
          updatedAt: 200,
        } as Resource);

        intermediateUserTask = await EntityCommandService.updateTask(
          "task-1",
          WS,
          { resourceIds: ["res-initial", "res-dead", "res-new"] },
          { source: "user_gesture" },
        );
      }

      return originalUpdateResourceIds.call(
        TaskRepository,
        id,
        workspaceId,
        resourceIds,
        expectedSnapshot,
      );
    });

    // Run reconciliation
    await GraphReconcilerService.reconcileAll();

    // Verify call sequence:
    // Call 1 failed with 'state_changed', Call 2 succeeded with fresh snapshot
    expect(callCount).toBe(2);
    expect(intermediateUserTask).not.toBeNull();
    expect(intermediateUserTask!.revision).toBe(2);

    const finalTask = await TaskRepository.getTask("task-1", WS);
    expect(finalTask).not.toBeNull();

    // Referential integrity check:
    // "res-new" and "res-initial" are retained, "res-dead" is pruned
    expect(finalTask!.resourceIds).toEqual(expect.arrayContaining(["res-initial", "res-new"]));
    expect(finalTask!.resourceIds).not.toContain("res-dead");
    expect(finalTask!.resourceIds?.length).toBe(2);

    // Metadata preservation check:
    // Reconciler cleanup did NOT clobber revision, updatedAt, or lifecycleGeneration
    expect(finalTask!.revision).toBe(intermediateUserTask!.revision);
    expect(finalTask!.updatedAt).toBe(intermediateUserTask!.updatedAt);
    expect(finalTask!.lifecycleGeneration).toBe(intermediateUserTask!.lifecycleGeneration);
  });

  it("Concurrent removal: user unlinks reference during reconciliation; reconciler does NOT resurrect it", async () => {
    // 1. Initial State:
    // task links ["res-1", "res-dead"]
    await ResourceRepository.saveResourceUnlocked({
      id: "res-1",
      workspaceId: WS,
      title: "Resource 1",
      type: "note",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 100,
      updatedAt: 100,
    } as Resource);

    await TaskRepository.saveTaskUnlocked({
      id: "task-2",
      workspaceId: WS,
      title: "Task 2",
      status: "todo",
      priority: "medium",
      resourceIds: ["res-1", "res-dead"],
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 100,
      updatedAt: 100,
    } as Task);

    // 2. Race: User concurrently unlinks res-1, making resourceIds empty or undefined
    const originalUpdateResourceIds = TaskRepository.updateResourceIds;
    let callCount = 0;

    jest.spyOn(TaskRepository, "updateResourceIds").mockImplementation(async function (
      id,
      workspaceId,
      resourceIds,
      expectedSnapshot,
    ) {
      callCount++;
      if (callCount === 1 && id === "task-2") {
        await EntityCommandService.updateTask(
          "task-2",
          WS,
          { resourceIds: [] },
          { source: "user_gesture" },
        );
      }
      return originalUpdateResourceIds.call(
        TaskRepository,
        id,
        workspaceId,
        resourceIds,
        expectedSnapshot,
      );
    });

    await GraphReconcilerService.reconcileAll();

    const finalTask = await TaskRepository.getTask("task-2", WS);
    expect(finalTask).not.toBeNull();
    // User unlinked all references; reconciler must NOT have resurrected res-1
    expect(finalTask!.resourceIds).toBeUndefined();
  });

  it("Metadata preservation: targeted background cleanup preserves revision, updatedAt, and lifecycleGeneration exactly", async () => {
    await ResourceRepository.saveResourceUnlocked({
      id: "res-live",
      workspaceId: WS,
      title: "Live Resource",
      type: "note",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 100,
      updatedAt: 100,
    } as Resource);

    const initialTask: Task = {
      id: "task-meta",
      workspaceId: WS,
      title: "Task Meta",
      status: "todo",
      priority: "medium",
      resourceIds: ["res-live", "res-dangling-1", "res-dangling-2"],
      revision: 7,
      lifecycleGeneration: 3,
      createdAt: 100,
      updatedAt: 1500,
    };
    // Seed directly into storage so existing.revision is 7 and existing.updatedAt is 1500
    await AsyncStorage.setItem(
      `pebble:v1:tasks:${WS}`,
      JSON.stringify({ [initialTask.id]: initialTask }),
    );

    await GraphReconcilerService.reconcileAll();

    const finalTask = await TaskRepository.getTask("task-meta", WS);
    expect(finalTask).not.toBeNull();
    expect(finalTask!.resourceIds).toEqual(["res-live"]);

    // Must preserve exact values so background cleanup doesn't masquerade as user edits
    expect(finalTask!.revision).toBe(7);
    expect(finalTask!.lifecycleGeneration).toBe(3);
    expect(finalTask!.updatedAt).toBe(1500);
  });

  it("Concurrent delete: entity deleted before reconciler update returns 'not_found' and does NOT resurrect entity", async () => {
    await TaskRepository.saveTaskUnlocked({
      id: "task-deleted",
      workspaceId: WS,
      title: "Task To Delete",
      status: "todo",
      priority: "medium",
      resourceIds: ["res-phantom"],
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 100,
      updatedAt: 100,
    } as Task);

    const originalUpdateResourceIds = TaskRepository.updateResourceIds;
    jest.spyOn(TaskRepository, "updateResourceIds").mockImplementation(async function (
      id,
      workspaceId,
      resourceIds,
      expectedSnapshot,
    ) {
      if (id === "task-deleted") {
        // User deletes task completely
        await TaskRepository.deleteTask(id, workspaceId);
      }
      return originalUpdateResourceIds.call(
        TaskRepository,
        id,
        workspaceId,
        resourceIds,
        expectedSnapshot,
      );
    });

    await GraphReconcilerService.reconcileAll();

    const finalTask = await TaskRepository.getTask("task-deleted", WS);
    expect(finalTask).toBeNull();
  });

  it("Habit parity: concurrent creation and linking of a valid resource is preserved", async () => {
    await ResourceRepository.saveResourceUnlocked({
      id: "res-habit-init",
      workspaceId: WS,
      title: "Initial Habit Resource",
      type: "note",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 100,
      updatedAt: 100,
    } as Resource);

    const initialHabit: Habit = {
      id: "habit-1",
      workspaceId: WS,
      title: "Habit 1",
      recurrence: { frequency: "daily", interval: 1 },
      completionHistory: [],
      resourceIds: ["res-habit-init", "res-habit-dead"],
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 100,
      updatedAt: 100,
    };
    await HabitRepository.saveHabitUnlocked(initialHabit);

    let habitCallCount = 0;
    const origHabitUpdate = HabitRepository.updateResourceIds;
    jest.spyOn(HabitRepository, "updateResourceIds").mockImplementation(async function (
      id,
      workspaceId,
      resourceIds,
      expectedSnapshot,
    ) {
      habitCallCount++;
      if (habitCallCount === 1 && id === "habit-1") {
        await ResourceRepository.saveResourceUnlocked({
          id: "res-habit-new",
          workspaceId: WS,
          title: "Brand New Habit Resource",
          type: "note",
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 200,
          updatedAt: 200,
        } as Resource);

        await EntityCommandService.updateHabit(
          "habit-1",
          WS,
          { resourceIds: ["res-habit-init", "res-habit-dead", "res-habit-new"] },
          { source: "user_gesture" },
        );
      }
      return origHabitUpdate.call(HabitRepository, id, workspaceId, resourceIds, expectedSnapshot);
    });

    await GraphReconcilerService.reconcileAll();

    const finalHabit = await HabitRepository.getHabit("habit-1", WS);
    expect(finalHabit).not.toBeNull();
    expect(finalHabit!.resourceIds).toEqual(
      expect.arrayContaining(["res-habit-init", "res-habit-new"]),
    );
    expect(finalHabit!.resourceIds).not.toContain("res-habit-dead");
    expect(finalHabit!.resourceIds?.length).toBe(2);
    expect(finalHabit!.revision).toBe(2);
  });

  it("Checklist parity: concurrent creation and linking of a valid resource is preserved", async () => {
    await ResourceRepository.saveResourceUnlocked({
      id: "res-chk-init",
      workspaceId: WS,
      title: "Initial Checklist Resource",
      type: "note",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 100,
      updatedAt: 100,
    } as Resource);

    const initialChecklist: Checklist = {
      id: "chk-1",
      workspaceId: WS,
      title: "Checklist 1",
      items: [],
      resourceIds: ["res-chk-init", "res-chk-dead"],
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 100,
      updatedAt: 100,
    };
    await ChecklistRepository.saveChecklistUnlocked(initialChecklist);

    let chkCallCount = 0;
    const origChkUpdate = ChecklistRepository.updateResourceIds;
    jest.spyOn(ChecklistRepository, "updateResourceIds").mockImplementation(async function (
      id,
      workspaceId,
      resourceIds,
      expectedSnapshot,
    ) {
      chkCallCount++;
      if (chkCallCount === 1 && id === "chk-1") {
        await ResourceRepository.saveResourceUnlocked({
          id: "res-chk-new",
          workspaceId: WS,
          title: "Brand New Checklist Resource",
          type: "note",
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 200,
          updatedAt: 200,
        } as Resource);

        await EntityCommandService.updateChecklist(
          "chk-1",
          WS,
          { resourceIds: ["res-chk-init", "res-chk-dead", "res-chk-new"] },
          { source: "user_gesture" },
        );
      }
      return origChkUpdate.call(
        ChecklistRepository,
        id,
        workspaceId,
        resourceIds,
        expectedSnapshot,
      );
    });

    await GraphReconcilerService.reconcileAll();

    const finalChecklist = await ChecklistRepository.getChecklist("chk-1", WS);
    expect(finalChecklist).not.toBeNull();
    expect(finalChecklist!.resourceIds).toEqual(
      expect.arrayContaining(["res-chk-init", "res-chk-new"]),
    );
    expect(finalChecklist!.resourceIds).not.toContain("res-chk-dead");
    expect(finalChecklist!.resourceIds?.length).toBe(2);
    expect(finalChecklist!.revision).toBe(2);
  });
});
