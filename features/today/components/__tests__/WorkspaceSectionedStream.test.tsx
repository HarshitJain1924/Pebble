import React from "react";
import { act, create } from "react-test-renderer";
import { WorkspaceSectionedStream, WorkspaceItemRow } from "../WorkspaceSectionedStream";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
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

  it("renders workspace card header with name, emoji, and counts", () => {
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

  it("navigates to workspace when header gateway arrow is pressed", () => {
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
    // Find the arrow-right icon and its pressable parent
    const arrowIcon = root.findByProps({ name: "arrow-right" });
    let current: any = arrowIcon;
    while (current && typeof current.props.onPress !== "function") {
      current = current.parent;
    }
    act(() => {
      current.props.onPress();
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

  it("toggles inline resource section when header paperclip button is pressed", () => {
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

    // Initially resource is not shown inline
    let texts = root.findAllByType("Text" as any).map((n: any) => n.props.children);
    expect(texts.flat().join(" ")).not.toContain("WORKSPACE RESOURCES");
    expect(texts.flat().join(" ")).not.toContain("Q3 Strategy Document");

    // Click resource count pill 📎
    const paperclipText = root.findAllByType("Text" as any).find((n: any) => n.props.children === "📎");
    expect(paperclipText).toBeDefined();

    let current: any = paperclipText;
    while (current && typeof current.props.onPress !== "function") {
      current = current.parent;
    }
    expect(current).toBeDefined();

    act(() => {
      current.props.onPress();
    });

    // Now resource section and items should be visible inline
    texts = root.findAllByType("Text" as any).map((n: any) => n.props.children);
    const joined = texts.flat().join(" ");
    expect(joined).toContain("WORKSPACE RESOURCES (1)");
    expect(joined).toContain("Q3 Strategy Document");
    expect(joined).toContain("Resource");

    // Click the resource item row to test navigation
    const resTitleNode = root.findAllByType("Text" as any).find((n: any) => n.props.children === "Q3 Strategy Document");
    let resPressable: any = resTitleNode;
    while (resPressable && typeof resPressable.props.onPress !== "function") {
      resPressable = resPressable.parent;
    }
    act(() => {
      resPressable.props.onPress();
    });

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: "/tasks",
      params: {
        workspaceId: "ws-work",
        segment: "vault",
        resourceId: "res-doc-1",
      },
    });

    // Click paperclip pill again to collapse resources
    act(() => {
      current.props.onPress();
    });

    texts = root.findAllByType("Text" as any).map((n: any) => n.props.children);
    expect(texts.flat().join(" ")).not.toContain("WORKSPACE RESOURCES");
  });

  it("renders distinct badges and streak counters for habits and tasks", () => {
    const activeContexts = [
      {
        folder: sampleWorkspace,
        tasks: [sampleTasks[0]], // high priority
        habits: [sampleHabits[0]], // habit with streak
        checklists: [sampleChecklists[0]],
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

    // High priority badge on task
    expect(joined).toContain("High");

    // Habit badge and flame streak badge on habit
    expect(joined).toContain("Habit");
    expect(joined).toContain("🔥 0");

    // Checklist badge
    expect(joined).toContain("Checklist");
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
});

describe("WorkspaceItemRow Component", () => {
  it("renders a task row with medium priority and time chip", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceItemRow
          type="task"
          id="task-custom"
          title="Submit report"
          subtitle="Today • 3:00 PM"
          priority="medium"
          timeChip={{ label: "3:00 PM", isOverdue: false }}
          accentColor="#3B82F6"
          colors={Colors.dark}
          colorScheme="dark"
        />
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((n: any) => n.props.children).flat().join(" ");
    expect(texts).toContain("Submit report");
    expect(texts).toContain("Today • 3:00 PM");
    expect(texts).toContain("Med");
    expect(texts).toContain("3:00 PM");
  });

  it("renders a habit row with streak badge and habit badge", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceItemRow
          type="habit"
          id="habit-custom"
          title="Morning Meditation"
          subtitle="Day 8"
          streak={7}
          accentColor="#10B981"
          colors={Colors.dark}
          colorScheme="dark"
        />
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((n: any) => n.props.children).flat().join(" ");
    expect(texts).toContain("Morning Meditation");
    expect(texts).toContain("🔥 7");
    expect(texts).toContain("Habit");
  });

  it("renders a checklist row with checklist badge and children when expanded", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceItemRow
          type="checklist"
          id="cl-custom"
          title="Grocery Run"
          subtitle="1 of 3 items • 2 left"
          isExpanded={true}
          accentColor="#8B5CF6"
          colors={Colors.dark}
          colorScheme="dark"
        >
          <Text>Subitem: Apples</Text>
        </WorkspaceItemRow>
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((n: any) => n.props.children).flat().join(" ");
    expect(texts).toContain("Grocery Run");
    expect(texts).toContain("Checklist");
    expect(texts).toContain("Subitem: Apples");
  });

  it("renders a resource row with resource badge", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <WorkspaceItemRow
          type="resource"
          id="res-custom"
          title="API Reference Manual"
          subtitle="Link • 2 attachments"
          resourceMeta={{ type: "link", attachmentCount: 2 }}
          accentColor="#0EA5E9"
          colors={Colors.dark}
          colorScheme="dark"
        />
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((n: any) => n.props.children).flat().join(" ");
    expect(texts).toContain("API Reference Manual");
    expect(texts).toContain("Link • 2 attachments");
    expect(texts).toContain("Resource");
  });
});


