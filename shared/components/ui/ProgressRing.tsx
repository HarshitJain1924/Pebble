import React, { useEffect, useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";
import Svg, { Circle, Path } from "react-native-svg";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type ProgressRingProps = {
  progress: number; // 0 to 1
  size?: number;
  strokeWidth?: number;
  showText?: boolean;
  color?: string;
  trackColor?: string;
  variant?: "continuous" | "pebbles";
  pebbleCount?: number;
};

// 6 distinct water-smoothed river stone silhouettes centered at (0, 0)
// Scaled to width ≈ 11–13pt, height ≈ 8–10pt
const PEBBLE_PATHS = [
  // 1. Classic river pebble - gently tapered teardrop ovaloid (11.4pt x 8.6pt)
  "M -5.8 0.2 C -5.8 -2.8 -3.4 -4.4 -0.5 -4.4 C 2.8 -4.4 5.6 -2.4 5.6 -0.4 C 5.6 2.6 3.2 4.2 0.8 4.2 C -3.0 4.2 -5.8 2.8 -5.8 0.2 Z",
  // 2. Water-worn stone - calm, slightly fuller river pebble (12.0pt x 9.2pt)
  "M -6.0 -0.3 C -6.0 -3.2 -3.0 -4.6 0.5 -4.6 C 4.2 -4.6 6.0 -2.4 6.0 0.3 C 6.0 3.2 3.0 4.6 -0.5 4.6 C -4.2 4.6 -6.0 2.4 -6.0 -0.3 Z",
  // 3. Elongated flat pebble - smooth river bed skimmer (12.8pt x 8.0pt)
  "M -6.4 0.0 C -6.4 -2.6 -3.8 -4.0 0.0 -4.0 C 3.8 -4.0 6.4 -2.6 6.4 0.0 C 6.4 2.6 3.8 4.0 0.0 4.0 C -3.8 4.0 -6.4 2.6 -6.4 0.0 Z",
  // 4. Asymmetric soft pebble - organic poise with natural weight (11.4pt x 8.7pt)
  "M -5.6 -0.6 C -5.6 -3.0 -3.2 -4.2 -0.8 -4.2 C 2.6 -4.2 5.8 -2.0 5.8 0.5 C 5.8 3.2 3.4 4.5 1.0 4.5 C -2.8 4.5 -5.6 2.2 -5.6 -0.6 Z",
  // 5. Rounder river stone - friendly, plump pebble (10.8pt x 9.6pt)
  "M -5.4 0.0 C -5.4 -3.2 -2.8 -4.8 0.3 -4.8 C 3.6 -4.8 5.4 -2.6 5.4 0.0 C 5.4 3.2 2.8 4.8 -0.3 4.8 C -3.6 4.8 -5.4 2.6 -5.4 0.0 Z",
  // 6. Subtly slanted organic pebble - water-washed river stone (11.6pt x 8.6pt)
  "M -5.9 0.4 C -5.9 -2.5 -3.0 -4.3 0.6 -4.3 C 4.0 -4.3 5.7 -2.2 5.7 -0.3 C 5.7 2.6 3.0 4.3 -0.6 4.3 C -4.0 4.3 -5.9 2.4 -5.9 0.4 Z",
];

// Restrained deterministic orientation tilts (-9° to +9°) around the ring
const DETERMINISTIC_TILTS = [
  -6, 8, -4, 7, -9, 3, 9, -5, 6, -8, 4, -7, 5, -9, 7, -3, 8, -6, 5, -8, 9, -4, 6, -7,
];

// Subtle scale micro-variations (0.96 to 1.04)
const DETERMINISTIC_SCALES = [
  1.0, 0.96, 1.04, 0.98, 1.02, 0.95, 1.03, 0.97, 1.01, 0.98, 1.04, 0.96, 1.02, 0.97, 1.03, 0.95,
  1.01, 0.98, 1.04, 0.96, 1.0, 1.03, 0.97, 1.02,
];

interface ActivePebbleProps {
  x: number;
  y: number;
  rotation: number;
  d: string;
  scale: number;
  isActive: boolean;
  color: string;
}

const ActivePebble: React.FC<ActivePebbleProps> = React.memo(
  ({ x, y, rotation, d, scale, isActive, color }) => {
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
          <Path d={d} fill={color} />
        </Svg>
      </Animated.View>
    );
  }
);

export const ProgressRing: React.FC<ProgressRingProps> = ({
  progress,
  size = 120,
  strokeWidth = 10,
  showText = true,
  color,
  trackColor,
  variant = "continuous",
  pebbleCount = 24,
}) => {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "dark"];
  const isDark = (colorScheme ?? "dark") !== "light";

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;

  const animatedProgress = useSharedValue(0);

  useEffect(() => {
    animatedProgress.value = withSpring(Math.min(Math.max(progress, 0), 1), {
      damping: 18,
      stiffness: 90,
    });
  }, [progress, animatedProgress]);

  const animatedProps = useAnimatedProps(() => {
    const strokeDashoffset = circumference * (1 - animatedProgress.value);
    return {
      strokeDashoffset,
    };
  });

  // 24 discrete units: deterministic percentage mapping (0% -> 0, 25% -> 6, 50% -> 12, 75% -> 18, 100% -> 24)
  const count = pebbleCount || 24;
  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  const activeCount = Math.min(count, Math.floor(clampedProgress * count + 0.0001));

  // Inactive base dots remain small, subtle, and understated
  const inactiveRadius = Math.max(2, strokeWidth * 0.3);
  const scaleMultiplier = strokeWidth / 8;

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

      // 6 deterministic silhouettes, subtle orientation tilts (-10° to +10°), and micro-scales
      const shapeIdx = i % 6;
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
        {variant === "pebbles" ? (
          /* Quiet inactive circular marker beds */
          pebbleUnits.map((u) => (
            <Circle
              key={`bed-${u.index}`}
              cx={u.x}
              cy={u.y}
              r={inactiveRadius}
              fill={resolvedInactiveColor}
            />
          ))
        ) : (
          /* Classical Continuous Arc Progress Ring */
          <>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={trackColor || theme.cardLight}
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            <AnimatedCircle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={color || theme.primary}
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeDasharray={`${circumference} ${circumference}`}
              animatedProps={animatedProps}
              strokeLinecap="round"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </>
        )}
      </Svg>

      {/* Discrete Pebble Progress: Active Organic River Stones with Natural Poise */}
      {variant === "pebbles" &&
        pebbleUnits.map((u) => (
          <ActivePebble
            key={`pebble-${u.index}`}
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
