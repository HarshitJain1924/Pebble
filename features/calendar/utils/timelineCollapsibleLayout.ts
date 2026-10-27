/**
 * timelineCollapsibleLayout.ts
 *
 * Presentation-layer layout calculations for collapsible empty-time regions on the Day timeline.
 *
 * Invariants:
 * 1. Base time scale is strictly uniform: 1 hour = 80px (d / 60 * 80px).
 * 2. Free time stays at true scale by default. The timeline never silently removes
 *    hours from the middle of the day: a 2-hour gap and a 2-hour meeting render at
 *    the same height.
 * 3. Only dead day-edge regions auto-collapse (the time before the first item and
 *    after the last item of the day), and only while at least
 *    MIN_EXPANDED_SCALE_MINUTES of the day remains at true scale.
 * 4. A gap containing the current time never auto-collapses, so the NOW line always
 *    sits on a real time scale.
 * 5. Any gap at or above the threshold is manually collapsible/expandable, and an
 *    explicit user override always wins over the automatic default.
 */

export const COLLAPSIBLE_GAP_THRESHOLD_MINUTES = 120; // 2 hours threshold
export const COLLAPSED_GAP_HEIGHT = 52; // Compact row height in px
export const STANDARD_HOUR_HEIGHT = 80; // Pixels per hour
export const MIN_EXPANDED_SCALE_MINUTES = 240; // Keep at least 4h of the day at true scale
export const DAY_MINUTES = 1440;

export interface TimelineGap {
  startMinutes: number;
  durationMinutes: number;
  [key: string]: any;
}

export interface ProcessedGap extends TimelineGap {
  key: string;
  isCollapsible: boolean;
  isCollapsed: boolean;
  top: number;
  height: number;
  endMinutes: number;
}

/** Explicit user overrides. Both sets hold `getGapKey()` values. */
export interface GapCollapseOverrides {
  expandedKeys?: Set<string>;
  collapsedKeys?: Set<string>;
}

export interface GapLayoutOptions {
  hourHeight?: number;
  collapsedGapHeight?: number;
  thresholdMinutes?: number;
  /** Current wall-clock minute of day (0..1439), only when the selected day is today. */
  nowMinutes?: number | null;
}

/**
 * Derives a stable string key for a free gap from its boundaries.
 */
export function getGapKey(gap: TimelineGap): string {
  return `gap-${gap.startMinutes}-${gap.durationMinutes}`;
}

function getGapEnd(gap: TimelineGap): number {
  return gap.startMinutes + gap.durationMinutes;
}

/**
 * Calculates the vertical Y coordinate (in pixels) for any minute of the day (0..1440)
 * given the currently active collapsed gaps.
 *
 * For any time interval outside collapsed gaps (e.g. scheduled tasks),
 * the rate of change is strictly standard: dY / dt = hourHeight / 60.
 */
export function calculateTimeYCoordinate(
  minuteOfDay: number,
  activeCollapsedGaps: TimelineGap[],
  hourHeight: number = STANDARD_HOUR_HEIGHT,
  collapsedGapHeight: number = COLLAPSED_GAP_HEIGHT,
): number {
  const t = Math.max(0, Math.min(1440, minuteOfDay));
  let y = 0;
  let cursorMinutes = 0;

  // Sort collapsed gaps chronologically
  const sortedGaps = [...activeCollapsedGaps].sort((a, b) => a.startMinutes - b.startMinutes);

  for (const gap of sortedGaps) {
    const gapStart = Math.max(0, gap.startMinutes);
    const gapEnd = Math.min(1440, gap.startMinutes + gap.durationMinutes);

    if (t <= gapStart) {
      // Time is before this gap
      y += ((t - cursorMinutes) / 60) * hourHeight;
      return y;
    }

    // Add time from cursor to gap start
    y += ((gapStart - cursorMinutes) / 60) * hourHeight;

    if (t <= gapEnd) {
      // Time is inside this collapsed gap -> interpolate within the collapsed height
      const progressInGap = (t - gapStart) / (gapEnd - gapStart);
      y += progressInGap * collapsedGapHeight;
      return y;
    }

    // Time is after this gap -> add collapsed gap height
    y += collapsedGapHeight;
    cursorMinutes = gapEnd;
  }

  // Add remaining time after last collapsed gap
  y += ((t - cursorMinutes) / 60) * hourHeight;
  return y;
}

/**
 * Computes the total rendered height of the Day timeline with active collapsed gaps.
 */
export function getTotalTimelineHeight(
  activeCollapsedGaps: TimelineGap[],
  hourHeight: number = STANDARD_HOUR_HEIGHT,
  collapsedGapHeight: number = COLLAPSED_GAP_HEIGHT,
): number {
  return calculateTimeYCoordinate(1440, activeCollapsedGaps, hourHeight, collapsedGapHeight);
}

