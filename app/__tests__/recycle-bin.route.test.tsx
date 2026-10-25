import React from "react";
import { act, create } from "react-test-renderer";

import RecycleBinScreen from "@/app/recycle-bin";
import { getRecycleBinItems } from "@/services/storage/storage.service";
import { type RecycleBinItem } from "@/shared/types/domain.types";

const mockAsyncStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
jest.mock("@react-native-async-storage/async-storage", () => mockAsyncStorage);

const mockRouter = { back: jest.fn(), push: jest.fn() };
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning" },
}));

jest.mock("@expo/vector-icons", () => ({
  Feather: () => null,
}));

jest.mock("@/shared/hooks/useColorScheme", () => ({
  useColorScheme: () => "dark",
}));

jest.mock("@/services/storage/storage.service", () => ({
  getRecycleBinItems: jest.fn(),
}));

const sampleItems: RecycleBinItem[] = [
  {
    id: "rb-task-1",
    entityType: "task",
    entityId: "task-1",
    lifecycleGeneration: 1,
    snapshot: JSON.stringify({
      id: "task-1",
      title: "Team meeting",
      notes: "Discuss Q3 roadmap",
      priority: "medium",
      workspaceId: "Inbox",
    }),
    deletedAt: 1729000000000,
  },
  {
    id: "rb-habit-1",
    entityType: "habit",
    entityId: "habit-1",
    lifecycleGeneration: 1,
    snapshot: JSON.stringify({
      id: "habit-1",
      title: "Gym workout",
      notes: "Upper body routine",
      recurrence: { frequency: "daily" },
      workspaceId: "Inbox",
    }),
    deletedAt: 1728900000000,
  },
  {
    id: "rb-check-1",
    entityType: "checklist",
    entityId: "check-1",
    lifecycleGeneration: 1,
    snapshot: JSON.stringify({
      id: "check-1",
      title: "Project checklist",
      items: [{ id: "c1", text: "Task A", completed: false }],
      workspaceId: "Work",
    }),
    deletedAt: 1728800000000,
  },
  {
    id: "rb-ws-1",
    entityType: "workspace",
    entityId: "ws-1",
    lifecycleGeneration: 1,
    snapshot: JSON.stringify({
      id: "ws-1",
      name: "Research Resources",
      color: "purple",
    }),
    deletedAt: 1728700000000,
  },
  {
    id: "rb-res-1",
    entityType: "resource",
    entityId: "res-1",
    lifecycleGeneration: 1,
    snapshot: JSON.stringify({
      id: "res-1",
      title: "Design icon references",
      type: "link",
      workspaceId: "Creative",
    }),
    deletedAt: 1728600000000,
  },
];

let renderer: any;

async function flushAsync(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function findTexts(): string[] {
  return renderer.root
    .findAll((node: any) => {
      const c = node.props?.children;
      return typeof c === "string" || typeof c === "number";
    })
    .map((node: any) => String(node.props.children));
}

describe("RecycleBinScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getRecycleBinItems as jest.Mock).mockResolvedValue(sampleItems);
  });

  it("renders screen title, count subtitle, and all 5 category tabs", async () => {
    await act(async () => {
      renderer = create(<RecycleBinScreen />);
    });
    await flushAsync();

    const texts = findTexts();
    expect(texts).toContain("Recycle Bin");
    expect(texts).toContain("5 items across 5 categories");
    expect(texts).toContain("Tasks");
    expect(texts).toContain("Habits");
    expect(texts).toContain("Checklists");
    expect(texts).toContain("Workspaces");
    expect(texts).toContain("Resources");
  });

  it("filters items by active tab correctly (Tasks by default, switches to Checklists)", async () => {
    await act(async () => {
      renderer = create(<RecycleBinScreen />);
    });
    await flushAsync();

    let texts = findTexts();
    expect(texts).toContain("Team meeting");
    expect(texts).not.toContain("Project checklist");

    // Find and press the Checklists tab
    const checklistTab = renderer.root.find(
      (node: any) =>
        node.props?.accessibilityRole === "tab" &&
        node.props?.accessibilityLabel?.includes("Checklists tab"),
    );
    expect(checklistTab).toBeDefined();

    await act(async () => {
      checklistTab.props.onPress();
    });
    await flushAsync();

    texts = findTexts();
    expect(texts).toContain("Project checklist");
    expect(texts).not.toContain("Team meeting");
  });

  it("shows empty state when a category has no items", async () => {
    // Only pass task items
    (getRecycleBinItems as jest.Mock).mockResolvedValue([sampleItems[0]]);
    await act(async () => {
      renderer = create(<RecycleBinScreen />);
    });
    await flushAsync();

    // Switch to habits
    const habitTab = renderer.root.find(
      (node: any) =>
        node.props?.accessibilityRole === "tab" &&
        node.props?.accessibilityLabel?.includes("Habits tab"),
    );

    await act(async () => {
      habitTab.props.onPress();
    });
    await flushAsync();

    const texts = findTexts();
    expect(texts).toContain("No deleted habits");
  });

  it("toggles sorting when pressing the sort pill", async () => {
    await act(async () => {
      renderer = create(<RecycleBinScreen />);
    });
    await flushAsync();

    const sortPill = renderer.root.find(
      (node: any) =>
        node.props?.accessibilityRole === "button" &&
        node.props?.accessibilityLabel?.includes("Sort order:"),
    );
    expect(sortPill).toBeDefined();

    await act(async () => {
      sortPill.props.onPress();
    });
    await flushAsync();

    const texts = findTexts();
    expect(
      texts.some((t) => t.includes("Deleted: ") && t.includes("Oldest")),
    ).toBe(true);
  });

  it("formats singular subtitle when exactly one item is present", async () => {
    (getRecycleBinItems as jest.Mock).mockResolvedValue([sampleItems[0]]);
    await act(async () => {
      renderer = create(<RecycleBinScreen />);
    });
    await flushAsync();

    const texts = findTexts();
    expect(texts).toContain("1 deleted task in Recycle Bin");
  });

  it("filters items by search query and shows clear button", async () => {
    await act(async () => {
      renderer = create(<RecycleBinScreen />);
    });
    await flushAsync();

    const searchInput = renderer.root.find(
      (node: any) =>
        node.props?.accessibilityLabel === "Search deleted items",
    );
    expect(searchInput).toBeDefined();

    // Type query matching nothing
    await act(async () => {
      searchInput.props.onChangeText("nonexistent keyword");
    });
    await flushAsync();

    let texts = findTexts();
    expect(texts).toContain("No matching deleted items");
    expect(texts).toContain("Clear Search");

    // Click Clear Search button
    const clearBtn = renderer.root.find(
      (node: any) =>
        node.props?.accessibilityRole === "button" &&
        node.props?.accessibilityLabel === "Clear search query",
    );
    await act(async () => {
      clearBtn.props.onPress();
    });
    await flushAsync();

    texts = findTexts();
    expect(texts).toContain("Team meeting");
  });
});
