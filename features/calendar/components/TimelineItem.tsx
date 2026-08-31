import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { Feather } from "@expo/vector-icons";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { getCalendarItemType } from "@/features/calendar/types";
import {
  getCalendarEntityPresentation,
  CALENDAR_ENTITY_TOKENS,
} from "@/features/calendar/constants/calendarEntityTokens";

export { getCalendarEntityPresentation, CALENDAR_ENTITY_TOKENS };

// Backward compatibility export derived strictly from the canonical tokens
export const ENTITY_ACCENT = {
  task: {
    main: CALENDAR_ENTITY_TOKENS.dark.task.accent,
    lightBg: CALENDAR_ENTITY_TOKENS.light.task.surface,
    darkBg: CALENDAR_ENTITY_TOKENS.dark.task.surface,
    icon: CALENDAR_ENTITY_TOKENS.dark.task.icon,
  },
  habit: {
    main: CALENDAR_ENTITY_TOKENS.dark.habit.accent,
    lightBg: CALENDAR_ENTITY_TOKENS.light.habit.surface,
    darkBg: CALENDAR_ENTITY_TOKENS.dark.habit.surface,
    icon: CALENDAR_ENTITY_TOKENS.dark.habit.icon,
  },
  checklist: {
    main: CALENDAR_ENTITY_TOKENS.dark.checklist.accent,
    lightBg: CALENDAR_ENTITY_TOKENS.light.checklist.surface,
    darkBg: CALENDAR_ENTITY_TOKENS.dark.checklist.surface,
    icon: CALENDAR_ENTITY_TOKENS.dark.checklist.icon,
  },
};

interface TimelineItemProps {
  item: {
    id: string;
    title: string;
    type: string;
    startHour?: number;
    startMinute?: number;
    durationMinutes: number;
    colIdx: number;
    totalCols: number;
    timeLabel: string;
    priority?: string;
    completed?: boolean;
    items?: Array<{ title: string; completed?: boolean }>;
    itemsCount?: number;
    completedItemsCount?: number;
    streak?: number;
    [key: string]: any;
  };
  top?: number;
  activeCollapsedGaps?: any[];
  hourHeight?: number;
  colors: any;
  isLight: boolean;
  onOpenItem: (item: any) => void;
  createPanGesture: (item: any) => any;
}

function formatTimeOnly(h: number, m: number): string {
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const mStr = m < 10 ? `0${m}` : `${m}`;
  return `${displayH}:${mStr}`;
}

function formatTimeWithAmpm(h: number, m: number): string {
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h >= 12 ? "PM" : "AM";
  const mStr = m < 10 ? `0${m}` : `${m}`;
  return `${displayH}:${mStr} ${ampm}`;
}

