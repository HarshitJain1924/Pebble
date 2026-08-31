import React from "react";
import { create, act } from "react-test-renderer";
import {
  CalendarPlanningSheet,
  CalendarPlanningTarget,
} from "../CalendarPlanningSheet";
import PressableScale from "@/shared/components/ui/PressableScale";

const mockColors = {
  text: "#000000",
  textMuted: "#666666",
  card: "#FFFFFF",
  border: "#E2E8F0",
  primary: "#3B82F6",
  success: "#10B981",
  background: "#F8FAFC",
};

describe("CalendarPlanningSheet Gap-Aware Planning Tests", () => {
  const pendingTasks = [
    {
      id: "task-k8s",
      title: "Study Kubernetes",
      workspaceId: "ws-1",
      schedule: { durationMinutes: 90 },
    },
    {
      id: "task-quick",
      title: "Quick Review",
      workspaceId: "ws-1",
      schedule: { durationMinutes: 30 },
    },
  ];

  const pendingChecklists = [
    {
      id: "chk-grocery",
      title: "Grocery Shopping",
      workspaceId: "ws-1",
      schedule: { durationMinutes: 45 },
      items: [{ title: "Milk" }, { title: "Bread" }],
    },
  ];

  const plannerHabits = [
    {
      id: "habit-meditate",
      title: "Meditation",
      workspaceId: "ws-1",
    },
  ];

  const freeGapTarget: CalendarPlanningTarget = {
    hour: 10,
    minute: 30,
    gap: {
      startMinutes: 630, // 10:30 AM
      durationMinutes: 150, // 2h 30m -> 1:00 PM
    },
  };

  const tightGapTarget: CalendarPlanningTarget = {
    hour: 14,
    minute: 0,
    gap: {
      startMinutes: 840, // 2:00 PM
      durationMinutes: 60, // 1h -> 3:00 PM
    },
  };

  // Test 1: Planner displays the selected gap context header
  test("Planner displays selected gap context in header", () => {
    let root: any;
    act(() => {
      root = create(
        <CalendarPlanningSheet
          visible={true}
          target={freeGapTarget}
          pendingTasks={pendingTasks}
          pendingChecklists={pendingChecklists}
          plannerHabits={plannerHabits}
          onClose={jest.fn()}
          onPlanTask={jest.fn()}
          onPlanChecklist={jest.fn()}
          colors={mockColors}
          isLight={true}
        />
      );
    });

    const textNodes = root.root.findAllByType("Text" as any);
    const textContents = textNodes.map((t: any) => t.props.children).flat();

    expect(textContents).toContain("Plan in Free Time");
    expect(textContents.some((t: string) => typeof t === "string" && t.includes("2h 30m available"))).toBe(true);
  });

  // Test 2: Item Selection and transition to Time Controls
  test("Selecting a task transitions into Step 2 with default start time matching gap start", () => {
    let root: any;
    act(() => {
      root = create(
        <CalendarPlanningSheet
          visible={true}
          target={freeGapTarget}
          pendingTasks={pendingTasks}
          pendingChecklists={pendingChecklists}
          plannerHabits={plannerHabits}
          onClose={jest.fn()}
          onPlanTask={jest.fn()}
          onPlanChecklist={jest.fn()}
          colors={mockColors}
          isLight={true}
        />
      );
    });

    // Find and select the "Study Kubernetes" task row
    const taskRows = root.root.findAllByType(PressableScale);
    const k8sRow = taskRows.find((node: any) => {
      const texts = node.findAllByType("Text" as any).map((t: any) => t.props.children);
      return texts.includes("Study Kubernetes");
    });

    expect(k8sRow).toBeDefined();

    act(() => {
      k8sRow.props.onPress();
    });

    // Verify Step 2 shows the task banner, start time (10:30 AM), and duration (90 min)
    const textNodes = root.root.findAllByType("Text" as any);
    const textContents = textNodes.map((t: any) => t.props.children).flat();

    expect(textContents).toContain("Study Kubernetes");
    expect(textContents).toContain("10:30 AM");
    expect(textContents).toContain("1h 30m");
  });

  // Test 3: Fit Validation — Exceeding Available Gap disables schedule button and displays warning
  test("If duration exceeds available gap, fit validation shows error and prevents scheduling", () => {
    const onPlanTask = jest.fn();
    let root: any;
    act(() => {
      root = create(
        <CalendarPlanningSheet
          visible={true}
          target={tightGapTarget} // 60 min gap (2:00 PM - 3:00 PM)
          pendingTasks={pendingTasks} // "Study Kubernetes" has 90 min duration
          pendingChecklists={pendingChecklists}
          onClose={jest.fn()}
          onPlanTask={onPlanTask}
          onPlanChecklist={jest.fn()}
          colors={mockColors}
          isLight={true}
        />
      );
    });

    // Select the 90 min task
    const taskRows = root.root.findAllByType(PressableScale);
    const k8sRow = taskRows.find((node: any) => {
      const texts = node.findAllByType("Text" as any).map((t: any) => t.props.children);
      return texts.includes("Study Kubernetes");
    });

    act(() => {
      k8sRow.props.onPress();
    });

    // Verify warning is shown
    const textNodes = root.root.findAllByType("Text" as any);
    const textContents = textNodes.map((t: any) => t.props.children).flat();

    expect(textContents.some((t: string) => typeof t === "string" && t.includes("Doesn't fit in this free time"))).toBe(true);

    // Attempt to press schedule button
    const scheduleBtn = root.root.findAllByType(PressableScale).find((node: any) => {
      const texts = node.findAllByType("Text" as any).map((t: any) => t.props.children);
      return texts.some((t: string) => typeof t === "string" && t.includes("Schedule"));
    });

    expect(scheduleBtn).toBeDefined();
    act(() => {
      scheduleBtn.props.onPress();
    });

    // onPlanTask should NOT be called because it didn't fit
    expect(onPlanTask).not.toHaveBeenCalled();
  });

  // Test 4: Successful Gap Planning calls onPlanTask with custom start and duration
  test("Scheduling a valid item calls onPlanTask with selected hour, minute, and duration", async () => {
    const onPlanTask = jest.fn().mockResolvedValue(true);
    const onClose = jest.fn();

    let root: any;
    act(() => {
      root = create(
        <CalendarPlanningSheet
          visible={true}
          target={freeGapTarget} // 150 min gap (10:30 AM - 1:00 PM)
          pendingTasks={pendingTasks} // "Study Kubernetes" 90 min -> fits perfectly (10:30 AM - 12:00 PM)
          pendingChecklists={pendingChecklists}
          onClose={onClose}
          onPlanTask={onPlanTask}
          onPlanChecklist={jest.fn()}
          colors={mockColors}
          isLight={true}
        />
      );
    });

    // Select task
    const taskRows = root.root.findAllByType(PressableScale);
    const k8sRow = taskRows.find((node: any) => {
      const texts = node.findAllByType("Text" as any).map((t: any) => t.props.children);
      return texts.includes("Study Kubernetes");
    });

    act(() => {
      k8sRow.props.onPress();
    });

    // Press Schedule
    const scheduleBtn = root.root.findAllByType(PressableScale).find((node: any) => {
      const texts = node.findAllByType("Text" as any).map((t: any) => t.props.children);
      return texts.some((t: string) => typeof t === "string" && t.includes("Schedule · 10:30 AM – 12:00 PM"));
    });

    expect(scheduleBtn).toBeDefined();
    await act(async () => {
      await scheduleBtn.props.onPress();
    });

    expect(onPlanTask).toHaveBeenCalledWith("task-k8s", {
      hour: 10,
      minute: 30,
      durationMinutes: 90,
      isAllDay: undefined,
    });
  });

  // Test 5: All-Day Planning does not enforce timed gap checks
  test("All-Day planning target schedules for All Day directly", async () => {
    const onPlanChecklist = jest.fn().mockResolvedValue(true);
    const onClose = jest.fn();

    let root: any;
    act(() => {
      root = create(
        <CalendarPlanningSheet
          visible={true}
          target={{ isAllDay: true }}
          pendingTasks={pendingTasks}
          pendingChecklists={pendingChecklists}
          onClose={onClose}
          onPlanTask={jest.fn()}
          onPlanChecklist={onPlanChecklist}
          colors={mockColors}
          isLight={true}
        />
      );
    });

    // Select checklist
    const checklistRows = root.root.findAllByType(PressableScale);
    const groceryRow = checklistRows.find((node: any) => {
      const texts = node.findAllByType("Text" as any).map((t: any) => t.props.children);
      return texts.includes("Grocery Shopping");
    });

    act(() => {
      groceryRow.props.onPress();
    });

    const scheduleBtn = root.root.findAllByType(PressableScale).find((node: any) => {
      const texts = node.findAllByType("Text" as any).map((t: any) => t.props.children);
      return texts.includes("Schedule for All Day");
    });

    expect(scheduleBtn).toBeDefined();
    await act(async () => {
      await scheduleBtn.props.onPress();
    });

    expect(onPlanChecklist).toHaveBeenCalledWith("chk-grocery", {
      hour: 0,
      minute: 0,
      durationMinutes: 45,
      isAllDay: true,
    });
  });
});
