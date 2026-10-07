import React from "react";
import { act, create } from "react-test-renderer";
import {
  EntityItem,
  EntityMetaRow,
  EntityResourceIndicator,
} from "../EntityItem";
import { HabitStreakCard } from "@/features/habits/components/HabitStreakCard";
import { ChecklistProgressCard } from "@/features/checklists/components/ChecklistProgressCard";
import { Colors, Palette } from "@/shared/constants/theme";
import { TaskCategoryColors } from "@/shared/constants/categoryColors";
import { Text as RNText, View as RNView } from "react-native";
import { Stop } from "react-native-svg";

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-image", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    Image: (props: any) => React.createElement(View, { testID: "expo-image", ...props }),
  };
});

jest.mock("@/shared/hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
  default: () => false,
}));

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

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 0, Medium: 1, Heavy: 2 },
  NotificationFeedbackType: { Success: 0, Warning: 1, Error: 2 },
}));

describe("EntityItem Unified Architecture", () => {
  describe("EntityItem visual primitive", () => {
    it("renders title, metadata, leadingControl, and resources slots cleanly", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <EntityItem
            title="Shared Item Title"
            leadingControl={<RNView testID="mock-leading" />}
            metadata={
              <EntityMetaRow
                parts={[
                  { key: "due", text: "Today" },
                  { key: "time", text: "6:00 PM" },
                  { key: "resources", text: "2", icon: "paperclip", testID: "mock-resources", onPress: jest.fn() },
                ]}
              />
            }
            trailingActions={<RNView testID="mock-actions" />}
          />
        );
      });

      const root = renderer.root;
      expect(root.findByProps({ testID: "mock-leading" })).toBeDefined();
      expect(root.findByProps({ testID: "mock-resources" })).toBeDefined();
      expect(root.findByProps({ testID: "mock-actions" })).toBeDefined();

      const textNodes = root.findAllByType(RNText).map((t: any) => t.props.children);
      expect(textNodes).toContain("Shared Item Title");
      expect(textNodes).toContain("Today");
      expect(textNodes).toContain("6:00 PM");
      expect(textNodes).toContain("2");
    });

    it("renders category ambient wash and watermark icon when category is provided", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <EntityItem
            title="Work item"
            category="work"
            colorScheme="dark"
            testIDPrefix="custom-category"
          />
        );
      });

      const root = renderer.root;
      const wash = root.findByProps({ testID: "custom-category-ambient-wash" });
      expect(wash).toBeDefined();

      const icon = root.findByProps({ testID: "custom-category-ambient-icon" });
      expect(icon).toBeDefined();

      const stops = wash.findAllByType(Stop);
      expect(stops[0].props.stopColor).toBe(TaskCategoryColors.work.color.dark);
    });

    it("does not render ambient wash or watermark icon when category is null", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <EntityItem
            title="Neutral item"
            category={null}
            colorScheme="dark"
            testIDPrefix="custom-category"
          />
        );
      });

      const root = renderer.root;
      expect(root.findAllByProps({ testID: "custom-category-ambient-wash" })).toHaveLength(0);
      expect(root.findAllByProps({ testID: "custom-category-ambient-icon" })).toHaveLength(0);
    });

    it("renders priority edge strip when priority is specified", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <EntityItem
            title="High Priority Task"
            priority="high"
            colorScheme="dark"
          />
        );
      });

      const root = renderer.root;
      const edgeStrip = root.findByProps({ testID: "task-category-priority-edge-strip" });
      expect(edgeStrip).toBeDefined();
    });

    it("applies 0.6 dimmed opacity when completed/dimmed", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <EntityItem
            title="Done item"
            dimmed={true}
          />
        );
      });

      const root = renderer.root;
      const container = root.findByProps({ testID: "entity-item-container" });
      const flat = Array.isArray(container.props.style)
        ? Object.assign({}, ...container.props.style)
        : container.props.style;
      expect(flat.opacity).toBe(0.6);
    });
  });

  describe("HabitStreakCard using EntityItem", () => {
    it("renders the streak as a trailing badge, keeps it out of metadata, and resolves keyword ambient category for Gym", () => {
      const mockHabit = {
        id: "h-gym",
        title: "Gym Workout",
        recurrence: { frequency: "daily" },
        reminder: { triggerAt: new Date(2026, 9, 5, 7, 0).getTime() },
        resourceIds: ["res-1"],
      };

      let renderer: any;
      act(() => {
        renderer = create(
          <HabitStreakCard
            title={mockHabit.title}
            streak={12}
            bestStreak={15}
            completedToday={false}
            onPressToggle={jest.fn()}
            habit={mockHabit}
            linkedCount={1}
            linkedResources={[{ id: "res-1", title: "Routine" }]}
          />
        );
      });

      const root = renderer.root;

      // 1. Gym matches fitness keyword -> emerald category wash
      const ambientWash = root.findByProps({ testID: "habit-category-ambient-wash" });
      expect(ambientWash).toBeDefined();
      const stops = ambientWash.findAllByType(Stop);
      expect(stops[0].props.stopColor).toBe(Palette.emerald500);

      const textNodes = root.findAllByType(RNText).map((t: any) =>
        Array.isArray(t.props.children) ? t.props.children.join("") : t.props.children
      );
      expect(textNodes).toContain("Gym Workout");

      // 2. Streak has moved out of the metadata row entirely
      expect(textNodes).not.toContain("🔥 12");
      expect(textNodes.filter((t: any) => t === "Daily")).toHaveLength(1);

      // 3. Streak is now a trailing badge with a meaningful a11y label
      const streakBadge = root.findByProps({ testID: "habit-streak-badge" });
      expect(streakBadge).toBeDefined();
      expect(streakBadge.props.accessibilityLabel).toBe("12 day streak");
      const streakTexts = streakBadge
        .findAllByType(RNText)
        .map((t: any) => t.props.children);
      expect(streakTexts).toContain(12);
      expect(streakTexts).toContain("days");

      // 4. Resource indicator still shows count of 1 in the metadata row
      const resIndicator = root.findByProps({ testID: "habit-resource-indicator" });
      expect(resIndicator).toBeDefined();
      const resTexts = resIndicator.findAllByType(RNText).map((t: any) => t.props.children);
      expect(resTexts).toContain("1");

      // 5. Overflow button is still present and independent of the streak badge
      const overflowBtn = root.findByProps({ testID: "habit-overflow-button" });
      expect(overflowBtn).toBeDefined();
    });

    it("keeps the streak value visible when the habit is completed", () => {
      const mockHabit = {
        id: "h-done",
        title: "Meditate",
        recurrence: { frequency: "daily" },
        resourceIds: [],
      };

      let renderer: any;
      act(() => {
        renderer = create(
          <HabitStreakCard
            title={mockHabit.title}
            streak={0}
            completedToday={true}
            onPressToggle={jest.fn()}
            habit={mockHabit}
          />
        );
      });

      const root = renderer.root;
      const streakBadge = root.findByProps({ testID: "habit-streak-badge" });
      expect(streakBadge.props.accessibilityLabel).toBe("0 day streak");

      const streakTexts = streakBadge
        .findAllByType(RNText)
        .map((t: any) => t.props.children);
      expect(streakTexts).toContain(0);
      expect(streakTexts).toContain("days");

      // Stage 0 is inactive, so no flame artwork is registered or rendered.
      expect(streakBadge.findAllByProps({ testID: "habit-streak-flame" })).toHaveLength(0);

      // No extra opacity beyond the row-level dim applied by EntityItem itself.
      const badgeStyle = Object.assign({}, ...(Array.isArray(streakBadge.props.style)
        ? streakBadge.props.style
        : [streakBadge.props.style]));
      expect(badgeStyle.opacity).toBeUndefined();

      // Completing a habit must not hide the overflow menu.
      expect(root.findByProps({ testID: "habit-overflow-button" })).toBeDefined();
    });

    it("hides the overflow button in selection mode while keeping the streak badge", () => {
      const mockHabit = {
        id: "h-sel",
        title: "Read",
        recurrence: { frequency: "daily" },
        resourceIds: [],
      };

      let renderer: any;
      act(() => {
        renderer = create(
          <HabitStreakCard
            title={mockHabit.title}
            streak={1}
            completedToday={false}
            isSelectionMode={true}
            onPressToggle={jest.fn()}
            habit={mockHabit}
          />
        );
      });

      const root = renderer.root;
      expect(root.findAllByProps({ testID: "habit-overflow-button" })).toHaveLength(0);
      const streakBadge = root.findByProps({ testID: "habit-streak-badge" });
      expect(streakBadge.props.accessibilityLabel).toBe("1 day streak");
      const streakTexts = streakBadge
        .findAllByType(RNText)
        .map((t: any) => t.props.children);
      expect(streakTexts).toContain("day");
    });

    it("renders habit priority edge strip when priority is high", () => {
      const mockHabit = {
        id: "h-prio",
        title: "High Priority Habit",
        priority: "high" as const,
        recurrence: { frequency: "daily" },
        resourceIds: [],
      };

      let renderer: any;
      act(() => {
        renderer = create(
          <HabitStreakCard
            title={mockHabit.title}
            streak={5}
            bestStreak={10}
            completedToday={false}
            onPressToggle={jest.fn()}
            habit={mockHabit}
          />
        );
      });

      const root = renderer.root;
      const prioStrip = root.findByProps({ testID: "habit-category-priority-edge-strip" });
      expect(prioStrip).toBeDefined();
    });

    it("tapping compact resource metadata opens Quick Edit and does not expand resources inline", () => {
      const mockHabit = {
        id: "h-resources",
        title: "Study React",
        recurrence: { frequency: "daily" },
        resourceIds: ["res-1", "res-2"],
      };

      let renderer: any;
      act(() => {
        renderer = create(
          <HabitStreakCard
            title={mockHabit.title}
            streak={7}
            completedToday={false}
            onPressToggle={jest.fn()}
            habit={mockHabit}
            linkedCount={2}
            linkedResources={[
              { id: "res-1", title: "React Docs", type: "link" },
              { id: "res-2", title: "Notes", type: "note" },
            ]}
          />
        );
      });

      const root = renderer.root;
      const resIndicator = root.findByProps({ testID: "habit-resource-indicator" });
      expect(resIndicator).toBeDefined();

      // Does not render inline resource rows in the card body
      const textNodes = root.findAllByType(RNText).map((t: any) =>
        Array.isArray(t.props.children) ? t.props.children.join("") : t.props.children
      );
      expect(textNodes).not.toContain("React Docs");
      expect(textNodes).not.toContain("Notes");

      // Quick Edit sheet is initially unmounted
      expect(root.findAllByProps({ testID: "habit-quick-edit-sheet" })).toHaveLength(0);

      // Tapping the compact resource indicator opens Quick Edit
      act(() => {
        resIndicator.props.onPress();
      });

      expect(root.findByProps({ testID: "habit-quick-edit-sheet" })).toBeDefined();
    });

    it("applies strengthened category gradient wash and non-colliding ambient watermark", () => {
      const mockHabit = {
        id: "h-gym",
        title: "Gym Workout",
        recurrence: { frequency: "daily" },
      };

      let renderer: any;
      act(() => {
        renderer = create(
          <HabitStreakCard
            title={mockHabit.title}
            streak={14}
            completedToday={false}
            onPressToggle={jest.fn()}
            habit={mockHabit}
          />
        );
      });

      const root = renderer.root;
      // Stronger wash stops (0.28 dark stopOpacity)
      const ambientWash = root.findByProps({ testID: "habit-category-ambient-wash" });
      const stops = ambientWash.findAllByType(Stop);
      expect(stops[0].props.stopOpacity).toBe(0.28);

      // Ambient icon wrapper has 0.19 opacity and right: 76 to keep clear of streak flame
      const ambientIcon = root.findByProps({ testID: "habit-category-ambient-icon" });
      const flattenedStyle = Object.assign(
        {},
        ...(Array.isArray(ambientIcon.props.style) ? ambientIcon.props.style : [ambientIcon.props.style])
      );
      expect(flattenedStyle.right).toBe(76);
      expect(flattenedStyle.opacity).toBe(0.19);
    });
  });

  describe("ChecklistProgressCard using EntityItem", () => {
    it("renders checklist with progress bar and resolves keyword ambient category for Shopping", () => {
      const mockChecklist = {
        id: "chk-shop",
        title: "Shopping List",
        items: [
          { id: "i1", title: "Apples", completed: true },
          { id: "i2", title: "Bread", completed: true },
          { id: "i3", title: "Milk", completed: true },
          { id: "i4", title: "Eggs", completed: false },
          { id: "i5", title: "Cheese", completed: false },
        ],
        resourceIds: ["res-1"],
        workspaceId: "ws-1",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      };

      let renderer: any;
      act(() => {
        renderer = create(
          <ChecklistProgressCard
            checklist={mockChecklist}
            colors={Colors.dark}
            colorScheme="dark"
            isExpanded={false}
            onToggleExpand={jest.fn()}
            onToggleChecklist={jest.fn()}
            onUpdateChecklist={jest.fn()}
            allResources={[{ id: "res-1", title: "Recipe", type: "note" }]}
          />
        );
      });

      const root = renderer.root;

      // 1. Shopping matches shopping keyword -> pink category wash
      const ambientWash = root.findByProps({ testID: "checklist-category-ambient-wash" });
      expect(ambientWash).toBeDefined();
      const stops = ambientWash.findAllByType(Stop);
      expect(stops[0].props.stopColor).toBe(Palette.pink500);

      // 2. Progress text metrics
      const textNodes = root.findAllByType(RNText).map((t: any) =>
        Array.isArray(t.props.children) ? t.props.children.join("") : t.props.children
      );
      expect(textNodes).toContain("Shopping List");
      expect(textNodes).toContain("3 of 5 completed");
      expect(textNodes).toContain("2 left");

      // 3. Resource indicator shows count of 1 in metadata row
      const resIndicator = root.findByProps({ testID: "checklist-resource-indicator" });
      expect(resIndicator).toBeDefined();
      const resTexts = resIndicator.findAllByType(RNText).map((t: any) => t.props.children);
      expect(resTexts).toContain("1");
    });
  });

  describe("EntityQuickEditSheet", () => {
    it("renders title, note, and allows selecting priority", () => {
      const { EntityQuickEditSheet } = require("../EntityQuickEditSheet");
      const onSelectPriorityMock = jest.fn();
      const onSaveTitleMock = jest.fn();

      let renderer: any;
      act(() => {
        renderer = create(
          <EntityQuickEditSheet
            visible={true}
            onClose={jest.fn()}
            title="Read 30 mins"
            onSaveTitle={onSaveTitleMock}
            description="Focus on chapter 4"
            priority="none"
            onSelectPriority={onSelectPriorityMock}
            scheduleLabel="Daily"
            scheduleIcon="repeat"
            hasSchedule={true}
            onPressSchedule={jest.fn()}
            testIDPrefix="habit"
          />
        );
      });

      const root = renderer.root;
      // Sheet exists
      expect(root.findByProps({ testID: "habit-quick-edit-sheet" })).toBeDefined();

      // Title input has correct value
      const titleInput = root.findByProps({ testID: "habit-title-input" });
      expect(titleInput.props.value).toBe("Read 30 mins");

      // Tap priority pill to open picker
      const prioPill = root.findByProps({ testID: "habit-priority-pill" });
      act(() => {
        prioPill.props.onPress();
      });

      // Priority picker is visible
      const prioPicker = root.findByProps({ testID: "habit-priority-picker" });
      expect(prioPicker).toBeDefined();

      // Select 'high'
      const highOption = root.findByProps({ testID: "habit-priority-option-high" });
      act(() => {
        highOption.props.onPress();
      });

      expect(onSelectPriorityMock).toHaveBeenCalledWith("high");
    });

    it("renders compact horizontal attachment strip near top when resources exist", () => {
      const { EntityQuickEditSheet } = require("../EntityQuickEditSheet");
      const onOpenResourceMock = jest.fn();
      const onAddResourceMock = jest.fn();

      let renderer: any;
      act(() => {
        renderer = create(
          <EntityQuickEditSheet
            visible={true}
            onClose={jest.fn()}
            title="Habit with resources"
            linkedResources={[
              { id: "res-1", title: "Workout PDF", type: "note" },
              { id: "res-2", title: "Timer Link", type: "link" },
            ]}
            totalResources={2}
            onOpenResource={onOpenResourceMock}
            onAddResource={onAddResourceMock}
            testIDPrefix="habit"
          />
        );
      });

      const root = renderer.root;
      // Attachment strip is rendered near top
      const strip = root.findByProps({ testID: "habit-attachment-strip" });
      expect(strip).toBeDefined();

      // Attachment chips for each resource
      const chip1 = root.findByProps({ testID: "habit-attachment-chip-res-1" });
      expect(chip1).toBeDefined();
      act(() => {
        chip1.props.onPress();
      });
      expect(onOpenResourceMock).toHaveBeenCalledWith(expect.objectContaining({ id: "res-1" }));

      // Add attachment button
      const addBtn = root.findByProps({ testID: "habit-add-attachment-button" });
      expect(addBtn).toBeDefined();
      act(() => {
        addBtn.props.onPress();
      });
      expect(onAddResourceMock).toHaveBeenCalled();
    });

    it("renders subtle + Add resource affordance when no resources exist", () => {
      const { EntityQuickEditSheet } = require("../EntityQuickEditSheet");
      const onAddResourceMock = jest.fn();

      let renderer: any;
      act(() => {
        renderer = create(
          <EntityQuickEditSheet
            visible={true}
            onClose={jest.fn()}
            title="Habit without resources"
            linkedResources={[]}
            totalResources={0}
            onAddResource={onAddResourceMock}
            testIDPrefix="habit"
          />
        );
      });

      const root = renderer.root;
      const emptyAdd = root.findByProps({ testID: "habit-add-resource-empty" });
      expect(emptyAdd).toBeDefined();
      act(() => {
        emptyAdd.props.onPress();
      });
      expect(onAddResourceMock).toHaveBeenCalled();
    });
  });
});

