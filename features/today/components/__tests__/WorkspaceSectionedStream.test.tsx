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
    expect(joined).toContain("Resources · 1");
    expect(joined).toContain("Q3 Strategy Document");
    expect(joined).toContain("Note");

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
    expect(texts.flat().join(" ")).not.toContain("Resources · 1");
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
});

describe("WorkspaceItemRow Component", () => {
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
});



