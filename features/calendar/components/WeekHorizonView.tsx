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
import { CalendarTimelineItem } from "@/features/calendar/types";
import {
  WEEK_HOUR_HEIGHT,
  WEEK_TIME_LABEL_WIDTH,
} from "@/features/calendar/utils/weekTimelineGeometry";
import { DraggedItemTimeTarget } from "@/features/calendar/utils/timelineDrag";
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
  isDragging?: boolean;
  hoveredDate?: string | null;
  hoveredHour?: number | null;
  hoveredMinute?: number | null;
  hoveredTargetTime?: DraggedItemTimeTarget | null;
  activeDragItem?: any;
  createPanGesture?: (item: any) => any;
  weekGridRef?: React.RefObject<View | null>;
  horizontalScrollRef?: React.RefObject<ScrollView | null>;
  onLayoutWeekGrid?: (
    dayColWidth?: number,
    scrollOffsetX?: number,
    weekMondayDateStr?: string,
  ) => void;
}

const HOUR_HEIGHT = WEEK_HOUR_HEIGHT; // 60px
const HOURS = Array.from({ length: 24 }, (_, i) => i); // 00:00 (12 AM) to 23:00 (11 PM)
const TIME_LABEL_WIDTH = WEEK_TIME_LABEL_WIDTH; // 50px

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
  isDragging = false,
  hoveredDate = null,
  hoveredHour = null,
  hoveredMinute = null,
  hoveredTargetTime = null,
  activeDragItem = null,
  createPanGesture,
  weekGridRef: propWeekGridRef,
  horizontalScrollRef: propHorizontalScrollRef,
  onLayoutWeekGrid,
}) => {
  const { width: windowWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState<number>(windowWidth - 28);
  const internalScrollRef = useRef<ScrollView>(null);
  const horizontalScrollRef = propHorizontalScrollRef || internalScrollRef;
  const internalGridRef = useRef<View>(null);
  const weekGridRef = propWeekGridRef || internalGridRef;

  const [currentPage, setCurrentPage] = useState(0);
  const scrollOffsetRef = useRef(0);

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
  const { weekDays, mondayDateStr } = useMemo(() => {
    const current = new Date(selectedDate);
    const dayOfWeek = current.getDay(); // 0 is Sunday
    const diff = current.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const startOfWeek = new Date(current);
    startOfWeek.setDate(diff);

    const monStr = getDateKey(startOfWeek);
    const days = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const dateStr = getDateKey(d);

      // Extract tasks for this date (preserving complete domain context)
      const tasks: CalendarTimelineItem[] = allTodos
        .filter((todo) => !todo.archivedAt && isRecurringOccurrenceForDate(todo, dateStr) && todo.schedule?.date !== "inbox")
        .map((todo) => {
          const sched = getStructuredSchedule(todo, 60);
          return {
            ...todo,
            id: todo.id,
            title: todo.title,
            type: "task" as const,
            workspaceId: todo.workspaceId,
            date: dateStr,
            completed: isTaskCompleted(todo),
            startHour: sched.startTime?.hour,
            startMinute: sched.startTime?.minute,
            durationMinutes: sched.duration,
            priority: todo.priority,
            recurrence: todo.recurrence,
            schedule: todo.schedule,
          };
        });

      // Extract habits for this date (preserving complete domain context)
      const habits: CalendarTimelineItem[] = allHabits
        .filter((habit) => !habit.archivedAt && isRecurringOccurrenceForDate(habit, dateStr))
        .map((habit) => {
          const sched = getStructuredSchedule(habit, 30);
          return {
            ...habit,
            id: habit.id,
            title: habit.title,
            type: "habit" as const,
            workspaceId: habit.workspaceId,
            date: dateStr,
            completed: isHabitCompletedToday(habit, dateStr),
            startHour: sched.startTime?.hour,
            startMinute: sched.startTime?.minute,
            durationMinutes: sched.duration,
            priority: habit.priority,
            streak: habit.streak || 0,
            frequency: habit.frequency,
            reminder: habit.reminder,
          };
        });

      // Extract checklists for this date (preserving complete domain context)
      const checklists: CalendarTimelineItem[] = allChecklists
        .filter((chk) => !chk.archivedAt && isRecurringOccurrenceForDate(chk, dateStr) && chk.schedule?.date !== "inbox")
        .map((chk) => {
          const sched = getStructuredSchedule(chk, 45);
          const totalItems = chk.items?.length || 0;
          const completedCount = getChecklistCompletedItemsCountForDate(chk, dateStr);
          return {
            ...chk,
            id: chk.id,
            title: chk.title,
            type: "checklist" as const,
            workspaceId: chk.workspaceId,
            date: dateStr,
            completed: isChecklistCompletedForDate(chk, dateStr),
            startHour: sched.startTime?.hour,
            startMinute: sched.startTime?.minute,
            durationMinutes: sched.duration,
            items: chk.items,
            itemsCount: totalItems,
            completedItemsCount: completedCount,
            recurrence: chk.recurrence,
            schedule: chk.schedule,
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
    return { weekDays: days, mondayDateStr: monStr };
  }, [selectedDate, allTodos, allHabits, allChecklists, todayDateStr]);

  // Notify parent of week grid measurements
  useEffect(() => {
    if (onLayoutWeekGrid) {
      onLayoutWeekGrid(dayColWidth, scrollOffsetRef.current, mondayDateStr);
    }
  }, [dayColWidth, mondayDateStr, onLayoutWeekGrid]);

  // Aggregate All-Day items across the week
  const allWeekAllDayItems = useMemo(() => {
    const list: Array<CalendarTimelineItem> = [];
    weekDays.forEach((d) => {
      d.allDayItems.forEach((it) => {
        list.push({ ...it, date: d.dateString });
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
  }, [selectedDate, weekDays, isTablet, visibleDaysCount, pageInterval, horizontalScrollRef]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    scrollOffsetRef.current = x;
    if (onLayoutWeekGrid) {
      onLayoutWeekGrid(dayColWidth, x, mondayDateStr);
    }
    if (isTablet) return;
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
                  key={`${item.date}-${item.id}`}
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
      <View
        ref={weekGridRef as any}
        style={[
          styles.spatialCanvasWrapper,
          {
            borderColor: isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)",
            backgroundColor: isLight ? "#FFFFFF" : "rgba(255,255,255,0.015)",
          },
        ]}
      >
        <View style={styles.timeGridFlexRow}>
          {/* Left Y-Axis Time Labels (24 Hours) */}
          <View
            style={[
              styles.timeLabelsCol,
              {
                width: TIME_LABEL_WIDTH,
                borderRightColor: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)",
              },
            ]}
          >
            {/* Header spacer to align with column date headers */}
            <View
              style={[
                styles.timeLabelHeaderSpacer,
                { borderBottomColor: isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)" },
              ]}
            />

            {HOURS.map((h) => {
              const isMajorHour = h === 0 || h === 6 || h === 12 || h === 18;
              return (
                <View key={h} style={[styles.timeLabelCell, { height: HOUR_HEIGHT }]}>
                  <Text
                    style={[
                      styles.timeLabelText,
                      {
                        color: isMajorHour ? colors.text : colors.textMuted,
                        fontWeight: isMajorHour ? "700" : "500",
                        opacity: isMajorHour ? 0.9 : 0.6,
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
            ref={horizontalScrollRef as any}
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
            {/* Background horizontal hour divider lines (Major vs Minor hierarchy) */}
            <View style={styles.gridLinesOverlay} pointerEvents="none">
              {HOURS.map((h, idx) => {
                const isMajor = h === 0 || h === 6 || h === 12 || h === 18;
                return (
                  <View
                    key={`line-${h}`}
                    style={[
                      styles.gridHourLine,
                      {
                        top: idx * HOUR_HEIGHT,
                        borderBottomColor: isMajor
                          ? isLight
                            ? "rgba(0,0,0,0.09)"
                            : "rgba(255,255,255,0.09)"
                          : isLight
                            ? "rgba(0,0,0,0.035)"
                            : "rgba(255,255,255,0.035)",
                      },
                    ]}
                  />
                );
              })}
            </View>

            {/* 7 Day Columns with Interactive Primary Day Headers */}
            {weekDays.map((day) => {
              const isToday = day.isToday;
              const isSelected = day.isSelected;
              const isHoveredDay = isDragging && hoveredDate === day.dateString;

              return (
                <View
                  key={day.dateString}
                  style={[
                    styles.dayGridCol,
                    {
                      width: dayColWidth,
                      borderRightColor: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)",
                      backgroundColor: isHoveredDay
                        ? isLight
                          ? "rgba(59, 130, 246, 0.03)"
                          : "rgba(59, 130, 246, 0.06)"
                        : "transparent",
                    },
                  ]}
                >
                  {/* Primary Day Navigation Header */}
                  <PressableScale
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      if (isSelected) {
                        onSelectDayAndOpenTimeline(day.dateString);
                      } else {
                        setSelectedDate(day.dateString);
                      }
                    }}
                    scaleTo={0.96}
                    contentStyle={[
                      styles.colHeader,
                      {
                        backgroundColor: isSelected
                          ? isLight ? `${colors.primary}12` : `${colors.primary}22`
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
                            : isToday
                              ? isLight ? `${colors.primary}15` : `${colors.primary}25`
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

                    {isSelected && (
                      <View style={styles.openDayAffordance}>
                        <Text style={[styles.openDayAffordanceText, { color: colors.primary }]}>
                          Open →
                        </Text>
                      </View>
                    )}
                  </PressableScale>

                  {/* Day Column Timeline Area covering full 24 hours */}
                  <View style={[styles.dayTimelineArea, { height: HOURS.length * HOUR_HEIGHT }]}>
                    {/* Render Scheduled Blocks with deterministic overlap columns & pan gestures */}
                    {day.timedItems.map((item) => (
                      <WeekTimelineItem
                        key={item.id}
                        item={item}
                        hourHeight={HOUR_HEIGHT}
                        colors={colors}
                        isLight={isLight}
                        onOpenItem={onOpenItem}
                        createPanGesture={createPanGesture}
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

                    {/* Live Drag & Drop Destination Guide */}
                    {isDragging && isHoveredDay && hoveredTargetTime && (
                      <View
                        style={[
                          styles.weekDropGuide,
                          {
                            top: (hoveredTargetTime.startMinutes / 60) * HOUR_HEIGHT,
                            height: Math.max(26, (hoveredTargetTime.durationMinutes / 60) * HOUR_HEIGHT),
                            backgroundColor: isLight ? "rgba(59, 130, 246, 0.12)" : "rgba(59, 130, 246, 0.22)",
                            borderColor: colors.primary,
                          },
                        ]}
                        pointerEvents="none"
                      >
                        <Text
                          style={[styles.weekDropGuideTime, { color: colors.primary }]}
                          numberOfLines={1}
                        >
                          {hoveredTargetTime.timeRangeLabel}
                        </Text>
                        {activeDragItem?.title && (
                          <Text
                            style={[
                              styles.weekDropGuideTitle,
                              { color: isLight ? "#1E293B" : "#F8FAFC" },
                            ]}
                            numberOfLines={1}
                          >
                            {activeDragItem.title}
                          </Text>
                        )}
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
  },
  timeGridFlexRow: {
    flexDirection: "row",
  },
  timeLabelsCol: {
    borderRightWidth: 1,
  },
  timeLabelHeaderSpacer: {
    height: 52,
    borderBottomWidth: 1,
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
    top: 52,
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
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    gap: 1.5,
    paddingVertical: 3,
  },
  colHeaderDayName: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  colHeaderNumCircle: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  colHeaderDayNum: {
    fontSize: 10.5,
  },
  openDayAffordance: {
    marginTop: -1,
  },
  openDayAffordanceText: {
    fontSize: 7.5,
    fontWeight: "700",
    letterSpacing: -0.1,
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
  weekDropGuide: {
    position: "absolute",
    left: 2,
    right: 2,
    borderRadius: 6,
    borderWidth: 1.5,
    borderStyle: "dashed",
    paddingHorizontal: 4,
    paddingVertical: 2,
    justifyContent: "center",
    zIndex: 30,
  },
  weekDropGuideTime: {
    fontSize: 8.5,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
  weekDropGuideTitle: {
    fontSize: 9.5,
    fontWeight: "700",
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
