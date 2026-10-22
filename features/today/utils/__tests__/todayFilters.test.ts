import type { Checklist, Habit, Task } from "@/shared/types/domain.types";
import {
  applyTodayFilters,
  DEFAULT_TODAY_FILTERS,
  getActiveFilterPills,
  normalizeTodayFilters,
  removeTodayFilter,
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

function habit(
  id: string,
  workspaceId: string,
  completed = false,
  overrides: Partial<Habit> = {},
): Habit {
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
    ...overrides,
  };
}

function checklist(
  id: string,
  workspaceId: string,
  completed = false,
  overrides: Partial<Checklist> = {},
): Checklist {
  return {
    id,
    workspaceId,
    title: id,
    priority: "none",
    items: [
      { id: `${id}-1`, title: "One", completed },
      { id: `${id}-2`, title: "Two", completed },
    ],
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

const baseInput = {
  pendingTasks: [
    task("High work", "work", "high", {
      categoryId: "work",
      description: "Quarterly report",
      schedule: { date: TODAY },
    }),
    task("Low personal", "personal", "low", {
      categoryId: "personal",
      description: "Buy groceries",
    }),
  ],
  completedTasks: [
    task("Done work", "work", "high", { status: "completed", categoryId: "work" }),
  ],
  overdueTasks: [task("Late work", "work", "high", { categoryId: "work" })],
  pendingHabits: [habit("Morning habit", "work", false, { categoryId: "health" })],
  completedHabits: [habit("Done habit", "work", true, { categoryId: "health" })],
  checklists: [
    checklist("Open checklist", "work", false, { description: "Release steps" }),
    checklist("Done checklist", "work", true),
  ],
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

  it("supports case-insensitive partial matching across titles, descriptions, workspaces, and category names", () => {
    expect(
      applyTodayFilters(baseInput, filter({ type: "tasks" }), TODAY).tasks.map((item) => item.id),
    ).toEqual(["High work", "Low personal"]);

    expect(
      applyTodayFilters({ ...baseInput, searchQuery: "REPORT" }, DEFAULT_TODAY_FILTERS, TODAY).tasks.map(
        (item) => item.id,
      ),
    ).toEqual(["High work"]);

    expect(
      applyTodayFilters({ ...baseInput, searchQuery: "PERSON" }, DEFAULT_TODAY_FILTERS, TODAY).tasks.map(
        (item) => item.id,
      ),
    ).toEqual(["Low personal"]);

    expect(
      applyTodayFilters({ ...baseInput, searchQuery: "HEALTH" }, DEFAULT_TODAY_FILTERS, TODAY).pendingHabits.map(
        (item) => item.id,
      ),
    ).toEqual(["Morning habit"]);
  });

  it("returns no execution items for a query with no matches", () => {
    const result = applyTodayFilters(
      { ...baseInput, searchQuery: "does-not-exist" },
      DEFAULT_TODAY_FILTERS,
      TODAY,
    );

    expect(result.tasks).toEqual([]);
    expect(result.completedTasks).toEqual([]);
    expect(result.pendingHabits).toEqual([]);
    expect(result.completedHabits).toEqual([]);
    expect(result.checklists).toEqual([]);
  });

  it("composes search with type, workspace, priority, status, schedule, and category filters", () => {
    const result = applyTodayFilters(
      { ...baseInput, searchQuery: "report" },
      filter({
        type: "tasks",
        workspaceId: "work",
        categoryId: "work",
        priority: "high",
        schedule: "scheduled",
        status: "active",
      }),
      TODAY,
    );

    expect(result.tasks.map((item) => item.id)).toEqual(["High work"]);
    expect(result.completedTasks).toEqual([]);
    expect(result.pendingHabits).toEqual([]);
    expect(result.checklists).toEqual([]);
  });

  it("keeps search scoped to entity rows and preserves checklist behavior", () => {
    const result = applyTodayFilters(
      { ...baseInput, searchQuery: "release" },
      filter({ type: "checklists" }),
      TODAY,
    );

    expect(result.checklists).toHaveLength(1);
    expect(result.checklists[0]).toBe(baseInput.checklists[0]);
    expect(result.checklists[0].items).toHaveLength(2);
  });

  it("preserves completed and overdue status semantics while searching", () => {
    const completed = applyTodayFilters(
      { ...baseInput, searchQuery: "done" },
      filter({ status: "completed" }),
      TODAY,
    );
    expect(completed.completedTasks.map((item) => item.id)).toEqual(["Done work"]);
    expect(completed.completedHabits.map((item) => item.id)).toEqual(["Done habit"]);

    const overdue = applyTodayFilters(
      { ...baseInput, searchQuery: "late" },
      filter({ status: "overdue" }),
      TODAY,
    );
    expect(overdue.overdueTasks.map((item) => item.id)).toEqual(["Late work"]);
    expect(overdue.tasks).toEqual([]);
  });

  it("does not mutate the raw execution dataset used by independent projections", () => {
    const pendingBefore = [...baseInput.pendingTasks];
    applyTodayFilters(
      { ...baseInput, searchQuery: "report" },
      DEFAULT_TODAY_FILTERS,
      TODAY,
    );

    expect(baseInput.pendingTasks).toEqual(pendingBefore);
    expect(baseInput.pendingTasks).toHaveLength(2);
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

  it("matches checklist sub-item titles when searching", () => {
    const customInput = {
      ...baseInput,
      checklists: [
        checklist("Open checklist", "work", false, {
          items: [{ id: "sub-1", title: "Verify deployment logs", completed: false }],
        }),
        checklist("Done checklist", "work", true, {
          items: [{ id: "sub-2", title: "Review PR", completed: true }],
        }),
      ],
    };
    const result = applyTodayFilters(
      { ...customInput, searchQuery: "deployment" },
      DEFAULT_TODAY_FILTERS,
      TODAY,
    );
    expect(result.checklists.map((item) => item.id)).toEqual(["Open checklist"]);
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

describe("Today active filter pills and removal", () => {
  it("returns an empty pill list for default filters", () => {
    expect(getActiveFilterPills(DEFAULT_TODAY_FILTERS)).toEqual([]);
  });

  it("generates readable pills for active filters", () => {
    const state: TodayFilterState = {
      type: "habits",
      workspaceId: "work",
      categoryId: "all",
      priority: "high",
      schedule: "scheduled",
      status: "active",
      sort: "priority",
    };
    const folders = [{ id: "work", name: "Work Workspace" }];
    const pills = getActiveFilterPills(state, folders);

    expect(pills).toEqual([
      { key: "type", label: "Habits" },
      { key: "priority", label: "High Priority" },
      { key: "status", label: "Active" },
      { key: "schedule", label: "Scheduled" },
      { key: "workspaceId", label: "Work Workspace" },
      { key: "sort", label: "Sort: Priority" },
    ]);
  });

  it("removes a specific filter and resets only that key to default", () => {
    const state: TodayFilterState = {
      ...DEFAULT_TODAY_FILTERS,
      type: "tasks",
      priority: "high",
    };
    const updated = removeTodayFilter(state, "priority");

    expect(updated.priority).toBe("all");
    expect(updated.type).toBe("tasks");
  });
});

describe("Today checklist scheduling and recurrence filtering", () => {
  const TODAY = "2026-10-22"; // Thursday (day 4)
  const TOMORROW = "2026-10-23"; // Friday (day 5)
  const YESTERDAY = "2026-10-21"; // Wednesday (day 3)

  const makeChecklist = (
    id: string,
    overrides: Partial<Checklist> = {},
  ): Checklist => ({
    id,
    workspaceId: "work",
    title: id,
    items: [{ id: "i1", title: "Item 1", completed: false }],
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  });

  it("excludes checklists scheduled for future dates", () => {
    const futureChecklist = makeChecklist("future-chk", {
      schedule: { date: TOMORROW },
    });
    const todayChecklist = makeChecklist("today-chk", {
      schedule: { date: TODAY },
    });

    const result = applyTodayFilters(
      {
        pendingTasks: [],
        completedTasks: [],
        overdueTasks: [],
        pendingHabits: [],
        completedHabits: [],
        checklists: [futureChecklist, todayChecklist],
      },
      DEFAULT_TODAY_FILTERS,
      TODAY,
    );

    expect(result.checklists.map((c) => c.id)).toEqual(["today-chk"]);
  });

  it("filters recurring checklists based on whether they occur on the reference date", () => {
    // Weekly on Fridays (day 5) — does NOT occur on Thursday (TODAY)
    const fridayChecklist = makeChecklist("friday-chk", {
      recurrence: {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [5],
      },
    });

    // Weekly on Thursdays (day 4) — DOES occur on Thursday (TODAY)
    const thursdayChecklist = makeChecklist("thursday-chk", {
      recurrence: {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [4],
      },
    });

    const result = applyTodayFilters(
      {
        pendingTasks: [],
        completedTasks: [],
        overdueTasks: [],
        pendingHabits: [],
        completedHabits: [],
        checklists: [fridayChecklist, thursdayChecklist],
      },
      DEFAULT_TODAY_FILTERS,
      TODAY,
    );

    expect(result.checklists.map((c) => c.id)).toEqual(["thursday-chk"]);
  });

  it("includes unscheduled checklists and incomplete past-scheduled checklists as open workspace work", () => {
    const unscheduledChecklist = makeChecklist("unscheduled-chk");
    const pastIncompleteChecklist = makeChecklist("past-incomplete-chk", {
      schedule: { date: YESTERDAY },
    });
    const pastCompletedChecklist = makeChecklist("past-completed-chk", {
      schedule: { date: YESTERDAY },
      items: [{ id: "i1", title: "Item 1", completed: true }],
    });

    const result = applyTodayFilters(
      {
        pendingTasks: [],
        completedTasks: [],
        overdueTasks: [],
        pendingHabits: [],
        completedHabits: [],
        checklists: [
          unscheduledChecklist,
          pastIncompleteChecklist,
          pastCompletedChecklist,
        ],
      },
      DEFAULT_TODAY_FILTERS,
      TODAY,
    );

    // Unscheduled and past incomplete are included; past completed is excluded from Today
    expect(result.checklists.map((c) => c.id)).toEqual([
      "unscheduled-chk",
      "past-incomplete-chk",
    ]);
  });
});

