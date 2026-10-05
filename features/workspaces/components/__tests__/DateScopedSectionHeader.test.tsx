import React from "react";
import { act, create } from "react-test-renderer";
import { DateScopedSectionHeader } from "../DateScopedSectionHeader";
import { Colors } from "@/shared/constants/theme";

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 0, Medium: 1, Heavy: 2 },
  NotificationFeedbackType: { Success: 0, Warning: 1, Error: 2 },
}));

jest.mock("@expo/vector-icons", () => ({
  Feather: (props: any) => require("react").createElement("FeatherIcon", props),
}));

jest.mock("@/shared/components/ui/PressableScale", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Comp = ({ children, onPress, ...props }: any) =>
    React.createElement(View, { onPress, ...props }, children);
  return {
    __esModule: true,
    default: Comp,
    PressableScale: Comp,
  };
});

jest.mock("@/shared/utils/date-key", () => {
  const actual = jest.requireActual("@/shared/utils/date-key");
  return {
    ...actual,
    getTodayDateKey: () => "2026-10-05",
  };
});

describe("DateScopedSectionHeader", () => {
  const colors = Colors.dark;

  it("renders 'Oct 5 · Today' and hides 'Back to today' when selected date is today", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <DateScopedSectionHeader
          dateKey="2026-10-05"
          onSelectDate={jest.fn()}
          onOpenDatePicker={jest.fn()}
          colors={colors}
          isDark={true}
          itemCount={3}
        />
      );
    });

    const root = renderer.root;
    const textNodes = root.findAllByType("Text").map((t: any) =>
      Array.isArray(t.props.children) ? t.props.children.join("") : t.props.children
    );

    expect(textNodes).toContain("Oct 5 · Today");
    expect(textNodes).not.toContain("Back to today");
  });

  it("renders 'Tue, Oct 6' and shows 'Back to today' button when selected date is not today", () => {
    const onSelectDateMock = jest.fn();
    let renderer: any;
    act(() => {
      renderer = create(
        <DateScopedSectionHeader
          dateKey="2026-10-06"
          onSelectDate={onSelectDateMock}
          onOpenDatePicker={jest.fn()}
          colors={colors}
          isDark={true}
          itemCount={2}
        />
      );
    });

    const root = renderer.root;
    const textNodes = root.findAllByType("Text").map((t: any) =>
      Array.isArray(t.props.children) ? t.props.children.join("") : t.props.children
    );

    expect(textNodes).toContain("Tue, Oct 6");
    expect(textNodes).toContain("Back to today");

    // Press "Back to today"
    const backBtn = root.findByProps({ accessibilityLabel: "Back to today" });
    expect(backBtn).toBeDefined();
    act(() => {
      backBtn.props.onPress();
    });

    expect(onSelectDateMock).toHaveBeenCalledWith("2026-10-05");
  });

  it("hides collapse chevron when itemCount is 5 or fewer", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <DateScopedSectionHeader
          dateKey="2026-10-05"
          onSelectDate={jest.fn()}
          onOpenDatePicker={jest.fn()}
          colors={colors}
          isDark={true}
          itemCount={5}
          onToggleExpand={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const chevron = root.findAllByProps({ accessibilityLabel: "Collapse section" });
    expect(chevron).toHaveLength(0);
  });

  it("shows collapse chevron when itemCount is greater than 5", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <DateScopedSectionHeader
          dateKey="2026-10-05"
          onSelectDate={jest.fn()}
          onOpenDatePicker={jest.fn()}
          colors={colors}
          isDark={true}
          itemCount={6}
          isExpanded={true}
          onToggleExpand={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const chevron = root.find((n: any) => n.props.accessibilityLabel === "Collapse section");
    expect(chevron).toBeDefined();
  });

  it("navigates to previous and next days when tapping neighbor day chips", () => {
    const onSelectDateMock = jest.fn();
    let renderer: any;
    act(() => {
      renderer = create(
        <DateScopedSectionHeader
          dateKey="2026-10-05"
          onSelectDate={onSelectDateMock}
          onOpenDatePicker={jest.fn()}
          colors={colors}
          isDark={true}
        />
      );
    });

    const root = renderer.root;

    // Previous day: Oct 4
    const prevBtn = root.find((n: any) =>
      typeof n.props.accessibilityLabel === "string" &&
      n.props.accessibilityLabel.includes("Previous day") &&
      typeof n.props.onPress === "function"
    );
    expect(prevBtn).toBeDefined();
    act(() => {
      prevBtn.props.onPress();
    });
    expect(onSelectDateMock).toHaveBeenCalledWith("2026-10-04");

    // Next day: Oct 6
    const nextBtn = root.find((n: any) =>
      typeof n.props.accessibilityLabel === "string" &&
      n.props.accessibilityLabel.includes("Next day") &&
      typeof n.props.onPress === "function"
    );
    expect(nextBtn).toBeDefined();
    act(() => {
      nextBtn.props.onPress();
    });
    expect(onSelectDateMock).toHaveBeenCalledWith("2026-10-06");
  });
});
