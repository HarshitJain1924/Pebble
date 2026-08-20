import { deduplicateEntities, deduplicateEntityMap } from "../deduplication";

describe("deduplication utilities", () => {
  describe("deduplicateEntities", () => {
    it("deduplicates entities by id and keeps the one with highest updatedAt", () => {
      const items = [
        { id: "1", title: "Target", updatedAt: 200 },
        { id: "1", title: "Source Ghost", updatedAt: 100 }, // Older, should be dropped
        { id: "2", title: "Unrelated", updatedAt: 150 },
      ];

      const result = deduplicateEntities(items);
      expect(result).toHaveLength(2);
      
      const item1 = result.find(i => i.id === "1");
      expect(item1?.title).toBe("Target");
      expect(item1?.updatedAt).toBe(200);
      
      const item2 = result.find(i => i.id === "2");
      expect(item2?.title).toBe("Unrelated");
    });
  });

  describe("deduplicateEntityMap", () => {
    it("deduplicates entities globally across workspaces and preserves authoritative copy", () => {
      const mapOfArrays = {
        "ws-1": [
          { id: "item-a", title: "Ghost in ws-1", updatedAt: 50, workspaceId: "ws-1" },
        ],
        "ws-2": [
          { id: "item-a", title: "Authoritative in ws-2", updatedAt: 100, workspaceId: "ws-2" },
        ],
      };

      const result = deduplicateEntityMap(mapOfArrays);
      
      // Should have been removed from ws-1
      expect(result["ws-1"]).toHaveLength(0);
      
      // Should remain in ws-2
      expect(result["ws-2"]).toHaveLength(1);
      expect(result["ws-2"][0].title).toBe("Authoritative in ws-2");
    });
  });
});
