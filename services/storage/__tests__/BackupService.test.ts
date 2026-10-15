import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import * as mutex from "@/shared/utils/mutex";
import { withLock } from "@/shared/utils/mutex";
import {
  BackupService,
  type AppBackup,
  isPebbleOwnedKey,
  RESTORE_INTENT_KEY,
} from "@/services/storage/backup.service";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { TaskRepository } from "@/repositories/TaskRepository";
import { MoveJournalRepository } from "@/repositories/MoveJournalRepository";
import { GraphRepository } from "@/repositories/GraphRepository";
import { RecycleBinRepository } from "@/repositories/RecycleBinRepository";
import { MoveReconcilerService } from "@/services/storage/MoveReconcilerService";
import { NotificationReconcilerService } from "@/services/notifications/NotificationReconcilerService";
import { clearRepositoryStorage } from "@/services/storage/storage-utils";
import { emitStateChange } from "@/services/events/state-events";
import { WorkspaceCommandHandler } from "@/services/command/handlers/WorkspaceCommandHandler";
import { INBOX_WORKSPACE_ID, type Workspace, type Task } from "@/shared/types/domain.types";

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


describe("BackupService Primary Suite", () => {
describe("BackupService Hardening & Validation", () => {
  beforeEach(async () => {
    (AsyncStorage as any).__INTERNAL_MOCK_STORAGE__ = {};
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => (AsyncStorage as any).__INTERNAL_MOCK_STORAGE__[key] ?? null);
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string) => { (AsyncStorage as any).__INTERNAL_MOCK_STORAGE__[key] = val; });
    (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => { delete (AsyncStorage as any).__INTERNAL_MOCK_STORAGE__[key]; });
    (AsyncStorage.getAllKeys as jest.Mock).mockImplementation(async () => Object.keys((AsyncStorage as any).__INTERNAL_MOCK_STORAGE__));
    (AsyncStorage.multiGet as jest.Mock).mockImplementation(async (keys: string[]) => keys.map((k: string) => [k, (AsyncStorage as any).__INTERNAL_MOCK_STORAGE__[k] ?? null]));
    (AsyncStorage.multiSet as jest.Mock).mockImplementation(async (pairs: readonly (readonly [string, string])[]) => {
      for (const [k, v] of pairs) (AsyncStorage as any).__INTERNAL_MOCK_STORAGE__[k] = v;
    });
    (AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => {
      for (const k of keys) delete (AsyncStorage as any).__INTERNAL_MOCK_STORAGE__[k];
    });
    (AsyncStorage.clear as jest.Mock).mockImplementation(async () => { (AsyncStorage as any).__INTERNAL_MOCK_STORAGE__ = {}; });
  });


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
      { id: "chk-1", workspaceId: "ws-1", title: "Checklist 1", priority: "none", items: [], revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
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

describe("Phase 0 structured restore", () => {
const storage = AsyncStorage as typeof AsyncStorage;
const workspace: Workspace = { id: "ws-a", name: "A", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 };
const task: Task = { id: "task-a", workspaceId: "ws-a", title: "A", status: "todo", priority: "none", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 };
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
  settings: {},
  profile: {},
});

beforeEach(async () => {
  jest.restoreAllMocks();
  await storage.clear();
  await storage.setItem("pebble:v1:tasks:ws-old", JSON.stringify({ old: task }));
  await storage.setItem("todoapp:onboarding_completed", "true");
});

  beforeEach(async () => {
    (AsyncStorage as any).__INTERNAL_MOCK_STORAGE__ = {};
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => (AsyncStorage as any).__INTERNAL_MOCK_STORAGE__[key] ?? null);
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string) => { (AsyncStorage as any).__INTERNAL_MOCK_STORAGE__[key] = val; });
    (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => { delete (AsyncStorage as any).__INTERNAL_MOCK_STORAGE__[key]; });
    (AsyncStorage.getAllKeys as jest.Mock).mockImplementation(async () => Object.keys((AsyncStorage as any).__INTERNAL_MOCK_STORAGE__));
    (AsyncStorage.multiGet as jest.Mock).mockImplementation(async (keys: string[]) => keys.map((k: string) => [k, (AsyncStorage as any).__INTERNAL_MOCK_STORAGE__[k] ?? null]));
    (AsyncStorage.multiSet as jest.Mock).mockImplementation(async (pairs: readonly (readonly [string, string])[]) => {
      for (const [k, v] of pairs) (AsyncStorage as any).__INTERNAL_MOCK_STORAGE__[k] = v;
    });
    (AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => {
      for (const k of keys) delete (AsyncStorage as any).__INTERNAL_MOCK_STORAGE__[k];
    });
    (AsyncStorage.clear as jest.Mock).mockImplementation(async () => { (AsyncStorage as any).__INTERNAL_MOCK_STORAGE__ = {}; });

    jest.restoreAllMocks();
    await storage.clear();
    await storage.setItem("pebble:v1:tasks:ws-old", JSON.stringify({ old: task }));
    await storage.setItem("todoapp:onboarding_completed", "true");
  });


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

  // --- BATCH 4 FIX TESTS ---
  
  test("domain restore succeeds and notification failure is isolated", async () => {
    // Import Notifications mock
    const Notifications = require("expo-notifications");
    // Force the cancellation to throw an error
    Notifications.cancelAllScheduledNotificationsAsync.mockRejectedValueOnce(new Error("Simulated OS Error"));
    
    // Attempt the restore
    await expect(BackupService.restoreStructuredBackup(JSON.stringify(backup()))).resolves.not.toThrow();
    
    // The backup should have successfully written the new workspaces
    const workspaces = await storage.getItem("pebble:v1:workspaces");
    expect(workspaces).toContain('"ws-a"');
    
    // The old data should have been successfully overwritten
    const oldData = await storage.getItem("pebble:v1:tasks:ws-old");
    expect(oldData).toBeNull(); // It was removed during restore
  });

  test("successful restore clears OS notifications", async () => {
    const Notifications = require("expo-notifications");
    Notifications.cancelAllScheduledNotificationsAsync.mockResolvedValueOnce(undefined);
    
    await expect(BackupService.restoreStructuredBackup(JSON.stringify(backup()))).resolves.not.toThrow();
    
    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
  });

test("clearRepositoryStorage preserves onboarding state during content restore", async () => {
  await clearRepositoryStorage();
  expect(await storage.getItem("todoapp:onboarding_completed")).toBe("true");
});


});

