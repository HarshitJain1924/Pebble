/**
 * SettingsRepository.ts
 * ────────────────────────
 * Settings persistence — single global key `pebble:settings` (preserved for
 * existing installs) with defensive runtime normalization.
 *
 * Persisted JSON must never be trusted as a fully-formed `Settings` object:
 * every known field is explicitly validated and falls back to the canonical
 * default when missing, malformed, or out of range. Unknown top-level fields
 * are preserved on read so forward-compatible payloads survive a round trip.
 */
import { type Settings } from "@/shared/types/domain.types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { withLock } from "@/shared/utils/mutex";

export const SETTINGS_STORAGE_KEY = "pebble:settings";

const THEMES = ["dark", "light", "system"] as const;

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  quietHours: {
    enabled: false,
    startHour: 22,
    endHour: 7,
  },
  categories: {
    work: true,
    personal: true,
    health: true,
    learning: true,
    creative: true,
    focus: true,
    habit: true,
  },
  escalationEnabled: true,
  showDuration: true,
  showRepeat: true,
  showReminder: true,
  showTags: true,
  showNotes: true,
  showMascot: true,
  editorRowOrder: [
    "date",
    "workspace",
    "priority",
    "reminder",
    "repeat",
    "duration",
    "tags",
  ],
};

const DEFAULT_CATEGORY_KEYS = Object.keys(DEFAULT_SETTINGS.categories);

/**
 * Partial update payload that also allows merging nested `quietHours` and
 * `categories` objects field-by-field instead of replacing them wholesale.
 */
export type SettingsPatch = Partial<
  Omit<Settings, "quietHours" | "categories">
> & {
  quietHours?: Partial<Settings["quietHours"]>;
  categories?: Partial<Settings["categories"]>;
};

function isValidHour(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 23
  );
}

function isValidTheme(value: unknown): value is Settings["theme"] {
  return THEMES.includes(value as Settings["theme"]);
}

/**
 * Coerce arbitrary persisted data into a fully valid `Settings` object.
 * Unknown top-level fields survive so newer payloads are not destroyed.
 */
export function normalizeSettings(raw: any): Settings {
  const base: any =
    raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};

  // Categories: every known key must be a boolean; unknown boolean keys are
  // preserved for forward compatibility.
  const categories: Record<string, boolean> = {};
  for (const key of DEFAULT_CATEGORY_KEYS) {
    const val = base.categories?.[key];
    categories[key] =
      typeof val === "boolean" ? val : DEFAULT_SETTINGS.categories[key];
  }
  if (
    base.categories &&
    typeof base.categories === "object" &&
    !Array.isArray(base.categories)
  ) {
    for (const [key, val] of Object.entries(base.categories)) {
      if (!(key in categories) && typeof val === "boolean") {
        categories[key] = val;
      }
    }
  }

  const rawQuietHours =
    base.quietHours &&
    typeof base.quietHours === "object" &&
    !Array.isArray(base.quietHours)
      ? base.quietHours
      : {};

  const result: any = { ...base };
  result.theme = isValidTheme(base.theme) ? base.theme : DEFAULT_SETTINGS.theme;
  result.quietHours = {
    enabled:
      typeof rawQuietHours.enabled === "boolean"
        ? rawQuietHours.enabled
        : DEFAULT_SETTINGS.quietHours.enabled,
    startHour: isValidHour(rawQuietHours.startHour)
      ? rawQuietHours.startHour
      : DEFAULT_SETTINGS.quietHours.startHour,
    endHour: isValidHour(rawQuietHours.endHour)
      ? rawQuietHours.endHour
      : DEFAULT_SETTINGS.quietHours.endHour,
  };
  result.categories = categories;
  result.escalationEnabled =
    typeof base.escalationEnabled === "boolean"
      ? base.escalationEnabled
      : DEFAULT_SETTINGS.escalationEnabled;
  result.showDuration =
    typeof base.showDuration === "boolean"
      ? base.showDuration
      : DEFAULT_SETTINGS.showDuration;
  result.showRepeat =
    typeof base.showRepeat === "boolean"
      ? base.showRepeat
      : DEFAULT_SETTINGS.showRepeat;
  result.showReminder =
    typeof base.showReminder === "boolean"
      ? base.showReminder
      : DEFAULT_SETTINGS.showReminder;
  result.showTags =
    typeof base.showTags === "boolean"
      ? base.showTags
      : DEFAULT_SETTINGS.showTags;
  result.showNotes =
    typeof base.showNotes === "boolean"
      ? base.showNotes
      : DEFAULT_SETTINGS.showNotes;
  result.showMascot =
    typeof base.showMascot === "boolean"
      ? base.showMascot
      : DEFAULT_SETTINGS.showMascot;

  if (
    Array.isArray(base.editorRowOrder) &&
    base.editorRowOrder.every((item: unknown) => typeof item === "string")
  ) {
    result.editorRowOrder = base.editorRowOrder;
  } else {
    result.editorRowOrder = DEFAULT_SETTINGS.editorRowOrder;
  }

  if (
    typeof base.defaultTimeEstimate === "number" &&
    Number.isFinite(base.defaultTimeEstimate) &&
    base.defaultTimeEstimate >= 0
  ) {
    result.defaultTimeEstimate = base.defaultTimeEstimate;
  } else {
    delete result.defaultTimeEstimate;
  }

  return result as Settings;
}

export class SettingsRepository {
  /**
   * Read persisted settings (or defaults when missing/corrupt).
   * Plain read — safe without a lock because AsyncStorage single-key
   * reads are atomic and the write primitives hold the canonical lock.
   */
  static async getSettings(): Promise<Settings> {
    return this.getSettingsUnlocked();
  }

  /**
   * Unlocked read primitive required for locked Read-Modify-Write cycles
   * (see `updateSettings`) to avoid re-entrant deadlocks on the same key.
   */
  static async getSettingsUnlocked(): Promise<Settings> {
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return normalizeSettings(DEFAULT_SETTINGS);
      return normalizeSettings(JSON.parse(raw));
    } catch (e) {
      console.warn(
        "[SettingsRepository] Failed to parse persisted settings; using defaults",
        e,
      );
      return normalizeSettings(DEFAULT_SETTINGS);
    }
  }

  /** Full-state write, normalized before persistence. */
  static async saveSettings(settings: Settings): Promise<void> {
    await withLock(SETTINGS_STORAGE_KEY, async () => {
      await this.saveSettingsUnlocked(settings);
    });
  }

  /** Unlocked persistence primitive for composition under held locks. */
  static async saveSettingsUnlocked(settings: Settings): Promise<void> {
    const normalized = normalizeSettings(settings);
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  }

  /**
   * Locked Read-Modify-Write partial update. The read/merge/write cycle
   * happens entirely inside the lock boundary so concurrent patches never
   * lose unrelated fields.
   */
  static async updateSettings(patch: SettingsPatch): Promise<Settings> {
    return withLock(SETTINGS_STORAGE_KEY, async () => {
      return this.updateSettingsUnlocked(patch);
    });
  }

  /** Unlocked partial-update primitive for composition under held locks. */
  static async updateSettingsUnlocked(
    patch: SettingsPatch,
  ): Promise<Settings> {
    const current = await this.getSettingsUnlocked();
    const merged: any = { ...current, ...patch };
    if (patch.quietHours) {
      merged.quietHours = { ...current.quietHours, ...patch.quietHours };
    }
    if (patch.categories) {
      merged.categories = { ...current.categories, ...patch.categories };
    }
    const normalized = normalizeSettings(merged);
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }
}