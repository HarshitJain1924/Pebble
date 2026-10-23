/**
 * reward-intent.service.ts
 * ────────────────────────
 * Resolves durable completion-reward intents (see `RewardIntentRepository`).
 *
 * Contract
 * --------
 * - A completion command records the intent BEFORE persisting the completed
 *   state, then awards inside the entity's partition lock. If the award write
 *   fails, the intent survives and the completion still commits.
 * - If the INTENT cannot be persisted, the completion ABORTS before any state
 *   change (`ensureRewardIntent` throws). The entity write and the ledger write
 *   are separate keys, so the only way to keep the invariant "a completed
 *   entity always has a recoverable reward" is to refuse the completion rather
 *   than commit a state that could never be repaired.
 * - Resolution only awards while the entity is STILL in the rewarded state:
 *   a completed Task, or a Habit with a completion entry for the intent's
 *   `dateKey`. Otherwise the intent is discarded — an uncompleted, recycled,
 *   deleted or tombstoned entity is never paid later.
 * - `earnPebble` is idempotent by `rewardId`, so concurrent resolution (startup
 *   pass vs. a user re-tap) converges on exactly one Pebble.
 * - The 15/day cap keeps its "dropped by design, no backlog" semantics: a
 *   `cap_reached` outcome clears the intent instead of leaving it to be paid on
 *   a later day.
 */
import { HabitRepository, TaskRepository } from "@/repositories";
import { TombstoneRepository } from "@/repositories/TombstoneRepository";
import {
  RewardIntentRepository,
  type RewardIntent,
} from "@/repositories/RewardIntentRepository";
import { earnPebbleWithOutcome } from "@/features/profile/services/pebble.service";
import { withLock } from "@/shared/utils/mutex";

/** Partition mutex that guards the intent's entity (same key commands use). */
export function rewardIntentPartitionKey(intent: RewardIntent): string {
  return `pebble:v1:${intent.entityType}s:${intent.workspaceId}`;
}

/**
 * The owed-reward record could not be persisted. Completion callers let this
 * propagate BEFORE writing the completed state, so a failed completion leaves no
 * partial state behind: no entity change, no event, no plugin dispatch.
 */
export class RewardIntentPersistenceError extends Error {
  readonly rewardId: string;
  readonly originalError: unknown;

  constructor(rewardId: string, originalError: unknown) {
    super(
      `[RewardIntent] Could not record the owed reward for ${rewardId}; completion aborted before any state change`,
    );
    this.name = "RewardIntentPersistenceError";
    this.rewardId = rewardId;
    this.originalError = originalError;
  }
}

/**
 * Record an owed reward, or fail the completion.
 *
 * Fail-closed by design: completing without a durable intent would produce
 * exactly the state this ledger exists to prevent (a completed entity whose
 * Pebble can never be recovered if the award also fails). Callers invoke this
 * before persisting the completed state, so throwing here is a no-op mutation.
 */
export async function ensureRewardIntent(intent: RewardIntent): Promise<void> {
  try {
    await RewardIntentRepository.addIntent(intent);
  } catch (e) {
    throw new RewardIntentPersistenceError(intent.rewardId, e);
  }
}

/** Drop an owed reward without paying it (uncompletion, or no longer owed). */
export async function discardRewardIntent(rewardId: string): Promise<void> {
  try {
    await RewardIntentRepository.removeIntent(rewardId);
  } catch (e) {
    console.warn(`[RewardIntent] Failed to discard intent ${rewardId}`, e);
  }
}

/**
 * Award an owed reward and clear its intent.
 *
 * MUST be called while holding `rewardIntentPartitionKey(intent)` so the
 * rewarded-state verification and the award are serialized against
 * complete/uncomplete for the same entity.
 */
export async function awardOwedRewardUnlocked(
  intent: RewardIntent,
): Promise<boolean> {
  try {
    const outcome = await earnPebbleWithOutcome(intent.type, intent.rewardId);
    // `awarded` / `already_earned` / `cap_reached` / `conflict` are all terminal:
    // none of them will produce a Pebble by retrying this intent.
    await RewardIntentRepository.removeIntent(intent.rewardId);
    return outcome === "awarded" || outcome === "already_earned";
  } catch (e) {
    // Transient write failure: keep the intent so startup/retry can repair it.
    console.warn(
      `[RewardIntent] Failed to credit ${intent.rewardId}; intent retained for recovery`,
      e,
    );
    return false;
  }
}

async function isRewardStillOwed(intent: RewardIntent): Promise<boolean> {
  if (intent.entityType === "task") {
    const task = await TaskRepository.getTask(intent.entityId, intent.workspaceId);
    if (!task || task.status !== "completed") return false;
    return !(await TombstoneRepository.isTombstoned(
      "task",
      intent.entityId,
      task.lifecycleGeneration,
    ));
  }

  if (!intent.dateKey) return false;
  const habit = await HabitRepository.getHabit(intent.entityId, intent.workspaceId);
  if (!habit) return false;
  const completedForDate = (habit.completionHistory || []).some(
    (entry) => entry.date === intent.dateKey,
  );
  if (!completedForDate) return false;
  return !(await TombstoneRepository.isTombstoned(
    "habit",
    intent.entityId,
    habit.lifecycleGeneration,
  ));
}

/**
 * Resolve one owed reward (idempotent). Used on the "already completed" replay
 * path and by the startup pass.
 */
export async function resolveRewardIntent(rewardId: string): Promise<boolean> {
  let intent: RewardIntent | undefined;
  try {
    const intents = await RewardIntentRepository.getIntents();
    intent = intents.find((entry) => entry.rewardId === rewardId);
  } catch (e) {
    console.warn("[RewardIntent] Failed to read reward intents", e);
    return false;
  }
  if (!intent) return false;

  const target = intent;
  try {
    return await withLock(rewardIntentPartitionKey(target), async () => {
      if (!(await isRewardStillOwed(target))) {
        await RewardIntentRepository.removeIntent(target.rewardId);
        return false;
      }
      return awardOwedRewardUnlocked(target);
    });
  } catch (e) {
    // Verification itself failed (e.g. storage read error): keep the intent.
    console.warn(
      `[RewardIntent] Could not verify/credit ${target.rewardId}; intent retained`,
      e,
    );
    return false;
  }
}

export interface RewardIntentResolutionReport {
  considered: number;
  credited: number;
  discardedOrAlreadySettled: number;
  retained: number;
}

/**
 * Startup recovery: converge every owed reward. Serialized per entity by the
 * partition lock; safe to run concurrently with user completion commands.
 */
export async function resolveAllRewardIntents(): Promise<RewardIntentResolutionReport> {
  const report: RewardIntentResolutionReport = {
    considered: 0,
    credited: 0,
    discardedOrAlreadySettled: 0,
    retained: 0,
  };

  let intents: RewardIntent[] = [];
  try {
    intents = await RewardIntentRepository.getIntents();
  } catch (e) {
    console.warn("[RewardIntent] Startup resolution skipped: unreadable ledger", e);
    return report;
  }

  const settledOrCredited: string[] = [];
  for (const intent of intents) {
    report.considered++;
    if (await resolveRewardIntent(intent.rewardId)) {
      settledOrCredited.push(intent.rewardId);
    }
  }

  const remaining = await RewardIntentRepository.getIntents().catch(() => intents);
  const remainingIds = new Set(remaining.map((entry) => entry.rewardId));
  report.retained = remainingIds.size;
  report.credited = settledOrCredited.length;
  report.discardedOrAlreadySettled = Math.max(
    0,
    intents.length - report.credited - report.retained,
  );

  return report;
}
