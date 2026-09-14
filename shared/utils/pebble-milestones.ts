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
 * Thresholds are canonical and must not be altered:
 *   10, 25, 50, 100, 250, 500
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
export const PEBBLE_STAGE_THRESHOLDS = [10, 25, 50, 100, 250, 500] as const;

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
    range: "500",
    desc: "An impressive, towering mount of zen.",
    unlock: null,
  },
  {
    stage: 7,
    name: "Beyond",
    range: "501+",
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

  return count > PEBBLE_STAGE_THRESHOLDS[PEBBLE_STAGE_THRESHOLDS.length - 1]
    ? MAX_PEBBLE_STAGE
    : PEBBLE_STAGE_THRESHOLDS.length;
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
      : stage === PEBBLE_STAGE_THRESHOLDS.length
        ? PEBBLE_STAGE_THRESHOLDS[PEBBLE_STAGE_THRESHOLDS.length - 1] + 1
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
