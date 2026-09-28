import React from "react";
import { act, create } from "react-test-renderer";
import { TodoItem } from "@/features/tasks/components/TaskItem";
import type { Task, Workspace } from "@/shared/types/domain.types";
import { Colors } from "@/shared/constants/theme";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("@/shared/components/ui/SwipeableCard", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    SwipeableCard: ({ children }: any) => React.createElement(View, null, children),
  };
});

jest.mock("@/shared/components/ui/PressableScale", () => {
  const React = require("react");
  const { Pressable } = require("react-native");
  const Comp = ({ children, onPress, ...props }: any) =>
    React.createElement(Pressable, { onPress, ...props }, children);
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
    createdAt: 1000,
    updatedAt: 1000,
  },
];

const baseTask: Task = {
  id: "task-1",
  title: "Finish Pebble redesign",
  status: "pending",
  priority: "high",
  workspaceId: "ws-work",
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
});
