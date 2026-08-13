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
      items: [
        { id: "item-1", title: "Passport", completed: false },
      ],
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
});
