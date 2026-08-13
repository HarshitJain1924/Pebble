import AsyncStorage from "@react-native-async-storage/async-storage";
import { ChecklistRepository, HabitRepository, TaskRepository } from "@/repositories";
import { getPebbleCounts } from "@/features/profile/services/pebble.service";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { buildActiveContexts } from "@/features/today/hooks/useTodaySelectors";
import {
  buildItemDetailsRoute,
  getCheckboxAction,
  getRowContentAction,
} from "@/features/today/utils/today-interactions";
import { isTaskCompleted } from "@/shared/utils/domain-selectors";
import type { Checklist, Habit, Task, Workspace } from "@/shared/types/domain.types";

let mockStore: Record<string, string> = {};

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockImplementation(async (key) => mockStore[key] || null),
  setItem: jest.fn().mockImplementation(async (key, value) => {
    mockStore[key] = String(value);
    return null;
  }),
  removeItem: jest.fn().mockImplementation(async (key) => {
    delete mockStore[key];
    return null;
  }),
  clear: jest.fn().mockImplementation(async () => {
    mockStore = {};
    return null;
  }),
}));

describe("Today screen row interaction model", () => {
  beforeEach(() => {
    mockStore = {};
    jest.clearAllMocks();
  });

  // ── Task rows ────────────────────────────────────────────────────────────

  it("opens Task Details when a task row's content is tapped (never the workspace list)", () => {
    const action = getRowContentAction("task", "task-nav-1");
    expect(action.action).toBe("open-details");
    if (action.action === "open-details") {
      expect(action.route).toBe("/task-details?id=task-nav-1&type=task");
      // Regression: the old behavior navigated to the workspace list
      // (/tasks?workspaceId=...) — the content tap must not do that anymore.
      expect(action.route).not.toContain("workspaceId");
    }
  });

  it("builds the Task/Habit details route used by Today row content taps", () => {
    expect(buildItemDetailsRoute("t1", "task")).toBe(
      "/task-details?id=t1&type=task",
    );
    expect(buildItemDetailsRoute("h1", "habit")).toBe(
      "/task-details?id=h1&type=habit",
    );
  });

  it("treats task checkboxes as completion toggles in both directions (incomplete and completed)", () => {
    expect(getCheckboxAction("task", false)).toBe("toggle-completion");
    // Completed tasks stay visible and can be unchecked on the Today screen.
    expect(getCheckboxAction("task", true)).toBe("toggle-completion");
  });

  it("task checkbox completes incomplete task and uncompletes completed task (ledger stays exact)", async () => {
    const task: Task = {
      id: "cb-task-1",
      workspaceId: "work",
      title: "Checkbox Task",
      status: "todo",
      priority: "medium",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await TaskRepository.saveTask(task);

    // Direction 1: incomplete task -> checking completes it
    expect(getCheckboxAction("task", false)).toBe("toggle-completion");
    const completed = await EntityCommandService.completeTask(task.id, "work");
    expect(completed?.updated.status).toBe("completed");
    let counts = await getPebbleCounts();
    expect(counts.today).toBe(1);

    // Direction 2: completed task -> unchecking uncompletes it
    expect(getCheckboxAction("task", true)).toBe("toggle-completion");
    const uncompleted = await EntityCommandService.uncompleteTask(
      task.id,
      "work",
    );
    expect(uncompleted?.updated.status).toBe("todo");
    counts = await getPebbleCounts();
    expect(counts.today).toBe(0);
  });

  // ── Completed task visibility ────────────────────────────────────────────

  it("keeps completed tasks visible in their workspace context", () => {
    const folder: Workspace = {
      id: "work",
      name: "Work",
      emoji: "💼",
      color: "#6366F1",
      createdAt: 1,
      updatedAt: 1,
    };
    const pending: Task = {
      id: "t-pending",
      workspaceId: "work",
      title: "Pending Task",
      status: "todo",
      priority: "high",
      createdAt: 1,
      updatedAt: 1,
    };
    const completed: Task = {
      id: "t-done",
      workspaceId: "work",
      title: "Completed Task",
      status: "completed",
      priority: "none",
      createdAt: 1,
      updatedAt: 1,
    };

    const contexts = buildActiveContexts({
      folders: [folder],
      displayedTodos: [pending],
      displayedCompletedTodos: [completed],
      displayedOverdue: [],
      pendingHabits: [],
      completedHabits: [],
      allChecklists: {},
      activeFilter: "all",
      searchQuery: "",
    });

    expect(contexts).toHaveLength(1);
    const ctx = contexts[0];
    expect(ctx.folder.id).toBe("work");
    expect(ctx.tasks).toHaveLength(2);

    const done = ctx.tasks.find((t) => t.id === completed.id);
    expect(done).toBeDefined();
    // The completed task stays classified as completed
    expect(isTaskCompleted(done!)).toBe(true);
  });

  // ── Habit rows ───────────────────────────────────────────────────────────

  it("opens Habit Details when a habit row's content is tapped", () => {
    const action = getRowContentAction("habit", "h1");
    expect(action.action).toBe("open-details");
    if (action.action === "open-details") {
      expect(action.route).toBe("/task-details?id=h1&type=habit");
    }
  });

  it("treats habit checkboxes as completion toggles (never locked, no navigation)", () => {
    expect(getCheckboxAction("habit", false)).toBe("toggle-completion");
    expect(getCheckboxAction("habit", true)).toBe("toggle-completion");
  });

  it("habit checkbox only completes/uncompletes the habit (ledger stays exact)", async () => {
    const habit: Habit = {
      id: "cb-habit-1",
      workspaceId: "work",
      title: "Checkbox Habit",
      recurrence: { frequency: "daily", interval: 1 },
      completionHistory: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await HabitRepository.saveHabit(habit);

    const completed = await EntityCommandService.completeHabit(habit.id, "work");
    expect(completed?.updated.completionHistory.length).toBe(1);
    let counts = await getPebbleCounts();
    expect(counts.today).toBe(1);

    const uncompleted = await EntityCommandService.uncompleteHabit(
      habit.id,
      "work",
    );
    expect(uncompleted?.updated.completionHistory.length).toBe(0);
    counts = await getPebbleCounts();
    expect(counts.today).toBe(0);
  });

  // ── Checklist rows (inline behavior preserved) ──────────────────────────

  it("keeps checklist rows inline: content expands/collapses, no details navigation", () => {
    expect(getRowContentAction("checklist", "cl-1").action).toBe(
      "toggle-expand",
    );
    expect(getCheckboxAction("checklist", false)).toBe("toggle-expand");
    expect(getCheckboxAction("checklist", true)).toBe("toggle-expand");
  });

  it("checklist completion behavior remains unchanged (single award, no reverse, no double award)", async () => {
    const checklist: Checklist = {
      id: "cl-toggle-1",
      workspaceId: "work",
      title: "Groceries",
      items: [
        { id: "i1", title: "Milk", completed: false },
        { id: "i2", title: "Eggs", completed: false },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await ChecklistRepository.saveChecklist(checklist);

    // Completing a single item does not award the checklist pebble yet
    await EntityCommandService.toggleChecklistItem(
      "cl-toggle-1",
      "i1",
      "work",
      { skipEvents: true, skipAnalytics: true },
    );
    let counts = await getPebbleCounts();
    expect(counts.today).toBe(0);

    // Completing the final item awards exactly one pebble
    await EntityCommandService.toggleChecklistItem(
      "cl-toggle-1",
      "i2",
      "work",
      { skipEvents: true, skipAnalytics: true },
    );
    counts = await getPebbleCounts();
    expect(counts.today).toBe(1);
    expect(counts.todayTypes?.checklist).toBe(1);

    // Unchecking an item does NOT reverse the reward (unchanged behavior)
    await EntityCommandService.toggleChecklistItem(
      "cl-toggle-1",
      "i1",
      "work",
      { skipEvents: true, skipAnalytics: true },
    );
    counts = await getPebbleCounts();
    expect(counts.today).toBe(1);

    // Re-completing must not double-award (pebbleAwarded guard)
    await EntityCommandService.toggleChecklistItem(
      "cl-toggle-1",
      "i1",
      "work",
      { skipEvents: true, skipAnalytics: true },
    );
    counts = await getPebbleCounts();
    expect(counts.today).toBe(1);
  });
});
