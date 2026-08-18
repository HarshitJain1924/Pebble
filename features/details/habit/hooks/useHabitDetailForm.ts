import { useCallback, useState } from "react";

import type { TaskPriority } from "@/shared/types/domain.types";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import type { HabitDetailItem } from "@/features/details/habit/types";

export interface HabitFormState {
  title: string;
  description: string;
  category: string;
  priority: TaskPriority;
  workspaceId: string;
  scheduleDate: string;
  reminderTime?: { hour: number; minute: number };
  timePickerVisible: boolean;
  recurrenceType: string;
  intervalVal: number;
  recurrenceDays: number[];
  recurrenceDayOfMonth: number;
  linkedCollectionIds: string[];
}

const INITIAL_FORM: HabitFormState = {
  title: "",
  description: "",
  category: "work",
  priority: "medium",
  workspaceId: INBOX_WORKSPACE_ID,
  scheduleDate: "inbox",
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
 * plus a schedule date. Habits have no schedule date (always "inbox"), so this
 * falls back to today — matching the pre-extraction behavior exactly.
 */
export function computeTriggerEpoch(
  hour: number,
  minute: number,
  dateStr: string,
): number {
  if (dateStr && dateStr !== "inbox") {
    return new Date(
      `${dateStr}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
    ).getTime();
  }
  // No specific date — use today as fallback for scheduling
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

/**
 * Owns the Habit edit-form state group (title, description, category,
 * priority, workspace, reminder, recurrence, linked resources) plus the
 * derived interactions: re-initializing from a loaded habit (`reset`),
 * partial updates (`update`), and toggling recurrence weekdays (`toggleDay`).
 */
export function useHabitDetailForm() {
  const [form, setForm] = useState<HabitFormState>(INITIAL_FORM);

  const update = useCallback((patch: Partial<HabitFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  }, []);

  const reset = useCallback((data: HabitDetailItem) => {
    const rec = data.recurrence;
    let reminderTime: HabitFormState["reminderTime"];
    if (data.reminder?.triggerAt) {
      const d = new Date(data.reminder.triggerAt);
      reminderTime = { hour: d.getHours(), minute: d.getMinutes() };
    }
    setForm({
      title: data.title || "",
      description: data.description || "",
      category: data.categoryId || data.category || "work",
      priority: data.priority || "medium",
      workspaceId: data.workspaceId || INBOX_WORKSPACE_ID,
      scheduleDate: data.schedule?.date || "inbox",
      reminderTime,
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
