jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-router", () => {
  const React = require("react");
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), setParams: jest.fn() }),
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: any) => {
      React.useEffect(() => {
        cb();
      }, []);
    },
  };
});
jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
}));
jest.mock("@/shared/components/ui/UndoContext", () => ({
  useUndo: () => ({ showUndo: jest.fn(), showToast: jest.fn() }),
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
    setAllResources: jest.fn(),
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
  useResourceLinkState: () => ({
    toggleLinkResource: jest.fn(),
  }),
}));
jest.mock("@/features/settings/services/settings.service", () => ({
  getProfile: jest.fn(async () => null),
  getNotificationLogs: jest.fn(async () => []),
}));
jest.mock("@/services/events/state-events", () => ({
  addStateListener: jest.fn(() => jest.fn()),
  emitStateChange: jest.fn(),
}));

import React from "react";
import { act, create } from "react-test-renderer";
import { useTasksState } from "@/features/tasks/hooks/useTasksState";
import { WorkspaceRepository, TaskRepository, UiStateRepository } from "@/repositories";
import { getTodayDateKey } from "@/shared/utils/date-key";
import type { Workspace, Task } from "@/shared/types/domain.types";

const wsA: Workspace = {
  id: "ws-a",
  name: "Workspace Alpha",
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 100,
  updatedAt: 100,
};

const wsB: Workspace = {
  id: "ws-b",
  name: "Workspace Beta",
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 200,
  updatedAt: 200,
};

const persistentTask: Task = {
  id: "task-fixed-1",
  workspaceId: "ws-a",
  title: "Scheduled Task",
  status: "todo",
  priority: "high",
  schedule: { date: "2026-12-25" },
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 100,
  updatedAt: 100,
};

describe("Workspace Date Reset Regression Suite (Phase 1B)", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await WorkspaceRepository.saveWorkspaces([wsA, wsB]);
    await TaskRepository.saveTask(persistentTask);
    await UiStateRepository.saveUiState({ activeWorkspaceId: null });
  });

  it("1. Selecting workspace initializes date context to today", async () => {
    let api: ReturnType<typeof useTasksState> | undefined;
    function Harness() {
      api = useTasksState();
      return null;
    }

    let renderer: any;
    await act(async () => {
      renderer = create(<Harness />);
    });

    try {
      await act(async () => {
        await api!.handleSelectWorkspace("ws-a");
      });

      expect(api!.activeWorkspaceId).toBe("ws-a");
      expect(api!.selectedDate).toBe(getTodayDateKey());
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  it("2. Switching tabs within the same workspace preserves the selected date", async () => {
    let api: ReturnType<typeof useTasksState> | undefined;
    function Harness() {
      api = useTasksState();
      return null;
    }

    let renderer: any;
    await act(async () => {
      renderer = create(<Harness />);
    });

    try {
      await act(async () => {
        await api!.handleSelectWorkspace("ws-a");
      });

      const offDate = "2026-11-15";
      act(() => {
        api!.setSelectedDate(offDate);
      });
      expect(api!.selectedDate).toBe(offDate);

      // Switch to Habits tab
      act(() => {
        api!.setWorkspaceSegment("habits");
      });

      expect(api!.workspaceSegment).toBe("habits");
      // Date must remain preserved across domain tabs in the same workspace
      expect(api!.selectedDate).toBe(offDate);

      // Switch back to Tasks tab
      act(() => {
        api!.setWorkspaceSegment("tasks");
      });
      expect(api!.selectedDate).toBe(offDate);
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  it("3. Selecting a different workspace resets date to today", async () => {
    let api: ReturnType<typeof useTasksState> | undefined;
    function Harness() {
      api = useTasksState();
      return null;
    }

    let renderer: any;
    await act(async () => {
      renderer = create(<Harness />);
    });

    try {
      await act(async () => {
        await api!.handleSelectWorkspace("ws-a");
      });

      const offDate = "2026-11-15";
      act(() => {
        api!.setSelectedDate(offDate);
      });
      expect(api!.selectedDate).toBe(offDate);

      // Switch to Workspace B
      await act(async () => {
        await api!.handleSelectWorkspace("ws-b");
      });

      expect(api!.activeWorkspaceId).toBe("ws-b");
      expect(api!.selectedDate).toBe(getTodayDateKey());
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  it("4. Leaving and reopening the same workspace resets date to today", async () => {
    let api: ReturnType<typeof useTasksState> | undefined;
    function Harness() {
      api = useTasksState();
      return null;
    }

    let renderer: any;
    await act(async () => {
      renderer = create(<Harness />);
    });

    try {
      await act(async () => {
        await api!.handleSelectWorkspace("ws-a");
      });

      const offDate = "2026-11-15";
      act(() => {
        api!.setSelectedDate(offDate);
      });
      expect(api!.selectedDate).toBe(offDate);

      // Leave workspace back to grid
      await act(async () => {
        await api!.handleBackToWorkspaces();
      });

      expect(api!.activeWorkspaceId).toBeNull();

      // Reopen Workspace A
      await act(async () => {
        await api!.handleSelectWorkspace("ws-a");
      });

      expect(api!.activeWorkspaceId).toBe("ws-a");
      expect(api!.selectedDate).toBe(getTodayDateKey());
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });

  it("5. Date changes do not mutate task schedule or domain state", async () => {
    let api: ReturnType<typeof useTasksState> | undefined;
    function Harness() {
      api = useTasksState();
      return null;
    }

    let renderer: any;
    await act(async () => {
      renderer = create(<Harness />);
    });

    try {
      await act(async () => {
        await api!.handleSelectWorkspace("ws-a");
      });

      act(() => {
        api!.setSelectedDate("2026-05-01");
      });

      await act(async () => {
        await api!.handleSelectWorkspace("ws-b");
      });

      // Verify task in ws-a was not modified
      const wsATasks = await TaskRepository.getTasks("ws-a");
      expect(wsATasks["task-fixed-1"]).toBeDefined();
      expect(wsATasks["task-fixed-1"].schedule?.date).toBe("2026-12-25");
      expect(wsATasks["task-fixed-1"].title).toBe("Scheduled Task");
    } finally {
      act(() => {
        renderer.unmount();
      });
    }
  });
});
