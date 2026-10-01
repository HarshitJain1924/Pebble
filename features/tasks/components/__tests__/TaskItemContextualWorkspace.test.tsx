import React from "react";
import { act, create } from "react-test-renderer";
import { TodoItem } from "@/features/tasks/components/TaskItem";
import type { Task, Workspace } from "@/shared/types/domain.types";
import { Colors } from "@/shared/constants/theme";

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-image", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    Image: (props: any) => React.createElement(View, { testID: "expo-image", ...props }),
  };
});

let mockReducedMotion = false;
jest.mock("@/shared/hooks/useReducedMotion", () => ({
  useReducedMotion: () => mockReducedMotion,
  default: () => mockReducedMotion,
}));

jest.mock("@/shared/components/ui/SwipeableCard", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    SwipeableCard: ({ children }: any) => React.createElement(View, null, children),
  };
});

jest.mock("@/shared/components/ui/PressableScale", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Comp = ({ children, onPress, ...props }: any) =>
    React.createElement(View, { onPress, ...props }, children);
  return {
    __esModule: true,
    default: Comp,
    PressableScale: Comp,
  };
});

jest.mock("@expo/vector-icons", () => ({
  Feather: (props: any) => require("react").createElement("FeatherIcon", props),
  Ionicons: (props: any) => require("react").createElement("IoniconsIcon", props),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 0, Medium: 1, Heavy: 2 },
  NotificationFeedbackType: { Success: 0, Warning: 1, Error: 2 },
}));

const mockColors = Colors.dark;

const mockWorkspaces: Workspace[] = [
  {
    id: "ws-work",
    name: "Work",
    color: "#3B82F6",
    emoji: "💼",
    icon: "briefcase",
    iconType: "icon",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  },
  {
    id: "inbox",
    name: "Inbox",
    color: "#6366F1",
    emoji: "📥",
    icon: "inbox",
    iconType: "icon",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  },
];

const baseTask: Task = {
  id: "task-1",
  title: "Finish Pebble redesign",
  status: "todo",
  priority: "high",
  workspaceId: "ws-work",
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1000,
  updatedAt: 1000,
};