/**
 * A dead-edge gap starts at midnight or ends at midnight. A gap spanning the whole
 * day is not an edge gap: an empty day must keep its full scale so it can be planned.
 */
export function isDayEdgeGap(gap: TimelineGap): boolean {
  const touchesStart = gap.startMinutes <= 0;
  const touchesEnd = getGapEnd(gap) >= DAY_MINUTES;
  return (touchesStart || touchesEnd) && !(touchesStart && touchesEnd);
}

/**
 * Decides which gaps collapse by default.
 *
 * Only dead day edges qualify, and the result is filtered so the timeline always
 * keeps at least MIN_EXPANDED_SCALE_MINUTES of true-scale time to plan into.
 */
export function resolveAutoCollapsedGaps(
  rawGaps: TimelineGap[],
  options: Pick<GapLayoutOptions, "thresholdMinutes" | "nowMinutes"> = {},
): TimelineGap[] {
  const {
    thresholdMinutes = COLLAPSIBLE_GAP_THRESHOLD_MINUTES,
    nowMinutes = null,
  } = options;

  const candidates = [...rawGaps]
    .sort((a, b) => a.startMinutes - b.startMinutes)
    .filter((gap) => {
      if (gap.durationMinutes < thresholdMinutes) return false;
      if (!isDayEdgeGap(gap)) return false;
      // Never fold away the part of the day the user is currently living in.
      if (
        nowMinutes !== null &&
        nowMinutes >= gap.startMinutes &&
        nowMinutes <= getGapEnd(gap)
      ) {
        return false;
      }
      return true;
    });

  const accepted: TimelineGap[] = [];
  let collapsedMinutes = 0;
  for (const gap of candidates) {
    if (DAY_MINUTES - (collapsedMinutes + gap.durationMinutes) < MIN_EXPANDED_SCALE_MINUTES) {
      continue;
    }
    collapsedMinutes += gap.durationMinutes;
    accepted.push(gap);
  }
  return accepted;
}

/**
 * Processes free gaps and determines their visual coordinates and collapse states.
 */
export function processGapsLayout(
  rawGaps: TimelineGap[],
  overrides: GapCollapseOverrides = {},
  options: GapLayoutOptions = {},
): {
  processedGaps: ProcessedGap[];
  activeCollapsedGaps: TimelineGap[];
  totalHeight: number;
} {
  const {
    hourHeight = STANDARD_HOUR_HEIGHT,
    collapsedGapHeight = COLLAPSED_GAP_HEIGHT,
    thresholdMinutes = COLLAPSIBLE_GAP_THRESHOLD_MINUTES,
    nowMinutes = null,
  } = options;

  const autoCollapsedKeys = new Set(
    resolveAutoCollapsedGaps(rawGaps, { thresholdMinutes, nowMinutes }).map(getGapKey),
  );
  const expandedKeys = overrides.expandedKeys ?? new Set<string>();
  const collapsedKeys = overrides.collapsedKeys ?? new Set<string>();

  // 1. Identify which gaps are collapsed
  const activeCollapsedGaps: TimelineGap[] = [];

  const initialClassified = rawGaps.map((gap) => {
    const key = getGapKey(gap);
    const isCollapsible = gap.durationMinutes >= thresholdMinutes;
    const defaultCollapsed = autoCollapsedKeys.has(key);
    // An explicit user override always beats the automatic default.
    const isCollapsed =
      isCollapsible &&
      (collapsedKeys.has(key) || (!expandedKeys.has(key) && defaultCollapsed));

    if (isCollapsed) {
      activeCollapsedGaps.push(gap);
    }

    return {
      ...gap,
      key,
      isCollapsible,
      isCollapsed,
      endMinutes: getGapEnd(gap),
    };
  });

  // 2. Compute visual top and height for each gap using the active collapsed gaps
  const processedGaps: ProcessedGap[] = initialClassified.map((item) => {
    const top = calculateTimeYCoordinate(
      item.startMinutes,
      activeCollapsedGaps,
      hourHeight,
      collapsedGapHeight,
    );
    const bottom = calculateTimeYCoordinate(
      item.endMinutes,
      activeCollapsedGaps,
      hourHeight,
      collapsedGapHeight,
    );
    const height = Math.max(
      item.isCollapsed ? collapsedGapHeight : 34,
      bottom - top,
    );

    return {
      ...item,
      top,
      height,
    };
  });

  const totalHeight = getTotalTimelineHeight(
    activeCollapsedGaps,
    hourHeight,
    collapsedGapHeight,
  );

  return {
    processedGaps,
    activeCollapsedGaps,
    totalHeight,
  };
}
