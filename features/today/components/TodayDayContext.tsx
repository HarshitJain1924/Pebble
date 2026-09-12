import React from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { Radius } from "@/shared/constants/radii";
import type { ThemeColors } from "@/shared/constants/theme";
import { PRIORITY_COLORS } from "@/features/today/components/NowFocusCard";
import {
  formatTodayDayDuration,
  formatTodayDayGapLabel,
  type TodayDayContextEntry,
  type TodayDayContextModel,
} from "@/features/today/utils/todayDayContext";

interface TodayDayContextProps {
  context: TodayDayContextModel;
  workspaceNames?: Record<string, string>;
  colors: ThemeColors;
  onViewFullDay?: () => void;
}

function formatTypeLabel(type: TodayDayContextEntry["type"]): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function getStateLabel(entry: TodayDayContextEntry): string | null {
  if (entry.isNow && entry.status === "current") return "NOW";
  if (entry.isNow && entry.status === "upcoming") return "UP NEXT";
  if (entry.status === "current") return "CURRENT";
  return null;
}

function getPriorityColor(priority: TodayDayContextEntry["priority"]): string {
  if (priority === "high" || priority === "medium" || priority === "low") {
    return PRIORITY_COLORS[priority];
  }
  return "transparent";
}

export const TodayDayContext: React.FC<TodayDayContextProps> = ({
  context,
  workspaceNames = {},
  colors,
  onViewFullDay,
}) => {
  return (
    <View style={styles.container} testID="today-day-context">
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text }]}>Your Day</Text>
        {onViewFullDay ? (
          <PressableScale
            onPress={onViewFullDay}
            haptic
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="View full day in Calendar"
            style={styles.fullDayButton}
            contentStyle={styles.fullDayButtonContent}
          >
            <Text style={[styles.fullDayText, { color: colors.primary }]}>View full day</Text>
            <Feather name="chevron-right" size={14} color={colors.primary} />
          </PressableScale>
        ) : null}
      </View>

      {context.rows.length > 0 ? (
        <View style={styles.flow}>
          {context.rows.map((row, index) => {
            const isLast = index === context.rows.length - 1;

            if (row.kind === "gap") {
              return (
                <View key={row.id} style={styles.row} testID="today-day-gap-row">
                  <View style={styles.timeColumn}>
                    <Text style={[styles.timeText, { color: colors.textMuted }]}>
                      {formatTodayDayGapLabel(row)}
                    </Text>
                  </View>
                  <View style={styles.railColumn}>
                    <View style={[styles.gapMarker, { borderColor: colors.border }]} />
                    {!isLast ? <View style={[styles.railLine, { backgroundColor: colors.border }]} /> : null}
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={[styles.gapTitle, { color: colors.textMuted }]}>Free time</Text>
                    <Text style={[styles.metaText, { color: colors.textMuted }]}>
                      {formatTodayDayDuration(row.durationMinutes)} open
                    </Text>
                  </View>
                </View>
              );
            }

            const stateLabel = getStateLabel(row);
            const workspaceName = workspaceNames[row.workspaceId];
            const priorityColor = getPriorityColor(row.priority);
            const contextParts = [
              formatTypeLabel(row.type),
              workspaceName,
              row.checklistProgress
                ? `${row.checklistProgress.completedCount}/${row.checklistProgress.totalCount}`
                : undefined,
            ].filter(Boolean);

            return (
              <View
                key={`${row.type}-${row.id}`}
                style={[
                  styles.row,
                  row.status === "current" && {
                    backgroundColor: `${colors.primary}12`,
                    borderRadius: Radius.md,
                  },
                ]}
                testID={`today-day-entry-${row.type}`}
              >
                <View style={styles.timeColumn}>
                  <Text style={[styles.timeText, { color: row.status === "current" ? colors.primary : colors.textMuted }]}>
                    {row.timeLabel}
                  </Text>
                </View>
                <View style={styles.railColumn}>
                  <View
                    style={[
                      styles.entryMarker,
                      {
                        backgroundColor: row.status === "current" ? colors.primary : colors.border,
                        borderColor: row.status === "upcoming" ? colors.primary : "transparent",
                      },
                    ]}
                  />
                  {!isLast ? <View style={[styles.railLine, { backgroundColor: colors.border }]} /> : null}
                </View>
                <View style={styles.rowContent}>
                  <View style={styles.titleRow}>
                    <View style={[styles.priorityStripe, { backgroundColor: priorityColor }]} />
                    <Text
                      style={[styles.entryTitle, { color: row.completed ? colors.textMuted : colors.text }]}
                      numberOfLines={2}
                    >
                      {row.title}
                    </Text>
                    {stateLabel ? (
                      <Text style={[styles.stateText, { color: colors.primary }]}>{stateLabel}</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.metaText, { color: colors.textMuted }]} numberOfLines={1}>
                    {formatTodayDayDuration(row.durationMinutes)} · {contextParts.join(" · ")}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={[styles.emptyState, { borderTopColor: colors.border }]} testID="today-day-empty">
          <Feather name="sun" size={16} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>No more scheduled items today. You have some room to breathe.</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  fullDayButton: {
    minHeight: 44,
  },
  fullDayButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  fullDayText: {
    fontSize: 12,
    fontWeight: "700",
  },
  flow: {
    marginTop: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 56,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  timeColumn: {
    width: 76,
    paddingTop: 5,
  },
  timeText: {
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 15,
  },
  railColumn: {
    width: 20,
    alignItems: "center",
    position: "relative",
  },
  entryMarker: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    marginTop: 6,
    zIndex: 1,
  },
  gapMarker: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: "dashed",
    marginTop: 7,
    zIndex: 1,
  },
  railLine: {
    position: "absolute",
    top: 16,
    bottom: -6,
    width: 1,
  },
  rowContent: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 8,
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  priorityStripe: {
    width: 3,
    height: 22,
    borderRadius: 2,
    marginRight: 8,
  },
  entryTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19,
  },
  stateText: {
    marginLeft: 8,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  gapTitle: {
    fontSize: 14,
    fontWeight: "500",
  },
  metaText: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
  },
  emptyState: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 52,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  emptyText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
});
