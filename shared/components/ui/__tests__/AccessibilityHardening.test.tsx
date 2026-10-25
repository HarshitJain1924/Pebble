jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import React from "react";
import { act, create } from "react-test-renderer";
import { Text, View, Pressable } from "react-native";
import PressableScale from "../PressableScale";
import { AnimatedCheckbox } from "../AnimatedCheckbox";
import { SegmentedSwitcher } from "../SegmentedSwitcher";
import { AppCard } from "../AppCard";
import { AppHeader } from "../AppHeader";
import { VoiceCaptureButton } from "@/features/capture/components/VoiceCaptureButton";
import { ZenModeModal } from "@/features/today/components/ZenModeModal";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock("expo-blur", () => ({
  BlurView: "BlurView",
}));

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
  NotificationFeedbackType: { Success: "success", Warning: "warning" },
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
}));

jest.mock("@expo/vector-icons", () => ({
  Feather: (props: any) => require("react").createElement("FeatherIcon", props),
  Ionicons: (props: any) => require("react").createElement("IoniconsIcon", props),
}));

describe("UI Accessibility Hardening Suite", () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });
  describe("PressableScale baseline semantics", () => {
    it("defaults accessibilityRole to button when onPress is provided", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <PressableScale onPress={() => {}}>
            <Text>Tap me</Text>
          </PressableScale>
        );
      });

      const pressable = renderer.root.findByProps({ accessibilityRole: "button" });
      expect(pressable).toBeDefined();
      expect(pressable.props.hitSlop).toBe(8);
    });

    it("respects custom accessibilityRole when explicitly provided", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <PressableScale onPress={() => {}} accessibilityRole="tab">
            <Text>Tab 1</Text>
          </PressableScale>
        );
      });

      const pressable = renderer.root.findByProps({ accessibilityRole: "tab" });
      expect(pressable).toBeDefined();
    });

    it("exposes disabled state in accessibilityState when disabled prop is true", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <PressableScale onPress={() => {}} disabled={true}>
            <Text>Disabled Action</Text>
          </PressableScale>
        );
      });

      const pressable = renderer.root.findByProps({ accessibilityRole: "button" });
      expect(pressable.props.accessibilityState).toEqual(
        expect.objectContaining({ disabled: true })
      );
    });

    it("preserves additional accessibilityState properties when merging disabled state", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <PressableScale
            onPress={() => {}}
            disabled={true}
            accessibilityState={{ selected: true }}
          >
            <Text>Selected & Disabled</Text>
          </PressableScale>
        );
      });

      const pressable = renderer.root.findByProps({ accessibilityRole: "button" });
      expect(pressable.props.accessibilityState).toEqual({
        disabled: true,
        selected: true,
      });
    });
  });

  describe("AnimatedCheckbox state, contextual labeling, and touch target", () => {
    it("exposes accessible=true, accessibilityRole=checkbox, and checked=false with action-oriented default label", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <AnimatedCheckbox
            checked={false}
            onToggle={() => {}}
          />
        );
      });

      const checkbox = renderer.root.findByProps({ accessibilityRole: "checkbox" });
      expect(checkbox.props.accessible).toBe(true);
      expect(checkbox.props.accessibilityRole).toBe("checkbox");
      expect(checkbox.props.accessibilityState).toEqual({
        checked: false,
        disabled: false,
      });
      // Verifies action-oriented fallback when unchecked
      expect(checkbox.props.accessibilityLabel).toBe("Mark as completed");

      // Verify touch target: 26 (default size) + 9 (top) + 9 (bottom) = 44pt
      const hs = checkbox.props.hitSlop;
      expect(26 + hs.top + hs.bottom).toBeGreaterThanOrEqual(44);
      expect(26 + hs.left + hs.right).toBeGreaterThanOrEqual(44);
    });

    it("exposes checked=true with action-oriented default label when unchecked", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <AnimatedCheckbox checked={true} onToggle={() => {}} />
        );
      });

      const checkbox = renderer.root.findByProps({ accessibilityRole: "checkbox" });
      expect(checkbox.props.accessibilityState).toEqual({
        checked: true,
        disabled: false,
      });
      // Verifies action-oriented fallback when checked
      expect(checkbox.props.accessibilityLabel).toBe("Mark as incomplete");
    });

    it("preserves caller-provided contextual label", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <AnimatedCheckbox
            checked={false}
            onToggle={() => {}}
            accessibilityLabel="Mark task as completed: Submit tax report"
          />
        );
      });

      const checkbox = renderer.root.findByProps({ accessibilityRole: "checkbox" });
      expect(checkbox.props.accessibilityLabel).toBe(
        "Mark task as completed: Submit tax report"
      );
    });

    it("exposes disabled=true when onToggle is missing", () => {
      let renderer: any;
      act(() => {
        renderer = create(<AnimatedCheckbox checked={false} />);
      });

      const checkbox = renderer.root.findByProps({ accessibilityRole: "checkbox" });
      expect(checkbox.props.accessibilityState).toEqual({
        checked: false,
        disabled: true,
      });
    });
  });

  describe("SegmentedSwitcher tablist and tab semantics", () => {
    it("renders container with tablist role and tabs with selected state", () => {
      const options = [
        { key: "opt1", label: "Option One" },
        { key: "opt2", label: "Option Two" },
      ];
      let renderer: any;
      act(() => {
        renderer = create(
          <SegmentedSwitcher
            options={options}
            activeKey="opt1"
            onChange={() => {}}
          />
        );
      });

      const container = renderer.root.findByProps({ accessibilityRole: "tablist" });
      expect(container).toBeDefined();

      const tabs = renderer.root.findAllByProps({ accessibilityRole: "tab" });
      // In React Native mock, Pressable may expose props on multiple levels (Pressable and View)
      // Verify at least one node exists for each option's label and state
      const opt1Tab = tabs.find((t: any) => t.props.accessibilityLabel === "Option One");
      const opt2Tab = tabs.find((t: any) => t.props.accessibilityLabel === "Option Two");

      expect(opt1Tab).toBeDefined();
      expect(opt1Tab.props.accessibilityState).toEqual({ selected: true });

      expect(opt2Tab).toBeDefined();
      expect(opt2Tab.props.accessibilityState).toEqual({ selected: false });
    });
  });

  describe("AppCard interactive semantics", () => {
    it("defaults accessibilityRole to button when onPress is passed", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <AppCard onPress={() => {}} accessibilityLabel="Task card: Finish report">
            <Text>Card Content</Text>
          </AppCard>
        );
      });

      const card = renderer.root.findByProps({ accessibilityRole: "button" });
      expect(card).toBeDefined();
      expect(card.props.accessibilityLabel).toBe("Task card: Finish report");
    });
  });

  describe("VoiceCaptureButton icon-only states and labels", () => {
    it("exposes start voice recording label when idle", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <VoiceCaptureButton
            status="idle"
            volume={0}
            onStart={() => {}}
            onStop={() => {}}
            onCancel={() => {}}
            themePrimary="#8B5CF6"
          />
        );
      });

      const button = renderer.root.findByProps({
        accessibilityRole: "button",
        accessibilityLabel: "Start voice recording",
      });
      expect(button).toBeDefined();
      expect(button.props.accessibilityState).toEqual({ busy: false });
    });

    it("exposes stop voice recording label when listening", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <VoiceCaptureButton
            status="listening"
            volume={0.5}
            onStart={() => {}}
            onStop={() => {}}
            onCancel={() => {}}
            themePrimary="#8B5CF6"
          />
        );
      });

      const button = renderer.root.findByProps({
        accessibilityRole: "button",
        accessibilityLabel: "Stop voice recording",
      });
      expect(button).toBeDefined();
    });

    it("exposes processing voice recording label and busy state when processing", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <VoiceCaptureButton
            status="processing"
            volume={0}
            onStart={() => {}}
            onStop={() => {}}
            onCancel={() => {}}
            themePrimary="#8B5CF6"
          />
        );
      });

      const button = renderer.root.findByProps({
        accessibilityRole: "button",
        accessibilityLabel: "Processing voice recording",
      });
      expect(button).toBeDefined();
      expect(button.props.accessibilityState).toEqual({ busy: true });
    });
  });

  describe("ZenModeModal contextual AnimatedCheckbox labeling", () => {
    it("renders task completion checkbox with contextual label including task title", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <ZenModeModal
            visible={true}
            onClose={() => {}}
            colorScheme="dark"
            colors={{
              card: "#18181B",
              border: "#27272A",
              text: "#FFFFFF",
              textMuted: "#A1A1AA",
              primary: "#8B5CF6",
            }}
            breathStyle={{}}
            activeZenTask={{
              id: "task-123",
              title: "Review quarterly goals",
              status: "todo",
            } as any}
            activeZenHabit={null}
            getFolderById={() => null}
            onCompleteTask={jest.fn(async () => {})}
            onCompleteHabit={jest.fn(async () => {})}
          />
        );
      });

      const checkbox = renderer.root.findByProps({
        accessibilityRole: "checkbox",
        accessibilityLabel: "Mark task as completed: Review quarterly goals",
      });
      expect(checkbox).toBeDefined();
      expect(checkbox.props.accessibilityState).toEqual({
        checked: false,
        disabled: false,
      });
    });

    it("renders habit completion checkbox with contextual label including habit title", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <ZenModeModal
            visible={true}
            onClose={() => {}}
            colorScheme="dark"
            colors={{
              card: "#18181B",
              border: "#27272A",
              text: "#FFFFFF",
              textMuted: "#A1A1AA",
              primary: "#8B5CF6",
            }}
            breathStyle={{}}
            activeZenTask={null}
            activeZenHabit={{
              id: "habit-456",
              title: "Drink 2L water",
              recurrence: "daily",
              completionHistory: [],
            } as any}
            getFolderById={() => null}
            onCompleteTask={jest.fn(async () => {})}
            onCompleteHabit={jest.fn(async () => {})}
          />
        );
      });

      const checkbox = renderer.root.findByProps({
        accessibilityRole: "checkbox",
        accessibilityLabel: "Mark habit as completed: Drink 2L water",
      });
      expect(checkbox).toBeDefined();
      expect(checkbox.props.accessibilityState).toEqual({
        checked: false,
        disabled: false,
      });
    });
  });

  describe("Touch-target contracts for high-risk small controls", () => {
    it("AppHeader search clear button has hitSlop achieving at least 44pt touch area", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <AppHeader
            title="Today"
            showSearch={true}
            searchQuery="test"
            onSearchQueryChange={() => {}}
          />
        );
      });

      // Tap search button to enter search mode
      const searchBtn = renderer.root.findByProps({ accessibilityLabel: "Search" });
      act(() => {
        searchBtn.props.onPress();
      });

      const clearBtn = renderer.root.findByProps({ accessibilityLabel: "Clear search" });
      expect(clearBtn).toBeDefined();
      // Icon is size 16, padding is 4 (visual size: 24). hitSlop top/bottom 12: 24 + 12 + 12 = 48 >= 44
      const hs = clearBtn.props.hitSlop;
      expect(24 + hs.top + hs.bottom).toBeGreaterThanOrEqual(44);
      expect(24 + hs.left + hs.right).toBeGreaterThanOrEqual(44);
    });

    it("PressableScale permits caller override of hitSlop for touch target compliance", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <PressableScale
            onPress={() => {}}
            hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
          >
            <Text>Small Action</Text>
          </PressableScale>
        );
      });

      const pressable = renderer.root.findByProps({ accessibilityRole: "button" });
      expect(pressable.props.hitSlop).toEqual({
        top: 12,
        bottom: 12,
        left: 10,
        right: 10,
      });
    });
  });
});
