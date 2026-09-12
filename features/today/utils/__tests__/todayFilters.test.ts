import type { Checklist, Habit, Task } from "@/shared/types/domain.types";
import {
  applyTodayFilters,
  DEFAULT_TODAY_FILTERS,
  normalizeTodayFilters,
  toPersistedTodayFilters,
  type TodayFilterState,
} from "../todayFilters";

const TODAY = "2026-09-12";

function task(
  id: string,
  workspaceId: string,
  priority: Task["priority"] = "none",
  overrides: Partial<Task> = {},
): Task {
  return {
    id,
    workspaceId,
    title: id,
    status: "todo",
    priority,
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function habit(id: string, workspaceId: string, completed = false): Habit {
  return {
    id,
    workspaceId,
    title: id,
    recurrence: { frequency: "daily", interval: 1 },
    completionHistory: completed
      ? [{ date: TODAY, completedAt: 1 }]
      : [],
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
  };
}

function checklist(id: string, workspaceId: string, completed = false): Checklist {
  return {
    id,
    workspaceId,
    title: id,
    items: [
      { id: `${id}-1`, title: "One", completed },
      { id: `${id}-2`, title: "Two", completed },
    ],
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
  };
}

const baseInput = {
  pendingTasks: [
    task("High work", "work", "high", { categoryId: "work", schedule: { date: TODAY } }),
    task("Low personal", "personal", "low", { categoryId: "personal" }),
  ],
  completedTasks: [
    task("Done work", "work", "high", { status: "completed", categoryId: "work" }),
  ],
  overdueTasks: [task("Late work", "work", "high", { categoryId: "work" })],
  pendingHabits: [habit("Morning habit", "work")],
  completedHabits: [habit("Done habit", "work", true)],
  checklists: [checklist("Open checklist", "work"), checklist("Done checklist", "work", true)],
  workspaceNames: { work: "Work", personal: "Personal" },
};

function filter(overrides: Partial<TodayFilterState> = {}): TodayFilterState {
  return { ...DEFAULT_TODAY_FILTERS, ...overrides };
}

describe("applyTodayFilters", () => {
  it("keeps the default state backward compatible with the legacy dashboard", () => {
    const result = applyTodayFilters(baseInput, DEFAULT_TODAY_FILTERS, TODAY);

    expect(result.tasks.map((item) => item.id)).toEqual(["High work", "Low personal"]);
    expect(result.completedTasks.map((item) => item.id)).toEqual(["Done work"]);
    expect(result.overdueTasks).toEqual([]);
    expect(result.pendingHabits.map((item) => item.id)).toEqual(["Morning habit"]);
    expect(result.completedHabits.map((item) => item.id)).toEqual(["Done habit"]);
    expect(result.checklists.map((item) => item.id)).toEqual([
      "Open checklist",
      "Done checklist",
    ]);
  });

  it("applies type, workspace, priority, and category as one combination", () => {
    const result = applyTodayFilters(
      baseInput,
      filter({ type: "tasks", workspaceId: "work", priority: "high", categoryId: "work" }),
      TODAY,
    );

    expect(result.tasks.map((item) => item.id)).toEqual(["High work"]);
    expect(result.completedTasks.map((item) => item.id)).toEqual(["Done work"]);
    expect(result.pendingHabits).toEqual([]);
    expect(result.checklists).toEqual([]);
  });

  it("supports habits-only and checklists-only filtering", () => {
    expect(
      applyTodayFilters(baseInput, filter({ type: "habits" }), TODAY).pendingHabits,
    ).toHaveLength(1);
    expect(
      applyTodayFilters(baseInput, filter({ type: "checklists" }), TODAY).checklists,
    ).toHaveLength(2);
  });

  it("keeps overdue separate from active, completed, and non-task results", () => {
    const result = applyTodayFilters(baseInput, filter({ status: "overdue" }), TODAY);

    expect(result.overdueTasks.map((item) => item.id)).toEqual(["Late work"]);
    expect(result.tasks).toEqual([]);
    expect(result.pendingHabits).toEqual([]);
    expect(result.checklists).toEqual([]);
  });

  it("supports completed, scheduled, unscheduled, and alphabetical states", () => {
    const completed = applyTodayFilters(baseInput, filter({ status: "completed" }), TODAY);
    expect(completed.completedTasks.map((item) => item.id)).toEqual(["Done work"]);
    expect(completed.completedHabits.map((item) => item.id)).toEqual(["Done habit"]);
    expect(completed.checklists.map((item) => item.id)).toEqual(["Done checklist"]);

    const unscheduled = applyTodayFilters(
      baseInput,
      filter({ schedule: "unscheduled", type: "tasks" }),
      TODAY,
    );
    expect(unscheduled.tasks.map((item) => item.id)).toEqual(["Low personal"]);

    const alphabetical = applyTodayFilters(
      baseInput,
      filter({ type: "tasks", sort: "alphabetical" }),
      TODAY,
    );
    expect(alphabetical.tasks.map((item) => item.id)).toEqual([
      "High work",
      "Low personal",
    ]);
  });
});

describe("Today filter persistence compatibility", () => {
  it("normalizes saved legacy filter values without losing new defaults", () => {
    expect(normalizeTodayFilters({ filter: "overdue", priority: "high" })).toEqual({
      ...DEFAULT_TODAY_FILTERS,
      priority: "high",
      status: "overdue",
    });

    expect(normalizeTodayFilters({ filter: "habits" })).toEqual({
      ...DEFAULT_TODAY_FILTERS,
      type: "habits",
    });
  });

  it("serializes the applied state back to legacy-compatible values", () => {
    expect(
      toPersistedTodayFilters(filter({ type: "tasks", status: "overdue" })),
    ).toMatchObject({ filter: "overdue", priority: "all", status: "overdue" });
  });
});
