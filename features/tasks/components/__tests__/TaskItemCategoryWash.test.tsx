import React from "react";
import { act, create } from "react-test-renderer";
import { TodoItem } from "@/features/tasks/components/TaskItem";
import type { Task, Workspace } from "@/shared/types/domain.types";
import { Colors } from "@/shared/constants/theme";
import { TaskCategoryColors } from "@/shared/constants/categoryColors";
import { Stop } from "react-native-svg";

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

jest.mock("@/shared/hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
  default: () => false,
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
];

const baseTask: Task = {
  id: "task-ambient-1",
  title: "Finish portfolio",
  workspaceId: "ws-work",
  categoryId: "work",
  status: "todo",
  priority: "high",
  schedule: { date: "2026-10-05" },
  resourceIds: ["res-1", "res-2"],
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1000,
  updatedAt: 1000,
};

describe("TaskItem Category Presentation Redesign", () => {
  it("removes standalone category badge squircle and renders ambient background wash", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <TodoItem
          item={baseTask}
          colors={Colors.dark}
          colorScheme="dark"
          isOverdue={false}
          lists={mockWorkspaces}
          selectedWorkspaceId="ws-work"
          onToggleTodo={jest.fn()}
          onDeleteTodo={jest.fn()}
          allResources={[{ id: "res-1", title: "Doc" }, { id: "res-2", title: "Spec" }]}
        />
      );
    });

    const root = renderer.root;

    // 1. Standalone category badge squircle is NOT present
    const categoryBadges = root.findAllByProps({ style: expect.anything() }).filter((n: any) => {
      const s = n.props.style;
      return s && (s.width === 36 && s.height === 36 && s.borderRadius === 11);
    });
    expect(categoryBadges).toHaveLength(0);

    // 2. Ambient category wash Svg exists with testID
    const ambientWash = root.findByProps({ testID: "task-category-ambient-wash" });
    expect(ambientWash).toBeDefined();

    // 3. Ambient category icon watermark exists with testID
    const ambientIcon = root.findByProps({ testID: "task-category-ambient-icon" });
    expect(ambientIcon).toBeDefined();
    expect(ambientIcon.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ position: "absolute", right: 76 }),
        expect.objectContaining({ opacity: 0.19 }),
      ])
    );

    // 4. Stop color matches semantic category color
    const stops = ambientWash.findAllByType(Stop);
    expect(stops[0].props.stopColor).toBe(TaskCategoryColors.work.color.dark);
    // Dark theme vibrant ambient opacity: ~28% peak
    expect(stops[0].props.stopOpacity).toBeCloseTo(0.28, 2);

    // 5. Row preserves: checkbox, title, resource indicator, overflow button
    expect(root.findByProps({ accessibilityRole: "checkbox" })).toBeDefined();
    expect(root.findByProps({ testID: "task-resource-indicator" })).toBeDefined();
    expect(root.findByProps({ accessibilityLabel: "More options for Finish portfolio" })).toBeDefined();

    const textNodes = root.findAllByType("Text" as any).map((t: any) => t.props.children);
    expect(textNodes).toContain("Finish portfolio");
  });

  it("renders light theme ambient wash with visible category opacity", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <TodoItem
          item={baseTask}
          colors={Colors.light}
          colorScheme="light"
          isOverdue={false}
          lists={mockWorkspaces}
          selectedWorkspaceId="ws-work"
          onToggleTodo={jest.fn()}
          onDeleteTodo={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const ambientWash = root.findByProps({ testID: "task-category-ambient-wash" });
    expect(ambientWash).toBeDefined();

    const stops = ambientWash.findAllByType(Stop);
    // Light theme visible opacity: ~22% peak
    expect(stops[0].props.stopOpacity).toBeCloseTo(0.22, 2);

    const ambientIcon = root.findByProps({ testID: "task-category-ambient-icon" });
    expect(ambientIcon.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ opacity: 0.16 })])
    );
  });

  it("does not render ambient category wash or icon when task has no categoryId", () => {
    const taskWithoutCategory: Task = {
      ...baseTask,
      id: "task-no-cat",
      categoryId: undefined,
    };

    let renderer: any;
    act(() => {
      renderer = create(
        <TodoItem
          item={taskWithoutCategory}
          colors={Colors.dark}
          colorScheme="dark"
          isOverdue={false}
          lists={mockWorkspaces}
          selectedWorkspaceId="ws-work"
          onToggleTodo={jest.fn()}
          onDeleteTodo={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const ambientWashes = root.findAllByProps({ testID: "task-category-ambient-wash" });
    expect(ambientWashes).toHaveLength(0);
    const ambientIcons = root.findAllByProps({ testID: "task-category-ambient-icon" });
    expect(ambientIcons).toHaveLength(0);
  });

  it("uses the specific category color for non-work categories", () => {
    const healthTask: Task = {
      ...baseTask,
      id: "task-health",
      categoryId: "health",
    };

    let renderer: any;
    act(() => {
      renderer = create(
        <TodoItem
          item={healthTask}
          colors={Colors.dark}
          colorScheme="dark"
          isOverdue={false}
          lists={mockWorkspaces}
          selectedWorkspaceId="ws-work"
          onToggleTodo={jest.fn()}
          onDeleteTodo={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const ambientWash = root.findByProps({ testID: "task-category-ambient-wash" });
    const stops = ambientWash.findAllByType(Stop);
    expect(stops[0].props.stopColor).toBe(TaskCategoryColors.health.color.dark);
  });
});
