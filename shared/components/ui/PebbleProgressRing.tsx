import React, { useEffect, useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";
import Svg, { Circle, Ellipse, Path, Defs, RadialGradient, Stop } from "react-native-svg";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";

export type PebbleProgressRingProps = {
  progress: number; // 0 to 1
  size?: number;
  strokeWidth?: number;
  showText?: boolean;
  color?: string;
  trackColor?: string;
  pebbleCount?: number;
};

// 8 distinct water-smoothed river stone silhouettes centered at (0, 0)
// Scaled to width ≈ 11–13pt, height ≈ 8–10pt. Slight asymmetry in each
// profile mimics stones worn by moving water rather than perfect ovals.
const PEBBLE_PATHS = [
  // 1. Classic river pebble - gently tapered ovaloid (11.9pt x 9.0pt)
  "M -5.9 0.3 C -5.9 -2.7 -3.1 -4.5 0.3 -4.5 C 3.7 -4.4 6.1 -2.6 6.0 -0.1 C 5.9 2.9 3.2 4.5 -0.1 4.5 C -3.2 4.4 -5.9 3.0 -5.9 0.3 Z",
  // 2. Plump stone with softly flattened top (10.5pt x 8.7pt)
  "M -5.2 -0.9 C -5.1 -3.0 -2.5 -4.3 0.2 -4.3 C 3.0 -4.2 5.3 -2.5 5.3 -0.4 C 5.3 2.3 3.5 4.3 0.8 4.4 C -2.3 4.6 -5.3 3.1 -5.2 -0.9 Z",
  // 3. Elongated smooth river skimmer (12.4pt x 8.4pt)
  "M -6.2 -0.2 C -6.2 -2.8 -3.5 -4.2 -0.2 -4.2 C 3.3 -4.2 6.2 -2.5 6.2 0.2 C 6.2 2.8 3.6 4.2 0.0 4.2 C -3.5 4.2 -6.2 2.6 -6.2 -0.2 Z",
  // 4. Asymmetric bean stone - fuller lower-left face (11.4pt x 8.5pt)
  "M -5.6 0.8 C -5.8 -2.2 -3.0 -4.3 0.1 -4.4 C 3.2 -4.4 5.8 -2.5 5.8 -0.1 C 5.8 2.3 4.3 3.5 2.3 4.0 C 0.8 4.3 -1.8 4.5 -3.5 3.5 C -4.9 2.8 -5.6 2.1 -5.6 0.8 Z",
  // 5. Rounder friendly stone - gentle water wear (10.6pt x 9.4pt)
  "M -5.3 0.0 C -5.3 -3.1 -2.6 -4.7 0.3 -4.7 C 3.4 -4.7 5.3 -2.9 5.3 0.0 C 5.3 3.1 2.6 4.7 -0.3 4.7 C -3.4 4.7 -5.3 2.9 -5.3 0.0 Z",
  // 6. Organic stone with a soft point on the right (11.4pt x 8.6pt)
  "M -5.7 0.5 C -5.7 -2.5 -3.0 -4.3 0.2 -4.3 C 3.2 -4.2 5.6 -2.5 5.7 -0.3 C 5.8 2.0 4.6 3.6 2.8 4.1 C 0.9 4.6 -2.2 4.4 -4.0 3.3 C -5.2 2.5 -5.7 1.8 -5.7 0.5 Z",
  // 7. Wide flat river bed stone (13.0pt x 7.8pt)
  "M -6.5 0.1 C -6.5 -2.4 -4.0 -3.8 -0.1 -3.8 C 3.8 -3.8 6.5 -2.4 6.5 0.1 C 6.5 2.6 4.0 4.0 0.0 4.0 C -4.0 4.0 -6.5 2.6 -6.5 0.1 Z",
  // 8. Gently slanted water-washed stone (11.7pt x 8.6pt)
  "M -5.8 0.6 C -5.8 -2.4 -3.0 -4.2 0.3 -4.3 C 3.4 -4.4 5.9 -2.6 5.9 -0.2 C 5.9 2.6 3.2 4.2 -0.2 4.2 C -3.1 4.2 -5.8 2.9 -5.8 0.6 Z",
];

// Restrained deterministic orientation tilts (-9° to +9°) around the ring
const DETERMINISTIC_TILTS = [
  -6, 8, -4, 7, -9, 3, 9, -5, 6, -8, 4, -7, 5, -9, 7, -3, 8, -6, 5, -8, 9, -4, 6, -7,
];

// Subtle scale micro-variations (0.94 to 1.06)
const DETERMINISTIC_SCALES = [
  1.0, 0.95, 1.05, 0.97, 1.03, 0.94, 1.04, 0.96, 1.02, 0.97, 1.05, 0.95, 1.03, 0.96, 1.04, 0.94,
  1.02, 0.97, 1.06, 0.95, 1.0, 1.04, 0.96, 1.03,
];

/**
 * Parses a hex color string (3 or 6 digit) into RGB. Returns null when unparseable.
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  const clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16),
    };
  }
  if (clean.length >= 6) {
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  }
  return null;
}

/**
 * Lightens (percent > 0) or darkens (percent < 0) a hex color by mixing it
 * toward white or black. Falls back to the input when unparseable.
 */
function shade(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const target = percent < 0 ? 0 : 255;
  const amount = Math.abs(percent);
  const mix = (channel: number) =>
    Math.max(0, Math.min(255, Math.round(channel + (target - channel) * amount)));
  return `rgb(${mix(rgb.r)}, ${mix(rgb.g)}, ${mix(rgb.b)})`;
}

interface ActivePebbleProps {
  index: number;
  x: number;
  y: number;
  rotation: number;
  d: string;
  scale: number;
  isActive: boolean;
  color: string;
}

const ActivePebble: React.FC<ActivePebbleProps> = React.memo(
  ({ index, x, y, rotation, d, scale, isActive, color }) => {
    const enterAnim = useSharedValue(isActive ? 1 : 0);

    useEffect(() => {
      enterAnim.value = withTiming(isActive ? 1 : 0, {
        duration: 280,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      });
    }, [isActive, enterAnim]);

    const animatedStyle = useAnimatedStyle(() => {
      return {
        opacity: enterAnim.value,
        transform: [
          { rotate: `${rotation}deg` },
          { scale: (0.75 + 0.25 * enterAnim.value) * scale },
        ],
      };
    });

    // Unique gradient id per pebble so overlapping SVG defs never collide.
    const gradId = `pebbleGrad_${color.replace(/[^a-zA-Z0-9]/g, "")}_${index}`;
    const light = shade(color, 0.32); // catch light on the upper surface
    const dark = shade(color, -0.28); // shade toward the water line
    const rim = shade(color, -0.38); // quiet outline for definition

    return (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pebbleAnchor,
          {
            left: x - 14,
            top: y - 14,
          },
          animatedStyle,
        ]}
      >
        <Svg width={28} height={28} viewBox="-14 -14 28 28">
          <Defs>
            <RadialGradient id={gradId} cx="32%" cy="28%" r="90%">
              <Stop offset="0%" stopColor={light} />
              <Stop offset="55%" stopColor={color} />
              <Stop offset="100%" stopColor={dark} />
            </RadialGradient>
          </Defs>
          {/* Water-polished stone body: gradient volume + hairline rim */}
          <Path
            d={d}
            fill={`url(#${gradId})`}
            stroke={rim}
            strokeWidth={0.6}
            strokeLinejoin="round"
          />
          {/* Soft specular catchlight on the upper curve */}
          <Ellipse cx={-2.6} cy={-2.4} rx={3.6} ry={1.7} fill="#FFFFFF" opacity={0.16} />
        </Svg>
      </Animated.View>
    );
  }
);

