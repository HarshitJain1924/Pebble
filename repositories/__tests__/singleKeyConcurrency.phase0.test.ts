import AsyncStorage from "@react-native-async-storage/async-storage";
import { UiStateRepository } from "@/repositories/UiStateRepository";
import { GraphRepository } from "@/repositories/GraphRepository";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

const storage = AsyncStorage as typeof AsyncStorage;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
};

beforeEach(async () => {
  await storage.clear();
  jest.restoreAllMocks();
});

describe("Phase 0 individual-key concurrency", () => {
  test.failing("preserves both fields across concurrent UiStateRepository.saveUiState calls", async () => {
    const first = deferred<string | null>();
    const second = deferred<string | null>();
    let reads = 0;
    jest.spyOn(storage, "getItem").mockImplementation(async () => {
      reads += 1;
      return reads === 1 ? first.promise : second.promise;
    });
    const a = UiStateRepository.saveUiState({ activeWorkspaceId: "workspace-a" });
    const b = UiStateRepository.saveUiState({ themeCache: "light" });
    first.resolve(JSON.stringify({ activeWorkspaceId: null, completedOnboarding: false, themeCache: "dark" }));
    second.resolve(JSON.stringify({ activeWorkspaceId: null, completedOnboarding: false, themeCache: "dark" }));
    await Promise.all([a, b]);
    const persisted = JSON.parse((await storage.getItem("pebble:v1:ui_state"))!);
    expect(persisted.activeWorkspaceId).toBe("workspace-a");
    expect(persisted.themeCache).toBe("light");
  });

  test.failing("preserves both concurrent focus-session appends", async () => {
    const first = deferred<string | null>();
    const second = deferred<string | null>();
    let reads = 0;
    jest.spyOn(storage, "getItem").mockImplementation(async (key) => {
      if (key !== "pebble:v1:focus_sessions") return null;
      reads += 1;
      return reads === 1 ? first.promise : second.promise;
    });
    const a = GraphRepository.saveFocusSession({ id: "focus-a", startedAt: 1, duration: 10 });
    const b = GraphRepository.saveFocusSession({ id: "focus-b", startedAt: 2, duration: 20 });
    first.resolve("[]");
    second.resolve("[]");
    await Promise.all([a, b]);
    const persisted = JSON.parse((await storage.getItem("pebble:v1:focus_sessions"))!);
    expect(persisted.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining(["focus-a", "focus-b"]));
  });

  test.failing("preserves both concurrent system-event appends", async () => {
    const first = deferred<string | null>();
    const second = deferred<string | null>();
    let reads = 0;
    jest.spyOn(storage, "getItem").mockImplementation(async (key) => {
      if (key !== "pebble:v1:system_event_log") return null;
      reads += 1;
      return reads === 1 ? first.promise : second.promise;
    });
    const a = GraphRepository.logSystemEvent({ id: "event-a", workspaceId: "ws", itemId: "task-a", itemType: "task", action: "created", timestamp: 1 });
    const b = GraphRepository.logSystemEvent({ id: "event-b", workspaceId: "ws", itemId: "task-b", itemType: "task", action: "completed", timestamp: 2 });
    first.resolve("[]");
    second.resolve("[]");
    await Promise.all([a, b]);
    const persisted = JSON.parse((await storage.getItem("pebble:v1:system_event_log"))!);
    expect(persisted.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining(["event-a", "event-b"]));
  });
});
