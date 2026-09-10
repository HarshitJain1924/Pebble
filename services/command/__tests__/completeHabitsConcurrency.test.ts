import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { HabitCommandHandler } from "@/services/command/handlers/HabitCommandHandler";
import {
  HabitRepository,
  RecycleBinRepository,
  WorkspaceRepository,
} from "@/repositories";
import {
  INBOX_WORKSPACE_ID,
  type Habit,
  type Workspace,
} from "@/shared/types/domain.types";
import { getTodayDateKey } from "@/shared/utils/domain-selectors";
import { PEBBLE_LOG_KEY } from "@/features/profile/services/pebble.service";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const WS = "ws-habits";

const makeHabit = (id: string, overrides: Partial<Habit> = {}): Habit => ({
  id,
  workspaceId: WS,
  title: `Habit ${id}`,
  recurrence: { frequency: "daily", interval: 1 },
  completionHistory: [],
  streak: 0,
  bestStreak: 0,
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

async function pebbleRewardCount(rewardIdPrefix: string): Promise<number> {
  const raw = await AsyncStorage.getItem(PEBBLE_LOG_KEY);
  if (!raw) return 0;
  const log = JSON.parse(raw);
  return log.filter((e: any) =>
    String(e.rewardId || "").startsWith(rewardIdPrefix),
  ).length;
}

let emitSpy: jest.SpyInstance;

beforeEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();
  await WorkspaceRepository.saveWorkspace({
    id: WS,
    name: "WS",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
  } as Workspace);

  emitSpy = jest
    .spyOn(require("@/services/events/state-events"), "emitStateChange")
    .mockImplementation(() => {});
  jest
    .spyOn(
      require("@/services/analytics/productivity-history.service"),
      "recordDailyHistorySnapshot",
    )
    .mockResolvedValue(undefined);
  jest
    .spyOn(require("@/services/analytics/widget-data.service"), "syncWidgetData")
    .mockResolvedValue(undefined);
});

