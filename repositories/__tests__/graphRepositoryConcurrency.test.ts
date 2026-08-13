import AsyncStorage from "@react-native-async-storage/async-storage";
import { GraphRepository } from "@/repositories/GraphRepository";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const storage = AsyncStorage as typeof AsyncStorage;

describe("GraphRepository Concurrent Append Regression Suite", () => {
  beforeEach(async () => {
    await storage.clear();
    jest.restoreAllMocks();
    GraphRepository.resetCache();
  });

  it("1. two concurrent focus-session appends preserve both sessions", async () => {
    const p1 = GraphRepository.saveFocusSession({
      id: "focus-1",
      startedAt: 100,
      duration: 300,
    });
    const p2 = GraphRepository.saveFocusSession({
      id: "focus-2",
      startedAt: 200,
      duration: 600,
    });

    await Promise.all([p1, p2]);

    const sessions = await GraphRepository.getFocusSessions();
    expect(sessions.map((s) => s.id)).toEqual(["focus-1", "focus-2"]);
  });

  it("2. two concurrent system-event appends preserve both events", async () => {
    const p1 = GraphRepository.logSystemEvent({
      id: "event-1",
      workspaceId: "inbox",
      itemId: "task-1",
      itemType: "task",
      action: "created",
      timestamp: 100,
    });
    const p2 = GraphRepository.logSystemEvent({
      id: "event-2",
      workspaceId: "inbox",
      itemId: "task-2",
      itemType: "task",
      action: "completed",
      timestamp: 200,
    });

    await Promise.all([p1, p2]);

    const events = await GraphRepository.getSystemEvents();
    expect(events.map((e) => e.id)).toEqual(["event-1", "event-2"]);
  });

  it("3. multiple concurrent appends preserve every record", async () => {
    const count = 5;
    const promises = Array.from({ length: count }, (_, i) =>
      GraphRepository.saveFocusSession({
        id: `focus-multi-${i}`,
        startedAt: 1000 + i,
        duration: 60,
      }),
    );

    await Promise.all(promises);

    const sessions = await GraphRepository.getFocusSessions();
    expect(sessions).toHaveLength(count);
    for (let i = 0; i < count; i++) {
      expect(sessions.some((s) => s.id === `focus-multi-${i}`)).toBe(true);
    }
  });

  it("4. existing sequential behavior is unchanged", async () => {
    await GraphRepository.saveFocusSession({
      id: "seq-1",
      startedAt: 1,
      duration: 10,
    });
    await GraphRepository.saveFocusSession({
      id: "seq-2",
      startedAt: 2,
      duration: 20,
    });

    const sessions = await GraphRepository.getFocusSessions();
    expect(sessions.map((s) => s.id)).toEqual(["seq-1", "seq-2"]);
  });

  it("5. different GraphRepository storage keys do not unnecessarily block each other", async () => {
    // Concurrent operations on different keys execute independently
    const focusPromise = GraphRepository.saveFocusSession({
      id: "focus-key-test",
      startedAt: 1,
      duration: 10,
    });
    const eventPromise = GraphRepository.logSystemEvent({
      id: "event-key-test",
      workspaceId: "ws",
      itemId: "item-1",
      itemType: "task",
      action: "created",
      timestamp: 1,
    });

    await Promise.all([focusPromise, eventPromise]);

    const events = await GraphRepository.getSystemEvents();
    expect(events.map((e) => e.id)).toEqual(["event-key-test"]);

    const sessions = await GraphRepository.getFocusSessions();
    expect(sessions.map((s) => s.id)).toEqual(["focus-key-test"]);
  });
});
