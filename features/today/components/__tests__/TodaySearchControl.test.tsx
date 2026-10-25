import React from "react";
import { act, create } from "react-test-renderer";
import { TodaySearchControl, TodaySearchEmptyState } from "../TodaySearchControl";

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light" },
}));

const colors = {
  background: "#0F172A",
  card: "#1E293B",
  surface: "#1E293B",
  border: "rgba(255, 255, 255, 0.1)",
  text: "#F8FAFC",
  textPrimary: "#F8FAFC",
  textMuted: "#94A3B8",
  primary: "#6366F1",
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
} as any;

describe("TodaySearchControl", () => {
  it("opens from a compact control and exposes the focused input", () => {
    const onOpen = jest.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <TodaySearchControl
          query=""
          active={false}
          colors={colors}
          onOpen={onOpen}
          onChangeText={jest.fn()}
          onExit={jest.fn()}
        />,
      );
    });

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Search available work" }).props.onPress();
    });

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("clears the query without exiting and provides a separate exit action", () => {
    const onChangeText = jest.fn();
    const onExit = jest.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <TodaySearchControl
          query="report"
          active
          colors={colors}
          onOpen={jest.fn()}
          onChangeText={onChangeText}
          onExit={onExit}
        />,
      );
    });

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Clear search" }).props.onPress();
    });
    expect(onChangeText).toHaveBeenCalledWith("");
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Exit search" }).props.onPress();
    });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("renders the calm no-results state with a clear action", () => {
    const onClear = jest.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <TodaySearchEmptyState query="project" colors={colors} onClear={onClear} />,
      );
    });

    expect(renderer.root.findByProps({ children: "No matches" })).toBeDefined();
    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Clear search" }).props.onPress();
    });
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
