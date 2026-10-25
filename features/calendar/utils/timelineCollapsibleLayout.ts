/**
 * timelineCollapsibleLayout.ts
 *
 * Presentation-layer layout calculations for collapsible empty-time regions on the Day timeline.
 * 
 * Invariants:
 * 1. Base time scale for scheduled items is strictly uniform: 1 hour = 80px (d / 60 * 80px).
 * 2. Small free gaps (< COLLAPSIBLE_GAP_THRESHOLD_MINUTES) remain naturally spaced.
 * 3. Large free gaps (>= COLLAPSIBLE_GAP_THRESHOLD_MINUTES) can be visually collapsed into compact
 *    inline affordances (COLLAPSED_GAP_HEIGHT px) while preserving exact temporal context and 
 *    the gap-aware planning interaction.
 * 4. Expanding a gap restores the full 80px/hour geometry for that region.
 */

export const COLLAPSIBLE_GAP_THRESHOLD_MINUTES = 120; // 2 hours threshold
export const COLLAPSED_GAP_HEIGHT = 52; // Compact row height in px
export const STANDARD_HOUR_HEIGHT = 80; // Pixels per hour

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

/**
 * Derives a stable string key for a free gap from its boundaries.
 */
export function getGapKey(gap: TimelineGap): string {
  return `gap-${gap.startMinutes}-${gap.durationMinutes}`;
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
 * Processes free gaps and determines their visual coordinates and collapse states.
 */
export function processGapsLayout(
  rawGaps: TimelineGap[],
  expandedGapKeys: Set<string>,
  hourHeight: number = STANDARD_HOUR_HEIGHT,
  collapsedGapHeight: number = COLLAPSED_GAP_HEIGHT,
  thresholdMinutes: number = COLLAPSIBLE_GAP_THRESHOLD_MINUTES,
): {
  processedGaps: ProcessedGap[];
  activeCollapsedGaps: TimelineGap[];
  totalHeight: number;
} {
  // 1. Identify which gaps are collapsed
  const activeCollapsedGaps: TimelineGap[] = [];

  const initialClassified = rawGaps.map((gap) => {
    const key = getGapKey(gap);
    const isCollapsible = gap.durationMinutes >= thresholdMinutes;
    // Collapsible by default unless explicitly expanded by user
    const isCollapsed = isCollapsible && !expandedGapKeys.has(key);

    if (isCollapsed) {
      activeCollapsedGaps.push(gap);
    }

    return {
      ...gap,
      key,
      isCollapsible,
      isCollapsed,
      endMinutes: gap.startMinutes + gap.durationMinutes,
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
