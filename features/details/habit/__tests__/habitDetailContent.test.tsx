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
jest.mock("react-native-calendars", () => {
  const React = require("react");
  const { View } = require("react-native");
  return { Calendar: (props: any) => React.createElement(View, props) };
});
const mockUndoApi = { showToast: jest.fn(), showUndo: jest.fn() };
jest.mock("@/shared/components/ui/UndoContext", () => ({
  useUndo: () => mockUndoApi,
}));
jest.mock("@/services/events/state-events", () => ({
  emitStateChange: jest.fn(),
}));
jest.mock("@/services/analytics/productivity-history.service", () => ({
  getAllHistory: jest.fn(async () => []),
}));
jest.mock("@/services/scheduling/reminders.service", () => ({
  cancelReminderIds: jest.fn(async () => undefined),
  scheduleReminderBatch: jest.fn(async () => ({ ids: [] })),
}));
jest.mock("@/repositories", () => ({
  HabitRepository: {
    getHabit: jest.fn(),
    getHabits: jest.fn(async () => ({})),
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
    updateHabit: jest.fn(async () => ({})),
    createHabit: jest.fn(async () => ({})),
    moveHabit: jest.fn(async () => ({})),
    recycleHabit: jest.fn(async () => {}),
    restoreHabit: jest.fn(async () => ({})),
    convertHabitToTask: jest.fn(async () => ({ id: "task-new" })),
  },
}));

import React from "react";
import { Alert, Modal, TextInput } from "react-native";
import { act, create } from "react-test-renderer";

import { HabitDetailContent } from "@/features/details/habit/HabitDetailContent";
import { HabitRepository, WorkspaceRepository, ResourceRepository } from "@/repositories";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { getAllHistory } from "@/services/analytics/productivity-history.service";
import { scheduleReminderBatch } from "@/services/scheduling/reminders.service";

type Renderer = ReturnType<typeof create>;

const baseHabit: any = {
  id: "habit-1",
  workspaceId: "inbox",
  title: "Morning run",
  description: "3km around the park",
  categoryId: "health",
  priority: "high",
  recurrence: { frequency: "daily", interval: 1 },
  reminder: { enabled: true, triggerAt: 1755525600000 },
  completionHistory: [{ date: "2026-08-17", completedAt: 1755525600000 }],
  streak: 12,
  bestStreak: 20,
  completedToday: true,
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

// Flatten the full rendered text, including JSX array children (e.g. the
// "🔥 {streak} days" streak values rendered as multiple children).
const fullText = (renderer: Renderer) => {
  const collect = (node: any): string => {
    const propsChildren = node.props?.children;
    let text = "";
    if (typeof propsChildren === "string" || typeof propsChildren === "number") {
      text += String(propsChildren);
    } else if (Array.isArray(propsChildren)) {
      text += propsChildren
        .map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : ""))
        .join("");
    }
    (node.children || []).forEach((child: any) => {
      text += collect(child);
    });
    return text;
  };
  return collect(renderer.root);
};

const renderContent = async (
  habit: any,
  overrides: { onBack?: () => void; onConverted?: (id: string) => void } = {},
) => {
  const onBack = overrides.onBack ?? jest.fn();
  const onConverted = overrides.onConverted ?? jest.fn();
  (HabitRepository.getHabit as jest.Mock).mockImplementation(
    async (_id: string, workspaceId: string) =>
      workspaceId === "inbox" ? habit : null,
  );
  let renderer!: Renderer;
  await act(async () => {
    renderer = create(
      <HabitDetailContent
        habitId={habit.id}
        selectedOccurrenceDate="2026-08-18"
        onBack={onBack}
        onConvertedToTask={onConverted}
      />,
    );
  });
  return { renderer, onBack, onConverted };
};

