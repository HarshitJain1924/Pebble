import React from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import { AppCard } from "@/components/AppCard";
import { AppText as Text } from "@/components/ui/AppText";
import { Feather } from "@expo/vector-icons";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export interface ProductivityDashboardProps {
  stats: {
    todosCompleted: number;
    habitsCompleted: number;
    focusSessions: number;
    focusTime: number;
    completionRate: number;
    avgScore: number;
  };
  colors: any;
}

export function ProductivityDashboard({
  stats,
  colors,
}: ProductivityDashboardProps) {
  return (
    <View style={styles.statsGrid}>
      <AppCard style={styles.statCard}>
        <View style={[styles.iconBox, { backgroundColor: `${colors.success}10` }]}>
          <Feather name="check-square" size={16} color={colors.success} />
        </View>
        <View>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {stats.todosCompleted}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>
            Tasks Cleared
          </Text>
        </View>
      </AppCard>

      <AppCard style={styles.statCard}>
        <View style={[styles.iconBox, { backgroundColor: `${colors.primary}10` }]}>
          <Feather name="activity" size={16} color={colors.primary} />
        </View>
        <View>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {stats.habitsCompleted}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>
            Habits Completed
          </Text>
        </View>
      </AppCard>

      <AppCard style={styles.statCard}>
        <View style={[styles.iconBox, { backgroundColor: "#A855F710" }]}>
          <Feather name="clock" size={16} color="#A855F7" />
        </View>
        <View>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {stats.focusSessions}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>
            Focus Sessions
          </Text>
        </View>
      </AppCard>

      <AppCard style={styles.statCard}>
        <View style={[styles.iconBox, { backgroundColor: "#F9731610" }]}>
          <Feather name="zap" size={16} color="#F97316" />
        </View>
        <View>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {stats.focusTime} m
          </Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>
            Focus Time
          </Text>
        </View>
      </AppCard>

      <AppCard style={styles.statCard}>
        <View style={[styles.iconBox, { backgroundColor: "#06B6D410" }]}>
          <Feather name="percent" size={16} color="#06B6D4" />
        </View>
        <View>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {stats.completionRate}%
          </Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>
            Completion Rate
          </Text>
        </View>
      </AppCard>

      <AppCard style={styles.statCard}>
        <View style={[styles.iconBox, { backgroundColor: `${colors.warning}10` }]}>
          <Feather name="award" size={16} color={colors.warning} />
        </View>
        <View>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {stats.avgScore}%
          </Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>
            Productivity Score
          </Text>
        </View>
      </AppCard>
    </View>
  );
}

const styles = StyleSheet.create({
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    width: (SCREEN_WIDTH - 42) / 2, // 2 column layout
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 10,
  },
});
