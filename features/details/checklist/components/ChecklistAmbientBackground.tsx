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
          {/* Subtle cool graphite/slate breath in upper-left for optical contrast */}
          <RadialGradient
            id={`${radialGlowId}_upper_left`}
            cx="16%"
            cy="18%"
            rx="55%"
            ry="28%"
          >
            <Stop offset="0%" stopColor="#2D2C38" stopOpacity={0.22} />
            <Stop offset="55%" stopColor="#1B1B24" stopOpacity={0.08} />
            <Stop offset="100%" stopColor="#0D0D10" stopOpacity={0} />
          </RadialGradient>

          {/* Luminous warm terracotta sunset ember flowing directly behind the metadata tiles */}
          <RadialGradient
            id={`${radialGlowId}_tile_glow`}
            cx="68%"
            cy="23%"
            rx="65%"
            ry="30%"
          >
            <Stop offset="0%" stopColor="#FF8259" stopOpacity={0.40} />
            <Stop offset="35%" stopColor="#E6653E" stopOpacity={0.24} />
            <Stop offset="70%" stopColor="#BF4A26" stopOpacity={0.07} />
            <Stop offset="100%" stopColor="#0D0D10" stopOpacity={0} />
          </RadialGradient>

          {/* Luminous diagonal light flow sweeping behind tiles into the mid section */}
          <LinearGradient
            id={diagGradId}
            x1="90%"
            y1="8%"
            x2="15%"
            y2="52%"
          >
            <Stop offset="0%" stopColor="#FF855D" stopOpacity={0.25} />
            <Stop offset="32%" stopColor="#E6653E" stopOpacity={0.14} />
            <Stop offset="68%" stopColor="#B84422" stopOpacity={0.04} />
            <Stop offset="100%" stopColor="#0D0D10" stopOpacity={0} />
          </LinearGradient>

          {/* Warm ambient radiance behind progress and description */}
          <RadialGradient
            id={`${radialGlowId}_lower`}
            cx="48%"
            cy="54%"
            rx="70%"
            ry="34%"
          >
            <Stop offset="0%" stopColor="#E6653E" stopOpacity={0.26} />
            <Stop offset="42%" stopColor="#BF4A26" stopOpacity={0.13} />
            <Stop offset="75%" stopColor="#7A2A14" stopOpacity={0.03} />
            <Stop offset="100%" stopColor="#0D0D10" stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Ambient base lighting layers */}
        <Rect width="100%" height="100%" fill={`url(#${radialGlowId}_upper_left)`} />
        <Rect width="100%" height="100%" fill={`url(#${diagGradId})`} />
        <Rect width="100%" height="100%" fill={`url(#${radialGlowId}_tile_glow)`} />
        <Rect width="100%" height="100%" fill={`url(#${radialGlowId}_lower)`} />
      </Svg>
    </View>
  );
});
