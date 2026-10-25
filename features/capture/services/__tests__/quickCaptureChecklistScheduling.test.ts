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

describe("Quick Capture → Checklist Scheduling Regression Suite (A-W)", () => {
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
      priority: "none",
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

  test("N: Checklist captured with recurrence anchors to today's date key and sets recurring rule", async () => {
    const captureItem: ParsedProductivityItem = {
      type: "checklist",
      title: "Weekly Maintenance",
      items: ["Check oil", "Wipe down counters"],
      recurrence: {
        type: "weekly",
        interval: 1,
        days: [1], // Monday
      },
      confidence: 0.95,
    };

    const saved = await saveParsedItem(captureItem, INBOX_WORKSPACE_ID);
    const checklist = saved as Checklist;

    expect(checklist.recurrence).toBeDefined();
    expect(checklist.recurrence?.frequency).toBe("weekly");
    expect(checklist.recurrence?.interval).toBe(1);
    expect(checklist.recurrence?.daysOfWeek).toEqual([1]);
    expect(checklist.schedule).toBeDefined();
    expect(checklist.schedule?.allDay).toBe(true);
    expect(checklist.schedule?.date).toBeDefined();
  });

  test("O: Checklist captured with explicitReminder: false leaves reminder undefined even when time is specified", async () => {
    const captureItem: ParsedProductivityItem = {
      type: "checklist",
      title: "Evening Routine",
      items: ["Lock doors", "Set alarm"],
      date: "2026-09-02",
      time: "21:00",
      explicitReminder: false,
      confidence: 0.9,
    };

    const saved = await saveParsedItem(captureItem, INBOX_WORKSPACE_ID);
    const checklist = saved as Checklist;

    expect(checklist.schedule?.startTime).toBe("21:00");
    expect(checklist.reminder).toBeUndefined();
  });

  test("P: Ordinary checklist with no scheduling language retains clean unscheduled state", async () => {
    const captureItem: ParsedProductivityItem = {
      type: "checklist",
      title: "Reading List",
      items: ["Designing Data-Intensive Applications", "Clean Code"],
      confidence: 0.9,
    };

    const saved = await saveParsedItem(captureItem, INBOX_WORKSPACE_ID);
    const checklist = saved as Checklist;

    expect(checklist.schedule).toBeUndefined();
    expect(checklist.recurrence).toBeUndefined();
    expect(checklist.reminder).toBeUndefined();
  });

  // ── Phase 2: Multi-week recurrence interval parsing and persistence ──

  test("Q: Numeric multi-week interval recurrence parsing and persistence", async () => {
    // 1. every 2 weeks
    const parsed2w = parseProductivityText("Checklist every 2 weeks\n- Item 1\n- Item 2");
    expect(parsed2w.type).toBe("checklist");
    expect(parsed2w.title).toBe("Checklist");
    expect(parsed2w.recurrence?.type).toBe("weekly");
    expect(parsed2w.recurrence?.interval).toBe(2);
    expect(parsed2w.items).toEqual(["Item 1", "Item 2"]);

    const saved2w = (await saveParsedItem(parsed2w, INBOX_WORKSPACE_ID)) as Checklist;
    expect(saved2w.recurrence?.frequency).toBe("weekly");
    expect(saved2w.recurrence?.interval).toBe(2);

    // 2. every 1 week
    const parsed1w = parseProductivityText("Checklist every 1 week\n- Item 1");
    expect(parsed1w.recurrence?.interval).toBe(1);

    // 3. every 3 weeks
    const parsed3w = parseProductivityText("Checklist every 3 weeks\n- Item 1");
    expect(parsed3w.recurrence?.interval).toBe(3);

    // 4. every 2 wks
    const parsed2wks = parseProductivityText("Checklist every 2 wks\n- Item 1");
    expect(parsed2wks.recurrence?.interval).toBe(2);

    // 5. every Monday
    const parsedMon = parseProductivityText("Checklist every Monday\n- Item 1");
    expect(parsedMon.recurrence?.type).toBe("weekly");
    expect(parsedMon.recurrence?.days).toEqual([1]);

    // 6. every weekday
    const parsedWkdays = parseProductivityText("Checklist every weekday\n- Item 1");
    expect(parsedWkdays.recurrence?.type).toBe("weekdays");

    // 7. Non-recurring title: "Weekly review"
    const parsedWeeklyReview = parseProductivityText("Weekly review");
    expect(parsedWeeklyReview.recurrence).toBeUndefined();
    expect(parsedWeeklyReview.title).toBe("Weekly review");
  });

  // ── Phase 3: Duration extraction and normalization ──

  test("R: Explicit duration extraction, hour-to-minute normalization, and title cleaning", async () => {
    // 1. 45 minutes
    const parsed45 = parseProductivityText("Study plan at 10:30 AM for 45 minutes");
    expect(parsed45.type).toBe("task");
    expect(parsed45.title).toBe("Study plan");
    expect(parsed45.time).toBe("10:30");
    expect(parsed45.durationMinutes).toBe(45);

    const savedTask45 = (await saveParsedItem(parsed45, INBOX_WORKSPACE_ID)) as Task;
    expect(savedTask45.schedule?.startTime).toBe("10:30");
    expect(savedTask45.schedule?.durationMinutes).toBe(45);

    // 2. 90 minutes
    const parsed90 = parseProductivityText("Study plan at 10:30 AM for 90 minutes");
    expect(parsed90.durationMinutes).toBe(90);
    expect(parsed90.title).toBe("Study plan");

    // 3. 2 hours -> 120 minutes
    const parsed2h = parseProductivityText("Study plan at 10:30 AM for 2 hours");
    expect(parsed2h.durationMinutes).toBe(120);
    expect(parsed2h.title).toBe("Study plan");

    // 4. 1 hr -> 60 minutes
    const parsed1hr = parseProductivityText("Study plan at 10:30 AM for 1 hr");
    expect(parsed1hr.durationMinutes).toBe(60);

    // 5. Checklist with duration
    const parsedChkDur = parseProductivityText("Checklist at 10:30 AM for 45 minutes\n- Item 1");
    expect(parsedChkDur.type).toBe("checklist");
    expect(parsedChkDur.title).toBe("Checklist");
    expect(parsedChkDur.time).toBe("10:30");
    expect(parsedChkDur.durationMinutes).toBe(45);

    const savedChkDur = (await saveParsedItem(parsedChkDur, INBOX_WORKSPACE_ID)) as Checklist;
    expect(savedChkDur.schedule?.startTime).toBe("10:30");
    expect(savedChkDur.schedule?.durationMinutes).toBe(45);

    // 6. Reminder offset must NOT be interpreted as duration
    const parsedReminderNotDur = parseProductivityText("Checklist tomorrow at 9 AM and remind me 30 minutes before");
    expect(parsedReminderNotDur.reminderOffsetMinutes).toBe(30);
    expect(parsedReminderNotDur.durationMinutes).toBeUndefined();

    // 7. All-day item with no duration
    const parsedAllDayNoDur = parseProductivityText("Checklist tomorrow");
    expect(parsedAllDayNoDur.durationMinutes).toBeUndefined();

    // 8. Title containing a number but no duration expression
    const parsedNumberInTitle = parseProductivityText("Plan project with 3 team members");
    expect(parsedNumberInTitle.durationMinutes).toBeUndefined();
    expect(parsedNumberInTitle.title).toBe("Plan project with 3 team members");
  });

  // ── Phase 4: False-positive recurrence detection on adjective 'Everyday' ──

  test("S: Everyday essentials and adjectives do not trigger false daily recurrence", async () => {
    // 1. Everyday essentials with bullet items
    const parsedEssentials = parseProductivityText("Everyday essentials\n- Keys\n- Wallet");
    expect(parsedEssentials.type).toBe("checklist");
    expect(parsedEssentials.title).toBe("Everyday essentials");
    expect(parsedEssentials.recurrence).toBeUndefined();
    expect(parsedEssentials.items).toEqual(["Keys", "Wallet"]);

    // 2. Create a checklist called Everyday essentials
    const parsedCalledEssentials = parseProductivityText("Create a checklist called Everyday essentials\n- Keys\n- Wallet");
    expect(parsedCalledEssentials.type).toBe("checklist");
    expect(parsedCalledEssentials.title).toBe("Everyday essentials");
    expect(parsedCalledEssentials.recurrence).toBeUndefined();

    // 3. Checklist every day (directive)
    const parsedEveryDay = parseProductivityText("Checklist every day\n- Item 1");
    expect(parsedEveryDay.type).toBe("checklist");
    expect(parsedEveryDay.recurrence?.type).toBe("daily");

    // 4. Checklist daily (directive)
    const parsedDaily = parseProductivityText("Checklist daily\n- Item 1");
    expect(parsedDaily.type).toBe("checklist");
    expect(parsedDaily.recurrence?.type).toBe("daily");

    // 5. Review everyday essentials tomorrow
    const parsedReview = parseProductivityText("Review everyday essentials tomorrow");
    expect(parsedReview.type).toBe("task");
    expect(parsedReview.title).toBe("Review everyday essentials");
    expect(parsedReview.recurrence).toBeUndefined();
    expect(parsedReview.date).toBeDefined();
  });

  // ── Phase 5: Single-line Checklist intent recognition ──

  test("T: Single-line explicit Checklist intent recognition and schedule mapping", async () => {
    // 1. Create a checklist for tomorrow
    const parsedTomorrow = parseProductivityText("Create a checklist for tomorrow");
    expect(parsedTomorrow.type).toBe("checklist");
    expect(parsedTomorrow.title).toBe("Checklist");
    expect(parsedTomorrow.date).toBeDefined();
    expect(parsedTomorrow.time).toBeUndefined();

    const savedTomorrow = (await saveParsedItem(parsedTomorrow, INBOX_WORKSPACE_ID)) as Checklist;
    expect(savedTomorrow.schedule).toBeDefined();
    expect(savedTomorrow.schedule?.allDay).toBe(true);
    expect(savedTomorrow.schedule?.startTime).toBeUndefined();

    // 2. Create a checklist tomorrow at 9 AM
    const parsedTimed = parseProductivityText("Create a checklist tomorrow at 9 AM");
    expect(parsedTimed.type).toBe("checklist");
    expect(parsedTimed.title).toBe("Checklist");
    expect(parsedTimed.date).toBeDefined();
    expect(parsedTimed.time).toBe("09:00");

    const savedTimed = (await saveParsedItem(parsedTimed, INBOX_WORKSPACE_ID)) as Checklist;
    expect(savedTimed.schedule?.startTime).toBe("09:00");
    expect(savedTimed.schedule?.allDay).toBeUndefined();

    // 3. Create a checklist (no date/time) -> no invented schedule
    const parsedNoSched = parseProductivityText("Create a checklist");
    expect(parsedNoSched.type).toBe("checklist");
    expect(parsedNoSched.title).toBe("Checklist");
    expect(parsedNoSched.date).toBeUndefined();
    expect(parsedNoSched.time).toBeUndefined();

    const savedNoSched = (await saveParsedItem(parsedNoSched, INBOX_WORKSPACE_ID)) as Checklist;
    expect(savedNoSched.schedule).toBeUndefined();

    // 4. Checklist: prepare for travel tomorrow
    const parsedPrep = parseProductivityText("Checklist: prepare for travel tomorrow");
    expect(parsedPrep.type).toBe("checklist");
    expect(parsedPrep.title).toBe("Prepare for travel");
    expect(parsedPrep.date).toBeDefined();

    // 5. Create a todo list for tomorrow
    const parsedTodoList = parseProductivityText("Create a todo list for tomorrow");
    expect(parsedTodoList.type).toBe("checklist");
    expect(parsedTodoList.title).toBe("Checklist");
    expect(parsedTodoList.date).toBeDefined();

    // 6. Regular task: Study plan at 8 PM -> remains Task
    const parsedTask = parseProductivityText("Study plan at 8 PM");
    expect(parsedTask.type).toBe("task");
    expect(parsedTask.title).toBe("Study plan");
    expect(parsedTask.time).toBe("20:00");
  });

  // ── Phase 6: Semantic Acceptance Suite (15 Required Cases & Explicit Overrides) ──

  test("U: Semantic Acceptance Suite (All 15 Canonical Cases)", async () => {
    // 1. Create a checklist for tomorrow
    const c1 = parseProductivityText("Create a checklist for tomorrow");
    expect(c1.type).toBe("checklist");
    expect(c1.title).toBe("Checklist");
    expect(c1.date).toBeDefined();
    expect(c1.time).toBeUndefined();
    expect(c1.items).toEqual([]);

    // 2. Create a checklist tomorrow at 9 AM
    const c2 = parseProductivityText("Create a checklist tomorrow at 9 AM");
    expect(c2.type).toBe("checklist");
    expect(c2.title).toBe("Checklist");
    expect(c2.date).toBeDefined();
    expect(c2.time).toBe("09:00");
    expect(c2.items).toEqual([]);

    // 3. Travel preparation\n- Pack clothes\n- Charge power bank
    const c3 = parseProductivityText("Travel preparation\n- Pack clothes\n- Charge power bank");
    expect(c3.type).toBe("checklist");
    expect(c3.title).toBe("Travel preparation");
    expect(c3.items).toEqual(["Pack clothes", "Charge power bank"]);

    // 4. Create a checklist called Everyday essentials\n- Keys\n- Wallet
    const c4 = parseProductivityText("Create a checklist called Everyday essentials\n- Keys\n- Wallet");
    expect(c4.type).toBe("checklist");
    expect(c4.title).toBe("Everyday essentials");
    expect(c4.recurrence).toBeUndefined();
    expect(c4.items).toEqual(["Keys", "Wallet"]);

    // 5. Study plan tomorrow at 9 AM
    const c5 = parseProductivityText("Study plan tomorrow at 9 AM");
    expect(c5.type).toBe("task");
    expect(c5.title).toBe("Study plan");
    expect(c5.date).toBeDefined();
    expect(c5.time).toBe("09:00");

    // 6. Study plan tomorrow at 9 AM for 90 minutes
    const c6 = parseProductivityText("Study plan tomorrow at 9 AM for 90 minutes");
    expect(c6.type).toBe("task");
    expect(c6.title).toBe("Study plan");
    expect(c6.date).toBeDefined();
    expect(c6.time).toBe("09:00");
    expect(c6.durationMinutes).toBe(90);

    // 7. Checklist every 2 weeks\n- Review progress\n- Plan next steps
    const c7 = parseProductivityText("Checklist every 2 weeks\n- Review progress\n- Plan next steps");
    expect(c7.type).toBe("checklist");
    expect(c7.recurrence?.type).toBe("weekly");
    expect(c7.recurrence?.interval).toBe(2);
    expect(c7.items).toEqual(["Review progress", "Plan next steps"]);

    // 8. Checklist every Monday\n- Prepare agenda
    const c8 = parseProductivityText("Checklist every Monday\n- Prepare agenda");
    expect(c8.type).toBe("checklist");
    expect(c8.recurrence?.type).toBe("weekly");
    expect(c8.recurrence?.days).toEqual([1]);
    expect(c8.items).toEqual(["Prepare agenda"]);

    // 9. Weekly review\n- Check goals\n- Update plan
    const c9 = parseProductivityText("Weekly review\n- Check goals\n- Update plan");
    expect(c9.type).toBe("checklist");
    expect(c9.title).toBe("Weekly review");
    expect(c9.recurrence).toBeUndefined();
    expect(c9.items).toEqual(["Check goals", "Update plan"]);

    // 10. Checklist tomorrow at 9 AM and remind me 30 minutes before\n- Prepare materials
    const c10 = parseProductivityText("Checklist tomorrow at 9 AM and remind me 30 minutes before\n- Prepare materials");
    expect(c10.type).toBe("checklist");
    expect(c10.date).toBeDefined();
    expect(c10.time).toBe("09:00");
    expect(c10.reminderOffsetMinutes).toBe(30);
    expect(c10.items).toEqual(["Prepare materials"]);

    // 11. Checklist tomorrow and remind me at 8 PM\n- Prepare materials
    const c11 = parseProductivityText("Checklist tomorrow and remind me at 8 PM\n- Prepare materials");
    expect(c11.type).toBe("checklist");
    expect(c11.date).toBeDefined();
    expect(c11.time).toBeUndefined(); // All-day: no invented start time
    expect(c11.reminderTime).toBe("20:00");
    expect(c11.items).toEqual(["Prepare materials"]);

    // 12. Create a checklist tomorrow at 9 AM without a reminder
    const c12 = parseProductivityText("Create a checklist tomorrow at 9 AM without a reminder");
    expect(c12.type).toBe("checklist");
    expect(c12.date).toBeDefined();
    expect(c12.time).toBe("09:00");
    expect(c12.explicitReminder).toBe(false);

    // 13. Create a checklist about planning tomorrow's trip
    const c13 = parseProductivityText("Create a checklist about planning tomorrow's trip");
    expect(c13.type).toBe("checklist");
    expect(c13.title).toBe("Planning tomorrow's trip");
    expect(c13.date).toBeUndefined(); // No date parsed from possessive
    expect(c13.items).toEqual([]);

    // 14. Create a checklist
    const c14 = parseProductivityText("Create a checklist");
    expect(c14.type).toBe("checklist");
    expect(c14.title).toBe("Checklist");
    expect(c14.date).toBeUndefined();
    expect(c14.items).toEqual([]);

    // 15. Study at 8 PM
    const c15 = parseProductivityText("Study at 8 PM");
    expect(c15.type).toBe("task");
    expect(c15.title).toBe("Study");
    expect(c15.time).toBe("20:00");
  });

  test("V: Multiline task containment and explicit type override", async () => {
    // When text is multiline but explicit type is task
    const multilineText = "Prepare project proposal\n- Outline architecture\n- Estimate timeline";
    const asTask = parseProductivityText(multilineText, { explicitType: "task" });
    expect(asTask.type).toBe("task");
    expect(asTask.title).toBe("Prepare project proposal");
    expect(asTask.description).toBe("- Outline architecture\n- Estimate timeline");
    expect(asTask.items).toBeUndefined();

    // Verify entity factory maps description to Task entity
    const taskEntity = buildTask(asTask, INBOX_WORKSPACE_ID);
    expect(taskEntity.title).toBe("Prepare project proposal");
    expect(taskEntity.description).toBe("- Outline architecture\n- Estimate timeline");
    expect(taskEntity.id.startsWith("task-")).toBe(true);

    // When text is explicitly checklist but has no items
    const emptyChecklist = parseProductivityText("Create a checklist", { explicitType: "checklist" });
    expect(emptyChecklist.type).toBe("checklist");
    expect(emptyChecklist.items).toEqual([]);
    const checklistEntity = buildChecklist(emptyChecklist, INBOX_WORKSPACE_ID);
    expect(checklistEntity.title).toBe("Checklist");
    expect(checklistEntity.items).toEqual([]);
    expect(checklistEntity.id.startsWith("checklist-")).toBe(true);

    // Saving empty checklist works cleanly
    const saved = await saveParsedItem(emptyChecklist, INBOX_WORKSPACE_ID);
    expect(saved.id).toBeDefined();
    expect((saved as Checklist).items).toEqual([]);
  });

  test("W: Multi-week weekday selection survives entity construction and persistence", async () => {
    const parsed = parseProductivityText(
      "Checklist every 2 weeks on Tuesdays and Thursdays\n- Item 1\n- Item 2",
    );
    expect(parsed.type).toBe("checklist");
    expect(parsed.title).toBe("Checklist");
    expect(parsed.recurrence).toEqual({
      type: "weekly",
      interval: 2,
      days: [2, 4],
    });
    expect(parsed.items).toEqual(["Item 1", "Item 2"]);

    // Entity construction maps parser recurrence → canonical RecurrenceRule.
    const entity = buildChecklist(parsed, INBOX_WORKSPACE_ID);
    expect(entity.recurrence).toEqual(
      expect.objectContaining({
        frequency: "weekly",
        interval: 2,
        daysOfWeek: [2, 4],
      }),
    );

    // Persistence keeps the same days and a clean title.
    const saved = (await saveParsedItem(parsed, INBOX_WORKSPACE_ID)) as Checklist;
    expect(saved.title).toBe("Checklist");
    expect(saved.recurrence).toEqual(
      expect.objectContaining({
        frequency: "weekly",
        interval: 2,
        daysOfWeek: [2, 4],
      }),
    );
    expect(saved.items.map((i) => i.title)).toEqual(["Item 1", "Item 2"]);

    // A one-week interval with explicit weekdays persists as interval 1.
    const weekly = parseProductivityText(
      "Checklist every week on Tuesdays and Thursdays",
    );
    expect(weekly.recurrence?.days).toEqual([2, 4]);
    const savedWeekly = (await saveParsedItem(
      weekly,
      INBOX_WORKSPACE_ID,
    )) as Checklist;
    expect(savedWeekly.recurrence).toEqual(
      expect.objectContaining({
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [2, 4],
      }),
    );

    // A single weekday with a multi-week interval keeps both the day and interval.
    const single = parseProductivityText(
      "Checklist every 3 weeks on Tuesdays",
    );
    expect(single.recurrence?.days).toEqual([2]);
    const savedSingle = (await saveParsedItem(
      single,
      INBOX_WORKSPACE_ID,
    )) as Checklist;
    expect(savedSingle.recurrence).toEqual(
      expect.objectContaining({
        frequency: "weekly",
        interval: 3,
        daysOfWeek: [2],
      }),
    );
  });

  test("X: Quick Capture extracts and persists inline checklist items from natural language (End-to-End)", async () => {
    const input =
      "Create a checklist for tomorrow at 2 AM: Pack for the trip, Charge my laptop, Download tickets, Pack headphones, and Check my ID.";
    const parsed = parseProductivityText(input);

    expect(parsed.type).toBe("checklist");
    expect(parsed.title).toBe("Pack for the trip");
    expect(parsed.items).toEqual([
      "Pack for the trip",
      "Charge my laptop",
      "Download tickets",
      "Pack headphones",
      "Check my ID",
    ]);
    expect(parsed.time).toBe("02:00");
    expect(parsed.date).toBeDefined();

    const saved = (await saveParsedItem(parsed, INBOX_WORKSPACE_ID)) as Checklist;
    expect(saved.id.startsWith("checklist-")).toBe(true);
    expect(saved.title).toBe("Pack for the trip");
    expect(saved.items.length).toBe(5);
    expect(saved.items.map((i) => i.title)).toEqual([
      "Pack for the trip",
      "Charge my laptop",
      "Download tickets",
      "Pack headphones",
      "Check my ID",
    ]);
    expect(saved.items.every((i) => i.completed === false)).toBe(true);
    expect(saved.schedule).toBeDefined();
    expect(saved.schedule?.startTime).toBe("02:00");
    expect(saved.schedule?.durationMinutes).toBe(45);
    expect(saved.reminder?.enabled).toBe(true);
    expect(saved.reminder?.triggerAt).toBeDefined();

    // Verify persisted entity in repository
    const storedChecklists = await ChecklistRepository.getChecklists(INBOX_WORKSPACE_ID);
    const persisted = storedChecklists[saved.id];
    expect(persisted).toBeDefined();
    expect(persisted.title).toBe("Pack for the trip");
    expect(persisted.items.length).toBe(5);
    expect(persisted.items.map((i) => i.title)).toEqual([
      "Pack for the trip",
      "Charge my laptop",
      "Download tickets",
      "Pack headphones",
      "Check my ID",
    ]);
  });

  test("Y: Quick Capture does not convert ordinary comma-separated task into checklist and persists as Task", async () => {
    const input = "Buy apples, oranges, and bananas tomorrow at 3 PM";
    const parsed = parseProductivityText(input);

    expect(parsed.type).toBe("task");
    expect(parsed.title).toBe("Buy apples, oranges, and bananas");
    expect(parsed.items).toBeUndefined();
    expect(parsed.time).toBe("15:00");

    const saved = (await saveParsedItem(parsed, INBOX_WORKSPACE_ID)) as Task;
    expect(saved.id.startsWith("task-")).toBe(true);
    expect(saved.title).toBe("Buy apples, oranges, and bananas");
    expect((saved as any).items).toBeUndefined();

    const storedTasks = await TaskRepository.getTasks(INBOX_WORKSPACE_ID);
    expect(storedTasks[saved.id]).toBeDefined();
    expect(storedTasks[saved.id].title).toBe("Buy apples, oranges, and bananas");
  });
});



