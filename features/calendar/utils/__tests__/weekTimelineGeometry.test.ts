import {
  WEEK_HOUR_HEIGHT,
  WEEK_TIME_LABEL_WIDTH,
  DRAG_SNAP_MINUTES,
  calculateWeekMinuteFromY,
  calculateWeekYFromMinute,
  calculateWeekDayIndexFromX,
  calculateWeekTargetDate,
  calculateWeekDraggedItemTarget,
  formatWeekDayName,
} from "../weekTimelineGeometry";
import { snapMinutesToInterval } from "../timelineDrag";

describe("Week Timeline Geometry Pure Tests (Part 23)", () => {
  // Test 1: 10:00 -> expected Y (10 * 60px = 600px)
  test("10:00 (600m) maps to 600px at 60px/hour", () => {
    expect(calculateWeekYFromMinute(600, WEEK_HOUR_HEIGHT)).toBe(600);
  });

  // Test 2: 10:30 -> expected Y (10.5 * 60px = 630px)
  test("10:30 (630m) maps to 630px at 60px/hour", () => {
    expect(calculateWeekYFromMinute(630, WEEK_HOUR_HEIGHT)).toBe(630);
  });

  // Test 3: 10:45 -> expected Y (10.75 * 60px = 645px)
  test("10:45 (645m) maps to 645px at 60px/hour", () => {
    expect(calculateWeekYFromMinute(645, WEEK_HOUR_HEIGHT)).toBe(645);
  });

  // Test 4: Y -> minute converts back accurately
  test("Y converts back to exact minute", () => {
    expect(calculateWeekMinuteFromY(600, WEEK_HOUR_HEIGHT)).toBe(600);
    expect(calculateWeekMinuteFromY(630, WEEK_HOUR_HEIGHT)).toBe(630);
    expect(calculateWeekMinuteFromY(645, WEEK_HOUR_HEIGHT)).toBe(645);
  });

  // Test 5: snap 10:07 -> 10:00
  test("snap 10:07 (607m) -> 10:00 (600m)", () => {
    expect(snapMinutesToInterval(607, DRAG_SNAP_MINUTES)).toBe(600);
  });

  // Test 6: snap 10:08 -> 10:15
  test("snap 10:08 (608m) -> 10:15 (615m)", () => {
    expect(snapMinutesToInterval(608, DRAG_SNAP_MINUTES)).toBe(615);
  });

  // Test 7: snap 10:22 -> 10:15
  test("snap 10:22 (622m) -> 10:15 (615m)", () => {
    expect(snapMinutesToInterval(622, DRAG_SNAP_MINUTES)).toBe(615);
  });

  // Test 8: snap 10:23 -> 10:30
  test("snap 10:23 (623m) -> 10:30 (630m)", () => {
    expect(snapMinutesToInterval(623, DRAG_SNAP_MINUTES)).toBe(630);
  });

  // Test 9, 10, 11: Date mapping X -> Monday, Wednesday, Sunday
  // Given containerX = 0, dayColWidth = 100, timeLabelWidth = 50, scrollOffset = 0:
  // Monday (dayIndex 0): X between 50 and 150 -> e.g. 75
  // Wednesday (dayIndex 2): X between 250 and 350 -> e.g. 275
  // Sunday (dayIndex 6): X between 650 and 750 -> e.g. 675
  const mondayDateStr = "2026-08-31"; // 2026-08-31 is Monday

  test("X -> Monday (dayIndex 0)", () => {
    const dayIdx = calculateWeekDayIndexFromX(75, 0, 100, 0, 50);
    expect(dayIdx).toBe(0);
    expect(calculateWeekTargetDate(dayIdx, mondayDateStr)).toBe("2026-08-31");
    expect(formatWeekDayName("2026-08-31")).toBe("Mon");
  });

  test("X -> Wednesday (dayIndex 2)", () => {
    const dayIdx = calculateWeekDayIndexFromX(275, 0, 100, 0, 50);
    expect(dayIdx).toBe(2);
    expect(calculateWeekTargetDate(dayIdx, mondayDateStr)).toBe("2026-09-02");
    expect(formatWeekDayName("2026-09-02")).toBe("Wed");
  });

  test("X -> Sunday (dayIndex 6)", () => {
    const dayIdx = calculateWeekDayIndexFromX(675, 0, 100, 0, 50);
    expect(dayIdx).toBe(6);
    expect(calculateWeekTargetDate(dayIdx, mondayDateStr)).toBe("2026-09-06");
    expect(formatWeekDayName("2026-09-06")).toBe("Sun");
  });

  // Test 12: Grabbing 20px below top preserves grab offset
  test("Grabbing 20px below top preserves grab offset in Week target calculation", () => {
    // Card starts at 10:00 (Y = 600px). User grabbed at 620px (grabOffsetY = 20px).
    // User moves finger to 860px (containerY = 0, scrollOffsetY = 0).
    // Effective card top = 860 - 20 = 840px -> 14:00 (840 minutes = 14 * 60).
    const target = calculateWeekDraggedItemTarget(
      275, // Wednesday
      860, // touchY
      20, // grabOffsetY
      0, // containerX
      0, // containerY
      100, // dayColWidth
      0, // scrollOffsetX
      0, // scrollOffsetY
      mondayDateStr,
      60, // duration
      WEEK_HOUR_HEIGHT,
      50,
      DRAG_SNAP_MINUTES,
    );

    expect(target.targetDate).toBe("2026-09-02");
    expect(target.weekdayName).toBe("Wed");
    expect(target.startHour).toBe(14);
    expect(target.startMinute).toBe(0);
    expect(target.timeRangeLabel).toBe("2:00 PM – 3:00 PM");
  });

  // Test 13: 90-minute item at 2:15 previews 2:15 - 3:45
  test("90-minute item at 2:15 PM (14:15 = 855m) previews 2:15 PM – 3:45 PM", () => {
    // Y for 14:15 at 60px/hr = (855/60)*60 = 855px.
    const target = calculateWeekDraggedItemTarget(
      275, // Wednesday
      855, // touchY
      0, // grabOffsetY
      0,
      0,
      100,
      0,
      0,
      mondayDateStr,
      90, // duration 90m
      WEEK_HOUR_HEIGHT,
      50,
      DRAG_SNAP_MINUTES,
    );

    expect(target.weekdayName).toBe("Wed");
    expect(target.startHour).toBe(14);
    expect(target.startMinute).toBe(15);
    expect(target.endHour).toBe(15);
    expect(target.endMinute).toBe(45);
    expect(target.timeRangeLabel).toBe("2:15 PM – 3:45 PM");
    expect(target.fullPreviewLabel).toBe("Wed · 2:15 PM – 3:45 PM");
    expect(target.durationLabel).toBe("1h 30m");
    expect(target.fits).toBe(true);
  });

  // Test 14: 90-minute item near midnight is clamped to 1440 - duration (1350m = 10:30 PM)
  test("90-minute item near midnight is clamped to 10:30 PM so it fits within 24 hours", () => {
    const target = calculateWeekDraggedItemTarget(
      275,
      1420, // touchY near end of 1440px
      0,
      0,
      0,
      100,
      0,
      0,
      mondayDateStr,
      90, // duration
      WEEK_HOUR_HEIGHT,
      50,
      DRAG_SNAP_MINUTES,
    );

    expect(target.startMinutes).toBe(1350); // 10:30 PM (22:30)
    expect(target.startHour).toBe(22);
    expect(target.startMinute).toBe(30);
    expect(target.endMinutes).toBe(1440);
    expect(target.fits).toBe(true);
  });
});
