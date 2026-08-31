import React from "react";
import { act, create } from "react-test-renderer";

jest.mock("@react-native-async-storage/async-storage", () => {
  const store: Record<string, string> = {};
  return {
    __store: store,
    getItem: jest.fn().mockImplementation(async (key: string) => store[key] || null),
    setItem: jest.fn().mockImplementation(async (key: string, value: any) => {
      store[key] = String(value);
      return null;
    }),
    removeItem: jest.fn().mockImplementation(async (key: string) => {
      delete store[key];
      return null;
    }),
    clear: jest.fn().mockImplementation(async () => {
      for (const k in store) delete store[k];
      return null;
    }),
  };
});

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), setParams: jest.fn() }),
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: any) => {
      React.useEffect(() => {
        cb();
      }, []);
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
import { parseProductivityText } from "@/features/capture/services/nlp-parser.service";
import { saveParsedItem } from "@/features/capture/services/CaptureService";
import { TaskRepository, WorkspaceRepository, UiStateRepository } from "@/repositories";
import { Task, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { getDateKey } from "@/services/scheduling/recurrence.service";

const flushPromises = () => new Promise((r) => setImmediate(r));

// These tests mount real React hooks, flush async storage, and schedule
// notifications — they are inherently slower than unit tests.
jest.setTimeout(15000);

describe("Pebble Fix #9: End-to-End Timed Task → Calendar Integration", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    await WorkspaceRepository.saveWorkspaces([
      { id: "ws-1", name: "Main", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ]);
    await UiStateRepository.saveUiState({ activeWorkspaceId: "ws-1" });
  });

  test("1. End-to-End: 'Study Kubernetes at 8 PM' traverses Quick Capture → Command/Persistence → State Event → Calendar Timeline", async () => {
    const todayKey = getDateKey();

    let state: ReturnType<typeof useCalendarState> | undefined;
    function TestHarness() {
      state = useCalendarState();
      return null;
    }

    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(TestHarness));
      await flushPromises();
    });

    // Verify calendar initial state is clean
    expect(state?.allTodos).toEqual([]);
    expect(state?.timedItemsWithLayout).toEqual([]);

    // 1. Natural Language Parse through real Quick Capture NLP pipeline
    const parsed = parseProductivityText("Study Kubernetes at 8 PM");
    expect(parsed.type).toBe("task");
    expect(parsed.time).toBe("20:00");
    expect(parsed.explicitReminder).toBeFalsy();

    // 2. Real Capture Pipeline execution: saveParsedItem -> EntityCommandService.createTask -> TaskRepository.saveTaskUnlocked -> emitStateChange("tasks_changed")
    let savedEntity: any;
    await act(async () => {
      savedEntity = await saveParsedItem(parsed, INBOX_WORKSPACE_ID);
      await flushPromises();
    });

    // 3. Assertion 1: Persisted Task in TaskRepository
    const persistedTask = await TaskRepository.getTask(savedEntity.id, INBOX_WORKSPACE_ID);
    expect(persistedTask).not.toBeNull();
    expect(persistedTask?.id).toBe(savedEntity.id);
    expect(persistedTask?.title).toBe("Study Kubernetes");
    expect(persistedTask?.workspaceId).toBe(INBOX_WORKSPACE_ID);
    expect(persistedTask?.schedule?.date).toBe(todayKey);
    expect(persistedTask?.schedule?.startTime).toBe("20:00");

    // 4. Assertion 2: Reminder separation (absent reminder)
    expect(persistedTask?.reminder).toBeUndefined();

    // 5. Assertion 3: Entity Identity (Task entity, not an Event)
    expect(persistedTask?.status).toBe("todo");
    expect((persistedTask as any).type).toBeUndefined();

    // 6. Assertion 4 & 5: Calendar State Update via tasks_changed event & Timeline Projection
    expect(state?.selectedDate).toBe(todayKey);
    expect(state?.allTodos.some((t) => t.id === savedEntity.id)).toBe(true);

    const timedItems = state?.timedItemsWithLayout || [];
    const calendarTask = timedItems.find((item) => item.id === savedEntity.id);
    expect(calendarTask).toBeDefined();
    expect(calendarTask?.title).toBe("Study Kubernetes");
    expect(calendarTask?.type).toBe("task");
    expect(calendarTask?.startHour).toBe(20);
    expect(calendarTask?.startMinute).toBe(0);
    expect(calendarTask?.rawHours).toBe(20);
    expect(calendarTask?.timeLabel).toBe("8:00 PM");
    expect(calendarTask?.durationMinutes).toBe(60);

    // Verify timeline geometry: 20:00 -> 20 * 80 = 1600px top
    const computedTop = (calendarTask?.rawHours ?? 0) * 80;
    expect(computedTop).toBe(1600);

    // Verify it is in the timed layout, not in all-day items
    expect(state?.allDayItems.some((item) => item.id === savedEntity.id)).toBe(false);

    await act(async () => {
      renderer.unmount();
    });
  });

  test("2. End-to-End: Timed Task with explicit reminder preserves both schedule.startTime and reminder.triggerAt", async () => {
    const todayKey = getDateKey();

    let state: ReturnType<typeof useCalendarState> | undefined;
    function TestHarness() {
      state = useCalendarState();
      return null;
    }

    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(TestHarness));
      await flushPromises();
    });

    const parsed = parseProductivityText("Study Kubernetes at 8 PM, remind me 30 minutes before");
    expect(parsed.type).toBe("task");
    expect(parsed.time).toBe("20:00");
    expect(parsed.reminderOffsetMinutes).toBe(30);

    let savedEntity: any;
    await act(async () => {
      savedEntity = await saveParsedItem(parsed, INBOX_WORKSPACE_ID);
      await flushPromises();
    });

    const persistedTask = await TaskRepository.getTask(savedEntity.id, INBOX_WORKSPACE_ID);
    expect(persistedTask?.schedule?.date).toBe(todayKey);
    expect(persistedTask?.schedule?.startTime).toBe("20:00");
    expect(persistedTask?.reminder?.enabled).toBe(true);
    expect(persistedTask?.reminder?.triggerAt).toBeDefined();

    // Verify Calendar Timeline places at schedule.startTime (20:00), not the 19:30 reminder
    const timedItems = state?.timedItemsWithLayout || [];
    const calendarTask = timedItems.find((item) => item.id === savedEntity.id);
    expect(calendarTask?.startHour).toBe(20);
    expect(calendarTask?.startMinute).toBe(0);
    expect(calendarTask?.rawHours).toBe(20);

    await act(async () => {
      renderer.unmount();
    });
  });

  test("3. End-to-End: Unscheduled capture item lands in inbox and is not on the timed calendar grid", async () => {
    let state: ReturnType<typeof useCalendarState> | undefined;
    function TestHarness() {
      state = useCalendarState();
      return null;
    }

    let renderer: any;
    await act(async () => {
      renderer = create(React.createElement(TestHarness));
      await flushPromises();
    });

    const parsed = parseProductivityText("Refactor database schema");
    expect(parsed.time).toBeUndefined();

    let savedEntity: any;
    await act(async () => {
      savedEntity = await saveParsedItem(parsed, INBOX_WORKSPACE_ID);
      await flushPromises();
    });

    const persistedTask = await TaskRepository.getTask(savedEntity.id, INBOX_WORKSPACE_ID);
    expect(persistedTask?.schedule?.date).toBe("inbox");
    expect(persistedTask?.schedule?.startTime).toBeUndefined();

    // It must NOT appear on today's timed calendar grid
    const timedItems = state?.timedItemsWithLayout || [];
    expect(timedItems.some((item) => item.id === savedEntity.id)).toBe(false);

    await act(async () => {
      renderer.unmount();
    });
  });
});
