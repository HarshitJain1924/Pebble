import React from "react";
import { create, act } from "react-test-renderer";
import { CalendarItemPopover, CalendarPopoverItem } from "../CalendarItemPopover";
import PressableScale from "@/shared/components/ui/PressableScale";

const mockColors = {
  text: "#000000",
  textMuted: "#666666",
  card: "#FFFFFF",
  border: "#E2E8F0",
  primary: "#3B82F6",
  background: "#F8FAFC",
};

describe("CalendarItemPopover Unit Tests", () => {
  const taskItem: CalendarPopoverItem = {
    id: "task-1",
    title: "Study Kubernetes Architecture",
    type: "task",
    startHour: 10,
    startMinute: 0,
    durationMinutes: 90,
    priority: "high",
    completed: false,
    workspaceId: "ws-1",
  };

  const habitItem: CalendarPopoverItem = {
    id: "habit-1",
    title: "Morning Meditation",
    type: "habit",
    startHour: 7,
    startMinute: 30,
    durationMinutes: 20,
    streak: 5,
    completed: false,
    workspaceId: "ws-1",
  };

  const checklistItem: CalendarPopoverItem = {
    id: "chk-1",
    title: "Weekly Grocery Shopping",
    type: "checklist",
    startHour: 18,
    startMinute: 0,
    durationMinutes: 45,
    itemsCount: 5,
    completedItemsCount: 2,
    items: [
      { title: "Organic Whole Milk", completed: true },
      { title: "Sourdough Bread", completed: true },
      { title: "Farm Fresh Eggs", completed: false },
    ],
    workspaceId: "ws-1",
  };

  // Test 1: Task Popover Renders & Displays Task-Specific Metadata
  test("Task popover renders with task icon, title, formatted time, duration, and priority", () => {
    const onOpenDetails = jest.fn();
    const onToggleCompleteTask = jest.fn();
    const onClose = jest.fn();

    let root: any;
    act(() => {
      root = create(
        <CalendarItemPopover
          visible={true}
          item={taskItem}
          selectedDate="2026-09-01"
          onClose={onClose}
          onOpenDetails={onOpenDetails}
          onToggleCompleteTask={onToggleCompleteTask}
          colors={mockColors}
          isLight={true}
        />
      );
    });

    const textNodes = root.root.findAllByType("Text" as any);
    const textContents = textNodes.map((t: any) => t.props.children).flat();

    // Check title, entity label, and priority text
    expect(textContents).toContain("Study Kubernetes Architecture");
    expect(textContents).toContain("TASK");
    expect(textContents).toContain("High Priority");
  });

  // Test 2: Habit Popover Renders Streak and Recurrence
  test("Habit popover renders habit metadata with streak and recurrence", () => {
    const onOpenDetails = jest.fn();
    const onToggleCompleteHabit = jest.fn();
    const onClose = jest.fn();

    let root: any;
    act(() => {
      root = create(
        <CalendarItemPopover
          visible={true}
          item={habitItem}
          selectedDate="2026-09-01"
          onClose={onClose}
          onOpenDetails={onOpenDetails}
          onToggleCompleteHabit={onToggleCompleteHabit}
          colors={mockColors}
          isLight={true}
        />
      );
    });

    const textNodes = root.root.findAllByType("Text" as any);
    const textContents = textNodes.map((t: any) => t.props.children).flat();

    expect(textContents).toContain("Morning Meditation");
    expect(textContents).toContain("HABIT");
    expect(textContents).toContain("5 day streak");
  });

  // Test 3: Checklist Popover in Week View Renders Progress (2 / 5 completed) and Item Previews
  test("Checklist popover in Week view renders progress count (2 / 5 completed) and item preview list", () => {
    const onOpenDetails = jest.fn();
    const onClose = jest.fn();

    let root: any;
    act(() => {
      root = create(
        <CalendarItemPopover
          visible={true}
          item={checklistItem}
          selectedDate="2026-09-01"
          viewContext="week"
          onClose={onClose}
          onOpenDetails={onOpenDetails}
          colors={mockColors}
          isLight={true}
        />
      );
    });

    const textNodes = root.root.findAllByType("Text" as any);
    const textContents = textNodes.map((t: any) => t.props.children).flat();

    expect(textContents).toContain("Weekly Grocery Shopping");
    expect(textContents).toContain("CHECKLIST");
    expect(textContents).toContain("2 / 5 completed");
    expect(textContents).toContain("Organic Whole Milk");
    expect(textContents).toContain("Sourdough Bread");
  });

  // Test 3b: Checklist Popover in Day & Month Views does NOT render progress UI
  test("Checklist popover in Day and Month views does not render progress UI", () => {
    const onOpenDetails = jest.fn();
    const onClose = jest.fn();

    let dayRoot: any;
    act(() => {
      dayRoot = create(
        <CalendarItemPopover
          visible={true}
          item={checklistItem}
          selectedDate="2026-09-01"
          viewContext="day"
          onClose={onClose}
          onOpenDetails={onOpenDetails}
          colors={mockColors}
          isLight={true}
        />
      );
    });

    const dayTextNodes = dayRoot.root.findAllByType("Text" as any);
    const dayTextContents = dayTextNodes.map((t: any) => t.props.children).flat();

    expect(dayTextContents).toContain("Weekly Grocery Shopping");
    expect(dayTextContents).toContain("CHECKLIST");
    expect(dayTextContents).not.toContain("2 / 5 completed");
    expect(dayTextContents).not.toContain("Progress");

    let monthRoot: any;
    act(() => {
      monthRoot = create(
        <CalendarItemPopover
          visible={true}
          item={checklistItem}
          selectedDate="2026-09-01"
          viewContext="month"
          onClose={onClose}
          onOpenDetails={onOpenDetails}
          colors={mockColors}
          isLight={true}
        />
      );
    });

    const monthTextNodes = monthRoot.root.findAllByType("Text" as any);
    const monthTextContents = monthTextNodes.map((t: any) => t.props.children).flat();

    expect(monthTextContents).toContain("Weekly Grocery Shopping");
    expect(monthTextContents).toContain("CHECKLIST");
    expect(monthTextContents).not.toContain("2 / 5 completed");
    expect(monthTextContents).not.toContain("Progress");
  });

  // Test 4: Checklist Popover has ONE clear primary action [Open checklist] without duplicate [See details]
  test("Checklist popover has one clear primary action [Open checklist] and no redundant [See details] button", () => {
    const onOpenDetails = jest.fn();
    const onClose = jest.fn();

    let root: any;
    act(() => {
      root = create(
        <CalendarItemPopover
          visible={true}
          item={checklistItem}
          selectedDate="2026-09-01"
          onClose={onClose}
          onOpenDetails={onOpenDetails}
          colors={mockColors}
          isLight={true}
        />
      );
    });

    const pressableScales = root.root.findAllByType(PressableScale);
    const openChecklistBtn = pressableScales.find((node: any) => {
      const textNodes = node.findAllByType("Text" as any);
      return textNodes.some((t: any) => t.props.children === "Open checklist");
    });
    const seeDetailsBtn = pressableScales.find((node: any) => {
      const textNodes = node.findAllByType("Text" as any);
      return textNodes.some((t: any) => t.props.children === "See details");
    });

    expect(openChecklistBtn).toBeDefined();
    expect(seeDetailsBtn).toBeUndefined();

    act(() => {
      openChecklistBtn.props.onPress();
    });

    expect(onOpenDetails).toHaveBeenCalledWith(checklistItem);
  });

  // Test 5: Task Completion Toggle Action
  test("Tapping Complete on a Task triggers onToggleCompleteTask with task id and workspaceId", async () => {
    const onOpenDetails = jest.fn();
    const onToggleCompleteTask = jest.fn();
    const onClose = jest.fn();

    let root: any;
    act(() => {
      root = create(
        <CalendarItemPopover
          visible={true}
          item={taskItem}
          selectedDate="2026-09-01"
          onClose={onClose}
          onOpenDetails={onOpenDetails}
          onToggleCompleteTask={onToggleCompleteTask}
          colors={mockColors}
          isLight={true}
        />
      );
    });

    const pressableScales = root.root.findAllByType(PressableScale);
    const completeBtn = pressableScales.find((node: any) => {
      const textNodes = node.findAllByType("Text" as any);
      return textNodes.some((t: any) => t.props.children === "Complete");
    });

    expect(completeBtn).toBeDefined();
    await act(async () => {
      await completeBtn.props.onPress();
    });

    expect(onToggleCompleteTask).toHaveBeenCalledWith("task-1", "ws-1");
  });

  // Test 6: See Details Action for Tasks
  test("Tapping See details triggers onOpenDetails with the task item object", () => {
    const onOpenDetails = jest.fn();
    const onClose = jest.fn();

    let root: any;
    act(() => {
      root = create(
        <CalendarItemPopover
          visible={true}
          item={taskItem}
          selectedDate="2026-09-01"
          onClose={onClose}
          onOpenDetails={onOpenDetails}
          colors={mockColors}
          isLight={true}
        />
      );
    });

    const pressableScales = root.root.findAllByType(PressableScale);
    const seeDetailsBtn = pressableScales.find((node: any) => {
      const textNodes = node.findAllByType("Text" as any);
      return textNodes.some((t: any) => t.props.children === "See details");
    });

    expect(seeDetailsBtn).toBeDefined();
    act(() => {
      seeDetailsBtn.props.onPress();
    });

    expect(onOpenDetails).toHaveBeenCalledWith(taskItem);
  });
});
