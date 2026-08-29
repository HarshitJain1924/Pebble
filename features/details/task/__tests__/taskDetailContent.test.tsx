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

  describe("Calendar Empty Slot Task Creation (Fix #3)", () => {
    it("TEST 1: Creating a Task from the 15:00 Calendar slot preserves schedule.date and schedule.startTime='15:00'", async () => {
      (TaskRepository.getTask as jest.Mock).mockResolvedValue(null);
      let renderer!: Renderer;
      await act(async () => {
        renderer = create(
          <TaskDetailContent
            taskId="task-new-15"
            workspaceId="inbox"
            selectedOccurrenceDate="2026-08-30"
            initialStartTime="15:00"
            onBack={jest.fn()}
            onConvertedToHabit={jest.fn()}
          />,
        );
      });

      const nameInput = renderer.root.findAllByType(TextInput)[0];
      await act(async () => {
        nameInput.props.onChangeText("Team Standup");
      });

      await act(async () => {
        findByAccessibilityLabel(renderer, "Save task").props.onPress();
      });

      expect(EntityCommandService.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Team Standup",
          schedule: expect.objectContaining({
            date: "2026-08-30",
            startTime: "15:00",
          }),
        }),
        "inbox",
        expect.anything(),
      );
    });

    it("TEST 2: Creating a Task from the 09:00 slot produces schedule.startTime='09:00'", async () => {
      (TaskRepository.getTask as jest.Mock).mockResolvedValue(null);
      let renderer!: Renderer;
      await act(async () => {
        renderer = create(
          <TaskDetailContent
            taskId="task-new-09"
            workspaceId="inbox"
            selectedOccurrenceDate="2026-08-30"
            initialStartTime="09:00"
            onBack={jest.fn()}
            onConvertedToHabit={jest.fn()}
          />,
        );
      });

      const nameInput = renderer.root.findAllByType(TextInput)[0];
      await act(async () => {
        nameInput.props.onChangeText("Morning Review");
      });

      await act(async () => {
        findByAccessibilityLabel(renderer, "Save task").props.onPress();
      });

      expect(EntityCommandService.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Morning Review",
          schedule: expect.objectContaining({
            date: "2026-08-30",
            startTime: "09:00",
          }),
        }),
        "inbox",
        expect.anything(),
      );
    });

    it("TEST 3: Selecting a Calendar time does NOT create or modify reminder.triggerAt", async () => {
      (TaskRepository.getTask as jest.Mock).mockResolvedValue(null);
      let renderer!: Renderer;
      await act(async () => {
        renderer = create(
          <TaskDetailContent
            taskId="task-new-rem"
            workspaceId="inbox"
            selectedOccurrenceDate="2026-08-30"
            initialStartTime="15:00"
            onBack={jest.fn()}
            onConvertedToHabit={jest.fn()}
          />,
        );
      });

      const nameInput = renderer.root.findAllByType(TextInput)[0];
      await act(async () => {
        nameInput.props.onChangeText("No Reminder Task");
      });

      await act(async () => {
        findByAccessibilityLabel(renderer, "Save task").props.onPress();
      });

      const createCall = (EntityCommandService.createTask as jest.Mock).mock.calls[0][0];
      expect(createCall.schedule.startTime).toBe("15:00");
      // Reminder is not created / remains undefined
      expect(createCall.reminder).toBeUndefined();
    });

    it("TEST 4: Editing an existing Task does not overwrite its existing schedule with initialStartTime", async () => {
      const existingTask = {
        ...baseTask,
        id: "task-existing-1",
        schedule: { date: "2026-08-18", startTime: "10:00" },
      };
      (TaskRepository.getTask as jest.Mock).mockImplementation(
        async (_id: string, workspaceId: string) =>
          workspaceId === "inbox" ? existingTask : null,
      );

      let renderer!: Renderer;
      await act(async () => {
        renderer = create(
          <TaskDetailContent
            taskId="task-existing-1"
            workspaceId="inbox"
            selectedOccurrenceDate="2026-08-30"
            initialStartTime="15:00"
            onBack={jest.fn()}
            onConvertedToHabit={jest.fn()}
          />,
        );
      });

      await act(async () => {
        findByAccessibilityLabel(renderer, "Edit task").props.onPress();
      });

      const nameInput = renderer.root.findAllByType(TextInput)[0];
      await act(async () => {
        nameInput.props.onChangeText("Updated Existing Task");
      });

      await act(async () => {
        findByAccessibilityLabel(renderer, "Save task").props.onPress();
      });

      expect(EntityCommandService.updateTask).toHaveBeenCalledWith(
        "task-existing-1",
        "inbox",
        expect.objectContaining({
          title: "Updated Existing Task",
          schedule: expect.objectContaining({
            date: "2026-08-18",
            startTime: "10:00",
          }),
        }),
        expect.anything(),
      );
    });

    it("TEST 5: Existing Task creation without Calendar time context continues to behave as all-day task", async () => {
      (TaskRepository.getTask as jest.Mock).mockResolvedValue(null);
      let renderer!: Renderer;
      await act(async () => {
        renderer = create(
          <TaskDetailContent
            taskId="task-new-allday"
            workspaceId="inbox"
            selectedOccurrenceDate="2026-08-30"
            onBack={jest.fn()}
            onConvertedToHabit={jest.fn()}
          />,
        );
      });

      const nameInput = renderer.root.findAllByType(TextInput)[0];
      await act(async () => {
        nameInput.props.onChangeText("All Day Task");
      });

      await act(async () => {
        findByAccessibilityLabel(renderer, "Save task").props.onPress();
      });

      const createCall = (EntityCommandService.createTask as jest.Mock).mock.calls[0][0];
      expect(createCall.schedule.date).toBe("2026-08-30");
      expect(createCall.schedule.startTime).toBeUndefined();
    });
  });

  describe("Reminder Date and Schedule Date Separation (Fix #5)", () => {
    const originalReminderDate = "2026-08-29";
    const [rY, rM, rD] = originalReminderDate.split("-").map(Number);
    const originalReminderEpoch = new Date(rY, rM - 1, rD, 20, 0, 0, 0).getTime();

    const taskWithDiffReminderDate: any = {
      id: "task-diff-rem-1",
      workspaceId: "inbox",
      title: "Schedule vs Reminder Isolation",
      description: "Testing date separation",
      categoryId: "work",
      priority: "high",
      status: "todo",
      schedule: {
        date: "2026-08-30",
        startTime: "15:00",
      },
      reminder: {
        enabled: true,
        triggerAt: originalReminderEpoch,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    it("TEST 1: Opening and saving a Task without changing reminder preserves the exact original triggerAt epoch", async () => {
      (TaskRepository.getTask as jest.Mock).mockImplementation(
        async (_id: string, workspaceId: string) =>
          workspaceId === "inbox" ? taskWithDiffReminderDate : null,
      );

      let renderer!: Renderer;
      await act(async () => {
        renderer = create(
          <TaskDetailContent
            taskId="task-diff-rem-1"
            workspaceId="inbox"
            selectedOccurrenceDate="2026-08-30"
            onBack={jest.fn()}
            onConvertedToHabit={jest.fn()}
          />,
        );
      });

      await act(async () => {
        findByAccessibilityLabel(renderer, "Edit task").props.onPress();
      });

      const nameInput = renderer.root.findAllByType(TextInput)[0];
      await act(async () => {
        nameInput.props.onChangeText("Title updated only");
      });

      await act(async () => {
        findByAccessibilityLabel(renderer, "Save task").props.onPress();
      });

      expect(EntityCommandService.updateTask).toHaveBeenCalledWith(
        "task-diff-rem-1",
        "inbox",
        expect.objectContaining({
          title: "Title updated only",
          schedule: expect.objectContaining({
            date: "2026-08-30",
            startTime: "15:00",
          }),
          reminder: expect.objectContaining({
            enabled: true,
            triggerAt: originalReminderEpoch,
          }),
        }),
        expect.anything(),
      );
    });

    it("TEST 2: Changing schedule.date does NOT move reminder.triggerAt", async () => {
      (TaskRepository.getTask as jest.Mock).mockImplementation(
        async (_id: string, workspaceId: string) =>
          workspaceId === "inbox" ? taskWithDiffReminderDate : null,
      );

      let renderer!: Renderer;
      await act(async () => {
        renderer = create(
          <TaskDetailContent
            taskId="task-diff-rem-1"
            workspaceId="inbox"
            selectedOccurrenceDate="2026-08-30"
            onBack={jest.fn()}
            onConvertedToHabit={jest.fn()}
          />,
        );
      });

      await act(async () => {
        findByAccessibilityLabel(renderer, "Edit task").props.onPress();
      });

      // Find the TaskDetailForm and trigger scheduleDate update to "2026-09-02"
      const taskForm = renderer.root.findByType(require("@/features/details/task/components/TaskDetailForm").TaskDetailForm);
      await act(async () => {
        taskForm.props.update({ scheduleDate: "2026-09-02" });
      });

      await act(async () => {
        findByAccessibilityLabel(renderer, "Save task").props.onPress();
      });

      expect(EntityCommandService.updateTask).toHaveBeenCalledWith(
        "task-diff-rem-1",
        "inbox",
        expect.objectContaining({
          schedule: expect.objectContaining({
            date: "2026-09-02",
          }),
          reminder: expect.objectContaining({
            enabled: true,
            triggerAt: originalReminderEpoch, // Stays Aug 29 20:00!
          }),
        }),
        expect.anything(),
      );
    });

    it("TEST 3: Changing schedule.startTime does NOT move reminder.triggerAt", async () => {
      (TaskRepository.getTask as jest.Mock).mockImplementation(
        async (_id: string, workspaceId: string) =>
          workspaceId === "inbox" ? taskWithDiffReminderDate : null,
      );

      let renderer!: Renderer;
      await act(async () => {
        renderer = create(
          <TaskDetailContent
            taskId="task-diff-rem-1"
            workspaceId="inbox"
            selectedOccurrenceDate="2026-08-30"
            onBack={jest.fn()}
            onConvertedToHabit={jest.fn()}
          />,
        );
      });

      await act(async () => {
        findByAccessibilityLabel(renderer, "Edit task").props.onPress();
      });

      const taskForm = renderer.root.findByType(require("@/features/details/task/components/TaskDetailForm").TaskDetailForm);
      await act(async () => {
        taskForm.props.update({ startTime: "17:00" });
      });

      await act(async () => {
        findByAccessibilityLabel(renderer, "Save task").props.onPress();
      });

      expect(EntityCommandService.updateTask).toHaveBeenCalledWith(
        "task-diff-rem-1",
        "inbox",
        expect.objectContaining({
          schedule: expect.objectContaining({
            startTime: "17:00",
          }),
          reminder: expect.objectContaining({
            enabled: true,
            triggerAt: originalReminderEpoch, // Stays Aug 29 20:00!
          }),
        }),
        expect.anything(),
      );
    });

    it("TEST 4: Changing reminder time intentionally updates triggerAt using reminderDate (Aug 29), not scheduleDate (Aug 30)", async () => {
      (TaskRepository.getTask as jest.Mock).mockImplementation(
        async (_id: string, workspaceId: string) =>
          workspaceId === "inbox" ? taskWithDiffReminderDate : null,
      );

      let renderer!: Renderer;
      await act(async () => {
        renderer = create(
          <TaskDetailContent
            taskId="task-diff-rem-1"
            workspaceId="inbox"
            selectedOccurrenceDate="2026-08-30"
            onBack={jest.fn()}
            onConvertedToHabit={jest.fn()}
          />,
        );
      });

      await act(async () => {
        findByAccessibilityLabel(renderer, "Edit task").props.onPress();
      });

      const taskForm = renderer.root.findByType(require("@/features/details/task/components/TaskDetailForm").TaskDetailForm);
      await act(async () => {
        taskForm.props.update({ reminderTime: { hour: 21, minute: 30 } });
      });

      await act(async () => {
        findByAccessibilityLabel(renderer, "Save task").props.onPress();
      });

      const expectedNewEpoch = new Date(rY, rM - 1, rD, 21, 30, 0, 0).getTime();
      expect(EntityCommandService.updateTask).toHaveBeenCalledWith(
        "task-diff-rem-1",
        "inbox",
        expect.objectContaining({
          reminder: expect.objectContaining({
            enabled: true,
            triggerAt: expectedNewEpoch,
          }),
        }),
        expect.anything(),
      );
    });

    it("TEST 5: Task with no reminder does NOT create a reminder when saved", async () => {
      const taskNoReminder: any = {
        id: "task-no-rem-save",
        workspaceId: "inbox",
        title: "No Reminder Task",
        status: "todo",
        priority: "low",
        schedule: { date: "2026-08-30" },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      (TaskRepository.getTask as jest.Mock).mockImplementation(
        async (_id: string, workspaceId: string) =>
          workspaceId === "inbox" ? taskNoReminder : null,
      );

      let renderer!: Renderer;
      await act(async () => {
        renderer = create(
          <TaskDetailContent
            taskId="task-no-rem-save"
            workspaceId="inbox"
            selectedOccurrenceDate="2026-08-30"
            onBack={jest.fn()}
            onConvertedToHabit={jest.fn()}
          />,
        );
      });

      await act(async () => {
        findByAccessibilityLabel(renderer, "Edit task").props.onPress();
      });

      const nameInput = renderer.root.findAllByType(TextInput)[0];
      await act(async () => {
        nameInput.props.onChangeText("Updated title");
      });

      await act(async () => {
        findByAccessibilityLabel(renderer, "Save task").props.onPress();
      });

      const updateCall = (EntityCommandService.updateTask as jest.Mock).mock.calls.find(
        (c) => c[0] === "task-no-rem-save",
      );
      expect(updateCall[2].reminder).toBeUndefined();
    });
  });
});
