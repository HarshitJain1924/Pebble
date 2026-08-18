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
const mockUndoApi = { showToast: jest.fn(), showUndo: jest.fn() };
jest.mock("@/shared/components/ui/UndoContext", () => ({
  useUndo: () => mockUndoApi,
}));
jest.mock("@/services/events/state-events", () => ({
  emitStateChange: jest.fn(),
}));
jest.mock("@/repositories", () => ({
  ChecklistRepository: {
    getChecklist: jest.fn(),
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
    updateChecklist: jest.fn(async () => ({})),
    moveChecklist: jest.fn(async () => ({})),
    createChecklist: jest.fn(async () => ({})),
    recycleChecklist: jest.fn(async () => {}),
  },
}));

import React from "react";
import { Alert, TextInput } from "react-native";
import { act, create } from "react-test-renderer";

import { ChecklistDetailContent } from "@/features/details/checklist/ChecklistDetailContent";
import {
  ChecklistRepository,
  ResourceRepository,
  WorkspaceRepository,
} from "@/repositories";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { emitStateChange } from "@/services/events/state-events";

type Renderer = ReturnType<typeof create>;

const baseChecklist: any = {
  id: "checklist-1",
  workspaceId: "inbox",
  title: "Weekly groceries",
  description: "Buy healthy food",
  items: [
    { id: "item-1", title: "Milk", completed: true },
    { id: "item-2", title: "Eggs", completed: false },
  ],
  resourceIds: [],
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
  checklist: any,
  overrides: { onBack?: () => void } = {},
) => {
  const onBack = overrides.onBack ?? jest.fn();
  (ChecklistRepository.getChecklist as jest.Mock).mockImplementation(
    async (_id: string, workspaceId: string) =>
      workspaceId === "inbox" ? checklist : null,
  );
  let renderer!: Renderer;
  await act(async () => {
    renderer = create(
      <ChecklistDetailContent checklistId={checklist.id} onBack={onBack} />,
    );
  });
  return { renderer, onBack };
};

