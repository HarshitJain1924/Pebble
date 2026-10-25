import {
  DRAG_SNAP_MINUTES,
  LONG_PRESS_ACTIVATION_MS,
  snapMinutesToInterval,
  calculateMinuteFromTimeYCoordinate,
  calculateDraggedItemStartMinutes,
  formatTimeLabel,
  formatDurationLabel,
  buildDraggedItemTimeTarget,
  validateDropTarget,
} from "../timelineDrag";
import {
  calculateTimeYCoordinate,
  TimelineGap,
} from "../timelineCollapsibleLayout";

describe("Timeline Drag-and-Drop Minute-Accurate Pure Calculations", () => {
  // Test 1: 10:00 maps to the expected Y coordinate (600m * (80/60) = 800px)
  test("10:00 (600m) maps to expected Y coordinate on standard timeline", () => {
    const y10AM = calculateTimeYCoordinate(600, [], 80, 52);
    expect(y10AM).toBe(800);
  });

  // Test 2: 10:30 maps to expected Y coordinate (630m -> 840px)
  test("10:30 (630m) maps to expected Y coordinate", () => {
    const y1030AM = calculateTimeYCoordinate(630, [], 80, 52);
    expect(y1030AM).toBe(840);
  });

  // Test 3: 10:45 maps to expected Y coordinate (645m -> 860px)
  test("10:45 (645m) maps to expected Y coordinate", () => {
    const y1045AM = calculateTimeYCoordinate(645, [], 80, 52);
    expect(y1045AM).toBe(860);
  });

  // Test 4: Y converts back to the correct minute via inverse coordinate function
  test("Y coordinates convert back to exact minutes on standard timeline", () => {
    expect(calculateMinuteFromTimeYCoordinate(800, [], 80, 52)).toBe(600); // 10:00
    expect(calculateMinuteFromTimeYCoordinate(840, [], 80, 52)).toBe(630); // 10:30
    expect(calculateMinuteFromTimeYCoordinate(860, [], 80, 52)).toBe(645); // 10:45
  });

  // Test 5: Round-trip minute -> Y -> minute preserves the exact snapped time
  test("Round-trip minute -> Y -> minute preserves exact time across full day", () => {
    for (let m = 0; m <= 1440; m += 15) {
      const y = calculateTimeYCoordinate(m, [], 80, 52);
      const recoveredMin = calculateMinuteFromTimeYCoordinate(y, [], 80, 52);
      expect(Math.round(recoveredMin)).toBe(m);
    }
  });

  // Test 6: 10:07 snaps to 10:00
  test("10:07 (607m) snaps to 10:00 (600m)", () => {
    expect(snapMinutesToInterval(607, DRAG_SNAP_MINUTES)).toBe(600);
  });

  // Test 7: 10:08 snaps to 10:15
  test("10:08 (608m) snaps to 10:15 (615m)", () => {
    expect(snapMinutesToInterval(608, DRAG_SNAP_MINUTES)).toBe(615);
  });

  // Test 8: 10:22 snaps to 10:15
  test("10:22 (622m) snaps to 10:15 (615m)", () => {
    expect(snapMinutesToInterval(622, DRAG_SNAP_MINUTES)).toBe(615);
  });

  // Test 9: 10:23 snaps to 10:30
  test("10:23 (623m) snaps to 10:30 (630m)", () => {
    expect(snapMinutesToInterval(623, DRAG_SNAP_MINUTES)).toBe(630);
  });

  // Test 10: Grabbing 20px below top preserves the relative touch grab offset
  test("Grabbing 20px below top correctly subtracts offset when calculating target minute", () => {
    // Card starts at 10:00 (800px). User touches at 820px (grabOffsetY = 20px).
    // User moves finger to 860px (moved 40px down).
    // Target top = 860 - 20 = 840px -> 630m (10:30 AM).
    const startMin = calculateDraggedItemStartMinutes(860, 20, [], 60, 80, 52, 15);
    expect(startMin).toBe(630); // 10:30 AM
  });

  // Test 11: Dragging an item without moving finger does not shift start time
  test("Zero finger delta keeps item at original snapped start time", () => {
    // Card at 10:00 (800px), touched at 835px (offset = 35px).
    const startMin = calculateDraggedItemStartMinutes(835, 35, [], 60, 80, 52, 15);
    expect(startMin).toBe(600); // 10:00 AM
  });

  // Test 12: Y inside collapsed gap (09:00 - 14:00) maps to real temporal coordinates
  test("Y inside collapsed 09:00-14:00 gap maps proportionally to the full 5-hour real-time window", () => {
    const collapsedGap: TimelineGap = { startMinutes: 540, durationMinutes: 300 }; // 09:00 to 14:00
    const gaps = [collapsedGap];

    // Gap starts at Y = (540/60)*80 = 720px. Height = 52px. Gap ends at Y = 772px.
    const minuteAtGapStart = calculateMinuteFromTimeYCoordinate(720, gaps, 80, 52);
    const minuteAtGapEnd = calculateMinuteFromTimeYCoordinate(772, gaps, 80, 52);

    expect(minuteAtGapStart).toBe(540); // 9:00 AM
    expect(minuteAtGapEnd).toBe(840); // 2:00 PM
  });

  // Test 13: Midpoint of collapsed 09:00-14:00 maps to approximately 11:30 AM (690m)
  test("Midpoint of collapsed 09:00-14:00 gap maps to 11:30 AM", () => {
    const collapsedGap: TimelineGap = { startMinutes: 540, durationMinutes: 300 };
    const gaps = [collapsedGap];

    // Midpoint Y = 720 + 26 = 746px
    const minuteAtMidpoint = calculateMinuteFromTimeYCoordinate(746, gaps, 80, 52);
    expect(Math.round(minuteAtMidpoint)).toBe(690); // 11:30 AM (690 minutes)
  });

  // Test 14: Dragging across collapsed gap does NOT treat physical 52px as 52 minutes
  test("Physical 52px of collapsed gap spans 300 minutes, not 52 minutes", () => {
    const collapsedGap: TimelineGap = { startMinutes: 540, durationMinutes: 300 };
    const gaps = [collapsedGap];

    const mStart = calculateMinuteFromTimeYCoordinate(720, gaps, 80, 52);
    const mEnd = calculateMinuteFromTimeYCoordinate(772, gaps, 80, 52);
    expect(mEnd - mStart).toBe(300);
  });

  // Test 15: Expanded gap retains standard 80px/hour mapping
  test("When gap is expanded (empty activeCollapsedGaps), full 80px/hr rate applies", () => {
    const mStart = calculateMinuteFromTimeYCoordinate(720, [], 80, 52);
    const mEnd = calculateMinuteFromTimeYCoordinate(720 + 400, [], 80, 52);
    expect(mEnd - mStart).toBe(300); // 400px = 300 minutes
  });

  // Test 16: 90-minute item dragged to 10:15 previews 10:15 - 11:45
  test("90-minute item dragged to 10:15 (615m) generates target with 10:15 - 11:45 range", () => {
    const target = buildDraggedItemTimeTarget(615, 90);
    expect(target.startHour).toBe(10);
    expect(target.startMinute).toBe(15);
    expect(target.endHour).toBe(11);
    expect(target.endMinute).toBe(45);
    expect(target.timeRangeLabel).toBe("10:15 AM – 11:45 AM");
    expect(target.durationLabel).toBe("1h 30m");
    expect(target.fits).toBe(true);
  });

  // Test 17: Drop validation respects duration
  test("validateDropTarget returns true when item fits within 1440 minutes", () => {
    expect(validateDropTarget(600, 90)).toBe(true);
    expect(validateDropTarget(1350, 90)).toBe(true); // 22:30 + 90m = 24:00 (1440m) -> fits exactly
  });

  // Test 18: Invalid end-of-day placement is clamped or marked fits: false
  test("Item extending past midnight is clamped to 1440 - duration or marked non-fitting", () => {
    const clampedStart = calculateDraggedItemStartMinutes(2000, 0, [], 90, 80, 52, 15);
    expect(clampedStart).toBe(1350); // max start for 90m is 1440 - 90 = 1350 (10:30 PM)
    expect(clampedStart + 90).toBe(1440);

    const outOfBoundsTarget = buildDraggedItemTimeTarget(1380, 90); // 1380 + 90 = 1470 > 1440
    expect(outOfBoundsTarget.fits).toBe(false);
  });

  // Test 19: Long press activation duration constant
  test("Long press activation constant is tuned around 380ms", () => {
    expect(LONG_PRESS_ACTIVATION_MS).toBeGreaterThanOrEqual(350);
    expect(LONG_PRESS_ACTIVATION_MS).toBeLessThanOrEqual(450);
  });

  // Test 20: Format helpers test
  test("Format helpers produce accurate labels", () => {
    expect(formatTimeLabel(0, 0)).toBe("12:00 AM");
    expect(formatTimeLabel(12, 30)).toBe("12:30 PM");
    expect(formatTimeLabel(23, 45)).toBe("11:45 PM");
    expect(formatDurationLabel(45)).toBe("45m");
    expect(formatDurationLabel(60)).toBe("1h");
    expect(formatDurationLabel(150)).toBe("2h 30m");
  });
});
