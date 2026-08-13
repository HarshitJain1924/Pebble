jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
import { normalizeTask } from "@/repositories/TaskRepository";
import { isRecurringOccurrenceForDate } from "@/services/scheduling/recurrence.service";

describe("Phase 0 legacy weekday recurrence", () => {
  test.failing("preserves weekdays semantics through normalization and occurrence matching", () => {
    const normalized = normalizeTask({
      id: "weekday-task",
      workspaceId: "inbox",
      title: "Weekdays",
      status: "todo",
      priority: "none",
      createdAt: 1,
      updatedAt: 1,
      recurrence: { type: "weekdays", interval: 1 },
      schedule: { date: "2026-08-10" },
    }, "inbox");
    expect(normalized.recurrence?.frequency).toBe("weekdays");
    expect(isRecurringOccurrenceForDate(normalized, "2026-08-12")).toBe(true);
    expect(isRecurringOccurrenceForDate(normalized, "2026-08-15")).toBe(false);
  });
});


