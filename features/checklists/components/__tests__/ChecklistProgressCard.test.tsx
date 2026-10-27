import React from "react";
import { act, create } from "react-test-renderer";
import { ChecklistProgressCard } from "../ChecklistProgressCard";
import { Colors } from "@/shared/constants/theme";
import { Checklist } from "@/shared/types/domain.types";
import { getTodayDateKey } from "@/shared/utils/date-key";
import { Text as RNText } from "react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
  }),
}));

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("@/shared/components/ui/PressableScale", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Comp = ({ children, onPress, onLongPress, ...props }: any) =>
    React.createElement(View, { onPress, onLongPress, ...props }, children);
  return {
    __esModule: true,
    default: Comp,
    PressableScale: Comp,
  };
});

jest.mock("@expo/vector-icons", () => ({
  Feather: (props: any) => require("react").createElement("FeatherIcon", props),
  Ionicons: (props: any) => require("react").createElement("IoniconsIcon", props),
}));

describe("ChecklistProgressCard Component Redesign", () => {
  const baseChecklist: Checklist = {
    id: "chk-card-1",
    workspaceId: "ws-1",
    title: "Grocery Shopping",
    priority: "high",
    categoryId: "groceries",
    items: [
      { id: "i1", title: "Apples", completed: true },
      { id: "i2", title: "Bread", completed: false },
      { id: "i3", title: "Milk", completed: false },
    ],
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  it("renders terracotta card with priority pill, category/workspace pill, progress percent, and timing row", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <ChecklistProgressCard
          checklist={baseChecklist}
          colors={Colors.dark}
          colorScheme="dark"
          workspaceName="Personal"
        />
      );
    });

    const root = renderer.root;

    // Check main card pressable exists
    const card = root.findByProps({ testID: "checklist-card-chk-card-1" });
    expect(card).toBeDefined();

    const textNodes = root.findAllByType(RNText).map((t: any) =>
      Array.isArray(t.props.children) ? t.props.children.join("") : t.props.children
    );

    // Priority pill
    expect(textNodes).toContain("High");
    // Workspace pill
    expect(textNodes).toContain("Personal");
    // Progress percent (1 of 3 = 33%)
    expect(textNodes).toContain("33%");
    // Title
    expect(textNodes).toContain("Grocery Shopping");
    // Timing row fallback: "1 of 3 completed"
    expect(textNodes).toContain("1 of 3 completed");

    // Clock icon present
    const featherIcons = root.findAllByType("FeatherIcon" as any);
    expect(featherIcons.some((icon: any) => icon.props.name === "clock")).toBe(true);
  });

  it("tapping the card directly navigates to checklist-details", () => {
    mockPush.mockClear();
    let renderer: any;
    act(() => {
      renderer = create(
        <ChecklistProgressCard
          checklist={baseChecklist}
          colors={Colors.dark}
          colorScheme="dark"
        />
      );
    });

    const card = renderer.root.findByProps({ testID: "checklist-card-chk-card-1" });
    act(() => {
      card.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith("/checklist-details?id=chk-card-1");
  });

  it("reads recurring checklist progress from today's occurrence", () => {
    const todayKey = getTodayDateKey();
    const recurringChecklist: Checklist = {
      ...baseChecklist,
      recurrence: { frequency: "daily", interval: 1 },
      schedule: { date: todayKey, startTime: "09:00", endTime: "10:00" },
      items: baseChecklist.items.map((item) => ({ ...item, completed: false })),
      occurrenceHistory: {
        [todayKey]: { completedItemIds: ["i1"] },
      },
    };

    let renderer: any;
    act(() => {
      renderer = create(
        <ChecklistProgressCard
          checklist={recurringChecklist}
          colors={Colors.dark}
          colorScheme="dark"
        />
      );
    });

    const textNodes = renderer.root.findAllByType(RNText).map((t: any) =>
      Array.isArray(t.props.children) ? t.props.children.join("") : t.props.children
    );
    expect(textNodes).toContain("33%");
    expect(textNodes.some((t: string) => typeof t === "string" && t.includes("9:00 AM - 10:00 AM"))).toBe(true);
  });

  it("renders scheduled start and end time range for scheduled checklist", () => {
    const scheduledChecklist: Checklist = {
      ...baseChecklist,
      id: "chk-scheduled-1",
      schedule: {
        date: "2026-10-30",
        startTime: "14:00",
        endTime: "15:00",
        durationMinutes: 60,
      },
    };

    let renderer: any;
    act(() => {
      renderer = create(
        <ChecklistProgressCard
          checklist={scheduledChecklist}
          colors={Colors.dark}
          colorScheme="dark"
        />
      );
    });

    const textNodes = renderer.root.findAllByType(RNText).map((t: any) =>
      Array.isArray(t.props.children) ? t.props.children.join("") : t.props.children
    );

    expect(
      textNodes.some((t: string) => typeof t === "string" && (t.includes("2:00 PM") || t.includes("3:00 PM")))
    ).toBe(true);
  });

  it("renders recurrence label when recurrence is configured without specific time", () => {
    const recurringChecklist: Checklist = {
      ...baseChecklist,
      id: "chk-recurring-1",
      recurrence: {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [5],
      },
    };

    let renderer: any;
    act(() => {
      renderer = create(
        <ChecklistProgressCard
          checklist={recurringChecklist}
          colors={Colors.dark}
          colorScheme="dark"
        />
      );
    });

    const textNodes = renderer.root.findAllByType(RNText).map((t: any) =>
      Array.isArray(t.props.children) ? t.props.children.join("") : t.props.children
    );

    expect(
      textNodes.some((t: string) => typeof t === "string" && (t.includes("Friday") || t.includes("Weekly")))
    ).toBe(true);
  });

  it("navigates to checklist-details with occurrence date when opening a recurring checklist", () => {
    mockPush.mockClear();
    const today = getTodayDateKey();
    const recurringChecklist: Checklist = {
      id: "cl-recurring-nav",
      workspaceId: "ws-test",
      title: "Daily Standup Prep",
      priority: "medium",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
      recurrence: { frequency: "daily", interval: 1 },
      items: [
        { id: "i1", title: "Review tasks", completed: false },
      ],
    };

    let renderer: any;
    act(() => {
      renderer = create(
        <ChecklistProgressCard
          checklist={recurringChecklist}
          colors={Colors.dark}
          colorScheme="dark"
        />
      );
    });

    const card = renderer.root.findByProps({ testID: "checklist-card-cl-recurring-nav" });
    act(() => {
      card.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith(`/checklist-details?id=cl-recurring-nav&date=${today}`);
  });

  it("navigates to checklist-details without date parameter for non-recurring checklist", () => {
    mockPush.mockClear();
    const nonRecurringChecklist: Checklist = {
      id: "cl-plain-nav",
      workspaceId: "ws-test",
      title: "One-off Prep",
      priority: "medium",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
      items: [
        { id: "i1", title: "Review tasks", completed: false },
      ],
    };

    let renderer: any;
    act(() => {
      renderer = create(
        <ChecklistProgressCard
          checklist={nonRecurringChecklist}
          colors={Colors.dark}
          colorScheme="dark"
        />
      );
    });

    const card = renderer.root.findByProps({ testID: "checklist-card-cl-plain-nav" });
    act(() => {
      card.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith(`/checklist-details?id=cl-plain-nav`);
  });
});
