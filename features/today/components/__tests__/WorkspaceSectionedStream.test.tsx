import React from "react";
import { act, create } from "react-test-renderer";
import {
  WorkspaceSectionedStream,
  WorkspaceItemRow,
  resolveItemCategorySymbol,
  getTabScrollTarget,
} from "../WorkspaceSectionedStream";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { ProgressRing } from "@/shared/components/ui/ProgressRing";
import { Colors } from "@/shared/constants/theme";
import { PriorityColors } from "@/shared/constants/categoryColors";
import type { Workspace, Task, Habit, Checklist } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light" },
}));

describe("WorkspaceSectionedStream Component", () => {
  const mockColors = Colors.dark;
  const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  } as any;

  const mockCompleteTodo = jest.fn().mockResolvedValue(undefined);
  const mockCompleteHabit = jest.fn().mockResolvedValue(undefined);
  const mockToggleChecklistItem = jest.fn().mockResolvedValue(undefined);
  const mockSetExpandedChecklistIds = jest.fn();

  const sampleWorkspace: Workspace = {
    id: "ws-work",
    name: "Work Projects",
    emoji: "💼",
    color: "#3B82F6",
    order: 0,
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  const sampleTasks: Task[] = [
    {
      id: "task-1",
      title: "Review quarterly deck",
      completed: false,
      priority: "high",
      workspaceId: "ws-work",
      createdAt: 1000,
      updatedAt: 1000,
    } as any,
    {
      id: "task-2",
      title: "Email team retro notes",
      completed: true,
      priority: "medium",
      workspaceId: "ws-work",
      createdAt: 1000,
      updatedAt: 1000,
    } as any,
  ];

  const sampleHabits: Habit[] = [
    {
      id: "habit-1",
      title: "Inbox Zero morning sweep",
      frequency: "daily",
      workspaceId: "ws-work",
      completionHistory: [],
      createdAt: 1000,
      updatedAt: 1000,
    } as any,
  ];

  const sampleChecklists: Checklist[] = [
    {
      id: "cl-1",
      title: "Sprint Release Checklist",
      workspaceId: "ws-work",
      items: [
        { id: "sub-1", title: "Bump package version", completed: false },
        { id: "sub-2", title: "Deploy to staging", completed: true },
      ],
      createdAt: 1000,
      updatedAt: 1000,
    } as any,
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders empty state when activeContexts is empty", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceSectionedStream
          activeContexts={[]}
          colors={mockColors}
          colorScheme="dark"
          allCollections={{}}
          expandedChecklistIds={{}}
          setExpandedChecklistIds={mockSetExpandedChecklistIds}
          router={mockRouter}
          completeTodoFromDashboard={mockCompleteTodo}
          completeHabitFromDashboard={mockCompleteHabit}
          toggleChecklistItemFromDashboard={mockToggleChecklistItem}
        />
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((n: any) => n.props.children);
    const joined = texts.flat().join(" ");
    expect(joined).toContain("All clear for today!");
    expect(joined).toContain("No active tasks, habits, or checklists");
  });

  it("renders workspace context card header with name and emoji", () => {
    const activeContexts = [
      {
        folder: sampleWorkspace,
        tasks: sampleTasks,
        habits: sampleHabits,
        checklists: sampleChecklists,
        totalCount: 5,
      },
    ];

    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceSectionedStream
          activeContexts={activeContexts}
          colors={mockColors}
          colorScheme="dark"
          allCollections={{ "ws-work": [{ id: "res-1" }] }}
          expandedChecklistIds={{}}
          setExpandedChecklistIds={mockSetExpandedChecklistIds}
          router={mockRouter}
          completeTodoFromDashboard={mockCompleteTodo}
          completeHabitFromDashboard={mockCompleteHabit}
          toggleChecklistItemFromDashboard={mockToggleChecklistItem}
        />
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((n: any) => n.props.children);
    const joined = texts.flat().join(" ");

    expect(joined).toContain("Work Projects");
    expect(joined).toContain("💼");
    expect(joined).toContain("Review quarterly deck");
    expect(joined).toContain("Inbox Zero morning sweep");
    expect(joined).toContain("Sprint Release Checklist");
  });

  it("caps displayed items to 5 and renders preview gateway button when remaining items exist", () => {
    const sixTasks: Task[] = Array.from({ length: 6 }, (_, i) => ({
      id: `task-overflow-${i}`,
      title: `Task item number ${i + 1}`,
      completed: false,
      priority: "none",
      workspaceId: "ws-work",
      createdAt: 1000,
      updatedAt: 1000,
    } as any));

    const activeContexts = [
      {
        folder: sampleWorkspace,
        tasks: sixTasks,
        habits: [],
        checklists: [],
        totalCount: 6,
      },
    ];

    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceSectionedStream
          activeContexts={activeContexts}
          colors={mockColors}
          colorScheme="dark"
          allCollections={{}}
          expandedChecklistIds={{}}
          setExpandedChecklistIds={mockSetExpandedChecklistIds}
          router={mockRouter}
          completeTodoFromDashboard={mockCompleteTodo}
          completeHabitFromDashboard={mockCompleteHabit}
          toggleChecklistItemFromDashboard={mockToggleChecklistItem}
        />
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((n: any) => n.props.children);
    const joined = texts.flat().join(" ");

    // Only first 5 items should be rendered
    expect(joined).toContain("Task item number 1");
    expect(joined).toContain("Task item number 5");
    expect(joined).not.toContain("Task item number 6");

    // Overflow gateway indicator should be visible
    expect(joined).toMatch(/\+\s*1\s*more in Work Projects/);
  });

  it("navigates to workspace when the card header is pressed", () => {
    const activeContexts = [
      {
        folder: sampleWorkspace,
        tasks: [sampleTasks[0]],
        habits: [],
        checklists: [],
        totalCount: 1,
      },
    ];

    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceSectionedStream
          activeContexts={activeContexts}
          colors={mockColors}
          colorScheme="dark"
          allCollections={{}}
          expandedChecklistIds={{}}
          setExpandedChecklistIds={mockSetExpandedChecklistIds}
          router={mockRouter}
          completeTodoFromDashboard={mockCompleteTodo}
          completeHabitFromDashboard={mockCompleteHabit}
          toggleChecklistItemFromDashboard={mockToggleChecklistItem}
        />
      );
    });

    const root = renderer.root;
    // The header itself is the single navigation affordance (no arrow button)
    const header = root.findAll(
      (n: any) =>
        typeof n.props?.accessibilityLabel === "string" &&
        n.props.accessibilityLabel.startsWith("Open Work Projects") &&
        typeof n.props.onPress === "function",
    )[0];
    expect(header).toBeDefined();

    act(() => {
      header.props.onPress();
    });

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: "/tasks",
      params: { workspaceId: "ws-work" },
    });
  });

  it("toggles collapse state when header toggle is pressed", () => {
    const activeContexts = [
      {
        folder: sampleWorkspace,
        tasks: [sampleTasks[0]],
        habits: [],
        checklists: [],
        totalCount: 1,
      },
    ];

    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceSectionedStream
          activeContexts={activeContexts}
          colors={mockColors}
          colorScheme="dark"
          allCollections={{}}
          expandedChecklistIds={{}}
          setExpandedChecklistIds={mockSetExpandedChecklistIds}
          router={mockRouter}
          completeTodoFromDashboard={mockCompleteTodo}
          completeHabitFromDashboard={mockCompleteHabit}
          toggleChecklistItemFromDashboard={mockToggleChecklistItem}
        />
      );
    });

    const root = renderer.root;
    // Initially task title is visible
    let texts = root.findAllByType("Text" as any).map((n: any) => n.props.children);
    expect(texts.flat().join(" ")).toContain("Review quarterly deck");

    // Click collapse chevron
    const chevronIcon = root.findByProps({ name: "chevron-up" });
    let current: any = chevronIcon;
    while (current && typeof current.props.onPress !== "function") {
      current = current.parent;
    }
    act(() => {
      current.props.onPress();
    });

    // Now task title should be hidden while workspace title remains
    texts = root.findAllByType("Text" as any).map((n: any) => n.props.children);
    expect(texts.flat().join(" ")).not.toContain("Review quarterly deck");
    expect(texts.flat().join(" ")).toContain("Work Projects");
  });

  it("surfaces workspace resources as visible tiles and opens them on press", () => {
    const activeContexts = [
      {
        folder: sampleWorkspace,
        tasks: [sampleTasks[0]],
        habits: [],
        checklists: [],
        totalCount: 1,
      },
    ];

    const sampleResources = [
      {
        id: "res-doc-1",
        title: "Q3 Strategy Document",
        type: "note",
        content: "Drafting the Q3 goals for team review.",
        workspaceId: "ws-work",
      },
    ];

    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceSectionedStream
          activeContexts={activeContexts}
          colors={mockColors}
          colorScheme="dark"
          allCollections={{ "ws-work": sampleResources }}
          expandedChecklistIds={{}}
          setExpandedChecklistIds={mockSetExpandedChecklistIds}
          router={mockRouter}
          completeTodoFromDashboard={mockCompleteTodo}
          completeHabitFromDashboard={mockCompleteHabit}
          toggleChecklistItemFromDashboard={mockToggleChecklistItem}
        />
      );
    });

    const root = renderer.root;

    // Resources are content-forward now: a visible strip, not a hidden toggle
    let texts = root.findAllByType("Text" as any).map((n: any) => n.props.children);
    expect(texts.flat().join(" ")).toContain("Resources");

    const resTile = root.findAll(
      (n: any) =>
        typeof n.props?.accessibilityLabel === "string" &&
        n.props.accessibilityLabel.startsWith("Resource Q3 Strategy Document") &&
        typeof n.props.onPress === "function",
    )[0];
    expect(resTile).toBeDefined();

    act(() => {
      resTile.props.onPress();
    });

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: "/tasks",
      params: {
        workspaceId: "ws-work",
        segment: "resources",
        resourceId: "res-doc-1",
      },
    });

    // The strip stays visible — it is not a collapse toggle
    texts = root.findAllByType("Text" as any).map((n: any) => n.props.children);
    expect(texts.flat().join(" ")).toContain("Resources");
  });

  it("renders distinct secondary metadata without redundant text badges", () => {
    const testChecklists: Checklist[] = [
      {
        id: "cl-clean",
        title: "Sprint Release Items",
        workspaceId: "ws-work",
        items: [
          { id: "sub-1", title: "Bump package version", completed: false },
          { id: "sub-2", title: "Deploy to staging", completed: true },
        ],
        createdAt: 1000,
        updatedAt: 1000,
      } as any,
    ];

    const activeContexts = [
      {
        folder: sampleWorkspace,
        tasks: [sampleTasks[0]], // high priority task
        habits: [sampleHabits[0]], // habit with streak
        checklists: testChecklists,
        totalCount: 3,
      },
    ];

    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceSectionedStream
          activeContexts={activeContexts}
          colors={mockColors}
          colorScheme="dark"
          allCollections={{}}
          expandedChecklistIds={{}}
          setExpandedChecklistIds={mockSetExpandedChecklistIds}
          router={mockRouter}
          completeTodoFromDashboard={mockCompleteTodo}
          completeHabitFromDashboard={mockCompleteHabit}
          toggleChecklistItemFromDashboard={mockToggleChecklistItem}
        />
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((n: any) => n.props.children);
    const joined = texts.flat().join(" ");

    // Redundant text badges must NOT be rendered
    expect(joined).not.toContain("High");
    expect(joined).not.toContain("Med");
    expect(joined).not.toContain("Habit");
    expect(joined).not.toContain("Checklist");
    expect(joined).not.toContain("Resource");

    // Clean secondary state and context is rendered
    expect(joined).toContain("Review quarterly deck");
    expect(joined).toContain("Today");
    expect(joined).toContain("Inbox Zero morning sweep");
    expect(joined).toContain("🔥 0");
    expect(joined).toContain("Sprint Release Items");
    expect(joined).toContain("1 item left");
    expect(joined).toContain("1/2");
  });

  it("tapping an item row does not trigger workspace card collapse", () => {
    const activeContexts = [
      {
        folder: sampleWorkspace,
        tasks: [sampleTasks[0]],
        habits: [],
        checklists: [],
        totalCount: 1,
      },
    ];

    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceSectionedStream
          activeContexts={activeContexts}
          colors={mockColors}
          colorScheme="dark"
          allCollections={{}}
          expandedChecklistIds={{}}
          setExpandedChecklistIds={mockSetExpandedChecklistIds}
          router={mockRouter}
          completeTodoFromDashboard={mockCompleteTodo}
          completeHabitFromDashboard={mockCompleteHabit}
          toggleChecklistItemFromDashboard={mockToggleChecklistItem}
        />
      );
    });

    const root = renderer.root;
    const taskTitleNode = root.findAllByType("Text" as any).find((n: any) => n.props.children === "Review quarterly deck");
    let rowPressable: any = taskTitleNode;
    while (rowPressable && typeof rowPressable.props.onPress !== "function") {
      rowPressable = rowPressable.parent;
    }

    act(() => {
      rowPressable.props.onPress();
    });

    // Task details was opened
    expect(mockRouter.push).toHaveBeenCalled();

    // Card should still be expanded and showing task title
    const texts = root.findAllByType("Text" as any).map((n: any) => n.props.children);
    expect(texts.flat().join(" ")).toContain("Review quarterly deck");
  });

  it("tapping checkbox completes item without navigating", () => {
    const activeContexts = [
      {
        folder: sampleWorkspace,
        tasks: [sampleTasks[0]],
        habits: [],
        checklists: [],
        totalCount: 1,
      },
    ];

    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceSectionedStream
          activeContexts={activeContexts}
          colors={mockColors}
          colorScheme="dark"
          allCollections={{}}
          expandedChecklistIds={{}}
          setExpandedChecklistIds={mockSetExpandedChecklistIds}
          router={mockRouter}
          completeTodoFromDashboard={mockCompleteTodo}
          completeHabitFromDashboard={mockCompleteHabit}
          toggleChecklistItemFromDashboard={mockToggleChecklistItem}
        />
      );
    });

    const root = renderer.root;
    const checkbox = root.findByProps({ accessibilityRole: "checkbox" });
    act(() => {
      checkbox.props.onPress();
    });

    expect(mockCompleteTodo).toHaveBeenCalledWith("task-1", undefined, "ws-work");
  });

  it("Single-workspace Today view: unchecking a completed task calls completeTodoFromDashboard with workspace id", () => {
    const completedTask: Task = {
      ...sampleTasks[0],
      id: "task-completed-1",
      completed: true,
      status: "completed",
    } as any;

    const activeContexts = [
      {
        folder: sampleWorkspace,
        tasks: [completedTask],
        habits: [],
        checklists: [],
        totalCount: 1,
      },
    ];

    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceSectionedStream
          activeContexts={activeContexts}
          colors={mockColors}
          colorScheme="dark"
          allCollections={{}}
          expandedChecklistIds={{}}
          setExpandedChecklistIds={mockSetExpandedChecklistIds}
          router={mockRouter}
          completeTodoFromDashboard={mockCompleteTodo}
          completeHabitFromDashboard={mockCompleteHabit}
          toggleChecklistItemFromDashboard={mockToggleChecklistItem}
        />
      );
    });

    const root = renderer.root;
    const checkbox = root.findByProps({ accessibilityRole: "checkbox" });
    act(() => {
      checkbox.props.onPress();
    });

    expect(mockCompleteTodo).toHaveBeenCalledWith("task-completed-1", undefined, "ws-work");
  });

  it("Single-workspace Today view: checking and unchecking a habit calls completeHabitFromDashboard with workspace id", () => {
    const habit: Habit = {
      ...sampleHabits[0],
      id: "habit-1",
    };

    const activeContexts = [
      {
        folder: sampleWorkspace,
        tasks: [],
        habits: [habit],
        checklists: [],
        totalCount: 1,
      },
    ];

    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceSectionedStream
          activeContexts={activeContexts}
          colors={mockColors}
          colorScheme="dark"
          allCollections={{}}
          expandedChecklistIds={{}}
          setExpandedChecklistIds={mockSetExpandedChecklistIds}
          router={mockRouter}
          completeTodoFromDashboard={mockCompleteTodo}
          completeHabitFromDashboard={mockCompleteHabit}
          toggleChecklistItemFromDashboard={mockToggleChecklistItem}
        />
      );
    });

    const root = renderer.root;
    const checkbox = root.findByProps({ accessibilityRole: "checkbox" });
    act(() => {
      checkbox.props.onPress();
    });

    expect(mockCompleteHabit).toHaveBeenCalledWith("habit-1", undefined, "ws-work");
  });

  it("renders Workspace Rail when multiple workspaces are active and allows filtering", () => {
    const secondWorkspace: Workspace = {
      id: "ws-personal",
      name: "Personal Life",
      emoji: "🌱",
      color: "#10B981",
      order: 1,
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    const personalTask: Task = {
      id: "task-p1",
      title: "Buy groceries for dinner",
      completed: false,
      priority: "medium",
      workspaceId: "ws-personal",
      createdAt: 1000,
      updatedAt: 1000,
    } as any;

    const multiContexts = [
      {
        folder: sampleWorkspace,
        tasks: [sampleTasks[0]],
        habits: [],
        checklists: [],
        totalCount: 1,
      },
      {
        folder: secondWorkspace,
        tasks: [personalTask],
        habits: [],
        checklists: [],
        totalCount: 1,
      },
    ];

    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceSectionedStream
          activeContexts={multiContexts}
          colors={mockColors}
          colorScheme="dark"
          allCollections={{}}
          expandedChecklistIds={{}}
          setExpandedChecklistIds={mockSetExpandedChecklistIds}
          router={mockRouter}
          completeTodoFromDashboard={mockCompleteTodo}
          completeHabitFromDashboard={mockCompleteHabit}
          toggleChecklistItemFromDashboard={mockToggleChecklistItem}
        />
      );
    });

    const root = renderer.root;

    // "All Today" and both workspaces are visible in the rail
    let texts = root.findAllByType("Text" as any).map((n: any) => n.props.children).flat().join(" ");
    expect(texts).toContain("All");
    expect(texts).toContain("Work Projects");
    expect(texts).toContain("Personal Life");
    expect(texts).toContain("Review quarterly deck");
    expect(texts).toContain("Buy groceries for dinner");

    // Find the Personal Life tile in the rail and tap it
    const personalRailTile = root.findByProps({
      accessibilityLabel: "Filter by Personal Life, 1 items",
    });
    act(() => {
      personalRailTile.props.onPress();
    });

    // Stream should now be filtered to only Personal Life
    texts = root.findAllByType("Text" as any).map((n: any) => n.props.children).flat().join(" ");
    expect(texts).toContain("Buy groceries for dinner");
    expect(texts).not.toContain("Review quarterly deck");

    // Tap "All Today" to restore both
    const allRailTile = root.findByProps({
      accessibilityLabel: "All workspaces, 2 items",
    });
    act(() => {
      allRailTile.props.onPress();
    });

    texts = root.findAllByType("Text" as any).map((n: any) => n.props.children).flat().join(" ");
    expect(texts).toContain("Review quarterly deck");
    expect(texts).toContain("Buy groceries for dinner");
  });
});

