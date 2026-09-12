import React from "react";
import { create, act } from "react-test-renderer";
import { NowFocusCard } from "../NowFocusCard";
import type { Task, Habit, Checklist } from "@/shared/types/domain.types";
import type { NowFocusResult } from "@/features/today/utils/getNowFocus";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light" },
}));

const mockColors = {
  background: "#0F172A",
  card: "#1E293B",
  surface: "#1E293B",
  border: "rgba(255, 255, 255, 0.1)",
  text: "#F8FAFC",
  textPrimary: "#F8FAFC",
  textMuted: "#94A3B8",
  primary: "#6366F1",
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
} as any;

function getAllText(root: any): string {
  const textNodes = root.findAllByType("Text");
  return textNodes
    .map((n: any) => n.props.children)
    .flat(Infinity)
    .filter(Boolean)
    .join(" ");
}

function mockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    workspaceId: "inbox",
    title: "Finish quarterly report",
    priority: "high",
    status: "todo",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function mockHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "habit-1",
    workspaceId: "inbox",
    title: "Daily Workout",
    revision: 1,
    lifecycleGeneration: 1,
    recurrence: { frequency: "daily", interval: 1 },
    completionHistory: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function mockChecklist(overrides: Partial<Checklist> = {}): Checklist {
  return {
    id: "chk-1",
    workspaceId: "inbox",
    title: "Deployment Checklist",
    revision: 1,
    lifecycleGeneration: 1,
    items: [
      { id: "i1", title: "Build bundle", completed: true },
      { id: "i2", title: "Run migration", completed: true },
      { id: "i3", title: "Smoke tests", completed: false },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

const renderCard = (props: Partial<React.ComponentProps<typeof NowFocusCard>>) =>
  create(
    <NowFocusCard
      focus={{ state: "empty" }}
      colors={mockColors}
      colorScheme="dark"
      {...(props as any)}
    />,
  );

const pressByTestID = (renderer: any, testID: string) => {
  const node = renderer.root.findByProps({ testID });
  act(() => {
    node.props.onPress();
  });
};

describe("NowFocusCard component", () => {
  it("renders an ACTIVE Task as an execution surface: Complete + Focus, with details via card press", () => {
    const focus: NowFocusResult = {
      state: "active",
      type: "task",
      item: mockTask({ title: "Finish project documentation" }),
      timeLabel: "2:00 PM – 3:00 PM",
      durationMinutes: 60,
    };

    const onComplete = jest.fn();
    const onStartFocus = jest.fn();
    const onPressCard = jest.fn();

    let renderer: any;
    act(() => {
      renderer = renderCard({
        focus,
        onComplete,
        onStartFocus,
        onPressCard,
      });
    });

    const text = getAllText(renderer.root);
    expect(text).toContain("NOW");
    expect(text).toContain("Finish project documentation");
    expect(text).toContain("2:00 PM – 3:00 PM");
    expect(text).toContain("High priority");
    // Execution-first: direct completion is primary, focus is secondary.
    expect(text).toContain("Complete");
    expect(text).toContain("Focus on this");
    expect(text).not.toContain("Start");

    // Direct completion reuses the caller's canonical flow.
    pressByTestID(renderer, "now-focus-complete-button");
    expect(onComplete).toHaveBeenCalledWith(focus);
    expect(onStartFocus).not.toHaveBeenCalled();

    // Focus stays available as the secondary execution action.
    pressByTestID(renderer, "now-focus-action-button");
    expect(onStartFocus).toHaveBeenCalledWith(focus);

    // Card/title still opens the details (management) surface.
    const cardPressable = renderer.root.findByProps({
      accessibilityRole: "button",
      accessibilityLabel: "NOW: Finish project documentation",
    });
    act(() => {
      cardPressable.props.onPress();
    });
    expect(onPressCard).toHaveBeenCalledWith(focus);

    // Nested-pressable guard: the action controls are siblings of the details
    // pressable, so a control tap can never be swallowed by card navigation.
    expect(
      cardPressable.findAllByProps({ testID: "now-focus-complete-button" }),
    ).toHaveLength(0);
    expect(
      cardPressable.findAllByProps({ testID: "now-focus-action-button" }),
    ).toHaveLength(0);
  });

  it("renders an ACTIVE Habit with Complete + Focus and streak context", () => {
    const habit = mockHabit({
      title: "Morning workout",
      completionHistory: [
        { date: "2026-09-11", completedAt: 12345 },
        { date: "2026-09-10", completedAt: 12344 },
      ],
    });
    const focus: NowFocusResult = {
      state: "active",
      type: "habit",
      item: habit,
      timeLabel: "7:00 AM – 7:45 AM",
      durationMinutes: 45,
    };

    const onComplete = jest.fn();
    const onStartFocus = jest.fn();

    let renderer: any;
    act(() => {
      renderer = renderCard({ focus, onComplete, onStartFocus });
    });

    const text = getAllText(renderer.root);
    expect(text).toContain("NOW");
    expect(text).toContain("Morning workout");
    expect(text).toContain("7:00 AM – 7:45 AM");
    expect(text).toContain("Habit");
    expect(text).toContain("Complete");
    expect(text).toContain("Focus on this");

    pressByTestID(renderer, "now-focus-complete-button");
    expect(onComplete).toHaveBeenCalledWith(focus);

    pressByTestID(renderer, "now-focus-action-button");
    expect(onStartFocus).toHaveBeenCalledWith(focus);
  });

  it("renders an ACTIVE Checklist with ONLY the next incomplete item + progress, completing inline without details", () => {
    const checklist = mockChecklist();
    const focus: NowFocusResult = {
      state: "active",
      type: "checklist",
      item: checklist,
      timeLabel: "2:00 PM – 3:00 PM",
      durationMinutes: 60,
      checklistState: {
        completedCount: 2,
        total: 3,
        nextItem: { id: "i3", title: "Smoke tests" },
      },
    };

    const onCompleteChecklistItem = jest.fn();
    const onPressCard = jest.fn();
    const onStartFocus = jest.fn();

    let renderer: any;
    act(() => {
      renderer = renderCard({
        focus,
        onCompleteChecklistItem,
        onStartFocus,
        onPressCard,
      });
    });

    const text = getAllText(renderer.root);
    expect(text).toContain("NOW");
    expect(text).toContain("Deployment Checklist");
    expect(text).toContain("2:00 PM – 3:00 PM · Checklist");
    expect(text).toContain("2 / 3 completed");
    // Only the next actionable item is shown — not the whole checklist.
    expect(text).toContain("Smoke tests");
    expect(text).not.toContain("Build bundle");
    expect(text).not.toContain("Run migration");
    expect(text).toContain("Focus on this");
    // Bulk completion of a checklist is not a canonical action.
    expect(
      renderer.root.findAllByProps({ testID: "now-focus-complete-button" }),
    ).toHaveLength(0);

    // The inline checkbox completes exactly that item through the canonical callback.
    pressByTestID(renderer, "now-focus-checklist-item-checkbox");
    expect(onCompleteChecklistItem).toHaveBeenCalledWith(focus, "i3");
    // The user never has to open the details page to tick an item.
    expect(onPressCard).not.toHaveBeenCalled();
    expect(onStartFocus).not.toHaveBeenCalled();

    // Nested-pressable guard: the checkbox is NOT inside the details pressable.
    const detailsPressable = renderer.root.findByProps({
      accessibilityRole: "button",
      accessibilityLabel: "NOW: Deployment Checklist",
    });
    expect(
      detailsPressable.findAllByProps({
        testID: "now-focus-checklist-item-checkbox",
      }),
    ).toHaveLength(0);
    expect(
      detailsPressable.findAllByProps({ testID: "now-focus-action-button" }),
    ).toHaveLength(0);
  });

  it("re-renders the NEXT incomplete checklist item after the first one is completed", () => {
    const onCompleteChecklistItem = jest.fn();

    const initialFocus: NowFocusResult = {
      state: "active",
      type: "checklist",
      item: mockChecklist({
        items: [
          { id: "i1", title: "Build bundle", completed: true },
          { id: "i2", title: "Run migration", completed: true },
          { id: "i3", title: "Smoke tests", completed: false },
          { id: "i4", title: "Deploy", completed: false },
        ],
      }),
      timeLabel: "2:00 PM – 3:00 PM",
      checklistState: {
        completedCount: 2,
        total: 4,
        nextItem: { id: "i3", title: "Smoke tests" },
      },
    };

    let renderer: any;
    act(() => {
      renderer = renderCard({ focus: initialFocus, onCompleteChecklistItem });
    });

    expect(getAllText(renderer.root)).toContain("Smoke tests");
    expect(getAllText(renderer.root)).toContain("2 / 4 completed");

    // Canonical completion updated the checklist — NOW recomputes to the next item.
    const updatedFocus: NowFocusResult = {
      ...initialFocus,
      item: mockChecklist({
        items: [
          { id: "i1", title: "Build bundle", completed: true },
          { id: "i2", title: "Run migration", completed: true },
          { id: "i3", title: "Smoke tests", completed: true },
          { id: "i4", title: "Deploy", completed: false },
        ],
      }),
      checklistState: {
        completedCount: 3,
        total: 4,
        nextItem: { id: "i4", title: "Deploy" },
      },
    };

    act(() => {
      renderer.update(
        <NowFocusCard
          focus={updatedFocus}
          onCompleteChecklistItem={onCompleteChecklistItem}
          colors={mockColors}
          colorScheme="dark"
        />,
      );
    });

    const text = getAllText(renderer.root);
    expect(text).toContain("3 / 4 completed");
    expect(text).toContain("Deploy");
    expect(text).not.toContain("Smoke tests");

    pressByTestID(renderer, "now-focus-checklist-item-checkbox");
    expect(onCompleteChecklistItem).toHaveBeenCalledWith(updatedFocus, "i4");
  });

  it("renders the completed state for a finished checklist (no item, no completion control)", () => {
    const focus: NowFocusResult = {
      state: "active",
      type: "checklist",
      item: mockChecklist({
        items: [
          { id: "i1", title: "Build bundle", completed: true },
          { id: "i2", title: "Run migration", completed: true },
          { id: "i3", title: "Smoke tests", completed: true },
        ],
      }),
      timeLabel: "2:00 PM – 3:00 PM",
      checklistState: { completedCount: 3, total: 3, nextItem: null },
    };

    const onStartFocus = jest.fn();

    let renderer: any;
    act(() => {
      renderer = renderCard({ focus, onStartFocus });
    });

    const text = getAllText(renderer.root);
    expect(text).toContain("3 / 3 completed");
    expect(
      renderer.root.findAllByProps({ testID: "now-focus-checklist-item-checkbox" }),
    ).toHaveLength(0);
    expect(
      renderer.root.findAllByProps({ testID: "now-focus-complete-button" }),
    ).toHaveLength(0);
    expect(text).toContain("Focus on this");
  });

  it("renders RECOMMENDED items with direct completion and free-time context", () => {
    const focus: NowFocusResult = {
      state: "recommended",
      type: "task",
      item: mockTask({ id: "task-rec", title: "Study TypeScript 5.5", priority: "medium" }),
      contextLabel: "~45 min · Fits 2h free time",
      windowMinutes: 120,
      durationMinutes: 45,
    };

    const onComplete = jest.fn();

    let renderer: any;
    act(() => {
      renderer = renderCard({ focus, onComplete });
    });

    const text = getAllText(renderer.root);
    expect(text).toContain("NOW · RECOMMENDED");
    expect(text).toContain("Study TypeScript 5.5");
    expect(text).toContain("Fits 2h free time");
    expect(text).toContain("Complete");
    expect(text).toContain("Focus on this");

    pressByTestID(renderer, "now-focus-complete-button");
    expect(onComplete).toHaveBeenCalledWith(focus);
  });

  it("renders UP NEXT with an inspect-only View action and never starts/complete", () => {
    const focus: NowFocusResult = {
      state: "upcoming",
      type: "task",
      item: mockTask({ id: "task-upcoming", title: "Client presentation" }),
      timeLabel: "Starts at 4:00 PM",
      nextScheduledTime: "4:00 PM",
    };

    const onViewFocus = jest.fn();
    const onStartFocus = jest.fn();
    const onComplete = jest.fn();
    const onPressCard = jest.fn();

    let renderer: any;
    act(() => {
      renderer = renderCard({
        focus,
        onViewFocus,
        onStartFocus,
        onComplete,
        onPressCard,
      });
    });

    const text = getAllText(renderer.root);
    expect(text).toContain("UP NEXT");
    expect(text).toContain("Client presentation");
    expect(text).toContain("Starts at 4:00 PM · Task");
    expect(text).toContain("View details");
    // UP NEXT is not an execution surface.
    expect(text).not.toContain("Complete");
    expect(text).not.toContain("Focus on this");
    expect(text).not.toContain("Start later");

    pressByTestID(renderer, "now-focus-action-button");
    expect(onViewFocus).toHaveBeenCalledWith(focus);
    expect(onStartFocus).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();

    const cardPressable = renderer.root.findByProps({
      accessibilityRole: "button",
      accessibilityLabel: "UP NEXT: Client presentation",
    });
    act(() => {
      cardPressable.props.onPress();
    });
    expect(onViewFocus).toHaveBeenCalledTimes(2);
    expect(onStartFocus).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("exact user scenario: scheduled 3:00 PM task renders complete title, subtitle, and View action", () => {
    const task: Task = {
      id: "task-user-scenario",
      workspaceId: "inbox",
      title: "Test NOW task",
      priority: "medium",
      status: "todo",
      revision: 1,
      lifecycleGeneration: 1,
      schedule: {
        date: "2026-09-12",
        startTime: "15:00",
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const focus: NowFocusResult = {
      state: "upcoming",
      type: "task",
      item: task,
      timeLabel: "Starts at 3:00 PM",
      durationMinutes: 30,
      windowMinutes: 60,
      nextScheduledTime: "3:00 PM",
    };

    const onStartFocus = jest.fn();
    const onViewFocus = jest.fn();
    const onPressCard = jest.fn();

    let renderer: any;
    act(() => {
      renderer = renderCard({
        focus,
        onStartFocus,
        onViewFocus,
        onPressCard,
      });
    });

    const text = getAllText(renderer.root);
    // Must contain the title and subtitle, NOT just the View button!
    expect(text).toContain("UP NEXT");
    expect(text).toContain("Test NOW task");
    expect(text).toContain("Starts at 3:00 PM · Task");
    expect(text).toContain("View details");

    // Action button "View" MUST call onViewFocus, NOT onStartFocus (must NOT start Zen)
    pressByTestID(renderer, "now-focus-action-button");
    expect(onViewFocus).toHaveBeenCalledWith(focus);
    expect(onStartFocus).not.toHaveBeenCalled();

    // Card press on UPCOMING MUST also call onViewFocus/onPressCard, NOT onStartFocus
    const cardPressable = renderer.root.findByProps({
      accessibilityRole: "button",
      accessibilityLabel: "UP NEXT: Test NOW task",
    });
    act(() => {
      cardPressable.props.onPress();
    });
    expect(onViewFocus).toHaveBeenCalledTimes(2);
    expect(onStartFocus).not.toHaveBeenCalled();
  });

  it("renders calm empty state when nothing needs attention", () => {
    const focus: NowFocusResult = {
      state: "empty",
    };

    let renderer: any;
    act(() => {
      renderer = renderCard({ focus });
    });

    const emptyContainer = renderer.root.findByProps({
      testID: "now-focus-card-empty",
    });
    expect(emptyContainer).toBeTruthy();

    const text = getAllText(renderer.root);
    expect(text).toContain("Nothing needs your attention right now.");
    expect(text).toContain("Enjoy the calm or take a small breather.");
  });
});
