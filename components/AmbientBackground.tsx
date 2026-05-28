import React, { useEffect } from "react";
import { StyleSheet, View, Platform } from "react-native";
import Svg, { Defs, RadialGradient, Stop, Rect } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

// -------------------------------------------------------------
// GradientOrb Component
// -------------------------------------------------------------
type GradientOrbProps = {
  color: string;
  size: number;
  initialX: number; // Percentages or values relative to screen width/height
  initialY: number;
  rangeX: number;
  rangeY: number;
  durationX?: number;
  durationY?: number;
  opacity?: number;
  pulseSpeed?: number;
  pulseRange?: number;
};

export function GradientOrb({
  color,
  size,
  initialX,
  initialY,
  rangeX,
  rangeY,
  durationX = 25000,
  durationY = 32000,
  opacity = 0.08,
  pulseSpeed = 8000,
  pulseRange = 0.25,
}: GradientOrbProps) {
  const transX = useSharedValue(0);
  const transY = useSharedValue(0);
  const scale = useSharedValue(1);
  const pulseOpacity = useSharedValue(opacity);

  useEffect(() => {
    // Drifts horizontally
    transX.value = withRepeat(
      withSequence(
        withTiming(rangeX, { duration: durationX, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: durationX, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    // Drifts vertically
    transY.value = withRepeat(
      withSequence(
        withTiming(rangeY, { duration: durationY, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: durationY, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    // Breathing scale animation
    scale.value = withRepeat(
      withSequence(
        withTiming(1 + pulseRange, { duration: pulseSpeed, easing: Easing.inOut(Easing.ease) }),
        withTiming(1 - pulseRange * 0.5, { duration: pulseSpeed, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    // Subtle fading opacity breath
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(opacity * 1.35, { duration: pulseSpeed + 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(opacity * 0.65, { duration: pulseSpeed + 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: transX.value },
        { translateY: transY.value },
        { scale: scale.value },
      ],
      opacity: pulseOpacity.value,
    };
  });

  const uniqueId = `grad_${color.replace(/[^a-zA-Z0-9]/g, "")}_${size}`;

  return (
    <Animated.View
      style={[
        styles.orbContainer,
        {
          width: size,
          height: size,
          left: initialX,
          top: initialY,
        },
        animatedStyle,
      ]}
      pointerEvents="none"
    >
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id={uniqueId} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={1} />
            <Stop offset="50%" stopColor={color} stopOpacity={0.4} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${uniqueId})`} />
      </Svg>
    </Animated.View>
  );
}

// -------------------------------------------------------------
// FloatingGlow Component (Localized, breathes gently behind widgets)
// -------------------------------------------------------------
type FloatingGlowProps = {
  color: string;
  size?: number;
  opacity?: number;
  pulseSpeed?: number;
  pulseRange?: number;
  style?: any;
};

export function FloatingGlow({
  color,
  size = 180,
  opacity = 0.12,
  pulseSpeed = 6000,
  pulseRange = 0.18,
  style,
}: FloatingGlowProps) {
  const scale = useSharedValue(1);
  const breathOpacity = useSharedValue(opacity);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1 + pulseRange, { duration: pulseSpeed, easing: Easing.inOut(Easing.ease) }),
        withTiming(1 - pulseRange * 0.4, { duration: pulseSpeed, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    breathOpacity.value = withRepeat(
      withSequence(
        withTiming(opacity * 1.3, { duration: pulseSpeed - 500, easing: Easing.inOut(Easing.ease) }),
        withTiming(opacity * 0.7, { duration: pulseSpeed - 500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
      opacity: breathOpacity.value,
    };
  });

  const uniqueId = `glow_${color.replace(/[^a-zA-Z0-9]/g, "")}_${size}`;

  return (
    <Animated.View
      style={[
        styles.glowContainer,
        {
          width: size,
          height: size,
        },
        style,
        animatedStyle,
      ]}
      pointerEvents="none"
    >
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id={uniqueId} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={1} />
            <Stop offset="60%" stopColor={color} stopOpacity={0.3} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${uniqueId})`} />
      </Svg>
    </Animated.View>
  );
}

// -------------------------------------------------------------
// AnimatedMeshLayer Component (Luxurious dynamic backdrop mesh)
// -------------------------------------------------------------
export function AnimatedMeshLayer() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isLight = colorScheme === "light";

  // Dynamic light-safe pastel colors to prevent muddy smudges in light mode
  const orbColors = isLight ? {
    indigo: "#B0BAFF", // Beautiful rich pastel indigo
    purple: "#E2C4FF", // Beautiful rich pastel purple
    cyan: "#AFF5F9",   // Beautiful rich pastel cyan
  } : {
    indigo: colors.primary,
    purple: "#8B5CF6",
    cyan: "#06B6D4",
  };

  const opacities = isLight ? {
    indigo: 0.16,      // Soft, whispery glow for a perfectly balanced pastel mesh
    purple: 0.12,
    cyan: 0.10,
  } : {
    indigo: 0.09,
    purple: 0.07,
    cyan: 0.05,
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Primary Top-Left Indigo Glow (Drifts slowly to center-left) */}
      <GradientOrb
        color={orbColors.indigo}
        size={350}
        initialX={-80}
        initialY={-20}
        rangeX={110}
        rangeY={130}
        opacity={opacities.indigo}
        durationX={28000}
        durationY={36000}
      />

      {/* Middle-Right Purple Glow (Drifts slowly to center-right) */}
      <GradientOrb
        color={orbColors.purple}
        size={420}
        initialX={150}
        initialY={180}
        rangeX={-120}
        rangeY={160}
        opacity={opacities.purple}
        durationX={32000}
        durationY={42000}
        pulseSpeed={10000}
      />

      {/* Bottom-Left Cyan Glow (Drifts organicly to bottom-center) */}
      <GradientOrb
        color={orbColors.cyan}
        size={320}
        initialX={-40}
        initialY={450}
        rangeX={130}
        rangeY={-100}
        opacity={opacities.cyan}
        durationX={24000}
        durationY={30000}
        pulseSpeed={7000}
      />
    </View>
  );
}

// -------------------------------------------------------------
// AmbientBackground Component (Screen canvas wrapper)
// -------------------------------------------------------------
type AmbientBackgroundProps = {
  children: React.ReactNode;
  style?: any;
};

export function AmbientBackground({ children, style }: AmbientBackgroundProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  return (
    <View style={[styles.canvas, { backgroundColor: colors.background }, style]}>
      {/* Layer 1: Raw Obsidian Solid Base */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />

      {/* Layer 2: Hardware-Accelerated Dynamic Blended Mesh */}
      <AnimatedMeshLayer />

      {/* Layer 3: Render Screen Children above background */}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
  },
  orbContainer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  glowContainer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    zIndex: -1, // Positions perfectly underneath widgets
  },
});
