import {
  COLLAPSIBLE_GAP_THRESHOLD_MINUTES,
  COLLAPSED_GAP_HEIGHT,
  DAY_MINUTES,
  MIN_EXPANDED_SCALE_MINUTES,
  STANDARD_HOUR_HEIGHT,
  getGapKey,
  calculateTimeYCoordinate,
  getTotalTimelineHeight,
  isDayEdgeGap,
  processGapsLayout,
  resolveAutoCollapsedGaps,
  TimelineGap,
} from "../timelineCollapsibleLayout";

describe("Timeline Collapsible Layout Mathematical & Structural Invariants", () => {
  // Test 1: Small free gaps (< 120 min) remain expanded / non-collapsible
  test("Gaps smaller than COLLAPSIBLE_GAP_THRESHOLD_MINUTES (120m) are not marked as collapsible", () => {
    const rawGaps: TimelineGap[] = [
      { startMinutes: 540, durationMinutes: 30 }, // 30m
      { startMinutes: 600, durationMinutes: 45 }, // 45m
      { startMinutes: 720, durationMinutes: 90 }, // 90m
    ];

    const { processedGaps, activeCollapsedGaps } = processGapsLayout(
      rawGaps,
      {},
      {
        hourHeight: STANDARD_HOUR_HEIGHT,
        collapsedGapHeight: COLLAPSED_GAP_HEIGHT,
        thresholdMinutes: COLLAPSIBLE_GAP_THRESHOLD_MINUTES,
      },
    );

    expect(activeCollapsedGaps.length).toBe(0);
    processedGaps.forEach((gap) => {
      expect(gap.isCollapsible).toBe(false);
      expect(gap.isCollapsed).toBe(false);
      // Coordinate height matches standard 80px/hr
      expect(gap.height).toBe((gap.durationMinutes / 60) * STANDARD_HOUR_HEIGHT);
    });
  });

  // Test 2: THE regression guard — an interior gap must never lose its real height.
  // Collapsing time between two scheduled items made a 4h30m region of the day render
  // 52px tall while a 2h meeting rendered 160px tall, so the day stopped being proportional.
  test("Large interior gaps stay at true 80px/hour scale instead of collapsing", () => {
    const rawGaps: TimelineGap[] = [
      { startMinutes: 570, durationMinutes: 270 }, // 9:30 AM - 2:00 PM (interior)
      { startMinutes: 900, durationMinutes: 300 }, // 3:00 PM - 8:00 PM (interior)
    ];

    const { processedGaps, activeCollapsedGaps, totalHeight } = processGapsLayout(rawGaps, {}, {});

    expect(activeCollapsedGaps.length).toBe(0);
    processedGaps.forEach((gap) => {
      expect(gap.isCollapsed).toBe(false);
      expect(gap.height).toBe((gap.durationMinutes / 60) * STANDARD_HOUR_HEIGHT);
    });
    expect(processedGaps[0].height).toBe(360);
    expect(processedGaps[1].height).toBe(400);
    expect(totalHeight).toBe(24 * 80);
  });

  // Test 3: Dead day edges are the only automatic collapse candidates
  test("Dead day-edge gaps collapse while the day keeps at least the minimum true-scale time", () => {
    const rawGaps: TimelineGap[] = [
      { startMinutes: 0, durationMinutes: 420 }, // Midnight - 7:00 AM
      { startMinutes: 1320, durationMinutes: 120 }, // 10:00 PM - midnight
    ];

    const { processedGaps, activeCollapsedGaps, totalHeight } = processGapsLayout(rawGaps, {}, {});

    expect(activeCollapsedGaps.length).toBe(2);
    processedGaps.forEach((gap) => {
      expect(gap.isCollapsible).toBe(true);
      expect(gap.isCollapsed).toBe(true);
      expect(gap.height).toBe(COLLAPSED_GAP_HEIGHT);
    });

    // 1920 - (560 - 52) - (160 - 52) = 1304
    expect(totalHeight).toBe(1304);
    expect(totalHeight).toBe(
      getTotalTimelineHeight(activeCollapsedGaps, STANDARD_HOUR_HEIGHT, COLLAPSED_GAP_HEIGHT),
    );
    expect(DAY_MINUTES - (420 + 120)).toBeGreaterThanOrEqual(MIN_EXPANDED_SCALE_MINUTES);
  });

  // Test 4: The NOW line must never sit inside a collapsed row
  test("A day-edge gap containing the current time is never auto-collapsed", () => {
    const rawGaps: TimelineGap[] = [
      { startMinutes: 0, durationMinutes: 420 }, // midnight - 7:00 AM
      { startMinutes: 1320, durationMinutes: 120 }, // 10:00 PM - midnight
    ];

    const withNowBeforeMidnight = resolveAutoCollapsedGaps(rawGaps, {
      nowMinutes: 1380, // 11:00 PM, inside the trailing edge gap
    });
    expect(withNowBeforeMidnight).toHaveLength(1);
    expect(withNowBeforeMidnight[0].startMinutes).toBe(0);

    const { activeCollapsedGaps } = processGapsLayout(rawGaps, {}, { nowMinutes: 1380 });
    expect(activeCollapsedGaps).toHaveLength(1);
    expect(activeCollapsedGaps[0].startMinutes).toBe(0);
  });

  // Test 5: A nearly empty day keeps its full scale so it can actually be planned
  test("A day with a single late item keeps the whole timeline at true scale", () => {
    const rawGaps: TimelineGap[] = [
      { startMinutes: 0, durationMinutes: 1320 }, // midnight - 10:00 PM
      { startMinutes: 1380, durationMinutes: 60 }, // 11:00 PM - midnight
    ];

    const { activeCollapsedGaps, totalHeight } = processGapsLayout(rawGaps, {}, {});

    // Collapsing 22h would leave only 2h at true scale, below the minimum.
    expect(activeCollapsedGaps).toHaveLength(0);
    expect(totalHeight).toBe(24 * 80);
  });

  // Test 6: A fully empty day is never folded into a single row
  test("A whole-day free gap is not treated as a collapsible edge", () => {
    const fullDay: TimelineGap = { startMinutes: 0, durationMinutes: DAY_MINUTES };

    expect(isDayEdgeGap(fullDay)).toBe(false);

    const { processedGaps, activeCollapsedGaps, totalHeight } = processGapsLayout([fullDay], {}, {});

    expect(activeCollapsedGaps).toHaveLength(0);
    expect(processedGaps[0].isCollapsible).toBe(true);
    expect(processedGaps[0].isCollapsed).toBe(false);
    expect(totalHeight).toBe(24 * 80);
  });

  // Test 7: Explicit user overrides always beat the automatic default
  test("Explicit overrides expand a collapsed edge and collapse an interior gap", () => {
    const edgeGap: TimelineGap = { startMinutes: 0, durationMinutes: 420 };
    const interiorGap: TimelineGap = { startMinutes: 570, durationMinutes: 270 };

    const expandedEdge = processGapsLayout(
      [edgeGap],
      { expandedKeys: new Set([getGapKey(edgeGap)]) },
      {},
    );
    expect(expandedEdge.activeCollapsedGaps).toHaveLength(0);
    expect(expandedEdge.processedGaps[0].isCollapsed).toBe(false);
    expect(expandedEdge.processedGaps[0].height).toBe((420 / 60) * 80);

    const collapsedInterior = processGapsLayout(
      [interiorGap],
      { collapsedKeys: new Set([getGapKey(interiorGap)]) },
      {},
    );
    expect(collapsedInterior.activeCollapsedGaps).toHaveLength(1);
    expect(collapsedInterior.processedGaps[0].isCollapsed).toBe(true);
    expect(collapsedInterior.processedGaps[0].height).toBe(COLLAPSED_GAP_HEIGHT);
  });

  // Test 8: A sub-threshold gap can never be collapsed, even with an override
  test("A gap below the threshold ignores a collapsed override", () => {
    const smallGap: TimelineGap = { startMinutes: 540, durationMinutes: 45 };

    const { activeCollapsedGaps, processedGaps } = processGapsLayout(
      [smallGap],
      { collapsedKeys: new Set([getGapKey(smallGap)]) },
      {},
    );

    expect(activeCollapsedGaps).toHaveLength(0);
    expect(processedGaps[0].isCollapsible).toBe(false);
    expect(processedGaps[0].isCollapsed).toBe(false);
  });

  // Test 9: Precise positioning for early morning (2 AM) and late night (11:30 PM) items
  test("2:00 AM and 11:30 PM scheduled items remain mathematically accurate with or without collapsed gaps", () => {
    const activeCollapsedGaps: TimelineGap[] = [
      { startMinutes: 540, durationMinutes: 300 }, // 9:00 AM to 2:00 PM (300m = 5h)
    ];

    // 2:00 AM (120 minutes from midnight) is before the gap -> standard coordinate
    const y2AM = calculateTimeYCoordinate(120, activeCollapsedGaps, STANDARD_HOUR_HEIGHT, COLLAPSED_GAP_HEIGHT);
    expect(y2AM).toBe((120 / 60) * 80); // 160px

    // 11:30 PM (1410 minutes from midnight) is after the gap -> shifted by delta
    // Standard 1410m = (1410/60) * 80 = 1880px
    // Gap savings = (300/60 * 80) - 52 = 400 - 52 = 348px
    // Expected y1130PM = 1880 - 348 = 1532px
    const y1130PM = calculateTimeYCoordinate(1410, activeCollapsedGaps, STANDARD_HOUR_HEIGHT, COLLAPSED_GAP_HEIGHT);
    expect(y1130PM).toBe(1532);

    // Height of a 45-minute task scheduled from 11:30 PM (1410m) to 12:15 AM (1455 -> clamped)
    const y1210AM = calculateTimeYCoordinate(1440, activeCollapsedGaps, STANDARD_HOUR_HEIGHT, COLLAPSED_GAP_HEIGHT);
    expect(y1210AM - y1130PM).toBe((30 / 60) * 80); // exactly 40px for 30 minutes!
  });

  // Test 10: Current Time coordinate interpolation inside a collapsed gap
  test("Current Time coordinate inside a collapsed gap interpolates within the collapsed height", () => {
    const activeCollapsedGaps: TimelineGap[] = [
      { startMinutes: 540, durationMinutes: 300 }, // 09:00 (540m) to 14:00 (840m), collapsed to 52px
    ];

    const yGapStart = calculateTimeYCoordinate(540, activeCollapsedGaps, 80, 52); // 720px
    const yGapEnd = calculateTimeYCoordinate(840, activeCollapsedGaps, 80, 52); // 772px
    expect(yGapEnd - yGapStart).toBe(52);

    // Current time at 11:30 AM (690m), exactly halfway in the gap
    const yNow = calculateTimeYCoordinate(690, activeCollapsedGaps, 80, 52);
    expect(yNow).toBe(720 + 26); // exactly midway: 746px
  });
});