describe("ChecklistDetailContent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (WorkspaceRepository.getWorkspaces as jest.Mock).mockResolvedValue([]);
    (ResourceRepository.getResources as jest.Mock).mockResolvedValue({});
  });

  const mockInboxResources = (resources: Record<string, any>) => {
    (ResourceRepository.getResources as jest.Mock).mockImplementation(
      async (workspaceId: string) =>
        workspaceId === "inbox" ? resources : {},
    );
  };

  it("renders the checklist title, description, workspace, progress, and items", async () => {
    const { renderer } = await renderContent(baseChecklist);
    const strings = renderedStrings(renderer);

    expect(strings).toContain("Weekly groceries");
    expect(strings).toContain("Buy healthy food");
    expect(strings).toContain("Inbox");
    // Progress: "1 of 2 completed"
    expect(strings).toContain("1 of 2 completed");
    // Item titles
    expect(strings).toContain("Milk");
    expect(strings).toContain("Eggs");
    // Created date (preserved formatting)
    const expectedDate = new Date(baseChecklist.createdAt).toLocaleDateString(
      undefined,
      { dateStyle: "medium" },
    );
    expect(strings).toContain(expectedDate);
  });

  it("renders section labels and preserves the no-resources stub", async () => {
    const { renderer } = await renderContent(baseChecklist);
    const strings = renderedStrings(renderer);
    expect(strings).toContain("PROGRESS");
    expect(strings).toContain("CHECKLIST ITEMS");
    expect(strings).toContain("LINKED RESOURCES");
    // The resource list is never loaded (pre-existing stub) so the section
    // always reports no linked resources.
    expect(strings).toContain("No resources linked.");
  });

  it("loads resources and displays linked resource rows", async () => {
    const withResources = {
      ...baseChecklist,
      resourceIds: ["res-1"],
    };
    mockInboxResources({
      "res-1": {
        id: "res-1",
        workspaceId: "inbox",
        type: "note",
        title: "Grocery list",
        body: "Staples",
        createdAt: 1755000000000,
        updatedAt: 1755000000000,
      },
    });

    const { renderer } = await renderContent(withResources);
    const strings = renderedStrings(renderer);

    // Resources are loaded from the repository for the checklist's workspace.
    expect(ResourceRepository.getResources).toHaveBeenCalledWith("inbox");
    // The linked resource title now appears instead of the empty placeholder.
    expect(strings).toContain("Grocery list");
    expect(strings).not.toContain("No resources linked.");
  });

  it("saves linked resource ids as canonical resourceIds", async () => {
    const withResources = {
      ...baseChecklist,
      resourceIds: ["res-1"],
    };
    mockInboxResources({
      "res-1": {
        id: "res-1",
        workspaceId: "inbox",
        type: "note",
        title: "Grocery list",
        createdAt: 1755000000000,
        updatedAt: 1755000000000,
      },
    });

    const { renderer } = await renderContent(withResources);

    await act(async () => {
      findByAccessibilityLabel(renderer, "Edit checklist").props.onPress();
    });
    const titleInput = renderer.root.findAllByType(TextInput)[0];
    await act(async () => {
      titleInput.props.onChangeText("Weekly groceries v2");
    });
    await act(async () => {
      findByAccessibilityLabel(renderer, "Save checklist").props.onPress();
    });

    const payload = (EntityCommandService.updateChecklist as jest.Mock).mock
      .calls[0][2];
    expect(payload).toEqual(
      expect.objectContaining({
        title: "Weekly groceries v2",
        resourceIds: ["res-1"],
      }),
    );
    expect(payload.linkedCollectionIds).toBeUndefined();
  });

  it("unlinks a resource in edit mode and persists the change", async () => {
    const withResources = {
      ...baseChecklist,
      resourceIds: ["res-1"],
    };
    mockInboxResources({
      "res-1": {
        id: "res-1",
        workspaceId: "inbox",
        type: "note",
        title: "Grocery list",
        createdAt: 1755000000000,
        updatedAt: 1755000000000,
      },
    });

    const { renderer } = await renderContent(withResources);

    await act(async () => {
      findByAccessibilityLabel(renderer, "Edit checklist").props.onPress();
    });
    // Edit mode shows the linked resource row with an unlink action.
    await act(async () => {
      findByAccessibilityLabel(renderer, "Unlink Grocery list").props.onPress();
    });
    await act(async () => {
      findByAccessibilityLabel(renderer, "Save checklist").props.onPress();
    });

    const payload = (EntityCommandService.updateChecklist as jest.Mock).mock
      .calls[0][2];
    expect(payload.resourceIds).toEqual([]);
  });

  it("shows the empty-items placeholder when the checklist has no items", async () => {
    const empty = { ...baseChecklist, items: [] };
    const { renderer } = await renderContent(empty);
    expect(renderedStrings(renderer)).toContain("No items in this checklist.");
  });

  it("shows an alert and backs out when the checklist cannot be found", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const onBack = jest.fn();
    await renderContentWithNotFound(onBack);
    expect(alertSpy).toHaveBeenCalledWith("Error", "Checklist not found.");
    expect(onBack).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });

  it("edits the title and saves through EntityCommandService.updateChecklist", async () => {
    const { renderer } = await renderContent(baseChecklist);

    await act(async () => {
      findByAccessibilityLabel(renderer, "Edit checklist").props.onPress();
    });

    const titleInput = renderer.root.findAllByType(TextInput)[0];
    expect(titleInput.props.value).toBe("Weekly groceries");

    await act(async () => {
      titleInput.props.onChangeText("Weekly groceries + snacks");
    });

    await act(async () => {
      findByAccessibilityLabel(renderer, "Save checklist").props.onPress();
    });

    expect(EntityCommandService.updateChecklist).toHaveBeenCalledWith(
      "checklist-1",
      "inbox",
      expect.objectContaining({ title: "Weekly groceries + snacks" }),
    );
    expect(EntityCommandService.moveChecklist).not.toHaveBeenCalled();
  });

  it("adds an item in edit mode and persists it on save", async () => {
    const { renderer } = await renderContent(baseChecklist);

    await act(async () => {
      findByAccessibilityLabel(renderer, "Edit checklist").props.onPress();
    });

    const textInputs = renderer.root.findAllByType(TextInput);
    // [0]=title, [1]=description, [2]=item-1, [3]=item-2, [4]=add-item
    const addItemInput = textInputs[4];
    await act(async () => {
      addItemInput.props.onChangeText("Bread");
    });
    await act(async () => {
      findByAccessibilityLabel(renderer, "Add item").props.onPress();
    });

    await act(async () => {
      findByAccessibilityLabel(renderer, "Save checklist").props.onPress();
    });

    expect(EntityCommandService.updateChecklist).toHaveBeenCalledWith(
      "checklist-1",
      "inbox",
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ title: "Bread", completed: false }),
        ]),
      }),
    );
  });

  it("duplicates the checklist through createChecklist and navigates back", async () => {
    const { renderer, onBack } = await renderContent(baseChecklist);

    await act(async () => {
      findByAccessibilityLabel(renderer, "Duplicate Checklist").props.onPress();
    });

    expect(EntityCommandService.createChecklist).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^checklist-/),
        title: "Weekly groceries (Copy)",
      }),
      "inbox",
      { skipEvents: true, skipAnalytics: true },
    );
    expect(emitStateChange).toHaveBeenCalledWith("checklists_changed");
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("asks for confirmation before archiving, then updates through ECS", async () => {
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => {});
    const { renderer, onBack } = await renderContent(baseChecklist);

    await act(async () => {
      findByAccessibilityLabel(renderer, "Archive Checklist").props.onPress();
    });
    expect(alertSpy).toHaveBeenCalledWith(
      "Archive Checklist",
      "Archive this checklist?",
      expect.any(Array),
    );

    // Confirm via the Archive button in the alert.
    const buttons = alertSpy.mock.calls[0][2] as any[];
    await act(async () => {
      buttons[1].onPress();
    });

    expect(EntityCommandService.updateChecklist).toHaveBeenCalledWith(
      "checklist-1",
      "inbox",
      expect.objectContaining({ archivedAt: expect.any(Number) }),
    );
    expect(onBack).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });

  it("asks for confirmation before deleting, then recycles through ECS", async () => {
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => {});
    const { renderer, onBack } = await renderContent(baseChecklist);

    await act(async () => {
      findByAccessibilityLabel(renderer, "Delete Checklist").props.onPress();
    });
    expect(alertSpy).toHaveBeenCalledWith(
      "Delete Checklist",
      "Delete this checklist permanently?",
      expect.any(Array),
    );

    const buttons = alertSpy.mock.calls[0][2] as any[];
    await act(async () => {
      buttons[1].onPress();
    });

    expect(EntityCommandService.recycleChecklist).toHaveBeenCalledWith(
      "checklist-1",
      "inbox",
    );
    expect(onBack).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });
});

const renderContentWithNotFound = async (onBack: jest.Mock) => {
  (ChecklistRepository.getChecklist as jest.Mock).mockResolvedValue(null);
  await act(async () => {
    create(<ChecklistDetailContent checklistId="missing" onBack={onBack} />);
  });
};
