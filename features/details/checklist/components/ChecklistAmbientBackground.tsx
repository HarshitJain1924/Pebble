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
  // Dynamic category ambient color (defaults to warm terracotta #E07A5F)
  const cleanColor = color || "#E07A5F";
  const uniqueKey = cleanColor.replace(/[^a-zA-Z0-9]/g, "");
  const diagGradId = `diag_ambient_${uniqueKey}_${isLight ? "light" : "dark"}`;
  const tileGlowId = `tile_glow_${uniqueKey}_${isLight ? "light" : "dark"}`;
  const lowerGlowId = `lower_glow_${uniqueKey}_${isLight ? "light" : "dark"}`;

  if (isLight) {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            {/* Light Mode: Soft diagonal atmospheric wash from top-right */}
            <LinearGradient
              id={diagGradId}
              x1="88%"
              y1="6%"
              x2="15%"
              y2="52%"
            >
              <Stop offset="0%" stopColor={cleanColor} stopOpacity={0.16} />
              <Stop offset="40%" stopColor={cleanColor} stopOpacity={0.06} />
              <Stop offset="100%" stopColor={cleanColor} stopOpacity={0} />
            </LinearGradient>

            {/* Light Mode: Luminous category ambient glow behind the 4 glass tiles */}
            <RadialGradient
              id={tileGlowId}
              cx="66%"
              cy="24%"
              rx="56%"
              ry="26%"
            >
              <Stop offset="0%" stopColor={cleanColor} stopOpacity={0.24} />
              <Stop offset="45%" stopColor={cleanColor} stopOpacity={0.10} />
              <Stop offset="80%" stopColor={cleanColor} stopOpacity={0.03} />
              <Stop offset="100%" stopColor={cleanColor} stopOpacity={0} />
            </RadialGradient>

            {/* Light Mode: Quiet ambient warmth behind items */}
            <RadialGradient
              id={lowerGlowId}
              cx="45%"
              cy="56%"
              rx="60%"
              ry="28%"
            >
              <Stop offset="0%" stopColor={cleanColor} stopOpacity={0.12} />
              <Stop offset="50%" stopColor={cleanColor} stopOpacity={0.04} />
              <Stop offset="100%" stopColor={cleanColor} stopOpacity={0} />
            </RadialGradient>
          </Defs>

          <Rect width="100%" height="100%" fill={`url(#${diagGradId})`} />
          <Rect width="100%" height="100%" fill={`url(#${tileGlowId})`} />
          <Rect width="100%" height="100%" fill={`url(#${lowerGlowId})`} />
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
            y1="8%"
            x2="15%"
            y2="52%"
          >
            <Stop offset="0%" stopColor={cleanColor} stopOpacity={0.15} />
            <Stop offset="40%" stopColor={cleanColor} stopOpacity={0.06} />
            <Stop offset="100%" stopColor="#0E0E10" stopOpacity={0} />
          </LinearGradient>

          {/* Controlled category ambient glow directly behind the metadata tile grid */}
          <RadialGradient
            id={tileGlowId}
            cx="66%"
            cy="24%"
            rx="56%"
            ry="26%"
          >
            <Stop offset="0%" stopColor={cleanColor} stopOpacity={0.28} />
            <Stop offset="42%" stopColor={cleanColor} stopOpacity={0.13} />
            <Stop offset="75%" stopColor={cleanColor} stopOpacity={0.04} />
            <Stop offset="100%" stopColor="#0E0E10" stopOpacity={0} />
          </RadialGradient>

          {/* Gentle, quiet ambient presence behind description and items */}
          <RadialGradient
            id={lowerGlowId}
            cx="45%"
            cy="55%"
            rx="60%"
            ry="28%"
          >
            <Stop offset="0%" stopColor={cleanColor} stopOpacity={0.13} />
            <Stop offset="50%" stopColor={cleanColor} stopOpacity={0.04} />
            <Stop offset="100%" stopColor="#0E0E10" stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Ambient base lighting layers */}
        <Rect width="100%" height="100%" fill={`url(#${diagGradId})`} />
        <Rect width="100%" height="100%" fill={`url(#${tileGlowId})`} />
        <Rect width="100%" height="100%" fill={`url(#${lowerGlowId})`} />
      </Svg>
    </View>
  );
});
