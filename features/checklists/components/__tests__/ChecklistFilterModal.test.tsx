import React from "react";
import { act, create } from "react-test-renderer";
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
import { ChecklistFilterModal } from "../ChecklistFilterModal";

describe("ChecklistFilterModal Component", () => {
  it("renders filter sections and chips correctly", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <ChecklistFilterModal
          visible={true}
          onClose={jest.fn()}
          statusFilter="all"
          onSelectStatus={jest.fn()}
          itemsFilter="all"
          onSelectItems={jest.fn()}
          resourcesFilter="all"
          onSelectResources={jest.fn()}
          activeFilterCount={0}
          onResetFilters={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const modalTitle = root.find((n: any) => n.props.children === "Filter Checklists");
    expect(modalTitle).toBeDefined();

    const inProgressChip = root.find((n: any) =>
      typeof n.props.accessibilityLabel === "string" &&
      n.props.accessibilityLabel.includes("Filter option In Progress")
    );
    expect(inProgressChip).toBeDefined();
  });

  it("triggers onSelectStatus when a status chip is pressed", () => {
    const onSelectStatusMock = jest.fn();
    let renderer: any;
    act(() => {
      renderer = create(
        <ChecklistFilterModal
          visible={true}
          onClose={jest.fn()}
          statusFilter="all"
          onSelectStatus={onSelectStatusMock}
          itemsFilter="all"
          onSelectItems={jest.fn()}
          resourcesFilter="all"
          onSelectResources={jest.fn()}
          activeFilterCount={0}
          onResetFilters={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const completedChip = root.find((n: any) =>
      typeof n.props.accessibilityLabel === "string" &&
      n.props.accessibilityLabel.includes("Filter option Completed")
    );
    expect(completedChip).toBeDefined();

    act(() => {
      completedChip.props.onPress();
    });
    expect(onSelectStatusMock).toHaveBeenCalledWith("completed");
  });
});
