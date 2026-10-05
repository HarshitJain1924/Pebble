import React from "react";
import { act, create } from "react-test-renderer";
import { DomainFilterRow } from "../DomainFilterRow";
import { Colors } from "@/shared/constants/theme";

describe("DomainFilterRow Component", () => {
  const colors = Colors.dark;

  it("renders count label and inactive filter button correctly", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <DomainFilterRow
          countLabel="5 tasks"
          activeFilterCount={0}
          onOpenFilter={jest.fn()}
          colors={colors}
          isDark={true}
        />
      );
    });

    const root = renderer.root;
    const filterBtn = root.find((n: any) =>
      typeof n.props.accessibilityLabel === "string" &&
      n.props.accessibilityLabel.includes("no active filters")
    );
    expect(filterBtn).toBeDefined();

    // Check count text
    const textNodes = root.findAll((n: any) => n.props.children === "5 tasks");
    expect(textNodes.length).toBeGreaterThan(0);
  });

  it("displays active filter count badge when activeFilterCount > 0", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <DomainFilterRow
          countLabel="3 habits"
          activeFilterCount={2}
          onOpenFilter={jest.fn()}
          colors={colors}
          isDark={true}
        />
      );
    });

    const root = renderer.root;
    const badgeText = root.find((n: any) => n.props.children === "· 2");
    expect(badgeText).toBeDefined();

    const filterBtn = root.find((n: any) =>
      typeof n.props.accessibilityLabel === "string" &&
      n.props.accessibilityLabel.includes("2 active filters")
    );
    expect(filterBtn).toBeDefined();
  });

  it("calls onOpenFilter when filter button is pressed", () => {
    const onOpenFilterMock = jest.fn();
    let renderer: any;
    act(() => {
      renderer = create(
        <DomainFilterRow
          countLabel="4 checklists"
          activeFilterCount={1}
          onOpenFilter={onOpenFilterMock}
          colors={colors}
          isDark={true}
        />
      );
    });

    const root = renderer.root;
    const filterBtn = root.find((n: any) =>
      typeof n.props.accessibilityRole === "string" &&
      n.props.accessibilityRole === "button" &&
      typeof n.props.onPress === "function"
    );
    expect(filterBtn).toBeDefined();
    act(() => {
      filterBtn.props.onPress();
    });
    expect(onOpenFilterMock).toHaveBeenCalledTimes(1);
  });
});
