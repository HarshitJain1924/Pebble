import React from "react";
import { View, StyleSheet } from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { AppCard } from "@/shared/components/ui/AppCard";
import { Spacing } from "@/shared/constants/spacing";
import { Typography } from "@/shared/constants/typography";

interface FocusStatsCardProps {
  completedToday: number;
  totalFocusTime: number;
  averageSessionLength: number;
  longestSession: number;
  colors: any;
}

export const FocusStatsCard: React.FC<FocusStatsCardProps> = ({
  completedToday,
  totalFocusTime,
  averageSessionLength,
  longestSession,
  colors,
}) => {
  return (
    <AppCard
      style={[
        styles.statsCard,
        {
          borderColor: colors.border || "rgba(255, 255, 255, 0.06)",
        },
      ]}
    >
      <Text style={[styles.statsTitle, { color: colors.textMuted }]}>
        {"TODAY'S STATS"}
      </Text>

      <View style={styles.statsGrid}>
        <View style={styles.statRow}>
          <View style={styles.statCell}>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>
              Completed
            </Text>
            <Text style={[styles.statVal, { color: colors.text }]}>
              {completedToday} Sessions
            </Text>
          </View>
          <View style={styles.statCell}>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>
              Focus Time
            </Text>
            <Text style={[styles.statVal, { color: colors.text }]}>
              {totalFocusTime} mins
            </Text>
          </View>
        </View>

        <View style={styles.statRow}>
          <View style={styles.statCell}>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>
              Avg Length
            </Text>
            <Text style={[styles.statVal, { color: colors.text }]}>
              {averageSessionLength} mins
            </Text>
          </View>
          <View style={styles.statCell}>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>
              Longest
            </Text>
            <Text style={[styles.statVal, { color: colors.text }]}>
              {longestSession} mins
            </Text>
          </View>
        </View>
      </View>
    </AppCard>
  );
};

const styles = StyleSheet.create({
  statsCard: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    opacity: 0.9,
  },
  statsTitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  statsGrid: {
    gap: 8,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  statCell: {
    flex: 1,
    gap: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  statVal: {
    fontSize: 13,
    fontWeight: "700",
  },
});
