import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import {
  getDateKey,
  WEEKDAY_NAMES,
  MONTH_NAMES,
  calculateCurrentTimePosition,
  formatCurrentTimeLabel,
} from "@/features/calendar/hooks/useCalendarState";
import { getCalendarItemType } from "@/features/calendar/types";
import { isRecurringOccurrenceForDate } from "@/services/scheduling/recurrence.service";
import { getStructuredSchedule } from "@/services/scheduling/scheduling.service";
import {
  isChecklistCompletedForDate,
  isHabitCompletedToday,
  isTaskCompleted,
} from "@/shared/utils/domain-selectors";

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

const HOUR_HEIGHT = 64;
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6:00 AM to 11:00 PM (18 hours)
const TIME_LABEL_WIDTH = 48;
const SCREEN_WIDTH = Dimensions.get("window").width;
const VISIBLE_DAYS = 3;
const DAY_COLUMN_WIDTH = Math.floor((SCREEN_WIDTH - TIME_LABEL_WIDTH - 24) / VISIBLE_DAYS);

const ENTITY_ACCENT: Record<string, { main: string; lightBg: string; darkBg: string; icon: keyof typeof Feather.glyphMap }> = {
  task: {
    main: "#F59E0B",
    lightBg: "#FFFBEB",
    darkBg: "rgba(245, 158, 11, 0.18)",
    icon: "check-square",
  },
  habit: {
    main: "#10B981",
    lightBg: "#F0FDF4",
    darkBg: "rgba(16, 185, 129, 0.18)",
    icon: "rotate-cw",
  },
  checklist: {
    main: "#3B82F6",
    lightBg: "#EFF6FF",
    darkBg: "rgba(59, 130, 246, 0.18)",
    icon: "list",
  },
};

