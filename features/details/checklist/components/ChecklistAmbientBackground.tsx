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
          {/* Subtle atmospheric charcoal vignette across upper area for dark glass depth */}
          <RadialGradient
            id={`${radialGlowId}_upper_vignette`}
            cx="40%"
            cy="18%"
            rx="80%"
            ry="45%"
          >
            <Stop offset="0%" stopColor="#1C1C22" stopOpacity={0.45} />
            <Stop offset="55%" stopColor="#141418" stopOpacity={0.20} />
            <Stop offset="100%" stopColor="#0E0E10" stopOpacity={0} />
          </RadialGradient>

          {/* Warm terracotta sunset ember glow positioned in mid-lower section behind description & priority */}
          <RadialGradient
            id={`${radialGlowId}_lower`}
            cx="58%"
            cy="65%"
            rx="70%"
            ry="38%"
          >
            <Stop offset="0%" stopColor={cleanColor} stopOpacity={0.32} />
            <Stop offset="40%" stopColor="#D46238" stopOpacity={0.18} />
            <Stop offset="75%" stopColor="#8A361C" stopOpacity={0.06} />
            <Stop offset="100%" stopColor="#0E0E10" stopOpacity={0} />
          </RadialGradient>

          {/* Gentle diagonal atmospheric warmth along the natural lighting angle */}
          <LinearGradient
            id={diagGradId}
            x1="10%"
            y1="30%"
            x2="90%"
            y2="90%"
          >
            <Stop offset="0%" stopColor="#0E0E10" stopOpacity={0} />
            <Stop offset="50%" stopColor={cleanColor} stopOpacity={0.06} />
            <Stop offset="80%" stopColor="#C85A32" stopOpacity={0.08} />
            <Stop offset="100%" stopColor="#0E0E10" stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {/* Ambient base lighting layers */}
        <Rect width="100%" height="100%" fill={`url(#${radialGlowId}_upper_vignette)`} />
        <Rect width="100%" height="100%" fill={`url(#${radialGlowId}_lower)`} />
        <Rect width="100%" height="100%" fill={`url(#${diagGradId})`} />
      </Svg>
    </View>
  );
};
