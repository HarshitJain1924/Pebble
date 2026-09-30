import React, { useMemo } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { Palette, colorWithAlpha } from "@/shared/constants/theme";
import {
  getTodayDateKey,
  getOffsetDateKey,
  parseDateKey,
} from "@/shared/utils/date-key";
import { getTaskOccurrenceState, isTaskCompleted } from "@/shared/utils/domain-selectors";
import type { Task } from "@/shared/types/domain.types";

interface TemporalHorizonStripProps {
  selectedDate: string;
  onSelectDate: (dateKey: string) => void;
  todos: Task[];
  colors: any;
  isDark: boolean;
}

interface DayItem {
  dateKey: string;
  dayNumber: number;
  dayName: string;
  isToday: boolean;
  isSelected: boolean;
  taskCount: number;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function TemporalHorizonStrip({
  selectedDate,
  onSelectDate,
  todos,
  colors,
  isDark,
}: TemporalHorizonStripProps) {
  const todayKey = useMemo(() => getTodayDateKey(), []);

  // Compute 7 days centered around today (2 days prior, today, 4 days ahead)
  const days = useMemo<DayItem[]>(() => {
    const list: DayItem[] = [];
    const offsets = [2, 1, 0, -1, -2, -3, -4]; // Note: in getOffsetDateKey, positive is past, negative is future

    for (const offset of offsets) {
      const dKey = getOffsetDateKey(offset, todayKey);
      const parsed = parseDateKey(dKey);
      const isToday = dKey === todayKey;
      const isSelected = dKey === selectedDate;

      // Count uncompleted, active tasks for this date
      const taskCount = todos.reduce((count, task) => {
        if (task.archivedAt || isTaskCompleted(task)) return count;
        const occ = getTaskOccurrenceState(task, dKey);
        return occ.occurs ? count + 1 : count;
      }, 0);

      list.push({
        dateKey: dKey,
        dayNumber: parsed.getDate(),
        dayName: DAY_NAMES[parsed.getDay()],
        isToday,
        isSelected,
        taskCount,
      });
    }

    return list;
  }, [todayKey, selectedDate, todos]);

  const handleSelectDay = (day: DayItem) => {
    Haptics.selectionAsync().catch(() => {});
    onSelectDate(day.dateKey);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {days.map((day) => {
          const isSelected = day.isSelected;
          const isToday = day.isToday;

          // Capsule styling matching Pebble design language
          const capsuleBg = isSelected
            ? isDark
              ? colorWithAlpha(colors.primary, 0.22)
              : "#EBF3FF"
            : isDark
            ? "rgba(255, 255, 255, 0.04)"
            : Palette.white;

          const capsuleBorder = isSelected
            ? isDark
              ? colors.primaryLight
              : colors.primary
            : isDark
            ? "rgba(255, 255, 255, 0.07)"
            : colors.border;

          const numberColor = isSelected
            ? isDark
              ? colors.primaryLight
              : colors.primary
            : colors.text;

          const labelColor = isSelected
            ? isDark
              ? colors.primaryLight
              : colors.primary
            : colors.textMuted;

          const dotColor = isSelected
            ? isDark
              ? colors.primaryLight
              : colors.primary
            : isDark
            ? colors.textMuted
            : Palette.slate400;

          // Cap density dots at 3
          const dotCount = Math.min(day.taskCount, 3);

          return (
            <PressableScale
              key={day.dateKey}
              testID={`date-capsule-${day.dateKey}`}
              onPress={() => handleSelectDay(day)}
              scaleTo={0.94}
              haptic
              accessibilityRole="button"
              accessibilityLabel={`${day.isToday ? "Today, " : ""}${day.dayName} ${day.dayNumber}, ${day.taskCount} tasks, ${isSelected ? "selected" : ""}`}
              accessibilityState={{ selected: isSelected }}
              style={[
                styles.capsule,
                {
                  backgroundColor: capsuleBg,
                  borderColor: capsuleBorder,
                  borderWidth: isSelected ? 1.5 : 1,
                  shadowColor: isSelected ? colors.primary : Palette.black,
                  shadowOpacity: isSelected ? (isDark ? 0.25 : 0.08) : (isDark ? 0.15 : 0.03),
                },
              ]}
            >
              <Text
                style={[
                  styles.dayNumber,
                  {
                    color: numberColor,
                    fontWeight: isSelected || isToday ? "800" : "600",
                  },
                ]}
              >
                {day.dayNumber}
              </Text>

              <Text
                style={[
                  styles.dayLabel,
                  {
                    color: labelColor,
                    fontWeight: isSelected || isToday ? "700" : "500",
                  },
                ]}
              >
                {isToday ? "Today" : day.dayName}
              </Text>

              {/* Density Dots */}
              <View style={styles.dotContainer}>
                {dotCount > 0 ? (
                  Array.from({ length: dotCount }).map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.dot,
                        {
                          backgroundColor:
                            i === 0
                              ? dotColor
                              : i === 1
                              ? isDark
                                ? Palette.amber400
                                : Palette.amber500
                              : isDark
                              ? Palette.emerald400
                              : Palette.emerald500,
                        },
                      ]}
                    />
                  ))
                ) : (
                  <View style={styles.dotPlaceholder} />
                )}
              </View>
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  scrollContent: {
    paddingHorizontal: 4,
    gap: 7,
    alignItems: "center",
  },
  capsule: {
    width: 50,
    minHeight: 64,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "space-between",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 1,
  },
  dayNumber: {
    fontSize: 15,
    letterSpacing: -0.3,
  },
  dayLabel: {
    fontSize: 11,
    letterSpacing: -0.1,
    marginTop: -1,
  },
  dotContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    minHeight: 6,
    marginTop: 2,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  dotPlaceholder: {
    width: 4,
    height: 4,
    opacity: 0,
  },
});
