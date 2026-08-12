import AsyncStorage from "@react-native-async-storage/async-storage";
import { BackupService } from "@/services/storage/backup.service";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

describe("Backup System Verification", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("should successfully export multiple dynamic workspace keys in a structured format", async () => {
    await AsyncStorage.setItem("pebble:v1:workspaces", JSON.stringify([
      { id: "ws-1" },
      { id: "ws-2" },
      { id: "ws-3" },
      { id: "ws-4" },
    ]));
    await AsyncStorage.setItem("pebble:v1:tasks:ws-1", JSON.stringify({ "task-1": { id: "task-1", title: "Test", workspaceId: "ws-1" } }));
    await AsyncStorage.setItem("pebble:v1:habits:ws-2", JSON.stringify({ "habit-1": { id: "habit-1", title: "Test", workspaceId: "ws-2" } }));
    await AsyncStorage.setItem("pebble:v1:checklists:ws-3", JSON.stringify({ "checklist-1": { id: "checklist-1", title: "Test", workspaceId: "ws-3" } }));
    await AsyncStorage.setItem("pebble:v1:resources:ws-4", JSON.stringify({ "resource-1": { id: "resource-1", title: "Test", workspaceId: "ws-4" } }));
    await AsyncStorage.setItem("random:unrelated:key", "ignore-me");

    const exportedString = await BackupService.generateStructuredBackup();
    const backupData = JSON.parse(exportedString);

    expect(backupData.version).toBe(1);
    expect(backupData.workspaces).toHaveLength(4);
    expect(backupData.workspaces[0].id).toBe("ws-1");

    expect(backupData.tasks).toHaveLength(1);
    expect(backupData.tasks[0].id).toBe("task-1");

    expect(backupData.habits).toHaveLength(1);
    expect(backupData.habits[0].id).toBe("habit-1");

    expect(backupData.checklists).toHaveLength(1);
    expect(backupData.resources).toHaveLength(1);
  });

  it("should fail gracefully on malformed payload", async () => {
    await expect(BackupService.restoreStructuredBackup("not json")).rejects.toThrow();
    await expect(BackupService.restoreStructuredBackup("[]")).rejects.toThrow();
    await expect(BackupService.restoreStructuredBackup(JSON.stringify({ "unrelated": "data" }))).rejects.toThrow("Invalid backup format: missing version or core data.");
  });

  it("should restore correct workspace data during import", async () => {
    const backupString = JSON.stringify({
      version: 1,
      workspaces: [{ id: "ws-99" }],
      tasks: [{ id: "task-99", title: "Task 99", workspaceId: "ws-99" }]
    });

    await BackupService.restoreStructuredBackup(backupString);
    
    const ws = await AsyncStorage.getItem("pebble:v1:workspaces");
    const tasks = await AsyncStorage.getItem("pebble:v1:tasks:ws-99");
    
    expect(ws).toContain("ws-99");
    expect(tasks).toContain("Task 99");
  });
});
