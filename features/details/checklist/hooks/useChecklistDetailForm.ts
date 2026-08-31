import { useCallback, useState } from "react";

import type { Checklist, ChecklistItem } from "@/shared/types/domain.types";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { dateKeyFromDate } from "@/shared/utils/date-key";

export interface ChecklistFormState {
  title: string;
  description: string;
  workspaceId: string;
  items: ChecklistItem[];
  linkedCollectionIds: string[];
  newItemText: string;
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
}

const INITIAL_FORM: ChecklistFormState = {
  title: "",
  description: "",
  workspaceId: INBOX_WORKSPACE_ID,
  items: [],
  linkedCollectionIds: [],
  newItemText: "",
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
};

const newItemId = () =>
  `checklist-item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

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
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

/**
 * Owns the Checklist Detail edit-form state group (title, description,
 * workspace, items, linked resources, add-item draft, schedule, reminder, recurrence)
 * plus the derived item interactions.
 */
export function useChecklistDetailForm() {
  const [form, setForm] = useState<ChecklistFormState>(INITIAL_FORM);

  const update = useCallback((patch: Partial<ChecklistFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  }, []);

  const reset = useCallback((data: Checklist) => {
    const rec = data.recurrence;
    let reminderDate: string | undefined;
    let reminderTime: ChecklistFormState["reminderTime"];
    if (data.reminder?.triggerAt) {
      const d = new Date(data.reminder.triggerAt);
      reminderDate = dateKeyFromDate(d);
      reminderTime = { hour: d.getHours(), minute: d.getMinutes() };
    }

    let durationMinutes = data.schedule?.durationMinutes;
    if (durationMinutes === undefined && data.schedule?.startTime && data.schedule?.endTime) {
      const [sh, sm] = data.schedule.startTime.split(":").map(Number);
      const [eh, em] = data.schedule.endTime.split(":").map(Number);
      if (!isNaN(sh) && !isNaN(sm) && !isNaN(eh) && !isNaN(em)) {
        durationMinutes = (eh * 60 + em) - (sh * 60 + sm);
        if (durationMinutes <= 0) durationMinutes = 45;
      }
    }

    let scheduleDate = data.schedule?.date || "inbox";
    let recurrenceType = "none";
    let intervalVal = 1;
    let recurrenceDays: number[] = [];
    let recurrenceDayOfMonth = 1;

    if (rec) {
      recurrenceType = rec.frequency || "none";
      intervalVal = rec.interval || 1;
      recurrenceDays = rec.daysOfWeek || [];
      recurrenceDayOfMonth = rec.dayOfMonth || 1;
    }

    setForm({
      title: data.title || "",
      description: data.description || "",
      workspaceId: data.workspaceId || INBOX_WORKSPACE_ID,
      items: data.items || [],
      linkedCollectionIds: data.resourceIds || [],
      newItemText: "",
      scheduleDate,
      startTime: data.schedule?.startTime,
      durationMinutes,
      showDatePicker: false,
      scheduleTimePickerVisible: false,
      reminderDate,
      reminderTime,
      timePickerVisible: false,
      recurrenceType,
      intervalVal,
      recurrenceDays,
      recurrenceDayOfMonth,
    });
  }, []);

  const addItem = useCallback(() => {
    setForm((current) => {
      const text = current.newItemText.trim();
      if (!text) return current;
      const newItem: ChecklistItem = {
        id: newItemId(),
        title: text,
        completed: false,
      };
      return { ...current, items: [...current.items, newItem], newItemText: "" };
    });
  }, []);

  const setNewItemText = useCallback((text: string) => {
    setForm((current) => ({ ...current, newItemText: text }));
  }, []);

  const deleteItem = useCallback((id: string) => {
    setForm((current) => ({
      ...current,
      items: current.items.filter((it) => it.id !== id),
    }));
  }, []);

  const renameItem = useCallback((id: string, text: string) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((it) =>
        it.id === id ? { ...it, title: text } : it,
      ),
    }));
  }, []);

  const moveItemUp = useCallback((index: number) => {
    if (index === 0) return;
    setForm((current) => {
      const next = [...current.items];
      const temp = next[index];
      next[index] = next[index - 1];
      next[index - 1] = temp;
      return { ...current, items: next };
    });
  }, []);

  const moveItemDown = useCallback((index: number) => {
    setForm((current) => {
      if (index === current.items.length - 1) return current;
      const next = [...current.items];
      const temp = next[index];
      next[index] = next[index + 1];
      next[index + 1] = temp;
      return { ...current, items: next };
    });
  }, []);

  const toggleResource = useCallback((resId: string) => {
    setForm((current) => ({
      ...current,
      linkedCollectionIds: current.linkedCollectionIds.includes(resId)
        ? current.linkedCollectionIds.filter((id) => id !== resId)
        : [...current.linkedCollectionIds, resId],
    }));
  }, []);

  const toggleDay = useCallback((day: number) => {
    setForm((current) => {
      const exists = current.recurrenceDays.includes(day);
      const next = exists
        ? current.recurrenceDays.filter((d) => d !== day)
        : [...current.recurrenceDays, day];
      return { ...current, recurrenceDays: next.sort((a, b) => a - b) };
    });
  }, []);

  return {
    form,
    update,
    reset,
    addItem,
    setNewItemText,
    deleteItem,
    renameItem,
    moveItemUp,
    moveItemDown,
    toggleResource,
    toggleDay,
  };
}
