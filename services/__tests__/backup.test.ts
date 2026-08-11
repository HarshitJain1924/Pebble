import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// Simplified representation of the logic from app/(tabs)/settings.tsx

async function exportBackupLogic() {
  const allKeys = await AsyncStorage.getAllKeys();
  const keysToExport = allKeys.filter(k => 
    k.startsWith("pebble:") || 
    k.startsWith("todoapp:")
  );
  
  const items = await AsyncStorage.multiGet(keysToExport);
  const backup: Record<string, string | null> = {};
  items.forEach(([key, val]) => {
    backup[key] = val;
  });
  return JSON.stringify(backup, null, 2);
}

async function importBackupLogic(importDataString: string) {
  const parsed = JSON.parse(importDataString);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Backup payload must be a JSON object.");
  }

  const hasCoreKeys = Object.keys(parsed).some((key) => 
    key.startsWith("pebble:") || 
    key.startsWith("todoapp:")
  );
  if (!hasCoreKeys) {
    throw new Error("Backup does not contain any valid Pebble data keys.");
  }

  const keyValPairs: [string, string][] = [];
  Object.entries(parsed).forEach(([key, val]) => {
    if (typeof val === "string") {
      keyValPairs.push([key, val]);
    } else if (val) {
      keyValPairs.push([key, JSON.stringify(val)]);
    }
  });

  if (keyValPairs.length === 0) {
    throw new Error("No valid keys found.");
  }

  await AsyncStorage.multiSet(keyValPairs);
}

describe("Backup System Verification", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("should successfully export multiple dynamic workspace keys", async () => {
    await AsyncStorage.setItem("pebble:v1:workspaces", JSON.stringify([{ id: "ws-1" }]));
    await AsyncStorage.setItem("pebble:v1:tasks:ws-1", JSON.stringify({ "task-1": { title: "Test" } }));
    await AsyncStorage.setItem("pebble:v1:habits:ws-2", JSON.stringify({ "habit-1": { title: "Test" } }));
    await AsyncStorage.setItem("pebble:v1:checklists:ws-3", JSON.stringify({ "checklist-1": { title: "Test" } }));
    await AsyncStorage.setItem("pebble:v1:resources:ws-4", JSON.stringify({ "resource-1": { title: "Test" } }));
    await AsyncStorage.setItem("random:unrelated:key", "ignore-me");

    const exportedString = await exportBackupLogic();
    const backupData = JSON.parse(exportedString);

    expect(backupData["pebble:v1:workspaces"]).toBeDefined();
    expect(backupData["pebble:v1:tasks:ws-1"]).toBeDefined();
    expect(backupData["pebble:v1:habits:ws-2"]).toBeDefined();
    expect(backupData["pebble:v1:checklists:ws-3"]).toBeDefined();
    expect(backupData["pebble:v1:resources:ws-4"]).toBeDefined();
    expect(backupData["random:unrelated:key"]).toBeUndefined();
  });

  it("should fail gracefully on malformed payload", async () => {
    await expect(importBackupLogic("not json")).rejects.toThrow();
    await expect(importBackupLogic("[]")).rejects.toThrow("Backup payload must be a JSON object.");
    await expect(importBackupLogic(JSON.stringify({ "unrelated": "data" }))).rejects.toThrow("Backup does not contain any valid Pebble data keys.");
  });

  it("should restore correct workspace data during import", async () => {
    const backupString = JSON.stringify({
      "pebble:v1:workspaces": "[{\"id\":\"ws-99\"}]",
      "pebble:v1:tasks:ws-99": "{\"task-99\":{\"title\":\"Task 99\"}}"
    });

    await importBackupLogic(backupString);
    
    const ws = await AsyncStorage.getItem("pebble:v1:workspaces");
    const tasks = await AsyncStorage.getItem("pebble:v1:tasks:ws-99");
    
    expect(ws).toContain("ws-99");
    expect(tasks).toContain("Task 99");
  });
});
