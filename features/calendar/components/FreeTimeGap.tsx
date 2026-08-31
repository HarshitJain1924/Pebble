import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
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

const MIN_GAP_MINUTES = 30;

export const FreeTimeGap: React.FC<FreeTimeGapProps> = React.memo(({
  gap,
  hourHeight = 80,
  colors,
  isLight,
  onPlan,
}) => {
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

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPlan(gapHour, gapMin);
      }}
      accessibilityLabel={`Plan in ${durationStr} available window at ${gapHour}:${gapMin < 10 ? "0" : ""}${gapMin}`}
      style={({ pressed }) => [
        styles.gapContainer,
        {
          top: top + 4,
          height: Math.max(34, height - 8),
          backgroundColor: isLight
            ? "rgba(241, 245, 249, 0.6)"
            : "rgba(255, 255, 255, 0.025)",
          borderColor: isLight
            ? "rgba(226, 232, 240, 0.8)"
            : "rgba(255, 255, 255, 0.06)",
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <View style={styles.contentRow}>
        {/* Available Duration with subtle indicator */}
        <View style={styles.durationWrapper}>
          <View style={[styles.gapDot, { backgroundColor: colors.textMuted }]} />
          <Text style={[styles.durationText, { color: colors.textMuted }]} numberOfLines={1}>
            {durationStr} available
          </Text>
        </View>

        {/* Action Button Pill */}
        <View
          style={[
            styles.planPill,
            {
              backgroundColor: isLight
                ? "#FFFFFF"
                : "rgba(255, 255, 255, 0.06)",
              borderColor: isLight
                ? colors.border
                : "rgba(255, 255, 255, 0.1)",
            },
          ]}
        >
          <Feather name="plus" size={11} color={colors.primary} />
          <Text style={[styles.planText, { color: colors.primary }]}>
            Plan
          </Text>
        </View>
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
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  durationWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  gapDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.7,
  },
  durationText: {
    fontSize: 12,
    fontWeight: "500",
  },
  planPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  planText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
