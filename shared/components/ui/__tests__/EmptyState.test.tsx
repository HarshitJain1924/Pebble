jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import React from "react";
import { act, create } from "react-test-renderer";
import { Image, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { EmptyState, MASCOT_ASSETS } from "../EmptyState";

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
  impactAsync: jest.fn(async () => undefined),
}));
jest.mock("@expo/vector-icons", () => ({
  Feather: (props: any) => require("react").createElement("FeatherIcon", props),
}));

describe("EmptyState Component Suite", () => {
  it("renders title and description properly", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <EmptyState
          title="No items found"
          description="Try creating your first item."
        />
      );
    });

    const root = renderer.root;
    const textNodes = root.findAllByType("Text");
    const renderedTexts = textNodes.map((n: any) => n.props.children);

    expect(renderedTexts).toContain("No items found");
    expect(renderedTexts).toContain("Try creating your first item.");
  });

  it("renders mascot illustration with appropriate non-announcing accessibility attributes", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <EmptyState
          mascot="sleeping"
          title="Your schedule is clear"
          description="Enjoy your free day!"
        />
      );
    });

    const root = renderer.root;
    const imageNode = root.findByType(Image);
    expect(imageNode).toBeDefined();
    expect(imageNode.props.source).toBe(MASCOT_ASSETS.sleeping);
    expect(imageNode.props.accessible).toBe(false);
    expect(imageNode.props.importantForAccessibility).toBe("no");
    expect(imageNode.props.accessibilityElementsHidden).toBe(true);
  });

  it("renders custom graphic node when provided", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <EmptyState
          graphic={<Feather name="check" size={24} color="#10B981" testID="custom-graphic-icon" />}
          title="All caught up"
        />
      );
    });

    const root = renderer.root;
    const icon = root.findByProps({ testID: "custom-graphic-icon" });
    expect(icon).toBeDefined();
    expect(icon.props.name).toBe("check");
  });

  it("renders primary action button and triggers onPress", () => {
    const handleAction = jest.fn();
    let renderer: any;
    act(() => {
      renderer = create(
        <EmptyState
          mascot="idle"
          title="No tasks yet"
          description="Start your workspace by adding a task."
          action={{
            label: "Create Task",
            icon: "plus",
            accessibilityHint: "Creates a new task in this workspace",
            testID: "empty-state-primary-action",
            onPress: handleAction,
          }}
        />
      );
    });

    const root = renderer.root;
    const button = root.findByProps({ testID: "empty-state-primary-action" });
    expect(button).toBeDefined();
    expect(button.props.accessibilityRole).toBe("button");
    expect(button.props.accessibilityLabel).toBe("Create Task");
    expect(button.props.accessibilityHint).toBe("Creates a new task in this workspace");

    // Trigger action
    act(() => {
      button.props.onPress();
    });
    expect(handleAction).toHaveBeenCalledTimes(1);
  });

  it("renders secondary action button alongside primary action and triggers onPress", () => {
    const handlePrimary = jest.fn();
    const handleSecondary = jest.fn();
    let renderer: any;
    act(() => {
      renderer = create(
        <EmptyState
          mascot="peek"
          title="No resources found"
          description="Try a different query or show all items."
          action={{
            label: "Add Resource",
            testID: "btn-primary",
            onPress: handlePrimary,
          }}
          secondaryAction={{
            label: "Clear Filters",
            testID: "btn-secondary",
            onPress: handleSecondary,
          }}
        />
      );
    });

    const root = renderer.root;
    const primaryBtn = root.findByProps({ testID: "btn-primary" });
    const secondaryBtn = root.findByProps({ testID: "btn-secondary" });

    expect(primaryBtn).toBeDefined();
    expect(secondaryBtn).toBeDefined();

    act(() => {
      secondaryBtn.props.onPress();
    });
    expect(handleSecondary).toHaveBeenCalledTimes(1);
    expect(handlePrimary).not.toHaveBeenCalled();
  });

  it("does not render action buttons when action prop is omitted", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <EmptyState
          title="Simple Message"
          description="No actions needed here."
        />
      );
    });

    const root = renderer.root;
    const buttons = root.findAllByProps({ accessibilityRole: "button" });
    expect(buttons.length).toBe(0);
  });

  it("has accessible title header and button roles", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <EmptyState
          title="Accessible Title"
          description="Description text"
          action={{
            label: "Action",
            onPress: () => {},
          }}
          testID="empty-state-root"
        />
      );
    });

    const root = renderer.root;
    const header = root.findByProps({ accessibilityRole: "header" });
    expect(header).toBeDefined();
    expect(header.props.children).toBe("Accessible Title");

    const button = root.findByProps({ accessibilityRole: "button" });
    expect(button).toBeDefined();
    expect(button.props.accessibilityLabel).toBe("Action");
  });
});
