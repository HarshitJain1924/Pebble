import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { AppText as Text } from "@/shared/components/ui/AppText";

interface FreeTimeGapProps {
  gap: {
    startMinutes: number;
    durationMinutes: number;
  };
  hourHeight?: number;
  colors: any;
  isLight: boolean;
  onPlan: (hour: number, minute: number) => void;
}

const MIN_GAP_MINUTES = 30; // Only show planning affordance for meaningful gaps

export const FreeTimeGap: React.FC<FreeTimeGapProps> = React.memo(({
  gap,
  hourHeight = 80,
  colors,
  isLight,
  onPlan,
}) => {
  // Don't render the affordance for tiny gaps
  if (gap.durationMinutes < MIN_GAP_MINUTES) return null;

  const top = (gap.startMinutes / 60) * hourHeight;
  const height = (gap.durationMinutes / 60) * hourHeight;

  const hrs = Math.floor(gap.durationMinutes / 60);
  const mins = gap.durationMinutes % 60;
  const durationStr = hrs > 0
    ? `${hrs}h${mins > 0 ? ` ${mins}m` : ""}`
    : `${mins}m`;

  const gapHour = Math.floor(gap.startMinutes / 60);
  const gapMin = gap.startMinutes % 60;

  const mutedColor = colors.textMuted + "99"; // ~60% opacity
  const actionColor = colors.primary;

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPlan(gapHour, gapMin);
      }}
      accessibilityLabel={`Plan in ${durationStr} available window`}
      style={({ pressed }) => [
        styles.gapContainer,
        {
          top: top + 4,
          height: Math.max(28, height - 8),
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.contentRow}>
        {/* Duration label — muted, secondary */}
        <Text style={[styles.durationText, { color: mutedColor }]} numberOfLines={1}>
          {durationStr} free
        </Text>

        {/* Plan action link — clearly tappable but visually light */}
        <Text style={[styles.planLink, { color: actionColor }]} numberOfLines={1}>
          + Plan something
        </Text>
      </View>
    </Pressable>
  );
});

FreeTimeGap.displayName = "FreeTimeGap";

const styles = StyleSheet.create({
  gapContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  durationText: {
    fontSize: 11,
    fontWeight: "500",
  },
  planLink: {
    fontSize: 11,
    fontWeight: "600",
  },
});
