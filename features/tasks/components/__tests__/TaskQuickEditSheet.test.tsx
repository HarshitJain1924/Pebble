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

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

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

  it("renders floating resource deck near top with tiles when resources exist", () => {
    let root: any;
    act(() => {
      root = create(<TaskQuickEditSheet {...defaultProps} />);
    });

    // 1. Resource deck is rendered and immediately visible
    const deck = root.root.findByProps({ testID: "task-attachment-deck" });
    expect(deck).toBeDefined();

    // 2. Resource tile
    const tile = root.root.findByProps({ testID: "task-attachment-tile-res-1" });
    expect(tile).toBeDefined();
    expect(tile.props.accessibilityLabel).toBe("Open resource: Project Brief");

    act(() => {
      tile.props.onPress();
    });
    expect(defaultProps.handleOpenResource).toHaveBeenCalledWith(
      expect.objectContaining({ id: "res-1" })
    );

    // 3. Add attachment tile
    const addBtn = root.root.findByProps({ testID: "task-add-attachment-button" });
    expect(addBtn).toBeDefined();
    act(() => {
      addBtn.props.onPress();
    });
    expect(defaultProps.onOpenLinkSelector).toHaveBeenCalled();

    // 4. Resource count is NOT rendered as a property pill inside the editor
    const propPills = root.root.findAll((node: any) =>
      Boolean(node.props.testID && node.props.testID === "task-resources-pill")
    );
    expect(propPills).toHaveLength(0);
  });

  it("renders subtle + Add resource affordance when no resources exist", () => {
    let root: any;
    act(() => {
      root = create(
        <TaskQuickEditSheet
          {...defaultProps}
          linkedResources={[]}
          totalResources={0}
        />
      );
    });

    const emptyAdd = root.root.findByProps({ testID: "task-add-resource-empty" });
    expect(emptyAdd).toBeDefined();
    act(() => {
      emptyAdd.props.onPress();
    });
    expect(defaultProps.onOpenLinkSelector).toHaveBeenCalled();
  });
});
