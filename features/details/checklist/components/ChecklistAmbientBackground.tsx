import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

export interface ChecklistAmbientBackgroundProps {
  color: string;
  isLight?: boolean;
}

/**
 * Atmospheric ambient gradient background for Checklist Details screen.
 * Recreates the subtle, warm diagonal lighting from the reference design:
 * - Upper & top-left remains clean, deep obsidian charcoal (#101012).
 * - Mid-right & lower area receives a calm, localized ambient glow behind
 *   the description and priority section along the natural diagonal angle.
 */
export const ChecklistAmbientBackground: React.FC<ChecklistAmbientBackgroundProps> = ({
  color,
  isLight = false,
}) => {
  // Signature warm terracotta sunset ember from the design mockup (#E07A5F)
  const cleanColor = "#E07A5F";
  const uniqueKey = "warm_terracotta";
  const diagGradId = `diag_ambient_${uniqueKey}`;
  const radialGlowId = `radial_glow_${uniqueKey}`;

  if (isLight) {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient
              id={radialGlowId}
              cx="58%"
              cy="52%"
              rx="65%"
              ry="38%"
            >
              <Stop offset="0%" stopColor={cleanColor} stopOpacity={0.12} />
              <Stop offset="50%" stopColor={cleanColor} stopOpacity={0.04} />
              <Stop offset="100%" stopColor={cleanColor} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${radialGlowId})`} />
        </Svg>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          {/* Primary warm sunset ambient bloom behind the 2x2 cards and upper-right */}
          <RadialGradient
            id={`${radialGlowId}_upper`}
            cx="72%"
            cy="28%"
            rx="75%"
            ry="40%"
          >
            <Stop offset="0%" stopColor={cleanColor} stopOpacity={0.42} />
            <Stop offset="30%" stopColor={cleanColor} stopOpacity={0.24} />
            <Stop offset="65%" stopColor="#C85A32" stopOpacity={0.08} />
            <Stop offset="100%" stopColor="#0E0E10" stopOpacity={0} />
          </RadialGradient>

          {/* Secondary warm ambient bloom behind the description, items, and quick-add */}
          <RadialGradient
            id={`${radialGlowId}_lower`}
            cx="55%"
            cy="62%"
            rx="75%"
            ry="45%"
          >
            <Stop offset="0%" stopColor={cleanColor} stopOpacity={0.46} />
            <Stop offset="35%" stopColor="#D46238" stopOpacity={0.26} />
            <Stop offset="70%" stopColor={cleanColor} stopOpacity={0.09} />
            <Stop offset="100%" stopColor="#0E0E10" stopOpacity={0} />
          </RadialGradient>

          {/* Smooth diagonal ambient light beam along top-left to bottom-right */}
          <LinearGradient
            id={diagGradId}
            x1="5%"
            y1="15%"
            x2="95%"
            y2="85%"
          >
            <Stop offset="0%" stopColor={cleanColor} stopOpacity={0} />
            <Stop offset="35%" stopColor={cleanColor} stopOpacity={0} />
            <Stop offset="60%" stopColor={cleanColor} stopOpacity={0.18} />
            <Stop offset="85%" stopColor="#C85A32" stopOpacity={0.12} />
            <Stop offset="100%" stopColor="#0E0E10" stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {/* Ambient base lighting */}
        <Rect width="100%" height="100%" fill={`url(#${radialGlowId}_upper)`} />
        <Rect width="100%" height="100%" fill={`url(#${radialGlowId}_lower)`} />
        <Rect width="100%" height="100%" fill={`url(#${diagGradId})`} />
      </Svg>
    </View>
  );
};
