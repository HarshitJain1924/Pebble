import React from "react";
import { View, StyleSheet } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import { AppCard } from "@/components/AppCard";
import { Spacing } from "@/constants/spacing";
import { Typography } from "@/constants/typography";

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
    <AppCard style={styles.statsCard}>
      <Text style={[styles.statsTitle, { color: colors.text }]}>
        {"Today's Stats"}
      </Text>
      <View style={[styles.divider, { backgroundColor: colors.border || "rgba(255, 255, 255, 0.05)" }]} />

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
    padding: Spacing.lg,
    gap: 12,
  },
  statsTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: "700",
  },
  divider: {
    height: 1,
  },
  statsGrid: {
    gap: 12,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statCell: {
    flex: 1,
    gap: 4,
  },
  statLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: "600",
  },
  statVal: {
    fontSize: Typography.sizes.md,
    fontWeight: "800",
  },
});
