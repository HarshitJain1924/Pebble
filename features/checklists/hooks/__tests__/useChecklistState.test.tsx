jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("@/repositories", () => ({
  ChecklistRepository: {
    getChecklists: jest.fn(async () => ({})),
  },
}));
jest.mock("@/services/storage/storage.service", () => ({
  addToRecycleBin: jest.fn(async () => undefined),
}));
jest.mock("@/services/events/state-events", () => ({
  emitStateChange: jest.fn(),
}));
jest.mock("@/services/command/EntityCommandService", () => ({
  EntityCommandService: {
    toggleChecklistItem: jest.fn(),
    updateChecklist: jest.fn(async () => ({})),
    createChecklist: jest.fn(async () => ({})),
    recycleChecklist: jest.fn(async () => {}),
  },
}));
jest.mock("@/features/tasks/utils/task-formatting", () => ({
  globalChecklists: {},
}));

import React from "react";
import { act, create } from "react-test-renderer";

import { useChecklistState } from "@/features/checklists/hooks/useChecklistState";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { getTodayDateKey } from "@/shared/utils/date-key";
import type { Checklist } from "@/shared/types/domain.types";

const toggleChecklistItemMock = EntityCommandService.toggleChecklistItem as jest.Mock;

const baseChecklist: Checklist = {
  id: "chk-1",
  workspaceId: "ws-1",
  title: "Grocery Shopping",
  priority: "none",
  items: [
    { id: "i1", title: "Milk", completed: false },
    { id: "i2", title: "Eggs", completed: false },
  ],
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1000,
  updatedAt: 1000,
};

/** Renders the hook and exposes its latest return value. */
const renderHook = () => {
  const ref: { current: ReturnType<typeof useChecklistState> | null } = {
    current: null,
  };

  const Probe = () => {
    ref.current = useChecklistState("ws-1");
    return null;
  };

  let renderer: any;
  act(() => {
    renderer = create(<Probe />);
  });

  return { ref, renderer };
};

describe("useChecklistState checklist completion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("routes a recurring item toggle through the canonical command with today's occurrence", async () => {
    const todayKey = getTodayDateKey();
    const recurring: Checklist = {
      ...baseChecklist,
      recurrence: { frequency: "daily", interval: 1 },
      schedule: { date: todayKey },
    };
    toggleChecklistItemMock.mockResolvedValue({
      previous: recurring,
      updated: recurring,
    });

    const { ref } = renderHook();

    await act(async () => {
      await ref.current!.toggleChecklistItem(recurring, "i1");
    });

    expect(toggleChecklistItemMock).toHaveBeenCalledWith(
      recurring.id,
      "i1",
      "ws-1",
      todayKey,
      { source: "tasks_screen", skipEvents: true, skipAnalytics: true },
    );
    expect(EntityCommandService.updateChecklist).not.toHaveBeenCalled();
  });

  it("keeps the whole-entity update path for non-recurring checklists", async () => {
    const { ref } = renderHook();

    await act(async () => {
      await ref.current!.toggleChecklistItem(baseChecklist, "i2");
    });

    expect(toggleChecklistItemMock).not.toHaveBeenCalled();
    expect(EntityCommandService.updateChecklist).toHaveBeenCalledWith(
      baseChecklist.id,
      "ws-1",
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ id: "i2", completed: true }),
          expect.objectContaining({ id: "i1", completed: false }),
        ]),
      }),
      { skipEvents: true, skipAnalytics: true },
    );
  });

  it("fans a recurring bulk toggle out to per-item occurrence commands", async () => {
    const todayKey = getTodayDateKey();
    const recurring: Checklist = {
      ...baseChecklist,
      recurrence: { frequency: "daily", interval: 1 },
      schedule: { date: todayKey },
      occurrenceHistory: { [todayKey]: { completedItemIds: ["i1"] } },
    };
    toggleChecklistItemMock.mockResolvedValue({
      previous: recurring,
      updated: recurring,
    });

    const { ref } = renderHook();

    await act(async () => {
      await ref.current!.toggleChecklistAllItems(recurring);
    });

    // Only the still-incomplete item is toggled; the completed one is left
    // alone so the occurrence flips to fully complete.
    expect(toggleChecklistItemMock).toHaveBeenCalledTimes(1);
    expect(toggleChecklistItemMock).toHaveBeenCalledWith(
      recurring.id,
      "i2",
      "ws-1",
      todayKey,
      { skipEvents: true, skipAnalytics: true },
    );
    expect(EntityCommandService.updateChecklist).not.toHaveBeenCalled();
  });
});
