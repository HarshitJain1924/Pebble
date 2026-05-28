import React, { useEffect } from "react";
import { View } from "react-native";
import Svg, {
  Path,
  Circle,
  Defs,
  LinearGradient,
  Stop,
  G,
  Rect,
} from "react-native-svg";
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
// DashboardEmptyGraphic
// -------------------------------------------------------------
export function DashboardEmptyGraphic() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.95);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 6000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.97, { duration: 6000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.85, { duration: 6000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
      opacity: opacity.value,
    };
  });

  return (
    <Animated.View style={animatedStyle}>
      <Svg width="120" height="120" viewBox="0 0 120 120" fill="none">
        <Defs>
          <LinearGradient id="dashGrad" x1="0" y1="0" x2="120" y2="120">
            <Stop offset="0%" stopColor={colors.primary} stopOpacity={0.2} />
            <Stop offset="100%" stopColor={colors.success} stopOpacity={0.05} />
          </LinearGradient>
          <LinearGradient id="checkGrad" x1="0" y1="0" x2="40" y2="40">
            <Stop offset="0%" stopColor={colors.success} stopOpacity={1} />
            <Stop offset="100%" stopColor={colors.primary} stopOpacity={0.7} />
          </LinearGradient>
        </Defs>

        {/* Outer organic floating circle */}
        <Circle cx="60" cy="60" r="48" fill="url(#dashGrad)" />
        
        {/* Subtle outer orbit ring */}
        <Circle
          cx="60"
          cy="60"
          r="38"
          stroke={colors.primary}
          strokeWidth="1.5"
          strokeOpacity="0.15"
          strokeDasharray="4 8"
        />

        {/* Glowing center orb */}
        <Circle
          cx="60"
          cy="60"
          r="14"
          fill={colors.success}
          fillOpacity="0.12"
        />

        {/* Floating elegant checkmark badge */}
        <G transform="translate(42, 42)">
          <Circle
            cx="18"
            cy="18"
            r="16"
            fill={colors.card}
            stroke={colors.border}
            strokeWidth="1.5"
          />
          <Path
            d="M10 18L15 23L26 12"
            stroke="url(#checkGrad)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </G>
      </Svg>
    </Animated.View>
  );
}

// -------------------------------------------------------------
// TasksEmptyGraphic
// -------------------------------------------------------------
export function TasksEmptyGraphic() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  const scale = useSharedValue(1);
  const driftY = useSharedValue(0);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 5500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.97, { duration: 5500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    driftY.value = withRepeat(
      withSequence(
        withTiming(-4, { duration: 7000, easing: Easing.inOut(Easing.ease) }),
        withTiming(4, { duration: 7000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: scale.value },
        { translateY: driftY.value },
      ],
    };
  });

  return (
    <Animated.View style={animatedStyle}>
      <Svg width="130" height="130" viewBox="0 0 130 130" fill="none">
        <Defs>
          <LinearGradient id="cardGrad1" x1="0" y1="0" x2="80" y2="80">
            <Stop offset="0%" stopColor={colors.primary} stopOpacity={0.15} />
            <Stop offset="100%" stopColor={colors.primary} stopOpacity={0.02} />
          </LinearGradient>
          <LinearGradient id="glowLine" x1="0" y1="0" x2="60" y2="0">
            <Stop offset="0%" stopColor={colors.primary} stopOpacity={0.6} />
            <Stop offset="100%" stopColor={colors.primary} stopOpacity={0.1} />
          </LinearGradient>
        </Defs>

        {/* Stacked background cards */}
        <Rect
          x="35"
          y="25"
          width="65"
          height="75"
          rx="12"
          fill={colors.card}
          stroke={colors.border}
          strokeWidth="1.5"
          transform="rotate(-5, 67, 62)"
          opacity="0.5"
        />

        {/* Primary focused card */}
        <Rect
          x="30"
          y="30"
          width="70"
          height="75"
          rx="16"
          fill={colors.card}
          stroke={colors.primary}
          strokeWidth="1.5"
          strokeOpacity="0.25"
        />

        {/* Floating abstract check rows */}
        <G transform="translate(42, 42)" opacity="0.85">
          {/* Row 1 */}
          <Circle cx="8" cy="12" r="5" fill={colors.border} />
          <Path d="M18 12H58" stroke="url(#glowLine)" strokeWidth="3" strokeLinecap="round" />

          {/* Row 2 (Checked) */}
          <G transform="translate(0, 22)">
            <Circle cx="8" cy="12" r="6" fill={colors.primary} fillOpacity="0.2" />
            <Path
              d="M5 12L7.5 14.5L12 9.5"
              stroke={colors.primary}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path d="M18 12H54" stroke={colors.textMuted} strokeWidth="2.5" strokeLinecap="round" opacity="0.4" />
          </G>

          {/* Row 3 */}
          <G transform="translate(0, 44)">
            <Circle cx="8" cy="12" r="5" fill={colors.border} />
            <Path d="M18 12H44" stroke={colors.border} strokeWidth="3" strokeLinecap="round" />
          </G>
        </G>
      </Svg>
    </Animated.View>
  );
}

