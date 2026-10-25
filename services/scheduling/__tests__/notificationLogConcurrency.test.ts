import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  addNotificationLog,
  getNotificationLogs,
  markNotificationLogsAsRead,
  clearNotificationLogs,
  NotificationLogEntry,
} from "../notifications-log";
import { NOTIF_LOG_STORAGE_KEY } from "@/services/storage/storage.service";

// Mock AsyncStorage with asynchronous micro-delays to expose any RMW concurrency races
const store: Record<string, string> = {};

const delay = (ms: number = 2) => new Promise((resolve) => setTimeout(resolve, ms));

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async (key: string) => {
    await delay(2);
    return store[key] ?? null;
  }),
  setItem: jest.fn(async (key: string, value: string) => {
    await delay(2);
    store[key] = String(value);
    return null;
  }),
  removeItem: jest.fn(async (key: string) => {
    await delay(2);
    delete store[key];
    return null;
  }),
  clear: jest.fn(async () => {
    for (const k in store) delete store[k];
    return null;
  }),
}));

describe("Notification Log Concurrency & Integrity Regression Tests", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    for (const k in store) delete store[k];
  });

  // Test 1: Two concurrent addNotificationLog() calls preserve BOTH entries
  it("1. two concurrent addNotificationLog() calls preserve BOTH entries", async () => {
    const [entry1, entry2] = await Promise.all([
      addNotificationLog("Event 1", "Body 1", "task", "task-1"),
      addNotificationLog("Event 2", "Body 2", "habit", "habit-1"),
    ]);

    const logs = await getNotificationLogs();
    expect(logs).toHaveLength(2);

    const ids = logs.map((l) => l.id);
    expect(ids).toContain(entry1.id);
    expect(ids).toContain(entry2.id);

    const titles = logs.map((l) => l.title);
    expect(titles).toContain("Event 1");
    expect(titles).toContain("Event 2");
  });

  // Test 2: Multiple concurrent writes preserve ALL entries, subject to the 100-entry cap
  it("2. multiple concurrent writes preserve ALL entries, subject to the 100-entry cap", async () => {
    // 2a: 25 concurrent writes
    const batchCount = 25;
    const promises = Array.from({ length: batchCount }, (_, i) =>
      addNotificationLog(`Concurrent Title ${i}`, `Concurrent Body ${i}`, "task", `task-${i}`)
    );

    await Promise.all(promises);

    let logs = await getNotificationLogs();
    expect(logs).toHaveLength(batchCount);

    // 2b: Exceeding 100 entries cap (e.g. 110 total)
    const excessBatch = Array.from({ length: 90 }, (_, i) =>
      addNotificationLog(`Excess Title ${i}`, `Excess Body ${i}`)
    );

    await Promise.all(excessBatch);

    logs = await getNotificationLogs();
    // Must be capped at exactly 100 entries
    expect(logs).toHaveLength(100);
  });

  // Test 3: Newest-first ordering remains correct
  it("3. newest-first ordering remains strictly correct", async () => {
    // Sequentially add with increasing timestamps
    const first = await addNotificationLog("First", "Body 1");
    await delay(5);
    const second = await addNotificationLog("Second", "Body 2");
    await delay(5);
    const third = await addNotificationLog("Third", "Body 3");

    let logs = await getNotificationLogs();
    expect(logs[0].id).toBe(third.id);
    expect(logs[1].id).toBe(second.id);
    expect(logs[2].id).toBe(first.id);

    // Concurrent batch: newest unshifted entries appear before older entries
    const concurrentEntries = await Promise.all([
      addNotificationLog("Batch A", "A"),
      addNotificationLog("Batch B", "B"),
    ]);

    logs = await getNotificationLogs();
    expect(logs).toHaveLength(5);
    // The older entries (first, second, third) must be at the end of the list
    expect(logs[4].id).toBe(first.id);
    expect(logs[3].id).toBe(second.id);
    expect(logs[2].id).toBe(third.id);
    // The top 2 entries are from the concurrent batch
    const top2Ids = [logs[0].id, logs[1].id];
    expect(top2Ids).toContain(concurrentEntries[0].id);
    expect(top2Ids).toContain(concurrentEntries[1].id);
  });

  // Test 4: Concurrent addNotificationLog() + markNotificationLogsAsRead() cannot lose an entry
  it("4. concurrent addNotificationLog() + markNotificationLogsAsRead() cannot lose an entry", async () => {
    await addNotificationLog("Existing 1", "Body 1");
    await addNotificationLog("Existing 2", "Body 2");

    // Concurrently add a new log and mark all as read
    const [, addedEntry] = await Promise.all([
      markNotificationLogsAsRead(),
      addNotificationLog("New Incoming", "Body New"),
    ]);

    const logs = await getNotificationLogs();
    // All 3 entries must be preserved
    expect(logs).toHaveLength(3);
    expect(logs.map((l) => l.id)).toContain(addedEntry.id);

    // The existing logs must be marked as read
    const existing1 = logs.find((l) => l.title === "Existing 1");
    const existing2 = logs.find((l) => l.title === "Existing 2");
    expect(existing1?.read).toBe(true);
    expect(existing2?.read).toBe(true);
    // The new log is either read=true (if add ran before mark) or read=false (if mark ran before add)
    // but crucially it was NOT lost or corrupted.
    expect(typeof addedEntry.read).toBe("boolean");
  });

  // Test 5: Concurrent addNotificationLog() + clearNotificationLogs() follows serialized operation ordering
  it("5. concurrent addNotificationLog() + clearNotificationLogs() follows serialized ordering without corrupting storage", async () => {
    await addNotificationLog("Pre-existing", "Body");

    // Concurrently clear and add
    await Promise.all([
      clearNotificationLogs(),
      addNotificationLog("Concurrent Addition", "Body"),
    ]);

    const logs = await getNotificationLogs();
    // Depending on serialization order:
    // If clear ran first, then add: length is 1 (only Concurrent Addition exists)
    // If add ran first, then clear: length is 0 (cleared)
    // Crucially, logs is an array, storage is not corrupted, and no exception was thrown.
    expect(Array.isArray(logs)).toBe(true);
    if (logs.length === 1) {
      expect(logs[0].title).toBe("Concurrent Addition");
    } else {
      expect(logs.length).toBe(0);
    }
  });

  // Test 6: Existing single-operation behavior remains unchanged
  it("6. existing single-operation behavior remains unchanged", async () => {
    // Empty storage returns empty array
    const initial = await getNotificationLogs();
    expect(initial).toEqual([]);

    // Adding an entry returns entry with correct fields
    const beforeTime = Date.now();
    const entry = await addNotificationLog("Task Due", "Buy groceries", "reminder", "task-999");
    const afterTime = Date.now();

    expect(entry.id).toMatch(/^log-\d+-[a-z0-9]+$/);
    expect(entry.title).toBe("Task Due");
    expect(entry.body).toBe("Buy groceries");
    expect(entry.type).toBe("reminder");
    expect(entry.itemId).toBe("task-999");
    expect(entry.read).toBe(false);
    expect(entry.timestamp).toBeGreaterThanOrEqual(beforeTime);
    expect(entry.timestamp).toBeLessThanOrEqual(afterTime);

    // getNotificationLogs returns this entry
    const logsAfterAdd = await getNotificationLogs();
    expect(logsAfterAdd).toEqual([entry]);

    // markNotificationLogsAsRead marks read: true
    await markNotificationLogsAsRead();
    const logsAfterRead = await getNotificationLogs();
    expect(logsAfterRead[0].read).toBe(true);

    // clearNotificationLogs removes all
    await clearNotificationLogs();
    const logsAfterClear = await getNotificationLogs();
    expect(logsAfterClear).toEqual([]);
  });

  // Test 7: Corrupt/empty storage behavior remains unchanged
  it("7. corrupt/empty storage behavior safely recovers without crashing", async () => {
    // 7a: Null / empty raw storage
    delete store[NOTIF_LOG_STORAGE_KEY];
    expect(await getNotificationLogs()).toEqual([]);

    // 7b: Invalid JSON syntax
    store[NOTIF_LOG_STORAGE_KEY] = "{ corrupt invalid json";
    expect(await getNotificationLogs()).toEqual([]);

    // 7c: Valid JSON but not an array (e.g. object or number)
    store[NOTIF_LOG_STORAGE_KEY] = JSON.stringify({ notAnArray: true });
    expect(await getNotificationLogs()).toEqual([]);

    store[NOTIF_LOG_STORAGE_KEY] = "12345";
    expect(await getNotificationLogs()).toEqual([]);

    // 7d: addNotificationLog on corrupt storage recovers gracefully
    store[NOTIF_LOG_STORAGE_KEY] = "malformed-garbage";
    const recoveredEntry = await addNotificationLog("Recovered", "Recovered Body");
    const logs = await getNotificationLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].id).toBe(recoveredEntry.id);

    // 7e: markNotificationLogsAsRead on corrupt storage recovers gracefully
    store[NOTIF_LOG_STORAGE_KEY] = "malformed-garbage";
    await expect(markNotificationLogsAsRead()).resolves.not.toThrow();
  });
});
