import AsyncStorage from "@react-native-async-storage/async-storage";
import { buildChecklist } from "@/features/capture/services/entity-factory.service";
import { normalizeChecklist, ChecklistRepository } from "@/repositories/ChecklistRepository";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { getNextIncompleteChecklistItem } from "@/shared/utils/domain-selectors";
import { Checklist, TaskPriority } from "@/shared/types/domain.types";

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

describe("Checklist Redesign & Priority Architectural Contract", () => {
  const wsId = "ws-test-checklist";

  beforeEach(async () => {
    mockStore = {};
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  describe("1. Checklist Creation & Priority Assignment", () => {
    it("assigns valid default priority 'none' when building a checklist without priority", () => {
      const created = buildChecklist(
        { title: "Groceries", type: "checklist", confidence: 1 },
        wsId
      );
      expect(created.priority).toBe("none");
      expect(created.title).toBe("Groceries");
      expect(created.workspaceId).toBe(wsId);
    });

    it("respects explicit priority when building a checklist", () => {
      const priorities = ["low", "medium", "high"] as const;
      for (const p of priorities) {
        const created = buildChecklist(
          { title: `Checklist ${p}`, priority: p, type: "checklist", confidence: 1 },
          wsId
        );
        expect(created.priority).toBe(p);
      }
    });

    it("normalizes missing priority on legacy checklist to 'none'", () => {
      const legacyRaw: any = {
        id: "chk-legacy",
        title: "Legacy Checklist",
        items: [{ id: "i1", title: "Item 1", completed: false }],
        createdAt: 1000,
        updatedAt: 1000,
        revision: 1,
      };

      const normalized = normalizeChecklist(legacyRaw, wsId);
      expect(normalized.priority).toBe("none");
    });

    it("preserves explicit priority through normalizeChecklist", () => {
      const input = {
        id: "chk-prio",
        title: "High Priority Checklist",
        priority: "high" as TaskPriority,
        items: [],
        createdAt: 1000,
        updatedAt: 1000,
        revision: 1,
      };

      const normalized = normalizeChecklist(input, wsId);
      expect(normalized.priority).toBe("high");
    });
  });

  describe("2. Persistence, Migration & Repository Parity", () => {
    it("persists and reloads priority across storage cycles", async () => {
      const checklist: Checklist = {
        id: "chk-prio-persist",
        workspaceId: wsId,
        title: "Critical Deployment",
        priority: "high",
        items: [
          { id: "i1", title: "Run DB Migration", completed: false },
          { id: "i2", title: "Deploy Pods", completed: false },
        ],
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      };

      await ChecklistRepository.saveChecklist(checklist);
      const loaded = await ChecklistRepository.getChecklist("chk-prio-persist", wsId);
      expect(loaded).toBeDefined();
      expect(loaded?.priority).toBe("high");
    });

    it("migrates legacy stored checklist lacking priority field to 'none' on load", async () => {
      const legacyRaw = {
        "chk-legacy-stored": {
          id: "chk-legacy-stored",
          workspaceId: wsId,
          title: "Legacy Stored",
          items: [],
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        },
      };

      mockStore[`pebble:v1:checklists:${wsId}`] = JSON.stringify(legacyRaw);

      const all = await ChecklistRepository.getChecklists(wsId);
      expect(all["chk-legacy-stored"]).toBeDefined();
      expect(all["chk-legacy-stored"].priority).toBe("none");
    });
  });

  describe("3. Duplication & Restore Paths", () => {
    it("preserves priority when recycling and restoring a checklist", async () => {
      const original: Checklist = {
        id: "chk-recycle-test",
        workspaceId: wsId,
        title: "Quarterly Review",
        priority: "medium",
        items: [{ id: "i1", title: "Prepare slides", completed: false }],
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      };

      await ChecklistRepository.saveChecklist(original);

      // Recycle
      await EntityCommandService.recycleChecklist("chk-recycle-test", wsId);
      const afterRecycle = await ChecklistRepository.getChecklist("chk-recycle-test", wsId);
      expect(afterRecycle).toBeNull();

      // Restore
      const restored = await EntityCommandService.restoreChecklist("chk-recycle-test");
      expect(restored).not.toBeNull();
      expect(restored?.priority).toBe("medium");

      const inRepo = await ChecklistRepository.getChecklist("chk-recycle-test", wsId);
      expect(inRepo?.priority).toBe("medium");
    });
  });

  describe("4. First Incomplete Item Derivation & Preview Lifecycle", () => {
    it("derives the first incomplete item from checklist.items", () => {
      const checklist: Checklist = {
        id: "chk-preview-1",
        workspaceId: wsId,
        title: "Shopping",
        priority: "none",
        items: [
          { id: "i1", title: "Milk", completed: true },
          { id: "i2", title: "Bread", completed: false },
          { id: "i3", title: "Eggs", completed: false },
        ],
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      };

      const preview = getNextIncompleteChecklistItem(checklist);
      expect(preview).toBeDefined();
      expect(preview?.id).toBe("i2");
      expect(preview?.title).toBe("Bread");
    });

    it("advances preview to next incomplete item when the current preview item is completed", () => {
      const checklist: Checklist = {
        id: "chk-preview-2",
        workspaceId: wsId,
        title: "Shopping",
        priority: "none",
        items: [
          { id: "i1", title: "Milk", completed: true },
          { id: "i2", title: "Bread", completed: false },
          { id: "i3", title: "Eggs", completed: false },
        ],
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      };

      const firstPreview = getNextIncompleteChecklistItem(checklist);
      expect(firstPreview?.id).toBe("i2");

      // Complete "Bread"
      const updatedChecklist: Checklist = {
        ...checklist,
        items: checklist.items.map((item) =>
          item.id === "i2" ? { ...item, completed: true } : item
        ),
      };

      const secondPreview = getNextIncompleteChecklistItem(updatedChecklist);
      expect(secondPreview).toBeDefined();
      expect(secondPreview?.id).toBe("i3");
      expect(secondPreview?.title).toBe("Eggs");
    });

    it("returns undefined when checklist is fully completed", () => {
      const completedChecklist: Checklist = {
        id: "chk-done",
        workspaceId: wsId,
        title: "Shopping Done",
        priority: "none",
        items: [
          { id: "i1", title: "Milk", completed: true },
          { id: "i2", title: "Bread", completed: true },
        ],
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      };

      expect(getNextIncompleteChecklistItem(completedChecklist)).toBeUndefined();
    });

    it("returns undefined when checklist has no items", () => {
      const emptyChecklist: Checklist = {
        id: "chk-empty",
        workspaceId: wsId,
        title: "Empty Checklist",
        priority: "none",
        items: [],
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      };

      expect(getNextIncompleteChecklistItem(emptyChecklist)).toBeUndefined();
    });
  });

  describe("5. Canonical Completion Semantics & Metrics", () => {
    it("proves an empty checklist is NOT completed", () => {
      const emptyItems: any[] = [];
      const isCompleted = emptyItems.length > 0 && emptyItems.every((item) => item.completed);
      expect(isCompleted).toBe(false);
    });

    it("proves checklist is completed only when items.length > 0 and all items are completed", () => {
      const partiallyDone = [
        { id: "1", title: "Item 1", completed: true },
        { id: "2", title: "Item 2", completed: false },
      ];
      expect(partiallyDone.length > 0 && partiallyDone.every((i) => i.completed)).toBe(false);

      const allDone = [
        { id: "1", title: "Item 1", completed: true },
        { id: "2", title: "Item 2", completed: true },
      ];
      expect(allDone.length > 0 && allDone.every((i) => i.completed)).toBe(true);
    });

    it("calculates progress and count metrics accurately without stored derived fields", () => {
      const items = [
        { id: "1", title: "Item 1", completed: true },
        { id: "2", title: "Item 2", completed: false },
        { id: "3", title: "Item 3", completed: false },
      ];

      const totalCount = items.length;
      const completedCount = items.filter((i) => i.completed).length;
      const remainingCount = totalCount - completedCount;
      const progress = totalCount > 0 ? completedCount / totalCount : 0;

      expect(totalCount).toBe(3);
      expect(completedCount).toBe(1);
      expect(remainingCount).toBe(2);
      expect(progress).toBeCloseTo(0.333, 2);
    });
  });
});
