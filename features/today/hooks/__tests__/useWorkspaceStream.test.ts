import {
  AGGREGATE_KEY,
  AGGREGATE_PREVIEW_LIMIT,
  PREVIEW_LIMIT,
  RESOURCE_PREVIEW_LIMIT,
  STREAM_RELEVANCE,
  buildChecklistStreamItem,
  buildHabitStreamItem,
  buildTaskStreamItem,
  buildWorkspaceAggregateSection,
  buildWorkspaceStateLine,
  buildWorkspaceStreamSection,
  buildWorkspaceStreamSections,
  buildWorkspaceStreamTabs,
  compareStreamItems,
  countWorkspaceUnits,
  countWorkspaceUnitsByWorkspace,
  type WorkspaceStreamItem,
  type WorkspaceStreamSection,
} from "@/features/today/hooks/useWorkspaceStream";
import type { TodayActiveContext } from "@/features/today/hooks/useTodaySelectors";
import { getOffsetDateKey, getTodayDateKey } from "@/shared/utils/date-key";
import type {
  Checklist,
  Habit,
  Resource,
  Task,
  Workspace,
} from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const TODAY = getTodayDateKey();
const YESTERDAY = getOffsetDateKey(1, TODAY);

const makeWorkspace = (id: string, overrides: Partial<Workspace> = {}): Workspace => ({
  id,
  name: `Workspace ${id}`,
  emoji: "📁",
  color: "#3B82F6",
  order: 0,
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1000,
  updatedAt: 1000,
  ...overrides,
});

const makeTask = (id: string, workspaceId: string, overrides: Partial<Task> = {}): Task =>
  ({
    id,
    workspaceId,
    title: `Task ${id}`,
    status: "todo",
    priority: "none",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  }) as Task;

const makeHabit = (
  id: string,
  workspaceId: string,
  overrides: Partial<Habit> = {},
): Habit =>
  ({
    id,
    workspaceId,
    title: `Habit ${id}`,
    recurrence: { frequency: "daily", interval: 1 },
    completionHistory: [],
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  }) as Habit;

const makeChecklist = (
  id: string,
  workspaceId: string,
  items: { id: string; completed: boolean }[],
): Checklist =>
  ({
    id,
    workspaceId,
    title: `Checklist ${id}`,
    items: items.map((item) => ({
      id: item.id,
      title: `Item ${item.id}`,
      completed: item.completed,
    })),
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  }) as Checklist;

const makeContext = (
  workspace: Workspace,
  tasks: Task[] = [],
  habits: Habit[] = [],
  checklists: Checklist[] = [],
): TodayActiveContext => ({
  folder: workspace,
  tasks,
  habits,
  checklists,
  totalCount: tasks.length + habits.length + checklists.length,
});

const buildOptions = (overrides: Partial<{ isDark: boolean; primaryColor: string }> = {}) => ({
  isDark: true,
  primaryColor: "#123456",
  todayKey: TODAY,
  ...overrides,
});

describe("countWorkspaceUnits — explicit work-unit counting semantics", () => {
  it("counts each checklist ITEM individually, not the checklist as one entity", () => {
    const context = makeContext(
      makeWorkspace("w1"),
      [makeTask("t1", "w1", { status: "completed" }), makeTask("t2", "w1")],
      [makeHabit("h1", "w1")],
      [
        makeChecklist("c1", "w1", [
          { id: "i1", completed: true },
          { id: "i2", completed: true },
          { id: "i3", completed: false },
        ]),
      ],
    );

    const { totalUnits, completedUnits } = countWorkspaceUnits(context);

    // 2 tasks + 1 habit + 3 checklist items
    expect(totalUnits).toBe(6);
    // 1 completed task + 0 habits + 2 completed checklist items
    expect(completedUnits).toBe(3);
  });

  it("aggregates per-workspace totals for the tab rail", () => {
    const contexts = [
      makeContext(makeWorkspace("a"), [makeTask("t1", "a")], [], [
        makeChecklist("c1", "a", [{ id: "i1", completed: false }]),
      ]),
      makeContext(makeWorkspace("b"), [], [makeHabit("h1", "b")], []),
    ];

    expect(countWorkspaceUnitsByWorkspace(contexts)).toEqual({
      counts: { a: 2, b: 1 },
      total: 3,
    });
  });
});

