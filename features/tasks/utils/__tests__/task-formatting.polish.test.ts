import { formatRelativeTaskDate, getTasksSubtitleBreakdown } from "../task-formatting";

describe("formatRelativeTaskDate", () => {
  const referenceDateStr = "2026-09-29"; // Tuesday, Sept 29, 2026

  it("returns null for empty or inbox dates", () => {
    expect(formatRelativeTaskDate()).toBeNull();
    expect(formatRelativeTaskDate("inbox")).toBeNull();
    expect(formatRelativeTaskDate("invalid-date")).toBeNull();
  });

  it("returns Today for the same date or future dates", () => {
    const resToday = formatRelativeTaskDate("2026-09-29", referenceDateStr);
    expect(resToday).toEqual({ label: "Today", isWarning: false, daysAgo: 0 });

    const resFuture = formatRelativeTaskDate("2026-09-30", referenceDateStr);
    expect(resFuture?.label).toBe("Today");
    expect(resFuture?.isWarning).toBe(false);
  });

  it("formats 1 day ago as Yesterday (muted / not warning)", () => {
    const res = formatRelativeTaskDate("2026-09-28", referenceDateStr);
    expect(res).toEqual({ label: "Yesterday", isWarning: false, daysAgo: 1 });
  });

  it("formats 2 days ago as 2d ago (muted / not warning)", () => {
    const res = formatRelativeTaskDate("2026-09-27", referenceDateStr);
    expect(res).toEqual({ label: "2d ago", isWarning: false, daysAgo: 2 });
  });

  it("formats 3 to 6 days ago with Xd ago and escalates to warning", () => {
    const res3 = formatRelativeTaskDate("2026-09-26", referenceDateStr);
    expect(res3).toEqual({ label: "3d ago", isWarning: true, daysAgo: 3 });

    const res5 = formatRelativeTaskDate("2026-09-24", referenceDateStr);
    expect(res5).toEqual({ label: "5d ago", isWarning: true, daysAgo: 5 });
  });

  it("formats 7+ days ago with weekday and day number and warning", () => {
    // 2026-09-21 is Monday, Sept 21 (8 days ago)
    const res8 = formatRelativeTaskDate("2026-09-21", referenceDateStr);
    expect(res8).toEqual({ label: "Mon 21", isWarning: true, daysAgo: 8 });

    // 2026-09-15 is Tuesday, Sept 15 (14 days ago)
    const res14 = formatRelativeTaskDate("2026-09-15", referenceDateStr);
    expect(res14).toEqual({ label: "Tue 15", isWarning: true, daysAgo: 14 });
  });
});

describe("getTasksSubtitleBreakdown", () => {
  it("formats full breakdown with today, earlier, upcoming, someday", () => {
    const text = getTasksSubtitleBreakdown({
      today: 2,
      earlier: 5,
      upcoming: 3,
      someday: 1,
    });
    expect(text).toBe("2 today · 5 earlier · 3 upcoming · 1 someday");
  });

  it("omits zero count parts", () => {
    const text = getTasksSubtitleBreakdown({
      today: 2,
      earlier: 5,
      someday: 1,
    });
    expect(text).toBe("2 today · 5 earlier · 1 someday");

    const textOnlyEarlier = getTasksSubtitleBreakdown({
      today: 0,
      earlier: 4,
      someday: 0,
    });
    expect(textOnlyEarlier).toBe("4 earlier");
  });

  it("returns sensible empty fallback when all sections are zero", () => {
    const text = getTasksSubtitleBreakdown({
      today: 0,
      earlier: 0,
      someday: 0,
    });
    expect(text).toBe("No tasks");
  });
});
