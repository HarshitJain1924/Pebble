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

  return (
    <View style={styles.headerRow}>
      <View style={styles.titleCol}>
        <View style={styles.dateLine}>
          <Text style={[styles.primaryDate, { color: colors.text }]}>
            {weekday}, {monthName} {dayNum}
          </Text>
          {isToday && (
            <View
              style={[
                styles.todayBadge,
                {
                  backgroundColor: isLight
                    ? `${colors.primary}15`
                    : `${colors.primary}25`,
                  borderColor: isLight
                    ? `${colors.primary}30`
                    : `${colors.primary}40`,
                },
              ]}
            >
              <Text style={[styles.todayBadgeText, { color: colors.primary }]}>
                Today
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* View mode toggle pill */}
      <PressableScale
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onToggleViewMode();
        }}
        scaleTo={0.95}
        contentStyle={[
          styles.viewToggleButton,
          {
            backgroundColor: isLight
              ? "#FFFFFF"
              : "rgba(255,255,255,0.06)",
            borderColor: isLight ? colors.border : "rgba(255,255,255,0.12)",
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
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 6,
  },
  titleCol: {
    flex: 1,
    paddingRight: 12,
  },
  dateLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  primaryDate: {
    fontSize: 21,
    fontWeight: "700",
    letterSpacing: -0.3,
    lineHeight: 26,
  },
  todayBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  todayBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  viewToggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  viewToggleLabel: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
