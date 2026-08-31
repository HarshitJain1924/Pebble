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
    [key: string]: any;
  };
  hourHeight?: number;
  dayStartHour?: number;
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
  hourHeight = 64,
  dayStartHour = 6,
  colors,
  isLight,
  onOpenItem,
}) => {
  const startMinutes = (item.startHour ?? 0) * 60 + (item.startMinute ?? 0);
  const top = Math.max(0, ((startMinutes - dayStartHour * 60) / 60) * hourHeight);
  const height = Math.max(28, ((item.durationMinutes || 30) / 60) * hourHeight);

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

  const isSmall = height < 38;
  const isTall = height >= 58;

  return (
    <PressableScale
      onPress={() => onOpenItem(item)}
      scaleTo={0.96}
      contentStyle={[
        styles.card,
        {
          top,
          height: height - 2,
          backgroundColor: bg,
          borderLeftColor: accent,
          borderColor: isLight ? "rgba(0, 0, 0, 0.06)" : config.borderColor,
          opacity: item.completed ? 0.55 : 1,
        },
      ]}
    >
      <View style={styles.inner}>
        {/* Title row with icon */}
        <View style={styles.titleRow}>
          <Feather
            name={config.icon}
            size={11}
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
            numberOfLines={isSmall ? 1 : 2}
          >
            {item.title}
          </Text>

          {type === "checklist" && checklistProgress && (
            <Text style={[styles.progressBadgeText, { color: accent }]}>
              {checklistProgress}
            </Text>
          )}
        </View>

        {/* Time + Duration */}
        {!isSmall && (
          <Text
            style={[
              styles.timeText,
              { color: item.completed ? colors.textMuted : accent },
            ]}
            numberOfLines={1}
          >
            {timeStr} · {durStr}
          </Text>
        )}

        {/* Entity specific tertiary metadata for tall cards */}
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
      </View>
    </PressableScale>
  );
});

WeekTimelineItem.displayName = "WeekTimelineItem";

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    left: 2,
    right: 2,
    borderRadius: 7,
    borderWidth: 1,
    borderLeftWidth: 3,
    overflow: "hidden",
  },
  inner: {
    flex: 1,
    paddingHorizontal: 4,
    paddingVertical: 3,
    justifyContent: "center",
    gap: 1.5,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  icon: {
    marginTop: 0.5,
  },
  title: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: -0.1,
    flex: 1,
  },
  progressBadgeText: {
    fontSize: 9,
    fontWeight: "800",
  },
  timeText: {
    fontSize: 9.5,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaSubtext: {
    fontSize: 9,
    fontWeight: "500",
  },
  priorityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  priorityDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#EF4444",
  },
  priorityText: {
    fontSize: 8.5,
    fontWeight: "700",
    color: "#EF4444",
  },
});
