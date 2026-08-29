import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { TaskRepository } from "@/repositories/TaskRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { GraphRepository } from "@/repositories/GraphRepository";
import { pluginManager } from "@/plugin";
import { getTodayDateKey } from "@/shared/utils/domain-selectors";
import type { Habit, Task, Workspace } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const storage = AsyncStorage as typeof AsyncStorage;

const workspace: Workspace = {
  id: "ws-1",
  name: "Workspace 1",
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
};

const task = (id: string, withReminder = true): Task => ({
  id,
  workspaceId: "ws-1",
  title: `Task ${id}`,
  status: "todo",
  priority: "none",
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
  ...(withReminder
    ? {
        reminder: {
          enabled: true,
          triggerAt: Date.now() + 60_000,
          notificationIds: [`native-${id}`],
        },
      }
    : {}),
});

const habit = (id: string, withReminder = true): Habit => ({
  id,
  workspaceId: "ws-1",
  title: `Habit ${id}`,
  recurrence: { frequency: "daily", interval: 1 },
  completionHistory: [],
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
  ...(withReminder
    ? {
        reminder: {
          enabled: true,
          triggerAt: Date.now() + 60_000,
          notificationIds: [`native-${id}`],
        },
      }
    : {}),
});

let earnPebbleSpy: jest.SpyInstance;
let cancelReminderIdsSpy: jest.SpyInstance;
let dispatchTaskCompletedSpy: jest.SpyInstance;
let dispatchHabitCompletedSpy: jest.SpyInstance;
let emitStateChangeSpy: jest.SpyInstance;
let syncWidgetDataSpy: jest.SpyInstance;
let recordDailyHistorySnapshotSpy: jest.SpyInstance;

beforeEach(async () => {
  await storage.clear();
  jest.restoreAllMocks();
  GraphRepository.resetCache();
  await WorkspaceRepository.saveWorkspace(workspace);

  earnPebbleSpy = jest
    .spyOn(require("@/features/profile/services/pebble.service"), "earnPebble")
    .mockResolvedValue(true);
  cancelReminderIdsSpy = jest
    .spyOn(require("@/services/scheduling/reminders.service"), "cancelReminderIds")
    .mockResolvedValue(undefined);
  dispatchTaskCompletedSpy = jest
    .spyOn(pluginManager, "dispatchTaskCompleted")
    .mockResolvedValue(undefined);
  dispatchHabitCompletedSpy = jest
    .spyOn(pluginManager, "dispatchHabitCompleted")
    .mockResolvedValue(undefined);
  emitStateChangeSpy = jest
    .spyOn(require("@/services/events/state-events"), "emitStateChange")
    .mockImplementation(() => {});
  syncWidgetDataSpy = jest
    .spyOn(require("@/services/analytics/widget-data.service"), "syncWidgetData")
    .mockResolvedValue(undefined);
  recordDailyHistorySnapshotSpy = jest
    .spyOn(
      require("@/services/analytics/productivity-history.service"),
      "recordDailyHistorySnapshot",
    )
    .mockResolvedValue(undefined);
});