describe("WorkspaceItemRow Component", () => {
  /**
   * The priority stripe is the only node whose style carries the resolved
   * priority hue. Collect every backgroundColor rendered in the tree so the
   * test does not depend on the internal style ordering.
   */
  const collectBackgroundColors = (root: any): string[] => {
    const colors: string[] = [];
    root.findAll((node: any) => Boolean(node.props?.style)).forEach((node: any) => {
      const style = Array.isArray(node.props.style) ? node.props.style : [node.props.style];
      style.forEach((entry: any) => {
        if (entry && typeof entry === "object" && typeof entry.backgroundColor === "string") {
          colors.push(entry.backgroundColor);
        }
      });
    });
    return colors;
  };

  const renderPriorityRow = (priority: "high" | "medium" | "low", colorScheme: "light" | "dark") => {
    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceItemRow
          type="task"
          id="task-priority"
          title="Ship the migration"
          subtitle="Today"
          priority={priority}
          accentColor="#3B82F6"
          colors={Colors[colorScheme]}
          colorScheme={colorScheme}
        />
      );
    });
    return renderer;
  };

  it.each(["light", "dark"] as const)(
    "resolves the priority stripe from the active %s scheme",
    (scheme) => {
      (["high", "medium", "low"] as const).forEach((priority) => {
        const colors = collectBackgroundColors(renderPriorityRow(priority, scheme).root);
        const expected = PriorityColors[priority][scheme];
        expect(colors).toContain(expected);
      });
    },
  );

  it("renders no priority stripe for a task without a priority", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceItemRow
          type="task"
          id="task-priority-none"
          title="No priority"
          subtitle="Today"
          accentColor="#3B82F6"
          colors={Colors.dark}
          colorScheme="dark"
        />
      );
    });

    const rendered = collectBackgroundColors(renderer.root);
    (["high", "medium", "low"] as const).forEach((priority) => {
      expect(rendered).not.toContain(PriorityColors[priority].dark);
    });
  });

  it("renders a task row with two-line layout and reminder icon without priority text badge", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceItemRow
          type="task"
          id="task-custom"
          title="Read"
          subtitle="Today · 8:34 AM"
          priority="medium"
          hasReminder={true}
          accentColor="#3B82F6"
          colors={Colors.dark}
          colorScheme="dark"
        />
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((n: any) => n.props.children).flat().join(" ");
    expect(texts).toContain("Read");
    expect(texts).toContain("Today · 8:34 AM");
    // Priority text badge is removed
    expect(texts).not.toContain("Med");
    expect(texts).not.toContain("High");

    // Bell icon is present for reminder
    const bellIcon = root.findByProps({ name: "bell" });
    expect(bellIcon).toBeDefined();
  });

  it("renders a habit row with streak chip and no redundant text badge", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceItemRow
          type="habit"
          id="habit-custom"
          title="Gym"
          subtitle="Every morning"
          streak={0}
          accentColor="#10B981"
          colors={Colors.dark}
          colorScheme="dark"
        />
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((n: any) => n.props.children).flat().join(" ");
    expect(texts).toContain("Gym");
    expect(texts).toContain("Every morning");
    expect(texts).toContain("🔥 0");
    // No redundant Habit text badge
    expect(texts).not.toContain("Habit");
  });

  it("renders a checklist row with progress count and children when expanded", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceItemRow
          type="checklist"
          id="cl-custom"
          title="Shopping"
          subtitle="2 items left"
          checklistProgress={{ completedCount: 0, totalCount: 2 }}
          isExpanded={true}
          accentColor="#8B5CF6"
          colors={Colors.dark}
          colorScheme="dark"
        >
          <Text>Subitem: Milk</Text>
        </WorkspaceItemRow>
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((n: any) => n.props.children).flat().join(" ");
    expect(texts).toContain("Shopping");
    expect(texts).toContain("2 items left");
    expect(texts).toContain("0/2");
    expect(texts).toContain("Subitem: Milk");
    expect(texts).not.toContain("Checklist");
  });

  it("renders an image resource row with actual image thumbnail when URI is available", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceItemRow
          type="resource"
          id="res-img-1"
          title="aerogrid.png"
          subtitle="Image · 1 attachment"
          resourceVisual={{
            category: "image",
            label: "Image",
            thumbnailUri: "file:///data/user/0/pebble/aerogrid.png",
            attachmentCount: 1,
          }}
          accentColor="#0EA5E9"
          colors={Colors.dark}
          colorScheme="dark"
        />
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((n: any) => n.props.children).flat().join(" ");
    expect(texts).toContain("aerogrid.png");
    expect(texts).toContain("Image · 1 attachment");
    expect(texts).not.toContain("Resource");
    expect(texts).not.toContain("Note");

    // Check that ExpoImage is rendered with thumbnail URI
    const img = root.findByProps({ contentFit: "cover" });
    expect(img).toBeDefined();
    expect(JSON.stringify(img.props.source)).toContain("aerogrid.png");
  });

  it("renders a PDF resource row with PDF icon and correct subtitle", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceItemRow
          type="resource"
          id="res-pdf-1"
          title="Q3 planning doc"
          subtitle="PDF · 1 attachment"
          resourceVisual={{
            category: "pdf",
            label: "PDF",
            attachmentCount: 1,
          }}
          accentColor="#0EA5E9"
          colors={Colors.dark}
          colorScheme="dark"
        />
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((n: any) => n.props.children).flat().join(" ");
    expect(texts).toContain("Q3 planning doc");
    expect(texts).toContain("PDF · 1 attachment");
    expect(texts).not.toContain("Resource");
    expect(texts).not.toContain("Note");

    const pdfIcon = root.findByProps({ name: "file-text" });
    expect(pdfIcon).toBeDefined();
  });

  it("renders a row with category symbol badge and structured secondary meta row (max 3 items)", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceItemRow
          type="task"
          id="task-symbol-meta"
          title="Prepare keynote presentation"
          categorySymbol={{
            icon: "briefcase",
            color: "#3B82F6",
            tint: "rgba(59, 130, 246, 0.16)",
          }}
          metaParts={[
            { text: "Work Projects", icon: "folder", color: "#3B82F6" },
            { text: "Today · 10:00 AM" },
            { text: "Daily" },
            { text: "Extra Fourth Item Should Be Dropped" },
          ]}
          priority="high"
          accentColor="#3B82F6"
          colors={Colors.dark}
          colorScheme="dark"
        />
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((n: any) => n.props.children).flat().join(" ");

    // Verify title and secondary line contents
    expect(texts).toContain("Prepare keynote presentation");
    expect(texts).toContain("Work Projects");
    expect(texts).toContain("Today · 10:00 AM");
    expect(texts).toContain("Daily");
    // Fourth item must be dropped (max 3 items)
    expect(texts).not.toContain("Extra Fourth Item Should Be Dropped");

    // Dot separator should be present between parts
    expect(texts).toContain(" · ");

    // Category symbol icon should be rendered
    const briefcaseIcon = root.findByProps({ name: "briefcase" });
    expect(briefcaseIcon).toBeDefined();
  });
});

