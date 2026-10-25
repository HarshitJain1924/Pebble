/**
 * Hostile test suite for deduplicateEntityMap.
 *
 * Primary invariant under test:
 *   An entity may only appear in a workspace bucket if
 *   item.workspaceId === bucket workspace ID.
 *   Any other entity must be dropped — never silently reassigned.
 */
import { deduplicateEntities, deduplicateEntityMap } from "../deduplication";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(
  id: string,
  workspaceId: string | undefined,
  updatedAt: number,
  extra: Record<string, unknown> = {},
) {
  return { id, workspaceId, updatedAt, ...extra };
}

// ---------------------------------------------------------------------------
// deduplicateEntities — existing behaviour guard
// ---------------------------------------------------------------------------

describe("deduplicateEntities", () => {
  it("keeps highest updatedAt when duplicate ids exist", () => {
    const items = [
      { id: "1", title: "Target", updatedAt: 200 },
      { id: "1", title: "Source Ghost", updatedAt: 100 },
      { id: "2", title: "Unrelated", updatedAt: 150 },
    ];

    const result = deduplicateEntities(items);
    expect(result).toHaveLength(2);

    const item1 = result.find((i) => i.id === "1");
    expect(item1?.title).toBe("Target");
    expect(item1?.updatedAt).toBe(200);

    const item2 = result.find((i) => i.id === "2");
    expect(item2?.title).toBe("Unrelated");
  });
});

// ---------------------------------------------------------------------------
// deduplicateEntityMap — hostile cases
// ---------------------------------------------------------------------------

