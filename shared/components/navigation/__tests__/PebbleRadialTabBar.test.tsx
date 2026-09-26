import React from "react";
import { act, create } from "react-test-renderer";

jest.mock("react-native-reanimated", () => {
  const reanimatedMock = require("react-native-reanimated/mock");
  return {
    ...reanimatedMock,
    useSharedValue: (init: any) => ({ value: init }),
  };
});

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "Light", Medium: "Medium" },
  NotificationFeedbackType: { Success: "Success" },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }),
}));

jest.mock("@/shared/hooks/useColorScheme", () => ({
  useColorScheme: () => "dark",
}));

// Mock DockCompanionMascot so this unit test focuses on the tab bar overlay & touch tree
jest.mock("@/shared/components/mascot/DockCompanionMascot", () => ({
  DockCompanionMascot: () => null,
}));

import { PebbleRadialTabBar } from "../PebbleRadialTabBar";

describe("PebbleRadialTabBar overlay touch behavior", () => {
  const mockProps: any = {
    state: {
      index: 0,
      routes: [
        { key: "index-1", name: "index" },
        { key: "tasks-1", name: "tasks" },
        { key: "calendar-1", name: "calendar" },
        { key: "focus-1", name: "focus" },
      ],
    },
    navigation: {
      navigate: jest.fn(),
      emit: jest.fn().mockReturnValue({ defaultPrevented: false }),
    },
    descriptors: {},
    insets: { top: 0, bottom: 20, left: 0, right: 0 },
  };

  it("when dial is closed: radialPivotAnchor has pointerEvents='none' and scrim is not rendered", () => {
    let renderer: any;
    act(() => {
      renderer = create(<PebbleRadialTabBar {...mockProps} />);
    });

    const root = renderer.root;

    // overlayContainer must be box-none so non-interactive areas don't block content
    const overlay = root.findAll(
      (node: any) => node.props.pointerEvents === "box-none"
    );
    expect(overlay.length).toBeGreaterThanOrEqual(1);

    // Radial pivot anchor must have pointerEvents="none" when dial is closed
    const nonePointerNodes = root.findAll(
      (node: any) => node.props.pointerEvents === "none"
    );
    expect(nonePointerNodes.length).toBeGreaterThanOrEqual(1);

    // Scrim dismiss pressable should not exist when closed
    const scrimPressable = root.findAll(
      (node: any) => node.props.accessibilityLabel === "Dismiss navigation dial"
    );
    expect(scrimPressable).toHaveLength(0);

    // Central pebble trigger button must be present
    const pebbleButton = root.findByProps({
      accessibilityLabel:
        "Pebble Navigation Dial. Hold and drag to select destination, or tap to open options.",
    });
    expect(pebbleButton).toBeDefined();

    act(() => {
      renderer.unmount();
    });
  });
});
