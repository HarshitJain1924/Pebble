import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
import { useStreakColors } from "@/shared/hooks/useCategoryColors";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { useReducedMotion } from "@/shared/hooks/useReducedMotion";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
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

  const shouldPlayFlameRef = useRef(shouldPlayFlame);
  shouldPlayFlameRef.current = shouldPlayFlame;

  // Clean up press animation timer on unmount
  useEffect(() => {
    return () => {
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current);
      }
    };
  }, []);

  // Imperative native animation bridge for Android Glide:
  // On Android, toggling the `autoplay` prop dynamically in React does not start
  // or resume the native GifDrawable on an already loaded view. Calling
  // `startAnimating()` on the ref starts the native Animatable/GifDrawable.
  useEffect(() => {
    if (shouldPlayFlame) {
      flameRef.current?.startAnimating?.().catch?.(() => {});
    } else {
      flameRef.current?.stopAnimating?.().catch?.(() => {});
    }
  }, [shouldPlayFlame]);

  const handleLoad = useCallback(() => {
    if (shouldPlayFlameRef.current) {
      flameRef.current?.startAnimating?.().catch?.(() => {});
    }
  }, []);

  const handlePress = useCallback(() => {
    if (stage > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setIsPressAnimating(true);
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current);
      }
      pressTimerRef.current = setTimeout(() => {
        setIsPressAnimating(false);
      }, 3000);
    }
    onPress?.();
  }, [stage, onPress]);

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
        <Image
          ref={flameRef}
          source={flameSource}
          style={styles.flame}
          contentFit="contain"
          autoplay={shouldPlayFlame}
          onLoad={handleLoad}
          testID="habit-streak-flame"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
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
