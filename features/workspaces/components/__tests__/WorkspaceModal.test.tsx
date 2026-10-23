jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
import React from "react";
import { act, create } from "react-test-renderer";
import { Alert } from "react-native";
import { WorkspaceModal } from "@/features/workspaces/components/WorkspaceModal";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import type { Habit, Task, Workspace } from "@/shared/types/domain.types";

const mockShowUndo = jest.fn();
jest.mock("@/shared/components/ui/UndoContext", () => ({
  useUndo: () => ({ showUndo: mockShowUndo }),
}));

jest.mock("expo-haptics", () => ({
  NotificationFeedbackType: { Success: "success" },
  notificationAsync: jest.fn(async () => undefined),
}));

jest.mock("@/repositories", () => ({
  UiStateRepository: {
    saveUiState: jest.fn(async () => undefined),
  },
  WorkspaceRepository: {},
  TaskRepository: {},
  HabitRepository: {},
}));

jest.mock("@/services/command/EntityCommandService", () => ({
  EntityCommandService: {
    createWorkspace: jest.fn(async () => undefined),
    updateWorkspace: jest.fn(async () => undefined),
    deleteWorkspace: jest.fn(async () => undefined),
    restoreWorkspace: jest.fn(async () => undefined),
  },
}));

const existingWorkspaces: Workspace[] = [
  {
    id: "ws-1",
    name: "Engineering",
    iconType: "emoji",
    emoji: "💻",
    color: "#358366",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  },
  {
    id: "ws-2",
    name: "Personal",
    iconType: "emoji",
    emoji: "🏠",
    color: "#2C6C54",
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  },
];

const existingTodos: Record<string, Task[]> = {
  "ws-1": [
    {
      id: "t-1",
      workspaceId: "ws-1",
      title: "Code review",
      status: "todo",
      priority: "none",
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: 1000,
      updatedAt: 1000,
    },
  ],
  "ws-2": [],
};

const existingHabits: Habit[] = [
  {
    id: "h-1",
    workspaceId: "ws-1",
    title: "Read 20 mins",
    recurrence: { frequency: "daily", interval: 1 },
    completionHistory: [],
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  },
];

function findButtonByText(root: any, text: string) {
  const textNode = root.findAll((node: any) => node.props?.children === text)[0];
  let current = textNode?.parent;
  while (current && !current.props?.onPress) {
    current = current.parent;
  }
  return current;
}

function findTextInput(root: any) {
  return root.findAll((node: any) => typeof node.props?.onChangeText === "function")[0];
}