describe("buildWorkspaceStreamSection", () => {
  it("groups by workspace and reports entity rows separately from work units", () => {
    const context = makeContext(
      makeWorkspace("w1", { name: "Work", color: "#FF0000" }),
      [makeTask("t1", "w1"), makeTask("t2", "w1", { status: "completed" })],
      [makeHabit("h1", "w1")],
      [makeChecklist("c1", "w1", [{ id: "i1", completed: true }, { id: "i2", completed: false }])],
    );

    const section = buildWorkspaceStreamSection(context, [], buildOptions());

    expect(section.workspace.id).toBe("w1");
    expect(section.workspaceColor).toBe("#FF0000");
    expect(section.isAggregate).toBe(false);

    // Work units: 2 tasks + 1 habit + 2 checklist items = 5; completed 1 + 0 + 1 = 2.
    expect(section.totalItems).toBe(5);
    expect(section.completedItems).toBe(2);
    expect(section.progress).toBeCloseTo(2 / 5);

    // Rows (entities): one row per task/habit/checklist = 4.
    expect(section.items).toHaveLength(4);
    expect(section.remainingCount).toBe(0);
  });

  it("handles an empty workspace without dividing by zero", () => {
    const section = buildWorkspaceStreamSection(
      makeContext(makeWorkspace("empty")),
      [],
      buildOptions(),
    );

    expect(section.totalItems).toBe(0);
    expect(section.completedItems).toBe(0);
    expect(section.progress).toBe(0);
    expect(section.items).toEqual([]);
    expect(section.stateText).toBe("All clear");
    expect(section.stateTone).toBe("success");
  });

  it("caps rendered rows at the preview limit and reports the remainder", () => {
    const tasks = Array.from({ length: 6 }, (_, i) => makeTask(`t${i}`, "w1"));
    const section = buildWorkspaceStreamSection(
      makeContext(makeWorkspace("w1"), tasks),
      [],
      buildOptions(),
    );

    expect(section.previewLimit).toBe(PREVIEW_LIMIT);
    expect(section.items).toHaveLength(6);
    expect(section.remainingCount).toBe(1);
  });

  it("orders overdue tasks before open tasks and completed items last", () => {
    const context = makeContext(makeWorkspace("w1"), [
      makeTask("open", "w1"),
      makeTask("overdue", "w1", { schedule: { date: YESTERDAY } }),
      makeTask("done", "w1", { status: "completed" }),
    ]);

    const section = buildWorkspaceStreamSection(context, [], buildOptions());

    expect(section.items.map((item) => item.id)).toEqual([
      "overdue",
      "open",
      "done",
    ]);
    expect(section.items[0].isOverdue).toBe(true);
    expect(section.items[0].subtitle).toContain("Overdue");
  });

  it("treats a scheduled task (enabled reminder) as a scheduled-relevance row", () => {
    const triggerAt = new Date(2026, 8, 28, 9, 0, 0).getTime();
    const context = makeContext(makeWorkspace("w1"), [
      makeTask("scheduled", "w1", {
        reminder: { enabled: true, triggerAt },
      }),
    ]);

    const section = buildWorkspaceStreamSection(context, [], buildOptions());
    const item = section.items[0];

    expect(item.hasReminder).toBe(true);
    expect(item.relevance).toBe(STREAM_RELEVANCE.SCHEDULED_TASK);
    expect(item.timeText).toBe("9:00 AM");
  });

  it("ranks an active habit above an open task and puts completed habits last", () => {
    const context = makeContext(
      makeWorkspace("w1"),
      [makeTask("task", "w1")],
      [
        makeHabit("active", "w1", {
          completionHistory: [{ date: YESTERDAY, completedAt: 0 }],
        }),
        makeHabit("done", "w1", {
          completionHistory: [{ date: TODAY, completedAt: 0 }],
        }),
      ],
    );

    const section = buildWorkspaceStreamSection(context, [], buildOptions());

    expect(section.items.map((item) => item.id)).toEqual([
      "active",
      "task",
      "done",
    ]);
    expect(section.items[0].relevance).toBe(STREAM_RELEVANCE.ACTIVE_HABIT);
    expect(section.items[2].relevance).toBe(STREAM_RELEVANCE.DONE);
  });

  it("reports checklist progress as completed/total item count", () => {
    const context = makeContext(makeWorkspace("w1"), [], [], [
      makeChecklist("c1", "w1", [
        { id: "i1", completed: true },
        { id: "i2", completed: false },
      ]),
    ]);

    const section = buildWorkspaceStreamSection(context, [], buildOptions());
    const item = section.items[0];

    expect(item.checklistProgress).toEqual({ completedCount: 1, totalCount: 2 });
    expect(item.subtitle).toBe("1 item left");
    expect(item.completed).toBe(false);
  });

  it("prepares at most RESOURCE_PREVIEW_LIMIT resource tiles and keeps the total", () => {
    const resources: Resource[] = Array.from({ length: 5 }, (_, i) => ({
      id: `res-${i}`,
      workspaceId: "w1",
      title: `Resource ${i}`,
      type: "note",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    }));

    const section = buildWorkspaceStreamSection(
      makeContext(makeWorkspace("w1"), [makeTask("t1", "w1")]),
      resources,
      buildOptions(),
    );

    expect(section.resources).toHaveLength(RESOURCE_PREVIEW_LIMIT);
    expect(section.resourcesTotal).toBe(5);
    expect(section.resources[0].visual.category).toBe("note");
  });

  it("falls back to the primary color when a workspace has no color", () => {
    const section = buildWorkspaceStreamSection(
      makeContext(makeWorkspace("w1", { color: undefined }), [makeTask("t1", "w1")]),
      [],
      buildOptions({ primaryColor: "#ABCDEF" }),
    );

    expect(section.workspaceColor).toBe("#ABCDEF");
  });
});

