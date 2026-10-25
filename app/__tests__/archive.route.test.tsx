import React from "react";
import { act, create } from "react-test-renderer";

import ArchiveScreen from "@/app/archive";
import {
  ChecklistRepository,
  HabitRepository,
  ResourceRepository,
  TaskRepository,
  WorkspaceRepository,
} from "@/repositories";
import {
  type Checklist,
  type Habit,
  type Resource,
  type Task,
  type Workspace,
} from "@/shared/types/domain.types";

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

jest.mock("@/repositories", () => ({
  TaskRepository: { getTasks: jest.fn() },
  HabitRepository: { getHabits: jest.fn() },
  ChecklistRepository: { getChecklists: jest.fn() },
  ResourceRepository: { getResources: jest.fn() },
  WorkspaceRepository: { getWorkspaces: jest.fn() },
}));

jest.mock("@/shared/components/ui/UndoContext", () => ({
  useUndo: () => ({ showToast: jest.fn() }),
}));

const mockTask: Task = {
  id: "arch-task-1",
  title: "Archived Strategy Task",
  description: "Long term strategy notes",
  status: "todo",
  priority: "high",
  workspaceId: "ws-1",
  archivedAt: 1729000000000,
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1000,
  updatedAt: 1000,
};

const mockHabit: Habit = {
  id: "arch-habit-1",
  title: "Archived Daily Run",
  description: "Cardio",
  workspaceId: "ws-1",
  archivedAt: 1728900000000,
  recurrence: { frequency: "daily", interval: 1 },
  completionHistory: [],
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1000,
  updatedAt: 1000,
};

const mockChecklist: Checklist = {
  id: "arch-cl-1",
  title: "Archived Launch Checklist",
  workspaceId: "ws-1",
  priority: "none",
  items: [{ id: "cli-1", title: "Item 1", completed: false }],
  archivedAt: 1728800000000,
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1000,
  updatedAt: 1000,
};

const mockWorkspace: Workspace = {
  id: "ws-arch-1",
  name: "Archived Client Project",
  archivedAt: 1728700000000,
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1000,
  updatedAt: 1000,
};

const mockResource: Resource = {
  id: "arch-res-1",
  title: "Archived Reference Docs",
  type: "link",
  workspaceId: "ws-1",
  archivedAt: 1728600000000,
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1000,
  updatedAt: 1000,
};

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

describe("ArchiveScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (WorkspaceRepository.getWorkspaces as jest.Mock).mockResolvedValue([
      { id: "ws-1", name: "Main Project" },
      mockWorkspace,
    ]);
    (TaskRepository.getTasks as jest.Mock).mockResolvedValue({
      "arch-task-1": mockTask,
    });
    (HabitRepository.getHabits as jest.Mock).mockResolvedValue({
      "arch-habit-1": mockHabit,
    });
    (ChecklistRepository.getChecklists as jest.Mock).mockResolvedValue({
      "arch-cl-1": mockChecklist,
    });
    (ResourceRepository.getResources as jest.Mock).mockResolvedValue({
      "arch-res-1": mockResource,
    });
  });

  it("renders screen title, count subtitle, and all 5 category tabs", async () => {
    await act(async () => {
      renderer = create(<ArchiveScreen />);
    });
    await flushAsync();

    const texts = findTexts();
    expect(texts).toContain("Archive");
    expect(texts).toContain("5 items across 5 categories");
    expect(texts).toContain("Tasks");
    expect(texts).toContain("Habits");
    expect(texts).toContain("Checklists");
    expect(texts).toContain("Workspaces");
    expect(texts).toContain("Resources");
  });

  it("filters items by active tab correctly (Tasks by default, switches to Checklists)", async () => {
    await act(async () => {
      renderer = create(<ArchiveScreen />);
    });
    await flushAsync();

    let texts = findTexts();
    expect(texts).toContain("Archived Strategy Task");
    expect(texts).not.toContain("Archived Launch Checklist");

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
    expect(texts).toContain("Archived Launch Checklist");
    expect(texts).not.toContain("Archived Strategy Task");
  });

  it("switches to Workspaces tab and displays archived workspace", async () => {
    await act(async () => {
      renderer = create(<ArchiveScreen />);
    });
    await flushAsync();

    const wsTab = renderer.root.find(
      (node: any) =>
        node.props?.accessibilityRole === "tab" &&
        node.props?.accessibilityLabel?.includes("Workspaces tab"),
    );
    expect(wsTab).toBeDefined();

    await act(async () => {
      wsTab.props.onPress();
    });
    await flushAsync();

    const texts = findTexts();
    expect(texts).toContain("Archived Client Project");
  });

  it("toggles sorting when pressing the sort pill", async () => {
    await act(async () => {
      renderer = create(<ArchiveScreen />);
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
      texts.some((t) => t.includes("Archived: ") && t.includes("Oldest")),
    ).toBe(true);
  });

  it("filters items by search query and shows clear button", async () => {
    await act(async () => {
      renderer = create(<ArchiveScreen />);
    });
    await flushAsync();

    const searchInput = renderer.root.find(
      (node: any) =>
        node.props?.accessibilityLabel === "Search archived items",
    );
    expect(searchInput).toBeDefined();

    await act(async () => {
      searchInput.props.onChangeText("nonexistent keyword");
    });
    await flushAsync();

    let texts = findTexts();
    expect(texts).toContain("No matching archived items");
    expect(texts).toContain("Clear Search");

    const clearBtn = renderer.root.find(
      (node: any) =>
        node.props?.accessibilityRole === "button" &&
        node.props?.accessibilityLabel === "Clear search filter",
    );
    await act(async () => {
      clearBtn.props.onPress();
    });
    await flushAsync();

    texts = findTexts();
    expect(texts).toContain("Archived Strategy Task");
  });
});
