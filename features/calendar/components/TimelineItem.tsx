import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
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
    [key: string]: any;
  };
  hourHeight?: number;
  colors: any;
  isLight: boolean;
  onOpenItem: (item: any) => void;
  createPanGesture: (item: any) => any;
}

export const TimelineItem: React.FC<TimelineItemProps> = React.memo(({
  item,
  hourHeight = 80,
  colors,
  isLight,
  onOpenItem,
  createPanGesture,
}) => {
  const startMinutes =
    (item.startHour ?? 0) * 60 + (item.startMinute ?? 0);

  const top = (startMinutes / 60) * hourHeight;
  const height = (item.durationMinutes / 60) * hourHeight;

  const widthPercent = 100 / item.totalCols;
  const leftPercent = item.colIdx * widthPercent;

  const type = getCalendarItemType(item);

  const themeStyles = {
    task: {
      bg: isLight ? "#EEF2F6" : "rgba(108, 99, 255, 0.08)",
      border: "#6C63FF",
      icon: "check-square",
    },
    habit: {
      bg: isLight ? "#ECFDF5" : "rgba(16, 185, 129, 0.08)",
      border: "#10B981",
      icon: "activity",
    },
    checklist: {
      bg: isLight ? "#EFF6FF" : "rgba(59, 130, 246, 0.08)",
      border: "#3B82F6",
      icon: "list",
    },
  }[type] || {
    bg: isLight ? "#EEF2F6" : "rgba(108, 99, 255, 0.08)",
    border: "#6C63FF",
    icon: "check-square",
  };

  const cardBg = item.completed
    ? isLight
      ? "#F1F5F9"
      : "rgba(255, 255, 255, 0.02)"
    : themeStyles.bg;
  const accentColor = item.completed
    ? "#9CA3AF"
    : themeStyles.border;

  const gesture = createPanGesture(item);

  return (
    <GestureDetector gesture={gesture}>
      <Pressable
        onPress={() => onOpenItem(item)}
        style={[
          styles.timedBlockCard,
          {
            top,
            height: Math.max(36, height - 2),
            left: `${leftPercent}%`,
            width: `${widthPercent - 1}%`,
            backgroundColor: cardBg,
            borderLeftColor: accentColor,
            borderLeftWidth: 3,
          },
        ]}
      >
        <View style={styles.cardContent}>
          <View>
            <View style={styles.topRow}>
              <Text
                style={[
                  styles.timeLabelText,
                  {
                    color: item.completed
                      ? colors.textMuted
                      : accentColor,
                  },
                ]}
              >
                {item.timeLabel} ({item.durationMinutes}m)
              </Text>
              {item.priority && item.priority !== "medium" && item.priority !== "none" && (
                <Text
                  style={[
                    styles.priorityText,
                    {
                      color:
                        item.priority === "high"
                          ? colors.error
                          : colors.success,
                    },
                  ]}
                >
                  {item.priority.toUpperCase()}
                </Text>
              )}
            </View>
            <Text
              numberOfLines={height < 50 ? 1 : 2}
              style={[
                styles.titleText,
                {
                  color: item.completed
                    ? colors.textMuted
                    : colors.text,
                  textDecorationLine: item.completed
                    ? "line-through"
                    : "none",
                },
              ]}
            >
              {item.title}
            </Text>
          </View>

          {height >= 60 && (
            <View style={styles.bottomRow}>
              <Feather
                name={themeStyles.icon as any}
                size={10}
                color={
                  item.completed
                    ? colors.textMuted
                    : accentColor
                }
              />
              <Text
                style={[
                  styles.typeLabel,
                  {
                    color: item.completed
                      ? colors.textMuted
                      : colors.text,
                  },
                ]}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Text>
            </View>
          )}
        </View>
      </Pressable>
    </GestureDetector>
  );
});

TimelineItem.displayName = "TimelineItem";

const styles = StyleSheet.create({
  timedBlockCard: {
    position: "absolute",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
    overflow: "hidden",
  },
  cardContent: {
    flex: 1,
    padding: 6,
    justifyContent: "space-between",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timeLabelText: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  priorityText: {
    fontSize: 8,
    fontWeight: "900",
  },
  titleText: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  typeLabel: {
    fontSize: 9,
    opacity: 0.8,
  },
});
