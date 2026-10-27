import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";

export interface LiquidGlassSurfaceProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tintColor?: string;
  intensity?: number;
  interactive?: boolean;
  rim?: boolean;
  specular?: boolean;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
}

/**
 * Premium Liquid Glass surface powered by Expo Blur.
 * Real-time background refraction blur with directional specular lighting
 * (bright top light catch, soft ambient sides, subtle bottom shadow rim).
 */
export const LiquidGlassSurface: React.FC<LiquidGlassSurfaceProps> = ({
  children,
  style,
  tintColor = "rgba(255, 255, 255, 0.04)",
  intensity = 35,
  borderRadius = 16,
}) => {
  return (
    <View
      style={[
        styles.outerContainer,
        {
          borderRadius,
          backgroundColor: tintColor,
        },
        style,
      ]}
    >
      <BlurView
        intensity={intensity}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    overflow: "hidden",
    borderWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.22)",
    borderLeftColor: "rgba(255, 255, 255, 0.10)",
    borderRightColor: "rgba(255, 255, 255, 0.08)",
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
});


