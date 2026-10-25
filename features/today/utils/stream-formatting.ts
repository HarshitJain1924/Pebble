import { getDateKey } from "@/features/tasks/utils/task-formatting";

/**
 * Pure formatting helpers for the Today workspace stream.
 *
 * These used to live inside `WorkspaceSectionedStream.tsx`. They are pure
 * (no React, no theme) so the stream's data layer can build presentation
 * strings without touching the component tree.
 */

/**
 * Relative age of an overdue item, expressed as a day count.
 * `null` when the date is today or in the future (i.e. not actually overdue).
 */
export function getDaysOverdue(dateStr: string): number | null {
  if (!dateStr) return null;
  const todayStr = getDateKey();
  if (dateStr === todayStr) return null;
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const [dy, dm, dd] = dateStr.split("-").map(Number);
  const todayDate = new Date(ty, tm - 1, td);
  const taskDate = new Date(dy, dm - 1, dd);
  const diffTime = todayDate.getTime() - taskDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : null;
}

/** Human label for an overdue item's age (`null` days = generic "Overdue"). */
export function getOverdueLabel(daysOverdue: number | null): string {
  if (daysOverdue === null) return "Overdue";
  if (daysOverdue === 1) return "Yesterday";
  return `${daysOverdue} days ago`;
}

/** Localised `H:MM AM/PM` label for a reminder trigger timestamp. */
export function formatTime(triggerAt: number): string {
  const d = new Date(triggerAt);
  const ampm = d.getHours() >= 12 ? "PM" : "AM";
  const displayHour = d.getHours() % 12 || 12;
  const displayMinute = String(d.getMinutes()).padStart(2, "0");
  return `${displayHour}:${displayMinute} ${ampm}`;
}

/** Human recurrence label ("Every day", "Every 2 weeks", ...). */
export function formatFrequency(frequency?: string): string | null {
  if (!frequency) return null;
  const freq = String(frequency).toLowerCase();
  if (freq === "daily") return "Every day";
  if (freq === "weekly") return "Every week";
  if (freq === "monthly") return "Every month";
  return `Every ${freq}`;
}

/**
 * Horizontal offset that centres a tab in the strip viewport. Exported so the
 * scroll arithmetic can be verified without a real layout pass.
 */
export function getTabScrollTarget(
  tabX: number,
  tabWidth: number,
  windowWidth: number,
): number {
  return Math.max(0, tabX - windowWidth / 2 + tabWidth / 2);
}
