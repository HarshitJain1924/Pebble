import React from "react";
import { act, create } from "react-test-renderer";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { TimerCockpit } from "../TimerCockpit";

const mockColors = {
  text: "#FFFFFF",
  textMuted: "#888888",
  primary: "#6366F1",
  card: "#1E1E2E",
  cardLight: "#2A2A3C",
  border: "#2E2E3E",
  success: "#10B981",
  warning: "#F59E0B",
};

describe("TimerCockpit Component", () => {
  const baseProps = {
    mode: "pomodoro" as const,
    pomodoroMode: "work" as const,
    isActive: false,
    glowEnabled: false,
    colors: mockColors,
    sessionTime: 1500,
    totalSessionTime: 1500,
    swRunning: false,
    swTime: 0,
    showCustomInput: false,
    customMinutes: 25,
    customMinsText: "25",
    breakType: "short" as const,
    handleStartPause: jest.fn(),
    handleReset: jest.fn(),
    swStartPause: jest.fn(),
    swReset: jest.fn(),
    swLap: jest.fn(),
    selectDuration: jest.fn(),
    selectCustomDuration: jest.fn(),
    adjustCustomMinutes: jest.fn(),
    handleCustomMinutesChange: jest.fn(),
    handleCustomMinutesSubmitOrBlur: jest.fn(),
    setBreakType: jest.fn(),
    setSessionTime: jest.fn(),
    setTotalSessionTime: jest.fn(),
  };

  it("1. Renders session time and status in Pomodoro work mode without target title or icon", () => {
    let renderer: any;
    act(() => {
      renderer = create(<TimerCockpit {...baseProps} />);
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((t: any) => t.props.children);

    expect(texts).toContain("25:00");
    expect(texts).toContain("Paused");
    expect(texts).toContain("Start Focus");

    // Must NOT contain any target icon
    const icons = root.findAllByType("Feather" as any);
    const iconNames = icons.map((icon: any) => icon.props.name);
    expect(iconNames).not.toContain("target");
  });

  it("2. Renders Stopwatch mode accurately with time and controls", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <TimerCockpit
          {...baseProps}
          mode="stopwatch"
          swTime={125}
          swRunning={true}
        />
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((t: any) => t.props.children);

    expect(texts).toContain("02:05");
    expect(texts).toContain("Running");
    expect(texts).toContain("Pause");
    expect(texts).toContain("Lap");
  });

  it("3. Renders Break mode with break status and presets", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <TimerCockpit
          {...baseProps}
          pomodoroMode="break"
          sessionTime={300}
          totalSessionTime={300}
        />
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((t: any) => t.props.children);

    expect(texts).toContain("05:00");
    expect(texts).toContain("Break Paused");
    expect(texts).toContain("Start Break");
    expect(texts).toContain("Short Break (5m)");
  });
});
