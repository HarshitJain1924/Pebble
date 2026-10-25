jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseProductivityText, type ParsedProductivityItem } from "@/features/capture/services/nlp-parser.service";
import {
  saveParsedItem,
  validateCaptureItem,
  mergeParsedChecklist,
} from "@/features/capture/services/CaptureService";
import {
  analyzeDuplicate,
  analyzeDuplicateAgainstEntities,
} from "@/features/capture/services/duplicate-detection.service";
import { TaskRepository } from "@/repositories/TaskRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { ChecklistRepository } from "@/repositories/ChecklistRepository";
import { ResourceRepository } from "@/repositories/ResourceRepository";
import { type Task, type Habit, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";

describe("Quick Capture Duplicate Detection & Navigation Integration", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("1. Exact same task twice: second save is intercepted by duplicate detection", async () => {
    const item1 = parseProductivityText("Buy milk");
    const task1 = await saveParsedItem(item1, INBOX_WORKSPACE_ID);
    expect(task1.id).toBeDefined();

    // Now validate second identical capture item
    const item2 = parseProductivityText("buy milk");
    const duplicateResult = await validateCaptureItem(item2, INBOX_WORKSPACE_ID);

    expect(duplicateResult.isPotentialDuplicate).toBe(true);
    expect(duplicateResult.relationship).toBe("exact_duplicate");
    expect(duplicateResult.confidence).toBe(1.0);
    expect(duplicateResult.matchedEntity?.id).toBe(task1.id);
  });

  it("2. User chooses 'Create anyway': second task is created intentionally", async () => {
    const item1 = parseProductivityText("Buy milk");
    const task1 = await saveParsedItem(item1, INBOX_WORKSPACE_ID);

    // Second task saved with explicit bypass
    const item2 = parseProductivityText("Buy milk");
    const task2 = await saveParsedItem(item2, INBOX_WORKSPACE_ID, {
      bypassDuplicateCheck: true,
    });

    expect(task2.id).toBeDefined();
    expect(task2.id).not.toBe(task1.id);

    const tasksMap = await TaskRepository.getTasks(INBOX_WORKSPACE_ID);
    expect(Object.keys(tasksMap)).toHaveLength(2);
    expect(tasksMap[task1.id].title).toBe("Buy milk");
    expect(tasksMap[task2.id].title).toBe("Buy milk");
  });

  it("3. User chooses 'Use existing': no second entity is created", async () => {
    const item1 = parseProductivityText("Call John");
    const task1 = await saveParsedItem(item1, INBOX_WORKSPACE_ID);

    // Duplicate check intercepts
    const item2 = parseProductivityText("Call John");
    const duplicateResult = await validateCaptureItem(item2, INBOX_WORKSPACE_ID);
    expect(duplicateResult.isPotentialDuplicate).toBe(true);

    // User chooses to use existing (no save call is made)
    const tasksMap = await TaskRepository.getTasks(INBOX_WORKSPACE_ID);
    expect(Object.keys(tasksMap)).toHaveLength(1);
    expect(tasksMap[task1.id].title).toBe("Call John");
  });

  it("4. Near duplicate: soft warning/suggestion but creation remains available", async () => {
    const item1 = parseProductivityText("Buy milk");
    await saveParsedItem(item1, INBOX_WORKSPACE_ID);

    const item2 = parseProductivityText("Buy milk tomorrow");
    const duplicateResult = await validateCaptureItem(item2, INBOX_WORKSPACE_ID);

    expect(duplicateResult.relationship).toBe("near_duplicate");
    expect(duplicateResult.confidence).toBe(0.75);

    // Save proceeds cleanly
    const task2 = await saveParsedItem(item2, INBOX_WORKSPACE_ID);
    expect(task2.id).toBeDefined();

    const tasksMap = await TaskRepository.getTasks(INBOX_WORKSPACE_ID);
    expect(Object.keys(tasksMap)).toHaveLength(2);
  });

  it("5. Different workspace: does not block creation in target workspace", async () => {
    const itemPersonal = parseProductivityText("Submit quarterly report");
    await saveParsedItem(itemPersonal, "ws-personal");

    // Same task title in ws-work
    const itemWork = parseProductivityText("Submit quarterly report");
    const duplicateResult = await validateCaptureItem(itemWork, "ws-work");

    // Same workspace has no duplicate
    expect(duplicateResult.isPotentialDuplicate).toBe(false);

    // Creation proceeds without interference
    const taskWork = await saveParsedItem(itemWork, "ws-work");
    expect(taskWork.id).toBeDefined();
    expect(taskWork.workspaceId).toBe("ws-work");

    const workTasks = await TaskRepository.getTasks("ws-work");
    expect(Object.keys(workTasks)).toHaveLength(1);
  });

  it("6. Task vs Habit conversion candidate: not treated as exact duplicate", async () => {
    const taskItem = parseProductivityText("Exercise");
    const existingTask = await saveParsedItem(taskItem, "ws-health");

    const habitItem = parseProductivityText("Exercise every morning");
    const duplicateResult = await validateCaptureItem(habitItem, "ws-health");

    expect(duplicateResult.isPotentialDuplicate).toBe(false);
    expect(duplicateResult.relationship).toBe("habit_conversion_candidate");
    expect(duplicateResult.matchedEntity?.id).toBe(existingTask.id);

    // Habit creation is allowed
    const savedHabit = await saveParsedItem(habitItem, "ws-health");
    expect(savedHabit.id).toMatch(/^habit-/);

    const habitsMap = await HabitRepository.getHabits("ws-health");
    expect(Object.keys(habitsMap)).toHaveLength(1);
  });

  it("7. Checklist duplicates behave according to duplicate service contract", async () => {
    const list1 = parseProductivityText("Groceries\n- milk\n- bread\n- eggs");
    const savedList1 = await saveParsedItem(list1, INBOX_WORKSPACE_ID);

    const list2 = parseProductivityText("Groceries\n- milk\n- bread\n- eggs");
    const duplicateResult = await validateCaptureItem(list2, INBOX_WORKSPACE_ID);

    expect(duplicateResult.isPotentialDuplicate).toBe(true);
    expect(duplicateResult.relationship).toBe("exact_duplicate");
    expect(duplicateResult.matchedEntity?.id).toBe(savedList1.id);
  });

  it("8. Resource/note/link captures are not incorrectly blocked by task duplicates", async () => {
    const taskItem = parseProductivityText("React Native Architecture");
    await saveParsedItem(taskItem, INBOX_WORKSPACE_ID);

    // A note about React Native Architecture
    const noteItem = parseProductivityText("Notes on React Native Architecture");
    expect(noteItem.type).toBe("note");

    const duplicateResult = await validateCaptureItem(noteItem, INBOX_WORKSPACE_ID);
    // Even if lexical overlap exists, it is classified as a distinct resource / not exact task duplicate
    expect(duplicateResult.relationship).not.toBe("exact_duplicate");

    const savedResource = await saveParsedItem(noteItem, INBOX_WORKSPACE_ID);
    expect(savedResource.id).toMatch(/^res-/);
  });

  it("9. Duplicate detection failure does not prevent normal capture (resilient fallback)", async () => {
    const item = parseProductivityText("Dentist appointment tomorrow");

    // Force error in duplicate detection
    jest.spyOn(TaskRepository, "getTasks").mockRejectedValueOnce(new Error("Storage unavailable"));

    // validateCaptureItem falls back safely without throwing
    const duplicateResult = await validateCaptureItem(item, INBOX_WORKSPACE_ID);
    expect(duplicateResult.isPotentialDuplicate).toBe(false);

    // saveParsedItem still succeeds
    const saved = await saveParsedItem(item, INBOX_WORKSPACE_ID);
    expect(saved.id).toBeDefined();
  });

  describe("Use Existing UX & Focus Contract for every Entity Type", () => {
    it("10. Task: 'Use existing' targets task-details with type: 'task' and finds existing task", async () => {
      const taskItem = parseProductivityText("Study Kubernetes");
      const existingTask = await saveParsedItem(taskItem, "ws-dev");
      expect(existingTask.id).toMatch(/^task-/);

      // Attempt duplicate capture
      const duplicateItem = parseProductivityText("study kubernetes");
      const dupCheck = await validateCaptureItem(duplicateItem, "ws-dev");

      expect(dupCheck.isPotentialDuplicate).toBe(true);
      expect(dupCheck.matchedEntity?.type).toBe("task");
      expect(dupCheck.matchedEntity?.id).toBe(existingTask.id);

      // Verify the task exists in TaskRepository and is retrievable
      const taskInRepo = await TaskRepository.getTask(dupCheck.matchedEntity!.id, "ws-dev");
      expect(taskInRepo).not.toBeNull();
      expect(taskInRepo?.title).toBe("Study Kubernetes");

      // Verify it does NOT exist in HabitRepository (preventing false habit lookup)
      const habitInRepo = await HabitRepository.getHabit(dupCheck.matchedEntity!.id, "ws-dev");
      expect(habitInRepo).toBeNull();
    });

    it("11. Habit: 'Use existing' targets task-details with type: 'habit' and finds existing habit", async () => {
      const habitItem = parseProductivityText("Meditate every morning");
      const existingHabit = await saveParsedItem(habitItem, "ws-wellness");
      expect(existingHabit.id).toMatch(/^habit-/);

      // Attempt duplicate capture
      const duplicateHabit = parseProductivityText("meditate every morning");
      const dupCheck = await validateCaptureItem(duplicateHabit, "ws-wellness");

      expect(dupCheck.isPotentialDuplicate).toBe(true);
      expect(dupCheck.matchedEntity?.type).toBe("habit");
      expect(dupCheck.matchedEntity?.id).toBe(existingHabit.id);

      // Verify habit is in HabitRepository
      const habitInRepo = await HabitRepository.getHabit(dupCheck.matchedEntity!.id, "ws-wellness");
      expect(habitInRepo).not.toBeNull();
      expect(habitInRepo?.title).toBe("Meditate");
    });

    it("12. Checklist: 'Use existing' targets checklist-details and finds existing checklist", async () => {
      const listInput = parseProductivityText("Weekend Packing\n- clothes\n- toothbrush\n- charger");
      const existingList = await saveParsedItem(listInput, "ws-travel");
      expect(existingList.id).toMatch(/^checklist-/);

      // Attempt duplicate capture
      const duplicateList = parseProductivityText("Weekend Packing\n- clothes\n- toothbrush\n- charger");
      const dupCheck = await validateCaptureItem(duplicateList, "ws-travel");

      expect(dupCheck.isPotentialDuplicate).toBe(true);
      expect(dupCheck.matchedEntity?.type).toBe("checklist");
      expect(dupCheck.matchedEntity?.id).toBe(existingList.id);

      // Verify checklist is in ChecklistRepository
      const listInRepo = await ChecklistRepository.getChecklist(dupCheck.matchedEntity!.id, "ws-travel");
      expect(listInRepo).not.toBeNull();
      expect(listInRepo?.title).toBe("Weekend Packing");
      expect(listInRepo?.items).toHaveLength(3);
    });

    it("13. Resource: 'Use existing' targets workspace resources segment and finds existing resource", async () => {
      const linkInput = parseProductivityText("https://docs.expo.dev");
      const existingResource = await saveParsedItem(linkInput, "ws-dev");
      expect(existingResource.id).toMatch(/^res-/);

      // Attempt duplicate capture
      const duplicateLink = parseProductivityText("https://docs.expo.dev");
      const dupCheck = await validateCaptureItem(duplicateLink, "ws-dev");

      expect(dupCheck.isPotentialDuplicate).toBe(true);
      expect(dupCheck.matchedEntity?.type).toBe("resource");
      expect(dupCheck.matchedEntity?.id).toBe(existingResource.id);

      // Verify resource is in ResourceRepository
      const resInRepo = await ResourceRepository.getResource(dupCheck.matchedEntity!.id, "ws-dev");
      expect(resInRepo).not.toBeNull();
      expect(resInRepo?.title).toBe("docs.expo.dev");
    });

    it("14. Checklist: Detects merge_candidate with overlapping and new items, and successfully merges items into existing list", async () => {
      // 1. Existing checklist: "shopping\nmilk\nbread"
      const initialInput = parseProductivityText("shopping\nmilk\nbread");
      expect(initialInput.type).toBe("checklist");
      expect(initialInput.items).toEqual(["milk", "bread"]);

      const existingList = await saveParsedItem(initialInput, INBOX_WORKSPACE_ID);
      expect(existingList.id).toMatch(/^checklist-/);

      // 2. New capture: "shopping\nmilk\nbread\ncurd"
      const candidateInput = parseProductivityText("shopping\nmilk\nbread\ncurd");
      expect(candidateInput.type).toBe("checklist");
      expect(candidateInput.items).toEqual(["milk", "bread", "curd"]);

      // 3. Duplicate analysis produces merge_candidate
      const dupCheck = await validateCaptureItem(candidateInput, INBOX_WORKSPACE_ID);

      expect(dupCheck.isPotentialDuplicate).toBe(true);
      expect(dupCheck.relationship).toBe("merge_candidate");
      expect(dupCheck.matchedEntity?.id).toBe(existingList.id);
      expect(dupCheck.overlappingItems).toEqual(["milk", "bread"]);
      expect(dupCheck.newItems).toEqual(["curd"]);

      // 4. Executing mergeParsedChecklist appends only missing items
      await mergeParsedChecklist(candidateInput, dupCheck.matchedEntity!.id, INBOX_WORKSPACE_ID);

      // 5. Verify repository state
      const updatedList = await ChecklistRepository.getChecklist(existingList.id, INBOX_WORKSPACE_ID);
      expect(updatedList).not.toBeNull();
      expect(updatedList?.items).toHaveLength(3);
      expect(updatedList?.items.map((i) => i.title)).toEqual(["milk", "bread", "curd"]);
    });

    it("15. Checklist inverse: Same title with non-overlapping items does not produce a merge_candidate", async () => {
      // 1. Existing checklist: "shopping\nmilk\nbread"
      const initialInput = parseProductivityText("shopping\nmilk\nbread");
      const existingList = await saveParsedItem(initialInput, INBOX_WORKSPACE_ID);
      expect(existingList.id).toMatch(/^checklist-/);

      // 2. Non-overlapping capture: "shopping\ncar\nbike"
      const candidateInput = parseProductivityText("shopping\ncar\nbike");
      expect(candidateInput.type).toBe("checklist");
      expect(candidateInput.items).toEqual(["car", "bike"]);

      // 3. Duplicate analysis produces no duplicate/merge candidate
      const dupCheck = await validateCaptureItem(candidateInput, INBOX_WORKSPACE_ID);
      expect(dupCheck.isPotentialDuplicate).toBe(false);
      expect(dupCheck.relationship).not.toBe("merge_candidate");

      // 4. Saving creates a separate checklist cleanly
      const secondList = await saveParsedItem(candidateInput, INBOX_WORKSPACE_ID);
      expect(secondList.id).not.toBe(existingList.id);

      const allLists = await ChecklistRepository.getChecklists(INBOX_WORKSPACE_ID);
      expect(Object.keys(allLists)).toHaveLength(2);
    });
  });

  describe("Editable NLP Metadata Chips & User Overrides", () => {
    it("16. Core Scenario: User overrides Priority (Medium -> High) on parsed task with tomorrow due date, persisted task reflects High priority and Tomorrow due date", async () => {
      // 1. NLP parses input: "Buy milk tomorrow"
      const parsed = parseProductivityText("Buy milk tomorrow");
      expect(parsed.type).toBe("task");
      expect(parsed.title).toBe("Buy milk");
      expect(parsed.date).toBeDefined();
      expect(parsed.priority || "medium").toBe("medium");

      // 2. User simulates overriding Priority to "high"
      const userOverridePriority: ParsedProductivityItem = {
        ...parsed,
        priority: "high",
      };

      // 3. User saves with override
      const savedTask = await saveParsedItem(userOverridePriority, INBOX_WORKSPACE_ID);

      // 4. Verify in TaskRepository
      const persisted = await TaskRepository.getTask(savedTask.id, INBOX_WORKSPACE_ID);
      expect(persisted).not.toBeNull();
      expect(persisted?.priority).toBe("high");
      expect(persisted?.schedule?.date).toBe(parsed.date);
    });

    it("17. Due date override: User changes due date from Tomorrow to Today before saving", async () => {
      const parsed = parseProductivityText("Call John tomorrow");
      expect(parsed.date).toBeDefined();

      const today = new Date().toISOString().split("T")[0];
      const overridden: ParsedProductivityItem = {
        ...parsed,
        date: today,
      };

      const savedTask = await saveParsedItem(overridden, INBOX_WORKSPACE_ID);
      const persisted = await TaskRepository.getTask(savedTask.id, INBOX_WORKSPACE_ID);
      expect(persisted?.schedule?.date).toBe(today);
    });

    it("18. Workspace override: User selects custom workspace before saving", async () => {
      const parsed = parseProductivityText("Review Q3 roadmap");
      const targetWorkspace = "ws-work-projects";

      const savedTask = await saveParsedItem(parsed, targetWorkspace);
      expect(savedTask.workspaceId).toBe(targetWorkspace);

      const persisted = await TaskRepository.getTask(savedTask.id, targetWorkspace);
      expect(persisted?.workspaceId).toBe(targetWorkspace);
    });

    it("19. Habit recurrence override: User changes weekdays habit to daily before saving", async () => {
      const parsed = parseProductivityText("Go to gym every weekday");
      expect(parsed.type).toBe("habit");
      expect(parsed.recurrence?.type).toBe("weekdays");

      const overridden: ParsedProductivityItem = {
        ...parsed,
        recurrence: {
          type: "daily",
          interval: 1,
        },
      };

      const savedHabit = await saveParsedItem(overridden, "ws-wellness");
      const persisted = await HabitRepository.getHabit(savedHabit.id, "ws-wellness");
      expect(persisted?.recurrence.frequency).toBe("daily");
    });
  });
});
