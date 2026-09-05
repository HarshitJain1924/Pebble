import React from "react";
import { act, create } from "react-test-renderer";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { FocusTargetCard } from "../FocusTargetCard";
import { PressableScale } from "@/shared/components/ui/PressableScale";

const mockColors = {
  text: "#FFFFFF",
  textMuted: "#888888",
  primary: "#6366F1",
  card: "#1E1E2E",
  border: "#2E2E3E",
  error: "#EF4444",
};

describe("FocusTargetCard Component", () => {
  const defaultTodos = [
    { id: "task-1", title: "Write Architecture Spec" },
    { id: "task-2", title: "Refactor Notification Engine" },
  ];

  const defaultHabits = [
    { id: "habit-1", title: "Morning Meditation", previousStreak: 0 },
    { id: "habit-2", title: "Daily Reading", previousStreak: 5 },
  ];

  it("1. Renders empty state with actionable prompt when no target is selected", () => {
    const onLinkPress = jest.fn();
    const onUnlinkPress = jest.fn();

    let renderer: any;
    act(() => {
      renderer = create(
        <FocusTargetCard
          focusedTaskId={null}
          todoList={defaultTodos}
          habitList={defaultHabits}
          onLinkPress={onLinkPress}
          onUnlinkPress={onUnlinkPress}
          colors={mockColors}
        />
      );
    });

    const root = renderer.root;
    // Header prompt
    const texts = root.findAllByType("Text" as any).map((t: any) => t.props.children);
    expect(texts).toContain("What are you focusing on?");
    expect(texts).toContain("Choose a task or habit for this session");
    expect(texts).toContain("Choose a task or habit");

    // Action button exists and calls onLinkPress
    const pressables = root.findAllByType(PressableScale);
    expect(pressables.length).toBe(1);
    act(() => {
      pressables[0].props.onPress();
    });
    expect(onLinkPress).toHaveBeenCalledTimes(1);
    expect(onUnlinkPress).not.toHaveBeenCalled();
  });

  it("2. Renders linked task context with Change and Unlink actions", () => {
    const onLinkPress = jest.fn();
    const onUnlinkPress = jest.fn();

    let renderer: any;
    act(() => {
      renderer = create(
        <FocusTargetCard
          focusedTaskId="task-1"
          todoList={defaultTodos}
          habitList={defaultHabits}
          onLinkPress={onLinkPress}
          onUnlinkPress={onUnlinkPress}
          colors={mockColors}
        />
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((t: any) => t.props.children);
    expect(texts).toContain("What are you focusing on?");
    expect(texts).toContain("Linked Task");
    expect(texts).toContain("Write Architecture Spec");
    expect(texts).toContain("Task");
    expect(texts).toContain("Change");

    const pressables = root.findAllByType(PressableScale);
    // pressables: [changeBtn, unlinkBtn, linkedRow]
    expect(pressables.length).toBe(3);

    // Press Change button
    act(() => {
      pressables[0].props.onPress();
    });
    expect(onLinkPress).toHaveBeenCalledTimes(1);

    // Press Unlink button
    act(() => {
      pressables[1].props.onPress();
    });
    expect(onUnlinkPress).toHaveBeenCalledTimes(1);
  });

  it("3. Renders linked habit context with Recovery Badge when recovery is active", () => {
    const onLinkPress = jest.fn();
    const onUnlinkPress = jest.fn();

    let renderer: any;
    act(() => {
      renderer = create(
        <FocusTargetCard
          focusedTaskId="habit-2"
          todoList={defaultTodos}
          habitList={defaultHabits}
          onLinkPress={onLinkPress}
          onUnlinkPress={onUnlinkPress}
          colors={mockColors}
        />
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((t: any) => t.props.children);
    expect(texts).toContain("What are you focusing on?");
    expect(texts).toContain("Linked Habit");
    expect(texts).toContain("Daily Reading");
    expect(texts).toContain("Habit");
    expect(texts).toContain("💔 RECOVERY ACTIVE (10M)");
  });

  it("4. Tapping the selected target row also triggers onLinkPress to change target", () => {
    const onLinkPress = jest.fn();
    const onUnlinkPress = jest.fn();

    let renderer: any;
    act(() => {
      renderer = create(
        <FocusTargetCard
          focusedTaskId="habit-1"
          todoList={defaultTodos}
          habitList={defaultHabits}
          onLinkPress={onLinkPress}
          onUnlinkPress={onUnlinkPress}
          colors={mockColors}
        />
      );
    });

    const root = renderer.root;
    const pressables = root.findAllByType(PressableScale);
    // pressables: [changeBtn, unlinkBtn, linkedRow]
    const linkedRow = pressables[2];
    act(() => {
      linkedRow.props.onPress();
    });
    expect(onLinkPress).toHaveBeenCalledTimes(1);
  });
});
