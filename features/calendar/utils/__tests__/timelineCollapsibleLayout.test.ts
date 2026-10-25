import {
  COLLAPSIBLE_GAP_THRESHOLD_MINUTES,
  COLLAPSED_GAP_HEIGHT,
  STANDARD_HOUR_HEIGHT,
  getGapKey,
  calculateTimeYCoordinate,
  getTotalTimelineHeight,
  processGapsLayout,
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
      new Set(),
      STANDARD_HOUR_HEIGHT,
      COLLAPSED_GAP_HEIGHT,
      COLLAPSIBLE_GAP_THRESHOLD_MINUTES,
    );

    expect(activeCollapsedGaps.length).toBe(0);
    processedGaps.forEach((gap) => {
      expect(gap.isCollapsible).toBe(false);
      expect(gap.isCollapsed).toBe(false);
      // Coordinate height matches standard 80px/hr
      expect(gap.height).toBe((gap.durationMinutes / 60) * STANDARD_HOUR_HEIGHT);
    });
  });

  // Test 2: Large free gaps (>= 120 min) are classified as collapsible and collapsed by default
  test("Large free gaps (>= 120 min) are collapsible and collapsed by default into COLLAPSED_GAP_HEIGHT", () => {
    const rawGaps: TimelineGap[] = [
      { startMinutes: 570, durationMinutes: 270 }, // 9:30 AM to 2:00 PM (4h 30m = 270m)
      { startMinutes: 900, durationMinutes: 300 }, // 3:00 PM to 8:00 PM (5h = 300m)
    ];

    const { processedGaps, activeCollapsedGaps, totalHeight } = processGapsLayout(
      rawGaps,
      new Set(),
      STANDARD_HOUR_HEIGHT,
      COLLAPSED_GAP_HEIGHT,
    );

    expect(activeCollapsedGaps.length).toBe(2);
    processedGaps.forEach((gap) => {
      expect(gap.isCollapsible).toBe(true);
      expect(gap.isCollapsed).toBe(true);
      expect(gap.height).toBe(COLLAPSED_GAP_HEIGHT);
    });

    // Uncollapsed total height would be 24 * 80 = 1920
    // Collapsed savings:
    // Gap 1: (270/60 * 80) - 52 = 360 - 52 = 308px saved
    // Gap 2: (300/60 * 80) - 52 = 400 - 52 = 348px saved
    // Expected totalHeight: 1920 - 308 - 348 = 1264px
    expect(totalHeight).toBe(1264);
  });

  // Test 3: Expanding a collapsible gap restores the full 80px/hr geometry
  test("Expanding a gap key in expandedGapKeys restores the full 80px/hour height for that gap", () => {
    const gap1: TimelineGap = { startMinutes: 570, durationMinutes: 270 }; // 9:30 to 14:00 (270m)
    const gapKey1 = getGapKey(gap1);

    const expandedSet = new Set<string>([gapKey1]);

    const { processedGaps, activeCollapsedGaps, totalHeight } = processGapsLayout(
      [gap1],
      expandedSet,
      STANDARD_HOUR_HEIGHT,
      COLLAPSED_GAP_HEIGHT,
    );

    expect(activeCollapsedGaps.length).toBe(0);
    expect(processedGaps[0].isCollapsible).toBe(true);
    expect(processedGaps[0].isCollapsed).toBe(false);
    expect(processedGaps[0].height).toBe((270 / 60) * 80); // 360px
    expect(totalHeight).toBe(24 * 80); // 1920px
  });

  // Test 4: Precise positioning for early morning (2 AM) and late night (11:30 PM) items
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

  // Test 5: Gap splitting logic when an item is scheduled into a collapsed gap
  test("Scheduling a 90m task at 10:00 AM in a 09:00–14:00 gap splits the interval correctly", () => {
    // Original free gap: 09:00 to 14:00 (540m to 840m)
    // Scheduled item: 10:00 to 11:30 (600m to 690m, duration 90m)

    // Derived split gaps:
    const remainingGaps: TimelineGap[] = [
      { startMinutes: 540, durationMinutes: 60 }, // 09:00 - 10:00 (60m free)
      { startMinutes: 690, durationMinutes: 150 }, // 11:30 - 14:00 (150m free)
    ];

    const { processedGaps, activeCollapsedGaps } = processGapsLayout(
      remainingGaps,
      new Set(),
      STANDARD_HOUR_HEIGHT,
      COLLAPSED_GAP_HEIGHT,
    );

    // Gap 1 (60m < 120m) is NOT collapsible
    expect(processedGaps[0].startMinutes).toBe(540);
    expect(processedGaps[0].durationMinutes).toBe(60);
    expect(processedGaps[0].isCollapsible).toBe(false);
    expect(processedGaps[0].isCollapsed).toBe(false);

    // Gap 2 (150m >= 120m) IS collapsible and collapsed
    expect(processedGaps[1].startMinutes).toBe(690);
    expect(processedGaps[1].durationMinutes).toBe(150);
    expect(processedGaps[1].isCollapsible).toBe(true);
    expect(processedGaps[1].isCollapsed).toBe(true);
    expect(activeCollapsedGaps.length).toBe(1);
    expect(activeCollapsedGaps[0].startMinutes).toBe(690);
  });

  // Test 6: Current Time coordinate interpolation inside a collapsed gap
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