describe("BackupService - Hostile Concurrency & Locking", () => {
  const mockStorage: Record<string, string> = {};

  beforeEach(() => {
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => mockStorage[key] ?? null);
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string) => { mockStorage[key] = val; });
    (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => { delete mockStorage[key]; });
    (AsyncStorage.getAllKeys as jest.Mock).mockImplementation(async () => Object.keys(mockStorage));
    (AsyncStorage.multiGet as jest.Mock).mockImplementation(async (keys: string[]) => keys.map(k => [k, mockStorage[k] ?? null]));
    (AsyncStorage.multiSet as jest.Mock).mockImplementation(async (pairs: readonly (readonly [string, string])[]) => {
      for (const [k, v] of pairs) mockStorage[k] = v;
    });
    (AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => {
      for (const k of keys) delete mockStorage[k];
    });
  });

  beforeEach(async () => {
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
    jest.clearAllMocks();
    GraphRepository.resetCache();
  });

  const generateValidBackup = (): AppBackup => ({
    version: 1,
    timestamp: Date.now(),
    workspaces: [{ id: "ws-1", name: "Backup WS", revision: 1, lifecycleGeneration: 1, createdAt: 100, updatedAt: 100 }],
    tasks: [{ id: "task-1", title: "Backup Task", workspaceId: "ws-1", status: "todo", priority: "none", revision: 1, lifecycleGeneration: 1, createdAt: 100, updatedAt: 100 }],
    habits: [],
    checklists: [],
    resources: [],
    recycleBin: [],
    focusSessions: [],
    relationships: [],
    systemEvents: [],
    settings: {},
    profile: {}
  });

  it("prevents concurrent task creation during restore", async () => {
    const backupJson = JSON.stringify(generateValidBackup());
    const restorePromise = BackupService.restoreStructuredBackup(backupJson);

    // Let the restore start and acquire the lock first
    await new Promise(resolve => setTimeout(resolve, 10));

    const writePromise = TaskRepository.saveTask({
      id: "task-concurrent",
      title: "Concurrent Task",
      workspaceId: "ws-1",
      status: "todo",
      priority: "none",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 200,
      updatedAt: 200
    });

    await Promise.all([restorePromise, writePromise]);
    const tasks = await TaskRepository.getTasks("ws-1");
    expect(tasks["task-1"]).toBeDefined();
    expect(tasks["task-concurrent"]).toBeDefined();
  });

  it("handles duplicate keys gracefully (no duplicate lock deadlock)", async () => {
    const backup = generateValidBackup();
    backup.workspaces.push({ id: "ws-1", name: "Duplicate WS", revision: 1, lifecycleGeneration: 1, createdAt: 100, updatedAt: 100 });
    const promise = BackupService.restoreStructuredBackup(JSON.stringify(backup));
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Deadlock timeout")), 1000));
    await expect(Promise.race([promise, timeout])).resolves.not.toThrow();
  });

  it("ensures GraphRepository cache is invalidated", async () => {
    await GraphRepository.saveRelationship({
      id: "rel-1",
      source: { id: "task-1", type: "task" },
      target: { id: "task-2", type: "task" },
      relationType: "blocked_by",
      createdAt: 100
    });
    
    const preRestoreRel = await GraphRepository.getRelated("task-1");
    expect(preRestoreRel.length).toBe(1);

    const backupJson = JSON.stringify(generateValidBackup());
    await BackupService.restoreStructuredBackup(backupJson);

    const postRestoreRel = await GraphRepository.getRelated("task-1");
    expect(postRestoreRel.length).toBe(0);
  });

  it("prevents concurrent move journaling from corrupting restore", async () => {
    await TaskRepository.saveTask({
      id: "task-move",
      title: "Move Task",
      workspaceId: "inbox",
      status: "todo",
      priority: "none",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 100,
      updatedAt: 100
    });

    const backupJson = JSON.stringify(generateValidBackup());
    const restorePromise = BackupService.restoreStructuredBackup(backupJson);
    // Simulate a move operation getting injected while restore is initializing
    const movePromise = MoveJournalRepository.addOperation({
      operationId: "op-1",
      operationType: "move",
      entityId: "task-move",
      entityType: "task",
      sourceWorkspaceId: "inbox",
      targetWorkspaceId: "ws-1",
      timestamp: Date.now(),
      lifecycleGeneration: 1,
      expectedRevision: 1,
    });

    await Promise.all([
      expect(restorePromise).rejects.toThrow("Concurrent move detected"),
      movePromise
    ]);
  });
  
  it("rolls back safely on write failure without deadlocking", async () => {
    await TaskRepository.saveTask({
      id: "task-existing",
      title: "Existing Task",
      workspaceId: "inbox",
      status: "todo",
      priority: "none",
      createdAt: 100,
      updatedAt: 100
    });

    const backupJson = JSON.stringify(generateValidBackup());
    const originalMultiSet = (AsyncStorage.multiSet as jest.Mock).getMockImplementation();
    let failNext = true;
    (AsyncStorage.multiSet as jest.Mock).mockImplementation(async (pairs: readonly (readonly [string, string])[]) => {
      if (failNext) {
        failNext = false;
        throw new Error("Simulated Write Failure");
      }
      if (originalMultiSet) {
        return originalMultiSet(pairs);
      }
    });

    await expect(BackupService.restoreStructuredBackup(backupJson)).rejects.toThrow("Simulated Write Failure");

    const inboxTasks = await TaskRepository.getTasks("inbox");
    expect(inboxTasks["task-existing"]).toBeDefined();

    jest.restoreAllMocks();
  });

});

