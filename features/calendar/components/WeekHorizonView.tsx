import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  LayoutChangeEvent,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import {
  getDateKey,
  WEEKDAY_NAMES,
  MONTH_NAMES,
} from "@/features/calendar/hooks/useCalendarState";
import { isRecurringOccurrenceForDate } from "@/services/scheduling/recurrence.service";
import { getStructuredSchedule } from "@/services/scheduling/scheduling.service";
import {
  getChecklistCompletedItemsCountForDate,
  isChecklistCompletedForDate,
  isHabitCompletedToday,
  isTaskCompleted,
} from "@/shared/utils/domain-selectors";
import { getCalendarEntityPresentation } from "@/features/calendar/constants/calendarEntityTokens";
import { calculateTimelineItemColumns } from "@/features/calendar/utils/timelineLayout";
import { WeekTimelineItem } from "./WeekTimelineItem";

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

const HOUR_HEIGHT = 60;
const HOURS = Array.from({ length: 24 }, (_, i) => i); // 00:00 (12 AM) to 23:00 (11 PM) - full 24-hour day coverage
const TIME_LABEL_WIDTH = 50;

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  if (h < 12) return `${h} AM`;
  return `${h - 12} PM`;
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
  const { width: windowWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState<number>(windowWidth - 28);
  const horizontalScrollRef = useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = useState(0);

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - containerWidth) > 2) {
      setContainerWidth(w);
    }
  }, [containerWidth]);

  // Responsive column sizing: 7 days on desktop/tablet, 3 days on mobile
  const isTablet = containerWidth >= 620;
  const visibleDaysCount = isTablet ? 7 : 3;
  const dayColWidth = Math.floor((containerWidth - TIME_LABEL_WIDTH) / visibleDaysCount);
  const totalPages = isTablet ? 1 : Math.ceil(7 / visibleDaysCount);
  const pageInterval = dayColWidth * visibleDaysCount;

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
            streak: habit.streak || 0,
          };
        });

      // Extract checklists for this date
      const checklists = allChecklists
        .filter((chk) => !chk.archivedAt && isRecurringOccurrenceForDate(chk, dateStr) && chk.schedule?.date !== "inbox")
        .map((chk) => {
          const sched = getStructuredSchedule(chk, 45);
          const totalItems = chk.items?.length || 0;
          const completedCount = getChecklistCompletedItemsCountForDate(chk, dateStr);
          return {
            id: chk.id,
            title: chk.title,
            type: "checklist" as const,
            completed: isChecklistCompletedForDate(chk, dateStr),
            startHour: sched.startTime?.hour,
            startMinute: sched.startTime?.minute,
            durationMinutes: sched.duration,
            itemsCount: totalItems,
            completedItemsCount: completedCount,
          };
        });

      const allItems = [...tasks, ...habits, ...checklists].sort((a, b) => {
        const timeA = a.startHour !== undefined ? a.startHour * 60 + (a.startMinute || 0) : 9999;
        const timeB = b.startHour !== undefined ? b.startHour * 60 + (b.startMinute || 0) : 9999;
        return timeA - timeB;
      });

      const rawTimedItems = allItems.filter((it) => it.startHour !== undefined && it.startMinute !== undefined);
      const allDayItems = allItems.filter((it) => it.startHour === undefined || it.startMinute === undefined);

      // Compute overlapping column layout for this day's timed items
      const timedItems = calculateTimelineItemColumns(rawTimedItems);

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
        totalItemsCount: allItems.length,
      });
    }
    return days;
  }, [selectedDate, allTodos, allHabits, allChecklists, todayDateStr]);

  // Aggregate All-Day items across the week
  const allWeekAllDayItems = useMemo(() => {
    const list: Array<{ id: string; title: string; type: string; dateString: string; completed?: boolean }> = [];
    weekDays.forEach((d) => {
      d.allDayItems.forEach((it) => {
        list.push({ ...it, dateString: d.dateString });
      });
    });
    return list;
  }, [weekDays]);

  // Scroll to selected day index page on date change
  useEffect(() => {
    if (isTablet) return;
    const selectedIdx = weekDays.findIndex((d) => d.isSelected);
    if (selectedIdx !== -1 && horizontalScrollRef.current) {
      const targetPage = Math.floor(selectedIdx / visibleDaysCount);
      const targetScrollX = targetPage * pageInterval;
      horizontalScrollRef.current.scrollTo({ x: targetScrollX, animated: true });
      setCurrentPage(targetPage);
    }
  }, [selectedDate, weekDays, isTablet, visibleDaysCount, pageInterval]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isTablet) return;
    const x = e.nativeEvent.contentOffset.x;
    const page = Math.round(x / pageInterval);
    if (page !== currentPage && page >= 0 && page < totalPages) {
      setCurrentPage(page);
    }
  };

  const handlePageDotPress = (page: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (horizontalScrollRef.current) {
      horizontalScrollRef.current.scrollTo({ x: page * pageInterval, animated: true });
      setCurrentPage(page);
    }
  };

  // Full 24-hour coordinate calculation for current time indicator
  const currentYPosition = (currentHours * 60 + currentMinutes) / 60 * HOUR_HEIGHT;

  return (
    <View style={styles.container} onLayout={onContainerLayout}>
      {/* 1. All-Day Section on Top of Time Grid */}
      {allWeekAllDayItems.length > 0 && (
        <View style={styles.allDayRow}>
          <Text style={[styles.allDaySectionLabel, { color: colors.textMuted }]}>
            All Day
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.allDayScrollRow}
          >
            {allWeekAllDayItems.map((item) => {
              const config = getCalendarEntityPresentation(item.type, isLight);
              return (
                <PressableScale
                  key={`${item.dateString}-${item.id}`}
                  onPress={() => onOpenItem(item)}
                  scaleTo={0.96}
                  contentStyle={[
                    styles.allDayChip,
                    {
                      backgroundColor: config.surface,
                      borderLeftColor: config.accent,
                      borderColor: isLight ? "rgba(0,0,0,0.06)" : config.borderColor,
                    },
                  ]}
                >
                  <Feather name={config.icon} size={11} color={config.accent} />
                  <Text
                    style={[styles.allDayChipText, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                </PressableScale>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* 2. True Spatial Multi-Day Time Grid Canvas */}
      <View style={styles.spatialCanvasWrapper}>
        <View style={styles.timeGridFlexRow}>
          {/* Left Y-Axis Time Labels (24 Hours) */}
          <View style={[styles.timeLabelsCol, { width: TIME_LABEL_WIDTH }]}>
            {/* Header spacer to align with column date headers */}
            <View style={styles.timeLabelHeaderSpacer} />

            {HOURS.map((h) => {
              const isKeyHour = h === 0 || h === 12;
              return (
                <View key={h} style={[styles.timeLabelCell, { height: HOUR_HEIGHT }]}>
                  <Text
                    style={[
                      styles.timeLabelText,
                      {
                        color: isKeyHour ? colors.text : colors.textMuted,
                        fontWeight: isKeyHour ? "700" : "500",
                      },
                    ]}
                  >
                    {formatHour(h)}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Horizontal Multi-Day Columns Canvas with 3-Day Snapped Paging */}
          <ScrollView
            ref={horizontalScrollRef}
            horizontal
            pagingEnabled={false}
            snapToInterval={pageInterval}
            snapToAlignment="start"
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={handleScroll}
            contentContainerStyle={[
              styles.daysScrollCanvas,
              { width: dayColWidth * 7 },
            ]}
          >
            {/* Background horizontal hour divider lines */}
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

            {/* 7 Day Columns with Interactive Primary Day Headers */}
            {weekDays.map((day) => {
              const isToday = day.isToday;
              const isSelected = day.isSelected;

              return (
                <View
                  key={day.dateString}
                  style={[
                    styles.dayGridCol,
                    {
                      width: dayColWidth,
                      borderRightColor: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)",
                    },
                  ]}
                >
                  {/* Primary Day Navigation Header */}
                  <PressableScale
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setSelectedDate(day.dateString);
                      onSelectDayAndOpenTimeline(day.dateString);
                    }}
                    scaleTo={0.96}
                    contentStyle={[
                      styles.colHeader,
                      {
                        backgroundColor: isSelected
                          ? isLight ? `${colors.primary}12` : `${colors.primary}20`
                          : isToday
                            ? isLight ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)"
                            : "transparent",
                        borderBottomColor: isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.colHeaderDayName,
                        {
                          color: isToday
                            ? colors.primary
                            : isSelected
                              ? colors.text
                              : colors.textMuted,
                        },
                      ]}
                    >
                      {day.dayName.toUpperCase()}
                    </Text>

                    <View
                      style={[
                        styles.colHeaderNumCircle,
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
                          styles.colHeaderDayNum,
                          {
                            color: isSelected
                              ? "#FFFFFF"
                              : isToday
                                ? colors.primary
                                : colors.text,
                            fontWeight: isToday || isSelected ? "800" : "600",
                          },
                        ]}
                      >
                        {day.dayNum}
                      </Text>
                    </View>
                  </PressableScale>

                  {/* Day Column Timeline Area covering full 24 hours */}
                  <View style={[styles.dayTimelineArea, { height: HOURS.length * HOUR_HEIGHT }]}>
                    {/* Render Scheduled Blocks with deterministic overlap columns */}
                    {day.timedItems.map((item) => (
                      <WeekTimelineItem
                        key={item.id}
                        item={item}
                        hourHeight={HOUR_HEIGHT}
                        colors={colors}
                        isLight={isLight}
                        onOpenItem={onOpenItem}
                      />
                    ))}

                    {/* Red Current Time Line spanning Today's Column */}
                    {isToday && (
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

        {/* 3. Pagination Footer on Mobile */}
        {!isTablet && totalPages > 1 && (
          <View style={styles.canvasFooter}>
            <Text style={[styles.swipeHintText, { color: colors.textMuted }]}>
              {currentPage === 0
                ? "Mon – Wed · Swipe for Thu – Sat →"
                : currentPage === 1
                  ? "← Thu – Sat · Swipe for Sun →"
                  : "← Sunday · Swipe for Mon – Wed"}
            </Text>
            <View style={styles.paginationDots}>
              {Array.from({ length: totalPages }, (_, i) => (
                <Pressable
                  key={i}
                  onPress={() => handlePageDotPress(i)}
                  hitSlop={8}
                  style={[
                    styles.pageDot,
                    {
                      backgroundColor: currentPage === i
                        ? colors.primary
                        : isLight ? "#CBD5E1" : "rgba(255,255,255,0.18)",
                      width: currentPage === i ? 14 : 5,
                    },
                  ]}
                />
              ))}
            </View>
          </View>
        )}
      </View>

      <View style={{ height: 80 }} />
    </View>
  );
});

WeekHorizonView.displayName = "WeekHorizonView";

const styles = StyleSheet.create({
  container: {
    gap: 8,
    marginTop: 2,
  },
  allDayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  allDaySectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderLeftWidth: 3,
  },
  allDayChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  spatialCanvasWrapper: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  timeGridFlexRow: {
    flexDirection: "row",
  },
  timeLabelsCol: {
    borderRightWidth: 1,
    borderRightColor: "rgba(0,0,0,0.06)",
  },
  timeLabelHeaderSpacer: {
    height: 48,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  timeLabelCell: {
    justifyContent: "flex-start",
    paddingTop: 2,
    paddingLeft: 4,
  },
  timeLabelText: {
    fontSize: 9.5,
    letterSpacing: 0.1,
  },
  daysScrollCanvas: {
    flexDirection: "row",
    position: "relative",
  },
  gridLinesOverlay: {
    position: "absolute",
    top: 48,
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
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    gap: 2,
    paddingVertical: 2,
  },
  colHeaderDayName: {
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  colHeaderNumCircle: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  colHeaderDayNum: {
    fontSize: 11,
  },
  dayTimelineArea: {
    position: "relative",
    paddingHorizontal: 2,
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
    width: 5,
    height: 5,
    borderRadius: 2.5,
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
    alignItems: "center",
  },
  pageDot: {
    height: 5,
    borderRadius: 2.5,
  },
});
