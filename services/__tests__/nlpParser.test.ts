import {
  parseProductivityText,
  extractProductivitySignals,
  type ParsedProductivityItem,
} from "@/features/capture/services/nlp-parser.service";
import { buildResource } from "@/features/capture/services/entity-factory.service";

describe("nlpParser service unit tests", () => {
  describe("Structured Signal Extraction", () => {
    it("should extract independent structural, semantic, temporal, and metadata signals", () => {
      const signals = extractProductivitySignals("Buy groceries every Sunday at 4pm urgent");

      expect(signals.structural.isMultiline).toBe(false);
      expect(signals.semantic.actionKeywords).toContain("buy");
      expect(signals.semantic.hasStrongAction).toBe(true);
      expect(signals.temporal.hasRecurrence).toBe(true);
      expect(signals.temporal.recurrence?.type).toBe("weekly");
      expect(signals.temporal.recurrence?.days).toEqual([0]);
      expect(signals.temporal.time).toBe("16:00");
      expect(signals.metadata.priority).toBe("high");
      expect(signals.metadata.category).toBe("personal");
    });
  });

  describe("Intent Hierarchy - Task", () => {
    it("should confidently classify explicit action tasks", () => {
      const result1 = parseProductivityText("Call John tomorrow at 7");
      expect(result1.type).toBe("task");
      expect(result1.title).toBe("Call John");
      expect(result1.date).toBeDefined();
      expect(result1.time).toBe("07:00");
      expect(result1.confidence).toBeGreaterThanOrEqual(0.85);

      const result2 = parseProductivityText("Buy milk at 6pm");
      expect(result2.type).toBe("task");
      expect(result2.title).toBe("Buy milk");
      expect(result2.time).toBe("18:00");
      expect(result2.confidence).toBeGreaterThanOrEqual(0.85);

      const result3 = parseProductivityText("Finish report Friday");
      expect(result3.type).toBe("task");
      expect(result3.title).toBe("Finish report");
      expect(result3.date).toBeDefined();
      expect(result3.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it("should correctly distinguish Buy milk vs Buy milk tomorrow vs Buy milk every Sunday", () => {
      const taskPlain = parseProductivityText("Buy milk");
      expect(taskPlain.type).toBe("task");
      expect(taskPlain.date).toBeUndefined();
      expect(taskPlain.recurrence).toBeUndefined();

      const taskDate = parseProductivityText("Buy milk tomorrow");
      expect(taskDate.type).toBe("task");
      expect(taskDate.date).toBeDefined();
      expect(taskDate.recurrence).toBeUndefined();

      const habitRecurring = parseProductivityText("Buy milk every Sunday");
      expect(habitRecurring.type).toBe("habit");
      expect(habitRecurring.recurrence?.type).toBe("weekly");
      expect(habitRecurring.recurrence?.days).toEqual([0]);
    });

    it("should not confuse task with habit when dates are provided", () => {
      const result = parseProductivityText("exercise tomorrow");
      expect(result.type).toBe("task");
      expect(result.date).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });
  });

  describe("Intent Hierarchy - Habit", () => {
    it("should confidently classify strong recurrence as habits", () => {
      const result1 = parseProductivityText("Exercise every morning");
      expect(result1.type).toBe("habit");
      expect(result1.recurrence?.type).toBe("daily");
      expect(result1.time).toBe("08:00");
      expect(result1.confidence).toBeGreaterThanOrEqual(0.85);

      const result2 = parseProductivityText("Meditate weekdays");
      expect(result2.type).toBe("habit");
      expect(result2.recurrence?.type).toBe("weekdays");
      expect(result2.confidence).toBeGreaterThanOrEqual(0.85);

      const result3 = parseProductivityText("Read every night");
      expect(result3.type).toBe("habit");
      expect(result3.recurrence?.type).toBe("daily");
      expect(result3.time).toBe("18:00");
      expect(result3.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it("should fall back to task for weak signals or explicit task keywords", () => {
      const result = parseProductivityText("Submit project report every month on the 15th");
      expect(result.type).toBe("task"); // even though it's recurring, "submit project report" is a heavy task signal
      expect(result.recurrence?.type).toBe("monthly");
      expect(result.recurrence?.dayOfMonth).toBe(15);
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });
  });

  describe("Intent Hierarchy - Checklist", () => {
    it("should detect plain multiline lists with high confidence", () => {
      const result = parseProductivityText("shopping\nmilk\nbread\neggs");
      expect(result.type).toBe("checklist");
      expect(result.title).toBe("Shopping");
      expect(result.items).toEqual(["milk", "bread", "eggs"]);
      expect(result.confidence).toBeGreaterThanOrEqual(0.80);
    });

    it("should detect bullet lists with high confidence", () => {
      const result = parseProductivityText("Groceries\n- milk\n- bread\n- eggs");
      expect(result.type).toBe("checklist");
      expect(result.title).toBe("Groceries");
      expect(result.items).toEqual(["milk", "bread", "eggs"]);
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it("should detect numbered lists with high confidence", () => {
      const result = parseProductivityText("Steps\n1. First\n2. Second\n3. Third");
      expect(result.type).toBe("checklist");
      expect(result.title).toBe("Steps");
      expect(result.items).toEqual(["First", "Second", "Third"]);
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it("should not detect multiline prose as a checklist", () => {
      const result = parseProductivityText("I need to remember that milk is running out.\nI will go to the store later today.");
      expect(result.type).not.toBe("checklist");
    });
  });

  describe("Intent Hierarchy - Idea", () => {
    it("should detect natural idea patterns", () => {
      const result1 = parseProductivityText("What if Pebble grouped recurring tasks?");
      expect(result1.type).toBe("idea");
      expect(result1.title).toBe("Pebble grouped recurring tasks?");
      expect(result1.confidence).toBeGreaterThanOrEqual(0.80);

      const result2 = parseProductivityText("Idea: add a focus mode");
      expect(result2.type).toBe("idea");
      expect(result2.title).toBe("Add a focus mode");
      expect(result2.confidence).toBeGreaterThanOrEqual(0.80);
    });
  });

  describe("Intent Hierarchy - Note", () => {
    it("should detect explicit notes", () => {
      const result1 = parseProductivityText("Kubernetes authentication notes");
      expect(result1.type).toBe("note");
      expect(result1.title).toBe("Kubernetes authentication");
      expect(result1.confidence).toBeGreaterThanOrEqual(0.80);

      const result2 = parseProductivityText("Thoughts on the new design implementation");
      expect(result2.type).toBe("note");
      expect(result2.title).toBe("The new design implementation");
      expect(result2.confidence).toBeGreaterThanOrEqual(0.80);
    });

    it("should detect long-form prose as a note rather than a task", () => {
      const result = parseProductivityText("This is a long paragraph about how the system works. It doesn't have an action word at the start, and it is generally just providing context and thoughts. It shouldn't be a task.");
      expect(result.type).toBe("note");
      expect(result.confidence).toBeGreaterThanOrEqual(0.70);
    });
  });

  describe("Intent Hierarchy - Link", () => {
    it("should detect URLs with high confidence", () => {
      const result1 = parseProductivityText("https://example.com");
      expect(result1.type).toBe("link");
      expect(result1.url).toBe("https://example.com");
      expect(result1.confidence).toBeGreaterThanOrEqual(0.90);

      const result2 = parseProductivityText("Check out this link https://github.com/expo");
      expect(result2.type).toBe("link");
      expect(result2.url).toBe("https://github.com/expo");
      expect(result2.title).toBe("Check out this link");
      expect(result2.confidence).toBeGreaterThanOrEqual(0.90);
    });
  });

  describe("Ambiguous Inputs & Confidence Behavior", () => {
    it("should handle single ambiguous words with low/medium confidence without blocking", () => {
      const result1 = parseProductivityText("exercise");
      expect(result1.type).toBe("task");
      expect(result1.category).toBe("health");
      expect(result1.confidence).toBeLessThan(0.70);
      expect(result1.confidence).toBeGreaterThanOrEqual(0.40);

      const result2 = parseProductivityText("meeting");
      expect(result2.type).toBe("task");
      expect(result2.category).toBe("work");
      expect(result2.confidence).toBeLessThan(0.70);

      const result3 = parseProductivityText("groceries");
      expect(result3.type).toBe("task");
      expect(result3.category).toBe("personal");
      expect(result3.confidence).toBeLessThan(0.70);
    });

    it("should preserve file attachment metadata when buildResource is called", () => {
      const fileItem: ParsedProductivityItem = {
        type: "file",
        title: "project-spec.pdf",
        confidence: 0.95,
        attachments: [
          {
            id: "att-123",
            name: "project-spec.pdf",
            uri: "file:///path/to/project-spec.pdf",
            mimeType: "application/pdf",
            size: 10240,
          },
        ],
      };

      const resource = buildResource(fileItem, "ws-1");
      expect(resource.type).toBe("note");
      expect(resource.title).toBe("project-spec.pdf");
      expect(resource.attachments).toBeDefined();
      expect(resource.attachments).toHaveLength(1);
    });

    it("should parse reminder offset minutes", () => {
      const reminderMin = parseProductivityText("Gym at 8am and remind me 30 minutes before");
      expect(reminderMin.reminderOffsetMinutes).toBe(30);

      const reminderHour = parseProductivityText("Exam at 10am alert me 2 hours prior");
      expect(reminderHour.reminderOffsetMinutes).toBe(120);
    });

    it("should clean up date and time keywords from final title", () => {
      const cleanResult = parseProductivityText("Submit assignment tomorrow at 5pm urgent");
      expect(cleanResult.title).toBe("Submit assignment");
      expect(cleanResult.priority).toBe("high");
      expect(cleanResult.time).toBe("17:00");
    });
  });
});
