import React from "react";
import { Text } from "react-native";
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

  it("4. Hides presets when Pomodoro is actively running", () => {
    let renderer: any;
    act(() => {
      renderer = create(<TimerCockpit {...baseProps} isActive={true} />);
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((t: any) => t.props.children);

    expect(texts).toContain("25:00");
    expect(texts).toContain("Focusing");
    expect(texts).toContain("Pause");
    // Presets should be hidden when active
    expect(texts).not.toContain("15m");
    expect(texts).not.toContain("25m");
    expect(texts).not.toContain("45m");
    expect(texts).not.toContain("Custom");
  });

  it("5. Renders custom duration adjuster when showCustomInput is true", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <TimerCockpit
          {...baseProps}
          showCustomInput={true}
          customMinutes={35}
          customMinsText="35"
        />
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((t: any) => t.props.children);

    expect(texts).toContain("Custom");
    expect(texts).toContain("mins");
    const inputs = root.findAllByType("TextInput" as any);
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs[0].props.value).toBe("35");
  });

  it("6. Renders compact ProgressRing dimensions (< 200px) instead of legacy 230px", () => {
    let renderer: any;
    act(() => {
      renderer = create(<TimerCockpit {...baseProps} />);
    });

    const root = renderer.root;
    // Find ProgressRing component
    const ring = root.findByProps({ showText: false });
    expect(ring).toBeDefined();
    expect(ring.props.size).toBeLessThanOrEqual(180);
    expect(ring.props.strokeWidth).toBeLessThanOrEqual(8);
  });

  it("7. Renders targetSlot inside the unified session card when provided", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <TimerCockpit
          {...baseProps}
          targetSlot={<Text>Mock Target Slot</Text>}
        />
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((t: any) => t.props.children);
    expect(texts).toContain("Mock Target Slot");
    expect(texts).toContain("25:00");
    expect(texts).toContain("Start Focus");
  });

  it("8. Hides break presets and displays Break Active when break is actively running", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <TimerCockpit
          {...baseProps}
          pomodoroMode="break"
          sessionTime={300}
          totalSessionTime={300}
          isActive={true}
        />
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((t: any) => t.props.children);
    expect(texts).toContain("05:00");
    expect(texts).toContain("Break Active");
    expect(texts).toContain("Pause");
    // Break presets should be hidden when active
    expect(texts).not.toContain("Short Break (5m)");
    expect(texts).not.toContain("Long Break (15m)");
  });

  it("9. Active Pomodoro retains targetSlot and Pause action while in immersive focus", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <TimerCockpit
          {...baseProps}
          isActive={true}
          targetSlot={<Text>Active Linked Task</Text>}
        />
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((t: any) => t.props.children);
    expect(texts).toContain("Active Linked Task");
    expect(texts).toContain("Focusing");
    expect(texts).toContain("Pause");
    expect(texts).not.toContain("15m");
    expect(texts).not.toContain("25m");
  });

  it("10. Active Pomodoro renders a stronger progress arc (strokeWidth 8) while remaining within bounds", () => {
    let renderer: any;
    act(() => {
      renderer = create(<TimerCockpit {...baseProps} isActive={true} />);
    });

    const root = renderer.root;
    const ring = root.findByProps({ showText: false });
    expect(ring.props.strokeWidth).toBe(8);
  });
});
