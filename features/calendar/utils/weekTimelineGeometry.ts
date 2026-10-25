/**
 * weekTimelineGeometry.ts
 * ────────────────────────
 * Canonical coordinate, time conversion, date mapping, and drag targeting helpers
 * for Pebble's spatial Week Horizon Calendar.
 */

import {
  DRAG_SNAP_MINUTES,
  snapMinutesToInterval,
  formatTimeLabel,
  formatDurationLabel,
  DraggedItemTimeTarget,
} from "./timelineDrag";
import { dateKeyFromDate, parseDateKey } from "@/shared/utils/date-key";

export const WEEK_HOUR_HEIGHT = 60;
export const WEEK_TIME_LABEL_WIDTH = 50;
export { DRAG_SNAP_MINUTES };

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Converts a physical Y pixel offset in the Week grid to a continuous minute of the day [0, 1440].
 */
export function calculateWeekMinuteFromY(
  y: number,
  hourHeight: number = WEEK_HOUR_HEIGHT,
): number {
  if (hourHeight <= 0) return 0;
  const rawMinutes = (y / hourHeight) * 60;
  return Math.max(0, Math.min(1440, rawMinutes));
}

/**
 * Converts a minute of the day [0, 1440] to a physical Y pixel offset in the Week grid.
 */
export function calculateWeekYFromMinute(
  minute: number,
  hourHeight: number = WEEK_HOUR_HEIGHT,
): number {
  const normalizedMinute = Math.max(0, Math.min(1440, minute));
  return (normalizedMinute / 60) * hourHeight;
}

/**
 * Maps a touch X coordinate to a day index (0 = Monday ... 6 = Sunday)
 * taking into account container offset, time label gutter, column width, and horizontal scroll.
 */
export function calculateWeekDayIndexFromX(
  touchX: number,
  containerX: number,
  dayColWidth: number,
  scrollOffset: number = 0,
  timeLabelWidth: number = WEEK_TIME_LABEL_WIDTH,
): number {
  if (dayColWidth <= 0) return 0;
  const localX = touchX - containerX - timeLabelWidth + scrollOffset;
  const dayIndex = Math.floor(localX / dayColWidth);
  return Math.max(0, Math.min(6, dayIndex));
}

/**
 * Calculates the local YYYY-MM-DD date key for a given day index (0..6)
 * relative to the week's Monday date string.
 */
export function calculateWeekTargetDate(
  dayIndex: number,
  weekStartMondayDateStr: string,
): string {
  const mondayDate = parseDateKey(weekStartMondayDateStr);
  const targetDate = new Date(
    mondayDate.getFullYear(),
    mondayDate.getMonth(),
    mondayDate.getDate() + Math.max(0, Math.min(6, dayIndex)),
  );
  return dateKeyFromDate(targetDate);
}

/**
 * Returns a 3-letter weekday label ("Mon", "Tue", etc.) for a YYYY-MM-DD date string.
 */
export function formatWeekDayName(dateStr: string): string {
  const d = parseDateKey(dateStr);
  return WEEKDAY_SHORT[d.getDay()];
}

export interface WeekDraggedItemTarget extends DraggedItemTimeTarget {
  targetDate: string;
  targetDayIndex: number;
  weekdayName: string;
  fullPreviewLabel: string;
}

/**
 * Calculates the 2D Week drag target (Date + Time) with 15-minute snapping,
 * touch grab-offset preservation, and duration clamping.
 */
export function calculateWeekDraggedItemTarget(
  touchX: number,
  touchY: number,
  grabOffsetY: number,
  containerX: number,
  containerY: number,
  dayColWidth: number,
  scrollOffsetX: number,
  scrollOffsetY: number,
  weekStartMondayDateStr: string,
  durationMinutes: number = 60,
  hourHeight: number = WEEK_HOUR_HEIGHT,
  timeLabelWidth: number = WEEK_TIME_LABEL_WIDTH,
  snapMinutes: number = DRAG_SNAP_MINUTES,
): WeekDraggedItemTarget {
  // 1. Calculate target day index & date
  const dayIndex = calculateWeekDayIndexFromX(
    touchX,
    containerX,
    dayColWidth,
    scrollOffsetX,
    timeLabelWidth,
  );
  const targetDate = calculateWeekTargetDate(dayIndex, weekStartMondayDateStr);
  const weekdayName = formatWeekDayName(targetDate);

  // 2. Calculate target time with grab offset
  const localY = touchY - containerY + scrollOffsetY;
  const effectiveTopY = localY - (grabOffsetY || 0);
  const rawMinute = calculateWeekMinuteFromY(effectiveTopY, hourHeight);
  const snappedMinute = snapMinutesToInterval(rawMinute, snapMinutes);

  // 3. Clamp start so duration fits within the 24-hour day
  const maxAllowedStart = Math.max(0, 1440 - durationMinutes);
  const clampedStartMinutes = Math.max(0, Math.min(maxAllowedStart, snappedMinute));
  const endMinutes = clampedStartMinutes + durationMinutes;
  const fits = endMinutes <= 1440;

  const startHour = Math.floor(clampedStartMinutes / 60);
  const startMinute = clampedStartMinutes % 60;
  const endNorm = Math.min(1440, endMinutes);
  const endHour = Math.floor(endNorm / 60) % 24;
  const endMinute = endNorm % 60;

  const startLabel = formatTimeLabel(startHour, startMinute);
  const endLabel = formatTimeLabel(endHour, endMinute);
  const durationLabel = formatDurationLabel(durationMinutes);
  const timeRangeLabel = `${startLabel} – ${endLabel}`;
  const fullPreviewLabel = `${weekdayName} · ${timeRangeLabel}`;

  return {
    targetDate,
    targetDayIndex: dayIndex,
    weekdayName,
    startHour,
    startMinute,
    startMinutes: clampedStartMinutes,
    endHour,
    endMinute,
    endMinutes,
    durationMinutes,
    fits,
    timeRangeLabel,
    durationLabel,
    fullPreviewLabel,
  };
}