describe("resolveItemCategorySymbol Helper", () => {
  it("resolves category symbols correctly for various entity types", () => {
    // 1. Task with explicit health category
    const healthSymbol = resolveItemCategorySymbol(
      { type: "task", categoryId: "health" },
      true,
    );
    expect(healthSymbol.icon).toBe("activity");

    // 2. Task with explicit finance category
    const financeSymbol = resolveItemCategorySymbol(
      { type: "task", categoryId: "finance" },
      true,
    );
    expect(financeSymbol.icon).toBe("wallet");

    // 3. Default task category fallback
    const defaultTaskSymbol = resolveItemCategorySymbol(
      { type: "task" },
      true,
    );
    expect(defaultTaskSymbol.icon).toBe("briefcase");

    // 4. Habit entity
    const habitSymbol = resolveItemCategorySymbol(
      { type: "habit" },
      true,
    );
    expect(habitSymbol.icon).toBe("activity");

    // 5. Checklist entity
    const checklistSymbol = resolveItemCategorySymbol(
      { type: "checklist" },
      true,
    );
    expect(checklistSymbol.icon).toBe("check-square");

    // 6. Resource entity
    const resourceSymbol = resolveItemCategorySymbol(
      { type: "resource" },
      true,
    );
    expect(resourceSymbol.icon).toBe("file-text");
  });
});

