import React from "react";
import { act, create } from "react-test-renderer";

import { WorkspaceStreamSection } from "../WorkspaceStreamSection";
import { buildWorkspaceStreamSection } from "@/features/today/hooks/useWorkspaceStream";
import { Colors } from "@/shared/constants/theme";
import type { Checklist, Workspace } from "@/shared/types/domain.types";

jest.mock("expo-image", () => ({
  Image: (props: any) => require("react").createElement("ExpoImage", props),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "light" },
  NotificationFeedbackType: { Success: "success" },
}));

jest.mock("@expo/vector-icons", () => ({
  Feather: (props: any) =>
    require("react").createElement("FeatherIcon", props),
  Ionicons: (props: any) =>
    require("react").createElement("IoniconsIcon", props),
}));

jest.mock("@/shared/components/ui/PressableScale", () => {
  const ReactModule = require("react");
  const { View } = require("react-native");
  const Comp = ({ children, onPress, ...props }: any) =>
    ReactModule.createElement(View, { onPress, ...props }, children);
  return { __esModule: true, default: Comp, PressableScale: Comp };
});

jest.mock("@/shared/components/ui/ProgressRing", () => ({
  ProgressRing: (props: any) =>
    require("react").createElement("ProgressRing", props),
}));

const REF = "2026-03-10";

const workspace: Workspace = {
  id: "ws-1",
  name: "Work",
  emoji: "📁",
  color: "#3B82F6",
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1000,
  updatedAt: 1000,
};

const recurringChecklist: Checklist = {
  id: "chk-recurring",
  workspaceId: workspace.id,
  title: "Daily routine",
  priority: "none",
  items: [
    { id: "i1", title: "Item one", completed: false },
    { id: "i2", title: "Item two", completed: false },
  ],
  recurrence: { frequency: "daily", interval: 1 },
  schedule: { date: "2026-03-01", startTime: "09:00" },
  occurrenceHistory: {
    [REF]: { completedItemIds: ["i1"] },
  },
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1000,
  updatedAt: 1000,
};

const renderSection = () => {
  const section = buildWorkspaceStreamSection(
    {
      folder: workspace,
      tasks: [],
      habits: [],
      checklists: [recurringChecklist],
      totalCount: 1,
    },
    [],
    { isDark: true, primaryColor: "#3B82F6", todayKey: REF },
  );

  const toggleChecklistItemFromDashboard = jest.fn(async () => undefined);

  let renderer: any;
  act(() => {
    renderer = create(
      <WorkspaceStreamSection
        section={section}
        colors={Colors.dark}
        colorScheme="dark"
        hasTabs={false}
        isCollapsed={false}
        onToggleCollapse={jest.fn()}
        onOpenWorkspace={jest.fn()}
        onOpenAllWork={jest.fn()}
        router={{ push: jest.fn() } as any}
        expandedChecklistIds={{ [recurringChecklist.id]: true }}
        setExpandedChecklistIds={jest.fn()}
        completeTodoFromDashboard={jest.fn(async () => undefined)}
        completeHabitFromDashboard={jest.fn(async () => undefined)}
        toggleChecklistItemFromDashboard={toggleChecklistItemFromDashboard}
      />,
    );
  });

  return { renderer, toggleChecklistItemFromDashboard };
};

describe("WorkspaceStreamSection checklist occurrence awareness", () => {
  it("renders occurrence completion even though the master items are uncompleted", () => {
    const { renderer } = renderSection();
    const root = renderer.root;

    // Progress counter comes from the occurrence, not master items.
    expect(
      root.findAll(
        (node: any) =>
          typeof node.props?.children === "string" &&
          node.props.children === "1/2",
      ).length,
    ).toBeGreaterThan(0);

    const completedItem = root.findByProps({
      accessibilityLabel: "Checklist item Item one",
    });
    const pendingItem = root.findByProps({
      accessibilityLabel: "Checklist item Item two",
    });

    expect(completedItem.props.accessibilityState).toEqual({ checked: true });
    expect(pendingItem.props.accessibilityState).toEqual({ checked: false });
  });

  it("forwards the resolved occurrence dateKey when toggling an item", () => {
    const { renderer, toggleChecklistItemFromDashboard } = renderSection();

    const pendingItem = renderer.root.findByProps({
      accessibilityLabel: "Checklist item Item two",
    });
    act(() => {
      pendingItem.props.onPress();
    });

    expect(toggleChecklistItemFromDashboard).toHaveBeenCalledWith(
      recurringChecklist.id,
      "i2",
      workspace.id,
      REF,
    );
  });
});
