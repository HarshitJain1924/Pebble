import { GraphRepository } from "@/repositories/GraphRepository";
import { FocusStatsRepository } from "@/repositories/FocusStatsRepository";
import { earnPebble } from "@/features/profile/services/pebble.service";
import { withLock } from "@/shared/utils/mutex";

export interface RecordFocusSessionOptions {
  sessionId?: string;
  startedAt?: number;
  endedAt?: number;
  /**
   * Minutes already credited to `totalFocusTime` while the session was paused or
   * backgrounded. Only the remainder is credited at completion so a session is
   * never counted twice.
   */
  loggedMinutes?: number;
}

export class SystemCommandHandler {
  static async logSystemEvent(eventName: string, details?: any): Promise<void> {
    await GraphRepository.logSystemEvent({
      id: `evt_${Date.now()}`,
      eventType: eventName,
      timestamp: Date.now(),
      details: details || {},
    });
  }

  /**
   * Durably record one completed focus session.
   *
   * Exactly-once contract (per stable `sessionId`):
   * - The completion is serialized under `pebble:v1:focus_completion:<sessionId>`
   *   so concurrent expiry/recovery triggers cannot both credit it.
   * - The session record is an idempotent upsert (GraphRepository).
   * - The persisted stats counters are credited once via the durable session
   *   ledger (FocusStatsRepository.creditCompletedSession).
   * - The Pebble award is keyed by `focus:<sessionId>` (earnPebble is idempotent).
   * - The focus→target relationship uses a deterministic id, so a retry updates
   *   the same edge instead of appending a duplicate one.
   *
   * Every side effect is individually idempotent, so a retry both converges and
   * repairs a previous partial failure (e.g. crash after session write but
   * before the reward).
   */
  static async recordFocusSession(
    durationSeconds: number,
    taskId?: string,
    itemType?: "task" | "habit" | "checklist",
    options?: RecordFocusSessionOptions,
  ): Promise<void> {
    const sessionId = options?.sessionId || `focus_${Date.now()}`;
    const endedAt = options?.endedAt || Date.now();
    const duration = Math.floor(durationSeconds);
    const startedAt =
      options?.startedAt || endedAt - Math.floor(durationSeconds * 1000);

    const session = {
      id: sessionId,
      taskId,
      startedAt,
      endedAt,
      duration,
      completedAt: endedAt,
    };

    await withLock(`pebble:v1:focus_completion:${sessionId}`, async () => {
      // 1. Durable session record (upsert by sessionId).
      await GraphRepository.saveFocusSession(session);

      // 2. Stats counters, credited exactly once per session id.
      const alreadyLogged = Math.max(0, Math.floor(options?.loggedMinutes ?? 0));
      const remainingMinutes = Math.max(0, Math.floor(duration / 60) - alreadyLogged);
      await FocusStatsRepository.creditCompletedSession(
        sessionId,
        remainingMinutes,
      );

      // 3. Reward (idempotent by rewardId).
      await earnPebble("focus", `focus:${sessionId}`);

      // 4. Relationship (deterministic id + endpoint dedupe => idempotent).
      if (taskId && itemType) {
        await GraphRepository.saveRelationship({
          id: `rel_focus_${sessionId}_${taskId}`,
          source: { id: sessionId, type: "focus" },
          target: { id: taskId, type: itemType as any },
          relationType: "focuses_on",
          createdAt: endedAt,
        });
      }
    });
  }
}
