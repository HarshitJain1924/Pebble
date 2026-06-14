import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import Animated, { FadeInDown, runOnJS, useSharedValue } from "react-native-reanimated";

import { SegmentedSwitcher } from "@/components/ui/SegmentedSwitcher";
import { Typography } from "@/constants/typography";
import * as Haptics from "expo-haptics";
import {
  useCalendarState,
  WEEKDAY_NAMES,
  MONTH_NAMES,
  getDateKey,
} from "@/modules/calendar/useCalendarState";
import { isRecurringOccurrenceForDate } from "@/services/recurrence";
import { TaskEditorSheet } from "@/components/TaskEditorSheet";
import { historyForDate } from "@/services/productivityHistory";
import { GestureDetector, Gesture } from "react-native-gesture-handler";

export default function CalendarScreen() {
  const [optimalHours, setOptimalHours] = React.useState<number[]>([]);
  const [peakZone, setPeakZone] = React.useState<string>("Balanced Flow");

  React.useEffect(() => {
    async function loadOptimalHours() {
      try {
        const { getOptimalHours, getCognitiveFlowStats } = require("@/services/cognitiveFlowService");
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
    addingTask,
    setAddingTask,
    onSaveNewTask,
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
          <View style={[styles.header, { marginBottom: 8 }]}>
            <Text style={[styles.kicker, { color: colors.primary }]}>SCHEDULE</Text>
            <Text style={[styles.title, { color: colors.text }]}>Agenda Planner</Text>
          </View>

          {/* View Switcher segment */}
          <View style={{ marginVertical: 4 }}>
            <SegmentedSwitcher
              options={[
                { key: "month", label: "Month View" },
                { key: "week", label: "Week Agenda" },
              ]}
              activeKey={calendarViewMode}
              onChange={(val) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setCalendarViewMode(val as any);
              }}
            />
          </View>

          {/* Calendar Navigation Card */}
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 28,
              borderWidth: 1,
              borderColor: colors.border,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: colorScheme === "light" ? 0.04 : 0.15,
              shadowRadius: 16,
              elevation: 4,
              padding: 18,
              marginTop: Platform.OS === "ios" ? 12 : 8,
            }}
          >
            {/* Month View: Direct Calendar Grid Navigation */}
            {calendarViewMode === "month" && (
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <Pressable
                    onPress={handlePrevMonth}
                    hitSlop={8}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isLight ? "#F1F5F9" : "rgba(255,255,255,0.04)",
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Feather name="chevron-left" size={18} color={colors.textMuted} />
                  </Pressable>
                  <Text style={{ color: colors.text, fontSize: 17, fontWeight: "800" }}>
                    {MONTH_NAMES[month.month]} {month.year}
                  </Text>
                  <Pressable
                    onPress={handleNextMonth}
                    hitSlop={8}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isLight ? "#F1F5F9" : "rgba(255,255,255,0.04)",
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Feather name="chevron-right" size={18} color={colors.textMuted} />
                  </Pressable>
                </View>

                {/* Weekday Headers */}
                <View
                  style={{
                    flexDirection: "row",
                    marginBottom: 6,
                    paddingBottom: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.04)",
                  }}
                >
                  {WEEKDAY_NAMES.map((name) => (
                    <Text key={name} style={{ flex: 1, textAlign: "center", color: colors.textMuted, fontSize: 11, fontWeight: "800" }}>
                      {name.charAt(0)}
                    </Text>
                  ))}
                </View>

                {/* Days Grid */}
                <View
                  ref={monthGridRef}
                  onLayout={measureMonthGrid}
                  style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 4 }}
                >
                  {calendarCells.map((cell) => {
                    if (cell.type === "empty") {
                      return <View key={cell.key} style={{ width: "14.28%", height: 38 }} />;
                    }
                    const dateStr = cell.dateString || "";
                    const isSelected = selectedDate === dateStr;
                    const isToday = dateStr === getDateKey();
                    const isHovered = hoveredDate === dateStr;

                    // Compute completion rates for Productivity Heatmap
                    const dayTasks = allTodos.filter((t) => {
                      const hasDate = t.scheduledDate === dateStr;
                      const hasAlarm = t.alarmTime && getDateKey(new Date(t.alarmTime)) === dateStr;
                      return (hasDate || hasAlarm) && t.scheduledDate !== "inbox";
                    });

                    const dayOfWeek = new Date(month.year, month.month, cell.dayNum || 1).getDay();
                    const isTodaySelected = dateStr === getDateKey(new Date());

                    const dayHabits = allHabits.filter((h) => {
                      if (h.recurrence) {
                        return isRecurringOccurrenceForDate(h, dateStr);
                      }
                      return (
                        !h.reminderDays ||
                        h.reminderDays.length === 0 ||
                        h.reminderDays.includes(dayOfWeek)
                      );
                    });

                    const completedTasks = dayTasks.filter(t => t.completed).length;
                    
                    let completedHabits = 0;
                    if (isTodaySelected) {
                      completedHabits = dayHabits.filter(h => h.completedToday).length;
                    } else {
                      const targetHistory = historyForDate(history, dateStr);
                      if (targetHistory) {
                        completedHabits = dayHabits.filter(h => targetHistory.completedHabitTitles?.includes(h.title)).length;
                      }
                    }

                    const totalCount = dayTasks.length + dayHabits.length;
                    const completedCount = completedTasks + completedHabits;

                    let borderStyles = {
                      borderWidth: (isToday && !isSelected) || isHovered ? 1.5 : 0,
                      borderColor: isHovered
                        ? colors.primary
                        : isToday && !isSelected
                        ? colors.primary
                        : "transparent",
                    };

                    // Heatmap colors
                    if (totalCount > 0 && !isSelected && !isHovered) {
                      const pct = completedCount / totalCount;
                      borderStyles.borderWidth = 1.5;
                      if (pct === 1) {
                        borderStyles.borderColor = colors.success;
                      } else if (pct > 0) {
                        borderStyles.borderColor = colors.warning;
                      } else {
                        borderStyles.borderColor = colors.border;
                      }
                    } else if (isHovered) {
                      borderStyles.borderWidth = 2.5;
                      borderStyles.borderColor = colors.primary;
                    }

                    return (
                      <Pressable
                        key={cell.key}
                        onPress={() => setSelectedDate(dateStr)}
                        style={{
                          width: "14.28%",
                          height: 38,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <View
                          style={[
                            {
                              width: 34,
                              height: 34,
                              borderRadius: 12,
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: isSelected
                                ? colors.primary
                                : isHovered
                                ? `${colors.primary}44`
                                : "transparent",
                            },
                            borderStyles,
                          ]}
                        >
                          <Text
                            style={{
                              color: isSelected ? "#FFFFFF" : isToday ? colors.primary : colors.text,
                              fontSize: 13,
                              fontWeight: isSelected || isToday || isHovered ? "800" : "500",
                            }}
                          >
                            {cell.dayNum}
                          </Text>
                        </View>
                        {totalCount > 0 && !isSelected && (
                          <View
                            style={{
                              position: "absolute",
                              bottom: 2,
                              width: 4,
                              height: 4,
                              borderRadius: 2,
                              backgroundColor: completedCount === totalCount ? colors.success : colors.primary,
                            }}
                          />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {/* Week View: Fixed 7-day Strip (Responsive Grid) */}
            {calendarViewMode === "week" && (
              <View
                ref={weekStripRef}
                onLayout={measureWeekStrip}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginHorizontal: -4,
                }}
              >
                {weekDaysStrip.map((day) => {
                  const isSelected = selectedDate === day.dateString;
                  const isHovered = hoveredDate === day.dateString;
                  return (
                    <Pressable
                      key={day.dateString}
                      onPress={() => setSelectedDate(day.dateString)}
                      style={[
                        styles.weekDayCell,
                        { flex: 1, marginHorizontal: 4 },
                        isSelected
                          ? {
                              backgroundColor: colors.primary,
                              borderColor: isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.15)",
                            }
                          : isHovered
                          ? {
                              backgroundColor: `${colors.primary}33`,
                              borderColor: colors.primary,
                            }
                          : {
                              backgroundColor: colorScheme === "light" ? "#FFFFFF" : "rgba(255, 255, 255, 0.02)",
                              borderColor: colors.border,
                            },
                      ]}
                    >
                      <Text style={[styles.weekDayNameText, { color: isSelected ? "#ffffff" : colors.textMuted }]}>
                        {day.dayName}
                      </Text>
                      <Text style={[styles.weekDayNumText, { color: isSelected ? "#ffffff" : colors.text }]}>
                        {day.dayNum}
                      </Text>
                      {isSelected && <View style={[styles.activeDot, { backgroundColor: "#ffffff" }]} />}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* Selected Date Info Strip */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingHorizontal: 4,
              marginTop: 16,
              marginBottom: 4,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>{headerDateLabel}</Text>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setAddingTask({
                    id: String(Date.now()),
                    title: "",
                    completed: false,
                    scheduledDate: selectedDate,
                    folderId: "default",
                  });
                }}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
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
              {timelineItems.length} item{timelineItems.length !== 1 ? "s" : ""}
            </Text>
          </View>

          {/* Redesigned Planner Time-Block Section */}
          <View style={styles.plannerContainer}>
            {/* All Day / Anytime Section */}
            {allDayItems.length > 0 && (
              <View style={styles.allDaySection}>
                <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>ALL DAY</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}
                >
                  {allDayItems.map((item, idx) => {
                    const gesture = createPanGesture(item);
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
                              borderColor: item.completed ? colors.border : colors.primary,
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
                        setAddingTask({
                          id: String(Date.now()),
                          title: "",
                          completed: false,
                          scheduledDate: selectedDate,
                          folderId: "default",
                          reminderHour: hr,
                          reminderMinute: 0,
                        });
                      }}
                      style={[styles.hourLineCol, { borderColor: isOptimal ? `${optimalTextColor}25` : colors.border }]}
                    />
                  </View>
                );
              })}

              {/* Absolutely positioned task blocks */}
              <View style={styles.absoluteBlocksContainer} pointerEvents="box-none">
                {timedItemsWithLayout.map((item, idx) => {
                  const startMinutes = item.reminderHour * 60 + item.reminderMinute;

                  const top = (startMinutes / 60) * 80;
                  const height = (item.durationMinutes / 60) * 80;

                  const widthPercent = 100 / item.totalCols;
                  const leftPercent = item.colIdx * widthPercent;

                  const isHabit = item.type === "habit";
                  let cardBg = isLight ? "#E2E8F0" : "rgba(255, 255, 255, 0.06)";
                  let textColor = colors.text;
                  let accentColor = isHabit ? colors.warning : colors.primary;

                  if (item.completed) {
                    cardBg = isLight ? "#F1F5F9" : "rgba(255, 255, 255, 0.02)";
                    textColor = colors.textMuted;
                  } else {
                    if (idx % 4 === 0) {
                      cardBg = isLight ? "#E0F2FE" : "rgba(56, 189, 248, 0.12)";
                      textColor = isLight ? "#0369A1" : "#7DD3FC";
                      accentColor = "#38BDF8";
                    } else if (idx % 4 === 1) {
                      cardBg = isLight ? "#F3E8FF" : "rgba(168, 85, 247, 0.12)";
                      textColor = isLight ? "#581C87" : "#D8B4FE";
                      accentColor = "#A855F7";
                    } else if (idx % 4 === 2) {
                      cardBg = isLight ? "#D1FAE5" : "rgba(16, 185, 129, 0.12)";
                      textColor = isLight ? "#064E3B" : "#6EE7B7";
                      accentColor = "#10B981";
                    } else {
                      cardBg = isLight ? "#FFE4E6" : "rgba(244, 63, 94, 0.12)";
                      textColor = isLight ? "#9F1239" : "#FDA4AF";
                      accentColor = "#F43F5E";
                    }
                  }

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
                              <Text style={{ fontSize: 9, fontWeight: "800", color: textColor, textTransform: "uppercase" }}>
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
                                color: textColor,
                                marginTop: 2,
                                textDecorationLine: item.completed ? "line-through" : "none",
                              }}
                            >
                              {isHabit ? `⚡ ${item.title}` : item.title}
                            </Text>
                          </View>

                          {height >= 60 && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                              <Feather name={isHabit ? "zap" : "clock"} size={10} color={textColor} />
                              <Text style={{ fontSize: 9, color: textColor, opacity: 0.8 }}>
                                {isHabit ? "Habit" : "Task"}
                              </Text>
                            </View>
                          )}
                        </View>
                      </Pressable>
                    </GestureDetector>
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


      {/* Quick Add Task Dialog sheet */}
      <TaskEditorSheet
        task={addingTask}
        lists={lists}
        mode="add"
        onClose={() => setAddingTask(null)}
        onSave={onSaveNewTask}
      />
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
