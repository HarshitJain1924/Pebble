import React from "react";
import { act, create } from "react-test-renderer";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), setParams: jest.fn() }),
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: any) => {
      React.useEffect(() => {
        cb();
      }, [cb]);
    },
  };
});

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Medium: "Medium", Light: "Light" },
  NotificationFeedbackType: { Success: "Success" },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCalendarState } from "@/features/calendar/hooks/useCalendarState";
import {
  ChecklistRepository,
  WorkspaceRepository,
  UiStateRepository,
} from "@/repositories";
import { Checklist, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { isRecurringOccurrenceForDate } from "@/services/scheduling/recurrence.service";
import {
  isChecklistCompletedForDate,
  getChecklistItemCompletedForDate,
  getChecklistCompletedItemsCountForDate,
} from "@/shared/utils/domain-selectors";

function HookTestHarness({ onHook }: { onHook: (hook: any) => void }) {
  const hook = useCalendarState();
  React.useEffect(() => {
    onHook(hook);
  });
  return null;
}

describe("Schedulable Checklist Entity Architectural Tests", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  test("1. One-time scheduled Checklist appears on Calendar timeline with accurate time and duration", async () => {
    const checklist: Checklist = {
      id: "cl-onetime-1",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Grocery Run",
      items: [
        { id: "item-1", title: "Milk", completed: false },
        { id: "item-2", title: "Eggs", completed: false },
      ],
      schedule: {
        date: "2026-09-01",
        startTime: "10:30",
        durationMinutes: 45,
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    await ChecklistRepository.saveChecklist(checklist);

    let state: any;
    await act(async () => {
      create(React.createElement(HookTestHarness, { onHook: (h: any) => { state = h; } }));
    });

    await act(async () => {
      state.setSelectedDate("2026-09-01");
    });

    const item = state.timelineItems.find((i: any) => i.id === "cl-onetime-1");
    expect(item).toBeDefined();
    expect(item.type).toBe("checklist");
    expect(item.startHour).toBe(10);
    expect(item.startMinute).toBe(30);
    expect(item.durationMinutes).toBe(45);
    expect(item.timeLabel).toBe("10:30 AM");
    expect(item.itemsCount).toBe(2);
    expect(item.completedItemsCount).toBe(0);
    expect(item.completed).toBe(false);
  });

  test("2. All-day scheduled Checklist appears in allDayItems section", async () => {
    const checklist: Checklist = {
      id: "cl-allday-1",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Weekly Review Prep",
      items: [{ id: "item-1", title: "Review goals", completed: false }],
      schedule: {
        date: "2026-09-01",
        allDay: true,
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    await ChecklistRepository.saveChecklist(checklist);

    let state: any;
    await act(async () => {
      create(React.createElement(HookTestHarness, { onHook: (h: any) => { state = h; } }));
    });

    await act(async () => {
      state.setSelectedDate("2026-09-01");
    });

    const allDay = state.allDayItems.find((i: any) => i.id === "cl-allday-1");
    expect(allDay).toBeDefined();
    expect(allDay.type).toBe("checklist");
    expect(allDay.timeLabel).toBe("All Day");
    expect(allDay.startHour).toBeUndefined();
  });

  test("3. Recurring Checklist expands across recurrence rule dates", async () => {
    const weeklyMasterChecklist: Checklist = {
      id: "cl-weekly-master",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Weekend Meal Prep",
      items: [
        { id: "item-1", title: "Vegetables", completed: false },
        { id: "item-2", title: "Rice", completed: false },
      ],
      schedule: {
        date: "2026-08-29",
        startTime: "11:00",
        durationMinutes: 60,
      },
      recurrence: {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [6],
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    await ChecklistRepository.saveChecklist(weeklyMasterChecklist);

    expect(isRecurringOccurrenceForDate(weeklyMasterChecklist, "2026-08-29")).toBe(true);
    expect(isRecurringOccurrenceForDate(weeklyMasterChecklist, "2026-09-05")).toBe(true);
    expect(isRecurringOccurrenceForDate(weeklyMasterChecklist, "2026-08-30")).toBe(false);

    let state: any;
    await act(async () => {
      create(React.createElement(HookTestHarness, { onHook: (h: any) => { state = h; } }));
    });

    await act(async () => {
      state.setSelectedDate("2026-08-29");
    });
    expect(state.timelineItems.some((i: any) => i.id === "cl-weekly-master")).toBe(true);

    await act(async () => {
      state.setSelectedDate("2026-09-05");
    });
    expect(state.timelineItems.some((i: any) => i.id === "cl-weekly-master")).toBe(true);
  });

  test("4. Recurring Checklist: per-occurrence item completion is completely isolated", async () => {
    const recurringChecklist = await EntityCommandService.createChecklist({
      id: "cl-isolated-test",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Weekly Routine",
      items: [
        { id: "it-1", title: "Step A", completed: false },
        { id: "it-2", title: "Step B", completed: false },
      ],
      schedule: {
        date: "2026-08-29",
        startTime: "09:00",
      },
      recurrence: {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [6],
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    });

    await EntityCommandService.toggleChecklistItem(
      recurringChecklist.id,
      "it-1",
      INBOX_WORKSPACE_ID,
      "2026-08-29",
    );

    const afterAug29Map = await ChecklistRepository.getChecklists(INBOX_WORKSPACE_ID);
    const updated = afterAug29Map[recurringChecklist.id];

    expect(updated.items[0].completed).toBe(false);
    expect(updated.items[1].completed).toBe(false);

    expect(getChecklistItemCompletedForDate(updated, "it-1", "2026-08-29")).toBe(true);
    expect(getChecklistItemCompletedForDate(updated, "it-2", "2026-08-29")).toBe(false);
    expect(getChecklistCompletedItemsCountForDate(updated, "2026-08-29")).toBe(1);
    expect(isChecklistCompletedForDate(updated, "2026-08-29")).toBe(false);

    expect(getChecklistItemCompletedForDate(updated, "it-1", "2026-09-05")).toBe(false);
    expect(getChecklistItemCompletedForDate(updated, "it-2", "2026-09-05")).toBe(false);
    expect(getChecklistCompletedItemsCountForDate(updated, "2026-09-05")).toBe(0);
    expect(isChecklistCompletedForDate(updated, "2026-09-05")).toBe(false);

    await EntityCommandService.toggleChecklistItem(
      recurringChecklist.id,
      "it-2",
      INBOX_WORKSPACE_ID,
      "2026-08-29",
    );

    const fullyDoneMap = await ChecklistRepository.getChecklists(INBOX_WORKSPACE_ID);
    const fullyDone = fullyDoneMap[recurringChecklist.id];

    expect(isChecklistCompletedForDate(fullyDone, "2026-08-29")).toBe(true);
    expect(isChecklistCompletedForDate(fullyDone, "2026-09-05")).toBe(false);
  });

  test("5. Rescheduling a recurring Checklist occurrence detaches that occurrence cleanly without duplicating", async () => {
    const recurringChecklist = await EntityCommandService.createChecklist({
      id: "cl-detach-test",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Saturday Cleaning",
      items: [
        { id: "it-1", title: "Vacuum", completed: false },
        { id: "it-2", title: "Dust", completed: false },
      ],
      schedule: {
        date: "2026-08-29",
        startTime: "10:00",
        durationMinutes: 60,
      },
      recurrence: {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [6],
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    });

    const { masterChecklist, occurrenceChecklist } =
      await EntityCommandService.rescheduleChecklistRecurringOccurrence(
        recurringChecklist.id,
        INBOX_WORKSPACE_ID,
        "2026-08-29",
        { hour: 14, minute: 0 },
      );

    expect(masterChecklist.recurrenceExceptions).toContain("2026-08-29");
    expect(masterChecklist.recurrence).toBeDefined();

    expect(occurrenceChecklist.recurrence).toBeUndefined();
    expect(occurrenceChecklist.schedule?.startTime).toBe("14:00");
    expect(occurrenceChecklist.schedule?.date).toBe("2026-08-29");
    expect(occurrenceChecklist.items.length).toBe(2);

    const all = await ChecklistRepository.getChecklists(INBOX_WORKSPACE_ID);
    expect(Object.keys(all).length).toBe(2);
    expect(all[masterChecklist.id].recurrenceExceptions).toContain("2026-08-29");
    expect(all[occurrenceChecklist.id].schedule?.startTime).toBe("14:00");

    expect(isRecurringOccurrenceForDate(all[masterChecklist.id], "2026-08-29")).toBe(false);
    expect(isRecurringOccurrenceForDate(all[masterChecklist.id], "2026-09-05")).toBe(true);
  });

  test("6. One-time Checklist drag drop hour and date update", async () => {
    const checklist = await EntityCommandService.createChecklist({
      id: "cl-move-test",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Car Maintenance",
      items: [{ id: "it-1", title: "Oil change", completed: false }],
      schedule: {
        date: "2026-09-01",
        startTime: "09:00",
        durationMinutes: 60,
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    });

    let state: any;
    await act(async () => {
      create(React.createElement(HookTestHarness, { onHook: (h: any) => { state = h; } }));
    });

    await act(async () => {
      state.setSelectedDate("2026-09-01");
    });

    act(() => {
      state.handleDragStart(
        {
          id: checklist.id,
          type: "checklist",
          workspaceId: INBOX_WORKSPACE_ID,
        },
        0,
        0,
      );
      state.setHoveredHour(15);
    });

    await act(async () => {
      await state.handleDrop();
    });

    const updated = await ChecklistRepository.getChecklist(checklist.id, INBOX_WORKSPACE_ID);
    expect(updated?.schedule?.startTime).toBe("15:00");
  });

  test("7. Lifecycle: Recycling a Checklist removes it from Calendar, Restoring brings it back", async () => {
    const checklist = await EntityCommandService.createChecklist({
      id: "cl-lifecycle-test",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "To Be Recycled",
      items: [{ id: "it-1", title: "Test", completed: false }],
      schedule: {
        date: "2026-09-01",
        startTime: "11:00",
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    });

    let state: any;
    await act(async () => {
      create(React.createElement(HookTestHarness, { onHook: (h: any) => { state = h; } }));
    });

    await act(async () => {
      state.setSelectedDate("2026-09-01");
    });

    expect(state.timelineItems.some((i: any) => i.id === checklist.id)).toBe(true);

    await act(async () => {
      await EntityCommandService.recycleChecklist(checklist.id, INBOX_WORKSPACE_ID);
    });

    expect(state.timelineItems.some((i: any) => i.id === checklist.id)).toBe(false);

    await act(async () => {
      await EntityCommandService.restoreChecklist(checklist.id);
    });

    expect(state.timelineItems.some((i: any) => i.id === checklist.id)).toBe(true);
    const restored = state.timelineItems.find((i: any) => i.id === checklist.id);
    expect(restored.timeLabel).toBe("11:00 AM");
  });
});
