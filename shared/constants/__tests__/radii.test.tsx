jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("@/shared/hooks/useColorScheme", () => ({
  useColorScheme: () => "dark",
}));

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
  impactAsync: jest.fn(async () => undefined),
}));

jest.mock("@expo/vector-icons", () => ({
  Feather: (props: any) => require("react").createElement("FeatherIcon", props),
}));

import React from "react";
import { StyleSheet, Text } from "react-native";
import { act, create } from "react-test-renderer";
import { Radius } from "@/shared/constants/radii";
import { AppCard } from "@/shared/components/ui/AppCard";
import { EmptyState } from "@/shared/components/ui/EmptyState";
import { styles as taskStyles } from "@/shared/constants/taskStyles";

describe("Radius Canonical Design Token Contract", () => {
  it("exports canonical radius tokens matching Pebble hierarchy", () => {
    expect(Radius.sm).toBe(8);
    expect(Radius.md).toBe(12);
    expect(Radius.lg).toBe(16);
    expect(Radius.xl).toBe(20);
    expect(Radius.pill).toBe(9999);
  });

  it("AppCard renders with Radius.xl (20) by default", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <AppCard>
          <Text>Content</Text>
        </AppCard>
      );
    });
    const rootComponent = renderer.toJSON();
    const flattened = StyleSheet.flatten(rootComponent.props.style);
    expect(flattened.borderRadius).toBe(Radius.xl);
    expect(flattened.borderRadius).toBe(20);
  });

  it("EmptyState consumes Radius.xl (20) container and Radius.pill for action buttons", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <EmptyState
          title="Nothing here"
          description="Add your first item"
          action={{ label: "Add Task", onPress: () => {} }}
          secondaryAction={{ label: "Learn more", onPress: () => {} }}
        />
      );
    });
    const rootComponent = renderer.toJSON();
    const containerStyle = StyleSheet.flatten(rootComponent.props.style);
    expect(containerStyle.borderRadius).toBe(Radius.xl);
    expect(containerStyle.borderRadius).toBe(20);
  });

  it("taskStyles shared stylesheet consumes Radius tokens correctly", () => {
    expect(taskStyles.listPill.borderRadius).toBe(Radius.xl);
    expect(taskStyles.categoryChoicePill.borderRadius).toBe(Radius.pill);
    expect(taskStyles.alarmModal.borderRadius).toBe(Radius.lg);
    expect(taskStyles.alarmBtn.borderRadius).toBe(Radius.md);
    expect(taskStyles.tagBadge.borderRadius).toBe(Radius.sm);
    expect(taskStyles.editTitleInput.borderRadius).toBe(Radius.sm);
    expect(taskStyles.segmentedControlContainer.borderRadius).toBe(Radius.lg);
    expect(taskStyles.segmentButton.borderRadius).toBe(Radius.md);
    expect(taskStyles.warningBanner.borderRadius).toBe(Radius.lg);
    expect(taskStyles.successBanner.borderRadius).toBe(Radius.lg);
  });
});

