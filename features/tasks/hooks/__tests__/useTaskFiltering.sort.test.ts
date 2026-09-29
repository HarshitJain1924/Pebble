import { compareTasks, getTaskTimeMinutes } from "../useTaskFiltering";
import type { Task } from "@/shared/types/domain.types";

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: "task-default",
    title: "Test Task",
    status: "todo",
    priority: "medium",
    workspaceId: "ws-1",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe("getTaskTimeMinutes", () => {
  it("parses startTime HH:mm into minutes from midnight", () => {
    const task = makeTask({
      schedule: { startTime: "09:30" } as any,
    });
    expect(getTaskTimeMinutes(task)).toBe(9 * 60 + 30);
  });

  it("falls back to reminder.triggerAt when startTime is missing", () => {
    // 14:45 local time
    const d = new Date(2026, 8, 29, 14, 45, 0);
    const task = makeTask({
      reminder: { enabled: true, triggerAt: d.getTime() },
    });
    expect(getTaskTimeMinutes(task)).toBe(14 * 60 + 45);
  });

  it("returns null when no time is specified", () => {
    const task = makeTask({});
    expect(getTaskTimeMinutes(task)).toBeNull();
  });
});

describe("compareTasks", () => {
  it("sorts by priority first (high -> medium -> low)", () => {
    const high = makeTask({ id: "t1", priority: "high" });
    const med = makeTask({ id: "t2", priority: "medium" });
    const low = makeTask({ id: "t3", priority: "low" });

    const list = [low, med, high].sort(compareTasks);
    expect(list.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("sorts by schedule.date when priority is equal", () => {
    const date1 = makeTask({ id: "t1", priority: "high", schedule: { date: "2026-09-20" } as any });
    const date2 = makeTask({ id: "t2", priority: "high", schedule: { date: "2026-09-22" } as any });
    const inbox = makeTask({ id: "t3", priority: "high", schedule: { date: "inbox" } as any });

    const list = [inbox, date2, date1].sort(compareTasks);
    expect(list.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("sorts by time when priority and date are equal", () => {
    const timeEarly = makeTask({
      id: "t1",
      priority: "medium",
      schedule: { date: "2026-09-29", startTime: "08:00" } as any,
    });
    const timeLate = makeTask({
      id: "t2",
      priority: "medium",
      schedule: { date: "2026-09-29", startTime: "14:00" } as any,
    });
    const noTime = makeTask({
      id: "t3",
      priority: "medium",
      schedule: { date: "2026-09-29" } as any,
    });

    const list = [noTime, timeLate, timeEarly].sort(compareTasks);
    expect(list.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("stably tiebreaks by id when priority, date, and time are identical", () => {
    const a = makeTask({ id: "task-a", priority: "none" });
    const b = makeTask({ id: "task-b", priority: "none" });

    const list = [b, a].sort(compareTasks);
    expect(list.map((t) => t.id)).toEqual(["task-a", "task-b"]);
  });
});
