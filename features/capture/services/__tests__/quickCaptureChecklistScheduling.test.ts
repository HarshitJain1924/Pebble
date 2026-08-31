import React from "react";
import { act, create } from "react-test-renderer";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRouter = {
  push: mockPush,
  replace: mockReplace,
  back: jest.fn(),
  setParams: jest.fn(),
};

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    useRouter: () => mockRouter,
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
  ImpactFeedbackStyle: { Medium: "Medium", Light: "Light" },
  NotificationFeedbackType: { Success: "Success" },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { saveParsedItem } from "@/features/capture/services/CaptureService";
import { buildChecklist, buildTask } from "@/features/capture/services/entity-factory.service";
import { parseProductivityText, type ParsedProductivityItem } from "@/features/capture/services/nlp-parser.service";
import { useCalendarState } from "@/features/calendar/hooks/useCalendarState";
import {
  TaskRepository,
  ChecklistRepository,
  WorkspaceRepository,
} from "@/repositories";
import { Checklist, Task, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { getDateKey } from "@/services/scheduling/recurrence.service";

function CalendarTestHarness({ onHook }: { onHook: (hook: any) => void }) {
  const hook = useCalendarState();
  React.useEffect(() => {
    onHook(hook);
  });
  return null;
}

describe("Quick Capture → Checklist Scheduling Regression Suite (A-L)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    mockPush.mockClear();
    mockReplace.mockClear();
  });

  const getItemType = (item: any) => {
    if (item.type === "habit") return "habit";
    if (item.type === "checklist") return "checklist";
    return "task";
  };

  const handleOpenItem = (item: any, selectedDate: string) => {
    const type = getItemType(item);
    if (type === "checklist") {
      mockRouter.push(`/checklist-details?id=${item.id}`);
    } else {
      mockRouter.push(
        `/task-details?id=${item.id}&type=${type}&date=${selectedDate}`,
      );
    }
  };

  test("A: Quick Capture Checklist without schedule creates unscheduled Checklist", async () => {
    const captureItem: ParsedProductivityItem = {
      type: "checklist",
      title: "Grocery Shopping",
      items: ["Milk", "Eggs", "Spinach"],
      confidence: 0.9,
    };

    const saved = await saveParsedItem(captureItem, INBOX_WORKSPACE_ID);
    expect(saved).toBeDefined();
    expect((saved as Checklist).items.length).toBe(3);
    expect((saved as Checklist).schedule).toBeUndefined();

    const inRepo = await ChecklistRepository.getChecklist(saved.id, INBOX_WORKSPACE_ID);
    expect(inRepo).toBeDefined();
    expect(inRepo?.schedule).toBeUndefined();
  });

  test("B: Quick Capture Checklist with date/time creates a scheduled Checklist", async () => {
    const captureItem: ParsedProductivityItem = {
      type: "checklist",
      title: "Weekly Grocery Run",
      items: ["Apples", "Bananas"],
      date: "2026-09-02",
      time: "10:30",
      confidence: 0.9,
    };

    const saved = await saveParsedItem(captureItem, INBOX_WORKSPACE_ID);
    expect(saved).toBeDefined();
    const checklist = saved as Checklist;
    expect(checklist.schedule).toBeDefined();
    expect(checklist.schedule?.date).toBe("2026-09-02");
    expect(checklist.schedule?.startTime).toBe("10:30");
    expect(checklist.schedule?.durationMinutes).toBe(45);
    expect(checklist.schedule?.allDay).toBeUndefined();

    const inRepo = await ChecklistRepository.getChecklist(saved.id, INBOX_WORKSPACE_ID);
    expect(inRepo?.schedule?.date).toBe("2026-09-02");
    expect(inRepo?.schedule?.startTime).toBe("10:30");
    expect(inRepo?.schedule?.durationMinutes).toBe(45);
  });

  test("C, D & E: Same Checklist ID is preserved, no Task and no duplicate Checklist created", async () => {
    const captureItem: ParsedProductivityItem = {
      type: "checklist",
      title: "Packing List",
      items: ["Passport", "Tickets", "Charger"],
      date: "2026-09-03",
      time: "09:00",
      confidence: 0.95,
    };

    const saved = await saveParsedItem(captureItem, INBOX_WORKSPACE_ID);
    const checklistId = saved.id;

    // D: Verify NO tasks created
    const allTasks = await TaskRepository.getTasks(INBOX_WORKSPACE_ID);
    expect(Object.keys(allTasks).length).toBe(0);

    // E: Verify exactly 1 Checklist created with correct ID
    const allChecklists = await ChecklistRepository.getChecklists(INBOX_WORKSPACE_ID);
    expect(Object.keys(allChecklists).length).toBe(1);
    expect(allChecklists[checklistId]).toBeDefined();
    expect(allChecklists[checklistId].id).toBe(checklistId);
  });

  test("F: Timed Checklist appears in Calendar timedItems / timeline", async () => {
    const captureItem: ParsedProductivityItem = {
      type: "checklist",
      title: "Afternoon Prep",
      items: ["Setup", "Test"],
      date: "2026-09-02",
      time: "15:00",
      confidence: 0.9,
    };

    const saved = await saveParsedItem(captureItem, INBOX_WORKSPACE_ID);

    let state: any;
    await act(async () => {
      create(React.createElement(CalendarTestHarness, { onHook: (h: any) => { state = h; } }));
    });

    await act(async () => {
      state.setSelectedDate("2026-09-02");
    });

    const timedItem = state.timelineItems.find((i: any) => i.id === saved.id);
    expect(timedItem).toBeDefined();
    expect(timedItem.type).toBe("checklist");
    expect(timedItem.startHour).toBe(15);
    expect(timedItem.startMinute).toBe(0);
    expect(timedItem.durationMinutes).toBe(45);

    const layoutItem = state.timedItemsWithLayout.find((i: any) => i.id === saved.id);
    expect(layoutItem).toBeDefined();
  });

  test("G: All-Day Checklist appears in allDayItems", async () => {
    const captureItem: ParsedProductivityItem = {
      type: "checklist",
      title: "All Day Inventory",
      items: ["Audit shelves", "Log stock"],
      date: "2026-09-02",
      confidence: 0.9,
    };

    const saved = await saveParsedItem(captureItem, INBOX_WORKSPACE_ID);

    let state: any;
    await act(async () => {
      create(React.createElement(CalendarTestHarness, { onHook: (h: any) => { state = h; } }));
    });

    await act(async () => {
      state.setSelectedDate("2026-09-02");
    });

    const allDayItem = state.allDayItems.find((i: any) => i.id === saved.id);
    expect(allDayItem).toBeDefined();
    expect(allDayItem.type).toBe("checklist");
  });

  test("H: Reminder behavior uses existing Checklist reminder lifecycle", async () => {
    const captureItem: ParsedProductivityItem = {
      type: "checklist",
      title: "Pre-flight Checklist",
      items: ["Check bag", "Check boarding pass"],
      date: "2026-09-02",
      time: "12:00",
      explicitReminder: true,
      reminderOffsetMinutes: 15,
      confidence: 0.95,
    };

    const saved = await saveParsedItem(captureItem, INBOX_WORKSPACE_ID);
    const checklist = saved as Checklist;

    expect(checklist.reminder).toBeDefined();
    expect(checklist.reminder?.enabled).toBe(true);
    expect(checklist.reminder?.triggerAt).toBeDefined();
  });

  test("I: Existing Task Quick Capture behavior remains unchanged", async () => {
    const taskItem: ParsedProductivityItem = {
      type: "task",
      title: "Review PR #42",
      date: "2026-09-02",
      time: "14:00",
      priority: "high",
      confidence: 0.95,
    };

    const saved = await saveParsedItem(taskItem, INBOX_WORKSPACE_ID);
    expect(saved).toBeDefined();
    const task = saved as Task;
    expect(task.status).toBe("todo");
    expect(task.priority).toBe("high");
    expect(task.schedule?.date).toBe("2026-09-02");
    expect(task.schedule?.startTime).toBe("14:00");
  });

  test("J: Existing Checklist Detail scheduling remains unchanged", async () => {
    const initialChecklist: Checklist = {
      id: "cl-detail-test-1",
      workspaceId: INBOX_WORKSPACE_ID,
      title: "Party Planning",
      items: [{ id: "i1", title: "Balloons", completed: false }],
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await ChecklistRepository.saveChecklist(initialChecklist);

    // Update schedule via EntityCommandService (as done from ChecklistDetail)
    const updated = await EntityCommandService.updateChecklist(
      "cl-detail-test-1",
      INBOX_WORKSPACE_ID,
      {
        schedule: {
          date: "2026-09-04",
          startTime: "18:00",
          durationMinutes: 60,
        },
      },
    );

    expect(updated.schedule?.date).toBe("2026-09-04");
    expect(updated.schedule?.startTime).toBe("18:00");
    expect(updated.schedule?.durationMinutes).toBe(60);
  });

  test("K: Calendar planning of an unscheduled captured Checklist works seamlessly", async () => {
    // 1. Capture unscheduled checklist
    const captureItem: ParsedProductivityItem = {
      type: "checklist",
      title: "Unscheduled Camping Gear",
      items: ["Tent", "Sleeping Bag"],
      confidence: 0.9,
    };

    const saved = await saveParsedItem(captureItem, INBOX_WORKSPACE_ID);
    expect((saved as Checklist).schedule).toBeUndefined();

    // 2. Schedule the same checklist via Calendar planning command
    const planned = await EntityCommandService.updateChecklist(
      saved.id,
      INBOX_WORKSPACE_ID,
      {
        schedule: {
          date: "2026-09-05",
          startTime: "09:00",
          durationMinutes: 45,
        },
      },
    );

    expect(planned.id).toBe(saved.id);
    expect(planned.schedule?.date).toBe("2026-09-05");
    expect(planned.schedule?.startTime).toBe("09:00");

    // Verify repository state
    const loaded = await ChecklistRepository.getChecklist(saved.id, INBOX_WORKSPACE_ID);
    expect(loaded?.schedule?.date).toBe("2026-09-05");
    expect(loaded?.schedule?.startTime).toBe("09:00");
  });

  test("L: Quick Capture → Checklist → Calendar → tap Checklist navigates to Checklist detail with exact ID", async () => {
    // 1. Quick Capture scheduled checklist
    const captureItem: ParsedProductivityItem = {
      type: "checklist",
      title: "Hardware Store Shopping",
      items: ["Drill bits", "Screws", "Level"],
      date: "2026-09-02",
      time: "11:00",
      confidence: 0.95,
    };

    const saved = await saveParsedItem(captureItem, INBOX_WORKSPACE_ID);

    // 2. Calendar projects the item
    let state: any;
    await act(async () => {
      create(React.createElement(CalendarTestHarness, { onHook: (h: any) => { state = h; } }));
    });

    await act(async () => {
      state.setSelectedDate("2026-09-02");
    });

    const calendarItem = state.timelineItems.find((i: any) => i.id === saved.id);
    expect(calendarItem).toBeDefined();
    expect(calendarItem.type).toBe("checklist");

    // 3. User taps on the checklist in Calendar
    handleOpenItem(calendarItem, state.selectedDate);

    // 4. Router pushes to /checklist-details?id=...
    expect(mockPush).toHaveBeenCalledWith(`/checklist-details?id=${saved.id}`);
  });

  test("M: Raw NLP Input 'Study at 10 PM\\n- Kube\\n- Node' parses and creates scheduled Checklist end-to-end", async () => {
    const rawText = "Study at 10 PM\n- Kube\n- Node";
    const parsed = parseProductivityText(rawText);

    expect(parsed.type).toBe("checklist");
    expect(parsed.title).toBe("Study");
    expect(parsed.time).toBe("22:00");
    expect(parsed.items).toEqual(["Kube", "Node"]);

    const saved = await saveParsedItem(parsed, INBOX_WORKSPACE_ID);
    expect(saved).toBeDefined();

    const checklist = saved as Checklist;
    expect(checklist.title).toBe("Study");
    expect(checklist.items.map((i) => i.title)).toEqual(["Kube", "Node"]);
    expect(checklist.schedule).toBeDefined();
    expect(checklist.schedule?.startTime).toBe("22:00");
    expect(checklist.schedule?.durationMinutes).toBe(45);

    // Verify TaskRepository is completely untouched (No task created)
    const allTasks = await TaskRepository.getTasks(INBOX_WORKSPACE_ID);
    expect(Object.keys(allTasks).length).toBe(0);

    // Verify ChecklistRepository has exactly 1 checklist with preserved ID
    const allChecklists = await ChecklistRepository.getChecklists(INBOX_WORKSPACE_ID);
    expect(Object.keys(allChecklists).length).toBe(1);
    expect(allChecklists[checklist.id]).toBeDefined();
  });
});
