/**
 * date-key.ts
 * ────────────
 * Canonical date-key utilities — the single source of truth for calendar-day
 * strings in the app.
 *
 * A "date key" is a calendar-day string in the app's YYYY-MM-DD format, always
 * computed from LOCAL time (never UTC), matching how every feature buckets
 * tasks, habits, history, and pebbles by day. All other modules import these
 * helpers instead of re-implementing them so a day boundary can only be defined
 * in one place.
 *
 * This module intentionally has zero imports so any module (including
 * recurrence.service and domain-selectors) can depend on it without cycles.
 */

/** Format a Date as a local YYYY-MM-DD date key. */
export function dateKeyFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local date key for today. */
export function getTodayDateKey(): string {
  return dateKeyFromDate(new Date());
}

/**
 * Date key `offsetDays` before `fromDateKey` (or before today when omitted).
 * Positive offsets go into the past; negative offsets into the future.
 */
export function getOffsetDateKey(
  offsetDays: number,
  fromDateKey?: string,
): string {
  const d = fromDateKey ? parseDateKey(fromDateKey) : new Date();
  d.setDate(d.getDate() - offsetDays);
  return dateKeyFromDate(d);
}

/** Parse a YYYY-MM-DD date key into a local Date at midnight. */
export function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
