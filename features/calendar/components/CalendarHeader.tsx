import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { Typography } from "@/shared/constants/typography";
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

export const CalendarHeader: React.FC<CalendarHeaderProps> = ({
  calendarViewMode,
  selectedDate,
  month,
  colors,
  isLight,
  onToggleViewMode,
}) => {
  const getHeaderTitle = () => {
    const d = new Date(selectedDate);
    const options: Intl.DateTimeFormatOptions = {
      weekday: "long",
      month: "long",
      day: "numeric",
    };
    return d.toLocaleDateString("en-US", options);
  };

  const getHeaderSubtitle = () => {
    const dateObj = new Date(selectedDate);
    if (calendarViewMode === "month") {
      return `${MONTH_NAMES[month.month]} ${month.year}`;
    } else if (calendarViewMode === "week") {
      const startOfWeek = new Date(dateObj);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);

      const startMonth = MONTH_NAMES[startOfWeek.getMonth()];
      const endMonth = MONTH_NAMES[endOfWeek.getMonth()];

      if (startMonth === endMonth) {
        return `${startMonth} ${startOfWeek.getDate()} – ${endOfWeek.getDate()}`;
      } else {
        return `${startMonth} ${startOfWeek.getDate()} – ${endMonth} ${endOfWeek.getDate()}`;
      }
    } else {
      const isTodayStr = selectedDate === getDateKey();
      return isTodayStr ? "Today" : "";
    }
  };

  return (
    <View style={styles.headerRow}>
      <View style={styles.titleCol}>
        <Text style={[styles.kicker, { color: colors.primary }]}>
          {calendarViewMode === "timeline" ? "DAILY PLANNER" : "SCHEDULE"}
        </Text>
        <Text style={[styles.title, { color: colors.text }]}>
          {getHeaderTitle()}
        </Text>
        {getHeaderSubtitle() ? (
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {getHeaderSubtitle()}
          </Text>
        ) : null}
      </View>

      <PressableScale
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onToggleViewMode();
        }}
        scaleTo={0.9}
        contentStyle={[
          styles.viewToggleButton,
          {
            backgroundColor: isLight ? "#F1F5F9" : "rgba(255,255,255,0.04)",
            borderColor: colors.border,
          },
        ]}
      >
        <Feather
          name={
            calendarViewMode === "month"
              ? "calendar"
              : calendarViewMode === "week"
                ? "list"
                : "clock"
          }
          size={16}
          color={colors.primary}
        />
      </PressableScale>
    </View>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
    marginTop: 4,
  },
  titleCol: {
    gap: 2,
    flex: 1,
    paddingRight: 16,
  },
  kicker: {
    fontSize: Typography.sizes.xs,
    letterSpacing: 2,
    fontWeight: "700",
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
  },
  viewToggleButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginTop: 2,
  },
});
