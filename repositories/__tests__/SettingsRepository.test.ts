import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  SettingsRepository,
} from "@/repositories/SettingsRepository";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const storage = AsyncStorage as typeof AsyncStorage;

beforeEach(async () => {
  await storage.clear();
  jest.restoreAllMocks();
});

describe("SettingsRepository", () => {
  describe("loading", () => {
    it("returns full defaults when settings are missing", async () => {
      const settings = await SettingsRepository.getSettings();

      expect(settings.theme).toBe("dark");
      expect(settings.quietHours).toEqual({
        enabled: false,
        startHour: 22,
        endHour: 7,
      });
      expect(settings.categories).toEqual({
        work: true,
        personal: true,
        health: true,
        learning: true,
        creative: true,
        focus: true,
        habit: true,
      });
      expect(settings.escalationEnabled).toBe(true);
      expect(settings.showDuration).toBe(true);
      expect(settings.showRepeat).toBe(true);
      expect(settings.showReminder).toBe(true);
      expect(settings.showTags).toBe(true);
      expect(settings.showNotes).toBe(true);
      expect(settings.showMascot).toBe(true);
      expect(settings.editorRowOrder).toEqual([
        "date",
        "workspace",
        "priority",
        "reminder",
        "repeat",
        "duration",
        "tags",
      ]);
      expect(settings.defaultTimeEstimate).toBeUndefined();
    });

    it("loads valid persisted settings unchanged", async () => {
      const persisted = {
        theme: "light",
        quietHours: { enabled: true, startHour: 21, endHour: 6 },
        categories: { work: false, personal: true },
        escalationEnabled: false,
        showMascot: false,
        editorRowOrder: ["date"],
        defaultTimeEstimate: 25,
      };
      await storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(persisted));

      const settings = await SettingsRepository.getSettings();

      expect(settings.theme).toBe("light");
      expect(settings.quietHours).toEqual({
        enabled: true,
        startHour: 21,
        endHour: 6,
      });
      expect(settings.categories.work).toBe(false);
      expect(settings.categories.personal).toBe(true);
      // Missing known category keys fall back to defaults.
      expect(settings.categories.health).toBe(true);
      expect(settings.escalationEnabled).toBe(false);
      expect(settings.showMascot).toBe(false);
      expect(settings.showDuration).toBe(true);
      expect(settings.editorRowOrder).toEqual(["date"]);
      expect(settings.defaultTimeEstimate).toBe(25);
    });

    it("falls back to defaults on malformed JSON", async () => {
      await storage.setItem(SETTINGS_STORAGE_KEY, "{definitely not json");

      const settings = await SettingsRepository.getSettings();

      expect(settings.theme).toBe(DEFAULT_SETTINGS.theme);
      expect(settings.quietHours).toEqual(DEFAULT_SETTINGS.quietHours);
      expect(settings.categories).toEqual(DEFAULT_SETTINGS.categories);
      expect(settings.escalationEnabled).toBe(true);
    });

    it("preserves nested defaults when quietHours is malformed", async () => {
      await storage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({
          theme: "light",
          quietHours: "nope",
          categories: null,
          escalationEnabled: "yes",
          showMascot: 1,
        }),
      );

      const settings = await SettingsRepository.getSettings();

      expect(settings.theme).toBe("light");
      expect(settings.quietHours).toEqual(DEFAULT_SETTINGS.quietHours);
      expect(settings.categories).toEqual(DEFAULT_SETTINGS.categories);
      expect(settings.escalationEnabled).toBe(true);
      expect(settings.showMascot).toBe(true);
    });

    it("normalizes malformed categories and preserves unknown boolean keys", async () => {
      await storage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({
          categories: { work: "yes", personal: false, custom_cat: true },
        }),
      );

      const settings = await SettingsRepository.getSettings();

      expect(settings.categories.work).toBe(true);
      expect(settings.categories.personal).toBe(false);
      expect(settings.categories.custom_cat).toBe(true);
      expect(settings.categories.health).toBe(true);
      // Non-boolean unknown entries are dropped.
      expect(settings.categories).not.toHaveProperty("broken");
    });

    it("normalizes out-of-range quiet hours back to defaults", async () => {
      await storage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({
          quietHours: { enabled: true, startHour: 25, endHour: -1 },
        }),
      );

      const settings = await SettingsRepository.getSettings();

      expect(settings.quietHours.enabled).toBe(true);
      expect(settings.quietHours.startHour).toBe(22);
      expect(settings.quietHours.endHour).toBe(7);
    });

    it("falls back for invalid editorRowOrder and defaultTimeEstimate", async () => {
      await storage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({
          editorRowOrder: [1, 2],
          defaultTimeEstimate: "30",
        }),
      );

      const settings = await SettingsRepository.getSettings();

      expect(settings.editorRowOrder).toEqual(DEFAULT_SETTINGS.editorRowOrder);
      expect(settings.defaultTimeEstimate).toBeUndefined();
    });

    it("rejects invalid themes but preserves valid ones", async () => {
      await storage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ theme: "neon" }),
      );
      expect((await SettingsRepository.getSettings()).theme).toBe("dark");

      await storage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ theme: "system" }),
      );
      expect((await SettingsRepository.getSettings()).theme).toBe("system");
    });
  });

  describe("saving", () => {
    it("normalizes before persisting", async () => {
      const defaults = await SettingsRepository.getSettings();
      await SettingsRepository.saveSettings({
        ...defaults,
        theme: "neon" as any,
      });

      const persisted = JSON.parse(
        (await storage.getItem(SETTINGS_STORAGE_KEY))!,
      );
      expect(persisted.theme).toBe("dark");
    });

    it("round-trips a valid settings object", async () => {
      const original: any = {
        ...DEFAULT_SETTINGS,
        theme: "light",
        quietHours: { enabled: true, startHour: 20, endHour: 8 },
        categories: { ...DEFAULT_SETTINGS.categories, focus: false },
        defaultTimeEstimate: 45,
      };
      await SettingsRepository.saveSettings(original);

      const loaded = await SettingsRepository.getSettings();
      expect(loaded.theme).toBe("light");
      expect(loaded.quietHours).toEqual({
        enabled: true,
        startHour: 20,
        endHour: 8,
      });
      expect(loaded.categories.focus).toBe(false);
      expect(loaded.defaultTimeEstimate).toBe(45);
    });
  });

  describe("updates", () => {
    it("partial update preserves unrelated fields", async () => {
      await SettingsRepository.saveSettings({
        ...DEFAULT_SETTINGS,
        theme: "light",
        escalationEnabled: false,
        categories: { ...DEFAULT_SETTINGS.categories, habit: false },
      });

      const updated = await SettingsRepository.updateSettings({
        theme: "system",
      });

      expect(updated.theme).toBe("system");
      expect(updated.escalationEnabled).toBe(false);
      expect(updated.categories.habit).toBe(false);
      expect(updated.showMascot).toBe(true);

      const persisted = await SettingsRepository.getSettings();
      expect(persisted.theme).toBe("system");
      expect(persisted.escalationEnabled).toBe(false);
    });

    it("nested quietHours patch merges instead of replacing", async () => {
      await SettingsRepository.saveSettings({
        ...DEFAULT_SETTINGS,
        quietHours: { enabled: true, startHour: 22, endHour: 7 },
      });

      const updated = await SettingsRepository.updateSettings({
        quietHours: { startHour: 23 },
      });

      expect(updated.quietHours).toEqual({
        enabled: true,
        startHour: 23,
        endHour: 7,
      });
    });

    it("nested categories patch merges instead of replacing", async () => {
      await SettingsRepository.saveSettings({
        ...DEFAULT_SETTINGS,
        categories: { ...DEFAULT_SETTINGS.categories, work: false },
      });

      const updated = await SettingsRepository.updateSettings({
        categories: { health: false },
      });

      expect(updated.categories.work).toBe(false);
      expect(updated.categories.health).toBe(false);
      expect(updated.categories.personal).toBe(true);
    });

    it("concurrent updates do not lose unrelated changes", async () => {
      const a = SettingsRepository.updateSettings({ theme: "light" });
      const b = SettingsRepository.updateSettings({
        escalationEnabled: false,
      });
      await Promise.all([a, b]);

      const persisted = await SettingsRepository.getSettings();
      expect(persisted.theme).toBe("light");
      expect(persisted.escalationEnabled).toBe(false);
      expect(persisted.showMascot).toBe(true);
      expect(persisted.quietHours).toEqual(DEFAULT_SETTINGS.quietHours);
    });
  });
});