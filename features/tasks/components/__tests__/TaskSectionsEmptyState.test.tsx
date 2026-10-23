jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

import React from "react";
import { act, create } from "react-test-renderer";
import { TaskSections } from "../TaskSections";
import { WorkspaceEmptyState } from "@/features/workspaces/components/WorkspaceEmptyState";
import { DateScopedSectionHeader } from "@/features/workspaces/components/DateScopedSectionHeader";
import type { Task, Workspace } from "@/shared/types/domain.types";

const mockWorkspaces: Workspace[] = [
  { id: "ws-1", name: "Alpha", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
];

describe("TaskSections Empty State Regression Suite (Phase 1C)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-15T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const upcomingTask: Task = {
    id: "task-upcoming-1",
    workspaceId: "ws-1",
    title: "Upcoming Project Task",
    status: "todo",
    priority: "none",
    schedule: { date: "2026-10-30" },
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
    resourceIds: [],
  };

  const completedTodayTask: Task = {
    id: "task-done-1",
    workspaceId: "ws-1",
    title: "Finished Task",
    status: "completed",
    priority: "none",
    schedule: { date: "2026-10-15" },
    completedAt: 1000,
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
    resourceIds: [],
  };

  it("1. Workspace with 0 tasks renders DateScopedSectionHeader and WorkspaceEmptyState, without redundant quiet empty row", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <TaskSections
          overdueTodos={[]}
          todayTodos={[]}
          upcomingTodos={[]}
          inboxTodos={[]}
          workspaces={mockWorkspaces}
          selectedWorkspaceId="ws-1"
          selectedDate="2026-10-15"
          completedCount={0}
          onClearCompleted={jest.fn()}
          onToggleTodo={jest.fn()}
          onDeleteTodo={jest.fn()}
          onEditTodo={jest.fn()}
          onSetAlarm={jest.fn()}
          allResources={[]}
        />
      );
    });

    const root = renderer.root;

    // Preserves date-navigation header
    const dateHeaders = root.findAllByType(DateScopedSectionHeader);
    expect(dateHeaders.length).toBe(1);

    // Renders single intentional empty state
    const emptyStates = root.findAllByType(WorkspaceEmptyState);
    expect(emptyStates.length).toBe(1);
    expect(emptyStates[0].props.context).toBe("tasks");

    // Must NOT render redundant inline quiet empty text
    const textNodes = root.findAllByType("Text");
    const allText = textNodes.map((n: any) => n.props.children);
    expect(allText).not.toContain("No tasks scheduled for today");
    expect(allText).not.toContain("No tasks scheduled for this day");
  });

  it("2. Workspace with tasks on other days renders DateScopedSectionHeader + quiet row + upcoming, without WorkspaceEmptyState", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <TaskSections
          overdueTodos={[]}
          todayTodos={[]}
          upcomingTodos={[upcomingTask]}
          inboxTodos={[]}
          workspaces={mockWorkspaces}
          selectedWorkspaceId="ws-1"
          selectedDate="2026-10-15"
          completedCount={0}
          onClearCompleted={jest.fn()}
          onToggleTodo={jest.fn()}
          onDeleteTodo={jest.fn()}
          onEditTodo={jest.fn()}
          onSetAlarm={jest.fn()}
          allResources={[]}
        />
      );
    });

    const root = renderer.root;

    // Preserves date header
    const dateHeaders = root.findAllByType(DateScopedSectionHeader);
    expect(dateHeaders.length).toBe(1);

    // Shows section-level quiet empty row since items exist elsewhere
    const textNodes = root.findAllByType("Text");
    const allText = textNodes.map((n: any) => n.props.children);
    expect(
      allText.includes("No tasks scheduled for today") ||
      allText.includes("No tasks scheduled for this day")
    ).toBe(true);

    // Does NOT render WorkspaceEmptyState
    const emptyStates = root.findAllByType(WorkspaceEmptyState);
    expect(emptyStates.length).toBe(0);
  });

  it("3. Workspace where all today's tasks are completed shows completion feedback without WorkspaceEmptyState", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <TaskSections
          overdueTodos={[]}
          todayTodos={[completedTodayTask]}
          upcomingTodos={[]}
          inboxTodos={[]}
          workspaces={mockWorkspaces}
          selectedWorkspaceId="ws-1"
          selectedDate="2026-10-15"
          completedCount={1}
          onClearCompleted={jest.fn()}
          onToggleTodo={jest.fn()}
          onDeleteTodo={jest.fn()}
          onEditTodo={jest.fn()}
          onSetAlarm={jest.fn()}
          allResources={[]}
        />
      );
    });

    const root = renderer.root;

    // Does NOT render WorkspaceEmptyState
    const emptyStates = root.findAllByType(WorkspaceEmptyState);
    expect(emptyStates.length).toBe(0);

    // Shows completion cue
    const textNodes = root.findAllByType("Text");
    const allText = textNodes.map((n: any) => n.props.children);
    expect(allText).toContain("All tasks completed for today");
  });

  it("4. Filtered search yielding 0 tasks renders search empty state without duplicate quiet row", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <TaskSections
          overdueTodos={[]}
          todayTodos={[]}
          upcomingTodos={[]}
          inboxTodos={[]}
          workspaces={mockWorkspaces}
          selectedWorkspaceId="ws-1"
          selectedDate="2026-10-15"
          completedCount={0}
          searchQuery="xyz-nonexistent"
          onClearSearch={jest.fn()}
          onClearCompleted={jest.fn()}
          onToggleTodo={jest.fn()}
          onDeleteTodo={jest.fn()}
          onEditTodo={jest.fn()}
          onSetAlarm={jest.fn()}
          allResources={[]}
        />
      );
    });

    const root = renderer.root;

    // Preserves date header
    const dateHeaders = root.findAllByType(DateScopedSectionHeader);
    expect(dateHeaders.length).toBe(1);

    // Renders search empty state
    const emptyStates = root.findAllByType(WorkspaceEmptyState);
    expect(emptyStates.length).toBe(1);
    expect(emptyStates[0].props.searchQuery).toBe("xyz-nonexistent");

    // No duplicate quiet empty row
    const textNodes = root.findAllByType("Text");
    const allText = textNodes.map((n: any) => n.props.children);
    expect(allText).not.toContain("No tasks scheduled for today");
    expect(allText).not.toContain("No tasks scheduled for this day");
  });
});