// -------------------------------------------------------------
// HabitsEmptyGraphic
// -------------------------------------------------------------
export function HabitsEmptyGraphic() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  const scale = useSharedValue(1);
  const rotateVal = useSharedValue(0);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 6500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.96, { duration: 6500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    rotateVal.value = withRepeat(
      withSequence(
        withTiming(3, { duration: 12000, easing: Easing.inOut(Easing.ease) }),
        withTiming(-3, { duration: 12000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: scale.value },
        { rotate: `${rotateVal.value}deg` },
      ],
    };
  });

  return (
    <Animated.View style={animatedStyle}>
      <Svg width="140" height="140" viewBox="0 0 140 140" fill="none">
        <Defs>
          <LinearGradient id="ringGrad" x1="0" y1="0" x2="0" y2="140">
            <Stop offset="0%" stopColor={colors.primary} stopOpacity={0.18} />
            <Stop offset="100%" stopColor={colors.warning} stopOpacity={0.03} />
          </LinearGradient>
          <LinearGradient id="flameGrad" x1="0" y1="0" x2="40" y2="40">
            <Stop offset="0%" stopColor={colors.warning} stopOpacity={1} />
            <Stop offset="100%" stopColor={colors.primary} stopOpacity={0.7} />
          </LinearGradient>
        </Defs>

        {/* Streak concentric rings */}
        <Circle cx="70" cy="70" r="54" fill="url(#ringGrad)" />
        <Circle
          cx="70"
          cy="70"
          r="44"
          stroke={colors.border}
          strokeWidth="1.5"
          strokeOpacity="0.4"
        />
        <Circle
          cx="70"
          cy="70"
          r="32"
          stroke={colors.warning}
          strokeWidth="2.5"
          strokeOpacity="0.12"
        />

        {/* Floating glowing nodes */}
        <Circle cx="70" cy="16" r="4" fill={colors.primary} />
        <Circle cx="102" cy="38" r="3" fill={colors.success} opacity="0.6" />
        <Circle cx="38" cy="102" r="4" fill={colors.warning} />

        {/* Center flame/sprout silhouette */}
        <G transform="translate(50, 48)">
          <Path
            d="M20 5C20 5 36 21 28 32C20 43 14 38 12 36C6 30 10 18 10 18C10 18 12 28 16 30C20 32 23 28 22 23C21 18 20 5 20 5Z"
            fill="url(#flameGrad)"
            stroke={colors.warning}
            strokeWidth="1"
            strokeOpacity="0.3"
          />
          {/* Soft flame shadow overlay */}
          <Circle cx="20" cy="30" r="8" fill={colors.warning} fillOpacity="0.1" />
        </G>
      </Svg>
    </Animated.View>
  );
}

// -------------------------------------------------------------
// AnalyticsEmptyGraphic
// -------------------------------------------------------------
export function AnalyticsEmptyGraphic() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  const scale = useSharedValue(1);
  const breathOpacity = useSharedValue(0.9);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 5000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.98, { duration: 5000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    breathOpacity.value = withRepeat(
      withSequence(
        withTiming(1.0, { duration: 5000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.75, { duration: 5000, easing: Easing.inOut(Easing.ease) })
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

  return (
    <Animated.View style={animatedStyle}>
      <Svg width="130" height="130" viewBox="0 0 130 130" fill="none">
        <Defs>
          <LinearGradient id="chartGrad" x1="0" y1="130" x2="130" y2="0">
            <Stop offset="0%" stopColor={colors.primary} stopOpacity={0.16} />
            <Stop offset="100%" stopColor={colors.success} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>

        {/* Decorative grid */}
        <Rect x="20" y="20" width="90" height="90" rx="16" fill="url(#chartGrad)" />
        
        {/* Horizontal grid lines */}
        <Path d="M20 42.5H110" stroke={colors.border} strokeWidth="1" strokeOpacity="0.3" />
        <Path d="M20 65H110" stroke={colors.border} strokeWidth="1" strokeOpacity="0.3" />
        <Path d="M20 87.5H110" stroke={colors.border} strokeWidth="1" strokeOpacity="0.3" />
        
        {/* Vertical grid lines */}
        <Path d="M42.5 20V110" stroke={colors.border} strokeWidth="1" strokeOpacity="0.3" />
        <Path d="M65 20V110" stroke={colors.border} strokeWidth="1" strokeOpacity="0.3" />
        <Path d="M87.5 20V110" stroke={colors.border} strokeWidth="1" strokeOpacity="0.3" />

        {/* Curved trend line */}
        <Path
          d="M26 94C38 88 50 44 65 52C80 60 92 28 104 36"
          stroke={colors.primary}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeOpacity="0.85"
        />

        {/* Nodes on path */}
        <Circle cx="65" cy="52" r="5" fill={colors.primary} />
        <Circle cx="65" cy="52" r="9" stroke={colors.primary} strokeWidth="1.5" strokeOpacity="0.4" />
        
        <Circle cx="104" cy="36" r="4" fill={colors.success} />
        <Circle cx="104" cy="36" r="7" stroke={colors.success} strokeWidth="1.5" strokeOpacity="0.4" />
      </Svg>
    </Animated.View>
  );
}
