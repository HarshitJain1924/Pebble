import React from "react";
import { View, Pressable, Platform, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated from "react-native-reanimated";
import { AppText as Text } from "@/shared/components/ui/AppText";
import {
  MONTH_NAMES,
  WEEKDAY_NAMES,
  getDateKey,
} from "@/features/calendar/hooks/useCalendarState";
import { CalendarViewMode } from "@/features/calendar/types";
import { isRecurringOccurrenceForDate } from "@/services/scheduling/recurrence.service";
import {
  isChecklistCompletedForDate,
  isTaskCompleted,
} from "@/shared/utils/domain-selectors";

interface CalendarNavigationCardProps {
  calendarViewMode: CalendarViewMode;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  month: { year: number; month: number };
  handlePrevMonth: () => void;
  handleNextMonth: () => void;
  calendarCells: any[];
  weekDaysStrip: any[];
  hoveredDate: string | null;
  monthGridRef: React.RefObject<View | null>;
  weekStripRef: React.RefObject<View | null>;
  measureMonthGrid: () => void;
  measureWeekStrip: () => void;
  allTodos: any[];
  allHabits: any[];
  allChecklists: any[];
  calendarHeight: any;
  monthStyle: any;
  weekStyle: any;
  timelineStyle: any;
  colors: any;
  colorScheme: string;
  isLight: boolean;
}

export const CalendarNavigationCard: React.FC<CalendarNavigationCardProps> = ({
  calendarViewMode,
  selectedDate,
  setSelectedDate,
  month,
  handlePrevMonth,
  handleNextMonth,
  calendarCells,
  weekDaysStrip,
  hoveredDate,
  monthGridRef,
  weekStripRef,
  measureMonthGrid,
  measureWeekStrip,
  allTodos,
  allHabits,
  allChecklists,
  calendarHeight,
  monthStyle,
  weekStyle,
  timelineStyle,
  colors,
  colorScheme,
  isLight,
}) => {
  const getDateIndicatorStats = (dateStr: string) => {
    if (!dateStr) return { tasks: 0, habits: 0, checklists: 0 };
    const tasks = allTodos.filter(
      (t) =>
        !t.archivedAt &&
        !isTaskCompleted(t) &&
        isRecurringOccurrenceForDate(t, dateStr),
    ).length;

    const habits = allHabits.filter(
      (h) => !h.archivedAt && isRecurringOccurrenceForDate(h, dateStr),
    ).length;

    const checklists = allChecklists.filter(
      (c) =>
        !c.archivedAt &&
        !isChecklistCompletedForDate(c, dateStr) &&
        isRecurringOccurrenceForDate(c, dateStr),
    ).length;

    return { tasks, habits, checklists };
  };

  const CellIndicators = ({ dateStr }: { dateStr: string }) => {
    const stats = getDateIndicatorStats(dateStr);
    const hasAny =
      stats.tasks > 0 ||
      stats.habits > 0 ||
      stats.checklists > 0;
    if (!hasAny) return null;

    return (
      <View style={styles.indicatorRow}>
        {stats.tasks > 0 && (
          <View
            style={[styles.indicatorDot, { backgroundColor: "#6C63FF" }]}
          />
        )}
        {stats.habits > 0 && (
          <View
            style={[styles.indicatorDot, { backgroundColor: "#10B981" }]}
          />
        )}
        {stats.checklists > 0 && (
          <View
            style={[styles.indicatorDot, { backgroundColor: "#F59E0B" }]}
          />
        )}
      </View>
    );
  };

  return (
    <Animated.View
      style={[
        styles.navCard,
        {
          backgroundColor: isLight ? "#FFFFFF" : colors.card,
          borderColor: colors.border,
          borderWidth: 1,
          shadowOpacity: isLight ? 0.03 : 0.12,
          elevation: calendarViewMode === "timeline" ? 1 : 3,
          marginTop: calendarViewMode === "timeline" ? 4 : Platform.OS === "ios" ? 10 : 6,
          height: calendarHeight,
        },
      ]}
    >
      {/* Month View Section */}
      <Animated.View style={[monthStyle, styles.sectionAbsolute]}>
        <View style={styles.monthHeaderRow}>
          <Pressable
            onPress={handlePrevMonth}
            hitSlop={8}
            style={[
              styles.chevronButton,
              {
                backgroundColor: isLight
                  ? "#F1F5F9"
                  : "rgba(255,255,255,0.04)",
                borderColor: colors.border,
              },
            ]}
          >
            <Feather
              name="chevron-left"
              size={14}
              color={colors.textMuted}
            />
          </Pressable>
          <Text
            style={[
              styles.monthTitleText,
              { color: colors.text },
            ]}
          >
            {MONTH_NAMES[month.month]} {month.year}
          </Text>
          <Pressable
            onPress={handleNextMonth}
            hitSlop={8}
            style={[
              styles.chevronButton,
              {
                backgroundColor: isLight
                  ? "#F1F5F9"
                  : "rgba(255,255,255,0.04)",
                borderColor: colors.border,
              },
            ]}
          >
            <Feather
              name="chevron-right"
              size={14}
              color={colors.textMuted}
            />
          </Pressable>
        </View>

        {/* Weekday Headers */}
        <View
          style={[
            styles.weekdayHeaderRow,
            {
              borderBottomColor: isLight
                ? "rgba(0,0,0,0.05)"
                : "rgba(255,255,255,0.04)",
            },
          ]}
        >
          {WEEKDAY_NAMES.map((name) => (
            <Text
              key={name}
              style={[
                styles.weekdayHeaderText,
                { color: colors.textMuted },
              ]}
            >
              {name.charAt(0)}
            </Text>
          ))}
        </View>

        {/* Days Grid */}
        <View
          ref={monthGridRef}
          onLayout={measureMonthGrid}
          style={styles.monthDaysGrid}
        >
          {calendarCells.map((cell) => {
            if (cell.type === "empty") {
              return (
                <View
                  key={cell.key}
                  style={styles.emptyDayCell}
                />
              );
            }
            const dateStr = cell.dateString || "";
            const isSelected = selectedDate === dateStr;
            const isToday = dateStr === getDateKey();
            const isHovered = hoveredDate === dateStr;

            const borderStyles = {
              borderWidth:
                (isToday && !isSelected) || isHovered ? 1.5 : 0,
              borderColor: isHovered
                ? colors.primary
                : isToday && !isSelected
                  ? colors.primary
                  : "transparent",
            };

            return (
              <Pressable
                key={cell.key}
                onPress={() => setSelectedDate(dateStr)}
                style={styles.dayPressable}
              >
                <View
                  style={[
                    styles.dayCircle,
                    {
                      backgroundColor: isSelected
                        ? colors.primary
                        : isHovered
                          ? `${colors.primary}22`
                          : "transparent",
                    },
                    borderStyles,
                  ]}
                >
                  <Text
                    style={{
                      color: isSelected
                        ? "#FFFFFF"
                        : isToday
                          ? colors.primary
                          : colors.text,
                      fontSize: 11,
                      fontWeight:
                        isSelected || isToday || isHovered
                          ? "800"
                          : "500",
                    }}
                  >
                    {cell.dayNum}
                  </Text>
                </View>

                {/* Indicators */}
                <CellIndicators dateStr={dateStr} />
              </Pressable>
            );
          })}
        </View>
      </Animated.View>

      {/* Week View Section */}
      <Animated.View style={[weekStyle, styles.sectionAbsolute]}>
        <View
          ref={weekStripRef}
          onLayout={measureWeekStrip}
          style={styles.weekStripRow}
        >
          {weekDaysStrip.map((day) => {
            const isSelected = selectedDate === day.dateString;
            const isToday = day.dateString === getDateKey();
            return (
              <Pressable
                key={day.dateString}
                onPress={() => setSelectedDate(day.dateString)}
                style={styles.weekDayPressable}
              >
                <Text
                  style={[
                    styles.weekDayName,
                    {
                      color: isSelected ? colors.primary : colors.textMuted,
                    },
                  ]}
                >
                  {day.dayName}
                </Text>
                <View
                  style={[
                    styles.weekDayCircle,
                    {
                      backgroundColor: isSelected
                        ? colors.primary
                        : "transparent",
                      borderWidth: isToday && !isSelected ? 1.5 : 0,
                      borderColor: colors.primary,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: isSelected
                        ? "#FFFFFF"
                        : isToday
                          ? colors.primary
                          : colors.text,
                      fontSize: 13,
                      fontWeight: isSelected || isToday ? "800" : "500",
                    }}
                  >
                    {day.dayNum}
                  </Text>
                </View>

                {/* Indicators */}
                <CellIndicators dateStr={day.dateString} />
              </Pressable>
            );
          })}
        </View>
      </Animated.View>

      {/* Timeline View Section */}
      <Animated.View style={[timelineStyle, styles.sectionAbsolute]}>
        <View style={styles.timelineStripRow}>
          {weekDaysStrip.map((day) => {
            const isSelected = selectedDate === day.dateString;
            const isToday = day.dateString === getDateKey();
            return (
              <Pressable
                key={day.dateString}
                onPress={() => setSelectedDate(day.dateString)}
                style={styles.timelineDayPressable}
              >
                <Text
                  style={[
                    styles.timelineDayInitial,
                    {
                      color: isSelected ? colors.primary : colors.textMuted,
                    },
                  ]}
                >
                  {day.dayName.charAt(0)}
                </Text>
                <View
                  style={[
                    styles.timelineDayCircle,
                    {
                      backgroundColor: isSelected
                        ? colors.primary
                        : "transparent",
                      borderWidth: isToday && !isSelected ? 1.5 : 0,
                      borderColor: colors.primary,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: isSelected
                        ? "#FFFFFF"
                        : isToday
                          ? colors.primary
                          : colors.text,
                      fontSize: 13,
                      fontWeight: isSelected || isToday ? "700" : "500",
                    }}
                  >
                    {day.dayNum}
                  </Text>
                </View>
                <CellIndicators dateStr={day.dateString} />
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  navCard: {
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 10,
    position: "relative",
    overflow: "hidden",
  },
  sectionAbsolute: {
    position: "absolute",
    top: 8,
    left: 12,
    right: 12,
  },
  monthHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  chevronButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  monthTitleText: {
    fontSize: 14,
    fontWeight: "800",
  },
  weekdayHeaderRow: {
    flexDirection: "row",
    marginBottom: 4,
    paddingBottom: 4,
    borderBottomWidth: 1,
  },
  weekdayHeaderText: {
    flex: 1,
    textAlign: "center",
    fontSize: 9,
    fontWeight: "800",
  },
  monthDaysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 0,
  },
  emptyDayCell: {
    width: "14.28%",
    height: 30,
  },
  dayPressable: {
    width: "14.28%",
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCircle: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  indicatorRow: {
    flexDirection: "row",
    gap: 3,
    justifyContent: "center",
    marginTop: 3,
    alignItems: "center",
    minHeight: 4,
  },
  indicatorDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  weekStripRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  weekDayPressable: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    minHeight: 48,
  },
  weekDayName: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  weekDayCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineStripRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timelineDayPressable: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
    minHeight: 44,
  },
  timelineDayInitial: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  timelineDayCircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
