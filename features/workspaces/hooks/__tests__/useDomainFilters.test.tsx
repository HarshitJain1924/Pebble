import React from "react";
import { act, create } from "react-test-renderer";
import {
  useDomainFilters,
  applyHabitFilters,
  applyChecklistFilters,
  applyResourceFilters,
} from "../useDomainFilters";
import { Habit, Checklist, Resource } from "@/shared/types/domain.types";

describe("useDomainFilters Hook & Filtering Functions", () => {
  describe("applyHabitFilters", () => {
    const habits: Habit[] = [
      {
        id: "h-1",
        workspaceId: "inbox",
        title: "Morning Run",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
        priority: "high",
        recurrence: { frequency: "daily", interval: 1 },
        completionHistory: [{ date: "2026-10-05", completedAt: 1000 }],
      },
      {
        id: "h-2",
        workspaceId: "inbox",
        title: "Read Book",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
        priority: "low",
        recurrence: { frequency: "weekly", interval: 1 },
        completionHistory: [],
        reminder: { enabled: true, triggerAt: 2000 },
      },
    ];

    it("filters active vs completed habits for selected date", () => {
      const activeOnly = applyHabitFilters(habits, "2026-10-05", {
        status: "active",
        priority: "all",
        frequency: "all",
        reminder: "all",
      });
      expect(activeOnly.map((h) => h.id)).toEqual(["h-2"]);

      const completedOnly = applyHabitFilters(habits, "2026-10-05", {
        status: "completed",
        priority: "all",
        frequency: "all",
        reminder: "all",
      });
      expect(completedOnly.map((h) => h.id)).toEqual(["h-1"]);
    });

    it("filters by priority", () => {
      const highOnly = applyHabitFilters(habits, "2026-10-05", {
        status: "all",
        priority: "high",
        frequency: "all",
        reminder: "all",
      });
      expect(highOnly.map((h) => h.id)).toEqual(["h-1"]);
    });

    it("filters by frequency and reminder", () => {
      const dailyOnly = applyHabitFilters(habits, "2026-10-05", {
        status: "all",
        priority: "all",
        frequency: "daily",
        reminder: "all",
      });
      expect(dailyOnly.map((h) => h.id)).toEqual(["h-1"]);

      const reminderOnly = applyHabitFilters(habits, "2026-10-05", {
        status: "all",
        priority: "all",
        frequency: "all",
        reminder: "has_reminder",
      });
      expect(reminderOnly.map((h) => h.id)).toEqual(["h-2"]);
    });
  });

  describe("applyChecklistFilters", () => {
    const checklists: Checklist[] = [
      {
        id: "c-1",
        workspaceId: "inbox",
        title: "Grocery List",
        priority: "none",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
        items: [
          { id: "i-1", title: "Apples", completed: true },
          { id: "i-2", title: "Bananas", completed: false },
        ],
        resourceIds: ["r-1"],
      },
      {
        id: "c-2",
        workspaceId: "inbox",
        title: "Deployment Tasks",
        priority: "none",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
        items: [
          { id: "i-3", title: "Build", completed: true },
          { id: "i-4", title: "Test", completed: true },
        ],
      },
      {
        id: "c-3",
        workspaceId: "inbox",
        title: "Empty Checklist",
        priority: "none",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
        items: [],
      },
    ];

    it("filters by in_progress vs completed", () => {
      const inProgress = applyChecklistFilters(checklists, {
        status: "in_progress",
        items: "all",
        resources: "all",
      });
      expect(inProgress.map((c) => c.id)).toEqual(["c-1", "c-3"]);

      const completed = applyChecklistFilters(checklists, {
        status: "completed",
        items: "all",
        resources: "all",
      });
      expect(completed.map((c) => c.id)).toEqual(["c-2"]);
    });

    it("filters by has_items vs empty", () => {
      const emptyOnly = applyChecklistFilters(checklists, {
        status: "all",
        items: "empty",
        resources: "all",
      });
      expect(emptyOnly.map((c) => c.id)).toEqual(["c-3"]);
    });

    it("filters by linked resources", () => {
      const withRes = applyChecklistFilters(checklists, {
        status: "all",
        items: "all",
        resources: "has_resources",
      });
      expect(withRes.map((c) => c.id)).toEqual(["c-1"]);
    });
  });

  describe("applyResourceFilters", () => {
    const resources: Resource[] = [
      {
        id: "r-1",
        workspaceId: "inbox",
        title: "Architecture Doc",
        type: "note",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: "r-2",
        workspaceId: "inbox",
        title: "Figma Link",
        type: "link",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: "r-3",
        workspaceId: "inbox",
        title: "Screenshot",
        type: "note",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
        attachments: [{ id: "a-1", name: "screen.png", uri: "file://", mimeType: "image/png" }],
        archivedAt: 5000,
      },
    ];

    const linkedIds = new Set(["r-1"]);

    it("filters by type", () => {
      const linksOnly = applyResourceFilters(resources, linkedIds, {
        type: "link",
        linkage: "all",
        status: "all",
      });
      expect(linksOnly.map((r) => r.id)).toEqual(["r-2"]);

      const mediaOnly = applyResourceFilters(resources, linkedIds, {
        type: "media",
        linkage: "all",
        status: "all",
      });
      expect(mediaOnly.map((r) => r.id)).toEqual(["r-3"]);
    });

    it("filters by linkage", () => {
      const linked = applyResourceFilters(resources, linkedIds, {
        type: "all",
        linkage: "linked",
        status: "all",
      });
      expect(linked.map((r) => r.id)).toEqual(["r-1"]);
    });

    it("filters by status (active vs archived)", () => {
      const active = applyResourceFilters(resources, linkedIds, {
        type: "all",
        linkage: "all",
        status: "active",
      });
      expect(active.map((r) => r.id)).toEqual(["r-1", "r-2"]);

      const archived = applyResourceFilters(resources, linkedIds, {
        type: "all",
        linkage: "all",
        status: "archived",
      });
      expect(archived.map((r) => r.id)).toEqual(["r-3"]);
    });
  });

  describe("useDomainFilters hook", () => {
    it("manages and resets filter states and counts", () => {
      let hookState: ReturnType<typeof useDomainFilters> | undefined;
      function TestHarness() {
        hookState = useDomainFilters();
        return null;
      }

      act(() => {
        create(<TestHarness />);
      });

      expect(hookState!.habitActiveFilterCount).toBe(0);

      act(() => {
        hookState!.setHabitStatusFilter("active");
        hookState!.setHabitPriorityFilter("high");
      });

      expect(hookState!.habitActiveFilterCount).toBe(2);

      act(() => {
        hookState!.resetHabitFilters();
      });

      expect(hookState!.habitActiveFilterCount).toBe(0);
      expect(hookState!.habitStatusFilter).toBe("all");
      expect(hookState!.habitPriorityFilter).toBe("all");
    });
  });
});
