import { MoveReconcilerService } from "../MoveReconcilerService";
import { MoveJournalRepository } from "@/repositories/MoveJournalRepository";
import type { MoveJournalEntry, Task } from "@/shared/types/domain.types";
import { generateId } from "@/shared/utils/id";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { withLock, withLocks } from "@/shared/utils/mutex";

jest.mock("@react-native-async-storage/async-storage", () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
  removeItem: jest.fn(),
  multiRemove: jest.fn(),
  getAllKeys: jest.fn(),
  clear: jest.fn(),
}));

jest.mock("@/repositories/MoveJournalRepository");

jest.mock("@/services/scheduling/reminders.service", () => ({
  cancelReminderIds: jest.fn().mockResolvedValue(undefined),
}));
// DO NOT MOCK withLock as a no-op! Use the real implementation for concurrency tests.
jest.mock("@/shared/utils/mutex", () => {
  const original = jest.requireActual("@/shared/utils/mutex");
  return {
    withLock: original.withLock,
    withLocks: original.withLocks,
  };
});

describe("MoveReconcilerService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockJournalEntry = (
    entityId: string,
    entityType: "task" | "habit" | "checklist" | "resource" = "task",
  ): MoveJournalEntry => ({
    operationId: `move-${generateId()}`,
    entityId,
    entityType,
    sourceWorkspaceId: "ws-1",
    targetWorkspaceId: "ws-2",
    timestamp: Date.now(),
  });

  const mockTask = (id: string, workspaceId: string, updatedAt: number = Date.now()): Task => ({
    id,
    workspaceId,
    title: "Test Task",
    status: "todo",
    priority: "medium",
    categoryId: "work",
    createdAt: updatedAt,
    updatedAt,
    schedule: {},
  });

  test("reconciles successfully when Target Write failed (Source exists, Target missing)", async () => {
    const entry = mockJournalEntry("task-1", "task");
    
    (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([entry]);
    
    // Target missing, Source exists
    const sourceMap = { "task-1": mockTask("task-1", "ws-1") };
    (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
      [`pebble:v1:tasks:ws-1`, JSON.stringify(sourceMap)],
      [`pebble:v1:tasks:ws-2`, null],
    ]);

    await MoveReconcilerService.reconcileAll();

    expect(AsyncStorage.multiSet).toHaveBeenCalledWith([
      [`pebble:v1:tasks:ws-1`, JSON.stringify({})],
      [`pebble:v1:tasks:ws-2`, expect.stringContaining(`"workspaceId":"ws-2"`)],
    ]);
    expect(MoveJournalRepository.removeOperationsUnlocked).toHaveBeenCalledWith([entry.operationId]);
  });

  test("reconciles successfully when Source Delete failed (Target exists, Source exists Ghost)", async () => {
    const entry = mockJournalEntry("task-2", "task");
    
    (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([entry]);
    
    const now = Date.now();
    // Both exist with identical timestamps to prevent artificial divergence
    const sourceMap = { "task-2": mockTask("task-2", "ws-1", now) };
    const targetMap = { "task-2": mockTask("task-2", "ws-2", now) };
    (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
      [`pebble:v1:tasks:ws-1`, JSON.stringify(sourceMap)],
      [`pebble:v1:tasks:ws-2`, JSON.stringify(targetMap)],
    ]);

    await MoveReconcilerService.reconcileAll();

    // Source should be deleted, target unchanged
    expect(AsyncStorage.multiSet).toHaveBeenCalledWith([
      [`pebble:v1:tasks:ws-1`, JSON.stringify({})],
      [`pebble:v1:tasks:ws-2`, JSON.stringify(targetMap)],
    ]);
    expect(MoveJournalRepository.removeOperationsUnlocked).toHaveBeenCalledWith([entry.operationId]);
  });

  test("reconcileHistoricalGhosts cleans up duplicates based on updatedAt under proper locks", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([{ id: "ws-1" }, { id: "ws-2" }]));
    
    const ghost = mockTask("task-multi", "ws-1", 100);
    const authoritative = mockTask("task-multi", "ws-2", 200);

    // Mock multiGet to first return the discovery pass, then the locked pass
    (AsyncStorage.multiGet as jest.Mock).mockResolvedValueOnce([
      [`pebble:v1:tasks:inbox`, null],
      [`pebble:v1:tasks:ws-1`, JSON.stringify({ "task-multi": ghost })],
      [`pebble:v1:tasks:ws-2`, JSON.stringify({ "task-multi": authoritative })],
    ]).mockResolvedValueOnce([
      [`pebble:v1:tasks:ws-1`, JSON.stringify({ "task-multi": ghost })],
      [`pebble:v1:tasks:ws-2`, JSON.stringify({ "task-multi": authoritative })],
    ]);

    await MoveReconcilerService.reconcileHistoricalGhosts();

    // It should have called multiSet to remove the ghost from ws-1
    expect(AsyncStorage.multiSet).toHaveBeenCalledWith([
      [`pebble:v1:tasks:ws-1`, JSON.stringify({})]
    ]);
  });

  test("reconcileHistoricalGhosts preserves data if timestamps are equal (ambiguous)", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([{ id: "ws-1" }, { id: "ws-2" }]));
    
    // Equal timestamps!
    const ghost = mockTask("task-ambig", "ws-1", 500);
    const ghost2 = mockTask("task-ambig", "ws-2", 500);

    (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
      [`pebble:v1:tasks:inbox`, null],
      [`pebble:v1:tasks:ws-1`, JSON.stringify({ "task-ambig": ghost })],
      [`pebble:v1:tasks:ws-2`, JSON.stringify({ "task-ambig": ghost2 })],
    ]);

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    await MoveReconcilerService.reconcileHistoricalGhosts();

    // Must NOT call multiSet (destructive deletion)
    expect(AsyncStorage.multiSet).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Ambiguous historical ghost"));
    
    warnSpy.mockRestore();
  });

  test("reconcileHistoricalGhosts synchronizes properly with concurrent user mutations", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([{ id: "ws-1" }, { id: "ws-2" }]));
    
    const ghost = mockTask("task-multi", "ws-1", 100);
    const authoritative = mockTask("task-multi", "ws-2", 200);

    // 1st pass: discovery
    (AsyncStorage.multiGet as jest.Mock).mockResolvedValueOnce([
      [`pebble:v1:tasks:inbox`, null],
      [`pebble:v1:tasks:ws-1`, JSON.stringify({ "task-multi": ghost })],
      [`pebble:v1:tasks:ws-2`, JSON.stringify({ "task-multi": authoritative })],
    ]);
    
    // 2nd pass: lock acquisition. We simulate a user mutation happening BEFORE the lock is acquired.
    // In a real scenario, if the user mutation happens first, the 2nd pass multiGet sees the new data.
    const userMutatedGhost = { ...ghost, title: "Mutated", updatedAt: 300 }; // Now it's newer!
    
    (AsyncStorage.multiGet as jest.Mock).mockImplementation(async (keys: string[]) => {
      if (keys.includes("pebble:v1:tasks:ws-1") && keys.length === 2) { // The locked pass
        return [
          [`pebble:v1:tasks:ws-1`, JSON.stringify({ "task-multi": userMutatedGhost })],
          [`pebble:v1:tasks:ws-2`, JSON.stringify({ "task-multi": authoritative })],
        ];
      }
      return [];
    });

    await MoveReconcilerService.reconcileHistoricalGhosts();

    // Since the ghost was mutated and now has updatedAt=300 vs 200, the ghost in ws-1 is now authoritative!
    // So the ws-2 copy should be deleted!
    expect(AsyncStorage.multiSet).toHaveBeenCalledWith([
      [`pebble:v1:tasks:ws-2`, JSON.stringify({})]
    ]);
  });

  // --- DEADLOCK REGRESSION TESTS ---

  test("Duplicate workspace IDs: deduplicates keys and prevents deadlock", async () => {
    // 1. Duplicate workspace IDs
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([
      { id: "inbox" }, // usually "inbox" is prepended, so this adds a duplicate
      { id: "ws-1" },
      { id: "ws-1" }
    ]));
    
    // We mock multiGet to return one task but since keysToFetch would have duplicates if not fixed,
    // it would return duplicates. But our code deduplicates first!
    // So keysToFetch should only be ["pebble:v1:tasks:inbox", "pebble:v1:tasks:ws-1"]
    const ghost = mockTask("task-dup", "ws-1", 100);

    (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
      [`pebble:v1:tasks:inbox`, null],
      [`pebble:v1:tasks:ws-1`, JSON.stringify({ "task-dup": ghost })],
    ]);

    await MoveReconcilerService.reconcileHistoricalGhosts();

    // Verify multiGet was called with deduplicated keys
    expect(AsyncStorage.multiGet).toHaveBeenCalledWith(
      expect.arrayContaining([
        "pebble:v1:tasks:inbox",
        "pebble:v1:tasks:ws-1"
      ])
    );
    const multiGetCalls = (AsyncStorage.multiGet as jest.Mock).mock.calls;
    const keysPassedToMultiGet = multiGetCalls[0][0];
    expect(keysPassedToMultiGet.length).toBe(2); // Only inbox and ws-1
    
    // No multiSet should be called because there's only one location
    expect(AsyncStorage.multiSet).not.toHaveBeenCalled();
  }, 5000); // Bounded timeout ensures deadlock fails the test

  test("Duplicate lock keys: withLocks deduplicates and prevents deadlock", async () => {
    // 2. Directly exercise withLocks with duplicate keys
    const task = jest.fn().mockResolvedValue(undefined);
    // We use the exported withLocks now
    const promise = withLocks(
      ["pebble:v1:tasks:inbox", "pebble:v1:tasks:inbox"],
      task
    );
    
    // If it deadlocks, this await will hang and Jest will timeout.
    await promise;

    expect(task).toHaveBeenCalled();
  }, 5000);

  test("Real duplicate across partitions: still detected and reconciled", async () => {
    // 3. Genuine entity in two DIFFERENT partitions
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([
      { id: "ws-1" },
      { id: "ws-2" }
    ]));

    const ghost = mockTask("task-real-dup", "ws-1", 100);
    const authoritative = mockTask("task-real-dup", "ws-2", 200);

    (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
      [`pebble:v1:tasks:inbox`, null],
      [`pebble:v1:tasks:ws-1`, JSON.stringify({ "task-real-dup": ghost })],
      [`pebble:v1:tasks:ws-2`, JSON.stringify({ "task-real-dup": authoritative })],
    ]);

    await MoveReconcilerService.reconcileHistoricalGhosts();

    // The real duplicate should be resolved (ghost in ws-1 deleted)
    expect(AsyncStorage.multiSet).toHaveBeenCalledWith([
      [`pebble:v1:tasks:ws-1`, JSON.stringify({})]
    ]);
  });

  test("Duplicate metadata + real duplicate combination: resolved correctly", async () => {
    // 4. Duplicate metadata PLUS a real duplicate
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([
      { id: "inbox" }, // Duplicate inbox
      { id: "ws-1" },
      { id: "ws-1" }, // Duplicate ws-1
      { id: "ws-2" }
    ]));

    const ghost = mockTask("task-combo", "ws-1", 100);
    const authoritative = mockTask("task-combo", "ws-2", 200);

    // Our multiGet mock should just return the distinct locations
    (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
      [`pebble:v1:tasks:inbox`, null],
      [`pebble:v1:tasks:ws-1`, JSON.stringify({ "task-combo": ghost })],
      [`pebble:v1:tasks:ws-2`, JSON.stringify({ "task-combo": authoritative })],
    ]);

    // If deadlock occurs, this hangs.
    await MoveReconcilerService.reconcileHistoricalGhosts();

    // Verify it ignored the duplicate metadata and just cleaned the ghost
    expect(AsyncStorage.multiSet).toHaveBeenCalledWith([
      [`pebble:v1:tasks:ws-1`, JSON.stringify({})]
    ]);
  }, 5000);

  // --- BATCH 4 FIX TESTS ---
  
  test("Move journal exists + source unchanged -> source deleted", async () => {
    const entry = mockJournalEntry("task-1", "task");
    entry.timestamp = 200; // Move intent at 200
    
    (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([entry]);
    
    // Source was last updated at 100, which is < 200. It is unchanged since intent.
    const sourceMap = { "task-1": mockTask("task-1", "ws-1", 100) };
    const targetMap = { "task-1": mockTask("task-1", "ws-2", 100) };
    (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
      [`pebble:v1:tasks:ws-1`, JSON.stringify(sourceMap)],
      [`pebble:v1:tasks:ws-2`, JSON.stringify(targetMap)],
    ]);

    await MoveReconcilerService.reconcileAll();

    expect(AsyncStorage.multiSet).toHaveBeenCalledWith([
      [`pebble:v1:tasks:ws-1`, JSON.stringify({})],
      [`pebble:v1:tasks:ws-2`, JSON.stringify(targetMap)],
    ]);
  });
  test("Move journal exists + source edited after journal timestamp -> source preserved (forwarded to target)", async () => {
    const entry = mockJournalEntry("task-edit", "task");
    entry.timestamp = 200;
    
    (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([entry]);
    
    // Source updated at 300 (after intent)
    const sourceMap = { "task-edit": mockTask("task-edit", "ws-1", 300) };
    const targetMap = { "task-edit": mockTask("task-edit", "ws-2", 200) };
    
    // Modify source title to verify it forwards
    sourceMap["task-edit"].title = "Edited Ghost";

    (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
      [`pebble:v1:tasks:ws-1`, JSON.stringify(sourceMap)],
      [`pebble:v1:tasks:ws-2`, JSON.stringify(targetMap)],
    ]);

    await MoveReconcilerService.reconcileAll();

    // The target should receive the updated ghost data, and the ghost should be deleted
    expect(AsyncStorage.multiSet).toHaveBeenCalledWith([
      [`pebble:v1:tasks:ws-1`, JSON.stringify({})],
      [`pebble:v1:tasks:ws-2`, expect.stringContaining("Edited Ghost")],
    ]);
  });
  test("Target edited post-intent, source unchanged -> target wins (Case C)", async () => {
    const entry = mockJournalEntry("task-edit-target", "task");
    entry.timestamp = 200;
    
    (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([entry]);
    
    // Target updated at 300
    const sourceMap = { "task-edit-target": mockTask("task-edit-target", "ws-1", 100) };
    const targetMap = { "task-edit-target": mockTask("task-edit-target", "ws-2", 300) };
    targetMap["task-edit-target"].title = "Target Edited";

    (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
      [`pebble:v1:tasks:ws-1`, JSON.stringify(sourceMap)],
      [`pebble:v1:tasks:ws-2`, JSON.stringify(targetMap)],
    ]);

    await MoveReconcilerService.reconcileAll();

    expect(AsyncStorage.multiSet).toHaveBeenCalledWith([
      [`pebble:v1:tasks:ws-1`, JSON.stringify({})],
      [`pebble:v1:tasks:ws-2`, expect.stringContaining("Target Edited")],
    ]);
  });

  test("BOTH edited post-intent (Split-Brain) -> forks safely (Case D)", async () => {
    const entry = mockJournalEntry("task-split", "task");
    entry.timestamp = 200;
    
    (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([entry]);
    
    // Both updated after 200
    const sourceMap = { "task-split": mockTask("task-split", "ws-1", 300) };
    const targetMap = { "task-split": mockTask("task-split", "ws-2", 300) };
    
    // Source changes title and tags
    sourceMap["task-split"].title = "Source Title";
    sourceMap["task-split"].tags = ["tag-s"];
    
    // Target changes description and tags
    targetMap["task-split"].title = "Target Title";
    targetMap["task-split"].description = "Target Desc";
    targetMap["task-split"].tags = ["tag-t"];

    (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
      [`pebble:v1:tasks:ws-1`, JSON.stringify(sourceMap)],
      [`pebble:v1:tasks:ws-2`, JSON.stringify(targetMap)],
    ]);

    await MoveReconcilerService.reconcileAll();

    expect(AsyncStorage.multiSet).toHaveBeenCalledWith([
      [`pebble:v1:tasks:ws-1`, JSON.stringify({})],
      [`pebble:v1:tasks:ws-2`, expect.any(String)],
    ]);
    
    const calls = (AsyncStorage.multiSet as jest.Mock).mock.calls[0][0];
    const targetResult = JSON.parse(calls[1][1]);
    
    const forkId = `fork-${entry.operationId}-task-split`;
    const targetTask = targetResult["task-split"];
    const forkTask = targetResult[forkId];
    
    // Check target survived untouched
    expect(targetTask.workspaceId).toBe("ws-2");
    expect(targetTask.id).toBe("task-split");
    expect(targetTask.title).toBe("Target Title");
    expect(targetTask.description).toBe("Target Desc");
    expect(targetTask.tags).toEqual(["tag-t"]);
    
    // Check fork was created properly
    expect(forkTask.id).toBe(forkId);
    expect(forkTask.workspaceId).toBe("ws-2");
    expect(forkTask.title).toBe("[Conflict] Source Title");
    expect(forkTask.tags).toEqual(["tag-s"]);
  });

  test("BOTH edited post-intent -> Notification identity cancelled and stripped from fork", async () => {
    const { cancelReminderIds } = require("@/services/scheduling/reminders.service");
    (cancelReminderIds as jest.Mock).mockClear();

    const entry = mockJournalEntry("task-split", "task");
    entry.timestamp = 200;
    
    (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([entry]);
    
    const sourceMap = { "task-split": mockTask("task-split", "ws-1", 300) };
    const targetMap = { "task-split": mockTask("task-split", "ws-2", 300) };
    
    sourceMap["task-split"].reminder = { enabled: true, triggerAt: 1000, notificationIds: ["os-1"] };
    targetMap["task-split"].reminder = { enabled: true, triggerAt: 2000, notificationIds: ["os-2"] };

    (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
      [`pebble:v1:tasks:ws-1`, JSON.stringify(sourceMap)],
      [`pebble:v1:tasks:ws-2`, JSON.stringify(targetMap)],
    ]);

    await MoveReconcilerService.reconcileAll();
    
    const calls = (AsyncStorage.multiSet as jest.Mock).mock.calls[0][0];
    const targetResult = JSON.parse(calls[1][1]);
    const forkId = `fork-${entry.operationId}-task-split`;
    
    const targetTask = targetResult["task-split"];
    const forkTask = targetResult[forkId];
    
    // Target OS notifications survive
    expect(targetTask.reminder.notificationIds).toEqual(["os-2"]);
    
    // Fork OS notifications are cancelled and stripped
    expect(cancelReminderIds).toHaveBeenCalledWith(["os-1"], { throwOnError: false });
    expect(forkTask.reminder.notificationIds).toBeUndefined();
    expect(forkTask.reminder.triggerAt).toBe(1000);
  });

  test("Multiple pending moves coalesce to the latest intent", async () => {
    const op1 = mockJournalEntry("task-seq", "task");
    op1.operationId = "op1";
    op1.targetWorkspaceId = "ws-2";
    op1.timestamp = 100;
    
    const op2 = mockJournalEntry("task-seq", "task");
    op2.operationId = "op2";
    op2.targetWorkspaceId = "ws-3"; // Latest intent!
    op2.timestamp = 200;
    
    (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([op1, op2]);
    
    const sourceMap = { "task-seq": mockTask("task-seq", "ws-1", 50) };
    
    // It should skip op1 entirely (but remove it), and process op2 directly.
    // For op2, source is ws-1 and target is ws-3.
    (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
      [`pebble:v1:tasks:ws-1`, JSON.stringify(sourceMap)],
      [`pebble:v1:tasks:ws-3`, null],
    ]);

    await MoveReconcilerService.reconcileAll();

    // Verify op1 was removed without being reconciled
    expect(MoveJournalRepository.removeOperation).toHaveBeenCalledWith("op1");
    // Verify op2 was reconciled (ws-3 received the task)
    expect(AsyncStorage.multiSet).toHaveBeenCalledWith([
      [`pebble:v1:tasks:ws-1`, JSON.stringify({})],
      [`pebble:v1:tasks:ws-3`, expect.stringContaining(`"workspaceId":"ws-3"`)],
    ]);
  });

  test("Crash before journal removal (Source deleted, Target/Fork exist) -> Idempotent, removes journal", async () => {
    const entry = mockJournalEntry("task-split", "task");
    entry.timestamp = 200;
    
    (MoveJournalRepository.getOperations as jest.Mock).mockResolvedValue([entry]);
    
    // Simulate state where source is ALREADY deleted by a previous pass
    const sourceMap = {};
    const targetMap = { 
      "task-split": mockTask("task-split", "ws-2", 300),
      [`fork-${entry.operationId}-task-split`]: mockTask(`fork-${entry.operationId}-task-split`, "ws-2", 300)
    };

    (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
      [`pebble:v1:tasks:ws-1`, JSON.stringify(sourceMap)],
      [`pebble:v1:tasks:ws-2`, JSON.stringify(targetMap)],
    ]);

    await MoveReconcilerService.reconcileAll();
    
    // Should still write back maps safely without failing or duplicating
    expect(AsyncStorage.multiSet).toHaveBeenCalledWith([
      [`pebble:v1:tasks:ws-1`, JSON.stringify({})],
      [`pebble:v1:tasks:ws-2`, JSON.stringify(targetMap)],
    ]);
    
    // And remove the journal!
    expect(MoveJournalRepository.removeOperationsUnlocked).toHaveBeenCalledWith([entry.operationId]);
  });
});
