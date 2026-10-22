import AsyncStorage from "@react-native-async-storage/async-storage";

import { EntityCommandService } from "@/services/command/EntityCommandService";
import {
  ChecklistRepository,
  WorkspaceRepository,
} from "@/repositories";
import { isRecurringOccurrenceForDate } from "@/services/scheduling/recurrence.service";
import type { Checklist } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const mockScheduleNotificationAsync = jest.fn().mockResolvedValue("mock-notif-id-123");
const mockCancelScheduledNotificationAsync = jest.fn().mockResolvedValue(undefined);

jest.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: {
    DATE: "date",
    DAILY: "daily",
    WEEKLY: "weekly",
    MONTHLY: "monthly",
    YEARLY: "yearly",
    TIME_INTERVAL: "timeInterval",
  },
  scheduleNotificationAsync: (...args: any[]) => mockScheduleNotificationAsync(...args),
  cancelScheduledNotificationAsync: (...args: any[]) =>
    mockCancelScheduledNotificationAsync(...args),
  setNotificationCategoryAsync: jest.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
}));

/**
 * Regression suite for editing ONE occurrence of a recurring checklist.
 *
 * Invariant under test: the master's recurrence exception and the detached
 * replacement are one atomic partition write, the detached copy carries the
 * edited content (never the master's runtime notification identity), and the
 * change notifies listeners.
 */
