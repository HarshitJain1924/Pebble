jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
import React from "react";
import { act, create } from "react-test-renderer";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useTasksState } from "@/features/tasks/hooks/useTasksState";
import { TaskRepository } from "@/repositories/TaskRepository";
import { GraphRepository } from "@/repositories/GraphRepository";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import type { Task, Workspace } from "@/shared/types/domain.types";

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
  },
}));

jest.mock("@/features/workspaces/hooks/useWorkspaceState", () => ({
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
}));

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

const task = (id: string, workspaceId: string, title?: string): Task => ({
  id,
  workspaceId,
  title: title || `Task ${id}`,
  status: "todo",
  priority: "none",
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

describe("useTasksState.handleBulkMove — task persistence and failure safety (P1 regression)", () => {
  test("all-success: moves all selected tasks via ECS, commits UI state and clears selection", async () => {
    await TaskRepository.saveTask(task("t-1", "ws-1"));
    await TaskRepository.saveTask(task("t-2", "ws-1"));
    await TaskRepository.saveTask(task("t-3", "ws-2"));

    const { api, unmount } = await mountHook();
    try {
      await act(async () => {
        await api().loadState();
      });

      expect(api().todos["ws-1"]?.map((t) => t.id).sort()).toEqual(["t-1", "t-2"]);
      expect(api().todos["ws-2"]?.map((t) => t.id)).toEqual(["t-3"]);

      act(() => {
        api().setIsBulkSelectActive(true);
        api().setSelectedItemIds(new Set(["t-1", "t-2"]));
      });

      await act(async () => {
        await api().handleBulkMove("ws-2");
      });

      // Persisted repository verification
      const ws2Tasks = await TaskRepository.getTasks("ws-2");
      expect(ws2Tasks["t-1"]).toBeDefined();
      expect(ws2Tasks["t-1"].workspaceId).toBe("ws-2");
      expect(ws2Tasks["t-2"]).toBeDefined();
      expect(ws2Tasks["t-2"].workspaceId).toBe("ws-2");
      expect(ws2Tasks["t-3"]).toBeDefined();

      const ws1Tasks = await TaskRepository.getTasks("ws-1");
      expect(ws1Tasks["t-1"]).toBeUndefined();
      expect(ws1Tasks["t-2"]).toBeUndefined();

      // UI state verification
      expect(api().todos["ws-1"]).toEqual([]);
      expect(api().todos["ws-2"].map((t) => t.id).sort()).toEqual(["t-1", "t-2", "t-3"]);

      // Cleanup verification
      expect(api().isBulkSelectActive).toBe(false);
      expect(api().selectedItemIds.size).toBe(0);
      expect(api().isMoveModalVisible).toBe(false);

      // Event and haptic verification
      expect(emitStateChangeSpy).toHaveBeenCalledWith("tasks_changed", "tasks_screen");
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Success,
      );
    } finally {
      unmount();
    }
  });

  test("partial failure: waits for all operations to settle, reconciles UI state via loadState(), and cleans up modal/selection", async () => {
    await TaskRepository.saveTask(task("t-ok", "ws-1"));
    await TaskRepository.saveTask(task("t-fail", "ws-1"));

    // Intercept moveTask to reject specifically for t-fail
    const originalMoveTask = EntityCommandService.moveTask.bind(EntityCommandService);
    const moveTaskSpy = jest
      .spyOn(EntityCommandService, "moveTask")
      .mockImplementation(async (id, oldWs, targetWs, options) => {
        if (id === "t-fail") {
          throw new Error("Disk write failed for t-fail");
        }
        return originalMoveTask(id, oldWs, targetWs, options);
      });

    const { api, unmount } = await mountHook();
    try {
      await act(async () => {
        await api().loadState();
      });

      act(() => {
        api().setIsBulkSelectActive(true);
        api().setSelectedItemIds(new Set(["t-ok", "t-fail"]));
      });

      // Must not throw out of handleBulkMove
      await act(async () => {
        await api().handleBulkMove("ws-2");
      });

      // Assert that both moves were attempted (allSettled waited for all)
      expect(moveTaskSpy).toHaveBeenCalledTimes(2);

      // Persisted reality: t-ok moved, t-fail stayed
      const ws2Tasks = await TaskRepository.getTasks("ws-2");
      expect(ws2Tasks["t-ok"]).toBeDefined();
      expect(ws2Tasks["t-fail"]).toBeUndefined();

      const ws1Tasks = await TaskRepository.getTasks("ws-1");
      expect(ws1Tasks["t-ok"]).toBeUndefined();
      expect(ws1Tasks["t-fail"]).toBeDefined();

      // UI state matches persisted reality via loadState() reconciliation
      expect(api().todos["ws-1"].map((t) => t.id)).toEqual(["t-fail"]);
      expect(api().todos["ws-2"].map((t) => t.id)).toEqual(["t-ok"]);

      // Cleanup verification on partial failure
      expect(api().isBulkSelectActive).toBe(false);
      expect(api().selectedItemIds.size).toBe(0);
      expect(api().isMoveModalVisible).toBe(false);

      // Warning haptics triggered
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Warning,
      );
    } finally {
      unmount();
    }
  });

  test("complete failure: all operations fail, UI state accurately reconciles from repository and selection clears", async () => {
    await TaskRepository.saveTask(task("t-1", "ws-1"));
    await TaskRepository.saveTask(task("t-2", "ws-1"));

    jest
      .spyOn(EntityCommandService, "moveTask")
      .mockRejectedValue(new Error("Database locked"));

    const { api, unmount } = await mountHook();
    try {
      await act(async () => {
        await api().loadState();
      });

      act(() => {
        api().setIsBulkSelectActive(true);
        api().setSelectedItemIds(new Set(["t-1", "t-2"]));
      });

      await act(async () => {
        await api().handleBulkMove("ws-2");
      });

      // Persisted reality: both remain in ws-1
      const ws1Tasks = await TaskRepository.getTasks("ws-1");
      expect(ws1Tasks["t-1"]).toBeDefined();
      expect(ws1Tasks["t-2"]).toBeDefined();
      const ws2Tasks = await TaskRepository.getTasks("ws-2");
      expect(Object.keys(ws2Tasks)).toHaveLength(0);

      // UI state reflects reality (both still in ws-1)
      expect(api().todos["ws-1"].map((t) => t.id).sort()).toEqual(["t-1", "t-2"]);
      expect(api().todos["ws-2"]).toEqual([]);

      // Cleanup happens even on complete failure
      expect(api().isBulkSelectActive).toBe(false);
      expect(api().selectedItemIds.size).toBe(0);
      expect(api().isMoveModalVisible).toBe(false);

      // Warning feedback
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Warning,
      );
    } finally {
      unmount();
    }
  });
});