/**
 * Computes the number of active pebble units around the ring for a given progress and count.
 * Clamps progress to [0, 1] and safely handles non-positive counts.
 */
export function getActivePebbleCount(progress: number, count: number): number {
  if (!Number.isFinite(count) || count <= 0) {
    return 0;
  }
  if (Number.isNaN(progress)) {
    return 0;
  }
  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  const rawCount = Math.floor(clampedProgress * count + 0.0001);
  return Math.max(0, Math.min(count, rawCount));
}

export const PebbleProgressRing: React.FC<PebbleProgressRingProps> = ({
  progress,
  size = 120,
  strokeWidth = 10,
  showText = false,
  color,
  trackColor,
  pebbleCount = 24,
}) => {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "dark"];
  const isDark = (colorScheme ?? "dark") !== "light";

  const radius = (size - strokeWidth) / 2;

  // 24 discrete units: deterministic percentage mapping (0% -> 0, 25% -> 6, 50% -> 12, 75% -> 18, 100% -> 24)
  const count = pebbleCount || 24;
  const activeCount = getActivePebbleCount(progress, count);

  // Inactive base dots remain small, subtle, and understated
  const inactiveRadius = Math.max(2, strokeWidth * 0.3);
  // Active stones read slightly larger than the raw stroke proportion
  const scaleMultiplier = (strokeWidth / 8) * 1.12;

  const resolvedActiveColor = color || theme.primary;
  const resolvedInactiveColor =
    trackColor || (isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.08)");

  const pebbleUnits = useMemo(() => {
    const units = [];
    const step = (2 * Math.PI) / count;
    for (let i = 0; i < count; i++) {
      // Start at 12 o'clock (-PI / 2) and advance clockwise
      const theta = -Math.PI / 2 + i * step;
      const x = size / 2 + radius * Math.cos(theta);
      const y = size / 2 + radius * Math.sin(theta);
      const tangent = (theta * 180) / Math.PI + 90;

      // 8 deterministic silhouettes, subtle orientation tilts (-10° to +10°), and micro-scales
      const shapeIdx = i % 8;
      const tilt = DETERMINISTIC_TILTS[i % DETERMINISTIC_TILTS.length];
      const scale = DETERMINISTIC_SCALES[i % DETERMINISTIC_SCALES.length] * scaleMultiplier;
      const rotation = tangent + tilt;

      units.push({
        index: i,
        x,
        y,
        rotation,
        d: PEBBLE_PATHS[shapeIdx],
        scale,
      });
    }
    return units;
  }, [count, radius, size, scaleMultiplier]);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        {/* Quiet inactive circular marker beds */}
        {pebbleUnits.map((u) => (
          <Circle
            key={`bed-${u.index}`}
            cx={u.x}
            cy={u.y}
            r={inactiveRadius}
            fill={resolvedInactiveColor}
          />
        ))}
      </Svg>

      {/* Discrete Pebble Progress: Active Organic River Stones with Natural Poise */}
      {pebbleUnits.map((u) => (
        <ActivePebble
          key={`pebble-${u.index}`}
          index={u.index}
          x={u.x}
          y={u.y}
          rotation={u.rotation}
          d={u.d}
          scale={u.scale}
          isActive={u.index < activeCount}
          color={resolvedActiveColor}
        />
      ))}

      {showText && (
        <View style={styles.textContainer}>
          <Text style={[styles.percentageText, { color: theme.text }]}>
            {Math.round(progress * 100)}%
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
  svg: {
    position: "absolute",
  },
  pebbleAnchor: {
    position: "absolute",
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  percentageText: {
    fontSize: 22,
    fontWeight: "800",
  },
});