import React from "react";
import { View, StyleSheet } from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";

interface DayContextSummaryProps {
  scheduledCount: number;
  plannedMinutes: number;
  freeMinutes: number;
  colors: any;
  isLight: boolean;
}

function formatDuration(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0) {
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }
  return `${mins}m`;
}

export const DayContextSummary: React.FC<DayContextSummaryProps> = React.memo(({
  scheduledCount,
  plannedMinutes,
  freeMinutes,
  colors,
  isLight,
}) => {
  const plannedText = formatDuration(plannedMinutes);
  const freeText = formatDuration(freeMinutes);

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.statPill,
          {
            backgroundColor: isLight ? "#FFFFFF" : colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.statValue, { color: colors.text }]}>
          {scheduledCount}
        </Text>
        <Text style={[styles.statLabel, { color: colors.textMuted }]}>
          Scheduled
        </Text>
      </View>

      <View
        style={[
          styles.statPill,
          {
            backgroundColor: isLight ? "#FFFFFF" : colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.statValue, { color: colors.text }]}>
          {plannedMinutes > 0 ? plannedText : "0m"}
        </Text>
        <Text style={[styles.statLabel, { color: colors.textMuted }]}>
          Planned
        </Text>
      </View>

      <View
        style={[
          styles.statPill,
          {
            backgroundColor: isLight ? "#FFFFFF" : colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <Text
          style={[
            styles.statValue,
            { color: freeMinutes > 0 ? (isLight ? "#059669" : "#10B981") : colors.text },
          ]}
        >
          {freeMinutes > 0 ? freeText : "Free"}
        </Text>
        <Text style={[styles.statLabel, { color: colors.textMuted }]}>
          Free
        </Text>
      </View>
    </View>
  );
});

DayContextSummary.displayName = "DayContextSummary";

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    marginBottom: 6,
  },
  statPill: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  statValue: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
});
