import React from "react";
import { StyleSheet, TextInput } from "react-native";
import { act, create } from "react-test-renderer";
import { Colors } from "@/shared/constants/theme";
import SettingsScreen from "@/app/(tabs)/settings";
import { getProfile, getSettings } from "@/features/settings/services/settings.service";

let mockCurrentScheme: "light" | "dark" = "light";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("react-native-reanimated", () => {
  const React = require("react");
  const View = (props: any) => React.createElement("View", props);
  const entering = { duration: () => entering, delay: () => entering };
  return {
    __esModule: true,
    default: { View },
    Animated: { View },
    FadeInDown: entering,
  };
});

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    useFocusEffect: (cb: any) => {
      React.useEffect(() => cb(), [cb]);
    },
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  };
});

jest.mock("@expo/vector-icons", () => ({
  Feather: () => null,
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));

jest.mock("@/shared/components/ui/AppCard", () => ({
  AppCard: ({ children }: any) => children,
}));

jest.mock("@/shared/hooks/useColorScheme", () => ({
  useColorScheme: () => mockCurrentScheme,
  emitThemeChange: jest.fn(),
}));

jest.mock("@/features/profile/components/RenderAvatar", () => ({
  AVATAR_OPTIONS: [{ id: "avatar_crow", label: "Crow" }],
  EMOJI_OPTIONS: ["😀"],
  RenderAvatar: () => null,
}));

jest.mock("@/features/profile/services/pebble.service", () => ({
  GEMS_BONUS_KEY: "gems_bonus",
  GEMS_SPENT_KEY: "gems_spent",
  PEBBLE_LOG_KEY: "pebble_log",
  PEBBLE_SPENT_KEY: "pebble_spent",
}));

jest.mock("@/features/settings/services/settings.service", () => ({
  getSettings: jest.fn(),
  saveSettings: jest.fn().mockResolvedValue(undefined),
  getProfile: jest.fn(),
  saveProfile: jest.fn().mockResolvedValue(undefined),
  applyQuietHoursToReminders: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/services/storage/backup.service", () => ({
  BackupService: {
    exportBackup: jest.fn(),
    importBackup: jest.fn(),
  },
}));

const activeQuietHoursSettings = {
  theme: "system",
  haptics: true,
  reduceMotion: false,
  alarmSound: "default",
  ambientPreset: "none",
  quietHours: { enabled: true, startHour: 22, endHour: 7 },
  categories: { work: true, personal: true },
  escalationEnabled: true,
  showDuration: true,
  showRepeat: true,
  showReminder: true,
  showTags: true,
  showNotes: true,
  showMascot: true,
  editorRowOrder: [],
};

const baseProfile = { name: "Tester", email: "t@pebble.app", avatar: "😀" };

describe("Theme-dependent dark overlay audit and hardening", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getSettings as jest.Mock).mockResolvedValue(activeQuietHoursSettings);
    (getProfile as jest.Mock).mockResolvedValue(baseProfile);
  });

  describe("Light Mode Semantic Integrity", () => {
    beforeEach(() => {
      mockCurrentScheme = "light";
    });

    it("renders quietTimesBlock with semantic Colors.light.cardLight instead of hardcoded dark overlay", async () => {
      let renderer: any;
      await act(async () => {
        renderer = create(<SettingsScreen />);
      });
      // Flush async loadSettingsData
      await act(async () => {
        await Promise.resolve();
      });

      // Find the View that has quietTimesBlock style
      const views = renderer.root.findAllByType("View");
      const quietBlock = views.find((v: any) => {
        const s = v.props.style;
        if (!Array.isArray(s)) return false;
        const flat = StyleSheet.flatten(s);
        return flat && flat.padding === 12 && flat.gap === 4;
      });

      expect(quietBlock).toBeDefined();
      const flatStyle = StyleSheet.flatten(quietBlock.props.style);

      expect(flatStyle.backgroundColor).toBe(Colors.light.cardLight);
      expect(flatStyle.backgroundColor).toBe("#F3F4F6");
      expect(flatStyle.backgroundColor).not.toBe("rgba(0,0,0,0.08)");
    });

    it("renders restore modalTextInput with semantic Colors.light.cardLight ensuring legible text contrast", async () => {
      let renderer: any;
      await act(async () => {
        renderer = create(<SettingsScreen />);
      });
      await act(async () => {
        await Promise.resolve();
      });

      // Open Restore Backup modal
      const restoreBtn = renderer.root.find(
        (node: any) =>
          node.props.accessibilityLabel === "Restore Backup" &&
          typeof node.props.onPress === "function"
      );
      expect(restoreBtn).toBeDefined();

      await act(async () => {
        restoreBtn.props.onPress();
      });

      const restoreInput = renderer.root.findByProps({
        placeholder: "Paste backup JSON string here...",
      });
      expect(restoreInput).toBeDefined();

      const flatStyle = StyleSheet.flatten(restoreInput.props.style);
      expect(flatStyle.backgroundColor).toBe(Colors.light.cardLight);
      expect(flatStyle.backgroundColor).toBe("#F3F4F6");
      expect(flatStyle.color).toBe(Colors.light.text);
      expect(flatStyle.color).toBe("#111827");
      expect(flatStyle.backgroundColor).not.toBe("#000000");
    });
  });

  describe("Dark Mode Semantic Integrity", () => {
    beforeEach(() => {
      mockCurrentScheme = "dark";
    });

    it("renders quietTimesBlock with semantic Colors.dark.cardLight in dark mode", async () => {
      let renderer: any;
      await act(async () => {
        renderer = create(<SettingsScreen />);
      });
      await act(async () => {
        await Promise.resolve();
      });

      const views = renderer.root.findAllByType("View");
      const quietBlock = views.find((v: any) => {
        const s = v.props.style;
        if (!Array.isArray(s)) return false;
        const flat = StyleSheet.flatten(s);
        return flat && flat.padding === 12 && flat.gap === 4;
      });

      expect(quietBlock).toBeDefined();
      const flatStyle = StyleSheet.flatten(quietBlock.props.style);

      expect(flatStyle.backgroundColor).toBe(Colors.dark.cardLight);
      expect(flatStyle.backgroundColor).toBe("#26262B");
      expect(flatStyle.backgroundColor).not.toBe("rgba(0,0,0,0.08)");
    });

    it("renders restore modalTextInput with semantic Colors.dark.cardLight in dark mode", async () => {
      let renderer: any;
      await act(async () => {
        renderer = create(<SettingsScreen />);
      });
      await act(async () => {
        await Promise.resolve();
      });

      const restoreBtn = renderer.root.find(
        (node: any) =>
          node.props.accessibilityLabel === "Restore Backup" &&
          typeof node.props.onPress === "function"
      );
      expect(restoreBtn).toBeDefined();

      await act(async () => {
        restoreBtn.props.onPress();
      });

      const restoreInput = renderer.root.findByProps({
        placeholder: "Paste backup JSON string here...",
      });
      expect(restoreInput).toBeDefined();

      const flatStyle = StyleSheet.flatten(restoreInput.props.style);
      expect(flatStyle.backgroundColor).toBe(Colors.dark.cardLight);
      expect(flatStyle.backgroundColor).toBe("#26262B");
      expect(flatStyle.color).toBe(Colors.dark.text);
      expect(flatStyle.color).toBe("#E4E4E7");
    });
  });
});
