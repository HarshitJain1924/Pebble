import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

import { GraphRepository } from "@/repositories/GraphRepository";
import { RewardIntentRepository } from "@/repositories/RewardIntentRepository";
import { FocusStatsRepository } from "@/repositories/FocusStatsRepository";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import {
  PEBBLE_LOG_KEY,
  earnPebble,
} from "@/features/profile/services/pebble.service";

const DURATION = 25 * 60; // 25 minutes
const START = 1_700_000_000_000;
const END = START + DURATION * 1000;

async function readPebbleLog(): Promise<any[]> {
  const raw = await AsyncStorage.getItem(PEBBLE_LOG_KEY);
  return raw ? JSON.parse(raw) : [];
}

/**
 * Fail the reward-ledger write only, leaving every other durable write intact.
 * The completion must still commit and leave the owed reward recoverable.
 */
function failPebbleWrites(): () => void {
  const setItem = AsyncStorage.setItem as unknown as jest.Mock;
  const original = setItem.getMockImplementation();
  setItem.mockImplementation(async (key: string, value: string) => {
    if (key === PEBBLE_LOG_KEY) throw new Error("reward log unavailable");
    return original ? original(key, value) : undefined;
  });
  return () => setItem.mockImplementation(original as any);
}

describe("Focus session completion durability & idempotency", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
    GraphRepository.resetCache();
  });

  it("records one session, one reward, one relationship and one stats credit", async () => {
    await EntityCommandService.recordFocusSession(DURATION, "task-1", "task", {
      sessionId: "focus_once",
      startedAt: START,
      endedAt: END,
    });

    const sessions = await GraphRepository.getFocusSessions();
    expect(sessions.filter((s) => s.id === "focus_once")).toHaveLength(1);
    expect(sessions[0].duration).toBe(DURATION);

    const relationships = await GraphRepository.getAllRelationships();
    expect(
      relationships.filter((r) => r.source.id === "focus_once"),
    ).toHaveLength(1);

    const log = await readPebbleLog();
    expect(log.filter((e) => e.rewardId === "focus:focus_once")).toHaveLength(1);

    const stats = await FocusStatsRepository.getFocusStats();
    expect(stats.completedToday).toBe(1);
    expect(stats.totalFocusTime).toBe(25);
    expect(stats.creditedSessionIds).toEqual(["focus_once"]);
  });

  it("is idempotent: repeating the same completion does not duplicate anything", async () => {
    const options = {
      sessionId: "focus_repeat",
      startedAt: START,
      endedAt: END,
    };
    await EntityCommandService.recordFocusSession(DURATION, "task-1", "task", options);
    await EntityCommandService.recordFocusSession(DURATION, "task-1", "task", options);
    await EntityCommandService.recordFocusSession(DURATION, "task-1", "task", options);

    expect(
      (await GraphRepository.getFocusSessions()).filter(
        (s) => s.id === "focus_repeat",
      ),
    ).toHaveLength(1);
    expect(
      (await GraphRepository.getAllRelationships()).filter(
        (r) => r.source.id === "focus_repeat",
      ),
    ).toHaveLength(1);

    const log = await readPebbleLog();
    expect(log.filter((e) => e.rewardId === "focus:focus_repeat")).toHaveLength(1);

    const stats = await FocusStatsRepository.getFocusStats();
    expect(stats.completedToday).toBe(1);
    expect(stats.totalFocusTime).toBe(25);
  });

  it("credits only the unlogged remainder of a session", async () => {
    await EntityCommandService.recordFocusSession(DURATION, undefined, undefined, {
      sessionId: "focus_partial",
      startedAt: START,
      endedAt: END,
      loggedMinutes: 10,
    });

    const stats = await FocusStatsRepository.getFocusStats();
    expect(stats.totalFocusTime).toBe(15);
    expect(stats.completedToday).toBe(1);
  });

  it("concurrent completions of the same session credit it exactly once", async () => {
    const options = {
      sessionId: "focus_concurrent",
      startedAt: START,
      endedAt: END,
    };

    await Promise.all([
      EntityCommandService.recordFocusSession(DURATION, "task-1", "task", options),
      EntityCommandService.recordFocusSession(DURATION, "task-1", "task", options),
    ]);

    expect(
      (await GraphRepository.getFocusSessions()).filter(
        (s) => s.id === "focus_concurrent",
      ),
    ).toHaveLength(1);

    const stats = await FocusStatsRepository.getFocusStats();
    expect(stats.completedToday).toBe(1);
    expect(stats.totalFocusTime).toBe(25);
  });

  it("a retry after a crash between the session write and the stats credit credits once", async () => {
    const creditSpy = jest
      .spyOn(FocusStatsRepository, "creditCompletedSession")
      .mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(
      EntityCommandService.recordFocusSession(DURATION, "task-1", "task", {
        sessionId: "focus_after_session",
        startedAt: START,
        endedAt: END,
      }),
    ).rejects.toThrow("storage unavailable");
    creditSpy.mockRestore();

    // Only the session record committed; no stats credit and no reward yet.
    expect(
      (await GraphRepository.getFocusSessions()).filter(
        (s) => s.id === "focus_after_session",
      ),
    ).toHaveLength(1);
    expect((await FocusStatsRepository.getFocusStats()).totalFocusTime).toBe(0);
    expect(
      (await readPebbleLog()).filter(
        (e) => e.rewardId === "focus:focus_after_session",
      ),
    ).toHaveLength(0);

    await EntityCommandService.recordFocusSession(DURATION, "task-1", "task", {
      sessionId: "focus_after_session",
      startedAt: START,
      endedAt: END,
    });

    expect(
      (await GraphRepository.getFocusSessions()).filter(
        (s) => s.id === "focus_after_session",
      ),
    ).toHaveLength(1);
    const stats = await FocusStatsRepository.getFocusStats();
    expect(stats.completedToday).toBe(1);
    expect(stats.totalFocusTime).toBe(25);
    expect(
      (await readPebbleLog()).filter(
        (e) => e.rewardId === "focus:focus_after_session",
      ),
    ).toHaveLength(1);
  });

  it("a failure between the stats credit and the reward keeps the completion and credits exactly once on retry", async () => {
    // The award write fails: the owed reward must stay durably recoverable and
    // must NOT fail a completion whose session and stats already committed.
    const restorePebbleWrites = failPebbleWrites();

    await EntityCommandService.recordFocusSession(DURATION, "task-1", "task", {
      sessionId: "focus_after_stats",
      startedAt: START,
      endedAt: END,
    });
    restorePebbleWrites();

    const afterFailure = await FocusStatsRepository.getFocusStats();
    expect(afterFailure.completedToday).toBe(1);
    expect(afterFailure.totalFocusTime).toBe(25);
    expect(
      (await readPebbleLog()).filter(
        (e) => e.rewardId === "focus:focus_after_stats",
      ),
    ).toHaveLength(0);
    expect(
      (await RewardIntentRepository.getIntents()).map((i) => i.rewardId),
    ).toEqual(["focus:focus_after_stats"]);

    // Retry of the same stable session id (timer recovery).
    await EntityCommandService.recordFocusSession(DURATION, "task-1", "task", {
      sessionId: "focus_after_stats",
      startedAt: START,
      endedAt: END,
    });

    const stats = await FocusStatsRepository.getFocusStats();
    expect(stats.completedToday).toBe(1);
    expect(stats.totalFocusTime).toBe(25);
    expect(
      (await readPebbleLog()).filter(
        (e) => e.rewardId === "focus:focus_after_stats",
      ),
    ).toHaveLength(1);
    expect(
      (await GraphRepository.getFocusSessions()).filter(
        (s) => s.id === "focus_after_stats",
      ),
    ).toHaveLength(1);
  });

  it("a retry after a crash between the reward and the relationship keeps one reward", async () => {
    expect(typeof earnPebble).toBe("function");
    const relationshipSpy = jest
      .spyOn(GraphRepository, "saveRelationship")
      .mockRejectedValueOnce(new Error("graph unavailable"));

    await expect(
      EntityCommandService.recordFocusSession(DURATION, "task-1", "task", {
        sessionId: "focus_after_reward",
        startedAt: START,
        endedAt: END,
      }),
    ).rejects.toThrow("graph unavailable");
    relationshipSpy.mockRestore();

    expect(
      (await readPebbleLog()).filter(
        (e) => e.rewardId === "focus:focus_after_reward",
      ),
    ).toHaveLength(1);

    await EntityCommandService.recordFocusSession(DURATION, "task-1", "task", {
      sessionId: "focus_after_reward",
      startedAt: START,
      endedAt: END,
    });

    expect(
      (await readPebbleLog()).filter(
        (e) => e.rewardId === "focus:focus_after_reward",
      ),
    ).toHaveLength(1);
    expect(
      (await GraphRepository.getAllRelationships()).filter(
        (r) => r.source.id === "focus_after_reward",
      ),
    ).toHaveLength(1);
    const stats = await FocusStatsRepository.getFocusStats();
    expect(stats.completedToday).toBe(1);
    expect(stats.totalFocusTime).toBe(25);
  });

  it("a retry after a partial failure converges without double crediting", async () => {
    const options = {
      sessionId: "focus_retry",
      startedAt: START,
      endedAt: END,
    };

    // Simulate a crash after the session + stats commit but while writing the
    // relationship edge.
    const relationshipSpy = jest
      .spyOn(GraphRepository, "saveRelationship")
      .mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(
      EntityCommandService.recordFocusSession(DURATION, "task-1", "task", options),
    ).rejects.toThrow("storage unavailable");
    relationshipSpy.mockRestore();

    // Session record survived the failure, so recovery can retry the same id.
    expect(
      (await GraphRepository.getFocusSessions()).filter(
        (s) => s.id === "focus_retry",
      ),
    ).toHaveLength(1);

    await EntityCommandService.recordFocusSession(DURATION, "task-1", "task", options);

    expect(
      (await GraphRepository.getFocusSessions()).filter(
        (s) => s.id === "focus_retry",
      ),
    ).toHaveLength(1);
    expect(
      (await GraphRepository.getAllRelationships()).filter(
        (r) => r.source.id === "focus_retry",
      ),
    ).toHaveLength(1);

    const stats = await FocusStatsRepository.getFocusStats();
    expect(stats.completedToday).toBe(1);
    expect(stats.totalFocusTime).toBe(25);

    const log = await readPebbleLog();
    expect(log.filter((e) => e.rewardId === "focus:focus_retry")).toHaveLength(1);
  });
});
