jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
  impactAsync: jest.fn(async () => undefined),
}));
jest.mock("@expo/vector-icons", () => ({
  Feather: () => null,
}));

import React from "react";
import { act, create } from "react-test-renderer";
import { TaskPickerModal } from "../TaskPickerModal";
import { EmptyState } from "@/shared/components/ui/EmptyState";
import { Colors } from "@/shared/constants/theme";

describe("TaskPickerModal EmptyState Integration Suite", () => {
  const defaultColors = Colors.dark;

  it("1. Renders mascot-based EmptyState when both todoList and habitList are empty", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <TaskPickerModal
          visible={true}
          onClose={jest.fn()}
          todoList={[]}
          habitList={[]}
          focusedTaskId={null}
          onSelectTask={jest.fn()}
          colors={defaultColors}
          insets={{ top: 0, bottom: 0 }}
        />
      );
    });

    const emptyStates = renderer.root.findAllByType(EmptyState);
    expect(emptyStates.length).toBe(1);
    expect(emptyStates[0].props.title).toBe("No focus targets yet");
    expect(emptyStates[0].props.mascot).toBe("focus");
    expect(emptyStates[0].props.action.label).toBe("Create Task");
  });

  it("2. Does not render EmptyState when tasks or habits exist", () => {
    const sampleTask = { id: "task-1", title: "Complete design review" };
    let renderer: any;
    act(() => {
      renderer = create(
        <TaskPickerModal
          visible={true}
          onClose={jest.fn()}
          todoList={[sampleTask]}
          habitList={[]}
          focusedTaskId={null}
          onSelectTask={jest.fn()}
          colors={defaultColors}
          insets={{ top: 0, bottom: 0 }}
        />
      );
    });

    const emptyStates = renderer.root.findAllByType(EmptyState);
    expect(emptyStates.length).toBe(0);
  });
});
