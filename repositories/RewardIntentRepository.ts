/**
 * RewardIntentRepository.ts
 * ────────────────────────
 * Durable "reward owed" ledger for completion rewards.
 *
 * Why this exists
 * ---------------
 * A completion command persists the entity first and credits the Pebble
 * afterwards. AsyncStorage cannot make those two writes atomic, so a crash (or
 * a failed reward write) between them would silently lose the reward: the
 * entity is already completed, and every replay of the command takes the
 * "already completed" branch and returns before awarding.
 *
 * The intent is written BEFORE the completed state is persisted. That ordering
 * is what makes the gap recoverable: the intent may outlive a failed entity
 * write (harmless — the resolver discards intents whose entity is not in the
 * rewarded state), but the completed state can never exist without an intent
 * that still needs resolution.
 *
 * The ledger is in-flight infrastructure, not user content:
 * - it is cleared by backup restore (see `PEBBLE_RESTORE_EPHEMERAL_KEYS`),
 * - it is never serialized into a backup,
 * - `earnPebble` remains idempotent by `rewardId`, so replaying an intent can
 *   never duplicate a Pebble.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { withLock } from "@/shared/utils/mutex";

export const REWARD_INTENTS_KEY = "pebble:v1:reward_intents";
/** Lock key: intentionally identical to the storage key (one resource). */
export const REWARD_INTENTS_LOCK = REWARD_INTENTS_KEY;

/**
 * Entity domains whose completion can owe a reward.
 *
 * `focus` is not a workspace partition: its "entity" is one durable focus
 * session in `pebble:v1:focus_sessions`, and its `workspaceId` is empty because
 * a session has no owning workspace.
 */
export type RewardIntentEntityType = "task" | "habit" | "checklist" | "focus";

export interface RewardIntent {
  /** Reward identity, identical to the `rewardId` used in the Pebble log. */
  rewardId: string;
  /** Pebble reward type recorded in the log. */
  type: RewardIntentEntityType;
  entityType: RewardIntentEntityType;
  entityId: string;
  /** Owning workspace; empty for `focus` intents (a session has none). */
  workspaceId: string;
  /**
   * Day the reward belongs to (`YYYY-MM-DD`): the Habit completion day, or the
   * recurring-Checklist occurrence that first earned the one-time reward.
   */
  dateKey?: string;
  createdAt: number;
}

export class RewardIntentRepository {
  static async getIntents(): Promise<RewardIntent[]> {
    const raw = await AsyncStorage.getItem(REWARD_INTENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(
        `[RewardIntentRepository] Stored value for "${REWARD_INTENTS_KEY}" is not an array`,
      );
    }
    return parsed.filter(
      (entry: any) =>
        entry &&
        typeof entry.rewardId === "string" &&
        entry.rewardId.length > 0 &&
        typeof entry.entityId === "string" &&
        typeof entry.workspaceId === "string",
    ) as RewardIntent[];
  }

  /**
   * Record an owed reward. Idempotent by `rewardId` (the first intent wins so a
   * retry cannot reset the owed-since timestamp).
   *
   * Strict: throws when the write fails. Completion callers treat that as
   * fail-closed — they abort before persisting the completed state, so a
   * completion can never exist without a recoverable reward.
   */
  static async addIntent(intent: RewardIntent): Promise<void> {
    if (!intent?.rewardId) {
      throw new Error("RewardIntentRepository.addIntent: rewardId is required");
    }
    await withLock(REWARD_INTENTS_LOCK, async () => {
      const intents = await this.getIntents();
      if (intents.some((existing) => existing.rewardId === intent.rewardId)) {
        return;
      }
      await AsyncStorage.setItem(
        REWARD_INTENTS_KEY,
        JSON.stringify([...intents, intent]),
      );
    });
  }

  /** Drop one owed reward (awarded, cap-dropped, or no longer owed). */
  static async removeIntent(rewardId: string): Promise<void> {
    await this.removeIntents([rewardId]);
  }

  static async removeIntents(rewardIds: string[]): Promise<void> {
    if (rewardIds.length === 0) return;
    await withLock(REWARD_INTENTS_LOCK, async () => {
      const intents = await this.getIntents();
      const ids = new Set(rewardIds);
      const remaining = intents.filter((intent) => !ids.has(intent.rewardId));
      if (remaining.length === intents.length) return;
      if (remaining.length === 0) {
        await AsyncStorage.removeItem(REWARD_INTENTS_KEY);
      } else {
        await AsyncStorage.setItem(
          REWARD_INTENTS_KEY,
          JSON.stringify(remaining),
        );
      }
    });
  }
}
