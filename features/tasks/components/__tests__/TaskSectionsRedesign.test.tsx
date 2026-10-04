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
      expect(renderedTexts).toContain("Move to Someday");
    });

    it("renders Today as primary visual anchor with date context and progress", () => {
      const mockTodayTask: Task = {
        id: "task-today-1",
        title: "Focus on task",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        workspaceId: "ws-1",
        revision: 1,
        lifecycleGeneration: 1,
        status: "todo",
        priority: "none",
        schedule: { date: "2026-09-30" },
        resourceIds: [],
      };

      let renderer: any;
      act(() => {
        renderer = create(
          <TaskSections
            overdueTodos={[]}
            todayTodos={[mockTodayTask]}
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
            allResources={mockResources}
          />
        );
      });

      const root = renderer.root;
      const textNodes = root.findAllByType("Text");
      const renderedTexts = textNodes.map((n: any) => n.props.children);

      expect(renderedTexts).toContain("Focus on task");
      expect(renderedTexts).toContain("1 task");
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

    it("stays collapsed by default and reveals resources only on demand (no quick-action toolbar)", () => {
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
          />
        );
      });

      const root = renderer.root;
      const collapsedTexts = root.findAllByType("Text").map((n: any) => n.props.children);

      // The collapsed row keeps the title and the restrained resource preview
      expect(collapsedTexts).toContain("Read design article");
      expect(root.findByProps({ testID: "resource-stack-tile-0" })).toBeDefined();

      // The old giant card is gone: no description, no resource header, no toolbar
      expect(collapsedTexts).not.toContain("Read the design article and make notes...");
      expect(collapsedTexts).not.toContain("Resources (2)");
      expect(collapsedTexts).not.toContain("Schedule");
      expect(collapsedTexts).not.toContain("Reminder");
      expect(collapsedTexts).not.toContain("More");

      // Secondary actions now live behind a compact overflow affordance
      expect(
        root.findByProps({ accessibilityLabel: "More options for Read design article" })
      ).toBeDefined();

      // Tapping the resource area opens Quick Edit sheet (no inline accordion in the list row)
      const stackPressable = root.findByProps({
        accessibilityLabel: "2 linked resources for Read design article",
      });
      act(() => {
        stackPressable.props.onPress();
      });

      const quickEditTexts = root.findAllByType("Text").map((n: any) => n.props.children);
      // Quick edit opens with the resources indicator and full details option
      expect(quickEditTexts).toContain("2");
      expect(quickEditTexts).toContain("Open full details");

      // Verify GUARANTEE: absolutely NO subtask UI or keywords exist
      const allTextJoined = quickEditTexts.join(" ").toLowerCase();
      expect(allTextJoined).not.toContain("subtask");
      expect(allTextJoined).not.toContain("sub-task");
    });
  });
});
