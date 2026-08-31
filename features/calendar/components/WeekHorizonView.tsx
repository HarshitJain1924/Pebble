import React, { useMemo } from "react";
import { View, ScrollView, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { getDateKey, WEEKDAY_NAMES, MONTH_NAMES } from "@/features/calendar/hooks/useCalendarState";
import { getCalendarItemType } from "@/features/calendar/types";
import { isRecurringOccurrenceForDate } from "@/services/scheduling/recurrence.service";
import { getStructuredSchedule } from "@/services/scheduling/scheduling.service";
import {
  isChecklistCompletedForDate,
  isHabitCompletedToday,
  isTaskCompleted,
} from "@/shared/utils/domain-selectors";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";

interface WeekHorizonViewProps {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  onSelectDayAndOpenTimeline: (date: string) => void;
  allTodos: any[];
  allHabits: any[];
  allChecklists: any[];
  onOpenItem: (item: any) => void;
  onPlanAtDate: (date: string) => void;
  colors: any;
  isLight: boolean;
}

const ACCENT: Record<string, string> = {
  task: "#6366F1",
  habit: "#10B981",
  checklist: "#3B82F6",
};

const CARD_BG_LIGHT: Record<string, string> = {
  task: "#F4F3FF",
  habit: "#F0FDF4",
  checklist: "#EFF6FF",
};

const CARD_BG_DARK: Record<string, string> = {
  task: "rgba(99, 102, 241, 0.12)",
  habit: "rgba(16, 185, 129, 0.12)",
  checklist: "rgba(59, 130, 246, 0.12)",
};

function formatTime(h: number, m: number): string {
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h >= 12 ? "PM" : "AM";
  const mStr = m < 10 ? `0${m}` : `${m}`;
  return `${displayH}:${mStr} ${ampm}`;
}

function formatDuration(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0) {
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }
  return `${mins}m`;
}

