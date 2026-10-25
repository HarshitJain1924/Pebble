import { isCurrentlyInQuietHours } from "@/features/settings/services/settings.service";
import { Settings } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
  multiRemove: jest.fn(),
  getAllKeys: jest.fn(),
}));

describe("Quiet Hours Minute-Level Precision & Boundaries", () => {
  const baseSettings: Settings = {
    theme: "dark",
    quietHours: {
      enabled: false,
      startHour: 22,
      endHour: 7,
    },
    categories: {},
    escalationEnabled: true,
    showDuration: true,
    showRepeat: true,
    showReminder: true,
    showTags: true,
    showNotes: true,
    showMascot: true,
    editorRowOrder: [],
  };

  describe("1. Overnight Window (e.g. 22:00 -> 07:00)", () => {
    const overnightSettings: Settings = {
      ...baseSettings,
      quietHours: {
        enabled: true,
        startHour: 22,
        endHour: 7,
      },
    };

    it("suppresses notifications during evening quiet hours (22:00 -> 23:59)", () => {
      expect(isCurrentlyInQuietHours(overnightSettings, 22, 0)).toBe(true);
      expect(isCurrentlyInQuietHours(overnightSettings, 22, 1)).toBe(true);
      expect(isCurrentlyInQuietHours(overnightSettings, 23, 30)).toBe(true);
      expect(isCurrentlyInQuietHours(overnightSettings, 23, 59)).toBe(true);
    });

    it("suppresses notifications during early morning quiet hours (00:00 -> 06:59)", () => {
      expect(isCurrentlyInQuietHours(overnightSettings, 0, 0)).toBe(true);
      expect(isCurrentlyInQuietHours(overnightSettings, 3, 15)).toBe(true);
      expect(isCurrentlyInQuietHours(overnightSettings, 6, 59)).toBe(true);
    });

    it("allows notifications outside the quiet hours window", () => {
      expect(isCurrentlyInQuietHours(overnightSettings, 7, 0)).toBe(false);
      expect(isCurrentlyInQuietHours(overnightSettings, 7, 1)).toBe(false);
      expect(isCurrentlyInQuietHours(overnightSettings, 12, 0)).toBe(false);
      expect(isCurrentlyInQuietHours(overnightSettings, 21, 59)).toBe(false);
    });
  });

  describe("2. Daytime Window (e.g. 13:00 -> 15:00)", () => {
    const daytimeSettings: Settings = {
      ...baseSettings,
      quietHours: {
        enabled: true,
        startHour: 13,
        endHour: 15,
      },
    };

    it("suppresses notifications inside the daytime window", () => {
      expect(isCurrentlyInQuietHours(daytimeSettings, 13, 0)).toBe(true);
      expect(isCurrentlyInQuietHours(daytimeSettings, 14, 30)).toBe(true);
      expect(isCurrentlyInQuietHours(daytimeSettings, 14, 59)).toBe(true);
    });

    it("allows notifications outside the daytime window", () => {
      expect(isCurrentlyInQuietHours(daytimeSettings, 12, 59)).toBe(false);
      expect(isCurrentlyInQuietHours(daytimeSettings, 15, 0)).toBe(false);
      expect(isCurrentlyInQuietHours(daytimeSettings, 18, 0)).toBe(false);
    });
  });

  describe("3. Disabled Quiet Hours", () => {
    const disabledSettings: Settings = {
      ...baseSettings,
      quietHours: {
        enabled: false,
        startHour: 22,
        endHour: 7,
      },
    };

    it("always returns false when quietHours.enabled is false", () => {
      expect(isCurrentlyInQuietHours(disabledSettings, 23, 0)).toBe(false);
      expect(isCurrentlyInQuietHours(disabledSettings, 3, 0)).toBe(false);
      expect(isCurrentlyInQuietHours(disabledSettings, 12, 0)).toBe(false);
    });
  });
});
