/**
 * storageKeyRegistry.test.ts
 * ───────────────────────────
 * Guards the ownership contract in `services/storage/storage-keys.ts`:
 * every key constant Pebble persists must be registered, Clear All Data must
 * wipe all of them, and restore must follow the declared policy for keys the
 * structured v1 payload does not carry.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  BackupService,
  type AppBackup,
} from "@/services/storage/backup.service";
import {
  DASHBOARD_CATEGORY_STORAGE_KEY,
  DASHBOARD_FILTER_STORAGE_KEY,
  DASHBOARD_PRIORITY_STORAGE_KEY,
  DASHBOARD_SCHEDULE_STORAGE_KEY,
  DASHBOARD_SORT_STORAGE_KEY,
  DASHBOARD_STATUS_STORAGE_KEY,
  DASHBOARD_WORKSPACE_STORAGE_KEY,
  classifyKeyForRestore,
  getRestorePolicy,
  isEphemeralStorageKey,
  isPebbleOwnedKey,
  isPreservedOnRestore,
  PEBBLE_BACKUP_PAYLOAD_KEYS,
  PEBBLE_EXACT_OWNED_KEYS,
  PEBBLE_RESTORE_EPHEMERAL_KEYS,
  PEBBLE_RESTORE_PRESERVED_KEYS,
  PEBBLE_RESTORE_RESET_KEYS,
  RESTORE_INTENT_KEY,
} from "@/services/storage/storage-keys";
import {
  CHECKLISTS_STORAGE_KEY,
  COLLECTIONS_STORAGE_KEY,
  GRATITUDE_HISTORY_STORAGE_KEY,
  HISTORY_STORAGE_KEY,
  NOTIF_LOG_STORAGE_KEY,
  RECYCLE_BIN_STORAGE_KEY,
} from "@/services/storage/storage.service";
import { FOCUS_STATS_KEY } from "@/repositories/FocusStatsRepository";
import { ONBOARDING_COMPLETED_KEY } from "@/repositories/OnboardingRepository";
import { PROFILE_STORAGE_KEY } from "@/repositories/UserProfileRepository";
import { SETTINGS_STORAGE_KEY } from "@/repositories/SettingsRepository";
import { WIDGET_PAYLOAD_KEY } from "@/services/analytics/widget-data.service";
import { QUICK_SUGGESTIONS_SEEN_KEY } from "@/features/capture/services/quick-suggestions.service";
import {
  GEMS_BONUS_KEY,
  GEMS_SPENT_KEY,
  PEBBLE_LOG_KEY,
  PEBBLE_SPENT_KEY,
  STREAK_RECOVERIES_KEY,
} from "@/features/profile/services/pebble.service";

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

const DASHBOARD_KEYS = [
  DASHBOARD_FILTER_STORAGE_KEY,
  DASHBOARD_PRIORITY_STORAGE_KEY,
  DASHBOARD_WORKSPACE_STORAGE_KEY,
  DASHBOARD_CATEGORY_STORAGE_KEY,
  DASHBOARD_SCHEDULE_STORAGE_KEY,
  DASHBOARD_STATUS_STORAGE_KEY,
  DASHBOARD_SORT_STORAGE_KEY,
];

/** Every statically-exported key constant an owning module can persist to. */
const ALL_KEY_CONSTANTS: Array<[string, string]> = [
  ["DASHBOARD_FILTER_STORAGE_KEY", DASHBOARD_FILTER_STORAGE_KEY],
  ["DASHBOARD_PRIORITY_STORAGE_KEY", DASHBOARD_PRIORITY_STORAGE_KEY],
  ["DASHBOARD_WORKSPACE_STORAGE_KEY", DASHBOARD_WORKSPACE_STORAGE_KEY],
  ["DASHBOARD_CATEGORY_STORAGE_KEY", DASHBOARD_CATEGORY_STORAGE_KEY],
  ["DASHBOARD_SCHEDULE_STORAGE_KEY", DASHBOARD_SCHEDULE_STORAGE_KEY],
  ["DASHBOARD_STATUS_STORAGE_KEY", DASHBOARD_STATUS_STORAGE_KEY],
  ["DASHBOARD_SORT_STORAGE_KEY", DASHBOARD_SORT_STORAGE_KEY],
  ["HISTORY_STORAGE_KEY", HISTORY_STORAGE_KEY],
  ["NOTIF_LOG_STORAGE_KEY", NOTIF_LOG_STORAGE_KEY],
  ["RECYCLE_BIN_STORAGE_KEY", RECYCLE_BIN_STORAGE_KEY],
  ["COLLECTIONS_STORAGE_KEY", COLLECTIONS_STORAGE_KEY],
  ["CHECKLISTS_STORAGE_KEY", CHECKLISTS_STORAGE_KEY],
  ["GRATITUDE_HISTORY_STORAGE_KEY", GRATITUDE_HISTORY_STORAGE_KEY],
  ["FOCUS_STATS_KEY", FOCUS_STATS_KEY],
  ["ONBOARDING_COMPLETED_KEY", ONBOARDING_COMPLETED_KEY],
  ["PROFILE_STORAGE_KEY", PROFILE_STORAGE_KEY],
  ["SETTINGS_STORAGE_KEY", SETTINGS_STORAGE_KEY],
  ["WIDGET_PAYLOAD_KEY", WIDGET_PAYLOAD_KEY],
  ["QUICK_SUGGESTIONS_SEEN_KEY", QUICK_SUGGESTIONS_SEEN_KEY],
  ["PEBBLE_LOG_KEY", PEBBLE_LOG_KEY],
  ["PEBBLE_SPENT_KEY", PEBBLE_SPENT_KEY],
  ["GEMS_BONUS_KEY", GEMS_BONUS_KEY],
  ["GEMS_SPENT_KEY", GEMS_SPENT_KEY],
  ["STREAK_RECOVERIES_KEY", STREAK_RECOVERIES_KEY],
];

