import React from "react";
import { create, act } from "react-test-renderer";
import { Text as RNText, View } from "react-native";
import { HabitSection } from "../HabitSection";
import { Habit } from "@/shared/types/domain.types";
import { getDateKey, parseDateKey } from "@/services/scheduling/recurrence.service";
import { getOffsetDateKey } from "@/shared/utils/date-key";

// Mock AsyncStorage
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// Mock router
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

// Mock SwipeableCard
jest.mock("@/shared/components/ui/SwipeableCard", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    SwipeableCard: ({ children }: any) => React.createElement(View, null, children),
  };
});

// Mock PressableScale
jest.mock("@/shared/components/ui/PressableScale", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Comp = ({ children, onPress, ...props }: any) =>
    React.createElement(View, { onPress, ...props }, children);
  return {
    __esModule: true,
    default: Comp,
    PressableScale: Comp,
  };
});

// Mock expo-image
jest.mock("expo-image", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    Image: (props: any) => React.createElement(View, { testID: "expo-image", ...props }),
  };
});

// Mock icons
jest.mock("@expo/vector-icons", () => ({
  Feather: (props: any) => require("react").createElement("FeatherIcon", props),
  Ionicons: (props: any) => require("react").createElement("IoniconsIcon", props),
}));

// Mock Haptics
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 0, Medium: 1, Heavy: 2 },
  NotificationFeedbackType: { Success: 0, Warning: 1, Error: 2 },
}));

describe("HabitSection Component", () => {
  const todayKey = getDateKey();
  const yesterdayKey = getOffsetDateKey(1, todayKey);
  const tomorrowKey = getOffsetDateKey(-1, todayKey);

  // Today day of week (0 = Sunday, 1 = Monday, etc.)
  const todayDate = parseDateKey(todayKey);
  const todayDay = todayDate.getDay();
  // Find a day of week that is NOT today
  const otherDay = (todayDay + 2) % 7;

  const baseProps = {
    habits: [],
    setHabits: jest.fn(),
    persistHabits: jest.fn(async () => {}),
    toggleHabit: jest.fn(),
    deleteHabit: jest.fn(),
    unfinishedHabitCount: 0,
  };

  it("shows WorkspaceEmptyState when workspace has 0 habits", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <HabitSection
          {...baseProps}
          displayedHabits={[]}
          selectedDate={todayKey}
        />
      );
    });

    const root = renderer.root;
    const textNodes = root.findAllByType(RNText).map((t: any) =>
      Array.isArray(t.props.children) ? t.props.children.join("") : t.props.children
    );
    expect(textNodes.some((txt: string) => txt && txt.includes("No habits yet"))).toBe(true);
  });

  it("does NOT show empty state when habits are scheduled only for other days, but shows OTHER DAYS section", () => {
    const habitForOtherDay: Habit = {
      id: "h-other",
      workspaceId: "ws-1",
      title: "Weekend Hiking",
      recurrence: { frequency: "weekly", interval: 1, daysOfWeek: [otherDay] },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 1,
      lifecycleGeneration: 1,
      completionHistory: [],
    };

    let renderer: any;
    act(() => {
      renderer = create(
        <HabitSection
          {...baseProps}
          displayedHabits={[habitForOtherDay]}
          selectedDate={todayKey}
        />
      );
    });

    const root = renderer.root;
    const textNodes = root.findAllByType(RNText).map((t: any) =>
      Array.isArray(t.props.children) ? t.props.children.join("") : t.props.children
    );

    // Empty state must NOT be shown
    expect(textNodes.some((txt: string) => txt && txt.includes("No habits yet"))).toBe(false);

    // OTHER DAYS (1) header must be present
    expect(textNodes).toContain("OTHER DAYS (1)");
  });

  it("groups habits into TODAY, COMPLETED, and OTHER DAYS accurately", () => {
    const dueTodayHabit: Habit = {
      id: "h-today",
      workspaceId: "ws-1",
      title: "Daily Meditation",
      recurrence: { frequency: "daily", interval: 1 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 1,
      lifecycleGeneration: 1,
      completionHistory: [],
    };

    const completedTodayHabit: Habit = {
      id: "h-completed",
      workspaceId: "ws-1",
      title: "Morning Journal",
      recurrence: { frequency: "daily", interval: 1 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 1,
      lifecycleGeneration: 1,
      completionHistory: [{ date: todayKey, completedAt: Date.now() }],
    };

    const otherDayHabit: Habit = {
      id: "h-wednesday",
      workspaceId: "ws-1",
      title: "Midweek Yoga",
      recurrence: { frequency: "weekly", interval: 1, daysOfWeek: [otherDay] },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 1,
      lifecycleGeneration: 1,
      completionHistory: [],
    };

    let renderer: any;
    act(() => {
      renderer = create(
        <HabitSection
          {...baseProps}
          displayedHabits={[dueTodayHabit, completedTodayHabit, otherDayHabit]}
          selectedDate={todayKey}
        />
      );
    });

    const root = renderer.root;
    const textNodes = root.findAllByType(RNText).map((t: any) =>
      Array.isArray(t.props.children) ? t.props.children.join("") : t.props.children
    );

    expect(textNodes.some((t: string) => t && t.includes("Today"))).toBe(true);
    expect(textNodes).toContain("COMPLETED (1)");
    expect(textNodes).toContain("OTHER DAYS (1)");
  });

  it("respects the selectedDate prop when grouping habits", () => {
    // Habit completed yesterday but NOT today
    const habitCompletedYesterday: Habit = {
      id: "h-yesterday",
      workspaceId: "ws-1",
      title: "Reading",
      recurrence: { frequency: "daily", interval: 1 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 1,
      lifecycleGeneration: 1,
      completionHistory: [{ date: yesterdayKey, completedAt: Date.now() }],
    };

    // When viewed with selectedDate = yesterdayKey, it should be in COMPLETED (1)
    let rendererYesterday: any;
    act(() => {
      rendererYesterday = create(
        <HabitSection
          {...baseProps}
          displayedHabits={[habitCompletedYesterday]}
          selectedDate={yesterdayKey}
        />
      );
    });

    const rootYesterday = rendererYesterday.root;
    const textYesterday = rootYesterday.findAllByType(RNText).map((t: any) =>
      Array.isArray(t.props.children) ? t.props.children.join("") : t.props.children
    );
    expect(textYesterday).toContain("COMPLETED (1)");

    // When viewed with selectedDate = todayKey, it should be in TODAY (1) (not completed today)
    let rendererToday: any;
    act(() => {
      rendererToday = create(
        <HabitSection
          {...baseProps}
          displayedHabits={[habitCompletedYesterday]}
          selectedDate={todayKey}
        />
      );
    });

    const rootToday = rendererToday.root;
    const textToday = rootToday.findAllByType(RNText).map((t: any) =>
      Array.isArray(t.props.children) ? t.props.children.join("") : t.props.children
    );
    expect(textToday.some((t: string) => t && t.includes("Today"))).toBe(true);
  });
});
