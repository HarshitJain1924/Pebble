import React from "react";
import { act, create } from "react-test-renderer";
import { TemporalHorizonStrip } from "../TemporalHorizonStrip";
import { Colors } from "@/shared/constants/theme";
import { getTodayDateKey, getOffsetDateKey } from "@/shared/utils/date-key";
import type { Task } from "@/shared/types/domain.types";

import PressableScale from "@/shared/components/ui/PressableScale";

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
}));

describe("TemporalHorizonStrip", () => {
  const todayKey = getTodayDateKey();
  const mockColors = Colors.dark;

  const mockTasks: Task[] = [
    {
      id: "t1",
      title: "Task 1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      workspaceId: "inbox",
      revision: 1,
      lifecycleGeneration: 1,
      status: "todo",
      priority: "none",
      schedule: { date: todayKey },
      resourceIds: [],
    },
    {
      id: "t2",
      title: "Task 2",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      workspaceId: "inbox",
      revision: 1,
      lifecycleGeneration: 1,
      status: "todo",
      priority: "none",
      schedule: { date: todayKey },
      resourceIds: [],
    },
    {
      id: "t3",
      title: "Task 3 (Tomorrow)",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      workspaceId: "inbox",
      revision: 1,
      lifecycleGeneration: 1,
      status: "todo",
      priority: "none",
      schedule: { date: getOffsetDateKey(-1, todayKey) },
      resourceIds: [],
    },
  ];

  it("renders 7 date capsules properly", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <TemporalHorizonStrip
          selectedDate={todayKey}
          onSelectDate={jest.fn()}
          todos={mockTasks}
          colors={mockColors}
          isDark={true}
        />
      );
    });

    const root = renderer.root;
    const capsules = root.findAllByType(PressableScale);
    expect(capsules.length).toBe(7);
  });

  it("correctly marks today and selected date", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <TemporalHorizonStrip
          selectedDate={todayKey}
          onSelectDate={jest.fn()}
          todos={mockTasks}
          colors={mockColors}
          isDark={true}
        />
      );
    });

    const root = renderer.root;
    const selectedButton = root.find(
      (node: any) => node.props.accessibilityRole === "button" && node.props.accessibilityState?.selected === true
    );
    expect(selectedButton).toBeDefined();
    expect(selectedButton.props.accessibilityLabel).toContain("Today");
  });

  it("calls onSelectDate when a date capsule is pressed", () => {
    const onSelectDateMock = jest.fn();
    let renderer: any;
    act(() => {
      renderer = create(
        <TemporalHorizonStrip
          selectedDate={todayKey}
          onSelectDate={onSelectDateMock}
          todos={mockTasks}
          colors={mockColors}
          isDark={true}
        />
      );
    });

    const root = renderer.root;
    const capsules = root.findAllByType(PressableScale);
    // Press the first capsule
    act(() => {
      capsules[0].props.onPress();
    });

    expect(onSelectDateMock).toHaveBeenCalledTimes(1);
    expect(typeof onSelectDateMock.mock.calls[0][0]).toBe("string");
  });
});