describe("WorkspaceModal — Regression tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Create flow: creates workspace via EntityCommandService.createWorkspace and commits UI state", async () => {
    const onClose = jest.fn();
    const setWorkspaces = jest.fn();
    const setTodos = jest.fn();
    const setSelectedWorkspaceId = jest.fn();
    const setActiveWorkspaceId = jest.fn();
    const setHabits = jest.fn();

    let renderer: any;
    await act(async () => {
      renderer = create(
        <WorkspaceModal
          visible={true}
          onClose={onClose}
          editingWorkspaceId={null}
          workspaces={existingWorkspaces}
          setWorkspaces={setWorkspaces}
          todos={existingTodos}
          setTodos={setTodos}
          selectedWorkspaceId="ws-1"
          setSelectedWorkspaceId={setSelectedWorkspaceId}
          activeWorkspaceId="ws-1"
          setActiveWorkspaceId={setActiveWorkspaceId}
          habits={existingHabits}
          setHabits={setHabits}
        />,
      );
    });

    const textInput = findTextInput(renderer.root);
    expect(textInput).toBeDefined();
    await act(async () => {
      textInput.props.onChangeText("Design System");
    });

    const saveButton = findButtonByText(renderer.root, "Create Workspace");
    expect(saveButton).toBeDefined();

    await act(async () => {
      await saveButton.props.onPress();
    });

    // Assert EntityCommandService.createWorkspace called
    expect(EntityCommandService.createWorkspace).toHaveBeenCalledTimes(1);
    const createdWorkspace = (EntityCommandService.createWorkspace as jest.Mock).mock
      .calls[0][0];
    expect(createdWorkspace.name).toBe("Design System");

    // Assert UI commits on success
    expect(setWorkspaces).toHaveBeenCalled();
    expect(setTodos).toHaveBeenCalled();
    expect(setSelectedWorkspaceId).toHaveBeenCalledWith(createdWorkspace.id);
    expect(onClose).toHaveBeenCalled();
  });

  test("Edit flow: updates workspace via EntityCommandService.updateWorkspace and commits UI state", async () => {
    const onClose = jest.fn();
    const setWorkspaces = jest.fn();
    const setTodos = jest.fn();
    const setSelectedWorkspaceId = jest.fn();
    const setActiveWorkspaceId = jest.fn();
    const setHabits = jest.fn();

    let renderer: any;
    await act(async () => {
      renderer = create(
        <WorkspaceModal
          visible={true}
          onClose={onClose}
          editingWorkspaceId="ws-1"
          workspaces={existingWorkspaces}
          setWorkspaces={setWorkspaces}
          todos={existingTodos}
          setTodos={setTodos}
          selectedWorkspaceId="ws-1"
          setSelectedWorkspaceId={setSelectedWorkspaceId}
          activeWorkspaceId="ws-1"
          setActiveWorkspaceId={setActiveWorkspaceId}
          habits={existingHabits}
          setHabits={setHabits}
        />,
      );
    });

    const textInput = findTextInput(renderer.root);
    await act(async () => {
      textInput.props.onChangeText("Core Platform");
    });

    const saveButton = findButtonByText(renderer.root, "Save Changes");
    expect(saveButton).toBeDefined();

    await act(async () => {
      await saveButton.props.onPress();
    });

    // Assert EntityCommandService.updateWorkspace called with updated name
    expect(EntityCommandService.updateWorkspace).toHaveBeenCalledTimes(1);
    const updatedWorkspace = (EntityCommandService.updateWorkspace as jest.Mock).mock
      .calls[0][0];
    expect(updatedWorkspace.id).toBe("ws-1");
    expect(updatedWorkspace.name).toBe("Core Platform");

    // Assert UI commits on success
    expect(setWorkspaces).toHaveBeenCalled();
    // Verify task partitions were NOT rewritten
    expect(setTodos).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  test("Delete flow — Successful: deletes via ECS, reconciles local state and wires undo", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    (EntityCommandService.deleteWorkspace as jest.Mock).mockResolvedValue(undefined);

    const onClose = jest.fn();
    let currentWorkspaces = [...existingWorkspaces];
    const setWorkspaces = jest.fn((updater: any) => {
      currentWorkspaces =
        typeof updater === "function" ? updater(currentWorkspaces) : updater;
    });
    let currentTodos = { ...existingTodos };
    const setTodos = jest.fn((updater: any) => {
      currentTodos =
        typeof updater === "function" ? updater(currentTodos) : updater;
    });
    let currentHabits = [...existingHabits];
    const setHabits = jest.fn((updater: any) => {
      currentHabits =
        typeof updater === "function" ? updater(currentHabits) : updater;
    });
    const setSelectedWorkspaceId = jest.fn();
    const setActiveWorkspaceId = jest.fn();

    let renderer: any;
    await act(async () => {
      renderer = create(
        <WorkspaceModal
          visible={true}
          onClose={onClose}
          editingWorkspaceId="ws-1"
          workspaces={existingWorkspaces}
          setWorkspaces={setWorkspaces}
          todos={existingTodos}
          setTodos={setTodos}
          selectedWorkspaceId="ws-1"
          setSelectedWorkspaceId={setSelectedWorkspaceId}
          activeWorkspaceId="ws-1"
          setActiveWorkspaceId={setActiveWorkspaceId}
          habits={existingHabits}
          setHabits={setHabits}
        />,
      );
    });

    const deleteButton = findButtonByText(renderer.root, "Delete");
    expect(deleteButton).toBeDefined();

    // Trigger Delete alert
    await act(async () => {
      deleteButton.props.onPress();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      "Delete Workspace",
      expect.stringContaining("Are you sure"),
      expect.any(Array),
    );

    // Confirm deletion in Alert
    const alertButtons = alertSpy.mock.calls[0][2] as any[];
    const confirmDeleteBtn = alertButtons.find((b) => b.text === "Delete");
    expect(confirmDeleteBtn).toBeDefined();

    await act(async () => {
      await confirmDeleteBtn.onPress();
    });

    // Assert EntityCommandService.deleteWorkspace called
    expect(EntityCommandService.deleteWorkspace).toHaveBeenCalledWith("ws-1");

    // Assert local state reconciliation
    expect(setWorkspaces).toHaveBeenCalledWith(
      expect.not.arrayContaining([expect.objectContaining({ id: "ws-1" })]),
    );
    expect(setTodos).toHaveBeenCalled();
    expect(currentTodos["ws-1"]).toBeUndefined();
    expect(setHabits).toHaveBeenCalled();
    expect(setSelectedWorkspaceId).toHaveBeenCalledWith("ws-2");
    expect(onClose).toHaveBeenCalled();

    // Assert undo wired to EntityCommandService.restoreWorkspace
    expect(mockShowUndo).toHaveBeenCalledTimes(1);
    const undoPayload = mockShowUndo.mock.calls[0][0];
    expect(undoPayload.message).toContain("Engineering");

    // Trigger undo
    await act(async () => {
      await undoPayload.onUndo();
    });
    expect(EntityCommandService.restoreWorkspace).toHaveBeenCalledWith("rb-ws-1");
  });

  test("Delete flow — Failed: halts on ECS failure, stops flow and does NOT modify local state", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    (EntityCommandService.deleteWorkspace as jest.Mock).mockRejectedValue(
      new Error("Lock timeout or database failure"),
    );

    const onClose = jest.fn();
    const setWorkspaces = jest.fn();
    const setTodos = jest.fn();
    const setHabits = jest.fn();
    const setSelectedWorkspaceId = jest.fn();
    const setActiveWorkspaceId = jest.fn();

    let renderer: any;
    await act(async () => {
      renderer = create(
        <WorkspaceModal
          visible={true}
          onClose={onClose}
          editingWorkspaceId="ws-1"
          workspaces={existingWorkspaces}
          setWorkspaces={setWorkspaces}
          todos={existingTodos}
          setTodos={setTodos}
          selectedWorkspaceId="ws-1"
          setSelectedWorkspaceId={setSelectedWorkspaceId}
          activeWorkspaceId="ws-1"
          setActiveWorkspaceId={setActiveWorkspaceId}
          habits={existingHabits}
          setHabits={setHabits}
        />,
      );
    });

    const deleteButton = findButtonByText(renderer.root, "Delete");
    expect(deleteButton).toBeDefined();

    // Trigger Delete alert
    await act(async () => {
      deleteButton.props.onPress();
    });

    const alertButtons = alertSpy.mock.calls[0][2] as any[];
    const confirmDeleteBtn = alertButtons.find((b) => b.text === "Delete");

    await act(async () => {
      await confirmDeleteBtn.onPress();
    });

    // Assert ECS was called and threw
    expect(EntityCommandService.deleteWorkspace).toHaveBeenCalledWith("ws-1");

    // Critical assertion: local state MUST NOT be modified when delete fails
    expect(setWorkspaces).not.toHaveBeenCalled();
    expect(setTodos).not.toHaveBeenCalled();
    expect(setHabits).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(mockShowUndo).not.toHaveBeenCalled();

    // Error alert presented
    expect(alertSpy).toHaveBeenCalledWith(
      "Delete Failed",
      "Failed to delete workspace. Please try again.",
    );
  });
});
