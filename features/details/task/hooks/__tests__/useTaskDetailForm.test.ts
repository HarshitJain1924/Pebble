import React from "react";
import { act, create } from "react-test-renderer";
import {
  useTaskDetailForm,
  computeTriggerEpoch,
} from "@/features/details/task/hooks/useTaskDetailForm";
import type { TaskDetailItem } from "@/features/details/task/types";

describe("useTaskDetailForm and Reminder Date Isolation (Fix #5)", () => {
  const originalReminderDate = "2026-08-29";
  const [rY, rM, rD] = originalReminderDate.split("-").map(Number);
  const originalReminderEpoch = new Date(rY, rM - 1, rD, 20, 0, 0, 0).getTime();

  const taskWithDiffReminderDate: TaskDetailItem = {
    id: "task-f5-1",
    workspaceId: "inbox",
    title: "Prepare presentation",
    description: "Slides for review",
    categoryId: "work",
    priority: "high",
    status: "todo",
    schedule: {
      date: "2026-08-30",
      startTime: "15:00",
    },
    reminder: {
      enabled: true,
      triggerAt: originalReminderEpoch,
    },
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  function renderFormHook() {
    let currentApi!: ReturnType<typeof useTaskDetailForm>;
    function Harness() {
      currentApi = useTaskDetailForm();
      return null;
    }
    let renderer: any;
    act(() => {
      renderer = create(React.createElement(Harness));
    });
    return {
      get current() {
        return currentApi;
      },
      renderer,
    };
  }

  test("TEST 1: Reset extracts reminderDate and reminderTime independently from scheduleDate", () => {
    const hook = renderFormHook();

    act(() => {
      hook.current.reset(taskWithDiffReminderDate);
    });

    expect(hook.current.form.scheduleDate).toBe("2026-08-30");
    expect(hook.current.form.startTime).toBe("15:00");
    expect(hook.current.form.reminderDate).toBe("2026-08-29");
    expect(hook.current.form.reminderTime).toEqual({ hour: 20, minute: 0 });
  });

  test("TEST 2: computeTriggerEpoch on unchanged reminderDate and reminderTime preserves the exact epoch", () => {
    const computedEpoch = computeTriggerEpoch(20, 0, "2026-08-29");
    expect(computedEpoch).toBe(originalReminderEpoch);
  });

  test("TEST 3: Changing only scheduleDate does not alter form.reminderDate", () => {
    const hook = renderFormHook();

    act(() => {
      hook.current.reset(taskWithDiffReminderDate);
    });

    act(() => {
      hook.current.update({ scheduleDate: "2026-09-02" });
    });

    expect(hook.current.form.scheduleDate).toBe("2026-09-02");
    expect(hook.current.form.reminderDate).toBe("2026-08-29");
    expect(hook.current.form.reminderTime).toEqual({ hour: 20, minute: 0 });
  });

  test("TEST 4: Changing only startTime does not alter form.reminderDate or reminderTime", () => {
    const hook = renderFormHook();

    act(() => {
      hook.current.reset(taskWithDiffReminderDate);
    });

    act(() => {
      hook.current.update({ startTime: "17:00" });
    });

    expect(hook.current.form.startTime).toBe("17:00");
    expect(hook.current.form.reminderDate).toBe("2026-08-29");
    expect(hook.current.form.reminderTime).toEqual({ hour: 20, minute: 0 });
  });

  test("TEST 5: Changing reminder time from 20:00 to 21:30 reconstructs triggerAt on reminderDate (Aug 29), NOT scheduleDate (Aug 30)", () => {
    const newTriggerAt = computeTriggerEpoch(21, 30, "2026-08-29");
    const expectedEpoch = new Date(rY, rM - 1, rD, 21, 30, 0, 0).getTime();
    const wrongEpoch = new Date(2026, 7, 30, 21, 30, 0, 0).getTime();

    expect(newTriggerAt).toBe(expectedEpoch);
    expect(newTriggerAt).not.toBe(wrongEpoch);
  });

  test("TEST 6: Task with no reminder resets with reminderDate=undefined, reminderTime=undefined", () => {
    const taskNoReminder: TaskDetailItem = {
      id: "task-f5-no-rem",
      workspaceId: "inbox",
      title: "No Reminder Task",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30" },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const hook = renderFormHook();

    act(() => {
      hook.current.reset(taskNoReminder);
    });

    expect(hook.current.form.reminderDate).toBeUndefined();
    expect(hook.current.form.reminderTime).toBeUndefined();
  });

  test("TEST 7: Task with reminder on the SAME date as schedule preserves both dates", () => {
    const sameDateEpoch = new Date(2026, 7, 30, 10, 0, 0, 0).getTime();
    const taskSameDate: TaskDetailItem = {
      id: "task-f5-same",
      workspaceId: "inbox",
      title: "Same Date Task",
      status: "todo",
      priority: "medium",
      schedule: { date: "2026-08-30", startTime: "10:00" },
      reminder: { enabled: true, triggerAt: sameDateEpoch },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const hook = renderFormHook();

    act(() => {
      hook.current.reset(taskSameDate);
    });

    expect(hook.current.form.scheduleDate).toBe("2026-08-30");
    expect(hook.current.form.reminderDate).toBe("2026-08-30");
    expect(hook.current.form.reminderTime).toEqual({ hour: 10, minute: 0 });
  });

  test("TEST 8: Changing reminder date alone reconstructs triggerAt with new reminder date while schedule date is unchanged", () => {
    const hook = renderFormHook();

    act(() => {
      hook.current.reset(taskWithDiffReminderDate);
    });

    act(() => {
      hook.current.update({ reminderDate: "2026-08-28" });
    });

    expect(hook.current.form.scheduleDate).toBe("2026-08-30");
    expect(hook.current.form.reminderDate).toBe("2026-08-28");

    const newEpoch = computeTriggerEpoch(
      hook.current.form.reminderTime!.hour,
      hook.current.form.reminderTime!.minute,
      hook.current.form.reminderDate,
    );
    const expectedEpoch = new Date(2026, 7, 28, 20, 0, 0, 0).getTime();
    expect(newEpoch).toBe(expectedEpoch);
  });
});
