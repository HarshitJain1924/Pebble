import React from "react";
import { act, create } from "react-test-renderer";
import { useTodayActions } from "@/features/today/hooks/useTodayActions";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { ChecklistRepository } from "@/repositories";
import {
  getChecklistItemCompletedForDate,
  getChecklistStats,
} from "@/shared/utils/domain-selectors";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";

let mockStore: Record<string, string> = {};

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockImplementation(async (key) => mockStore[key] || null),
  setItem: jest.fn().mockImplementation(async (key, value) => {
    mockStore[key] = String(value);
    return null;
  }),
  removeItem: jest.fn().mockImplementation(async (key) => {
    delete mockStore[key];
    return null;
  }),
  clear: jest.fn().mockImplementation(async () => {
    mockStore = {};
    return null;
  }),
}));

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning" },
}));

jest.mock("expo-router", () => ({
  useNavigation: () => ({}),
}));

function makeHarness() {
  let api!: ReturnType<typeof useTodayActions>;

  function Harness() {
    api = useTodayActions({
      loadDashboardData: jest.fn(async () => undefined),
      showUndo: jest.fn(),
      setFlyingPebbles: jest.fn(),
      setAllChecklists: jest.fn(),
      gratitudeText: "",
      setGratitudeText: jest.fn(),
      intentionText: "",
      setIntentionText: jest.fn(),
      setIsReviewModalVisible: jest.fn(),
      allTodos: [],
      allHabits: [],
    });
    return null;
  }

  act(() => {
    create(React.createElement(Harness));
  });

  return api;
}

beforeEach(() => {
  mockStore = {};
  jest.clearAllMocks();
});

describe("Today checklist item completion (canonical path)", () => {
  test("non-recurring checklist item toggles the item's global completion state", async () => {
    await EntityCommandService.createChecklist(
      {
        id: "chk-now-simple",
        workspaceId: INBOX_WORKSPACE_ID,
        title: "Prepare presentation",
        items: [
          { id: "it-1", title: "Finish introduction", completed: false },
          { id: "it-2", title: "Finish slides", completed: false },
        ],
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      },
      INBOX_WORKSPACE_ID,
      { skipEvents: true, skipAnalytics: true },
    );

    const api = makeHarness();
    await act(async () => {
      await api.toggleChecklistItemFromDashboard(
        "chk-now-simple",
        "it-1",
        INBOX_WORKSPACE_ID,
      );
    });

    const checklist = (await ChecklistRepository.getChecklists(INBOX_WORKSPACE_ID))[
      "chk-now-simple"
    ];
    expect(checklist.items.find((i) => i.id === "it-1")?.completed).toBe(true);
    expect(getChecklistStats(checklist).completedCount).toBe(1);
    // The next actionable item is the following one.
    expect(checklist.items.find((i) => i.id === "it-2")?.completed).toBe(false);
  });

  test("recurring checklist item completion is recorded against the supplied occurrence date", async () => {
    await EntityCommandService.createChecklist(
      {
        id: "chk-now-recurring",
        workspaceId: INBOX_WORKSPACE_ID,
        title: "Weekly Routine",
        items: [
          { id: "it-1", title: "Step A", completed: false },
          { id: "it-2", title: "Step B", completed: false },
        ],
        schedule: { date: "2026-08-29", startTime: "09:00" },
        recurrence: { frequency: "weekly", interval: 1, daysOfWeek: [6] },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      },
      INBOX_WORKSPACE_ID,
      { skipEvents: true, skipAnalytics: true },
    );

    const api = makeHarness();
    await act(async () => {
      await api.toggleChecklistItemFromDashboard(
        "chk-now-recurring",
        "it-1",
        INBOX_WORKSPACE_ID,
        "2026-08-29",
      );
    });

    const checklist = (await ChecklistRepository.getChecklists(INBOX_WORKSPACE_ID))[
      "chk-now-recurring"
    ];
    // Occurrence-isolated: the master item state must not be mutated...
    expect(checklist.items.find((i) => i.id === "it-1")?.completed).toBe(false);
    // ...and only that occurrence records the completion.
    expect(
      getChecklistItemCompletedForDate(checklist, "it-1", "2026-08-29"),
    ).toBe(true);
    expect(
      getChecklistItemCompletedForDate(checklist, "it-1", "2026-09-05"),
    ).toBe(false);
  });
});
