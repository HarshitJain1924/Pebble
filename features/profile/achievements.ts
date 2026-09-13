/**
 * achievements.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Canonical achievement definitions.
 *
 * This is the ONLY place achievement ids, thresholds, copy and categories are
 * declared. The Achievements screen and the Profile gateway both consume
 * `buildAchievements`, so the unlocked count can never drift between them.
 *
 * These are the existing ten achievements — ids, requirements and thresholds
 * are unchanged.
 */
import type { Feather } from "@expo/vector-icons";
import type React from "react";

export type AchievementCategory = "tasks" | "habits" | "streak" | "focus";

export interface AchievementStats {
  todosCompleted: number;
  habitsCompleted: number;
  activeStreak: number;
  focusSessions: number;
}

export interface Achievement {
  id: string;
  title: string;
  desc: string;
  unlockedDesc: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  category: AchievementCategory;
  unlocked: boolean;
  progressValue: number;
  targetValue: number;
}

/** Display order for the grouped gallery. */
export const ACHIEVEMENT_CATEGORY_ORDER: readonly AchievementCategory[] = [
  "tasks",
  "habits",
  "streak",
  "focus",
];

export const ACHIEVEMENT_CATEGORY_LABEL: Record<AchievementCategory, string> = {
  tasks: "Tasks",
  habits: "Habits",
  streak: "Streaks",
  focus: "Focus",
};

export const TOTAL_ACHIEVEMENTS = 10;

export function buildAchievements(stats: AchievementStats): Achievement[] {
  return [
    {
      id: "first_task",
      title: "First Pebble",
      desc: "Complete your first task",
      unlockedDesc: "Completed first task",
      icon: "check-square",
      unlocked: stats.todosCompleted >= 1,
      category: "tasks",
      progressValue: stats.todosCompleted,
      targetValue: 1,
    },
    {
      id: "tasks_10",
      title: "Decathlon Cleared",
      desc: "Complete 10 tasks in total",
      unlockedDesc: "Completed 10 tasks",
      icon: "clipboard",
      unlocked: stats.todosCompleted >= 10,
      category: "tasks",
      progressValue: stats.todosCompleted,
      targetValue: 10,
    },
    {
      id: "tasks_100",
      title: "Centurion Cleared",
      desc: "Complete 100 tasks in total",
      unlockedDesc: "100 tasks cleared successfully",
      icon: "award",
      unlocked: stats.todosCompleted >= 100,
      category: "tasks",
      progressValue: stats.todosCompleted,
      targetValue: 100,
    },
    {
      id: "first_habit",
      title: "Daily Routine",
      desc: "Complete your first habit",
      unlockedDesc: "Completed first habit",
      icon: "activity",
      unlocked: stats.habitsCompleted >= 1,
      category: "habits",
      progressValue: stats.habitsCompleted,
      targetValue: 1,
    },
    {
      id: "habits_25",
      title: "Habit Champion",
      desc: "Complete habits 25 times",
      unlockedDesc: "Logged 25 habit completions",
      icon: "target",
      unlocked: stats.habitsCompleted >= 25,
      category: "habits",
      progressValue: stats.habitsCompleted,
      targetValue: 25,
    },
    {
      id: "streak_3",
      title: "Three-Day Spark",
      desc: "Achieve a 3-day habit streak",
      unlockedDesc: "3-day habit streak reached",
      icon: "zap",
      unlocked: stats.activeStreak >= 3,
      category: "streak",
      progressValue: stats.activeStreak,
      targetValue: 3,
    },
    {
      id: "streak_7",
      title: "Weekly Momentum",
      desc: "Achieve a 7-day habit streak",
      unlockedDesc: "7-day habit streak reached",
      icon: "trending-up",
      unlocked: stats.activeStreak >= 7,
      category: "streak",
      progressValue: stats.activeStreak,
      targetValue: 7,
    },
    {
      id: "streak_30",
      title: "Monthly Resilience",
      desc: "Achieve a 30-day habit streak",
      unlockedDesc: "30-day habit streak reached",
      icon: "calendar",
      unlocked: stats.activeStreak >= 30,
      category: "streak",
      progressValue: stats.activeStreak,
      targetValue: 30,
    },
    {
      id: "focus_1",
      title: "Deep Dive",
      desc: "Complete 1 Focus block session",
      unlockedDesc: "First Focus session logged",
      icon: "coffee",
      unlocked: stats.focusSessions >= 1,
      category: "focus",
      progressValue: stats.focusSessions,
      targetValue: 1,
    },
    {
      id: "focus_master",
      title: "Focus Master",
      desc: "Complete 10 Focus block sessions",
      unlockedDesc: "10 Focus sessions completed",
      icon: "sun",
      unlocked: stats.focusSessions >= 10,
      category: "focus",
      progressValue: stats.focusSessions,
      targetValue: 10,
    },
  ];
}

export function countUnlockedAchievements(
  achievements: Achievement[],
): number {
  return achievements.filter((a) => a.unlocked).length;
}

/** Group achievements by category, preserving canonical order. */
export function groupAchievementsByCategory(
  achievements: Achievement[],
): { category: AchievementCategory; label: string; items: Achievement[] }[] {
  return ACHIEVEMENT_CATEGORY_ORDER.map((category) => ({
    category,
    label: ACHIEVEMENT_CATEGORY_LABEL[category],
    items: achievements.filter((a) => a.category === category),
  })).filter((group) => group.items.length > 0);
}
