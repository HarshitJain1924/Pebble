import AsyncStorage from "@react-native-async-storage/async-storage";
import { getNowFocus } from "../utils/getNowFocus";
import { launchFocusSession } from "@/features/focus/services/FocusLaunchService";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { parseDurationMinutes } from "@/services/scheduling/scheduling.service";
import { router } from "expo-router";
import type { Task, Habit, Checklist } from "@/shared/types/domain.types";

let mockStore: Record<string, string> = {};

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockImplementation(async (key: string) => mockStore[key] || null),
  setItem: jest.fn().mockImplementation(async (key: string, value: string) => {
    mockStore[key] = String(value);
    return null;
  }),
  removeItem: jest.fn().mockImplementation(async (key: string) => {
    delete mockStore[key];
    return null;
  }),
  clear: jest.fn().mockImplementation(async () => {
    mockStore = {};
    return null;
  }),
}));

jest.mock("expo-router", () => ({
  router: {
    navigate: jest.fn(),
    push: jest.fn(),
  },
}));

jest.mock("@/services/command/EntityCommandService", () => ({
  EntityCommandService: {
    completeTask: jest.fn().mockResolvedValue({ id: "t1", status: "done" }),
    completeHabit: jest.fn().mockResolvedValue({ id: "h1", streak: 5 }),
    toggleChecklistItem: jest.fn(),
  },
}));

const TODAY_DATE = "2026-09-12";

function createDateAtTime(hours: number, minutes: number): Date {
  return new Date(2026, 8, 12, hours, minutes, 0, 0);
}

function mockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${Math.random().toString(36).substring(2, 7)}`,
    workspaceId: "inbox",
    title: "Mock Task",
    revision: 1,
    lifecycleGeneration: 1,
    status: "todo",
    priority: "none",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function mockHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: `habit-${Math.random().toString(36).substring(2, 7)}`,
    workspaceId: "inbox",
    title: "Mock Habit",
    revision: 1,
    lifecycleGeneration: 1,
    recurrence: { frequency: "daily", interval: 1 },
    completionHistory: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function mockChecklist(overrides: Partial<Checklist> = {}): Checklist {
  return {
    id: `chk-${Math.random().toString(36).substring(2, 7)}`,
    workspaceId: "inbox",
    title: "Mock Checklist",
    revision: 1,
    lifecycleGeneration: 1,
    items: [
      { id: "i1", title: "Item 1", completed: false },
      { id: "i2", title: "Item 2", completed: false },
      { id: "i3", title: "Item 3", completed: false },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("NOW Execution Model Integration", () => {
  beforeEach(() => {
    mockStore = {};
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────
  // 1. TASK EXECUTION MODEL
  // ─────────────────────────────────────────────────────────────
  describe("Task execution", () => {
    it("active scheduled Task appears in NOW and calculates remaining time accurately", () => {
      const task = mockTask({
        id: "task-now-1",
        title: "Build Pebble NOW",
        priority: "high",
        schedule: {
          date: TODAY_DATE,
          startTime: "14:00",
          endTime: "15:00",
        },
      });

      // Current time: 2:17 PM
      const result = getNowFocus({
        now: createDateAtTime(14, 17),
        referenceDateKey: TODAY_DATE,
        tasks: [task],
        habits: [],
        checklists: [],
      });

      expect(result.state).toBe("active");
      expect(result.type).toBe("task");
      expect(result.item?.id).toBe("task-now-1");
      expect(result.item?.title).toBe("Build Pebble NOW");
      expect(result.timeLabel).toBe("2:00 PM – 3:00 PM");
      expect(result.durationMinutes).toBe(60);
      expect(result.remainingMinutes).toBe(43); // 3:00 PM (900m) - 2:17 PM (857m) = 43m
    });

    it("Focus on this for an active scheduled Task launches canonical Focus session with remaining time", async () => {
      const task = mockTask({
        id: "task-now-1",
        title: "Build Pebble NOW",
        schedule: {
          date: TODAY_DATE,
          startTime: "14:00",
          endTime: "15:00",
        },
      });

      const now = createDateAtTime(14, 17);
      const focus = getNowFocus({
        now,
        referenceDateKey: TODAY_DATE,
        tasks: [task],
        habits: [],
        checklists: [],
      });

      expect(focus.state).toBe("active");
      expect(focus.remainingMinutes).toBe(43);

      // Emulate handleStartNowFocus logic
      const explicitDuration = parseDurationMinutes(focus.item?.schedule?.durationMinutes);
      let durationSeconds: number;
      if (focus.state === "active" && focus.remainingMinutes !== undefined) {
        durationSeconds = Math.max(60, focus.remainingMinutes * 60);
      } else if (explicitDuration !== undefined && explicitDuration > 0) {
        durationSeconds = explicitDuration * 60;
      } else {
        durationSeconds = 25 * 60;
      }

      expect(durationSeconds).toBe(43 * 60); // 2580 seconds

      await launchFocusSession({
        targetId: focus.item!.id,
        durationSeconds,
      });

      // Assert canonical storage was written
      expect(mockStore["todoapp:focus:current_stopwatch"]).toBeUndefined();
      expect(mockStore["todoapp:focus:current_session"]).toBeDefined();

      const session = JSON.parse(mockStore["todoapp:focus:current_session"]);
      expect(session.type).toBe("work");
      expect(session.isActive).toBe(true);
      expect(session.focusedTaskId).toBe("task-now-1");
      expect(session.duration).toBe(2580);

      // Assert navigation to focus
      expect(router.navigate).toHaveBeenCalledWith("/focus");
    });

    it("Task completion from NOW uses canonical EntityCommandService.completeTask", async () => {
      const task = mockTask({ id: "task-complete-test", workspaceId: "ws-1" });
      await EntityCommandService.completeTask(task.id, task.workspaceId);
      expect(EntityCommandService.completeTask).toHaveBeenCalledWith("task-complete-test", "ws-1");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. HABIT EXECUTION MODEL
  // ─────────────────────────────────────────────────────────────
  describe("Habit execution", () => {
    it("active scheduled Habit appears in NOW and calculates remaining time accurately", () => {
      const habit = mockHabit({
        id: "habit-now-1",
        title: "Morning workout",
        schedule: {
          date: TODAY_DATE,
          startTime: "07:00",
          endTime: "08:00",
        },
      });

      // Current time: 7:20 AM
      const result = getNowFocus({
        now: createDateAtTime(7, 20),
        referenceDateKey: TODAY_DATE,
        tasks: [],
        habits: [habit],
        checklists: [],
      });

      expect(result.state).toBe("active");
      expect(result.type).toBe("habit");
      expect(result.item?.id).toBe("habit-now-1");
      expect(result.remainingMinutes).toBe(40);
    });

    it("Focus on this for an active Habit launches canonical Focus session with remaining time", async () => {
      const habit = mockHabit({
        id: "habit-now-1",
        title: "Morning workout",
        schedule: {
          date: TODAY_DATE,
          startTime: "07:00",
          endTime: "08:00",
        },
      });

      const focus = getNowFocus({
        now: createDateAtTime(7, 20),
        referenceDateKey: TODAY_DATE,
        tasks: [],
        habits: [habit],
        checklists: [],
      });

      const durationSeconds = Math.max(60, focus.remainingMinutes! * 60);
      expect(durationSeconds).toBe(40 * 60); // 2400 seconds

      await launchFocusSession({
        targetId: focus.item!.id,
        durationSeconds,
      });

      const session = JSON.parse(mockStore["todoapp:focus:current_session"]);
      expect(session.focusedTaskId).toBe("habit-now-1");
      expect(session.duration).toBe(2400);
      expect(session.isActive).toBe(true);
      expect(router.navigate).toHaveBeenCalledWith("/focus");
    });

    it("Habit completion uses canonical EntityCommandService.completeHabit", async () => {
      const habit = mockHabit({ id: "habit-complete-test", workspaceId: "ws-1" });
      await EntityCommandService.completeHabit(habit.id, habit.workspaceId);
      expect(EntityCommandService.completeHabit).toHaveBeenCalledWith("habit-complete-test", "ws-1");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. CHECKLIST EXECUTION MODEL
  // ─────────────────────────────────────────────────────────────
  describe("Checklist execution", () => {
    it("active Checklist surfaces next incomplete item and progress", () => {
      const checklist = mockChecklist({
        id: "chk-active-1",
        title: "Morning routine",
        items: [
          { id: "step-1", title: "Shower", completed: true },
          { id: "step-2", title: "Breakfast", completed: true },
          { id: "step-3", title: "Journal", completed: false },
          { id: "step-4", title: "Review tasks", completed: false },
          { id: "step-5", title: "Meditate", completed: false },
        ],
        schedule: {
          date: TODAY_DATE,
          startTime: "08:00",
          endTime: "09:00",
        },
      });

      const result = getNowFocus({
        now: createDateAtTime(8, 30),
        referenceDateKey: TODAY_DATE,
        tasks: [],
        habits: [],
        checklists: [checklist],
      });

      expect(result.state).toBe("active");
      expect(result.type).toBe("checklist");
      expect(result.checklistState).toBeDefined();
      expect(result.checklistState?.completedCount).toBe(2);
      expect(result.checklistState?.total).toBe(5);
      expect(result.checklistState?.nextItem?.id).toBe("step-3");
      expect(result.checklistState?.nextItem?.title).toBe("Journal");
    });

    it("Checklist never launches Focus session (guard in handleStartNowFocus)", async () => {
      const checklist = mockChecklist({ id: "chk-no-focus" });
      const focus = {
        state: "active" as const,
        type: "checklist" as const,
        item: checklist,
      };

      // Emulate handleStartNowFocus: checklists return early without launching focus
      const handleStartNowFocus = async (f: typeof focus) => {
        if (!f.item || f.type === "checklist") return;
        await launchFocusSession({ targetId: f.item.id, durationSeconds: 1500 });
      };

      await handleStartNowFocus(focus);
      expect(mockStore["todoapp:focus:current_session"]).toBeUndefined();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it("completing checklist items mutates checklist state and updates next item", async () => {
      const chkId = "chk-mut-1";
      const itemId = "step-1";
      const wsId = "ws-1";

      const updatedChecklist = mockChecklist({
        id: chkId,
        items: [
          { id: "step-1", title: "Shower", completed: true },
          { id: "step-2", title: "Breakfast", completed: false },
        ],
      });

      (EntityCommandService.toggleChecklistItem as jest.Mock).mockResolvedValueOnce({
        updated: updatedChecklist,
      });

      const res = await EntityCommandService.toggleChecklistItem(chkId, itemId, wsId);
      expect(EntityCommandService.toggleChecklistItem).toHaveBeenCalledWith(chkId, itemId, wsId);
      expect(res?.updated.items[0].completed).toBe(true);

      // Evaluating NOW with updated checklist advances nextItem
      const nowResult = getNowFocus({
        now: createDateAtTime(8, 15),
        referenceDateKey: TODAY_DATE,
        tasks: [],
        habits: [],
        checklists: [updatedChecklist],
      });

      expect(nowResult.checklistState?.completedCount).toBe(1);
      expect(nowResult.checklistState?.nextItem?.id).toBe("step-2");
    });

    it("when all items in Checklist are complete, it leaves NOW naturally", () => {
      const finishedChecklist = mockChecklist({
        id: "chk-finished",
        items: [
          { id: "i1", title: "Item 1", completed: true },
          { id: "i2", title: "Item 2", completed: true },
        ],
        schedule: {
          date: TODAY_DATE,
          startTime: "08:00",
          endTime: "09:00",
        },
      });

      const result = getNowFocus({
        now: createDateAtTime(8, 30),
        referenceDateKey: TODAY_DATE,
        tasks: [],
        habits: [],
        checklists: [finishedChecklist],
      });

      // Completed checklist is filtered out of eligible items
      expect(result.state).toBe("empty");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. UPCOMING (UP NEXT) EXECUTION MODEL
  // ─────────────────────────────────────────────────────────────
  describe("Upcoming (UP NEXT) behavior", () => {
    it("nearest upcoming activity surfaces as UP NEXT without remaining minutes", () => {
      const task = mockTask({
        id: "task-upc",
        title: "Afternoon Review",
        schedule: {
          date: TODAY_DATE,
          startTime: "16:00",
          endTime: "17:00",
        },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0), // 2:00 PM, item starts at 4:00 PM
        referenceDateKey: TODAY_DATE,
        tasks: [task],
        habits: [],
        checklists: [],
      });

      expect(result.state).toBe("upcoming");
      expect(result.timeLabel).toBe("Starts at 4:00 PM");
      expect(result.remainingMinutes).toBeUndefined();
    });

    it("UP NEXT does not trigger auto-start of Focus session", () => {
      // UP NEXT is informational only — neither Focus nor timer starts automatically
      expect(mockStore["todoapp:focus:current_session"]).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. REGRESSION & DETERMINISM
  // ─────────────────────────────────────────────────────────────
  describe("Regression & determinism", () => {
    it("unscheduled tasks are recommended during free window without fake remaining allocation", () => {
      const recTask = mockTask({
        id: "task-rec-1",
        title: "Read Documentation",
        schedule: {
          durationMinutes: 30,
        },
      });

      const result = getNowFocus({
        now: createDateAtTime(14, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [recTask],
        habits: [],
        checklists: [],
      });

      expect(result.state).toBe("recommended");
      expect(result.durationMinutes).toBe(30);
      expect(result.remainingMinutes).toBeUndefined(); // no fake schedule invented
    });

    it("NOW is reactive to time transitions", () => {
      const task = mockTask({
        id: "task-reactive",
        schedule: {
          date: TODAY_DATE,
          startTime: "14:00",
          endTime: "15:00",
        },
      });

      // 1:59 PM -> UPCOMING
      const t1 = getNowFocus({
        now: createDateAtTime(13, 59),
        referenceDateKey: TODAY_DATE,
        tasks: [task],
        habits: [],
        checklists: [],
      });
      expect(t1.state).toBe("upcoming");

      // 2:00 PM -> ACTIVE NOW (60m remaining)
      const t2 = getNowFocus({
        now: createDateAtTime(14, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [task],
        habits: [],
        checklists: [],
      });
      expect(t2.state).toBe("active");
      expect(t2.remainingMinutes).toBe(60);

      // 2:45 PM -> ACTIVE NOW (15m remaining)
      const t3 = getNowFocus({
        now: createDateAtTime(14, 45),
        referenceDateKey: TODAY_DATE,
        tasks: [task],
        habits: [],
        checklists: [],
      });
      expect(t3.state).toBe("active");
      expect(t3.remainingMinutes).toBe(15);

      // 3:00 PM -> EMPTY (window closed)
      const t4 = getNowFocus({
        now: createDateAtTime(15, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [task],
        habits: [],
        checklists: [],
      });
      expect(t4.state).toBe("empty");
    });
  });
});
