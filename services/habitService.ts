import { type Habit } from "../modules/types";
import { getDateKey, dayDiff } from "./recurrence";

export const normalizeHabitsForToday = (habitsList: Habit[]): Habit[] => {
  const today = getDateKey();

  return habitsList.map((habit) => {
    if (!habit.lastCompletedDate) {
      return { ...habit, completedToday: false };
    }

    const diff = dayDiff(habit.lastCompletedDate, today);

    if (diff <= 0) {
      return {
        ...habit,
        completedToday:
          habit.completedToday && habit.lastCompletedDate === today,
      };
    }

    if (diff === 1) {
      return { ...habit, completedToday: false };
    }

    const isWithinRecoveryWindow = habit.streakBrokenDate && (dayDiff(habit.streakBrokenDate, today) <= 1);
    let nextPreviousStreak = habit.previousStreak;
    let nextStreakBrokenDate = habit.streakBrokenDate;

    if (habit.streak > 0) {
      nextPreviousStreak = habit.streak;
      nextStreakBrokenDate = today;
    } else if (!isWithinRecoveryWindow) {
      nextPreviousStreak = undefined;
      nextStreakBrokenDate = undefined;
    }

    return {
      ...habit,
      completedToday: false,
      streak: 0,
      previousStreak: nextPreviousStreak,
      streakBrokenDate: nextStreakBrokenDate,
    };
  });
};
