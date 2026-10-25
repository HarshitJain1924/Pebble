import AsyncStorage from "@react-native-async-storage/async-storage";
import * as fs from "node:fs";
import * as path from "node:path";
import { Alert, Platform } from "react-native";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { TaskRepository } from "@/repositories/TaskRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { GraphRepository } from "@/repositories/GraphRepository";
import { pluginManager } from "@/plugin";
import {
  cancelReminderIds,
  rearmWebReminders,
  scheduleReminderBatch,
} from "@/services/scheduling/reminders.service";
import type { Task, Workspace } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const DAY_MS = 24 * 60 * 60 * 1000;
const storage = AsyncStorage as typeof AsyncStorage;

const workspace: Workspace = { id: "ws-1", name: "Workspace 1", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 };
const makeTask = (id: string): Task => ({
  id,
  workspaceId: "ws-1",
  title: `Task ${id}`,
  status: "todo",
  priority: "none",
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
});

let alertSpy: jest.SpyInstance;

// Mirrors getNextOccurrenceDate() in reminders.service (local time) so tests
// don't depend on the machine's timezone.
function nextOccurrenceDelay(hour: number, minute: number): number {
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
  return next.getTime() - Date.now();
}

// Simulate the web platform for the whole suite. Each before runs with
// Platform.OS === "web" so scheduleReminderBatch uses the web timer path
// (setTimeout/setInterval) instead of expo-notifications.
beforeEach(async () => {
  jest.restoreAllMocks();
  await storage.clear();
  GraphRepository.resetCache();
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
  jest.replaceProperty(Platform, "OS", "web");
  await WorkspaceRepository.saveWorkspace(workspace);

  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  // Silence side effects exercised by ECS flows; the reminder cancellation
  // behavior itself is tested with the real cancelReminderIds.
  jest.spyOn(require("@/features/profile/services/pebble.service"), "earnPebble").mockResolvedValue(true);
  jest.spyOn(require("@/features/profile/services/pebble.service"), "reversePebbleReward").mockResolvedValue(true);
  jest.spyOn(pluginManager, "dispatchTaskCompleted").mockResolvedValue(undefined);
  jest.spyOn(pluginManager, "dispatchTaskUncompleted").mockResolvedValue(undefined);
  jest.spyOn(require("@/services/events/state-events"), "emitStateChange").mockImplementation(() => {});
  jest.spyOn(require("@/services/analytics/widget-data.service"), "syncWidgetData").mockResolvedValue(undefined);
  jest
    .spyOn(
      require("@/services/analytics/productivity-history.service"),
      "recordDailyHistorySnapshot",
    )
    .mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("web reminder lifecycle", () => {
  it("returns a cancellable timeout id for a one-time web reminder", async () => {
    const now = Date.now();
    const res = await scheduleReminderBatch({
      kind: "todo",
      itemId: "task-1",
      title: "One-time task",
      oneTimeAt: new Date(now + 60_000),
      escalationMinutes: [],
    });

    expect(res.ids).toHaveLength(1);
    expect(res.ids[0]).toMatch(/^web-timeout-\d+$/);

    // Fires once at the trigger time, then nothing more.
    jest.advanceTimersByTime(60_000);
    expect(alertSpy).toHaveBeenCalledTimes(1);

    // Cancelling the returned id prevents any future notification.
    await cancelReminderIds(res.ids);
    jest.advanceTimersByTime(60_000);
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it("returns all cancellable ids for a recurring web reminder (loop + initial timeout per escalation offset)", async () => {
    const res = await scheduleReminderBatch({
      kind: "todo",
      itemId: "task-rec",
      title: "Recurring task",
      dailyTime: { hour: 0, minute: 30 },
      recurrence: { type: "daily" },
      escalationMinutes: [120, 240],
    });

    // Non-interval recurrence schedules one loop per escalation offset.
    const loopIds = res.ids.filter((id) => id.startsWith("web-interval-"));
    const timeoutIds = res.ids.filter((id) => id.startsWith("web-timeout-"));
    expect(loopIds).toHaveLength(3);
    expect(timeoutIds).toHaveLength(3);

    // Cancelling all ids synchronously stops every pending initial timeout,
    // so nothing ever fires — even across several days of interval repeats.
    await cancelReminderIds(res.ids);
    jest.advanceTimersByTime(10 * DAY_MS);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("cancelReminderIds stops a recurring web interval (Bug 1 regression)", async () => {
    const res = await scheduleReminderBatch({
      kind: "todo",
      itemId: "task-daily",
      title: "Daily task",
      dailyTime: { hour: 0, minute: 30 },
      escalationMinutes: [],
    });

    const loopId = res.ids.find((id) => id.startsWith("web-interval-"));
    expect(loopId).toBeDefined();

    // Initial fire at the next 00:30 occurrence, then the interval repeats daily.
    const initialDelay = nextOccurrenceDelay(0, 30) + 1;
    jest.advanceTimersByTime(initialDelay);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(DAY_MS);
    expect(alertSpy).toHaveBeenCalledTimes(2);

    // Cancelling the loop id clears the interval — no more notifications.
    await cancelReminderIds([loopId!]);
    jest.advanceTimersByTime(10 * DAY_MS);
    expect(alertSpy).toHaveBeenCalledTimes(2);
  });

  it("cancelling a recurring loop before its initial fire prevents it entirely", async () => {
    const res = await scheduleReminderBatch({
      kind: "todo",
      itemId: "task-cancel-early",
      title: "Cancelled task",
      dailyTime: { hour: 0, minute: 30 },
      escalationMinutes: [],
    });

    const loopId = res.ids.find((id) => id.startsWith("web-interval-"));
    await cancelReminderIds([loopId!]);
    jest.advanceTimersByTime(5 * DAY_MS);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("completing a task cancels its web reminder", async () => {
    const now = Date.now();
    const batch = await scheduleReminderBatch({
      kind: "todo",
      itemId: "task-complete",
      title: "Complete me",
      oneTimeAt: new Date(now + 60_000),
      escalationMinutes: [],
    });
    await TaskRepository.saveTask({
      ...makeTask("task-complete"),
      reminder: { enabled: true, triggerAt: now + 60_000, notificationIds: batch.ids },
    });

    await EntityCommandService.completeTask("task-complete", "ws-1");

    jest.advanceTimersByTime(120_000);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("recycling (deleting) a task cancels its web reminder", async () => {
    const now = Date.now();
    const batch = await scheduleReminderBatch({
      kind: "todo",
      itemId: "task-delete",
      title: "Delete me",
      oneTimeAt: new Date(now + 60_000),
      escalationMinutes: [],
    });
    await TaskRepository.saveTask({
      ...makeTask("task-delete"),
      reminder: { enabled: true, triggerAt: now + 60_000, notificationIds: batch.ids },
    });

    await EntityCommandService.recycleTask("task-delete", "ws-1", "Workspace 1");

    jest.advanceTimersByTime(120_000);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("editing a reminder cancels the old web schedule and keeps only the new one", async () => {
    const now = Date.now();
    const first = await scheduleReminderBatch({
      kind: "todo",
      itemId: "task-edit",
      title: "Edit me",
      oneTimeAt: new Date(now + 60_000),
      escalationMinutes: [],
    });
    await TaskRepository.saveTask({
      ...makeTask("task-edit"),
      reminder: { enabled: true, triggerAt: now + 60_000, notificationIds: first.ids },
    });

    await EntityCommandService.updateTask("task-edit", "ws-1", {
      reminder: { enabled: true, triggerAt: now + 300_000 },
    });

    // Old schedule must not fire at 60s; the new one fires exactly once at 300s.
    for (let i = 0; i < 10; i++) await Promise.resolve(); // Drain nested microtasks (Promise.all in cancelReminderIds)
    jest.advanceTimersByTime(61_000);
    expect(alertSpy).not.toHaveBeenCalled();
    jest.advanceTimersByTime(240_000);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(300_000);
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it("uncompleting a task creates exactly one new web schedule (no duplicate timers)", async () => {
    const now = Date.now();
    const batch = await scheduleReminderBatch({
      kind: "todo",
      itemId: "task-uncomplete",
      title: "Uncomplete me",
      oneTimeAt: new Date(now + 60_000),
      escalationMinutes: [],
    });
    await TaskRepository.saveTask({
      ...makeTask("task-uncomplete"),
      reminder: { enabled: true, triggerAt: now + 60_000, notificationIds: batch.ids },
    });

    await EntityCommandService.completeTask("task-uncomplete", "ws-1");
    await EntityCommandService.uncompleteTask("task-uncomplete", "ws-1");

    const finalTask = await TaskRepository.getTask("task-uncomplete", "ws-1");
    expect(finalTask?.reminder?.notificationIds?.length).toBeGreaterThan(0);
    expect(
      finalTask?.reminder?.notificationIds?.some(
        (id) => id.startsWith("web-interval-") || id.startsWith("web-timeout-"),
      ),
    ).toBe(true);

    // Exactly one schedule fires at the trigger time — no duplicate old timers.
    for (let i = 0; i < 10; i++) await Promise.resolve();
    jest.advanceTimersByTime(61_000);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(10 * 60_000);
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it("rearming after reload cancels stale ids and never accumulates duplicate timers", async () => {
    const now = Date.now();
    // The ids persisted from a previous page session are dead handles after a
    // reload — rearming must tolerate them and produce one fresh schedule.
    const baseTask: Task = {
      ...makeTask("task-rearm"),
      reminder: {
        enabled: true,
        triggerAt: now + 60_000,
        notificationIds: ["web-timeout-424242", "web-interval-loop-999999"],
      },
    };

    const first = await rearmWebReminders([baseTask]);
    expect(first[0].reminder?.notificationIds?.length).toBeGreaterThan(0);

    // A second reload/rearm (screen focus, state event) replaces the schedule
    // instead of stacking a second one.
    await rearmWebReminders(first);

    for (let i = 0; i < 10; i++) await Promise.resolve();
    jest.advanceTimersByTime(61_000);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(10 * 60_000);
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it("does not write runtime web timer handles (_webTimeoutId) anywhere in loadState", () => {
    // Regression guard: the old loadState web block persisted `web-<timeoutId>`
    // handles into task state. Those handles were never cancellable and every
    // reload created duplicates. The canonical scheduler makes them unnecessary.
    const source = fs.readFileSync(
      path.join(process.cwd(), "features", "tasks", "hooks", "useTasksState.ts"),
      "utf8",
    );
    expect(source).not.toContain("_webTimeoutId");
  });
});
