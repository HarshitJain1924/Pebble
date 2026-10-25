/**
 * Habit streak → flame stage derivation.
 *
 * Single source of truth for the streak progression ladder. The domain model
 * keeps storing the raw streak count (`getHabitCurrentStreak`); the flame stage
 * is always derived from that value here, so no component re-implements the
 * thresholds.
 *
 * Stage ladder (inclusive lower bounds):
 *   0 days   → 0  inactive / muted, no active flame
 *   1–2 days → 1  base flame
 *   3–6 days → 2
 *   7–13 days→ 3
 *   14–29    → 4
 *   30+      → 5  passion / milestone
 */

/** `0` is the inactive state; `1`–`5` map to the five flame artwork stages. */
export type HabitStreakStage = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Ordered progression ladder. Each entry's `minDays` is an inclusive lower
 * bound; the last entry whose `minDays` the streak reaches wins.
 */
export const HABIT_STREAK_STAGES = [
  { stage: 1, minDays: 1 },
  { stage: 2, minDays: 3 },
  { stage: 3, minDays: 7 },
  { stage: 4, minDays: 14 },
  { stage: 5, minDays: 30 },
] as const satisfies readonly { stage: HabitStreakStage; minDays: number }[];

/** Streak lengths that earn a stronger one-shot celebration. */
export const HABIT_STREAK_MILESTONES = [7, 14, 30, 100] as const;

/** Derives the flame stage for a raw streak value. Never throws on bad input. */
export function getHabitStreakStage(streak: number): HabitStreakStage {
  if (!Number.isFinite(streak) || streak < 1) return 0;

  let stage: HabitStreakStage = 1;
  for (const step of HABIT_STREAK_STAGES) {
    if (streak >= step.minDays) stage = step.stage;
  }
  return stage;
}

/** True when the streak lands exactly on a celebration milestone. */
export function isHabitStreakMilestone(streak: number): boolean {
  return (HABIT_STREAK_MILESTONES as readonly number[]).includes(streak);
}

/** Pluralized unit for the streak value, e.g. `1` → "day", `12` → "days". */
export function getHabitStreakUnitLabel(streak: number): string {
  return streak === 1 ? "day" : "days";
}

/**
 * Screen-reader label. The flame artwork and the number are purely visual, so
 * this is the only meaningful description of the streak for assistive tech.
 */
export function getHabitStreakAccessibilityLabel(streak: number): string {
  const safe = Number.isFinite(streak) && streak > 0 ? Math.floor(streak) : 0;
  return `${safe} day streak`;
}
