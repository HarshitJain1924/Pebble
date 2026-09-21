jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

import React from "react";
import { View } from "react-native";
import { create, act } from "react-test-renderer";
import { BlurView } from "expo-blur";

import { GlassSurface, canRenderBlur } from "../GlassSurface";

describe("canRenderBlur (blur vs solid fallback decision)", () => {
  it("renders a live blur on iOS", () => {
    expect(canRenderBlur("ios")).toBe(true);
  });

  it("never blurs on Android", () => {
    // Android's expo-blur path captures the view hierarchy into a software
    // canvas and crashes with "Software rendering doesn't support hardware
    // bitmaps" whenever a hardware bitmap is in the tree. Regression guard.
    expect(canRenderBlur("android")).toBe(false);
  });

  it("never blurs on web", () => {
    expect(canRenderBlur("web")).toBe(false);
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

  it("does not enable expo-blur's Android bitmap-capture path", () => {
    const renderer = render(<GlassSurface />);
    const blur = renderer.root.findByType(BlurView);

    expect(blur.props.experimentalBlurMethod).toBeUndefined();
  });

  it("keeps the surface clipped so border radii are honoured", () => {
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
