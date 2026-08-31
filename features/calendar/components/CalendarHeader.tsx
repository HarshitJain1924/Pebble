import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
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
  onOpenQuickJump?: () => void;
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
  onOpenQuickJump,
}) => {
  const d = new Date(selectedDate);
  const isToday = selectedDate === getDateKey();

  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const monthName = MONTH_NAMES[d.getMonth()];
  const dayNum = d.getDate();

  // Compute week range for Week view
  const dayOfWeek = d.getDay();
  const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const startOfWeek = new Date(d);
  startOfWeek.setDate(diff);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  const startMonth = MONTH_NAMES[startOfWeek.getMonth()].slice(0, 3);
  const endMonth = MONTH_NAMES[endOfWeek.getMonth()].slice(0, 3);

  const weekRangeText =
    startOfWeek.getMonth() === endOfWeek.getMonth()
      ? `${startMonth} ${startOfWeek.getDate()} – ${endOfWeek.getDate()}, ${startOfWeek.getFullYear()}`
      : `${startMonth} ${startOfWeek.getDate()} – ${endMonth} ${endOfWeek.getDate()}, ${endOfWeek.getFullYear()}`;

  const headerTitle =
    calendarViewMode === "timeline"
      ? `${weekday}, ${monthName} ${dayNum}`
      : calendarViewMode === "week"
        ? weekRangeText
        : `${MONTH_NAMES[month.month]} ${month.year}`;

  const handleDatePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (onOpenQuickJump) {
      onOpenQuickJump();
    } else {
      onToggleViewMode();
    }
  };

  return (
    <View style={styles.headerRow}>
      <Pressable
        onPress={handleDatePress}
        style={styles.titleCol}
        accessibilityLabel={`Header: ${headerTitle}. Tap to jump to another date.`}
      >
        <View style={styles.dateLine}>
          <Text style={[styles.primaryDate, { color: colors.text }]}>
            {headerTitle}
          </Text>
          {calendarViewMode === "timeline" && isToday && (
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
      </Pressable>

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
    paddingBottom: 2,
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
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.3,
    lineHeight: 25,
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
