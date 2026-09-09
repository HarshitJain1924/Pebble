import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  BackupService,
  type AppBackup,
  isPebbleOwnedKey,
  RESTORE_INTENT_KEY,
} from "@/services/storage/backup.service";
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
    it("correctly identifies exact Pebble-owned keys and dynamic partition patterns", () => {
      // Canonical domain
      expect(isPebbleOwnedKey("pebble:v1:workspaces")).toBe(true);
      expect(isPebbleOwnedKey("pebble:v1:recycle_bin")).toBe(true);
      expect(isPebbleOwnedKey(RESTORE_INTENT_KEY)).toBe(true);

      // Settings & Profile
      expect(isPebbleOwnedKey("pebble:settings")).toBe(true);
      expect(isPebbleOwnedKey("pebble:profile")).toBe(true);

      // todoapp:* owned keys
      expect(isPebbleOwnedKey("todoapp:onboarding_completed")).toBe(true);
      expect(isPebbleOwnedKey("todoapp:gratitude_history")).toBe(true);
      expect(isPebbleOwnedKey("todoapp:streak_recoveries")).toBe(true);
      expect(isPebbleOwnedKey("todoapp:focus:current_session")).toBe(true);
      expect(isPebbleOwnedKey("todoapp:pebble_log")).toBe(true);

      // Widget & Capture keys
      expect(isPebbleOwnedKey("@pebble_widget_payload")).toBe(true);
      expect(isPebbleOwnedKey("PEBBLE_CAPTURE_CREATION_HISTORY")).toBe(true);
      expect(isPebbleOwnedKey("PEBBLE_CAPTURE_ACTIVE_SUGGESTIONS")).toBe(true);

      // Dynamic workspace partition patterns
      expect(isPebbleOwnedKey("pebble:v1:tasks:ws-123")).toBe(true);
      expect(isPebbleOwnedKey("pebble:v1:habits:inbox")).toBe(true);
      expect(isPebbleOwnedKey("pebble:v1:checklists:custom-ws_99")).toBe(true);
      expect(isPebbleOwnedKey("pebble:v1:resources:ws-abc")).toBe(true);
    });

    it("strictly excludes foreign keys and pseudo-Pebble keys", () => {
      // Clearly foreign keys
      expect(isPebbleOwnedKey("unrelated:thirdparty:key")).toBe(false);
      expect(isPebbleOwnedKey("expo:notifications:token")).toBe(false);
      expect(isPebbleOwnedKey("react_native_mmkv:test")).toBe(false);

      // Pseudo-Pebble keys that merely resemble prefixes but are not registered
      expect(isPebbleOwnedKey("pebble:foreign_vendor_cache")).toBe(false);
      expect(isPebbleOwnedKey("todoapp:unregistered_secret")).toBe(false);
      expect(isPebbleOwnedKey("@pebble_fake_key")).toBe(false);
      expect(isPebbleOwnedKey("PEBBLE_UNREGISTERED")).toBe(false);
      expect(isPebbleOwnedKey("pebble:v1:arbitrary_fake_entity")).toBe(false);
    });
  });

  describe("2. Pre-Mutation Strict Validation & Complete V1 Schema", () => {
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

    it("rejects missing timestamp in v1 backups", async () => {
      const payload = { ...baseValidBackup, timestamp: undefined as any };
      await expect(BackupService.restoreStructuredBackup(JSON.stringify(payload))).rejects.toThrow(
        "Invalid backup format: 'timestamp' must be a valid number.",
      );
    });

    it("rejects missing core array sections (e.g. missing habits or tasks)", async () => {
      const payloadMissingHabits = { ...baseValidBackup, habits: undefined as any };
      await expect(BackupService.restoreStructuredBackup(JSON.stringify(payloadMissingHabits))).rejects.toThrow(
        "Invalid backup format: 'habits' must be an array.",
      );

      const payloadMissingTasks = { ...baseValidBackup, tasks: undefined as any };
      await expect(BackupService.restoreStructuredBackup(JSON.stringify(payloadMissingTasks))).rejects.toThrow(
        "Invalid backup format: 'tasks' must be an array.",
      );
    });

    it("rejects missing core object sections (e.g. missing settings or profile)", async () => {
      const payloadMissingSettings = { ...baseValidBackup, settings: undefined as any };
      await expect(BackupService.restoreStructuredBackup(JSON.stringify(payloadMissingSettings))).rejects.toThrow(
        "Invalid backup format: 'settings' must be an object.",
      );

      const payloadMissingProfile = { ...baseValidBackup, profile: undefined as any };
      await expect(BackupService.restoreStructuredBackup(JSON.stringify(payloadMissingProfile))).rejects.toThrow(
        "Invalid backup format: 'profile' must be an object.",
      );
    });

    it("accepts missing optional extension sections (uiState, gratitudeHistory) for backward compatibility", async () => {
      const { uiState, gratitudeHistory, ...olderBackup } = baseValidBackup;
      await expect(BackupService.restoreStructuredBackup(JSON.stringify(olderBackup))).resolves.not.toThrow();

      // UI state is normalized even when missing from backup
      const uiStateRaw = await AsyncStorage.getItem("pebble:v1:ui_state");
      expect(uiStateRaw).not.toBeNull();
      expect(JSON.parse(uiStateRaw!).completedOnboarding).toBe(true);
    });

    it("rejects entities with missing or empty IDs", async () => {
      const multiRemoveSpy = jest.spyOn(AsyncStorage, "multiRemove");

      const payload = {
        ...baseValidBackup,
        tasks: [{ id: "   ", workspaceId: "ws-1", title: "Blank ID", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 }],
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
        habits: [{ id: "h-1", workspaceId: "ws-1", recurrence: { frequency: "daily", interval: 1 }, completionHistory: [], revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 } as any],
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

  describe("3. Restore Normalization & Regression Bug Verification (Issues 2 & 8)", () => {
    it("REGRESSION: removes old non-pebble: owned state, restores new state, and preserves foreign and pseudo keys", async () => {
      // 1. Seed old Pebble-owned state under non-pebble: keys
      await AsyncStorage.setItem("todoapp:streak_recoveries", JSON.stringify([{ id: "old-recovery" }]));
      await AsyncStorage.setItem("todoapp:gratitude_history", JSON.stringify([{ id: "old-gratitude" }]));
      await AsyncStorage.setItem("@pebble_widget_payload", JSON.stringify({ old: "widget" }));

      // 2. Seed foreign and pseudo-Pebble keys
      await AsyncStorage.setItem("unrelated:thirdparty:key", "keep-this-safe");
      await AsyncStorage.setItem("pebble:foreign_vendor_cache", "vendor-data");
      await AsyncStorage.setItem("todoapp:unregistered_secret", "secret-data");

      // 3. Restore baseValidBackup (which has its own gratitudeHistory and no streak_recoveries)
      await BackupService.restoreStructuredBackup(JSON.stringify(baseValidBackup));

      // 4. Old non-pebble: owned state must be purged or replaced
      expect(await AsyncStorage.getItem("todoapp:streak_recoveries")).toBeNull();
      expect(await AsyncStorage.getItem("@pebble_widget_payload")).toBeNull();

      // Restored gratitude history replaces old gratitude
      const gratitudeRaw = await AsyncStorage.getItem("todoapp:gratitude_history");
      expect(gratitudeRaw).toContain("Thankful");
      expect(gratitudeRaw).not.toContain("old-gratitude");

      // Workspaces & Tasks restored
      const workspacesRaw = await AsyncStorage.getItem("pebble:v1:workspaces");
      expect(workspacesRaw).toContain("ws-1");

      // Old workspace tasks purged
      expect(await AsyncStorage.getItem("pebble:v1:tasks:ws-existing")).toBeNull();

      // 5. Foreign and pseudo-Pebble keys must NOT be removed
      expect(await AsyncStorage.getItem("unrelated:thirdparty:key")).toBe("keep-this-safe");
      expect(await AsyncStorage.getItem("pebble:foreign_vendor_cache")).toBe("vendor-data");
      expect(await AsyncStorage.getItem("todoapp:unregistered_secret")).toBe("secret-data");
    });

    it("REGRESSION: restores backup with empty collections and ensures old state does not survive (Issue 5)", async () => {
      // Seed old state
      await AsyncStorage.setItem("pebble:v1:tasks:ws-existing", JSON.stringify({ "task-old": { id: "task-old" } }));
      await AsyncStorage.setItem("pebble:v1:habits:ws-existing", JSON.stringify({ "habit-old": { id: "habit-old" } }));

      // Backup contains 0 tasks and 0 habits
      const emptyEntitiesBackup: AppBackup = {
        ...baseValidBackup,
        tasks: [],
        habits: [],
      };

      await BackupService.restoreStructuredBackup(JSON.stringify(emptyEntitiesBackup));

      // Old workspace keys must be completely wiped, not merged
      expect(await AsyncStorage.getItem("pebble:v1:tasks:ws-existing")).toBeNull();
      expect(await AsyncStorage.getItem("pebble:v1:habits:ws-existing")).toBeNull();

      // Restored workspace ws-1 has empty maps
      const newTasksRaw = await AsyncStorage.getItem("pebble:v1:tasks:ws-1");
      expect(JSON.parse(newTasksRaw!)).toEqual({});
    });
  });

  describe("4. Clear-All Orchestration (Issue 1 & 6)", () => {
    it("clears all Pebble-owned keys including streak_recoveries while preserving foreign and pseudo keys", async () => {
      const resetCacheSpy = jest.spyOn(GraphRepository, "resetCache");

      // Seed all types of real Pebble keys
      await AsyncStorage.setItem("pebble:v1:workspaces", "[]");
      await AsyncStorage.setItem("pebble:v1:tasks:ws-1", "{}");
      await AsyncStorage.setItem("pebble:settings", "{}");
      await AsyncStorage.setItem("pebble:profile", "{}");
      await AsyncStorage.setItem("pebble:v1:ui_state", "{}");
      await AsyncStorage.setItem("todoapp:onboarding_completed", "true");
      await AsyncStorage.setItem("todoapp:gratitude_history", "[{}]");
      await AsyncStorage.setItem("todoapp:streak_recoveries", "[{}]");
      await AsyncStorage.setItem("@pebble_widget_payload", "widget-data");
      await AsyncStorage.setItem("PEBBLE_CAPTURE_CREATION_HISTORY", "history-data");
      await AsyncStorage.setItem("PEBBLE_CAPTURE_ACTIVE_SUGGESTIONS", "suggestions-data");

      // Seed unrelated foreign key and pseudo-Pebble keys
      await AsyncStorage.setItem("unrelated:external:key", "keep-me-safe");
      await AsyncStorage.setItem("pebble:foreign_vendor_cache", "vendor-data");
      await AsyncStorage.setItem("todoapp:unregistered_secret", "secret-data");

      await BackupService.clearAllData();

      // All real Pebble keys should be wiped
      expect(await AsyncStorage.getItem("pebble:v1:workspaces")).toBeNull();
      expect(await AsyncStorage.getItem("pebble:v1:tasks:ws-1")).toBeNull();
      expect(await AsyncStorage.getItem("pebble:settings")).toBeNull();
      expect(await AsyncStorage.getItem("pebble:profile")).toBeNull();
      expect(await AsyncStorage.getItem("pebble:v1:ui_state")).toBeNull();
      expect(await AsyncStorage.getItem("todoapp:onboarding_completed")).toBeNull();
      expect(await AsyncStorage.getItem("todoapp:gratitude_history")).toBeNull();
      expect(await AsyncStorage.getItem("todoapp:streak_recoveries")).toBeNull();
      expect(await AsyncStorage.getItem("@pebble_widget_payload")).toBeNull();
      expect(await AsyncStorage.getItem("PEBBLE_CAPTURE_CREATION_HISTORY")).toBeNull();
      expect(await AsyncStorage.getItem("PEBBLE_CAPTURE_ACTIVE_SUGGESTIONS")).toBeNull();

      // Foreign and pseudo-Pebble keys must NOT be touched
      expect(await AsyncStorage.getItem("unrelated:external:key")).toBe("keep-me-safe");
      expect(await AsyncStorage.getItem("pebble:foreign_vendor_cache")).toBe("vendor-data");
      expect(await AsyncStorage.getItem("todoapp:unregistered_secret")).toBe("secret-data");

      // Notifications cancelled & Cache reset
      expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
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
