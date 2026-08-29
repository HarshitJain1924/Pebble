jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
import React from "react";
import { act, create } from "react-test-renderer";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTasksState } from "@/features/tasks/hooks/useTasksState";
import { HabitRepository } from "@/repositories/HabitRepository";
import { GraphRepository } from "@/repositories/GraphRepository";
import type { Habit, Workspace } from "@/shared/types/domain.types";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => undefined,
}));
jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: "success", Warning: "warning" },
}));
jest.mock("@/shared/components/ui/UndoContext", () => ({
  useUndo: () => ({ showUndo: jest.fn(), showToast: jest.fn() }),
}));
const workspaces: Workspace[] = [
  { id: "ws-1", name: "Workspace 1", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
  { id: "ws-2", name: "Workspace 2", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
];
jest.mock("@/repositories/WorkspaceRepository", () => ({
  WorkspaceRepository: {
    getWorkspaces: jest.fn(async () => workspaces),
  }
}));
jest.mock("@/features/workspaces/hooks/useWorkspaceState", () => {
  return {
    useWorkspaceState: () => ({
      workspaces,
      isWorkspacesHydrated: true,
      setWorkspaces: jest.fn(),
      selectedWorkspaceId: "ws-1",
      setSelectedWorkspaceId: jest.fn(),
      activeWorkspaceId: "ws-1",
      setActiveWorkspaceId: jest.fn(),
      workspaceSegment: "tasks",
      setWorkspaceSegment: jest.fn(),
      activeSegment: "tasks",
      setActiveSegment: jest.fn(),
      workspaceModalVisible: false,
      setWorkspaceModalVisible: jest.fn(),
      editingWorkspaceId: null,
      setEditingWorkspaceId: jest.fn(),
      listsExpanded: false,
      setListsExpanded: jest.fn(),
      loadWorkspaces: jest.fn(async () => workspaces),
      handleSelectWorkspace: jest.fn(),
      handleBackToWorkspaces: jest.fn(),
      handleCreateWorkspace: jest.fn(),
      handleDeleteWorkspace: jest.fn(),
    }),
  };
});
jest.mock("@/features/tasks/hooks/useTaskCrud", () => ({
  useTaskCrud: () => ({
    persistState: jest.fn(async () => undefined),
    onSaveNewTask: jest.fn(),
    updateTodoTitle: jest.fn(),
    moveTodoToList: jest.fn(),
    toggleTodo: jest.fn(),
    deleteTodo: jest.fn(),
    updateTodoCategory: jest.fn(),
    clearCompleted: jest.fn(),
    convertCollectionItemToTask: jest.fn(),
  }),
}));
jest.mock("@/features/tasks/hooks/useTaskFiltering", () => ({
  useTaskFiltering: () => ({
    searchQuery: "",
    setSearchQuery: jest.fn(),
    selectedWorkspacePriorityFilter: "all",
    setSelectedWorkspacePriorityFilter: jest.fn(),
    selectedCategoryFilter: "all",
    setSelectedCategoryFilter: jest.fn(),
    selectedWorkspaceHabitPriorityFilter: "all",
    setSelectedWorkspaceHabitPriorityFilter: jest.fn(),
    currentTodos: [],
    filteredTodos: [],
    overdueTodos: [],
    todayTodos: [],
    upcomingTodos: [],
    inboxTodos: [],
    remainingCount: 0,
    completedCount: 0,
    unfinishedHabitCount: 0,
    displayedHabits: [],
    completedHabitCount: 0,
    habitCompletionPct: 0,
    longestStreak: 0,
  }),
}));
jest.mock("@/features/habits/hooks/useHabitCrud", () => ({
  useHabitCrud: () => ({
    persistHabits: jest.fn(async () => undefined),
    addHabit: jest.fn(),
    deleteHabit: jest.fn(),
    toggleHabit: jest.fn(),
  }),
}));
jest.mock("@/services/scheduling/hooks/useReminderState", () => ({
  useReminderState: () => ({
    alarmMenu: null,
    setAlarmMenu: jest.fn(),
    scheduleAlarm: jest.fn(),
    scheduleAlarmWithDays: jest.fn(),
    cancelAlarm: jest.fn(),
  }),
}));
jest.mock("@/features/resources/hooks/useResourceState", () => ({
  useResourceState: () => ({
    resources: {},
    loadResourcesState: jest.fn(async () => undefined),
    createResource: jest.fn(),
    updateResource: jest.fn(),
    deleteResource: jest.fn(),
    toggleArchiveResource: jest.fn(),
  }),
}));
jest.mock("@/features/checklists/hooks/useChecklistState", () => ({
  useChecklistState: () => ({
    checklists: {},
    setChecklists: jest.fn(),
    loadChecklistsState: jest.fn(async () => undefined),
    addChecklist: jest.fn(),
    updateChecklist: jest.fn(),
    deleteChecklist: jest.fn(),
    toggleChecklistItem: jest.fn(),
    addChecklistItem: jest.fn(),
    deleteChecklistItem: jest.fn(),
  }),
}));
jest.mock("@/features/resources/hooks/useResourceLinkState", () => ({
  useResourceLinkState: () => ({ toggleLinkResource: jest.fn() }),
}));
jest.mock("@/features/settings/services/settings.service", () => ({
  getProfile: jest.fn(async () => null),
}));

const storage = AsyncStorage as typeof AsyncStorage;

const habit = (id: string, workspaceId: string, title?: string): Habit => ({
  id,
  workspaceId,
  title: title || `Habit ${id}`,
  recurrence: { frequency: "daily", interval: 1 },
  completionHistory: [],
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1000,
  updatedAt: 1000,
});

let emitStateChangeSpy: jest.SpyInstance;

beforeEach(async () => {
  await storage.clear();
  jest.restoreAllMocks();
  GraphRepository.resetCache?.();
  // Real state-events module, spied so we can assert the consolidated event.
  const events = require("@/services/events/state-events");
  emitStateChangeSpy = jest
    .spyOn(events, "emitStateChange")
    .mockImplementation(() => {});
});

async function mountHook() {
  let api: ReturnType<typeof useTasksState> | undefined;
  function Harness() {
    api = useTasksState();
    return null;
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(Harness));
  });
  return {
    api: () => api!,
    unmount: () => {
      act(() => {
        renderer!.unmount();
      });
    },
  };
}

