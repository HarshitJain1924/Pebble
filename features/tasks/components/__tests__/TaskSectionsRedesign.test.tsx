jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import React from "react";
import { act, create } from "react-test-renderer";
import { TaskSections } from "../TaskSections";
import { TodoItem } from "../TaskItem";
import { Colors } from "@/shared/constants/theme";
import type { Task, Workspace } from "@/shared/types/domain.types";

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
  NotificationFeedbackType: { Success: "success" },
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock("@expo/vector-icons", () => ({
  Feather: (props: any) => require("react").createElement("FeatherIcon", props),
  Ionicons: (props: any) => require("react").createElement("IoniconsIcon", props),
}));

jest.mock("expo-image", () => ({
  Image: (props: any) => require("react").createElement("ExpoImage", props),
}));

describe("TaskSections & TaskItem Redesign Suite", () => {
  const mockColors = Colors.dark;

  const mockWorkspaces: Workspace[] = [
    {
      id: "ws-1",
      name: "Design",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 1,
      lifecycleGeneration: 1,
    },
  ];

  const mockTaskWithResources: Task = {
    id: "task-1",
    title: "Read design article",
    description: "Read the design article and make notes...",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    workspaceId: "ws-1",
    revision: 1,
    lifecycleGeneration: 1,
    status: "todo",
    priority: "none",
    schedule: { date: "2026-09-30" },
    resourceIds: ["res-1", "res-2"],
  };

  const mockResources = [
    { id: "res-1", title: "Design article", type: "note", content: "Notes on spatial UI" },
    { id: "res-2", title: "Inspiration", type: "image", uri: "https://example.com/img.png" },
  ];

  describe("TaskSections", () => {
    it("renders Earlier section with 'Move all to Someday' button", () => {
      const onSaveEarlierForLaterMock = jest.fn();
      let renderer: any;

      act(() => {
        renderer = create(
          <TaskSections
            overdueTodos={[mockTaskWithResources]}
            todayTodos={[]}
            upcomingTodos={[]}
            inboxTodos={[]}
            workspaces={mockWorkspaces}
            selectedWorkspaceId="ws-1"
            selectedDate="2026-09-30"
            completedCount={0}
            onClearCompleted={jest.fn()}
            onToggleTodo={jest.fn()}
            onDeleteTodo={jest.fn()}
            onEditTodo={jest.fn()}
            onSetAlarm={jest.fn()}
            onSaveEarlierForLater={onSaveEarlierForLaterMock}
            allResources={mockResources}
          />
        );
      });

      const root = renderer.root;
      const textNodes = root.findAllByType("Text");
      const renderedTexts = textNodes.map((n: any) => n.props.children);

      expect(renderedTexts).toContain("Earlier");
      expect(renderedTexts).toContain("1 task");
      expect(renderedTexts).toContain("Move all to Someday");
    });
  });

  describe("TodoItem (TaskItem)", () => {
    it("renders collapsed row with circular checkbox, title, and trailing resource stack", () => {
      let renderer: any;

      act(() => {
        renderer = create(
          <TodoItem
            item={mockTaskWithResources}
            colors={mockColors}
            colorScheme="dark"
            isOverdue={false}
            lists={mockWorkspaces}
            selectedWorkspaceId="ws-1"
            onToggleTodo={jest.fn()}
            onDeleteTodo={jest.fn()}
            allResources={mockResources}
            isExpanded={false}
          />
        );
      });

      const root = renderer.root;
      const textNodes = root.findAllByType("Text");
      const renderedTexts = textNodes.map((n: any) => n.props.children);

      expect(renderedTexts).toContain("Read design article");

      // Verify trailing resource tiles exist
      const tile0 = root.findByProps({ testID: "resource-stack-tile-0" });
      const tile1 = root.findByProps({ testID: "resource-stack-tile-1" });
      expect(tile0).toBeDefined();
      expect(tile1).toBeDefined();
    });

    it("renders expanded contextual surface with description, resources strip, and 4 quick actions without any subtasks", () => {
      const onScheduleMock = jest.fn();
      const onSetAlarmMock = jest.fn();
      const onToggleTodoMock = jest.fn();
      let renderer: any;

      act(() => {
        renderer = create(
          <TodoItem
            item={mockTaskWithResources}
            colors={mockColors}
            colorScheme="dark"
            isOverdue={false}
            lists={mockWorkspaces}
            selectedWorkspaceId="ws-1"
            onToggleTodo={onToggleTodoMock}
            onDeleteTodo={jest.fn()}
            onSchedule={onScheduleMock}
            onSetAlarm={onSetAlarmMock}
            allResources={mockResources}
            isExpanded={true}
          />
        );
      });

      const root = renderer.root;
      const textNodes = root.findAllByType("Text");
      const renderedTexts = textNodes.map((n: any) => n.props.children);

      // Verify description
      expect(renderedTexts).toContain("Read the design article and make notes...");

      // Verify Resources section header
      expect(renderedTexts).toContain("Resources (2)");

      // Verify Quick Action Pills: Complete, Schedule, Reminder, More
      expect(renderedTexts).toContain("Complete");
      expect(renderedTexts).toContain("Schedule");
      expect(renderedTexts).toContain("Reminder");
      expect(renderedTexts).toContain("More");

      // Verify GUARANTEE: absolutely NO subtask UI or keywords exist
      const allTextJoined = renderedTexts.join(" ").toLowerCase();
      expect(allTextJoined).not.toContain("subtask");
      expect(allTextJoined).not.toContain("sub-task");
    });
  });
});
