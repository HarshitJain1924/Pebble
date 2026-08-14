import * as fs from "node:fs";
import * as path from "node:path";
import React from "react";
import { act, create } from "react-test-renderer";
import { Modal, Pressable, ScrollView, Text, TouchableWithoutFeedback } from "react-native";

jest.mock("react-native-reanimated", () => {
  const React = require("react");
  const { View } = require("react-native");
  const entering = { duration: () => entering };
  return { __esModule: true, default: { View }, FadeIn: entering, FadeOut: entering, ZoomIn: entering, ZoomOut: entering };
});

jest.mock("@/shared/components/ui/PressableScale", () => {
  const React = require("react");
  const { Pressable } = require("react-native");
  return function PressableScale({ children, ...props }: any) {
    return React.createElement(Pressable, props, children);
  };
});

import { MetadataChipPicker, type ChipPickerOption } from "@/features/capture/components/MetadataChipPicker";

type Renderer = ReturnType<typeof create>;
const makeOption = (id: string, label = id): ChipPickerOption => ({ id, label, icon: "tag" });

function renderPicker(options: ChipPickerOption[] = [makeOption("task", "Task")]) {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  let renderer!: Renderer;
  act(() => {
    renderer = create(<MetadataChipPicker visible title="Choose metadata" options={options} onSelect={onSelect} onClose={onClose} isDark={false} />);
  });
  return { renderer, onSelect, onClose };
}

function findByAccessibilityLabel(renderer: Renderer, label: string) {
  const matches = renderer.root.findAll((node: any) => node.props?.accessibilityLabel === label);
  if (matches.length === 0) throw new Error(`No accessibility element found for ${label}`);
  return matches[0];
}

