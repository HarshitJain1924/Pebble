import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { getCalendarItemType } from "@/features/calendar/types";

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
    [key: string]: any;
  };
  hourHeight?: number;
  colors: any;
  isLight: boolean;
  onOpenItem: (item: any) => void;
  createPanGesture: (item: any) => any;
}

// Accent colors per entity type — vibrant, accessible Pebble brand colors
const ACCENT: Record<string, string> = {
  task: "#6366F1",      // Indigo
  habit: "#10B981",     // Emerald
  checklist: "#3B82F6", // Blue
};

// Tinted card surfaces for Light mode
const CARD_BG_LIGHT: Record<string, string> = {
  task:      "#F4F3FF",
  habit:     "#F0FDF4",
  checklist: "#EFF6FF",
};

// Tinted card surfaces for Dark mode
const CARD_BG_DARK: Record<string, string> = {
  task:      "rgba(99, 102, 241, 0.13)",
  habit:     "rgba(16, 185, 129, 0.13)",
  checklist: "rgba(59, 130, 246, 0.13)",
};

const PRIORITY_DOT: Record<string, string> = {
  high:   "#EF4444",
  low:    "#10B981",
};

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
  hourHeight = 80,
  colors,
  isLight,
  onOpenItem,
  createPanGesture,
}) => {
  const startMinutes = (item.startHour ?? 0) * 60 + (item.startMinute ?? 0);
  const top = (startMinutes / 60) * hourHeight;
  const height = (item.durationMinutes / 60) * hourHeight;

  const widthPercent = 100 / item.totalCols;
  const leftPercent = item.colIdx * widthPercent;

  const type = getCalendarItemType(item);
  const accent = item.completed ? colors.textMuted : (ACCENT[type] ?? ACCENT.task);

  const cardBg = item.completed
    ? isLight ? "#F1F5F9" : "rgba(255, 255, 255, 0.03)"
    : isLight
      ? (CARD_BG_LIGHT[type] ?? CARD_BG_LIGHT.task)
      : (CARD_BG_DARK[type] ?? CARD_BG_DARK.task);

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

  // Checklist item preview — up to 2 items
  const checklistPreview =
    type === "checklist" && item.items && item.items.length > 0
      ? item.items
          .slice(0, 2)
          .map((it: any) => it.title)
          .join(" · ")
      : null;

  const priorityDotColor =
    item.priority && item.priority !== "medium" && item.priority !== "none"
      ? PRIORITY_DOT[item.priority]
      : null;

  const gesture = createPanGesture(item);
  const isVeryCompact = height < 44;
  const isTall = height >= 68;

  const titlePrefix = type === "habit" ? "⚡ " : "";

  return (
    <GestureDetector gesture={gesture}>
      <Pressable
        onPress={() => onOpenItem(item)}
        style={({ pressed }) => [
          styles.card,
          {
            top,
            height: Math.max(36, height - 2),
            left: `${leftPercent}%`,
            width: `${widthPercent - 1}%`,
            backgroundColor: cardBg,
            borderLeftColor: accent,
            borderColor: isLight ? "rgba(0, 0, 0, 0.06)" : "rgba(255, 255, 255, 0.08)",
            opacity: pressed ? 0.85 : item.completed ? 0.55 : 1,
          },
        ]}
      >
        <View style={styles.inner}>
          {/* Primary Title */}
          <Text
            numberOfLines={isVeryCompact ? 1 : isTall ? 2 : 1}
            style={[
              styles.title,
              {
                color: item.completed ? colors.textMuted : colors.text,
              },
            ]}
          >
            {titlePrefix}{item.title}
          </Text>

          {/* Temporal Allocation: Start → End · Duration */}
          {!isVeryCompact && (
            <View style={styles.metaRow}>
              {priorityDotColor && (
                <View style={[styles.priorityDot, { backgroundColor: priorityDotColor }]} />
              )}
              <Text
                style={[
                  styles.metaText,
                  { color: item.completed ? colors.textMuted : accent },
                ]}
                numberOfLines={1}
              >
                {timeRangeStr}
              </Text>
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
    borderRadius: 9,
    overflow: "hidden",
  },
  inner: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: "center",
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.1,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  priorityDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  metaText: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  previewText: {
    fontSize: 11,
    fontWeight: "500",
    opacity: 0.85,
  },
});
