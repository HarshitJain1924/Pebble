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

const mockStartAnimating = jest.fn().mockResolvedValue(undefined);
const mockStopAnimating = jest.fn().mockResolvedValue(undefined);

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light" },
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
    Image: React.forwardRef((props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({
        startAnimating: mockStartAnimating,
        stopAnimating: mockStopAnimating,
      }));
      return React.createElement(View, { testID: "habit-streak-flame", ...props });
    }),
  };
});

const renderBadge = (streak: number, animated = false, onPress?: () => void) => {
  let renderer: any;
  act(() => {
    renderer = create(<StreakFlameBadge streak={streak} animated={animated} onPress={onPress} />);
  });
  return renderer;
};

const textOf = (root: any) =>
  root.findAllByType(RNText).map((t: any) => t.props.children);

const labelOf = (root: any) =>
  root.findByProps({ testID: "habit-streak-badge" }).props.accessibilityLabel;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  mockReduceMotion = false;
  for (const key of Object.keys(mockSources)) {
    delete mockSources[Number(key) as HabitStreakStage];
  }
});

describe("StreakFlameBadge", () => {
  it("always shows the streak value so the number is never lost", () => {
    const renderer = renderBadge(12);
    expect(textOf(renderer.root)).toEqual(expect.arrayContaining([12, "days"]));
  });

  it("pluralizes a single-day streak", () => {
    const renderer = renderBadge(1);
    expect(textOf(renderer.root)).toEqual(expect.arrayContaining([1, "day"]));
  });

  it("exposes a meaningful accessibility label instead of relying on artwork", () => {
    expect(labelOf(renderBadge(12).root)).toBe("12 day streak");
    expect(labelOf(renderBadge(0).root)).toBe("0 day streak");
    expect(labelOf(renderBadge(1).root)).toBe("1 day streak");
  });

  it("renders no flame artwork while the asset registry is empty", () => {
    const renderer = renderBadge(30);
    expect(renderer.root.findAllByProps({ testID: "habit-streak-flame" })).toHaveLength(0);
  });

  it("renders the registered artwork for the matching stage", () => {
    // 14–29 days maps to stage 4.
    mockSources[4] = 42;

    const renderer = renderBadge(20);
    const flame = renderer.root.findByProps({ testID: "habit-streak-flame" });
    expect(flame.props.source).toBe(42);
  });

  it("does not render a different stage's artwork", () => {
    mockSources[4] = 42;

    // 7–13 days maps to stage 3, which has no artwork registered.
    const renderer = renderBadge(7);
    expect(renderer.root.findAllByProps({ testID: "habit-streak-flame" })).toHaveLength(0);
  });

  it("does not autoplay the GIF in a list row by default", () => {
    mockSources[4] = 42;

    const renderer = renderBadge(20);
    const flame = renderer.root.findByProps({ testID: "habit-streak-flame" });
    expect(flame.props.autoplay).toBe(false);
    expect(mockStartAnimating).not.toHaveBeenCalled();
    expect(mockStopAnimating).toHaveBeenCalled();
  });

  it("autoplays only on a surface that explicitly opts in", () => {
    mockSources[4] = 42;

    const renderer = renderBadge(20, true);
    const flame = renderer.root.findByProps({ testID: "habit-streak-flame" });
    expect(flame.props.autoplay).toBe(true);
    expect(mockStartAnimating).toHaveBeenCalled();
  });

  it("calls startAnimating on onLoad when shouldPlayFlame is true", () => {
    mockSources[4] = 42;

    const renderer = renderBadge(20, true);
    const flame = renderer.root.findByProps({ testID: "habit-streak-flame" });
    mockStartAnimating.mockClear();

    act(() => {
      flame.props.onLoad();
    });

    expect(mockStartAnimating).toHaveBeenCalled();
  });

  it("plays animation on press for active streak and stops after 3 seconds", () => {
    jest.useFakeTimers();
    mockSources[4] = 42;
    const onPressMock = jest.fn();

    const renderer = renderBadge(20, false, onPressMock);
    const badge = renderer.root.findByProps({ testID: "habit-streak-badge" });

    mockStartAnimating.mockClear();
    mockStopAnimating.mockClear();

    // Trigger press
    act(() => {
      badge.props.onPress();
    });

    expect(onPressMock).toHaveBeenCalledTimes(1);
    expect(mockStartAnimating).toHaveBeenCalled();

    // Fast-forward 3000ms
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(mockStopAnimating).toHaveBeenCalled();
  });

  it("does not trigger animation on press when streak is 0 (inactive)", () => {
    const onPressMock = jest.fn();
    const renderer = renderBadge(0, false, onPressMock);
    const badge = renderer.root.findByProps({ testID: "habit-streak-badge" });

    expect(badge.props.disabled).toBe(true);
  });

  it("keeps the flame visible but still when reduced motion is requested", () => {
    mockSources[4] = 42;
    mockReduceMotion = true;

    // The stage is still communicated — it just does not move.
    const renderer = renderBadge(20, true);
    const flame = renderer.root.findByProps({ testID: "habit-streak-flame" });
    expect(flame.props.source).toBe(42);
    expect(flame.props.autoplay).toBe(false);
    expect(mockStartAnimating).not.toHaveBeenCalled();

    const root = renderer.root;
    expect(textOf(root)).toEqual(expect.arrayContaining([20, "days"]));
    expect(labelOf(root)).toBe("20 day streak");
  });
});
