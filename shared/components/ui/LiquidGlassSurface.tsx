import React from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import { LiquidGlassView } from "react-native-liquid-glassmorphism";

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
}

/**
 * Premium Liquid Glass surface powered by `react-native-liquid-glassmorphism`.
 * Features real-time AGSL refractive-lens optics on Android:
 * - 'clear' variant preserves deep dark-mode obsidian contrast without washing out into grey.
 * - Direct `borderRadius` prop drives native Outline + shader SDF corner rounding.
 * - Tuned lens thickness & edge reflection provide subtle, authentic liquid sheen.
 */
export const LiquidGlassSurface: React.FC<LiquidGlassSurfaceProps> = ({
  children,
  style,
  tintColor = "rgba(255, 255, 255, 0.06)",
  intensity = 45,
  blurRadius = 16,
  interactive = true,
  rim = true,
  specular = true,
  borderRadius = 16,
  thickness = 0.85,
  edgeReflectionStrength = 0.5,
}) => {
  return (
    <LiquidGlassView
      variant="clear"
      tintColor={tintColor}
      intensity={intensity}
      blurRadius={blurRadius}
      interactive={interactive}
      rim={rim}
      specular={specular}
      borderRadius={borderRadius}
      thickness={thickness}
      edgeReflectionStrength={edgeReflectionStrength}
      brightness={1.12}
      legibilityFloor={0.15}
      refraction={true}
      style={style}
    >
      {children}
    </LiquidGlassView>
  );
};



