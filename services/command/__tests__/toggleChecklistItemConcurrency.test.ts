import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import {
  ChecklistRepository,
  RecycleBinRepository,
  WorkspaceRepository,
  TombstoneRepository,
} from "@/repositories";
import {
  INBOX_WORKSPACE_ID,
  type Checklist,
  type Workspace,
} from "@/shared/types/domain.types";
import { PEBBLE_LOG_KEY } from "@/features/profile/services/pebble.service";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const WS = "ws-checklists";

const makeChecklist = (
  id: string,
  overrides: Partial<Checklist> = {},
): Checklist => ({
  id,
  workspaceId: WS,
  title: `Checklist ${id}`,
  items: [
    { id: "item-1", title: "Item 1", completed: false },
    { id: "item-2", title: "Item 2", completed: false },
  ],
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
});

describe("toggleChecklistItem hostile concurrency (real production path)", () => {
  it("A: concurrent toggles of distinct items on the same checklist preserve both changes and bump revision monotonically", async () => {
    await ChecklistRepository.saveChecklistUnlocked(makeChecklist("chk-distinct"));

    // Concurrently toggle item-1 and item-2
    const [res1, res2] = await Promise.all([
      EntityCommandService.toggleChecklistItem("chk-distinct", "item-1", WS, {
        source: "test",
      }),
      EntityCommandService.toggleChecklistItem("chk-distinct", "item-2", WS, {
        source: "test",
      }),
    ]);

    expect(res1).not.toBeNull();
    expect(res2).not.toBeNull();

    const stored = await ChecklistRepository.getChecklist("chk-distinct", WS);
    expect(stored).not.toBeNull();
    expect(stored!.items[0].completed).toBe(true);
    expect(stored!.items[1].completed).toBe(true);
    expect(stored!.revision).toBe(3); // Initial 1 -> 2 -> 3

    // Since both items are completed, exactly one Pebble reward must be earned
    expect(await pebbleRewardCount("checklist:chk-distinct")).toBe(1);
    expect(stored!.pebbleAwarded).toBe(true);
  });

  it("B: concurrent item toggle vs item deletion on the same item does not resurrect deleted item", async () => {
    await ChecklistRepository.saveChecklistUnlocked(
      makeChecklist("chk-delete-race", {
        items: [
          { id: "item-del", title: "To Delete", completed: false },
          { id: "item-keep", title: "To Keep", completed: false },
        ],
      }),
    );

    // Concurrently delete item-del and toggle item-del
    await Promise.all([
      EntityCommandService.deleteChecklistItem("chk-delete-race", "item-del", WS, {
        source: "test",
      }),
      EntityCommandService.toggleChecklistItem("chk-delete-race", "item-del", WS, {
        source: "test",
      }),
    ]);

    const stored = await ChecklistRepository.getChecklist("chk-delete-race", WS);
    expect(stored).not.toBeNull();
    // item-del must NOT be in the items array regardless of execution order
    const remainingIds = stored!.items.map((i) => i.id);
    expect(remainingIds).not.toContain("item-del");
    expect(remainingIds).toContain("item-keep");
  });

  it("C: an item toggle against a concurrently moved checklist does not resurrect in source workspace", async () => {
    await WorkspaceRepository.saveWorkspace({
      id: "ws-target",
      name: "Target WS",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1,
      updatedAt: 1,
    } as Workspace);

    await ChecklistRepository.saveChecklistUnlocked(makeChecklist("chk-move"));

    // Move completes before the toggle's locked read
    await EntityCommandService.moveChecklist("chk-move", WS, "ws-target", {
      skipEvents: true,
      skipAnalytics: true,
    });

    const result = await EntityCommandService.toggleChecklistItem(
      "chk-move",
      "item-1",
      WS,
      { source: "test" },
    );

    // Must return null because checklist is no longer in WS
    expect(result).toBeNull();

    // Source workspace must not have resurrected checklist
    const sourceChecklists = await ChecklistRepository.getChecklists(WS);
    expect(sourceChecklists["chk-move"]).toBeUndefined();

    // Target workspace retains the checklist
    const targetChecklists = await ChecklistRepository.getChecklists("ws-target");
    expect(targetChecklists["chk-move"]).toBeDefined();
    expect(targetChecklists["chk-move"].items[0].completed).toBe(false);
  });

  it("D: an item toggle against a concurrently recycled checklist does not resurrect in active partition", async () => {
    await ChecklistRepository.saveChecklistUnlocked(makeChecklist("chk-recycle"));

    // Recycle checklist into the recycle bin
    await EntityCommandService.recycleChecklist("chk-recycle", WS, {
      skipEvents: true,
    });

    const result = await EntityCommandService.toggleChecklistItem(
      "chk-recycle",
      "item-1",
      WS,
      { source: "test" },
    );

    expect(result).toBeNull();

    // Active partition must remain empty
    const active = await ChecklistRepository.getChecklists(WS);
    expect(active["chk-recycle"]).toBeUndefined();

    // Recycle bin has the snapshot
    const bin = await RecycleBinRepository.getRecycleBinItems();
    expect(bin.some((b) => b.entityId === "chk-recycle")).toBe(true);
  });

  it("E: an item toggle against a permanently deleted checklist is rejected and honors tombstones", async () => {
    await ChecklistRepository.saveChecklistUnlocked(makeChecklist("chk-perm-del"));

    await EntityCommandService.permanentlyDeleteChecklist("chk-perm-del", WS, {
      skipEvents: true,
      skipAnalytics: true,
    });

    const result = await EntityCommandService.toggleChecklistItem(
      "chk-perm-del",
      "item-1",
      WS,
      { source: "test" },
    );

    expect(result).toBeNull();

    const active = await ChecklistRepository.getChecklists(WS);
    expect(active["chk-perm-del"]).toBeUndefined();

    const isTombstoned = await TombstoneRepository.isTombstoned("checklist", "chk-perm-del", 1);
    expect(isTombstoned).toBe(true);
  });

  it("F: rapid concurrent double-toggle of the same item converges cleanly without corrupting state", async () => {
    await ChecklistRepository.saveChecklistUnlocked(makeChecklist("chk-double-toggle"));

    // Concurrently toggle item-1 twice (rapid double-tap)
    await Promise.all([
      EntityCommandService.toggleChecklistItem("chk-double-toggle", "item-1", WS, {
        source: "test",
      }),
      EntityCommandService.toggleChecklistItem("chk-double-toggle", "item-1", WS, {
        source: "test",
      }),
    ]);

    const stored = await ChecklistRepository.getChecklist("chk-double-toggle", WS);
    expect(stored).not.toBeNull();
    // false -> true -> false
    expect(stored!.items[0].completed).toBe(false);
    expect(stored!.revision).toBe(3); // 1 -> 2 -> 3
  });

  it("G: re-completing an uncompleted checklist is idempotent and does not double-award pebbles", async () => {
    await ChecklistRepository.saveChecklistUnlocked(
      makeChecklist("chk-idempotent", {
        items: [{ id: "item-only", title: "Only Item", completed: false }],
      }),
    );

    // 1. Initial complete -> awards Pebble
    await EntityCommandService.toggleChecklistItem("chk-idempotent", "item-only", WS, {
      source: "test",
    });
    expect(await pebbleRewardCount("checklist:chk-idempotent")).toBe(1);

    // 2. Uncomplete item
    await EntityCommandService.toggleChecklistItem("chk-idempotent", "item-only", WS, {
      source: "test",
    });
    const uncompleted = await ChecklistRepository.getChecklist("chk-idempotent", WS);
    expect(uncompleted!.items[0].completed).toBe(false);

    // 3. Re-complete item -> must not double-award
    await EntityCommandService.toggleChecklistItem("chk-idempotent", "item-only", WS, {
      source: "test",
    });
    const recompleted = await ChecklistRepository.getChecklist("chk-idempotent", WS);
    expect(recompleted!.items[0].completed).toBe(true);

    expect(await pebbleRewardCount("checklist:chk-idempotent")).toBe(1);
  });

  it("H: concurrent item toggles on the same occurrence of a recurring checklist serialize safely", async () => {
    const today = "2026-09-11";
    await ChecklistRepository.saveChecklistUnlocked(
      makeChecklist("chk-recurring-same-day", {
        recurrence: { frequency: "daily", interval: 1 },
        schedule: { date: today },
      }),
    );

    // Concurrently toggle item-1 and item-2 on today's occurrence
    const [res1, res2] = await Promise.all([
      EntityCommandService.toggleChecklistItem(
        "chk-recurring-same-day",
        "item-1",
        WS,
        today,
        { source: "test" },
      ),
      EntityCommandService.toggleChecklistItem(
        "chk-recurring-same-day",
        "item-2",
        WS,
        today,
        { source: "test" },
      ),
    ]);

    expect(res1).not.toBeNull();
    expect(res2).not.toBeNull();

    const stored = await ChecklistRepository.getChecklist(
      "chk-recurring-same-day",
      WS,
    );
    expect(stored).not.toBeNull();
    const occurrence = stored!.occurrenceHistory?.[today];
    expect(occurrence?.completedItemIds?.sort()).toEqual(["item-1", "item-2"]);
    expect(occurrence?.completedAt).toBeDefined();

    // Master template items remain unmutated (pure template)
    expect(stored!.items.every((i) => !i.completed)).toBe(true);
    expect(stored!.revision).toBe(3); // 1 -> 2 -> 3
  });

  it("I: concurrent item toggles across different occurrences of a recurring checklist remain strictly isolated", async () => {
    const day1 = "2026-09-11";
    const day2 = "2026-09-12";
    await ChecklistRepository.saveChecklistUnlocked(
      makeChecklist("chk-recurring-diff-days", {
        recurrence: { frequency: "daily", interval: 1 },
        schedule: { date: day1 },
      }),
    );

    // Concurrently toggle item-1 on Day 1 and item-2 on Day 2
    await Promise.all([
      EntityCommandService.toggleChecklistItem(
        "chk-recurring-diff-days",
        "item-1",
        WS,
        day1,
        { source: "test" },
      ),
      EntityCommandService.toggleChecklistItem(
        "chk-recurring-diff-days",
        "item-2",
        WS,
        day2,
        { source: "test" },
      ),
    ]);

    const stored = await ChecklistRepository.getChecklist(
      "chk-recurring-diff-days",
      WS,
    );
    expect(stored).not.toBeNull();

    // Day 1 only has item-1
    expect(stored!.occurrenceHistory?.[day1]?.completedItemIds).toEqual([
      "item-1",
    ]);

    // Day 2 only has item-2
    expect(stored!.occurrenceHistory?.[day2]?.completedItemIds).toEqual([
      "item-2",
    ]);

    // Master template items remain untouched
    expect(stored!.items.every((i) => !i.completed)).toBe(true);
    expect(stored!.revision).toBe(3);
  });
});
