jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import React from "react";
import { act, create } from "react-test-renderer";
import { WorkspaceEmptyState, type WorkspaceContextType } from "../WorkspaceEmptyState";
import { EmptyState } from "@/shared/components/ui/EmptyState";

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light" },
}));

describe("WorkspaceEmptyState Component", () => {
  const contexts: Array<{
    context: WorkspaceContextType;
    expectedTitle: string;
    expectedMascot: string;
    expectedAction: string;
    expectedSearchTitle: string;
  }> = [
    {
      context: "tasks",
      expectedTitle: "No tasks yet",
      expectedMascot: "idle",
      expectedAction: "New Task",
      expectedSearchTitle: "No matching tasks",
    },
    {
      context: "habits",
      expectedTitle: "No habits yet",
      expectedMascot: "focus",
      expectedAction: "New Habit",
      expectedSearchTitle: "No matching habits",
    },
    {
      context: "checklists",
      expectedTitle: "No checklists yet",
      expectedMascot: "chatting",
      expectedAction: "New Checklist",
      expectedSearchTitle: "No matching checklists",
    },
    {
      context: "resources",
      expectedTitle: "No resources yet",
      expectedMascot: "peek",
      expectedAction: "Add Resource",
      expectedSearchTitle: "No matching resources",
    },
  ];

  contexts.forEach(({ context, expectedTitle, expectedMascot, expectedAction, expectedSearchTitle }) => {
    it(`renders correct default empty state for ${context}`, () => {
      const onCreateItem = jest.fn();
      let renderer!: ReturnType<typeof create>;

      act(() => {
        renderer = create(
          <WorkspaceEmptyState
            context={context}
            onCreateItem={onCreateItem}
          />
        );
      });

      const emptyState = renderer.root.findByType(EmptyState);
      expect(emptyState.props.title).toBe(expectedTitle);
      expect(emptyState.props.mascot).toBe(expectedMascot);
      expect(emptyState.props.action.label).toBe(expectedAction);

      // Trigger create item action
      act(() => {
        emptyState.props.action.onPress();
      });
      expect(onCreateItem).toHaveBeenCalledTimes(1);
    });

    it(`renders correct search empty state for ${context}`, () => {
      const onClearSearch = jest.fn();
      let renderer!: ReturnType<typeof create>;

      act(() => {
        renderer = create(
          <WorkspaceEmptyState
            context={context}
            searchQuery="nonexistent"
            onClearSearch={onClearSearch}
          />
        );
      });

      const emptyState = renderer.root.findByType(EmptyState);
      expect(emptyState.props.title).toBe(expectedSearchTitle);
      expect(emptyState.props.mascot).toBeUndefined();
      expect(emptyState.props.action.label).toBe("Clear Search");

      // Trigger clear search action
      act(() => {
        emptyState.props.action.onPress();
      });
      expect(onClearSearch).toHaveBeenCalledTimes(1);
    });
  });
});
