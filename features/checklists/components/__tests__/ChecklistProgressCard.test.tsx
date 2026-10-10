import React from "react";
import { act, create } from "react-test-renderer";
import { ChecklistProgressCard } from "../ChecklistProgressCard";
import { Colors } from "@/shared/constants/theme";
import { Checklist } from "@/shared/types/domain.types";
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
});
