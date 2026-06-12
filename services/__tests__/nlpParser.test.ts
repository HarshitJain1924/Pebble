import { parseProductivityText } from "../nlpParser";

describe("nlpParser service unit tests", () => {
  it("should handle empty or whitespace inputs gracefully", () => {
    const emptyResult = parseProductivityText("");
    expect(emptyResult.title).toBe("");
    expect(emptyResult.type).toBe("task");

    const spaceResult = parseProductivityText("   ");
    expect(spaceResult.title).toBe("");
    expect(spaceResult.type).toBe("task");
  });

  it("should detect categories based on keywords", () => {
    const studyResult = parseProductivityText("Study React tomorrow");
    expect(studyResult.category).toBe("learning");
    expect(studyResult.type).toBe("task");

    const gymResult = parseProductivityText("Go to gym at 9am");
    expect(gymResult.category).toBe("health");

    const meetingResult = parseProductivityText("Team standup at 10am");
    expect(meetingResult.category).toBe("work");

    const callResult = parseProductivityText("Call mom at 5pm");
    expect(callResult.category).toBe("personal");

    const deepWorkResult = parseProductivityText("Deep work session");
    expect(deepWorkResult.category).toBe("focus");

    const designResult = parseProductivityText("Sketch new ui design layout");
    expect(designResult.category).toBe("creative");
  });

  it("should detect priorities correctly", () => {
    const highResult = parseProductivityText("Urgent client meeting high priority");
    expect(highResult.priority).toBe("high");

    const normalResult = parseProductivityText("Standard review meeting");
    expect(normalResult.priority).toBe("medium"); // default when not explicitly matched or matched as normal

    const lowResult = parseProductivityText("Someday read new book");
    expect(lowResult.priority).toBe("low");
  });

  it("should parse reminder offset minutes", () => {
    const reminderMin = parseProductivityText("Gym at 8am and remind me 30 minutes before");
    expect(reminderMin.reminderOffsetMinutes).toBe(30);

    const reminderHour = parseProductivityText("Exam at 10am alert me 2 hours prior");
    expect(reminderHour.reminderOffsetMinutes).toBe(120);
  });

  it("should parse recurrence patterns and determine task vs habit", () => {
    // Habits (recurring routines with habit-leaning titles)
    const gymDaily = parseProductivityText("Gym workout every day");
    expect(gymDaily.type).toBe("habit");
    expect(gymDaily.recurrence?.type).toBe("daily");

    const morningRoutine = parseProductivityText("Meditate every morning");
    expect(morningRoutine.type).toBe("habit");
    expect(morningRoutine.recurrence?.type).toBe("daily");
    expect(morningRoutine.time).toBe("08:00");

    const eveningRoutine = parseProductivityText("Drink water every evening");
    expect(eveningRoutine.type).toBe("habit");
    expect(eveningRoutine.recurrence?.type).toBe("daily");
    expect(eveningRoutine.time).toBe("18:00");

    const weekdaysRoutine = parseProductivityText("Read weekdays");
    expect(weekdaysRoutine.type).toBe("habit");
    expect(weekdaysRoutine.recurrence?.type).toBe("weekdays");
    expect(weekdaysRoutine.recurrence?.days).toEqual([1, 2, 3, 4, 5]);

    const weekendsRoutine = parseProductivityText("Run every weekend");
    expect(weekendsRoutine.type).toBe("habit");
    expect(weekendsRoutine.recurrence?.type).toBe("weekly");
    expect(weekendsRoutine.recurrence?.days).toEqual([0, 6]);

    const specificDays = parseProductivityText("Yoga every Monday and Thursday");
    expect(specificDays.type).toBe("habit");
    expect(specificDays.recurrence?.type).toBe("weekly");
    expect(specificDays.recurrence?.days).toEqual([1, 4]);

    const everyHour = parseProductivityText("Stretch every hour");
    expect(everyHour.type).toBe("habit");
    expect(everyHour.recurrence?.type).toBe("interval");
    expect(everyHour.recurrence?.interval).toBe(1);
    expect(everyHour.recurrence?.unit).toBe("hours");

    // Tasks (recurring but task-leaning titles)
    const reportMonthly = parseProductivityText("Submit project report every month on the 15th");
    expect(reportMonthly.type).toBe("task");
    expect(reportMonthly.recurrence?.type).toBe("monthly");
    expect(reportMonthly.recurrence?.dayOfMonth).toBe(15);
  });

  it("should clean up date and time keywords from final title", () => {
    const cleanResult = parseProductivityText("Submit assignment tomorrow at 5pm urgent");
    expect(cleanResult.title).toBe("Submit assignment");
    expect(cleanResult.priority).toBe("high");
    expect(cleanResult.time).toBe("17:00");
  });
});
