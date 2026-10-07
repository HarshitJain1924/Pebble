import React from "react";
import { act, create } from "react-test-renderer";
import { Text as RNText } from "react-native";
import { StreakFlameBadge } from "../StreakFlameBadge";
import type { HabitStreakStage } from "../../utils/habitStreakStage";

let mockReduceMotion = false;

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("@/shared/hooks/useReducedMotion", () => ({
  useReducedMotion: () => mockReduceMotion,
  default: () => mockReduceMotion,
}));

// The five Flaticon flame files are not in the repo yet, so the registry is
// mocked here to prove the integration seam works once they land.
const mockSources: Partial<Record<HabitStreakStage, number>> = {};

jest.mock("../../utils/streakFlameAssets", () => ({
  STREAK_FLAME_ASSETS: mockSources,
  resolveStreakFlameSource: (stage: HabitStreakStage) => mockSources[stage] ?? null,
}));

jest.mock("expo-image", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    Image: (props: any) => React.createElement(View, { testID: "habit-streak-flame", ...props }),
  };
});

const renderBadge = (streak: number, animated = false) => {
  let renderer: any;
  act(() => {
    renderer = create(<StreakFlameBadge streak={streak} animated={animated} />);
  });
  return renderer.root;
};

const textOf = (root: any) =>
  root.findAllByType(RNText).map((t: any) => t.props.children);

const labelOf = (root: any) =>
  root.findByProps({ testID: "habit-streak-badge" }).props.accessibilityLabel;

beforeEach(() => {
  mockReduceMotion = false;
  for (const key of Object.keys(mockSources)) {
    delete mockSources[Number(key) as HabitStreakStage];
  }
});

describe("StreakFlameBadge", () => {
  it("always shows the streak value so the number is never lost", () => {
    const root = renderBadge(12);
    expect(textOf(root)).toEqual(expect.arrayContaining([12, "days"]));
  });

  it("pluralizes a single-day streak", () => {
    const root = renderBadge(1);
    expect(textOf(root)).toEqual(expect.arrayContaining([1, "day"]));
  });

  it("exposes a meaningful accessibility label instead of relying on artwork", () => {
    expect(labelOf(renderBadge(12))).toBe("12 day streak");
    expect(labelOf(renderBadge(0))).toBe("0 day streak");
    expect(labelOf(renderBadge(1))).toBe("1 day streak");
  });

  it("renders no flame artwork while the asset registry is empty", () => {
    const root = renderBadge(30);
    expect(root.findAllByProps({ testID: "habit-streak-flame" })).toHaveLength(0);
  });

  it("renders the registered artwork for the matching stage", () => {
    // 14–29 days maps to stage 4.
    mockSources[4] = 42;

    const root = renderBadge(20);
    const flame = root.findByProps({ testID: "habit-streak-flame" });
    expect(flame.props.source).toBe(42);
  });

  it("does not render a different stage's artwork", () => {
    mockSources[4] = 42;

    // 7–13 days maps to stage 3, which has no artwork registered.
    const root = renderBadge(7);
    expect(root.findAllByProps({ testID: "habit-streak-flame" })).toHaveLength(0);
  });

  it("does not autoplay the GIF in a list row by default", () => {
    mockSources[4] = 42;

    const flame = renderBadge(20).findByProps({ testID: "habit-streak-flame" });
    expect(flame.props.autoplay).toBe(false);
  });

  it("autoplays only on a surface that explicitly opts in", () => {
    mockSources[4] = 42;

    const flame = renderBadge(20, true).findByProps({ testID: "habit-streak-flame" });
    expect(flame.props.autoplay).toBe(true);
  });

  it("keeps the flame visible but still when reduced motion is requested", () => {
    mockSources[4] = 42;
    mockReduceMotion = true;

    // The stage is still communicated — it just does not move.
    const flame = renderBadge(20, true).findByProps({ testID: "habit-streak-flame" });
    expect(flame.props.source).toBe(42);
    expect(flame.props.autoplay).toBe(false);

    const root = renderBadge(20, true);
    expect(textOf(root)).toEqual(expect.arrayContaining([20, "days"]));
    expect(labelOf(root)).toBe("20 day streak");
  });
});
