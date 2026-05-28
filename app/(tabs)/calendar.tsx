import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { FloatingGlow } from "@/components/AmbientBackground";
import { AppCard } from "@/components/AppCard";
import { AnalyticsEmptyGraphic } from "@/components/AppGraphics";
import { ProgressRing } from "@/components/ProgressRing";
import { ScreenSwipeWrapper } from "@/components/ScreenSwipeWrapper";
import { Spacing } from "@/constants/spacing";
import { Colors } from "@/constants/theme";
import { Typography } from "@/constants/typography";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  DailyHistory,
  getHistoryForMonth,
  historyForDate,
} from "@/services/productivityHistory";

const getDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getMonthKey = (date = new Date()) => ({
  year: date.getFullYear(),
  month: date.getMonth(),
});

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const getHeatColor = (score: number) => {
  if (score >= 90) return "#10B981"; // success green
  if (score >= 60) return "#3B82F6"; // indigo/blue secondary
  if (score >= 30) return "#F59E0B"; // orange/amber
  if (score > 0) return "#64748b";
  return "#27272A"; // dark gray track
};

export default function CalendarScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isLight = colorScheme === "light";
  const [month, setMonth] = useState(getMonthKey());
  const [history, setHistory] = useState<DailyHistory[]>([]);
  const [selectedDate, setSelectedDate] = useState(getDateKey());
  const [allTodos, setAllTodos] = useState<any[]>([]);
  const [allHabits, setAllHabits] = useState<any[]>([]);
  const [showMonthHeatmap, setShowMonthHeatmap] = useState(false);

  const loadMonth = useCallback(async (year: number, monthIndex: number) => {
    const entries = await getHistoryForMonth(year, monthIndex);
    setHistory(entries);
  }, []);

  const loadDataFromStorage = useCallback(async () => {
    try {
      // Load todos
      const rawTodos = await AsyncStorage.getItem("todoapp:v1");
      if (rawTodos) {
        const state = JSON.parse(rawTodos);
        const listTodos = Object.values(state.todos ?? {}).flat();
        setAllTodos(listTodos as any[]);
      } else {
        setAllTodos([]);
      }

      // Load habits
      const rawHabits = await AsyncStorage.getItem("todoapp:daily:v1");
      if (rawHabits) {
        const state = JSON.parse(rawHabits);
        const listHabits = state.dailyHabits ?? [];
        setAllHabits(listHabits);
      } else {
        setAllHabits([]);
      }
    } catch (e) {
      console.log("Error loading storage data in calendar", e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadMonth(month.year, month.month);
      void loadDataFromStorage();
    }, [loadMonth, loadDataFromStorage, month.month, month.year]),
  );

  const selectedHistory = useMemo(
    () => historyForDate(history, selectedDate),
    [history, selectedDate],
  );

  // Custom 7-Day Horizontal Week Strip centered around selectedDate
  const weekDaysStrip = useMemo(() => {
    const list = [];
    const current = new Date(selectedDate);
    // Render 3 days before and 3 days after
    for (let i = -3; i <= 3; i++) {
      const d = new Date(current);
      d.setDate(current.getDate() + i);
      list.push({
        dateString: getDateKey(d),
        dayNum: String(d.getDate()).padStart(2, "0"),
        dayName: WEEKDAY_NAMES[d.getDay()],
        isToday: getDateKey(d) === getDateKey(new Date()),
      });
    }
    return list;
  }, [selectedDate]);

  // Filters and merges scheduled tasks and active habits for selectedDate
  const timelineItems = useMemo(() => {
    // 1. Tasks with alarm times
    const tasks = allTodos
      .filter((todo) => {
        if (!todo.alarmTime) return false;
        const dateStr = getDateKey(new Date(todo.alarmTime));
        return dateStr === selectedDate;
      })
      .map((todo) => {
        const d = new Date(todo.alarmTime);
        const hours = d.getHours();
        const mins = String(d.getMinutes()).padStart(2, "0");
        const ampm = hours >= 12 ? "PM" : "AM";
        const displayHour = hours % 12 || 12;
        return {
          id: todo.id,
          title: todo.title,
          timeLabel: `${displayHour}:${mins} ${ampm}`,
          rawHours: hours,
          completed: todo.completed,
          type: "task",
          streak: undefined,
        };
      });

    // 2. Habits active on selectedDate weekday
    const dateParts = selectedDate.split("-").map(Number);
    const selDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    const dayOfWeek = selDate.getDay();
    const isTodaySelected = selectedDate === getDateKey(new Date());

    const habits = allHabits
      .filter((habit) => {
        // Active if reminderDays is empty/undefined or contains dayOfWeek
        return (
          !habit.reminderDays ||
          habit.reminderDays.length === 0 ||
          habit.reminderDays.includes(dayOfWeek)
        );
      })
      .map((habit) => {
        // completion status
        let completed = false;
        if (isTodaySelected) {
          completed = habit.completedToday;
        } else if (selectedHistory) {
          completed = selectedHistory.completedHabitTitles.includes(
            habit.title,
          );
        }

        // Time label
        let timeLabel = "Anytime";
        let rawHours = 8; // morning default
        if (
          habit.reminderHour !== undefined &&
          habit.reminderMinute !== undefined
        ) {
          const hours = habit.reminderHour;
          const mins = String(habit.reminderMinute).padStart(2, "0");
          const ampm = hours >= 12 ? "PM" : "AM";
          const displayHour = hours % 12 || 12;
          timeLabel = `${displayHour}:${mins} ${ampm}`;
          rawHours = hours;
        }

        return {
          id: habit.id,
          title: habit.title,
          timeLabel,
          rawHours,
          completed,
          type: "habit",
          streak: habit.streak || 0,
        };
      });

    return [...tasks, ...habits].sort((a, b) => a.rawHours - b.rawHours);
  }, [allTodos, allHabits, selectedDate, selectedHistory]);

  // (Placeholders removed)

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

  const handlePrevMonth = () => {
    setMonth((prev) => {
      let nextMonth = prev.month - 1;
      let nextYear = prev.year;
      if (nextMonth < 0) {
        nextMonth = 11;
        nextYear -= 1;
      }
      return { year: nextYear, month: nextMonth };
    });
  };

  const handleNextMonth = () => {
    setMonth((prev) => {
      let nextMonth = prev.month + 1;
      let nextYear = prev.year;
      if (nextMonth > 11) {
        nextMonth = 0;
        nextYear += 1;
      }
      return { year: nextYear, month: nextMonth };
    });
  };

  // Format month and day display for timeline header
  const headerDateLabel = useMemo(() => {
    const d = new Date(selectedDate);
    const m = MONTH_NAMES[d.getMonth()];
    const day = String(d.getDate()).padStart(2, "0");
    return `${m} ${day}`;
  }, [selectedDate]);

  return (
    <ScreenSwipeWrapper prevRoute="/tasks" nextRoute="/settings">
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: "transparent" }]}
      >
        <Animated.View
          entering={FadeInDown.duration(450).springify()}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.container}
            showsVerticalScrollIndicator={false}
          >
            {/* Premium Header removed per user request */}
            <View style={styles.header}>
              <Text style={[styles.kicker, { color: colors.primary }]}>
                ANALYTICS
              </Text>
              <Text style={[styles.title, { color: colors.text }]}>
                Overview
              </Text>
            </View>

            {/* Large Date & Folder Calendar Row */}
            <View style={styles.dateBannerRow}>
              <View style={{ gap: 2 }}>
                <Text style={[styles.largeDateText, { color: colors.text }]}>
                  {headerDateLabel}
                </Text>
                <Text
                  style={[
                    styles.taskCountSubtitle,
                    { color: colors.textMuted },
                  ]}
                >
                  {timelineItems.length} task
                  {timelineItems.length !== 1 ? "s" : ""} today
                </Text>
              </View>
              {/* calendar button removed */}
            </View>

            {/* Horizontal Week Strip (Dribbble style) */}
            <View style={styles.weekStripContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.weekScrollContent}
              >
                {weekDaysStrip.map((day) => {
                  const isSelected = selectedDate === day.dateString;
                  return (
                    <Pressable
                      key={day.dateString}
                      onPress={() => setSelectedDate(day.dateString)}
                      style={[
                        styles.weekDayCell,
                        isSelected
                          ? {
                              backgroundColor: colors.primary,
                              borderColor: isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.15)",
                            }
                          : {
                              backgroundColor: colorScheme === "light" ? "#FFFFFF" : "rgba(255, 255, 255, 0.02)",
                              borderColor: colors.border,
                            },
                      ]}
                    >
                      <Text
                        style={[
                          styles.weekDayNameText,
                          { color: isSelected ? "#ffffff" : colors.textMuted },
                        ]}
                      >
                        {day.dayName}
                      </Text>
                      <Text
                        style={[
                          styles.weekDayNumText,
                          { color: isSelected ? "#ffffff" : colors.text },
                        ]}
                      >
                        {day.dayNum}
                      </Text>
                      {isSelected && (
                        <View
                          style={[
                            styles.activeDot,
                            { backgroundColor: "#ffffff" },
                          ]}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Vertical Time Agenda (Dribbble style) */}
            <AppCard style={styles.agendaCard}>
              <FloatingGlow
                color={colors.primary}
                size={220}
                opacity={0.06}
                style={{ position: "absolute", top: 80, left: 40 }}
              />
              <View style={styles.agendaTitleRow}>
                <Text style={[styles.agendaHeading, { color: colors.text }]}>
                  Schedule Agenda
                </Text>
                <Text
                  style={[styles.taskCountKicker, { color: colors.textMuted }]}
                >
                  {timelineItems.length} items scheduled
                </Text>
              </View>

              <View style={styles.timelineWrapper}>
                {timelineItems.length > 0 ? (
                  timelineItems.map((item, idx) => {
                    const isHabit = item.type === "habit";

                    // Dynamic pastel styling based on event index
                    let cardBg = "#d1fae5"; // soft light green
                    let textColor = "#064e3b";
                    let isPhoneIcon = true;

                    if (idx % 4 === 0) {
                      cardBg = "#d1fae5"; // mint green
                      textColor = "#064e3b";
                      isPhoneIcon = true;
                    } else if (idx % 4 === 1) {
                      cardBg = "#e2e8f0"; // light grey
                      textColor = "#334155";
                      isPhoneIcon = false;
                    } else if (idx % 4 === 2) {
                      cardBg = "#f3e8ff"; // light purple
                      textColor = "#581c87";
                      isPhoneIcon = true;
                    } else {
                      cardBg = "#e0f2fe"; // light blue/teal
                      textColor = "#0369a1";
                      isPhoneIcon = false;
                    }

                    return (
                      <View key={item.id || idx} style={styles.timelineRow}>
                        <View style={styles.timeColumn}>
                          <Text
                            style={[
                              styles.timeLabelText,
                              { color: colors.textMuted },
                            ]}
                          >
                            {item.timeLabel}
                          </Text>
                        </View>
                        <View style={styles.timelineConnector}>
                          <View
                            style={[
                              styles.timelineNode,
                              {
                                backgroundColor: isHabit
                                  ? colors.warning
                                  : colors.primary,
                              },
                            ]}
                          />
                          {idx < timelineItems.length - 1 && (
                            <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />
                          )}
                        </View>
                        <AppCard
                          style={[
                            styles.timelineItemCard,
                            {
                              backgroundColor: cardBg,
                              borderColor: "transparent",
                              padding: 16,
                              borderRadius: 20,
                            },
                          ]}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: 6,
                            }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <Feather
                                name={isHabit ? "zap" : "clock"}
                                size={11}
                                color={textColor}
                              />
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: "800",
                                  color: textColor,
                                  textTransform: "uppercase",
                                  letterSpacing: 0.5,
                                }}
                              >
                                {isHabit
                                  ? `Habit • 🔥 ${item.streak}d`
                                  : "Task"}
                              </Text>
                            </View>
                            <Feather
                              name={isPhoneIcon ? "phone" : "message-square"}
                              size={13}
                              color={textColor}
                            />
                          </View>
                          <Text
                            style={[
                              styles.timelineTaskTitle,
                              {
                                color: textColor,
                                fontWeight: "700",
                                textDecorationLine: item.completed
                                  ? "line-through"
                                  : "none",
                              },
                            ]}
                          >
                            {item.title}
                          </Text>
                        </AppCard>
                      </View>
                    );
                  })
                ) : (
                  <View style={styles.emptyAgendaContainer}>
                    <Feather
                      name="bell-off"
                      size={20}
                      color={colors.textMuted}
                      style={{ opacity: 0.6 }}
                    />
                    <Text
                      style={[styles.emptyAgendaText, { color: colors.text }]}
                    >
                      No items scheduled for today
                    </Text>
                    <Text
                      style={[
                        styles.emptyAgendaSubtext,
                        { color: colors.textMuted },
                      ]}
                    >
                      Tap the bell icon in your Planner to set an alarm
                      reminder.
                    </Text>
                  </View>
                )}
              </View>
            </AppCard>

            {/* Collapsible Monthly Heatmap Calendar Module */}
            <AppCard style={styles.collapsibleHeatmapCard}>
              <Pressable
                onPress={() => setShowMonthHeatmap(!showMonthHeatmap)}
                style={styles.collapsibleHeader}
              >
                <View style={styles.collapsibleTitleLeft}>
                  <Feather name="activity" size={16} color={colors.primary} />
                  <Text
                    style={[
                      styles.collapsibleTitleText,
                      { color: colors.text },
                    ]}
                  >
                    Toggle Monthly Heatmap History
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
                        onPress={handlePrevMonth}
                        style={[styles.arrowBtn, { borderColor: colors.border, backgroundColor: colorScheme === "light" ? "#F1F5F9" : "rgba(255, 255, 255, 0.02)" }]}
                      >
                        <Feather
                          name="chevron-left"
                          size={18}
                          color={colors.textMuted}
                        />
                      </Pressable>
                      <Pressable
                        onPress={handleNextMonth}
                        style={[styles.arrowBtn, { borderColor: colors.border, backgroundColor: colorScheme === "light" ? "#F1F5F9" : "rgba(255, 255, 255, 0.02)" }]}
                      >
                        <Feather
                          name="chevron-right"
                          size={18}
                          color={colors.textMuted}
                        />
                      </Pressable>
                    </View>
                  </View>

                  {/* Custom Weekday Labels */}
                  <View style={[styles.weekdaysHeader, { borderBottomColor: colors.border }]}>
                    {WEEKDAY_NAMES.map((name) => (
                      <Text
                        key={name}
                        style={[
                          styles.weekdayLabel,
                          { color: colors.textMuted },
                        ]}
                      >
                        {name.slice(0, 1)}
                      </Text>
                    ))}
                  </View>

                  {/* Custom Days Grid */}
                  <View style={styles.calendarGrid}>
                    {calendarCells.map((cell) => {
                      if (cell.type === "empty") {
                        return (
                          <View
                            key={cell.key}
                            style={styles.dayCellPlaceholder}
                          />
                        );
                      }

                      const dateStr = cell.dateString || "";
                      const isSelected = selectedDate === dateStr;

                      const entry = history.find((h) => h.date === dateStr);
                      const dayScore = entry ? entry.score : 0;
                      const isLight = colorScheme === "light";
                      const heatBgColor =
                        dayScore > 0
                          ? getHeatColor(dayScore)
                          : isLight
                            ? "rgba(0, 0, 0, 0.04)"
                            : "rgba(255, 255, 255, 0.05)";

                      return (
                        <Pressable
                          key={cell.key}
                          onPress={() => setSelectedDate(dateStr)}
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
                                  fontWeight:
                                    isSelected || dayScore > 0 ? "700" : "500",
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

                  {/* Legend Card */}
                  <View style={styles.legendWrapperInside}>
                    <View style={styles.legendRow}>
                      <View
                        style={[
                          styles.legendSwatch,
                          { backgroundColor: "#10B981" },
                        ]}
                      />
                      <Text
                        style={[styles.legendText, { color: colors.textMuted }]}
                      >
                        90%+ Done
                      </Text>
                    </View>
                    <View style={styles.legendRow}>
                      <View
                        style={[
                          styles.legendSwatch,
                          { backgroundColor: "#3B82F6" },
                        ]}
                      />
                      <Text
                        style={[styles.legendText, { color: colors.textMuted }]}
                      >
                        60%+ Done
                      </Text>
                    </View>
                    <View style={styles.legendRow}>
                      <View
                        style={[
                          styles.legendSwatch,
                          { backgroundColor: "#F59E0B" },
                        ]}
                      />
                      <Text
                        style={[styles.legendText, { color: colors.textMuted }]}
                      >
                        30%+ Done
                      </Text>
                    </View>
                  </View>
                </Animated.View>
              )}
            </AppCard>

            {/* Detailed Completed Log List Card */}
            <AppCard style={styles.detailCard}>
              <View style={styles.detailHeader}>
                <Feather name="calendar" size={16} color={colors.primary} />
                <Text style={[styles.detailTitle, { color: colors.text }]}>
                  {selectedDate} Completion Logs
                </Text>
              </View>

              {selectedHistory ? (
                <View style={styles.detailBody}>
                  {/* Premium overall progress heading with dynamic rank badges */}
                  <View style={styles.scoreHeaderRow}>
                    <View style={{ gap: 2 }}>
                      <Text style={[styles.detailStatLabel, { color: colors.textMuted }]}>
                        PRODUCTIVITY LEVEL
                      </Text>
                      <Text style={[styles.detailStatVal, { color: colors.text, fontSize: 24, fontWeight: "800" }]}>
                        {selectedHistory.score}% <Text style={{ fontSize: 13, color: colors.textMuted, fontWeight: "500" }}>score</Text>
                      </Text>
                    </View>
                    <View style={[
                      styles.scoreBadge,
                      {
                        backgroundColor: selectedHistory.score >= 90 ? "rgba(16, 185, 129, 0.12)" : selectedHistory.score >= 60 ? "rgba(59, 130, 246, 0.12)" : selectedHistory.score >= 30 ? "rgba(245, 158, 11, 0.12)" : "rgba(100, 116, 139, 0.12)"
                      }
                    ]}>
                      <Text style={[
                        styles.scoreBadgeText,
                        {
                          color: selectedHistory.score >= 90 ? "#10B981" : selectedHistory.score >= 60 ? "#3B82F6" : selectedHistory.score >= 30 ? "#F59E0B" : colors.textMuted
                        }
                      ]}>
                        {selectedHistory.score >= 90 ? "Legendary" : selectedHistory.score >= 60 ? "Focused" : selectedHistory.score >= 30 ? "Active" : "Quiet"}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.divider, { backgroundColor: colors.border }]} />

                  {/* Dual Circular Progress Graphs Row */}
                  <View style={styles.progressRingsRow}>
                    {/* Left Circular Ring: Habits */}
                    <View style={styles.ringCardContainer}>
                      <Text style={[styles.ringCardTitle, { color: colors.text }]}>Habits</Text>
                      <View style={styles.ringGraphicWrap}>
                        <ProgressRing
                          progress={selectedHistory.totalHabits > 0 ? selectedHistory.completedHabits / selectedHistory.totalHabits : 0}
                          size={68}
                          strokeWidth={6}
                          color={colors.warning}
                          showText={true}
                        />
                      </View>
                      <Text style={[styles.ringCardStat, { color: colors.textMuted }]}>
                        {selectedHistory.completedHabits} of {selectedHistory.totalHabits}
                      </Text>
                    </View>

                    {/* Divider Line */}
                    <View style={[styles.ringDivider, { backgroundColor: colors.border }]} />

                    {/* Right Circular Ring: Todos */}
                    <View style={styles.ringCardContainer}>
                      <Text style={[styles.ringCardTitle, { color: colors.text }]}>Todos</Text>
                      <View style={styles.ringGraphicWrap}>
                        <ProgressRing
                          progress={selectedHistory.totalTodos > 0 ? selectedHistory.completedTodos / selectedHistory.totalTodos : 0}
                          size={68}
                          strokeWidth={6}
                          color={colors.primary}
                          showText={true}
                        />
                      </View>
                      <Text style={[styles.ringCardStat, { color: colors.textMuted }]}>
                        {selectedHistory.completedTodos} of {selectedHistory.totalTodos}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.divider, { backgroundColor: colors.border }]} />

                  <View style={styles.listsContainer}>
                    <View style={styles.listSection}>
                      <Text
                        style={[styles.sectionLabel, { color: colors.text }]}
                      >
                        Completed Habits
                      </Text>
                      {selectedHistory.completedHabitTitles.length > 0 ? (
                        selectedHistory.completedHabitTitles.map((item) => (
                          <View key={item} style={styles.detailListItem}>
                            <Feather
                              name="check"
                              size={12}
                              color={colors.success}
                            />
                            <Text
                              style={[
                                styles.listItemText,
                                { color: colors.textMuted },
                              ]}
                            >
                              {item}
                            </Text>
                          </View>
                        ))
                      ) : (
                        <Text
                          style={[
                            styles.noItemsText,
                            { color: colors.textMuted },
                          ]}
                        >
                          No habits completed.
                        </Text>
                      )}
                    </View>

                    <View style={styles.listSection}>
                      <Text
                        style={[styles.sectionLabel, { color: colors.text }]}
                      >
                        Completed Todos
                      </Text>
                      {selectedHistory.completedTodoTitles.length > 0 ? (
                        selectedHistory.completedTodoTitles.map((item) => (
                          <View key={item} style={styles.detailListItem}>
                            <Feather
                              name="check"
                              size={12}
                              color={colors.success}
                            />
                            <Text
                              style={[
                                styles.listItemText,
                                { color: colors.textMuted },
                              ]}
                            >
                              {item}
                            </Text>
                          </View>
                        ))
                      ) : (
                        <Text
                          style={[
                            styles.noItemsText,
                            { color: colors.textMuted },
                          ]}
                        >
                          No todos completed.
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.noHistoryWrap}>
                  <AnalyticsEmptyGraphic />
                  <Text
                    style={[styles.noHistoryText, { color: colors.textMuted }]}
                  >
                    No completed logs found. Use the checklist to record goals.
                  </Text>
                </View>
              )}
            </AppCard>
          </ScrollView>
        </Animated.View>
      </SafeAreaView>
    </ScreenSwipeWrapper>
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

  // Horizontal week strip
  weekStripContainer: {
    paddingVertical: 4,
    marginHorizontal: -16,
  },
  weekScrollContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  weekDayCell: {
    width: 50,
    height: 78,
    borderRadius: 24,
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

  // Premium Layout Styles
  premiumHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  premiumHeaderTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  avatarMini: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  dateBannerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 4,
  },
  largeDateText: {
    fontSize: 28,
    fontWeight: "800",
  },
  taskCountSubtitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  folderCalButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#18181b",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  teamAvatars: {
    flexDirection: "row",
    alignItems: "center",
  },
  teamAvatarCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  teamAvatarText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#ffffff",
  },

  // Vertical time agenda
  agendaCard: { padding: Spacing.lg, gap: 16, overflow: "hidden" },
  agendaTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  agendaHeading: { fontSize: Typography.sizes.lg, fontWeight: "700" },
  taskCountKicker: { fontSize: Typography.sizes.xs, fontWeight: "600" },
  timelineWrapper: { gap: 12, marginTop: 4 },
  timelineRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  timeColumn: { width: 68, paddingTop: 14 },
  timeLabelText: { fontSize: 11, fontWeight: "700" },
  timelineConnector: { width: 12, alignItems: "center", alignSelf: "stretch" },
  timelineNode: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 16,
    zIndex: 1,
  },
  timelineLine: {
    width: 1.5,
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    position: "absolute",
    top: 24,
    bottom: -12,
  },
  timelineItemCard: { flex: 1, padding: Spacing.md, gap: 4, borderWidth: 1 },
  timelineTaskTitle: { fontSize: 13, fontWeight: "600" },
  timelineMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  timelineMetaText: { fontSize: 9, fontWeight: "600" },

  // Collapsible heatmap card
  collapsibleHeatmapCard: { padding: Spacing.md, gap: 8 },
  collapsibleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  collapsibleTitleLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  collapsibleTitleText: { fontSize: 14, fontWeight: "700" },
  heatmapContent: {
    gap: 12,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
    paddingTop: 12,
  },

  // Custom Calendar Styles
  customCalendarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  monthLabel: { fontSize: 16, fontWeight: "700" },
  navArrows: { flexDirection: "row", gap: 4 },
  arrowBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
    backgroundColor: "rgba(255, 255, 255, 0.02)",
  },
  weekdaysHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
    paddingBottom: 8,
  },
  weekdayLabel: {
    width: "14.28%",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 8,
  },
  dayCellPlaceholder: {
    width: "14.28%",
    aspectRatio: 1,
  },
  dayCellContainer: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  dayBadgeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
  },
  dayNumText: { fontSize: 13 },
  legendWrapperInside: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
  legendText: { fontSize: Typography.sizes.xs, fontWeight: "600" },

  summaryRow: { flexDirection: "row", gap: 12 },
  summaryHalf: { flex: 1, gap: 4, padding: Spacing.md },
  statHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  summaryLabel: { fontSize: Typography.sizes.xs, fontWeight: "600" },
  summaryValue: { fontSize: 22, fontWeight: "700" },
  detailCard: { padding: Spacing.lg, gap: 12 },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailTitle: { fontSize: Typography.sizes.lg, fontWeight: "700" },
  detailBody: { gap: 12 },
  scoreHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  scoreBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  scoreBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  progressRingsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 12,
  },
  ringCardContainer: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  ringCardTitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  ringGraphicWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  ringCardStat: {
    fontSize: 11,
    fontWeight: "600",
  },
  ringDivider: {
    width: 1,
    height: 60,
    opacity: 0.15,
  },
  detailStatLabel: { fontSize: Typography.sizes.xs, fontWeight: "700", letterSpacing: 0.8 },
  detailStatVal: { fontSize: Typography.sizes.md, fontWeight: "700" },
  divider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    marginVertical: 4,
  },
  listsContainer: { flexDirection: "row", gap: 16 },
  listSection: { flex: 1, gap: 6 },
  sectionLabel: { fontSize: Typography.sizes.sm, fontWeight: "700" },
  detailListItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  listItemText: { fontSize: Typography.sizes.xs, fontWeight: "500" },
  noItemsText: { fontSize: Typography.sizes.xs, fontStyle: "italic" },
  noHistoryWrap: {
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
  },
  noHistoryText: {
    fontSize: Typography.sizes.sm,
    textAlign: "center",
    marginTop: 4,
  },
  emptyAgendaContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    gap: 8,
  },
  emptyAgendaText: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 4,
  },
  emptyAgendaSubtext: {
    fontSize: 11,
    textAlign: "center",
    opacity: 0.8,
    paddingHorizontal: 16,
    lineHeight: 16,
  },
});
