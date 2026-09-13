import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, create } from "react-test-renderer";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    Stack: { Screen: () => null },
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  };
});

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));

jest.mock("@expo/vector-icons", () => ({
  Feather: () => null,
}));

jest.mock("@/shared/hooks/useColorScheme", () => ({
  useColorScheme: () => "dark",
}));

jest.mock("@/shared/components/ui/AppCard", () => ({
  AppCard: ({ children }: any) => children,
}));

jest.mock("@/shared/components/layout/AmbientBackground", () => ({
  FloatingGlow: () => null,
}));

jest.mock("@/shared/components/design-system", () => ({
  CategoryChip: () => null,
}));

jest.mock("@/features/profile/services/pebble.service", () => ({
  getPebbleCounts: jest.fn(),
}));

jest.mock("@/repositories", () => ({
  WorkspaceRepository: { getWorkspaces: jest.fn() },
  TaskRepository: { getTasks: jest.fn() },
  HabitRepository: { getHabits: jest.fn() },
}));

// Mocked so we can assert on the exact stats payload wired into the dashboard.
jest.mock("@/features/profile/components/ProductivityDashboard", () => ({
  ProductivityDashboard: "ProductivityDashboard",
}));
jest.mock("@/features/profile/components/WeeklyProductivityTrend", () => ({
  WeeklyProductivityTrend: "WeeklyProductivityTrend",
}));

import StatsScreen from "@/app/profile/stats";
import {
  WorkspaceRepository,
  TaskRepository,
  HabitRepository,
} from "@/repositories";
import { getPebbleCounts } from "@/features/profile/services/pebble.service";
import { emitStateChange } from "@/services/events/state-events";

const basePebbleCounts = {
  lifetime: 0,
  monthly: 0,
  today: 0,
  todayTypes: { task: 0, habit: 0, focus: 0, checklist: 0 },
  monthlyTypes: { task: 0, habit: 0, focus: 0, checklist: 0 },
  lifetimeTypes: { task: 0, habit: 0, focus: 0, checklist: 0 },
  streak: 0,
  bestStreak: 0,
  weeklyStatus: [],
};

function dateKeyDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function flushAsync(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

let renderer: any;

describe("Analytics screen metric scope", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    (WorkspaceRepository.getWorkspaces as jest.Mock).mockResolvedValue([]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({});
    (HabitRepository.getHabits as jest.Mock).mockResolvedValue({});
    // Non-zero activity by default so the analytical sections render.
    (getPebbleCounts as jest.Mock).mockResolvedValue({
      ...basePebbleCounts,
      lifetime: 12,
    });
  });

  afterEach(() => {
    renderer?.unmount();
  });

  async function renderStats() {
    await act(async () => {
      renderer = create(<StatsScreen />);
    });
    await flushAsync();
  }

  function dashboardStats() {
    return renderer.root.findByType("ProductivityDashboard" as any).props.stats;
  }

  it("uses the canonical lifetime focus-session count, not the daily reset counter", async () => {
    (getPebbleCounts as jest.Mock).mockResolvedValue({
      ...basePebbleCounts,        lifetime: 12,
        lifetimeTypes: { task: 2, habit: 1, focus: 3, checklist: 0 },
      });
      // Trap value: the legacy daily-only counter says 99 sessions today.
    await AsyncStorage.setItem(
      "todoapp:focus:stats",
      JSON.stringify({ completedToday: 99, totalFocusTime: 42 }),
    );

    await renderStats();

    expect(dashboardStats().focusSessions).toBe(3);
    expect(dashboardStats().focusTime).toBe(42);
  });

  it("keeps historical/lifetime focus data out of the today-only counter", async () => {
    (getPebbleCounts as jest.Mock).mockResolvedValue({
      ...basePebbleCounts,        lifetime: 12,
        lifetimeTypes: { task: 0, habit: 0, focus: 8, checklist: 0 },
      });
      await AsyncStorage.setItem(
      "todoapp:focus:stats",
      JSON.stringify({ completedToday: 2, totalFocusTime: 0 }),
    );

    await renderStats();

    expect(dashboardStats().focusSessions).toBe(8);
  });

  it("averages the productivity score over the last 90 days of history", async () => {
    await AsyncStorage.setItem(
      "pebble:history",
      JSON.stringify([
        { date: dateKeyDaysAgo(45), score: 100 },
        { date: dateKeyDaysAgo(0), score: 0 },
      ]),
    );

    await renderStats();

    expect(dashboardStats().avgScore).toBe(50);
  });

  function renderedStrings(): string[] {
    return renderer.root
      .findAll((node: any) => {
        const c = node.props?.children;
        return typeof c === "string" || typeof c === "number";
      })
      .map((node: any) => String(node.props.children));
  }

  it("shows the checklist Pebble source alongside every other canonical type", async () => {
    (getPebbleCounts as jest.Mock).mockResolvedValue({
      ...basePebbleCounts,
      lifetime: 10,
      lifetimeTypes: { task: 3, habit: 2, focus: 1, checklist: 4 },
    });

    await renderStats();

    const strings = renderedStrings();
    expect(strings).toEqual(
      expect.arrayContaining(["Checklists", "Tasks", "Habits", "Focus"]),
    );
    expect(strings).toContain("4");
  });

  it("shows the empty state only when there is genuinely no activity", async () => {
    (getPebbleCounts as jest.Mock).mockResolvedValue({ ...basePebbleCounts });

    await renderStats();

    expect(renderedStrings()).toContain("Not enough data yet.");
  });

  it("never renders the unpopulated daily focus rhythm section", async () => {
    (getPebbleCounts as jest.Mock).mockResolvedValue({
      ...basePebbleCounts,
      lifetime: 5,
    });

    await renderStats();

    expect(renderedStrings().join("\n")).not.toMatch(/DAILY FOCUS RHYTHM/);
  });

  it("refreshes focus stats when pebbles_changed is emitted", async () => {
    (getPebbleCounts as jest.Mock)
      .mockResolvedValueOnce({
        ...basePebbleCounts,
        lifetime: 12,
        lifetimeTypes: { task: 0, habit: 0, focus: 1, checklist: 0 },
      })
      .mockResolvedValueOnce({
        ...basePebbleCounts,
        lifetime: 12,
        lifetimeTypes: { task: 0, habit: 0, focus: 5, checklist: 0 },
      });

    await renderStats();
    expect(dashboardStats().focusSessions).toBe(1);

    emitStateChange("pebbles_changed");
    await flushAsync();

    expect(getPebbleCounts).toHaveBeenCalledTimes(2);
    expect(dashboardStats().focusSessions).toBe(5);
  });
});