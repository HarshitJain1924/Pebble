import AsyncStorage from "@react-native-async-storage/async-storage";
import { getNowFocus } from "../utils/getNowFocus";
import { launchFocusSession } from "@/features/focus/services/FocusLaunchService";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { createNowFocusActionHandlers } from "../utils/nowFocusActions";
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

const mockRouter = {
  navigate: jest.fn(),
  push: jest.fn(),
};

jest.mock("expo-router", () => ({
  router: {
    navigate: jest.fn((...args) => mockRouter.navigate(...args)),
    push: jest.fn((...args) => mockRouter.push(...args)),
  },
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light" },
  NotificationFeedbackType: { Success: "success" },
}));

jest.mock("@/services/command/EntityCommandService", () => ({
  EntityCommandService: {
    completeTask: jest.fn().mockResolvedValue({ id: "t1", status: "done" }),
    completeHabit: jest.fn().mockResolvedValue({ id: "h1", streak: 5 }),
    toggleChecklistItem: jest.fn(),
  },
}));

const TODAY_DATE = "2026-09-12";

function createDateAtTime(hours: number, minutes: number, seconds = 0): Date {
  return new Date(2026, 8, 12, hours, minutes, seconds, 0);
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

describe("NOW Execution Model & Action-Wiring Integration", () => {
  let mockCompleteTodo: jest.Mock;
  let mockCompleteHabit: jest.Mock;
  let mockToggleChecklistItem: jest.Mock;
  let mockLaunchFocus: jest.Mock;

  beforeEach(() => {
    mockStore = {};
    jest.clearAllMocks();

    mockCompleteTodo = jest.fn().mockImplementation(async (id: string, notify?: boolean, wsId?: string) => {
      return EntityCommandService.completeTask(id, wsId || "inbox");
    });

    mockCompleteHabit = jest.fn().mockImplementation(async (id: string, notify?: boolean, wsId?: string) => {
      return EntityCommandService.completeHabit(id, wsId || "inbox");
    });

    mockToggleChecklistItem = jest.fn().mockImplementation(async (chkId: string, itemId: string, wsId: string, dateKey?: string) => {
      return EntityCommandService.toggleChecklistItem(chkId, itemId, wsId, dateKey);
    });

    mockLaunchFocus = jest.fn().mockImplementation(async (params) => {
      return launchFocusSession(params);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 1. REAL NOW ACTION-WIRING CHAIN (Task, Habit, Checklist, Upcoming)
  // ─────────────────────────────────────────────────────────────
  describe("Real NOW action wiring chain", () => {
    it("A. Task: active/recommended task in NOW routes Complete through canonical Today completion and EntityCommandService", async () => {
      const task = mockTask({
        id: "task-now-action",
        title: "Deploy Migration",
        workspaceId: "ws-work",
        schedule: {
          date: TODAY_DATE,
          startTime: "14:00",
          endTime: "15:00",
        },
      });

      const now = createDateAtTime(14, 17, 45);
      const focus = getNowFocus({
        now,
        referenceDateKey: TODAY_DATE,
        tasks: [task],
        habits: [],
        checklists: [],
      });

      expect(focus.state).toBe("active");
      expect(focus.remainingSeconds).toBe(2535);

      const handlers = createNowFocusActionHandlers({
        completeTodoFromDashboard: mockCompleteTodo,
        completeHabitFromDashboard: mockCompleteHabit,
        toggleChecklistItemFromDashboard: mockToggleChecklistItem,
        launchFocus: mockLaunchFocus,
        router: mockRouter,
        getCurrentNow: () => now,
      });

      // Complete invoked from NOW handler
      await handlers.handleCompleteNowFocus(focus);

      expect(mockCompleteTodo).toHaveBeenCalledTimes(1);
      expect(mockCompleteTodo).toHaveBeenCalledWith("task-now-action", undefined, "ws-work");
      expect(EntityCommandService.completeTask).toHaveBeenCalledWith("task-now-action", "ws-work");
    });

    it("A2. Task: pressing Focus on this routes through FocusLaunchService with exact remaining seconds", async () => {
      const task = mockTask({
        id: "task-now-focus",
        title: "Coding Session",
        schedule: {
          date: TODAY_DATE,
          startTime: "14:00",
          endTime: "15:00",
        },
      });

      // At 14:17:45 in 14:00-15:00 slot -> exactly 2535 seconds remaining
      const now = createDateAtTime(14, 17, 45);
      const focus = getNowFocus({
        now,
        referenceDateKey: TODAY_DATE,
        tasks: [task],
        habits: [],
        checklists: [],
      });

      const handlers = createNowFocusActionHandlers({
        completeTodoFromDashboard: mockCompleteTodo,
        completeHabitFromDashboard: mockCompleteHabit,
        toggleChecklistItemFromDashboard: mockToggleChecklistItem,
        launchFocus: mockLaunchFocus,
        router: mockRouter,
        getCurrentNow: () => now,
      });

      // Focus invoked from NOW handler
      await handlers.handleStartNowFocus(focus);

      expect(mockLaunchFocus).toHaveBeenCalledWith({
        targetId: "task-now-focus",
        durationSeconds: 2535, // EXACT second precision, NOT 43*60 = 2580!
      });

      const session = JSON.parse(mockStore["todoapp:focus:current_session"]);
      expect(session.duration).toBe(2535);
      expect(session.focusedTaskId).toBe("task-now-focus");
      expect(session.isActive).toBe(true);
      expect(mockRouter.navigate).toHaveBeenCalledWith("/focus");
    });

    it("B. Habit: pressing Complete routes through canonical completeHabit flow", async () => {
      const habit = mockHabit({
        id: "habit-now-complete",
        title: "Afternoon Walk",
        workspaceId: "ws-personal",
        schedule: {
          date: TODAY_DATE,
          startTime: "14:00",
          endTime: "14:45",
        },
      });

      const now = createDateAtTime(14, 15, 0);
      const focus = getNowFocus({
        now,
        referenceDateKey: TODAY_DATE,
        tasks: [],
        habits: [habit],
        checklists: [],
      });

      const handlers = createNowFocusActionHandlers({
        completeTodoFromDashboard: mockCompleteTodo,
        completeHabitFromDashboard: mockCompleteHabit,
        toggleChecklistItemFromDashboard: mockToggleChecklistItem,
        launchFocus: mockLaunchFocus,
        router: mockRouter,
        getCurrentNow: () => now,
      });

      await handlers.handleCompleteNowFocus(focus);

      expect(mockCompleteHabit).toHaveBeenCalledWith("habit-now-complete", undefined, "ws-personal");
      expect(EntityCommandService.completeHabit).toHaveBeenCalledWith("habit-now-complete", "ws-personal");
    });

    it("B2. Habit: pressing Focus on this passes active remaining scheduled allocation to FocusLaunchService", async () => {
      const habit = mockHabit({
        id: "habit-now-focus",
        title: "Meditation",
        schedule: {
          date: TODAY_DATE,
          startTime: "07:00",
          endTime: "07:30",
        },
      });

      // At 7:10:00 -> 20 minutes = 1200 seconds remaining
      const now = createDateAtTime(7, 10, 0);
      const focus = getNowFocus({
        now,
        referenceDateKey: TODAY_DATE,
        tasks: [],
        habits: [habit],
        checklists: [],
      });

      const handlers = createNowFocusActionHandlers({
        completeTodoFromDashboard: mockCompleteTodo,
        completeHabitFromDashboard: mockCompleteHabit,
        toggleChecklistItemFromDashboard: mockToggleChecklistItem,
        launchFocus: mockLaunchFocus,
        router: mockRouter,
        getCurrentNow: () => now,
      });

      await handlers.handleStartNowFocus(focus);

      expect(mockLaunchFocus).toHaveBeenCalledWith({
        targetId: "habit-now-focus",
        durationSeconds: 1200,
      });
      expect(mockRouter.navigate).toHaveBeenCalledWith("/focus");
    });

    it("C. Checklist: completing the single visible item routes through canonical toggleChecklistItem", async () => {
      const checklist = mockChecklist({
        id: "chk-flow-1",
        title: "Morning Routine",
        workspaceId: "ws-home",
        items: [
          { id: "item-1", title: "Drink water", completed: true },
          { id: "item-2", title: "Journal", completed: false },
          { id: "item-3", title: "Stretch", completed: false },
        ],
        schedule: {
          date: TODAY_DATE,
          startTime: "08:00",
          endTime: "09:00",
        },
      });

      const now = createDateAtTime(8, 15, 0);
      const focus = getNowFocus({
        now,
        referenceDateKey: TODAY_DATE,
        tasks: [],
        habits: [],
        checklists: [checklist],
      });

      expect(focus.state).toBe("active");
      expect(focus.checklistState?.nextItem?.id).toBe("item-2");

      const handlers = createNowFocusActionHandlers({
        completeTodoFromDashboard: mockCompleteTodo,
        completeHabitFromDashboard: mockCompleteHabit,
        toggleChecklistItemFromDashboard: mockToggleChecklistItem,
        launchFocus: mockLaunchFocus,
        router: mockRouter,
        getCurrentNow: () => now,
      });

      // Execute completion of visible item
      await handlers.handleCompleteNowChecklistItem(focus, "item-2");

      expect(mockToggleChecklistItem).toHaveBeenCalledWith(
        "chk-flow-1",
        "item-2",
        "ws-home",
        undefined,
      );
      expect(EntityCommandService.toggleChecklistItem).toHaveBeenCalledWith(
        "chk-flow-1",
        "item-2",
        "ws-home",
        undefined,
      );

      // Checklist never invokes Focus
      expect(mockLaunchFocus).not.toHaveBeenCalled();
    });

    it("C2. Checklist: state updates advance nextItem, and final completion leaves NOW naturally", () => {
      const initialChecklist = mockChecklist({
        id: "chk-adv",
        title: "Setup checklist",
        items: [
          { id: "i1", title: "Step 1", completed: false },
          { id: "i2", title: "Step 2", completed: false },
        ],
        schedule: { date: TODAY_DATE, startTime: "10:00", endTime: "11:00" },
      });

      const now = createDateAtTime(10, 15, 0);

      // Step 1: initial state
      const focus1 = getNowFocus({
        now,
        referenceDateKey: TODAY_DATE,
        tasks: [],
        habits: [],
        checklists: [initialChecklist],
      });
      expect(focus1.checklistState?.nextItem?.id).toBe("i1");
      expect(focus1.checklistState?.completedCount).toBe(0);

      // Step 2: item 1 completed
      const updatedChecklist1 = {
        ...initialChecklist,
        items: [
          { id: "i1", title: "Step 1", completed: true },
          { id: "i2", title: "Step 2", completed: false },
        ],
      };
      const focus2 = getNowFocus({
        now,
        referenceDateKey: TODAY_DATE,
        tasks: [],
        habits: [],
        checklists: [updatedChecklist1],
      });
      expect(focus2.checklistState?.nextItem?.id).toBe("i2");
      expect(focus2.checklistState?.completedCount).toBe(1);

      // Step 3: final item completed -> leaves NOW naturally
      const updatedChecklist2 = {
        ...initialChecklist,
        items: [
          { id: "i1", title: "Step 1", completed: true },
          { id: "i2", title: "Step 2", completed: true },
        ],
      };
      const focus3 = getNowFocus({
        now,
        referenceDateKey: TODAY_DATE,
        tasks: [],
        habits: [],
        checklists: [updatedChecklist2],
      });
      expect(focus3.state).toBe("empty");
      expect(focus3.item).toBeUndefined();
    });

    it("D. Upcoming: View details navigates to details, NEVER launches Focus, NEVER completes", () => {
      const upcomingTask = mockTask({
        id: "task-upcoming-wire",
        title: "Afternoon Sync",
        schedule: {
          date: TODAY_DATE,
          startTime: "16:00",
          endTime: "17:00",
        },
      });

      const now = createDateAtTime(14, 0, 0);
      const focus = getNowFocus({
        now,
        referenceDateKey: TODAY_DATE,
        tasks: [upcomingTask],
        habits: [],
        checklists: [],
      });

      expect(focus.state).toBe("upcoming");

      const handlers = createNowFocusActionHandlers({
        completeTodoFromDashboard: mockCompleteTodo,
        completeHabitFromDashboard: mockCompleteHabit,
        toggleChecklistItemFromDashboard: mockToggleChecklistItem,
        launchFocus: mockLaunchFocus,
        router: mockRouter,
        getCurrentNow: () => now,
      });

      // View details called
      handlers.handleViewFocus(focus);

      expect(mockRouter.push).toHaveBeenCalledWith("/task-details?id=task-upcoming-wire&type=task");
      expect(mockLaunchFocus).not.toHaveBeenCalled();
      expect(mockCompleteTodo).not.toHaveBeenCalled();
      expect(mockCompleteHabit).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. TIMING PRECISION & FOCUS LAUNCH CONTRACT TESTS
  // ─────────────────────────────────────────────────────────────
  describe("Timing precision & Focus launch contract", () => {
    it("14:00:00 in 14:00–15:00 slot -> 3600 sec to Focus", async () => {
      const task = mockTask({
        id: "t-3600",
        schedule: { date: TODAY_DATE, startTime: "14:00", endTime: "15:00" },
      });

      const focus = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [task],
        habits: [],
        checklists: [],
      });

      expect(focus.remainingSeconds).toBe(3600);

      const handlers = createNowFocusActionHandlers({
        completeTodoFromDashboard: mockCompleteTodo,
        completeHabitFromDashboard: mockCompleteHabit,
        toggleChecklistItemFromDashboard: mockToggleChecklistItem,
        launchFocus: mockLaunchFocus,
        router: mockRouter,
      });

      await handlers.handleStartNowFocus(focus);
      expect(mockLaunchFocus).toHaveBeenCalledWith({
        targetId: "t-3600",
        durationSeconds: 3600,
      });
    });

    it("14:17:00 in 14:00–15:00 slot -> 2580 sec to Focus", async () => {
      const task = mockTask({
        id: "t-2580",
        schedule: { date: TODAY_DATE, startTime: "14:00", endTime: "15:00" },
      });

      const focus = getNowFocus({
        now: createDateAtTime(14, 17, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [task],
        habits: [],
        checklists: [],
      });

      expect(focus.remainingSeconds).toBe(2580);

      const handlers = createNowFocusActionHandlers({
        completeTodoFromDashboard: mockCompleteTodo,
        completeHabitFromDashboard: mockCompleteHabit,
        toggleChecklistItemFromDashboard: mockToggleChecklistItem,
        launchFocus: mockLaunchFocus,
        router: mockRouter,
      });

      await handlers.handleStartNowFocus(focus);
      expect(mockLaunchFocus).toHaveBeenCalledWith({
        targetId: "t-2580",
        durationSeconds: 2580,
      });
    });

    it("14:17:45 in 14:00–15:00 slot -> 2535 sec to Focus (not rounded to 43*60)", async () => {
      const task = mockTask({
        id: "t-2535",
        schedule: { date: TODAY_DATE, startTime: "14:00", endTime: "15:00" },
      });

      const focus = getNowFocus({
        now: createDateAtTime(14, 17, 45),
        referenceDateKey: TODAY_DATE,
        tasks: [task],
        habits: [],
        checklists: [],
      });

      expect(focus.remainingSeconds).toBe(2535);

      const handlers = createNowFocusActionHandlers({
        completeTodoFromDashboard: mockCompleteTodo,
        completeHabitFromDashboard: mockCompleteHabit,
        toggleChecklistItemFromDashboard: mockToggleChecklistItem,
        launchFocus: mockLaunchFocus,
        router: mockRouter,
      });

      await handlers.handleStartNowFocus(focus);
      expect(mockLaunchFocus).toHaveBeenCalledWith({
        targetId: "t-2535",
        durationSeconds: 2535,
      });
    });

    it("14:59:59 in 14:00–15:00 slot -> 1 sec to Focus", async () => {
      const task = mockTask({
        id: "t-1sec",
        schedule: { date: TODAY_DATE, startTime: "14:00", endTime: "15:00" },
      });

      const focus = getNowFocus({
        now: createDateAtTime(14, 59, 59),
        referenceDateKey: TODAY_DATE,
        tasks: [task],
        habits: [],
        checklists: [],
      });

      expect(focus.remainingSeconds).toBe(1);

      const handlers = createNowFocusActionHandlers({
        completeTodoFromDashboard: mockCompleteTodo,
        completeHabitFromDashboard: mockCompleteHabit,
        toggleChecklistItemFromDashboard: mockToggleChecklistItem,
        launchFocus: mockLaunchFocus,
        router: mockRouter,
      });

      await handlers.handleStartNowFocus(focus);
      expect(mockLaunchFocus).toHaveBeenCalledWith({
        targetId: "t-1sec",
        durationSeconds: 1,
      });
    });

    it("15:00:00 in 14:00–15:00 slot -> no longer active", () => {
      const task = mockTask({
        id: "t-ended",
        schedule: { date: TODAY_DATE, startTime: "14:00", endTime: "15:00" },
      });

      const focus = getNowFocus({
        now: createDateAtTime(15, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [task],
        habits: [],
        checklists: [],
      });

      expect(focus.state).not.toBe("active");
      expect(focus.remainingSeconds).toBeUndefined();
    });

    it("explicit durationMinutes takes precedence over endTime for resolved end boundary", async () => {
      const task = mockTask({
        id: "t-authoritative-dur",
        schedule: {
          date: TODAY_DATE,
          startTime: "14:00",
          endTime: "15:00",
          durationMinutes: 45, // Ends at 14:45!
        },
      });

      // At 14:17:45 -> ends at 14:45:00 (53100s). 53100 - 51465 = 1635s.
      const focus = getNowFocus({
        now: createDateAtTime(14, 17, 45),
        referenceDateKey: TODAY_DATE,
        tasks: [task],
        habits: [],
        checklists: [],
      });

      expect(focus.remainingSeconds).toBe(1635);

      const handlers = createNowFocusActionHandlers({
        completeTodoFromDashboard: mockCompleteTodo,
        completeHabitFromDashboard: mockCompleteHabit,
        toggleChecklistItemFromDashboard: mockToggleChecklistItem,
        launchFocus: mockLaunchFocus,
        router: mockRouter,
      });

      await handlers.handleStartNowFocus(focus);
      expect(mockLaunchFocus).toHaveBeenCalledWith({
        targetId: "t-authoritative-dur",
        durationSeconds: 1635,
      });
    });

    it("recommended unscheduled task launches Focus with explicit duration or 25m fallback", async () => {
      const taskWithDur = mockTask({
        id: "t-rec-dur",
        schedule: { durationMinutes: 15 },
      });

      const focusWithDur = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [taskWithDur],
        habits: [],
        checklists: [],
      });

      const handlers = createNowFocusActionHandlers({
        completeTodoFromDashboard: mockCompleteTodo,
        completeHabitFromDashboard: mockCompleteHabit,
        toggleChecklistItemFromDashboard: mockToggleChecklistItem,
        launchFocus: mockLaunchFocus,
        router: mockRouter,
      });

      await handlers.handleStartNowFocus(focusWithDur);
      expect(mockLaunchFocus).toHaveBeenCalledWith({
        targetId: "t-rec-dur",
        durationSeconds: 15 * 60,
      });

      // Unscheduled task without duration -> falls back to 25m preset (1500 sec)
      const taskNoDur = mockTask({ id: "t-rec-nodur" });
      const focusNoDur = getNowFocus({
        now: createDateAtTime(14, 0, 0),
        referenceDateKey: TODAY_DATE,
        tasks: [taskNoDur],
        habits: [],
        checklists: [],
      });

      await handlers.handleStartNowFocus(focusNoDur);
      expect(mockLaunchFocus).toHaveBeenCalledWith({
        targetId: "t-rec-nodur",
        durationSeconds: 25 * 60,
      });
    });

    it("invalid or non-positive duration safely falls back to 25m without creating invalid duration", async () => {
      const focusInvalidDur = {
        state: "recommended" as const,
        type: "task" as const,
        item: mockTask({
          id: "t-invalid-dur",
          schedule: { durationMinutes: -30 as any },
        }),
      };

      const handlers = createNowFocusActionHandlers({
        completeTodoFromDashboard: mockCompleteTodo,
        completeHabitFromDashboard: mockCompleteHabit,
        toggleChecklistItemFromDashboard: mockToggleChecklistItem,
        launchFocus: mockLaunchFocus,
        router: mockRouter,
      });

      await handlers.handleStartNowFocus(focusInvalidDur);
      expect(mockLaunchFocus).toHaveBeenCalledWith({
        targetId: "t-invalid-dur",
        durationSeconds: 25 * 60,
      });
    });

    it("Checklist NEVER launches Focus, even if handleStartNowFocus is somehow invoked", async () => {
      const focusChecklist = {
        state: "active" as const,
        type: "checklist" as const,
        item: mockChecklist({ id: "chk-guard-test" }),
      };

      const handlers = createNowFocusActionHandlers({
        completeTodoFromDashboard: mockCompleteTodo,
        completeHabitFromDashboard: mockCompleteHabit,
        toggleChecklistItemFromDashboard: mockToggleChecklistItem,
        launchFocus: mockLaunchFocus,
        router: mockRouter,
      });

      await handlers.handleStartNowFocus(focusChecklist);
      expect(mockLaunchFocus).not.toHaveBeenCalled();
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it("Upcoming NEVER launches Focus, even if handleStartNowFocus is somehow invoked", async () => {
      const focusUpcoming = {
        state: "upcoming" as const,
        type: "task" as const,
        item: mockTask({ id: "t-upcoming-guard" }),
      };

      const handlers = createNowFocusActionHandlers({
        completeTodoFromDashboard: mockCompleteTodo,
        completeHabitFromDashboard: mockCompleteHabit,
        toggleChecklistItemFromDashboard: mockToggleChecklistItem,
        launchFocus: mockLaunchFocus,
        router: mockRouter,
      });

      await handlers.handleStartNowFocus(focusUpcoming);
      expect(mockLaunchFocus).not.toHaveBeenCalled();
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });
  });
});