describe("completeHabits hostile concurrency (real production path)", () => {
  it("A: concurrent double completion of the same habit rewards exactly once", async () => {
    await HabitRepository.saveHabit(makeHabit("h-double"));
    const today = getTodayDateKey();

    await Promise.all([
      EntityCommandService.completeHabits(
        [{ habitId: "h-double", workspaceId: WS }],
        { source: "test" },
      ),
      EntityCommandService.completeHabits(
        [{ habitId: "h-double", workspaceId: WS }],
        { source: "test" },
      ),
    ]);

    const habit = (await HabitRepository.getHabits(WS))["h-double"];
    const todayEntries = (habit.completionHistory || []).filter(
      (c) => c.date === today,
    );
    expect(todayEntries).toHaveLength(1);
    expect(await pebbleRewardCount(`habit:h-double:${today}`)).toBe(1);
  });

  it("B: a habit moved out of the selected workspace is left untouched (no reward, no corruption)", async () => {
    await WorkspaceRepository.saveWorkspace({
      id: "ws-2",
      name: "WS2",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1,
      updatedAt: 1,
    } as Workspace);
    await HabitRepository.saveHabit(makeHabit("h-move"));

    // Concurrent move commits before the bulk op's locked read.
    await EntityCommandService.moveHabit("h-move", WS, "ws-2", {
      skipEvents: true,
      skipAnalytics: true,
    });

    const result = await EntityCommandService.completeHabits(
      [{ habitId: "h-move", workspaceId: WS }],
      { source: "test" },
    );

    const sourceWs = await HabitRepository.getHabits(WS);
    expect(sourceWs["h-move"]).toBeUndefined();

    const targetWs = await HabitRepository.getHabits("ws-2");
    expect(targetWs["h-move"]).toBeDefined();
    expect(targetWs["h-move"].completionHistory || []).toHaveLength(0);

    expect(await pebbleRewardCount("habit:h-move:")).toBe(0);
    expect(result).toEqual([]);
  });

  it("C: a concurrently recycled habit is never resurrected or rewarded", async () => {
    await HabitRepository.saveHabit(makeHabit("h-recycle"));

    // Concurrent recycle commits before the bulk op's locked read.
    await EntityCommandService.recycleHabit("h-recycle", WS, {
      skipEvents: true,
      skipAnalytics: true,
    });

    const result = await EntityCommandService.completeHabits(
      [{ habitId: "h-recycle", workspaceId: WS }],
      { source: "test" },
    );

    const active = await HabitRepository.getHabits(WS);
    expect(active["h-recycle"]).toBeUndefined();

    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.filter((b) => b.entityId === "h-recycle")).toHaveLength(1);

    expect(await pebbleRewardCount("habit:h-recycle:")).toBe(0);
    expect(result).toEqual([]);
  });

  it("D: a mid-batch failure does not abort the remaining habits nor suppress events for committed ones", async () => {
    await HabitRepository.saveHabit(makeHabit("h-a"));
    await HabitRepository.saveHabit(makeHabit("h-b"));
    await HabitRepository.saveHabit(makeHabit("h-c"));
    const today = getTodayDateKey();

    // Inject a failure for the MIDDLE item only (models a concurrent
    // delete/recreate lifecycle conflict on h-b at the command boundary).
    const originalCompleteHabit = HabitCommandHandler.completeHabit;
    let call = 0;
    jest
      .spyOn(HabitCommandHandler, "completeHabit")
      .mockImplementation(async (habitId: string, workspaceId: string, opts?: any) => {
        call++;
        if (call === 2) {
          throw new Error("injected lifecycle conflict on h-b");
        }
        return originalCompleteHabit.call(
          HabitCommandHandler,
          habitId,
          workspaceId,
          opts,
        );
      });

    const result = await EntityCommandService.completeHabits(
      [
        { habitId: "h-a", workspaceId: WS },
        { habitId: "h-b", workspaceId: WS },
        { habitId: "h-c", workspaceId: WS },
      ],
      { source: "test" },
    );

    // Committed subset: h-a and h-c completed + rewarded; h-b left active.
    const active = await HabitRepository.getHabits(WS);
    expect(
      (active["h-a"].completionHistory || []).filter((c) => c.date === today),
    ).toHaveLength(1);
    expect(
      (active["h-c"].completionHistory || []).filter((c) => c.date === today),
    ).toHaveLength(1);
    expect(active["h-b"].completionHistory || []).toHaveLength(0);

    expect(await pebbleRewardCount(`habit:h-a:${today}`)).toBe(1);
    expect(await pebbleRewardCount(`habit:h-c:${today}`)).toBe(1);
    expect(await pebbleRewardCount(`habit:h-b:${today}`)).toBe(0);

    // One aggregate event reflects the committed subset.
    expect(emitSpy).toHaveBeenCalledWith("habits_changed", "test");

    // Successful items are returned; the failed one is omitted.
    expect(result.map((h) => h.id).sort()).toEqual(["h-a", "h-c"]);
  });

  it("E: repeated invocation is idempotent — no duplicate completions or rewards", async () => {
    await HabitRepository.saveHabit(makeHabit("h-idem"));
    const today = getTodayDateKey();

    await EntityCommandService.completeHabits(
      [{ habitId: "h-idem", workspaceId: WS }],
      { source: "test" },
    );
    await EntityCommandService.completeHabits(
      [{ habitId: "h-idem", workspaceId: WS }],
      { source: "test" },
    );

    const habit = (await HabitRepository.getHabits(WS))["h-idem"];
    const todayEntries = (habit.completionHistory || []).filter(
      (c) => c.date === today,
    );
    expect(todayEntries).toHaveLength(1);
    expect(await pebbleRewardCount(`habit:h-idem:${today}`)).toBe(1);
  });
});