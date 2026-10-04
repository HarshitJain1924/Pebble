import React from "react";
import { act, create } from "react-test-renderer";
import { TaskQuickEditSheet } from "../TaskQuickEditSheet";
import { Colors } from "@/shared/constants/theme";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import type { Task } from "@/shared/types/domain.types";

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
}));

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    Feather: (props: any) => React.createElement(View, { testID: `feather-${props.name}`, ...props }),
  };
});

jest.mock("@/services/command/EntityCommandService", () => ({
  EntityCommandService: {
    updateTask: jest.fn(async () => ({})),
  },
}));

describe("TaskQuickEditSheet", () => {
  const mockColors = Colors.dark;

  const sampleTask: Task = {
    id: "task-test-1",
    workspaceId: "inbox",
    title: "Review today's tasks",
    description: "Prepare list for standup",
    status: "todo",
    priority: "high",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    schedule: {
      date: "2026-10-15",
    },
    reminder: {
      enabled: true,
      triggerAt: new Date("2026-10-15T09:00:00").getTime(),
    },
    resourceIds: ["res-1"],
  };

  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    item: sampleTask,
    colors: mockColors,
    isDark: true,
    isCompleted: false,
    onToggleComplete: jest.fn(),
    onEditTodo: jest.fn(),
    onSetAlarm: jest.fn(),
    onOpenDatePicker: jest.fn(),
    onDeleteTodo: jest.fn(),
    linkedResources: [{ id: "res-1", title: "Project Brief", type: "document" }],
    totalResources: 1,
    streamColors: { note: { backgroundColor: "rgba(0,0,0,0.1)", accent: "#358366" } },
    handleOpenResource: jest.fn(),
    onOpenLinkSelector: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders task title and note when open", () => {
    let root: any;
    act(() => {
      root = create(<TaskQuickEditSheet {...defaultProps} />);
    });

    const inputs = root.root.findAll((node: any) => node.props.value !== undefined);
    const titleInput = inputs.find((n: any) => n.props.value === "Review today's tasks");
    const noteInput = inputs.find((n: any) => n.props.value === "Prepare list for standup");

    expect(titleInput).toBeDefined();
    expect(noteInput).toBeDefined();
  });

  it("calls onToggleComplete when checkbox is pressed", () => {
    let root: any;
    act(() => {
      root = create(<TaskQuickEditSheet {...defaultProps} />);
    });

    const checkbox = root.root.find(
      (node: any) => node.props.accessibilityRole === "checkbox"
    );
    expect(checkbox).toBeDefined();

    act(() => {
      checkbox.props.onPress();
    });

    expect(defaultProps.onToggleComplete).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenDatePicker when schedule pill is pressed", async () => {
    let root: any;
    act(() => {
      root = create(<TaskQuickEditSheet {...defaultProps} />);
    });

    const schedulePill = root.root.find(
      (node: any) =>
        node.props.accessibilityLabel &&
        node.props.accessibilityLabel.startsWith("Schedule:")
    );
    expect(schedulePill).toBeDefined();

    await act(async () => {
      await schedulePill.props.onPress();
    });

    expect(defaultProps.onOpenDatePicker).toHaveBeenCalledTimes(1);
  });

  it("calls onSetAlarm when reminder pill is pressed", async () => {
    let root: any;
    act(() => {
      root = create(<TaskQuickEditSheet {...defaultProps} />);
    });

    const reminderPill = root.root.find(
      (node: any) =>
        node.props.accessibilityLabel &&
        node.props.accessibilityLabel.startsWith("Reminder:")
    );
    expect(reminderPill).toBeDefined();

    await act(async () => {
      await reminderPill.props.onPress();
    });

    expect(defaultProps.onSetAlarm).toHaveBeenCalledTimes(1);
  });

  it("calls onEditTodo when Open full details is pressed", async () => {
    let root: any;
    act(() => {
      root = create(<TaskQuickEditSheet {...defaultProps} />);
    });

    const openDetailsBtn = root.root.find(
      (node: any) =>
        node.props.accessibilityLabel === "Open full task details"
    );
    expect(openDetailsBtn).toBeDefined();

    await act(async () => {
      await openDetailsBtn.props.onPress();
    });

    expect(defaultProps.onEditTodo).toHaveBeenCalledTimes(1);
  });

  it("calls onDeleteTodo when delete button is pressed", async () => {
    let root: any;
    act(() => {
      root = create(<TaskQuickEditSheet {...defaultProps} />);
    });

    const deleteBtn = root.root.find(
      (node: any) => node.props.accessibilityLabel === "Delete task"
    );
    expect(deleteBtn).toBeDefined();

    await act(async () => {
      await deleteBtn.props.onPress();
    });

    expect(defaultProps.onDeleteTodo).toHaveBeenCalledTimes(1);
  });

  it("opens inline priority selector and updates task priority when an option is selected", async () => {
    let root: any;
    act(() => {
      root = create(<TaskQuickEditSheet {...defaultProps} />);
    });

    const priorityPill = root.root.find(
      (node: any) =>
        node.props.accessibilityLabel &&
        node.props.accessibilityLabel.startsWith("Priority:")
    );
    expect(priorityPill).toBeDefined();

    // Toggle priority picker open
    act(() => {
      priorityPill.props.onPress();
    });

    const mediumOption = root.root.find(
      (node: any) => node.props.accessibilityLabel === "Set priority to Medium"
    );
    expect(mediumOption).toBeDefined();

    await act(async () => {
      await mediumOption.props.onPress();
    });

    expect(EntityCommandService.updateTask).toHaveBeenCalledWith(
      "task-test-1",
      "inbox",
      { priority: "medium" }
    );
  });
});
