import {
  ACHIEVEMENT_CATEGORY_LABEL,
  buildAchievements,
  countUnlockedAchievements,
  groupAchievementsByCategory,
  TOTAL_ACHIEVEMENTS,
} from "../achievements";

const zero = {
  todosCompleted: 0,
  habitsCompleted: 0,
  activeStreak: 0,
  focusSessions: 0,
};

describe("canonical achievements", () => {
  it("defines exactly ten achievements", () => {
    expect(buildAchievements(zero)).toHaveLength(TOTAL_ACHIEVEMENTS);
    expect(TOTAL_ACHIEVEMENTS).toBe(10);
  });

  it("preserves the existing ids and thresholds", () => {
    const ids = buildAchievements(zero).map((a) => a.id);
    expect(ids).toEqual([
      "first_task",
      "tasks_10",
      "tasks_100",
      "first_habit",
      "habits_25",
      "streak_3",
      "streak_7",
      "streak_30",
      "focus_1",
      "focus_master",
    ]);

    const targets = Object.fromEntries(
      buildAchievements(zero).map((a) => [a.id, a.targetValue]),
    );
    expect(targets).toEqual({
      first_task: 1,
      tasks_10: 10,
      tasks_100: 100,
      first_habit: 1,
      habits_25: 25,
      streak_3: 3,
      streak_7: 7,
      streak_30: 30,
      focus_1: 1,
      focus_master: 10,
    });
  });

  it("leaves everything locked at zero progress", () => {
    const achievements = buildAchievements(zero);
    expect(achievements.every((a) => !a.unlocked)).toBe(true);
    expect(countUnlockedAchievements(achievements)).toBe(0);
  });

  it("unlocks from the real stat values", () => {
    const achievements = buildAchievements({
      todosCompleted: 12,
      habitsCompleted: 1,
      activeStreak: 7,
      focusSessions: 1,
    });
    const unlocked = achievements.filter((a) => a.unlocked).map((a) => a.id);
    expect(unlocked).toEqual([
      "first_task",
      "tasks_10",
      "first_habit",
      "streak_3",
      "streak_7",
      "focus_1",
    ]);
    expect(countUnlockedAchievements(achievements)).toBe(6);
  });

  it("groups achievements in the canonical display order", () => {
    const groups = groupAchievementsByCategory(buildAchievements(zero));
    expect(groups.map((g) => g.category)).toEqual([
      "tasks",
      "habits",
      "streak",
      "focus",
    ]);
    expect(groups.map((g) => g.label)).toEqual([
      ACHIEVEMENT_CATEGORY_LABEL.tasks,
      ACHIEVEMENT_CATEGORY_LABEL.habits,
      ACHIEVEMENT_CATEGORY_LABEL.streak,
      ACHIEVEMENT_CATEGORY_LABEL.focus,
    ]);
    expect(groups.map((g) => g.items.length)).toEqual([3, 2, 3, 2]);
  });

  it("assigns every achievement a category so nothing is dropped", () => {
    const groups = groupAchievementsByCategory(buildAchievements(zero));
    const grouped = groups.reduce((sum, g) => sum + g.items.length, 0);
    expect(grouped).toBe(TOTAL_ACHIEVEMENTS);
  });
});
