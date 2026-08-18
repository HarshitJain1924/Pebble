import {
  dateKeyFromDate,
  getOffsetDateKey,
  getTodayDateKey,
  parseDateKey,
} from "@/shared/utils/date-key";

describe("dateKeyFromDate (Date → local YYYY-MM-DD)", () => {
  test("formats a local Date using local calendar fields", () => {
    const d = new Date(2026, 2, 7); // Mar 7, 2026 local
    expect(dateKeyFromDate(d)).toBe("2026-03-07");
  });

  test("zero-pads month and day", () => {
    const d = new Date(2026, 0, 5); // Jan 5, 2026 local
    expect(dateKeyFromDate(d)).toBe("2026-01-05");
  });

  test("round-trips through parseDateKey", () => {
    const key = dateKeyFromDate(new Date(2026, 11, 31));
    expect(key).toBe("2026-12-31");
    const parsed = parseDateKey(key);
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(11);
    expect(parsed.getDate()).toBe(31);
  });
});

describe("getTodayDateKey", () => {
  test("matches dateKeyFromDate(new Date())", () => {
    expect(getTodayDateKey()).toBe(dateKeyFromDate(new Date()));
  });
});

describe("getOffsetDateKey", () => {
  test("yesterday via positive offset from a fixed baseline", () => {
    expect(getOffsetDateKey(1, "2026-03-15")).toBe("2026-03-14");
  });

  test("tomorrow via negative offset from a fixed baseline", () => {
    expect(getOffsetDateKey(-1, "2026-03-15")).toBe("2026-03-16");
  });

  test("positive multi-day offset", () => {
    expect(getOffsetDateKey(5, "2026-03-15")).toBe("2026-03-10");
  });

  test("negative multi-day offset", () => {
    expect(getOffsetDateKey(-5, "2026-03-15")).toBe("2026-03-20");
  });

  test("month boundary (end of non-leap February)", () => {
    expect(getOffsetDateKey(1, "2026-03-01")).toBe("2026-02-28");
  });

  test("month boundary (leap-year February)", () => {
    expect(getOffsetDateKey(1, "2024-03-01")).toBe("2024-02-29");
  });

  test("year boundary backwards", () => {
    expect(getOffsetDateKey(1, "2026-01-01")).toBe("2025-12-31");
  });

  test("year boundary forwards", () => {
    expect(getOffsetDateKey(-1, "2025-12-31")).toBe("2026-01-01");
  });

  test("offset from today when no baseline given", () => {
    const expected = new Date();
    expected.setDate(expected.getDate() - 3);
    expect(getOffsetDateKey(3)).toBe(dateKeyFromDate(expected));
  });
});

describe("local-time semantics", () => {
  test("date keys are derived from local fields, never UTC", () => {
    // A local date with a time offset that crosses midnight in UTC must still
    // produce the LOCAL calendar day.
    const local = new Date(2026, 6, 1, 23, 30); // 11:30 PM local, July 1
    expect(dateKeyFromDate(local)).toBe("2026-07-01");
  });

  test("parseDateKey builds a local midnight date", () => {
    const d = parseDateKey("2026-07-04");
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(4);
  });
});
