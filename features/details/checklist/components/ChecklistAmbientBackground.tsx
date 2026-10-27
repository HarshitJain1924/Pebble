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
export const ChecklistAmbientBackground: React.FC<ChecklistAmbientBackgroundProps> = React.memo(({
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
          {/* Gentle diagonal atmospheric warmth from top-right toward mid-left */}
          <LinearGradient
            id={diagGradId}
            x1="85%"
            y1="10%"
            x2="15%"
            y2="55%"
          >
            <Stop offset="0%" stopColor="#D96B47" stopOpacity={0.10} />
            <Stop offset="35%" stopColor="#C25532" stopOpacity={0.04} />
            <Stop offset="100%" stopColor="#0E0E10" stopOpacity={0} />
          </LinearGradient>

          {/* Controlled terracotta ambient glow directly behind the metadata tile grid */}
          <RadialGradient
            id={`${radialGlowId}_tile_glow`}
            cx="66%"
            cy="24%"
            rx="52%"
            ry="24%"
          >
            <Stop offset="0%" stopColor="#E0724E" stopOpacity={0.20} />
            <Stop offset="45%" stopColor="#BF5534" stopOpacity={0.08} />
            <Stop offset="100%" stopColor="#0E0E10" stopOpacity={0} />
          </RadialGradient>

          {/* Gentle, quiet ambient presence behind description and items */}
          <RadialGradient
            id={`${radialGlowId}_lower`}
            cx="45%"
            cy="54%"
            rx="58%"
            ry="26%"
          >
            <Stop offset="0%" stopColor="#D45E3B" stopOpacity={0.09} />
            <Stop offset="50%" stopColor="#9C381E" stopOpacity={0.03} />
            <Stop offset="100%" stopColor="#0E0E10" stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Ambient base lighting layers */}
        <Rect width="100%" height="100%" fill={`url(#${diagGradId})`} />
        <Rect width="100%" height="100%" fill={`url(#${radialGlowId}_tile_glow)`} />
        <Rect width="100%" height="100%" fill={`url(#${radialGlowId}_lower)`} />
      </Svg>
    </View>
  );
});
