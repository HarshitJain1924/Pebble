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

// Accent colors per entity type — consistent with brand colors
const ACCENT: Record<string, string> = {
  task: "#6366F1",      // Indigo
  habit: "#10B981",     // Emerald
  checklist: "#3B82F6", // Blue
};

// Near-neutral backgrounds — accent does the work
const CARD_BG_LIGHT: Record<string, string> = {
  task:      "#F5F4FF",
  habit:     "#F0FDF9",
  checklist: "#EFF6FF",
};

const CARD_BG_DARK: Record<string, string> = {
  task:      "rgba(99, 102, 241, 0.07)",
  habit:     "rgba(16, 185, 129, 0.07)",
  checklist: "rgba(59, 130, 246, 0.07)",
};

const PRIORITY_DOT: Record<string, string> = {
  high:   "#EF4444",
  low:    "#10B981",
};

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
  const accent = item.completed ? "#9CA3AF" : (ACCENT[type] ?? ACCENT.task);

  const cardBg = item.completed
    ? isLight ? "#F1F5F9" : "rgba(255,255,255,0.02)"
    : isLight
      ? (CARD_BG_LIGHT[type] ?? CARD_BG_LIGHT.task)
      : (CARD_BG_DARK[type] ?? CARD_BG_DARK.task);

  // Checklist item preview — up to 2 items, comma-separated
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
  const isCompact = height < 52;
  const isTall = height >= 72;

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
            opacity: pressed ? 0.85 : item.completed ? 0.5 : 1,
          },
        ]}
      >
        <View style={styles.inner}>
          {/* Title — hero text */}
          <Text
            numberOfLines={isCompact ? 1 : isTall ? 2 : 1}
            style={[
              styles.title,
              {
                color: item.completed ? colors.textMuted : colors.text,
              },
            ]}
          >
            {item.title}
          </Text>

          {/* Time + duration — secondary below title */}
          {!isCompact && (
            <View style={styles.metaRow}>
              {/* Priority dot (if high/low) */}
              {priorityDotColor && (
                <View style={[styles.priorityDot, { backgroundColor: priorityDotColor }]} />
              )}
              <Text
                style={[styles.metaText, { color: accent }]}
                numberOfLines={1}
              >
                {item.timeLabel} · {item.durationMinutes}m
              </Text>
            </View>
          )}

          {/* Checklist item preview */}
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
    borderLeftWidth: 2,
    borderRadius: 6,
    overflow: "hidden",
  },
  inner: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: "center",
    gap: 2,
  },
  title: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  priorityDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  metaText: {
    fontSize: 10,
    fontWeight: "500",
  },
  previewText: {
    fontSize: 10,
    fontWeight: "400",
    opacity: 0.8,
  },
});
