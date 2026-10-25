import React from "react";
import { act, create } from "react-test-renderer";
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
import { HabitFilterModal } from "../HabitFilterModal";

describe("HabitFilterModal Component", () => {
  it("renders filter sections and options correctly", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <HabitFilterModal
          visible={true}
          onClose={jest.fn()}
          statusFilter="all"
          onSelectStatus={jest.fn()}
          priorityFilter="all"
          onSelectPriority={jest.fn()}
          frequencyFilter="all"
          onSelectFrequency={jest.fn()}
          reminderFilter="all"
          onSelectReminder={jest.fn()}
          activeFilterCount={0}
          onResetFilters={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const modalTitle = root.find((n: any) => n.props.children === "Filter Habits");
    expect(modalTitle).toBeDefined();

    // Check status chip options exist
    const activeChip = root.find((n: any) =>
      typeof n.props.accessibilityLabel === "string" &&
      n.props.accessibilityLabel.includes("Filter option Active")
    );
    expect(activeChip).toBeDefined();
  });

  it("triggers onSelectPriority when a priority chip is pressed", () => {
    const onSelectPriorityMock = jest.fn();
    let renderer: any;
    act(() => {
      renderer = create(
        <HabitFilterModal
          visible={true}
          onClose={jest.fn()}
          statusFilter="all"
          onSelectStatus={jest.fn()}
          priorityFilter="all"
          onSelectPriority={onSelectPriorityMock}
          frequencyFilter="all"
          onSelectFrequency={jest.fn()}
          reminderFilter="all"
          onSelectReminder={jest.fn()}
          activeFilterCount={0}
          onResetFilters={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const highChip = root.find((n: any) =>
      typeof n.props.accessibilityLabel === "string" &&
      n.props.accessibilityLabel.includes("Filter option High")
    );
    expect(highChip).toBeDefined();

    act(() => {
      highChip.props.onPress();
    });
    expect(onSelectPriorityMock).toHaveBeenCalledWith("high");
  });

  it("shows reset button when activeFilterCount > 0 and calls onResetFilters", () => {
    const onResetFiltersMock = jest.fn();
    let renderer: any;
    act(() => {
      renderer = create(
        <HabitFilterModal
          visible={true}
          onClose={jest.fn()}
          statusFilter="active"
          onSelectStatus={jest.fn()}
          priorityFilter="all"
          onSelectPriority={jest.fn()}
          frequencyFilter="all"
          onSelectFrequency={jest.fn()}
          reminderFilter="all"
          onSelectReminder={jest.fn()}
          activeFilterCount={1}
          onResetFilters={onResetFiltersMock}
        />
      );
    });

    const root = renderer.root;
    const resetBtn = root.find((n: any) =>
      typeof n.props.accessibilityLabel === "string" &&
      n.props.accessibilityLabel === "Reset all filters"
    );
    expect(resetBtn).toBeDefined();

    act(() => {
      resetBtn.props.onPress();
    });
    expect(onResetFiltersMock).toHaveBeenCalledTimes(1);
  });
});
