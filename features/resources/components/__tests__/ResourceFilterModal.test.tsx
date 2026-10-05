import React from "react";
import { act, create } from "react-test-renderer";
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
import { ResourceFilterModal } from "../ResourceFilterModal";

describe("ResourceFilterModal Component", () => {
  it("renders filter sections and chips correctly", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <ResourceFilterModal
          visible={true}
          onClose={jest.fn()}
          typeFilter="all"
          onSelectType={jest.fn()}
          linkageFilter="all"
          onSelectLinkage={jest.fn()}
          statusFilter="all"
          onSelectStatus={jest.fn()}
          activeFilterCount={0}
          onResetFilters={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const modalTitle = root.find((n: any) => n.props.children === "Filter Resources");
    expect(modalTitle).toBeDefined();

    const linksChip = root.find((n: any) =>
      typeof n.props.accessibilityLabel === "string" &&
      n.props.accessibilityLabel.includes("Filter option Links")
    );
    expect(linksChip).toBeDefined();
  });

  it("triggers onSelectType when a type chip is pressed", () => {
    const onSelectTypeMock = jest.fn();
    let renderer: any;
    act(() => {
      renderer = create(
        <ResourceFilterModal
          visible={true}
          onClose={jest.fn()}
          typeFilter="all"
          onSelectType={onSelectTypeMock}
          linkageFilter="all"
          onSelectLinkage={jest.fn()}
          statusFilter="all"
          onSelectStatus={jest.fn()}
          activeFilterCount={0}
          onResetFilters={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const notesChip = root.find((n: any) =>
      typeof n.props.accessibilityLabel === "string" &&
      n.props.accessibilityLabel.includes("Filter option Notes")
    );
    expect(notesChip).toBeDefined();

    act(() => {
      notesChip.props.onPress();
    });
    expect(onSelectTypeMock).toHaveBeenCalledWith("note");
  });
});