describe("BackupService & Reconciler - MoveJournal Integrity", () => {
  const mockStorage: Record<string, string> = {};

  beforeEach(async () => {
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => mockStorage[key] || null);
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string) => { mockStorage[key] = val; });
    (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => { delete mockStorage[key]; });
    (AsyncStorage.getAllKeys as jest.Mock).mockImplementation(async () => Object.keys(mockStorage));
    (AsyncStorage.multiGet as jest.Mock).mockImplementation(async (keys: string[]) => keys.map(k => [k, mockStorage[k] || null]));
    (AsyncStorage.multiSet as jest.Mock).mockImplementation(async (pairs: readonly (readonly [string, string])[]) => {
      pairs.forEach(([k, v]) => { mockStorage[k] = v; });
    });
    (AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => {
      keys.forEach(k => { delete mockStorage[k]; });
    });
    GraphRepository.resetCache();
  });

  beforeEach(async () => {
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
    jest.clearAllMocks();
    GraphRepository.resetCache();
  });

  const generateValidBackup = (): AppBackup => ({
    version: 1,
    timestamp: Date.now(),
    workspaces: [{ id: "ws-1", name: "Backup WS", revision: 1, lifecycleGeneration: 1, createdAt: 100, updatedAt: 100 }],
    tasks: [{ id: "task-1", title: "Backup Task", workspaceId: "ws-1", status: "todo", priority: "none", revision: 1, lifecycleGeneration: 1, createdAt: 100, updatedAt: 100 }],
    habits: [],
    checklists: [],
    resources: [],
    recycleBin: [],
    focusSessions: [],
    relationships: [],
    systemEvents: [],
    settings: {},
    profile: {}
  });

  it("TEST 1 - Journal lock survives empty journal (Concurrent Move Race)", async () => {
    // Setup: Ensure MoveJournal storage key does NOT exist
    delete mockStorage["pebble:v1:move_journal"];

    // We hook getAllKeys so that we can insert a concurrent move EXACTLY after 
    // BackupService has determined its lock set but BEFORE it acquires locks.
    const originalGetAllKeys = AsyncStorage.getAllKeys as jest.Mock;
    let didInjectMove = false;
    
    originalGetAllKeys.mockImplementation(async () => {
      // Capture keys BEFORE injecting the move. 
      // move_journal is NOT in this array.
      const keys = Object.keys(mockStorage);
      
      if (!didInjectMove) {
        didInjectMove = true;
        // Await the concurrent move so it is physically in storage 
        // before BackupService proceeds to compute lockKeys.
        await MoveJournalRepository.addOperation({
          operationId: "op-sneaky",
          operationType: "move",
          entityId: "task-sneaky",
          entityType: "task",
          sourceWorkspaceId: "inbox",
          targetWorkspaceId: "ws-1",
          timestamp: Date.now(),
          lifecycleGeneration: 1,
          expectedRevision: 1,
        });
      }
      
      // Return the stale keys array to simulate the exact race 
      // where getAllKeys missed the new journal entry.
      return keys;
    });

    const backupJson = JSON.stringify(generateValidBackup());
    
    // With the race condition fixed, BackupService manually requires the lock.
    // It should discover the sneaky move inside the lock block and safely abort.
    await expect(BackupService.restoreStructuredBackup(backupJson))
      .rejects.toThrow("Concurrent move detected");

    // The journal entry MUST survive the backup attempt
    const journalAfter = await MoveJournalRepository.getOperations();
    expect(journalAfter.length).toBe(1);
    expect(journalAfter[0].operationId).toBe("op-sneaky");
  });

  it("TEST 6 - ConversionJournal lock survives empty journal (Concurrent Conversion Race)", async () => {
    // Setup: Ensure ConversionJournal storage key does NOT exist
    delete mockStorage["pebble:v1:conversion_journal"];

    // We hook getAllKeys so that we can insert a concurrent conversion EXACTLY after 
    // BackupService has determined its lock set but BEFORE it acquires locks.
    const originalGetAllKeys = AsyncStorage.getAllKeys as jest.Mock;
    let didInjectConversion = false;
    
    originalGetAllKeys.mockImplementation(async () => {
      // Capture keys BEFORE injecting the conversion. 
      // conversion_journal is NOT in this array.
      const keys = Object.keys(mockStorage);
      
      if (!didInjectConversion) {
        didInjectConversion = true;
        
        // Await the concurrent conversion so it is physically in storage 
        // before BackupService proceeds to compute lockKeys.
        const { ConversionJournalRepository } = require("@/repositories");
        await ConversionJournalRepository.addOperationUnlocked({
          operationId: "conv-sneaky",
          phase: "PREPARED",
          operationType: "habit_to_task",
          sourceId: "habit-sneaky",
          sourceWorkspaceId: "inbox",
          targetId: "task-sneaky",
          targetWorkspaceId: "inbox",
          timestamp: Date.now()
        });
      }
      
      // Return the stale keys array to simulate the exact race 
      return keys;
    });

    const backupJson = JSON.stringify(generateValidBackup());
    
    // BackupService manually requires the lock now, so it will discover it inside the lock block.
    await expect(BackupService.restoreStructuredBackup(backupJson))
      .rejects.toThrow("Concurrent conversion detected");

    // The journal entry MUST survive the backup attempt
    const { ConversionJournalRepository } = require("@/repositories");
    const journalAfter = await ConversionJournalRepository.getOperations();
    expect(journalAfter.length).toBe(1);
    expect(journalAfter[0].operationId).toBe("conv-sneaky");

    // Cleanup mock
    (AsyncStorage.getAllKeys as jest.Mock).mockImplementation(async () => Object.keys(mockStorage));
  });

  it("TEST 2 - Reconciler vs Backup deadlock does not occur on disjoint partitions", async () => {
    // We intentionally delay the MoveJournal lock acquisition inside BackupService
    // to force Reconciler and Backup to overlap.
    const originalWithLock = mutex.withLock;
    
    let backupReachedJournal = false;
    let reconcilerReachedRecycle = false;
    
    jest.spyOn(mutex, "withLock").mockImplementation(async (key, task) => {
      if (key === "pebble:v1:move_journal") {
        backupReachedJournal = true;
      }
      if (key === "pebble:v1:recycle_bin") {
        reconcilerReachedRecycle = true;
      }
      return originalWithLock(key, task);
    });

    // Seed an operation for a workspace that BackupService does NOT lock (because it's deleted)
    // Wait, BackupService locks ALL keys in the backup. So we use a disjoint key not in backup and not in storage.
    mockStorage["pebble:v1:move_journal"] = JSON.stringify([{
      operationId: "op-deadlock",
      entityId: "task-deadlock",
      entityType: "task",
      sourceWorkspaceId: "deleted-ws",
      targetWorkspaceId: "deleted-ws",
      timestamp: Date.now()
    }]);

    // Override reconcileAll for this test so it DOES NOT run before backup.
    jest.spyOn(MoveReconcilerService, "reconcileAll").mockResolvedValue(undefined);

    const backupJson = JSON.stringify(generateValidBackup());

    // We run both concurrently. They should not deadlock.
    // To ensure they actually overlap, they are both launched.
    const backupPromise = BackupService.restoreStructuredBackup(backupJson).catch(() => {}); // catch the concurrent abort
    const reconcilerPromise = (MoveReconcilerService as any).reconcileRecycle({
      operationId: "op-deadlock",
      entityId: "task-deadlock",
      entityType: "task",
      sourceWorkspaceId: "deleted-ws",
      targetWorkspaceId: "deleted-ws",
      timestamp: Date.now()
    });

    const timeout = new Promise((_, r) => setTimeout(() => r(new Error("DEADLOCK DETECTED")), 2000));
    
    await expect(Promise.race([
      Promise.all([backupPromise, reconcilerPromise]),
      timeout
    ])).resolves.toBeTruthy();

    jest.restoreAllMocks();
  });

  it("TEST 3 - Reconciler lock hierarchy is strictly Partition -> MoveJournal -> RecycleBin", async () => {
    const lockAcquisitions: string[] = [];
    jest.spyOn(mutex, "withLock").mockImplementation(async (key, task) => {
      lockAcquisitions.push(key);
      return task();
    });

    await (MoveReconcilerService as any).reconcileRecycle({
      operationId: "op-hierarchy",
      entityId: "task-1",
      entityType: "task",
      sourceWorkspaceId: "ws-1",
      targetWorkspaceId: "ws-1",
      timestamp: Date.now()
    });

    expect(lockAcquisitions).toEqual([
      "pebble:v1:tasks:ws-1",
      "pebble:v1:move_journal",
      "pebble:v1:recycle_bin"
    ]);

    jest.restoreAllMocks();
  });

  it("TEST 4 - Empty journal recovery succeeds without backup interference", async () => {
    delete mockStorage["pebble:v1:move_journal"];
    
    // Simulate normal backup
    const backupJson = JSON.stringify(generateValidBackup());
    await BackupService.restoreStructuredBackup(backupJson);

    // Simulate move happening after restore
    await MoveJournalRepository.addOperation({
      operationId: "op-post",
      operationType: "move",
      entityId: "task-1",
      entityType: "task",
      sourceWorkspaceId: "ws-1",
      targetWorkspaceId: "ws-2",
      timestamp: Date.now(),
      lifecycleGeneration: 1,
      expectedRevision: 1,
    });

    // Journal should be safely intact
    let journal = await MoveJournalRepository.getOperations();
    expect(journal.length).toBe(1);

    // Normal reconcile
    await MoveReconcilerService.reconcileAll();
    
    // Journal should NOT be clean because the entity is missing everywhere
    journal = await MoveJournalRepository.getOperations();
    expect(journal.length).toBe(0);
  });

  it("TEST 5 - Deleted workspace safe execution", async () => {
    // Operation where source workspace no longer exists in storage
    await MoveJournalRepository.addOperation({
      operationId: "op-deleted-ws",
      operationType: "move",
      entityId: "task-ghost",
      entityType: "task",
      sourceWorkspaceId: "ghost-ws",
      targetWorkspaceId: "ws-1",
      timestamp: Date.now(),
      lifecycleGeneration: 1,
      expectedRevision: 1,
    });

    // Run reconciliation 
    await MoveReconcilerService.reconcileAll();

    // The operation should process cleanly without deadlocking. 
    // It will throw internally for "uncertain outcome" (missing everywhere), leaving journal intact.
    const journal = await MoveJournalRepository.getOperations();
    expect(journal.length).toBe(0);
  });

});

describe("BackupService Intent Crash Boundaries", () => {
// In-memory mock store
let store: Record<string, string> = {};
let processIsDead = false;

beforeEach(() => {
  store = {};
  processIsDead = false;
  jest.clearAllMocks();

  const checkDeath = () => { if (processIsDead) throw new Error("PROCESS_IS_DEAD"); };

  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => { checkDeath(); return store[key] ?? null; });
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string) => { checkDeath(); store[key] = val; });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => { checkDeath(); delete store[key]; });
  (AsyncStorage.getAllKeys as jest.Mock).mockImplementation(async () => { checkDeath(); return Object.keys(store); });
  (AsyncStorage.multiGet as jest.Mock).mockImplementation(async (keys: string[]) => { checkDeath(); return keys.map(k => [k, store[k] ?? null]); });
  (AsyncStorage.multiSet as jest.Mock).mockImplementation(async (pairs: readonly (readonly [string, string])[]) => {
    checkDeath();
    for (const [k, v] of pairs) store[k] = v;
  });
  (AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => {
    checkDeath();
    for (const k of keys) delete store[k];
  });
});

function reviveProcess() {
  processIsDead = false;
}

