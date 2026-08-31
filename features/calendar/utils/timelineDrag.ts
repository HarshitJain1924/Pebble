/**
 * timelineDrag.ts
 *
 * Pure helpers and coordinate transformations for minute-accurate drag-and-drop
 * on Pebble's 24-hour timeline with support for collapsible empty-time regions.
 */

import {
  COLLAPSED_GAP_HEIGHT,
  STANDARD_HOUR_HEIGHT,
  TimelineGap,
} from "./timelineCollapsibleLayout";

export const DRAG_SNAP_MINUTES = 15;
export const LONG_PRESS_ACTIVATION_MS = 380; // 380ms for responsive long-press vs tap distinction

export interface DraggedItemTimeTarget {
  startHour: number;
  startMinute: number;
  startMinutes: number;
  endHour: number;
  endMinute: number;
  endMinutes: number;
  durationMinutes: number;
  fits: boolean;
  timeRangeLabel: string;
  durationLabel: string;
}

/**
 * Snaps a minute-of-day value to the configured interval (e.g. 15 minutes).
 * Example: 607m (10:07) -> 600m (10:00), 608m (10:08) -> 615m (10:15)
 */
export function snapMinutesToInterval(
  minutes: number,
  intervalMinutes: number = DRAG_SNAP_MINUTES,
): number {
  return Math.round(minutes / intervalMinutes) * intervalMinutes;
}

/**
 * Mathematical inverse of calculateTimeYCoordinate:
 * Converts a vertical Y pixel coordinate back into the exact minute of the day (0..1440),
 * respecting any active collapsed empty-time regions.
 */
export function calculateMinuteFromTimeYCoordinate(
  y: number,
  activeCollapsedGaps: TimelineGap[] = [],
  hourHeight: number = STANDARD_HOUR_HEIGHT,
  collapsedGapHeight: number = COLLAPSED_GAP_HEIGHT,
): number {
  if (y <= 0) return 0;

  const sortedGaps = [...activeCollapsedGaps].sort(
    (a, b) => a.startMinutes - b.startMinutes,
  );

  let currentY = 0;
  let cursorMinutes = 0;

  for (const gap of sortedGaps) {
    const gapStart = Math.max(0, gap.startMinutes);
    const gapEnd = Math.min(1440, gap.startMinutes + gap.durationMinutes);

    // Standard uncollapsed interval before this gap
    const uncollapsedHeight = ((gapStart - cursorMinutes) / 60) * hourHeight;
    const gapStartY = currentY + uncollapsedHeight;

    if (y <= gapStartY) {
      // Y is in the standard timeline interval before this gap
      const fraction = (y - currentY) / hourHeight;
      return Math.max(0, Math.min(1440, cursorMinutes + fraction * 60));
    }

    const gapEndY = gapStartY + collapsedGapHeight;

    if (y <= gapEndY) {
      // Y is inside the collapsed gap -> interpolate within the gap's temporal boundaries
      const progressInGap = (y - gapStartY) / collapsedGapHeight;
      const gapSpan = gapEnd - gapStart;
      return Math.max(0, Math.min(1440, gapStart + progressInGap * gapSpan));
    }

    currentY = gapEndY;
    cursorMinutes = gapEnd;
  }

  // After all collapsed gaps
  const remainingFraction = (y - currentY) / hourHeight;
  return Math.max(0, Math.min(1440, cursorMinutes + remainingFraction * 60));
}

/**
 * Calculates the dragged item's start minute from finger Y and grab offset inside the card,
 * with boundary clamping and snapping.
 */
export function calculateDraggedItemStartMinutes(
  fingerY: number,
  grabOffsetY: number,
  activeCollapsedGaps: TimelineGap[] = [],
  durationMinutes: number = 60,
  hourHeight: number = STANDARD_HOUR_HEIGHT,
  collapsedGapHeight: number = COLLAPSED_GAP_HEIGHT,
  snapMinutes: number = DRAG_SNAP_MINUTES,
): number {
  // Top coordinate of the card according to finger position and grab offset
  const cardTopY = fingerY - grabOffsetY;
  const rawMinute = calculateMinuteFromTimeYCoordinate(
    cardTopY,
    activeCollapsedGaps,
    hourHeight,
    collapsedGapHeight,
  );

  const snapped = snapMinutesToInterval(rawMinute, snapMinutes);
  // Clamp so item does not extend past end of day unless midnight crossing is supported
  const maxStart = Math.max(0, 1440 - durationMinutes);
  return Math.max(0, Math.min(maxStart, snapped));
}

/**
 * Formats a single hour and minute into standard 12-hour display string.
 */
export function formatTimeLabel(h: number, m: number): string {
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h >= 12 ? "PM" : "AM";
  const mStr = m < 10 ? `0${m}` : `${m}`;
  return `${displayH}:${mStr} ${ampm}`;
}

/**
 * Formats duration in minutes into a friendly string (e.g. 1h 30m, 45m).
 */
export function formatDurationLabel(durationMinutes: number): string {
  const hrs = Math.floor(durationMinutes / 60);
  const mins = durationMinutes % 60;
  if (hrs > 0) {
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }
  return `${mins}m`;
}

/**
 * Builds a structured DraggedItemTimeTarget object for previewing and drop execution.
 */
export function buildDraggedItemTimeTarget(
  startMinutes: number,
  durationMinutes: number,
): DraggedItemTimeTarget {
  const normalizedStart = Math.max(0, Math.min(1440, startMinutes));
  const endMinutes = normalizedStart + durationMinutes;
  const fits = endMinutes <= 1440;

  const startHour = Math.floor(normalizedStart / 60);
  const startMinute = normalizedStart % 60;

  const endNorm = Math.min(1440, endMinutes);
  const endHour = Math.floor(endNorm / 60) % 24;
  const endMinute = endNorm % 60;

  const startLabel = formatTimeLabel(startHour, startMinute);
  const endLabel = formatTimeLabel(endHour, endMinute);
  const durationLabel = formatDurationLabel(durationMinutes);

  return {
    startHour,
    startMinute,
    startMinutes: normalizedStart,
    endHour,
    endMinute,
    endMinutes,
    durationMinutes,
    fits,
    timeRangeLabel: `${startLabel} – ${endLabel}`,
    durationLabel,
  };
}

/**
 * Validates whether a drop target fits within the 24-hour Day bounds.
 */
export function validateDropTarget(
  startMinutes: number,
  durationMinutes: number,
): boolean {
  return startMinutes >= 0 && startMinutes + durationMinutes <= 1440;
}
