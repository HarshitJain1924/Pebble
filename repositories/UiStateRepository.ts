/**
 * UiStateRepository.ts
 * ─────────────────────────
 * UI State persistence (active workspace, onboarding, theme cache).
 */
import {
  DEFAULT_WORKSPACE_ID,
  type UiState,
} from "@/shared/types/repository.types";
import AsyncStorage from "@react-native-async-storage/async-storage";

export class UiStateRepository {
  private static readonly UI_STATE_KEY = "pebble:core:ui_state";

  static async getUiState(): Promise<UiState> {
    try {
      const raw = await AsyncStorage.getItem(this.UI_STATE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn("Failed to read UiState", e);
    }
    return {
      activeWorkspaceId: DEFAULT_WORKSPACE_ID,
      completedOnboarding: false,
      themeCache: "dark",
    };
  }

  static async saveUiState(state: Partial<UiState>): Promise<void> {
    try {
      const current = await this.getUiState();
      const updated = { ...current, ...state };
      await AsyncStorage.setItem(this.UI_STATE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn("Failed to save UiState", e);
    }
  }
}
