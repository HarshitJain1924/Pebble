import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { AppCard } from "@/shared/components/ui/AppCard";

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
      <View style={styles.headerRow}>
        <Feather name="bar-chart-2" size={11} color={colors.textMuted} />
        <Text style={[styles.statsTitle, { color: colors.textMuted }]}>
          {"TODAY'S STATS"}
        </Text>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statRow}>
          <View style={styles.statCell}>
            <View style={styles.labelRow}>
              <Feather name="check-circle" size={11} color={colors.primary} />
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                Completed
              </Text>
            </View>
            <Text style={[styles.statVal, { color: colors.text }]}>
              {completedToday} Sessions
            </Text>
          </View>
          <View style={styles.statCell}>
            <View style={styles.labelRow}>
              <Feather name="clock" size={11} color={colors.primary} />
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                Focus Time
              </Text>
            </View>
            <Text style={[styles.statVal, { color: colors.text }]}>
              {totalFocusTime} mins
            </Text>
          </View>
        </View>

        <View style={styles.statRow}>
          <View style={styles.statCell}>
            <View style={styles.labelRow}>
              <Feather name="trending-up" size={11} color={colors.primary} />
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                Avg Length
              </Text>
            </View>
            <Text style={[styles.statVal, { color: colors.text }]}>
              {averageSessionLength} mins
            </Text>
          </View>
          <View style={styles.statCell}>
            <View style={styles.labelRow}>
              <Feather name="award" size={11} color={colors.primary} />
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                Longest
              </Text>
            </View>
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
    opacity: 0.9,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statsTitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  statsGrid: {
    gap: 10,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  statCell: {
    flex: 1,
    gap: 3,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  statVal: {
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
});
