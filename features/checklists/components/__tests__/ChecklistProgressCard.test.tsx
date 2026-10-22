import React from "react";
import { act, create } from "react-test-renderer";
import { ChecklistProgressCard } from "../ChecklistProgressCard";
import { Colors } from "@/shared/constants/theme";
import { Checklist } from "@/shared/types/domain.types";
import { getTodayDateKey } from "@/shared/utils/date-key";
import { Text as RNText, View as RNView } from "react-native";

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("@/shared/components/ui/SwipeableCard", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    SwipeableCard: ({ children }: any) => React.createElement(View, null, children),
  };
});

jest.mock("@/shared/components/ui/PressableScale", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Comp = ({ children, onPress, ...props }: any) =>
    React.createElement(View, { onPress, ...props }, children);
  return {
    __esModule: true,
    default: Comp,
    PressableScale: Comp,
  };
});

jest.mock("@expo/vector-icons", () => ({
  Feather: (props: any) => require("react").createElement("FeatherIcon", props),
  Ionicons: (props: any) => require("react").createElement("IoniconsIcon", props),
}));

describe("ChecklistProgressCard Component Redesign", () => {
  const baseChecklist: Checklist = {
    id: "chk-card-1",
    workspaceId: "ws-1",
    title: "Grocery Shopping",
    priority: "high",
    categoryId: "groceries",
    items: [
      { id: "i1", title: "Apples", completed: true },
      { id: "i2", title: "Bread", completed: false },
      { id: "i3", title: "Milk", completed: false },
    ],
    revision: 1,
    lifecycleGeneration: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  it("renders collapsed checklist with priority strip, inline category icon, neutral surface, and actionable preview", () => {
    const onToggleExpandMock = jest.fn();
    const onToggleChecklistMock = jest.fn();
    const onUpdateChecklistMock = jest.fn();

    let renderer: any;
    act(() => {
      renderer = create(
        <ChecklistProgressCard
          checklist={baseChecklist}
          colors={Colors.dark}
          colorScheme="dark"
          isExpanded={false}
          onToggleExpand={onToggleExpandMock}
          onToggleChecklist={onToggleChecklistMock}
          onUpdateChecklist={onUpdateChecklistMock}
        />
      );
    });

    const root = renderer.root;

    // 1. Priority strip is passed to EntityItem and present
    const priorityStrip = root.findByProps({ testID: "checklist-category-priority-edge-strip" });
    expect(priorityStrip).toBeDefined();

    // 2. Neutral surface without category background wash/watermark
    expect(root.findAllByProps({ testID: "checklist-category-ambient-wash" })).toHaveLength(0);
    expect(root.findAllByProps({ testID: "checklist-category-ambient-icon" })).toHaveLength(0);

    // 3. Metadata shows counts
    const textNodes = root.findAllByType(RNText).map((t: any) =>
      Array.isArray(t.props.children) ? t.props.children.join("") : t.props.children
    );
    expect(textNodes).toContain("1 of 3 completed");
    expect(textNodes).toContain("2 left");

    // 4. Preview item container shows the first incomplete item ("Bread")
    const previewContainer = root.findByProps({ testID: "checklist-collapsed-preview-chk-card-1" });
    expect(previewContainer).toBeDefined();

    const previewTexts = previewContainer.findAllByType(RNText).map((t: any) =>
      Array.isArray(t.props.children) ? t.props.children.join("") : t.props.children
    );
    expect(previewTexts).toContain("Bread");

    // 5. Preview checkbox is actionable and updates checklist
    const previewCheckbox = root.findByProps({ testID: "checklist-preview-checkbox-i2" });
    expect(previewCheckbox).toBeDefined();
    act(() => {
      previewCheckbox.props.onPress();
    });
    expect(onUpdateChecklistMock).toHaveBeenCalled();
    const updatedPayload = onUpdateChecklistMock.mock.calls[0][0];
    const breadItem = updatedPayload.items.find((i: any) => i.id === "i2");
    expect(breadItem.completed).toBe(true);

    // 6. Tapping preview text triggers onToggleExpand
    const previewTextPressable = root.findByProps({ testID: "checklist-preview-title-i2" });
    expect(previewTextPressable).toBeDefined();
    act(() => {
      previewTextPressable.props.onPress();
    });
    expect(onToggleExpandMock).toHaveBeenCalled();
  });

  it("reads recurring checklist progress and item state from today's occurrence", () => {
    const todayKey = getTodayDateKey();
    const recurringChecklist: Checklist = {
      ...baseChecklist,
      recurrence: { frequency: "daily", interval: 1 },
      schedule: { date: todayKey, startTime: "09:00" },
      // Master items are all uncompleted; only the occurrence record is done.
      items: baseChecklist.items.map((item) => ({ ...item, completed: false })),
      occurrenceHistory: {
        [todayKey]: { completedItemIds: ["i1"] },
      },
    };

    const onToggleChecklistItemMock = jest.fn();
    let renderer: any;
    act(() => {
      renderer = create(
        <ChecklistProgressCard
          checklist={recurringChecklist}
          colors={Colors.dark}
          colorScheme="dark"
          isExpanded={false}
          onToggleExpand={jest.fn()}
          onToggleChecklist={jest.fn()}
          onToggleChecklistItem={onToggleChecklistItemMock}
          onUpdateChecklist={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const textNodes = root.findAllByType(RNText).map((t: any) =>
      Array.isArray(t.props.children) ? t.props.children.join("") : t.props.children
    );
    expect(textNodes).toContain("1 of 3 completed");
    expect(textNodes).toContain("2 left");

    // Preview advances past the occurrence-completed item.
    const previewCheckbox = root.findByProps({ testID: "checklist-preview-checkbox-i2" });
    act(() => {
      previewCheckbox.props.onPress();
    });
    // Per-item completion goes through the canonical command path, never a
    // whole-entity `items` write.
    expect(onToggleChecklistItemMock).toHaveBeenCalledWith(recurringChecklist, "i2");
  });

  it("routes recurring bulk completion through the canonical bulk handler", () => {
    const onToggleAllChecklistItemsMock = jest.fn();
    const onUpdateChecklistMock = jest.fn();
    let renderer: any;
    act(() => {
      renderer = create(
        <ChecklistProgressCard
          checklist={baseChecklist}
          colors={Colors.dark}
          colorScheme="dark"
          isExpanded={false}
          onToggleExpand={jest.fn()}
          onToggleChecklist={jest.fn()}
          onToggleAllChecklistItems={onToggleAllChecklistItemsMock}
          onUpdateChecklist={onUpdateChecklistMock}
        />
      );
    });

    const leadingCheckbox = renderer.root.findByProps({
      accessibilityLabel:
        "Mark all items in checklist Grocery Shopping as completed",
    });
    act(() => {
      leadingCheckbox.props.onPress();
    });

    expect(onToggleAllChecklistItemsMock).toHaveBeenCalledWith(baseChecklist);
    expect(onUpdateChecklistMock).not.toHaveBeenCalled();
  });

  it("renders expanded recurring items from the occurrence record", () => {
    const todayKey = getTodayDateKey();
    const recurringChecklist: Checklist = {
      ...baseChecklist,
      recurrence: { frequency: "daily", interval: 1 },
      schedule: { date: todayKey, startTime: "09:00" },
      items: baseChecklist.items.map((item) => ({ ...item, completed: false })),
      occurrenceHistory: {
        [todayKey]: { completedItemIds: ["i2"] },
      },
    };

    let renderer: any;
    act(() => {
      renderer = create(
        <ChecklistProgressCard
          checklist={recurringChecklist}
          colors={Colors.dark}
          colorScheme="dark"
          isExpanded={true}
          onToggleExpand={jest.fn()}
          onToggleChecklist={jest.fn()}
          onUpdateChecklist={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const rowFor = (id: string) =>
      root
        .findByProps({ testID: `checklist-item-${id}` })
        .findAll((node: any) => node.props?.accessibilityRole === "checkbox")[0];

    expect(rowFor("i2").props.accessibilityState).toEqual({ checked: true });
    expect(rowFor("i1").props.accessibilityState).toEqual({ checked: false });
  });

  it("does not render preview item when checklist is fully complete", () => {
    const completedChecklist: Checklist = {
      ...baseChecklist,
      items: [
        { id: "i1", title: "Apples", completed: true },
        { id: "i2", title: "Bread", completed: true },
      ],
    };

    let renderer: any;
    act(() => {
      renderer = create(
        <ChecklistProgressCard
          checklist={completedChecklist}
          colors={Colors.dark}
          colorScheme="dark"
          isExpanded={false}
          onToggleExpand={jest.fn()}
          onToggleChecklist={jest.fn()}
          onUpdateChecklist={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    expect(root.findAllByProps({ testID: "checklist-collapsed-preview-chk-card-1" })).toHaveLength(0);

    const textNodes = root.findAllByType(RNText).map((t: any) =>
      Array.isArray(t.props.children) ? t.props.children.join("") : t.props.children
    );
    expect(textNodes).toContain("Completed");
  });

  it("renders all items in expanded view and eliminates inline 'Add item' input and expanded resource deck", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <ChecklistProgressCard
          checklist={baseChecklist}
          colors={Colors.dark}
          colorScheme="dark"
          isExpanded={true}
          onToggleExpand={jest.fn()}
          onToggleChecklist={jest.fn()}
          onUpdateChecklist={jest.fn()}
          allResources={[{ id: "res-1", title: "Recipe", type: "note" }]}
        />
      );
    });

    const root = renderer.root;

    // 1. All 3 items are rendered
    expect(root.findByProps({ testID: "checklist-item-i1" })).toBeDefined();
    expect(root.findByProps({ testID: "checklist-item-i2" })).toBeDefined();
    expect(root.findByProps({ testID: "checklist-item-i3" })).toBeDefined();

    // 2. NO inline Add Item input
    expect(root.findAllByProps({ placeholder: "Add item..." })).toHaveLength(0);
    expect(root.findAllByProps({ testID: "checklist-add-item-input" })).toHaveLength(0);

    // 3. NO expanded resource list or resource rows inside expanded card
    expect(root.findAllByProps({ testID: "checklist-expanded-resources" })).toHaveLength(0);
    expect(root.findAllByProps({ testID: "checklist-resource-row" })).toHaveLength(0);
  });

  it("renders scheduled date and time metadata for a scheduled checklist", () => {
    const scheduledChecklist: Checklist = {
      ...baseChecklist,
      id: "chk-scheduled-1",
      schedule: {
        date: "2026-10-30",
        startTime: "14:00",
        endTime: "15:00",
        durationMinutes: 60,
      },
    };

    let renderer: any;
    act(() => {
      renderer = create(
        <ChecklistProgressCard
          checklist={scheduledChecklist}
          colors={Colors.dark}
          colorScheme="dark"
          isExpanded={false}
          onToggleExpand={jest.fn()}
          onToggleChecklist={jest.fn()}
          onUpdateChecklist={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const textNodes = root.findAllByType(RNText).map((t: any) =>
      Array.isArray(t.props.children) ? t.props.children.join("") : t.props.children
    );

    // Verify scheduled time and date are rendered in metadata parts
    expect(textNodes.some((t: string) => typeof t === "string" && (t.includes("2:00") || t.includes("PM")))).toBe(true);
    // Calendar icon is present
    const featherIcons = root.findAllByType("FeatherIcon" as any);
    expect(featherIcons.some((icon: any) => icon.props.name === "calendar")).toBe(true);
  });

  it("renders repeat icon and recurrence label for a recurring checklist", () => {
    const recurringChecklist: Checklist = {
      ...baseChecklist,
      id: "chk-recurring-1",
      recurrence: {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [5], // Friday
      },
    };

    let renderer: any;
    act(() => {
      renderer = create(
        <ChecklistProgressCard
          checklist={recurringChecklist}
          colors={Colors.dark}
          colorScheme="dark"
          isExpanded={false}
          onToggleExpand={jest.fn()}
          onToggleChecklist={jest.fn()}
          onUpdateChecklist={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const textNodes = root.findAllByType(RNText).map((t: any) =>
      Array.isArray(t.props.children) ? t.props.children.join("") : t.props.children
    );

    expect(
      textNodes.some(
        (t: string) =>
          typeof t === "string" && (t.includes("Friday") || t.includes("Weekly")),
      ),
    ).toBe(true);
    const featherIcons = root.findAllByType("FeatherIcon" as any);
    expect(featherIcons.some((icon: any) => icon.props.name === "repeat")).toBe(true);
  });

  it("renders reminder bell icon when reminder is active", () => {
    const checklistWithReminder: Checklist = {
      ...baseChecklist,
      id: "chk-rem-1",
      reminder: {
        enabled: true,
        triggerAt: new Date(2026, 9, 25, 9, 30).getTime(),
      },
    };

    let renderer: any;
    act(() => {
      renderer = create(
        <ChecklistProgressCard
          checklist={checklistWithReminder}
          colors={Colors.dark}
          colorScheme="dark"
          isExpanded={false}
          onToggleExpand={jest.fn()}
          onToggleChecklist={jest.fn()}
          onUpdateChecklist={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const featherIcons = root.findAllByType("FeatherIcon" as any);
    expect(featherIcons.some((icon: any) => icon.props.name === "bell")).toBe(true);
  });

  it("renders overdue indicator for incomplete past-scheduled checklist", () => {
    const overdueChecklist: Checklist = {
      ...baseChecklist,
      id: "chk-overdue-1",
      schedule: {
        date: "2020-01-01",
      },
    };

    let renderer: any;
    act(() => {
      renderer = create(
        <ChecklistProgressCard
          checklist={overdueChecklist}
          colors={Colors.dark}
          colorScheme="dark"
          isExpanded={false}
          onToggleExpand={jest.fn()}
          onToggleChecklist={jest.fn()}
          onUpdateChecklist={jest.fn()}
        />
      );
    });

    const root = renderer.root;
    const textNodes = root.findAllByType(RNText).map((t: any) =>
      Array.isArray(t.props.children) ? t.props.children.join("") : t.props.children
    );
    expect(textNodes).toContain("Overdue");
  });
});

