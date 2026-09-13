import React from "react";
import { act, create } from "react-test-renderer";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    Stack: { Screen: () => null },
    useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
    useFocusEffect: (cb: any) => {
      React.useEffect(() => cb(), [cb]);
    },
  };
});

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));

jest.mock("@expo/vector-icons", () => ({
  Feather: () => null,
}));

jest.mock("@/shared/hooks/useColorScheme", () => ({
  useColorScheme: () => "dark",
}));

jest.mock("@/shared/components/layout/AmbientBackground", () => ({
  FloatingGlow: () => null,
}));

jest.mock("@/features/profile/services/achievement-stats.service", () => ({
  getAchievementStats: jest.fn(),
}));

import AchievementsScreen from "@/app/profile/achievements";
import { getAchievementStats } from "@/features/profile/services/achievement-stats.service";

let renderer: any;

async function flushAsync(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function renderedStrings(): string[] {
  return renderer.root
    .findAll((node: any) => {
      const c = node.props?.children;
      return typeof c === "string" || typeof c === "number";
    })
    .map((node: any) => String(node.props.children));
}

function pressableByLabel(label: string) {
  return renderer.root.find(
    (node: any) =>
      node.props?.accessibilityLabel === label &&
      typeof node.props?.onPress === "function",
  );
}

describe("Achievements screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAchievementStats as jest.Mock).mockResolvedValue({
      todosCompleted: 12,
      habitsCompleted: 1,
      activeStreak: 7,
      focusSessions: 1,
      focusTime: 0,
    });
  });

  afterEach(() => {
    renderer?.unmount();
  });

  async function renderScreen() {
    await act(async () => {
      renderer = create(<AchievementsScreen />);
    });
    await flushAsync();
  }

  it("reports the canonical unlocked count from one summary only", async () => {
    await renderScreen();

    const strings = renderedStrings();
    expect(strings).toContain("6 of 10 unlocked");
    // The old screen duplicated the same fact as a percentage caption.
    const unique = new Set(strings.filter((s) => s.includes("%")));
    expect([...unique]).toEqual([]);
  });

  it("groups all ten achievements by category", async () => {
    await renderScreen();

    const strings = renderedStrings();
    expect(strings).toEqual(
      expect.arrayContaining(["TASKS", "HABITS", "STREAKS", "FOCUS"]),
    );
    // Group counts: 2/3 tasks, 1/2 habits, 2/3 streaks, 1/2 focus.
    expect(strings).toEqual(expect.arrayContaining(["2/3", "1/2", "2/3", "1/2"]));
  });

  it("renders every achievement title", async () => {
    await renderScreen();

    const strings = renderedStrings();
    [
      "First Pebble",
      "Decathlon Cleared",
      "Centurion Cleared",
      "Daily Routine",
      "Habit Champion",
      "Three-Day Spark",
      "Weekly Momentum",
      "Monthly Resilience",
      "Deep Dive",
      "Focus Master",
    ].forEach((title) => expect(strings).toContain(title));
  });

  it("shows requirement progress on locked achievements", async () => {
    await renderScreen();

    const strings = renderedStrings();
    // tasks_100 — 12 of 100 done.
    expect(
      strings.some((s) => s.includes("Complete 100 tasks in total · 12/100")),
    ).toBe(true);
  });

  it("opens a detail sheet with state and progress", async () => {
    await renderScreen();

    await act(async () => {
      pressableByLabel("Centurion Cleared, locked").props.onPress();
    });
    await flushAsync();

    const strings = renderedStrings();
    expect(strings).toContain("Centurion Cleared");
    expect(strings).toContain("Locked");
    expect(strings).toContain("12 / 100");
  });

  it("opens a detail sheet for an unlocked achievement", async () => {
    await renderScreen();

    await act(async () => {
      pressableByLabel("First Pebble, unlocked").props.onPress();
    });
    await flushAsync();

    const strings = renderedStrings();
    expect(strings).toContain("First Pebble");
    expect(strings).toContain("Unlocked");
    expect(strings).toContain("Completed first task");
  });
});
