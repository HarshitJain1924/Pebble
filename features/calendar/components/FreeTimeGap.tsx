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

export const FreeTimeGap: React.FC<FreeTimeGapProps> = React.memo(({
  gap,
  hourHeight = 80,
  colors,
  isLight,
  onPlan,
}) => {
  const top = (gap.startMinutes / 60) * hourHeight;
  const height = (gap.durationMinutes / 60) * hourHeight;
  const hrs = Math.floor(gap.durationMinutes / 60);
  const mins = gap.durationMinutes % 60;
  const durationStr =
    hrs > 0
      ? `${hrs}h ${mins > 0 ? `${mins}m` : ""}`
      : `${mins}m`;

  const gapHour = Math.floor(gap.startMinutes / 60);
  const gapMin = gap.startMinutes % 60;

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPlan(gapHour, gapMin);
      }}
      accessibilityLabel={`Plan task in ${durationStr} available free time at ${gapHour}:${gapMin < 10 ? "0" : ""}${gapMin}`}
      style={[
        styles.gapContainer,
        {
          top: top + 2,
          height: Math.max(34, height - 4),
          borderColor: isLight ? "#E2E8F0" : "rgba(255, 255, 255, 0.08)",
          backgroundColor: isLight ? "#F8FAFC" : "rgba(255, 255, 255, 0.02)",
        },
      ]}
    >
      {/* Available duration label */}
      <View style={styles.durationRow}>
        <Feather
          name="clock"
          size={11}
          color={colors.textMuted}
        />
        <Text
          style={[styles.durationText, { color: colors.textMuted }]}
          numberOfLines={1}
        >
          {durationStr} available
        </Text>
      </View>

      {/* Action Affordance Pill */}
      <View
        style={[
          styles.actionPill,
          {
            backgroundColor: isLight ? "#FFFFFF" : "rgba(255, 255, 255, 0.06)",
            borderColor: isLight ? "#E2E8F0" : "rgba(255, 255, 255, 0.12)",
            shadowOpacity: isLight ? 0.04 : 0,
          },
        ]}
      >
        <Feather
          name="plus"
          size={11}
          color={colors.primary}
        />
        <Text
          style={[styles.actionText, { color: colors.primary }]}
        >
          Plan something
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
    right: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  durationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  durationText: {
    fontSize: 11,
    fontWeight: "600",
  },
  actionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  actionText: {
    fontSize: 11,
    fontWeight: "800",
  },
});
