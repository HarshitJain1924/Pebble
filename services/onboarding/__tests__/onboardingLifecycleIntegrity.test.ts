/**
 * onboardingLifecycleIntegrity.test.ts
 * ──────────────────────────────────────
 * Comprehensive test suite verifying Pebble's Onboarding & First-Run State Integrity:
 *
 * A. Fresh state → onboarding eligible
 * B. Complete onboarding → onboarding marked complete, entities initialized
 * C. Restart → onboarding remains complete
 * D. Complete onboarding twice → no duplicate initialization
 * E. Concurrent completion → one valid initialized state
 * F. Partial failure → deterministic recovery / remains incomplete
 * G. Clear All Data → onboarding reset
 * H. Clear All Data + restart → onboarding eligible again
 * I. Clear All → onboarding → complete → valid initialized state
 * J. Repeat the cycle multiple times → no duplicate workspaces/categories/profile/settings
 * K. Restore completed backup → onboarding state preserved correctly
 * L. Restore incomplete/legacy state → onboarding behavior remains correct
 * M. Events → emitted only for real committed changes
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  OnboardingRepository,
  ONBOARDING_COMPLETED_KEY,
  WorkspaceRepository,
  UserProfileRepository,
  SettingsRepository,
  UiStateRepository,
  PROFILE_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
} from "@/repositories";
import {
  OnboardingService,
  ONBOARDING_LIFECYCLE_LOCK,
} from "../onboarding.service";
import {
  BackupService,
  type AppBackup,
} from "@/services/storage/backup.service";
import { emitStateChange } from "@/services/events/state-events";
import {
  INBOX_WORKSPACE_ID,
  MY_PEBBLES_WORKSPACE_ID,
} from "@/shared/types/domain.types";
import {
  saveProfile,
  updateProfile,
} from "@/features/settings/services/settings.service";

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
  addStateListener: jest.fn(() => jest.fn()),
}));

describe("Onboarding & First-Run State Integrity (Phase 6)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  // ── Scenario A: Fresh state → onboarding eligible ──
  test("Scenario A: Fresh install state is eligible for onboarding", async () => {
    const isCompleted = await OnboardingService.isOnboardingCompleted();
    const state = await OnboardingService.getOnboardingState();

    expect(isCompleted).toBe(false);
    expect(state.completed).toBe(false);

    // Initial persistence keys should be empty
    expect(await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY)).toBeNull();
    const uiState = await UiStateRepository.getUiState();
    expect(uiState.completedOnboarding).toBe(false);
  });

  // ── Scenario B: Complete onboarding → marked complete, required state initialized ──
  test("Scenario B: Completing onboarding initializes Profile, Workspaces, Settings, and marks completed", async () => {
    const result = await OnboardingService.completeOnboarding();
    expect(result.success).toBe(true);
    expect(result.changed).toBe(true);

    // Verify completion status
    expect(await OnboardingService.isOnboardingCompleted()).toBe(true);
    expect(await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY)).toBe("true");

    // Verify UI State
    const uiState = await UiStateRepository.getUiState();
    expect(uiState.completedOnboarding).toBe(true);
    expect(uiState.activeWorkspaceId).toBe(INBOX_WORKSPACE_ID);

    // Verify Workspaces initialized
    const workspaces = await WorkspaceRepository.getWorkspaces();
    expect(workspaces.length).toBe(2);
    expect(workspaces.some((w) => w.id === INBOX_WORKSPACE_ID)).toBe(true);
    expect(workspaces.some((w) => w.id === MY_PEBBLES_WORKSPACE_ID)).toBe(true);

    // Verify Profile initialized
    const profile = await UserProfileRepository.getProfile();
    expect(profile.name).toBe("User");

    // Verify Settings & Default Categories initialized
    const settings = await SettingsRepository.getSettings();
    expect(settings.theme).toBe("dark");
    expect(settings.categories.work).toBe(true);
    expect(settings.categories.personal).toBe(true);
    expect(settings.categories.health).toBe(true);
  });

  // ── Scenario C: Restart → onboarding remains complete ──
  test("Scenario C: Completed onboarding survives simulated app restart", async () => {
    await OnboardingService.completeOnboarding();
    expect(await OnboardingService.isOnboardingCompleted()).toBe(true);

    // Simulate app restart / new process read
    const rehydratedState = await OnboardingService.getOnboardingState();
    expect(rehydratedState.completed).toBe(true);
    expect(await OnboardingService.isOnboardingCompleted()).toBe(true);
  });

  // ── Scenario D: Complete onboarding twice → no duplicate initialization ──
  test("Scenario D: Completing onboarding twice is idempotent and creates no duplicates", async () => {
    const firstResult = await OnboardingService.completeOnboarding();
    expect(firstResult.success).toBe(true);
    expect(firstResult.changed).toBe(true);

    // Custom workspace created by user after onboarding
    await WorkspaceRepository.saveWorkspace({
      id: "ws-custom",
      name: "Custom Project",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Second completion invocation (e.g. redundant trigger)
    const secondResult = await OnboardingService.completeOnboarding();
    expect(secondResult.success).toBe(true);
    expect(secondResult.changed).toBe(false);

    // Workspaces should still only be 3 (Inbox, My Pebbles, Custom)
    const workspaces = await WorkspaceRepository.getWorkspaces();
    expect(workspaces.length).toBe(3);
    expect(workspaces.filter((w) => w.id === INBOX_WORKSPACE_ID).length).toBe(1);
    expect(workspaces.filter((w) => w.id === MY_PEBBLES_WORKSPACE_ID).length).toBe(1);
  });

  // ── Scenario E: Concurrent completion → one valid initialized state ──
  test("Scenario E: Concurrent completion calls serialize cleanly without duplicates", async () => {
    const [res1, res2, res3] = await Promise.all([
      OnboardingService.completeOnboarding(),
      OnboardingService.completeOnboarding(),
      OnboardingService.completeOnboarding(),
    ]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
    expect(res3.success).toBe(true);

    // Exactly one call should have performed changes
    const changedCount = [res1, res2, res3].filter((r) => r.changed).length;
    expect(changedCount).toBe(1);

    // Workspaces must have exactly 2 entries, no duplicate IDs
    const workspaces = await WorkspaceRepository.getWorkspaces();
    expect(workspaces.length).toBe(2);
    expect(workspaces.map((w) => w.id).sort()).toEqual([
      INBOX_WORKSPACE_ID,
      MY_PEBBLES_WORKSPACE_ID,
    ].sort());
  });

  // ── Scenario F: Partial failure → deterministic recovery / remains incomplete ──
  describe("Scenario F: Partial Failures & Deterministic Recovery", () => {
    test("F1: Profile failure leaves onboarding incomplete", async () => {
      const saveSpy = jest
        .spyOn(UserProfileRepository, "saveProfileUnlocked")
        .mockRejectedValueOnce(new Error("Disk Full"));

      await expect(OnboardingService.completeOnboarding()).rejects.toThrow("Disk Full");

      expect(await OnboardingService.isOnboardingCompleted()).toBe(false);
      expect(await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY)).toBeNull();
      saveSpy.mockRestore();

      // Retry succeeds cleanly
      const retry = await OnboardingService.completeOnboarding();
      expect(retry.success).toBe(true);
      expect(await OnboardingService.isOnboardingCompleted()).toBe(true);
    });

    test("F2: Workspace creation failure leaves onboarding incomplete", async () => {
      const wsSpy = jest
        .spyOn(WorkspaceRepository, "saveWorkspace")
        .mockRejectedValueOnce(new Error("Storage Timeout"));

      await expect(OnboardingService.completeOnboarding()).rejects.toThrow("Storage Timeout");

      expect(await OnboardingService.isOnboardingCompleted()).toBe(false);
      wsSpy.mockRestore();

      // Retry succeeds and ensures no duplicates
      const retry = await OnboardingService.completeOnboarding();
      expect(retry.success).toBe(true);
      const workspaces = await WorkspaceRepository.getWorkspaces();
      expect(workspaces.length).toBe(2);
      expect(await OnboardingService.isOnboardingCompleted()).toBe(true);
    });

    test("F3: Settings creation failure leaves onboarding incomplete", async () => {
      const settingsSpy = jest
        .spyOn(SettingsRepository, "saveSettings")
        .mockRejectedValueOnce(new Error("Settings Corrupted"));

      await expect(OnboardingService.completeOnboarding()).rejects.toThrow("Settings Corrupted");

      expect(await OnboardingService.isOnboardingCompleted()).toBe(false);
      settingsSpy.mockRestore();

      // Retry succeeds cleanly
      const retry = await OnboardingService.completeOnboarding();
      expect(retry.success).toBe(true);
      expect(await OnboardingService.isOnboardingCompleted()).toBe(true);
    });

    test("F4: Completion flag write failure leaves onboarding incomplete", async () => {
      const flagSpy = jest
        .spyOn(OnboardingRepository, "setOnboardingCompleted")
        .mockRejectedValueOnce(new Error("AsyncStorage I/O Error"));

      await expect(OnboardingService.completeOnboarding()).rejects.toThrow("AsyncStorage I/O Error");

      expect(await OnboardingService.isOnboardingCompleted()).toBe(false);
      flagSpy.mockRestore();

      // Retry succeeds without creating duplicate workspaces
      const retry = await OnboardingService.completeOnboarding();
      expect(retry.success).toBe(true);
      expect(await OnboardingService.isOnboardingCompleted()).toBe(true);
      const workspaces = await WorkspaceRepository.getWorkspaces();
      expect(workspaces.length).toBe(2);
    });
  });

  // ── Scenario G & H: Clear All Data → reset and eligible on restart ──
  test("Scenario G & H: Clear All Data resets onboarding and makes restart eligible", async () => {
    // 1. Initial complete
    await OnboardingService.completeOnboarding();
    expect(await OnboardingService.isOnboardingCompleted()).toBe(true);

    // 2. Perform Clear All Data
    await BackupService.clearAllData();

    // 3. Verify onboarding status is reset
    expect(await OnboardingService.isOnboardingCompleted()).toBe(false);
    expect(await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY)).toBeNull();

    // 4. Verify UiState is reset
    const uiState = await UiStateRepository.getUiState();
    expect(uiState.completedOnboarding).toBe(false);
  });

  // ── Scenario I: Clear All → onboarding → complete ──
  test("Scenario I: Clear All followed by onboarding completion produces valid state", async () => {
    // 1. Complete initial onboarding
    await OnboardingService.completeOnboarding();
    expect(await OnboardingService.isOnboardingCompleted()).toBe(true);

    // 2. Clear All Data
    await BackupService.clearAllData();
    expect(await OnboardingService.isOnboardingCompleted()).toBe(false);

    // 3. User goes through onboarding again and completes
    const result = await OnboardingService.completeOnboarding();
    expect(result.success).toBe(true);
    expect(result.changed).toBe(true);

    // 4. Valid state verified
    expect(await OnboardingService.isOnboardingCompleted()).toBe(true);
    const workspaces = await WorkspaceRepository.getWorkspaces();
    expect(workspaces.length).toBe(2);
    expect(workspaces.some((w) => w.id === INBOX_WORKSPACE_ID)).toBe(true);
    expect(workspaces.some((w) => w.id === MY_PEBBLES_WORKSPACE_ID)).toBe(true);
  });

  // ── Scenario J: Repeat the cycle multiple times ──
  test("Scenario J: Repeating Clear All -> Onboarding cycle 3 times creates zero duplicate entities", async () => {
    for (let cycle = 1; cycle <= 3; cycle++) {
      // Complete onboarding
      const completeRes = await OnboardingService.completeOnboarding();
      expect(completeRes.success).toBe(true);
      expect(await OnboardingService.isOnboardingCompleted()).toBe(true);

      const workspaces = await WorkspaceRepository.getWorkspaces();
      expect(workspaces.length).toBe(2);
      expect(workspaces.filter((w) => w.id === INBOX_WORKSPACE_ID).length).toBe(1);
      expect(workspaces.filter((w) => w.id === MY_PEBBLES_WORKSPACE_ID).length).toBe(1);

      // Wipe data
      await BackupService.clearAllData();
      expect(await OnboardingService.isOnboardingCompleted()).toBe(false);
    }
  });

  // ── Scenario K: Restore completed backup ──
  test("Scenario K: Restoring a completed backup preserves completed onboarding without forcing onboarding", async () => {
    const completedBackup: AppBackup = {
      version: 1,
      timestamp: 1700000000000,
      workspaces: [
        { id: "ws-restored", name: "Restored Project", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
      ],
      tasks: [],
      habits: [],
      checklists: [],
      resources: [],
      recycleBin: [],
      focusSessions: [],
      relationships: [],
      systemEvents: [],
      settings: { theme: "light" },
      profile: { name: "Alice", email: "alice@example.com" },
      uiState: { completedOnboarding: true, activeWorkspaceId: "ws-restored" },
    };

    await BackupService.restoreStructuredBackup(JSON.stringify(completedBackup));

    expect(await OnboardingService.isOnboardingCompleted()).toBe(true);
    expect(await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY)).toBe("true");
    const uiState = await UiStateRepository.getUiState();
    expect(uiState.completedOnboarding).toBe(true);
  });

  // ── Scenario L: Restore incomplete/legacy state ──
  test("Scenario L: Restoring a backup with completedOnboarding=false preserves incomplete onboarding", async () => {
    const incompleteBackup: AppBackup = {
      version: 1,
      timestamp: 1700000000000,
      workspaces: [
        { id: "ws-early", name: "Early Setup", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
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
      profile: { name: "Bob" },
      uiState: { completedOnboarding: false, activeWorkspaceId: "ws-early" },
    };

    await BackupService.restoreStructuredBackup(JSON.stringify(incompleteBackup));

    expect(await OnboardingService.isOnboardingCompleted()).toBe(false);
    expect(await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY)).toBeNull();
  });

  // ── Scenario M: Events emitted only on real state changes ──
  test("Scenario M: Events are emitted strictly on committed initialization and not on no-op replays", async () => {
    (emitStateChange as jest.Mock).mockClear();

    // First completion: creates initial entities, emits events
    const firstRes = await OnboardingService.completeOnboarding();
    expect(firstRes.changed).toBe(true);
    expect(emitStateChange).toHaveBeenCalledWith("workspace_changed", "onboarding_service");
    expect(emitStateChange).toHaveBeenCalledWith("settings_changed", "onboarding_service");
    expect(emitStateChange).toHaveBeenCalledWith("profile_changed", "onboarding_service");

    (emitStateChange as jest.Mock).mockClear();

    // Replay completion: no-op, must NOT emit events
    const secondRes = await OnboardingService.completeOnboarding();
    expect(secondRes.changed).toBe(false);
    expect(emitStateChange).not.toHaveBeenCalled();
  });

  // ── Issue 1: Navigation contract on onboarding completion ──
  describe("Issue 1: Navigation contract on onboarding completion", () => {
    test("Failed completion does not navigate into the app and leaves onboarding incomplete", async () => {
      const mockRouterReplace = jest.fn();
      jest.spyOn(OnboardingService, "completeOnboarding").mockRejectedValueOnce(new Error("Setup explosion"));

      // Simulate completion flow in UI (app/onboarding.tsx)
      let navigated = false;
      try {
        const res = await OnboardingService.completeOnboarding();
        if (res.success) {
          mockRouterReplace("/(tabs)");
          navigated = true;
        }
      } catch (e) {
        // Handled cleanly in UI
      }

      expect(navigated).toBe(false);
      expect(mockRouterReplace).not.toHaveBeenCalled();
      expect(await OnboardingService.isOnboardingCompleted()).toBe(false);
    });

    test("Successful completion navigates into the app", async () => {
      const mockRouterReplace = jest.fn();
      const res = await OnboardingService.completeOnboarding();
      if (res.success) {
        mockRouterReplace("/(tabs)");
      }

      expect(mockRouterReplace).toHaveBeenCalledWith("/(tabs)");
      expect(await OnboardingService.isOnboardingCompleted()).toBe(true);
    });
  });

  // ── Issue 2: Persistence Consistency & Atomicity ──
  describe("Issue 2: Persistence Consistency & Atomicity", () => {
    test("Canonical write succeeds while legacy mirror fails -> canonical state completed, getOnboardingState returns true", async () => {
      const defaultSetItem = (AsyncStorage.setItem as jest.Mock).getMockImplementation();
      (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string, callback?: any) => {
        if (key === ONBOARDING_COMPLETED_KEY) {
          throw new Error("Mirror write failed");
        }
        return (AsyncStorage as any).multiSet([[key, val]], callback);
      });

      await expect(OnboardingRepository.setOnboardingCompleted(true)).resolves.not.toThrow();

      (AsyncStorage.setItem as jest.Mock).mockImplementation(defaultSetItem);

      const state = await OnboardingRepository.getOnboardingState();
      expect(state.completed).toBe(true);

      const uiState = await UiStateRepository.getUiState();
      expect(uiState.completedOnboarding).toBe(true);
    });

    test("Canonical write failure throws and leaves onboarding incomplete", async () => {
      await OnboardingRepository.resetOnboarding();
      const saveSpy = jest.spyOn(UiStateRepository, "saveUiState").mockRejectedValueOnce(new Error("Canonical write failed"));

      await expect(OnboardingRepository.setOnboardingCompleted(true)).rejects.toThrow("Canonical write failed");

      saveSpy.mockRestore();

      const state = await OnboardingRepository.getOnboardingState();
      expect(state.completed).toBe(false);
    });

    test("Legacy key contains stale 'true' while canonical state is 'false' -> getOnboardingState returns false", async () => {
      await UiStateRepository.saveUiState({ completedOnboarding: false });
      await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, "true");

      const state = await OnboardingRepository.getOnboardingState();
      expect(state.completed).toBe(false);
    });

    test("Legacy key contains stale 'false' while canonical state is 'true' -> getOnboardingState returns true", async () => {
      await UiStateRepository.saveUiState({ completedOnboarding: true });
      await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, "false");

      const state = await OnboardingRepository.getOnboardingState();
      expect(state.completed).toBe(true);
    });
  });

  // ── Issue 3: Profile Isolation ──
  describe("Issue 3: Profile Isolation", () => {
    test("Saving a named profile does NOT mark onboarding complete", async () => {
      expect(await OnboardingService.isOnboardingCompleted()).toBe(false);

      await saveProfile({
        name: "Ada Lovelace",
        email: "ada@example.com",
        avatar: "👩‍💻",
      });

      expect(await OnboardingService.isOnboardingCompleted()).toBe(false);
      const uiState = await UiStateRepository.getUiState();
      expect(uiState.completedOnboarding).toBe(false);
      expect(await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY)).toBeNull();
    });

    test("Updating a named profile does NOT mark onboarding complete", async () => {
      expect(await OnboardingService.isOnboardingCompleted()).toBe(false);

      await updateProfile({ name: "Grace Hopper" });

      expect(await OnboardingService.isOnboardingCompleted()).toBe(false);
      const uiState = await UiStateRepository.getUiState();
      expect(uiState.completedOnboarding).toBe(false);
      expect(await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY)).toBeNull();
    });

    test("Explicit OnboardingService.completeOnboarding() DOES mark onboarding complete", async () => {
      expect(await OnboardingService.isOnboardingCompleted()).toBe(false);

      const res = await OnboardingService.completeOnboarding();
      expect(res.success).toBe(true);
      expect(res.changed).toBe(true);

      expect(await OnboardingService.isOnboardingCompleted()).toBe(true);
      const uiState = await UiStateRepository.getUiState();
      expect(uiState.completedOnboarding).toBe(true);
    });
  });
});
