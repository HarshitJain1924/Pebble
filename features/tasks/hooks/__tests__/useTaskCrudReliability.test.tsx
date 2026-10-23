import React from "react";
import { act, create } from "react-test-renderer";
import { useTaskCrud } from "../useTaskCrud";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { TaskDatePickerModal } from "@/features/tasks/components/TaskDatePickerModal";
import { Task, Workspace } from "@/shared/types/domain.types";

jest.mock("@/services/command/EntityCommandService", () => ({
  EntityCommandService: {
    createTask: jest.fn(),
    updateTask: jest.fn(),
    moveTask: jest.fn(),
    recycleTask: jest.fn(),
    restoreTask: jest.fn(),
    clearCompletedTasks: jest.fn(),
    reorderTasks: jest.fn(),
    reorderWorkspaces: jest.fn(),
  },
}));

jest.mock("@/repositories", () => ({
  TaskRepository: {
    getTasks: jest.fn().mockResolvedValue({}),
  },
  UiStateRepository: {
    saveUiState: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("@/plugin", () => ({
  pluginManager: {
    dispatchTaskCreated: jest.fn(),
    dispatchTaskDeleted: jest.fn(),
  },
}));

jest.mock("@/services/analytics/productivity-history.service", () => ({
  recordDailyHistorySnapshot: jest.fn(),
}));

jest.mock("@/services/analytics/widget-data.service", () => ({
  syncWidgetData: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/services/events/state-events", () => ({
  emitStateChange: jest.fn(),
}));

describe("useTaskCrud Reliability & Crash Prevention Regression Tests", () => {
  const mockWorkspaces: Workspace[] = [
    {
      id: "ws-1",
      name: "Engineering",
      color: "#000",
      order: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 1,
      lifecycleGeneration: 1,
    },
    {
      id: "ws-2",
      name: "Personal",
      color: "#000",
      order: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 1,
      lifecycleGeneration: 1,
    },
  ];

  const initialTask: Task = {
    id: "task-100",
    title: "Test Task",
    status: "todo",
    priority: "medium",
    workspaceId: "ws-1",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    revision: 1,
    lifecycleGeneration: 1,
  };

  let showUndoMock: jest.Mock;
  let showToastMock: jest.Mock;

  const renderTaskCrud = (initialTodos: Record<string, Task[]>) => {
    const ref: { current: ReturnType<typeof useTaskCrud> | null; todos: Record<string, Task[]> } = {
      current: null,
      todos: initialTodos,
    };

    const Probe = () => {
      const [todos, setTodos] = React.useState(initialTodos);
      ref.todos = todos;
      ref.current = useTaskCrud({
        todos,
        setTodos,
        selectedWorkspaceId: "ws-1",
        workspaces: mockWorkspaces,
        showUndo: showUndoMock,
        showToast: showToastMock,
      });
      return null;
    };

    let renderer: any;
    act(() => {
      renderer = create(<Probe />);
    });

    return { ref, renderer };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    showUndoMock = jest.fn();
    showToastMock = jest.fn();
  });

  it("guards against rapid consecutive calls to deleteTodo without unhandled rejections", async () => {
    let resolveRecycle: () => void = () => {};
    const recyclePromise = new Promise<void>((resolve) => {
      resolveRecycle = resolve;
    });

    (EntityCommandService.recycleTask as jest.Mock).mockImplementation(() => recyclePromise);

    const { ref } = renderTaskCrud({
      "ws-1": [{ ...initialTask }],
    });

    // Call deleteTodo concurrently twice for the same task
    let p1: Promise<void> | undefined;
    let p2: Promise<void> | undefined;
    act(() => {
      p1 = ref.current?.deleteTodo("task-100");
      p2 = ref.current?.deleteTodo("task-100");
    });

    // Resolve the first in-flight recycle
    await act(async () => {
      resolveRecycle();
      await Promise.all([p1, p2]);
    });

    // ECS recycleTask should only have been called ONCE
    expect(EntityCommandService.recycleTask).toHaveBeenCalledTimes(1);
    expect(EntityCommandService.recycleTask).toHaveBeenCalledWith(
      "task-100",
      "ws-1",
      "Engineering",
      { source: "useTaskCrud" }
    );
  });

  it("safely catches recycleTask errors and rolls back local state without crashing", async () => {
    const errorSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    (EntityCommandService.recycleTask as jest.Mock).mockRejectedValueOnce(
      new Error("Storage lock conflict")
    );

    const { ref } = renderTaskCrud({
      "ws-1": [{ ...initialTask }],
    });

    await act(async () => {
      await ref.current?.deleteTodo("task-100");
    });

    // Should not throw unhandled rejection
    expect(errorSpy).toHaveBeenCalledWith(
      "[useTaskCrud] Failed to recycle task:",
      expect.any(Error)
    );

    // Local state should have rolled back to include task-100
    expect(ref.todos["ws-1"]).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "task-100" })])
    );

    errorSpy.mockRestore();
  });

  it("safely catches updateTodoTitle errors and rolls back local state", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    (EntityCommandService.updateTask as jest.Mock).mockRejectedValueOnce(
      new Error("Network timeout or entity not found")
    );

    const { ref } = renderTaskCrud({
      "ws-1": [{ ...initialTask }],
    });

    await act(async () => {
      await ref.current?.updateTodoTitle("task-100", "New Title Attempt");
    });

    expect(warnSpy).toHaveBeenCalledWith(
      "[useTaskCrud] updateTodoTitle failed:",
      expect.any(Error)
    );

    // State rolls back to initial
    expect(ref.todos["ws-1"][0].title).toBe("Test Task");
    warnSpy.mockRestore();
  });

  it("safely catches moveTodoToList errors and rolls back local state", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    (EntityCommandService.moveTask as jest.Mock).mockRejectedValueOnce(
      new Error("Lock acquisition failure during move")
    );

    const { ref } = renderTaskCrud({
      "ws-1": [{ ...initialTask }],
      "ws-2": [],
    });

    await act(async () => {
      await ref.current?.moveTodoToList("task-100", "ws-1", "ws-2");
    });

    expect(warnSpy).toHaveBeenCalledWith(
      "[useTaskCrud] moveTodoToList failed:",
      expect.any(Error)
    );

    // State rolls back: item remains in ws-1 and not ws-2
    expect(ref.todos["ws-1"]).toEqual([expect.objectContaining({ id: "task-100" })]);
    expect(ref.todos["ws-2"]).toEqual([]);
    warnSpy.mockRestore();
  });

  it("safely catches updateTodoCategory errors and rolls back local state", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    (EntityCommandService.updateTask as jest.Mock).mockRejectedValueOnce(
      new Error("Category update failed")
    );

    const { ref } = renderTaskCrud({
      "ws-1": [{ ...initialTask, categoryId: "work" as any }],
    });

    await act(async () => {
      await ref.current?.updateTodoCategory("task-100", "personal" as any);
    });

    expect(warnSpy).toHaveBeenCalledWith(
      "[useTaskCrud] updateTodoCategory failed:",
      expect.any(Error)
    );

    // State rolls back to original category
    expect(ref.todos["ws-1"][0].categoryId).toBe("work");
    warnSpy.mockRestore();
  });

  it("TaskDatePickerModal returns null when visible is false (prevents native window leak)", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <TaskDatePickerModal
          visible={false}
          onClose={jest.fn()}
          selectedDate="2026-10-23"
          onSelectDate={jest.fn()}
          colors={{ primary: "#000", card: "#fff", border: "#ccc", text: "#000", textMuted: "#666" }}
          isDark={false}
        />
      );
    });

    expect(renderer.toJSON()).toBeNull();
  });
});