describe("WorkspaceSectionedStream folder drawer", () => {
  const mockColors = Colors.dark;
  const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  } as any;

  const makeWorkspace = (index: number): Workspace => ({
    id: `ws-${index}`,
    name: `Workspace ${index}`,
    emoji: "📁",
    color: "#3B82F6",
    order: index,
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  });

  const makeTask = (workspaceId: string, index: number): Task =>
    ({
      id: `${workspaceId}-task-${index}`,
      title: `${workspaceId} task ${index}`,
      completed: false,
      priority: "none",
      workspaceId,
      createdAt: 1000,
      updatedAt: 1000,
    }) as any;

  const buildContexts = (count: number, tasksPerWorkspace: number) =>
    Array.from({ length: count }, (_, i) => ({
      folder: makeWorkspace(i),
      tasks: Array.from({ length: tasksPerWorkspace }, (_, t) =>
        makeTask(`ws-${i}`, t),
      ),
      habits: [],
      checklists: [],
      totalCount: tasksPerWorkspace,
    }));

  const element = (activeContexts: any[]) => (
    <WorkspaceSectionedStream
      activeContexts={activeContexts}
      colors={mockColors}
      colorScheme="dark"
      allCollections={{}}
      expandedChecklistIds={{}}
      setExpandedChecklistIds={jest.fn()}
      router={mockRouter}
      completeTodoFromDashboard={jest.fn().mockResolvedValue(undefined)}
      completeHabitFromDashboard={jest.fn().mockResolvedValue(undefined)}
      toggleChecklistItemFromDashboard={jest.fn().mockResolvedValue(undefined)}
    />
  );

  const renderStream = (activeContexts: any[]) => {
    let renderer: any;
    act(() => {
      renderer = create(element(activeContexts));
    });
    return {
      root: renderer.root,
      update: (next: any[]) => {
        act(() => {
          renderer.update(element(next));
        });
        return renderer.root;
      },
    };
  };

  const joinedText = (root: any) =>
    root
      .findAllByType("Text" as any)
      .map((n: any) => n.props.children)
      .flat()
      .join(" ");

  const labelsWithState = (root: any): string[] => {
    const raw: string[] = root
      .findAll((n: any) => n.props?.accessibilityState)
      .map((n: any) => n.props.accessibilityLabel)
      .filter((label: any) => typeof label === "string");
    return Array.from(new Set(raw));
  };

  const pressTab = (root: any, label: string) => {
    const tab = root.findAll(
      (n: any) =>
        n.props?.accessibilityLabel === label &&
        typeof n.props.onPress === "function",
    )[0];
    expect(tab).toBeDefined();
    act(() => {
      tab.props.onPress();
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("opens exactly one drawer even with 12 workspaces", () => {
    const root = renderStream(buildContexts(12, 1)).root;

    // One drawer, holding every workspace's item under a single ordering.
    expect(root.findAllByType(ProgressRing)).toHaveLength(1);
    expect(root.findAllByType(WorkspaceItemRow)).toHaveLength(12);
  });

  it("renders one tab per workspace plus the All tab", () => {
    const root = renderStream(buildContexts(12, 1)).root;
    const labels = labelsWithState(root);

    expect(labels.filter((l) => l.startsWith("Filter by "))).toHaveLength(12);
    expect(labels).toContain("Filter by Workspace 11, 1 items");
    expect(labels).toContain("All workspaces, 12 items");
  });

  it("swaps the open drawer when another tab is selected", () => {
    const stream = renderStream(buildContexts(3, 1));
    let root = stream.root;

    // All drawer spans every workspace.
    expect(joinedText(root)).toContain("ws-0 task 0");
    expect(joinedText(root)).toContain("ws-2 task 0");

    pressTab(root, "Filter by Workspace 1, 1 items");
    root = stream.root;

    // Only that workspace's drawer is open, and the tabs remain to switch back.
    expect(joinedText(root)).not.toContain("ws-0 task 0");
    expect(joinedText(root)).toContain("ws-1 task 0");
    expect(labelsWithState(root)).toContain("All workspaces, 3 items");
  });

  it("falls back to the All drawer when the open workspace is filtered away", () => {
    const stream = renderStream(buildContexts(3, 1));
    pressTab(stream.root, "Filter by Workspace 1, 1 items");

    // Workspace 1 disappears (a Today filter removed it).
    const remaining = [buildContexts(3, 1)[0], buildContexts(3, 1)[2]];
    const root = stream.update(remaining);

    const allTab = root.findAll(
      (n: any) =>
        typeof n.props?.accessibilityLabel === "string" &&
        n.props.accessibilityLabel.startsWith("All workspaces,") &&
        n.props.accessibilityState,
    )[0];
    expect(allTab.props.accessibilityState.selected).toBe(true);

    expect(root.findAllByType(ProgressRing)).toHaveLength(1);
    expect(joinedText(root)).toContain("ws-0 task 0");
    expect(joinedText(root)).toContain("ws-2 task 0");
    expect(joinedText(root)).not.toContain("ws-1 task 0");
  });

  it("caps the All drawer at 12 rows and offers a gateway for the rest", () => {
    const root = renderStream(buildContexts(2, 9)).root;

    expect(root.findAllByType(WorkspaceItemRow)).toHaveLength(12);
    expect(joinedText(root)).toContain("+6 more in All");
  });

  it("keeps the All drawer's rows labelled with their workspace", () => {
    const root = renderStream(buildContexts(3, 1)).root;

    expect(joinedText(root)).toContain("Workspace 0");
    expect(joinedText(root)).toContain("Workspace 2");
  });

  it("All-workspaces Today view: task checkboxes complete with their owning workspace IDs, not __all_workspaces__", () => {
    const mockCompleteTodo = jest.fn().mockResolvedValue(undefined);
    const mockCompleteHabit = jest.fn().mockResolvedValue(undefined);
    const mockToggleChecklist = jest.fn().mockResolvedValue(undefined);

    const contexts = [
      {
        folder: makeWorkspace(0),
        tasks: [makeTask("ws-0", 0)],
        habits: [],
        checklists: [],
        totalCount: 1,
      },
      {
        folder: makeWorkspace(1),
        tasks: [makeTask("ws-1", 0)],
        habits: [],
        checklists: [],
        totalCount: 1,
      },
    ];

    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceSectionedStream
          activeContexts={contexts}
          colors={mockColors}
          colorScheme="dark"
          allCollections={{}}
          expandedChecklistIds={{}}
          setExpandedChecklistIds={jest.fn()}
          router={mockRouter}
          completeTodoFromDashboard={mockCompleteTodo}
          completeHabitFromDashboard={mockCompleteHabit}
          toggleChecklistItemFromDashboard={mockToggleChecklist}
        />
      );
    });

    const root = renderer.root;
    const taskCheckbox0 = root.findByProps({ accessibilityLabel: "Mark task ws-0 task 0 as complete" });
    const taskCheckbox1 = root.findByProps({ accessibilityLabel: "Mark task ws-1 task 0 as complete" });

    act(() => {
      taskCheckbox0.props.onPress();
    });
    expect(mockCompleteTodo).toHaveBeenCalledWith("ws-0-task-0", undefined, "ws-0");
    expect(mockCompleteTodo).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), "__all_workspaces__");

    act(() => {
      taskCheckbox1.props.onPress();
    });
    expect(mockCompleteTodo).toHaveBeenCalledWith("ws-1-task-0", undefined, "ws-1");
    expect(mockCompleteTodo).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), "__all_workspaces__");
  });

  it("All-workspaces Today view: habit checkboxes complete with their owning workspace IDs, not __all_workspaces__", () => {
    const mockCompleteHabit = jest.fn().mockResolvedValue(undefined);

    const makeHabitItem = (wsId: string, index: number): Habit => ({
      id: `habit-${wsId}-${index}`,
      title: `Habit ${wsId} ${index}`,
      workspaceId: wsId,
      frequency: "daily",
      completionHistory: [],
      createdAt: 1000,
      updatedAt: 1000,
      revision: 1,
      lifecycleGeneration: 1,
    } as any);

    const contexts = [
      {
        folder: makeWorkspace(0),
        tasks: [],
        habits: [makeHabitItem("ws-0", 0)],
        checklists: [],
        totalCount: 1,
      },
      {
        folder: makeWorkspace(1),
        tasks: [],
        habits: [makeHabitItem("ws-1", 0)],
        checklists: [],
        totalCount: 1,
      },
    ];

    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceSectionedStream
          activeContexts={contexts}
          colors={mockColors}
          colorScheme="dark"
          allCollections={{}}
          expandedChecklistIds={{}}
          setExpandedChecklistIds={jest.fn()}
          router={mockRouter}
          completeTodoFromDashboard={jest.fn().mockResolvedValue(undefined)}
          completeHabitFromDashboard={mockCompleteHabit}
          toggleChecklistItemFromDashboard={jest.fn().mockResolvedValue(undefined)}
        />
      );
    });

    const root = renderer.root;
    const habitCheckbox0 = root.findByProps({ accessibilityLabel: "Mark habit Habit ws-0 0 as complete" });
    const habitCheckbox1 = root.findByProps({ accessibilityLabel: "Mark habit Habit ws-1 0 as complete" });

    act(() => {
      habitCheckbox0.props.onPress();
    });
    expect(mockCompleteHabit).toHaveBeenCalledWith("habit-ws-0-0", undefined, "ws-0");
    expect(mockCompleteHabit).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), "__all_workspaces__");

    act(() => {
      habitCheckbox1.props.onPress();
    });
    expect(mockCompleteHabit).toHaveBeenCalledWith("habit-ws-1-0", undefined, "ws-1");
    expect(mockCompleteHabit).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), "__all_workspaces__");
  });

  it("All-workspaces Today view: checklist sub-item toggle passes the item's owning workspace ID, not __all_workspaces__", () => {
    const mockToggleChecklistItem = jest.fn().mockResolvedValue(undefined);

    const checklistA: Checklist = {
      id: "cl-ws-0",
      title: "Checklist A",
      workspaceId: "ws-0",
      items: [{ id: "sub-1", title: "Sub 1", completed: false, order: 0 }],
      createdAt: 1000,
      updatedAt: 1000,
      revision: 1,
      lifecycleGeneration: 1,
    } as any;

    const contexts = [
      {
        folder: makeWorkspace(0),
        tasks: [],
        habits: [],
        checklists: [checklistA],
        totalCount: 1,
      },
      {
        folder: makeWorkspace(1),
        tasks: [],
        habits: [],
        checklists: [],
        totalCount: 0,
      },
    ];

    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceSectionedStream
          activeContexts={contexts}
          colors={mockColors}
          colorScheme="dark"
          allCollections={{}}
          expandedChecklistIds={{ "cl-ws-0": true }}
          setExpandedChecklistIds={jest.fn()}
          router={mockRouter}
          completeTodoFromDashboard={jest.fn().mockResolvedValue(undefined)}
          completeHabitFromDashboard={jest.fn().mockResolvedValue(undefined)}
          toggleChecklistItemFromDashboard={mockToggleChecklistItem}
        />
      );
    });

    const root = renderer.root;
    const subCheckbox = root.findByProps({
      accessibilityLabel: "Checklist item Sub 1",
    });
    expect(subCheckbox).toBeDefined();

    act(() => {
      subCheckbox.props.onPress();
    });

    expect(mockToggleChecklistItem).toHaveBeenCalledWith("cl-ws-0", "sub-1", "ws-0");
    expect(mockToggleChecklistItem).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), "__all_workspaces__");
  });
});

describe("getTabScrollTarget", () => {
  it("centres a tab in the viewport", () => {
    // 1000 - 390/2 + 80/2
    expect(getTabScrollTarget(1000, 80, 390)).toBe(845);
  });

  it("never scrolls past the start of the strip", () => {
    expect(getTabScrollTarget(0, 80, 390)).toBe(0);
    expect(getTabScrollTarget(40, 80, 390)).toBe(0);
  });
});