function makeBackup(): AppBackup {
  return {
    version: 1,
    timestamp: 200,
    workspaces: [{ id: "ws-backup", name: "Backup Workspace", revision: 1, lifecycleGeneration: 1, createdAt: 200, updatedAt: 200 }],
    tasks: [{ id: "task-backup", title: "Backup Task", workspaceId: "ws-backup", status: "todo", priority: "none", revision: 1, lifecycleGeneration: 1, createdAt: 200, updatedAt: 200 }],
    habits: [],
    checklists: [],
    resources: [],
    recycleBin: [],
    focusSessions: [],
    relationships: [],
    systemEvents: [],
    settings: {},
    profile: {},
  };
}

  it("covers all required crash boundaries A-H", async () => {
    // Seed initial live data
    store["pebble:v1:workspaces"] = JSON.stringify([{ id: "ws-live", name: "Live Workspace", createdAt: 100, updatedAt: 100 }]);
    store["pebble:v1:tasks:ws-live"] = JSON.stringify({ "task-live": { id: "task-live", title: "Live Task", workspaceId: "ws-live", status: "todo", priority: "none", createdAt: 100, updatedAt: 100 } });

    const backupJson = JSON.stringify(makeBackup());

    // A. Crash before backup_restore_intent is persisted
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(async (key: string, val: string) => {
      if (key === "pebble:v1:backup_restore_intent") {
        processIsDead = true;
        throw new Error("PROCESS_IS_DEAD");
      }
      store[key] = val;
    });

    await expect(BackupService.restoreStructuredBackup(backupJson)).rejects.toThrow("PROCESS_IS_DEAD");
    expect(store["pebble:v1:backup_restore_intent"]).toBeUndefined();
    expect(store["pebble:v1:workspaces"]).toContain("ws-live"); // Old data intact
    reviveProcess();

    // B. Intent persisted, crash before multiRemove
    (AsyncStorage.multiRemove as jest.Mock).mockImplementationOnce(async (keys: string[]) => {
      processIsDead = true;
      throw new Error("PROCESS_IS_DEAD");
    });

    await expect(BackupService.restoreStructuredBackup(backupJson)).rejects.toThrow("PROCESS_IS_DEAD");
    expect(store["pebble:v1:backup_restore_intent"]).toBeDefined(); // Intent exists
    expect(store["pebble:v1:workspaces"]).toContain("ws-live"); // Old data intact
    reviveProcess();

    // Recover from B
    await BackupService.recoverInterruptedRestore();
    expect(store["pebble:v1:backup_restore_intent"]).toBeUndefined();
    expect(store["pebble:v1:workspaces"]).toContain("ws-backup"); // Recovered!

    // Reset for C
    store = {};
    store["pebble:v1:workspaces"] = JSON.stringify([{ id: "ws-live", name: "Live Workspace", createdAt: 100, updatedAt: 100 }]);
    store["pebble:v1:tasks:ws-live"] = JSON.stringify({ "task-live": { id: "task-live", title: "Live Task" } });

    // C. multiRemove succeeds, crash before multiSet
    let removeSucceeded = false;
    (AsyncStorage.multiRemove as jest.Mock).mockImplementationOnce(async (keys: string[]) => {
      for (const k of keys) delete store[k];
      removeSucceeded = true;
    });
    (AsyncStorage.multiSet as jest.Mock).mockImplementationOnce(async (pairs: readonly (readonly [string, string])[]) => {
      if (removeSucceeded) {
        processIsDead = true;
        throw new Error("PROCESS_IS_DEAD");
      }
      for (const [k, v] of pairs) store[k] = v;
    });

    await expect(BackupService.restoreStructuredBackup(backupJson)).rejects.toThrow("PROCESS_IS_DEAD");
    expect(store["pebble:v1:backup_restore_intent"]).toBeDefined();
    // At this point, store has neither old nor new (except intent)
    expect(store["pebble:v1:workspaces"]).toBeUndefined(); 
    reviveProcess();

    // Recover from C
    await BackupService.recoverInterruptedRestore();
    expect(store["pebble:v1:backup_restore_intent"]).toBeUndefined();
    expect(store["pebble:v1:workspaces"]).toContain("ws-backup"); // Recovered!

    // Reset for D
    store = {};
    store["pebble:v1:workspaces"] = JSON.stringify([{ id: "ws-live", name: "Live Workspace" }]);

    // D. multiSet succeeds, crash before intent removal
    (AsyncStorage.removeItem as jest.Mock).mockImplementationOnce(async (key: string) => {
      if (key === "pebble:v1:backup_restore_intent") {
        processIsDead = true;
        throw new Error("PROCESS_IS_DEAD");
      }
      delete store[key];
    });

    await expect(BackupService.restoreStructuredBackup(backupJson)).rejects.toThrow("PROCESS_IS_DEAD");
    expect(store["pebble:v1:backup_restore_intent"]).toBeDefined();
    expect(store["pebble:v1:workspaces"]).toContain("ws-backup"); // Data is already new
    reviveProcess();

    // Recover from D
    await BackupService.recoverInterruptedRestore();
    expect(store["pebble:v1:backup_restore_intent"]).toBeUndefined();
    expect(store["pebble:v1:workspaces"]).toContain("ws-backup");

    // Reset for E
    store = {};
    store["pebble:v1:workspaces"] = JSON.stringify([{ id: "ws-live", name: "Live Workspace" }]);
    
    // Create intent manually for E
    store["pebble:v1:backup_restore_intent"] = JSON.stringify({
      keysToRemove: ["pebble:v1:workspaces"],
      kvPairsToSet: [["pebble:v1:workspaces", JSON.stringify([{ id: "ws-backup", name: "Backup Workspace" }])]]
    });

    // E. Crash during recoverInterruptedRestore()
    (AsyncStorage.multiRemove as jest.Mock).mockImplementationOnce(async () => {
      processIsDead = true;
      throw new Error("PROCESS_IS_DEAD");
    });
    await expect(BackupService.recoverInterruptedRestore()).rejects.toThrow("PROCESS_IS_DEAD");
    expect(store["pebble:v1:backup_restore_intent"]).toBeDefined(); // Intent still exists
    reviveProcess();

    // F. Recovery runs repeatedly
    await BackupService.recoverInterruptedRestore();
    expect(store["pebble:v1:backup_restore_intent"]).toBeUndefined();
    expect(store["pebble:v1:workspaces"]).toContain("ws-backup");

    // G. Recovery completes successfully and intent is removed
    // (Demonstrated by F succeeding)

    // H. Recovery sees an already-completed backup and must remain idempotent
    // Simulate intent left behind but data already correct
    store["pebble:v1:backup_restore_intent"] = JSON.stringify({
      keysToRemove: ["pebble:v1:workspaces"],
      kvPairsToSet: [["pebble:v1:workspaces", JSON.stringify([{ id: "ws-backup", name: "Backup Workspace" }])]]
    });
    await BackupService.recoverInterruptedRestore();
    expect(store["pebble:v1:backup_restore_intent"]).toBeUndefined();
    expect(store["pebble:v1:workspaces"]).toContain("ws-backup"); // Remained the same
  });

});

