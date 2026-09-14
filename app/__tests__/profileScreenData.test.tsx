import React from "react";
import { act, create } from "react-test-renderer";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    Stack: { Screen: () => null },
    useFocusEffect: (cb: any) => {
      React.useEffect(() => cb(), [cb]);
    },
    useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
  };
});

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));

jest.mock("@expo/vector-icons", () => ({
  Feather: () => null,
}));

let mockScheme: "dark" | "light" = "dark";

jest.mock("@/shared/hooks/useColorScheme", () => ({
  useColorScheme: () => mockScheme,
}));

jest.mock("@/features/profile/components/RenderAvatar", () => ({
  AVATAR_OPTIONS: [{ id: "avatar_zen", label: "Zen Master", desc: "Calm" }],
  EMOJI_OPTIONS: ["😀"],
  RenderAvatar: () => null,
}));

jest.mock("@/features/profile/services/pebble.service", () => ({
  getPebbleCounts: jest.fn(),
  getGemsBalance: jest.fn(),
}));

jest.mock("@/features/profile/services/achievement-stats.service", () => ({
  getAchievementStats: jest.fn(),
}));

jest.mock("@/features/settings/services/settings.service", () => ({
  getProfile: jest.fn(),
  saveProfile: jest.fn(),
}));

import ProfileScreen from "@/app/profile";
import {
  getPebbleCounts,
  getGemsBalance,
} from "@/features/profile/services/pebble.service";
import { getAchievementStats } from "@/features/profile/services/achievement-stats.service";
import {
  getProfile,
  saveProfile,
} from "@/features/settings/services/settings.service";

const basePebbleCounts = {
  lifetime: 0,
  monthly: 0,
  today: 0,
  todayTypes: { task: 0, habit: 0, focus: 0, checklist: 0 },
  monthlyTypes: { task: 0, habit: 0, focus: 0, checklist: 0 },
  lifetimeTypes: { task: 0, habit: 0, focus: 0, checklist: 0 },
  streak: 0,
  bestStreak: 0,
};

// 6 of the canonical 10 achievements unlock with these numbers.
const baseAchievementStats = {
  todosCompleted: 12,
  habitsCompleted: 1,
  activeStreak: 7,
  focusSessions: 1,
  focusTime: 0,
};