export const WeekHorizonView: React.FC<WeekHorizonViewProps> = React.memo(({
  selectedDate,
  setSelectedDate,
  onSelectDayAndOpenTimeline,
  allTodos,
  allHabits,
  allChecklists,
  onOpenItem,
  onPlanAtDate,
  colors,
  isLight,
}) => {
  // Compute the 7 days of the week containing selectedDate (starting Monday or Sunday)
  const weekDays = useMemo(() => {
    const current = new Date(selectedDate);
    const dayOfWeek = current.getDay(); // 0 is Sunday
    // Align week to start on Monday (diff = 1 for Monday, -6 for Sunday)
    const diff = current.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const startOfWeek = new Date(current);
    startOfWeek.setDate(diff);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const dateStr = getDateKey(d);

      // Extract tasks for this date
      const tasks = allTodos
        .filter((todo) => !todo.archivedAt && isRecurringOccurrenceForDate(todo, dateStr) && todo.schedule?.date !== "inbox")
        .map((todo) => {
          const sched = getStructuredSchedule(todo, 60);
          return {
            id: todo.id,
            title: todo.title,
            type: "task" as const,
            completed: isTaskCompleted(todo),
            startHour: sched.startTime?.hour,
            startMinute: sched.startTime?.minute,
            durationMinutes: sched.duration,
            priority: todo.priority,
          };
        });

      // Extract habits for this date
      const habits = allHabits
        .filter((habit) => !habit.archivedAt && isRecurringOccurrenceForDate(habit, dateStr))
        .map((habit) => {
          const sched = getStructuredSchedule(habit, 30);
          return {
            id: habit.id,
            title: habit.title,
            type: "habit" as const,
            completed: isHabitCompletedToday(habit, dateStr),
            startHour: sched.startTime?.hour,
            startMinute: sched.startTime?.minute,
            durationMinutes: sched.duration,
            priority: habit.priority,
          };
        });

      // Extract checklists for this date
      const checklists = allChecklists
        .filter((chk) => !chk.archivedAt && isRecurringOccurrenceForDate(chk, dateStr) && chk.schedule?.date !== "inbox")
        .map((chk) => {
          const sched = getStructuredSchedule(chk, 45);
          return {
            id: chk.id,
            title: chk.title,
            type: "checklist" as const,
            completed: isChecklistCompletedForDate(chk, dateStr),
            startHour: sched.startTime?.hour,
            startMinute: sched.startTime?.minute,
            durationMinutes: sched.duration,
            itemsCount: chk.items?.length || 0,
          };
        });

      const allItems = [...tasks, ...habits, ...checklists].sort((a, b) => {
        const timeA = a.startHour !== undefined ? a.startHour * 60 + (a.startMinute || 0) : 9999;
        const timeB = b.startHour !== undefined ? b.startHour * 60 + (b.startMinute || 0) : 9999;
        return timeA - timeB;
      });

      const timedItems = allItems.filter((it) => it.startHour !== undefined && it.startMinute !== undefined);
      const allDayItems = allItems.filter((it) => it.startHour === undefined || it.startMinute === undefined);

      const totalPlannedMinutes = timedItems.reduce((sum, it) => sum + (it.durationMinutes || 0), 0);

      days.push({
        dateString: dateStr,
        dayNum: d.getDate(),
        dayName: WEEKDAY_NAMES[d.getDay()],
        monthName: MONTH_NAMES[d.getMonth()],
        isToday: dateStr === getDateKey(),
        isSelected: dateStr === selectedDate,
        timedItems,
        allDayItems,
        totalItemsCount: allItems.length,
        totalPlannedMinutes,
      });
    }
    return days;
  }, [selectedDate, allTodos, allHabits, allChecklists]);

  // Overall weekly metrics
  const totalWeekItems = useMemo(() => {
    return weekDays.reduce((sum, d) => sum + d.totalItemsCount, 0);
  }, [weekDays]);

  const totalWeekMinutes = useMemo(() => {
    return weekDays.reduce((sum, d) => sum + d.totalPlannedMinutes, 0);
  }, [weekDays]);

  return (
    <View style={styles.container}>
      {/* 1. Week Overview Summary Card */}
      <View
        style={[
          styles.weekSummaryCard,
          {
            backgroundColor: isLight ? "#FFFFFF" : colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.summaryTopRow}>
          <View>
            <Text style={[styles.summaryTitle, { color: colors.text }]}>
              Weekly Capacity
            </Text>
            <Text style={[styles.summarySubtext, { color: colors.textMuted }]}>
              {totalWeekItems} scheduled · {formatDuration(totalWeekMinutes)} planned
            </Text>
          </View>
        </View>

        {/* 7-Day Capacity Indicator Bar */}
        <View style={styles.capacityBarRow}>
          {weekDays.map((d) => {
            const hasLoad = d.totalItemsCount > 0;
            const isSelected = d.isSelected;
            return (
              <Pressable
                key={d.dateString}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setSelectedDate(d.dateString);
                }}
                style={styles.capacityCol}
              >
                <Text
                  style={[
                    styles.capacityDayName,
                    { color: isSelected ? colors.primary : colors.textMuted },
                  ]}
                >
                  {d.dayName.charAt(0)}
                </Text>
                <View
                  style={[
                    styles.capacityDayCircle,
                    {
                      backgroundColor: isSelected
                        ? colors.primary
                        : "transparent",
                      borderWidth: d.isToday && !isSelected ? 1.5 : 0,
                      borderColor: colors.primary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.capacityDayNum,
                      {
                        color: isSelected
                          ? "#FFFFFF"
                          : d.isToday
                            ? colors.primary
                            : colors.text,
                      },
                    ]}
                  >
                    {d.dayNum}
                  </Text>
                </View>

                {/* Load pill/bar */}
                <View
                  style={[
                    styles.loadPill,
                    {
                      backgroundColor: isSelected
                        ? colors.primary
                        : hasLoad
                          ? isLight
                            ? `${colors.primary}35`
                            : `${colors.primary}60`
                          : isLight
                            ? "#E2E8F0"
                            : "rgba(255,255,255,0.08)",
                    },
                  ]}
                >
                  {hasLoad && (
                    <Text style={styles.loadCountText}>
                      {d.totalItemsCount}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* 2. Multi-Day Timeline Horizon List */}
      <View style={styles.dayCardsList}>
        {weekDays.map((day) => {
          const hasItems = day.totalItemsCount > 0;
          const isSelected = day.isSelected;

          return (
            <View
              key={day.dateString}
              style={[
                styles.dayCard,
                {
                  backgroundColor: isLight ? "#FFFFFF" : colors.card,
                  borderColor: isSelected
                    ? colors.primary
                    : colors.border,
                  borderWidth: isSelected ? 1.5 : 1,
                },
              ]}
            >
              {/* Day Header Row */}
              <View style={styles.dayCardHeader}>
                <Pressable
                  onPress={() => setSelectedDate(day.dateString)}
                  style={styles.dayTitleWrapper}
                >
                  <Text style={[styles.dayCardTitle, { color: colors.text }]}>
                    {day.dayName}, {day.monthName} {day.dayNum}
                  </Text>
                  {day.isToday && (
                    <View
                      style={[
                        styles.todayBadge,
                        {
                          backgroundColor: `${colors.primary}15`,
                          borderColor: `${colors.primary}30`,
                        },
                      ]}
                    >
                      <Text style={[styles.todayBadgeText, { color: colors.primary }]}>
                        Today
                      </Text>
                    </View>
                  )}
                </Pressable>

                <View style={styles.dayHeaderRight}>
                  {day.totalItemsCount > 0 ? (
                    <Text style={[styles.dayMetricsText, { color: colors.textMuted }]}>
                      {day.totalItemsCount} items · {formatDuration(day.totalPlannedMinutes)}
                    </Text>
                  ) : null}

                  {/* Gateway to open Day View for this date */}
                  <Pressable
                    onPress={() => onSelectDayAndOpenTimeline(day.dateString)}
                    hitSlop={8}
                    style={[
                      styles.zoomDayButton,
                      {
                        backgroundColor: isLight
                          ? "#F1F5F9"
                          : "rgba(255,255,255,0.06)",
                      },
                    ]}
                  >
                    <Feather name="arrow-right" size={13} color={colors.primary} />
                  </Pressable>
                </View>
              </View>

              {/* All-Day Items for this day */}
              {day.allDayItems.length > 0 && (
                <View style={styles.allDayChipsRow}>
                  {day.allDayItems.map((item) => {
                    const accent = ACCENT[item.type] || colors.primary;
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => onOpenItem(item)}
                        style={[
                          styles.weekAllDayChip,
                          {
                            backgroundColor: isLight ? "#F8FAFC" : "rgba(255,255,255,0.04)",
                            borderLeftColor: accent,
                            borderColor: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.allDayChipText,
                            { color: item.completed ? colors.textMuted : colors.text },
                          ]}
                          numberOfLines={1}
                        >
                          {item.type === "habit" ? "⚡ " : ""}{item.title}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {/* Scheduled Timed Items */}
              {day.timedItems.length > 0 ? (
                <View style={styles.timedItemsList}>
                  {day.timedItems.map((item) => {
                    const accent = item.completed ? colors.textMuted : (ACCENT[item.type] || colors.primary);
                    const bg = isLight
                      ? (CARD_BG_LIGHT[item.type] || CARD_BG_LIGHT.task)
                      : (CARD_BG_DARK[item.type] || CARD_BG_DARK.task);

                    const timeStr = formatTime(item.startHour!, item.startMinute!);
                    const durStr = formatDuration(item.durationMinutes);

                    return (
                      <PressableScale
                        key={item.id}
                        onPress={() => onOpenItem(item)}
                        scaleTo={0.98}
                        contentStyle={[
                          styles.timedItemRow,
                          {
                            backgroundColor: item.completed
                              ? isLight ? "#F1F5F9" : "rgba(255,255,255,0.02)"
                              : bg,
                            borderLeftColor: accent,
                            borderColor: isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.06)",
                            opacity: item.completed ? 0.55 : 1,
                          },
                        ]}
                      >
                        <View style={styles.timedItemLeft}>
                          <Text
                            style={[
                              styles.timedItemTitle,
                              { color: item.completed ? colors.textMuted : colors.text },
                            ]}
                            numberOfLines={1}
                          >
                            {item.type === "habit" ? "⚡ " : ""}{item.title}
                          </Text>
                          <Text
                            style={[
                              styles.timedItemMeta,
                              { color: item.completed ? colors.textMuted : accent },
                            ]}
                          >
                            {timeStr} · {durStr}
                          </Text>
                        </View>

                        <Feather name="chevron-right" size={14} color={colors.textMuted} />
                      </PressableScale>
                    );
                  })}
                </View>
              ) : !day.allDayItems.length ? (
                <View style={styles.emptyDayRow}>
                  <Text style={[styles.emptyDayText, { color: colors.textMuted }]}>
                    No scheduled items · Free day
                  </Text>
                  <Pressable
                    onPress={() => onPlanAtDate(day.dateString)}
                    hitSlop={8}
                  >
                    <Text style={[styles.planLinkText, { color: colors.primary }]}>
                      + Plan
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={{ height: 80 }} />
    </View>
  );
});

WeekHorizonView.displayName = "WeekHorizonView";

const styles = StyleSheet.create({
  container: {
    gap: 14,
    marginTop: 4,
  },
  weekSummaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  summaryTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  summarySubtext: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  capacityBarRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingTop: 4,
  },
  capacityCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  capacityDayName: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  capacityDayCircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  capacityDayNum: {
    fontSize: 12,
    fontWeight: "700",
  },
  loadPill: {
    width: 20,
    height: 12,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  loadCountText: {
    fontSize: 8,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  dayCardsList: {
    gap: 12,
  },
  dayCard: {
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  dayCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dayTitleWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  dayCardTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  todayBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
    borderWidth: 1,
  },
  todayBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  dayHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dayMetricsText: {
    fontSize: 11,
    fontWeight: "600",
  },
  zoomDayButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  allDayChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  weekAllDayChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderLeftWidth: 3,
  },
  allDayChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  timedItemsList: {
    gap: 6,
  },
  timedItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderLeftWidth: 3.5,
  },
  timedItemLeft: {
    flex: 1,
    gap: 2,
    marginRight: 8,
  },
  timedItemTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  timedItemMeta: {
    fontSize: 11,
    fontWeight: "600",
  },
  emptyDayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  emptyDayText: {
    fontSize: 12,
    fontWeight: "500",
    fontStyle: "italic",
  },
  planLinkText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
