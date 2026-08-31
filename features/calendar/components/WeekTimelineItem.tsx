import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { getCalendarItemType } from "@/features/calendar/types";
import { getCalendarEntityPresentation } from "@/features/calendar/constants/calendarEntityTokens";

interface WeekTimelineItemProps {
  item: {
    id: string;
    title: string;
    type: string;
    startHour?: number;
    startMinute?: number;
    durationMinutes: number;
    completed?: boolean;
    priority?: string;
    streak?: number;
    itemsCount?: number;
    completedItemsCount?: number;
    colIdx?: number;
    totalCols?: number;
    [key: string]: any;
  };
  hourHeight?: number;
  colors: any;
  isLight: boolean;
  onOpenItem: (item: any) => void;
}

function formatBlockTime(h: number, m: number): string {
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

export const WeekTimelineItem: React.FC<WeekTimelineItemProps> = React.memo(({
  item,
  hourHeight = 60,
  colors,
  isLight,
  onOpenItem,
}) => {
  const startMinutes = (item.startHour ?? 0) * 60 + (item.startMinute ?? 0);
  const top = (startMinutes / 60) * hourHeight;
  const height = Math.max(24, ((item.durationMinutes || 30) / 60) * hourHeight);

  const colIdx = item.colIdx ?? 0;
  const totalCols = Math.max(1, item.totalCols ?? 1);
  const isMultiCol = totalCols > 1;
  const widthPercent = 100 / totalCols;
  const leftPercent = colIdx * widthPercent;

  const type = getCalendarItemType(item);
  const config = getCalendarEntityPresentation(type, isLight);
  const accent = item.completed ? colors.textMuted : config.accent;
  const bg = item.completed
    ? isLight ? "#F1F5F9" : "rgba(255, 255, 255, 0.03)"
    : config.surface;

  const timeStr = formatBlockTime(item.startHour ?? 0, item.startMinute ?? 0);
  const durStr = formatDuration(item.durationMinutes || 30);

  const totalItems = item.itemsCount ?? 0;
  const completedItems = item.completedItemsCount ?? 0;
  const checklistProgress = totalItems > 0 ? `${completedItems}/${totalItems}` : null;

  // Render tiers
  const isVerySmall = height < 32;
  const isMedium = height >= 32 && height < 52;
  const isTall = height >= 52;

  return (
    <PressableScale
      onPress={() => onOpenItem(item)}
      scaleTo={0.96}
      contentStyle={[
        styles.card,
        isMultiCol
          ? {
              left: `${leftPercent}%`,
              width: `${widthPercent - 0.8}%`,
            }
          : {
              left: 2,
              right: 2,
            },
        {
          top,
          height: Math.max(22, height - 1.5),
          backgroundColor: bg,
          borderLeftColor: accent,
          borderColor: isLight ? "rgba(0, 0, 0, 0.06)" : config.borderColor,
          opacity: item.completed ? 0.55 : 1,
        },
      ]}
    >
      <View style={styles.inner}>
        {/* Tier 1: Very Small (< 32px) - Icon + Title on 1 line */}
        {isVerySmall ? (
          <View style={styles.titleRow}>
            <Feather
              name={config.icon}
              size={9.5}
              color={accent}
              style={styles.icon}
            />
            <Text
              style={[
                styles.titleCompact,
                {
                  color: item.completed ? colors.textMuted : colors.text,
                  textDecorationLine: item.completed ? "line-through" : "none",
                },
              ]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
          </View>
        ) : (
          /* Tier 2 & 3: Standard / Tall */
          <>
            <View style={styles.titleRow}>
              <Feather
                name={config.icon}
                size={10}
                color={accent}
                style={styles.icon}
              />
              <Text
                style={[
                  styles.title,
                  {
                    color: item.completed ? colors.textMuted : colors.text,
                    textDecorationLine: item.completed ? "line-through" : "none",
                  },
                ]}
                numberOfLines={isTall ? 2 : 1}
              >
                {item.title}
              </Text>

              {type === "checklist" && checklistProgress && (
                <View
                  style={[
                    styles.progressBadge,
                    {
                      backgroundColor: config.surfaceSubtle,
                      borderColor: config.borderColor,
                    },
                  ]}
                >
                  <Text style={[styles.progressBadgeText, { color: accent }]}>
                    {checklistProgress}
                  </Text>
                </View>
              )}
            </View>

            {/* Time / Duration Line */}
            <Text
              style={[
                styles.timeText,
                { color: item.completed ? colors.textMuted : accent },
              ]}
              numberOfLines={1}
            >
              {isMedium ? timeStr : `${timeStr} · ${durStr}`}
            </Text>

            {/* Tier 3 metadata for Tall cards */}
            {isTall && (
              <View style={styles.metaRow}>
                {type === "habit" && (
                  <Text style={[styles.metaSubtext, { color: colors.textMuted }]} numberOfLines={1}>
                    {item.streak ? `${item.streak}d streak` : "Habit"}
                  </Text>
                )}
                {type === "task" && item.priority === "high" && (
                  <View style={styles.priorityPill}>
                    <View style={styles.priorityDot} />
                    <Text style={styles.priorityText}>High</Text>
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </View>
    </PressableScale>
  );
});

WeekTimelineItem.displayName = "WeekTimelineItem";

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    borderRadius: 6,
    borderWidth: 1,
    borderLeftWidth: 3,
    overflow: "hidden",
  },
  inner: {
    flex: 1,
    paddingHorizontal: 4,
    paddingVertical: 2,
    justifyContent: "center",
    gap: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3.5,
  },
  icon: {
    marginTop: 0.5,
  },
  titleCompact: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: -0.1,
    flex: 1,
  },
  title: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: -0.1,
    flex: 1,
    lineHeight: 13,
  },
  progressBadge: {
    paddingHorizontal: 3.5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  progressBadgeText: {
    fontSize: 8.5,
    fontWeight: "800",
  },
  timeText: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  metaSubtext: {
    fontSize: 8.5,
    fontWeight: "500",
  },
  priorityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2.5,
  },
  priorityDot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 1.75,
    backgroundColor: "#EF4444",
  },
  priorityText: {
    fontSize: 8,
    fontWeight: "700",
    color: "#EF4444",
  },
});