describe("buildWorkspaceStreamSections", () => {
  it("maps every context to a section, keyed by workspace", () => {
    const contexts = [
      makeContext(makeWorkspace("a"), [makeTask("t1", "a")]),
      makeContext(makeWorkspace("b"), [makeTask("t2", "b")]),
    ];

    const sections = buildWorkspaceStreamSections(contexts, {}, buildOptions());

    expect(sections.map((section) => section.workspace.id)).toEqual(["a", "b"]);
    expect(sections.every((section) => section.items.length === 1)).toBe(true);
  });
});

describe("buildWorkspaceAggregateSection", () => {
  const makeSections = (): WorkspaceStreamSection[] =>
    buildWorkspaceStreamSections(
      [
        makeContext(
          makeWorkspace("a"),
          Array.from({ length: 9 }, (_, i) => makeTask(`a-${i}`, "a")),
        ),
        makeContext(
          makeWorkspace("b"),
          Array.from({ length: 9 }, (_, i) => makeTask(`b-${i}`, "b")),
        ),
      ],
      {},
      buildOptions(),
    );

  it("merges every workspace's rows under one ordering with its own preview budget", () => {
    const aggregate = buildWorkspaceAggregateSection(makeSections(), {
      primaryColor: "#111111",
    });

    expect(aggregate.workspace.id).toBe(AGGREGATE_KEY);
    expect(aggregate.displayName).toBe("All Work");
    expect(aggregate.isAggregate).toBe(true);
    expect(aggregate.previewLimit).toBe(AGGREGATE_PREVIEW_LIMIT);
    expect(aggregate.items).toHaveLength(18);
    expect(aggregate.remainingCount).toBe(18 - AGGREGATE_PREVIEW_LIMIT);
    expect(aggregate.totalItems).toBe(18);
    expect(aggregate.resources).toEqual([]);
  });

  it("sums work units across sections", () => {
    const sections = buildWorkspaceStreamSections(
      [
        makeContext(makeWorkspace("a"), [makeTask("t1", "a")], [], [
          makeChecklist("c1", "a", [{ id: "i1", completed: true }, { id: "i2", completed: false }]),
        ]),
        makeContext(makeWorkspace("b"), [], [makeHabit("h1", "b")]),
      ],
      {},
      buildOptions(),
    );

    const aggregate = buildWorkspaceAggregateSection(sections, {
      primaryColor: "#111111",
    });

    // a: 1 task + 2 checklist items = 3; b: 1 habit = 1
    expect(aggregate.totalItems).toBe(4);
    expect(aggregate.completedItems).toBe(1);
  });
});

describe("buildWorkspaceStreamTabs", () => {
  it("builds the All tab plus one tab per workspace using work-unit counts", () => {
    const contexts = [
      makeContext(makeWorkspace("a", { name: "Alpha" }), [makeTask("t1", "a")]),
      makeContext(makeWorkspace("b", { name: "Beta" }), [], [], [
        makeChecklist("c1", "b", [
          { id: "i1", completed: true },
          { id: "i2", completed: false },
        ]),
      ]),
    ];

    const tabs = buildWorkspaceStreamTabs(
      contexts,
      countWorkspaceUnitsByWorkspace(contexts),
      "#111111",
    );

    expect(tabs[0]).toMatchObject({ id: "all", name: "All", itemCount: 3 });
    expect(tabs[1]).toMatchObject({ id: "a", name: "Alpha", itemCount: 1 });
    expect(tabs[2]).toMatchObject({ id: "b", name: "Beta", itemCount: 2 });
    expect(tabs[1].workspace?.id).toBe("a");
  });
});

