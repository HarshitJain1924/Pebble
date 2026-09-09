import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getProfile,
  getSettings,
  saveProfile,
  saveSettings,
  updateProfile,
  updateSettings,
} from "@/features/settings/services/settings.service";
import {
  PROFILE_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
} from "@/services/storage/storage.service";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const storage = AsyncStorage as typeof AsyncStorage;

const UI_STATE_KEY = "pebble:v1:ui_state";

beforeEach(async () => {
  await storage.clear();
  jest.restoreAllMocks();
});

describe("settings.service persistence delegation", () => {
  describe("settings", () => {
    it("returns defaults when nothing is persisted", async () => {
      const settings = await getSettings();

      expect(settings.theme).toBe("dark");
      expect(settings.quietHours).toEqual({
        enabled: false,
        startHour: 22,
        endHour: 7,
      });
      expect(settings.escalationEnabled).toBe(true);
    });

    it("saveSettings persists through the repository and updates themeCache", async () => {
      const settings = await getSettings();
      await saveSettings({ ...settings, theme: "light" });

      const persisted = JSON.parse(
        (await storage.getItem(SETTINGS_STORAGE_KEY))!,
      );
      expect(persisted.theme).toBe("light");

      const uiState = JSON.parse((await storage.getItem(UI_STATE_KEY))!);
      expect(uiState.themeCache).toBe("light");
    });

    it("saveSettings maps the system theme to a dark themeCache", async () => {
      const settings = await getSettings();
      await saveSettings({ ...settings, theme: "system" });

      const uiState = JSON.parse((await storage.getItem(UI_STATE_KEY))!);
      expect(uiState.themeCache).toBe("dark");
    });

    it("updateSettings applies partial patches and preserves unrelated fields", async () => {
      await saveSettings({ ...(await getSettings()), theme: "dark" });

      const updated = await updateSettings({ theme: "light" });

      expect(updated.theme).toBe("light");
      expect(updated.escalationEnabled).toBe(true);
      expect((await getSettings()).theme).toBe("light");

      const uiState = JSON.parse((await storage.getItem(UI_STATE_KEY))!);
      expect(uiState.themeCache).toBe("light");
    });
  });

  describe("profile", () => {
    it("returns defaults when nothing is persisted", async () => {
      const profile = await getProfile();

      expect(profile).toEqual({
        name: "User",
        email: "local@me",
        avatar: "👨‍💻",
      });
    });

    it("saveProfile persists through the repository and does NOT complete onboarding", async () => {
      await saveProfile({
        name: "Ada",
        email: "ada@example.com",
        avatar: "🚀",
      });

      const persisted = JSON.parse(
        (await storage.getItem(PROFILE_STORAGE_KEY))!,
      );
      expect(persisted.name).toBe("Ada");
      expect(persisted.avatar).toBe("🚀");

      const uiStateRaw = await storage.getItem(UI_STATE_KEY);
      if (uiStateRaw) {
        const uiState = JSON.parse(uiStateRaw);
        expect(uiState.completedOnboarding).toBe(false);
      }
    });

    it("updateProfile does NOT complete onboarding", async () => {
      await updateProfile({ name: "Ada Updated" });
      const uiStateRaw = await storage.getItem(UI_STATE_KEY);
      if (uiStateRaw) {
        const uiState = JSON.parse(uiStateRaw);
        expect(uiState.completedOnboarding).toBe(false);
      }
    });

    it("updateProfile applies partial patches and preserves unrelated fields", async () => {
      await saveProfile({
        name: "Ada",
        email: "ada@example.com",
        avatar: "🚀",
      });

      const updated = await updateProfile({ avatar: "🔥" });

      expect(updated.name).toBe("Ada");
      expect(updated.email).toBe("ada@example.com");
      expect(updated.avatar).toBe("🔥");
      expect((await getProfile()).email).toBe("ada@example.com");
    });
  });
});