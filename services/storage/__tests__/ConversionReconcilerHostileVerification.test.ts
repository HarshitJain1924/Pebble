/**
 * ConversionReconcilerHostileVerification.test.ts
 * Covers both habit_to_task and task_to_habit full recovery matrices.
 */

import { ConversionReconcilerService } from "../ConversionReconcilerService";
import { HabitRepository, TaskRepository } from "@/repositories";
import { ConversionJournalRepository } from "@/repositories/ConversionJournalRepository";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { generateEntityFingerprint } from "@/shared/utils/fingerprint";
import { normalizeTask } from "@/repositories/TaskRepository";
import { normalizeHabit } from "@/repositories/HabitRepository";

const mockStore = new Map<string, string>();

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

(AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => mockStore.get(key) || null);
(AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => mockStore.set(key, value));
(AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => mockStore.delete(key));
(AsyncStorage.multiGet as jest.Mock).mockImplementation(async (keys: string[]) => keys.map(k => [k, mockStore.get(k) || null]));

const BASE_HABIT = {
  id: "habit-1", workspaceId: "ws-1", title: "Wake up at 6am", description: "Morning routine",
  categoryId: "health", createdAt: 1_000_000, updatedAt: 1_000_000, revision: 1,
  recurrence: { frequency: "daily", interval: 1 }, completionHistory: [],
};

const BASE_TASK = {
  id: "task-1", workspaceId: "ws-1", title: "Wake up at 6am", description: "Morning routine",
  categoryId: "health", status: "todo", priority: "medium",
  createdAt: 2_000_000, updatedAt: 2_000_000, revision: 1,
};

const taskFingerprint  = () => generateEntityFingerprint(normalizeTask(BASE_TASK, "ws-1"));
const habitFingerprint = () => generateEntityFingerprint(normalizeHabit(BASE_HABIT, "ws-1"));

function setHabit(h: any | null) {
  mockStore.set("pebble:v1:habits:ws-1", JSON.stringify(h === null ? {} : { [h.id]: h }));
}
function setTask(t: any | null) {
  mockStore.set("pebble:v1:tasks:ws-1", JSON.stringify(t === null ? {} : { [t.id]: t }));
}
function setJournal(entry: any) {
  mockStore.set("pebble:v1:conversion_journal", JSON.stringify([entry]));
}
function h2tJournal(overrides: any = {}) {
  setJournal({
    operationId: "op-h2t", operationType: "habit_to_task",
    sourceId: "habit-1", sourceWorkspaceId: "ws-1",
    targetId: "task-1",  targetWorkspaceId: "ws-1",
    phase: "PREPARED", timestamp: 2_000_000,
    sourceRevision: BASE_HABIT.revision,
    targetCreatedAt: BASE_TASK.createdAt,
    targetFingerprint: taskFingerprint(),
    ...overrides,
  });
}
function t2hJournal(overrides: any = {}) {
  setJournal({
    operationId: "op-t2h", operationType: "task_to_habit",
    sourceId: "task-1", sourceWorkspaceId: "ws-1",
    targetId: "habit-1", targetWorkspaceId: "ws-1",
    phase: "PREPARED", timestamp: 2_000_000,
    sourceRevision: BASE_TASK.revision,
    targetCreatedAt: BASE_HABIT.createdAt,
    targetFingerprint: habitFingerprint(),
    ...overrides,
  });
}
function journal() { return JSON.parse(mockStore.get("pebble:v1:conversion_journal") || "[]"); }
function habits()  { return JSON.parse(mockStore.get("pebble:v1:habits:ws-1")  || "{}"); }
function tasks()   { return JSON.parse(mockStore.get("pebble:v1:tasks:ws-1")   || "{}"); }

