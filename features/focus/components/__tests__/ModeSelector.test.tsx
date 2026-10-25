import React from "react";
import { act, create } from "react-test-renderer";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { ModeSelector } from "../ModeSelector";

const mockColors = {
  text: "#FFFFFF",
  textMuted: "#888888",
  primary: "#6366F1",
  success: "#10B981",
  card: "#1E1E2E",
  border: "#2E2E3E",
};

describe("ModeSelector Component", () => {
  it("1. Renders Focus and Break mode pills", () => {
    const setMode = jest.fn();
    let renderer: any;
    act(() => {
      renderer = create(
        <ModeSelector
          pomodoroMode="work"
          setMode={setMode}
          colors={mockColors}
        />
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((t: any) => t.props.children);
    expect(texts).toContain("Focus");
    expect(texts).toContain("Break");
    expect(texts).not.toContain("Stopwatch");

    const pressables = root.findAll((n: any) => typeof n.props?.onPress === "function");
    expect(pressables.length).toBe(2);
  });

  it("2. Triggers onSelectBreak when Break pill is pressed", () => {
    const onSelectBreak = jest.fn();
    const onSelectFocus = jest.fn();

    let renderer: any;
    act(() => {
      renderer = create(
        <ModeSelector
          pomodoroMode="work"
          onSelectFocus={onSelectFocus}
          onSelectBreak={onSelectBreak}
          colors={mockColors}
        />
      );
    });

    const root = renderer.root;
    const pressables = root.findAll((n: any) => typeof n.props?.onPress === "function");
    // Index 1 is Break
    act(() => {
      pressables[1].props.onPress();
    });

    expect(onSelectBreak).toHaveBeenCalledTimes(1);
    expect(onSelectFocus).not.toHaveBeenCalled();
  });

  it("3. Triggers onSelectFocus when Focus pill is pressed", () => {
    const onSelectBreak = jest.fn();
    const onSelectFocus = jest.fn();

    let renderer: any;
    act(() => {
      renderer = create(
        <ModeSelector
          pomodoroMode="break"
          onSelectFocus={onSelectFocus}
          onSelectBreak={onSelectBreak}
          colors={mockColors}
        />
      );
    });

    const root = renderer.root;
    const pressables = root.findAll((n: any) => typeof n.props?.onPress === "function");
    // Index 0 is Focus
    act(() => {
      pressables[0].props.onPress();
    });

    expect(onSelectFocus).toHaveBeenCalledTimes(1);
    expect(onSelectBreak).not.toHaveBeenCalled();
  });

  it("4. Falls back to setPomodoroMode and setMode if specific callbacks are omitted", () => {
    const setMode = jest.fn();
    const setPomodoroMode = jest.fn();

    let renderer: any;
    act(() => {
      renderer = create(
        <ModeSelector
          pomodoroMode="work"
          setMode={setMode}
          setPomodoroMode={setPomodoroMode}
          colors={mockColors}
        />
      );
    });

    const root = renderer.root;
    const pressables = root.findAll((n: any) => typeof n.props?.onPress === "function");

    // Tap Break
    act(() => {
      pressables[1].props.onPress();
    });
    expect(setMode).toHaveBeenCalledWith("pomodoro");
    expect(setPomodoroMode).toHaveBeenCalledWith("break");

    // Tap Focus
    act(() => {
      pressables[0].props.onPress();
    });
    expect(setPomodoroMode).toHaveBeenCalledWith("work");
  });
});
