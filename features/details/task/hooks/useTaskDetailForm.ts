import { useCallback, useState } from "react";

import type { TaskPriority } from "@/shared/types/domain.types";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { dateKeyFromDate } from "@/shared/utils/date-key";
import type { TaskDetailItem } from "@/features/details/task/types";

export interface TaskFormState {
  title: string;
  description: string;
  category: string;
  priority: TaskPriority;
  workspaceId: string;
  scheduleDate: string;
  startTime?: string;
  durationMinutes?: number;
  showDatePicker: boolean;
  scheduleTimePickerVisible: boolean;
  reminderDate?: string;
  reminderTime?: { hour: number; minute: number };
  timePickerVisible: boolean;
  recurrenceType: string;
  intervalVal: number;
  recurrenceDays: number[];
  recurrenceDayOfMonth: number;
  linkedCollectionIds: string[];
}

const INITIAL_FORM: TaskFormState = {
  title: "",
  description: "",
  category: "work",
  priority: "medium",
  workspaceId: INBOX_WORKSPACE_ID,
  scheduleDate: "inbox",
  startTime: undefined,
  durationMinutes: undefined,
  showDatePicker: false,
  scheduleTimePickerVisible: false,
  reminderDate: undefined,
  reminderTime: undefined,
  timePickerVisible: false,
  recurrenceType: "none",
  intervalVal: 1,
  recurrenceDays: [],
  recurrenceDayOfMonth: 1,
  linkedCollectionIds: [],
};

/**
 * Compute the epoch timestamp for a reminder trigger from an hour/minute pair
 * plus a target reminder date string (YYYY-MM-DD). When no concrete date is given,
 * falls back to today in local time.
 */
export function computeTriggerEpoch(
  hour: number,
  minute: number,
  dateStr?: string,
): number {
  if (dateStr && dateStr !== "inbox") {
    const [y, m, d] = dateStr.split("-").map(Number);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return new Date(y, m - 1, d, hour, minute, 0, 0).getTime();
    }
  }
  // No specific date — use today as fallback for scheduling
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

/**
 * Owns the Task Detail edit-form state group (title, description, category,
 * priority, workspace, schedule, reminder, recurrence) plus the derived
 * interactions: re-initializing from a loaded task (`reset`), partial updates
 * (`update`), and toggling recurrence weekdays (`toggleDay`).
 *
 * This is Task-specific: the schedule/reminder/recurrence interplay is owned
 * here so the Habit path in the route file keeps its own (pre-existing) form
 * state untouched.
 */
export function useTaskDetailForm() {
  const [form, setForm] = useState<TaskFormState>(INITIAL_FORM);

  const update = useCallback((patch: Partial<TaskFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  }, []);

  const reset = useCallback((data: TaskDetailItem) => {
    const rec = data.recurrence;
    let reminderDate: string | undefined;
    let reminderTime: TaskFormState["reminderTime"];
    if (data.reminder?.triggerAt) {
      const d = new Date(data.reminder.triggerAt);
      reminderDate = dateKeyFromDate(d);
      reminderTime = { hour: d.getHours(), minute: d.getMinutes() };
    }

    let durationMinutes = data.schedule?.durationMinutes;
    if (durationMinutes === undefined && data.schedule?.startTime && data.schedule?.endTime) {
      const [sH, sM] = data.schedule.startTime.split(":").map(Number);
      const [eH, eM] = data.schedule.endTime.split(":").map(Number);
      if (!isNaN(sH) && !isNaN(sM) && !isNaN(eH) && !isNaN(eM)) {
        const diff = (eH * 60 + eM) - (sH * 60 + sM);
        if (diff > 0) durationMinutes = diff;
      }
    }

    setForm({
      title: data.title || "",
      description: data.description || "",
      category: data.categoryId || data.category || "work",
      priority: data.priority || "medium",
      workspaceId: data.workspaceId || INBOX_WORKSPACE_ID,
      scheduleDate: data.schedule?.date || "inbox",
      startTime: data.schedule?.startTime,
      durationMinutes,
      reminderDate,
      reminderTime,
      showDatePicker: false,
      scheduleTimePickerVisible: false,
      timePickerVisible: false,
      recurrenceType: rec?.frequency || "none",
      intervalVal: rec?.interval || 1,
      recurrenceDays: rec?.daysOfWeek || [],
      recurrenceDayOfMonth: rec?.dayOfMonth || 1,
      // Seed from the canonical `resourceIds` field first, falling back to the
      // legacy `linkedCollectionIds` alias carried by older stored records.
      linkedCollectionIds: data.resourceIds || data.linkedCollectionIds || [],
    });
  }, []);

  const toggleDay = useCallback((idx: number) => {
    setForm((current) => ({
      ...current,
      recurrenceDays: current.recurrenceDays.includes(idx)
        ? current.recurrenceDays.filter((d) => d !== idx)
        : [...current.recurrenceDays, idx],
    }));
  }, []);

  const toggleResource = useCallback((id: string) => {
    setForm((current) => ({
      ...current,
      linkedCollectionIds: current.linkedCollectionIds.includes(id)
        ? current.linkedCollectionIds.filter((resId) => resId !== id)
        : [...current.linkedCollectionIds, id],
    }));
  }, []);

  return { form, update, reset, toggleDay, toggleResource };
}