describe("Habit -> Task recovery matrix", () => {
  beforeEach(() => { jest.clearAllMocks(); mockStore.clear(); });

  test("A. Exact intended destination -> source deleted", async () => {
    setHabit(BASE_HABIT); setTask(BASE_TASK); h2tJournal();
    await ConversionReconcilerService.reconcileAll();
    expect(habits()["habit-1"]).toBeUndefined();
    expect(tasks()["task-1"]).toBeDefined();
    expect(journal()).toHaveLength(0);
  });

  test("B. Same targetId but different createdAt -> source preserved", async () => {
    setHabit(BASE_HABIT); setTask({ ...BASE_TASK, createdAt: 9_999_999 }); h2tJournal();
    await ConversionReconcilerService.reconcileAll();
    expect(habits()["habit-1"]).toBeDefined();
    expect(journal()).toHaveLength(0);
  });

  test("C. Same createdAt but different payload -> fingerprint catches it, source preserved", async () => {
    setHabit(BASE_HABIT); setTask({ ...BASE_TASK, title: "Impostor entity" }); h2tJournal();
    await ConversionReconcilerService.reconcileAll();
    expect(habits()["habit-1"]).toBeDefined();
    expect(journal()).toHaveLength(0);
  });

  test("D. Target mutated post-conversion -> source preserved", async () => {
    setHabit(BASE_HABIT); setTask({ ...BASE_TASK, title: "User-edited", updatedAt: 3_000_000 }); h2tJournal();
    await ConversionReconcilerService.reconcileAll();
    expect(habits()["habit-1"]).toBeDefined();
    expect(journal()).toHaveLength(0);
  });

  test("E. Source revision bumped -> source preserved", async () => {
    setHabit({ ...BASE_HABIT, revision: 2 }); setTask(BASE_TASK); h2tJournal();
    await ConversionReconcilerService.reconcileAll();
    expect(habits()["habit-1"]).toBeDefined();
    expect(journal()).toHaveLength(0);
  });

  test("F. Destination missing, source exists -> source preserved (rollback)", async () => {
    setHabit(BASE_HABIT); setTask(null); h2tJournal();
    await ConversionReconcilerService.reconcileAll();
    expect(habits()["habit-1"]).toBeDefined();
    expect(journal()).toHaveLength(0);
  });

  test("F2. DESTINATION_WRITTEN phase but target missing -> source preserved", async () => {
    setHabit(BASE_HABIT); setTask(null); h2tJournal({ phase: "DESTINATION_WRITTEN" });
    await ConversionReconcilerService.reconcileAll();
    expect(habits()["habit-1"]).toBeDefined();
    expect(journal()).toHaveLength(0);
  });

  test("G. Both missing -> safe uncertainty (journal removed)", async () => {
    setHabit(null); setTask(null); h2tJournal();
    await ConversionReconcilerService.reconcileAll();
    expect(journal()).toHaveLength(0);
  });

  test("H. Crash after destination write, journal still PREPARED, both present -> roll forward", async () => {
    setHabit(BASE_HABIT); setTask(BASE_TASK); h2tJournal({ phase: "PREPARED" });
    await ConversionReconcilerService.reconcileAll();
    expect(habits()["habit-1"]).toBeUndefined();
    expect(tasks()["task-1"]).toBeDefined();
    expect(journal()).toHaveLength(0);
  });

  test("I. Crash after source deletion, target only present -> journal cleaned up", async () => {
    setHabit(null); setTask(BASE_TASK); h2tJournal({ phase: "DESTINATION_WRITTEN" });
    await ConversionReconcilerService.reconcileAll();
    expect(habits()["habit-1"]).toBeUndefined();
    expect(tasks()["task-1"]).toBeDefined();
    expect(journal()).toHaveLength(0);
  });

  test("J. Repeated reconciliation is idempotent", async () => {
    setHabit(BASE_HABIT); setTask(BASE_TASK); h2tJournal();
    await ConversionReconcilerService.reconcileAll();
    await ConversionReconcilerService.reconcileAll();
    await ConversionReconcilerService.reconcileAll();
    expect(habits()["habit-1"]).toBeUndefined();
    expect(tasks()["task-1"]).toBeDefined();
    expect(journal()).toHaveLength(0);
  });
});

