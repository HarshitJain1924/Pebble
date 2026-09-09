/**
 * onboarding.service.ts
 * ───────────────────────
 * Canonical lifecycle and orchestration service for Pebble's onboarding and first-run experience.
 *
 * Enforces:
 * 1. Mutual exclusion via ONBOARDING_LIFECYCLE_LOCK.
 * 2. Idempotent initialization (safe across retries, restarts, and concurrent invocations).
 * 3. Strict initialization ordering: Profile → Workspaces → Settings & Categories → UI State → Onboarding Flag.
 * 4. Post-commit event emission only for committed changes.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  OnboardingRepository,
  type OnboardingState,
  PROFILE_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  SettingsRepository,
  UiStateRepository,
  UserProfileRepository,
  WorkspaceRepository,
} from "@/repositories";
import { DEFAULT_PROFILE } from "@/repositories/UserProfileRepository";
import { DEFAULT_SETTINGS } from "@/repositories/SettingsRepository";
import { emitStateChange } from "@/services/events/state-events";
import {
  INBOX_WORKSPACE_ID,
  MY_PEBBLES_WORKSPACE_ID,
  type Workspace,
} from "@/shared/types/domain.types";
import { withLock } from "@/shared/utils/mutex";

export const ONBOARDING_LIFECYCLE_LOCK = "pebble:v1:onboarding_lock";

export interface OnboardingCompletionResult {
  success: boolean;
  changed: boolean;
}

/**
 * Checks whether onboarding has been completed.
 */
export async function isOnboardingCompleted(): Promise<boolean> {
  const state = await OnboardingRepository.getOnboardingState();
  return state.completed;
}

/**
 * Retrieves the canonical onboarding state.
 */
export async function getOnboardingState(): Promise<OnboardingState> {
  return OnboardingRepository.getOnboardingState();
}

/**
 * Resets the onboarding status to incomplete.
 */
export async function resetOnboarding(): Promise<void> {
  return withLock(ONBOARDING_LIFECYCLE_LOCK, async () => {
    await OnboardingRepository.resetOnboarding();
  });
}

/**
 * Completes the onboarding flow with atomic, failure-safe, and idempotent initialization:
 *
 * 1. Profile: Ensures pebble:profile exists (sets DEFAULT_PROFILE if missing).
 * 2. Workspaces: Ensures default workspaces (Inbox, My Pebbles) exist with stable IDs.
 * 3. Settings & Categories: Ensures pebble:settings exists with default categories.
 * 4. UI State: Initializes activeWorkspaceId to Inbox if null.
 * 5. Completion Flag: Persists onboarding completed flag last.
 *
 * If any initialization step fails, the completion flag is NOT set.
 */
export async function completeOnboarding(): Promise<OnboardingCompletionResult> {
  return withLock(ONBOARDING_LIFECYCLE_LOCK, async () => {
    // 1. Idempotency check: if already completed, do not re-run initialization or re-emit events
    const current = await OnboardingRepository.getOnboardingState();
    if (current.completed) {
      return { success: true, changed: false };
    }

    let profileCreated = false;
    let workspacesCreated = false;
    let settingsCreated = false;

    // ── Step 1: Profile Initialization ──
    const existingProfileRaw = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
    if (!existingProfileRaw) {
      await UserProfileRepository.saveProfileUnlocked(DEFAULT_PROFILE);
      profileCreated = true;
    }

    // ── Step 2: Workspaces Initialization ──
    const existingWorkspaces = await WorkspaceRepository.getWorkspaces();
    const hasInbox = existingWorkspaces.some((w) => w.id === INBOX_WORKSPACE_ID);
    const hasMyPebbles = existingWorkspaces.some(
      (w) => w.id === MY_PEBBLES_WORKSPACE_ID,
    );

    const now = Date.now();
    if (!hasInbox) {
      const inboxWs: Workspace = {
        id: INBOX_WORKSPACE_ID,
        name: "Inbox",
        emoji: "📥",
        color: "#6366F1",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: now,
        updatedAt: now,
      };
      await WorkspaceRepository.saveWorkspace(inboxWs, { throwOnError: true });
      workspacesCreated = true;
    }

    if (!hasMyPebbles) {
      const myPebblesWs: Workspace = {
        id: MY_PEBBLES_WORKSPACE_ID,
        name: "My Pebbles",
        emoji: "⚡",
        color: "#8B5CF6",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: now,
        updatedAt: now,
      };
      await WorkspaceRepository.saveWorkspace(myPebblesWs, { throwOnError: true });
      workspacesCreated = true;
    }

    // ── Step 3: Settings & Default Categories Initialization ──
    const existingSettingsRaw = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!existingSettingsRaw) {
      await SettingsRepository.saveSettings(DEFAULT_SETTINGS);
      settingsCreated = true;
    }

    // ── Step 4: UI State (Active Workspace) ──
    const uiState = await UiStateRepository.getUiState().catch(() => null);
    if (!uiState?.activeWorkspaceId) {
      await UiStateRepository.saveUiState({
        activeWorkspaceId: INBOX_WORKSPACE_ID,
      });
    }

    // ── Step 5: Onboarding Completion Flag (Persisted Last) ──
    await OnboardingRepository.setOnboardingCompleted(true);

    // ── Post-Commit Events ──
    if (workspacesCreated) {
      emitStateChange("workspace_changed", "onboarding_service");
    }
    if (settingsCreated) {
      emitStateChange("settings_changed", "onboarding_service");
    }
    if (profileCreated) {
      emitStateChange("profile_changed", "onboarding_service");
    }

    return { success: true, changed: true };
  });
}

export const OnboardingService = {
  isOnboardingCompleted,
  getOnboardingState,
  completeOnboarding,
  resetOnboarding,
};
