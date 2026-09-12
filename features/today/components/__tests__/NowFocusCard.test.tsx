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

describe("NowFocusCard component", () => {
  it("renders active Task with Start button and triggers onStartFocus", () => {
    const task: Task = {
      id: "task-1",
      workspaceId: "inbox",
      title: "Finish quarterly report",
      priority: "high",
      status: "todo",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const focus: NowFocusResult = {
      state: "active",
      type: "task",
      item: task,
      timeLabel: "2:00 PM – 3:00 PM",
      durationMinutes: 60,
    };

    const onStartFocus = jest.fn();

    let renderer: any;
    act(() => {
      renderer = create(
        <NowFocusCard
          focus={focus}
          onStartFocus={onStartFocus}
          colors={mockColors}
          colorScheme="dark"
        />,
      );
    });

    const text = getAllText(renderer.root);
    expect(text).toContain("NOW");
    expect(text).toContain("Finish quarterly report");
    expect(text).toContain("2:00 PM – 3:00 PM");
    expect(text).toContain("High priority");
    expect(text).toContain("Start");

    const actionButton = renderer.root.findByProps({
      testID: "now-focus-action-button",
    });
    act(() => {
      actionButton.props.onPress();
    });
    expect(onStartFocus).toHaveBeenCalledWith(focus);
  });

  it("renders active Habit with streak information", () => {
    const habit: Habit = {
      id: "habit-1",
      workspaceId: "inbox",
      title: "Daily Workout",
      revision: 1,
      lifecycleGeneration: 1,
      recurrence: { frequency: "daily", interval: 1 },
      completionHistory: [
        { date: "2026-09-11", completedAt: 12345 },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const focus: NowFocusResult = {
      state: "active",
      type: "habit",
      item: habit,
      timeLabel: "2:00 PM – 2:45 PM",
      durationMinutes: 45,
    };

    let renderer: any;
    act(() => {
      renderer = create(
        <NowFocusCard
          focus={focus}
          colors={mockColors}
          colorScheme="dark"
        />,
      );
    });

    const text = getAllText(renderer.root);
    expect(text).toContain("NOW");
    expect(text).toContain("Daily Workout");
    expect(text).toContain("2:00 PM – 2:45 PM");
    expect(text).toContain("Habit");
  });

  it("renders active Checklist with Continue action and progress", () => {
    const checklist: Checklist = {
      id: "chk-1",
      workspaceId: "inbox",
      title: "Release Launch Checklist",
      revision: 1,
      lifecycleGeneration: 1,
      items: [
        { id: "i1", title: "Build APK", completed: true },
        { id: "i2", title: "Test notifications", completed: true },
        { id: "i3", title: "Deploy to store", completed: false },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const focus: NowFocusResult = {
      state: "active",
      type: "checklist",
      item: checklist,
      timeLabel: "2:00 PM – 3:00 PM",
    };

    let renderer: any;
    act(() => {
      renderer = create(
        <NowFocusCard
          focus={focus}
          colors={mockColors}
          colorScheme="dark"
        />,
      );
    });

    const text = getAllText(renderer.root);
    expect(text).toContain("Release Launch Checklist");
    expect(text).toContain("Continue");
    expect(text).toContain("2 / 3 completed");
  });

  it("renders recommended state with free time fit context", () => {
    const task: Task = {
      id: "task-rec",
      workspaceId: "inbox",
      title: "Study TypeScript 5.5",
      priority: "medium",
      status: "todo",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const focus: NowFocusResult = {
      state: "recommended",
      type: "task",
      item: task,
      contextLabel: "~45 min · Fits 2h free time",
      windowMinutes: 120,
      durationMinutes: 45,
    };

    let renderer: any;
    act(() => {
      renderer = create(
        <NowFocusCard
          focus={focus}
          colors={mockColors}
          colorScheme="dark"
        />,
      );
    });

    const text = getAllText(renderer.root);
    expect(text).toContain("NOW · RECOMMENDED");
    expect(text).toContain("Study TypeScript 5.5");
    expect(text).toContain("Fits 2h free time");
  });

  it("renders upcoming scheduled activity as UP NEXT with View button", () => {
    const task: Task = {
      id: "task-upcoming",
      workspaceId: "inbox",
      title: "Doctor Appointment",
      priority: "high",
      status: "todo",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const focus: NowFocusResult = {
      state: "upcoming",
      type: "task",
      item: task,
      timeLabel: "Starts at 3:30 PM",
      nextScheduledTime: "3:30 PM",
    };

    let renderer: any;
    act(() => {
      renderer = create(
        <NowFocusCard
          focus={focus}
          colors={mockColors}
          colorScheme="dark"
        />,
      );
    });

    const text = getAllText(renderer.root);
    expect(text).toContain("UP NEXT");
    expect(text).toContain("Doctor Appointment");
    expect(text).toContain("Starts at 3:30 PM");
    expect(text).toContain("View");
  });

  it("renders calm empty state when nothing needs attention", () => {
    const focus: NowFocusResult = {
      state: "empty",
    };

    let renderer: any;
    act(() => {
      renderer = create(
        <NowFocusCard
          focus={focus}
          colors={mockColors}
          colorScheme="dark"
        />,
      );
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
