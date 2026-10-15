import AsyncStorage from "@react-native-async-storage/async-storage";
import { UiStateRepository } from "@/repositories/UiStateRepository";
import { GraphRepository } from "@/repositories/GraphRepository";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

const storage = AsyncStorage as typeof AsyncStorage;

beforeEach(async () => {
  await storage.clear();
  jest.restoreAllMocks();
});

describe("Phase 0 individual-key concurrency", () => {
  test("preserves both fields across concurrent UiStateRepository.saveUiState calls", async () => {
    const a = UiStateRepository.saveUiState({ activeWorkspaceId: "workspace-a" });
    const b = UiStateRepository.saveUiState({ themeCache: "light" });
    await Promise.all([a, b]);
    const persisted = JSON.parse((await storage.getItem("pebble:v1:ui_state"))!);
    expect(persisted.activeWorkspaceId).toBe("workspace-a");
    expect(persisted.themeCache).toBe("light");
  });

  test("preserves both concurrent focus-session appends", async () => {
    const a = GraphRepository.saveFocusSession({ id: "focus-a", startedAt: 1, duration: 10 });
    const b = GraphRepository.saveFocusSession({ id: "focus-b", startedAt: 2, duration: 20 });
    await Promise.all([a, b]);
    const persisted = JSON.parse((await storage.getItem("pebble:v1:focus_sessions"))!);
    expect(persisted.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining(["focus-a", "focus-b"]));
  });

  test("preserves both concurrent system-event appends", async () => {
    const a = GraphRepository.logSystemEvent({ id: "event-a", workspaceId: "ws", itemId: "task-a", itemType: "task", action: "created", timestamp: 1 });
    const b = GraphRepository.logSystemEvent({ id: "event-b", workspaceId: "ws", itemId: "task-b", itemType: "task", action: "completed", timestamp: 2 });
    await Promise.all([a, b]);
    const persisted = JSON.parse((await storage.getItem("pebble:v1:system_event_log"))!);
    expect(persisted.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining(["event-a", "event-b"]));
  });
});