describe("Task -> Habit recovery matrix", () => {
  beforeEach(() => { jest.clearAllMocks(); mockStore.clear(); });

  test("A. Exact intended destination -> source deleted", async () => {
    setTask(BASE_TASK); setHabit(BASE_HABIT); t2hJournal();
    await ConversionReconcilerService.reconcileAll();
    expect(tasks()["task-1"]).toBeUndefined();
    expect(habits()["habit-1"]).toBeDefined();
    expect(journal()).toHaveLength(0);
  });

  test("B. Same targetId but different createdAt -> source preserved", async () => {
    setTask(BASE_TASK); setHabit({ ...BASE_HABIT, createdAt: 9_999_999 }); t2hJournal();
    await ConversionReconcilerService.reconcileAll();
    expect(tasks()["task-1"]).toBeDefined();
    expect(journal()).toHaveLength(0);
  });

  test("C. Same createdAt but different payload -> fingerprint catches it, source preserved", async () => {
    setTask(BASE_TASK); setHabit({ ...BASE_HABIT, title: "Impostor habit" }); t2hJournal();
    await ConversionReconcilerService.reconcileAll();
    expect(tasks()["task-1"]).toBeDefined();
    expect(journal()).toHaveLength(0);
  });

  test("D. Target mutated post-conversion -> source preserved", async () => {
    setTask(BASE_TASK); setHabit({ ...BASE_HABIT, title: "Edited", updatedAt: 5_000_000 }); t2hJournal();
    await ConversionReconcilerService.reconcileAll();
    expect(tasks()["task-1"]).toBeDefined();
    expect(journal()).toHaveLength(0);
  });

  test("E. Source revision bumped -> source preserved", async () => {
    setTask({ ...BASE_TASK, revision: 2 }); setHabit(BASE_HABIT); t2hJournal();
    await ConversionReconcilerService.reconcileAll();
    expect(tasks()["task-1"]).toBeDefined();
    expect(journal()).toHaveLength(0);
  });

  test("F. Destination missing, source exists -> source preserved (rollback)", async () => {
    setTask(BASE_TASK); setHabit(null); t2hJournal();
    await ConversionReconcilerService.reconcileAll();
    expect(tasks()["task-1"]).toBeDefined();
    expect(journal()).toHaveLength(0);
  });

  test("F2. DESTINATION_WRITTEN but target missing -> source preserved", async () => {
    setTask(BASE_TASK); setHabit(null); t2hJournal({ phase: "DESTINATION_WRITTEN" });
    await ConversionReconcilerService.reconcileAll();
    expect(tasks()["task-1"]).toBeDefined();
    expect(journal()).toHaveLength(0);
  });

  test("G. Both missing -> safe uncertainty (journal removed)", async () => {
    setTask(null); setHabit(null); t2hJournal();
    await ConversionReconcilerService.reconcileAll();
    expect(journal()).toHaveLength(0);
  });

  test("H. Crash after destination write, PREPARED, both present -> roll forward", async () => {
    setTask(BASE_TASK); setHabit(BASE_HABIT); t2hJournal({ phase: "PREPARED" });
    await ConversionReconcilerService.reconcileAll();
    expect(tasks()["task-1"]).toBeUndefined();
    expect(habits()["habit-1"]).toBeDefined();
    expect(journal()).toHaveLength(0);
  });

  test("I. Crash after source deletion, target only present -> journal cleaned up", async () => {
    setTask(null); setHabit(BASE_HABIT); t2hJournal({ phase: "DESTINATION_WRITTEN" });
    await ConversionReconcilerService.reconcileAll();
    expect(tasks()["task-1"]).toBeUndefined();
    expect(habits()["habit-1"]).toBeDefined();
    expect(journal()).toHaveLength(0);
  });

  test("J. Repeated reconciliation is idempotent", async () => {
    setTask(BASE_TASK); setHabit(BASE_HABIT); t2hJournal();
    await ConversionReconcilerService.reconcileAll();
    await ConversionReconcilerService.reconcileAll();
    await ConversionReconcilerService.reconcileAll();
    expect(tasks()["task-1"]).toBeUndefined();
    expect(habits()["habit-1"]).toBeDefined();
    expect(journal()).toHaveLength(0);
  });
});

describe("K. Proof that targetCreatedAt alone was insufficient", () => {
  beforeEach(() => { jest.clearAllMocks(); mockStore.clear(); });

  test("K1 (habit->task): same targetId + same createdAt but unrelated payload -> fingerprint saves source", async () => {
    const impostor = {
      id: "task-1", workspaceId: "ws-1",
      title: "Totally unrelated entity", description: "Not from conversion",
      status: "todo", priority: "high", categoryId: "finance",
      createdAt: BASE_TASK.createdAt, // identical createdAt — old check would PASS
      updatedAt: BASE_TASK.createdAt, revision: 1,
    };
    setHabit(BASE_HABIT);
    setTask(impostor);
    h2tJournal({
      targetCreatedAt: BASE_TASK.createdAt,  // passes old createdAt check
      targetFingerprint: taskFingerprint(),   // fingerprint of REAL BASE_TASK — differs from impostor
    });

    await ConversionReconcilerService.reconcileAll();

    expect(habits()["habit-1"]).toBeDefined(); // source preserved — impostor detected
    expect(tasks()["task-1"].title).toBe("Totally unrelated entity"); // impostor untouched
    expect(journal()).toHaveLength(0);
  });

  test("K2 (task->habit): same targetId + same createdAt but unrelated payload -> fingerprint saves source", async () => {
    const impostor = {
      id: "habit-1", workspaceId: "ws-1",
      title: "Totally unrelated habit", description: "Not from conversion",
      createdAt: BASE_HABIT.createdAt, // identical — old check would PASS
      updatedAt: BASE_HABIT.createdAt, revision: 1,
      recurrence: { frequency: "weekly", interval: 99 }, // completely different
      completionHistory: [],
    };
    setTask(BASE_TASK);
    setHabit(impostor);
    t2hJournal({
      targetCreatedAt: BASE_HABIT.createdAt,  // passes old createdAt check
      targetFingerprint: habitFingerprint(),   // fingerprint of REAL BASE_HABIT — differs from impostor
    });

    await ConversionReconcilerService.reconcileAll();

    expect(tasks()["task-1"]).toBeDefined(); // source preserved — impostor detected
    expect(habits()["habit-1"].title).toBe("Totally unrelated habit"); // impostor untouched
    expect(journal()).toHaveLength(0);
  });
});