async function flushAsync(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

let renderer: any;

function allText(): string {
  return renderer.root
    .findAll((node: any) => {
      const kids = node.props?.children;
      if (kids === undefined || kids === null) return false;
      const flat = Array.isArray(kids)
        ? kids
            .filter((k) => typeof k === "string" || typeof k === "number")
            .join("")
        : String(kids);
      return true;
    })
    .map((node: any) => {
      const kids = node.props.children;
      return Array.isArray(kids)
        ? kids
            .filter((k) => typeof k === "string" || typeof k === "number")
            .join("")
        : String(kids);
    })
    .join("\n");
}

function renderedTextContains(target: string): boolean {
  return allText().includes(target);
}

function pressableByLabel(label: string) {
  return renderer.root.find(
    (node: any) =>
      node.props?.accessibilityLabel === label &&
      typeof node.props?.onPress === "function",
  );
}

describe("Profile screen", () => {
  let storedProfile: { name: string; email: string; avatar: string };

  beforeEach(() => {
    jest.clearAllMocks();
    mockScheme = "dark";
    storedProfile = { name: "Ada", email: "ada@pebble.app", avatar: "🦉" };
    (getPebbleCounts as jest.Mock).mockResolvedValue({ ...basePebbleCounts });
    (getGemsBalance as jest.Mock).mockResolvedValue(0);
    (getAchievementStats as jest.Mock).mockResolvedValue({
      ...baseAchievementStats,
    });
    (getProfile as jest.Mock).mockImplementation(async () => ({
      ...storedProfile,
    }));
    (saveProfile as jest.Mock).mockImplementation(async (next: any) => {
      storedProfile = { ...next };
    });
  });

  afterEach(() => {
    renderer?.unmount();
  });

  async function renderProfile() {
    await act(async () => {
      renderer = create(<ProfileScreen />);
    });
    await flushAsync();
  }

  describe("identity", () => {
    it("shows the name and email with a Settings entry in the header", async () => {
      await renderProfile();

      expect(renderedTextContains("Ada")).toBe(true);
      expect(renderedTextContains("ada@pebble.app")).toBe(true);
      expect(pressableByLabel("Settings")).not.toBeNull();
    });
  });

  describe("sanctuary progression", () => {
    it("presents lifetime Pebbles as the primary number", async () => {
      (getPebbleCounts as jest.Mock).mockResolvedValue({
        ...basePebbleCounts,
        lifetime: 42,
        monthly: 5,
      });
      (getGemsBalance as jest.Mock).mockResolvedValue(3);

      await renderProfile();

      expect(renderedTextContains("42")).toBe(true);
      expect(renderedTextContains("PEBBLES")).toBe(true);
      // 42 Pebbles sits in the 26-50 band.
      expect(renderedTextContains("Stage 3 · Zen Stream")).toBe(true);
    });

    it("shows monthly Pebbles and Gems as a two-part meta footer", async () => {
      (getPebbleCounts as jest.Mock).mockResolvedValue({
        ...basePebbleCounts,
        lifetime: 42,
        monthly: 7,
      });
      (getGemsBalance as jest.Mock).mockResolvedValue(3);

      await renderProfile();

      expect(renderedTextContains("This month")).toBe(true);
      expect(renderedTextContains("7")).toBe(true);
      expect(renderedTextContains("Gems")).toBe(true);
      expect(renderedTextContains("3")).toBe(true);
    });

    it("does not render a fabricated /100 monthly target", async () => {
      (getPebbleCounts as jest.Mock).mockResolvedValue({
        ...basePebbleCounts,
        lifetime: 42,
        monthly: 7,
      });

      await renderProfile();

      expect(renderedTextContains("/100")).toBe(false);
      expect(renderedTextContains("Monthly Target")).toBe(false);
    });

    it("reports remaining Pebbles to the next stage from the canonical helper", async () => {
      (getPebbleCounts as jest.Mock).mockResolvedValue({
        ...basePebbleCounts,
        lifetime: 18,
      });

      await renderProfile();

      // Stage 2 completes at 25 → 7 Pebbles remaining.
      expect(renderedTextContains("7 pebbles to Stage 3")).toBe(true);
    });

    it("shows a calm empty state with no fabricated progress when there are no Pebbles", async () => {
      await renderProfile();

      expect(renderedTextContains("Your sanctuary is empty.")).toBe(true);
      expect(
        renderedTextContains("Finish something to earn your first Pebble."),
      ).toBe(true);
      expect(renderedTextContains("This month")).toBe(false);
    });

    it("never renders XP, Level, Rank or experience copy", async () => {
      (getPebbleCounts as jest.Mock).mockResolvedValue({
        ...basePebbleCounts,
        lifetime: 42,
      });
      (getGemsBalance as jest.Mock).mockResolvedValue(3);

      await renderProfile();

      expect(allText()).not.toMatch(/(\bXP\b|\bLvl\b|\bLevel\b|\bRank\b|experience)/i);
    });
  });

  describe("achievements gateway", () => {
    it("derives the unlocked count from the canonical ten achievements", async () => {
      await renderProfile();

      expect(renderedTextContains("6 / 10")).toBe(true);
    });

    it("never reports a hardcoded six-item count", async () => {
      (getAchievementStats as jest.Mock).mockResolvedValue({
        todosCompleted: 0,
        habitsCompleted: 0,
        activeStreak: 0,
        focusSessions: 0,
        focusTime: 0,
      });

      await renderProfile();

      expect(renderedTextContains("0 / 10")).toBe(true);
    });
  });

  describe("navigation", () => {
    it("opens Stats", async () => {
      await renderProfile();

      await act(async () => {
        pressableByLabel("Open Stats & insights").props.onPress();
      });

      expect(mockPush).toHaveBeenCalledWith("/profile/stats");
    });

    it("opens Achievements", async () => {
      await renderProfile();

      await act(async () => {
        pressableByLabel("Open Achievements").props.onPress();
      });

      expect(mockPush).toHaveBeenCalledWith("/profile/achievements");
    });

    it("opens Settings from the header gear", async () => {
      await renderProfile();

      await act(async () => {
        pressableByLabel("Settings").props.onPress();
      });

      expect(mockPush).toHaveBeenCalledWith("/settings");
    });

    it("opens Pebble Sanctuary from the centerpiece plaque", async () => {
      await renderProfile();

      await act(async () => {
        pressableByLabel("Open Pebble Sanctuary").props.onPress();
      });

      expect(mockPush).toHaveBeenCalledWith("/sanctuary");
    });
  });

  describe("avatar picker", () => {
    it("persists a selection immediately with no separate save step", async () => {
      await renderProfile();

      await act(async () => {
        pressableByLabel("Change your avatar").props.onPress();
      });
      await act(async () => {
        pressableByLabel("Emoji avatar 😀").props.onPress();
      });
      await flushAsync();

      expect(saveProfile).toHaveBeenCalledWith(
        expect.objectContaining({ avatar: "😀" }),
      );
      expect(renderedTextContains("Save Profile")).toBe(false);
    });

    it("keeps the chosen option marked as selected", async () => {
      await renderProfile();

      await act(async () => {
        pressableByLabel("Change your avatar").props.onPress();
      });
      await act(async () => {
        pressableByLabel("Emoji avatar 😀").props.onPress();
      });
      await flushAsync();

      const selected = pressableByLabel("Emoji avatar 😀");
      expect(selected.props.accessibilityRole).toBe("radio");
      expect(selected.props.accessibilityState.selected).toBe(true);
    });

    it("reverts the selection and shows an inline error when saving fails", async () => {
      (saveProfile as jest.Mock).mockRejectedValue(new Error("disk full"));

      await renderProfile();

      await act(async () => {
        pressableByLabel("Change your avatar").props.onPress();
      });
      await act(async () => {
        pressableByLabel("Emoji avatar 😀").props.onPress();
      });
      await flushAsync();

      expect(
        renderedTextContains("Couldn't save that choice. Please try again."),
      ).toBe(true);
      expect(pressableByLabel("Emoji avatar 😀").props.accessibilityState
        .selected).toBe(false);
    });
  });

  describe("refresh", () => {
    it("reloads when pebbles_changed is emitted", async () => {
      (getPebbleCounts as jest.Mock)
        .mockResolvedValueOnce({ ...basePebbleCounts, lifetime: 20 })
        .mockResolvedValueOnce({ ...basePebbleCounts, lifetime: 30 });

      await renderProfile();
      expect(renderedTextContains("20")).toBe(true);

      const { emitStateChange } = require("@/services/events/state-events");
      emitStateChange("pebbles_changed");
      await flushAsync();

      expect(getPebbleCounts).toHaveBeenCalledTimes(2);
      expect(renderedTextContains("30")).toBe(true);
    });
  });

  describe("theme support", () => {
    it("renders identity and sanctuary in light theme without crashing", async () => {
      mockScheme = "light";
      (getPebbleCounts as jest.Mock).mockResolvedValue({
        ...basePebbleCounts,
        lifetime: 42,
        monthly: 5,
      });
      (getGemsBalance as jest.Mock).mockResolvedValue(2);

      await renderProfile();

      expect(renderedTextContains("Ada")).toBe(true);
      expect(renderedTextContains("PEBBLE SANCTUARY")).toBe(true);
      expect(renderedTextContains("42")).toBe(true);
      expect(pressableByLabel("Open Achievements")).not.toBeNull();
    });
  });
});