describe("deduplicateEntityMap", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Case 1 — Valid workspace: entity stays in the correct bucket.
  // ─────────────────────────────────────────────────────────────────────────
  it("keeps entity in the bucket matching its own workspaceId", () => {
    const map = {
      "ws-A": [makeItem("item-1", "ws-A", 100)],
    };
    const result = deduplicateEntityMap(map);
    expect(result["ws-A"]).toHaveLength(1);
    expect(result["ws-A"][0].id).toBe("item-1");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Case 2 — Unknown workspace: entity must be dropped entirely.
  //   entity.workspaceId = "deleted-ws"
  //   only ws-A / ws-B exist in the map
  // ─────────────────────────────────────────────────────────────────────────
  it("drops entity whose workspaceId does not match any known bucket", () => {
    const map = {
      "ws-A": [makeItem("ghost-1", "deleted-ws", 100)],
      "ws-B": [] as ReturnType<typeof makeItem>[],
    };
    const result = deduplicateEntityMap(map);
    // Must not appear in ws-A (the old unsafe fallback would put it here)
    expect(result["ws-A"]).toHaveLength(0);
    // Must not appear in ws-B
    expect(result["ws-B"]).toHaveLength(0);
    // Must not invent a new bucket for the ghost
    expect(Object.keys(result)).not.toContain("deleted-ws");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Case 3 — Missing workspaceId: entity must not be assigned arbitrarily.
  // ─────────────────────────────────────────────────────────────────────────
  it("drops entity with no workspaceId — never places it in an arbitrary bucket", () => {
    const map = {
      "ws-A": [{ id: "item-no-ws", updatedAt: 100 } as any],
    };
    const result = deduplicateEntityMap(map);
    expect(result["ws-A"]).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Case 4a — Ghost duplicate: same entity ID appears in ws-A (authoritative)
  //   and a stale/deleted workspace.
  // ─────────────────────────────────────────────────────────────────────────
  it("ghost duplicate — authoritative entity stays in its own workspace; ghost is dropped", () => {
    const map = {
      "ws-A": [makeItem("shared-id", "ws-A", 200)], // authoritative — newer
      "ws-B": [makeItem("shared-id", "deleted-ws", 100)], // ghost — older & unknown ws
    };
    const result = deduplicateEntityMap(map);
    // Authoritative entity remains in ws-A
    expect(result["ws-A"]).toHaveLength(1);
    expect(result["ws-A"][0].id).toBe("shared-id");
    // Ghost must not contaminate ws-B
    expect(result["ws-B"]).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Case 4b — Ghost has higher updatedAt but stale workspaceId.
  //   Winner after global dedup has an unknown workspaceId → must be dropped.
  // ─────────────────────────────────────────────────────────────────────────
  it("ghost duplicate with higher updatedAt — still dropped when workspaceId is unknown", () => {
    const map = {
      "ws-A": [makeItem("shared-id", "ws-A", 100)], // real entity — older
      "ws-B": [makeItem("shared-id", "deleted-ws", 200)], // ghost — newer, stale ws
    };
    const result = deduplicateEntityMap(map);
    expect(result["ws-A"]).toHaveLength(0);
    expect(result["ws-B"]).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Case 5 — Multiple valid workspaces: no entity crosses workspace boundary.
  // ─────────────────────────────────────────────────────────────────────────
  it("no entity crosses workspace boundaries when all workspaceIds are valid", () => {
    const map = {
      "ws-A": [makeItem("a-1", "ws-A", 100), makeItem("a-2", "ws-A", 110)],
      "ws-B": [makeItem("b-1", "ws-B", 200), makeItem("b-2", "ws-B", 210)],
    };
    const result = deduplicateEntityMap(map);
    expect(result["ws-A"]).toHaveLength(2);
    expect(result["ws-A"].every((e) => e.workspaceId === "ws-A")).toBe(true);
    expect(result["ws-B"]).toHaveLength(2);
    expect(result["ws-B"].every((e) => e.workspaceId === "ws-B")).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Case 6 — Empty workspace map: no crash and no invented bucket.
  // ─────────────────────────────────────────────────────────────────────────
  it("returns an empty record without crashing when given an empty map", () => {
    const result = deduplicateEntityMap({});
    expect(result).toEqual({});
    expect(Object.keys(result)).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Case 7 — Existing deduplication behaviour: highest updatedAt wins among
  //   valid copies.
  // ─────────────────────────────────────────────────────────────────────────
  it("highest updatedAt wins when the same entity exists in two valid workspaces", () => {
    const map = {
      "ws-1": [makeItem("item-a", "ws-1", 50)],
      "ws-2": [makeItem("item-a", "ws-2", 100)],
    };
    const result = deduplicateEntityMap(map);
    // ws-2 copy wins (updatedAt=100)
    expect(result["ws-2"]).toHaveLength(1);
    expect(result["ws-2"][0].updatedAt).toBe(100);
    // ws-1 ghost is removed
    expect(result["ws-1"]).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Case 8a — Consumer regression: workspace-data-loader pattern.
  //   Ghost with stale workspaceId must not bleed into a live workspace.
  // ─────────────────────────────────────────────────────────────────────────
  it("consumer regression (workspace-data-loader): ghost with stale workspaceId does not bleed into live workspace", () => {
    const todosMap: Record<string, Array<{ id: string; workspaceId: string | undefined; updatedAt: number }>> = {
      "ws-live-1": [makeItem("task-42", "ws-live-1", 100)],
      "ws-live-2": [makeItem("task-99", "ws-live-2", 300)],
    };
    // Ghost entity carrying stale workspaceId ends up in the live bucket array
    (todosMap["ws-live-1"] as any[]).push(makeItem("task-stale", "deleted-ws", 50));

    const result = deduplicateEntityMap(todosMap);

    expect(result["ws-live-1"].map((e) => e.id)).toContain("task-42");
    expect(result["ws-live-2"].map((e) => e.id)).toContain("task-99");

    const allEntities = [...result["ws-live-1"], ...result["ws-live-2"]];
    expect(allEntities.find((e) => e.id === "task-stale")).toBeUndefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Case 8b — Consumer regression: useTodayDashboard pattern.
  //   Verifies correct entity count after deduplication across workspaces.
  // ─────────────────────────────────────────────────────────────────────────
  it("consumer regression (useTodayDashboard): total entity count is stable after dedup across multiple workspaces", () => {
    const checklistsMap: Record<string, Array<{ id: string; workspaceId: string | undefined; updatedAt: number }>> = {
      "inbox": [makeItem("cl-1", "inbox", 100), makeItem("cl-2", "inbox", 200)],
      "ws-1": [makeItem("cl-3", "ws-1", 300), makeItem("cl-1", "ws-1", 50)],
      "ws-2": [makeItem("cl-4", "ws-2", 400)],
    };

    const result = deduplicateEntityMap(checklistsMap);

    // cl-1 winner: inbox copy (updatedAt=100 > 50)
    expect(result["inbox"].find((e) => e.id === "cl-1")).toBeDefined();
    // cl-1 ghost in ws-1 must be gone
    expect(result["ws-1"].find((e) => e.id === "cl-1")).toBeUndefined();
    expect(result["ws-1"].find((e) => e.id === "cl-3")).toBeDefined();
    expect(result["ws-2"].find((e) => e.id === "cl-4")).toBeDefined();

    const total = Object.values(result).reduce((sum, arr) => sum + arr.length, 0);
    expect(total).toBe(4); // cl-1, cl-2, cl-3, cl-4
  });
});
