import React from "react";
import { View, Text } from "react-native";
import { ExecutionEnvironment } from "expo-constants";
import { act, create } from "react-test-renderer";

// Mock dependencies
const mockLiquidGlassView = jest.fn(({ children }: any) => <View testID="native-glass">{children}</View>);

jest.mock("react-native-liquid-glassmorphism", () => ({
  LiquidGlassView: (props: any) => mockLiquidGlassView(props),
  isLiquidGlassSupported: jest.fn(() => true),
}));

const mockBlurView = jest.fn(({ children }: any) => <View testID="mock-blur-view">{children}</View>);

jest.mock("expo-blur", () => ({
  BlurView: (props: any) => mockBlurView(props),
}));

let mockExecutionEnvironment: string = ExecutionEnvironment.Bare;

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get executionEnvironment() {
      return mockExecutionEnvironment;
    },
  },
  ExecutionEnvironment: {
    Bare: "bare",
    Standalone: "standalone",
    StoreClient: "storeClient",
  },
}));

describe("LiquidGlassSurface Rendering Pipeline", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecutionEnvironment = ExecutionEnvironment.Bare;
    jest.resetModules();
  });

  it("renders native LiquidGlassView when native module is supported and not in Expo Go", () => {
    const { LiquidGlassSurface } = require("../LiquidGlassSurface");

    let tree: any;
    act(() => {
      tree = create(
        <LiquidGlassSurface isLight={false}>
          <Text>Glass Content</Text>
        </LiquidGlassSurface>
      );
    });

    expect(mockLiquidGlassView).toHaveBeenCalledTimes(1);
    expect(mockBlurView).not.toHaveBeenCalled();

    // Verify native props: rim is false in dark mode by default, specular is true
    const nativeProps = mockLiquidGlassView.mock.calls[0][0];
    expect(nativeProps.rim).toBe(false);
    expect(nativeProps.specular).toBe(true);
    expect(nativeProps.thickness).toBe(0.50);
    expect(nativeProps.edgeReflectionStrength).toBe(0.18);
    expect(nativeProps.magnification).toBe(1.02);
    expect(nativeProps.ior).toBe(1.48);
  });

  it("renders without redundant SVG overlay in native path", () => {
    const { LiquidGlassSurface } = require("../LiquidGlassSurface");

    let tree: any;
    act(() => {
      tree = create(
        <LiquidGlassSurface isLight={false}>
          <Text>Native Pure Glass</Text>
        </LiquidGlassSurface>
      );
    });

    // Ensure children are rendered directly without artificial SVG elements
    const svgs = tree.root.findAll((node: any) => node.type === "Svg" || node.props?.testID?.includes?.("svg"));
    expect(svgs.length).toBe(0);
  });

  it("renders blur fallback when running in Expo Go", () => {
    mockExecutionEnvironment = ExecutionEnvironment.StoreClient;
    const { LiquidGlassSurface } = require("../LiquidGlassSurface");

    let tree: any;
    act(() => {
      tree = create(
        <LiquidGlassSurface isLight={false}>
          <Text>Fallback Content</Text>
        </LiquidGlassSurface>
      );
    });

    expect(mockLiquidGlassView).not.toHaveBeenCalled();
    expect(mockBlurView).toHaveBeenCalledTimes(1);
  });
});

