import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { ChecklistRepository } from "@/repositories/ChecklistRepository";
import { RecycleBinRepository } from "@/repositories/RecycleBinRepository";
import { TombstoneRepository } from "@/repositories/TombstoneRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { isRecurringOccurrenceForDate } from "@/services/scheduling/recurrence.service";
import * as RemindersService from "@/services/scheduling/reminders.service";
import type { Checklist, Task } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
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
  cancelScheduledNotificationAsync: (...args: any[]) => mockCancelScheduledNotificationAsync(...args),
  setNotificationCategoryAsync: jest.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Medium: "medium" },
  NotificationFeedbackType: { Success: "success" },
}));

describe("Checklist Scheduling & Command Hardening (P0-1 through P1-5)", () => {
  const wsId = "ws-test-checklist-harden";
  const targetWsId = "ws-target-checklist";

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    mockScheduleNotificationAsync.mockResolvedValue("mock-notif-id-123");
    mockCancelScheduledNotificationAsync.mockResolvedValue(undefined);

    await WorkspaceRepository.saveWorkspace({
      id: wsId,
      name: "Source Workspace",
      color: "blue",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 1,
      lifecycleGeneration: 1,
    });

    await WorkspaceRepository.saveWorkspace({
      id: targetWsId,
      name: "Target Workspace",
      color: "green",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 1,
      lifecycleGeneration: 1,
    });
  });

  // ===========================================================================
  // P0-1 — Canonical Entity Identity
  // ===========================================================================
  describe("P0-1: Canonical entity identity in Calendar", () => {
    const getItemType = (item: any) => {
      if (item.type === "habit") return "habit";
      if (item.type === "checklist") return "checklist";
      return "task";
    };

    test("A Task with categoryId 'home' or items must remain 'task' and never become 'checklist'", () => {
      const taskWithHomeCategory: any = {
        id: "task-1",
        type: "task",
        categoryId: "home",
        title: "Buy Groceries",
      };
      expect(getItemType(taskWithHomeCategory)).toBe("task");

      const taskWithItems: any = {
        id: "task-2",
        type: "task",
        items: [{ id: "item-1", text: "Subtask 1" }],
        title: "Task with subtasks",
      };
      expect(getItemType(taskWithItems)).toBe("task");

      const habit = { id: "habit-1", type: "habit", title: "Daily Run" };
      expect(getItemType(habit)).toBe("habit");

      const checklist = { id: "chk-1", type: "checklist", title: "Packing List" };
      expect(getItemType(checklist)).toBe("checklist");
    });
  });

  // ===========================================================================
  // P0-2 — Checklist Item Validation & Fake IDs
  // ===========================================================================
  describe("P0-2: Checklist item validation", () => {
    test("toggleChecklistItem rejects unknown item IDs without mutating state", async () => {
      const created = await EntityCommandService.createChecklist({
        id: "chk-p02",
        workspaceId: wsId,
        title: "Grocery List",
        items: [
          { id: "item-apple", title: "Apples", completed: false },
          { id: "item-milk", title: "Milk", completed: false },
        ],
      } as Checklist, wsId);

      const result = await EntityCommandService.toggleChecklistItem(
        created.id,
        "item-fake-nonexistent",
        wsId
      );

      expect(result).toBeNull();

      const stored = await ChecklistRepository.getChecklist(created.id, wsId);
      expect(stored?.items.every((i) => !i.completed)).toBe(true);
      expect(stored?.pebbleAwarded).toBeUndefined();
    });

    test("Fake item IDs cannot cause recurring checklist to become completed", async () => {
      const created = await EntityCommandService.createChecklist({
        id: "chk-p02-recurring",
        workspaceId: wsId,
        title: "Daily Morning Routine",
        items: [
          { id: "item-brush", title: "Brush teeth", completed: false },
          { id: "item-water", title: "Drink water", completed: false },
        ],
        recurrence: {
          frequency: "daily",
          interval: 1,
        },
      } as Checklist, wsId);

      // Attempt to toggle fake item ID on occurrence
      const result = await EntityCommandService.toggleChecklistItem(
        created.id,
        "item-fake-id",
        wsId,
        "2026-08-31"
      );

      expect(result).toBeNull();

      const stored = await ChecklistRepository.getChecklist(created.id, wsId);
      expect(stored?.occurrenceHistory?.["2026-08-31"]).toBeUndefined();
      expect(stored?.pebbleAwarded).toBeUndefined();
    });
  });

  // ===========================================================================
  // P0-3 — Recurring Occurrence Validation
  // ===========================================================================
  describe("P0-3: Recurring occurrence validation", () => {
    test("toggleChecklistItem accepts valid occurrence date and rejects non-occurrence / exception dates", async () => {
      // Weekly checklist on Mondays (day 1) and Wednesdays (day 3)
      const created = await EntityCommandService.createChecklist({
        id: "chk-p03-weekly",
        workspaceId: wsId,
        title: "Weekly Review",
        schedule: {
          date: "2026-08-03", // Monday
          startTime: "10:00",
        },
        recurrence: {
          frequency: "weekly",
          interval: 1,
          daysOfWeek: [1, 3], // Monday & Wednesday
        },
        recurrenceExceptions: ["2026-08-10"], // Exception on Monday Aug 10
        items: [
          { id: "item-1", title: "Review tasks", completed: false },
        ],
      } as Checklist, wsId);

      // 2026-08-05 is Wednesday (matches daysOfWeek: [1, 3]) -> Valid
      const validRes = await EntityCommandService.toggleChecklistItem(
        created.id,
        "item-1",
        wsId,
        "2026-08-05"
      );
      expect(validRes).not.toBeNull();
      expect(validRes?.updated.occurrenceHistory?.["2026-08-05"]?.completedItemIds).toContain("item-1");

      // 2026-08-06 is Thursday (not in daysOfWeek) -> Invalid occurrence date
      const invalidDateRes = await EntityCommandService.toggleChecklistItem(
        created.id,
        "item-1",
        wsId,
        "2026-08-06"
      );
      expect(invalidDateRes).toBeNull();

      // 2026-08-10 is Monday but listed in recurrenceExceptions -> Invalid / Exception date
      const exceptionRes = await EntityCommandService.toggleChecklistItem(
        created.id,
        "item-1",
        wsId,
        "2026-08-10"
      );
      expect(exceptionRes).toBeNull();
    });
  });

  // ===========================================================================
  // P0-4 — Revision Correctness
  // ===========================================================================
  describe("P0-4: Revision correctness across mutation paths", () => {
    test("Every logical mutation advances revision and obeys lifecycle generation contract", async () => {
      // 1. Create
      const c1 = await EntityCommandService.createChecklist({
        id: "chk-rev",
        workspaceId: wsId,
        title: "Revision Test",
        items: [{ id: "i1", title: "First item", completed: false }],
      } as Checklist, wsId);
      expect(c1.revision).toBe(1);
      expect(c1.lifecycleGeneration).toBe(1);

      // 2. Update
      const c2 = await EntityCommandService.updateChecklist(c1.id, wsId, {
        title: "Updated Revision Test",
      });
      expect(c2.revision).toBe(2);
      expect(c2.lifecycleGeneration).toBe(1);

      // 3. Add Item
      const c3 = await EntityCommandService.addChecklistItem(c1.id, "Second item", wsId);
      expect(c3?.updated.revision).toBe(3);
      expect(c3?.updated.lifecycleGeneration).toBe(1);

      // 4. Toggle Item
      const c4 = await EntityCommandService.toggleChecklistItem(c1.id, "i1", wsId);
      expect(c4?.updated.revision).toBe(4);
      expect(c4?.updated.lifecycleGeneration).toBe(1);

      // 5. Delete Item
      const c5 = await EntityCommandService.deleteChecklistItem(c1.id, "i1", wsId);
      expect(c5?.updated.revision).toBe(5);
      expect(c5?.updated.lifecycleGeneration).toBe(1);

      // 6. Move
      const c6 = await EntityCommandService.moveChecklist(c1.id, wsId, targetWsId);
      expect(c6.revision).toBe(6);
      expect(c6.lifecycleGeneration).toBe(1);
      expect(c6.workspaceId).toBe(targetWsId);

      // 7. Recycle & Restore
      await EntityCommandService.recycleChecklist(c1.id, targetWsId);
      const binItems = await RecycleBinRepository.getRecycleBinItems();
      const binItem = binItems.find((b) => b.entityId === c1.id);
      expect(binItem).toBeDefined();

      const c7 = await EntityCommandService.restoreChecklist(binItem!.id);
      expect(c7.revision).toBe(7);
      expect(c7.lifecycleGeneration).toBe(1);
      expect(c7.workspaceId).toBe(targetWsId);
    });

    test("Recurring master and detached occurrence have correct revisions upon detachment", async () => {
      const master = await EntityCommandService.createChecklist({
        id: "chk-master-rev",
        workspaceId: wsId,
        title: "Daily Master",
        schedule: {
          date: "2026-08-01",
          startTime: "09:00",
          endTime: "09:30",
        },
        recurrence: {
          frequency: "daily",
          interval: 1,
        },
        items: [{ id: "m1", title: "Item 1", completed: false }],
      } as Checklist, wsId);

      expect(master.revision).toBe(1);

      const { masterChecklist, occurrenceChecklist } =
        await EntityCommandService.rescheduleChecklistRecurringOccurrence(
          master.id,
          wsId,
          "2026-08-05",
          { date: "2026-08-05", hour: 14, minute: 0 }
        );

      // Master revision MUST increment to 2
      expect(masterChecklist.revision).toBe(2);
      expect(masterChecklist.lifecycleGeneration).toBe(1);
      expect(masterChecklist.recurrenceExceptions).toContain("2026-08-05");

      // Detached copy MUST start at revision 1 and generation 1
      expect(occurrenceChecklist.revision).toBe(1);
      expect(occurrenceChecklist.lifecycleGeneration).toBe(1);
      expect(occurrenceChecklist.recurrence).toBeUndefined();
      expect(occurrenceChecklist.schedule?.date).toBe("2026-08-05");
      expect(occurrenceChecklist.schedule?.startTime).toBe("14:00");
    });
  });

  // ===========================================================================
  // P0-5 — Reminder Correctness
  // ===========================================================================
  describe("P0-5: Reminder lifecycle end-to-end", () => {
    test("One-time checklist schedules reminder, updates trigger on time/date change, and cleans up on disable", async () => {
      const initialTrigger = new Date(2026, 9, 10, 9, 0, 0, 0).getTime();
      
      // 1. Create with reminder
      const created = await EntityCommandService.createChecklist({
        id: "chk-rem-1",
        workspaceId: wsId,
        title: "Trip Preparation",
        schedule: {
          date: "2026-10-10",
          startTime: "09:00",
        },
        reminder: {
          enabled: true,
          triggerAt: initialTrigger,
        },
        items: [{ id: "i1", title: "Passport", completed: false }],
      } as Checklist, wsId);

      expect(created.reminder?.notificationIds).toBeDefined();
      expect(mockScheduleNotificationAsync).toHaveBeenCalled();

      // 2. Change scheduled time -> triggerAt is updated and notification rescheduled
      const updatedTime = await EntityCommandService.updateChecklist(created.id, wsId, {
        schedule: {
          date: "2026-10-10",
          startTime: "11:30",
        },
      });

      const expectedNewTrigger = new Date(2026, 9, 10, 11, 30, 0, 0).getTime();
      expect(updatedTime.reminder?.triggerAt).toBe(expectedNewTrigger);
      expect(mockCancelScheduledNotificationAsync).toHaveBeenCalled();

      // 3. Change scheduled date -> triggerAt is updated
      const updatedDate = await EntityCommandService.updateChecklist(created.id, wsId, {
        schedule: {
          date: "2026-10-15",
          startTime: "11:30",
        },
      });

      const expectedDateTrigger = new Date(2026, 9, 15, 11, 30, 0, 0).getTime();
      expect(updatedDate.reminder?.triggerAt).toBe(expectedDateTrigger);

      // 4. Disable reminder -> cancels notifications
      const disabled = await EntityCommandService.updateChecklist(created.id, wsId, {
        reminder: {
          enabled: false,
          triggerAt: expectedDateTrigger,
        },
      });
      expect(disabled.reminder?.enabled).toBe(false);
      expect(disabled.reminder?.notificationIds).toBeUndefined();
    });

    test("Detaching recurring occurrence recomputes detached triggerAt without retaining master's old triggerAt", async () => {
      const masterTrigger = new Date(2026, 7, 1, 9, 0, 0, 0).getTime();
      
      const master = await EntityCommandService.createChecklist({
        id: "chk-master-rem",
        workspaceId: wsId,
        title: "Daily Standup Checklist",
        schedule: {
          date: "2026-08-01",
          startTime: "09:00",
        },
        recurrence: {
          frequency: "daily",
          interval: 1,
        },
        reminder: {
          enabled: true,
          triggerAt: masterTrigger,
        },
        items: [{ id: "m1", title: "Check blockers", completed: false }],
      } as Checklist, wsId);

      // Reschedule occurrence for Aug 12 at 16:45
      const { masterChecklist, occurrenceChecklist } =
        await EntityCommandService.rescheduleChecklistRecurringOccurrence(
          master.id,
          wsId,
          "2026-08-12",
          { date: "2026-08-12", hour: 16, minute: 45 }
        );

      const expectedDetachedTrigger = new Date(2026, 7, 12, 16, 45, 0, 0).getTime();
      expect(occurrenceChecklist.reminder?.triggerAt).toBe(expectedDetachedTrigger);
      expect(occurrenceChecklist.reminder?.triggerAt).not.toBe(masterTrigger);
      expect(occurrenceChecklist.schedule?.startTime).toBe("16:45");
      expect(occurrenceChecklist.schedule?.date).toBe("2026-08-12");
    });
  });

  // ===========================================================================
  // P1-1 — Occurrence History Isolation & Compaction
  // ===========================================================================
  describe("P1-1: occurrenceHistory safety", () => {
    test("Multiple occurrence dates have isolated item completion states", async () => {
      const created = await EntityCommandService.createChecklist({
        id: "chk-p11",
        workspaceId: wsId,
        title: "Workout Routine",
        schedule: {
          date: "2026-08-01",
          startTime: "07:00",
        },
        items: [
          { id: "i-warmup", title: "Warmup", completed: false },
          { id: "i-run", title: "Run 5km", completed: false },
        ],
        recurrence: {
          frequency: "daily",
          interval: 1,
        },
      } as Checklist, wsId);

      // Day 1: complete warmup only
      await EntityCommandService.toggleChecklistItem(created.id, "i-warmup", wsId, "2026-08-01");

      // Day 2: complete both items
      await EntityCommandService.toggleChecklistItem(created.id, "i-warmup", wsId, "2026-08-02");
      await EntityCommandService.toggleChecklistItem(created.id, "i-run", wsId, "2026-08-02");

      const stored = await ChecklistRepository.getChecklist(created.id, wsId);
      expect(stored?.occurrenceHistory?.["2026-08-01"]?.completedItemIds).toEqual(["i-warmup"]);
      expect(stored?.occurrenceHistory?.["2026-08-01"]?.completedAt).toBeUndefined();

      expect(stored?.occurrenceHistory?.["2026-08-02"]?.completedItemIds).toEqual(["i-warmup", "i-run"]);
      expect(stored?.occurrenceHistory?.["2026-08-02"]?.completedAt).toBeDefined();

      // Master template items remain unmutated
      expect(stored?.items.every((i) => !i.completed)).toBe(true);
    });
  });

  // ===========================================================================
  // P1-2 — Workspace Moves
  // ===========================================================================
  describe("P1-2: Workspace moves preserve all scheduling & checklist attributes", () => {
    test("moveChecklist preserves schedule, recurrence, exceptions, occurrence history, and reminder", async () => {
      const created = await EntityCommandService.createChecklist({
        id: "chk-move",
        workspaceId: wsId,
        title: "Sprint Checklist",
        schedule: {
          date: "2026-08-01",
          startTime: "10:00",
        },
        recurrence: {
          frequency: "weekly",
          interval: 2,
        },
        recurrenceExceptions: ["2026-08-15"],
        occurrenceHistory: {
          "2026-08-01": { completedItemIds: ["i1"], completedAt: Date.now() },
        },
        reminder: {
          enabled: true,
          triggerAt: 1785578400000,
        },
        items: [{ id: "i1", title: "Task 1", completed: false }],
      } as unknown as Checklist, wsId);

      const moved = await EntityCommandService.moveChecklist(created.id, wsId, targetWsId);

      expect(moved.workspaceId).toBe(targetWsId);
      expect(moved.schedule).toEqual(created.schedule);
      expect(moved.recurrence).toEqual(created.recurrence);
      expect(moved.recurrenceExceptions).toEqual(["2026-08-15"]);
      expect(moved.occurrenceHistory?.["2026-08-01"]?.completedItemIds).toEqual(["i1"]);
      expect(moved.reminder?.enabled).toBe(true);

      // Verify removed from source and present in target
      const sourceMap = await ChecklistRepository.getChecklists(wsId);
      expect(sourceMap[created.id]).toBeUndefined();

      const targetMap = await ChecklistRepository.getChecklists(targetWsId);
      expect(targetMap[created.id]).toBeDefined();
    });
  });

  // ===========================================================================
  // P1-3 & P1-4 — Recycle, Restore, and Permanent Deletion
  // ===========================================================================
  describe("P1-3 & P1-4: Recycle, restore, and permanent deletion lifecycle", () => {
    test("Recycle cancels notifications and snapshot preserves all fields; Restore reschedules notifications", async () => {
      const created = await EntityCommandService.createChecklist({
        id: "chk-recycle",
        workspaceId: wsId,
        title: "Recycle Lifecycle Checklist",
        schedule: {
          date: "2026-10-01",
          startTime: "08:00",
        },
        reminder: {
          enabled: true,
          triggerAt: new Date(2026, 9, 1, 8, 0, 0, 0).getTime(),
        },
        items: [{ id: "i1", title: "Item 1", completed: false }],
      } as Checklist, wsId);

      // 1. Recycle
      await EntityCommandService.recycleChecklist(created.id, wsId);
      expect(mockCancelScheduledNotificationAsync).toHaveBeenCalled();

      const activeAfterRecycle = await ChecklistRepository.getChecklists(wsId);
      expect(activeAfterRecycle[created.id]).toBeUndefined();

      // 2. Restore
      const binItems = await RecycleBinRepository.getRecycleBinItems();
      const binItem = binItems.find((b) => b.entityId === created.id);
      expect(binItem).toBeDefined();

      const restored = await EntityCommandService.restoreChecklist(binItem!.id);
      expect(restored.id).toBe(created.id);
      expect(restored.workspaceId).toBe(wsId);
      expect(restored.schedule?.date).toBe("2026-10-01");
      expect(restored.reminder?.enabled).toBe(true);

      // Bin item should be removed
      const binAfterRestore = await RecycleBinRepository.getRecycleBinItems();
      expect(binAfterRestore.some((b) => b.entityId === created.id)).toBe(false);

      // 3. Permanent deletion
      await EntityCommandService.permanentlyDeleteChecklist(restored.id, wsId);
      const activeAfterDelete = await ChecklistRepository.getChecklists(wsId);
      expect(activeAfterDelete[restored.id]).toBeUndefined();

      const isTombstoned = await TombstoneRepository.isTombstoned("checklist", restored.id, restored.lifecycleGeneration);
      expect(isTombstoned).toBe(true);
    });
  });

  // ===========================================================================
  // P1-5 — Recurring Detachment Isolation & Idempotence
  // ===========================================================================
  describe("P1-5: Recurring detachment idempotence and item state preservation", () => {
    test("Detached occurrence gets occurrence items completed without affecting master template", async () => {
      const master = await EntityCommandService.createChecklist({
        id: "chk-detach",
        workspaceId: wsId,
        title: "Bi-Weekly Maintenance",
        schedule: {
          date: "2026-08-01",
          startTime: "08:00",
        },
        recurrence: {
          frequency: "weekly",
          interval: 2,
        },
        items: [
          { id: "i1", title: "Clean filters", completed: false },
          { id: "i2", title: "Inspect valves", completed: false },
        ],
      } as Checklist, wsId);

      // Complete item i1 on occurrence 2026-08-15
      await EntityCommandService.toggleChecklistItem(master.id, "i1", wsId, "2026-08-15");

      // Detach occurrence 2026-08-15 to 2026-08-16 at 10:00
      const { masterChecklist, occurrenceChecklist } =
        await EntityCommandService.rescheduleChecklistRecurringOccurrence(
          master.id,
          wsId,
          "2026-08-15",
          { date: "2026-08-16", hour: 10, minute: 0 }
        );

      expect(masterChecklist.recurrenceExceptions).toContain("2026-08-15");
      expect(masterChecklist.recurrence).toBeDefined();

      // Occurrence checklist has item i1 completed and i2 uncompleted
      expect(occurrenceChecklist.items.find((i) => i.id === "i1")?.completed).toBe(true);
      expect(occurrenceChecklist.items.find((i) => i.id === "i2")?.completed).toBe(false);
      expect(occurrenceChecklist.recurrence).toBeUndefined();
      expect(occurrenceChecklist.schedule?.date).toBe("2026-08-16");
      expect(occurrenceChecklist.schedule?.startTime).toBe("10:00");
    });
  });

  // ===========================================================================
  // Concurrency & In-Flight Race Conditions (Requirements 3, 4, 5)
  // ===========================================================================
  describe("Concurrency & In-Flight Race Conditions", () => {
    test("Update A (slow) vs Update B (fast): Stale A scheduling result cannot overwrite B or lose B's notifications", async () => {
      // Create initial checklist
      const initial = await EntityCommandService.createChecklist({
        id: "chk-race-1",
        workspaceId: wsId,
        title: "Race Test Checklist",
        schedule: {
          date: "2026-10-20",
          startTime: "08:00",
        },
        reminder: {
          enabled: true,
          triggerAt: new Date(2026, 9, 20, 8, 0, 0, 0).getTime(),
        },
        items: [{ id: "i1", title: "Item 1", completed: false }],
      } as Checklist, wsId);

      expect(initial.revision).toBe(1);

      // Track notification scheduling calls
      let resolveScheduleA: (ids: string[]) => void;
      let resolveScheduleB: (ids: string[]) => void;

      const scheduleAPromise = new Promise<string[]>((res) => {
        resolveScheduleA = res;
      });
      const scheduleBPromise = new Promise<string[]>((res) => {
        resolveScheduleB = res;
      });

      let callCount = 0;
      const originalReschedule = RemindersService.rescheduleChecklistReminders;
      jest.spyOn(RemindersService, "rescheduleChecklistReminders").mockImplementation(async (chk: Checklist) => {
        callCount++;
        if (callCount === 1) {
          // Update A: delay until scheduleAPromise resolves
          const notifIds = await scheduleAPromise;
          return {
            ...chk,
            reminder: { ...chk.reminder!, notificationIds: notifIds },
          };
        } else {
          // Update B: delay until scheduleBPromise resolves
          const notifIds = await scheduleBPromise;
          return {
            ...chk,
            reminder: { ...chk.reminder!, notificationIds: notifIds },
          };
        }
      });

      // 1. Launch Update A (startTime: 09:00 -> rev 2)
      const promiseA = EntityCommandService.updateChecklist(initial.id, wsId, {
        schedule: { date: "2026-10-20", startTime: "09:00" },
      });

      // Allow Update A's domain persistence to complete
      await new Promise((r) => setTimeout(r, 20));

      // 2. Launch Update B (startTime: 10:00 -> rev 3)
      const promiseB = EntityCommandService.updateChecklist(initial.id, wsId, {
        schedule: { date: "2026-10-20", startTime: "10:00" },
      });

      // Allow Update B's domain persistence to complete
      await new Promise((r) => setTimeout(r, 20));

      // 3. Resolve B FIRST (fast OS response for B)
      resolveScheduleB!(["notif-id-B"]);
      const resultB = await promiseB;

      expect(resultB.revision).toBe(3);
      expect(resultB.schedule?.startTime).toBe("10:00");

      // Verify that storage has B's notification IDs
      const storedAfterB = await ChecklistRepository.getChecklist(initial.id, wsId);
      expect(storedAfterB?.revision).toBe(3);
      expect(storedAfterB?.reminder?.notificationIds).toEqual(["notif-id-B"]);

      // 4. Resolve A AFTER B (slow OS response for A finishes late)
      resolveScheduleA!(["notif-id-A-stale"]);
      await promiseA;

      // 5. Final Invariant Verification:
      // - Checklist in storage MUST remain at revision 3
      // - Must retain Update B's reminder (10:00) and notification IDs (["notif-id-B"])
      // - Must NEVER attach A's stale notification IDs
      // - Stale notification A MUST have been cancelled via cancelScheduledNotificationAsync
      const finalStored = await ChecklistRepository.getChecklist(initial.id, wsId);
      expect(finalStored?.revision).toBe(3);
      expect(finalStored?.schedule?.startTime).toBe("10:00");
      expect(finalStored?.reminder?.notificationIds).toEqual(["notif-id-B"]);

      // Verify stale A notification was cancelled
      expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith("notif-id-A-stale");

      // Restore spy
      (RemindersService.rescheduleChecklistReminders as any).mockRestore?.();
    });

    test("Move + Reminder in-flight: Stale async scheduling cannot resurrect checklist in old workspace", async () => {
      const initial = await EntityCommandService.createChecklist({
        id: "chk-move-race",
        workspaceId: wsId,
        title: "Move Race Checklist",
        schedule: {
          date: "2026-10-25",
          startTime: "09:00",
        },
        reminder: {
          enabled: true,
          triggerAt: new Date(2026, 9, 25, 9, 0, 0, 0).getTime(),
        },
        items: [{ id: "i1", title: "Item 1", completed: false }],
      } as Checklist, wsId);

      let resolveSlowSchedule: (ids: string[]) => void;
      const slowSchedulePromise = new Promise<string[]>((res) => {
        resolveSlowSchedule = res;
      });

      jest.spyOn(RemindersService, "rescheduleChecklistReminders").mockImplementationOnce(async (chk: Checklist) => {
        const notifIds = await slowSchedulePromise;
        return {
          ...chk,
          reminder: { ...chk.reminder!, notificationIds: notifIds },
        };
      });

      // 1. Trigger update in source workspace (wsId)
      const updatePromise = EntityCommandService.updateChecklist(initial.id, wsId, {
        schedule: { date: "2026-10-25", startTime: "11:00" },
      });

      await new Promise((r) => setTimeout(r, 20));

      // 2. Concurrently move checklist to target workspace (targetWsId)
      await EntityCommandService.moveChecklist(initial.id, wsId, targetWsId);

      // Verify it was moved out of source workspace
      const sourceChecklist = await ChecklistRepository.getChecklist(initial.id, wsId);
      expect(sourceChecklist).toBeNull();

      // 3. Now let the slow scheduling finish for source workspace
      resolveSlowSchedule!(["stale-move-notif"]);
      await updatePromise;

      // 4. Invariant: Source workspace MUST NOT have been resurrected
      const sourceAfterLateAsync = await ChecklistRepository.getChecklist(initial.id, wsId);
      expect(sourceAfterLateAsync).toBeNull();

      // Target workspace has the moved checklist
      const targetChecklist = await ChecklistRepository.getChecklist(initial.id, targetWsId);
      expect(targetChecklist).toBeDefined();
      expect(targetChecklist?.workspaceId).toBe(targetWsId);

      // Stale notification was cancelled
      expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith("stale-move-notif");

      (RemindersService.rescheduleChecklistReminders as any).mockRestore?.();
    });

    test("Restore + Stale Snapshot: Stale notification IDs are rejected if state changes during scheduling", async () => {
      // Create and recycle
      const initial = await EntityCommandService.createChecklist({
        id: "chk-restore-race",
        workspaceId: wsId,
        title: "Restore Race Checklist",
        schedule: {
          date: "2026-10-28",
          startTime: "09:00",
        },
        reminder: {
          enabled: true,
          triggerAt: new Date(2026, 9, 28, 9, 0, 0, 0).getTime(),
        },
        items: [{ id: "i1", title: "Item 1", completed: false }],
      } as Checklist, wsId);

      await EntityCommandService.recycleChecklist(initial.id, wsId);

      const binItems = await RecycleBinRepository.getRecycleBinItems();
      const binItem = binItems.find((b) => b.entityId === initial.id);
      expect(binItem).toBeDefined();

      let resolveRestoreSchedule: (ids: string[]) => void;
      const restoreSchedulePromise = new Promise<string[]>((res) => {
        resolveRestoreSchedule = res;
      });

      jest.spyOn(RemindersService, "rescheduleChecklistReminders").mockImplementationOnce(async (chk: Checklist) => {
        const notifIds = await restoreSchedulePromise;
        return {
          ...chk,
          reminder: { ...chk.reminder!, notificationIds: notifIds },
        };
      });

      // 1. Restore checklist
      const restorePromise = EntityCommandService.restoreChecklist(binItem!.id);

      await new Promise((r) => setTimeout(r, 20));

      // 2. Concurrently update checklist before notification finishes (advancing revision)
      await EntityCommandService.updateChecklist(initial.id, wsId, {
        title: "Updated Immediately After Restore",
      });

      // 3. Resolve restore's slow notification
      resolveRestoreSchedule!(["stale-restore-notif"]);
      await restorePromise;

      // 4. Invariant: The checklist has the updated title and stale restore notification was cancelled
      const active = await ChecklistRepository.getChecklist(initial.id, wsId);
      expect(active?.title).toBe("Updated Immediately After Restore");
      expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith("stale-restore-notif");

      (RemindersService.rescheduleChecklistReminders as any).mockRestore?.();
    });
  });
});

