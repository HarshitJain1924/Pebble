import React from "react";
import { Alert, Pressable } from "react-native";
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
  useColorScheme: () => "dark",
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

jest.mock("@/features/capture/services/quick-suggestions.service", () => ({
  QUICK_SUGGESTIONS_SEEN_KEY: "quick_suggestions_seen",
}));

jest.mock("@/services/storage/storage.service", () => ({
  CHECKLISTS_STORAGE_KEY: "pebble:checklists",
  COLLECTIONS_STORAGE_KEY: "pebble:collections",
  DASHBOARD_FILTER_STORAGE_KEY: "dashboard_filter",
  DASHBOARD_PRIORITY_STORAGE_KEY: "dashboard_priority",
  HISTORY_STORAGE_KEY: "pebble:history",
  NOTIF_LOG_STORAGE_KEY: "pebble:notif_log",
  PROFILE_STORAGE_KEY: "pebble:profile",
  RECYCLE_BIN_STORAGE_KEY: "pebble:recycle_bin",
  SETTINGS_STORAGE_KEY: "pebble:settings",
}));

jest.mock("@/repositories", () => ({
  clearRepositoryStorage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/services/analytics/widget-data.service", () => ({
  WIDGET_PAYLOAD_KEY: "widget_payload",
}));

jest.mock("@/services/storage/backup.service", () => ({
  BackupService: {
    generateStructuredBackup: jest.fn(),
    restoreStructuredBackup: jest.fn(),
  },
}));

jest.mock("@/services/scheduling/reminders.service", () => ({
  cancelAllScheduledNotifications: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/features/settings/services/settings.service", () => ({
  getSettings: jest.fn(),
  saveSettings: jest.fn(),
  getProfile: jest.fn(),
  saveProfile: jest.fn(),
}));

jest.mock("@/services/events/state-events", () => ({
  emitStateChange: jest.fn(),
}));

import SettingsScreen from "@/app/(tabs)/settings";
import {
  getSettings,
  saveSettings,
  getProfile,
  saveProfile,
} from "@/features/settings/services/settings.service";
import { emitStateChange } from "@/services/events/state-events";

const baseSettings = {
  theme: "dark",
  quietHours: { enabled: false, startHour: 22, endHour: 7 },
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

describe("settings_changed propagation from the Settings screen", () => {
  let renderer: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    (getSettings as jest.Mock).mockResolvedValue(baseSettings);
    (getProfile as jest.Mock).mockResolvedValue(baseProfile);
    (saveSettings as jest.Mock).mockResolvedValue(undefined);
    (saveProfile as jest.Mock).mockResolvedValue(undefined);
    jest.spyOn(Alert, "alert").mockImplementation(() => {});

    await act(async () => {
      renderer = create(<SettingsScreen />);
    });
  });

  /**
   * Presses Pressables until one causes saveSettings to be called with a
   * payload satisfying `pred`. Tracks per-press emissions so assertions on
   * emitStateChange reflect the exact press under test.
   */
  async function pressUntilSave(
    pred: (saved: any) => boolean,
  ): Promise<boolean> {
    // Pressables are matched by their onPress handler because RN's Pressable
    // composite type is not reliably findable via findAllByType in the test env.
    const pressables = renderer.root.findAll(
      (node: any) => typeof node.props.onPress === "function",
    );
    for (const pressable of pressables) {
      (saveSettings as jest.Mock).mockClear();
      (emitStateChange as jest.Mock).mockClear();
      try {
        await act(async () => {
          await pressable.props.onPress();
        });
      } catch {
        // Non-handler pressables (e.g. scroll rows) — keep scanning.
      }
      if (
        (saveSettings as jest.Mock).mock.calls.some(([saved]: any) =>
          pred(saved),
        )
      ) {
        return true;
      }
    }
    return false;
  }

  it("emits settings_changed when a category subscription is toggled off", async () => {
    const found = await pressUntilSave(
      (saved) => saved?.categories?.work === false,
    );
    expect(found).toBe(true);
    expect(emitStateChange).toHaveBeenCalledWith("settings_changed");
  });

  it("emits settings_changed when the escalation toggle is switched off", async () => {
    const found = await pressUntilSave(
      (saved) => saved?.escalationEnabled === false,
    );
    expect(found).toBe(true);
    expect(emitStateChange).toHaveBeenCalledWith("settings_changed");
  });

  it("emits settings_changed when quiet hours are enabled", async () => {
    const found = await pressUntilSave(
      (saved) => saved?.quietHours?.enabled === true,
    );
    expect(found).toBe(true);
    expect(emitStateChange).toHaveBeenCalledWith("settings_changed");
  });
});