const baseValidBackup: AppBackup = {
  version: 1,
  timestamp: 1700000000000,
  workspaces: [
    {
      id: "ws-1",
      name: "Primary",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  tasks: [],
  habits: [],
  checklists: [],
  resources: [],
  recycleBin: [],
  focusSessions: [],
  relationships: [],
  systemEvents: [],
  settings: { theme: "dark" },
  profile: { name: "Test User", email: "test@example.com" },
  uiState: { completedOnboarding: true, activeWorkspaceId: "ws-1" },
};

describe("Pebble storage key ownership registry", () => {
  beforeEach(async () => {
    (AsyncStorage as any).__INTERNAL_MOCK_STORAGE__ = {};
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it("registers every exported storage-key constant as Pebble-owned", () => {
    const unregistered = ALL_KEY_CONSTANTS.filter(
      ([, key]) => !isPebbleOwnedKey(key),
    ).map(([name]) => name);

    expect(unregistered).toEqual([]);
  });

  it("registers the five previously-missing Today dashboard keys", () => {
    for (const key of DASHBOARD_KEYS) {
      expect(isPebbleOwnedKey(key)).toBe(true);
    }
  });

  it("only declares restore policy entries for owned keys", () => {
    for (const key of PEBBLE_RESTORE_PRESERVED_KEYS) {
      expect(isPebbleOwnedKey(key)).toBe(true);
    }
    for (const key of PEBBLE_RESTORE_EPHEMERAL_KEYS) {
      expect(isPebbleOwnedKey(key)).toBe(true);
    }
  });

  it("keeps preserved and ephemeral policies disjoint", () => {
    const overlap = [...PEBBLE_RESTORE_PRESERVED_KEYS].filter((key) =>
      PEBBLE_RESTORE_EPHEMERAL_KEYS.has(key),
    );
    expect(overlap).toEqual([]);
  });

  it("classifies every owned key explicitly for restore", () => {
    const policySets = [
      PEBBLE_BACKUP_PAYLOAD_KEYS,
      PEBBLE_RESTORE_PRESERVED_KEYS,
      PEBBLE_RESTORE_EPHEMERAL_KEYS,
      PEBBLE_RESTORE_RESET_KEYS,
    ];

    // Four-way classification must be unambiguous for exact owned keys.
    for (let i = 0; i < policySets.length; i++) {
      for (let j = i + 1; j < policySets.length; j++) {
        const overlap = [...policySets[i]].filter((key) => policySets[j].has(key));
        expect(overlap).toEqual([]);
      }
    }

    // A key that reaches the "reset" fallback must carry an explicit decision.
    const undeclared: string[] = [];
    for (const key of PEBBLE_EXACT_OWNED_KEYS) {
      const classification = classifyKeyForRestore(key);
      const hasExplicitEntry =
        classification === "restored"
          ? PEBBLE_BACKUP_PAYLOAD_KEYS.has(key)
          : classification === "preserved"
            ? PEBBLE_RESTORE_PRESERVED_KEYS.has(key)
            : classification === "ephemeral"
              ? PEBBLE_RESTORE_EPHEMERAL_KEYS.has(key)
              : PEBBLE_RESTORE_RESET_KEYS.has(key);
      if (!hasExplicitEntry) undeclared.push(`${key} (${classification})`);
    }
    expect(undeclared).toEqual([]);
  });

  it("classifies dynamic entity partitions as payload-carried", () => {
    for (const key of [
      "pebble:v1:tasks:ws-1",
      "pebble:v1:habits:ws-1",
      "pebble:v1:checklists:ws-1",
      "pebble:v1:resources:ws-1",
    ]) {
      expect(classifyKeyForRestore(key)).toBe("restored");
    }
  });

  it("declares dataset-scoped ledgers and deletion lineage as an explicit reset", () => {
    // Backup v1 does not carry these, so restore must not silently mix the old
    // dataset's counted rewards / tombstone lineage into the restored one.
    for (const key of [
      "pebble:v1:tombstones",
      PEBBLE_LOG_KEY,
      PEBBLE_SPENT_KEY,
      GEMS_BONUS_KEY,
      GEMS_SPENT_KEY,
      STREAK_RECOVERIES_KEY,
    ]) {
      expect(isPebbleOwnedKey(key)).toBe(true);
      expect(classifyKeyForRestore(key)).toBe("reset");
      expect(PEBBLE_RESTORE_RESET_KEYS.has(key)).toBe(true);
    }
  });

  it("classifies the focus preference and in-flight policies explicitly", () => {
    // Device-local preferences survive a data restore.
    for (const key of [
      "todoapp:focus:selected_sound_id",
      "todoapp:focus:sound_volume",
      "todoapp:focus:is_muted",
      "todoapp:focus:liked_sound_ids",
      "todoapp:focus:custom_tracks",
      "todoapp:focus:is_shuffle",
      "todoapp:focus:is_repeat",
    ]) {
      expect(getRestorePolicy(key)).toBe("preserved");
      expect(isPreservedOnRestore(key)).toBe(true);
    }

    // In-flight timer state is never restored.
    for (const key of [
      "todoapp:focus:current_session",
      "todoapp:focus:current_stopwatch",
    ]) {
      expect(getRestorePolicy(key)).toBe("reset");
      expect(isEphemeralStorageKey(key)).toBe(true);
    }

    // Restored payload keys follow the reset path (removed, then re-written).
    expect(getRestorePolicy("pebble:v1:workspaces")).toBe("reset");
    expect(getRestorePolicy(RESTORE_INTENT_KEY)).toBe("reset");
  });

  it("stops treating unregistered pseudo-Pebble keys as owned", () => {
    expect(isPebbleOwnedKey("todoapp:unregistered_secret")).toBe(false);
    expect(isPebbleOwnedKey("pebble:foreign_vendor_cache")).toBe(false);
  });

  it("clears the dashboard keys during Clear All Data", async () => {
    for (const key of DASHBOARD_KEYS) {
      await AsyncStorage.setItem(key, "persisted");
    }
    await AsyncStorage.setItem("unrelated:thirdparty:key", "keep-me");

    await BackupService.clearAllData();

    for (const key of DASHBOARD_KEYS) {
      expect(await AsyncStorage.getItem(key)).toBeNull();
    }
    expect(await AsyncStorage.getItem("unrelated:thirdparty:key")).toBe(
      "keep-me",
    );
  });

  it("preserves device-local preferences across a restore and resets in-flight state", async () => {
    for (const key of DASHBOARD_KEYS) {
      await AsyncStorage.setItem(key, "device-pref");
    }
    await AsyncStorage.setItem("todoapp:focus:selected_sound_id", "rain");
    await AsyncStorage.setItem("todoapp:focus:sound_volume", "0.4");
    await AsyncStorage.setItem("todoapp:focus:is_muted", "true");
    await AsyncStorage.setItem("todoapp:focus:current_session", '{"startTime":1}');
    await AsyncStorage.setItem("todoapp:focus:current_stopwatch", '{"running":true}');
    await AsyncStorage.setItem("unrelated:thirdparty:key", "keep-me");

    await BackupService.restoreStructuredBackup(JSON.stringify(baseValidBackup));

    // Preserved
    for (const key of DASHBOARD_KEYS) {
      expect(await AsyncStorage.getItem(key)).toBe("device-pref");
    }
    expect(await AsyncStorage.getItem("todoapp:focus:selected_sound_id")).toBe(
      "rain",
    );
    expect(await AsyncStorage.getItem("todoapp:focus:sound_volume")).toBe("0.4");
    expect(await AsyncStorage.getItem("todoapp:focus:is_muted")).toBe("true");
    expect(await AsyncStorage.getItem("unrelated:thirdparty:key")).toBe(
      "keep-me",
    );

    // Reset
    expect(await AsyncStorage.getItem("todoapp:focus:current_session")).toBeNull();
    expect(
      await AsyncStorage.getItem("todoapp:focus:current_stopwatch"),
    ).toBeNull();

    // Domain data really was restored
    expect(await AsyncStorage.getItem("pebble:v1:workspaces")).toContain("ws-1");
  });

  it("rebuilds the focus statistics cache from the restored session history", async () => {
    const endedToday = Date.now();
    const backupWithSessions: AppBackup = {
      ...baseValidBackup,
      focusSessions: [
        {
          id: "focus_1",
          startedAt: endedToday - 25 * 60 * 1000,
          endedAt: endedToday,
          duration: 25 * 60,
        },
        {
          id: "focus_2",
          startedAt: endedToday - 10 * 60 * 1000,
          endedAt: endedToday,
          duration: 10 * 60,
        },
      ],
    };

    await BackupService.restoreStructuredBackup(
      JSON.stringify(backupWithSessions),
    );

    const stats = JSON.parse((await AsyncStorage.getItem(FOCUS_STATS_KEY))!);
    expect(stats.completedToday).toBe(2);
    expect(stats.totalFocusTime).toBe(35);
  });

  it("resets the focus statistics cache when the backup carries no history", async () => {
    await AsyncStorage.setItem(
      FOCUS_STATS_KEY,
      JSON.stringify({ completedToday: 9, totalFocusTime: 999 }),
    );

    await BackupService.restoreStructuredBackup(JSON.stringify(baseValidBackup));

    const stats = JSON.parse((await AsyncStorage.getItem(FOCUS_STATS_KEY))!);
    expect(stats.completedToday).toBe(0);
    expect(stats.totalFocusTime).toBe(0);
  });
});
