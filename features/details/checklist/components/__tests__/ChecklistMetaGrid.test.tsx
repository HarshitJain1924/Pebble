import React from "react";
import { act, create } from "react-test-renderer";
import { ChecklistMetaGrid } from "../ChecklistMetaGrid";
import type { Checklist } from "@/shared/types/domain.types";

jest.mock("@/shared/components/ui/LiquidGlassSurface", () => ({
  LiquidGlassSurface: ({ children }: any) => <>{children}</>,
}));

const mockColors = {
  text: "#FFFFFF",
  textMuted: "#888888",
  border: "#333333",
};

const baseChecklist: Checklist = {
  id: "chk-1",
  workspaceId: "ws-1",
  title: "Grocery Shopping",
  priority: "medium",
  items: [],
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1730000000000,
  updatedAt: 1730000000000,
};

describe("ChecklistMetaGrid Semantics & Invariants", () => {
  it("displays scheduled start time when schedule.startTime is present", () => {
    const item: Checklist = {
      ...baseChecklist,
      schedule: {
        date: "2026-11-20",
        startTime: "09:30",
      },
    };

    let tree: any;
    act(() => {
      tree = create(
        <ChecklistMetaGrid
          item={item}
          createdDate="Nov 20, 2026"
          scheduleDisplay="Nov 20, 2026"
          isLight={false}
          colors={mockColors}
        />
      );
    });

    const texts = tree.root.findAll((node: any) => typeof node.props.children === "string").map((n: any) => n.props.children);
    expect(texts).toContain("Start Time");
    expect(texts).toContain("9:30 AM");
  });

  it("never falls back to reminder triggerAt for Start Time (Schedule vs Reminder invariant)", () => {
    // Schedule determines calendar placement; Reminder determines notification timing.
    const reminderEpoch = new Date(2026, 10, 20, 14, 0).getTime(); // 2:00 PM
    const item: Checklist = {
      ...baseChecklist,
      schedule: {
        date: "2026-11-20",
        // No startTime -> should be All Day
      },
      reminder: {
        enabled: true,
        triggerAt: reminderEpoch,
      },
    };

    let tree: any;
    act(() => {
      tree = create(
        <ChecklistMetaGrid
          item={item}
          createdDate="Nov 20, 2026"
          scheduleDisplay="Nov 20, 2026"
          isLight={false}
          colors={mockColors}
        />
      );
    });

    const startLabel = tree.root.find(
      (node: any) => node.props.children === "Start Time"
    );
    const tileCol = startLabel.parent;
    const valueNode = tileCol.children[1];
    expect(valueNode.props.children).toBe("All Day");
    expect(valueNode.props.children).not.toBe("2:00 PM");
  });

  it("displays computed end time from durationMinutes when available", () => {
    const item: Checklist = {
      ...baseChecklist,
      schedule: {
        date: "2026-11-20",
        startTime: "10:00",
        durationMinutes: 90,
      },
    };

    let tree: any;
    act(() => {
      tree = create(
        <ChecklistMetaGrid
          item={item}
          createdDate="Nov 20, 2026"
          scheduleDisplay="Nov 20, 2026"
          isLight={false}
          colors={mockColors}
        />
      );
    });

    const texts = tree.root.findAll((node: any) => typeof node.props.children === "string").map((n: any) => n.props.children);
    expect(texts).toContain("End Time");
    expect(texts).toContain("11:30 AM");
  });

  it("displays None for end time instead of a fabricated +45m offset", () => {
    const item: Checklist = {
      ...baseChecklist,
      schedule: {
        date: "2026-11-20",
        startTime: "10:00",
        // No endTime, no durationMinutes
      },
    };

    let tree: any;
    act(() => {
      tree = create(
        <ChecklistMetaGrid
          item={item}
          createdDate="Nov 20, 2026"
          scheduleDisplay="Nov 20, 2026"
          isLight={false}
          colors={mockColors}
        />
      );
    });

    const texts = tree.root.findAll((node: any) => typeof node.props.children === "string").map((n: any) => n.props.children);
    expect(texts).toContain("None");
    expect(texts.some((t: string) => t.includes("+45m"))).toBe(false);
  });

  it("displays Repeat in tile 4 when recurrence is present", () => {
    const item: Checklist = {
      ...baseChecklist,
      recurrence: {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [1, 3, 5],
      },
    };

    let tree: any;
    act(() => {
      tree = create(
        <ChecklistMetaGrid
          item={item}
          createdDate="Nov 20, 2026"
          scheduleDisplay="Weekly"
          isLight={false}
          colors={mockColors}
        />
      );
    });

    const texts = tree.root.findAll((node: any) => typeof node.props.children === "string").map((n: any) => n.props.children);
    expect(texts).toContain("Repeat");
  });
});
