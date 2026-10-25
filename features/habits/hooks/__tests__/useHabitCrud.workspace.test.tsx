/**
 * useHabitCrud workspace routing.
 *
 * The habit toggle used `selectedWorkspaceId` as the target partition. That id
 * can diverge from the habit's own workspace (modal-driven flows write it
 * separately), and the command then returns `null` for a habit that lives in
 * another partition — a silent no-op indistinguishable from success, with the
 * checkbox reverting on the next reload.
 */
import React from "react";
import { act, create } from "react-test-renderer";

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: "Success" },
  ImpactFeedbackStyle: { Light: "Light", Medium: "Medium" },
}));

jest.mock("@/services/command/EntityCommandService", () => ({
  EntityCommandService: {
    completeHabit: jest.fn(),
    uncompleteHabit: jest.fn(),
    updateHabit: jest.fn(),
  },
}));

jest.mock("@/services/scheduling/reminders.service", () => ({
  cancelReminderIds: jest.fn(async () => undefined),
  rescheduleHabitReminders: jest.fn(async () => undefined),
}));

jest.mock("@/services/storage/storage.service", () => ({
  addToRecycleBin: jest.fn(async () => undefined),
  getRecycleBinItems: jest.fn(async () => []),
  saveRecycleBinItems: jest.fn(async () => undefined),
}));

jest.mock("@/services/analytics/widget-data.service", () => ({
  syncWidgetData: jest.fn(async () => undefined),
}));

jest.mock("@/services/analytics/productivity-history.service", () => ({
  recordDailyHistorySnapshot: jest.fn(async () => undefined),
}));

jest.mock("@/services/events/state-events", () => ({
  emitStateChange: jest.fn(),
}));

jest.mock("@/repositories", () => ({ HabitRepository: {} }));

jest.mock("@/plugin", () => ({
  pluginManager: { dispatchHabitCompleted: jest.fn() },
}));

import { useHabitCrud } from "@/features/habits/hooks/useHabitCrud";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import type { Habit } from "@/shared/types/domain.types";

const habit: Habit = {
  id: "habit-1",
  workspaceId: "ws-other",
  title: "Evening walk",
  recurrence: { frequency: "daily", interval: 1 },
  completionHistory: [],
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
} as Habit;

let api: ReturnType<typeof useHabitCrud> | null = null;

function Harness({ selectedWorkspaceId }: { selectedWorkspaceId: string }) {
  api = useHabitCrud({
    habits: [habit],
    setHabits: jest.fn(),
    selectedWorkspaceId,
    workspaces: [],
    showUndo: jest.fn(),
    showToast: jest.fn(),
  });
  return null;
}

describe("useHabitCrud habit completion workspace routing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api = null;
  });

  it("targets the habit's own workspace, not the selected workspace", async () => {
    (EntityCommandService.completeHabit as jest.Mock).mockResolvedValue({
      previous: habit,
      updated: habit,
    });

    let renderer: any;
    await act(async () => {
      renderer = create(<Harness selectedWorkspaceId="ws-selected" />);
    });

    await act(async () => {
      await api!.toggleHabit("habit-1");
    });

    expect(EntityCommandService.completeHabit).toHaveBeenCalledWith(
      "habit-1",
      "ws-other",
      expect.objectContaining({ source: "tasks_screen" }),
    );
    expect(EntityCommandService.completeHabit).not.toHaveBeenCalledWith(
      "habit-1",
      "ws-selected",
      expect.anything(),
    );

    act(() => renderer.unmount());
  });

  it("falls back to Inbox only when the habit has no workspace", async () => {
    const inboxHabit = { ...habit, id: "habit-inbox", workspaceId: undefined } as unknown as Habit;
    (EntityCommandService.completeHabit as jest.Mock).mockResolvedValue({
      previous: inboxHabit,
      updated: inboxHabit,
    });

    function InboxHarness() {
      api = useHabitCrud({
        habits: [inboxHabit],
        setHabits: jest.fn(),
        selectedWorkspaceId: "ws-selected",
        workspaces: [],
        showUndo: jest.fn(),
        showToast: jest.fn(),
      });
      return null;
    }

    let renderer: any;
    await act(async () => {
      renderer = create(<InboxHarness />);
    });

    await act(async () => {
      await api!.toggleHabit("habit-inbox");
    });

    expect(EntityCommandService.completeHabit).toHaveBeenCalledWith(
      "habit-inbox",
      "inbox",
      expect.anything(),
    );

    act(() => renderer.unmount());
  });
});