describe("bulk vs single lifecycle side-effect parity", () => {
  test("completeTasks matches completeTask per item (pebbles, reminders, plugins, analytics, events)", async () => {
    await TaskRepository.saveTask(task("task-a"));
    await TaskRepository.saveTask(task("task-b"));
    await TaskRepository.saveTask(task("task-c"));

    // Single-item baseline
    await EntityCommandService.completeTask("task-a", "ws-1");
    expect(earnPebbleSpy).toHaveBeenCalledWith("task", "task:task-a");
    expect(cancelReminderIdsSpy).toHaveBeenCalledWith(["native-task-a"], { throwOnError: false });
    expect(dispatchTaskCompletedSpy).toHaveBeenCalledTimes(1);
    expect(emitStateChangeSpy).toHaveBeenCalledWith("tasks_changed", undefined);
    expect(recordDailyHistorySnapshotSpy).toHaveBeenCalledTimes(1);
    expect(syncWidgetDataSpy).toHaveBeenCalledTimes(1);

    const singleBaseline = {
      pebbles: earnPebbleSpy.mock.calls.length,
      reminders: cancelReminderIdsSpy.mock.calls.length,
      plugins: dispatchTaskCompletedSpy.mock.calls.length,
      events: emitStateChangeSpy.mock.calls.filter(
        (c) => c[0] === "tasks_changed",
      ).length,
      snapshots: recordDailyHistorySnapshotSpy.mock.calls.length,
      widgetSyncs: syncWidgetDataSpy.mock.calls.length,
    };

    // Bulk on two tasks: per-item side effects double, consolidated ones stay 1
    const updated = await EntityCommandService.completeTasks(
      [
        { taskId: "task-b", workspaceId: "ws-1" },
        { taskId: "task-c", workspaceId: "ws-1" },
      ],
      { source: "tasks_screen" },
    );

    expect(updated).toHaveLength(2);
    expect(earnPebbleSpy).toHaveBeenCalledWith("task", "task:task-b");
    expect(earnPebbleSpy).toHaveBeenCalledWith("task", "task:task-c");

    expect(earnPebbleSpy.mock.calls.length).toBe(singleBaseline.pebbles + 2);
    expect(cancelReminderIdsSpy.mock.calls.length).toBe(
      singleBaseline.reminders + 2,
    );
    expect(dispatchTaskCompletedSpy.mock.calls.length).toBe(
      singleBaseline.plugins + 2,
    );
    // One consolidated event + analytics + widget sync for the batch
    expect(
      emitStateChangeSpy.mock.calls.filter((c) => c[0] === "tasks_changed")
        .length,
    ).toBe(singleBaseline.events + 1);
    expect(recordDailyHistorySnapshotSpy.mock.calls.length).toBe(
      singleBaseline.snapshots + 1,
    );
    // Widget sync fires per item (same as N single completions), never consolidated
    expect(syncWidgetDataSpy.mock.calls.length).toBe(
      singleBaseline.widgetSyncs + 2,
    );
    expect(emitStateChangeSpy).toHaveBeenLastCalledWith(
      "tasks_changed",
      "tasks_screen",
    );

    // Canonical completion state persisted
    const tasks = await TaskRepository.getTasks("ws-1");
    expect(tasks["task-b"].status).toBe("completed");
    expect(tasks["task-b"].completedAt).toBeDefined();
    expect(tasks["task-c"].status).toBe("completed");
    expect(tasks["task-a"].status).toBe("completed");
  });

  test("completeHabits matches completeHabit per item", async () => {
    await HabitRepository.saveHabit(habit("habit-a"));
    await HabitRepository.saveHabit(habit("habit-b"));
    await HabitRepository.saveHabit(habit("habit-c"));

    await EntityCommandService.completeHabit("habit-a", "ws-1");
    expect(earnPebbleSpy).toHaveBeenCalledWith(
      "habit",
      `habit:habit-a:${getTodayDateKey()}`,
    );
    expect(dispatchHabitCompletedSpy).toHaveBeenCalledTimes(1);

    const singleBaseline = {
      pebbles: earnPebbleSpy.mock.calls.length,
      plugins: dispatchHabitCompletedSpy.mock.calls.length,
      events: emitStateChangeSpy.mock.calls.filter(
        (c) => c[0] === "habits_changed",
      ).length,
      snapshots: recordDailyHistorySnapshotSpy.mock.calls.length,
      widgetSyncs: syncWidgetDataSpy.mock.calls.length,
    };

    const updated = await EntityCommandService.completeHabits(
      [
        { habitId: "habit-b", workspaceId: "ws-1" },
        { habitId: "habit-c", workspaceId: "ws-1" },
      ],
      { source: "tasks_screen" },
    );

    expect(updated).toHaveLength(2);
    expect(earnPebbleSpy.mock.calls.length).toBe(singleBaseline.pebbles + 2);
    expect(dispatchHabitCompletedSpy.mock.calls.length).toBe(
      singleBaseline.plugins + 2,
    );
    expect(
      emitStateChangeSpy.mock.calls.filter((c) => c[0] === "habits_changed")
        .length,
    ).toBe(singleBaseline.events + 1);
    expect(recordDailyHistorySnapshotSpy.mock.calls.length).toBe(
      singleBaseline.snapshots + 1,
    );
    expect(syncWidgetDataSpy.mock.calls.length).toBe(
      singleBaseline.widgetSyncs + 2,
    );

    const habits = await HabitRepository.getHabits("ws-1");
    expect(habits["habit-b"].completionHistory.some((c) => c.date === getTodayDateKey())).toBe(true);
    expect(habits["habit-c"].completionHistory.some((c) => c.date === getTodayDateKey())).toBe(true);
  });

  test("archiveTasks matches the single-item archive (updateTask archivedAt)", async () => {
    await TaskRepository.saveTask(task("task-a"));
    await TaskRepository.saveTask(task("task-b"));
    await TaskRepository.saveTask(task("task-c"));

    // Single-item archive baseline
    await EntityCommandService.updateTask(
      "task-a",
      "ws-1",
      { archivedAt: Date.now(), updatedAt: Date.now() },
      { skipEvents: true, skipAnalytics: true },
    );
    expect(cancelReminderIdsSpy).toHaveBeenCalledWith(["native-task-a"], { throwOnError: false });

    const updated = await EntityCommandService.archiveTasks(
      [
        { taskId: "task-b", workspaceId: "ws-1" },
        { taskId: "task-c", workspaceId: "ws-1" },
      ],
      { source: "tasks_screen" },
    );

    expect(updated).toHaveLength(2);
    // Reminders cancelled per task, one consolidated event + analytics + widget sync
    expect(cancelReminderIdsSpy.mock.calls.length).toBe(3);
    expect(
      emitStateChangeSpy.mock.calls.filter((c) => c[0] === "tasks_changed")
        .length,
    ).toBe(1);
    expect(recordDailyHistorySnapshotSpy.mock.calls.length).toBe(1);
    // Widget sync fires per item inside updateTask (1 single baseline + 2 bulk)
    expect(syncWidgetDataSpy.mock.calls.length).toBe(3);

    const tasks = await TaskRepository.getTasks("ws-1");
    expect(tasks["task-b"].archivedAt).toBeDefined();
    expect(tasks["task-c"].archivedAt).toBeDefined();
    // notification IDs cleared on archive
    expect(tasks["task-b"].reminder?.notificationIds).toBeUndefined();
    expect(tasks["task-c"].reminder?.notificationIds).toBeUndefined();
  });

  test("archiveHabits matches the single-item archive (updateHabit archivedAt)", async () => {
    await HabitRepository.saveHabit(habit("habit-a"));
    await HabitRepository.saveHabit(habit("habit-b"));
    await HabitRepository.saveHabit(habit("habit-c"));

    await EntityCommandService.updateHabit(
      "habit-a",
      "ws-1",
      { archivedAt: Date.now(), updatedAt: Date.now() },
      { skipEvents: true, skipAnalytics: true },
    );
    expect(cancelReminderIdsSpy).toHaveBeenCalledWith(["native-habit-a"], { throwOnError: false });

    const updated = await EntityCommandService.archiveHabits(
      [
        { habitId: "habit-b", workspaceId: "ws-1" },
        { habitId: "habit-c", workspaceId: "ws-1" },
      ],
      { source: "tasks_screen" },
    );

    expect(updated).toHaveLength(2);
    expect(cancelReminderIdsSpy.mock.calls.length).toBe(3);
    expect(
      emitStateChangeSpy.mock.calls.filter((c) => c[0] === "habits_changed")
        .length,
    ).toBe(1);
    expect(recordDailyHistorySnapshotSpy.mock.calls.length).toBe(1);

    const habits = await HabitRepository.getHabits("ws-1");
    expect(habits["habit-b"].archivedAt).toBeDefined();
    expect(habits["habit-c"].archivedAt).toBeDefined();
    expect(habits["habit-b"].reminder?.notificationIds).toBeUndefined();
    expect(habits["habit-c"].reminder?.notificationIds).toBeUndefined();
  });

  test("bulk complete skips already-completed tasks and still emits one event", async () => {
    await TaskRepository.saveTask(task("task-a"));
    await TaskRepository.saveTask(task("task-b"));

    // Pre-complete one
    await EntityCommandService.completeTask("task-a", "ws-1", {
      skipEvents: true,
      skipAnalytics: true,
    });
    const earnCallsBefore = earnPebbleSpy.mock.calls.length;

    const updated = await EntityCommandService.completeTasks(
      [
        { taskId: "task-a", workspaceId: "ws-1" }, // already completed
        { taskId: "task-b", workspaceId: "ws-1" },
      ],
      { source: "tasks_screen" },
    );

    // task-a was already completed → completeTask no-ops internally, so no
    // duplicate pebble reward or event emission, yet both items are returned.
    expect(updated).toHaveLength(2);
    expect(earnPebbleSpy.mock.calls.length).toBe(earnCallsBefore + 1);
    expect(
      emitStateChangeSpy.mock.calls.filter((c) => c[0] === "tasks_changed")
        .length,
    ).toBe(1);
  });
});
