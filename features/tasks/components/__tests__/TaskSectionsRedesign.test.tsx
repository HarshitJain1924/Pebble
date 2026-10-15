jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("@/shared/utils/date-key", () => {
  const actual = jest.requireActual("@/shared/utils/date-key");
  return {
    ...actual,
    getTodayDateKey: () => "2026-09-30",
  };
});

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
      expect(renderedTexts).not.toContain("Overdue");
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

  describe("Section header system", () => {
    const makeTask = (over: Partial<Task>): Task => ({
      id: "t",
      title: "Task",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      workspaceId: "ws-1",
      revision: 1,
      lifecycleGeneration: 1,
      status: "todo",
      priority: "none",
      resourceIds: [],
      ...over,
    });

    const overdueTask = makeTask({
      id: "t-overdue",
      title: "Overdue carryover",
      schedule: { date: "2026-09-20" },
    });
    const todayTask = makeTask({
      id: "t-today",
      title: "Today task",
      schedule: { date: "2026-09-30" },
    });
    const tomorrowTask = makeTask({
      id: "t-tomorrow",
      title: "Tomorrow task",
      schedule: { date: "2026-10-01" },
    });
    const upcomingTask = makeTask({
      id: "t-upcoming",
      title: "Later task",
      schedule: { date: "2026-10-20" },
    });
    const somedayTask = makeTask({ id: "t-someday", title: "Someday task" });
    const doneTask = makeTask({
      id: "t-done",
      title: "Finished task",
      status: "completed",
      completedAt: Date.now(),
    });

    // One item in every backlog section, so both the chevron rule and the
    // collapse/expand behaviour are exercised with fewer than six items.
    const renderAllSections = (onSaveEarlierForLater?: () => void) => {
      let renderer: any;
      act(() => {
        renderer = create(
          <TaskSections
            overdueTodos={[overdueTask]}
            todayTodos={[todayTask]}
            upcomingTodos={[tomorrowTask, upcomingTask]}
            inboxTodos={[somedayTask, doneTask]}
            workspaces={mockWorkspaces}
            selectedWorkspaceId="ws-1"
            selectedDate="2026-09-30"
            completedCount={1}
            onClearCompleted={jest.fn()}
            onToggleTodo={jest.fn()}
            onDeleteTodo={jest.fn()}
            onEditTodo={jest.fn()}
            onSetAlarm={jest.fn()}
            onSaveEarlierForLater={onSaveEarlierForLater}
            allResources={mockResources}
          />
        );
      });
      return renderer.root;
    };

    const chevronsNamed = (root: any, name: string) =>
      root.findAllByType("FeatherIcon").filter((n: any) => n.props.name === name);

    const headerStartingWith = (root: any, prefix: string) =>
      root.findAll(
        (n: any) =>
          typeof n.props?.accessibilityLabel === "string" &&
          n.props.accessibilityLabel.startsWith(prefix)
      )[0];

    it("gives every collapsible backlog section a chevron even with a single item", () => {
      const root = renderAllSections();

      // Earlier + Tomorrow start expanded; Upcoming + Someday + Completed start collapsed.
      // Previously a count-based rule hid the chevron entirely on short sections.
      expect(chevronsNamed(root, "chevron-up")).toHaveLength(2);
      expect(chevronsNamed(root, "chevron-down")).toHaveLength(3);
    });

    it("collapses and expands a short section through its header and keeps a11y state accurate", () => {
      const root = renderAllSections();

      const expandedHeader = headerStartingWith(root, "Earlier section");
      expect(expandedHeader.props.accessibilityLabel).toBe(
        "Earlier section, 1 task, expanded"
      );
      expect(expandedHeader.props.accessibilityState).toEqual({ expanded: true });

      act(() => {
        expandedHeader.props.onPress();
      });

      const textsAfterCollapse = root.findAllByType("Text").map((n: any) => n.props.children);
      expect(textsAfterCollapse).not.toContain("Overdue carryover");

      const collapsedHeader = headerStartingWith(root, "Earlier section");
      expect(collapsedHeader.props.accessibilityLabel).toBe(
        "Earlier section, 1 task, collapsed"
      );
      expect(collapsedHeader.props.accessibilityState).toEqual({ expanded: false });

      act(() => {
        collapsedHeader.props.onPress();
      });

      const textsAfterExpand = root.findAllByType("Text").map((n: any) => n.props.children);
      expect(textsAfterExpand).toContain("Overdue carryover");
    });

    it("keeps the secondary action independently interactive without toggling the section", () => {
      const onSaveEarlierForLater = jest.fn();
      const root = renderAllSections(onSaveEarlierForLater);

      const action = root.findAll(
        (n: any) => n.props?.accessibilityLabel === "Move all earlier tasks to Someday"
      )[0];
      expect(action).toBeDefined();

      const event = { stopPropagation: jest.fn() };
      act(() => {
        action.props.onPress(event);
      });

      // The action stops propagation so the parent header never toggles, and it fired once.
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(onSaveEarlierForLater).toHaveBeenCalledTimes(1);

      const texts = root.findAllByType("Text").map((n: any) => n.props.children);
      expect(texts).toContain("Overdue carryover");
      expect(headerStartingWith(root, "Earlier section").props.accessibilityState).toEqual({
        expanded: true,
      });
    });
  });

  describe("TodoItem (TaskItem)", () => {
    it("renders collapsed row with circular checkbox, title, and compact trailing resource indicator", () => {
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

      // Verify compact trailing resource indicator exists with count
      const resIndicator = root.findByProps({ testID: "task-resource-indicator" });
      expect(resIndicator).toBeDefined();
      expect(renderedTexts).toContain("2");
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

      // The collapsed row keeps the title and the restrained resource indicator
      expect(collapsedTexts).toContain("Read design article");
      expect(root.findByProps({ testID: "task-resource-indicator" })).toBeDefined();

      // The old giant card is gone: no resource header, no toolbar. Description is secondary.
      expect(collapsedTexts).toContain("Read the design article and make notes...");
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
