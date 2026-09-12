import React from "react";
import { act, create } from "react-test-renderer";
import { TactileFolderCard } from "../TactileFolderCard";
import type { Workspace, Task } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
}));

describe("TactileFolderCard Component", () => {
  const mockSelectWorkspace = jest.fn();
  const mockEditWorkspace = jest.fn();

  const sampleWorkspace: Workspace = {
    id: "ws-may",
    name: "May",
    emoji: "📁",
    color: "#3B5BDB",
    order: 0,
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  const sampleTasks: Task[] = [
    {
      id: "task-1",
      title: "Water plant",
      completed: false,
      priority: "high",
      workspaceId: "ws-may",
      createdAt: 1000,
      updatedAt: 1000,
    } as any,
    {
      id: "task-2",
      title: "Review PRs",
      completed: false,
      priority: "medium",
      workspaceId: "ws-may",
      createdAt: 1000,
      updatedAt: 1000,
    } as any,
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders workspace title, total count, and inventory quantity chips", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <TactileFolderCard
          workspace={sampleWorkspace}
          tasks={sampleTasks}
          habitCount={1}
          checklistCount={0}
          resourceCount={2}
          onSelectWorkspace={mockSelectWorkspace}
          onEditWorkspace={mockEditWorkspace}
        />
      );
    });

    const root = renderer.root;
    const textNodes = root.findAllByType("Text" as any);
    const texts = textNodes.map((n: any) =>
      Array.isArray(n.props.children) ? n.props.children.join("") : String(n.props.children ?? "")
    );

    // Workspace Title & total count subtitle
    expect(texts).toContain("May");
    expect(texts).toContain("5 items");

    // Inventory breakdown: 2 Tasks, 1 Habit, 2 Docs
    expect(texts.some((t: string) => t.includes("2 Tasks"))).toBe(true);
    expect(texts.some((t: string) => t.includes("1 Habit"))).toBe(true);
    expect(texts.some((t: string) => t.includes("2 Docs"))).toBe(true);
  });

  it("renders friendly empty state when workspace has 0 items", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <TactileFolderCard
          workspace={sampleWorkspace}
          tasks={[]}
          habitCount={0}
          checklistCount={0}
          resourceCount={0}
          onSelectWorkspace={mockSelectWorkspace}
          onEditWorkspace={mockEditWorkspace}
        />
      );
    });

    const root = renderer.root;
    const textNodes = root.findAllByType("Text" as any);
    const texts = textNodes.map((n: any) =>
      Array.isArray(n.props.children) ? n.props.children.join("") : String(n.props.children ?? "")
    );

    expect(texts).toContain("May");
    expect(texts).toContain("0 items");
    expect(texts).toContain("Empty folder");
  });
});
