import { Feather } from "@expo/vector-icons";
import React, { useState, useMemo, useEffect } from "react";
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
  Alert,
} from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";
import Animated, {
  FadeInDown,
  runOnJS,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";

import { Typography } from "@/shared/constants/typography";
import * as Haptics from "expo-haptics";
import {
  useCalendarState,
  WEEKDAY_NAMES,
  MONTH_NAMES,
  getDateKey,
} from "@/features/calendar/hooks/useCalendarState";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import { isTaskCompleted } from "@/shared/utils/domain-selectors";
import { isRecurringOccurrenceForDate } from "@/services/scheduling/recurrence.service";

import { historyForDate } from "@/services/analytics/productivity-history.service";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import PressableScale from "@/shared/components/ui/PressableScale";
import Svg, { Rect, Path, Line, Circle } from "react-native-svg";
import { AnimatedOverlay } from "@/shared/components/ui/AnimatedOverlay";

export default function CalendarScreen() {
  const [optimalHours, setOptimalHours] = React.useState<number[]>([]);
  const [peakZone, setPeakZone] = React.useState<string>("Balanced Flow");

  React.useEffect(() => {
    async function loadOptimalHours() {
      try {
        const { getOptimalHours, getCognitiveFlowStats } = require("@/features/capture/services/cognitive-flow.service");
        const hours = await getOptimalHours();
        const stats = await getCognitiveFlowStats();
        setOptimalHours(hours);
        setPeakZone(stats.peakZone);
      } catch (e) {
        console.warn("Failed to load optimal hours for calendar:", e);
      }
    }
    loadOptimalHours();
  }, []);

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
    history,
    selectedHistory,
    lists,

    calendarViewMode,
    setCalendarViewMode,
    isDragging,
    setIsDragging,
    activeDragItem,
    setActiveDragItem,
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
    headerDateLabel,
    checkHoveredDate,
    handleDrop,
    handleCancelDrag,
    floatingCardStyle,
    weekDaysStrip,
    timelineItems,
    allDayItems,
    timedItemsWithLayout,
    calendarCells,
  } = useCalendarState();

  // ─── Filters & Custom States ──────────────────────────────────────
  const [activeFilters, setActiveFilters] = useState<string[]>([
    "task",
    "habit",
    "checklist",
    "event",
    "focus",
    "resource",
  ]);
  const [showCompleted, setShowCompleted] = useState<boolean>(true);
  const [showQuickJump, setShowQuickJump] = useState<boolean>(false);
  const [showFilter, setShowFilter] = useState<boolean>(false);
  const [showQuickCreate, setShowQuickCreate] = useState<boolean>(false);

  const getItemType = (item: any) => {
    if (item.type === "habit") return "habit";
    if (item.categoryId === "focus" || item.category === "focus") return "focus";
    if (item.categoryId === "learning" || item.category === "learning") return "resource";
    if ((item.schedule?.startTime && item.schedule?.endTime) || item.categoryId === "travel" || item.categoryId === "creative") return "event";
    if (item.categoryId === "home" || item.category === "home" || (item.items && item.items.length > 0)) return "checklist";
    return "task";
  };

  const getDateIndicatorStats = (dateStr: string) => {
    if (!dateStr) return { tasks: 0, habits: 0, events: 0, focus: 0 };
    const dayTasks = allTodos.filter(t => t.schedule?.date === dateStr && !t.archivedAt && !isTaskCompleted(t));
    
    const tasks = dayTasks.filter(t => !(t.schedule?.startTime && t.schedule?.endTime) && t.categoryId !== "focus" && t.categoryId !== "learning" && t.categoryId !== "travel" && t.categoryId !== "creative").length;
    const events = dayTasks.filter(t => (t.schedule?.startTime && t.schedule?.endTime) || t.categoryId === "travel" || t.categoryId === "creative").length;
    const focus = dayTasks.filter(t => t.categoryId === "focus" || t.category === "focus").length;
    
    const habits = allHabits.filter(h => isRecurringOccurrenceForDate(h, dateStr)).length;

    return { tasks, habits, events, focus };
  };

  // Custom Indicators Component
  const CellIndicators = ({ dateStr }: { dateStr: string }) => {
    const stats = getDateIndicatorStats(dateStr);
    const hasAny = stats.tasks > 0 || stats.habits > 0 || stats.events > 0 || stats.focus > 0;
    if (!hasAny) return null;

    return (
      <View style={{ flexDirection: "row", gap: 3, justifyContent: "center", marginTop: 2, alignItems: "center" }}>
        {stats.tasks > 0 && (
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: "#6C63FF" }} />
        )}
        {stats.habits > 0 && (
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: "#10B981" }} />
        )}
        {stats.events > 0 && (
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: "#F59E0B" }} />
        )}
        {stats.focus > 0 && (
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: "#EC4899" }} />
        )}
      </View>
    );
  };

  // ─── Filtered Items ──────────────────────────────────────────────
  const filteredAllDayItems = useMemo(() => {
    return allDayItems.filter((item) => {
      const type = getItemType(item);
      if (!activeFilters.includes(type)) return false;
      if (!showCompleted && item.completed) return false;
      return true;
    });
  }, [allDayItems, activeFilters, showCompleted]);

  const filteredTimedItems = useMemo(() => {
    return timedItemsWithLayout.filter((item) => {
      const type = getItemType(item);
      if (!activeFilters.includes(type)) return false;
      if (!showCompleted && item.completed) return false;
      return true;
    });
  }, [timedItemsWithLayout, activeFilters, showCompleted]);

  // ─── Free Time Calculator ─────────────────────────────────────────
  const freeTimeGaps = useMemo(() => {
    const timed = timelineItems.filter(
      (item) => item.reminderHour !== undefined && item.reminderMinute !== undefined
    );
    const sorted = [...timed].sort((a, b) => {
      const startA = a.reminderHour! * 60 + a.reminderMinute!;
      const startB = b.reminderHour! * 60 + b.reminderMinute!;
      return startA - startB;
    });

    const gaps = [];
    let currentStart = 8 * 60; // 8 AM
    const dayEnd = 22 * 60; // 10 PM

    for (const item of sorted) {
      const start = item.reminderHour! * 60 + item.reminderMinute!;
      const end = start + (item.durationMinutes || 60);

      if (start > currentStart) {
        const gapDuration = start - currentStart;
        if (gapDuration >= 30) {
          gaps.push({
            startMinutes: currentStart,
            durationMinutes: gapDuration,
          });
        }
      }
      if (end > currentStart) {
        currentStart = end;
      }
    }

    if (dayEnd > currentStart) {
      const gapDuration = dayEnd - currentStart;
      if (gapDuration >= 30) {
        gaps.push({
          startMinutes: currentStart,
          durationMinutes: gapDuration,
        });
      }
    }

    return gaps;
  }, [timelineItems]);

  // ─── Switcher & Calendar Morph Animations ──────────────────────────
  const getHeaderTitle = () => {
    const d = new Date(selectedDate);
    const options: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" };
    return d.toLocaleDateString("en-US", options);
  };

  const getHeaderSubtitle = () => {
    const dateObj = new Date(selectedDate);
    if (calendarViewMode === "month") {
      return `${MONTH_NAMES[month.month]} ${month.year}`;
    } else if (calendarViewMode === "week") {
      const startOfWeek = new Date(dateObj);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);

      const startMonth = MONTH_NAMES[startOfWeek.getMonth()];
      const endMonth = MONTH_NAMES[endOfWeek.getMonth()];

      if (startMonth === endMonth) {
        return `${startMonth} ${startOfWeek.getDate()} – ${endOfWeek.getDate()}`;
      } else {
        return `${startMonth} ${startOfWeek.getDate()} – ${endMonth} ${endOfWeek.getDate()}`;
      }
    } else {
      const isTodayStr = selectedDate === getDateKey();
      return isTodayStr ? "Today" : "";
    }
  };

  const activeTabX = useSharedValue(0);
  const calendarHeight = useSharedValue(260);
  const opacityMonth = useSharedValue(1);
  const opacityWeek = useSharedValue(0);
  const opacityTimeline = useSharedValue(0);

  useEffect(() => {
    if (calendarViewMode === "month") {
      activeTabX.value = 0;
      calendarHeight.value = withTiming(260, { duration: 220, easing: Easing.bezier(0.25, 1, 0.5, 1) });
      opacityMonth.value = withTiming(1, { duration: 150 });
      opacityWeek.value = withTiming(0, { duration: 100 });
      opacityTimeline.value = withTiming(0, { duration: 100 });
    } else if (calendarViewMode === "week") {
      activeTabX.value = 1;
      calendarHeight.value = withTiming(84, { duration: 220, easing: Easing.bezier(0.25, 1, 0.5, 1) });
      opacityMonth.value = withTiming(0, { duration: 100 });
      opacityWeek.value = withTiming(1, { duration: 150 });
      opacityTimeline.value = withTiming(0, { duration: 100 });
    } else {
      activeTabX.value = 2;
      calendarHeight.value = withTiming(0, { duration: 220, easing: Easing.bezier(0.25, 1, 0.5, 1) });
      opacityMonth.value = withTiming(0, { duration: 100 });
      opacityWeek.value = withTiming(0, { duration: 100 });
      opacityTimeline.value = withTiming(1, { duration: 150 });
    }
  }, [calendarViewMode]);

  const activePillStyle = useAnimatedStyle(() => {
    const tabWidth = 260 / 3;
    const lineOffset = (tabWidth - 50) / 2;
    return {
      transform: [{ translateX: withSpring(activeTabX.value * tabWidth + lineOffset, { stiffness: 140, damping: 15 }) }],
    };
  });

  const monthStyle = useAnimatedStyle(() => {
    return {
      opacity: opacityMonth.value,
      display: opacityMonth.value > 0.01 ? "flex" : "none",
    };
  });

  const weekStyle = useAnimatedStyle(() => {
    return {
      opacity: opacityWeek.value,
      display: opacityWeek.value > 0.01 ? "flex" : "none",
    };
  });

  const timelineStyle = useAnimatedStyle(() => {
    return {
      opacity: opacityTimeline.value,
      display: opacityTimeline.value > 0.01 ? "flex" : "none",
    };
  });

  const hoursRange = Array.from({ length: 24 }, (_, i) => i); // 00:00 to 23:00

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
        // Pass final coordinates to handleDrop for final exact bounds checking before drop persistence
        runOnJS(handleDrop)(e.absoluteX, e.absoluteY);
      });
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <Animated.View entering={FadeInDown.duration(450).springify()} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          scrollEnabled={!isDragging}
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(e) => {
            scrollYRef.current = e.nativeEvent.contentOffset.y;
          }}
        >
          {/* Screen Header */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, marginTop: 4 }}>
            <View style={{ gap: 2, flex: 1, paddingRight: 16 }}>
              <Text style={[styles.kicker, { color: colors.primary }]}>SCHEDULE</Text>
              <Text style={{ fontSize: 24, fontWeight: "800", color: colors.text }}>
                {getHeaderTitle()}
              </Text>
              {getHeaderSubtitle() ? (
                <Text style={{ fontSize: 13, color: colors.textMuted, fontWeight: "600", marginTop: 2 }}>
                  {getHeaderSubtitle()}
                </Text>
              ) : null}
            </View>

            {/* Contextual Toggle Button */}
            <PressableScale
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                // Cycle: month -> week -> timeline -> month
                if (calendarViewMode === "month") {
                  setCalendarViewMode("week");
                } else if (calendarViewMode === "week") {
                  setCalendarViewMode("timeline");
                } else {
                  setCalendarViewMode("month");
                }
              }}
              scaleTo={0.9}
              contentStyle={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: isLight ? "#F1F5F9" : "rgba(255,255,255,0.04)",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: colors.border,
                marginTop: 2,
              }}
            >
              <Feather
                name={
                  calendarViewMode === "month"
                    ? "calendar"
                    : calendarViewMode === "week"
                    ? "list"
                    : "clock"
                }
                size={16}
                color={colors.primary}
              />
            </PressableScale>
          </View>

          {/* Calendar Navigation Card */}
          <Animated.View
            style={[
              {
                backgroundColor: colors.card,
                borderRadius: 28,
                borderWidth: calendarViewMode === "timeline" ? 0 : 1,
                borderColor: colors.border,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: calendarViewMode === "timeline" ? 0 : (colorScheme === "light" ? 0.04 : 0.15),
                shadowRadius: 16,
                elevation: calendarViewMode === "timeline" ? 0 : 4,
                marginTop: calendarViewMode === "timeline" ? 0 : (Platform.OS === "ios" ? 12 : 8),
                position: "relative",
                overflow: "hidden",
              },
              { height: calendarHeight },
            ]}
          >
            {/* Month View Section */}
            <Animated.View style={[monthStyle, { position: "absolute", top: 12, left: 16, right: 16 }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <Pressable
                  onPress={handlePrevMonth}
                  hitSlop={8}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isLight ? "#F1F5F9" : "rgba(255,255,255,0.04)",
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Feather name="chevron-left" size={14} color={colors.textMuted} />
                </Pressable>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "800" }}>
                  {MONTH_NAMES[month.month]} {month.year}
                </Text>
                <Pressable
                  onPress={handleNextMonth}
                  hitSlop={8}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isLight ? "#F1F5F9" : "rgba(255,255,255,0.04)",
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Feather name="chevron-right" size={14} color={colors.textMuted} />
                </Pressable>
              </View>

              {/* Weekday Headers */}
              <View
                style={{
                  flexDirection: "row",
                  marginBottom: 4,
                  paddingBottom: 4,
                  borderBottomWidth: 1,
                  borderBottomColor: isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.04)",
                }}
              >
                {WEEKDAY_NAMES.map((name) => (
                  <Text key={name} style={{ flex: 1, textAlign: "center", color: colors.textMuted, fontSize: 9, fontWeight: "800" }}>
                    {name.charAt(0)}
                  </Text>
                ))}
              </View>

              {/* Days Grid */}
              <View
                ref={monthGridRef}
                onLayout={measureMonthGrid}
                style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 0 }}
              >
                {calendarCells.map((cell) => {
                  if (cell.type === "empty") {
                    return <View key={cell.key} style={{ width: "14.28%", height: 30 }} />;
                  }
                  const dateStr = cell.dateString || "";
                  const isSelected = selectedDate === dateStr;
                  const isToday = dateStr === getDateKey();
                  const isHovered = hoveredDate === dateStr;

                  let borderStyles = {
                    borderWidth: (isToday && !isSelected) || isHovered ? 1.5 : 0,
                    borderColor: isHovered
                      ? colors.primary
                      : isToday && !isSelected
                      ? colors.primary
                      : "transparent",
                  };

                  return (
                    <Pressable
                      key={cell.key}
                      onPress={() => setSelectedDate(dateStr)}
                      style={{
                        width: "14.28%",
                        height: 30,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <View
                        style={[
                          {
                            width: 24,
                            height: 24,
                            borderRadius: 6,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: isSelected
                              ? colors.primary
                              : isHovered
                              ? `${colors.primary}22`
                              : "transparent",
                          },
                          borderStyles,
                        ]}
                      >
                        <Text
                          style={{
                            color: isSelected ? "#FFFFFF" : isToday ? colors.primary : colors.text,
                            fontSize: 11,
                            fontWeight: isSelected || isToday || isHovered ? "800" : "500",
                          }}
                        >
                          {cell.dayNum}
                        </Text>
                      </View>
                      
                      {/* Indicators */}
                      <CellIndicators dateStr={dateStr} />
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>

            {/* Week View Section */}
            <Animated.View style={[weekStyle, { position: "absolute", top: 12, left: 16, right: 16 }]}>
              <View
                ref={weekStripRef}
                onLayout={measureWeekStrip}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                {weekDaysStrip.map((day) => {
                  const isSelected = selectedDate === day.dateString;
                  const isToday = day.dateString === getDateKey();
                  return (
                    <Pressable
                      key={day.dateString}
                      onPress={() => setSelectedDate(day.dateString)}
                      style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                        paddingVertical: 2,
                      }}
                    >
                      <Text style={{ fontSize: 9, fontWeight: "700", color: isSelected ? colors.primary : colors.textMuted, textTransform: "uppercase" }}>
                        {day.dayName}
                      </Text>
                      <View
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 13,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: isSelected
                            ? colors.primary
                            : "transparent",
                          marginTop: 4,
                          borderWidth: isToday && !isSelected ? 1.5 : 0,
                          borderColor: colors.primary,
                        }}
                      >
                        <Text
                          style={{
                            color: isSelected ? "#FFFFFF" : isToday ? colors.primary : colors.text,
                            fontSize: 13,
                            fontWeight: isSelected || isToday ? "800" : "500",
                          }}
                        >
                          {day.dayNum}
                        </Text>
                      </View>
                      
                      {/* Indicators */}
                      <CellIndicators dateStr={day.dateString} />
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>

            {/* Timeline View Section */}
            <Animated.View style={[timelineStyle, { position: "absolute", top: 12, left: 16, right: 16 }]}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                {weekDaysStrip.map((day) => {
                  const isSelected = selectedDate === day.dateString;
                  const isToday = day.dateString === getDateKey();
                  return (
                    <Pressable
                      key={day.dateString}
                      onPress={() => setSelectedDate(day.dateString)}
                      style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                        paddingVertical: 1,
                      }}
                    >
                      <Text style={{ fontSize: 8, fontWeight: "700", color: isSelected ? colors.primary : colors.textMuted, textTransform: "uppercase" }}>
                        {day.dayName.charAt(0)}
                      </Text>
                      <View
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: isSelected
                            ? colors.primary
                            : "transparent",
                          marginTop: 2,
                          borderWidth: isToday && !isSelected ? 1 : 0,
                          borderColor: colors.primary,
                        }}
                      >
                        <Text
                          style={{
                            color: isSelected ? "#FFFFFF" : isToday ? colors.primary : colors.text,
                            fontSize: 11,
                            fontWeight: isSelected || isToday ? "800" : "500",
                          }}
                        >
                          {day.dayNum}
                        </Text>
                      </View>
                      <CellIndicators dateStr={day.dateString} />
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>
          </Animated.View>

          {/* Selected Date Info Strip */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingHorizontal: 4,
              marginTop: calendarViewMode === "timeline" ? 4 : 16,
              marginBottom: 4,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" }}>Agenda</Text>
              
              {/* Quick Jump Trigger Button */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setShowQuickJump(true);
                }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: isLight ? "#F1F5F9" : "rgba(255,255,255,0.05)",
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
                hitSlop={8}
              >
                <Feather name="compass" size={12} color={colors.text} />
              </Pressable>

              {/* Filters Trigger Button */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setShowFilter(true);
                }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: isLight ? "#F1F5F9" : "rgba(255,255,255,0.05)",
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
                hitSlop={8}
              >
                <Feather name="sliders" size={12} color={colors.text} />
              </Pressable>

              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setShowQuickCreate(true);
                }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: `${colors.primary}18`,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: `${colors.primary}33`,
                }}
                hitSlop={8}
              >
                <Feather name="plus" size={14} color={colors.primary} />
              </Pressable>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700" }}>
              {filteredTimedItems.length + filteredAllDayItems.length} item{(filteredTimedItems.length + filteredAllDayItems.length) !== 1 ? "s" : ""}
            </Text>
          </View>

          {/* Redesigned Planner Time-Block Section */}
          <View style={styles.plannerContainer}>
            {/* All Day / Anytime Section */}
            {filteredAllDayItems.length > 0 && (
              <View style={styles.allDaySection}>
                <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>ALL DAY</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}
                >
                  {filteredAllDayItems.map((item, idx) => {
                    const gesture = createPanGesture(item);
                    const type = getItemType(item);
                    const themeColor = {
                      task: "#6C63FF",
                      habit: "#10B981",
                      checklist: "#3B82F6",
                      event: "#F59E0B",
                      focus: "#EC4899",
                      resource: "#6B7280",
                    }[type];

                    return (
                      <GestureDetector key={item.id || idx} gesture={gesture}>
                        <Pressable
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                            router.push(`/task-details?id=${item.id}&type=${item.type}&date=${selectedDate}`);
                          }}
                          style={[
                            styles.allDayCard,
                            {
                              marginRight: 4,
                              backgroundColor: item.completed
                                ? isLight
                                  ? "#F1F5F9"
                                  : "rgba(255, 255, 255, 0.03)"
                                : isLight
                                ? "#E2E8F0"
                                : "rgba(255, 255, 255, 0.08)",
                              borderColor: item.completed ? colors.border : themeColor,
                              borderLeftWidth: 3,
                              borderLeftColor: item.completed ? colors.border : themeColor,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.allDayCardText,
                              {
                                color: item.completed ? colors.textMuted : colors.text,
                                textDecorationLine: item.completed ? "line-through" : "none",
                              },
                            ]}
                          >
                            {item.type === "habit" ? `⚡ ${item.title}` : item.title}
                          </Text>
                        </Pressable>
                      </GestureDetector>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {optimalHours.length > 0 && (
              <View style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginVertical: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                backgroundColor: isLight ? "rgba(99, 102, 241, 0.04)" : "rgba(99, 102, 241, 0.06)",
                borderRadius: 12,
                borderColor: colors.border,
                borderWidth: 1,
              }}>
                <Feather name="zap" size={12} color="#F59E0B" style={{ marginTop: 1 }} />
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.text, flex: 1 }}>
                  Peak Focus Active: Highlighted hours are optimal for {peakZone.toLowerCase().split(" ")[0]} flow.
                </Text>
              </View>
            )}

            {/* Hourly Planner Visual Blocks */}
            <View
              ref={timelineGridRef}
              onLayout={measureTimelineGrid}
              style={styles.timelineGridWrapper}
            >
              {/* Background Hours & Lines */}
              {hoursRange.map((hr) => {
                const displayHour = hr === 12 ? 12 : hr % 12;
                const ampm = hr >= 12 ? "PM" : "AM";
                const timeStr = `${displayHour} ${ampm}`;
                const isOptimal = optimalHours.includes(hr);

                let highlightColor = "transparent";
                let badgeIcon: any = null;
                let optimalTextColor = colors.textMuted;

                if (isOptimal) {
                  if (peakZone === "Morning Focus Peak") {
                    highlightColor = isLight ? "rgba(99, 102, 241, 0.04)" : "rgba(99, 102, 241, 0.06)";
                    badgeIcon = "sun";
                    optimalTextColor = colors.primary;
                  } else if (peakZone === "Afternoon Steady Flow") {
                    highlightColor = isLight ? "rgba(16, 185, 129, 0.04)" : "rgba(16, 185, 129, 0.06)";
                    badgeIcon = "award";
                    optimalTextColor = colors.success;
                  } else if (peakZone === "Night Owl Momentum") {
                    highlightColor = isLight ? "rgba(245, 158, 11, 0.04)" : "rgba(245, 158, 11, 0.06)";
                    badgeIcon = "moon";
                    optimalTextColor = "#F59E0B";
                  } else {
                    highlightColor = isLight ? "rgba(99, 102, 241, 0.02)" : "rgba(99, 102, 241, 0.04)";
                    badgeIcon = "activity";
                    optimalTextColor = colors.primary;
                  }
                }

                return (
                  <View key={hr} style={[styles.hourRow, { backgroundColor: highlightColor }]}>
                    <View style={styles.hourLabelCol}>
                      {isOptimal && badgeIcon ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3, justifyContent: "flex-end" }}>
                          <Feather name={badgeIcon} size={8} color={optimalTextColor} />
                          <Text style={[styles.hourLabelText, { color: optimalTextColor, fontSize: 9, fontWeight: "800" }]}>
                            {timeStr}
                          </Text>
                        </View>
                      ) : (
                        <Text style={[styles.hourLabelText, { color: colors.textMuted }]}>{timeStr}</Text>
                      )}
                    </View>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        router.push(`/task-details?id=${String(Date.now())}&type=task&date=${selectedDate}`);
                      }}
                      style={[styles.hourLineCol, { borderColor: isOptimal ? `${optimalTextColor}25` : colors.border }]}
                    />
                  </View>
                );
              })}

              {/* Absolutely positioned task blocks */}
              <View style={styles.absoluteBlocksContainer} pointerEvents="box-none">
                {/* Redesigned Timed Items */}
                {filteredTimedItems.map((item, idx) => {
                  const startMinutes = (item.reminderHour ?? 0) * 60 + (item.reminderMinute ?? 0);

                  const top = (startMinutes / 60) * 80;
                  const height = (item.durationMinutes / 60) * 80;

                  const widthPercent = 100 / item.totalCols;
                  const leftPercent = item.colIdx * widthPercent;

                  const type = getItemType(item);
                  const isHabit = type === "habit";

                  const themeStyles = {
                    task: { bg: isLight ? "#EEF2F6" : "rgba(108, 99, 255, 0.08)", border: "#6C63FF", icon: "check-square" },
                    habit: { bg: isLight ? "#ECFDF5" : "rgba(16, 185, 129, 0.08)", border: "#10B981", icon: "activity" },
                    checklist: { bg: isLight ? "#EFF6FF" : "rgba(59, 130, 246, 0.08)", border: "#3B82F6", icon: "list" },
                    event: { bg: isLight ? "#FFF7ED" : "rgba(245, 158, 11, 0.08)", border: "#F59E0B", icon: "map-pin" },
                    focus: { bg: isLight ? "#FDF2F8" : "rgba(236, 72, 153, 0.08)", border: "#EC4899", icon: "target" },
                    resource: { bg: isLight ? "#F9FAFB" : "rgba(107, 114, 128, 0.08)", border: "#6B7280", icon: "book-open" },
                  }[type];

                  let cardBg = item.completed
                    ? (isLight ? "#F1F5F9" : "rgba(255, 255, 255, 0.02)")
                    : themeStyles.bg;
                  let textColor = colors.text;
                  let accentColor = item.completed ? "#9CA3AF" : themeStyles.border;

                  const gesture = createPanGesture(item);
                  return (
                    <GestureDetector key={item.id || idx} gesture={gesture}>
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          router.push(`/task-details?id=${item.id}&type=${item.type}&date=${selectedDate}`);
                        }}
                        style={[
                          styles.timedBlockCard,
                          {
                            top,
                            height: Math.max(36, height - 2),
                            left: `${leftPercent}%`,
                            width: `${widthPercent - 1}%`,
                            backgroundColor: cardBg,
                            borderLeftColor: accentColor,
                            borderLeftWidth: 3,
                          },
                        ]}
                      >
                        <View style={{ flex: 1, padding: 6, justifyContent: "space-between" }}>
                          <View>
                            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                              <Text style={{ fontSize: 9, fontWeight: "800", color: item.completed ? colors.textMuted : accentColor, textTransform: "uppercase" }}>
                                {item.timeLabel} ({item.durationMinutes}m)
                              </Text>
                              {item.priority && item.priority !== "medium" && (
                                <Text
                                  style={{
                                    fontSize: 8,
                                    fontWeight: "900",
                                    color: item.priority === "high" ? colors.error : colors.success,
                                  }}
                                >
                                  {item.priority.toUpperCase()}
                                </Text>
                              )}
                            </View>
                            <Text
                              numberOfLines={height < 50 ? 1 : 2}
                              style={{
                                fontSize: 12,
                                fontWeight: "700",
                                color: item.completed ? colors.textMuted : colors.text,
                                marginTop: 2,
                                textDecorationLine: item.completed ? "line-through" : "none",
                              }}
                            >
                              {item.title}
                            </Text>
                          </View>

                          {height >= 60 && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                              <Feather name={themeStyles.icon as any} size={10} color={item.completed ? colors.textMuted : accentColor} />
                              <Text style={{ fontSize: 9, color: item.completed ? colors.textMuted : colors.text, opacity: 0.8 }}>
                                {type.charAt(0).toUpperCase() + type.slice(1)}
                              </Text>
                            </View>
                          )}
                        </View>
                      </Pressable>
                    </GestureDetector>
                  );
                })}

                {/* Free Time Suggestion Cards */}
                {freeTimeGaps.map((gap, idx) => {
                  const top = (gap.startMinutes / 60) * 80;
                  const height = (gap.durationMinutes / 60) * 80;
                  const hrs = Math.floor(gap.durationMinutes / 60);
                  const mins = gap.durationMinutes % 60;
                  const durationStr = hrs > 0 ? `${hrs}h ${mins > 0 ? `${mins}m` : ""}` : `${mins}m`;

                  return (
                    <View
                      key={`gap-${idx}`}
                      style={{
                        position: "absolute",
                        top: top + 2,
                        height: height - 4,
                        left: 0,
                        right: 8,
                        borderRadius: 14,
                        borderWidth: 1.5,
                        borderColor: colors.border,
                        borderStyle: "dashed",
                        backgroundColor: isLight ? "#F8FAFC" : "rgba(255, 255, 255, 0.02)",
                        paddingHorizontal: 12,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: `${colors.primary}12`, alignItems: "center", justifyContent: "center" }}>
                          <Feather name="coffee" size={12} color={colors.primary} />
                        </View>
                        <View>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.text }}>
                            {durationStr} free
                          </Text>
                          <Text style={{ fontSize: 9, color: colors.textMuted }}>
                            Perfect for Deep Work
                          </Text>
                        </View>
                      </View>
                      <PressableScale
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          router.push("/focus");
                        }}
                        scaleTo={0.95}
                        contentStyle={{
                          backgroundColor: colors.primary,
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 8,
                        }}
                      >
                        <Text style={{ color: "#FFFFFF", fontSize: 9, fontWeight: "800" }}>
                          Start Focus
                        </Text>
                      </PressableScale>
                    </View>
                  );
                })}

                {/* snappable hourly drag outline guide */}
                {isDragging && hoveredHour !== null && activeDragItem && (
                  <View
                    style={[
                      styles.timedBlockCard,
                      {
                        top: hoveredHour * 80,
                        height: 78,
                        left: "0%",
                        width: "100%",
                        backgroundColor: isLight ? "rgba(59, 130, 246, 0.06)" : "rgba(59, 130, 246, 0.12)",
                        borderStyle: "dashed",
                        borderWidth: 2,
                        borderColor: colors.primary,
                        justifyContent: "center",
                        alignItems: "center",
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "800", color: colors.primary, textTransform: "uppercase" }}>
                      Move to {hoveredHour === 12 ? 12 : hoveredHour % 12}:00 {hoveredHour >= 12 ? "PM" : "AM"}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </ScrollView>
      </Animated.View>

      {/* Floating Drag Overlay element */}
      {isDragging && activeDragItem && (
        <Animated.View style={floatingCardStyle} pointerEvents="none">
          <View
            style={{
              backgroundColor: activeDragItem.type === "habit" ? colors.warning : colors.primary,
              borderRadius: 14,
              padding: 12,
              borderWidth: 1.5,
              borderColor: "#FFFFFF",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.3,
              shadowRadius: 10,
              elevation: 8,
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "800", textTransform: "uppercase", marginBottom: 2 }}>
              {activeDragItem.timeLabel || "All Day"}
            </Text>
            <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }} numberOfLines={1}>
              {activeDragItem.title}
            </Text>
          </View>
        </Animated.View>
      )}


      {/* ── QUICK JUMP SHEET ───────────────────────── */}
      <AnimatedOverlay
        visible={showQuickJump}
        onClose={() => setShowQuickJump(false)}
        type="bottom-sheet"
      >
        {(close) => (
          <View
            style={{
              backgroundColor: colors.card,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingTop: 16,
              paddingHorizontal: 20,
              paddingBottom: Platform.OS === "ios" ? 36 : 24,
              borderWidth: 1.5,
              borderColor: colors.border,
            }}
          >
            {/* Header */}
            <View style={{ alignItems: "center", paddingBottom: 12, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border + "40" }}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>
                Quick Jump
              </Text>
            </View>

            {/* Jump Options */}
            <Text style={{ fontSize: 11, fontWeight: "800", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, paddingHorizontal: 4 }}>
              Jump To
            </Text>
            <View style={{ marginBottom: 20 }}>
              {[
                { label: "Today", icon: "calendar", date: getDateKey(new Date()) },
                { label: "Tomorrow", icon: "arrow-right", date: getDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000)) },
                { label: "Next Week", icon: "chevrons-right", date: getDateKey(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) },
              ].map((opt, idx) => (
                <Pressable
                  key={opt.label}
                  onPress={() => {
                    setSelectedDate(opt.date);
                    close();
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 12,
                    paddingHorizontal: 4,
                    borderBottomWidth: idx < 2 ? 1 : 0,
                    borderBottomColor: colors.border,
                    gap: 12,
                  }}
                >
                  <Feather name={opt.icon as any} size={14} color={colors.textMuted} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Separator line */}
            <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 20 }} />

            {/* Quick Create */}
            <Text style={{ fontSize: 11, fontWeight: "800", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, paddingHorizontal: 4 }}>
              Create
            </Text>
            <View>
              {[
                { label: "Task", icon: "check-square", color: "#6C63FF", cat: "work" },
                { label: "Event", icon: "map-pin", color: "#F59E0B", cat: "travel" },
                { label: "Habit", icon: "activity", color: "#10B981", cat: null },
                { label: "Focus Session", icon: "target", color: "#EC4899", cat: "focus" },
              ].map((opt, idx) => (
                <Pressable
                  key={opt.label}
                  onPress={() => {
                    close();
                    if (opt.label === "Habit") {
                      router.push("/settings");
                    } else {
                      setTimeout(() => {
                        router.push(`/task-details?id=${String(Date.now())}&type=task&date=${selectedDate}`);
                      }, 300);
                    }
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 12,
                    paddingHorizontal: 4,
                    borderBottomWidth: idx < 3 ? 1 : 0,
                    borderBottomColor: colors.border,
                    gap: 12,
                  }}
                >
                  <Feather name={opt.icon as any} size={14} color={opt.color} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </AnimatedOverlay>

      {/* ── FILTER SHEET ───────────────────────── */}
      <AnimatedOverlay
        visible={showFilter}
        onClose={() => setShowFilter(false)}
        type="bottom-sheet"
      >
        {(close) => (
          <View
            style={{
              backgroundColor: colors.card,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingTop: 16,
              paddingHorizontal: 20,
              paddingBottom: Platform.OS === "ios" ? 36 : 24,
              borderWidth: 1.5,
              borderColor: colors.border,
            }}
          >
            {/* Header */}
            <View style={{ alignItems: "center", paddingBottom: 12, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border + "40" }}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>
                Filter Timeline
              </Text>
            </View>

            {/* Filter Options */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {[
                { key: "task", label: "Tasks", color: "#6C63FF" },
                { key: "habit", label: "Habits", color: "#10B981" },
                { key: "checklist", label: "Checklists", color: "#3B82F6" },
                { key: "event", label: "Events", color: "#F59E0B" },
                { key: "focus", label: "Focus", color: "#EC4899" },
                { key: "resource", label: "Resources", color: "#6B7280" },
              ].map((opt) => {
                const isActive = activeFilters.includes(opt.key);
                return (
                  <PressableScale
                    key={opt.key}
                    onPress={() => {
                      if (isActive) {
                        setActiveFilters(activeFilters.filter((f) => f !== opt.key));
                      } else {
                        setActiveFilters([...activeFilters, opt.key]);
                      }
                    }}
                    scaleTo={0.95}
                    contentStyle={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 20,
                      backgroundColor: isActive ? `${opt.color}18` : (isLight ? "#F1F5F9" : "rgba(255,255,255,0.02)"),
                      borderWidth: 1,
                      borderColor: isActive ? opt.color : colors.border,
                      gap: 4,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: isActive ? opt.color : colors.textMuted }}>
                      {isActive ? "✓ " : ""} {opt.label}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>

            {/* Completed Tasks Toggle */}
            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
            <PressableScale
              onPress={() => setShowCompleted(!showCompleted)}
              scaleTo={0.98}
              contentStyle={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 12,
                borderRadius: 12,
                backgroundColor: showCompleted ? `${colors.primary}1a` : "transparent",
                borderWidth: 1,
                borderColor: showCompleted ? colors.primary : colors.border,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Feather name="eye" size={14} color={showCompleted ? colors.primary : colors.textMuted} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>
                  Show Completed Items
                </Text>
              </View>
              {showCompleted ? (
                <Feather name="check" size={14} color={colors.primary} />
              ) : null}
            </PressableScale>
          </View>
        )}
      </AnimatedOverlay>

      {/* ── QUICK CREATE SHEET ───────────────────────── */}
      <AnimatedOverlay
        visible={showQuickCreate}
        onClose={() => setShowQuickCreate(false)}
        type="bottom-sheet"
      >
        {(close) => (
          <View
            style={{
              backgroundColor: colors.card,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingTop: 16,
              paddingHorizontal: 20,
              paddingBottom: Platform.OS === "ios" ? 36 : 24,
              borderWidth: 1.5,
              borderColor: colors.border,
            }}
          >
            {/* Header */}
            <View style={{ alignItems: "center", paddingBottom: 12, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border + "40" }}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>
                Create New
              </Text>
            </View>

            <View style={{ marginBottom: 8 }}>
              {[
                { label: "Task", icon: "check-square", color: "#6C63FF", cat: "work" },
                { label: "Event", icon: "map-pin", color: "#F59E0B", cat: "travel" },
                { label: "Habit", icon: "activity", color: "#10B981", cat: null },
                { label: "Focus Session", icon: "target", color: "#EC4899", cat: "focus" },
              ].map((opt, idx) => (
                <Pressable
                  key={opt.label}
                  onPress={() => {
                    close();
                    if (opt.label === "Habit") {
                      router.push("/settings");
                    } else {
                      setTimeout(() => {
                        router.push(`/task-details?id=${String(Date.now())}&type=task&date=${selectedDate}`);
                      }, 300);
                    }
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 12,
                    paddingHorizontal: 4,
                    borderBottomWidth: idx < 3 ? 1 : 0,
                    borderBottomColor: colors.border,
                    gap: 12,
                  }}
                >
                  <Feather name={opt.icon as any} size={14} color={opt.color} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </AnimatedOverlay>


      {/* Task creation — routed to full-screen task-details.tsx */}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, paddingTop: Platform.OS === "android" ? 44 : 0 },
  container: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
    paddingBottom: 110,
  },
  header: { gap: 4 },
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

  // Fixed week strip
  weekDayCell: {
    height: 72,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    gap: 5,
    position: "relative",
  },
  weekDayNameText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  weekDayNumText: { fontSize: 16, fontWeight: "800" },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    position: "absolute",
    bottom: 8,
  },

  // Planner Visual styles
  plannerContainer: {
    marginTop: 8,
    gap: 16,
  },
  sectionSubtitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  allDaySection: {
    gap: 4,
  },
  allDayGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  allDayCard: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  allDayCardText: {
    fontSize: 12,
    fontWeight: "600",
  },
  timelineGridWrapper: {
    position: "relative",
    flexDirection: "column",
    marginTop: 10,
  },
  hourRow: {
    flexDirection: "row",
    height: 80,
  },
  hourLabelCol: {
    width: 65,
    alignItems: "flex-end",
    paddingRight: 10,
    paddingTop: 0,
  },
  hourLabelText: {
    fontSize: 10,
    fontWeight: "700",
    textAlign: "right",
  },
  hourLineCol: {
    flex: 1,
    borderTopWidth: 1,
    borderStyle: "dashed",
  },
  absoluteBlocksContainer: {
    position: "absolute",
    top: 0,
    left: 65,
    right: 0,
    bottom: 0,
  },
  timedBlockCard: {
    position: "absolute",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
});
