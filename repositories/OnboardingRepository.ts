/**
 * OnboardingRepository.ts
 * ─────────────────────────
 * Canonical data-access repository for onboarding persistence.
 *
 * Coordinates and guarantees synchronization between the legacy/backup key
 * `todoapp:onboarding_completed` and canonical domain state `pebble:v1:ui_state`.
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
   * Defensively inspects both the static key and UiState to ensure
   * backward compatibility across migrations and backup restorations.
   */
  static async getOnboardingState(): Promise<OnboardingState> {
    try {
      const [rawCompleted, uiState] = await Promise.all([
        AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY),
        UiStateRepository.getUiState().catch(() => null),
      ]);

      const isCompleted =
        rawCompleted === "true" || !!uiState?.completedOnboarding;

      return { completed: isCompleted };
    } catch (e) {
      console.error("[OnboardingRepository] Failed to read onboarding state", e);
      return { completed: false };
    }
  }

  /**
   * Authoritatively updates onboarding completion status in both persistence locations.
   */
  static async setOnboardingCompleted(completed: boolean): Promise<void> {
    try {
      if (completed) {
        await Promise.all([
          AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, "true"),
          UiStateRepository.saveUiState({ completedOnboarding: true }),
        ]);
      } else {
        await Promise.all([
          AsyncStorage.removeItem(ONBOARDING_COMPLETED_KEY),
          UiStateRepository.saveUiState({ completedOnboarding: false }),
        ]);
      }
    } catch (e) {
      console.error(
        `[OnboardingRepository] Failed to set onboarding completed to ${completed}`,
        e,
      );
      throw e;
    }
  }

  /**
   * Resets onboarding state back to initial/uncompleted state.
   */
  static async resetOnboarding(): Promise<void> {
    await this.setOnboardingCompleted(false);
  }
}
