import React from "react";
import { StyleSheet } from "react-native";
import { act, create } from "react-test-renderer";
import { Colors } from "@/shared/constants/theme";
import SettingsScreen from "@/app/(tabs)/settings";
import { getSettings } from "@/features/settings/services/settings.service";

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
    useSharedValue: (value: any) => ({ value }),
    useAnimatedStyle: () => ({}),
    withSpring: (value: any) => value,
    withTiming: (value: any) => value,
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

jest.mock("@/shared/hooks/useColorScheme", () => ({
  useColorScheme: () => mockCurrentScheme,
  emitThemeChange: jest.fn(),
}));

jest.mock("@/features/settings/services/export.service", () => ({
  exportBackupFile: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/services/storage/backup.service", () => ({
  BackupService: {
    restoreStructuredBackup: jest.fn().mockResolvedValue(undefined),
    clearAllData: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("@/features/settings/services/settings.service", () => ({
  getSettings: jest.fn(),
  saveSettings: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/services/events/state-events", () => ({
  emitStateChange: jest.fn(),
}));

const activeQuietHoursSettings = {
  theme: "system",
  quietHours: { enabled: true, startHour: 22, endHour: 7 },
  categories: { work: true, personal: true },
  escalationEnabled: true,
  showMascot: true,
  editorRowOrder: [],
};

// Legacy hardcoded overlays that must never re-enter settings surfaces.
const FORBIDDEN_SURFACE_COLORS = [
  "rgba(255,255,255,0.02)",
  "rgba(255,255,255,0.01)",
  "rgba(0,0,0,0.08)",
];

async function renderSettings() {
  let renderer: any;
  await act(async () => {
    renderer = create(<SettingsScreen />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return renderer;
}

async function openRestoreSheet(renderer: any) {
  const restoreRow = renderer.root.find(
    (node: any) =>
      node.props.accessibilityLabel === "Restore data" &&
      typeof node.props.onPress === "function",
  );
  await act(async () => {
    restoreRow.props.onPress();
  });
  return renderer.root.findByProps({ placeholder: "Paste backup here…" });
}

function flatStyleOf(node: any) {
  return StyleSheet.flatten(node.props.style) ?? {};
}

describe("Theme-dependent settings surface audit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getSettings as jest.Mock).mockResolvedValue(activeQuietHoursSettings);
  });

  describe("Light Mode Semantic Integrity", () => {
    beforeEach(() => {
      mockCurrentScheme = "light";
    });

    it("renders the restore input with semantic Colors.light.cardLight for legible contrast", async () => {
      const renderer = await renderSettings();
      const restoreInput = await openRestoreSheet(renderer);

      const flatStyle = flatStyleOf(restoreInput);
      expect(flatStyle.backgroundColor).toBe(Colors.light.cardLight);
      expect(flatStyle.backgroundColor).toBe("#F3F4F6");
      expect(flatStyle.color).toBe(Colors.light.text);
      expect(flatStyle.color).toBe("#111827");
      expect(flatStyle.backgroundColor).not.toBe("#000000");

      renderer.unmount();
    });

    it("uses no hardcoded dark overlay for any settings surface", async () => {
      const renderer = await renderSettings();
      await openRestoreSheet(renderer);

      const offenders = renderer.root
        .findAll((node: any) => node.props?.style !== undefined)
        .map((node: any) => flatStyleOf(node))
        .filter((style: any) =>
          [
            style.backgroundColor,
            style.borderColor,
            style.color,
            style.borderTopColor,
          ].some((value: any) => FORBIDDEN_SURFACE_COLORS.includes(value)),
        );

      expect(offenders).toHaveLength(0);
      renderer.unmount();
    });
  });

  describe("Dark Mode Semantic Integrity", () => {
    beforeEach(() => {
      mockCurrentScheme = "dark";
    });

    it("renders the restore input with semantic Colors.dark.cardLight in dark mode", async () => {
      const renderer = await renderSettings();
      const restoreInput = await openRestoreSheet(renderer);

      const flatStyle = flatStyleOf(restoreInput);
      expect(flatStyle.backgroundColor).toBe(Colors.dark.cardLight);
      expect(flatStyle.backgroundColor).toBe("#26262B");
      expect(flatStyle.color).toBe(Colors.dark.text);
      expect(flatStyle.color).toBe("#E4E4E7");

      renderer.unmount();
    });

    it("keeps the quiet hours window readable from stored hours", async () => {
      const renderer = await renderSettings();

      const muteRow = renderer.root.find(
        (node: any) =>
          node.props.accessibilityLabel === "Mute from 10:00 PM" &&
          typeof node.props.onPress === "function",
      );
      const resumeRow = renderer.root.find(
        (node: any) =>
          node.props.accessibilityLabel === "Resume at 7:00 AM" &&
          typeof node.props.onPress === "function",
      );

      expect(muteRow).toBeDefined();
      expect(resumeRow).toBeDefined();
      renderer.unmount();
    });
  });
});
