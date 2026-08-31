import React, { useMemo } from "react";
import { View, Pressable, StyleSheet, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import {
  MONTH_NAMES,
  WEEKDAY_NAMES,
  getDateKey,
} from "@/features/calendar/hooks/useCalendarState";
import { isRecurringOccurrenceForDate } from "@/services/scheduling/recurrence.service";
import { getStructuredSchedule } from "@/services/scheduling/scheduling.service";
import {
  isChecklistCompletedForDate,
  isHabitCompletedToday,
  isTaskCompleted,
} from "@/shared/utils/domain-selectors";
import { getCalendarEntityPresentation } from "@/features/calendar/constants/calendarEntityTokens";

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
  const { allDayItems, timedItems, totalItemsCount } = useMemo(() => {
    if (!selectedDate) return { allDayItems: [], timedItems: [], totalItemsCount: 0 };

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

    const all = [...tasks, ...habits, ...checklists].sort((a, b) => {
      const timeA = a.startHour !== undefined ? a.startHour * 60 + (a.startMinute || 0) : 9999;
      const timeB = b.startHour !== undefined ? b.startHour * 60 + (b.startMinute || 0) : 9999;
      return timeA - timeB;
    });

    const timed = all.filter((it) => it.startHour !== undefined && it.startMinute !== undefined);
    const allDay = all.filter((it) => it.startHour === undefined || it.startMinute === undefined);

    return { allDayItems: allDay, timedItems: timed, totalItemsCount: all.length };
  }, [selectedDate, allTodos, allHabits, allChecklists]);

  const parsedSelDate = new Date(selectedDate);
  const selectedWeekday = WEEKDAY_NAMES[parsedSelDate.getDay()];
  const selectedMonthName = MONTH_NAMES[parsedSelDate.getMonth()];
  const selectedDayNum = parsedSelDate.getDate();

  const taskConfig = getCalendarEntityPresentation("task", isLight);
  const habitConfig = getCalendarEntityPresentation("habit", isLight);
  const checklistConfig = getCalendarEntityPresentation("checklist", isLight);

  return (
    <View style={styles.container}>
      {/* 1. Month Calendar Grid Card */}
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
              return <View key={cell.key} style={styles.emptyDayCell} />;
            }

            const dateStr = cell.dateString || "";
            const isSelected = selectedDate === dateStr;
            const isToday = dateStr === getDateKey();
            const stats = getDateStats(dateStr);

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

                {/* Indicator Dots: Task (Amber), Habit (Green), Checklist (Blue) */}
                <View style={styles.indicatorRow}>
                  {stats.tasks > 0 && (
                    <View style={[styles.indicatorDot, { backgroundColor: taskConfig.accent }]} />
                  )}
                  {stats.habits > 0 && (
                    <View style={[styles.indicatorDot, { backgroundColor: habitConfig.accent }]} />
                  )}
                  {stats.checklists > 0 && (
                    <View style={[styles.indicatorDot, { backgroundColor: checklistConfig.accent }]} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* 2. Selected Date Agenda Card */}
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
            <Text style={[styles.agendaTitle, { color: colors.text }]}>
              Agenda for {selectedWeekday}, {selectedMonthName} {selectedDayNum}
            </Text>
            <Text style={[styles.agendaSubtext, { color: colors.textMuted }]}>
              {totalItemsCount} item{totalItemsCount !== 1 ? "s" : ""}
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
              Day View
            </Text>
            <Feather name="arrow-right" size={13} color={colors.primary} />
          </PressableScale>
        </View>

        {/* All-Day Items */}
        {allDayItems.length > 0 && (
          <View style={styles.allDayRow}>
            <Text style={[styles.allDayLabel, { color: colors.textMuted }]}>
              All Day
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.allDayChipsList}>
              {allDayItems.map((item) => {
                const config = getCalendarEntityPresentation(item.type, isLight);
                return (
                  <PressableScale
                    key={item.id}
                    onPress={() => onOpenItem(item)}
                    scaleTo={0.96}
                    contentStyle={[
                      styles.agendaAllDayChip,
                      {
                        backgroundColor: config.surface,
                        borderLeftColor: config.accent,
                        borderColor: isLight ? "rgba(0,0,0,0.06)" : config.borderColor,
                      },
                    ]}
                  >
                    <Feather name={config.icon} size={11} color={config.accent} />
                    <Text style={[styles.allDayChipText, { color: colors.text }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                  </PressableScale>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Timed Items List with Left Time Column */}
        {timedItems.length > 0 ? (
          <View style={styles.timedAgendaList}>
            {timedItems.map((item) => {
              const config = getCalendarEntityPresentation(item.type, isLight);
              const accent = item.completed ? colors.textMuted : config.accent;
              const bg = item.completed
                ? isLight ? "#F1F5F9" : "rgba(255,255,255,0.02)"
                : config.surface;

              const timeStr = formatTime(item.startHour!, item.startMinute!);
              const durStr = formatDuration(item.durationMinutes);

              return (
                <PressableScale
                  key={item.id}
                  onPress={() => onOpenItem(item)}
                  scaleTo={0.98}
                  contentStyle={styles.agendaItemContainer}
                >
                  {/* Left Time Column */}
                  <View style={styles.itemTimeCol}>
                    <Text style={[styles.itemTimeText, { color: colors.textMuted }]}>
                      {timeStr}
                    </Text>
                  </View>

                  {/* Item Card Body */}
                  <View
                    style={[
                      styles.itemCardBody,
                      {
                        backgroundColor: bg,
                        borderLeftColor: accent,
                        borderColor: isLight ? "rgba(0,0,0,0.05)" : config.borderColor,
                        opacity: item.completed ? 0.55 : 1,
                      },
                    ]}
                  >
                    <View style={styles.itemCardLeft}>
                      <View style={styles.itemTitleRow}>
                        <Feather name={config.icon} size={12} color={accent} />
                        <Text
                          style={[
                            styles.itemTitleText,
                            {
                              color: item.completed ? colors.textMuted : colors.text,
                              textDecorationLine: item.completed ? "line-through" : "none",
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {item.title}
                        </Text>
                      </View>
                      <Text style={[styles.itemDurationText, { color: accent }]}>
                        {durStr}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={14} color={colors.textMuted} />
                  </View>
                </PressableScale>
              );
            })}
          </View>
        ) : allDayItems.length === 0 ? (
          <View style={styles.emptyAgendaRow}>
            <Text style={[styles.emptyAgendaText, { color: colors.textMuted }]}>
              No items scheduled for this date.
            </Text>
          </View>
        ) : null}

        {/* Plan Something Button */}
        <PressableScale
          onPress={() => onPlanAtDate(selectedDate)}
          scaleTo={0.98}
          contentStyle={[
            styles.planSomethingButton,
            {
              borderColor: isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)",
            },
          ]}
        >
          <Feather name="plus" size={14} color={colors.primary} />
          <Text style={[styles.planSomethingText, { color: colors.primary }]}>
            + Plan something
          </Text>
        </PressableScale>
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
  agendaTitle: {
    fontSize: 15,
    fontWeight: "700",
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
  allDayRow: {
    gap: 6,
  },
  allDayLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  allDayChipsList: {
    flexDirection: "row",
    gap: 6,
  },
  agendaAllDayChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderLeftWidth: 3,
  },
  allDayChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  timedAgendaList: {
    gap: 8,
  },
  agendaItemContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  itemTimeCol: {
    width: 68,
  },
  itemTimeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  itemCardBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderLeftWidth: 3.5,
  },
  itemCardLeft: {
    flex: 1,
    gap: 2,
    marginRight: 6,
  },
  itemTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  itemTitleText: {
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  itemDurationText: {
    fontSize: 11,
    fontWeight: "600",
  },
  emptyAgendaRow: {
    paddingVertical: 12,
    alignItems: "center",
  },
  emptyAgendaText: {
    fontSize: 13,
    fontWeight: "500",
    fontStyle: "italic",
  },
  planSomethingButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    marginTop: 4,
  },
  planSomethingText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
