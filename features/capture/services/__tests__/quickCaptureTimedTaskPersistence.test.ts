import { buildTask } from "../entity-factory.service";
import { parseProductivityText } from "../nlp-parser.service";
import { getStructuredSchedule } from "@/services/scheduling/scheduling.service";
import { getDateKey } from "@/services/scheduling/recurrence.service";

describe("FIX #30 — Quick Capture Timed Task Persistence", () => {
  const todayKey = getDateKey();

  it("1. 'Study Kubernetes at 8 PM' → persists schedule.startTime='20:00'", () => {
    const parsed = parseProductivityText("Study Kubernetes at 8 PM");
    expect(parsed.type).toBe("task");
    expect(parsed.time).toBe("20:00");

    const task = buildTask(parsed);
    expect(task.title).toBe("Study Kubernetes");
    expect(task.schedule?.startTime).toBe("20:00");
    expect(task.schedule?.date).toBe(todayKey);
  });

  it("2. 'Study Kubernetes at 8:30 PM' → persists schedule.startTime='20:30'", () => {
    const parsed = parseProductivityText("Study Kubernetes at 8:30 PM");
    expect(parsed.type).toBe("task");
    expect(parsed.time).toBe("20:30");

    const task = buildTask(parsed);
    expect(task.title).toBe("Study Kubernetes");
    expect(task.schedule?.startTime).toBe("20:30");
    expect(task.schedule?.date).toBe(todayKey);
  });

  it("3. Task without time → schedule.startTime is undefined (all-day/inbox)", () => {
    const parsed = parseProductivityText("Buy groceries at the market");
    expect(parsed.time).toBeUndefined();

    const task = buildTask(parsed);
    expect(task.schedule?.startTime).toBeUndefined();
    expect(task.schedule?.date).toBe("inbox");

    const sched = getStructuredSchedule(task);
    expect(sched.startTime).toBeUndefined();
    expect(sched.sortKey).toBe(24 * 60);
  });

  it("4. Invalid or malformed time string fails safely with no startTime", () => {
    const invalidParsed = {
      type: "task" as const,
      title: "Corrupt Time Item",
      time: "25:99",
      confidence: 1,
    };

    const task = buildTask(invalidParsed);
    expect(task.schedule?.startTime).toBeUndefined();
    expect(task.schedule?.date).toBe("inbox");
  });

  it("5. Reminder remains independent from schedule.startTime", () => {
    const parsed = parseProductivityText("Team Standup at 9:00 AM");
    const task = buildTask(parsed);

    // schedule.startTime is the canonical HH:mm string for calendar visual placement
    expect(task.schedule?.startTime).toBe("09:00");

    // reminder.triggerAt (if future or undefined if past) is an epoch timestamp strictly for notifications
    if (task.reminder) {
      expect(typeof task.reminder.triggerAt).toBe("number");
      expect(task.reminder.enabled).toBe(true);
    }
  });

  it("6. Calendar receives the persisted startTime and calculates correct slot layout", () => {
    const parsed = parseProductivityText("Study Kubernetes at 8 PM");
    const task = buildTask(parsed);

    const sched = getStructuredSchedule(task, 60);
    expect(sched.startTime).toEqual({ hour: 20, minute: 0 });
    expect(sched.duration).toBe(60);
    expect(sched.sortKey).toBe(1200); // 20 * 60 minutes from midnight

    // Verify visual grid positioning: top = (startMinutes / 60) * 80px
    const startMinutes = (sched.startTime?.hour ?? 0) * 60 + (sched.startTime?.minute ?? 0);
    const top = (startMinutes / 60) * 80;
    expect(top).toBe(1600); // exactly at 8:00 PM on the 24-hour timeline grid
  });
});
