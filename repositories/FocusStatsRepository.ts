/**
 * FocusStatsRepository.ts
 * ───────────────────────
 * Persistence for the persisted Focus counters (`todoapp:focus:stats`).
 *
 * Ownership:
 * - `completedToday` / `totalFocusTime` are persisted counters read by
 *   `app/profile/stats.tsx` and `features/profile/services/achievement-stats.service.ts`.
 * - `creditedSessionIds` is the durable idempotency ledger for completed timer
 *   sessions. A focus session credit is identified by its stable session id, so
 *   a retried completion (app killed mid-commit, background expiry, concurrent
 *   recovery trigger) converges on exactly one credit instead of double-counting.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { withLock } from "@/shared/utils/mutex";
import { getTodayDateKey } from "@/shared/utils/date-key";

export const FOCUS_STATS_KEY = "todoapp:focus:stats";
const FOCUS_STATS_LOCK = "pebble:v1:focus_stats";
/** Bounded ledger: enough history to cover any realistic retry window. */
const MAX_CREDITED_SESSION_IDS = 250;

export interface FocusStats {
  completedToday: number;
  totalFocusTime: number;
  /**
   * Local date (`YYYY-MM-DD`) `completedToday` belongs to. A counter without a
   * date is treated as stale (its day has rolled over) rather than lifetime.
   */
  completedTodayDate?: string;
  /** Session ids already credited to the counters above. */
  creditedSessionIds?: string[];
  updatedAt?: number;
}

function normalize(raw: any): FocusStats {
  return {
    completedToday: typeof raw?.completedToday === "number" ? raw.completedToday : 0,
    totalFocusTime: typeof raw?.totalFocusTime === "number" ? raw.totalFocusTime : 0,
    completedTodayDate:
      typeof raw?.completedTodayDate === "string"
        ? raw.completedTodayDate
        : undefined,
    creditedSessionIds: Array.isArray(raw?.creditedSessionIds)
      ? raw.creditedSessionIds.filter((id: unknown) => typeof id === "string")
      : [],
    updatedAt: typeof raw?.updatedAt === "number" ? raw.updatedAt : undefined,
  };
}

export class FocusStatsRepository {
  /**
   * Read the persisted counters.
   *
   * `completedToday` is a DAILY counter: a value recorded on an earlier day is
   * reported as 0 (and rewritten by the next credit) instead of being surfaced
   * as "today" forever.
   */
  static async getFocusStats(): Promise<FocusStats> {
    const raw = await AsyncStorage.getItem(FOCUS_STATS_KEY);
    if (!raw) return normalize(null);
    try {
      const stats = normalize(JSON.parse(raw));
      if (stats.completedTodayDate !== getTodayDateKey()) {
        return { ...stats, completedToday: 0 };
      }
      return stats;
    } catch {
      return normalize(null);
    }
  }

  /**
   * Credit one completed focus session exactly once.
   *
   * Returns `credited: false` when this session id was already credited, so the
   * caller can skip other one-shot side effects if it needs to.
   */
  static async creditCompletedSession(
    sessionId: string,
    minutes: number,
  ): Promise<{ credited: boolean; stats: FocusStats }> {
    if (!sessionId || typeof sessionId !== "string") {
      throw new Error("FocusStatsRepository.creditCompletedSession: sessionId is required");
    }

    return withLock(FOCUS_STATS_LOCK, async () => {
      const current = await this.getFocusStats();
      const creditedIds = current.creditedSessionIds || [];
      if (creditedIds.includes(sessionId)) {
        return { credited: false, stats: current };
      }

      const safeMinutes =
        Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 0;
      const today = getTodayDateKey();
      // A previous day's count must not be carried into today.
      const completedToday =
        (current.completedTodayDate === today ? current.completedToday : 0) + 1;

      const next: FocusStats = {
        completedToday,
        completedTodayDate: today,
        totalFocusTime: current.totalFocusTime + safeMinutes,
        creditedSessionIds: [...creditedIds, sessionId].slice(-MAX_CREDITED_SESSION_IDS),
        updatedAt: Date.now(),
      };

      await AsyncStorage.setItem(FOCUS_STATS_KEY, JSON.stringify(next));
      return { credited: true, stats: next };
    });
  }

  /**
   * Add incremental focus minutes earned before a session completes (the timer
   * credits paused/backgrounded stretches as they happen). Incremental by
   * design — completion is what must be exactly-once.
   */
  static async addFocusMinutes(minutes: number): Promise<FocusStats> {
    return withLock(FOCUS_STATS_LOCK, async () => {
      const current = await this.getFocusStats();
      const safeMinutes =
        Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 0;
      const today = getTodayDateKey();
      const next: FocusStats = {
        ...current,
        // Carrying a stale day's count forward would resurrect yesterday's
        // completions; reset it while adding incremental minutes.
        completedToday:
          current.completedTodayDate === today ? current.completedToday : 0,
        completedTodayDate: today,
        totalFocusTime: current.totalFocusTime + safeMinutes,
        updatedAt: Date.now(),
      };
      await AsyncStorage.setItem(FOCUS_STATS_KEY, JSON.stringify(next));
      return next;
    });
  }
}
