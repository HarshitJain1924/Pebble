import React, { useMemo } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import {
  MONTH_NAMES,
  WEEKDAY_NAMES,
  getDateKey,
} from "@/features/calendar/hooks/useCalendarState";
import { getCalendarItemType } from "@/features/calendar/types";
import { isRecurringOccurrenceForDate } from "@/services/scheduling/recurrence.service";
import { getStructuredSchedule } from "@/services/scheduling/scheduling.service";
import {
  isChecklistCompletedForDate,
  isHabitCompletedToday,
  isTaskCompleted,
} from "@/shared/utils/domain-selectors";

interface MonthOverviewViewProps {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  onSelectDayAndOpenTimeline: (date: string) => void;
  month: { year: number; month: number };
  handlePrevMonth: () => void;
  handleNextMonth: () => void;
  calendarCells: any[];
  allTodos: any[];
  allHabits: any[];
  allChecklists: any[];
  onOpenItem: (item: any) => void;
  onPlanAtDate: (date: string) => void;
  monthGridRef: React.RefObject<View | null>;
  measureMonthGrid: () => void;
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

export const MonthOverviewView: React.FC<MonthOverviewViewProps> = React.memo(({
  selectedDate,
  setSelectedDate,
  onSelectDayAndOpenTimeline,
  month,
  handlePrevMonth,
  handleNextMonth,
  calendarCells,
  allTodos,
  allHabits,
  allChecklists,
  onOpenItem,
  onPlanAtDate,
  monthGridRef,
  measureMonthGrid,
  colors,
  isLight,
}) => {
  // Compute indicator dots for each cell in month
  const getDateStats = (dateStr: string) => {
    if (!dateStr) return { tasks: 0, habits: 0, checklists: 0 };
    const tasks = allTodos.filter(
      (t) => !t.archivedAt && !isTaskCompleted(t) && isRecurringOccurrenceForDate(t, dateStr) && t.schedule?.date !== "inbox",
    ).length;
    const habits = allHabits.filter(
      (h) => !h.archivedAt && isRecurringOccurrenceForDate(h, dateStr),
    ).length;
    const checklists = allChecklists.filter(
      (c) => !c.archivedAt && !isChecklistCompletedForDate(c, dateStr) && isRecurringOccurrenceForDate(c, dateStr) && c.schedule?.date !== "inbox",
    ).length;
    return { tasks, habits, checklists };
  };

  // Agenda items for the currently selected date
  const selectedDateItems = useMemo(() => {
    if (!selectedDate) return [];

    const tasks = allTodos
      .filter((t) => !t.archivedAt && isRecurringOccurrenceForDate(t, selectedDate) && t.schedule?.date !== "inbox")
      .map((t) => {
        const sched = getStructuredSchedule(t, 60);
        return {
          id: t.id,
          title: t.title,
          type: "task" as const,
          completed: isTaskCompleted(t),
          startHour: sched.startTime?.hour,
          startMinute: sched.startTime?.minute,
          durationMinutes: sched.duration,
          priority: t.priority,
        };
      });

    const habits = allHabits
      .filter((h) => !h.archivedAt && isRecurringOccurrenceForDate(h, selectedDate))
      .map((h) => {
        const sched = getStructuredSchedule(h, 30);
        return {
          id: h.id,
          title: h.title,
          type: "habit" as const,
          completed: isHabitCompletedToday(h, selectedDate),
          startHour: sched.startTime?.hour,
          startMinute: sched.startTime?.minute,
          durationMinutes: sched.duration,
          priority: h.priority,
        };
      });

    const checklists = allChecklists
      .filter((c) => !c.archivedAt && isRecurringOccurrenceForDate(c, selectedDate) && c.schedule?.date !== "inbox")
      .map((c) => {
        const sched = getStructuredSchedule(c, 45);
        return {
          id: c.id,
          title: c.title,
          type: "checklist" as const,
          completed: isChecklistCompletedForDate(c, selectedDate),
          startHour: sched.startTime?.hour,
          startMinute: sched.startTime?.minute,
          durationMinutes: sched.duration,
          itemsCount: c.items?.length || 0,
        };
      });

    return [...tasks, ...habits, ...checklists].sort((a, b) => {
      const timeA = a.startHour !== undefined ? a.startHour * 60 + (a.startMinute || 0) : 9999;
      const timeB = b.startHour !== undefined ? b.startHour * 60 + (b.startMinute || 0) : 9999;
      return timeA - timeB;
    });
  }, [selectedDate, allTodos, allHabits, allChecklists]);

  const parsedSelDate = new Date(selectedDate);
  const selectedWeekday = WEEKDAY_NAMES[parsedSelDate.getDay()];
  const selectedMonthName = MONTH_NAMES[parsedSelDate.getMonth()];
  const selectedDayNum = parsedSelDate.getDate();
  const isSelectedToday = selectedDate === getDateKey();

  return (
    <View style={styles.container}>
      {/* 1. Month Calendar Card (Primary Surface) */}
      <View
        style={[
          styles.monthCard,
          {
            backgroundColor: isLight ? "#FFFFFF" : colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        {/* Month Navigation Row */}
        <View style={styles.monthHeaderRow}>
          <Pressable
            onPress={handlePrevMonth}
            hitSlop={8}
            style={[
              styles.navButton,
              {
                backgroundColor: isLight ? "#F1F5F9" : "rgba(255,255,255,0.06)",
                borderColor: colors.border,
              },
            ]}
          >
            <Feather name="chevron-left" size={16} color={colors.text} />
          </Pressable>

          <Text style={[styles.monthTitleText, { color: colors.text }]}>
            {MONTH_NAMES[month.month]} {month.year}
          </Text>

          <Pressable
            onPress={handleNextMonth}
            hitSlop={8}
            style={[
              styles.navButton,
              {
                backgroundColor: isLight ? "#F1F5F9" : "rgba(255,255,255,0.06)",
                borderColor: colors.border,
              },
            ]}
          >
            <Feather name="chevron-right" size={16} color={colors.text} />
          </Pressable>
        </View>

        {/* Weekday Initials Row */}
        <View
          style={[
            styles.weekdayHeaderRow,
            {
              borderBottomColor: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)",
            },
          ]}
        >
          {WEEKDAY_NAMES.map((name) => (
            <Text
              key={name}
              style={[styles.weekdayHeaderText, { color: colors.textMuted }]}
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
                <View key={cell.key} style={styles.emptyDayCell} />
              );
            }

            const dateStr = cell.dateString || "";
            const isSelected = selectedDate === dateStr;
            const isToday = dateStr === getDateKey();
            const stats = getDateStats(dateStr);
            const hasAny = stats.tasks > 0 || stats.habits > 0 || stats.checklists > 0;

            return (
              <Pressable
                key={cell.key}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setSelectedDate(dateStr);
                }}
                style={styles.dayPressable}
              >
                <View
                  style={[
                    styles.dayCircle,
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
                    style={[
                      styles.dayNumberText,
                      {
                        color: isSelected
                          ? "#FFFFFF"
                          : isToday
                            ? colors.primary
                            : colors.text,
                        fontWeight: isSelected || isToday ? "800" : "500",
                      },
                    ]}
                  >
                    {cell.dayNum}
                  </Text>
                </View>

                {/* Indicator Dots */}
                <View style={styles.indicatorRow}>
                  {stats.tasks > 0 && (
                    <View style={[styles.indicatorDot, { backgroundColor: "#6366F1" }]} />
                  )}
                  {stats.habits > 0 && (
                    <View style={[styles.indicatorDot, { backgroundColor: "#10B981" }]} />
                  )}
                  {stats.checklists > 0 && (
                    <View style={[styles.indicatorDot, { backgroundColor: "#3B82F6" }]} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* 2. Selected Date Agenda Section */}
      <View
        style={[
          styles.agendaCard,
          {
            backgroundColor: isLight ? "#FFFFFF" : colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.agendaHeaderRow}>
          <View style={styles.agendaTitleCol}>
            <View style={styles.agendaTitleLine}>
              <Text style={[styles.agendaTitle, { color: colors.text }]}>
                {selectedWeekday}, {selectedMonthName} {selectedDayNum}
              </Text>
              {isSelectedToday && (
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
            </View>
            <Text style={[styles.agendaSubtext, { color: colors.textMuted }]}>
              {selectedDateItems.length} item{selectedDateItems.length !== 1 ? "s" : ""} scheduled
            </Text>
          </View>

          {/* Open Day View Button */}
          <PressableScale
            onPress={() => onSelectDayAndOpenTimeline(selectedDate)}
            scaleTo={0.96}
            contentStyle={[
              styles.openDayButton,
              {
                backgroundColor: `${colors.primary}15`,
              },
            ]}
          >
            <Text style={[styles.openDayButtonText, { color: colors.primary }]}>
              Day Planner
            </Text>
            <Feather name="arrow-right" size={13} color={colors.primary} />
          </PressableScale>
        </View>

        {/* Items List */}
        {selectedDateItems.length > 0 ? (
          <View style={styles.agendaItemsList}>
            {selectedDateItems.map((item) => {
              const accent = item.completed ? colors.textMuted : (ACCENT[item.type] || colors.primary);
              const bg = isLight
                ? (CARD_BG_LIGHT[item.type] || CARD_BG_LIGHT.task)
                : (CARD_BG_DARK[item.type] || CARD_BG_DARK.task);

              const timeStr =
                item.startHour !== undefined && item.startMinute !== undefined
                  ? formatTime(item.startHour, item.startMinute)
                  : "All Day";

              return (
                <PressableScale
                  key={item.id}
                  onPress={() => onOpenItem(item)}
                  scaleTo={0.98}
                  contentStyle={[
                    styles.agendaItemRow,
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
                  <View style={styles.agendaItemLeft}>
                    <Text
                      style={[
                        styles.agendaItemTitle,
                        { color: item.completed ? colors.textMuted : colors.text },
                      ]}
                      numberOfLines={1}
                    >
                      {item.type === "habit" ? "⚡ " : ""}{item.title}
                    </Text>
                    <Text
                      style={[
                        styles.agendaItemMeta,
                        { color: item.completed ? colors.textMuted : accent },
                      ]}
                    >
                      {timeStr} · {item.durationMinutes}m
                    </Text>
                  </View>

                  <Feather name="chevron-right" size={14} color={colors.textMuted} />
                </PressableScale>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyAgendaRow}>
            <Text style={[styles.emptyAgendaText, { color: colors.textMuted }]}>
              No items scheduled for this date.
            </Text>
            <Pressable
              onPress={() => onPlanAtDate(selectedDate)}
              hitSlop={8}
            >
              <Text style={[styles.planLinkText, { color: colors.primary }]}>
                + Plan something
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={{ height: 80 }} />
    </View>
  );
});

MonthOverviewView.displayName = "MonthOverviewView";

const styles = StyleSheet.create({
  container: {
    gap: 14,
    marginTop: 4,
  },
  monthCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  monthHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  navButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  monthTitleText: {
    fontSize: 17,
    fontWeight: "700",
  },
  weekdayHeaderRow: {
    flexDirection: "row",
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  weekdayHeaderText: {
    flex: 1,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  monthDaysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 4,
  },
  emptyDayCell: {
    width: "14.28%",
    height: 38,
  },
  dayPressable: {
    width: "14.28%",
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  dayCircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  dayNumberText: {
    fontSize: 13,
  },
  indicatorRow: {
    flexDirection: "row",
    gap: 2.5,
    justifyContent: "center",
    alignItems: "center",
    height: 4,
  },
  indicatorDot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 1.75,
  },
  agendaCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  agendaHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  agendaTitleCol: {
    flex: 1,
    gap: 2,
  },
  agendaTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  agendaTitle: {
    fontSize: 16,
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
  agendaSubtext: {
    fontSize: 12,
    fontWeight: "500",
  },
  openDayButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  openDayButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  agendaItemsList: {
    gap: 8,
  },
  agendaItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderLeftWidth: 3.5,
  },
  agendaItemLeft: {
    flex: 1,
    gap: 2,
    marginRight: 8,
  },
  agendaItemTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  agendaItemMeta: {
    fontSize: 12,
    fontWeight: "600",
  },
  emptyAgendaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  emptyAgendaText: {
    fontSize: 13,
    fontWeight: "500",
    fontStyle: "italic",
  },
  planLinkText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
