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
    useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  };
});

const mockPush = jest.fn();

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
import { getProfile } from "@/features/settings/services/settings.service";
import { emitStateChange } from "@/services/events/state-events";

async function flushAsync(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("Today screen profile & pebble data wiring", () => {
  let renderer: any;

  beforeEach(() => {
    jest.clearAllMocks();
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

  it("navigates directly to Pebble Sanctuary when the header Jar is pressed", async () => {
    await renderToday();

    await act(async () => {
      headerProps().onJarPress();
    });

    expect(mockPush).toHaveBeenCalledWith("/sanctuary");
  });
});
