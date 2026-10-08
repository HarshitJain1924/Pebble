import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
import { useStreakColors } from "@/shared/hooks/useCategoryColors";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { useReducedMotion } from "@/shared/hooks/useReducedMotion";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import {
  getHabitStreakAccessibilityLabel,
  getHabitStreakStage,
  getHabitStreakUnitLabel,
} from "../utils/habitStreakStage";
import { resolveStreakFlameSource } from "../utils/streakFlameAssets";

export interface StreakFlameBadgeProps {
  /** Raw current streak in days, straight from the domain selector. */
  streak: number;
  /**
   * Opt in to playing the flame animation. Defaults to `false`.
   *
   * A GIF loops forever and `expo-image` has no "play once", so list rows must
   * stay still: a habit list would otherwise run one decoder per visible row.
   * Only a single, deliberately chosen surface (e.g. habit detail) should pass
   * `animated`. Reduced motion overrides this back to a still frame.
   */
  animated?: boolean;
  /** Optional custom press handler */
  onPress?: () => void;
}

/**
 * Trailing streak visual for habit rows.
 *
 * Direct editorial content: renders the flame icon and streak counter without
 * an artificial pill container, background box, or border. The flame is the sole
 * visual accent.
 *
 * Category colour/watermark communicates habit *identity*; this indicator is a
 * separate system communicating *consistency*, so it uses the canonical
 * `StreakColors` tokens and is never tinted by the habit's category.
 *
 * Motion: the flame artwork is animated by the Flaticon assets themselves.
 * On Android, `expo-image` requires `startAnimating()` / remounting to ensure Glide
 * actually starts the native GifDrawable when toggled.
 */
export const StreakFlameBadge: React.FC<StreakFlameBadgeProps> = ({
  streak,
  animated = false,
  onPress,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const streakColors = useStreakColors();
  const reduceMotion = useReducedMotion();

  const flameRef = useRef<Image>(null);
  const [isPressAnimating, setIsPressAnimating] = useState(false);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stage = getHabitStreakStage(streak);
  const flameSource = resolveStreakFlameSource(stage);
  const shouldPlayFlame = (animated || isPressAnimating) && !reduceMotion;
  const isInactive = stage === 0;

  // Inactive streaks stay muted so a flat list does not read as a wall of flame.
  const valueColor = isInactive ? colors.textMuted : streakColors.accent;

  const idleProgress = useSharedValue(0);
  const isIdleActive = stage > 0 && !shouldPlayFlame && !reduceMotion;

  // Clean up press animation timer on unmount
  useEffect(() => {
    return () => {
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current);
      }
    };
  }, []);

  // Subtle living flame idle animation (active streak > 0, not celebrating, reduced motion off).
  // Low-frequency UI thread animation without continuous GIF decodes or JS renders.
  useEffect(() => {
    if (isIdleActive) {
      idleProgress.value = 0;
      idleProgress.value = withRepeat(
        withTiming(1, { duration: 2400, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      cancelAnimation(idleProgress);
      idleProgress.value = 0;
    }

    return () => {
      cancelAnimation(idleProgress);
    };
  }, [isIdleActive, idleProgress]);

  const flameAnimatedStyle = useAnimatedStyle(() => {
    if (!isIdleActive) {
      return {
        transform: [
          { translateY: 0 },
          { scaleY: 1 },
          { scaleX: 1 },
          { rotate: "0deg" },
        ],
      };
    }

    // Natural flame motion curve: subtle asymmetric upward licks and gentle relaxing settle
    const translateY = interpolate(
      idleProgress.value,
      [0, 0.22, 0.45, 0.72, 1],
      [0, -0.75, -0.2, -0.6, 0]
    );

    const scaleY = interpolate(
      idleProgress.value,
      [0, 0.22, 0.45, 0.72, 1],
      [1, 1.035, 1.005, 1.025, 1]
    );

    const scaleX = interpolate(
      idleProgress.value,
      [0, 0.22, 0.45, 0.72, 1],
      [1, 0.982, 1.005, 0.988, 1]
    );

    const rotate = `${interpolate(
      idleProgress.value,
      [0, 0.22, 0.45, 0.72, 1],
      [0, -0.5, 0.35, -0.2, 0]
    )}deg`;

    return {
      transform: [
        { translateY },
        { scaleY },
        { scaleX },
        { rotate },
      ],
    };
  });

  // Motion: the flame artwork is animated by the Flaticon assets themselves.
  // In expo-image (especially on Android Glide and in Expo Go with New Architecture),
  // dynamically toggling the `autoplay` prop or relying solely on imperative `startAnimating()`
  // on an already loaded view does not reliably restart native decoding.
  // Providing a key conditioned on `shouldPlayFlame` and `stage` forces a clean remount
  // with `autoplay={true}` for playback and `autoplay={false}` for still display.
  // The imperative methods (startAnimating/stopAnimating) are retained for native environments.
  useEffect(() => {
    if (shouldPlayFlame) {
      flameRef.current?.startAnimating?.().catch?.(() => {});
    } else {
      flameRef.current?.stopAnimating?.().catch?.(() => {});
    }
  }, [shouldPlayFlame]);

  const handleLoad = useCallback(() => {
    if (shouldPlayFlame) {
      flameRef.current?.startAnimating?.().catch?.(() => {});
    }
  }, [shouldPlayFlame]);

  const handlePress = useCallback(() => {
    if (stage > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      if (!reduceMotion) {
        setIsPressAnimating(true);
        if (pressTimerRef.current) {
          clearTimeout(pressTimerRef.current);
        }
        pressTimerRef.current = setTimeout(() => {
          setIsPressAnimating(false);
        }, 3000);
      }
    }
    onPress?.();
  }, [stage, reduceMotion, onPress]);

  return (
    <Pressable
      testID="habit-streak-badge"
      accessible
      accessibilityRole={stage > 0 ? "button" : "text"}
      accessibilityLabel={getHabitStreakAccessibilityLabel(streak)}
      onPress={handlePress}
      disabled={stage === 0}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      style={styles.container}
    >
      {flameSource ? (
        <Animated.View
          testID="habit-streak-flame-container"
          style={[styles.flameContainer, flameAnimatedStyle]}
        >
          <Image
            ref={flameRef}
            key={shouldPlayFlame ? `flame-anim-${stage}` : `flame-static-${stage}`}
            source={flameSource}
            style={styles.flame}
            contentFit="contain"
            autoplay={shouldPlayFlame}
            onLoad={handleLoad}
            testID="habit-streak-flame"
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </Animated.View>
      ) : null}

      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: valueColor }]}>{streak}</Text>
        <Text style={[styles.unit, { color: valueColor }]}>
          {getHabitStreakUnitLabel(streak)}
        </Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  flameContainer: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  flame: {
    width: 18,
    height: 18,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2.5,
  },
  value: {
    fontSize: 13.5,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  unit: {
    fontSize: 10.5,
    fontWeight: "500",
  },
});