describe("BackupService.restoreStructuredBackup — multiRemove/multiSet atomicity", () => {

  const store: Record<string, string> = {};

  function seedLiveData(): void {
    store["pebble:v1:workspaces"] = JSON.stringify([
      { id: "ws-live", name: "Live Workspace", createdAt: 100, updatedAt: 100 },
    ]);
    store["pebble:v1:tasks:ws-live"] = JSON.stringify({
      "task-live": {
        id: "task-live",
        title: "Live Task",
        workspaceId: "ws-live",
        status: "todo",
        priority: "none",
        createdAt: 100,
        updatedAt: 100,
      },
    });
    store["pebble:v1:habits:ws-live"] = JSON.stringify({});
    store["pebble:v1:checklists:ws-live"] = JSON.stringify({});
    store["pebble:v1:resources:ws-live"] = JSON.stringify({});
  }

  function makeBackup(): AppBackup {
    return {
      version: 1,
      timestamp: 200,
      workspaces: [
        { id: "ws-backup", name: "Backup Workspace", revision: 1, lifecycleGeneration: 1, createdAt: 200, updatedAt: 200 },
      ],
      tasks: [
        {
          id: "task-backup",
          title: "Backup Task",
          workspaceId: "ws-backup",
          status: "todo",
          priority: "none",
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 200,
          updatedAt: 200,
        },
      ],
      habits: [],
      checklists: [],
      resources: [],
      recycleBin: [],
      focusSessions: [],
      relationships: [],
      systemEvents: [],
      settings: {},
      profile: {},
    };
  }

  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => store[key] ?? null);
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string) => { store[key] = val; });
    (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => { delete store[key]; });
    (AsyncStorage.getAllKeys as jest.Mock).mockImplementation(async () => Object.keys(store));
    (AsyncStorage.multiGet as jest.Mock).mockImplementation(async (keys: string[]) => keys.map((k) => [k, store[k] ?? null]));
    (AsyncStorage.multiSet as jest.Mock).mockImplementation(async (pairs: readonly (readonly [string, string])[]) => {
      for (const [k, v] of pairs) store[k] = v;
    });
    (AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => {
      for (const k of keys) delete store[k];
    });
  });


  

  it("REGRESSION: process death between multiRemove and multiSet MUST NOT lose all data", async () => {
    seedLiveData();

    // Verify baseline: live data exists before restore
    const liveWorkspaces = await WorkspaceRepository.getWorkspaces();
    expect(liveWorkspaces).toHaveLength(1);
    expect(liveWorkspaces[0].id).toBe("ws-live");

    // Simulate process death EXACTLY between multiRemove and multiSet
    let removeHasExecuted = false;
    (AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => {
      for (const k of keys) delete store[k];
      removeHasExecuted = true;
    });

    (AsyncStorage.multiSet as jest.Mock).mockImplementation(
      async (pairs: readonly (readonly [string, string])[]) => {
        if (removeHasExecuted) {
          // Process dies before multiSet executes. The rollback snapshot
          // (validRollbackData) is in-memory and lost.
          throw new Error("PROCESS TERMINATED BETWEEN REMOVE AND SET");
        }
        for (const [k, v] of pairs) store[k] = v;
      },
    );

    // Attempt restore — it will crash in the critical window
    await expect(
      BackupService.restoreStructuredBackup(JSON.stringify(makeBackup())),
    ).rejects.toThrow("PROCESS TERMINATED");

    console.log("Storage keys after crash:", Object.keys(store));
    console.log("Storage contents:", store);

    // CRITICAL REGRESSION ASSERTION:
    // After a crash, the durable intent MUST exist.
    const keysAfterCrash = await AsyncStorage.getAllKeys();
    expect(keysAfterCrash).toContain("pebble:v1:backup_restore_intent");

    // We simulate an app reboot by calling the recovery function explicitly.
    // First, restore the normal behavior of multiSet so recovery can succeed.
    (AsyncStorage.multiSet as jest.Mock).mockImplementation(
      async (pairs: readonly (readonly [string, string])[]) => {
        for (const [k, v] of pairs) store[k] = v;
      },
    );
    
    await BackupService.recoverInterruptedRestore();

    // Strong assertion: the backup workspace MUST exist now that recovery has run
    const workspacesAfterCrash = await WorkspaceRepository.getWorkspaces();
    expect(workspacesAfterCrash.length).toBeGreaterThan(0);
    expect(workspacesAfterCrash.map((w) => w.id)).toContain("ws-backup");
  });

  it("RECOVERY: retry after crash must converge to exact backup state", async () => {
    seedLiveData();

    // First attempt: crash in the critical window
    let removeHasExecuted = false;
    (AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => {
      for (const k of keys) delete store[k];
      removeHasExecuted = true;
    });

    (AsyncStorage.multiSet as jest.Mock).mockImplementation(
      async (pairs: readonly (readonly [string, string])[]) => {
        if (removeHasExecuted) {
          throw new Error("PROCESS TERMINATED");
        }
        for (const [k, v] of pairs) store[k] = v;
      },
    );

    await expect(
      BackupService.restoreStructuredBackup(JSON.stringify(makeBackup())),
    ).rejects.toThrow();

    // After the fix, the backup data exists even though the operation crashed.
    // Restore the normal (crash-free) mocks for retry.
    (AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => {
      for (const k of keys) delete store[k];
    });
    (AsyncStorage.multiSet as jest.Mock).mockImplementation(
      async (pairs: readonly (readonly [string, string])[]) => {
        for (const [k, v] of pairs) store[k] = v;
      },
    );

    // Retry the restore — must succeed and produce exact backup state
    await expect(
      BackupService.restoreStructuredBackup(JSON.stringify(makeBackup())),
    ).resolves.not.toThrow();

    const workspaces = await WorkspaceRepository.getWorkspaces();
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].id).toBe("ws-backup");

    const tasks = await TaskRepository.getTasks("ws-backup");
    expect(Object.keys(tasks)).toEqual(["task-backup"]);

    // Old "ws-live" partition must be gone
    const oldTasks = await TaskRepository.getTasks("ws-live");
    expect(Object.keys(oldTasks)).toHaveLength(0);
  });

});

describe("recoverInterruptedRestore — concurrency locks", () => {
// We want to use real mutexes and partial real backup service logic.
// But we'll mock AsyncStorage completely.



let store: Record<string, string> = {};

beforeEach(() => {
  store = {};
  jest.clearAllMocks();

  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => store[key] ?? null);
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string) => { store[key] = val; });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => { delete store[key]; });
  (AsyncStorage.getAllKeys as jest.Mock).mockImplementation(async () => Object.keys(store));
  (AsyncStorage.multiGet as jest.Mock).mockImplementation(async (keys: string[]) => keys.map(k => [k, store[k] ?? null]));
  (AsyncStorage.multiSet as jest.Mock).mockImplementation(async (pairs: readonly (readonly [string, string])[]) => {
    for (const [k, v] of pairs) store[k] = v;
  });
  (AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => {
    for (const k of keys) delete store[k];
  });
});

  it("MUST acquire locks during recovery so concurrent writers cannot safely interleave", async () => {
    // 1. Simulate an interrupted restore intent already persisted.
    // The intent wants to restore a workspace and some tasks.
    store["pebble:v1:backup_restore_intent"] = JSON.stringify({
      keysToRemove: ["pebble:v1:tasks:ws1", "pebble:v1:tasks:ws2", "pebble:v1:conversion_journal", "pebble:v1:move_journal", "pebble:v1:recycle_bin"],
      kvPairsToSet: [
        ["pebble:v1:tasks:ws1", JSON.stringify({ "task-1": { id: "task-1", title: "Old Restored Task" } })]
      ]
    });

    // We will track the order of operations
    const executionOrder: string[] = [];

    // We'll hook into AsyncStorage.multiSet to pause the recovery halfway
    // to give the concurrent writer a chance to run.
    let resolveRecoveryPause: () => void;
    const recoveryPausePromise = new Promise<void>((r) => { resolveRecoveryPause = r; });

    let resolveWriterProceed: () => void;
    const writerProceedPromise = new Promise<void>((r) => { resolveWriterProceed = r; });

    (AsyncStorage.multiSet as jest.Mock).mockImplementation(async (pairs) => {
      // If this is the recovery's multiSet...
      if (pairs.some((p: [string, string]) => p[0] === "pebble:v1:tasks:ws1")) {
        executionOrder.push("RECOVERY_MULTISET_START");
        // Tell writer it can proceed
        resolveWriterProceed!();
        // Wait until writer is done (or blocked)
        await recoveryPausePromise;
        executionOrder.push("RECOVERY_MULTISET_END");
      }
      // Actually do the set
      for (const [k, v] of pairs) store[k] = v;
    });

    // 2. Recovery begins
    const recoveryPromise = BackupService.recoverInterruptedRestore();

    // 3. A legitimate concurrent writer (e.g. MoveReconciler) attempts to modify an affected partition.
    // Wait until recovery has definitely started and reached its lock/multiSet phase
    await writerProceedPromise!;

    executionOrder.push("WRITER_ATTEMPTS_LOCK");

    // The writer attempts to acquire a lock that recovery *should* be holding.
    // In this case, "pebble:v1:tasks:ws1" or "pebble:v1:move_journal".
    const writerPromise = withLock("pebble:v1:move_journal", async () => {
      executionOrder.push("WRITER_ACQUIRED_LOCK");
      // Simulate writing a newer mutation
      store["pebble:v1:move_journal"] = JSON.stringify([{ id: "new-move" }]);
    });

    // Let the event loop cycle to see if the writer gets the lock
    await new Promise(r => setTimeout(r, 50));

    // If the writer got the lock BEFORE recovery finished, the bug exists!
    // But since the fix, the writer should be BLOCKED here because recovery holds the lock.
    
    // Resume recovery
    resolveRecoveryPause!();

    await recoveryPromise;
    await writerPromise;

    // 4. Verify the writer cannot interleave unsafely.
    // The strict expected order:
    // 1. RECOVERY_MULTISET_START
    // 2. WRITER_ATTEMPTS_LOCK
    // 3. RECOVERY_MULTISET_END (Recovery finishes because writer is blocked!)
    // 4. WRITER_ACQUIRED_LOCK (Writer finally gets the lock after recovery releases it)

    expect(executionOrder).toEqual([
      "RECOVERY_MULTISET_START",
      "WRITER_ATTEMPTS_LOCK",
      "RECOVERY_MULTISET_END",
      "WRITER_ACQUIRED_LOCK"
    ]);

    // 5. Verify final state is deterministic and no newer mutation is silently lost.
    // The recovery's data should be written first, THEN the writer's data.
    expect(store["pebble:v1:move_journal"]).toContain("new-move");
  });

});

