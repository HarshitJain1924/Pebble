jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
import React from "react";
import { act, create } from "react-test-renderer";
import { useTasksState } from "@/features/tasks/hooks/useTasksState";
import type { Task, Workspace } from "@/shared/types/domain.types";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => undefined,
}));
jest.mock("expo-haptics", () => ({ ImpactFeedbackStyle: { Light: "light" }, impactAsync: jest.fn(async () => undefined) }));
jest.mock("@/shared/components/ui/UndoContext", () => ({ useUndo: () => ({ showUndo: jest.fn(), showToast: jest.fn() }) }));
jest.mock("@/features/workspaces/hooks/useWorkspaceState", () => ({
  useWorkspaceState: () => ({ workspaces: [{ id: "ws", name: "Workspace", createdAt: 1, updatedAt: 1 }], isWorkspacesHydrated: true, setWorkspaces: jest.fn(), selectedWorkspaceId: "ws", setSelectedWorkspaceId: jest.fn(), activeWorkspaceId: "ws", setActiveWorkspaceId: jest.fn(), workspaceSegment: "tasks", setWorkspaceSegment: jest.fn(), activeSegment: "tasks", setActiveSegment: jest.fn(), workspaceModalVisible: false, setWorkspaceModalVisible: jest.fn(), editingWorkspaceId: null, setEditingWorkspaceId: jest.fn(), listsExpanded: false, setListsExpanded: jest.fn(), loadWorkspaces: jest.fn(async () => [{ id: "ws", name: "Workspace", createdAt: 1, updatedAt: 1 }]), handleSelectWorkspace: jest.fn(), handleBackToWorkspaces: jest.fn(), handleCreateWorkspace: jest.fn(), handleDeleteWorkspace: jest.fn() }),
}));
jest.mock("@/features/tasks/hooks/useSelectionState", () => ({ useSelectionState: () => ({ isBulkSelectActive: false, setIsBulkSelectActive: jest.fn(), selectedItemIds: new Set(), setSelectedItemIds: jest.fn(), clearSelection: jest.fn(), toggleItemSelection: jest.fn(), selectAll: jest.fn(), deselectAll: jest.fn(), isItemSelected: jest.fn(), selectionCount: 0 }) }));
jest.mock("@/features/tasks/hooks/useTaskCrud", () => ({ useTaskCrud: () => ({ persistState: jest.fn(async () => undefined), onSaveNewTask: jest.fn(), updateTodoTitle: jest.fn(), moveTodoToList: jest.fn(), toggleTodo: jest.fn(), deleteTodo: jest.fn(), updateTodoCategory: jest.fn(), clearCompleted: jest.fn() }) }));
jest.mock("@/features/tasks/hooks/useTaskFiltering", () => ({ useTaskFiltering: () => ({ searchQuery: "", setSearchQuery: jest.fn(), selectedWorkspacePriorityFilter: "all", setSelectedWorkspacePriorityFilter: jest.fn(), selectedCategoryFilter: "all", setSelectedCategoryFilter: jest.fn(), selectedWorkspaceHabitPriorityFilter: "all", setSelectedWorkspaceHabitPriorityFilter: jest.fn(), currentTodos: [], filteredTodos: [], overdueTodos: [], todayTodos: [], upcomingTodos: [], inboxTodos: [], remainingCount: 0, completedCount: 0, unfinishedHabitCount: 0, displayedHabits: [], completedHabitCount: 0, habitCompletionPct: 0, longestStreak: 0 }) }));
jest.mock("@/features/habits/hooks/useHabitCrud", () => ({ useHabitCrud: () => ({ persistHabits: jest.fn(async () => undefined), addHabit: jest.fn(), deleteHabit: jest.fn(), toggleHabit: jest.fn() }) }));
jest.mock("@/services/scheduling/hooks/useReminderState", () => ({ useReminderState: () => ({ alarmMenu: null, setAlarmMenu: jest.fn(), scheduleAlarm: jest.fn(), scheduleAlarmWithDays: jest.fn(), cancelAlarm: jest.fn() }) }));
jest.mock("@/features/resources/hooks/useResourceState", () => ({ useResourceState: () => ({ resources: {}, loadResourcesState: jest.fn(async () => undefined), createResource: jest.fn(), updateResource: jest.fn(), deleteResource: jest.fn(), toggleArchiveResource: jest.fn() }) }));
jest.mock("@/features/checklists/hooks/useChecklistState", () => ({ useChecklistState: () => ({ checklists: {}, setChecklists: jest.fn(), loadChecklistsState: jest.fn(async () => undefined), addChecklist: jest.fn(), updateChecklist: jest.fn(), deleteChecklist: jest.fn(), toggleChecklistItem: jest.fn(), addChecklistItem: jest.fn(), deleteChecklistItem: jest.fn() }) }));
jest.mock("@/features/resources/hooks/useResourceLinkState", () => ({ useResourceLinkState: () => ({ toggleLinkResource: jest.fn() }) }));
jest.mock("@/features/settings/services/settings.service", () => ({ getProfile: jest.fn(async () => null), getNotificationLogs: jest.fn(async () => []) }));
jest.mock("@/services/events/state-events", () => ({ addStateListener: jest.fn(() => jest.fn()), emitStateChange: jest.fn() }));
jest.mock("@/repositories", () => ({
  TaskRepository: { getTasks: jest.fn() },
  HabitRepository: { getHabits: jest.fn(async () => ({})) },
  ChecklistRepository: { getChecklists: jest.fn(async () => ({})) },
  ResourceRepository: { getResources: jest.fn(async () => ({})) },
  ProfileRepository: { getProfile: jest.fn(async () => null), saveProfile: jest.fn(async () => undefined) },
  UiStateRepository: { getUiState: jest.fn(async () => ({ activeWorkspaceId: "ws", completedOnboarding: true, themeCache: "dark" })) },
}));

const task = (title: string): Task => ({ id: "task", workspaceId: "ws", title, status: "todo", priority: "none", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 });
const workspace: Workspace = { id: "ws", name: "Workspace", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 };
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((res) => { resolve = res; }); return { promise, resolve }; };

describe("Phase 0 useTasksState load ordering", () => {
  jest.setTimeout(30000);
  test("commits only the newest load response", async () => {
    const { TaskRepository } = jest.requireMock("@/repositories") as { TaskRepository: { getTasks: jest.Mock } };
    const first = deferred<Record<string, Task>>();
    const second = deferred<Record<string, Task>>();
    let count = 0;
    TaskRepository.getTasks.mockImplementation(async () => {
      count++;
      if (count === 1) return first.promise;
      return second.promise;
    });

    let api: ReturnType<typeof useTasksState> | undefined;
    function Harness() { api = useTasksState(); return null; }
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(React.createElement(Harness)); });
    try {
      let load1!: Promise<void>;
      let load2!: Promise<void>;
      act(() => {
        load1 = api!.loadState();
        load2 = api!.loadState();
      });
      await act(async () => {
        second.resolve({ task: task("new") });
        first.resolve({ task: task("old") });
        await Promise.all([load1, load2]);
      });
      expect(api!.todos.ws[0].title).toBe("new");
    } finally {
      act(() => {
        renderer!.unmount();
      });
    }
  });
});




