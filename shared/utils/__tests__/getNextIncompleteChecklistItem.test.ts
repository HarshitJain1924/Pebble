import { getNextIncompleteChecklistItem } from "../domain-selectors";
import type { Checklist } from "@/shared/types/domain.types";

const TODAY = "2026-09-12";

function mockChecklist(overrides: Partial<Checklist> = {}): Checklist {
  return {
    id: "chk-1",
    workspaceId: "inbox",
    title: "Deployment Checklist",
    revision: 1,
    lifecycleGeneration: 1,
    items: [
      { id: "i1", title: "Build bundle", completed: true },
      { id: "i2", title: "Run migration", completed: false },
      { id: "i3", title: "Smoke tests", completed: false },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("getNextIncompleteChecklistItem", () => {
  it("returns the first incomplete item in canonical checklist order", () => {
    const next = getNextIncompleteChecklistItem(mockChecklist());
    expect(next?.id).toBe("i2");
    expect(next?.title).toBe("Run migration");
  });

  it("does not guess by position when earlier items are complete", () => {
    const next = getNextIncompleteChecklistItem(
      mockChecklist({
        items: [
          { id: "i1", title: "Build bundle", completed: true },
          { id: "i2", title: "Run migration", completed: true },
          { id: "i3", title: "Smoke tests", completed: false },
        ],
      }),
    );
    expect(next?.id).toBe("i3");
  });

  it("returns undefined when every item is complete or the checklist is empty", () => {
    expect(
      getNextIncompleteChecklistItem(
        mockChecklist({
          items: [
            { id: "i1", title: "Build bundle", completed: true },
            { id: "i2", title: "Run migration", completed: true },
          ],
        }),
      ),
    ).toBeUndefined();

    expect(getNextIncompleteChecklistItem(mockChecklist({ items: [] }))).toBeUndefined();
  });

  it("honors occurrence-isolated completion for recurring checklists", () => {
    const recurring = mockChecklist({
      recurrence: { frequency: "daily", interval: 1 },
      items: [
        { id: "i1", title: "Build bundle", completed: false },
        { id: "i2", title: "Run migration", completed: false },
      ],
      occurrenceHistory: {
        [TODAY]: { completedItemIds: ["i1"] },
      },
    });

    // i1 is globally incomplete but already done for today's occurrence.
    expect(getNextIncompleteChecklistItem(recurring, TODAY)?.id).toBe("i2");

    // A different occurrence starts from the top of the list.
    expect(getNextIncompleteChecklistItem(recurring, "2026-09-13")?.id).toBe("i1");
  });
});