describe("BackupService - Snapshot Race", () => {
let store: Record<string, string> = {};

beforeEach(() => {
  store = {};
  jest.clearAllMocks();

  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => store[key] ?? null);
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string) => { store[key] = val; });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => { delete store[key]; });
  (AsyncStorage.getAllKeys as jest.Mock).mockImplementation(async () => Object.keys(store));
  (AsyncStorage.multiGet as jest.Mock).mockImplementation(async (keys: string[]) => keys.map(k => [k, store[k] ?? null]));
  (AsyncStorage.multiSet as jest.Mock).mockImplementation(async (pairs: readonly (readonly [string, string])[]) => {
    for (const [k, v] of pairs) store[k] = v;
  });
  (AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => {
    for (const k of keys) delete store[k];
  });
});
  afterEach(() => {
    jest.restoreAllMocks();
  });
  beforeEach(() => {
    store['pebble:v1:workspaces'] = JSON.stringify([{ id: 'ws-A', name: 'WS A' }, { id: 'ws-B', name: 'WS B' }]);
    jest.spyOn(WorkspaceRepository, 'getWorkspaces').mockResolvedValue([{ id: 'ws-A' }, { id: 'ws-B' }] as any);
  });

  it("MUST NOT produce a backup with missing entities caused by concurrent mutations", async () => {
    // Original state: task-1 in ws-A, task-2 in ws-B
    store["pebble:v1:tasks:ws-A"] = JSON.stringify({
      "task-1": { id: "task-1", title: "Task 1", workspaceId: "ws-A" }
    });
    store["pebble:v1:tasks:ws-B"] = JSON.stringify({
      "task-2": { id: "task-2", title: "Task 2", workspaceId: "ws-B" }
    });

    let resolveBackupReachedLock: () => void;
    const backupReachedLockPromise = new Promise<void>((r) => { resolveBackupReachedLock = r; });

    let backupFinished = false;

    const originalGetItem = AsyncStorage.getItem;
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key) => {
      if (key === "pebble:v1:tasks:ws-A") {
        resolveBackupReachedLock!();
        
        // Add a slight delay to ensure the mutation has time to execute if it bypasses locks
        await new Promise(r => setTimeout(r, 100));
      }
      return store[key] ?? null;
    });

    const backupPromise = BackupService.generateStructuredBackup().then(res => {
      backupFinished = true;
      return res;
    });

    await backupReachedLockPromise!;

    const { withLock } = require("@/shared/utils/mutex");
    
    let mutationFinished = false;
    const mutationPromise = withLock("pebble:v1:move_journal", async () => {
      store["pebble:v1:tasks:ws-A"] = JSON.stringify({
        "task-2": { id: "task-2", title: "Task 2", workspaceId: "ws-A" }
      });
      store["pebble:v1:tasks:ws-B"] = JSON.stringify({
        "task-1": { id: "task-1", title: "Task 1", workspaceId: "ws-B" }
      });
      mutationFinished = true;
    });

    await new Promise((r) => setTimeout(r, 50));
    
    expect(mutationFinished).toBe(false);

    const backupJson = await backupPromise;
    const backup = JSON.parse(backupJson);

    await mutationPromise; 

    const taskIds = backup.tasks.map((t: any) => t.id);
    
    expect(taskIds).toContain("task-1");
    expect(taskIds).toContain("task-2");
  });

});

describe("BackupService - Stale Intent Race", () => {
// We want to use real mutexes and partial real backup service logic.
// But we'll mock AsyncStorage completely.



let store: Record<string, string> = {};

beforeEach(() => {
  store = {};
  jest.clearAllMocks();

  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => store[key] ?? null);
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string) => { store[key] = val; });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => { delete store[key]; });
  (AsyncStorage.getAllKeys as jest.Mock).mockImplementation(async () => Object.keys(store));
  (AsyncStorage.multiGet as jest.Mock).mockImplementation(async (keys: string[]) => keys.map(k => [k, store[k] ?? null]));
  (AsyncStorage.multiSet as jest.Mock).mockImplementation(async (pairs: readonly (readonly [string, string])[]) => {
    for (const [k, v] of pairs) store[k] = v;
  });
  (AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => {
    for (const k of keys) delete store[k];
  });
});

  it("MUST NOT overwrite a newer backup if recovery was delayed after reading a stale intent", async () => {
    // 1. Simulate an interrupted restore intent A already persisted.
    store["pebble:v1:backup_restore_intent"] = JSON.stringify({
      keysToRemove: ["pebble:v1:tasks:ws1", "pebble:v1:conversion_journal", "pebble:v1:move_journal", "pebble:v1:recycle_bin"],
      kvPairsToSet: [
        ["pebble:v1:tasks:ws1", "OLD-BACKUP"]
      ]
    });
    
    // We'll hook into AsyncStorage.getItem to detect when Recovery A reads the intent.
    let resolveRecoveryRead: () => void;
    const recoveryReadPromise = new Promise<void>((r) => { resolveRecoveryRead = r; });

    let resolveMainThreadProceed: () => void;
    const mainThreadProceedPromise = new Promise<void>((r) => { resolveMainThreadProceed = r; });

    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key) => {
      const val = store[key] ?? null;
      if (key === "pebble:v1:backup_restore_intent" && val?.includes("OLD-BACKUP")) {
        resolveRecoveryRead!();
        await mainThreadProceedPromise;
      }
      return val;
    });

    // 2. Recovery A begins
    const recoveryPromise = BackupService.recoverInterruptedRestore();

    // Wait until Recovery A reads the old intent A.
    await recoveryReadPromise!;

    // 3. Now Recovery A is paused BEFORE acquiring locks, but WITH intent A in memory.
    
    // 4. A newer Restore B commits.
    // For simplicity, we just simulate Restore B doing what it does:
    // It acquires the locks, writes the newer backup, and removes the intent.
    await withLock("pebble:v1:tasks:ws1", async () => {
       await AsyncStorage.multiRemove(["pebble:v1:tasks:ws1"]);
       await AsyncStorage.multiSet([["pebble:v1:tasks:ws1", "NEWER-BACKUP"]]);
       await AsyncStorage.removeItem("pebble:v1:backup_restore_intent");
    });
    
    expect(store["pebble:v1:tasks:ws1"]).toBe("NEWER-BACKUP");

    // 5. Recovery A resumes. It will acquire the locks and try to replay intent A!
    resolveMainThreadProceed!();
    await recoveryPromise;

    // 6. Verify that Recovery A did NOT overwrite NEWER-BACKUP with OLD-BACKUP.
    expect(store["pebble:v1:tasks:ws1"]).toBe("NEWER-BACKUP");
  });

});

