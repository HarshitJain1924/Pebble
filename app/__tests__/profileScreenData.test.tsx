import React from "react";
import { act, create } from "react-test-renderer";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    Stack: { Screen: () => null },
    useFocusEffect: (cb: any) => {
      React.useEffect(() => cb(), [cb]);
    },
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  };
});

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));

jest.mock("expo-blur", () => ({
  BlurView: () => null,
}));

jest.mock("@expo/vector-icons", () => ({
  Feather: () => null,
}));

jest.mock("@/shared/hooks/useColorScheme", () => ({
  useColorScheme: () => "dark",
}));

jest.mock("@/features/profile/components/RenderAvatar", () => ({
  AVATAR_OPTIONS: [],
  EMOJI_OPTIONS: ["😀"],
  RenderAvatar: () => null,
}));

jest.mock("@/features/profile/components/RankTiersModal", () => ({
  RankTiersModal: "RankTiersModal",
}));

jest.mock("@/shared/components/layout/AmbientBackground", () => ({
  FloatingGlow: () => null,
}));

jest.mock("@/features/habits/services/habit.service", () => ({
  normalizeHabitsForToday: (habits: any[]) => habits,
}));

jest.mock("@/features/profile/services/pebble.service", () => ({
  getPebbleCounts: jest.fn(),
  getGemsBalance: jest.fn(),
}));

jest.mock("@/services/analytics/productivity-history.service", () => ({
  getAllHistory: jest.fn(),
}));

jest.mock("@/features/settings/services/settings.service", () => ({
  getProfile: jest.fn(),
  saveProfile: jest.fn(),
  getLevelInfo: jest.fn().mockReturnValue({
    level: 1,
    xpInCurrentLevel: 0,
    xpNeededForNext: 10,
    progressPct: 0,
    rank: "First Steps",
  }),
}));

jest.mock("@/repositories", () => ({
  WorkspaceRepository: { getWorkspaces: jest.fn() },
  TaskRepository: { getTasks: jest.fn() },
  HabitRepository: { getHabits: jest.fn() },
}));

import ProfileScreen from "@/app/profile";
import {
  WorkspaceRepository,
  TaskRepository,
  HabitRepository,
} from "@/repositories";
import {
  getPebbleCounts,
  getGemsBalance,
} from "@/features/profile/services/pebble.service";
import { getAllHistory } from "@/services/analytics/productivity-history.service";
import { getProfile } from "@/features/settings/services/settings.service";
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

function renderedTextContains(target: string): boolean {
  return (
    renderer.root.findAll((node: any) => {
      const kids = node.props?.children;
      if (kids === undefined || kids === null) return false;
      const flat = Array.isArray(kids)
        ? kids
            .filter((k) => typeof k === "string" || typeof k === "number")
            .join("")
        : String(kids);
      return flat === target || flat.includes(target);
    }).length > 0
  );
}

describe("Profile screen data wiring", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (WorkspaceRepository.getWorkspaces as jest.Mock).mockResolvedValue([]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({});
    (HabitRepository.getHabits as jest.Mock).mockResolvedValue({});
    (getPebbleCounts as jest.Mock).mockResolvedValue({ ...basePebbleCounts });
    (getGemsBalance as jest.Mock).mockResolvedValue(0);
    (getAllHistory as jest.Mock).mockResolvedValue([]);
    (getProfile as jest.Mock).mockResolvedValue({
      name: "Ada",
      email: "ada@pebble.app",
      avatar: "🦉",
    });
  });

  afterEach(() => {
    renderer?.unmount();
  });

  async function renderProfile() {
    await act(async () => {
      renderer = create(<ProfileScreen />);
    });
    await flushAsync();
  }

  it("displays the canonical pebbles-earned-today value in the hero status line", async () => {
    (getPebbleCounts as jest.Mock).mockResolvedValue({
      ...basePebbleCounts,
      today: 3,
    });

    await renderProfile();

    expect(renderedTextContains("+3 pebbles today")).toBe(true);
  });

  it("handles zero pebbles today correctly", async () => {
    await renderProfile();

    expect(renderedTextContains("Ready for today's focus")).toBe(true);
  });

  it("computes Focus Score over the last 90 days (not just the current month)", async () => {
    // A 45-day-old 100% day is inside the 90-day window but outside the
    // current month; today scores 0. The 90-day average is 50 — a
    // current-month-only calculation would wrongly show 0.
    (getAllHistory as jest.Mock).mockResolvedValue([
      { date: dateKeyDaysAgo(45), score: 100 },
      { date: dateKeyDaysAgo(0), score: 0 },
    ]);

    await renderProfile();

    expect(renderedTextContains("50%")).toBe(true);
  });

  it("refreshes today's pebbles when pebbles_changed is emitted", async () => {
    (getPebbleCounts as jest.Mock)
      .mockResolvedValueOnce({ ...basePebbleCounts, today: 1 })
      .mockResolvedValueOnce({ ...basePebbleCounts, today: 4 });

    await renderProfile();
    expect(renderedTextContains("+1 pebble today")).toBe(true);

    emitStateChange("pebbles_changed");
    await flushAsync();

    expect(getPebbleCounts).toHaveBeenCalledTimes(2);
    expect(renderedTextContains("+4 pebbles today")).toBe(true);
  });
});