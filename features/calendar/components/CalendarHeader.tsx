import React from "react";
import { View, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { MONTH_NAMES, getDateKey } from "@/features/calendar/hooks/useCalendarState";
import { CalendarViewMode } from "@/features/calendar/types";

interface CalendarHeaderProps {
  calendarViewMode: CalendarViewMode;
  selectedDate: string;
  month: { year: number; month: number };
  colors: any;
  isLight: boolean;
  onToggleViewMode: () => void;
}

const VIEW_LABELS: Record<CalendarViewMode, string> = {
  month: "Month",
  week: "Week",
  timeline: "Day",
};

export const CalendarHeader: React.FC<CalendarHeaderProps> = ({
  calendarViewMode,
  selectedDate,
  month,
  colors,
  isLight,
  onToggleViewMode,
}) => {
  const d = new Date(selectedDate);
  const isToday = selectedDate === getDateKey();

  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const monthName = MONTH_NAMES[d.getMonth()];
  const dayNum = d.getDate();

  const contextLabel = isToday ? "Today" : `${monthName} ${dayNum}`;

  return (
    <View style={styles.headerRow}>
      <View style={styles.titleCol}>
        {/* Weekday — primary */}
        <Text style={[styles.weekday, { color: colors.text }]}>
          {weekday}
        </Text>
        {/* Month + day — secondary */}
        <Text style={[styles.monthDate, { color: colors.textMuted }]}>
          {monthName} {dayNum}
        </Text>
      </View>

      {/* View mode pill button */}
      <PressableScale
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onToggleViewMode();
        }}
        scaleTo={0.94}
        contentStyle={[
          styles.viewToggleButton,
          {
            backgroundColor: isLight
              ? "#F1F5F9"
              : "rgba(255,255,255,0.06)",
            borderColor: isLight ? colors.border : "rgba(255,255,255,0.1)",
          },
        ]}
      >
        <Text style={[styles.viewToggleLabel, { color: colors.primary }]}>
          {VIEW_LABELS[calendarViewMode]} ▾
        </Text>
      </PressableScale>
    </View>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingTop: 4,
    paddingBottom: 8,
  },
  titleCol: {
    flex: 1,
    paddingRight: 12,
  },
  weekday: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.3,
    lineHeight: 30,
  },
  monthDate: {
    fontSize: 14,
    fontWeight: "500",
    marginTop: 2,
  },
  viewToggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 4,
    alignSelf: "flex-start",
  },
  viewToggleLabel: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
});