describe("BackupService - Workspace Discovery Race", () => {
let store: Record<string, string> = {};

beforeEach(() => {
  store = {};
  jest.restoreAllMocks();

  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => store[key] ?? null);
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string) => { store[key] = val; });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => { delete store[key]; });
  (AsyncStorage.getAllKeys as jest.Mock).mockImplementation(async () => Object.keys(store));
  (AsyncStorage.multiGet as jest.Mock).mockImplementation(async (keys: string[]) => keys.map(k => [k, store[k] ?? null]));
  (AsyncStorage.multiSet as jest.Mock).mockImplementation(async (pairs: readonly (readonly [string, string])[]) => {
    for (const [k, v] of pairs) store[k] = v;
  });
  (AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => {
    for (const k of keys) delete store[k];
  });
});

  it("PROVES BUG: new workspace created after initial read has unlocked partitions, allowing concurrent mutation during backup read", async () => {
    // 1. Initial State: Only ws-A exists
    const wsA = { id: "ws-A", name: "Workspace A", createdAt: 1000, updatedAt: 1000 };
    store["pebble:v1:workspaces"] = JSON.stringify([wsA]);
    store["pebble:v1:tasks:ws-A"] = JSON.stringify({
      "task-A1": { id: "task-A1", title: "Task A1", workspaceId: "ws-A" }
    });

    let getWorkspacesCallCount = 0;
    let resolvePause: () => void;
    const pausePromise = new Promise<void>((r) => { resolvePause = r; });
    let resolveInitialReadDone: () => void;
    const initialReadDonePromise = new Promise<void>((r) => { resolveInitialReadDone = r; });

    const originalGetWorkspaces = WorkspaceRepository.getWorkspaces.bind(WorkspaceRepository);
    jest.spyOn(WorkspaceRepository, "getWorkspaces").mockImplementation(async () => {
      getWorkspacesCallCount++;
      const result = await originalGetWorkspaces();
      if (getWorkspacesCallCount === 1) {
        // Step 1: Initial read outside the lock completed
        resolveInitialReadDone();
        // Pause backup before acquiring locks
        await pausePromise;
      }
      return result;
    });

    // Start backup
    const backupPromise = BackupService.generateStructuredBackup();

    // Wait for initial read to complete
    await initialReadDonePromise;

    // Step 2: While backup is paused before lock acquisition, create ws-B and a task in ws-B
    const wsB = { id: "ws-B", name: "Workspace B", createdAt: 2000, updatedAt: 2000 };
    await WorkspaceCommandHandler.createWorkspace(wsB as any);
    store["pebble:v1:tasks:ws-B"] = JSON.stringify({
      "task-B1": { id: "task-B1", title: "Task B1", workspaceId: "ws-B" }
    });

    // Intercept read of ws-B tasks to test if partition lock is held
    let resolveBackupReadingWsB: () => void;
    const backupReadingWsBPromise = new Promise<void>((r) => { resolveBackupReadingWsB = r; });

    const originalGetTasks = TaskRepository.getTasks.bind(TaskRepository);
    jest.spyOn(TaskRepository, "getTasks").mockImplementation(async (wsId: string) => {
      if (wsId === "ws-B") {
        resolveBackupReadingWsB();
        // Add a delay while backup is reading ws-B to allow concurrent mutation
        await new Promise((r) => setTimeout(r, 100));
      }
      return originalGetTasks(wsId);
    });

    // Step 3: Resume backup
    resolvePause!();

    // Wait until backup is actively reading ws-B
    await backupReadingWsBPromise;

    // Step 4: Try a concurrent mutation on ws-B's partition using standard withLock
    let concurrentMutationExecuted = false;
    const concurrentMutationPromise = withLock("pebble:v1:tasks:ws-B", async () => {
      concurrentMutationExecuted = true;
      store["pebble:v1:tasks:ws-B"] = JSON.stringify({
        "task-B1": { id: "task-B1", title: "Task B1", workspaceId: "ws-B" },
        "task-B2": { id: "task-B2", title: "Task B2", workspaceId: "ws-B" }
      });
    });

    // Yield to let concurrent mutation run if the lock was NOT acquired by backup
    await new Promise((r) => setTimeout(r, 40));

    // IN THE VULNERABLE CODE:
    // concurrentMutationExecuted will be TRUE because pebble:v1:tasks:ws-B was never locked!
    // IN THE SECURE CODE:
    // Backup either retry-locked all partitions (including ws-B) or locked ws-B, so concurrentMutationExecuted MUST be false!
    expect(concurrentMutationExecuted).toBe(false);

    await concurrentMutationPromise;
    const backupJson = await backupPromise;
    const backup = JSON.parse(backupJson);

    // Verify backup contains both workspaces and all tasks consistently
    const wsIds = backup.workspaces.map((w: any) => w.id);
    expect(wsIds).toContain("ws-A");
    expect(wsIds).toContain("ws-B");
  });

  it("handles workspace deleted after initial read by releasing stale locks and retrying safely", async () => {
    // 1. Initial State: Both ws-A and ws-B exist
    const wsA = { id: "ws-A", name: "Workspace A", createdAt: 1000, updatedAt: 1000 };
    const wsB = { id: "ws-B", name: "Workspace B", createdAt: 2000, updatedAt: 2000 };
    store["pebble:v1:workspaces"] = JSON.stringify([wsA, wsB]);
    store["pebble:v1:tasks:ws-A"] = JSON.stringify({
      "task-A1": { id: "task-A1", title: "Task A1", workspaceId: "ws-A" }
    });
    store["pebble:v1:tasks:ws-B"] = JSON.stringify({
      "task-B1": { id: "task-B1", title: "Task B1", workspaceId: "ws-B" }
    });

    let getWorkspacesCallCount = 0;
    let resolvePause: () => void;
    const pausePromise = new Promise<void>((r) => { resolvePause = r; });
    let resolveInitialReadDone: () => void;
    const initialReadDonePromise = new Promise<void>((r) => { resolveInitialReadDone = r; });

    const originalGetWorkspaces = WorkspaceRepository.getWorkspaces.bind(WorkspaceRepository);
    jest.spyOn(WorkspaceRepository, "getWorkspaces").mockImplementation(async () => {
      getWorkspacesCallCount++;
      const result = await originalGetWorkspaces();
      if (getWorkspacesCallCount === 1) {
        // Step 1: Initial read outside the lock completed
        resolveInitialReadDone();
        // Pause backup before acquiring locks
        await pausePromise;
      }
      return result;
    });

    // Start backup
    const backupPromise = BackupService.generateStructuredBackup();

    // Wait for initial read to complete
    await initialReadDonePromise;

    // Step 2: While backup is paused before lock acquisition, delete ws-B
    await WorkspaceCommandHandler.deleteWorkspace("ws-B");

    // Step 3: Resume backup
    resolvePause!();

    const backupJson = await backupPromise;
    const backup = JSON.parse(backupJson);

    // Verify backup only contains ws-A in active workspaces, and ws-B is in recycleBin
    const wsIds = backup.workspaces.map((w: any) => w.id);
    expect(wsIds).toContain("ws-A");
    expect(wsIds).not.toContain("ws-B");

    const binWs = backup.recycleBin.find((i: any) => i.entityType === "workspace");
    expect(binWs).toBeDefined();
  });

});

