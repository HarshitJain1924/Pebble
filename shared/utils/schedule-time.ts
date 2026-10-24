/**
 * schedule-time.ts
 * ────────────────
 * Framework-independent local-time helpers shared by the UI and the command
 * layer.
 *
 * `computeTriggerEpoch` used to live in the Task-detail React hook module. The
 * command/service layer imported it from there, which pulled React into a pure
 * persistence path and reversed the intended dependency direction
 * (UI → services → repositories). It is a pure date function with no hook
 * dependency, so it belongs here.
 */

/**
 * Resolve a local wall-clock time on an optional `YYYY-MM-DD` date to an epoch
 * in milliseconds.
 *
 * - A concrete date is interpreted in the device's local time zone.
 * - `"inbox"` (or no date) falls back to today's local date.
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