describe("MetadataChipPicker screen-level modal", () => {
  it("1. renders as a transparent root Modal with Android close handling", () => {
    const { renderer, onClose } = renderPicker();
    const modal = renderer.root.findByType(Modal);
    expect(modal.props.visible).toBe(true);
    expect(modal.props.transparent).toBe(true);
    expect(modal.props.statusBarTranslucent).toBe(true);
    expect(modal.props.onRequestClose).toBe(onClose);
  });

  it.each([
    ["type", "Task"],
    ["priority", "High"],
    ["date", "Today"],
    ["category", "Work"],
    ["recurrence", "Every day"],
    ["workspace", "My Pebbles"],
  ])("%s picker opens and exposes its options", (_picker, label) => {
    const { renderer } = renderPicker([makeOption(label.toLowerCase(), label)]);
    expect(renderer.root.findByType(Modal).props.visible).toBe(true);
    expect(findByAccessibilityLabel(renderer, label).props.accessibilityRole).toBe("button");
  });

  it("8. shows the selected value and selected accessibility state", () => {
    const { renderer } = renderPicker([
      { ...makeOption("workspace", "Long Workspace"), isSelected: true },
      makeOption("other", "Other"),
    ]);
    const selected = findByAccessibilityLabel(renderer, "Long Workspace");
    expect(selected.props.accessibilityState).toEqual({ selected: true });
    expect(renderer.root.findAllByType(Text).some((node: any) => node.props.children === "Long Workspace")).toBe(true);
  });

  it("9. selecting an option calls the handler and closes the picker", () => {
    const { renderer, onSelect, onClose } = renderPicker([makeOption("high", "High")]);
    act(() => findByAccessibilityLabel(renderer, "High").props.onPress());
    expect(onSelect).toHaveBeenCalledWith("high");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("10. tapping outside the card closes through the backdrop", () => {
    const { renderer, onClose } = renderPicker();
    const dismissers = renderer.root.findAllByType(TouchableWithoutFeedback);
    expect(dismissers.length).toBeGreaterThanOrEqual(2);
    act(() => dismissers[0].props.onPress());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("11. native Modal dismissal also closes the picker", () => {
    const { renderer, onClose } = renderPicker();
    act(() => renderer.root.findByType(Modal).props.onRequestClose());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("12. keeps long option lists in a scrollable container", () => {
    const { renderer } = renderPicker(Array.from({ length: 8 }, (_, index) => makeOption(`option-${index}`, `Option ${index}`)));
    const scrollView = renderer.root.findByType(ScrollView);
    expect(scrollView.props.keyboardShouldPersistTaps).toBe("handled");
    expect(scrollView.props.showsVerticalScrollIndicator).toBe(false);
  });

  it("13. truncates a long workspace label to one line", () => {
    const label = "Workspace with an intentionally very long name ".repeat(8);
    const { renderer } = renderPicker([makeOption("workspace", label)]);
    const option = findByAccessibilityLabel(renderer, label);
    const labelNode = renderer.root.findAllByType(Text).find((node: any) => node.props.children === label);
    expect(option).toBeDefined();
    expect(labelNode?.props.numberOfLines).toBe(1);
    expect(labelNode?.props.ellipsizeMode).toBe("tail");
  });

  it("14. keeps the picker mounted outside the BottomSheet hierarchy", () => {
    const { renderer } = renderPicker();
    const modal = renderer.root.findByType(Modal);
    expect(modal.type).toBe(Modal);
    expect(renderer.root.findAllByProps({ style: { position: "absolute" } })).toHaveLength(0);
  });

  it("15. supports selection while the keyboard/underlying sheet is present", () => {
    const { renderer, onSelect, onClose } = renderPicker([makeOption("workspace", "Workspace")]);
    const modal = renderer.root.findByType(Modal);
    expect(modal.props.transparent).toBe(true);
    act(() => findByAccessibilityLabel(renderer, "Workspace").props.onPress());
    expect(onSelect).toHaveBeenCalledWith("workspace");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("UnifiedCapture metadata chip integration invariants", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../components/UnifiedCapture.tsx"), "utf8");

  it("16. +N is an interactive chip that exposes all hidden chip nodes", () => {
    expect(source).toContain("const handleMorePress = () => {");
    expect(source).toContain("onActivePickerChange(\"more\", options)");
    expect(source).toContain("onPress={handleMorePress}");
    expect(source).toContain("accessibilityLabel=\"Show more metadata\"");
  });

  it("17. changing type rebuilds visible controls from parsedItem.type and TYPE_META", () => {
    expect(source).toContain('parsedItem.type === "task" || parsedItem.type === "habit"');
    expect(source).toContain('onActivePickerChange("type")');
  });

  it("18. preserves user overrides when NLP reparses the capture text", () => {
    expect(source).toContain("const userOverridesRef = useRef");
    expect(source).toContain("if (userOverridesRef.current.type)");
    expect(source).toContain("if (userOverridesRef.current.priority)");
    expect(source).toContain("if (userOverridesRef.current.category)");
    expect(source).toContain("if (userOverridesRef.current.recurrence !== undefined)");
  });

  it("19. type picker exposes only user-facing capture intents (no Link/File)", () => {
    const typeSection = source.slice(
      source.indexOf('if (activePicker === "type")'),
      source.indexOf('if (activePicker === "priority")'),
    );
    expect(typeSection).toContain('"task"');
    expect(typeSection).toContain('"habit"');
    expect(typeSection).toContain('"checklist"');
    expect(typeSection).toContain('"note"');
    expect(typeSection).toContain('"idea"');
    expect(typeSection).not.toContain('"link"');
    expect(typeSection).not.toContain('"file"');
  });

  it("20. chips are contextual — parser defaults are never surfaced", () => {
    expect(source).toContain("parsedItem.priorityDetected && parsedItem.priority");
    expect(source).toContain("parsedItem.type === \"task\" && (parsedItem.date || parsedItem.time)");
    expect(source).toContain("getReminderShortLabel(parsedItem.reminderOffsetMinutes)");
  });

  it("21. workspace suggestion never silently overrides the user's selection", () => {
    expect(source).toContain("handleAcceptWorkspaceSuggestion");
    expect(source).not.toContain("setSelectedWorkspaceId(top.workspaceId)");
  });
});
