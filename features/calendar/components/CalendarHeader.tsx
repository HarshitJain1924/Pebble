import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { MONTH_NAMES, getDateKey } from "@/features/calendar/hooks/useCalendarState";
import { CalendarViewMode } from "@/features/calendar/types";

import { Typography } from "@/shared/constants/typography";

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

  const subtitle =
    calendarViewMode === "timeline"
      ? `${weekday}, ${monthName} ${dayNum} · Daily schedule`
      : calendarViewMode === "week"
      ? `${weekRangeText} · Weekly horizon`
      : "Plan your days, own your time.";

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
        style={styles.header}
        accessibilityRole="header"
        accessibilityLabel={`Calendar: ${subtitle}. Tap to jump to another date.`}
      >
        <Text style={[styles.kicker, { color: colors.primary }]}>
          SCHEDULE
        </Text>
        <Text style={[styles.title, { color: colors.text }]}>
          Calendar
        </Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {subtitle}
        </Text>
      </Pressable>

      {/* View mode toggle pill */}
      <PressableScale
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onToggleViewMode();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Current view: ${VIEW_LABELS[calendarViewMode]}. Tap to toggle view mode.`}
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
  header: {
    gap: 4,
    flex: 1,
    paddingRight: 12,
  },
  kicker: {
    fontSize: Typography.sizes.xs,
    letterSpacing: 2,
    fontWeight: "700",
  },
  title: {
    fontSize: Typography.sizes.display,
    fontWeight: "700",
    lineHeight: 38,
  },
  subtitle: {
    fontSize: Typography.sizes.sm,
  },
  viewToggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  viewToggleLabel: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