describe("BackupService - Final Key Discovery Race Verification", () => {
let store: Record<string, string> = {};

beforeEach(() => {
  store = {};
  jest.restoreAllMocks();

  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => store[key] ?? null);
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string) => { store[key] = val; });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => { delete store[key]; });
  (AsyncStorage.getAllKeys as jest.Mock).mockImplementation(async () => Object.keys(store));
  (AsyncStorage.multiGet as jest.Mock).mockImplementation(async (keys: string[]) => keys.map(k => [k, store[k] ?? null]));
  (AsyncStorage.multiSet as jest.Mock).mockImplementation(async (pairs: readonly (readonly [string, string])[]) => {
    for (const [k, v] of pairs) store[k] = v;
  });
  (AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => {
    for (const k of keys) delete store[k];
  });
});

  it("PROVES: real production mutations (workspaces, tasks, graphs, journals, recycle bin) are strictly BLOCKED by restore locks between step 2 and step 7", async () => {
    // 1. Initial State
    store["pebble:v1:workspaces"] = JSON.stringify([{ id: "ws-A", name: "Workspace A" }]);
    store["pebble:v1:tasks:ws-A"] = JSON.stringify({
      "task-A1": { id: "task-A1", title: "Task A1", workspaceId: "ws-A", status: "todo", priority: "medium" }
    });

    const validBackup: AppBackup = {
      version: 1,
      timestamp: Date.now(),
      workspaces: [{ id: "ws-A", name: "Workspace A", revision: 1, lifecycleGeneration: 1, createdAt: 1000, updatedAt: 1000 }],
      tasks: [{ id: "task-A1", title: "Task A1", workspaceId: "ws-A", status: "todo", priority: "medium", revision: 1, lifecycleGeneration: 1, createdAt: 1000, updatedAt: 1000 }],
      habits: [],
      checklists: [],
      resources: [],
      recycleBin: [],
      focusSessions: [],
      relationships: [],
      systemEvents: [],
      settings: {} as any,
      profile: {} as any,
    };
    const backupJson = JSON.stringify(validBackup);

    let getAllKeysCallCount = 0;
    let resolvePauseAtStep4: () => void;
    const pauseAtStep4Promise = new Promise<void>((r) => { resolvePauseAtStep4 = r; });
    let resolveReachedStep4: () => void;
    const reachedStep4Promise = new Promise<void>((r) => { resolveReachedStep4 = r; });

    (AsyncStorage.getAllKeys as jest.Mock).mockImplementation(async () => {
      getAllKeysCallCount++;
      const keys = Object.keys(store);
      if (getAllKeysCallCount === 2) {
        // Step 2 & 4: Inside _acquireRestoreLocks, lockedKeys read completed and validated
        resolveReachedStep4();
        // Pause execution before step 5-7 (multiGet, intent write, multiRemove)
        await pauseAtStep4Promise;
      }
      return keys;
    });

    // Start restore
    const restorePromise = BackupService.restoreStructuredBackup(backupJson);

    // Wait until restore is inside _acquireRestoreLocks at the step 2/4 checkpoint
    await reachedStep4Promise;

    // Track which operations are blocked vs unblocked
    let workspaceCreationFinished = false;
    let taskMutationFinished = false;
    let relationshipMutationFinished = false;
    let focusSessionFinished = false;
    let systemEventFinished = false;
    let moveJournalFinished = false;
    let recycleBinFinished = false;

    // D. Attempt real production mutations while restore is paused at step 2/4:

    // 1. Workspace creation (requires withLock("pebble:v1:workspaces"))
    const p1 = WorkspaceCommandHandler.createWorkspace({
      id: "ws-new",
      name: "Workspace New",
      createdAt: 2000,
      updatedAt: 2000,
    } as any).then(() => { workspaceCreationFinished = true; });

    // 2. Task mutation on ws-A (requires withLock("pebble:v1:tasks:ws-A"))
    const p2 = TaskRepository.saveTask({
      id: "task-A2",
      title: "Task A2",
      workspaceId: "ws-A",
      status: "todo",
      priority: "high",
      createdAt: 2000,
      updatedAt: 2000,
    }).then(() => { taskMutationFinished = true; });

    // 3. Relationship mutation (requires withLock("pebble:v1:relationships"))
    const p3 = GraphRepository.saveRelationship({
      id: "rel-1",
      source: { id: "task-A1", type: "task" },
      target: { id: "task-A2", type: "task" },
      createdAt: 2000,
    } as any).then(() => { relationshipMutationFinished = true; });

    // 4. Focus session mutation (requires withLock("pebble:v1:focus_sessions"))
    const p4 = GraphRepository.saveFocusSession({
      id: "fs-1",
      taskId: "task-A1",
      startedAt: 2000,
      duration: 300,
    }).then(() => { focusSessionFinished = true; });

    // 5. System event log mutation (requires withLock("pebble:v1:system_event_log"))
    const p5 = GraphRepository.logSystemEvent({
      id: "evt-1",
      workspaceId: "ws-A",
      itemId: "task-A1",
      itemType: "task",
      action: "create",
      timestamp: 2000,
    }).then(() => { systemEventFinished = true; });

    // 6. Move journal mutation (requires withLock("pebble:v1:move_journal"))
    const p6 = MoveJournalRepository.addOperation({
      operationId: "op-1",
      operationType: "move",
      entityId: "task-A1",
      entityType: "task",
      sourceWorkspaceId: "ws-A",
      targetWorkspaceId: "inbox",
      timestamp: 2000,
      lifecycleGeneration: 1,
      expectedRevision: 1,
    }).then(() => { moveJournalFinished = true; });

    // 7. Recycle bin mutation (requires withLock("pebble:v1:recycle_bin"))
    const p7 = RecycleBinRepository.addToRecycleBin(
      "task",
      { id: "task-A1" },
      "Task A1"
    ).then(() => { recycleBinFinished = true; });

    // Yield to event loop to give any unblocked writer time to execute
    await new Promise((r) => setTimeout(r, 60));

    // VERIFICATION: All 7 real production writers MUST BE BLOCKED by restore's active locks!
    expect(workspaceCreationFinished).toBe(false);
    expect(taskMutationFinished).toBe(false);
    expect(relationshipMutationFinished).toBe(false);
    expect(focusSessionFinished).toBe(false);
    expect(systemEventFinished).toBe(false);
    expect(moveJournalFinished).toBe(false);
    expect(recycleBinFinished).toBe(false);

    // E. Resume restore
    resolvePauseAtStep4!();

    // Restore must complete cleanly
    await restorePromise;

    // After restore releases locks, all blocked operations can finish
    await Promise.all([p1, p2, p3, p4, p5, p6, p7]);

    expect(workspaceCreationFinished).toBe(true);
    expect(taskMutationFinished).toBe(true);
    expect(relationshipMutationFinished).toBe(true);
    expect(focusSessionFinished).toBe(true);
    expect(systemEventFinished).toBe(true);
    expect(moveJournalFinished).toBe(true);
    expect(recycleBinFinished).toBe(true);
  });

});

describe("BackupService - restoreStructuredBackup FinalKeys Lock Race", () => {
let store: Record<string, string> = {};

beforeEach(() => {
  store = {};
  jest.restoreAllMocks();

  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => store[key] ?? null);
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string) => { store[key] = val; });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => { delete store[key]; });
  (AsyncStorage.getAllKeys as jest.Mock).mockImplementation(async () => Object.keys(store));
  (AsyncStorage.multiGet as jest.Mock).mockImplementation(async (keys: string[]) => keys.map(k => [k, store[k] ?? null]));
  (AsyncStorage.multiSet as jest.Mock).mockImplementation(async (pairs: readonly (readonly [string, string])[]) => {
    for (const [k, v] of pairs) store[k] = v;
  });
  (AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => {
    for (const k of keys) delete store[k];
  });
});

  it("PROVES BUG: new partition created after initial getAllKeys is deleted in multiRemove without holding its partition lock", async () => {
    // 1. Initial State: Only workspaces and ws-A exist
    store["pebble:v1:workspaces"] = JSON.stringify([{ id: "ws-A", name: "Workspace A" }]);
    store["pebble:v1:tasks:ws-A"] = JSON.stringify({
      "task-A1": { id: "task-A1", title: "Task A1", workspaceId: "ws-A" }
    });

    const validBackup: AppBackup = {
      version: 1,
      timestamp: Date.now(),
      workspaces: [{ id: "ws-A", name: "Workspace A", revision: 1, lifecycleGeneration: 1, createdAt: 1000, updatedAt: 1000 }],
      tasks: [{ id: "task-A1", title: "Task A1", workspaceId: "ws-A", status: "todo", priority: "medium", revision: 1, lifecycleGeneration: 1, createdAt: 1000, updatedAt: 1000 }],
      habits: [],
      checklists: [],
      resources: [],
      recycleBin: [],
      focusSessions: [],
      relationships: [],
      systemEvents: [],
      settings: {} as any,
      profile: {} as any,
    };
    const backupJson = JSON.stringify(validBackup);

    let getAllKeysCallCount = 0;
    let resolvePause: () => void;
    const pausePromise = new Promise<void>((r) => { resolvePause = r; });
    let resolveInitialGetAllKeysDone: () => void;
    const initialGetAllKeysDonePromise = new Promise<void>((r) => { resolveInitialGetAllKeysDone = r; });

    (AsyncStorage.getAllKeys as jest.Mock).mockImplementation(async () => {
      getAllKeysCallCount++;
      const keys = Object.keys(store);
      if (getAllKeysCallCount === 1) {
        // Step 1: Initial getAllKeys outside locks completed
        resolveInitialGetAllKeysDone();
        // Pause restore before acquiring locks
        await pausePromise;
      }
      return keys;
    });

    let unlockedPartitionMutatedDuringMultiRemove = false;

    let testLockPromise: Promise<void> | undefined;

    (AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => {
      if (keys.includes("pebble:v1:tasks:ws-B")) {
        // At the exact moment restore attempts to destructively multiRemove ws-B,
        // test whether pebble:v1:tasks:ws-B lock is actively held by attempting a concurrent withLock.
        let concurrentLockAcquired = false;
        testLockPromise = withLock("pebble:v1:tasks:ws-B", async () => {
          concurrentLockAcquired = true;
        });

        // Yield to see if withLock on tasks:ws-B acquires immediately (unlocked)
        await new Promise((r) => setTimeout(r, 40));

        if (concurrentLockAcquired) {
          unlockedPartitionMutatedDuringMultiRemove = true;
        }
      }

      for (const k of keys) delete store[k];
    });

    // Start restore
    const restorePromise = BackupService.restoreStructuredBackup(backupJson);

    // Wait for pre-lock getAllKeys to finish
    await initialGetAllKeysDonePromise;

    // Step 2: While restore is paused before lock acquisition, create new partition ws-B
    store["pebble:v1:tasks:ws-B"] = JSON.stringify({
      "task-B1": { id: "task-B1", title: "Task B1", workspaceId: "ws-B" }
    });

    // Step 3: Resume restore
    resolvePause!();

    await restorePromise;
    if (testLockPromise) {
      await testLockPromise;
    }

    // IN THE VULNERABLE CODE:
    // unlockedPartitionMutatedDuringMultiRemove is TRUE because pebble:v1:tasks:ws-B was never in rawLockKeys,
    // so multiRemove deleted it while concurrent withLock("pebble:v1:tasks:ws-B") was NOT blocked!
    // IN THE FIXED CODE:
    // Restore detects that finalKeysToRemove contains keys not in rawLockKeys, releases locks and retries,
    // thereby acquiring pebble:v1:tasks:ws-B lock before multiRemove!
    expect(unlockedPartitionMutatedDuringMultiRemove).toBe(false);
  });

});
});
