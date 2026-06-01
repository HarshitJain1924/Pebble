import React, { useMemo, useState } from "react";
import { StyleSheet,  View, Pressable } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { AppCard } from "../AppCard";

type HeatmapCalendarProps = {
  month: { year: number; month: number };
  history: any[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const getHeatColor = (score: number) => {
  if (score >= 90) return "#10B981"; // success green
  if (score >= 60) return "#3B82F6"; // indigo/blue secondary
  if (score >= 30) return "#F59E0B"; // orange/amber
  if (score > 0) return "#64748b";
  return "#27272A"; // dark gray track
};

export const HeatmapCalendar: React.FC<HeatmapCalendarProps & { transparent?: boolean }> = ({
  month,
  history,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  transparent = false,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isLight = colorScheme === "light";
  const [showMonthHeatmap, setShowMonthHeatmap] = useState(false);

  // Custom Calendar Month Grid Computation
  const calendarCells = useMemo(() => {
    const cells = [];
    const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
    const startOffset = new Date(month.year, month.month, 1).getDay();

    for (let i = 0; i < startOffset; i++) {
      cells.push({ type: "empty", key: `empty-${i}` });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${month.year}-${String(month.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({
        type: "day",
        dateString: dateKey,
        dayNum: d,
        key: `day-${d}`,
      });
    }
    return cells;
  }, [month]);

  return (
    <AppCard style={transparent ? [styles.collapsibleHeatmapCard, { backgroundColor: "transparent", borderWidth: 0, padding: 0, shadowOpacity: 0, elevation: 0, marginVertical: 0 }] : styles.collapsibleHeatmapCard}>
      <Pressable
        onPress={() => setShowMonthHeatmap(!showMonthHeatmap)}
        style={styles.collapsibleHeader}
      >
        <View style={styles.collapsibleTitleLeft}>
          <Feather name="activity" size={16} color={colors.primary} />
          <Text style={[styles.collapsibleTitleText, { color: colors.text }]}>
            Monthly Heatmap History
          </Text>
        </View>
        <Feather
          name={showMonthHeatmap ? "chevron-up" : "chevron-down"}
          size={18}
          color={colors.textMuted}
        />
      </Pressable>

      {showMonthHeatmap && (
        <Animated.View
          entering={FadeInDown.duration(300)}
          style={[styles.heatmapContent, { borderTopColor: colors.border }]}
        >
          {/* Custom Month Header Navigation */}
          <View style={styles.customCalendarHeader}>
            <Text style={[styles.monthLabel, { color: colors.text }]}>
              {MONTH_NAMES[month.month]} {month.year}
            </Text>
            <View style={styles.navArrows}>
              <Pressable
                onPress={onPrevMonth}
                style={[styles.arrowBtn, { borderColor: colors.border, backgroundColor: isLight ? "#F1F5F9" : "rgba(255, 255, 255, 0.02)" }]}
              >
                <Feather name="chevron-left" size={18} color={colors.textMuted} />
              </Pressable>
              <Pressable
                onPress={onNextMonth}
                style={[styles.arrowBtn, { borderColor: colors.border, backgroundColor: isLight ? "#F1F5F9" : "rgba(255, 255, 255, 0.02)" }]}
              >
                <Feather name="chevron-right" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
          </View>

          {/* Custom Weekday Labels */}
          <View style={[styles.weekdaysHeader, { borderBottomColor: colors.border }]}>
            {WEEKDAY_NAMES.map((name) => (
              <Text key={name} style={[styles.weekdayLabel, { color: colors.textMuted }]}>
                {name.slice(0, 1)}
              </Text>
            ))}
          </View>

          {/* Custom Days Grid */}
          <View style={styles.calendarGrid}>
            {calendarCells.map((cell) => {
              if (cell.type === "empty") {
                return (
                  <View key={cell.key} style={styles.dayCellPlaceholder} />
                );
              }

              const dateStr = cell.dateString || "";
              const isSelected = selectedDate === dateStr;

              const entry = history.find((h) => h.date === dateStr);
              const dayScore = entry ? entry.score : 0;
              const heatBgColor =
                dayScore > 0
                  ? getHeatColor(dayScore)
                  : "transparent";

              return (
                <Pressable
                  key={cell.key}
                  onPress={() => onSelectDate(dateStr)}
                  style={styles.dayCellContainer}
                >
                  <View
                    style={[
                      styles.dayBadgeCircle,
                      { backgroundColor: heatBgColor },
                      isSelected && {
                        borderColor: colors.primary,
                        borderWidth: 1.8,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNumText,
                        {
                          color: dayScore > 0
                            ? "#ffffff"
                            : isSelected
                              ? colors.text
                              : colors.textMuted,
                          fontWeight: isSelected || dayScore > 0 ? "700" : "500",
                        },
                      ]}
                    >
                      {cell.dayNum}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Legend Row */}
          <View style={styles.legendWrapperInside}>
            <View style={styles.legendRow}>
              <View style={[styles.legendSwatch, { backgroundColor: "#10B981" }]} />
              <Text style={[styles.legendText, { color: colors.textMuted }]}>90%+</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendSwatch, { backgroundColor: "#3B82F6" }]} />
              <Text style={[styles.legendText, { color: colors.textMuted }]}>60%+</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendSwatch, { backgroundColor: "#F59E0B" }]} />
              <Text style={[styles.legendText, { color: colors.textMuted }]}>30%+</Text>
            </View>
          </View>
        </Animated.View>
      )}
    </AppCard>
  );
};

const styles = StyleSheet.create({
  collapsibleHeatmapCard: {
    padding: 16,
    borderRadius: 22,
    marginVertical: 6,
  },
  collapsibleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  collapsibleTitleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  collapsibleTitleText: {
    fontSize: 14,
    fontWeight: "700",
  },
  heatmapContent: {
    marginTop: 14,
    borderTopWidth: 1,
    paddingTop: 14,
    gap: 14,
  },
  customCalendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: "800",
  },
  navArrows: {
    flexDirection: "row",
    gap: 8,
  },
  arrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  weekdaysHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    paddingBottom: 6,
  },
  weekdayLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 6,
  },
  dayCellPlaceholder: {
    width: "14.28%",
    aspectRatio: 1,
  },
  dayCellContainer: {
    width: "14.28%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  dayBadgeCircle: {
    width: "90%",
    height: "90%",
    borderRadius: 999,
    justifyContent: "center",
    alignItems: "center",
  },
  dayNumText: {
    fontSize: 11,
  },
  legendWrapperInside: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 6,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendSwatch: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    fontWeight: "600",
  },
});
