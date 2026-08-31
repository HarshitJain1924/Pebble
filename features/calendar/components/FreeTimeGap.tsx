import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { getGapKey, TimelineGap } from "@/features/calendar/utils/timelineCollapsibleLayout";

interface FreeTimeGapProps {
  gap: TimelineGap;
  top?: number;
  height?: number;
  hourHeight?: number;
  isCollapsible?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: (gapKey: string) => void;
  isViewingToday?: boolean;
  currentTime?: { hours: number; minutes: number };
  colors: any;
  isLight: boolean;
  onPlan: (
    hour: number,
    minute: number,
    gap?: { startMinutes: number; durationMinutes: number },
  ) => void;
}

const MIN_GAP_MINUTES = 30;

function formatMinutesToTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h >= 12 ? "PM" : "AM";
  const mStr = m < 10 ? `0${m}` : `${m}`;
  return `${displayH}:${mStr} ${ampm}`;
}

function formatDuration(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0) {
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }
  return `${mins}m`;
}

export const FreeTimeGap: React.FC<FreeTimeGapProps> = React.memo(({
  gap,
  top: propTop,
  height: propHeight,
  hourHeight = 80,
  isCollapsible = false,
  isCollapsed = false,
  onToggleCollapse,
  isViewingToday = false,
  currentTime,
  colors,
  isLight,
  onPlan,
}) => {
  if (gap.durationMinutes < MIN_GAP_MINUTES) return null;

  const gapKey = getGapKey(gap);
  const calculatedTop = propTop !== undefined ? propTop : (gap.startMinutes / 60) * hourHeight;
  const calculatedHeight = propHeight !== undefined ? propHeight : (gap.durationMinutes / 60) * hourHeight;

  const durationStr = formatDuration(gap.durationMinutes);
  const startStr = formatMinutesToTime(gap.startMinutes);
  const endStr = formatMinutesToTime(gap.startMinutes + gap.durationMinutes);

  const gapHour = Math.floor(gap.startMinutes / 60);
  const gapMin = gap.startMinutes % 60;

  // Check if current time falls inside this gap
  const currentTotalMinutes = currentTime ? currentTime.hours * 60 + currentTime.minutes : -1;
  const isNowInsideGap =
    isViewingToday &&
    currentTotalMinutes >= gap.startMinutes &&
    currentTotalMinutes <= gap.startMinutes + gap.durationMinutes;

  if (isCollapsed) {
    return (
      <View
        style={[
          styles.collapsedContainer,
          {
            top: calculatedTop + 2,
            height: Math.max(46, calculatedHeight - 4),
            backgroundColor: isLight
              ? "rgba(241, 245, 249, 0.75)"
              : "rgba(255, 255, 255, 0.035)",
            borderColor: isLight
              ? "rgba(203, 213, 225, 0.9)"
              : "rgba(255, 255, 255, 0.08)",
          },
        ]}
      >
        {/* Left column: Time range & duration context */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onToggleCollapse?.(gapKey);
          }}
          style={styles.collapsedLeft}
          accessibilityLabel={`${durationStr} free between ${startStr} and ${endStr}. Tap to expand`}
        >
          <View style={styles.collapsedHeaderRow}>
            <View style={[styles.gapDot, { backgroundColor: colors.textMuted }]} />
            <Text style={[styles.timeRangeText, { color: colors.text }]} numberOfLines={1}>
              {`${startStr} → ${endStr}`}
            </Text>
            <Text style={[styles.durationBadgeText, { color: colors.textMuted }]}>
              {`· ${durationStr} free`}
            </Text>
          </View>

          {isNowInsideGap && (
            <View style={styles.nowBadge}>
              <View style={styles.nowDot} />
              <Text style={styles.nowText}>
                {`NOW · ${formatMinutesToTime(currentTotalMinutes)}`}
              </Text>
            </View>
          )}
        </Pressable>

        {/* Right column: Action buttons (+ Plan & Expand) */}
        <View style={styles.collapsedRightActions}>
          <PressableScale
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onPlan(gapHour, gapMin, gap);
            }}
            scaleTo={0.95}
            contentStyle={[
              styles.planPill,
              {
                backgroundColor: isLight
                  ? "#FFFFFF"
                  : "rgba(255, 255, 255, 0.08)",
                borderColor: isLight
                  ? colors.border
                  : "rgba(255, 255, 255, 0.12)",
              },
            ]}
          >
            <Feather name="plus" size={11} color={colors.primary} />
            <Text style={[styles.planText, { color: colors.primary }]}>Plan</Text>
          </PressableScale>

          <PressableScale
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onToggleCollapse?.(gapKey);
            }}
            scaleTo={0.95}
            contentStyle={[
              styles.expandPill,
              {
                backgroundColor: isLight
                  ? "rgba(0,0,0,0.03)"
                  : "rgba(255, 255, 255, 0.04)",
                borderColor: isLight
                  ? "rgba(0,0,0,0.06)"
                  : "rgba(255, 255, 255, 0.06)",
              },
            ]}
          >
            <Feather name="chevron-down" size={12} color={colors.textMuted} />
          </PressableScale>
        </View>
      </View>
    );
  }

  // Expanded / Normal gap representation
  return (
    <View
      style={[
        styles.gapContainer,
        {
          top: calculatedTop + 4,
          height: Math.max(34, calculatedHeight - 8),
          backgroundColor: isLight
            ? "rgba(241, 245, 249, 0.6)"
            : "rgba(255, 255, 255, 0.025)",
          borderColor: isLight
            ? "rgba(226, 232, 240, 0.8)"
            : "rgba(255, 255, 255, 0.06)",
        },
      ]}
    >
      <View style={styles.contentRow}>
        {/* Available Duration with subtle indicator */}
        <View style={styles.durationWrapper}>
          <View style={[styles.gapDot, { backgroundColor: colors.textMuted }]} />
          <Text style={[styles.durationText, { color: colors.textMuted }]} numberOfLines={1}>
            {`${durationStr} available${isCollapsible ? ` (${startStr} → ${endStr})` : ""}`}
          </Text>
        </View>

        {/* Action Button Pill */}
        <View style={styles.expandedRightActions}>
          <PressableScale
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onPlan(gapHour, gapMin, gap);
            }}
            scaleTo={0.95}
            contentStyle={[
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
            <Text style={[styles.planText, { color: colors.primary }]}>Plan</Text>
          </PressableScale>

          {isCollapsible && (
            <PressableScale
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onToggleCollapse?.(gapKey);
              }}
              scaleTo={0.95}
              contentStyle={[
                styles.collapsePill,
                {
                  borderColor: isLight ? colors.border : "rgba(255, 255, 255, 0.1)",
                },
              ]}
            >
              <Feather name="chevron-up" size={12} color={colors.textMuted} />
              <Text style={[styles.collapseText, { color: colors.textMuted }]}>
                Collapse
              </Text>
            </PressableScale>
          )}
        </View>
      </View>
    </View>
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
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  planText: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  expandedRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  collapsePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  collapseText: {
    fontSize: 10.5,
    fontWeight: "600",
  },
  collapsedContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 8,
  },
  collapsedLeft: {
    flex: 1,
    gap: 2,
    justifyContent: "center",
  },
  collapsedHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "nowrap",
  },
  timeRangeText: {
    fontSize: 11.5,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  durationBadgeText: {
    fontSize: 11,
    fontWeight: "500",
  },
  nowBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 9,
  },
  nowDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#EF4444",
  },
  nowText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#EF4444",
    letterSpacing: 0.2,
  },
  collapsedRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  expandPill: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
