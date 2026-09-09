import AsyncStorage from "@react-native-async-storage/async-storage";
import { BackupService, type AppBackup, isPebbleOwnedKey } from "@/services/storage/backup.service";
import { GraphRepository } from "@/repositories/GraphRepository";
import { emitStateChange } from "@/services/events/state-events";
import * as Notifications from "expo-notifications";
import { NotificationReconcilerService } from "@/services/notifications/NotificationReconcilerService";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-notifications", () => ({
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/services/notifications/NotificationReconcilerService", () => ({
  NotificationReconcilerService: {
    reconcileAll: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("@/services/events/state-events", () => ({
  emitStateChange: jest.fn(),
  subscribeToStateChanges: jest.fn(() => jest.fn()),
}));

describe("BackupService Hardening & Validation", () => {
  const baseValidBackup: AppBackup = {
    version: 1,
    timestamp: 1700000000000,
    workspaces: [
      { id: "ws-1", name: "Primary", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ],
    tasks: [
      { id: "task-1", workspaceId: "ws-1", title: "Task 1", status: "todo", priority: "none", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ],
    habits: [
      { id: "habit-1", workspaceId: "ws-1", title: "Habit 1", recurrence: { frequency: "daily", interval: 1 }, completionHistory: [], revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ],
    checklists: [
      { id: "chk-1", workspaceId: "ws-1", title: "Checklist 1", items: [], revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ],
    resources: [
      { id: "res-1", workspaceId: "ws-1", title: "Resource 1", type: "note", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ],
    recycleBin: [],
    focusSessions: [],
    relationships: [],
    systemEvents: [],
    settings: { theme: "dark" },
    profile: { name: "Test User", email: "test@example.com" },
    uiState: { completedOnboarding: true, activeWorkspaceId: "ws-1" },
    gratitudeHistory: [{ id: "grat-1", text: "Thankful", createdAt: 1 }],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    // Seed pre-existing storage
    await AsyncStorage.setItem("pebble:v1:workspaces", JSON.stringify([{ id: "ws-existing", name: "Existing" }]));
    await AsyncStorage.setItem("pebble:v1:tasks:ws-existing", JSON.stringify({ "task-old": { id: "task-old", title: "Old" } }));
    await AsyncStorage.setItem("todoapp:onboarding_completed", "true");
    await AsyncStorage.setItem("unrelated:thirdparty:key", "keep-this-safe");
    jest.clearAllMocks();
  });

  describe("1. isPebbleOwnedKey predicate", () => {
    it("correctly identifies Pebble-owned keys and excludes foreign keys", () => {
      expect(isPebbleOwnedKey("pebble:v1:workspaces")).toBe(true);
      expect(isPebbleOwnedKey("pebble:settings")).toBe(true);
      expect(isPebbleOwnedKey("todoapp:onboarding_completed")).toBe(true);
      expect(isPebbleOwnedKey("todoapp:gratitude_history")).toBe(true);
      expect(isPebbleOwnedKey("todoapp:streak_recoveries")).toBe(true);
      expect(isPebbleOwnedKey("@pebble_cache")).toBe(true);
      expect(isPebbleOwnedKey("PEBBLE_FLAG")).toBe(true);

      expect(isPebbleOwnedKey("unrelated:thirdparty:key")).toBe(false);
      expect(isPebbleOwnedKey("expo:notifications:token")).toBe(false);
      expect(isPebbleOwnedKey("react_native_mmkv:test")).toBe(false);
    });
  });

  describe("2. Pre-Mutation Strict Validation", () => {
    it("rejects non-JSON payload before touching storage", async () => {
      const multiRemoveSpy = jest.spyOn(AsyncStorage, "multiRemove");
      const multiSetSpy = jest.spyOn(AsyncStorage, "multiSet");

      await expect(BackupService.restoreStructuredBackup("not valid json {")).rejects.toThrow(
        "Invalid backup format: Not valid JSON.",
      );

      expect(multiRemoveSpy).not.toHaveBeenCalled();
      expect(multiSetSpy).not.toHaveBeenCalled();
      expect(await AsyncStorage.getItem("pebble:v1:tasks:ws-existing")).not.toBeNull();
    });

    it("rejects unsupported backup versions before touching storage", async () => {
      const multiRemoveSpy = jest.spyOn(AsyncStorage, "multiRemove");

      const payload = { ...baseValidBackup, version: 2 };
      await expect(BackupService.restoreStructuredBackup(JSON.stringify(payload))).rejects.toThrow(
        "Unsupported backup version: 2. Only version 1 backups are supported.",
      );

      expect(multiRemoveSpy).not.toHaveBeenCalled();
      expect(await AsyncStorage.getItem("pebble:v1:tasks:ws-existing")).not.toBeNull();
    });

    it("rejects missing core fields (e.g. missing workspaces)", async () => {
      const multiRemoveSpy = jest.spyOn(AsyncStorage, "multiRemove");

      const payload = { version: 1 };
      await expect(BackupService.restoreStructuredBackup(JSON.stringify(payload))).rejects.toThrow(
        "Invalid backup format: missing version or core data.",
      );

      expect(multiRemoveSpy).not.toHaveBeenCalled();
    });

    it("rejects non-array collections", async () => {
      const multiRemoveSpy = jest.spyOn(AsyncStorage, "multiRemove");

      const payload = { ...baseValidBackup, tasks: "not-an-array" as any };
      await expect(BackupService.restoreStructuredBackup(JSON.stringify(payload))).rejects.toThrow(
        "Invalid backup format: 'tasks' must be an array.",
      );

      expect(multiRemoveSpy).not.toHaveBeenCalled();
    });

    it("rejects non-object sections (e.g. settings is string)", async () => {
      const multiRemoveSpy = jest.spyOn(AsyncStorage, "multiRemove");

      const payload = { ...baseValidBackup, settings: "not-an-object" as any };
      await expect(BackupService.restoreStructuredBackup(JSON.stringify(payload))).rejects.toThrow(
        "Invalid backup format: 'settings' must be an object.",
      );

      expect(multiRemoveSpy).not.toHaveBeenCalled();
    });

    it("rejects entities with missing or empty IDs", async () => {
      const multiRemoveSpy = jest.spyOn(AsyncStorage, "multiRemove");

      const payload = {
        ...baseValidBackup,
        tasks: [{ id: "   ", workspaceId: "ws-1", title: "Blank ID" } as any],
      };
      await expect(BackupService.restoreStructuredBackup(JSON.stringify(payload))).rejects.toThrow(
        "Invalid backup format: Every task must have a non-empty string ID.",
      );

      expect(multiRemoveSpy).not.toHaveBeenCalled();
    });

    it("rejects entities with missing titles", async () => {
      const multiRemoveSpy = jest.spyOn(AsyncStorage, "multiRemove");

      const payload = {
        ...baseValidBackup,
        habits: [{ id: "h-1", workspaceId: "ws-1" } as any],
      };
      await expect(BackupService.restoreStructuredBackup(JSON.stringify(payload))).rejects.toThrow(
        "Invalid backup format: Habit h-1 must have a valid title.",
      );

      expect(multiRemoveSpy).not.toHaveBeenCalled();
    });

    it("rejects cross-entity invalid workspace references", async () => {
      const multiRemoveSpy = jest.spyOn(AsyncStorage, "multiRemove");

      const payload: AppBackup = {
        ...baseValidBackup,
        tasks: [
          {
            id: "task-orphan",
            workspaceId: "ws-non-existent",
            title: "Orphaned Task",
            status: "todo",
            priority: "none",
            revision: 1,
            lifecycleGeneration: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      };

      await expect(BackupService.restoreStructuredBackup(JSON.stringify(payload))).rejects.toThrow(
        "Invalid reference: Task task-orphan references non-existent workspace ws-non-existent.",
      );

      expect(multiRemoveSpy).not.toHaveBeenCalled();
      expect(await AsyncStorage.getItem("pebble:v1:tasks:ws-existing")).not.toBeNull();
    });

    it("allows entities belonging to INBOX_WORKSPACE_ID without explicit workspace in workspaces list", async () => {
      const payload: AppBackup = {
        ...baseValidBackup,
        tasks: [
          {
            id: "task-inbox",
            workspaceId: INBOX_WORKSPACE_ID,
            title: "Inbox Task",
            status: "todo",
            priority: "none",
            revision: 1,
            lifecycleGeneration: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      };

      await expect(BackupService.restoreStructuredBackup(JSON.stringify(payload))).resolves.not.toThrow();
      const inboxTasksRaw = await AsyncStorage.getItem(`pebble:v1:tasks:${INBOX_WORKSPACE_ID}`);
      expect(inboxTasksRaw).toContain("task-inbox");
    });
  });

  describe("3. Restore Normalization & Runtime Reconciliation", () => {
    it("successfully restores state, normalizes ui_state, restores gratitude history, and emits events", async () => {
      const resetCacheSpy = jest.spyOn(GraphRepository, "resetCache");

      await BackupService.restoreStructuredBackup(JSON.stringify(baseValidBackup));

      // 1. Workspaces & Tasks restored
      const workspacesRaw = await AsyncStorage.getItem("pebble:v1:workspaces");
      expect(workspacesRaw).toContain("ws-1");

      const tasksRaw = await AsyncStorage.getItem("pebble:v1:tasks:ws-1");
      expect(tasksRaw).toContain("task-1");

      // 2. Settings & Profile restored
      const settingsRaw = await AsyncStorage.getItem("pebble:settings");
      expect(JSON.parse(settingsRaw!)).toEqual({ theme: "dark" });

      const profileRaw = await AsyncStorage.getItem("pebble:profile");
      expect(JSON.parse(profileRaw!)).toEqual({ name: "Test User", email: "test@example.com" });

      // 3. UI State normalized (completedOnboarding: true, activeWorkspaceId, themeCache)
      const uiStateRaw = await AsyncStorage.getItem("pebble:v1:ui_state");
      expect(uiStateRaw).not.toBeNull();
      const parsedUiState = JSON.parse(uiStateRaw!);
      expect(parsedUiState.completedOnboarding).toBe(true);
      expect(parsedUiState.activeWorkspaceId).toBe("ws-1");
      expect(parsedUiState.themeCache).toBe("dark");

      // 4. Gratitude history restored
      const gratitudeRaw = await AsyncStorage.getItem("todoapp:gratitude_history");
      expect(gratitudeRaw).toContain("Thankful");

      // 5. Old data purged
      expect(await AsyncStorage.getItem("pebble:v1:tasks:ws-existing")).toBeNull();

      // 6. Unrelated third-party key preserved
      expect(await AsyncStorage.getItem("unrelated:thirdparty:key")).toBe("keep-this-safe");

      // 7. Cache reset & Notifications reconciled
      expect(resetCacheSpy).toHaveBeenCalled();
      expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
      expect(NotificationReconcilerService.reconcileAll).toHaveBeenCalled();

      // 8. Domain events emitted
      expect(emitStateChange).toHaveBeenCalledWith("workspace_changed", "backup_service");
      expect(emitStateChange).toHaveBeenCalledWith("tasks_changed", "backup_service");
      expect(emitStateChange).toHaveBeenCalledWith("habits_changed", "backup_service");
      expect(emitStateChange).toHaveBeenCalledWith("checklists_changed", "backup_service");
      expect(emitStateChange).toHaveBeenCalledWith("resources_changed", "backup_service");
      expect(emitStateChange).toHaveBeenCalledWith("settings_changed", "backup_service");
      expect(emitStateChange).toHaveBeenCalledWith("profile_changed", "backup_service");
      expect(emitStateChange).toHaveBeenCalledWith("pebbles_changed", "backup_service");
      expect(emitStateChange).toHaveBeenCalledWith("focus_changed", "backup_service");
    });
  });

  describe("4. Clear-All Orchestration", () => {
    it("clears all Pebble-owned keys including streak_recoveries & gratitude_history while preserving foreign keys", async () => {
      const resetCacheSpy = jest.spyOn(GraphRepository, "resetCache");

      // Seed all types of Pebble keys
      await AsyncStorage.setItem("pebble:v1:workspaces", "[]");
      await AsyncStorage.setItem("pebble:v1:tasks:ws-1", "{}");
      await AsyncStorage.setItem("pebble:settings", "{}");
      await AsyncStorage.setItem("pebble:profile", "{}");
      await AsyncStorage.setItem("pebble:v1:ui_state", "{}");
      await AsyncStorage.setItem("todoapp:onboarding_completed", "true");
      await AsyncStorage.setItem("todoapp:gratitude_history", "[{}]");
      await AsyncStorage.setItem("todoapp:streak_recoveries", "[{}]");
      await AsyncStorage.setItem("@pebble_session_token", "abc");
      await AsyncStorage.setItem("PEBBLE_CONFIG", "123");

      // Seed unrelated third-party key
      await AsyncStorage.setItem("unrelated:external:key", "keep-me-safe");

      await BackupService.clearAllData();

      // All Pebble keys should be wiped
      expect(await AsyncStorage.getItem("pebble:v1:workspaces")).toBeNull();
      expect(await AsyncStorage.getItem("pebble:v1:tasks:ws-1")).toBeNull();
      expect(await AsyncStorage.getItem("pebble:settings")).toBeNull();
      expect(await AsyncStorage.getItem("pebble:profile")).toBeNull();
      expect(await AsyncStorage.getItem("pebble:v1:ui_state")).toBeNull();
      expect(await AsyncStorage.getItem("todoapp:onboarding_completed")).toBeNull();
      expect(await AsyncStorage.getItem("todoapp:gratitude_history")).toBeNull();
      expect(await AsyncStorage.getItem("todoapp:streak_recoveries")).toBeNull();
      expect(await AsyncStorage.getItem("@pebble_session_token")).toBeNull();
      expect(await AsyncStorage.getItem("PEBBLE_CONFIG")).toBeNull();

      // Foreign key must NOT be touched
      expect(await AsyncStorage.getItem("unrelated:external:key")).toBe("keep-me-safe");

      // Notifications cancelled
      expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();

      // Graph cache reset
      expect(resetCacheSpy).toHaveBeenCalled();

      // Domain events emitted for clear_all_data
      expect(emitStateChange).toHaveBeenCalledWith("workspace_changed", "clear_all_data");
      expect(emitStateChange).toHaveBeenCalledWith("tasks_changed", "clear_all_data");
      expect(emitStateChange).toHaveBeenCalledWith("habits_changed", "clear_all_data");
      expect(emitStateChange).toHaveBeenCalledWith("checklists_changed", "clear_all_data");
      expect(emitStateChange).toHaveBeenCalledWith("resources_changed", "clear_all_data");
      expect(emitStateChange).toHaveBeenCalledWith("settings_changed", "clear_all_data");
      expect(emitStateChange).toHaveBeenCalledWith("profile_changed", "clear_all_data");
      expect(emitStateChange).toHaveBeenCalledWith("pebbles_changed", "clear_all_data");
      expect(emitStateChange).toHaveBeenCalledWith("focus_changed", "clear_all_data");
    });
  });

  describe("5. Export Contract Verification", () => {
    it("generates a complete backup including canonical entities, uiState, and gratitude history", async () => {
      await AsyncStorage.setItem(
        "pebble:v1:workspaces",
        JSON.stringify([{ id: "ws-test", name: "Test WS", createdAt: 1, updatedAt: 1 }]),
      );
      await AsyncStorage.setItem(
        "pebble:v1:tasks:ws-test",
        JSON.stringify({ "task-test": { id: "task-test", workspaceId: "ws-test", title: "Test Task" } }),
      );
      await AsyncStorage.setItem(
        "todoapp:gratitude_history",
        JSON.stringify([{ id: "grat-1", text: "Grateful", createdAt: 1 }]),
      );
      await AsyncStorage.setItem(
        "pebble:v1:ui_state",
        JSON.stringify({ completedOnboarding: true, activeWorkspaceId: "ws-test" }),
      );

      const backupString = await BackupService.generateStructuredBackup();
      const backupData = JSON.parse(backupString);

      expect(backupData.version).toBe(1);
      expect(backupData.workspaces).toHaveLength(1);
      expect(backupData.workspaces[0].id).toBe("ws-test");
      expect(backupData.tasks).toHaveLength(1);
      expect(backupData.tasks[0].id).toBe("task-test");
      expect(backupData.uiState).toBeDefined();
      expect(backupData.gratitudeHistory).toHaveLength(1);
      expect(backupData.gratitudeHistory[0].text).toBe("Grateful");
    });
  });
});
