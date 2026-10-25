import React from "react";
import { act, create } from "react-test-renderer";
import { TodayFilterControl } from "../TodayFilterControl";
import { DEFAULT_TODAY_FILTERS, type TodayFilterState } from "../../utils/todayFilters";

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

describe("TodayFilterControl", () => {
  it("renders Quick Type pills and allows 1-tap switching", () => {
    const onApply = jest.fn();
    let renderer!: ReturnType<typeof create>;

    act(() => {
      renderer = create(
        <TodayFilterControl
          value={DEFAULT_TODAY_FILTERS}
          folders={[]}
          categoryIds={[]}
          colors={colors}
          onApply={onApply}
          searchQuery=""
          isSearchActive={false}
          onSearchOpen={jest.fn()}
          onSearchQueryChange={jest.fn()}
          onSearchExit={jest.fn()}
        />,
      );
    });

    const habitsPill = renderer.root.findByProps({ accessibilityLabel: "Filter by Habits" });
    expect(habitsPill).toBeDefined();

    act(() => {
      habitsPill.props.onPress();
    });

    expect(onApply).toHaveBeenCalledWith({
      ...DEFAULT_TODAY_FILTERS,
      type: "habits",
    });
  });

  it("renders active filter chips and allows 1-tap dismissal", () => {
    const onApply = jest.fn();
    const activeState: TodayFilterState = {
      ...DEFAULT_TODAY_FILTERS,
      type: "habits",
      priority: "high",
    };

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <TodayFilterControl
          value={activeState}
          folders={[]}
          categoryIds={[]}
          colors={colors}
          onApply={onApply}
          searchQuery=""
          isSearchActive={false}
          onSearchOpen={jest.fn()}
          onSearchQueryChange={jest.fn()}
          onSearchExit={jest.fn()}
        />,
      );
    });

    const removePriorityBtn = renderer.root.findByProps({
      accessibilityLabel: "Remove filter High Priority",
    });
    expect(removePriorityBtn).toBeDefined();

    act(() => {
      removePriorityBtn.props.onPress();
    });

    expect(onApply).toHaveBeenCalledWith({
      ...activeState,
      priority: "all",
    });

    const resetAllBtn = renderer.root.findByProps({
      accessibilityLabel: "Reset all filters",
    });
    expect(resetAllBtn).toBeDefined();

    act(() => {
      resetAllBtn.props.onPress();
    });

    expect(onApply).toHaveBeenCalledWith(DEFAULT_TODAY_FILTERS);
  });

  it("renders full-width search row when search is active", () => {
    const onSearchExit = jest.fn();
    let renderer!: ReturnType<typeof create>;

    act(() => {
      renderer = create(
        <TodayFilterControl
          value={DEFAULT_TODAY_FILTERS}
          folders={[]}
          categoryIds={[]}
          colors={colors}
          onApply={jest.fn()}
          searchQuery="meeting"
          isSearchActive={true}
          onSearchOpen={jest.fn()}
          onSearchQueryChange={jest.fn()}
          onSearchExit={onSearchExit}
        />,
      );
    });

    const exitBtn = renderer.root.findByProps({ accessibilityLabel: "Exit search" });
    expect(exitBtn).toBeDefined();

    act(() => {
      exitBtn.props.onPress();
    });

    expect(onSearchExit).toHaveBeenCalledTimes(1);
  });
});
