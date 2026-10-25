import { buildTodayDayContext } from "../todayDayContext";
import type { Checklist, Habit, Task } from "@/shared/types/domain.types";

const TODAY = "2026-09-12";

function task(id: string, startTime: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    workspaceId: "work",
    title: id,
    description: "",
    status: "todo",
    priority: "none",
    revision: 1,
    lifecycleGeneration: 1,
    schedule: { date: TODAY, startTime, durationMinutes: 60 },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function habit(id: string, startTime: string, overrides: Partial<Habit> = {}): Habit {
  return {
    id,
    workspaceId: "personal",
    title: id,
    description: "",
    revision: 1,
    lifecycleGeneration: 1,
    recurrence: { frequency: "daily", interval: 1 },
    completionHistory: [],
    schedule: { date: TODAY, startTime, durationMinutes: 30 },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function checklist(id: string, startTime: string): Checklist {
  return {
    id,
    workspaceId: "work",
    title: id,
    description: "",
    items: [
      { id: `${id}-1`, title: "First", completed: true },
      { id: `${id}-2`, title: "Second", completed: false },
    ],
    schedule: { date: TODAY, startTime, durationMinutes: 45 },
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
  } as Checklist;
}

describe("buildTodayDayContext", () => {
  it("selects the active scheduled item and marks the same NOW item", () => {
    const focusTask = task("Focus task", "10:00");
    const result = buildTodayDayContext({
      now: new Date(`${TODAY}T10:20:00`),
      tasks: [focusTask],
      habits: [],
      checklists: [],
      nowFocus: {
        state: "active",
        type: "task",
        item: focusTask,
        durationMinutes: 60,
      },
    });

    expect(result.hasMeaningfulSchedule).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      kind: "entry",
      status: "current",
      isNow: true,
    });
  });

  it("shows a meaningful free-time gap before the next scheduled activity", () => {
    const next = task("Next task", "14:00", { schedule: { date: TODAY, startTime: "14:00", durationMinutes: 30 } });
    const result = buildTodayDayContext({
      now: new Date(`${TODAY}T12:00:00`),
      tasks: [next],
      habits: [],
      checklists: [],
    });

    expect(result.rows.map((row) => row.kind)).toEqual(["gap", "entry"]);
    expect(result.rows[0]).toMatchObject({ kind: "gap", durationMinutes: 120 });
  });

  it("keeps an upcoming activity distinct from a recommended unscheduled NOW item", () => {
    const next = task("Scheduled next", "15:00");
    const recommended = task("Recommended", "09:00", {
      schedule: undefined,
    });
    const result = buildTodayDayContext({
      now: new Date(`${TODAY}T13:00:00`),
      tasks: [next, recommended],
      habits: [],
      checklists: [],
      nowFocus: {
        state: "recommended",
        type: "task",
        item: recommended,
        durationMinutes: 30,
      },
    });

    const entries = result.rows.filter((row) => row.kind === "entry");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: "Scheduled next", status: "upcoming", isNow: false });
  });

  it("excludes future-date schedules and returns a calm empty state after the day is done", () => {
    const tomorrow = task("Tomorrow", "11:00", {
      schedule: { date: "2026-09-13", startTime: "11:00", durationMinutes: 60 },
    });
    const yesterday = task("Yesterday", "09:00", {
      schedule: { date: TODAY, startTime: "09:00", durationMinutes: 60 },
    });
    const result = buildTodayDayContext({
      now: new Date(`${TODAY}T18:00:00`),
      tasks: [tomorrow, yesterday],
      habits: [],
      checklists: [],
    });

    expect(result.rows).toEqual([]);
    expect(result.hasMeaningfulSchedule).toBe(false);
  });

  it("compacts many scheduled items and preserves checklist progress", () => {
    const result = buildTodayDayContext({
      now: new Date(`${TODAY}T10:30:00`),
      tasks: [
        task("One", "08:00"),
        task("Two", "11:00"),
        task("Three", "13:00"),
        task("Four", "15:00"),
        task("Five", "17:00"),
      ],
      habits: [habit("Routine", "18:00")],
      checklists: [checklist("Checklist", "19:00")],
    });

    expect(result.rows.filter((row) => row.kind === "entry").length).toBeLessThanOrEqual(4);
    expect(result.rows.some((row) => row.kind === "gap")).toBe(true);
  });

  it("keeps checklist progress and long titles in the compact entry model", () => {
    const longTitle = "A deliberately long checklist title that stays available to the two-line UI";
    const scheduledChecklist = checklist("Checklist", "19:00");
    scheduledChecklist.title = longTitle;

    const result = buildTodayDayContext({
      now: new Date(`${TODAY}T18:00:00`),
      tasks: [],
      habits: [],
      checklists: [scheduledChecklist],
    });

    expect(result.rows).toContainEqual(
      expect.objectContaining({
        kind: "entry",
        title: longTitle,
        checklistProgress: { completedCount: 1, totalCount: 2 },
      }),
    );
  });

  it("updates the current boundary without changing the schedule projection", () => {
    const scheduled = task("Boundary", "10:00");
    const before = buildTodayDayContext({
      now: new Date(`${TODAY}T09:59:00`),
      tasks: [scheduled],
      habits: [],
      checklists: [],
    });
    const during = buildTodayDayContext({
      now: new Date(`${TODAY}T10:00:00`),
      tasks: [scheduled],
      habits: [],
      checklists: [],
    });

    expect(before.rows.find((row) => row.kind === "entry")).toMatchObject({ status: "upcoming" });
    expect(during.rows.find((row) => row.kind === "entry")).toMatchObject({ status: "current" });
  });
});
