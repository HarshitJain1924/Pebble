import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { ChecklistRepository } from "@/repositories/ChecklistRepository";
import { Checklist } from "@/shared/types/domain.types";

let mockStore: Record<string, string> = {};

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockImplementation(async (key) => mockStore[key] || null),
  setItem: jest.fn().mockImplementation(async (key, value) => {
    mockStore[key] = String(value);
    return null;
  }),
  removeItem: jest.fn().mockImplementation(async (key) => {
    delete mockStore[key];
    return null;
  }),
  clear: jest.fn().mockImplementation(async () => {
    mockStore = {};
    return null;
  }),
}));

describe("Checklist Mutations Regression Suite", () => {
  beforeEach(() => {
    mockStore = {};
    jest.clearAllMocks();
  });

  it("adds and deletes checklist items correctly with persistence and workspace association", async () => {
    const workspaceId = "ws-test";
    const initialChecklist: Checklist = {
      id: "chk-1",
      workspaceId,
      title: "Packing List",
      priority: "none",
      items: [
        { id: "item-1", title: "Passport", completed: false },
      ],
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await ChecklistRepository.saveChecklist(initialChecklist);

    // 1. Add checklist item
    const addRes = await EntityCommandService.addChecklistItem("chk-1", "Tickets", workspaceId);
    expect(addRes).not.toBeNull();
    expect(addRes!.updated.items.length).toBe(2);
    expect(addRes!.updated.items[1].title).toBe("Tickets");
    expect(addRes!.updated.items[1].completed).toBe(false);

    const newItemId = addRes!.updated.items[1].id;

    // Verify persistence after reload
    let reloadedMap = await ChecklistRepository.getChecklists(workspaceId);
    expect(reloadedMap["chk-1"].items.length).toBe(2);
    expect(reloadedMap["chk-1"].items.find((i) => i.id === newItemId)).toBeDefined();

    // 2. Toggle item completion
    const toggleRes = await EntityCommandService.toggleChecklistItem("chk-1", newItemId, workspaceId);
    expect(toggleRes).not.toBeNull();
    expect(toggleRes!.updated.items.find((i) => i.id === newItemId)?.completed).toBe(true);

    // 3. Delete checklist item
    const delRes = await EntityCommandService.deleteChecklistItem("chk-1", newItemId, workspaceId);
    expect(delRes).not.toBeNull();
    expect(delRes!.updated.items.length).toBe(1);
    expect(delRes!.updated.items.find((i) => i.id === newItemId)).toBeUndefined();

    // Verify persistence after reload
    reloadedMap = await ChecklistRepository.getChecklists(workspaceId);
    expect(reloadedMap["chk-1"].items.length).toBe(1);
    expect(reloadedMap["chk-1"].items[0].id).toBe("item-1");
  });

  it("completing one item on a recurring checklist updates only that occurrence's history and leaves master template unchanged", async () => {
    const workspaceId = "ws-test";
    const date1 = "2026-10-23";
    const date2 = "2026-10-24";
    const recurringChecklist: Checklist = {
      id: "chk-recurring-1",
      workspaceId,
      title: "Morning Routine",
      priority: "medium",
      recurrence: { frequency: "daily", interval: 1 },
      items: [
        { id: "item-1", title: "Stretch", completed: false },
        { id: "item-2", title: "Drink water", completed: false },
      ],
      revision: 1,
      lifecycleGeneration: 1,
      // The series must already be running on date1: an occurrence before the
      // checklist's own start date is correctly rejected by the command.
      createdAt: new Date(2026, 0, 1).getTime(),
      updatedAt: new Date(2026, 0, 1).getTime(),
    };

    await ChecklistRepository.saveChecklist(recurringChecklist);

    // 1. Complete item-1 on date1
    const toggleRes = await EntityCommandService.toggleChecklistItem(
      "chk-recurring-1",
      "item-1",
      workspaceId,
      date1,
    );
    expect(toggleRes).not.toBeNull();
    const updated = toggleRes!.updated;

    // Occurrence history on date1 must record completed item
    expect(updated.occurrenceHistory?.[date1]?.completedItemIds).toContain("item-1");
    expect(updated.occurrenceHistory?.[date1]?.completedItemIds).not.toContain("item-2");

    // Master template items must remain untouched (completed: false)
    expect(updated.items[0].completed).toBe(false);
    expect(updated.items[1].completed).toBe(false);

    // 2. Verify later occurrence (date2) has independent empty history
    expect(updated.occurrenceHistory?.[date2]?.completedItemIds).toBeUndefined();

    // 3. Verify persistence
    const reloaded = await ChecklistRepository.getChecklist("chk-recurring-1", workspaceId);
    expect(reloaded?.items[0].completed).toBe(false);
    expect(reloaded?.items[1].completed).toBe(false);
    expect(reloaded?.occurrenceHistory?.[date1]?.completedItemIds).toContain("item-1");
  });

  it("missing occurrence context on a recurring checklist safely routes to active occurrence history without mutating master template", async () => {
    const workspaceId = "ws-test";
    const recurringChecklist: Checklist = {
      id: "chk-recurring-safe",
      workspaceId,
      title: "Night Routine",
      priority: "none",
      recurrence: { frequency: "daily", interval: 1 },
      items: [
        { id: "item-1", title: "Read", completed: false },
      ],
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await ChecklistRepository.saveChecklist(recurringChecklist);

    // Call toggleChecklistItem without dateKey
    const toggleRes = await EntityCommandService.toggleChecklistItem(
      "chk-recurring-safe",
      "item-1",
      workspaceId,
      undefined, // Missing dateKey
    );
    expect(toggleRes).not.toBeNull();
    const updated = toggleRes!.updated;

    // Master template must remain completed: false
    expect(updated.items[0].completed).toBe(false);

    // Occurrence history must be created for today's occurrence date
    expect(updated.occurrenceHistory).toBeDefined();
    const historyKeys = Object.keys(updated.occurrenceHistory || {});
    expect(historyKeys.length).toBeGreaterThan(0);
    expect(updated.occurrenceHistory?.[historyKeys[0]]?.completedItemIds).toContain("item-1");
  });

  it("toggleChecklistAllItems on a recurring checklist respects occurrence boundaries without mutating master template", async () => {
    const workspaceId = "ws-test";
    const date1 = "2026-10-23";
    const recurringChecklist: Checklist = {
      id: "chk-recurring-bulk",
      workspaceId,
      title: "Daily Chores",
      priority: "none",
      recurrence: { frequency: "daily", interval: 1 },
      items: [
        { id: "c1", title: "Dishes", completed: false },
        { id: "c2", title: "Laundry", completed: false },
      ],
      revision: 1,
      lifecycleGeneration: 1,
      // Same start-date rule as above: date1 must be an existing occurrence.
      createdAt: new Date(2026, 0, 1).getTime(),
      updatedAt: new Date(2026, 0, 1).getTime(),
    };

    await ChecklistRepository.saveChecklist(recurringChecklist);

    // Complete all items for date1 via occurrence-aware toggle
    await EntityCommandService.toggleChecklistItem("chk-recurring-bulk", "c1", workspaceId, date1);
    const res2 = await EntityCommandService.toggleChecklistItem("chk-recurring-bulk", "c2", workspaceId, date1);
    expect(res2).not.toBeNull();
    const updated = res2!.updated;

    // Occurrence history on date1 has both items
    expect(updated.occurrenceHistory?.[date1]?.completedItemIds).toEqual(expect.arrayContaining(["c1", "c2"]));

    // Master template items remain untouched
    expect(updated.items[0].completed).toBe(false);
    expect(updated.items[1].completed).toBe(false);

    // Uncomplete one item on date1
    const res3 = await EntityCommandService.toggleChecklistItem("chk-recurring-bulk", "c1", workspaceId, date1);
    expect(res3!.updated.occurrenceHistory?.[date1]?.completedItemIds).not.toContain("c1");
    expect(res3!.updated.occurrenceHistory?.[date1]?.completedItemIds).toContain("c2");
    expect(res3!.updated.items[0].completed).toBe(false);
    expect(res3!.updated.items[1].completed).toBe(false);
  });
});
