import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
import { useStreakColors } from "@/shared/hooks/useCategoryColors";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { useReducedMotion } from "@/shared/hooks/useReducedMotion";
import { Image } from "expo-image";
import React from "react";
import { StyleSheet, View } from "react-native";
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
}

/**
 * Trailing streak visual for habit rows.
 *
 * Category colour/watermark communicates habit *identity*; this badge is a
 * separate system communicating *consistency*, so it uses the canonical
 * `StreakColors` tokens and is never tinted by the habit's category.
 *
 * The badge is informational — it is deliberately not pressable so the
 * neighbouring overflow button keeps an unobstructed hit target. It also adds no
 * opacity of its own: `EntityItem` already dims the whole row for completed
 * habits, and dimming again here would compound to ~0.36.
 *
 * Motion: the flame artwork is animated by the Flaticon assets themselves, so
 * this component adds no animation of its own — but a GIF cannot be played once,
 * so `autoplay` is off unless a caller explicitly passes `animated`. That keeps a
 * habit list from running one looping decoder per row. When the OS requests
 * reduced motion the flame still renders at its first frame, it just never
 * plays.
 */
export const StreakFlameBadge: React.FC<StreakFlameBadgeProps> = ({
  streak,
  animated = false,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const streakColors = useStreakColors();
  const reduceMotion = useReducedMotion();

  const stage = getHabitStreakStage(streak);
  const flameSource = resolveStreakFlameSource(stage);
  const shouldPlayFlame = animated && !reduceMotion;
  const isInactive = stage === 0;

  // Inactive streaks stay muted so a flat list does not read as a wall of flame.
  const valueColor = isInactive ? colors.textMuted : streakColors.accent;

  return (
    <View
      testID="habit-streak-badge"
      accessible
      accessibilityRole="text"
      accessibilityLabel={getHabitStreakAccessibilityLabel(streak)}
      style={styles.container}
    >
      {flameSource ? (
        <Image
          source={flameSource}
          style={styles.flame}
          contentFit="contain"
          autoplay={shouldPlayFlame}
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    minWidth: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  flame: {
    width: 20,
    height: 20,
    marginBottom: 2,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
  },
  value: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  unit: {
    fontSize: 10,
    fontWeight: "600",
  },
});
