import React from "react";
import { create, act } from "react-test-renderer";
import { FreeTimeGap } from "../FreeTimeGap";
import { DayPlannerView } from "../DayPlannerView";
import PressableScale from "@/shared/components/ui/PressableScale";

const mockColors = {
  text: "#000000",
  textMuted: "#666666",
  card: "#FFFFFF",
  border: "#E2E8F0",
  primary: "#3B82F6",
  background: "#F8FAFC",
};

describe("Collapsible Free Time Gaps & Day Planner View Tests", () => {
  const largeGap = {
    startMinutes: 570, // 9:30 AM
    durationMinutes: 270, // 4h 30m -> 2:00 PM
  };

  const smallGap = {
    startMinutes: 540, // 9:00 AM
    durationMinutes: 45, // 45m -> 9:45 AM
  };

  // Test 1: Collapsed gap renders exact start time, end time, and formatted duration
  test("Collapsed FreeTimeGap displays start time, end time, and duration", () => {
    let root: any;
    act(() => {
      root = create(
        <FreeTimeGap
          gap={largeGap}
          isCollapsible={true}
          isCollapsed={true}
          onPlan={jest.fn()}
          onToggleCollapse={jest.fn()}
          colors={mockColors}
          isLight={true}
        />
      );
    });

    const textNodes = root.root.findAllByType("Text" as any);
    const textContents = textNodes.map((t: any) => t.props.children).flat();

    expect(textContents).toContain("9:30 AM → 2:00 PM");
    expect(textContents).toContain("· 4h 30m free");
  });

  // Test 2: Tapping Plan on a collapsed gap invokes onPlan with exact gap parameters
  test("Tapping Plan on a collapsed gap invokes onPlan with gap hour, minute, and gap object", () => {
    const onPlan = jest.fn();
    let root: any;
    act(() => {
      root = create(
        <FreeTimeGap
          gap={largeGap}
          isCollapsible={true}
          isCollapsed={true}
          onPlan={onPlan}
          onToggleCollapse={jest.fn()}
          colors={mockColors}
          isLight={true}
        />
      );
    });

    const pressableScales = root.root.findAllByType(PressableScale);
    const planBtn = pressableScales.find((node: any) => {
      const texts = node.findAllByType("Text" as any).map((t: any) => t.props.children);
      return texts.includes("Plan");
    });

    expect(planBtn).toBeDefined();
    act(() => {
      planBtn.props.onPress();
    });

    expect(onPlan).toHaveBeenCalledWith(9, 30, largeGap);
  });

  // Test 3: Tapping expand toggle calls onToggleCollapse with gapKey
  test("Tapping expand icon invokes onToggleCollapse with unique gap key", () => {
    const onToggleCollapse = jest.fn();
    let root: any;
    act(() => {
      root = create(
        <FreeTimeGap
          gap={largeGap}
          isCollapsible={true}
          isCollapsed={true}
          onPlan={jest.fn()}
          onToggleCollapse={onToggleCollapse}
          colors={mockColors}
          isLight={true}
        />
      );
    });

    const pressableScales = root.root.findAllByType(PressableScale);
    // Expand button is the second PressableScale in the action group
    const expandBtn = pressableScales[1];
    expect(expandBtn).toBeDefined();

    act(() => {
      expandBtn.props.onPress();
    });

    expect(onToggleCollapse).toHaveBeenCalledWith("gap-570-270");
  });

  // Test 4: Current time inside collapsed gap displays NOW badge
  test("Collapsed gap shows NOW badge when current time lies inside the gap on Today", () => {
    let root: any;
    act(() => {
      root = create(
        <FreeTimeGap
          gap={largeGap} // 9:30 AM to 2:00 PM
          isCollapsible={true}
          isCollapsed={true}
          isViewingToday={true}
          currentTime={{ hours: 11, minutes: 42 }} // 11:42 AM -> inside
          onPlan={jest.fn()}
          onToggleCollapse={jest.fn()}
          colors={mockColors}
          isLight={true}
        />
      );
    });

    const textNodes = root.root.findAllByType("Text" as any);
    const textContents = textNodes.map((t: any) => t.props.children).flat();

    expect(textContents.some((t: string) => typeof t === "string" && t.includes("NOW · 11:42 AM"))).toBe(true);
  });

  // Test 5: Expanded collapsible gap shows Collapse button
  test("Expanded collapsible gap provides Collapse action pill", () => {
    const onToggleCollapse = jest.fn();
    let root: any;
    act(() => {
      root = create(
        <FreeTimeGap
          gap={largeGap}
          isCollapsible={true}
          isCollapsed={false}
          onPlan={jest.fn()}
          onToggleCollapse={onToggleCollapse}
          colors={mockColors}
          isLight={true}
        />
      );
    });

    const textNodes = root.root.findAllByType("Text" as any);
    const textContents = textNodes.map((t: any) => t.props.children).flat();

    expect(textContents).toContain("Collapse");

    const collapseBtn = root.root.findAllByType(PressableScale).find((node: any) => {
      const texts = node.findAllByType("Text" as any).map((t: any) => t.props.children);
      return texts.includes("Collapse");
    });

    expect(collapseBtn).toBeDefined();
    act(() => {
      collapseBtn.props.onPress();
    });

    expect(onToggleCollapse).toHaveBeenCalledWith("gap-570-270");
  });

  // Test 6: Small gap does not display collapse/expand toggles
  test("Small gap (< 120 min) renders standard inline view without collapse pill", () => {
    let root: any;
    act(() => {
      root = create(
        <FreeTimeGap
          gap={smallGap}
          isCollapsible={false}
          isCollapsed={false}
          onPlan={jest.fn()}
          colors={mockColors}
          isLight={true}
        />
      );
    });

    const textNodes = root.root.findAllByType("Text" as any);
    const textContents = textNodes.map((t: any) => t.props.children).flat();

    expect(textContents).toContain("45m available");
    expect(textContents).not.toContain("Collapse");
  });
});
