import { TaskRepository } from "@/repositories/TaskRepository";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { withLock } from "@/shared/utils/mutex";

jest.mock("@react-native-async-storage/async-storage", () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
  getAllKeys: jest.fn(),
}));

// Mock scheduling so we don't try to invoke native OS modules
jest.mock("@/services/scheduling/reminders.service", () => ({
  scheduleTaskNotifications: jest.fn().mockResolvedValue(["mock-os-id-1"]),
  rescheduleTodoReminders: jest.fn(async (task) => task),
  cancelReminderIds: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/shared/utils/mutex", () => ({
  withLock: jest.fn((key, fn) => fn()),
}));

describe("Targeted System Writes (Concurrency Safety)", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage = {};
    
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => mockStorage[key] || null);
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string) => {
      mockStorage[key] = val;
    });
  });

  const setupTask = async (id: string, title: string, wsId: string, timestamp: number) => {
    const key = `pebble:v1:tasks:${wsId}`;
    mockStorage[key] = JSON.stringify({
      [id]: {
        id,
        workspaceId: wsId,
        title,
        updatedAt: timestamp,
        status: "todo",
        reminder: { enabled: true, triggerAt: timestamp + 1000, notificationIds: ["old-id"] }
      }
    });
  };

  it("1. System update after user edit: preserves user edits and user timestamp", async () => {
    await setupTask("t1", "Original Title", "ws1", 1000);

    // User edits the task
    const userTask = {
      id: "t1",
      workspaceId: "ws1",
      title: "New User Title",
      status: "todo",
    };
    
    // We expect saveTask to advance updatedAt to the current time.
    jest.spyOn(Date, "now").mockReturnValue(2000);
    await TaskRepository.saveTask(userTask);

    // Verify user edit
    const records1 = JSON.parse(mockStorage[`pebble:v1:tasks:ws1`]);
    expect(records1["t1"].title).toBe("New User Title");
    expect(records1["t1"].updatedAt).toBe(2000);

    // System update runs
    jest.spyOn(Date, "now").mockReturnValue(3000);
    const result = await TaskRepository.updateNotificationIds("t1", "ws1", ["new-id-1"]);
    
    expect(result).toBe("updated");

    // Verify final state
    const records2 = JSON.parse(mockStorage[`pebble:v1:tasks:ws1`]);
    const finalTask = records2["t1"];
    
    // System update MUST NOT overwrite the title
    expect(finalTask.title).toBe("New User Title");
    // System update MUST NOT advance updatedAt (must stay at user edit time)
    expect(finalTask.updatedAt).toBe(2000);
    // System update MUST apply the new IDs
    expect(finalTask.reminder.notificationIds).toEqual(["new-id-1"]);
  });

  it("2. Concurrent user edit during pending system update: user edit survives", async () => {
    await setupTask("t2", "Original", "ws1", 1000);

    // To simulate a race, we will intercept the AsyncStorage.getItem inside updateNotificationIds
    // and fire off a concurrent user save BEFORE the system update gets to setItem.
    
    let isSystemUpdateRunning = false;
    
    const originalGetItem = AsyncStorage.getItem as jest.Mock;
    originalGetItem.mockImplementation(async (key: string) => {
      const data = mockStorage[key] || null;
      
      if (key === "pebble:v1:tasks:ws1" && isSystemUpdateRunning) {
        // While the system update is loading the entity, a concurrent user edit arrives.
        // We mutate the mockStorage synchronously.
        mockStorage[key] = JSON.stringify({
          "t2": {
            id: "t2",
            workspaceId: "ws1",
            title: "Concurrent Title",
            updatedAt: 2000,
            status: "todo",
            reminder: { enabled: true, triggerAt: 2000, notificationIds: ["old-id"] }
          }
        });
        
        // Return the mutated storage to the system update so it reads the FRESH state
        return mockStorage[key];
      }
      
      return data;
    });

    isSystemUpdateRunning = true;
    jest.spyOn(Date, "now").mockReturnValue(3000);
    await TaskRepository.updateNotificationIds("t2", "ws1", ["new-id-2"]);
    isSystemUpdateRunning = false;

    // Verify final state
    const records = JSON.parse(mockStorage[`pebble:v1:tasks:ws1`]);
    const finalTask = records["t2"];
    
    // The user's concurrent title must survive
    expect(finalTask.title).toBe("Concurrent Title");
    // The user's concurrent timestamp must survive
    expect(finalTask.updatedAt).toBe(2000);
    // The system's new IDs must be applied
    expect(finalTask.reminder.notificationIds).toEqual(["new-id-2"]);
  });

  it("3. Entity moved before notification repair: safely returns not_found without resurrecting ghost", async () => {
    // Task moved to ws2, so ws1 no longer has it.
    mockStorage["pebble:v1:tasks:ws1"] = JSON.stringify({});
    
    const result = await TaskRepository.updateNotificationIds("t3", "ws1", ["stale-id"]);
    
    expect(result).toBe("not_found");
    
    // It should not have recreated the task in ws1
    const records = JSON.parse(mockStorage[`pebble:v1:tasks:ws1`]);
    expect(records["t3"]).toBeUndefined();
  });

  it("4. Entity deleted before notification repair: safely returns not_found", async () => {
    mockStorage["pebble:v1:tasks:ws1"] = JSON.stringify({});
    const result = await TaskRepository.updateNotificationIds("t4", "ws1", ["stale-id"]);
    expect(result).toBe("not_found");
  });

  it("5. Repeated system repair: idempotent, no timestamp drift", async () => {
    await setupTask("t5", "Title", "ws1", 1000);

    // Pass 1
    await TaskRepository.updateNotificationIds("t5", "ws1", ["id-1"]);
    const r1 = JSON.parse(mockStorage[`pebble:v1:tasks:ws1`])["t5"];
    expect(r1.updatedAt).toBe(1000);

    // Pass 2
    await TaskRepository.updateNotificationIds("t5", "ws1", ["id-1"]);
    const r2 = JSON.parse(mockStorage[`pebble:v1:tasks:ws1`])["t5"];
    expect(r2.updatedAt).toBe(1000);
    expect(r2.reminder.notificationIds).toEqual(["id-1"]);
  });
});
