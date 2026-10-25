jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
}));
jest.mock("@expo/vector-icons", () => ({
  Feather: () => null,
}));

import React from "react";
import { act, create } from "react-test-renderer";
import { EmptyState } from "@/shared/components/ui/EmptyState";

describe("Checklists Empty State Contract Suite", () => {
  it("renders contextual EmptyState for empty checklists", () => {
    const handleCreate = jest.fn();
    let renderer: any;
    act(() => {
      renderer = create(
        <EmptyState
          mascot="idle"
          title="No checklists yet"
          description="Break down complex routines, packing lists, or projects into step-by-step checklists."
          action={{
            label: "New Checklist",
            icon: "plus",
            onPress: handleCreate,
            testID: "btn-new-checklist",
          }}
        />
      );
    });

    const root = renderer.root;
    const emptyState = root.findByType(EmptyState);
    expect(emptyState.props.title).toBe("No checklists yet");
    expect(emptyState.props.mascot).toBe("idle");

    const actionBtn = root.findByProps({ testID: "btn-new-checklist" });
    expect(actionBtn).toBeDefined();

    act(() => {
      actionBtn.props.onPress();
    });
    expect(handleCreate).toHaveBeenCalledTimes(1);
  });
});
