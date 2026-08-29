jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  normalizeTitle,
  extractKeywords,
  analyzeDuplicateAgainstEntities,
  analyzeDuplicate,
  type DuplicateAnalysisResult,
  type AnyEntity,
} from "@/features/capture/services/duplicate-detection.service";
import {
  parseProductivityText,
  type ParsedProductivityItem,
} from "@/features/capture/services/nlp-parser.service";
import { TaskRepository } from "@/repositories/TaskRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { type Task, type Habit, type Checklist, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";

describe("DuplicateDetectionService", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  describe("Normalization and Keyword Extraction", () => {
    it("normalizes case, punctuation, and whitespace uniformly", () => {
      expect(normalizeTitle("Buy Milk")).toBe("buy milk");
      expect(normalizeTitle("buy milk")).toBe("buy milk");
      expect(normalizeTitle("BUY MILK!")).toBe("buy milk");
      expect(normalizeTitle("  Buy    milk...  ")).toBe("buy milk");
      expect(normalizeTitle("Finish report???")).toBe("finish report");
    });

    it("extracts core keywords while stripping stop words and temporal words", () => {
      expect(extractKeywords("Buy groceries")).toEqual(["buy", "groceries"]);
      expect(extractKeywords("Buy groceries tomorrow")).toEqual(["buy", "groceries"]);
      expect(extractKeywords("Buy groceries for Sunday dinner")).toEqual(["buy", "groceries", "sunday", "dinner"]);
    });
  });

  describe("Matching Hierarchy — In-Memory Suite", () => {
    const existingTask: Task = {
      id: "task-1",
      title: "Buy milk",
      workspaceId: "ws-personal",
      status: "todo",
      priority: "medium",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    it("1. Exact normalized title produces a strong duplicate result (confidence 1.0)", () => {
      const candidates = ["Buy milk", "buy milk", "BUY MILK!", "  Buy milk... "];

      for (const input of candidates) {
        const parsed = parseProductivityText(input);
        const result = analyzeDuplicateAgainstEntities(parsed, "ws-personal", [existingTask]);

        expect(result.isPotentialDuplicate).toBe(true);
        expect(result.relationship).toBe("exact_duplicate");
        expect(result.confidence).toBe(1.0);
        expect(result.matchedEntity?.id).toBe("task-1");
      }
    });

    it("2. Near duplicates (same core keywords + temporal modifier) produce medium-high confidence", () => {
      const parsed = parseProductivityText("Buy milk tomorrow");
      const result = analyzeDuplicateAgainstEntities(parsed, "ws-personal", [existingTask]);

      expect(result.isPotentialDuplicate).toBe(true);
      expect(result.relationship).toBe("near_duplicate");
      expect(result.confidence).toBe(0.75);
      expect(result.matchedEntity?.id).toBe("task-1");
    });

    it("3. Different tasks with overlapping words are not treated as duplicates", () => {
      const existingGroceries: Task = {
        id: "task-2",
        title: "Buy groceries",
        workspaceId: "ws-personal",
        status: "todo",
        priority: "medium",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      };

      const parsed = parseProductivityText("Buy groceries for Sunday dinner");
      const result = analyzeDuplicateAgainstEntities(parsed, "ws-personal", [existingGroceries]);

      expect(result.isPotentialDuplicate).toBe(false);
      expect(result.relationship).toBe("related_different");
      expect(result.confidence).toBeLessThan(0.5);
    });

    it("4. Task vs Habit is classified as a habit conversion opportunity, not an exact duplicate", () => {
      const existingExercise: Task = {
        id: "task-3",
        title: "Exercise",
        workspaceId: "ws-health",
        status: "todo",
        priority: "medium",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      };

      const parsedHabit = parseProductivityText("Exercise every morning");
      const result = analyzeDuplicateAgainstEntities(parsedHabit, "ws-health", [existingExercise]);

      expect(result.isPotentialDuplicate).toBe(false);
      expect(result.relationship).toBe("habit_conversion_candidate");
      expect(result.matchedEntity?.id).toBe("task-3");
    });

    it("5. Workspace isolation: Same title in different workspace has reduced duplicate confidence", () => {
      const parsed = parseProductivityText("Buy milk");
      // Target workspace is ws-work, existing task is in ws-personal
      const result = analyzeDuplicateAgainstEntities(parsed, "ws-work", [existingTask]);

      expect(result.isPotentialDuplicate).toBe(true);
      expect(result.relationship).toBe("exact_duplicate");
      expect(result.confidence).toBe(0.50); // Lower confidence due to different workspace
      expect(result.matchedEntity?.workspaceId).toBe("ws-personal");
    });

    it("6. Multiple candidates: returns the strongest match deterministically", () => {
      const entities: Task[] = [
        {
          id: "task-diff-ws",
          title: "Buy milk",
          workspaceId: "ws-other",
          status: "todo",
          priority: "medium",
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 500,
          updatedAt: 500,
        },
        {
          id: "task-near",
          title: "Buy milk today",
          workspaceId: "ws-personal",
          status: "todo",
          priority: "medium",
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 800,
          updatedAt: 800,
        },
        {
          id: "task-exact-same-ws",
          title: "Buy milk",
          workspaceId: "ws-personal",
          status: "todo",
          priority: "medium",
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ];

      const parsed = parseProductivityText("Buy milk");
      const result = analyzeDuplicateAgainstEntities(parsed, "ws-personal", entities);

      expect(result.matchedEntity?.id).toBe("task-exact-same-ws");
      expect(result.confidence).toBe(1.0);
      expect(result.relationship).toBe("exact_duplicate");
    });
  });

  describe("Checklist Merge Detection", () => {
    it("identifies a merge_candidate when a checklist has overlapping and new items", () => {
      const entities: AnyEntity[] = [
        {
          id: "checklist-1",
          type: "checklist",
          title: "Shopping",
          workspaceId: "ws-1",
          items: [{ id: "i1", title: "milk", completed: false }, { id: "i2", title: "bread", completed: false }],
          createdAt: 1000,
          updatedAt: 1000,
        } as unknown as Checklist,
      ];

      const parsed: ParsedProductivityItem = {
        title: "Shopping",
        type: "checklist",
        items: ["milk", "bread", "curd"],
        confidence: 0.9,
      };

      const result = analyzeDuplicateAgainstEntities(parsed, "ws-1", entities);

      expect(result.matchedEntity?.id).toBe("checklist-1");
      expect(result.relationship).toBe("merge_candidate");
      expect(result.overlappingItems).toContain("milk");
      expect(result.overlappingItems).toContain("bread");
      expect(result.newItems).toContain("curd");
    });

    it("identifies an exact_duplicate when a checklist has only overlapping items", () => {
      const entities: AnyEntity[] = [
        {
          id: "checklist-2",
          type: "checklist",
          title: "Groceries",
          workspaceId: "ws-1",
          items: [{ id: "i1", title: "milk", completed: false }, { id: "i2", title: "bread", completed: false }],
          createdAt: 1000,
          updatedAt: 1000,
        } as unknown as Checklist,
      ];

      const parsed: ParsedProductivityItem = {
        title: "Groceries",
        type: "checklist",
        items: ["milk", "bread"],
        confidence: 0.9,
      };

      const result = analyzeDuplicateAgainstEntities(parsed, "ws-1", entities);

      expect(result.matchedEntity?.id).toBe("checklist-2");
      expect(result.relationship).toBe("exact_duplicate");
    });

    it("returns null when a checklist has same title but zero overlapping items", () => {
      const entities: AnyEntity[] = [
        {
          id: "checklist-3",
          type: "checklist",
          title: "Packing",
          workspaceId: "ws-1",
          items: [{ id: "i1", title: "shirts", completed: false }, { id: "i2", title: "pants", completed: false }],
          createdAt: 1000,
          updatedAt: 1000,
        } as unknown as Checklist,
      ];

      const parsed: ParsedProductivityItem = {
        title: "Packing",
        type: "checklist",
        items: ["shoes", "socks"],
        confidence: 0.9,
      };

      const result = analyzeDuplicateAgainstEntities(parsed, "ws-1", entities);

      expect(result.isPotentialDuplicate).toBe(false);
    });
  });

  describe("Repository & Persistence Integration", () => {
    it("reads persisted entities from AsyncStorage through TaskRepository", async () => {
      const persistedTask: Task = {
        id: "task-persisted-1",
        title: "Call dentist",
        workspaceId: INBOX_WORKSPACE_ID,
        status: "todo",
        priority: "medium",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 2000,
        updatedAt: 2000,
      };

      await TaskRepository.saveTask(persistedTask);

      const parsed = parseProductivityText("call dentist");
      const result = await analyzeDuplicate(parsed, INBOX_WORKSPACE_ID);

      expect(result.isPotentialDuplicate).toBe(true);
      expect(result.confidence).toBe(1.0);
      expect(result.matchedEntity?.id).toBe("task-persisted-1");
    });

    it("guarantees read-only behavior — analysis never modifies repository data", async () => {
      const initialTask: Task = {
        id: "task-readonly-1",
        title: "Submit report",
        workspaceId: "ws-work",
        status: "todo",
        priority: "high",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 3000,
        updatedAt: 3000,
      };

      await TaskRepository.saveTask(initialTask);
      const rawBefore = await AsyncStorage.getItem("pebble:v1:tasks:ws-work");

      const parsed = parseProductivityText("Submit report");
      const result = await analyzeDuplicate(parsed, "ws-work");

      expect(result.isPotentialDuplicate).toBe(true);

      const rawAfter = await AsyncStorage.getItem("pebble:v1:tasks:ws-work");
      expect(rawAfter).toBe(rawBefore);
    });
  });
});
