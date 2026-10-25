import React from "react";
import { Alert } from "react-native";
import { act, create } from "react-test-renderer";

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

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    useFocusEffect: (cb: any) => {
      React.useEffect(() => cb(), [cb]);
    },
    useRouter: () => ({ push: mockPush, replace: mockReplace }),
  };
});

jest.mock("@expo/vector-icons", () => ({
  Feather: () => null,
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));

const mockEmitThemeChange = jest.fn();

jest.mock("@/shared/hooks/useColorScheme", () => ({
  useColorScheme: () => "dark",
  emitThemeChange: (theme: string) => mockEmitThemeChange(theme),
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
  saveSettings: jest.fn(),
}));

jest.mock("@/services/events/state-events", () => ({
  emitStateChange: jest.fn(),
}));

import SettingsScreen from "@/app/(tabs)/settings";
import { saveSettings, getSettings } from "@/features/settings/services/settings.service";
import { emitStateChange } from "@/services/events/state-events";

const baseSettings = {
  theme: "dark",
  quietHours: { enabled: false, startHour: 22, endHour: 7 },
  categories: { work: true, personal: true },
  escalationEnabled: true,
  showMascot: true,
  editorRowOrder: [],
};

describe("Settings screen", () => {
  let renderer: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    (getSettings as jest.Mock).mockResolvedValue({ ...baseSettings });
    (saveSettings as jest.Mock).mockResolvedValue(undefined);
    jest.spyOn(Alert, "alert").mockImplementation(() => {});

    await act(async () => {
      renderer = create(<SettingsScreen />);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  afterEach(() => {
    renderer?.unmount();
  });

  function byLabel(label: string) {
    return renderer.root.find(
      (node: any) =>
        node.props?.accessibilityLabel === label &&
        typeof node.props?.onPress === "function",
    );
  }

  async function press(label: string) {
    await act(async () => {
      byLabel(label).props.onPress();
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it("emits settings_changed when the companion toggle is switched off", async () => {
    await press("Companion");

    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ showMascot: false }),
    );
    expect(emitStateChange).toHaveBeenCalledWith("settings_changed");
  });

  it("emits settings_changed when reminders are switched off", async () => {
    await press("Reminders");

    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ escalationEnabled: false }),
    );
    expect(emitStateChange).toHaveBeenCalledWith("settings_changed");
  });

  it("emits settings_changed when quiet hours are enabled", async () => {
    await press("Quiet hours");

    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        quietHours: expect.objectContaining({ enabled: true }),
      }),
    );
    expect(emitStateChange).toHaveBeenCalledWith("settings_changed");
  });

  it("emits settings_changed when a category subscription is toggled off", async () => {
    await press("Category reminders");
    await press("Work");

    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        categories: expect.objectContaining({ work: false }),
      }),
    );
    expect(emitStateChange).toHaveBeenCalledWith("settings_changed");
  });

  it("changes theme without a confirmation alert and keeps persistence", async () => {
    (Alert.alert as jest.Mock).mockClear();

    await press("Light");

    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ theme: "light" }),
    );
    expect(mockEmitThemeChange).toHaveBeenCalledWith("light");
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("persists a chosen quiet-hours hour from the time picker", async () => {
    (getSettings as jest.Mock).mockResolvedValue({
      ...baseSettings,
      quietHours: { enabled: true, startHour: 22, endHour: 7 },
    });
    await act(async () => {
      renderer.unmount();
      renderer = create(<SettingsScreen />);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    await press("Mute from 10:00 PM");
    await press("11:00 PM");

    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        quietHours: expect.objectContaining({ startHour: 23 }),
      }),
    );
  });

  it("renders the current quiet-hours window as readable rows", async () => {
    (getSettings as jest.Mock).mockResolvedValue({
      ...baseSettings,
      quietHours: { enabled: true, startHour: 22, endHour: 7 },
    });
    await act(async () => {
      renderer.unmount();
      renderer = create(<SettingsScreen />);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(byLabel("Mute from 10:00 PM")).toBeTruthy();
    expect(byLabel("Resume at 7:00 AM")).toBeTruthy();
  });

  it("opens the archive, export and restore actions from the Data group", async () => {
    await press("Archived items");
    expect(mockPush).toHaveBeenCalledWith("/archive");

    expect(byLabel("Export data")).toBeTruthy();
    expect(byLabel("Restore data")).toBeTruthy();
  });

  it("confirms before clearing data with explicit scope copy", () => {
    byLabel("Clear all data").props.onPress();

    expect(Alert.alert).toHaveBeenCalledWith(
      "Clear all data?",
      "This deletes your tasks, habits, checklists, focus history and progress on this device. It can't be undone.",
      expect.arrayContaining([
        expect.objectContaining({ text: "Keep my data", style: "cancel" }),
        expect.objectContaining({
          text: "Delete everything",
          style: "destructive",
        }),
      ]),
    );
  });

  it("does not render removed developer or dashboard copy", () => {
    const text = renderer.root
      .findAll((node: any) => typeof node.props?.children === "string")
      .map((node: any) => node.props.children)
      .join("\n");

    expect(text).not.toMatch(
      /(PREMIUM CONTROLS|Settings Console|Data Engineering|engineer back-ups|workspace level|Notification Parameters|Storage Wiped|storage keys|empty canvas)/,
    );
    expect(text).not.toMatch(/(\bXP\b|\bLvl\b|\bRank\b)/);
  });
});
