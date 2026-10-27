import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import {
  LiquidGlassView,
  isLiquidGlassSupported,
} from "react-native-liquid-glassmorphism";

export interface LiquidGlassSurfaceProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tintColor?: string;
  intensity?: number;
  blurRadius?: number;
  interactive?: boolean;
  rim?: boolean;
  specular?: boolean;
  borderRadius?: number;
  thickness?: number;
  edgeReflectionStrength?: number;
  dim?: number;
  brightness?: number;
  variant?: "clear" | "regular";
  refraction?: boolean;
}

/**
 * Premium Liquid Glass surface powered by `react-native-liquid-glassmorphism`.
 * Features real-time AGSL refractive-lens optics on Android:
 * - 'clear' variant preserves deep dark-mode obsidian contrast without washing out into grey.
 * - Direct `borderRadius` prop drives native Outline + shader SDF corner rounding.
 * - Directional specular and subtle dimming create authentic smoked-glass depth.
 * - Clean fallback for unsupported platforms.
 */
export const LiquidGlassSurface: React.FC<LiquidGlassSurfaceProps> = ({
  children,
  style,
  tintColor = "rgba(255, 255, 255, 0.05)",
  intensity = 50,
  blurRadius = 20,
  interactive = true,
  rim = false,
  specular = true,
  borderRadius = 16,
  thickness = 0.85,
  edgeReflectionStrength = 0.45,
  dim = 0.12,
  brightness = 1.05,
  variant = "clear",
  refraction = true,
}) => {
  if (!isLiquidGlassSupported()) {
    return (
      <View
        style={[
          styles.fallback,
          {
            borderRadius,
            backgroundColor: tintColor,
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <LiquidGlassView
      variant={variant}
      tintColor={tintColor}
      intensity={intensity}
      blurRadius={blurRadius}
      interactive={interactive}
      rim={rim}
      specular={specular}
      borderRadius={borderRadius}
      thickness={thickness}
      edgeReflectionStrength={edgeReflectionStrength}
      dim={dim}
      brightness={brightness}
      legibilityFloor={0.15}
      refraction={refraction}
      style={style}
    >
      {children}
    </LiquidGlassView>
  );
};

const styles = StyleSheet.create({
  fallback: {
    borderWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.18)",
    borderLeftColor: "rgba(255, 255, 255, 0.08)",
    borderRightColor: "rgba(255, 255, 255, 0.05)",
    borderBottomColor: "rgba(0, 0, 0, 0.35)",
  },
});



