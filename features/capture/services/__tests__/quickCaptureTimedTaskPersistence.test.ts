import { buildTask } from "../entity-factory.service";
import { parseProductivityText } from "../nlp-parser.service";
import { getStructuredSchedule } from "@/services/scheduling/scheduling.service";
import { getDateKey } from "@/services/scheduling/recurrence.service";

describe("Quick Capture Timed Task Persistence & Reminder Invariants", () => {
  const todayKey = getDateKey();

  it("1. 'Study Kubernetes at 8 PM' → persists schedule.startTime='20:00' and defaults reminder to 8 PM", () => {
    const parsed = parseProductivityText("Study Kubernetes at 8 PM");
    expect(parsed.type).toBe("task");
    expect(parsed.time).toBe("20:00");

    const task = buildTask(parsed);
    expect(task.title).toBe("Study Kubernetes");
    expect(task.schedule?.startTime).toBe("20:00");
    expect(task.schedule?.date).toBe(todayKey);
    expect(task.reminder).toBeDefined();
    expect(task.reminder?.enabled).toBe(true);

    const reminderDate = new Date(task.reminder!.triggerAt);
    expect(reminderDate.getHours()).toBe(20);
    expect(reminderDate.getMinutes()).toBe(0);
  });

  it("2. 'Study Kubernetes at 8:30 PM' → persists schedule.startTime='20:30' and defaults reminder to 8:30 PM", () => {
    const parsed = parseProductivityText("Study Kubernetes at 8:30 PM");
    expect(parsed.type).toBe("task");
    expect(parsed.time).toBe("20:30");

    const task = buildTask(parsed);
    expect(task.title).toBe("Study Kubernetes");
    expect(task.schedule?.startTime).toBe("20:30");
    expect(task.schedule?.date).toBe(todayKey);
    expect(task.reminder).toBeDefined();
    expect(task.reminder?.enabled).toBe(true);

    const reminderDate = new Date(task.reminder!.triggerAt);
    expect(reminderDate.getHours()).toBe(20);
    expect(reminderDate.getMinutes()).toBe(30);
  });

  it("3. 'Study Kubernetes at 8 PM no reminder' → persists schedule.startTime='20:00' and reminder is undefined", () => {
    const parsed = parseProductivityText("Study Kubernetes at 8 PM no reminder");
    expect(parsed.type).toBe("task");
    expect(parsed.time).toBe("20:00");
    expect(parsed.explicitReminder).toBe(false);

    const task = buildTask(parsed);
    expect(task.title).toBe("Study Kubernetes");
    expect(task.schedule?.startTime).toBe("20:00");
    expect(task.schedule?.date).toBe(todayKey);
    expect(task.reminder).toBeUndefined();
  });

  it("4. Task without time → schedule.startTime is undefined (all-day/inbox)", () => {
    const parsed = parseProductivityText("Buy groceries at the market");
    expect(parsed.time).toBeUndefined();

    const task = buildTask(parsed);
    expect(task.schedule?.startTime).toBeUndefined();
    expect(task.schedule?.date).toBe("inbox");
    expect(task.reminder).toBeUndefined();

    const sched = getStructuredSchedule(task);
    expect(sched.startTime).toBeUndefined();
    expect(sched.sortKey).toBe(24 * 60);
  });

  it("5. Invalid or malformed time string fails safely with no startTime and no reminder", () => {
    const invalidParsed = {
      type: "task" as const,
      title: "Corrupt Time Item",
      time: "25:99",
      confidence: 1,
    };

    const task = buildTask(invalidParsed);
    expect(task.schedule?.startTime).toBeUndefined();
    expect(task.schedule?.date).toBe("inbox");
    expect(task.reminder).toBeUndefined();
  });

  it("6. Explicit reminder: 'Study Kubernetes at 8 PM, remind me 30 minutes before' creates reminder with offset", () => {
    const parsed = parseProductivityText("Study Kubernetes at 8 PM, remind me 30 minutes before");
    expect(parsed.type).toBe("task");
    expect(parsed.time).toBe("20:00");
    expect(parsed.reminderOffsetMinutes).toBe(30);

    const task = buildTask(parsed);
    expect(task.title).toBe("Study Kubernetes");
    expect(task.schedule?.startTime).toBe("20:00");
    expect(task.schedule?.date).toBe(todayKey);

    // Explicit reminder MUST exist with 30m offset
    expect(task.reminder).toBeDefined();
    expect(task.reminder?.enabled).toBe(true);
    if (task.reminder?.triggerAt) {
      const reminderDate = new Date(task.reminder.triggerAt);
      expect(reminderDate.getHours()).toBe(19);
      expect(reminderDate.getMinutes()).toBe(30);
    }
  });

  it("7. Explicit reminder at specific time: 'Study Kubernetes at 8 PM, remind me at 7 PM'", () => {
    const parsed = parseProductivityText("Study Kubernetes at 8 PM, remind me at 7 PM");
    expect(parsed.type).toBe("task");
    expect(parsed.time).toBe("20:00");
    expect(parsed.reminderTime).toBe("19:00");

    const task = buildTask(parsed);
    expect(task.title).toBe("Study Kubernetes");
    expect(task.schedule?.startTime).toBe("20:00");
    expect(task.schedule?.date).toBe(todayKey);

    expect(task.reminder).toBeDefined();
    expect(task.reminder?.enabled).toBe(true);
    if (task.reminder?.triggerAt) {
      const reminderDate = new Date(task.reminder.triggerAt);
      expect(reminderDate.getHours()).toBe(19);
      expect(reminderDate.getMinutes()).toBe(0);
    }
  });

  it("8. Calendar receives the persisted startTime and calculates correct slot layout", () => {
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
