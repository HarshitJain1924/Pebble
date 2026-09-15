/**
 * pebble-milestones.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Canonical Pebble Sanctuary milestone model.
 *
 * This is the single source of truth for sanctuary stages. Every surface that
 * presents Pebble progression (Profile, Today jar card, Sanctuary modal) must
 * read from here so stage names, thresholds and progress can never drift apart.
 *
 * IMPORTANT: this is a presentation model for the *existing* sanctuary
 * progression. It is NOT an XP / level / rank system — it does not gate any
 * rewards and does not participate in Pebble or Gem accounting.
 *
 * Thresholds are canonical:
 *   10, 25, 50, 100, 250, 500, 1000
 * Each chapter unlocks when its threshold is reached. Before the first
 * threshold, the first chapter is shown as upcoming.
 */

export interface PebbleMilestone {
  /** 1-based stage number. */
  stage: number;
  name: string;
  /** Human readable chapter band, e.g. "25-49". */
  range: string;
  desc: string;
  /**
   * Sanctuary visual unlocked once this stage is completed (i.e. once
   * `nextThreshold` Pebbles are reached). `null` on the final stage because
   * nothing further unlocks.
   */
  unlock: string | null;
}

/** Pebble counts that complete each stage. Canonical — do not alter. */
export const PEBBLE_STAGE_THRESHOLDS = [10, 25, 50, 100, 250, 500, 1000] as const;

/** Full sanctuary stage ladder, in ascending order. */
export const PEBBLE_MILESTONES: readonly PebbleMilestone[] = [
  {
    stage: 1,
    name: "Beginning",
    range: "10-24",
    desc: "Gathering the first stones of momentum.",
    unlock: "Beginning Jar Nest",
  },
  {
    stage: 2,
    name: "Growth",
    range: "25-49",
    desc: "A small base of habit stones.",
    unlock: "Curious Mascot grows",
  },
  {
    stage: 3,
    name: "Flow",
    range: "50-99",
    desc: "Flowing stream of productivity.",
    unlock: "Zen Energy floats",
  },
  {
    stage: 4,
    name: "Home",
    range: "100-249",
    desc: "Solid foundation for daily rhythm.",
    unlock: "Crowned Mascot & sparkles",
  },
  {
    stage: 5,
    name: "Collection",
    range: "250-499",
    desc: "A significant heap of accomplishments.",
    unlock: "Golden Jar & sparks",
  },
  {
    stage: 6,
    name: "Peak",
    range: "500-999",
    desc: "An impressive, towering mount of zen.",
    unlock: "Sanctuary Mastery",
  },
  {
    stage: 7,
    name: "Beyond",
    range: "1000+",
    desc: "Infinite zen achieved. Master level.",
    unlock: null,
  },
];

export const MAX_PEBBLE_STAGE = PEBBLE_MILESTONES.length;

export interface MilestoneInfo extends PebbleMilestone {
  /** True when the highest stage has been reached. */
  isMaxStage: boolean;
  /** True before the first chapter has unlocked. */
  isPrelude: boolean;
  nextStage: number | null;
  nextStageName: string | null;
  /** Pebble count that unlocks the next chapter (`null` at max stage). */
  nextThreshold: number | null;
  /** Pebbles earned inside the current stage band. */
  progressInStage: number;
  /** Number of Pebbles the current stage band spans. */
  stageSpan: number;
  /** 0..1 fill ratio of the current stage band. */
  progressRatio: number;
  /** Pebbles left before the next chapter is reached. */
  remaining: number;
  /** Sanctuary visual unlocked with the next chapter. */
  nextUnlock: string | null;
}

function normalizePebbleCount(pebbles: number): number {
  if (!Number.isFinite(pebbles) || pebbles < 0) return 0;
  return Math.floor(pebbles);
}

/** Resolve the 1-based active chapter for a lifetime Pebble count. */
export function getPebbleStage(pebbles: number): number {
  const count = normalizePebbleCount(pebbles);
  if (count < PEBBLE_STAGE_THRESHOLDS[0]) return 1;

  for (let i = 1; i < PEBBLE_STAGE_THRESHOLDS.length; i += 1) {
    if (count < PEBBLE_STAGE_THRESHOLDS[i]) return i;
  }

  return MAX_PEBBLE_STAGE;
}

/**
 * Resolve full milestone presentation data for a lifetime Pebble count.
 * Combines the canonical stage definition with derived progress values so no
 * consumer has to re-implement the band math.
 */
