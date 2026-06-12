import {
  normalizeTitle,
  similarity,
  findDuplicateTask,
  findDuplicateHabit,
  getDuplicateSuggestions,
} from "../duplicateDetection";

describe("duplicateDetection service unit tests", () => {
  describe("normalizeTitle", () => {
    it("should lowercase, strip punctuation, and collapse spaces", () => {
      expect(normalizeTitle("Gym Workout!")).toBe("gym workout");
      expect(normalizeTitle("  Buy   Groceries... ")).toBe("buy groceries");
      expect(normalizeTitle("Finish Assignment: Rust")).toBe("finish assignment rust");
    });
  });

  describe("similarity", () => {
    it("should compute Jaccard similarity on word sets", () => {
      // Identical words
      expect(similarity("buy milk", "milk buy")).toBe(1);
      // Half overlap
      expect(similarity("buy milk", "buy eggs")).toBe(1 / 3); // intersection: "buy" (1), union: "buy", "milk", "eggs" (3)
      // No overlap
      expect(similarity("buy milk", "go run")).toBe(0);
      // Empty inputs
      expect(similarity("", "")).toBe(1);
    });
  });

  describe("findDuplicateTask", () => {
    const mockTodos = {
      default: [
        { id: "1", title: "Study Kubernetes", completed: false, archived: false },
        { id: "2", title: "Buy groceries", completed: true, archived: false }, // completed, should be ignored
        { id: "3", title: "Finish presentation", completed: false, archived: true }, // archived, should be ignored
      ],
      work: [
        { id: "4", title: "Meeting with client", completed: false, archived: false },
      ],
    };

    it("should detect exact matches", () => {
      const match = findDuplicateTask("Study Kubernetes", mockTodos);
      expect(match).not.toBeNull();
      expect(match?.kind).toBe("exact");
      expect(match?.item.id).toBe("1");
    });

    it("should detect contains and contained matches", () => {
      // New title contains existing ("Study Kubernetes tomorrow" contains "Study Kubernetes")
      const matchContains = findDuplicateTask("Study Kubernetes tomorrow", mockTodos);
      expect(matchContains).not.toBeNull();
      expect(matchContains?.kind).toBe("contains");

      // Existing title contains new ("Meeting" is contained in "Meeting with client")
      const matchContained = findDuplicateTask("Meeting", mockTodos);
      expect(matchContained).not.toBeNull();
      expect(matchContained?.kind).toBe("contained");
    });

    it("should detect near matches based on similarity threshold", () => {
      const matchNear = findDuplicateTask("Study K8s Kubernetes", mockTodos); // overlapping words
      expect(matchNear).not.toBeNull();
      expect(matchNear?.kind).toBe("near");
    });

    it("should return null if no duplicate is found", () => {
      const match = findDuplicateTask("Write documentation", mockTodos);
      expect(match).toBeNull();
    });
  });

  describe("findDuplicateHabit", () => {
    const mockHabits = [
      {
        id: "1",
        title: "Drink Water",
        streak: 5,
        bestStreak: 10,
        archived: false,
        recurrence: { type: "daily" as const },
        reminderHour: 8,
        reminderMinute: 0,
        reminderDays: [0, 1, 2, 3, 4, 5, 6],
        category: "health" as const,
        priority: "medium" as const,
      },
      {
        id: "2",
        title: "Read a Book",
        streak: 2,
        bestStreak: 2,
        archived: true, // archived, should be ignored
        recurrence: { type: "daily" as const },
        reminderHour: 21,
        reminderMinute: 0,
        reminderDays: [0, 1, 2, 3, 4, 5, 6],
        category: "learning" as const,
        priority: "low" as const,
      },
    ];

    it("should find active duplicate habits", () => {
      const match = findDuplicateHabit("Drink Water", mockHabits);
      expect(match).not.toBeNull();
      expect(match?.kind).toBe("exact");
      expect(match?.item.id).toBe("1");
    });

    it("should ignore archived habits when checking duplicates", () => {
      const match = findDuplicateHabit("Read a Book", mockHabits);
      expect(match).toBeNull();
    });
  });

  describe("getDuplicateSuggestions", () => {
    it("should return appropriate message descriptions", () => {
      expect(getDuplicateSuggestions("exact", "Gym", "Gym")).toBe('"Gym" already exists');
      expect(getDuplicateSuggestions("contains", "Gym workout", "Gym")).toBe('"Gym" is part of your new entry');
      expect(getDuplicateSuggestions("contained", "Gym", "Gym workout")).toBe('"Gym workout" already covers "Gym"');
      expect(getDuplicateSuggestions("near", "Workout gym", "Gym workout")).toBe('"Gym workout" looks very similar');
    });
  });
});
