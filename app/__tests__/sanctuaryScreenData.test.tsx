import React from "react";
import { act, create } from "react-test-renderer";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    Stack: { Screen: () => null },
    useFocusEffect: (cb: any) => {
      React.useEffect(() => cb(), [cb]);
    },
    useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
  };
});

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));

jest.mock("@expo/vector-icons", () => ({
  Feather: () => null,
}));

let mockScheme: "dark" | "light" = "dark";

jest.mock("@/shared/hooks/useColorScheme", () => ({
  useColorScheme: () => mockScheme,
}));

jest.mock("@/features/profile/components/InteractivePebbleJar", () => ({
  InteractivePebbleJar: () => null,
}));

jest.mock("@/features/profile/services/pebble.service", () => ({
  getPebbleCounts: jest.fn(),
  getGemsBalance: jest.fn(),
}));

jest.mock("@/features/settings/services/settings.service", () => ({
  getProfile: jest.fn(),
}));

import SanctuaryScreen from "@/app/sanctuary";
import {
  getPebbleCounts,
  getGemsBalance,
} from "@/features/profile/services/pebble.service";
import { getProfile } from "@/features/settings/services/settings.service";
import { emitStateChange } from "@/services/events/state-events";

const basePebbleCounts = {
  lifetime: 42,
  monthly: 15,
  today: 3,
  todayTypes: { task: 1, habit: 1, focus: 1, checklist: 0 },
  monthlyTypes: { task: 8, habit: 4, focus: 2, checklist: 1 },
  lifetimeTypes: { task: 22, habit: 12, focus: 6, checklist: 2 },
  streak: 5,
  bestStreak: 12,
};

async function flushAsync(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

let renderer: any;

function allText(): string {
  return renderer.root
    .findAll((node: any) => {
      const kids = node.props?.children;
      return kids !== undefined && kids !== null;
    })
    .map((node: any) => {
      const kids = node.props.children;
      return Array.isArray(kids)
        ? kids
            .filter((k) => typeof k === "string" || typeof k === "number")
            .join("")
        : String(kids);
    })
    .join(" ");
}

function renderedTextContains(snippet: string): boolean {
  return allText().includes(snippet);
}

function pressableByLabel(label: string) {
  return renderer.root.find(
    (node: any) =>
      node.props?.accessibilityLabel === label &&
      typeof node.props?.onPress === "function",
  );
}

describe("SanctuaryScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockScheme = "dark";
    (getProfile as jest.Mock).mockResolvedValue({
      name: "Ada Lovelace",
      email: "ada@pebble.app",
      avatar: "🦉",
    });
    (getPebbleCounts as jest.Mock).mockResolvedValue(basePebbleCounts);
    (getGemsBalance as jest.Mock).mockResolvedValue(25);
  });

  afterEach(() => {
    renderer?.unmount();
  });

  async function renderSanctuary() {
    await act(async () => {
      renderer = create(<SanctuaryScreen />);
    });
    await flushAsync();
  }

  it("renders monthly and lifetime counts dynamically", async () => {
    await renderSanctuary();

    expect(renderedTextContains("15")).toBe(true); // Monthly count
    expect(renderedTextContains("Harvested this month")).toBe(true);
    expect(renderedTextContains("15% Jar Capacity")).toBe(true);
    expect(renderedTextContains("42")).toBe(true); // Lifetime count
    expect(renderedTextContains("25")).toBe(true); // Gems
  });

  it("renders collection sources breakdown accurately", async () => {
    await renderSanctuary();

    expect(renderedTextContains("Tasks completed")).toBe(true);
    expect(renderedTextContains("22")).toBe(true); // Tasks lifetime
    expect(renderedTextContains("Habits maintained")).toBe(true);
    expect(renderedTextContains("12")).toBe(true); // Habits lifetime
    expect(renderedTextContains("Deep focus sessions")).toBe(true);
    expect(renderedTextContains("6")).toBe(true); // Focus lifetime
  });

  it("navigates back when header back button is pressed", async () => {
    await renderSanctuary();

    await act(async () => {
      pressableByLabel("Go back").props.onPress();
    });

    expect(mockBack).toHaveBeenCalled();
  });

  it("navigates to Profile when header user button is pressed", async () => {
    await renderSanctuary();

    await act(async () => {
      pressableByLabel("Open profile").props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith("/profile");
  });

  it("reactively reloads when pebbles_changed event is emitted", async () => {
    await renderSanctuary();

    (getPebbleCounts as jest.Mock).mockResolvedValue({
      ...basePebbleCounts,
      lifetime: 99,
      monthly: 50,
    });

    await act(async () => {
      emitStateChange("pebbles_changed");
    });
    await flushAsync();

    expect(getPebbleCounts).toHaveBeenCalledTimes(2);
    expect(renderedTextContains("50")).toBe(true);
    expect(renderedTextContains("99")).toBe(true);
  });
});
