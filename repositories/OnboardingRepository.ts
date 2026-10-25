/**
 * OnboardingRepository.ts
 * ─────────────────────────
 * Canonical data-access repository for onboarding persistence.
 *
 * ARCHITECTURAL DECISION & STORAGE OWNERSHIP:
 * 1. The sole canonical source of truth for onboarding completion is
 *    `pebble:v1:ui_state.completedOnboarding` managed via `UiStateRepository`.
 * 2. `todoapp:onboarding_completed` is strictly a downstream legacy/compatibility
 *    mirror. It is maintained on a best-effort basis and must NEVER be allowed
 *    to override or contradict canonical state.
 * 3. We do NOT pretend two AsyncStorage writes are atomic via Promise.all.
 *    The canonical write to `UiStateRepository` happens first. If it fails, the
 *    operation fails immediately. Mirror updates occur second and are guarded so
 *    transient mirror failures cannot invalidate canonical state.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { UiStateRepository } from "./UiStateRepository";

export const ONBOARDING_COMPLETED_KEY = "todoapp:onboarding_completed";

export interface OnboardingState {
  completed: boolean;
}

export class OnboardingRepository {
  /**
   * Retrieves canonical onboarding completion status.
   * Reads unambiguously from the authoritative source of truth: `UiStateRepository`.
   * Stale legacy keys cannot override or contradict canonical state.
   */
  static async getOnboardingState(): Promise<OnboardingState> {
    try {
      const uiState = await UiStateRepository.getUiState();
      return { completed: !!uiState.completedOnboarding };
    } catch (e) {
      console.error("[OnboardingRepository] Failed to read canonical onboarding state", e);
      return { completed: false };
    }
  }

  /**
   * Authoritatively updates onboarding completion in canonical persistence.
   * Canonical write executes first; legacy mirror update executes second as best-effort.
   */
  static async setOnboardingCompleted(completed: boolean): Promise<void> {
    // 1. Authoritative / Canonical write
    try {
      await UiStateRepository.saveUiState({ completedOnboarding: completed });
    } catch (e) {
      console.error(
        `[OnboardingRepository] Failed to write canonical onboarding state (${completed})`,
        e,
      );
      throw e;
    }

    // 2. Best-effort legacy compatibility mirror write
    try {
      if (completed) {
        await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, "true");
      } else {
        await AsyncStorage.removeItem(ONBOARDING_COMPLETED_KEY);
      }
    } catch (mirrorErr) {
      console.warn(
        "[OnboardingRepository] Failed to update legacy mirror key (non-fatal):",
        mirrorErr,
      );
    }
  }

  /**
   * Resets onboarding state back to initial/uncompleted state.
   */
  static async resetOnboarding(): Promise<void> {
    await this.setOnboardingCompleted(false);
  }
}
