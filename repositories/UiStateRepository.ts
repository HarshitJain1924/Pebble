/**
 * UiStateRepository.ts
 * ─────────────────────────
 * UI State persistence (active workspace, onboarding, theme cache).
 *
 * Persistence semantics for activeWorkspaceId:
 *   - undefined → keep existing value (no change)
 *   - null      → save null (no workspace is open)
 *   - string    → save the string value
 */
import { type UiState } from "@/shared/types/domain.types";
import AsyncStorage from "@react-native-async-storage/async-storage";

export class UiStateRepository {
  private static readonly UI_STATE_KEY = "pebble:v1:ui_state";

  static async getUiState(): Promise<UiState> {
    try {
      const raw = await AsyncStorage.getItem(this.UI_STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          activeWorkspaceId:
            parsed.activeWorkspaceId !== undefined
              ? parsed.activeWorkspaceId
              : null,
          completedOnboarding: !!parsed.completedOnboarding,
          themeCache: parsed.themeCache === "light" ? "light" : "dark",
        };
      }
    } catch (e) {
      console.warn("Failed to read UiState", e);
    }
    return {
      activeWorkspaceId: null,
      completedOnboarding: false,
      themeCache: "dark",
    };
  }

  static async saveUiState(state: Partial<UiState>): Promise<void> {
    try {
      const current = await this.getUiState();
      const updated: UiState = {
        activeWorkspaceId:
          state.activeWorkspaceId !== undefined
            ? state.activeWorkspaceId
            : current.activeWorkspaceId,
        completedOnboarding:
          state.completedOnboarding !== undefined
            ? state.completedOnboarding
            : current.completedOnboarding,
        themeCache:
          state.themeCache !== undefined
            ? state.themeCache
            : current.themeCache,
      };
      await AsyncStorage.setItem(this.UI_STATE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn("Failed to save UiState", e);
    }
  }
}
