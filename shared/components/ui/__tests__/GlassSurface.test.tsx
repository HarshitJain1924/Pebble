jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

import React from "react";
import { View } from "react-native";
import { create, act } from "react-test-renderer";
import { BlurView } from "expo-blur";

import {
  ANDROID_LOW_MEMORY_THRESHOLD_BYTES,
  GlassSurface,
  canRenderBlur,
} from "../GlassSurface";

describe("canRenderBlur (blur vs solid fallback decision)", () => {
  it("skips the blur on web, where there is no native blur pass", () => {
    expect(canRenderBlur("web")).toBe(false);
  });

  it("skips the blur on low-memory Android", () => {
    expect(canRenderBlur("android", 1_500_000_000)).toBe(false);
  });

  it("keeps the blur on capable Android", () => {
    expect(canRenderBlur("android", 8_000_000_000)).toBe(true);
  });

  it("keeps the blur on Android when the memory signal is missing", () => {
    expect(canRenderBlur("android")).toBe(true);
    expect(canRenderBlur("android", 0)).toBe(true);
  });

  it("keeps the blur on iOS regardless of the memory signal", () => {
    expect(canRenderBlur("ios")).toBe(true);
    expect(canRenderBlur("ios", 1_000_000_000)).toBe(true);
  });

  it("treats the low-memory threshold as the inclusive lower bound", () => {
    expect(canRenderBlur("android", ANDROID_LOW_MEMORY_THRESHOLD_BYTES)).toBe(
      true,
    );
    expect(
      canRenderBlur("android", ANDROID_LOW_MEMORY_THRESHOLD_BYTES - 1),
    ).toBe(false);
  });
});

describe("GlassSurface", () => {
  const render = (element: React.ReactElement) => {
    let renderer: any;
    act(() => {
      renderer = create(element);
    });
    return renderer;
  };

  it("renders its children above the backdrop", () => {
    const renderer = render(
      <GlassSurface>
        <View testID="glass-child" />
      </GlassSurface>,
    );

    expect(renderer.root.findByProps({ testID: "glass-child" })).toBeTruthy();
  });

  it("renders a BlurView with the resolved intensity and scheme tint", () => {
    const renderer = render(<GlassSurface intensity={42} tint="dark" />);
    const blur = renderer.root.findByType(BlurView);

    expect(blur.props.intensity).toBe(42);
    expect(blur.props.tint).toBe("dark");
  });

  it("keeps the surface clipped so border radii are honoured on Android", () => {
    const renderer = render(<GlassSurface style={{ borderRadius: 28 }} />);
    const blur = renderer.root.findByType(BlurView);
    const flat = Object.assign({}, ...[].concat(blur.props.style));

    expect(flat.borderRadius).toBe(28);
    expect(flat.overflow).toBe("hidden");
  });

  it("accepts an explicit solid fallback and scrim without throwing", () => {
    const renderer = render(
      <GlassSurface
        scrimColor="rgba(0, 0, 0, 0.4)"
        solidColor="rgba(1, 2, 3, 0.85)"
      />,
    );

    expect(renderer.root.findByType(BlurView)).toBeTruthy();
  });
});