function formatHour(h: number): string {
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${displayH} ${ampm}`;
}

function formatBlockTime(h: number, m: number): string {
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const mStr = m < 10 ? `0${m}` : `${m}`;
  return `${displayH}:${mStr}`;
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
  const horizontalScrollRef = useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = useState(0);

  // Live Current Time
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const todayDateStr = getDateKey(now);
  const currentHours = now.getHours();
  const currentMinutes = now.getMinutes();

  // Compute 7 days of the week starting from Monday containing selectedDate
  const weekDays = useMemo(() => {
    const current = new Date(selectedDate);
    const dayOfWeek = current.getDay(); // 0 is Sunday
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

      days.push({
        dateString: dateStr,
        dayNum: d.getDate(),
        dayName: WEEKDAY_NAMES[d.getDay()],
        monthName: MONTH_NAMES[d.getMonth()],
        isToday: dateStr === todayDateStr,
        isSelected: dateStr === selectedDate,
        dayIndex: i,
        timedItems,
        allDayItems,
        taskCount: tasks.length,
        habitCount: habits.length,
        checklistCount: checklists.length,
        totalItemsCount: allItems.length,
      });
    }
    return days;
  }, [selectedDate, allTodos, allHabits, allChecklists, todayDateStr]);

  // Aggregate All-Day items across the week for top strip
  const allWeekAllDayItems = useMemo(() => {
    const list: Array<{ id: string; title: string; type: string; dateString: string; completed?: boolean }> = [];
    weekDays.forEach((d) => {
      d.allDayItems.forEach((it) => {
        list.push({ ...it, dateString: d.dateString });
      });
    });
    return list;
  }, [weekDays]);

  // Scroll to selected day index on load or date change
  useEffect(() => {
    const selectedIdx = weekDays.findIndex((d) => d.isSelected);
    if (selectedIdx !== -1 && horizontalScrollRef.current) {
      const targetScrollX = Math.max(0, Math.min(selectedIdx * DAY_COLUMN_WIDTH, (7 - VISIBLE_DAYS) * DAY_COLUMN_WIDTH));
      horizontalScrollRef.current.scrollTo({ x: targetScrollX, animated: true });
    }
  }, [selectedDate, weekDays]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const page = Math.round(x / (DAY_COLUMN_WIDTH * VISIBLE_DAYS));
    setCurrentPage(page);
  };

  const currentYPosition = (currentHours - 6) * HOUR_HEIGHT + (currentMinutes / 60) * HOUR_HEIGHT;
  const isCurrentTimeInRange = currentHours >= 6 && currentHours <= 23;

  return (
    <View style={styles.container}>
      {/* 1. Weekday Navigator Strip with Item Dots */}
      <View
        style={[
          styles.weekStripCard,
          {
            backgroundColor: isLight ? "#FFFFFF" : colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.stripRow}>
          {weekDays.map((d) => {
            const isSelected = d.isSelected;
            return (
              <Pressable
                key={d.dateString}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setSelectedDate(d.dateString);
                }}
                style={styles.stripCol}
              >
                <Text
                  style={[
                    styles.stripDayName,
                    { color: isSelected ? colors.primary : colors.textMuted },
                  ]}
                >
                  {d.dayName.charAt(0)}
                </Text>
                <View
                  style={[
                    styles.stripDayCircle,
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
                      styles.stripDayNum,
                      {
                        color: isSelected
                          ? "#FFFFFF"
                          : d.isToday
                            ? colors.primary
                            : colors.text,
                        fontWeight: isSelected || d.isToday ? "800" : "600",
                      },
                    ]}
                  >
                    {d.dayNum}
                  </Text>
                </View>

                {/* Entity Indicator Dots */}
                <View style={styles.indicatorDotsRow}>
                  {d.taskCount > 0 && (
                    <View style={[styles.indicatorDot, { backgroundColor: "#F59E0B" }]} />
                  )}
                  {d.habitCount > 0 && (
                    <View style={[styles.indicatorDot, { backgroundColor: "#10B981" }]} />
                  )}
                  {d.checklistCount > 0 && (
                    <View style={[styles.indicatorDot, { backgroundColor: "#3B82F6" }]} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* 2. All-Day Section on Top of Time Grid */}
      {allWeekAllDayItems.length > 0 && (
        <View
          style={[
            styles.allDayCard,
            {
              backgroundColor: isLight ? "#FFFFFF" : colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.allDaySectionLabel, { color: colors.textMuted }]}>
            All Day
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.allDayScrollRow}
          >
            {allWeekAllDayItems.map((item) => {
              const config = ENTITY_ACCENT[item.type] || ENTITY_ACCENT.task;
              return (
                <Pressable
                  key={`${item.dateString}-${item.id}`}
                  onPress={() => onOpenItem(item)}
                  style={[
                    styles.allDayChip,
                    {
                      backgroundColor: isLight ? config.lightBg : config.darkBg,
                      borderLeftColor: config.main,
                      borderColor: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)",
                    },
                  ]}
                >
                  <Feather name={config.icon} size={11} color={config.main} />
                  <Text
                    style={[styles.allDayChipText, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* 3. True Spatial Multi-Day Time Grid Canvas */}
      <View
        style={[
          styles.timeGridCard,
          {
            backgroundColor: isLight ? "#FFFFFF" : colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.timeGridWrapper}>
          {/* Left Y-Axis Time Labels */}
          <View style={styles.timeLabelsCol}>
            {HOURS.map((h) => (
              <View key={h} style={[styles.timeLabelCell, { height: HOUR_HEIGHT }]}>
                <Text style={[styles.timeLabelText, { color: colors.textMuted }]}>
                  {formatHour(h)}
                </Text>
              </View>
            ))}
          </View>

          {/* Horizontal Scrollable Multi-Day Columns Canvas */}
          <ScrollView
            ref={horizontalScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={handleScroll}
            contentContainerStyle={styles.daysScrollCanvas}
          >
            {/* Grid horizontal divider lines across the canvas */}
            <View style={styles.gridLinesOverlay} pointerEvents="none">
              {HOURS.map((h, idx) => (
                <View
                  key={`line-${h}`}
                  style={[
                    styles.gridHourLine,
                    {
                      top: idx * HOUR_HEIGHT,
                      borderBottomColor: isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)",
                    },
                  ]}
                />
              ))}
            </View>

            {/* 7 Day Columns */}
            {weekDays.map((day) => {
              const isToday = day.isToday;

              return (
                <View
                  key={day.dateString}
                  style={[
                    styles.dayGridCol,
                    {
                      width: DAY_COLUMN_WIDTH,
                      borderRightColor: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)",
                    },
                  ]}
                >
                  {/* Column Header */}
                  <Pressable
                    onPress={() => onSelectDayAndOpenTimeline(day.dateString)}
                    style={[
                      styles.colHeader,
                      {
                        backgroundColor: day.isSelected
                          ? isLight ? `${colors.primary}15` : `${colors.primary}25`
                          : "transparent",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.colHeaderTitle,
                        {
                          color: isToday
                            ? colors.primary
                            : day.isSelected
                              ? colors.text
                              : colors.textMuted,
                          fontWeight: isToday || day.isSelected ? "800" : "600",
                        },
                      ]}
                    >
                      {day.dayName} {day.dayNum}
                    </Text>
                  </Pressable>

                  {/* Day Column Timeline Area */}
                  <View style={[styles.dayTimelineArea, { height: HOURS.length * HOUR_HEIGHT }]}>
                    {/* Render Scheduled Blocks */}
                    {day.timedItems.map((item) => {
                      const startMinutes = (item.startHour ?? 0) * 60 + (item.startMinute ?? 0);
                      const top = Math.max(0, ((startMinutes - 6 * 60) / 60) * HOUR_HEIGHT);
                      const height = Math.max(28, (item.durationMinutes / 60) * HOUR_HEIGHT);

                      const config = ENTITY_ACCENT[item.type] || ENTITY_ACCENT.task;
                      const accent = item.completed ? colors.textMuted : config.main;
                      const bg = item.completed
                        ? isLight ? "#F1F5F9" : "rgba(255,255,255,0.03)"
                        : isLight
                          ? config.lightBg
                          : config.darkBg;

                      const timeStr = formatBlockTime(item.startHour!, item.startMinute!);

                      return (
                        <PressableScale
                          key={item.id}
                          onPress={() => onOpenItem(item)}
                          scaleTo={0.96}
                          contentStyle={[
                            styles.spatialBlock,
                            {
                              top,
                              height: height - 2,
                              backgroundColor: bg,
                              borderLeftColor: accent,
                              borderColor: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)",
                              opacity: item.completed ? 0.55 : 1,
                            },
                          ]}
                        >
                          <View style={styles.blockInner}>
                            <View style={styles.blockTitleRow}>
                              <Feather name={config.icon} size={10} color={accent} />
                              <Text
                                style={[
                                  styles.blockTitleText,
                                  { color: item.completed ? colors.textMuted : colors.text },
                                ]}
                                numberOfLines={height > 40 ? 2 : 1}
                              >
                                {item.title}
                              </Text>
                            </View>

                            {height >= 38 && (
                              <Text style={[styles.blockTimeText, { color: accent }]}>
                                {timeStr}
                              </Text>
                            )}
                          </View>
                        </PressableScale>
                      );
                    })}

                    {/* Red Current Time Line across Today's Column */}
                    {isToday && isCurrentTimeInRange && (
                      <View
                        style={[
                          styles.todayCurrentTimeLine,
                          { top: currentYPosition },
                        ]}
                        pointerEvents="none"
                      >
                        <View style={styles.todayCurrentTimeDot} />
                        <View style={styles.todayCurrentTimeBar} />
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>

        {/* 4. Canvas Pagination Footer */}
        <View style={styles.canvasFooter}>
          <Text style={[styles.swipeHintText, { color: colors.textMuted }]}>
            ← Swipe left/right to view more days →
          </Text>
          <View style={styles.paginationDots}>
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={[
                  styles.pageDot,
                  {
                    backgroundColor: currentPage === i
                      ? colors.primary
                      : isLight ? "#CBD5E1" : "rgba(255,255,255,0.15)",
                  },
                ]}
              />
            ))}
          </View>
        </View>
      </View>

      <View style={{ height: 80 }} />
    </View>
  );
});

WeekHorizonView.displayName = "WeekHorizonView";

const styles = StyleSheet.create({
  container: {
    gap: 12,
    marginTop: 4,
  },
  weekStripCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  stripRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stripCol: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  stripDayName: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  stripDayCircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  stripDayNum: {
    fontSize: 12,
  },
  indicatorDotsRow: {
    flexDirection: "row",
    gap: 2,
    height: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  indicatorDot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 1.75,
  },
  allDayCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    gap: 6,
  },
  allDaySectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  allDayScrollRow: {
    flexDirection: "row",
    gap: 6,
  },
  allDayChip: {
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
  timeGridCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  timeGridWrapper: {
    flexDirection: "row",
  },
  timeLabelsCol: {
    width: TIME_LABEL_WIDTH,
    borderRightWidth: 1,
    borderRightColor: "rgba(0,0,0,0.06)",
    paddingTop: 32, // Offset for column header height
  },
  timeLabelCell: {
    justifyContent: "flex-start",
    paddingTop: 2,
    paddingLeft: 6,
  },
  timeLabelText: {
    fontSize: 10,
    fontWeight: "600",
  },
  daysScrollCanvas: {
    flexDirection: "row",
  },
  gridLinesOverlay: {
    position: "absolute",
    top: 32,
    left: 0,
    right: 0,
    bottom: 0,
  },
  gridHourLine: {
    position: "absolute",
    left: 0,
    right: 0,
    borderBottomWidth: 1,
  },
  dayGridCol: {
    borderRightWidth: 1,
  },
  colHeader: {
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  colHeaderTitle: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
  dayTimelineArea: {
    position: "relative",
    paddingHorizontal: 2,
  },
  spatialBlock: {
    position: "absolute",
    left: 2,
    right: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderLeftWidth: 3,
    overflow: "hidden",
  },
  blockInner: {
    flex: 1,
    padding: 3,
    justifyContent: "center",
    gap: 1,
  },
  blockTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  blockTitleText: {
    fontSize: 10,
    fontWeight: "700",
    flex: 1,
  },
  blockTimeText: {
    fontSize: 9,
    fontWeight: "700",
  },
  todayCurrentTimeLine: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 20,
  },
  todayCurrentTimeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#EF4444",
  },
  todayCurrentTimeBar: {
    flex: 1,
    height: 1.5,
    backgroundColor: "#EF4444",
  },
  canvasFooter: {
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
  swipeHintText: {
    fontSize: 10,
    fontWeight: "500",
  },
  paginationDots: {
    flexDirection: "row",
    gap: 4,
  },
  pageDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});
