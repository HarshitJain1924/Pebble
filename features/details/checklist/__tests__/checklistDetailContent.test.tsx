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
    toggleChecklistItem: jest.fn(async () => ({})),
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
  overrides: { onBack?: () => void; occurrenceDate?: string } = {},
) => {
  const onBack = overrides.onBack ?? jest.fn();
  (ChecklistRepository.getChecklist as jest.Mock).mockImplementation(
    async (_id: string, workspaceId: string) =>
      workspaceId === "inbox" ? checklist : null,
  );
  let renderer!: Renderer;
  await act(async () => {
    renderer = create(
      <ChecklistDetailContent
        checklistId={checklist.id}
        occurrenceDate={overrides.occurrenceDate}
        onBack={onBack}
      />,
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

  it("duplicates without inheriting runtime state or the source's notification IDs", async () => {
    const sourceChecklist = {
      ...baseChecklist,
      items: [
        { id: "item-1", title: "Milk", completed: true, completedAt: 123 },
        { id: "item-2", title: "Eggs", completed: false },
      ],
      reminder: {
        enabled: true,
        triggerAt: 1755000000000,
        notificationIds: ["source-notif-1"],
      },
      occurrenceHistory: {
        "2026-09-15": { completedItemIds: ["item-1"] },
      },
      recurrence: { frequency: "daily", interval: 1 },
      recurrenceExceptions: ["2026-09-16"],
      pebbleAwarded: true,
    };

    const { renderer, onBack } = await renderContent(sourceChecklist);

    await act(async () => {
      findByAccessibilityLabel(renderer, "Duplicate Checklist").props.onPress();
    });

    const duplicatePayload = (EntityCommandService.createChecklist as jest.Mock)
      .mock.calls[0][0];

    expect(duplicatePayload.id).not.toBe(sourceChecklist.id);
    expect(duplicatePayload.title).toBe("Weekly groceries (Copy)");
    // The duplicate owns fresh notification lifecycle state.
    expect(duplicatePayload.reminder).toMatchObject({
      enabled: true,
      triggerAt: 1755000000000,
    });
    expect(duplicatePayload.reminder.notificationIds).toBeUndefined();
    // Occurrence/runtime state is not inherited.
    expect(duplicatePayload.occurrenceHistory).toBeUndefined();
    expect(duplicatePayload.recurrenceExceptions).toBeUndefined();
    expect(duplicatePayload.pebbleAwarded).toBeUndefined();
    // Completion is reset (established duplication semantics).
    expect(duplicatePayload.items).toEqual([
      expect.objectContaining({ id: "item-1", completed: false }),
      expect.objectContaining({ id: "item-2", completed: false }),
    ]);
    // User-authored configuration is preserved.
    expect(duplicatePayload.recurrence).toEqual({
      frequency: "daily",
      interval: 1,
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("preserves every stored recurrence field the editor does not expose", async () => {
    const hourlyChecklist = {
      ...baseChecklist,
      schedule: { date: "2026-09-15", startTime: "10:00", durationMinutes: 45 },
      recurrence: {
        frequency: "custom",
        interval: 2,
        unit: "hours",
        endDate: "2026-12-31",
        occurrences: 12,
      },
    };

    const { renderer } = await renderContent(hourlyChecklist);

    await act(async () => {
      findByAccessibilityLabel(renderer, "Edit checklist").props.onPress();
    });

    const titleInput = renderer.root.findAllByType(TextInput)[0];
    await act(async () => {
      titleInput.props.onChangeText("Hourly routine renamed");
    });

    await act(async () => {
      findByAccessibilityLabel(renderer, "Save checklist").props.onPress();
    });

    expect(EntityCommandService.updateChecklist).toHaveBeenCalledWith(
      "checklist-1",
      "inbox",
      expect.objectContaining({
        title: "Hourly routine renamed",
        recurrence: {
          frequency: "custom",
          interval: 2,
          unit: "hours",
          endDate: "2026-12-31",
          occurrences: 12,
        },
      }),
    );
  });

  it("keeps weekly recurrence days and daily rules unchanged", async () => {
    const weeklyChecklist = {
      ...baseChecklist,
      schedule: { date: "2026-09-15" },
      recurrence: { frequency: "weekly", interval: 1, daysOfWeek: [1, 3] },
    };

    const { renderer } = await renderContent(weeklyChecklist);

    await act(async () => {
      findByAccessibilityLabel(renderer, "Edit checklist").props.onPress();
    });
    const titleInput = renderer.root.findAllByType(TextInput)[0];
    await act(async () => {
      titleInput.props.onChangeText("Weekly routine renamed");
    });
    await act(async () => {
      findByAccessibilityLabel(renderer, "Save checklist").props.onPress();
    });

    expect(EntityCommandService.updateChecklist).toHaveBeenCalledWith(
      "checklist-1",
      "inbox",
      expect.objectContaining({
        recurrence: expect.objectContaining({
          frequency: "weekly",
          interval: 1,
          daysOfWeek: [1, 3],
        }),
      }),
    );

    // A plain daily rule must not gain a stray unit.
    (EntityCommandService.updateChecklist as jest.Mock).mockClear();
    const dailyChecklist = {
      ...baseChecklist,
      schedule: { date: "2026-09-15" },
      recurrence: { frequency: "daily", interval: 1 },
    };
    const second = await renderContent(dailyChecklist);
    await act(async () => {
      findByAccessibilityLabel(second.renderer, "Edit checklist").props.onPress();
    });
    const dailyTitleInput = second.renderer.root.findAllByType(TextInput)[0];
    await act(async () => {
      dailyTitleInput.props.onChangeText("Daily routine renamed");
    });
    await act(async () => {
      findByAccessibilityLabel(second.renderer, "Save checklist").props.onPress();
    });

    const recurrence = (EntityCommandService.updateChecklist as jest.Mock).mock
      .calls[0][2].recurrence;
    expect(recurrence).toMatchObject({ frequency: "daily", interval: 1 });
    expect(recurrence.unit).toBeUndefined();
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

  it("L: displays Schedule & Timing metadata in read-only details view", async () => {
    const scheduledChecklist = {
      ...baseChecklist,
      schedule: {
        date: "2026-09-15",
        startTime: "10:00",
        durationMinutes: 45,
      },
      reminder: {
        enabled: true,
        triggerAt: 1755000000000,
      },
      recurrence: {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [1, 3],
      },
    };

    const { renderer } = await renderContent(scheduledChecklist);
    const strings = renderedStrings(renderer);

    expect(strings).toContain("SCHEDULE & TIMING");
    expect(strings).toContain("Schedule");
    expect(strings).toContain("2026-09-15 at 10:00 (45m)");
    expect(strings).toContain("Repeat");
    expect(strings).toContain("Weekly (Mon, Wed)");
  });

  it("M: persists schedule and recurrence changes to the same checklist entity", async () => {
    const { renderer } = await renderContent(baseChecklist);

    await act(async () => {
      findByAccessibilityLabel(renderer, "Edit checklist").props.onPress();
    });

    // In edit mode, title input is index 0
    const titleInput = renderer.root.findAllByType(TextInput)[0];
    await act(async () => {
      titleInput.props.onChangeText("Weekly groceries updated");
    });

    await act(async () => {
      findByAccessibilityLabel(renderer, "Save checklist").props.onPress();
    });

    expect(EntityCommandService.updateChecklist).toHaveBeenCalledWith(
      "checklist-1",
      "inbox",
      expect.objectContaining({
        title: "Weekly groceries updated",
        items: baseChecklist.items,
      }),
    );
  });

  it("N: Fix C - renders occurrence-isolated progress and completion when occurrenceDate is provided", async () => {
    const recurringChecklist = {
      ...baseChecklist,
      recurrence: {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [6],
      },
      // In master, item-1 is true and item-2 is false
      // But for 2026-09-05, only item-2 was completed!
      occurrenceHistory: {
        "2026-09-05": {
          completedItemIds: ["item-2"],
        },
      },
    };

    const { renderer } = await renderContent(recurringChecklist, {
      occurrenceDate: "2026-09-05",
    });

    const strings = renderedStrings(renderer);
    expect(strings).toContain("1 of 2 completed");

    // item-1 should not be checked for this occurrence
    const item1Checkbox = findByAccessibilityLabel(renderer, "Toggle Milk");
    expect(item1Checkbox.props.accessibilityState.checked).toBe(false);

    // item-2 should be checked for this occurrence
    const item2Checkbox = findByAccessibilityLabel(renderer, "Toggle Eggs");
    expect(item2Checkbox.props.accessibilityState.checked).toBe(true);
  });

  it("O: Fix C - tapping an item in view mode calls toggleChecklistItem with occurrenceDate", async () => {
    const recurringChecklist = {
      ...baseChecklist,
      recurrence: {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [6],
      },
    };

    const { renderer } = await renderContent(recurringChecklist, {
      occurrenceDate: "2026-09-05",
    });

    const item1Checkbox = findByAccessibilityLabel(renderer, "Toggle Milk");
    await act(async () => {
      item1Checkbox.props.onPress();
    });

    expect(EntityCommandService.toggleChecklistItem).toHaveBeenCalledWith(
      "checklist-1",
      "item-1",
      "inbox",
      "2026-09-05",
    );
  });

  it("P: Fix D - saving changes on recurring checklist with occurrenceDate displays choice modal and selecting 'This occurrence' detaches cleanly", async () => {
    const recurringChecklist = {
      ...baseChecklist,
      recurrence: {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [6],
      },
      schedule: {
        date: "2026-08-29",
      },
    };

    const { renderer } = await renderContent(recurringChecklist, {
      occurrenceDate: "2026-09-05",
    });

    // Enter edit mode
    await act(async () => {
      findByAccessibilityLabel(renderer, "Edit checklist").props.onPress();
    });

    // Change title
    const titleInput = renderer.root.findAllByType(TextInput)[0];
    await act(async () => {
      titleInput.props.onChangeText("Edited Occurrence Title");
    });

    // Press save
    await act(async () => {
      findByAccessibilityLabel(renderer, "Save checklist").props.onPress();
    });

    // Modal should offer "This occurrence" and "All occurrences"
    const thisOccurrenceBtn = findByAccessibilityLabel(renderer, "This occurrence");
    expect(thisOccurrenceBtn).toBeDefined();

    // Select "This occurrence"
    await act(async () => {
      thisOccurrenceBtn.props.onPress();
    });

    // Master should have exception added
    expect(EntityCommandService.updateChecklist).toHaveBeenCalledWith(
      "checklist-1",
      "inbox",
      expect.objectContaining({
        recurrenceExceptions: ["2026-09-05"],
      }),
      expect.anything(),
    );

    // Detached non-recurring copy should be created
    expect(EntityCommandService.createChecklist).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Edited Occurrence Title",
        recurrence: undefined,
        schedule: expect.objectContaining({
          date: "2026-09-05",
        }),
      }),
      "inbox",
      expect.anything(),
    );
  });

  it("Q: Fix D - selecting 'All occurrences' in choice modal updates master checklist series", async () => {
    (EntityCommandService.updateChecklist as jest.Mock).mockClear();
    (EntityCommandService.createChecklist as jest.Mock).mockClear();

    const recurringChecklist = {
      ...baseChecklist,
      recurrence: {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [6],
      },
      schedule: {
        date: "2026-08-29",
      },
    };

    const { renderer } = await renderContent(recurringChecklist, {
      occurrenceDate: "2026-09-05",
    });

    await act(async () => {
      findByAccessibilityLabel(renderer, "Edit checklist").props.onPress();
    });

    const titleInput = renderer.root.findAllByType(TextInput)[0];
    await act(async () => {
      titleInput.props.onChangeText("Renamed Entire Series");
    });

    await act(async () => {
      findByAccessibilityLabel(renderer, "Save checklist").props.onPress();
    });

    const allOccurrencesBtn = findByAccessibilityLabel(renderer, "All occurrences");
    await act(async () => {
      allOccurrencesBtn.props.onPress();
    });

    // Should update master series without creating a detached copy
    expect(EntityCommandService.updateChecklist).toHaveBeenCalledWith(
      "checklist-1",
      "inbox",
      expect.objectContaining({
        title: "Renamed Entire Series",
        recurrence: expect.objectContaining({ frequency: "weekly" }),
      }),
    );
    expect(EntityCommandService.createChecklist).not.toHaveBeenCalled();
  });

  it("R: Fix F - displays reminder date when reminder date differs from scheduled date", async () => {
    // Reminder on 2026-09-14 at 9:00 AM, scheduled date on 2026-09-15
    const triggerAtEpoch = new Date("2026-09-14T09:00:00").getTime();
    const checklistWithDiffReminder = {
      ...baseChecklist,
      schedule: {
        date: "2026-09-15",
      },
      reminder: {
        enabled: true,
        triggerAt: triggerAtEpoch,
      },
    };

    const { renderer } = await renderContent(checklistWithDiffReminder);
    const strings = renderedStrings(renderer);
    expect(strings).toContain("2026-09-14 at 9:00 AM");
  });
});

const renderContentWithNotFound = async (onBack: jest.Mock) => {
  (ChecklistRepository.getChecklist as jest.Mock).mockResolvedValue(null);
  await act(async () => {
    create(<ChecklistDetailContent checklistId="missing" onBack={onBack} />);
  });
};