describe("useTasksState.handleBulkMove — habit persistence (P1 regression)", () => {
  test("bulk-moving selected habits persists to the destination workspace and survives reload", async () => {
    // Seed repository state (workspace-scoped partitions) exactly as a fresh app would.
    await HabitRepository.saveHabit(habit("habit-a", "ws-1"));
    await HabitRepository.saveHabit(habit("habit-b", "ws-1"));
    await HabitRepository.saveHabit(habit("habit-c", "ws-2"));

    const { api, unmount } = await mountHook();
    try {
      // Hydrate hook state from the repository (flat array across workspaces).
      await act(async () => {
        await api().loadHabits();
      });
      expect(api().habits.map((h) => h.id).sort()).toEqual([
        "habit-a",
        "habit-b",
        "habit-c",
      ]);

      // Select habit-a and habit-b, then bulk-move to ws-2.
      act(() => {
        api().setSelectedItemIds(new Set(["habit-a", "habit-b"]));
      });
      await act(async () => {
        await api().handleBulkMove("ws-2");
      });

      // PERSISTED state: both moved habits now live under ws-2.
      const ws2 = await HabitRepository.getHabits("ws-2");
      expect(ws2["habit-a"]).toBeDefined();
      expect(ws2["habit-a"].workspaceId).toBe("ws-2");
      expect(ws2["habit-b"]).toBeDefined();
      expect(ws2["habit-b"].workspaceId).toBe("ws-2");
      expect(ws2["habit-c"]).toBeDefined(); // pre-existing target habit untouched
      const ws1 = await HabitRepository.getHabits("ws-1");
      expect(ws1["habit-a"]).toBeUndefined();
      expect(ws1["habit-b"]).toBeUndefined();

      // Local UI state reflects the persisted move immediately.
      const inState = (id: string) => api().habits.find((h) => h.id === id);
      expect(inState("habit-a")?.workspaceId).toBe("ws-2");
      expect(inState("habit-b")?.workspaceId).toBe("ws-2");
      expect(inState("habit-c")?.workspaceId).toBe("ws-2");

      // Exactly one consolidated habits_changed event with the tasks_screen source.
      const habitEvents = emitStateChangeSpy.mock.calls.filter(
        (c) => c[0] === "habits_changed",
      );
      expect(habitEvents).toEqual([["habits_changed", "tasks_screen"]]);

      // Reload from the repository — grouping is identical (no reversion).
      await act(async () => {
        await api().loadHabits();
      });
      expect(
        api()
          .habits.map((h) => [h.id, h.workspaceId])
          .sort((a, b) => (a[0] < b[0] ? -1 : 1)),
      ).toEqual([
        ["habit-a", "ws-2"],
        ["habit-b", "ws-2"],
        ["habit-c", "ws-2"],
      ]);
    } finally {
      unmount();
    }
  });

  test("unselected habits remain untouched by the bulk move", async () => {
    await HabitRepository.saveHabit(habit("habit-a", "ws-1"));
    await HabitRepository.saveHabit(habit("habit-b", "ws-1"));

    const { api, unmount } = await mountHook();
    try {
      await act(async () => {
        await api().loadHabits();
      });
      act(() => {
        api().setSelectedItemIds(new Set(["habit-a"]));
      });
      await act(async () => {
        await api().handleBulkMove("ws-2");
      });

      const ws1 = await HabitRepository.getHabits("ws-1");
      expect(ws1["habit-b"]).toBeDefined();
      expect(ws1["habit-b"].workspaceId).toBe("ws-1");
      expect(ws1["habit-b"].title).toBe("Habit habit-b");
      expect(ws1["habit-a"]).toBeUndefined();
      const ws2 = await HabitRepository.getHabits("ws-2");
      expect(Object.keys(ws2)).toEqual(["habit-a"]);
    } finally {
      unmount();
    }
  });

  test("moving to the current workspace does not duplicate habits", async () => {
    await HabitRepository.saveHabit(habit("habit-a", "ws-1"));

    const { api, unmount } = await mountHook();
    try {
      await act(async () => {
        await api().loadHabits();
      });
      act(() => {
        api().setSelectedItemIds(new Set(["habit-a"]));
      });
      await act(async () => {
        await api().handleBulkMove("ws-1");
      });

      const ws1 = await HabitRepository.getHabits("ws-1");
      expect(Object.keys(ws1)).toEqual(["habit-a"]);
      expect(api().habits.filter((h) => h.id === "habit-a")).toHaveLength(1);
    } finally {
      unmount();
    }
  });

  test("habits from multiple source workspaces can be moved together", async () => {
    await HabitRepository.saveHabit(habit("habit-a", "ws-1"));
    await HabitRepository.saveHabit(habit("habit-b", "ws-2"));

    const { api, unmount } = await mountHook();
    try {
      await act(async () => {
        await api().loadHabits();
      });
      act(() => {
        api().setSelectedItemIds(new Set(["habit-a", "habit-b"]));
      });
      await act(async () => {
        await api().handleBulkMove("ws-2");
      });

      const ws2 = await HabitRepository.getHabits("ws-2");
      expect(ws2["habit-a"].workspaceId).toBe("ws-2");
      expect(ws2["habit-b"].workspaceId).toBe("ws-2");
      expect(await HabitRepository.getHabits("ws-1")).toEqual({});
    } finally {
      unmount();
    }
  });

  test("moving to the Inbox workspace persists correctly", async () => {
    await HabitRepository.saveHabit(habit("habit-a", "ws-1"));

    const { api, unmount } = await mountHook();
    try {
      await act(async () => {
        await api().loadHabits();
      });
      act(() => {
        api().setSelectedItemIds(new Set(["habit-a"]));
      });
      await act(async () => {
        await api().handleBulkMove("inbox");
      });

      const inbox = await HabitRepository.getHabits("inbox");
      expect(inbox["habit-a"]).toBeDefined();
      expect(inbox["habit-a"].workspaceId).toBe("inbox");
      expect(await HabitRepository.getHabits("ws-1")).toEqual({});
    } finally {
      unmount();
    }
  });

  test("with no habits selected, no repository mutation and no event occur", async () => {
    await HabitRepository.saveHabit(habit("habit-a", "ws-1"));

    const { api, unmount } = await mountHook();
    try {
      await act(async () => {
        await api().loadHabits();
      });
      act(() => {
        api().setSelectedItemIds(new Set());
      });
      emitStateChangeSpy.mockClear();
      await act(async () => {
        await api().handleBulkMove("ws-2");
      });

      const ws1 = await HabitRepository.getHabits("ws-1");
      expect(ws1["habit-a"]).toBeDefined();
      expect(ws1["habit-a"].workspaceId).toBe("ws-1");
      expect(
        emitStateChangeSpy.mock.calls.filter((c) => c[0] === "habits_changed"),
      ).toHaveLength(0);
    } finally {
      unmount();
    }
  });

  test("partial persistence failure reconciles UI with actually-persisted state", async () => {
    await HabitRepository.saveHabit(habit("habit-ok", "ws-1"));
    await HabitRepository.saveHabit(habit("habit-fail", "ws-1"));

    // Simulate the storage layer failing for one habit's target write.
    const realSave = HabitRepository.saveHabitUnlocked.bind(HabitRepository);
    jest
      .spyOn(HabitRepository, "saveHabitUnlocked")
      .mockImplementation(async (h: any) => {
        if (h.id === "habit-fail") throw new Error("persist failed");
        return realSave(h);
      });

    const { api, unmount } = await mountHook();
    try {
      await act(async () => {
        await api().loadHabits();
      });
      act(() => {
        api().setSelectedItemIds(new Set(["habit-ok", "habit-fail"]));
      });
      // Must not throw out of handleBulkMove (the hook catches and reconciles).
      await act(async () => {
        await api().handleBulkMove("ws-2");
      });

      // Persisted reality: habit-ok moved, habit-fail stayed.
      const ws2 = await HabitRepository.getHabits("ws-2");
      expect(ws2["habit-ok"]).toBeDefined();
      expect(ws2["habit-fail"]).toBeUndefined();
      const ws1 = await HabitRepository.getHabits("ws-1");
      expect(ws1["habit-ok"]).toBeUndefined();
      expect(ws1["habit-fail"]).toBeDefined();

      // UI was reloaded from the repository, so it matches persisted reality
      // rather than claiming both habits moved.
      const inState = (id: string) => api().habits.find((h) => h.id === id);
      expect(inState("habit-ok")?.workspaceId).toBe("ws-2");
      expect(inState("habit-fail")?.workspaceId).toBe("ws-1");
    } finally {
      unmount();
    }
  });
});
