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
  TaskRepository,
  WorkspaceRepository,
  UiStateRepository,
} from "@/repositories";
import { Task, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { isRecurringOccurrenceForDate } from "@/services/scheduling/recurrence.service";

describe("Calendar Recurring Task Drag/Drop Semantics (Fix #20)", () => {
  const dailyMasterTask: Task = {
    id: "task-daily-master",
    workspaceId: INBOX_WORKSPACE_ID,
    title: "Study Kubernetes",
    status: "todo",
    priority: "high",
    schedule: { date: "2026-08-25", startTime: "20:00", durationMinutes: 60 },
    recurrence: {
      frequency: "daily",
      interval: 1,
    },
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();

    await WorkspaceRepository.saveWorkspaces([
      { id: "ws-1", name: "Main", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ]);
    await UiStateRepository.saveUiState({ activeWorkspaceId: "ws-1" });
    await TaskRepository.saveTasks([dailyMasterTask], INBOX_WORKSPACE_ID);
  });

  async function renderCalendarHook() {
    let hookResult: ReturnType<typeof useCalendarState> = null as any;
    function TestComponent() {
      hookResult = useCalendarState();
      return null;
    }
    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(TestComponent));
      await new Promise((r) => setTimeout(r, 20));
    });
    return {
      getHook: () => hookResult,
      unmount: async () => {
        await act(async () => {
          renderer.unmount();
        });
      },
    };
  }

  test("Test A: recurring occurrence is recognized and projected on valid dates", async () => {
    const { getHook, unmount } = await renderCalendarHook();

    await act(async () => {
      getHook().setSelectedDate("2026-08-30");
    });

    const item = getHook().timedItemsWithLayout.find((i) => i.id === "task-daily-master");
    expect(item).toBeDefined();
    expect(item?.startHour).toBe(20);
    expect(item?.startMinute).toBe(0);

    await unmount();
  });

  test("Test B & C: rescheduling occurrence invokes rescheduleRecurringOccurrence creating exception + detached task", async () => {
    // Reschedule Aug 30 occurrence to 22:00
    const result = await EntityCommandService.rescheduleRecurringOccurrence(
      dailyMasterTask.id,
      INBOX_WORKSPACE_ID,
      "2026-08-30",
      { hour: 22 },
      { source: "calendar_drag_drop", skipEvents: true },
    );

    // 1. Master task has exception on Aug 30
    expect(result.masterTask.recurrenceExceptions).toContain("2026-08-30");
    expect(result.masterTask.recurrence?.frequency).toBe("daily");

    // 2. Occurrence task is detached with no recurrence
    expect(result.occurrenceTask.recurrence).toBeUndefined();
    expect(result.occurrenceTask.schedule?.date).toBe("2026-08-30");
    expect(result.occurrenceTask.schedule?.startTime).toBe("22:00");

    // 3. Repository contains exactly 2 tasks: master and the single detached occurrence
    const allTasks = await TaskRepository.getTasks(INBOX_WORKSPACE_ID);
    const taskIds = Object.keys(allTasks);
    expect(taskIds.length).toBe(2);
    expect(taskIds).toContain(dailyMasterTask.id);
    expect(taskIds).toContain(result.occurrenceTask.id);
  });

  test("Test D: adjacent occurrences remain completely unaffected", async () => {
    await EntityCommandService.rescheduleRecurringOccurrence(
      dailyMasterTask.id,
      INBOX_WORKSPACE_ID,
      "2026-08-30",
      { hour: 22 },
      { source: "calendar_drag_drop", skipEvents: true },
    );

    const { getHook, unmount } = await renderCalendarHook();

    // Aug 29: Master occurrence is present at 20:00
    await act(async () => {
      getHook().setSelectedDate("2026-08-29");
    });
    const itemAug29 = getHook().timedItemsWithLayout.find((i) => i.id === "task-daily-master");
    expect(itemAug29).toBeDefined();
    expect(itemAug29?.startHour).toBe(20);

    // Aug 30: Master occurrence is suppressed, detached occurrence is at 22:00
    await act(async () => {
      getHook().setSelectedDate("2026-08-30");
    });
    const masterAug30 = getHook().timedItemsWithLayout.find((i) => i.id === "task-daily-master");
    expect(masterAug30).toBeUndefined();
    const detachedAug30 = getHook().timedItemsWithLayout.find((i) => i.id !== "task-daily-master");
    expect(detachedAug30).toBeDefined();
    expect(detachedAug30?.startHour).toBe(22);

    // Aug 31: Master occurrence is present at 20:00
    await act(async () => {
      getHook().setSelectedDate("2026-08-31");
    });
    const itemAug31 = getHook().timedItemsWithLayout.find((i) => i.id === "task-daily-master");
    expect(itemAug31).toBeDefined();
    expect(itemAug31?.startHour).toBe(20);

    await unmount();
  });

  test("Test E: recurrence series boundaries (e.g. endDate) remain enforced on master", async () => {
    const boundedTask: Task = {
      ...dailyMasterTask,
      id: "task-bounded-master",
      recurrence: {
        frequency: "daily",
        interval: 1,
        endDate: "2026-08-31",
      },
    };
    await TaskRepository.saveTask(boundedTask);

    // August 31 is within boundary
    expect(isRecurringOccurrenceForDate(boundedTask, "2026-08-31")).toBe(true);

    // September 1 is after endDate
    expect(isRecurringOccurrenceForDate(boundedTask, "2026-09-01")).toBe(false);

    // Reschedule Aug 30 occurrence
    await EntityCommandService.rescheduleRecurringOccurrence(
      boundedTask.id,
      INBOX_WORKSPACE_ID,
      "2026-08-30",
      { hour: 22 },
      { source: "calendar_drag_drop", skipEvents: true },
    );

    const updatedMaster = await TaskRepository.getTask("task-bounded-master", INBOX_WORKSPACE_ID);
    expect(updatedMaster?.recurrence?.endDate).toBe("2026-08-31");
    expect(isRecurringOccurrenceForDate(updatedMaster!, "2026-09-01")).toBe(false);
  });

  test("Test F: persistence failure preserves master task state without corruption", async () => {
    const saveSpy = jest.spyOn(TaskRepository, "saveTasksUnlocked").mockImplementationOnce(async () => {
      throw new Error("Disk error during recurring occurrence split");
    });

    let threw = false;
    try {
      await EntityCommandService.rescheduleRecurringOccurrence(
        dailyMasterTask.id,
        INBOX_WORKSPACE_ID,
        "2026-08-30",
        { hour: 22 },
      );
    } catch (err: any) {
      threw = true;
      expect(err.message).toBe("Disk error during recurring occurrence split");
    }

    expect(threw).toBe(true);
    saveSpy.mockRestore();

    // Check that master task has no exceptions and no extra task was created
    const allTasks = await TaskRepository.getTasks(INBOX_WORKSPACE_ID);
    expect(Object.keys(allTasks)).toEqual([dailyMasterTask.id]);
    expect(allTasks[dailyMasterTask.id].recurrenceExceptions).toBeUndefined();
  });
});