export function getMilestoneInfo(pebbles: number): MilestoneInfo {
  const count = normalizePebbleCount(pebbles);
  const stage = getPebbleStage(count);
  const definition = PEBBLE_MILESTONES[stage - 1];
  const isMaxStage = stage >= MAX_PEBBLE_STAGE;
  const isPrelude = count < PEBBLE_STAGE_THRESHOLDS[0];

  const nextStage = isMaxStage ? null : isPrelude ? 1 : stage + 1;
  const nextStageName = isMaxStage
    ? null
    : isPrelude
      ? definition.name
      : PEBBLE_MILESTONES[stage].name;
  const nextThreshold = isMaxStage
    ? null
    : isPrelude
      ? PEBBLE_STAGE_THRESHOLDS[0]
      : PEBBLE_STAGE_THRESHOLDS[stage];
  const bandStart = isPrelude
    ? 0
    : PEBBLE_STAGE_THRESHOLDS[stage - 1];
  const stageSpan = isMaxStage ? 0 : (nextThreshold as number) - bandStart;
  const progressInStage = isMaxStage ? 0 : Math.max(0, count - bandStart);
  const progressRatio = isMaxStage
    ? 1
    : stageSpan > 0
      ? Math.min(1, progressInStage / stageSpan)
      : 0;

  return {
    ...definition,
    isMaxStage,
    isPrelude,
    nextStage,
    nextStageName,
    nextThreshold,
    progressInStage,
    stageSpan,
    progressRatio,
    remaining: isMaxStage ? 0 : Math.max(0, (nextThreshold as number) - count),
    nextUnlock: isMaxStage
      ? null
      : isPrelude
        ? definition.unlock
        : PEBBLE_MILESTONES[stage].unlock,
  };
}

/** Convenience: how many Pebbles remain before the next stage (0 at max). */
export function getPebblesToNextStage(pebbles: number): number {
  return getMilestoneInfo(pebbles).remaining;
}

/**
 * Canonical water fill ratio for the Sanctuary Jar (0..1).
 *
 * Maps lifetime Pebble accumulation across canonical milestone thresholds:
 *   0    → 0.08 (calm base water line)
 *   10   → 0.20 (Chapter 1: Beginning)
 *   25   → 0.35 (Chapter 2: Growth)
 *   50   → 0.50 (Chapter 3: Flow)
 *   100  → 0.65 (Chapter 4: Home)
 *   250  → 0.80 (Chapter 5: Collection)
 *   500  → 0.90 (Chapter 6: Peak)
 *   1000 → 0.94 (Chapter 7: Beyond, safely capped below jar opening at 0.94)
 *   1000+→ 0.94 (Sanctuary Master saturation level)
 *
 * Guaranteed:
 * - Always within safe visual range [0.08, 0.94]
 * - Strictly monotonic as Pebble count increases up to 1000
 * - Handles negative/NaN/invalid counts safely
 * - Water never visually escapes the Jar
 */
export function calculateJarWaterFill(pebbles: number): number {
  if (!Number.isFinite(pebbles) || pebbles <= 0) {
    return 0.08;
  }
  const count = Math.floor(pebbles);

  if (count <= 10) {
    return Number((0.08 + (count / 10) * 0.12).toFixed(4));
  }
  if (count <= 25) {
    return Number((0.20 + ((count - 10) / 15) * 0.15).toFixed(4));
  }
  if (count <= 50) {
    return Number((0.35 + ((count - 25) / 25) * 0.15).toFixed(4));
  }
  if (count <= 100) {
    return Number((0.50 + ((count - 50) / 50) * 0.15).toFixed(4));
  }
  if (count <= 250) {
    return Number((0.65 + ((count - 100) / 150) * 0.15).toFixed(4));
  }
  if (count <= 500) {
    return Number((0.80 + ((count - 250) / 250) * 0.10).toFixed(4));
  }
  if (count <= 1000) {
    return Number((0.90 + ((count - 500) / 500) * 0.04).toFixed(4));
  }
  return 0.94;
}

/**
 * Canonical visible Pebble count for the Sanctuary Jar (0..50).
 *
 * Scales visual density progressively across the 50 predefined Jar coordinates:
 *   0    → 0 pebbles
 *   10   → 8 pebbles (Chapter 1: Beginning)
 *   25   → 16 pebbles (Chapter 2: Growth)
 *   50   → 24 pebbles (Chapter 3: Flow)
 *   100  → 32 pebbles (Chapter 4: Home)
 *   250  → 42 pebbles (Chapter 5: Collection)
 *   500  → 50 pebbles (Chapter 6: Peak - full visible pile)
 *   1000+→ 50 pebbles (Chapter 7: Beyond)
 *
 * Guaranteed:
 * - Output is always an integer between 0 and 50
 * - Monotonic (non-decreasing) as Pebble count increases
 * - Visibly continues accumulating past 50 and 100 rather than freezing
 */
export function calculateVisiblePebbleCount(pebbles: number): number {
  if (!Number.isFinite(pebbles) || pebbles <= 0) {
    return 0;
  }
  const count = Math.floor(pebbles);

  if (count < 10) {
    return Math.min(count, Math.max(1, Math.round((count / 10) * 8)));
  }
  if (count < 25) {
    return 8 + Math.round(((count - 10) / 15) * 8);
  }
  if (count < 50) {
    return 16 + Math.round(((count - 25) / 25) * 8);
  }
  if (count < 100) {
    return 24 + Math.round(((count - 50) / 50) * 8);
  }
  if (count < 250) {
    return 32 + Math.round(((count - 100) / 150) * 10);
  }
  if (count < 500) {
    return 42 + Math.round(((count - 250) / 250) * 8);
  }
  return 50;
}
