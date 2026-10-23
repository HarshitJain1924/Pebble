import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

import { GraphRepository } from "@/repositories/GraphRepository";
import { FocusStatsRepository } from "@/repositories/FocusStatsRepository";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { PEBBLE_LOG_KEY } from "@/features/profile/services/pebble.service";

const DURATION = 25 * 60; // 25 minutes
const START = 1_700_000_000_000;
const END = START + DURATION * 1000;

async function readPebbleLog(): Promise<any[]> {
  const raw = await AsyncStorage.getItem(PEBBLE_LOG_KEY);
  return raw ? JSON.parse(raw) : [];
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
