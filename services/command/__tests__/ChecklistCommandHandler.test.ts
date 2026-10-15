import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { ChecklistCommandHandler } from "@/services/command/handlers/ChecklistCommandHandler";
import {
  ChecklistRepository,
  RecycleBinRepository,
  TombstoneRepository,
  WorkspaceRepository,
} from "@/repositories";
import * as RemindersService from "@/services/scheduling/reminders.service";
import { PEBBLE_LOG_KEY } from "@/features/profile/services/pebble.service";
import type { Checklist, Workspace } from "@/shared/types/domain.types";

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

const flushImmediate = () => new Promise<void>((r) => setImmediate(() => r()));
function defer() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function pebbleRewardCount(rewardIdPrefix: string): Promise<number> {
  const raw = await AsyncStorage.getItem(PEBBLE_LOG_KEY);
  if (!raw) return 0;
  const log = JSON.parse(raw);
  return log.filter((e: any) =>
    String(e.rewardId || "").startsWith(rewardIdPrefix)
  ).length;
}

describe("ChecklistCommandHandler Suite", () => {
  const wsId = "ws-test-checklist-harden";
  const targetWsId = "ws-target-checklist";

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    mockScheduleNotificationAsync.mockResolvedValue("mock-notif-id-123");
    mockCancelScheduledNotificationAsync.mockResolvedValue(undefined);

    // One-time reminders whose trigger is already in the past are intentionally
    // never scheduled (reminders.service: `delay <= 0` guard). Pin "now" before fixtures.
    jest
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2026-09-30T12:00:00Z").getTime());

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
  // Domain Validation & Identity
  // ===========================================================================
  describe("domain validation and canonical identity", () => {
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

    test("toggleChecklistItem accepts valid occurrence date and rejects non-occurrence / exception dates", async () => {
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
  // Revision & Lifecycle Invariants
  // ===========================================================================
  describe("revision correctness across mutation paths", () => {
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

      expect(masterChecklist.revision).toBe(2);
      expect(masterChecklist.lifecycleGeneration).toBe(1);
      expect(masterChecklist.recurrenceExceptions).toContain("2026-08-05");

      expect(occurrenceChecklist.revision).toBe(1);
      expect(occurrenceChecklist.lifecycleGeneration).toBe(1);
      expect(occurrenceChecklist.recurrence).toBeUndefined();
      expect(occurrenceChecklist.schedule?.date).toBe("2026-08-05");
      expect(occurrenceChecklist.schedule?.startTime).toBe("14:00");
    });
  });

  // ===========================================================================
  // Reminder Lifecycle
  // ===========================================================================
  describe("reminder lifecycle end-to-end", () => {
    test("One-time checklist schedules reminder, updates trigger on time/date change, and cleans up on disable", async () => {
      const initialTrigger = new Date(2026, 9, 10, 9, 0, 0, 0).getTime();
      
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

      const updatedTime = await EntityCommandService.updateChecklist(created.id, wsId, {
        schedule: {
          date: "2026-10-10",
          startTime: "11:30",
        },
      });

      const expectedNewTrigger = new Date(2026, 9, 10, 11, 30, 0, 0).getTime();
      expect(updatedTime.reminder?.triggerAt).toBe(expectedNewTrigger);
      expect(mockCancelScheduledNotificationAsync).toHaveBeenCalled();

      const updatedDate = await EntityCommandService.updateChecklist(created.id, wsId, {
        schedule: {
          date: "2026-10-15",
          startTime: "11:30",
        },
      });

      const expectedDateTrigger = new Date(2026, 9, 15, 11, 30, 0, 0).getTime();
      expect(updatedDate.reminder?.triggerAt).toBe(expectedDateTrigger);

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
  // Occurrence History & Workspace Moves
  // ===========================================================================
  describe("occurrence history safety and workspace moves", () => {
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

      await EntityCommandService.toggleChecklistItem(created.id, "i-warmup", wsId, "2026-08-01");
      await EntityCommandService.toggleChecklistItem(created.id, "i-warmup", wsId, "2026-08-02");
      await EntityCommandService.toggleChecklistItem(created.id, "i-run", wsId, "2026-08-02");

      const stored = await ChecklistRepository.getChecklist(created.id, wsId);
      expect(stored?.occurrenceHistory?.["2026-08-01"]?.completedItemIds).toEqual(["i-warmup"]);
      expect(stored?.occurrenceHistory?.["2026-08-01"]?.completedAt).toBeUndefined();

      expect(stored?.occurrenceHistory?.["2026-08-02"]?.completedItemIds).toEqual(["i-warmup", "i-run"]);
      expect(stored?.occurrenceHistory?.["2026-08-02"]?.completedAt).toBeDefined();

      expect(stored?.items.every((i) => !i.completed)).toBe(true);
    });

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

      const sourceMap = await ChecklistRepository.getChecklists(wsId);
      expect(sourceMap[created.id]).toBeUndefined();

      const targetMap = await ChecklistRepository.getChecklists(targetWsId);
      expect(targetMap[created.id]).toBeDefined();
    });
  });

  // ===========================================================================
  // Recycle, Restore, Permanent Deletion & Detachment
  // ===========================================================================
  describe("recycle, restore, permanent deletion, and detachment idempotence", () => {
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

      const binAfterRestore = await RecycleBinRepository.getRecycleBinItems();
      expect(binAfterRestore.some((b) => b.entityId === created.id)).toBe(false);

      // 3. Permanent deletion
      await EntityCommandService.permanentlyDeleteChecklist(restored.id, wsId);
      const activeAfterDelete = await ChecklistRepository.getChecklists(wsId);
      expect(activeAfterDelete[restored.id]).toBeUndefined();

      const isTombstoned = await TombstoneRepository.isTombstoned("checklist", restored.id, restored.lifecycleGeneration);
      expect(isTombstoned).toBe(true);
    });

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

      await EntityCommandService.toggleChecklistItem(master.id, "i1", wsId, "2026-08-15");

      const { masterChecklist, occurrenceChecklist } =
        await EntityCommandService.rescheduleChecklistRecurringOccurrence(
          master.id,
          wsId,
          "2026-08-15",
          { date: "2026-08-16", hour: 10, minute: 0 }
        );

      expect(masterChecklist.recurrenceExceptions).toContain("2026-08-15");
      expect(masterChecklist.recurrence).toBeDefined();

      expect(occurrenceChecklist.items.find((i) => i.id === "i1")?.completed).toBe(true);
      expect(occurrenceChecklist.items.find((i) => i.id === "i2")?.completed).toBe(false);
      expect(occurrenceChecklist.recurrence).toBeUndefined();
      expect(occurrenceChecklist.schedule?.date).toBe("2026-08-16");
      expect(occurrenceChecklist.schedule?.startTime).toBe("10:00");
    });
  });

  // ===========================================================================
  // In-Flight Asynchronous Race Conditions
  // ===========================================================================
  describe("in-flight asynchronous race conditions", () => {
    test("Update A (slow) vs Update B (fast): Stale A scheduling result cannot overwrite B or lose B's notifications", async () => {
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

      let resolveScheduleA: (ids: string[]) => void;
      let resolveScheduleB: (ids: string[]) => void;

      const scheduleAPromise = new Promise<string[]>((res) => {
        resolveScheduleA = res;
      });
      const scheduleBPromise = new Promise<string[]>((res) => {
        resolveScheduleB = res;
      });

      let callCount = 0;
      jest.spyOn(RemindersService, "rescheduleChecklistReminders").mockImplementation(async (chk: Checklist) => {
        callCount++;
        if (callCount === 1) {
          const notifIds = await scheduleAPromise;
          return {
            ...chk,
            reminder: { ...chk.reminder!, notificationIds: notifIds },
          };
        } else {
          const notifIds = await scheduleBPromise;
          return {
            ...chk,
            reminder: { ...chk.reminder!, notificationIds: notifIds },
          };
        }
      });

      const promiseA = EntityCommandService.updateChecklist(initial.id, wsId, {
        schedule: { date: "2026-10-20", startTime: "09:00" },
      });

      await new Promise((r) => setTimeout(r, 20));

      const promiseB = EntityCommandService.updateChecklist(initial.id, wsId, {
        schedule: { date: "2026-10-20", startTime: "10:00" },
      });

      await new Promise((r) => setTimeout(r, 20));

      resolveScheduleB!(["notif-id-B"]);
      const resultB = await promiseB;

      expect(resultB.revision).toBe(3);
      expect(resultB.schedule?.startTime).toBe("10:00");

      const storedAfterB = await ChecklistRepository.getChecklist(initial.id, wsId);
      expect(storedAfterB?.revision).toBe(3);
      expect(storedAfterB?.reminder?.notificationIds).toEqual(["notif-id-B"]);

      resolveScheduleA!(["notif-id-A-stale"]);
      await promiseA;

      const finalStored = await ChecklistRepository.getChecklist(initial.id, wsId);
      expect(finalStored?.revision).toBe(3);
      expect(finalStored?.schedule?.startTime).toBe("10:00");
      expect(finalStored?.reminder?.notificationIds).toEqual(["notif-id-B"]);

      expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith("notif-id-A-stale");

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

      const updatePromise = EntityCommandService.updateChecklist(initial.id, wsId, {
        schedule: { date: "2026-10-25", startTime: "11:00" },
      });

      await new Promise((r) => setTimeout(r, 20));

      await EntityCommandService.moveChecklist(initial.id, wsId, targetWsId);

      const sourceChecklist = await ChecklistRepository.getChecklist(initial.id, wsId);
      expect(sourceChecklist).toBeNull();

      resolveSlowSchedule!(["stale-move-notif"]);
      await updatePromise;

      const sourceAfterLateAsync = await ChecklistRepository.getChecklist(initial.id, wsId);
      expect(sourceAfterLateAsync).toBeNull();

      const targetChecklist = await ChecklistRepository.getChecklist(initial.id, targetWsId);
      expect(targetChecklist).toBeDefined();
      expect(targetChecklist?.workspaceId).toBe(targetWsId);

      expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith("stale-move-notif");

      (RemindersService.rescheduleChecklistReminders as any).mockRestore?.();
    });

    test("Restore + Stale Snapshot: Stale notification IDs are rejected if state changes during scheduling", async () => {
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

      const restorePromise = EntityCommandService.restoreChecklist(binItem!.id);

      await new Promise((r) => setTimeout(r, 20));

      await EntityCommandService.updateChecklist(initial.id, wsId, {
        title: "Updated Immediately After Restore",
      });

      resolveRestoreSchedule!(["stale-restore-notif"]);
      await restorePromise;

      const active = await ChecklistRepository.getChecklist(initial.id, wsId);
      expect(active?.title).toBe("Updated Immediately After Restore");
      expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith("stale-restore-notif");

      (RemindersService.rescheduleChecklistReminders as any).mockRestore?.();
    });
  });

  // ===========================================================================
  // Partition Lock & RMW Concurrency
  // ===========================================================================
  describe("workspace partition lock & RMW concurrency", () => {
    it("serializes updateChecklist vs updateChecklist via workspace partition lock", async () => {
      const checklistId = "checklist-rmw-1";

      await ChecklistRepository.saveChecklistUnlocked({
        id: checklistId,
        workspaceId: wsId,
        title: "Initial Title",
        description: "Initial Desc",
      });

      let getChecklistsCount = 0;
      let aReadStarted = false;
      let bReadStarted = false;

      let resolveBarrier: () => void;
      const barrier = new Promise<void>((r) => {
        resolveBarrier = r;
      });

      const originalGetChecklists = ChecklistRepository.getChecklists.bind(ChecklistRepository);
      const getChecklistsSpy = jest.spyOn(ChecklistRepository, "getChecklists").mockImplementation(async (wId) => {
        getChecklistsCount++;
        if (getChecklistsCount === 1) {
          aReadStarted = true;
          await barrier;
        } else {
          bReadStarted = true;
        }
        return originalGetChecklists(wId);
      });

      const promiseA = ChecklistCommandHandler.updateChecklist(
        checklistId,
        wsId,
        { title: "Updated Title A" },
        { skipAnalytics: true, skipEvents: true }
      );

      while (!aReadStarted) {
        await flushImmediate();
      }

      const promiseB = ChecklistCommandHandler.updateChecklist(
        checklistId,
        wsId,
        { description: "Updated Desc B" },
        { skipAnalytics: true, skipEvents: true }
      );

      await Promise.resolve();
      await Promise.resolve();
      await flushImmediate();

      expect(bReadStarted).toBe(false);

      resolveBarrier!();
      await Promise.all([promiseA, promiseB]);

      const checklists = await ChecklistRepository.getChecklists(wsId);
      const checklist = checklists[checklistId];
      expect(checklist.title).toBe("Updated Title A");
      expect(checklist.description).toBe("Updated Desc B");

      getChecklistsSpy.mockRestore();
    });

    it("serializes addChecklistItem vs updateChecklist via workspace partition lock", async () => {
      const checklistId = "checklist-rmw-2";

      await ChecklistRepository.saveChecklistUnlocked({
        id: checklistId,
        workspaceId: wsId,
        title: "Initial Title",
        items: [{ id: "item-1", title: "Existing Item", completed: false }],
      });

      let getChecklistsCount = 0;
      let aReadStarted = false;
      let bReadStarted = false;

      let resolveBarrier: () => void;
      const barrier = new Promise<void>((r) => {
        resolveBarrier = r;
      });

      const originalGetChecklists = ChecklistRepository.getChecklists.bind(ChecklistRepository);
      const getChecklistsSpy = jest.spyOn(ChecklistRepository, "getChecklists").mockImplementation(async (wId) => {
        getChecklistsCount++;
        if (getChecklistsCount === 1) {
          aReadStarted = true;
          await barrier;
        } else {
          bReadStarted = true;
        }
        return originalGetChecklists(wId);
      });

      const promiseA = ChecklistCommandHandler.addChecklistItem(
        checklistId,
        "New Item A",
        wsId,
        { skipAnalytics: true, skipEvents: true }
      );

      while (!aReadStarted) {
        await flushImmediate();
      }

      const promiseB = ChecklistCommandHandler.updateChecklist(
        checklistId,
        wsId,
        { description: "Updated Desc B" },
        { skipAnalytics: true, skipEvents: true }
      );

      await Promise.resolve();
      await Promise.resolve();
      await flushImmediate();

      expect(bReadStarted).toBe(false);

      resolveBarrier!();
      await Promise.all([promiseA, promiseB]);

      const checklists = await ChecklistRepository.getChecklists(wsId);
      const checklist = checklists[checklistId];
      expect(checklist.items!.length).toBe(2);
      expect(checklist.items![0].title).toBe("Existing Item");
      expect(checklist.items![1].title).toBe("New Item A");
      expect(checklist.description).toBe("Updated Desc B");

      getChecklistsSpy.mockRestore();
    });

    it("serializes toggleChecklistItem vs updateChecklist via workspace partition lock", async () => {
      const checklistId = "checklist-rmw-3";

      await ChecklistRepository.saveChecklistUnlocked({
        id: checklistId,
        workspaceId: wsId,
        title: "Initial Title",
        items: [{ id: "item-toggle", title: "Toggle Me", completed: false }],
      });

      let getChecklistsCount = 0;
      let aReadStarted = false;
      let bReadStarted = false;

      let resolveBarrier: () => void;
      const barrier = new Promise<void>((r) => {
        resolveBarrier = r;
      });

      const originalGetChecklists = ChecklistRepository.getChecklists.bind(ChecklistRepository);
      const getChecklistsSpy = jest.spyOn(ChecklistRepository, "getChecklists").mockImplementation(async (wId) => {
        getChecklistsCount++;
        if (getChecklistsCount === 1) {
          aReadStarted = true;
          await barrier;
        } else {
          bReadStarted = true;
        }
        return originalGetChecklists(wId);
      });

      const promiseA = ChecklistCommandHandler.toggleChecklistItem(
        checklistId,
        "item-toggle",
        wsId,
        { skipAnalytics: true, skipEvents: true }
      );

      while (!aReadStarted) {
        await flushImmediate();
      }

      const promiseB = ChecklistCommandHandler.updateChecklist(
        checklistId,
        wsId,
        { description: "Updated Desc B" },
        { skipAnalytics: true, skipEvents: true }
      );

      await Promise.resolve();
      await Promise.resolve();
      await flushImmediate();

      expect(bReadStarted).toBe(false);

      resolveBarrier!();
      await Promise.all([promiseA, promiseB]);

      const checklists = await ChecklistRepository.getChecklists(wsId);
      const checklist = checklists[checklistId];
      expect(checklist.items![0].completed).toBe(true);
      expect(checklist.description).toBe("Updated Desc B");

      getChecklistsSpy.mockRestore();
    });

    it("serializes deleteChecklistItem vs updateChecklist via workspace partition lock", async () => {
      const checklistId = "checklist-rmw-4";

      await ChecklistRepository.saveChecklistUnlocked({
        id: checklistId,
        workspaceId: wsId,
        title: "Initial Title",
        items: [
          { id: "item-to-delete", title: "Delete Me", completed: false },
          { id: "item-to-keep", title: "Keep Me", completed: false },
        ],
      });

      let getChecklistsCount = 0;
      let aReadStarted = false;
      let bReadStarted = false;

      let resolveBarrier: () => void;
      const barrier = new Promise<void>((r) => {
        resolveBarrier = r;
      });

      const originalGetChecklists = ChecklistRepository.getChecklists.bind(ChecklistRepository);
      const getChecklistsSpy = jest.spyOn(ChecklistRepository, "getChecklists").mockImplementation(async (wId) => {
        getChecklistsCount++;
        if (getChecklistsCount === 1) {
          aReadStarted = true;
          await barrier;
        } else {
          bReadStarted = true;
        }
        return originalGetChecklists(wId);
      });

      const promiseA = ChecklistCommandHandler.deleteChecklistItem(
        checklistId,
        "item-to-delete",
        wsId,
        { skipAnalytics: true, skipEvents: true }
      );

      while (!aReadStarted) {
        await flushImmediate();
      }

      const promiseB = ChecklistCommandHandler.updateChecklist(
        checklistId,
        wsId,
        { description: "Updated Desc B" },
        { skipAnalytics: true, skipEvents: true }
      );

      await Promise.resolve();
      await Promise.resolve();
      await flushImmediate();

      expect(bReadStarted).toBe(false);

      resolveBarrier!();
      await Promise.all([promiseA, promiseB]);

      const checklists = await ChecklistRepository.getChecklists(wsId);
      const checklist = checklists[checklistId];
      expect(checklist.items!.length).toBe(1);
      expect(checklist.items![0].id).toBe("item-to-keep");
      expect(checklist.description).toBe("Updated Desc B");

      getChecklistsSpy.mockRestore();
    });

    it("serializes mergeChecklistItems vs updateChecklist via workspace partition lock", async () => {
      const checklistId = "checklist-rmw-5";

      await ChecklistRepository.saveChecklistUnlocked({
        id: checklistId,
        workspaceId: wsId,
        title: "Initial Title",
        items: [{ id: "item-existing", title: "Existing Item", completed: false }],
      });

      let getChecklistsCount = 0;
      let aReadStarted = false;
      let bReadStarted = false;

      let resolveBarrier: () => void;
      const barrier = new Promise<void>((r) => {
        resolveBarrier = r;
      });

      const originalGetChecklists = ChecklistRepository.getChecklists.bind(ChecklistRepository);
      const getChecklistsSpy = jest.spyOn(ChecklistRepository, "getChecklists").mockImplementation(async (wId) => {
        getChecklistsCount++;
        if (getChecklistsCount === 1) {
          aReadStarted = true;
          await barrier;
        } else {
          bReadStarted = true;
        }
        return originalGetChecklists(wId);
      });

      const promiseA = ChecklistCommandHandler.mergeChecklistItems(
        checklistId,
        wsId,
        ["Existing Item", "New Item to Merge"],
        { skipAnalytics: true, skipEvents: true }
      );

      while (!aReadStarted) {
        await flushImmediate();
      }

      const promiseB = ChecklistCommandHandler.updateChecklist(
        checklistId,
        wsId,
        { description: "Updated Desc B" },
        { skipAnalytics: true, skipEvents: true }
      );

      await Promise.resolve();
      await Promise.resolve();
      await flushImmediate();

      expect(bReadStarted).toBe(false);

      resolveBarrier!();
      await Promise.all([promiseA, promiseB]);

      const checklists = await ChecklistRepository.getChecklists(wsId);
      const checklist = checklists[checklistId];
      expect(checklist.items!.length).toBe(2);
      expect(checklist.items![0].title).toBe("Existing Item");
      expect(checklist.items![1].title).toBe("New Item to Merge");
      expect(checklist.description).toBe("Updated Desc B");

      getChecklistsSpy.mockRestore();
    });

    it("serializes moveChecklist vs updateChecklist via source workspace partition lock", async () => {
      const checklistId = "checklist-move-stale";

      await ChecklistRepository.saveChecklistUnlocked({
        id: checklistId,
        workspaceId: wsId,
        title: "Initial Title",
      });

      let getChecklistsCount = 0;
      let aReadStarted = false;
      let bReadStarted = false;

      let resolveBarrier: () => void;
      const barrier = new Promise<void>((r) => {
        resolveBarrier = r;
      });

      const originalGetChecklists = ChecklistRepository.getChecklists.bind(ChecklistRepository);
      const getChecklistsSpy = jest.spyOn(ChecklistRepository, "getChecklists").mockImplementation(async (wId) => {
        if (wId === wsId) {
          getChecklistsCount++;
          if (getChecklistsCount === 1) {
            aReadStarted = true;
            await barrier;
          } else {
            bReadStarted = true;
          }
        }
        return originalGetChecklists(wId);
      });

      const promiseA = ChecklistCommandHandler.moveChecklist(
        checklistId,
        wsId,
        targetWsId,
        { skipAnalytics: true, skipEvents: true }
      );

      while (!aReadStarted) {
        await flushImmediate();
      }

      const promiseB = ChecklistCommandHandler.updateChecklist(
        checklistId,
        wsId,
        { title: "Updated Title Before Move" },
        { skipAnalytics: true, skipEvents: true }
      ).catch((e) => e);

      await Promise.resolve();
      await Promise.resolve();
      await flushImmediate();

      expect(bReadStarted).toBe(false);

      resolveBarrier!();
      await Promise.all([promiseA, promiseB]);

      const checklistsA = await ChecklistRepository.getChecklists(wsId);
      const checklistsB = await ChecklistRepository.getChecklists(targetWsId);

      expect(checklistsA[checklistId]).toBeUndefined();
      expect(checklistsB[checklistId]).toBeDefined();

      getChecklistsSpy.mockRestore();
    });

    it("prevents opposite-direction deadlock in moveChecklist", async () => {
      const checklist1 = "checklist-move-deadlock-1";
      const checklist2 = "checklist-move-deadlock-2";

      await ChecklistRepository.saveChecklistUnlocked({ id: checklist1, workspaceId: wsId, title: "C1" });
      await ChecklistRepository.saveChecklistUnlocked({ id: checklist2, workspaceId: targetWsId, title: "C2" });

      const promise1 = ChecklistCommandHandler.moveChecklist(checklist1, wsId, targetWsId, { skipAnalytics: true, skipEvents: true });
      const promise2 = ChecklistCommandHandler.moveChecklist(checklist2, targetWsId, wsId, { skipAnalytics: true, skipEvents: true });

      await Promise.all([promise1, promise2]);

      const checklistsA = await ChecklistRepository.getChecklists(wsId);
      const checklistsB = await ChecklistRepository.getChecklists(targetWsId);

      expect(checklistsB[checklist1]).toBeDefined();
      expect(checklistsA[checklist2]).toBeDefined();
      expect(checklistsA[checklist1]).toBeUndefined();
      expect(checklistsB[checklist2]).toBeUndefined();
    });

    it("serializes recycleChecklist vs updateChecklist via source workspace partition lock", async () => {
      const checklistId = "checklist-recycle-stale";

      await ChecklistRepository.saveChecklistUnlocked({
        id: checklistId,
        workspaceId: wsId,
        title: "Initial Title",
      });

      let getChecklistsCount = 0;
      let aReadStarted = false;
      let bReadStarted = false;

      let resolveBarrier: () => void;
      const barrier = new Promise<void>((r) => {
        resolveBarrier = r;
      });

      const originalGetChecklists = ChecklistRepository.getChecklists.bind(ChecklistRepository);
      const getChecklistsSpy = jest.spyOn(ChecklistRepository, "getChecklists").mockImplementation(async (wId) => {
        if (wId === wsId) {
          getChecklistsCount++;
          if (getChecklistsCount === 1) {
            aReadStarted = true;
            await barrier;
          } else {
            bReadStarted = true;
          }
        }
        return originalGetChecklists(wId);
      });

      const promiseA = ChecklistCommandHandler.recycleChecklist(
        checklistId,
        wsId,
        { skipEvents: true }
      );

      while (!aReadStarted) {
        await flushImmediate();
      }

      const promiseB = ChecklistCommandHandler.updateChecklist(
        checklistId,
        wsId,
        { title: "Updated Title Before Recycle" },
        { skipAnalytics: true, skipEvents: true }
      ).catch((e) => e);

      await Promise.resolve();
      await Promise.resolve();
      await flushImmediate();

      expect(bReadStarted).toBe(false);

      resolveBarrier!();
      await Promise.all([promiseA, promiseB]);

      const checklistsA = await ChecklistRepository.getChecklists(wsId);
      expect(checklistsA[checklistId]).toBeUndefined();

      const recycleBinItems = await RecycleBinRepository.getRecycleBinItems();
      const snapshot = recycleBinItems.find((item) => item.entityId === checklistId);
      expect(snapshot).toBeDefined();

      const parsedSnapshot = JSON.parse(snapshot!.snapshot);
      expect(parsedSnapshot.title).toBe("Initial Title");

      getChecklistsSpy.mockRestore();
    });

    it("serializes restoreChecklist vs updateChecklist via partition lock", async () => {
      const checklistId = "chk-restore-1";
      const rbId = `rb-${checklistId}`;

      await RecycleBinRepository.addToRecycleBin("checklist", {
        id: checklistId,
        workspaceId: wsId,
        title: "Restored Title",
      }, wsId);

      await ChecklistRepository.saveChecklistUnlocked({
        id: checklistId,
        workspaceId: wsId,
        title: "Active Title",
      });

      const originalGetRecycleBinItems = RecycleBinRepository.getRecycleBinItems.bind(RecycleBinRepository);
      const restoreReadStarted = defer();
      const resumeRestoreRead = defer();

      let getRecycleBinItemsCallCount = 0;
      jest
        .spyOn(RecycleBinRepository, "getRecycleBinItems")
        .mockImplementation(async () => {
          getRecycleBinItemsCallCount++;
          if (getRecycleBinItemsCallCount === 2) {
            restoreReadStarted.resolve();
            await resumeRestoreRead.promise;
          }
          return originalGetRecycleBinItems();
        });

      const restorePromise = ChecklistCommandHandler.restoreChecklist(rbId, { skipEvents: true });

      await restoreReadStarted.promise;

      const originalGetChecklists = ChecklistRepository.getChecklists.bind(ChecklistRepository);
      let updateStartedRead = false;
      jest.spyOn(ChecklistRepository, "getChecklists").mockImplementationOnce(async (wId) => {
        if (wId === wsId) updateStartedRead = true;
        return originalGetChecklists(wId);
      });

      const updatePromise = ChecklistCommandHandler.updateChecklist(
        checklistId,
        wsId,
        { title: "Updated Active Title" },
        { skipEvents: true, skipAnalytics: true }
      );

      await new Promise((r) => setTimeout(r, 50));
      expect(updateStartedRead).toBe(false);

      resumeRestoreRead.resolve();

      await restorePromise;
      await updatePromise;

      const finalChecklists = await ChecklistRepository.getChecklists(wsId);
      expect(finalChecklists[checklistId].title).toBe("Updated Active Title");

      jest.spyOn(RecycleBinRepository, "getRecycleBinItems").mockRestore();
      jest.spyOn(ChecklistRepository, "getChecklists").mockRestore();
    });

    it("prevents restoreChecklist from destroying concurrent Recycle Bin additions", async () => {
      const checklistId1 = "chk-restore-1";
      const checklistId2 = "chk-restore-2";
      const rbId1 = `rb-${checklistId1}`;

      await RecycleBinRepository.removeRecycleBinItems((await RecycleBinRepository.getRecycleBinItems()).map((i) => i.id));

      await RecycleBinRepository.addToRecycleBin("checklist", {
        id: checklistId1,
        workspaceId: wsId,
        title: "C1",
      }, wsId);

      const originalGetRecycleBinItems = RecycleBinRepository.getRecycleBinItems.bind(RecycleBinRepository);
      const restoreReadStarted = defer();
      const resumeRestoreRead = defer();

      let getRecycleBinItemsCallCount = 0;
      jest
        .spyOn(RecycleBinRepository, "getRecycleBinItems")
        .mockImplementation(async () => {
          getRecycleBinItemsCallCount++;
          if (getRecycleBinItemsCallCount === 2) {
            restoreReadStarted.resolve();
            await resumeRestoreRead.promise;
          }
          return originalGetRecycleBinItems();
        });

      const restorePromise = ChecklistCommandHandler.restoreChecklist(rbId1, { skipEvents: true });

      await restoreReadStarted.promise;

      await RecycleBinRepository.addToRecycleBin("checklist", {
        id: checklistId2,
        workspaceId: wsId,
        title: "C2",
      }, wsId);

      resumeRestoreRead.resolve();
      await restorePromise;

      const finalBin = await RecycleBinRepository.getRecycleBinItems();
      expect(finalBin.find((i) => i.entityId === checklistId2)).toBeDefined();
      expect(finalBin.find((i) => i.entityId === checklistId1)).toBeUndefined();

      jest.spyOn(RecycleBinRepository, "getRecycleBinItems").mockRestore();
    });

    it("serializes permanentlyDeleteChecklist and moveChecklist to prevent stale-read side effects", async () => {
      const checklistId = "chk-perm-del-1";

      await ChecklistRepository.saveChecklistUnlocked({
        id: checklistId,
        workspaceId: wsId,
        title: "Checklist to delete",
      });

      const originalGetChecklists = ChecklistRepository.getChecklists.bind(ChecklistRepository);

      let resolveDeleteRead: () => void;
      const deleteReadStarted = new Promise<void>((r) => { resolveDeleteRead = r; });

      let resolveResumeDelete: () => void;
      const resumeDelete = new Promise<void>((r) => { resolveResumeDelete = r; });

      let getChecklistsCallCount = 0;
      let moveStartedRead = false;
      jest
        .spyOn(ChecklistRepository, "getChecklists")
        .mockImplementation(async (wId) => {
          if (wId === wsId) {
            getChecklistsCallCount++;
            if (getChecklistsCallCount === 1) {
              resolveDeleteRead();
              await resumeDelete;
            } else {
              moveStartedRead = true;
            }
          }
          return originalGetChecklists(wId);
        });

      const deletePromise = ChecklistCommandHandler.permanentlyDeleteChecklist(checklistId, wsId, { skipEvents: true });

      await deleteReadStarted;

      const movePromise = ChecklistCommandHandler.moveChecklist(checklistId, targetWsId, wsId, { skipEvents: true });

      await new Promise((r) => setTimeout(r, 50));
      expect(moveStartedRead).toBe(false);

      resolveResumeDelete!();
      await deletePromise;

      await expect(movePromise).rejects.toThrow(/not found/i);

      const targetChecklists = await ChecklistRepository.getChecklists(targetWsId);
      expect(targetChecklists[checklistId]).toBeUndefined();

      const sourceChecklists = await ChecklistRepository.getChecklists(wsId);
      expect(sourceChecklists[checklistId]).toBeUndefined();

      jest.spyOn(ChecklistRepository, "getChecklists").mockRestore();
    });
  });

  // ===========================================================================
  // Item Toggle Concurrency & Pebble Rewards
  // ===========================================================================
  describe("item toggle concurrency & Pebble rewards", () => {
    const makeChecklist = (id: string, overrides: Partial<Checklist> = {}): Checklist => ({
      id,
      workspaceId: wsId,
      title: `Checklist ${id}`,
      priority: "none",
      items: [
        { id: "item-1", title: "Item 1", completed: false },
        { id: "item-2", title: "Item 2", completed: false },
      ],
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1,
      updatedAt: 1,
      ...overrides,
    });

    it("concurrent toggles of distinct items on the same checklist preserve both changes and bump revision monotonically", async () => {
      await ChecklistRepository.saveChecklistUnlocked(makeChecklist("chk-distinct"));

      const [res1, res2] = await Promise.all([
        EntityCommandService.toggleChecklistItem("chk-distinct", "item-1", wsId, { source: "test" }),
        EntityCommandService.toggleChecklistItem("chk-distinct", "item-2", wsId, { source: "test" }),
      ]);

      expect(res1).not.toBeNull();
      expect(res2).not.toBeNull();

      const stored = await ChecklistRepository.getChecklist("chk-distinct", wsId);
      expect(stored).not.toBeNull();
      expect(stored!.items[0].completed).toBe(true);
      expect(stored!.items[1].completed).toBe(true);
      expect(stored!.revision).toBe(3);

      expect(await pebbleRewardCount("checklist:chk-distinct")).toBe(1);
      expect(stored!.pebbleAwarded).toBe(true);
    });

    it("concurrent item toggle vs item deletion on the same item does not resurrect deleted item", async () => {
      await ChecklistRepository.saveChecklistUnlocked(
        makeChecklist("chk-delete-race", {
          items: [
            { id: "item-del", title: "To Delete", completed: false },
            { id: "item-keep", title: "To Keep", completed: false },
          ],
        })
      );

      await Promise.all([
        EntityCommandService.deleteChecklistItem("chk-delete-race", "item-del", wsId, { source: "test" }),
        EntityCommandService.toggleChecklistItem("chk-delete-race", "item-del", wsId, { source: "test" }),
      ]);

      const stored = await ChecklistRepository.getChecklist("chk-delete-race", wsId);
      expect(stored).not.toBeNull();
      const remainingIds = stored!.items.map((i) => i.id);
      expect(remainingIds).not.toContain("item-del");
      expect(remainingIds).toContain("item-keep");
    });

    it("an item toggle against a concurrently moved checklist does not resurrect in source workspace", async () => {
      await ChecklistRepository.saveChecklistUnlocked(makeChecklist("chk-move-item"));

      await EntityCommandService.moveChecklist("chk-move-item", wsId, targetWsId, {
        skipEvents: true,
        skipAnalytics: true,
      });

      const result = await EntityCommandService.toggleChecklistItem(
        "chk-move-item",
        "item-1",
        wsId,
        { source: "test" }
      );

      expect(result).toBeNull();

      const sourceChecklists = await ChecklistRepository.getChecklists(wsId);
      expect(sourceChecklists["chk-move-item"]).toBeUndefined();

      const targetChecklists = await ChecklistRepository.getChecklists(targetWsId);
      expect(targetChecklists["chk-move-item"]).toBeDefined();
      expect(targetChecklists["chk-move-item"].items[0].completed).toBe(false);
    });

    it("an item toggle against a concurrently recycled checklist does not resurrect in active partition", async () => {
      await ChecklistRepository.saveChecklistUnlocked(makeChecklist("chk-recycle-item"));

      await EntityCommandService.recycleChecklist("chk-recycle-item", wsId, {
        skipEvents: true,
      });

      const result = await EntityCommandService.toggleChecklistItem(
        "chk-recycle-item",
        "item-1",
        wsId,
        { source: "test" }
      );

      expect(result).toBeNull();

      const active = await ChecklistRepository.getChecklists(wsId);
      expect(active["chk-recycle-item"]).toBeUndefined();

      const bin = await RecycleBinRepository.getRecycleBinItems();
      expect(bin.some((b) => b.entityId === "chk-recycle-item")).toBe(true);
    });

    it("an item toggle against a permanently deleted checklist is rejected and honors tombstones", async () => {
      await ChecklistRepository.saveChecklistUnlocked(makeChecklist("chk-perm-del-item"));

      await EntityCommandService.permanentlyDeleteChecklist("chk-perm-del-item", wsId, {
        skipEvents: true,
        skipAnalytics: true,
      });

      const result = await EntityCommandService.toggleChecklistItem(
        "chk-perm-del-item",
        "item-1",
        wsId,
        { source: "test" }
      );

      expect(result).toBeNull();

      const active = await ChecklistRepository.getChecklists(wsId);
      expect(active["chk-perm-del-item"]).toBeUndefined();

      const isTombstoned = await TombstoneRepository.isTombstoned("checklist", "chk-perm-del-item", 1);
      expect(isTombstoned).toBe(true);
    });

    it("rapid concurrent double-toggle of the same item converges cleanly without corrupting state", async () => {
      await ChecklistRepository.saveChecklistUnlocked(makeChecklist("chk-double-toggle"));

      await Promise.all([
        EntityCommandService.toggleChecklistItem("chk-double-toggle", "item-1", wsId, { source: "test" }),
        EntityCommandService.toggleChecklistItem("chk-double-toggle", "item-1", wsId, { source: "test" }),
      ]);

      const stored = await ChecklistRepository.getChecklist("chk-double-toggle", wsId);
      expect(stored).not.toBeNull();
      expect(stored!.items[0].completed).toBe(false);
      expect(stored!.revision).toBe(3);
    });

    it("re-completing an uncompleted checklist is idempotent and does not double-award pebbles", async () => {
      await ChecklistRepository.saveChecklistUnlocked(
        makeChecklist("chk-idempotent", {
          items: [{ id: "item-only", title: "Only Item", completed: false }],
        })
      );

      await EntityCommandService.toggleChecklistItem("chk-idempotent", "item-only", wsId, { source: "test" });
      expect(await pebbleRewardCount("checklist:chk-idempotent")).toBe(1);

      await EntityCommandService.toggleChecklistItem("chk-idempotent", "item-only", wsId, { source: "test" });
      const uncompleted = await ChecklistRepository.getChecklist("chk-idempotent", wsId);
      expect(uncompleted!.items[0].completed).toBe(false);

      await EntityCommandService.toggleChecklistItem("chk-idempotent", "item-only", wsId, { source: "test" });
      const recompleted = await ChecklistRepository.getChecklist("chk-idempotent", wsId);
      expect(recompleted!.items[0].completed).toBe(true);

      expect(await pebbleRewardCount("checklist:chk-idempotent")).toBe(1);
    });

    it("concurrent item toggles on the same occurrence of a recurring checklist serialize safely", async () => {
      const today = "2026-09-11";
      await ChecklistRepository.saveChecklistUnlocked(
        makeChecklist("chk-recurring-same-day", {
          recurrence: { frequency: "daily", interval: 1 },
          schedule: { date: today },
        })
      );

      const [res1, res2] = await Promise.all([
        EntityCommandService.toggleChecklistItem("chk-recurring-same-day", "item-1", wsId, today, { source: "test" }),
        EntityCommandService.toggleChecklistItem("chk-recurring-same-day", "item-2", wsId, today, { source: "test" }),
      ]);

      expect(res1).not.toBeNull();
      expect(res2).not.toBeNull();

      const stored = await ChecklistRepository.getChecklist("chk-recurring-same-day", wsId);
      expect(stored).not.toBeNull();
      const occurrence = stored!.occurrenceHistory?.[today];
      expect(occurrence?.completedItemIds?.sort()).toEqual(["item-1", "item-2"]);
      expect(occurrence?.completedAt).toBeDefined();

      expect(stored!.items.every((i) => !i.completed)).toBe(true);
      expect(stored!.revision).toBe(3);
    });

    it("concurrent item toggles across different occurrences of a recurring checklist remain strictly isolated", async () => {
      const day1 = "2026-09-11";
      const day2 = "2026-09-12";
      await ChecklistRepository.saveChecklistUnlocked(
        makeChecklist("chk-recurring-diff-days", {
          recurrence: { frequency: "daily", interval: 1 },
          schedule: { date: day1 },
        })
      );

      await Promise.all([
        EntityCommandService.toggleChecklistItem("chk-recurring-diff-days", "item-1", wsId, day1, { source: "test" }),
        EntityCommandService.toggleChecklistItem("chk-recurring-diff-days", "item-2", wsId, day2, { source: "test" }),
      ]);

      const stored = await ChecklistRepository.getChecklist("chk-recurring-diff-days", wsId);
      expect(stored).not.toBeNull();

      expect(stored!.occurrenceHistory?.[day1]?.completedItemIds).toEqual(["item-1"]);
      expect(stored!.occurrenceHistory?.[day2]?.completedItemIds).toEqual(["item-2"]);

      expect(stored!.items.every((i) => !i.completed)).toBe(true);
      expect(stored!.revision).toBe(3);
    });
  });

  // ===========================================================================
  // Hostile Verification & Stale Restore Protection
  // ===========================================================================
  describe("hostile verification & stale restore protection", () => {
    test("restoreChecklist restores fresh data even if recycle bin item changed concurrently", async () => {
      const oldSnapshot = {
        id: "check-hostile-1",
        workspaceId: wsId,
        title: "Old Title",
        items: [],
        createdAt: 1000,
        updatedAt: 1000,
      };

      await AsyncStorage.setItem(
        "pebble:v1:recycle_bin",
        JSON.stringify([
          {
            id: "rb-check-hostile-1",
            entityType: "checklist",
            entityId: "check-hostile-1",
            snapshot: JSON.stringify(oldSnapshot),
            deletedAt: 1000,
          },
        ])
      );

      let concurrentMutationDone = false;
      jest.spyOn(require("@/shared/utils/mutex"), "withLock").mockImplementation(async (key: any, fn: any) => {
        if (key === `pebble:v1:checklists:${wsId}` && !concurrentMutationDone) {
          concurrentMutationDone = true;
          const newSnapshot = {
            ...oldSnapshot,
            title: "New Title",
            updatedAt: 2000,
          };
          await AsyncStorage.setItem(
            "pebble:v1:recycle_bin",
            JSON.stringify([
              {
                id: "rb-check-hostile-1",
                entityType: "checklist",
                entityId: "check-hostile-1",
                snapshot: JSON.stringify(newSnapshot),
                deletedAt: 2000,
              },
            ])
          );
        }
        return fn();
      });

      const result = await ChecklistCommandHandler.restoreChecklist("rb-check-hostile-1", {
        skipEvents: true,
        skipAnalytics: true,
      });

      expect(result.title).toBe("New Title");

      const stored = await ChecklistRepository.getChecklist("check-hostile-1", wsId);
      expect(stored?.title).toBe("New Title");

      jest.spyOn(require("@/shared/utils/mutex"), "withLock").mockRestore();
    });
  });
});
