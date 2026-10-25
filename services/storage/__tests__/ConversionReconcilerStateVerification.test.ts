import { ConversionReconcilerService } from "../ConversionReconcilerService";
import { HabitRepository, TaskRepository } from "@/repositories";
import { ConversionJournalRepository } from "@/repositories/ConversionJournalRepository";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { generateEntityFingerprint } from "@/shared/utils/fingerprint";
import { normalizeTask } from "@/repositories/TaskRepository";
import { normalizeHabit } from "@/repositories/HabitRepository";
import { withLocks } from "@/shared/utils/mutex";

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

describe("Conversion State Machine Deterministic Identity Verification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.clear();
  });

  const setupMockData = (habitOverrides: any = {}, taskOverrides: any = {}, journalOverrides: any = {}) => {
    const habit = {
      id: "habit-1",
      workspaceId: "ws-1",
      title: "My Habit",
      createdAt: 1000,
      updatedAt: 1000,
      revision: 1,
      ...habitOverrides
    };
    
    const task = {
      id: "task-1",
      workspaceId: "ws-1",
      title: "My Habit",
      createdAt: 2000,
      updatedAt: 2000,
      revision: 1,
      ...taskOverrides
    };

    if (habitOverrides === null) {
        mockStore.set("pebble:v1:habits:ws-1", JSON.stringify({}));
    } else {
        const h = { ...habit, ...habitOverrides };
        mockStore.set("pebble:v1:habits:ws-1", JSON.stringify({ "habit-1": h }));
    }

    if (taskOverrides === null) {
        mockStore.set("pebble:v1:tasks:ws-1", JSON.stringify({}));
    } else {
        const t = { ...task, ...taskOverrides };
        mockStore.set("pebble:v1:tasks:ws-1", JSON.stringify({ "task-1": t }));
    }

    mockStore.set("pebble:v1:conversion_journal", JSON.stringify([{
      operationId: "op-1",
      operationType: "habit_to_task",
      sourceId: "habit-1",
      sourceWorkspaceId: "ws-1",
      targetId: "task-1",
      targetWorkspaceId: "ws-1",
      phase: "PREPARED",
      timestamp: 2000,
      sourceRevision: 1, // original revision
      targetCreatedAt: 2000, // exact time target was created
      targetFingerprint: generateEntityFingerprint(normalizeTask(task, "ws-1")),
      ...journalOverrides
    }]));
  };

  test("SCENARIO 1: Source exists but was mutated (revision incremented) -> Preserve source", async () => {
    // Habit was edited after conversion, revision bumped to 2
    setupMockData({ revision: 2 }, {});
    await ConversionReconcilerService.reconcileAll();

    const habitsMap = JSON.parse(mockStore.get("pebble:v1:habits:ws-1") || "{}");
    const tasksMap = JSON.parse(mockStore.get("pebble:v1:tasks:ws-1") || "{}");

    // Both survive
    expect(habitsMap["habit-1"]).toBeDefined();
    expect(tasksMap["task-1"]).toBeDefined();
    
    const journalMap = JSON.parse(mockStore.get("pebble:v1:conversion_journal") || "[]");
    expect(journalMap.length).toBe(0);
  });

  test("SCENARIO 2: Target replaced with unrelated entity (createdAt mismatch) -> Preserve source", async () => {
    // Task was recycled, and user happened to create a new task with same ID (simulated).
    // The new task has a different createdAt.
    setupMockData({}, { createdAt: 9999 });
    await ConversionReconcilerService.reconcileAll();

    const habitsMap = JSON.parse(mockStore.get("pebble:v1:habits:ws-1") || "{}");
    expect(habitsMap["habit-1"]).toBeDefined(); // Source safely preserved
    
    const journalMap = JSON.parse(mockStore.get("pebble:v1:conversion_journal") || "[]");
    expect(journalMap.length).toBe(0);
  });

  test("SCENARIO 2B (NEW FINGERPRINT PROOF): Target payload modified but metadata unchanged -> Preserve source", async () => {
    // Proves weakness of the old targetCreatedAt mechanism:
    // If a different payload has the exact same targetId and createdAt, the old logic would
    // blindly delete the source. The new fingerprint catches the payload mismatch.
    setupMockData({}, {}); // default sets up matching journal fingerprint based on default payload
    
    // Now we secretly mutate the target payload in storage without changing the journal's expected fingerprint
    const tasksMap = JSON.parse(mockStore.get("pebble:v1:tasks:ws-1") || "{}");
    tasksMap["task-1"].title = "Different Title Entirely";
    mockStore.set("pebble:v1:tasks:ws-1", JSON.stringify(tasksMap));

    await ConversionReconcilerService.reconcileAll();

    const habitsMap = JSON.parse(mockStore.get("pebble:v1:habits:ws-1") || "{}");
    expect(habitsMap["habit-1"]).toBeDefined(); // Source safely preserved because fingerprint caught it!
    
    const journalMap = JSON.parse(mockStore.get("pebble:v1:conversion_journal") || "[]");
    expect(journalMap.length).toBe(0);
  });

  test("SCENARIO 3: Both entities match identity perfectly -> Roll forward (Delete source)", async () => {
    setupMockData({}, {}); // default: revision 1, createdAt matches exactly
    await ConversionReconcilerService.reconcileAll();

    const habitsMap = JSON.parse(mockStore.get("pebble:v1:habits:ws-1") || "{}");
    const tasksMap = JSON.parse(mockStore.get("pebble:v1:tasks:ws-1") || "{}");

    // Source is DELETED
    expect(habitsMap["habit-1"]).toBeUndefined();
    // Target is PRESERVED
    expect(tasksMap["task-1"]).toBeDefined();
    
    const journalMap = JSON.parse(mockStore.get("pebble:v1:conversion_journal") || "[]");
    expect(journalMap.length).toBe(0);
  });

  test("SCENARIO 4: Target missing -> Roll back (Preserve source)", async () => {
    setupMockData({}, null); // task is completely missing
    await ConversionReconcilerService.reconcileAll();

    const habitsMap = JSON.parse(mockStore.get("pebble:v1:habits:ws-1") || "{}");
    // Source is PRESERVED
    expect(habitsMap["habit-1"]).toBeDefined();
    
    const journalMap = JSON.parse(mockStore.get("pebble:v1:conversion_journal") || "[]");
    expect(journalMap.length).toBe(0);
  });
  
  test("SCENARIO 5: Target missing but Journal says DESTINATION_WRITTEN -> Roll back safely", async () => {
    setupMockData({}, null, { phase: "DESTINATION_WRITTEN" }); // target write lost
    await ConversionReconcilerService.reconcileAll();

    const habitsMap = JSON.parse(mockStore.get("pebble:v1:habits:ws-1") || "{}");
    // Source is PRESERVED
    expect(habitsMap["habit-1"]).toBeDefined();
    
    const journalMap = JSON.parse(mockStore.get("pebble:v1:conversion_journal") || "[]");
    expect(journalMap.length).toBe(0);
  });

  test("SCENARIO 6: Both missing -> Safe Uncertainty Handling (Remove Journal)", async () => {
    setupMockData(null, null); // Both missing
    await ConversionReconcilerService.reconcileAll();
    
    const journalMap = JSON.parse(mockStore.get("pebble:v1:conversion_journal") || "[]");
    expect(journalMap.length).toBe(0);
  });
});
