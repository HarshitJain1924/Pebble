import React from "react";
import { act, create } from "react-test-renderer";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    useFocusEffect: (cb: any) => {
      React.useEffect(() => cb(), [cb]);
    },
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  };
});

jest.mock("@/features/profile/services/pebble.service", () => ({
  getPebbleCounts: jest.fn(),
  getGemsBalance: jest.fn(),
}));

jest.mock("@/features/settings/services/settings.service", () => ({
  getProfile: jest.fn(),
}));

jest.mock("@/services/storage/storage.service", () => ({
  getDashboardFilters: jest.fn().mockResolvedValue({}),
  saveDashboardFilter: jest.fn().mockResolvedValue(undefined),
  saveDashboardFilters: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/shared/components/ui/UndoContext", () => ({
  useUndo: () => ({ showUndo: jest.fn() }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Sub-components are mocked as strings so we can assert on the props wired in.
jest.mock("@/features/today/components/PebbleCircadianHeader", () => ({
  PebbleCircadianHeader: "PebbleCircadianHeader",
}));
jest.mock("@/features/today/components/PebbleJarProgressCard", () => ({
  PebbleJarProgressCard: "PebbleJarProgressCard",
}));
jest.mock("@/features/today/components/StreakBanner", () => ({
  StreakBanner: "StreakBanner",
}));
jest.mock("@/features/today/components/TodayFilterControl", () => ({
  TodayFilterControl: "TodayFilterControl",
}));
jest.mock("@/features/today/components/WorkspaceSectionedStream", () => ({
  WorkspaceSectionedStream: "WorkspaceSectionedStream",
}));
jest.mock("@/features/today/components/PebbleSanctuaryModal", () => ({
  PebbleSanctuaryModal: "PebbleSanctuaryModal",
}));
jest.mock("@/features/today/components/ZenModeModal", () => ({
  ZenModeModal: "ZenModeModal",
}));
jest.mock("@/features/today/components/ReviewMyDayModal", () => ({
  ReviewMyDayModal: "ReviewMyDayModal",
}));
jest.mock("@/features/today/components/ProjectilePebble", () => ({
  ProjectilePebble: "ProjectilePebble",
}));

// Stable hook return values — if the hook returned a fresh object per render,
// loadDashboardData's identity would change and useFocusEffect would re-fire
// on every render (infinite load loop).
const mockDashboardData = {
  todoStats: {
    pending: [],
    overdue: [],
    completedTasks: [],
    total: 0,
    completed: 0,
  },
  pendingHabits: [],
  completedHabits: [],
  allChecklists: {},
  allResources: [],
  categoryCounts: {},
  habitStats: { total: 0, completed: 0 },
  folders: [],
  mainStreak: 0,
  recoveryInfo: null,
  closestReminderTime: null,
  isLoading: false,
  loadDashboardData: jest.fn().mockResolvedValue(undefined),
};

const mockTodayActions = {
  completeTodoFromDashboard: jest.fn(),
  completeHabitFromDashboard: jest.fn(),
  toggleChecklistItemFromDashboard: jest.fn(),
  handleSaveReview: jest.fn(),
  handleRecoverMainStreak: jest.fn(),
};

const mockTodaySelectors = {
  displayedTodos: [],
  displayedOverdue: [],
  displayedPendingHabits: [],
  displayedCompletedHabits: [],
  groupedTodayTodos: [],
  groupedTodayHabits: [],
  groupedOverdue: [],
  todayFolderGroups: [],
  overdueFolderGroups: [],
  habitsFolderGroups: [],
  continueWorkspace: null,
  activeContexts: [],
  getFolderById: () => undefined,
};

jest.mock("@/features/today/hooks/useTodayDashboard", () => ({
  useTodayDashboard: () => mockDashboardData,
}));

jest.mock("@/features/today/hooks/useTodayActions", () => ({
  useTodayActions: () => mockTodayActions,
}));

jest.mock("@/features/today/hooks/useTodaySelectors", () => ({
  useTodaySelectors: () => mockTodaySelectors,
}));

import TodayScreen from "@/app/(tabs)/index";
import {
  getPebbleCounts,
  getGemsBalance,
} from "@/features/profile/services/pebble.service";
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

async function flushAsync(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("Today screen profile & pebble data wiring", () => {
  let renderer: any;

  beforeEach(() => {
    jest.clearAllMocks();
    (getPebbleCounts as jest.Mock).mockResolvedValue({ ...basePebbleCounts });
    (getGemsBalance as jest.Mock).mockResolvedValue(0);
  });

  afterEach(() => {
    renderer?.unmount();
  });

  async function renderToday() {
    await act(async () => {
      renderer = create(<TodayScreen />);
    });
    await flushAsync();
  }

  function headerProps() {
    return renderer.root.findByType("PebbleCircadianHeader" as any).props;
  }

  function sanctuaryModalProps() {
    return renderer.root.findByType("PebbleSanctuaryModal" as any).props;
  }

  it("loads the persisted profile into Today's header (no generic fallback)", async () => {
    (getProfile as jest.Mock).mockResolvedValue({
      name: "Ada Lovelace",
      email: "ada@pebble.app",
      avatar: "🦉",
    });

    await renderToday();

    const props = headerProps();
    expect(props.title).toBe("Ada Lovelace");
    expect(props.profile?.name).toBe("Ada Lovelace");
    expect(props.profile?.avatar).toBe("🦉");
  });

  it("reloads the profile when profile_changed is emitted", async () => {
    (getProfile as jest.Mock).mockResolvedValue({
      name: "Ada",
      email: "ada@pebble.app",
      avatar: "🦉",
    });
    await renderToday();
    expect(headerProps().title).toBe("Ada");

    (getProfile as jest.Mock).mockResolvedValue({
      name: "Grace",
      email: "grace@pebble.app",
      avatar: "👩‍💻",
    });
    emitStateChange("profile_changed");
    await flushAsync();

    expect(headerProps().title).toBe("Grace");
  });

  it("does not render PebbleJarProgressCard or StreakBanner on Today", async () => {
    await renderToday();
    expect(renderer.root.findAllByType("PebbleJarProgressCard" as any).length).toBe(0);
    expect(renderer.root.findAllByType("StreakBanner" as any).length).toBe(0);
  });

  it("opens the Pebble Sanctuary modal when header Jar is pressed", async () => {
    await renderToday();
    expect(sanctuaryModalProps().visible).toBe(false);

    await act(async () => {
      headerProps().onJarPress();
    });

    expect(sanctuaryModalProps().visible).toBe(true);
  });

  it("wires pebble stats to the Pebble Sanctuary modal", async () => {
    (getPebbleCounts as jest.Mock).mockResolvedValue({
      ...basePebbleCounts,
      lifetime: 42,
      monthly: 15,
      monthlyTypes: { task: 8, habit: 4, focus: 2, checklist: 1 },
    });

    await renderToday();

    expect(sanctuaryModalProps().lifetimePebbles).toBe(42);
    expect(sanctuaryModalProps().monthlyPebbles).toBe(15);
    expect(sanctuaryModalProps().monthlyTypes).toEqual({
      task: 8,
      habit: 4,
      focus: 2,
      checklist: 1,
    });
  });

  it("refreshes pebble stats in the Sanctuary modal when pebbles_changed is emitted", async () => {
    (getPebbleCounts as jest.Mock)
      .mockResolvedValueOnce({ ...basePebbleCounts, lifetime: 10, monthly: 5 })
      .mockResolvedValueOnce({ ...basePebbleCounts, lifetime: 20, monthly: 12 });

    await renderToday();
    expect(sanctuaryModalProps().lifetimePebbles).toBe(10);
    expect(sanctuaryModalProps().monthlyPebbles).toBe(5);

    emitStateChange("pebbles_changed");
    await flushAsync();

    expect(getPebbleCounts).toHaveBeenCalledTimes(2);
    expect(sanctuaryModalProps().lifetimePebbles).toBe(20);
    expect(sanctuaryModalProps().monthlyPebbles).toBe(12);
  });
});
