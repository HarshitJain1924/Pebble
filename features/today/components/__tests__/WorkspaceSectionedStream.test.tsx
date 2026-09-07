import React from "react";
import { act, create } from "react-test-renderer";
import { WorkspaceSectionedStream } from "../WorkspaceSectionedStream";
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
});
