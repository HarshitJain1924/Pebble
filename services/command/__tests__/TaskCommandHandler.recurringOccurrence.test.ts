import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { TaskRepository } from "@/repositories/TaskRepository";
import { isRecurringOccurrenceForDate } from "@/services/scheduling/recurrence.service";
import { getStructuredSchedule } from "@/services/scheduling/scheduling.service";
import type { Task } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue("mock-notif-id"),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  setNotificationCategoryAsync: jest.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Medium: "medium" },
  NotificationFeedbackType: { Success: "success" },
}));

describe("TaskCommandHandler.rescheduleRecurringOccurrence Hardened Concurrency & Failure Safety (Fix #9)", () => {
  const wsId = "ws-test-recurrence";

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  function projectCalendarTask(task: Task, selectedDate: string) {
    const matchesDate = isRecurringOccurrenceForDate(task, selectedDate);
    if (!matchesDate || task.schedule?.date === "inbox") {
      return null;
    }
    const sched = getStructuredSchedule(task, 60);
    return {
      id: task.id,
      isAllDay: !sched.startTime,
      startTime: sched.startTime,
      duration: sched.duration,
    };
  }

  async function createDailyMaster(): Promise<Task> {
    const master: Task = {
      id: "task-master-1",
      workspaceId: wsId,
      title: "Daily Standup",
      status: "todo",
      priority: "medium",
      schedule: {
        date: "2026-08-01",
        startTime: "09:00",
        endTime: "09:30",
      },
      recurrence: {
        frequency: "daily",
        interval: 1,
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(master);
    return master;
  }

  // TEST 1 & 2 & 3: Atomic Failure Safety
  test("TEST 1 & 2: Persistence failure during occurrence reschedule rolls back all-or-nothing without partial corruption", async () => {
    const master = await createDailyMaster();

    // Mock AsyncStorage.setItem to throw an error on save
    const originalSetItem = AsyncStorage.setItem;
    AsyncStorage.setItem = jest.fn().mockRejectedValueOnce(new Error("Native Disk IO Failure"));

    await expect(
      EntityCommandService.rescheduleRecurringOccurrence(
        master.id,
        wsId,
        "2026-08-30",
        { hour: 11 },
        { skipEvents: true, skipAnalytics: true }
      )
    ).rejects.toThrow("Native Disk IO Failure");

    AsyncStorage.setItem = originalSetItem;

    // Verify persisted state: master remains completely untouched, no detached copy created
    const tasksMap = await TaskRepository.getTasks(wsId);
    const storedMaster = tasksMap[master.id];
    expect(storedMaster).toBeDefined();
    expect(storedMaster.recurrenceExceptions).toBeUndefined();
    expect(Object.keys(tasksMap)).toHaveLength(1);

    // Verify calendar projection on Aug 30: master still projects normally at 09:00
    const projAug30 = projectCalendarTask(storedMaster, "2026-08-30");
    expect(projAug30).not.toBeNull();
    expect(projAug30?.startTime).toEqual({ hour: 9, minute: 0 });
  });

  // TEST 3: Successful occurrence reschedule converges to master exception + 1 detached occurrence
  test("TEST 3: Successful reschedule results in exactly 1 master exception and 1 detached occurrence", async () => {
    const master = await createDailyMaster();

    const result = await EntityCommandService.rescheduleRecurringOccurrence(
      master.id,
      wsId,
      "2026-08-30",
      { hour: 11 },
      { skipEvents: true, skipAnalytics: true }
    );

    expect(result.masterTask.recurrenceExceptions).toEqual(["2026-08-30"]);
    expect(result.occurrenceTask.schedule?.date).toBe("2026-08-30");
    expect(result.occurrenceTask.schedule?.startTime).toBe("11:00");
    expect(result.occurrenceTask.recurrence).toBeUndefined();

    const tasksMap = await TaskRepository.getTasks(wsId);
    expect(Object.keys(tasksMap)).toHaveLength(2);

    const allTasks = Object.values(tasksMap);
    // Aug 29: Only master projects (09:00)
    const aug29 = allTasks.map((t) => projectCalendarTask(t, "2026-08-29")).filter(Boolean);
    expect(aug29).toHaveLength(1);
    expect(aug29[0]?.id).toBe(master.id);
    expect(aug29[0]?.startTime).toEqual({ hour: 9, minute: 0 });

    // Aug 30: Only detached copy projects (11:00)
    const aug30 = allTasks.map((t) => projectCalendarTask(t, "2026-08-30")).filter(Boolean);
    expect(aug30).toHaveLength(1);
    expect(aug30[0]?.id).toBe(result.occurrenceTask.id);
    expect(aug30[0]?.startTime).toEqual({ hour: 11, minute: 0 });

    // Aug 31: Only master projects (09:00)
    const aug31 = allTasks.map((t) => projectCalendarTask(t, "2026-08-31")).filter(Boolean);
    expect(aug31).toHaveLength(1);
    expect(aug31[0]?.id).toBe(master.id);
    expect(aug31[0]?.startTime).toEqual({ hour: 9, minute: 0 });
  });

  // TEST 4: Retry the same occurrence reschedule operation is idempotent
  test("TEST 4: Re-running reschedule on an already excepted date does not duplicate exceptions", async () => {
    const master = await createDailyMaster();

    await EntityCommandService.rescheduleRecurringOccurrence(
      master.id,
      wsId,
      "2026-08-30",
      { hour: 11 },
      { skipEvents: true, skipAnalytics: true }
    );

    // Re-run
    const result2 = await EntityCommandService.rescheduleRecurringOccurrence(
      master.id,
      wsId,
      "2026-08-30",
      { hour: 14 },
      { skipEvents: true, skipAnalytics: true }
    );

    expect(result2.masterTask.recurrenceExceptions).toEqual(["2026-08-30"]);
  });

  // TEST 5: Same occurrence moved twice sequentially
  test("TEST 5: Moving the detached occurrence a second time updates the detached task without creating duplicates", async () => {
    const master = await createDailyMaster();

    // First drag: Aug 30 from 09:00 to 11:00
    const { occurrenceTask } = await EntityCommandService.rescheduleRecurringOccurrence(
      master.id,
      wsId,
      "2026-08-30",
      { hour: 11 },
      { skipEvents: true, skipAnalytics: true }
    );

    // Second drag: The user now drags the item at 11:00 on Aug 30 to 14:00.
    // In the calendar, the dragged item is occurrenceTask (which is non-recurring).
    // Calendar handleDrop calls updateTask directly on non-recurring tasks.
    const updated = await EntityCommandService.updateTask(
      occurrenceTask.id,
      wsId,
      { schedule: { ...occurrenceTask.schedule, startTime: "14:00" } },
      { skipEvents: true, skipAnalytics: true }
    );

    expect(updated.schedule?.startTime).toBe("14:00");

    const tasksMap = await TaskRepository.getTasks(wsId);
    // Exactly 2 tasks total in workspace: master + 1 detached occurrence
    expect(Object.keys(tasksMap)).toHaveLength(2);

    const allTasks = Object.values(tasksMap);
    const aug30 = allTasks.map((t) => projectCalendarTask(t, "2026-08-30")).filter(Boolean);
    expect(aug30).toHaveLength(1);
    expect(aug30[0]?.id).toBe(occurrenceTask.id);
    expect(aug30[0]?.startTime).toEqual({ hour: 14, minute: 0 });
  });

  // TEST 6: Normal non-recurring Task drag/drop remains untouched
  test("TEST 6: Non-recurring Task drag/drop uses updateTask and does not create exceptions or copies", async () => {
    const oneOffTask: Task = {
      id: "task-one-off",
      workspaceId: wsId,
      title: "One Off Task",
      status: "todo",
      priority: "high",
      schedule: {
        date: "2026-08-30",
        startTime: "10:00",
      },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(oneOffTask);

    await EntityCommandService.updateTask(
      oneOffTask.id,
      wsId,
      { schedule: { ...oneOffTask.schedule, startTime: "15:00" } },
      { skipEvents: true, skipAnalytics: true }
    );

    const tasksMap = await TaskRepository.getTasks(wsId);
    expect(Object.keys(tasksMap)).toHaveLength(1);
    expect(tasksMap["task-one-off"].schedule?.startTime).toBe("15:00");
    expect(tasksMap["task-one-off"].recurrenceExceptions).toBeUndefined();
  });

  // TEST 7: Untouched recurring occurrences across multiple weeks remain unchanged
  test("TEST 7: Rescheduling Aug 30 leaves multiple other projected dates completely untouched", async () => {
    const master = await createDailyMaster();

    await EntityCommandService.rescheduleRecurringOccurrence(
      master.id,
      wsId,
      "2026-08-30",
      { hour: 16 },
      { skipEvents: true, skipAnalytics: true }
    );

    const tasksMap = await TaskRepository.getTasks(wsId);
    const allTasks = Object.values(tasksMap);

    const testDates = ["2026-08-01", "2026-08-15", "2026-08-29", "2026-08-31", "2026-09-10"];
    for (const d of testDates) {
      const projs = allTasks.map((t) => projectCalendarTask(t, d)).filter(Boolean);
      expect(projs).toHaveLength(1);
      expect(projs[0]?.id).toBe(master.id);
      expect(projs[0]?.startTime).toEqual({ hour: 9, minute: 0 });
    }
  });

  // TEST 8: Existing recurrence exception array is preserved
  test("TEST 8: Existing recurrenceExceptions array on the master task is preserved", async () => {
    const masterWithExistingException: Task = {
      id: "task-master-with-exc",
      workspaceId: wsId,
      title: "Daily Standup",
      status: "todo",
      priority: "medium",
      schedule: {
        date: "2026-08-01",
        startTime: "09:00",
      },
      recurrence: {
        frequency: "daily",
        interval: 1,
      },
      recurrenceExceptions: ["2026-08-10", "2026-08-20"],
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(masterWithExistingException);

    const result = await EntityCommandService.rescheduleRecurringOccurrence(
      masterWithExistingException.id,
      wsId,
      "2026-08-30",
      { hour: 11 },
      { skipEvents: true, skipAnalytics: true }
    );

    expect(result.masterTask.recurrenceExceptions).toEqual([
      "2026-08-10",
      "2026-08-20",
      "2026-08-30",
    ]);
  });

  // =========================================================================
  // CONCURRENCY TESTS (PROVING MUTEX & PARTITION SERIALIZATION)
  // =========================================================================

  // TEST A: Recurring occurrence reschedule + unrelated Task update concurrently in same workspace
  test("CONCURRENCY TEST A: Recurring occurrence reschedule + unrelated Task update concurrently in same workspace both survive", async () => {
    const master = await createDailyMaster();
    const unrelatedTask: Task = {
      id: "task-unrelated-1",
      workspaceId: wsId,
      title: "Unrelated Task",
      status: "todo",
      priority: "low",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await TaskRepository.saveTask(unrelatedTask);

    // Launch both concurrently via Promise.all
    const [rescheduleResult, updateResult] = await Promise.all([
      EntityCommandService.rescheduleRecurringOccurrence(
        master.id,
        wsId,
        "2026-08-30",
        { hour: 11 },
        { skipEvents: true, skipAnalytics: true }
      ),
      EntityCommandService.updateTask(
        unrelatedTask.id,
        wsId,
        { title: "Updated Unrelated Task", priority: "high" },
        { skipEvents: true, skipAnalytics: true }
      ),
    ]);

    const tasksMap = await TaskRepository.getTasks(wsId);

    // 1. Master has the exception
    expect(tasksMap[master.id].recurrenceExceptions).toEqual(["2026-08-30"]);

    // 2. Detached copy exists
    expect(tasksMap[rescheduleResult.occurrenceTask.id]).toBeDefined();
    expect(tasksMap[rescheduleResult.occurrenceTask.id].schedule?.startTime).toBe("11:00");

    // 3. Unrelated task has its update preserved without being overwritten
    expect(tasksMap[unrelatedTask.id].title).toBe("Updated Unrelated Task");
    expect(tasksMap[unrelatedTask.id].priority).toBe("high");
  });

  // TEST B: Two different recurring occurrence reschedules concurrently in same workspace
  test("CONCURRENCY TEST B: Two different recurring occurrence reschedules concurrently in same workspace both survive", async () => {
    const master = await createDailyMaster();

    // Launch reschedules for Aug 28 and Aug 30 simultaneously
    const [res1, res2] = await Promise.all([
      EntityCommandService.rescheduleRecurringOccurrence(
        master.id,
        wsId,
        "2026-08-28",
        { hour: 10 },
        { skipEvents: true, skipAnalytics: true }
      ),
      EntityCommandService.rescheduleRecurringOccurrence(
        master.id,
        wsId,
        "2026-08-30",
        { hour: 14 },
        { skipEvents: true, skipAnalytics: true }
      ),
    ]);

    const tasksMap = await TaskRepository.getTasks(wsId);

    // 1. Master has BOTH exceptions
    expect(tasksMap[master.id].recurrenceExceptions).toContain("2026-08-28");
    expect(tasksMap[master.id].recurrenceExceptions).toContain("2026-08-30");
    expect(tasksMap[master.id].recurrenceExceptions).toHaveLength(2);

    // 2. Both detached tasks exist with their correct times
    expect(tasksMap[res1.occurrenceTask.id].schedule?.date).toBe("2026-08-28");
    expect(tasksMap[res1.occurrenceTask.id].schedule?.startTime).toBe("10:00");

    expect(tasksMap[res2.occurrenceTask.id].schedule?.date).toBe("2026-08-30");
    expect(tasksMap[res2.occurrenceTask.id].schedule?.startTime).toBe("14:00");
  });

  // TEST C: Recurring occurrence reschedule + another write to the same master concurrently
  test("CONCURRENCY TEST C: Recurring occurrence reschedule + another write to the same master concurrently preserves both updates", async () => {
    const master = await createDailyMaster();

    // Launch reschedule on Aug 30 + rename master title concurrently
    const [rescheduleResult, updateResult] = await Promise.all([
      EntityCommandService.rescheduleRecurringOccurrence(
        master.id,
        wsId,
        "2026-08-30",
        { hour: 11 },
        { skipEvents: true, skipAnalytics: true }
      ),
      EntityCommandService.updateTask(
        master.id,
        wsId,
        { title: "Daily Standup (Renamed)" },
        { skipEvents: true, skipAnalytics: true }
      ),
    ]);

    const tasksMap = await TaskRepository.getTasks(wsId);
    const finalMaster = tasksMap[master.id];

    // Master has both the updated title AND the recurrence exception
    expect(finalMaster.title).toBe("Daily Standup (Renamed)");
    expect(finalMaster.recurrenceExceptions).toEqual(["2026-08-30"]);

    // Detached task exists
    expect(tasksMap[rescheduleResult.occurrenceTask.id]).toBeDefined();
    expect(tasksMap[rescheduleResult.occurrenceTask.id].schedule?.startTime).toBe("11:00");
  });

  // TEST D: Simultaneous duplicate reschedule of the same occurrence
  test("CONCURRENCY TEST D: Simultaneous duplicate reschedule of the same occurrence does not duplicate exceptions", async () => {
    const master = await createDailyMaster();

    // Launch two identical reschedules for Aug 30 simultaneously
    const [res1, res2] = await Promise.all([
      EntityCommandService.rescheduleRecurringOccurrence(
        master.id,
        wsId,
        "2026-08-30",
        { hour: 11 },
        { skipEvents: true, skipAnalytics: true }
      ),
      EntityCommandService.rescheduleRecurringOccurrence(
        master.id,
        wsId,
        "2026-08-30",
        { hour: 11 },
        { skipEvents: true, skipAnalytics: true }
      ),
    ]);

    const tasksMap = await TaskRepository.getTasks(wsId);
    const finalMaster = tasksMap[master.id];

    // Recurrence exceptions does not contain duplicate "2026-08-30" entries
    expect(finalMaster.recurrenceExceptions).toEqual(["2026-08-30"]);
  });

  // =========================================================================
  // OCCURRENCE IDENTITY & MULTI-OCCURRENCE AUDIT TESTS (FIX #11)
  // =========================================================================

  // SCENARIO 1: Move occurrence onto a date with an existing master occurrence
  test("AUDIT SCENARIO 1: Moving Aug 30 occurrence to Aug 31 preserves normal Aug 31 master occurrence alongside moved Aug 30 detached task", async () => {
    const master = await createDailyMaster();

    // Move Aug 30 occurrence to Aug 31 at 15:00
    const result = await EntityCommandService.rescheduleRecurringOccurrence(
      master.id,
      wsId,
      "2026-08-30",
      { date: "2026-08-31", hour: 15 },
      { skipEvents: true, skipAnalytics: true }
    );

    const tasksMap = await TaskRepository.getTasks(wsId);
    const allTasks = Object.values(tasksMap);

    // On Aug 30: Master is excluded by recurrenceExceptions. Zero tasks.
    const aug30 = allTasks.map((t) => projectCalendarTask(t, "2026-08-30")).filter(Boolean);
    expect(aug30).toHaveLength(0);

    // On Aug 31: Both normal master occurrence (09:00) AND moved detached task (15:00) appear.
    // They represent two distinct logical occurrences: Aug 31 master + Aug 30 moved task.
    const aug31 = allTasks.map((t) => projectCalendarTask(t, "2026-08-31")).filter(Boolean);
    expect(aug31).toHaveLength(2);

    const masterAug31 = aug31.find((t) => t?.id === master.id);
    const detachedAug30 = aug31.find((t) => t?.id === result.occurrenceTask.id);

    expect(masterAug31).toBeDefined();
    expect(masterAug31?.startTime).toEqual({ hour: 9, minute: 0 });

    expect(detachedAug30).toBeDefined();
    expect(detachedAug30?.startTime).toEqual({ hour: 15, minute: 0 });
  });

  // SCENARIO 2 & 4: Two different source occurrences moved to the same target date
  test("AUDIT SCENARIO 2 & 4: Moving two different source occurrences (Aug 28 & Aug 29) to Aug 31 preserves all three distinct logical tasks on Aug 31", async () => {
    const master = await createDailyMaster();

    // Move Aug 28 to Aug 31 @ 10:00
    const res1 = await EntityCommandService.rescheduleRecurringOccurrence(
      master.id,
      wsId,
      "2026-08-28",
      { date: "2026-08-31", hour: 10 },
      { skipEvents: true, skipAnalytics: true }
    );

    // Move Aug 29 to Aug 31 @ 14:00
    const res2 = await EntityCommandService.rescheduleRecurringOccurrence(
      master.id,
      wsId,
      "2026-08-29",
      { date: "2026-08-31", hour: 14 },
      { skipEvents: true, skipAnalytics: true }
    );

    const tasksMap = await TaskRepository.getTasks(wsId);
    const allTasks = Object.values(tasksMap);

    // On Aug 31: Normal master occurrence (09:00) + detached Aug 28 (10:00) + detached Aug 29 (14:00)
    const aug31 = allTasks.map((t) => projectCalendarTask(t, "2026-08-31")).filter(Boolean);
    expect(aug31).toHaveLength(3);

    const ids = aug31.map((t) => t?.id);
    expect(ids).toContain(master.id);
    expect(ids).toContain(res1.occurrenceTask.id);
    expect(ids).toContain(res2.occurrenceTask.id);
  });
});
