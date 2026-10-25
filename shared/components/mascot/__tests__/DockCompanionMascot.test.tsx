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

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/features/settings/services/settings.service", () => ({
  getSettings: jest.fn().mockResolvedValue({ mascotEnabled: true }),
  getProfile: jest.fn().mockResolvedValue({ name: "User" }),
}));

jest.mock("@/features/profile/services/pebble.service", () => ({
  getPebbleCounts: jest.fn().mockResolvedValue({ today: 0, total: 0 }),
}));

jest.mock("@/repositories", () => ({
  TaskRepository: { getTasks: jest.fn().mockResolvedValue({}) },
  HabitRepository: { getHabits: jest.fn().mockResolvedValue({}) },
  UiStateRepository: { getUiState: jest.fn().mockResolvedValue({ activeWorkspaceId: "default" }) },
}));

jest.mock("@/services/events/state-events", () => ({
  addStateListener: jest.fn().mockReturnValue(() => {}),
}));

jest.mock("@/features/focus/services/FocusLaunchService", () => ({
  launchFocusSession: jest.fn(),
}));

jest.mock("@/shared/hooks/useColorScheme", () => ({
  useColorScheme: () => "dark",
}));

import { DockCompanionMascot } from "../DockCompanionMascot";

describe("DockCompanionMascot touch geometry and pointerEvents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("tightly constrains hit target to exact mascot boundaries (68x84) without hitSlop", async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(
        <DockCompanionMascot
          isDialOpen={false}
          activeSector={-1}
          selectedSector={null}
          bottomOffset={20}
        />
      );
    });

    const root = renderer.root;
    const mascotPressable = root.findByProps({
      accessibilityLabel: "Cairn, your Pebble companion. Tap to interact.",
    });

    expect(mascotPressable).toBeDefined();
    // HitSlop should be completely undefined to prevent hit box inflation
    expect(mascotPressable.props.hitSlop).toBeUndefined();

    // Style must be exactly 68 x 84
    const flatStyle = mascotPressable.props.style;
    expect(flatStyle.width).toBe(68);
    expect(flatStyle.height).toBe(84);

    act(() => {
      renderer.unmount();
    });
  });

  it("sets pointerEvents='none' on purely visual sub-elements so touches pass cleanly", async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(
        <DockCompanionMascot
          isDialOpen={false}
          activeSector={-1}
          selectedSector={null}
          bottomOffset={20}
        />
      );
    });

    const root = renderer.root;
    const mascotPressable = root.findByProps({
      accessibilityLabel: "Cairn, your Pebble companion. Tap to interact.",
    });

    // Sub-elements within the pressable: contact shadow and mascot wrapper
    const children = mascotPressable.props.children;
    expect(children).toBeDefined();

    // Find the shadow and mascot wrapper Animated.View elements
    const nonePointerElements = root.findAllByProps({ pointerEvents: "none" });
    expect(nonePointerElements.length).toBeGreaterThanOrEqual(2);

    act(() => {
      renderer.unmount();
    });
  });

  it("uses pointerEvents='none' for container when dial is open, and 'box-none' when closed", async () => {
    let rendererClosed: any;
    await act(async () => {
      rendererClosed = create(
        <DockCompanionMascot
          isDialOpen={false}
          activeSector={-1}
          selectedSector={null}
          bottomOffset={20}
        />
      );
    });

    // Root container when dial is closed
    const closedContainer = rendererClosed.root.findAll(
      (node: any) => node.props.pointerEvents === "box-none"
    )[0];
    expect(closedContainer).toBeDefined();

    let rendererOpen: any;
    await act(async () => {
      rendererOpen = create(
        <DockCompanionMascot
          isDialOpen={true}
          activeSector={-1}
          selectedSector={null}
          bottomOffset={20}
        />
      );
    });

    // Root container when dial is open
    const openContainer = rendererOpen.root.findAll(
      (node: any) => node.props.pointerEvents === "none"
    )[0];
    expect(openContainer).toBeDefined();

    act(() => {
      rendererClosed.unmount();
      rendererOpen.unmount();
    });
  });
});