describe("HabitDetailContent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (WorkspaceRepository.getWorkspaces as jest.Mock).mockResolvedValue([]);
    (ResourceRepository.getResources as jest.Mock).mockResolvedValue({});
    (getAllHistory as jest.Mock).mockResolvedValue([]);
  });

  it("renders the habit title, description, badges, recurrence, and statistics", async () => {
    (getAllHistory as jest.Mock).mockResolvedValue([
      {
        date: "2026-08-17",
        totalHabits: 2,
        completedHabitTitles: ["Morning run", "Other"],
        score: 50,
      },
      {
        date: "2026-08-16",
        totalHabits: 2,
        completedHabitTitles: ["Other"],
        score: 0,
      },
    ]);
    const { renderer } = await renderContent(baseHabit);
    const strings = renderedStrings(renderer);

    // Title + description
    expect(strings).toContain("Morning run");
    expect(strings).toContain("3km around the park");
    // Badges
    expect(strings).toContain("Habit");
    expect(strings).toContain("High");
    expect(strings).toContain("Health");
    expect(strings).toContain("Done Today");
    // Schedule section
    expect(strings).toContain("Repeat");
    expect(strings).toContain("Daily");
    expect(strings).toContain("Reminder");
    // Progress section — streak values preserved verbatim
    const text = fullText(renderer);
    expect(text).toContain("🔥 12 days");
    expect(text).toContain("🏆 20 days");
    expect(text).toContain("1 completions (50% rate)");

    // Completion calendar marks the completed history date
    const calendar = renderer.root.findAll(
      (node: any) => node.props?.markedDates !== undefined,
    );
    expect(calendar.length).toBeGreaterThan(0);
    expect(calendar[0].props.markedDates["2026-08-17"]).toEqual({
      selected: true,
      selectedColor: "#F59E0B",
      textColor: "#FFFFFF",
    });
  });

  it("shows 'No notes added' when the habit has no description", async () => {
    const withoutNotes = { ...baseHabit, description: undefined };
    const { renderer } = await renderContent(withoutNotes);
    expect(renderedStrings(renderer)).toContain("No notes added");
  });

  it("shows the Done-Today state from completedToday", async () => {
    const notToday = { ...baseHabit, completedToday: false };
    const { renderer } = await renderContent(notToday);
    expect(renderedStrings(renderer)).toContain("Not Done Today");
  });

  it("edits the title and saves through EntityCommandService.updateHabit", async () => {
    // Non-recurring so Save persists directly instead of opening the
    // recurrence modal; no reminder so the manual scheduling path is skipped.
    const noReminder = { ...baseHabit, recurrence: undefined, reminder: undefined };
    const { renderer } = await renderContent(noReminder);

    await act(async () => {
      findByAccessibilityLabel(renderer, "Edit habit").props.onPress();
    });

    const nameInput = renderer.root.findAllByType(TextInput)[0];
    expect(nameInput.props.value).toBe("Morning run");

    await act(async () => {
      nameInput.props.onChangeText("Morning run fast");
    });

    await act(async () => {
      findByAccessibilityLabel(renderer, "Save habit").props.onPress();
    });

    expect(EntityCommandService.updateHabit).toHaveBeenCalledWith(
      "habit-1",
      "inbox",
      expect.objectContaining({ title: "Morning run fast" }),
      expect.objectContaining({ source: "task-details" }),
    );
    // With no reminder set, the pre-existing manual scheduling path is skipped.
    expect(scheduleReminderBatch).not.toHaveBeenCalled();
    expect(mockUndoApi.showToast).toHaveBeenCalledWith("Changes saved");
  });

  it("loads canonical resourceIds and persists them as resourceIds on save", async () => {
    // Canonical Habit shape: resourceIds (no legacy linkedCollectionIds field).
    const withResources = {
      ...baseHabit,
      recurrence: undefined,
      resourceIds: ["res-1"],
    };
    (ResourceRepository.getResources as jest.Mock).mockImplementation(
      async (workspaceId: string) =>
        workspaceId === "inbox"
          ? {
              "res-1": {
                id: "res-1",
                workspaceId: "inbox",
                type: "note",
                title: "Route notes",
                createdAt: 1755000000000,
                updatedAt: 1755000000000,
              },
            }
          : {},
    );

    const { renderer } = await renderContent(withResources);
    expect(renderedStrings(renderer)).toContain("Route notes");

    await act(async () => {
      findByAccessibilityLabel(renderer, "Edit habit").props.onPress();
    });
    const nameInput = renderer.root.findAllByType(TextInput)[0];
    await act(async () => {
      nameInput.props.onChangeText("Morning run v2");
    });
    await act(async () => {
      findByAccessibilityLabel(renderer, "Save habit").props.onPress();
    });
    const payload = (EntityCommandService.updateHabit as jest.Mock).mock
      .calls[0][2];
    expect(payload).toEqual(
      expect.objectContaining({
        title: "Morning run v2",
        // The canonical field is persisted — the legacy alias is NOT in the
        // mutation payload (regression for the linkedCollectionIds bug).
        resourceIds: ["res-1"],
      }),
    );
    expect(payload.linkedCollectionIds).toBeUndefined();
  });

  it("opens the recurrence-safety modal when deleting a recurring habit", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const { renderer } = await renderContent(baseHabit);
    await act(async () => {
      findByAccessibilityLabel(renderer, "Delete Item").props.onPress();
    });
    // Recurring habits skip the confirmation Alert and show the safety modal.
    expect(alertSpy).not.toHaveBeenCalled();
    const visibleModals = renderer.root.findAll(
      (node: any) => node.type === Modal && node.props?.visible === true,
    );
    expect(visibleModals.length).toBeGreaterThan(0);
    alertSpy.mockRestore();
  });

  it("asks for confirmation before deleting a non-recurring habit", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const nonRecurring = { ...baseHabit, recurrence: undefined };
    const { renderer } = await renderContent(nonRecurring);
    await act(async () => {
      findByAccessibilityLabel(renderer, "Delete Item").props.onPress();
    });
    expect(alertSpy).toHaveBeenCalledWith(
      "Delete Item",
      "Are you sure you want to permanently delete this item?",
      expect.any(Array),
    );
    alertSpy.mockRestore();
  });

  it("converts the habit to a task and routes to the new task", async () => {
    const { renderer, onConverted } = await renderContent(baseHabit);
    await act(async () => {
      findByAccessibilityLabel(renderer, "Convert to Task").props.onPress();
    });
    expect(EntityCommandService.convertHabitToTask).toHaveBeenCalledWith(
      "habit-1",
      "inbox",
      expect.objectContaining({ source: "ui_convert" }),
    );
    expect(onConverted).toHaveBeenCalledWith("task-new");
  });

  it("invokes onBack from the header back action", async () => {
    const { renderer, onBack } = await renderContent(baseHabit);
    await act(async () => {
      findByAccessibilityLabel(renderer, "Go back").props.onPress();
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
