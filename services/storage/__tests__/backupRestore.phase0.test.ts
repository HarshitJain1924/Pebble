import AsyncStorage from "@react-native-async-storage/async-storage";
import { BackupService, type AppBackup } from "@/services/storage/backup.service";
import { clearRepositoryStorage } from "@/services/storage/storage-utils";
import type { Workspace, Task } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

const storage = AsyncStorage as typeof AsyncStorage;
const workspace: Workspace = { id: "ws-a", name: "A", createdAt: 1, updatedAt: 1 };
const task: Task = { id: "task-a", workspaceId: "ws-a", title: "A", status: "todo", priority: "none", createdAt: 1, updatedAt: 1 };
const backup = (): AppBackup => ({
  version: 1,
  timestamp: 1,
  workspaces: [workspace],
  tasks: [task],
  habits: [{ id: "habit-a", workspaceId: "ws-a", title: "H", createdAt: 1, updatedAt: 1 } as any],
  checklists: [{ id: "checklist-a", workspaceId: "ws-a", title: "C", items: [], createdAt: 1, updatedAt: 1 } as any],
  resources: [{ id: "resource-a", workspaceId: "ws-a", title: "R", url: "https://example.com", createdAt: 1, updatedAt: 1 } as any],
  recycleBin: [{ id: "recycle-a", entityId: "task-a", entityType: "task", workspaceId: "ws-a", deletedAt: 1, originalData: task } as any],
  focusSessions: [{ id: "focus-a", startedAt: 1, endedAt: 2 } as any],
  relationships: [{ sourceId: "task-a", targetId: "resource-a", type: "uses" } as any],
  systemEvents: [{ id: "event-a", type: "test", timestamp: 1 } as any],
  settings: undefined,
  profile: undefined,
});

beforeEach(async () => {
  jest.restoreAllMocks();
  await storage.clear();
  await storage.setItem("pebble:v1:tasks:ws-old", JSON.stringify({ old: task }));
  await storage.setItem("todoapp:onboarding_completed", "true");
});

describe("Phase 0 structured restore", () => {
  it("validates malformed backup before deleting storage", async () => {
    const removeSpy = jest.spyOn(storage, "multiRemove");
    await expect(BackupService.restoreStructuredBackup(JSON.stringify({ version: 1 }))).rejects.toThrow("Invalid backup format");
    expect(removeSpy).not.toHaveBeenCalled();
    expect(await storage.getItem("pebble:v1:tasks:ws-old")).not.toBeNull();
  });

  test("preserves onboarding on successful content restore", async () => {
    await BackupService.restoreStructuredBackup(JSON.stringify(backup()));
    expect(await storage.getItem("todoapp:onboarding_completed")).toBe("true");
  });

  test.each(["workspace", "task", "habit", "checklist", "resource", "recycle", "focus", "relationship", "system-event"])("preserves the previous dataset if restore fails at %s write", async (boundary) => {
    let hasThrown = false;
    const originalMultiSetImpl = (storage.multiSet as jest.Mock).getMockImplementation();
    
    const multiSetSpy = jest.spyOn(storage, "multiSet").mockImplementation(async (keyValuePairs) => {
      const boundaryHits = keyValuePairs.some(([key]) => 
        boundary === "workspace" ? key === "pebble:v1:workspaces" : 
        boundary === "task" ? key.includes(":tasks:") : 
        boundary === "habit" ? key.includes(":habits:") : 
        boundary === "checklist" ? key.includes(":checklists:") : 
        boundary === "resource" ? key.includes(":resources:") : 
        boundary === "recycle" ? key === "pebble:v1:recycle_bin" : 
        boundary === "focus" ? key === "pebble:v1:focus_sessions" : 
        boundary === "relationship" ? key === "pebble:v1:relationships" : 
        key === "pebble:v1:system_event_log"
      );
      
      if (boundaryHits && !hasThrown) {
        hasThrown = true;
        throw new Error(`injected ${boundary}`);
      }
      
      if (originalMultiSetImpl) {
        return originalMultiSetImpl(keyValuePairs);
      }
    });
    
    await expect(BackupService.restoreStructuredBackup(JSON.stringify(backup()))).rejects.toThrow(`injected ${boundary}`);
    expect(multiSetSpy).toHaveBeenCalled();
    expect(await storage.getItem("pebble:v1:tasks:ws-old")).not.toBeNull();
  });
});

test("clearRepositoryStorage preserves onboarding state during content restore", async () => {
  await clearRepositoryStorage();
  expect(await storage.getItem("todoapp:onboarding_completed")).toBe("true");
});

