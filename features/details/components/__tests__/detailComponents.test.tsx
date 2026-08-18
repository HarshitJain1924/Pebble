jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    SafeAreaView: ({ children, style }: any) => React.createElement(View, { style }, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

import React from "react";
import { act, create } from "react-test-renderer";
import { ScrollView, Text as RNText, View } from "react-native";

import { DetailActions } from "@/features/details/components/DetailActions";
import { DetailHeader } from "@/features/details/components/DetailHeader";
import { DetailRow } from "@/features/details/components/DetailRow";
import { DetailSection } from "@/features/details/components/DetailSection";
import { DetailShell } from "@/features/details/components/DetailShell";

type Renderer = ReturnType<typeof create>;

const findByAccessibilityLabel = (renderer: Renderer, label: string) => {
  const matches = renderer.root.findAll((node: any) => node.props?.accessibilityLabel === label);
  if (matches.length === 0) throw new Error(`No accessibility element found for ${label}`);
  return matches[0];
};

type TestInstance = { props: Record<string, any>; type: any };

const textsOf = (renderer: Renderer) =>
  renderer.root.findAllByType(RNText) as unknown as TestInstance[];

describe("DetailHeader", () => {
  it("renders the title", () => {
    let renderer!: Renderer;
    act(() => {
      renderer = create(<DetailHeader title="Morning Workout" />);
    });
    expect(textsOf(renderer).some((n) => n.props.children === "Morning Workout")).toBe(true);
  });

  it("renders subtitle when provided", () => {
    let renderer!: Renderer;
    act(() => {
      renderer = create(<DetailHeader title="Morning Workout" subtitle="Daily" />);
    });
    expect(textsOf(renderer).some((n) => n.props.children === "Daily")).toBe(true);
  });

  it("invokes back callback when the back action is pressed", () => {
    const onBack = jest.fn();
    let renderer!: Renderer;
    act(() => {
      renderer = create(<DetailHeader title="Morning Workout" onBack={onBack} />);
    });
    act(() => findByAccessibilityLabel(renderer, "Go back").props.onPress());
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("renders the overflow action only when onMore is provided", () => {
    const onMore = jest.fn();
    let withMore!: Renderer;
    let withoutMore!: Renderer;
    act(() => {
      withMore = create(<DetailHeader title="A" onMore={onMore} />);
      withoutMore = create(<DetailHeader title="A" />);
    });

    const moreBtn = withMore.root.findAll((n: any) => n.props?.accessibilityLabel === "More options");
    expect(moreBtn.length).toBeGreaterThan(0);
    act(() => moreBtn[0].props.onPress());
    expect(onMore).toHaveBeenCalledTimes(1);

    expect(withoutMore.root.findAll((n: any) => n.props?.accessibilityLabel === "More options")).toHaveLength(0);
  });

  it("keeps long titles constrained and renders the entity icon node", () => {
    const longTitle = "A task title that is intentionally very long ".repeat(6);
    let renderer!: Renderer;
    act(() => {
      renderer = create(
        <DetailHeader title={longTitle} icon={<View testID="entity-icon" />} />,
      );
    });
    const titleNode = textsOf(renderer).find((n) => n.props.children === longTitle);
    expect(titleNode).toBeDefined();
    expect(titleNode?.props.numberOfLines).toBe(2);
    expect(renderer.root.findAll((n: any) => n.props?.testID === "entity-icon").length).toBeGreaterThan(0);
  });

  it("renders a custom action node and prefers it over the overflow action", () => {
    const onMore = jest.fn();
    let renderer!: Renderer;
    act(() => {
      renderer = create(
        <DetailHeader
          title="A"
          onMore={onMore}
          action={<View testID="custom-action" />}
        />,
      );
    });
    expect(renderer.root.findAll((n: any) => n.props?.testID === "custom-action").length).toBeGreaterThan(0);
    // The overflow (more) button must not render when a custom action is present.
    expect(
      renderer.root.findAll((n: any) => n.props?.accessibilityLabel === "More options"),
    ).toHaveLength(0);
  });
});

describe("DetailRow", () => {
  it("renders label and value", () => {
    let renderer!: Renderer;
    act(() => {
      renderer = create(<DetailRow label="Workspace" value="Personal" />);
    });
    expect(textsOf(renderer).some((n) => n.props.children === "Workspace")).toBe(true);
    expect(textsOf(renderer).some((n) => n.props.children === "Personal")).toBe(true);
  });

  it("renders without a value when only a label is provided", () => {
    let renderer!: Renderer;
    act(() => {
      renderer = create(<DetailRow label="No value row" />);
    });
    expect(textsOf(renderer).some((n) => n.props.children === "No value row")).toBe(true);
  });

  it("invokes onPress and exposes the row as a button", () => {
    const onPress = jest.fn();
    let renderer!: Renderer;
    act(() => {
      renderer = create(<DetailRow label="Reminder" value="30 min before" onPress={onPress} />);
    });
    const row = findByAccessibilityLabel(renderer, "Reminder");
    expect(row.props.accessibilityRole).toBe("button");
    act(() => row.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("renders an accessory node when provided", () => {
    let renderer!: Renderer;
    act(() => {
      renderer = create(
        <DetailRow label="Repeat" value="Daily" accessory={<View testID="accessory" />} />,
      );
    });
    expect(renderer.root.findAll((n: any) => n.props?.testID === "accessory").length).toBeGreaterThan(0);
  });
});

describe("DetailSection", () => {
  it("renders children inside a surface card", () => {
    let renderer!: Renderer;
    act(() => {
      renderer = create(
        <DetailSection title="Schedule">
          <RNText>Today</RNText>
        </DetailSection>,
      );
    });
    expect(textsOf(renderer).some((n) => n.props.children === "Today")).toBe(true);
    expect(textsOf(renderer).some((n) => n.props.children === "SCHEDULE")).toBe(true);
  });

  it("renders without a title when none is provided", () => {
    let renderer!: Renderer;
    act(() => {
      renderer = create(
        <DetailSection>
          <RNText>Content only</RNText>
        </DetailSection>,
      );
    });
    expect(textsOf(renderer).some((n) => n.props.children === "Content only")).toBe(true);
    expect(textsOf(renderer).some((n) => n.props.children === "SCHEDULE")).toBe(false);
  });
});

describe("DetailActions", () => {
  it("renders actions with labels and invokes onPress", () => {
    const onPrimary = jest.fn();
    const onSecondary = jest.fn();
    let renderer!: Renderer;
    act(() => {
      renderer = create(
        <DetailActions
          actions={[
            { key: "save", label: "Save", tone: "primary", onPress: onPrimary },
            { key: "cancel", label: "Cancel", tone: "secondary", onPress: onSecondary },
          ]}
        />,
      );
    });
    act(() => findByAccessibilityLabel(renderer, "Save").props.onPress());
    expect(onPrimary).toHaveBeenCalledTimes(1);
    act(() => findByAccessibilityLabel(renderer, "Cancel").props.onPress());
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it("does not fire onPress for a disabled action", () => {
    const onPress = jest.fn();
    let renderer!: Renderer;
    act(() => {
      renderer = create(
        <DetailActions
          actions={[{ key: "delete", label: "Delete", tone: "danger", disabled: true, onPress }]}
        />,
      );
    });
    const btn = findByAccessibilityLabel(renderer, "Delete");
    expect(btn.props.accessibilityState).toEqual({ disabled: true });
    act(() => btn.props.onPress());
    expect(onPress).not.toHaveBeenCalled();
  });

  it("renders danger actions with destructive tone", () => {
    let renderer!: Renderer;
    act(() => {
      renderer = create(
        <DetailActions
          actions={[{ key: "delete", label: "Delete", tone: "danger", onPress: jest.fn() }]}
        />,
      );
    });
    expect(textsOf(renderer).some((n) => n.props.children === "Delete")).toBe(true);
  });
});

describe("DetailShell", () => {
  it("renders content, header, and footer slots", () => {
    let renderer!: Renderer;
    act(() => {
      renderer = create(
        <DetailShell
          header={<View testID="shell-header" />}
          footer={<View testID="shell-footer" />}
        >
          <RNText>Body content</RNText>
        </DetailShell>,
      );
    });
    expect(renderer.root.findAll((n: any) => n.props?.testID === "shell-header").length).toBeGreaterThan(0);
    expect(renderer.root.findAll((n: any) => n.props?.testID === "shell-footer").length).toBeGreaterThan(0);
    expect(textsOf(renderer).some((n) => n.props.children === "Body content")).toBe(true);
  });

  it("wraps content in a scroll view and omits footer when not provided", () => {
    let renderer!: Renderer;
    act(() => {
      renderer = create(<DetailShell>{null}</DetailShell>);
    });
    expect(renderer.root.findAllByType(ScrollView).length).toBeGreaterThanOrEqual(1);
    expect(renderer.root.findAllByProps({ testID: "shell-footer" })).toHaveLength(0);
  });
});

describe("details barrel exports", () => {
  it("exports all foundation components", () => {
    // Static import check: the barrel re-exports every component.
    const barrel = require("@/features/details");
    expect(barrel.DetailShell).toBeDefined();
    expect(barrel.DetailHeader).toBeDefined();
    expect(barrel.DetailSection).toBeDefined();
    expect(barrel.DetailRow).toBeDefined();
    expect(barrel.DetailActions).toBeDefined();
  });
});
