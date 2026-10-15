import React from "react";
import { act, create } from "react-test-renderer";
import { TodoItem } from "@/features/tasks/components/TaskItem";
import type { Task, Workspace } from "@/shared/types/domain.types";
import { Colors, Palette } from "@/shared/constants/theme";
import { TaskCategoryColors } from "@/shared/constants/categoryColors";

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
  description: "Prepare case studies and mockups for client review",
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

describe("TaskItem Atmospheric Card Redesign", () => {
  it("renders atmospheric card with category artwork on right, ambient wash, and no orange priority strip", () => {
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

    // 1. Ambient category wash Svg and artwork are rendered
    const ambientWash = root.findByProps({ testID: "task-category-ambient-wash" });
    expect(ambientWash).toBeDefined();

    const artwork = root.findByProps({ testID: "task-category-artwork" });
    expect(artwork).toBeDefined();

    // 2. Priority edge strip is REMOVED
    expect(root.findAllByProps({ testID: "task-category-priority-edge-strip" })).toHaveLength(0);

    // 3. Priority is expressed via compact flag in metadata row (amber for high priority)
    const prioText = root.findByProps({ testID: "task-priority-indicator-text" });
    expect(prioText).toBeDefined();
    expect(prioText.props.children).toBe("High");
    const flatPrioStyle = Object.assign(
      {},
      ...(Array.isArray(prioText.props.style) ? prioText.props.style : [prioText.props.style])
    );
    expect(flatPrioStyle.color).toBe(Colors.dark.warning);

    // 4. Description is rendered secondarily below title
    const descNode = root.findByProps({ testID: "task-category-description" });
    expect(descNode).toBeDefined();
    expect(descNode.props.children).toBe("Prepare case studies and mockups for client review");

    // 5. Card container has deep charcoal surface and subtle category-tinted border
    const container = root.findByProps({ testID: "entity-item-container" });
    const flat = Object.assign(
      {},
      ...(Array.isArray(container.props.style) ? container.props.style : [container.props.style])
    );
    expect(flat.backgroundColor).toBe(Colors.dark.card);
    expect(flat.borderColor).toBe(`${TaskCategoryColors.work.color.dark}22`);

    // 6. Title is strongest text element without cluttering inline icon
    expect(root.findAllByProps({ testID: "task-category-category-icon" })).toHaveLength(0);
    const textNodes = root.findAllByType("Text" as any).map((t: any) => t.props.children);
    expect(textNodes).toContain("Finish portfolio");

    // 7. Core controls preserved: checkbox, resource indicator, overflow button
    expect(root.findByProps({ accessibilityRole: "checkbox" })).toBeDefined();
    expect(root.findByProps({ testID: "task-resource-indicator" })).toBeDefined();
    expect(root.findByProps({ accessibilityLabel: "More options for Finish portfolio" })).toBeDefined();
  });

  it("renders light theme with subtle ambient wash and light card surface", () => {
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
    expect(root.findByProps({ testID: "task-category-ambient-wash" })).toBeDefined();
    expect(root.findByProps({ testID: "task-category-artwork" })).toBeDefined();

    const container = root.findByProps({ testID: "entity-item-container" });
    const flat = Object.assign(
      {},
      ...(Array.isArray(container.props.style) ? container.props.style : [container.props.style])
    );
    expect(flat.backgroundColor).toBe(Palette.white);
    expect(flat.borderColor).toBe(`${TaskCategoryColors.work.color.dark}18`);
  });

  it("does not render ambient category wash or artwork when task has no category or keyword match", () => {
    const taskWithoutCategory: Task = {
      ...baseTask,
      id: "task-no-cat",
      title: "Check battery level",
      categoryId: undefined,
      description: undefined,
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
    expect(root.findAllByProps({ testID: "task-category-ambient-wash" })).toHaveLength(0);
    expect(root.findAllByProps({ testID: "task-category-artwork" })).toHaveLength(0);

    const container = root.findByProps({ testID: "entity-item-container" });
    const flat = Object.assign(
      {},
      ...(Array.isArray(container.props.style) ? container.props.style : [container.props.style])
    );
    expect(flat.backgroundColor).toBe(Colors.dark.card);
    expect(flat.borderColor).toBe("rgba(255, 255, 255, 0.08)");
  });

  it("does not render priority flag when task has priority none or undefined", () => {
    const taskNoPriority: Task = {
      ...baseTask,
      id: "task-no-prio",
      priority: "none",
    };

    let renderer: any;
    act(() => {
      renderer = create(
        <TodoItem
          item={taskNoPriority}
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
    expect(root.findAllByProps({ testID: "task-priority-indicator" })).toHaveLength(0);
  });

  it("renders medium priority flag with secondary blue and low priority with muted color", () => {
    const taskMed: Task = {
      ...baseTask,
      id: "task-med",
      priority: "medium",
    };

    let renderer: any;
    act(() => {
      renderer = create(
        <TodoItem
          item={taskMed}
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
    const prioText = root.findByProps({ testID: "task-priority-indicator-text" });
    expect(prioText.props.children).toBe("Med");
    const flatPrioStyle = Object.assign(
      {},
      ...(Array.isArray(prioText.props.style) ? prioText.props.style : [prioText.props.style])
    );
    expect(flatPrioStyle.color).toBe(Colors.dark.secondary);
  });

  it("renders category artwork for keyword match like Shopping", () => {
    const shoppingTask: Task = {
      ...baseTask,
      id: "task-shop",
      title: "Weekly Grocery Shopping",
      categoryId: undefined,
    };

    let renderer: any;
    act(() => {
      renderer = create(
        <TodoItem
          item={shoppingTask}
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
    expect(root.findByProps({ testID: "task-category-ambient-wash" })).toBeDefined();
    expect(root.findByProps({ testID: "task-category-artwork" })).toBeDefined();
  });

  it("applies dimmed 0.6 opacity and line-through when completed", () => {
    const completedTask: Task = {
      ...baseTask,
      id: "task-completed",
      status: "completed",
    };

    let renderer: any;
    act(() => {
      renderer = create(
        <TodoItem
          item={completedTask}
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
    const container = root.findByProps({ testID: "entity-item-container" });
    const flat = Object.assign(
      {},
      ...(Array.isArray(container.props.style) ? container.props.style : [container.props.style])
    );
    expect(flat.opacity).toBe(0.6);
  });

  it("hides overflow button and supports selection in selection mode", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <TodoItem
          item={baseTask}
          colors={Colors.dark}
          colorScheme="dark"
          isOverdue={false}
          isSelectionMode={true}
          isSelected={true}
          lists={mockWorkspaces}
          selectedWorkspaceId="ws-work"
          onToggleTodo={jest.fn()}
          onDeleteTodo={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    expect(root.findAllByProps({ accessibilityLabel: "More options for Finish portfolio" })).toHaveLength(0);
    const checkbox = root.findByProps({ accessibilityRole: "checkbox" });
    expect(checkbox.props.accessibilityState.checked).toBe(true);
  });
});
