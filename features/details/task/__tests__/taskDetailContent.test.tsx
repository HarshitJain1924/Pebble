jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    SafeAreaView: ({ children, style }: any) =>
      React.createElement(View, { style }, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Error: "error", Warning: "warning" },
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
}));
jest.mock("react-native-calendars", () => {
  const React = require("react");
  const { View } = require("react-native");
  return { Calendar: (props: any) => React.createElement(View, props) };
});
const mockUndoApi = { showToast: jest.fn(), showUndo: jest.fn() };
jest.mock("@/shared/components/ui/UndoContext", () => ({
  useUndo: () => mockUndoApi,
}));
jest.mock("@/services/events/state-events", () => ({
  emitStateChange: jest.fn(),
}));
jest.mock("@/repositories", () => ({
  TaskRepository: {
    getTask: jest.fn(),
    getTasks: jest.fn(async () => ({})),
  },
  WorkspaceRepository: {
    getWorkspaces: jest.fn(),
  },
  ResourceRepository: {
    getResources: jest.fn(),
  },
}));
jest.mock("@/services/command/EntityCommandService", () => ({
  EntityCommandService: {
    updateTask: jest.fn(async () => ({})),
    createTask: jest.fn(async () => ({})),
    moveTask: jest.fn(async () => ({})),
    recycleTask: jest.fn(async () => {}),
    restoreTask: jest.fn(async () => ({})),
    convertTaskToHabit: jest.fn(async () => ({ id: "habit-new" })),
  },
}));

import React from "react";
import { Alert, Modal, TextInput } from "react-native";
import { act, create } from "react-test-renderer";

import { TaskDetailContent } from "@/features/details/task/TaskDetailContent";
import { TaskRepository, WorkspaceRepository, ResourceRepository } from "@/repositories";
import { EntityCommandService } from "@/services/command/EntityCommandService";

type Renderer = ReturnType<typeof create>;

const baseTask: any = {
  id: "task-1",
  workspaceId: "inbox",
  title: "Ship the report",
  description: "Final draft for review",
  categoryId: "work",
  priority: "high",
  status: "todo",
  schedule: { date: "2026-08-18" },
  reminder: { enabled: true, triggerAt: 1755525600000 },
  createdAt: 1755000000000,
  updatedAt: 1755000000000,
};

const findByAccessibilityLabel = (renderer: Renderer, label: string) => {
  const matches = renderer.root.findAll(
    (node: any) => node.props?.accessibilityLabel === label,
  );
  if (matches.length === 0) {
    throw new Error(`No element found with accessibilityLabel ${label}`);
  }
  return matches[0];
};

const renderedStrings = (renderer: Renderer) =>
  renderer.root
    .findAll((node: any) => typeof node.props?.children === "string")
    .map((node: any) => node.props.children as string);

const renderContent = async (
  task: any,
  overrides: { onBack?: () => void; onConverted?: (id: string) => void } = {},
) => {
  const onBack = overrides.onBack ?? jest.fn();
  const onConverted = overrides.onConverted ?? jest.fn();
  // Feed the exact task under test through the repository mock.
  (TaskRepository.getTask as jest.Mock).mockImplementation(
    async (_id: string, workspaceId: string) =>
      workspaceId === "inbox" ? task : null,
  );
  let renderer!: Renderer;
  await act(async () => {
    renderer = create(
      <TaskDetailContent
        taskId={task.id}
        selectedOccurrenceDate="2026-08-18"
        onBack={onBack}
        onConvertedToHabit={onConverted}
      />,
    );
  });
  return { renderer, onBack, onConverted };
};

