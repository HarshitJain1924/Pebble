import React from "react";
import { act, create } from "react-test-renderer";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { AmbientSoundBar } from "../AmbientSoundBar";
import { PressableScale } from "@/shared/components/ui/PressableScale";

const mockColors = {
  text: "#FFFFFF",
  textMuted: "#888888",
  primary: "#6366F1",
  card: "#1E1E2E",
  border: "#2E2E3E",
  error: "#EF4444",
};

describe("AmbientSoundBar Component", () => {
  const baseProps = {
    isActive: false,
    selectedSoundId: "none",
    isMuted: false,
    onToggleMute: jest.fn(),
    onPrevTrack: jest.fn(),
    onNextTrack: jest.fn(),
    onTogglePlay: jest.fn(),
    isPlaying: false,
    onOpenPlayer: jest.fn(),
    colors: mockColors,
    customTracks: [],
  };

  it("1. Renders inactive ready state as compact utility row and triggers onOpenPlayer", () => {
    const onOpenPlayer = jest.fn();

    let renderer: any;
    act(() => {
      renderer = create(
        <AmbientSoundBar
          {...baseProps}
          isActive={false}
          selectedSoundId="none"
          onOpenPlayer={onOpenPlayer}
        />
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((t: any) => t.props.children);
    expect(texts).toContain("Ambient sound");
    expect(texts).toContain("Off");

    // Pressable row opens player modal
    const pressable = root.findByType(PressableScale);
    act(() => {
      pressable.props.onPress();
    });
    expect(onOpenPlayer).toHaveBeenCalledTimes(1);
  });

  it("2. Renders active state with supporting transport controls and mute toggle", () => {
    const onToggleMute = jest.fn();
    const onPrevTrack = jest.fn();
    const onNextTrack = jest.fn();
    const onTogglePlay = jest.fn();

    let renderer: any;
    act(() => {
      renderer = create(
        <AmbientSoundBar
          {...baseProps}
          isActive={true}
          selectedSoundId="cosmic"
          isMuted={false}
          isPlaying={true}
          onToggleMute={onToggleMute}
          onPrevTrack={onPrevTrack}
          onNextTrack={onNextTrack}
          onTogglePlay={onTogglePlay}
        />
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType("Text" as any).map((t: any) => t.props.children);
    expect(texts).toContain("Cosmic Healing (432Hz)");

    const icons = root.findAll((node: any) => node.props && typeof node.props.name === "string");
    const iconNames = icons.map((icon: any) => icon.props.name);
    expect(iconNames).toContain("music");
    expect(iconNames).toContain("volume-2");
    expect(iconNames).toContain("skip-back");
    expect(iconNames).toContain("pause");
    expect(iconNames).toContain("skip-forward");
  });
});
