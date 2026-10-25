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
  ImpactFeedbackStyle: { Medium: "Medium" },
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
import { parseProductivityText } from "@/features/capture/services/nlp-parser.service";
import { buildTask } from "@/features/capture/services/entity-factory.service";
import { getTodayDateKey } from "@/shared/utils/date-key";
import { getStructuredSchedule } from "@/services/scheduling/scheduling.service";

describe("Calendar Timed Task Placement Timezone Invariants (Fix #16)", () => {
  const taskMidnight: Task = {
    id: "task-midnight",
    workspaceId: INBOX_WORKSPACE_ID,
    title: "Midnight Task",
    status: "todo",
    priority: "medium",
    schedule: { date: "2026-08-31", startTime: "00:30", durationMinutes: 60 },
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  const taskLateEvening: Task = {
    id: "task-late-evening",
    workspaceId: INBOX_WORKSPACE_ID,
    title: "Late Evening Task",
    status: "todo",
    priority: "high",
    schedule: { date: "2026-08-31", startTime: "23:30", durationMinutes: 30 },
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

    await TaskRepository.saveTasks([taskMidnight, taskLateEvening], INBOX_WORKSPACE_ID);
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

  test("Test A: shortly after midnight (00:30) placed on 2026-08-31 with startHour=0, startMinute=30", async () => {
    const { getHook, unmount } = await renderCalendarHook();

    // Select August 31
    await act(async () => {
      getHook().setSelectedDate("2026-08-31");
    });

    const midnightItem = getHook().timelineItems.find((i) => i.id === "task-midnight");
    expect(midnightItem).toBeDefined();
    expect(midnightItem?.startHour).toBe(0);
    expect(midnightItem?.startMinute).toBe(30);
    expect(midnightItem?.timeLabel).toBe("12:30 AM");

    // Verify it does NOT appear on August 30 (previous day)
    await act(async () => {
      getHook().setSelectedDate("2026-08-30");
    });
    expect(getHook().timelineItems.find((i) => i.id === "task-midnight")).toBeUndefined();

    // Verify it does NOT appear on September 1 (next day)
    await act(async () => {
      getHook().setSelectedDate("2026-09-01");
    });
    expect(getHook().timelineItems.find((i) => i.id === "task-midnight")).toBeUndefined();

    await unmount();
  });

  test("Test B: late evening (23:30) placed on 2026-08-31 with startHour=23, startMinute=30", async () => {
    const { getHook, unmount } = await renderCalendarHook();

    // Select August 31
    await act(async () => {
      getHook().setSelectedDate("2026-08-31");
    });

    const lateEveningItem = getHook().timelineItems.find((i) => i.id === "task-late-evening");
    expect(lateEveningItem).toBeDefined();
    expect(lateEveningItem?.startHour).toBe(23);
    expect(lateEveningItem?.startMinute).toBe(30);
    expect(lateEveningItem?.timeLabel).toBe("11:30 PM");

    // Verify it does NOT appear on August 30
    await act(async () => {
      getHook().setSelectedDate("2026-08-30");
    });
    expect(getHook().timelineItems.find((i) => i.id === "task-late-evening")).toBeUndefined();

    // Verify it does NOT appear on September 1
    await act(async () => {
      getHook().setSelectedDate("2026-09-01");
    });
    expect(getHook().timelineItems.find((i) => i.id === "task-late-evening")).toBeUndefined();

    await unmount();
  });

  test("Test C: canonical scenario 'Study Kubernetes at 8 PM' produces schedule on today at 20:00", async () => {
    const parsed = parseProductivityText("Study Kubernetes at 8 PM");
    const task = buildTask(parsed);
    const today = getTodayDateKey();

    expect(task.title).toBe("Study Kubernetes");
    expect(task.schedule?.date).toBe(today);
    expect(task.schedule?.startTime).toBe("20:00");

    const sched = getStructuredSchedule(task);
    expect(sched.startTime).toEqual({ hour: 20, minute: 0 });
    expect(sched.sortKey).toBe(1200); // 20 * 60
  });

  test("Test D: timezone boundary wall-clock schedule preserves literal date and time values", () => {
    const wallClockSchedule = {
      date: "2026-08-31",
      startTime: "00:05",
      durationMinutes: 45,
    };

    const task: Task = {
      id: "t-boundary",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Boundary Test",
      status: "todo",
      priority: "low",
      schedule: wallClockSchedule,
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    const sched = getStructuredSchedule(task);
    expect(sched.startDate).toBe("2026-08-31");
    expect(sched.startTime).toEqual({ hour: 0, minute: 5 });
    expect(sched.sortKey).toBe(5);
  });
});