describe("recurring checklist single-occurrence edit", () => {
  const wsId = "ws-occurrence-edit";

  const master: Checklist = {
    id: "checklist-master",
    workspaceId: wsId,
    title: "Weekly review",
    description: "Original series description",
    priority: "medium",
    items: [
      { id: "item-1", title: "Review metrics", completed: false },
      { id: "item-2", title: "Plan next week", completed: false },
    ],
    resourceIds: [],
    schedule: { date: "2026-09-05" }, // Saturday
    recurrence: { frequency: "weekly", interval: 1, daysOfWeek: [6] },
    lifecycleGeneration: 1,
    revision: 1,
    createdAt: 1756000000000,
    updatedAt: 1756000000000,
  };

  const seedMaster = async (overrides: Partial<Checklist> = {}) => {
    await ChecklistRepository.saveChecklist({ ...master, ...overrides });
    const stored = await ChecklistRepository.getChecklist(master.id, wsId);
    expect(stored).toBeDefined();
    return stored!;
  };

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    mockScheduleNotificationAsync.mockResolvedValue("mock-notif-id-123");
    jest.spyOn(Date, "now").mockReturnValue(new Date("2026-09-30T12:00:00Z").getTime());

    await WorkspaceRepository.saveWorkspace({
      id: wsId,
      name: "Occurrence Workspace",
      color: "green",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 1,
      lifecycleGeneration: 1,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("writes the exception and the edited replacement in one commit", async () => {
    await seedMaster();
    const emitSpy = jest.spyOn(
      require("@/services/events/state-events"),
      "emitStateChange",
    );

    const { masterChecklist, occurrenceChecklist } =
      await EntityCommandService.rescheduleChecklistRecurringOccurrence(
        master.id,
        wsId,
        "2026-09-05",
        { date: "2026-09-05" },
        { source: "checklist_detail" },
        {
          title: "Edited occurrence",
          description: "Only this Saturday",
          priority: "high",
          items: [
            { id: "item-1", title: "Review metrics", completed: true },
            { id: "item-2", title: "Plan next week", completed: false },
          ],
          resourceIds: [],
          schedule: { date: "2026-09-05", allDay: true },
          reminder: undefined,
        },
      );

    // Master keeps its series and records exactly one exception.
    expect(masterChecklist.recurrence).toEqual({
      frequency: "weekly",
      interval: 1,
      daysOfWeek: [6],
    });
    expect(masterChecklist.recurrenceExceptions).toEqual(["2026-09-05"]);

    // Detached copy is non-recurring, dated to the occurrence, carries edits.
    expect(occurrenceChecklist.id).not.toBe(master.id);
    expect(occurrenceChecklist.recurrence).toBeUndefined();
    expect(occurrenceChecklist.recurrenceExceptions).toBeUndefined();
    expect(occurrenceChecklist.occurrenceHistory).toBeUndefined();
    expect(occurrenceChecklist.title).toBe("Edited occurrence");
    expect(occurrenceChecklist.description).toBe("Only this Saturday");
    expect(occurrenceChecklist.priority).toBe("high");
    expect(occurrenceChecklist.schedule?.date).toBe("2026-09-05");
    expect(occurrenceChecklist.items.map((i) => i.completed)).toEqual([true, false]);
    expect(occurrenceChecklist.lifecycleGeneration).toBe(1);
    expect(occurrenceChecklist.revision).toBe(1);

    // Both survived persistence.
    const persistedMaster = await ChecklistRepository.getChecklist(master.id, wsId);
    const persistedCopy = await ChecklistRepository.getChecklist(
      occurrenceChecklist.id,
      wsId,
    );
    expect(persistedMaster?.recurrenceExceptions).toEqual(["2026-09-05"]);
    expect(persistedCopy?.title).toBe("Edited occurrence");
    expect(persistedCopy?.recurrence).toBeUndefined();

    // The occurrence is replaced on that date only.
    expect(isRecurringOccurrenceForDate(persistedMaster, "2026-09-05")).toBe(false);
    expect(isRecurringOccurrenceForDate(persistedMaster, "2026-09-12")).toBe(true);
    expect(isRecurringOccurrenceForDate(persistedMaster, "2026-09-19")).toBe(true);
    expect(isRecurringOccurrenceForDate(persistedMaster, "2026-09-06")).toBe(false);

    // Listeners are notified once, with the caller's source.
    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith("checklists_changed", "checklist_detail");
  });

  it("never inherits the master's runtime notification identity", async () => {
    await seedMaster({
      reminder: {
        enabled: true,
        triggerAt: new Date("2026-09-05T09:00:00").getTime(),
        notificationIds: ["master-notif-id"],
      },
    });

    const { occurrenceChecklist } =
      await EntityCommandService.rescheduleChecklistRecurringOccurrence(
        master.id,
        wsId,
        "2026-09-05",
        { date: "2026-09-05" },
        { source: "checklist_detail" },
        {
          title: "Edited occurrence",
          items: master.items,
          schedule: { date: "2026-09-05", startTime: "09:00" },
          reminder: {
            enabled: true,
            triggerAt: new Date("2026-09-05T09:00:00").getTime(),
            notificationIds: ["leaked-id"],
          },
        },
      );

    expect(occurrenceChecklist.reminder?.notificationIds ?? []).not.toContain(
      "leaked-id",
    );
    expect(occurrenceChecklist.reminder?.notificationIds ?? []).not.toContain(
      "master-notif-id",
    );

    const persistedCopy = await ChecklistRepository.getChecklist(
      occurrenceChecklist.id,
      wsId,
    );
    expect(persistedCopy?.reminder?.notificationIds ?? []).not.toContain(
      "leaked-id",
    );
  });

  it("leaves no partial state when the atomic write fails", async () => {
    await seedMaster();
    const emitSpy = jest.spyOn(
      require("@/services/events/state-events"),
      "emitStateChange",
    );
    const saveSpy = jest
      .spyOn(ChecklistRepository, "saveChecklistsUnlocked")
      .mockRejectedValueOnce(new Error("storage write failed"));

    await expect(
      EntityCommandService.rescheduleChecklistRecurringOccurrence(
        master.id,
        wsId,
        "2026-09-05",
        { date: "2026-09-05" },
        { source: "checklist_detail" },
        { title: "Edited occurrence" },
      ),
    ).rejects.toThrow("storage write failed");

    // Because exception + replacement share one write, neither can land alone.
    const persistedMaster = await ChecklistRepository.getChecklist(master.id, wsId);
    expect(persistedMaster?.recurrenceExceptions).toBeUndefined();
    expect(persistedMaster?.title).toBe("Weekly review");

    const all = await ChecklistRepository.getChecklists(wsId);
    expect(Object.keys(all)).toEqual([master.id]);
    expect(emitSpy).not.toHaveBeenCalled();

    // The atomic write is the only persistence step in the command.
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps both exceptions when two occurrences are edited concurrently", async () => {
    await seedMaster();

    const [first, second] = await Promise.all([
      EntityCommandService.rescheduleChecklistRecurringOccurrence(
        master.id,
        wsId,
        "2026-09-05",
        { date: "2026-09-05" },
        { source: "checklist_detail" },
        { title: "Edited first Saturday" },
      ),
      EntityCommandService.rescheduleChecklistRecurringOccurrence(
        master.id,
        wsId,
        "2026-09-12",
        { date: "2026-09-12" },
        { source: "checklist_detail" },
        { title: "Edited second Saturday" },
      ),
    ]);

    const persistedMaster = await ChecklistRepository.getChecklist(master.id, wsId);
    expect(persistedMaster?.recurrenceExceptions?.sort()).toEqual([
      "2026-09-05",
      "2026-09-12",
    ]);
    expect(persistedMaster?.revision).toBeGreaterThan(1);

    expect(first.occurrenceChecklist.id).not.toBe(second.occurrenceChecklist.id);
    expect(first.occurrenceChecklist.schedule?.date).toBe("2026-09-05");
    expect(second.occurrenceChecklist.schedule?.date).toBe("2026-09-12");

    // Both replacements exist and neither re-entered the recurring series.
    const all = await ChecklistRepository.getChecklists(wsId);
    expect(Object.keys(all)).toHaveLength(3);
    expect(Object.values(all).filter((c) => c.recurrence)).toHaveLength(1);
  });

  it("rejects detaching a non-recurring checklist without writing", async () => {
    await seedMaster({ recurrence: undefined });
    const emitSpy = jest.spyOn(
      require("@/services/events/state-events"),
      "emitStateChange",
    );

    await expect(
      EntityCommandService.rescheduleChecklistRecurringOccurrence(
        master.id,
        wsId,
        "2026-09-05",
        { date: "2026-09-05" },
        { source: "checklist_detail" },
        { title: "Edited occurrence" },
      ),
    ).rejects.toThrow(/not a recurring checklist/);

    const all = await ChecklistRepository.getChecklists(wsId);
    expect(Object.keys(all)).toEqual([master.id]);
    expect(emitSpy).not.toHaveBeenCalled();
  });
});