export const TimelineItem: React.FC<TimelineItemProps> = React.memo(({
  item,
  top: propTop,
  activeCollapsedGaps = [],
  hourHeight = 80,
  colors,
  isLight,
  onOpenItem,
  createPanGesture,
}) => {
  const startMinutes = (item.startHour ?? 0) * 60 + (item.startMinute ?? 0);
  const top =
    propTop !== undefined
      ? propTop
      : (activeCollapsedGaps && activeCollapsedGaps.length > 0
          ? require("@/features/calendar/utils/timelineCollapsibleLayout").calculateTimeYCoordinate(
              startMinutes,
              activeCollapsedGaps,
              hourHeight,
            )
          : (startMinutes / 60) * hourHeight);
  const height = (item.durationMinutes / 60) * hourHeight;

  const totalCols = Math.max(1, item.totalCols || 1);
  const widthPercent = 100 / totalCols;
  const leftPercent = (item.colIdx || 0) * widthPercent;

  const type = getCalendarItemType(item);
  const config = getCalendarEntityPresentation(type, isLight);
  const accent = item.completed ? colors.textMuted : config.accent;

  const cardBg = item.completed
    ? isLight ? "#F1F5F9" : "rgba(255, 255, 255, 0.03)"
    : config.surface;

  // Compute end time and duration string
  const endTotalMinutes = startMinutes + (item.durationMinutes ?? 0);
  const endHour = Math.floor(endTotalMinutes / 60) % 24;
  const endMinute = endTotalMinutes % 60;

  const durHrs = Math.floor(item.durationMinutes / 60);
  const durMins = item.durationMinutes % 60;
  const durStr = durHrs > 0
    ? `${durHrs}h${durMins > 0 ? ` ${durMins}m` : ""}`
    : `${durMins}m`;

  const startAmpm = (item.startHour ?? 0) >= 12 ? "PM" : "AM";
  const endAmpm = endHour >= 12 ? "PM" : "AM";

  const timeRangeStr = startAmpm === endAmpm
    ? `${formatTimeOnly(item.startHour ?? 0, item.startMinute ?? 0)} – ${formatTimeOnly(endHour, endMinute)} ${endAmpm} · ${durStr}`
    : `${formatTimeWithAmpm(item.startHour ?? 0, item.startMinute ?? 0)} – ${formatTimeWithAmpm(endHour, endMinute)} · ${durStr}`;

  // Checklist specific metadata
  const totalChecklistItems = item.itemsCount ?? item.items?.length ?? 0;
  const completedChecklistItems = item.completedItemsCount ?? item.items?.filter((i: any) => i.completed)?.length ?? 0;
  const checklistProgressText = totalChecklistItems > 0 ? `${completedChecklistItems}/${totalChecklistItems}` : null;

  const checklistPreview =
    type === "checklist" && item.items && item.items.length > 0
      ? item.items
          .slice(0, 2)
          .map((it: any) => it.title)
          .join(" · ")
      : null;

  const isHighPriority = item.priority === "high";
  const gesture = createPanGesture(item);
  const isVeryCompact = height < 38;
  const isMedium = height >= 38 && height < 64;
  const isTall = height >= 64;

  return (
    <GestureDetector gesture={gesture}>
      <Pressable
        onPress={() => onOpenItem(item)}
        style={({ pressed }) => [
          styles.card,
          {
            top,
            height: Math.max(26, height - 2),
            left: `${leftPercent}%`,
            width: `${widthPercent - 1}%`,
            backgroundColor: cardBg,
            borderLeftColor: accent,
            borderColor: isLight ? "rgba(0, 0, 0, 0.06)" : config.borderColor,
            opacity: pressed ? 0.85 : item.completed ? 0.55 : 1,
          },
        ]}
      >
        <View style={[styles.inner, isVeryCompact && styles.innerCompact]}>
          {/* Header Row: Entity Icon + Title + Progress / Check Status */}
          <View style={styles.topRow}>
            <View style={styles.titleWithIcon}>
              <Feather
                name={config.icon}
                size={isVeryCompact ? 11 : 13}
                color={accent}
                style={styles.entityIcon}
              />
              <Text
                numberOfLines={isVeryCompact ? 1 : isTall ? 2 : 1}
                style={[
                  isVeryCompact ? styles.titleCompact : styles.title,
                  {
                    color: item.completed ? colors.textMuted : colors.text,
                    textDecorationLine: item.completed ? "line-through" : "none",
                  },
                ]}
              >
                {item.title}
              </Text>
            </View>

            {/* Right badge: Checklist progress or completion status */}
            {type === "checklist" && checklistProgressText && (
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
                  {checklistProgressText}
                </Text>
              </View>
            )}

            {item.completed && (
              <Feather name="check-circle" size={13} color={colors.success || "#10B981"} />
            )}
          </View>

          {/* Temporal Allocation & Priority */}
          {!isVeryCompact && (
            <View style={styles.metaRow}>
              <Text
                style={[
                  styles.metaText,
                  { color: item.completed ? colors.textMuted : accent },
                ]}
                numberOfLines={1}
              >
                {isMedium ? `${formatTimeOnly(item.startHour ?? 0, item.startMinute ?? 0)} ${startAmpm} · ${durStr}` : timeRangeStr}
              </Text>

              {isHighPriority && (
                <View style={styles.priorityPill}>
                  <View style={styles.priorityDot} />
                  <Text style={styles.priorityText}>High Priority</Text>
                </View>
              )}

              {type === "habit" && !isHighPriority && (
                <Text style={[styles.habitRecurrenceText, { color: colors.textMuted }]}>
                  {item.streak ? `· ${item.streak}d streak` : "· Habit"}
                </Text>
              )}
            </View>
          )}

          {/* Checklist Item Preview (on tall cards) */}
          {isTall && checklistPreview && (
            <Text
              style={[styles.previewText, { color: colors.textMuted }]}
              numberOfLines={1}
            >
              {checklistPreview}
            </Text>
          )}
        </View>
      </Pressable>
    </GestureDetector>
  );
});

TimelineItem.displayName = "TimelineItem";

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    borderWidth: 1,
    borderLeftWidth: 3.5,
    borderRadius: 8,
    overflow: "hidden",
  },
  inner: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    justifyContent: "center",
    gap: 2.5,
  },
  innerCompact: {
    paddingVertical: 2,
    gap: 0,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  titleWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flex: 1,
  },
  entityIcon: {
    marginTop: 0.5,
  },
  titleCompact: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: -0.1,
    flex: 1,
  },
  title: {
    fontSize: 13.5,
    fontWeight: "700",
    letterSpacing: -0.1,
    lineHeight: 17,
    flex: 1,
  },
  progressBadge: {
    paddingHorizontal: 4.5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  progressBadgeText: {
    fontSize: 9.5,
    fontWeight: "800",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  metaText: {
    fontSize: 11.5,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  priorityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3.5,
  },
  priorityDot: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.25,
    backgroundColor: "#EF4444",
  },
  priorityText: {
    fontSize: 9.5,
    fontWeight: "700",
    color: "#EF4444",
  },
  habitRecurrenceText: {
    fontSize: 10.5,
    fontWeight: "500",
  },
  previewText: {
    fontSize: 10.5,
    fontWeight: "500",
    opacity: 0.85,
  },
});
