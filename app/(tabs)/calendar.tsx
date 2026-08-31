import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Gesture } from "react-native-gesture-handler";

import { AppText as Text } from "@/shared/components/ui/AppText";
import {
  calculateInitialTimelineScrollOffset,
  getDateKey,
  useCalendarState,
} from "@/features/calendar/hooks/useCalendarState";
import { CalendarViewMode, getCalendarItemType } from "@/features/calendar/types";
import { CalendarHeader } from "@/features/calendar/components/CalendarHeader";
import { DayContextSummary } from "@/features/calendar/components/DayContextSummary";
import { DayPlannerView } from "@/features/calendar/components/DayPlannerView";
import { WeekHorizonView } from "@/features/calendar/components/WeekHorizonView";
import { MonthOverviewView } from "@/features/calendar/components/MonthOverviewView";
import { CalendarPlanningSheet } from "@/features/calendar/components/CalendarPlanningSheet";
import { QuickSlotSheet } from "@/features/calendar/components/QuickSlotSheet";
import { QuickJumpSheet } from "@/features/calendar/components/QuickJumpSheet";
import { CalendarFilterSheet } from "@/features/calendar/components/CalendarFilterSheet";

export default function CalendarScreen() {
  const {
    handleDragStart,
    router,
    colors,
    colorScheme,
    isLight,
    month,
    selectedDate,
    setSelectedDate,
    allTodos,
    allHabits,
    allChecklists,
    calendarViewMode,
    setCalendarViewMode,
    isDragging,
    activeDragItem,
    hoveredDate,
    hoveredHour,
    dragX,
    dragY,
    monthGridRef,
    weekStripRef,
    timelineGridRef,
    scrollRef,
    scrollYRef,
    measureMonthGrid,
    measureWeekStrip,
    measureTimelineGrid,
    handlePrevMonth,
    handleNextMonth,
    checkHoveredDate,
    handleDrop,
    floatingCardStyle,
    weekDaysStrip,
    allDayItems,
    timedItemsWithLayout,
    calendarCells,
    pendingTasks,
    pendingChecklists,
    freeTimeGaps,
    planTask,
    planChecklist,
  } = useCalendarState();

  // ─── Filters & Sheet Visibility States ────────────────────────────
  const [activeFilters, setActiveFilters] = useState<string[]>([
    "task",
    "habit",
    "checklist",
  ]);
  const [showCompleted, setShowCompleted] = useState<boolean>(true);
  const [showQuickJump, setShowQuickJump] = useState<boolean>(false);
  const [showFilter, setShowFilter] = useState<boolean>(false);
  const [quickSlotTask, setQuickSlotTask] = useState<any | null>(null);
  const [placeTaskTarget, setPlaceTaskTarget] = useState<{
    hour?: number;
    minute?: number;
    isAllDay?: boolean;
  } | null>(null);

  // ─── Initial Viewport Anchoring ──────────────────────────────────
  const hasInitialScrolledRef = useRef(false);
  const userScrolledRef = useRef(false);

  const performInitialScroll = useCallback(() => {
    if (hasInitialScrolledRef.current || userScrolledRef.current) return;
    hasInitialScrolledRef.current = true;

    const offset = calculateInitialTimelineScrollOffset({
      selectedDate,
      hourHeight: 80,
    });

    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: offset, animated: false });
    });
  }, [selectedDate, scrollRef]);

  // ─── Current Time Indicator (Live update every minute for Today) ──
  const isViewingToday = selectedDate === getDateKey();
  const [currentTime, setCurrentTime] = useState(() => {
    const now = new Date();
    return { hours: now.getHours(), minutes: now.getMinutes() };
  });

  useEffect(() => {
    if (!isViewingToday) return;

    const updateCurrentTime = () => {
      const now = new Date();
      setCurrentTime((prev) => {
        const hours = now.getHours();
        const minutes = now.getMinutes();
        if (prev.hours === hours && prev.minutes === minutes) return prev;
        return { hours, minutes };
      });
    };

    updateCurrentTime();
    const interval = setInterval(updateCurrentTime, 60000);
    return () => clearInterval(interval);
  }, [isViewingToday]);

  const handleOpenItem = (item: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const type = getCalendarItemType(item);
    if (type === "checklist") {
      router.push(`/checklist-details?id=${item.id}`);
    } else {
      router.push(
        `/task-details?id=${item.id}&type=${type}&date=${selectedDate}`,
      );
    }
  };

  // ─── Filtered Items ──────────────────────────────────────────────
  const filteredAllDayItems = useMemo(() => {
    return allDayItems.filter((item) => {
      const type = getCalendarItemType(item);
      if (!activeFilters.includes(type)) return false;
      if (!showCompleted && item.completed) return false;
      return true;
    });
  }, [allDayItems, activeFilters, showCompleted]);

  const filteredTimedItems = useMemo(() => {
    return timedItemsWithLayout.filter((item) => {
      const type = getCalendarItemType(item);
      if (!activeFilters.includes(type)) return false;
      if (!showCompleted && item.completed) return false;
      return true;
    });
  }, [timedItemsWithLayout, activeFilters, showCompleted]);

  const plannedMinutes = useMemo(() => {
    return filteredTimedItems.reduce(
      (sum, it) => sum + (it.durationMinutes || 0),
      0,
    );
  }, [filteredTimedItems]);

  const freeMinutes = useMemo(() => {
    return freeTimeGaps.reduce((sum, g) => sum + (g.durationMinutes || 0), 0);
  }, [freeTimeGaps]);

  useEffect(() => {
    if (calendarViewMode === "timeline") {
      performInitialScroll();
    }
  }, [calendarViewMode, performInitialScroll]);

  const handleToggleViewMode = () => {
    if (calendarViewMode === "month") {
      setCalendarViewMode("week");
    } else if (calendarViewMode === "week") {
      setCalendarViewMode("timeline");
    } else {
      setCalendarViewMode("month");
    }
  };

  // ─── Drag & Drop Pan Gesture ─────────────────────────────────────
  const lastCheckX = useSharedValue(0);
  const lastCheckY = useSharedValue(0);

  const createPanGesture = (item: any) => {
    return Gesture.Pan()
      .activateAfterLongPress(500)
      .onStart((e) => {
        lastCheckX.value = e.absoluteX;
        lastCheckY.value = e.absoluteY;
        runOnJS(handleDragStart)(item, e.absoluteX, e.absoluteY);
      })
      .onUpdate((e) => {
        dragX.value = e.absoluteX;
        dragY.value = e.absoluteY;

        // Manhattan distance check to throttle calls across the bridge to the JS thread
        const dx = Math.abs(e.absoluteX - lastCheckX.value);
        const dy = Math.abs(e.absoluteY - lastCheckY.value);
        if (dx > 8 || dy > 8) {
          lastCheckX.value = e.absoluteX;
          lastCheckY.value = e.absoluteY;
          runOnJS(checkHoveredDate)(e.absoluteX, e.absoluteY);
        }
      })
      .onEnd((e) => {
        runOnJS(handleDrop)(e.absoluteX, e.absoluteY);
      });
  };

  const totalItemsCount = filteredTimedItems.length + filteredAllDayItems.length;

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <Animated.View
        entering={FadeInDown.duration(450).springify()}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollRef}
          scrollEnabled={!isDragging}
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScrollBeginDrag={() => {
            userScrolledRef.current = true;
          }}
          onScroll={(e) => {
            scrollYRef.current = e.nativeEvent.contentOffset.y;
          }}
        >
          {/* 1. Header */}
          <CalendarHeader
            calendarViewMode={calendarViewMode}
            selectedDate={selectedDate}
            month={month}
            colors={colors}
            isLight={isLight}
            onToggleViewMode={handleToggleViewMode}
            onOpenQuickJump={() => setShowQuickJump(true)}
          />

          {/* ── 1. DAY VIEW ── */}
          {calendarViewMode === "timeline" && (
            <>
              {/* Day Context Summary */}
              <DayContextSummary
                scheduledCount={totalItemsCount}
                plannedMinutes={plannedMinutes}
                freeMinutes={freeMinutes}
                colors={colors}
                isLight={isLight}
              />

              {/* Agenda Quick Actions */}
              <View style={styles.agendaStrip}>
                <View style={styles.agendaLeft}>
                  {/* Quick Jump */}
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setShowQuickJump(true);
                    }}
                    style={[
                      styles.iconButton,
                      {
                        backgroundColor: isLight ? "#F1F5F9" : "rgba(255,255,255,0.05)",
                        borderColor: colors.border,
                      },
                    ]}
                    hitSlop={8}
                  >
                    <Feather name="compass" size={13} color={colors.textMuted} />
                  </Pressable>

                  {/* Filters */}
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setShowFilter(true);
                    }}
                    style={[
                      styles.iconButton,
                      {
                        backgroundColor: isLight ? "#F1F5F9" : "rgba(255,255,255,0.05)",
                        borderColor: colors.border,
                      },
                    ]}
                    hitSlop={8}
                  >
                    <Feather name="sliders" size={13} color={colors.textMuted} />
                  </Pressable>
                </View>

                {totalItemsCount > 0 && (
                  <Text style={[styles.itemCountText, { color: colors.textMuted }]}>
                    {totalItemsCount} item{totalItemsCount !== 1 ? "s" : ""}
                  </Text>
                )}
              </View>

              {/* 24-Hour Continuous Timeline */}
              <DayPlannerView
                timelineGridRef={timelineGridRef}
                onLayoutTimeline={() => {
                  measureTimelineGrid();
                  performInitialScroll();
                }}
                filteredAllDayItems={filteredAllDayItems}
                filteredTimedItems={filteredTimedItems}
                freeTimeGaps={freeTimeGaps}
                hasPendingItems={pendingTasks.length > 0 || pendingChecklists.length > 0}
                isViewingToday={isViewingToday}
                currentTime={currentTime}
                isDragging={isDragging}
                hoveredHour={hoveredHour}
                activeDragItem={activeDragItem}
                onPlanAllDay={() => setPlaceTaskTarget({ isAllDay: true })}
                onPlaceAtTime={(hour, minute) => setPlaceTaskTarget({ hour, minute })}
                onOpenItem={handleOpenItem}
                createPanGesture={createPanGesture}
                colors={colors}
                isLight={isLight}
              />
            </>
          )}

          {/* ── 2. WEEK VIEW ── */}
          {calendarViewMode === "week" && (
            <WeekHorizonView
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              onSelectDayAndOpenTimeline={(date) => {
                setSelectedDate(date);
                setCalendarViewMode("timeline");
              }}
              allTodos={allTodos}
              allHabits={allHabits}
              allChecklists={allChecklists}
              onOpenItem={handleOpenItem}
              onPlanAtDate={(date) => {
                setSelectedDate(date);
                setPlaceTaskTarget({ isAllDay: true });
              }}
              colors={colors}
              isLight={isLight}
            />
          )}

          {/* ── 3. MONTH VIEW ── */}
          {calendarViewMode === "month" && (
            <MonthOverviewView
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              onSelectDayAndOpenTimeline={(date) => {
                setSelectedDate(date);
                setCalendarViewMode("timeline");
              }}
              month={month}
              handlePrevMonth={handlePrevMonth}
              handleNextMonth={handleNextMonth}
              calendarCells={calendarCells}
              allTodos={allTodos}
              allHabits={allHabits}
              allChecklists={allChecklists}
              onOpenItem={handleOpenItem}
              onPlanAtDate={(date) => {
                setSelectedDate(date);
                setPlaceTaskTarget({ isAllDay: true });
              }}
              monthGridRef={monthGridRef}
              measureMonthGrid={measureMonthGrid}
              colors={colors}
              isLight={isLight}
            />
          )}
        </ScrollView>
      </Animated.View>

      {/* Floating Drag Overlay */}
      {isDragging && activeDragItem && (
        <Animated.View style={floatingCardStyle} pointerEvents="none">
          <View
            style={[
              styles.dragFloatingCard,
              {
                backgroundColor:
                  activeDragItem.type === "habit"
                    ? colors.warning
                    : colors.primary,
              },
            ]}
          >
            <Text style={styles.dragFloatingTime}>
              {activeDragItem.timeLabel || "All Day"}
            </Text>
            <Text style={styles.dragFloatingTitle} numberOfLines={1}>
              {activeDragItem.title}
            </Text>
          </View>
        </Animated.View>
      )}

      {/* ── SHEETS / MODALS ── */}
      <QuickJumpSheet
        visible={showQuickJump}
        onClose={() => setShowQuickJump(false)}
        onSelectDate={(date) => setSelectedDate(date)}
        colors={colors}
      />

      <CalendarFilterSheet
        visible={showFilter}
        activeFilters={activeFilters}
        setActiveFilters={setActiveFilters}
        showCompleted={showCompleted}
        setShowCompleted={setShowCompleted}
        onClose={() => setShowFilter(false)}
        colors={colors}
        isLight={isLight}
      />

      <QuickSlotSheet
        task={quickSlotTask}
        freeTimeGaps={freeTimeGaps}
        onClose={() => setQuickSlotTask(null)}
        onPlanTask={planTask}
        onPlanChecklist={planChecklist}
        colors={colors}
        isLight={isLight}
      />

      <CalendarPlanningSheet
        visible={!!placeTaskTarget}
        target={placeTaskTarget}
        pendingTasks={pendingTasks}
        pendingChecklists={pendingChecklists}
        onClose={() => setPlaceTaskTarget(null)}
        onPlanTask={planTask}
        onPlanChecklist={planChecklist}
        colors={colors}
        isLight={isLight}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === "android" ? 44 : 0,
  },
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
    paddingBottom: 110,
  },
  agendaStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 2,
    marginBottom: 2,
  },
  agendaLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  itemCountText: {
    fontSize: 12,
    fontWeight: "600",
  },
  dragFloatingCard: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  dragFloatingTime: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  dragFloatingTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
