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
 * A stage is "complete" at its threshold; the next stage begins one Pebble
 * later (count <= threshold), matching historical behaviour exactly.
 */

export interface PebbleMilestone {
  /** 1-based stage number. */
  stage: number;
  name: string;
  /** Human readable Pebble band, e.g. "11-25". */
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
    name: "First Steps",
    range: "0-10",
    desc: "Gathering the first stones of momentum.",
    unlock: "Sprout Jar Nest",
  },
  {
    stage: 2,
    name: "Sprout",
    range: "11-25",
    desc: "A small base of habit stones.",
    unlock: "Curious Mascot grows",
  },
  {
    stage: 3,
    name: "Zen Stream",
    range: "26-50",
    desc: "Flowing stream of productivity.",
    unlock: "Zen Energy floats",
  },
  {
    stage: 4,
    name: "Sanctuary Base",
    range: "51-100",
    desc: "Solid foundation for daily rhythm.",
    unlock: "Crowned Mascot & sparkles",
  },
  {
    stage: 5,
    name: "Pebble Hoarder",
    range: "101-250",
    desc: "A significant heap of accomplishments.",
    unlock: "Golden Jar & sparks",
  },
  {
    stage: 6,
    name: "Zen Mountain",
    range: "251-500",
    desc: "An impressive, towering mount of zen.",
    unlock: null,
  },
  {
    stage: 7,
    name: "Ocean of Focus",
    range: "500+",
    desc: "Infinite zen achieved. Master level.",
    unlock: null,
  },
];

export const MAX_PEBBLE_STAGE = PEBBLE_MILESTONES.length;

export interface MilestoneInfo extends PebbleMilestone {
  /** True when the highest stage has been reached. */
  isMaxStage: boolean;
  nextStage: number | null;
  nextStageName: string | null;
  /** Pebble count that completes the current stage (`null` at max stage). */
  nextThreshold: number | null;
  /** Pebbles earned inside the current stage band. */
  progressInStage: number;
  /** Number of Pebbles the current stage band spans. */
  stageSpan: number;
  /** 0..1 fill ratio of the current stage band. */
  progressRatio: number;
  /** Pebbles left before the next stage is reached. */
  remaining: number;
  /** Sanctuary visual unlocked when `nextThreshold` is reached. */
  nextUnlock: string | null;
}

function normalizePebbleCount(pebbles: number): number {
  if (!Number.isFinite(pebbles) || pebbles < 0) return 0;
  return Math.floor(pebbles);
}

/** Resolve the 1-based stage for a lifetime Pebble count. */
export function getPebbleStage(pebbles: number): number {
  const count = normalizePebbleCount(pebbles);
  for (let i = 0; i < PEBBLE_STAGE_THRESHOLDS.length; i += 1) {
    if (count <= PEBBLE_STAGE_THRESHOLDS[i]) return i + 1;
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

  const nextThreshold = isMaxStage ? null : PEBBLE_STAGE_THRESHOLDS[stage - 1];
  const bandStart = stage === 1 ? 0 : PEBBLE_STAGE_THRESHOLDS[stage - 2];
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
    nextStage: isMaxStage ? null : stage + 1,
    nextStageName: isMaxStage ? null : PEBBLE_MILESTONES[stage].name,
    nextThreshold,
    progressInStage,
    stageSpan,
    progressRatio,
    remaining: isMaxStage ? 0 : Math.max(0, (nextThreshold as number) - count),
    nextUnlock: isMaxStage ? null : definition.unlock,
  };
}

/** Convenience: how many Pebbles remain before the next stage (0 at max). */
export function getPebblesToNextStage(pebbles: number): number {
  return getMilestoneInfo(pebbles).remaining;
}
