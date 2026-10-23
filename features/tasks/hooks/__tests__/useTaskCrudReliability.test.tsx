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
    completeTask: jest.fn(),
    uncompleteTask: jest.fn(),
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

  it("handles concurrent completion and uncompletion of the same task deterministically without race conditions", async () => {
    let completeCallOrder = 0;
    let uncompleteCallOrder = 0;
    let sequenceCounter = 0;

    (EntityCommandService.completeTask as jest.Mock).mockImplementation(async (id: string, wsId: string) => {
      sequenceCounter++;
      completeCallOrder = sequenceCounter;
      return {
        updated: { ...initialTask, status: "completed", completedAt: 1000 },
      };
    });

    (EntityCommandService.uncompleteTask as jest.Mock).mockImplementation(async (id: string, wsId: string) => {
      sequenceCounter++;
      uncompleteCallOrder = sequenceCounter;
      return {
        updated: { ...initialTask, status: "todo", completedAt: undefined },
      };
    });

    const { ref } = renderTaskCrud({
      "ws-1": [{ ...initialTask, status: "todo" }],
    });

    let p1: Promise<any> | undefined;
    let p2: Promise<any> | undefined;

    // Trigger toggle (complete) and immediate toggle (uncomplete) concurrently on the same task
    act(() => {
      p1 = ref.current?.toggleTodo("task-100");
      p2 = ref.current?.toggleTodo("task-100");
    });

    await act(async () => {
      await Promise.all([p1, p2]);
    });

    // Verify operations executed in strict sequence
    expect(completeCallOrder).toBe(1);
    expect(uncompleteCallOrder).toBe(2);
    expect(EntityCommandService.completeTask).toHaveBeenCalledWith(
      "task-100",
      "ws-1",
      expect.anything()
    );
    expect(EntityCommandService.uncompleteTask).toHaveBeenCalledWith(
      "task-100",
      "ws-1",
      expect.anything()
    );

    // Final state must deterministically be uncompleted ("todo")
    expect(ref.todos["ws-1"][0].status).toBe("todo");
    expect(ref.todos["ws-1"][0].completedAt).toBeUndefined();
  });

  it("targeted rollback: failure in updateTodoTitle does NOT overwrite concurrent changes to other tasks", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    (EntityCommandService.updateTask as jest.Mock).mockImplementation(async (id: string) => {
      if (id === "task-100") {
        throw new Error("Simulated storage error on task-100");
      }
      return undefined;
    });

    const task200: Task = {
      ...initialTask,
      id: "task-200",
      title: "Task Two",
    };

    const { ref } = renderTaskCrud({
      "ws-1": [{ ...initialTask }, { ...task200 }],
    });

    // 1. Concurrently edit task-100 (which will fail) and edit task-200 (which succeeds)
    let p1: Promise<any> | undefined;
    let p2: Promise<any> | undefined;

    act(() => {
      p1 = ref.current?.updateTodoTitle("task-100", "Failed Title Edit");
      p2 = ref.current?.updateTodoTitle("task-200", "Successful Title Edit");
    });

    await act(async () => {
      await Promise.all([p1, p2]);
    });

    // Task-100 rolls back to original title "Test Task"
    const finalTask100 = ref.todos["ws-1"].find((t) => t.id === "task-100");
    expect(finalTask100?.title).toBe("Test Task");

    // Task-200 RETAINS its updated title "Successful Title Edit" — NOT overwritten by task-100 rollback!
    const finalTask200 = ref.todos["ws-1"].find((t) => t.id === "task-200");
    expect(finalTask200?.title).toBe("Successful Title Edit");

    warnSpy.mockRestore();
  });

  it("targeted rollback: failure in deleteTodo does NOT overwrite concurrent changes to other tasks", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    (EntityCommandService.recycleTask as jest.Mock).mockRejectedValueOnce(
      new Error("Simulated recycle failure")
    );

    const task200: Task = {
      ...initialTask,
      id: "task-200",
      title: "Task Two",
    };

    const { ref } = renderTaskCrud({
      "ws-1": [{ ...initialTask }, { ...task200 }],
    });

    // Concurrently delete task-100 (which will fail) and edit task-200 (which will succeed)
    let pDelete: Promise<any> | undefined;
    let pEdit: Promise<any> | undefined;

    act(() => {
      pDelete = ref.current?.deleteTodo("task-100");
      pEdit = ref.current?.updateTodoTitle("task-200", "Task Two Mutated");
    });

    await act(async () => {
      await Promise.all([pDelete, pEdit]);
    });

    // Task-100 rollback re-inserts it into state
    expect(ref.todos["ws-1"].some((t) => t.id === "task-100")).toBe(true);

    // Task-200 mutation is preserved
    const finalTask200 = ref.todos["ws-1"].find((t) => t.id === "task-200");
    expect(finalTask200?.title).toBe("Task Two Mutated");

    warnSpy.mockRestore();
  });

  it("forces an unexpected mutation rejection, verifies cleanup, and confirms a subsequent operation for the same task can execute without poisoning the queue", async () => {
    const unhandledRejections: any[] = [];
    const rejectionHandler = (reason: any) => {
      unhandledRejections.push(reason);
    };
    process.on("unhandledRejection", rejectionHandler);

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    // First operation on task-100 will fail with an unexpected error
    (EntityCommandService.updateTask as jest.Mock)
      .mockRejectedValueOnce(new Error("Forced unexpected mutation rejection"))
      .mockResolvedValueOnce(undefined);

    const { ref } = renderTaskCrud({
      "ws-1": [{ ...initialTask }],
    });

    // 1. Force unexpected rejection on task-100
    await act(async () => {
      await ref.current?.updateTodoTitle("task-100", "Failed Title");
    });

    // Verify cleanup: no unhandled promise rejections were emitted
    expect(unhandledRejections).toHaveLength(0);

    // 2. Confirm subsequent operation on the same task ID executes and is NOT poisoned
    await act(async () => {
      await ref.current?.updateTodoTitle("task-100", "Recovered Subsequent Title");
    });

    expect(ref.todos["ws-1"][0].title).toBe("Recovered Subsequent Title");
    expect(EntityCommandService.updateTask).toHaveBeenCalledTimes(2);

    process.off("unhandledRejection", rejectionHandler);
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