describe("compareStreamItems", () => {
  const item = (
    relevance: number,
    tiebreak: number,
    type: WorkspaceStreamItem["type"],
  ): WorkspaceStreamItem =>
    ({
      type,
      id: `${type}-${relevance}-${tiebreak}`,
      key: `${type}-${relevance}-${tiebreak}`,
      completed: false,
      title: type,
      subtitle: "",
      categorySymbol: { icon: "x", color: "#000000", tint: "#000000" },
      original: {} as Task,
      workspaceId: "w",
      workspaceName: "W",
      workspaceColor: "#000000",
      relevance,
      tiebreak,
    }) as WorkspaceStreamItem;

  it("sorts by relevance, then tiebreak, then entity type", () => {
    const items = [
      item(STREAM_RELEVANCE.OPEN_TASK, 0, "task"),
      item(STREAM_RELEVANCE.OVERDUE_TASK, -3, "task"),
      item(STREAM_RELEVANCE.OVERDUE_TASK, -1, "task"),
      item(STREAM_RELEVANCE.SCHEDULED_TASK, 0, "task"),
    ];

    expect(items.sort(compareStreamItems).map((i) => i.tiebreak)).toEqual([
      -3, -1, 0, 0,
    ]);
  });

  it("ranks habits before tasks before checklists within a band", () => {
    const items = [
      item(STREAM_RELEVANCE.DONE, 0, "checklist"),
      item(STREAM_RELEVANCE.DONE, 0, "task"),
      item(STREAM_RELEVANCE.DONE, 0, "habit"),
    ];

    expect(items.sort(compareStreamItems).map((i) => i.type)).toEqual([
      "habit",
      "task",
      "checklist",
    ]);
  });
});

describe("buildWorkspaceStateLine", () => {
  it("alerts when work is overdue", () => {
    expect(
      buildWorkspaceStateLine({
        openCount: 4,
        overdueCount: 2,
        completedCount: 1,
        bestStreakAtRisk: 0,
      }),
    ).toEqual({ text: "2 overdue · 4 open", tone: "alert" });
  });

  it("celebrates an all-clear workspace", () => {
    expect(
      buildWorkspaceStateLine({
        openCount: 0,
        overdueCount: 0,
        completedCount: 3,
        bestStreakAtRisk: 0,
      }),
    ).toEqual({ text: "All clear · 3 done", tone: "success" });
  });

  it("names a streak at risk when nothing is overdue", () => {
    expect(
      buildWorkspaceStateLine({
        openCount: 2,
        overdueCount: 0,
        completedCount: 0,
        bestStreakAtRisk: 5,
      }),
    ).toEqual({ text: "2 open · keep a 5-day streak", tone: "neutral" });
  });
});

describe("single-entity builders", () => {
  it("formats a recurring task's subtitle and frequency", () => {
    const item = buildTaskStreamItem(
      makeTask("t1", "w1", {
        recurrence: { frequency: "weekly", interval: 1 },
      }),
      { id: "w1", name: "W", color: "#000000" },
      TODAY,
      true,
    );

    expect(item.subtitle).toBe("Every week");
    expect(item.timeText).toBeUndefined();
  });

  it("describes a fully-completed checklist as done", () => {
    const item = buildChecklistStreamItem(
      makeChecklist("c1", "w1", [
        { id: "i1", completed: true },
        { id: "i2", completed: true },
      ]),
      { id: "w1", name: "W", color: "#000000" },
      true,
    );

    expect(item.completed).toBe(true);
    expect(item.subtitle).toBe("All done");
    expect(item.relevance).toBe(STREAM_RELEVANCE.DONE);
  });

  it("shows a habit streak and marks it completed for today", () => {
    const item = buildHabitStreamItem(
      makeHabit("h1", "w1", {
        completionHistory: [
          { date: TODAY, completedAt: 0 },
          { date: YESTERDAY, completedAt: 0 },
        ],
      }),
      { id: "w1", name: "W", color: "#000000" },
      true,
    );

    expect(item.completed).toBe(true);
    expect(item.streak).toBe(2);
    expect(item.subtitle).toBe("Completed");
    expect(item.relevance).toBe(STREAM_RELEVANCE.DONE);
  });
});