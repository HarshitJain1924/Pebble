import AsyncStorage from "@react-native-async-storage/async-storage";
import { BackupService } from "@/services/storage/backup.service";
import { clearRepositoryStorage } from "@/services/storage/storage-utils";
import {
  WorkspaceRepository,
  TaskRepository,
  HabitRepository,
  ChecklistRepository,
  ResourceRepository,
} from "@/repositories";

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

  it("export reads only canonical data and ignores obsolete legacy keys", async () => {
    // Obsolete legacy keys must contribute nothing to the export.
    await AsyncStorage.setItem("pebble:tasks", JSON.stringify({ "legacy-task": { id: "legacy-task", title: "Legacy Task", workspaceId: "ws-1" } }));
    await AsyncStorage.setItem("pebble:habits", JSON.stringify({ "legacy-habit": { id: "legacy-habit", title: "Legacy Habit" } }));

    // Canonical data lives under pebble:v1 keys read through the repositories.
    await AsyncStorage.setItem("pebble:v1:workspaces", JSON.stringify([{ id: "ws-1", name: "WS", createdAt: 1, updatedAt: 1 }]));
    await AsyncStorage.setItem("pebble:v1:tasks:ws-1", JSON.stringify({ "task-1": { id: "task-1", title: "Canonical Task", workspaceId: "ws-1", status: "todo", priority: "none", createdAt: 1, updatedAt: 1 } }));

    const backupData = JSON.parse(await BackupService.generateStructuredBackup());

    expect(backupData.tasks).toHaveLength(1);
    expect(backupData.tasks[0].id).toBe("task-1");
    expect(backupData.tasks[0].title).toBe("Canonical Task");
    // The legacy keys were ignored entirely.
    expect(backupData.habits).toHaveLength(0);
    expect(backupData.tasks.some((t: any) => t.id === "legacy-task")).toBe(false);
  });

  it("import restores every entity type into canonical storage", async () => {
    const backupString = JSON.stringify({
      version: 1,
      workspaces: [{ id: "ws-imp", name: "Imported", createdAt: 1, updatedAt: 1 }],
      tasks: [{ id: "task-imp", workspaceId: "ws-imp", title: "T", status: "todo", priority: "none", createdAt: 1, updatedAt: 1 }],
      habits: [{ id: "habit-imp", workspaceId: "ws-imp", title: "H", recurrence: { frequency: "daily", interval: 1 }, completionHistory: [], createdAt: 1, updatedAt: 1 }],
      checklists: [{ id: "checklist-imp", workspaceId: "ws-imp", title: "C", items: [], createdAt: 1, updatedAt: 1 }],
      resources: [{ id: "resource-imp", workspaceId: "ws-imp", title: "R", type: "note", createdAt: 1, updatedAt: 1 }],
      recycleBin: [],
      focusSessions: [],
      relationships: [],
      systemEvents: [],
    });

    await BackupService.restoreStructuredBackup(backupString);

    expect((await WorkspaceRepository.getWorkspaces()).map((w) => w.id)).toContain("ws-imp");
    expect((await TaskRepository.getTasks("ws-imp"))["task-imp"]).toBeDefined();
    expect((await HabitRepository.getHabits("ws-imp"))["habit-imp"]).toBeDefined();
    expect((await ChecklistRepository.getChecklists("ws-imp"))["checklist-imp"]).toBeDefined();
    expect((await ResourceRepository.getResources("ws-imp"))["resource-imp"]).toBeDefined();
  });

  it("export → clear → import round trip preserves logical data", async () => {
    await WorkspaceRepository.saveWorkspace({ id: "ws-rt", name: "RT", createdAt: 1, updatedAt: 1 });
    await TaskRepository.saveTask({ id: "task-rt", workspaceId: "ws-rt", title: "RT Task", status: "todo", priority: "none", createdAt: 1, updatedAt: 1 });

    const exported = await BackupService.generateStructuredBackup();

    // Simulate app reset + divergent data that the import must replace.
    await clearRepositoryStorage();
    await TaskRepository.saveTask({ id: "task-other", workspaceId: "ws-rt", title: "Wrong", status: "todo", priority: "none", createdAt: 1, updatedAt: 1 });

    await BackupService.restoreStructuredBackup(exported);

    const tasks = await TaskRepository.getTasks("ws-rt");
    expect(tasks["task-rt"]).toBeDefined();
    expect(tasks["task-other"]).toBeUndefined();
    expect(tasks["task-rt"].title).toBe("RT Task");
  });

  it("import never writes data into obsolete storage keys", async () => {
    await BackupService.restoreStructuredBackup(JSON.stringify({
      version: 1,
      workspaces: [{ id: "ws-ok", name: "OK", createdAt: 1, updatedAt: 1 }],
      tasks: [{ id: "task-ok", workspaceId: "ws-ok", title: "OK", status: "todo", priority: "none", createdAt: 1, updatedAt: 1 }],
      habits: [{ id: "habit-ok", workspaceId: "ws-ok", title: "H", recurrence: { frequency: "daily", interval: 1 }, completionHistory: [], createdAt: 1, updatedAt: 1 }],
      checklists: [{ id: "checklist-ok", workspaceId: "ws-ok", title: "C", items: [], createdAt: 1, updatedAt: 1 }],
      resources: [{ id: "resource-ok", workspaceId: "ws-ok", title: "R", type: "note", createdAt: 1, updatedAt: 1 }],
      recycleBin: [],
      focusSessions: [],
      relationships: [],
      systemEvents: [],
    }));

    const allKeys = await AsyncStorage.getAllKeys();
    expect(allKeys).not.toContain("pebble:tasks");
    expect(allKeys).not.toContain("pebble:habits");
    expect(allKeys).toContain("pebble:v1:workspaces");
    expect(allKeys).toContain("pebble:v1:tasks:ws-ok");
    expect(allKeys).toContain("pebble:v1:habits:ws-ok");
    expect(allKeys).toContain("pebble:v1:checklists:ws-ok");
    expect(allKeys).toContain("pebble:v1:resources:ws-ok");
  });

  it("rejects unsupported backup versions without touching storage", async () => {
    await AsyncStorage.setItem("pebble:v1:workspaces", JSON.stringify([{ id: "ws-keep", name: "Keep", createdAt: 1, updatedAt: 1 }]));

    await expect(
      BackupService.restoreStructuredBackup(JSON.stringify({ version: 2, workspaces: [] })),
    ).rejects.toThrow("Unsupported backup version");

    const kept = JSON.parse((await AsyncStorage.getItem("pebble:v1:workspaces"))!);
    expect(kept[0].id).toBe("ws-keep");
  });
});
