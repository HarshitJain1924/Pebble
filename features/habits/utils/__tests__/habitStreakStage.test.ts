import {
  HABIT_STREAK_MILESTONES,
  getHabitStreakAccessibilityLabel,
  getHabitStreakStage,
  getHabitStreakUnitLabel,
  isHabitStreakMilestone,
} from "../habitStreakStage";

describe("habitStreakStage", () => {
  describe("getHabitStreakStage", () => {
    it("maps every documented boundary to the correct stage", () => {
      // 0 days → inactive
      expect(getHabitStreakStage(0)).toBe(0);

      // 1–2 → stage 1
      expect(getHabitStreakStage(1)).toBe(1);
      expect(getHabitStreakStage(2)).toBe(1);

      // 3–6 → stage 2
      expect(getHabitStreakStage(3)).toBe(2);
      expect(getHabitStreakStage(6)).toBe(2);

      // 7–13 → stage 3
      expect(getHabitStreakStage(7)).toBe(3);
      expect(getHabitStreakStage(13)).toBe(3);

      // 14–29 → stage 4
      expect(getHabitStreakStage(14)).toBe(4);
      expect(getHabitStreakStage(29)).toBe(4);

      // 30+ → stage 5
      expect(getHabitStreakStage(30)).toBe(5);
      expect(getHabitStreakStage(100)).toBe(5);
      expect(getHabitStreakStage(3650)).toBe(5);
    });

    it("treats non-finite or negative input as inactive instead of throwing", () => {
      expect(getHabitStreakStage(-5)).toBe(0);
      expect(getHabitStreakStage(Number.NaN)).toBe(0);
      expect(getHabitStreakStage(Number.POSITIVE_INFINITY)).toBe(0);
      expect(getHabitStreakStage(Number.NEGATIVE_INFINITY)).toBe(0);
    });
  });

  describe("milestones", () => {
    it("recognises the celebration milestones", () => {
      for (const milestone of HABIT_STREAK_MILESTONES) {
        expect(isHabitStreakMilestone(milestone)).toBe(true);
      }
      expect(isHabitStreakMilestone(6)).toBe(false);
      expect(isHabitStreakMilestone(8)).toBe(false);
      expect(isHabitStreakMilestone(0)).toBe(false);
    });
  });

  describe("labels", () => {
    it("pluralizes the unit correctly", () => {
      expect(getHabitStreakUnitLabel(0)).toBe("days");
      expect(getHabitStreakUnitLabel(1)).toBe("day");
      expect(getHabitStreakUnitLabel(2)).toBe("days");
    });

    it("builds a screen-reader label that does not rely on the flame artwork", () => {
      expect(getHabitStreakAccessibilityLabel(0)).toBe("0 day streak");
      expect(getHabitStreakAccessibilityLabel(1)).toBe("1 day streak");
      expect(getHabitStreakAccessibilityLabel(12)).toBe("12 day streak");
      expect(getHabitStreakAccessibilityLabel(Number.NaN)).toBe("0 day streak");
    });
  });
});
