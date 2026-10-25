import React from "react";
import { StyleSheet, View } from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";

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

/**
 * Quiet "At a glance" summary.
 *
 * Previously a six-tile equal-weight KPI wall. It now renders three readable
 * rows — one honest number per row, no bordered tiles. Metric names reflect
 * what the underlying services actually measure (`avgScore` is the 90-day
 * average *productivity* score, not a focus score).
 */
export function ProductivityDashboard({
  stats,
  colors,
}: ProductivityDashboardProps) {
  const rows = [
    { label: "Tasks completed", value: String(stats.todosCompleted) },
    { label: "Focus time", value: `${stats.focusTime} min` },
    { label: "Productivity score", value: `${stats.avgScore}%` },
  ];

  return (
    <View
      style={[styles.summary, { borderColor: colors.border }]}
      accessibilityRole="summary"
    >
      {rows.map((row, index) => (
        <View
          key={row.label}
          style={[
            styles.row,
            index > 0 && {
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.label, { color: colors.textMuted }]}>
            {row.label}
          </Text>
          <Text style={[styles.value, { color: colors.text }]}>
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    paddingVertical: 12,
  },
  label: { fontSize: 14 },
  value: { fontSize: 16, fontWeight: "700" },
});