describe("TaskItem Contextual Workspace Rendering", () => {
  it("renders workspace badge in all/global mode", () => {
    let root: any;
    act(() => {
      root = create(
        <TodoItem
          item={baseTask}
          colors={mockColors}
          colorScheme="dark"
          isOverdue={false}
          lists={mockWorkspaces}
          selectedWorkspaceId="all"
          showWorkspaceBadge={true}
          onToggleTodo={jest.fn()}
          onDeleteTodo={jest.fn()}
        />
      );
    });

    const textNodes = root.root.findAllByType("Text" as any);
    const renderedTexts = textNodes.map((t: any) => t.props.children);
    expect(renderedTexts).toContain("Work");
    expect(renderedTexts).toContain("Finish Pebble redesign");
  });

  it("hides workspace badge inside a specific workspace", () => {
    let root: any;
    act(() => {
      root = create(
        <TodoItem
          item={baseTask}
          colors={mockColors}
          colorScheme="dark"
          isOverdue={false}
          lists={mockWorkspaces}
          selectedWorkspaceId="ws-work"
          showWorkspaceBadge={false}
          onToggleTodo={jest.fn()}
          onDeleteTodo={jest.fn()}
        />
      );
    });

    const textNodes = root.root.findAllByType("Text" as any);
    const renderedTexts = textNodes.map((t: any) => t.props.children);
    expect(renderedTexts).not.toContain("Work");
    expect(renderedTexts).toContain("Finish Pebble redesign");
  });

  it("preserves reminder and overdue metadata when workspace badge is hidden", () => {
    const taskWithReminder: Task = {
      ...baseTask,
      reminder: {
        enabled: true,
        triggerAt: new Date(2026, 8, 27, 17, 0).getTime(), // 5:00 PM
      },
    };

    let root: any;
    act(() => {
      root = create(
        <TodoItem
          item={taskWithReminder}
          colors={mockColors}
          colorScheme="dark"
          isOverdue={true}
          lists={mockWorkspaces}
          selectedWorkspaceId="ws-work"
          showWorkspaceBadge={false}
          onToggleTodo={jest.fn()}
          onDeleteTodo={jest.fn()}
        />
      );
    });

    const textNodes = root.root.findAllByType("Text" as any);
    const renderedTexts = textNodes.map((t: any) => t.props.children);
    // Overdue label present
    expect(renderedTexts).toContain("Overdue");
    // Reminder time formatted present
    expect(renderedTexts).toContain("5:00 PM");
    // Workspace name hidden
    expect(renderedTexts).not.toContain("Work");
  });

  it("preserves recurrence and duration metadata when workspace badge is hidden", () => {
    const taskWithRecurrenceAndDuration: Task = {
      ...baseTask,
      recurrence: {
        frequency: "daily",
        interval: 1,
      },
      schedule: {
        date: "2026-09-27",
        durationMinutes: 45,
      } as any,
    };

    let root: any;
    act(() => {
      root = create(
        <TodoItem
          item={taskWithRecurrenceAndDuration}
          colors={mockColors}
          colorScheme="dark"
          isOverdue={false}
          lists={mockWorkspaces}
          selectedWorkspaceId="ws-work"
          showWorkspaceBadge={false}
          onToggleTodo={jest.fn()}
          onDeleteTodo={jest.fn()}
        />
      );
    });

    const textNodes = root.root.findAllByType("Text" as any);
    const renderedTexts = textNodes.map((t: any) => t.props.children);
    expect(renderedTexts).toContain("Daily");
    expect(renderedTexts).toContain("45m");
    expect(renderedTexts).not.toContain("Work");
  });

  it("does not render trailing chevron", () => {
    let root: any;
    act(() => {
      root = create(
        <TodoItem
          item={baseTask}
          colors={mockColors}
          colorScheme="dark"
          isOverdue={false}
          lists={mockWorkspaces}
          selectedWorkspaceId="ws-work"
          showWorkspaceBadge={false}
          onToggleTodo={jest.fn()}
          onDeleteTodo={jest.fn()}
        />
      );
    });

    const featherIcons = root.root.findAllByType("FeatherIcon" as any);
    const chevronIcon = featherIcons.find((icon: any) => icon.props.name === "chevron-right");
    expect(chevronIcon).toBeUndefined();
  });

  describe("Resource Stack rendering rules", () => {
    it("renders nothing for 0 resources", () => {
      let root: any;
      act(() => {
        root = create(
          <TodoItem
            item={{ ...baseTask, resourceIds: [] }}
            colors={mockColors}
            colorScheme="dark"
            isOverdue={false}
            lists={mockWorkspaces}
            selectedWorkspaceId="ws-work"
            showWorkspaceBadge={false}
            onToggleTodo={jest.fn()}
            onDeleteTodo={jest.fn()}
          />
        );
      });

      const stackPressable = root.root
        .findAllByProps({ accessibilityRole: "button" })
        .find(
          (p: any) =>
            typeof p.props.accessibilityLabel === "string" &&
            p.props.accessibilityLabel.includes("linked resources")
        );
      expect(stackPressable).toBeUndefined();
    });

    it("renders single tile and no chip for 1 resource", () => {
      let root: any;
      act(() => {
        root = create(
          <TodoItem
            item={{ ...baseTask, resourceIds: ["res-1"] }}
            colors={mockColors}
            colorScheme="dark"
            isOverdue={false}
            lists={mockWorkspaces}
            selectedWorkspaceId="ws-work"
            showWorkspaceBadge={false}
            onToggleTodo={jest.fn()}
            onDeleteTodo={jest.fn()}
          />
        );
      });

      const stackPressable = root.root.findByProps({
        accessibilityLabel: "1 linked resources for Finish Pebble redesign",
      });
      expect(stackPressable).toBeDefined();
      expect(stackPressable.props.accessibilityState).toEqual({ expanded: false });

      const tile0 = root.root.findAllByProps({ testID: "resource-stack-tile-0" });
      expect(tile0.length).toBeGreaterThan(0);

      const plusChip = root.root.findAllByProps({ testID: "resource-stack-plus-chip" });
      expect(plusChip.length).toBe(0);
    });

    it("renders 3 tiles and no chip for 3 resources", () => {
      let root: any;
      act(() => {
        root = create(
          <TodoItem
            item={{ ...baseTask, resourceIds: ["res-1", "res-2", "res-3"] }}
            colors={mockColors}
            colorScheme="dark"
            isOverdue={false}
            lists={mockWorkspaces}
            selectedWorkspaceId="ws-work"
            showWorkspaceBadge={false}
            onToggleTodo={jest.fn()}
            onDeleteTodo={jest.fn()}
          />
        );
      });

      const stackPressable = root.root.findByProps({
        accessibilityLabel: "3 linked resources for Finish Pebble redesign",
      });
      expect(stackPressable).toBeDefined();

      const tile0 = root.root.findAllByProps({ testID: "resource-stack-tile-0" });
      const tile1 = root.root.findAllByProps({ testID: "resource-stack-tile-1" });
      const tile2 = root.root.findAllByProps({ testID: "resource-stack-tile-2" });
      expect(tile0.length).toBeGreaterThan(0);
      expect(tile1.length).toBeGreaterThan(0);
      expect(tile2.length).toBeGreaterThan(0);

      const plusChip = root.root.findAllByProps({ testID: "resource-stack-plus-chip" });
      expect(plusChip.length).toBe(0);
    });

    it("renders 2 tiles and +2 chip for 4 resources", () => {
      let root: any;
      act(() => {
        root = create(
          <TodoItem
            item={{ ...baseTask, resourceIds: ["res-1", "res-2", "res-3", "res-4"] }}
            colors={mockColors}
            colorScheme="dark"
            isOverdue={false}
            lists={mockWorkspaces}
            selectedWorkspaceId="ws-work"
            showWorkspaceBadge={false}
            onToggleTodo={jest.fn()}
            onDeleteTodo={jest.fn()}
          />
        );
      });

      const stackPressable = root.root.findByProps({
        accessibilityLabel: "4 linked resources for Finish Pebble redesign",
      });
      expect(stackPressable).toBeDefined();

      const tile0 = root.root.findAllByProps({ testID: "resource-stack-tile-0" });
      const tile1 = root.root.findAllByProps({ testID: "resource-stack-tile-1" });
      const tile2 = root.root.findAllByProps({ testID: "resource-stack-tile-2" });
      expect(tile0.length).toBeGreaterThan(0);
      expect(tile1.length).toBeGreaterThan(0);
      expect(tile2.length).toBe(0);

      const plusChip = root.root.findAllByProps({ testID: "resource-stack-plus-chip" });
      expect(plusChip.length).toBeGreaterThan(0);

      const textNodes = plusChip[0].findAllByType("Text" as any);
      const chipTexts = textNodes.map((t: any) => t.props.children);
      expect(chipTexts).toContain("+2");
    });

    it("renders 2 tiles and +5 chip for 7 resources", () => {
      let root: any;
      act(() => {
        root = create(
          <TodoItem
            item={{
              ...baseTask,
              resourceIds: ["r1", "r2", "r3", "r4", "r5", "r6", "r7"],
            }}
            colors={mockColors}
            colorScheme="dark"
            isOverdue={false}
            lists={mockWorkspaces}
            selectedWorkspaceId="ws-work"
            showWorkspaceBadge={false}
            onToggleTodo={jest.fn()}
            onDeleteTodo={jest.fn()}
          />
        );
      });

      const stackPressable = root.root.findByProps({
        accessibilityLabel: "7 linked resources for Finish Pebble redesign",
      });
      expect(stackPressable).toBeDefined();

      const tile0 = root.root.findAllByProps({ testID: "resource-stack-tile-0" });
      const tile1 = root.root.findAllByProps({ testID: "resource-stack-tile-1" });
      const tile2 = root.root.findAllByProps({ testID: "resource-stack-tile-2" });
      expect(tile0.length).toBeGreaterThan(0);
      expect(tile1.length).toBeGreaterThan(0);
      expect(tile2.length).toBe(0);

      const plusChip = root.root.findAllByProps({ testID: "resource-stack-plus-chip" });
      expect(plusChip.length).toBeGreaterThan(0);

      const textNodes = plusChip[0].findAllByType("Text" as any);
      const chipTexts = textNodes.map((t: any) => t.props.children);
      expect(chipTexts).toContain("+5");
    });

    it("reports collapsed resource state until the resource area is tapped", () => {
      let root: any;
      act(() => {
        root = create(
          <TodoItem
            item={{ ...baseTask, resourceIds: ["res-1", "res-2"] }}
            colors={mockColors}
            colorScheme="dark"
            isOverdue={false}
            lists={mockWorkspaces}
            selectedWorkspaceId="ws-work"
            showWorkspaceBadge={false}
            onToggleTodo={jest.fn()}
            onDeleteTodo={jest.fn()}
          />
        );
      });

      const stackPressable = root.root.findByProps({
        accessibilityLabel: "2 linked resources for Finish Pebble redesign",
      });
      expect(stackPressable.props.accessibilityState).toEqual({ expanded: false });

      act(() => {
        stackPressable.props.onPress();
      });

      expect(stackPressable.props.accessibilityState).toEqual({ expanded: true });
    });

    it("renders cleanly under reduced motion", () => {
      mockReducedMotion = true;
      let root: any;
      act(() => {
        root = create(
          <TodoItem
            item={{ ...baseTask, resourceIds: ["res-1", "res-2"] }}
            colors={mockColors}
            colorScheme="dark"
            isOverdue={false}
            lists={mockWorkspaces}
            selectedWorkspaceId="ws-work"
            showWorkspaceBadge={false}
            onToggleTodo={jest.fn()}
            onDeleteTodo={jest.fn()}
          />
        );
      });

      const stackPressable = root.root.findByProps({
        accessibilityLabel: "2 linked resources for Finish Pebble redesign",
      });
      expect(stackPressable).toBeDefined();
      mockReducedMotion = false;
    });
  });

  it("renders relative date and omits overdue label when omitOverdueLabel is true", () => {
    const taskEarlier: Task = {
      ...baseTask,
      schedule: {
        date: "2026-09-28", // Yesterday relative to 2026-09-29
      } as any,
    };

    let root: any;
    act(() => {
      root = create(
        <TodoItem
          item={taskEarlier}
          colors={mockColors}
          colorScheme="dark"
          isOverdue={true}
          omitOverdueLabel={true}
          selectedDate="2026-09-29"
          lists={mockWorkspaces}
          selectedWorkspaceId="ws-work"
          showWorkspaceBadge={false}
          onToggleTodo={jest.fn()}
          onDeleteTodo={jest.fn()}
        />
      );
    });

    const textNodes = root.root.findAllByType("Text" as any);
    const renderedTexts = textNodes.map((t: any) => t.props.children);
    expect(renderedTexts).not.toContain("Overdue");
    expect(renderedTexts).toContain("Yesterday");
  });

  describe("Completion moment behavior", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("triggers local complete state and fires onToggleTodo after delay", () => {
      const onToggle = jest.fn();
      let root: any;
      act(() => {
        root = create(
          <TodoItem
            item={baseTask}
            colors={mockColors}
            colorScheme="dark"
            isOverdue={false}
            lists={mockWorkspaces}
            selectedWorkspaceId="ws-work"
            showWorkspaceBadge={false}
            onToggleTodo={onToggle}
            onDeleteTodo={jest.fn()}
          />
        );
      });

      const checkbox = root.root.findByProps({
        accessibilityRole: "checkbox",
      });
      expect(checkbox.props.accessibilityState).toEqual({ checked: false });

      // Press to complete
      act(() => {
        checkbox.props.onPress();
      });

      // Immediately reflects checked state optimistically
      expect(checkbox.props.accessibilityState).toEqual({ checked: true });
      // onToggleTodo has not fired yet
      expect(onToggle).not.toHaveBeenCalled();

      // Advance timers by 400ms
      act(() => {
        jest.advanceTimersByTime(400);
      });

      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });
});