describe("TaskDetailContent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (TaskRepository.getTask as jest.Mock).mockImplementation(
      async (_id: string, workspaceId: string) =>
        workspaceId === "inbox" ? baseTask : null,
    );
    (WorkspaceRepository.getWorkspaces as jest.Mock).mockResolvedValue([]);
    (ResourceRepository.getResources as jest.Mock).mockResolvedValue({});
  });

  it("renders the task title, description, badges, schedule, and workspace after loading", async () => {
    const { renderer } = await renderContent(baseTask);
    const strings = renderedStrings(renderer);

    expect(strings).toContain("Ship the report");
    expect(strings).toContain("Final draft for review");
    // Badges
    expect(strings).toContain("Task");
    expect(strings).toContain("High");
    expect(strings).toContain("Work");
    expect(strings).toContain("Inbox");
    expect(strings).toContain("Pending");
    // Metadata rows
    expect(strings).toContain("Schedule");
    expect(strings).toContain("2026-08-18");
    expect(strings).toContain("Repeat");
    expect(strings).toContain("None");
  });

  it("shows Inbox for an unscheduled task", async () => {
    const unscheduled = { ...baseTask, schedule: undefined };
    const { renderer } = await renderContent(unscheduled);
    const strings = renderedStrings(renderer);
    expect(strings).toContain("Inbox");
  });

  it("shows 'No notes added' when the task has no description", async () => {
    const withoutNotes = { ...baseTask, description: undefined };
    const { renderer } = await renderContent(withoutNotes);
    expect(renderedStrings(renderer)).toContain("No notes added");
  });

  it("opens the recurrence-safety modal when deleting a recurring task", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const recurring = {
      ...baseTask,
      recurrence: { frequency: "daily", interval: 1 },
    };
    const { renderer } = await renderContent(recurring);
    await act(async () => {
      findByAccessibilityLabel(renderer, "Delete Item").props.onPress();
    });
    // Recurring tasks skip the confirmation Alert and show the safety modal.
    expect(alertSpy).not.toHaveBeenCalled();
    const visibleModals = renderer.root.findAll(
      (node: any) => node.type === Modal && node.props?.visible === true,
    );
    expect(visibleModals.length).toBeGreaterThan(0);
    alertSpy.mockRestore();
  });

  it("asks for confirmation before deleting a non-recurring task", async () => {
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => {});
    const { renderer } = await renderContent(baseTask);
    await act(async () => {
      findByAccessibilityLabel(renderer, "Delete Item").props.onPress();
    });
    expect(alertSpy).toHaveBeenCalledWith(
      "Delete Item",
      "Are you sure you want to permanently delete this item?",
      expect.any(Array),
    );
    alertSpy.mockRestore();
  });

  it("edits the title and saves through EntityCommandService.updateTask", async () => {
    const { renderer } = await renderContent(baseTask);

    await act(async () => {
      findByAccessibilityLabel(renderer, "Edit task").props.onPress();
    });

    const nameInput = renderer.root.findAllByType(TextInput)[0];
    expect(nameInput.props.value).toBe("Ship the report");

    await act(async () => {
      nameInput.props.onChangeText("Ship the final report");
    });

    await act(async () => {
      findByAccessibilityLabel(renderer, "Save task").props.onPress();
    });

    expect(EntityCommandService.updateTask).toHaveBeenCalledWith(
      "task-1",
      "inbox",
      expect.objectContaining({ title: "Ship the final report" }),
      expect.objectContaining({ source: "task-details" }),
    );
    expect(mockUndoApi.showToast).toHaveBeenCalledWith("Changes saved");
  });

  it("loads canonical resourceIds and persists them as resourceIds on save", async () => {
    // Canonical Task shape: resourceIds (no legacy linkedCollectionIds field).
    const withResources = {
      ...baseTask,
      resourceIds: ["res-1"],
    };
    (ResourceRepository.getResources as jest.Mock).mockImplementation(
      async (workspaceId: string) =>
        workspaceId === "inbox"
          ? {
              "res-1": {
                id: "res-1",
                workspaceId: "inbox",
                type: "link",
                title: "Design spec",
                createdAt: 1755000000000,
                updatedAt: 1755000000000,
              },
            }
          : {},
    );

    const { renderer } = await renderContent(withResources);
    const strings = renderedStrings(renderer);
    // The linked resource shows up in the card preview.
    expect(strings).toContain("Design spec");

    // Save (with an edited title) must write the linked ids back — never wipe them.
    await act(async () => {
      findByAccessibilityLabel(renderer, "Edit task").props.onPress();
    });
    const nameInput = renderer.root.findAllByType(TextInput)[0];
    await act(async () => {
      nameInput.props.onChangeText("Ship the report v2");
    });
    await act(async () => {
      findByAccessibilityLabel(renderer, "Save task").props.onPress();
    });
    const payload = (EntityCommandService.updateTask as jest.Mock).mock
      .calls[0][2];
    expect(payload).toEqual(
      expect.objectContaining({
        title: "Ship the report v2",
        // The canonical field is persisted — the legacy alias is NOT in the
        // mutation payload (regression for the linkedCollectionIds bug).
        resourceIds: ["res-1"],
      }),
    );
    expect(payload.linkedCollectionIds).toBeUndefined();
  });

  it("converts the task to a habit and routes to the new habit", async () => {
    const { renderer, onConverted } = await renderContent(baseTask);
    await act(async () => {
      findByAccessibilityLabel(renderer, "Convert to Habit").props.onPress();
    });
    expect(EntityCommandService.convertTaskToHabit).toHaveBeenCalledWith(
      "task-1",
      "inbox",
      expect.objectContaining({ source: "ui_convert" }),
    );
    expect(onConverted).toHaveBeenCalledWith("habit-new");
  });

  it("invokes onBack from the header back action", async () => {
    const { renderer, onBack } = await renderContent(baseTask);
    await act(async () => {
      findByAccessibilityLabel(renderer, "Go back").props.onPress();
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
